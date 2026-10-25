// Événements personnalisés : types, création, participants, inscription, recherche, reprise des données
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createUser, loginAs } from './helpers/fixtures.js';
import { startSmtpSink } from './helpers/smtp-sink.js';

let server;
let admin;
let smtp;

beforeAll(async () => {
    smtp = await startSmtpSink();
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
    await admin.post('/api/email-config', {
        host: '127.0.0.1',
        port: smtp.port,
        secure: false,
        user: 'robot@example.test',
        password: 'x'
    });
});
afterAll(async () => {
    await server?.stop();
    await smtp?.stop();
});

let seq = 0;
const unique = prefix => `${prefix} ${Date.now().toString(36)}${++seq}`;
const types = async () => (await admin.get('/api/event-types')).data.types;
const adminEvents = async () => (await admin.get('/api/custom-events')).data.events;
const findEvent = async id => (await adminEvents()).find(e => e.id === id);
const color = { bg_color: '#112233', text_color: '#ffffff', border_color: '#000000' };

async function createType(overrides = {}) {
    const label_long = unique('Type');
    const r = await admin.post('/api/event-types', {
        label_long,
        label_short: 'T',
        icon: 'flag',
        ...color,
        ...overrides
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { id: r.data.id, label_long };
}

async function adminCreate(body) {
    const r = await admin.post('/api/custom-events', { startDate: '2025-07-01', label: unique('Évt'), ...body });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.eventId;
}

describe("types d'événements", () => {
    it('« Autre(s) » est présent, en dernier, et protégé', async () => {
        const list = await types();
        const other = list.at(-1);
        expect(other).toMatchObject({ code: 'autre', is_other: 1 });
        expect(list.every(t => typeof t.events_count === 'number')).toBe(true);
        expect((await admin.put(`/api/event-types/${other.id}`, { label_long: 'X', ...color })).status).toBe(403);
        expect((await admin.delete(`/api/event-types/${other.id}`)).status).toBe(403);
    });

    it('libellé long unique (casse ignorée) et couleurs obligatoires', async () => {
        const { label_long } = await createType();
        const dup = await admin.post('/api/event-types', { label_long: label_long.toUpperCase(), ...color });
        expect(dup.status).toBe(400);
        const bad = await admin.post('/api/event-types', { label_long: unique('Type'), bg_color: 'rouge' });
        expect(bad.status).toBe(400);
        expect((await admin.post('/api/event-types', { ...color })).status).toBe(400);
    });

    it('la modification des couleurs est appliquée aux événements du type', async () => {
        const type = await createType();
        const eventId = await adminCreate({ type_id: type.id, config: { foo: 'bar' } });
        const r = await admin.put(`/api/event-types/${type.id}`, {
            label_long: type.label_long,
            bg_color: '#ABCDEF',
            text_color: '#000000',
            border_color: '#ffffff'
        });
        expect(r.data).toEqual({ success: true, events: 1 });
        const event = await findEvent(eventId);
        expect(JSON.parse(event.config)).toEqual({
            foo: 'bar',
            bgColor: '#abcdef',
            textColor: '#000000',
            borderColor: '#ffffff'
        });
        expect((await types()).find(t => t.id === type.id).events_count).toBe(1);
    });

    it('la suppression bascule les événements sur « Autre(s) »', async () => {
        const type = await createType();
        const eventId = await adminCreate({ type_id: type.id });
        const r = await admin.delete(`/api/event-types/${type.id}`);
        expect(r.data).toEqual({ success: true, moved: 1 });
        const other = (await types()).find(t => t.is_other);
        const event = await findEvent(eventId);
        expect(event.type_id).toBe(other.id);
        expect(JSON.parse(event.config).bgColor).toBe(other.bg_color);
        expect((await admin.delete(`/api/event-types/${type.id}`)).status).toBe(404);
    });
});

describe('événements', () => {
    it('création par un administrateur avec participants internes et externes', async () => {
        const user = await createUser(admin);
        const type = await createType();
        const eventId = await adminCreate({
            startDate: '2025-07-02',
            endDate: '2025-07-03',
            period: 'AM',
            type_id: type.id,
            participants: [user.id, user.id],
            external_participants: [{ nom: 'Externe', prenom: 'Anne', email: 'anne@example.test' }, { prenom: 'vide' }]
        });
        const event = await findEvent(eventId);
        expect(event).toMatchObject({
            start_date: '2025-07-02',
            end_date: '2025-07-03',
            period: 'FULL', // demi-journée seulement pour un événement d'un jour
            type_id: type.id,
            type_long: type.label_long,
            creator_prenom: 'Système',
            participants: [{ user_id: user.id, nom: user.nom, prenom: user.prenom, email: user.email }],
            external_participants: [{ external: true, nom: 'Externe', prenom: 'Anne', email: 'anne@example.test' }]
        });
    });

    it('type inconnu : repli sur « Autre(s) »', async () => {
        const eventId = await adminCreate({ type_id: 999999 });
        const other = (await types()).find(t => t.is_other);
        expect((await findEvent(eventId)).type_id).toBe(other.id);
    });

    it('date de début et libellé obligatoires', async () => {
        expect((await admin.post('/api/custom-events', { label: 'x' })).status).toBe(400);
        expect((await admin.post('/api/my-custom-events', { startDate: '2025-07-01' })).status).toBe(400);
    });

    it('création depuis la planification : participants et personnes sollicitées prévenus', async () => {
        const participant = await createUser(admin);
        const sollicite = await createUser(admin);
        const label = unique('Réunion');
        const r = await admin.post('/api/my-custom-events', {
            startDate: '2025-07-10',
            label,
            participants: [participant.id],
            needs_resources: true,
            resources_count: 2,
            notify_user_ids: [sollicite.id]
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const event = await findEvent(r.data.eventId);
        expect(event).toMatchObject({ needs_resources: 1, resources_count: 2, period: 'FULL' });
        await smtp.waitFor(new RegExp(`To: ${participant.email.replace('.', '\\.')}[\\s\\S]*participant`), 15000);
        const invite = await smtp.waitFor(
            new RegExp(`To: ${sollicite.email.replace('.', '\\.')}[\\s\\S]*mobilisation`),
            15000
        );
        expect(invite).toMatch(/BEGIN:VCALENDAR/);
    });

    it('liste des événements vue par un utilisateur (is_creator)', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const mine = await client.post('/api/my-custom-events', { startDate: '2025-07-11', label: unique('Mien') });
        const other = await adminCreate({});
        const r = await client.get('/api/my-custom-events');
        expect(r.data).toMatchObject({ isAdmin: false, userId: user.id });
        const byId = id => r.data.events.find(e => e.id === id);
        expect(byId(mine.data.eventId)).toMatchObject({ is_creator: 1, can_edit: 1, creator_nom: user.nom });
        expect(byId(other)).toMatchObject({ is_creator: 0, external_participants: [] });
        const mobile = await client.get('/api/mobile-events');
        expect(mobile.data.events.find(e => e.id === other)).toMatchObject({ type_code: 'autre', participants: [] });
    });

    it('recherche par période, libellé et participants', async () => {
        const a = await createUser(admin);
        const b = await createUser(admin);
        const tag = unique('Recherche');
        const both = await adminCreate({ startDate: '2026-01-10', label: `${tag} un`, participants: [a.id, b.id] });
        const onlyA = await adminCreate({ startDate: '2026-01-20', label: `${tag} deux`, participants: [a.id] });
        await adminCreate({ startDate: '2026-03-01', label: `${tag} trois` });

        const search = async query =>
            (await admin.get(`/api/custom-events/search?${query}`)).data.events.map(e => e.id);
        const label = encodeURIComponent(tag.toLowerCase());
        expect(await search(`label=${label}&startDate=2026-01-01&endDate=2026-01-31`)).toEqual([onlyA, both]);
        expect(await search(`label=${label}&participantIds=${a.id},${b.id}`)).toEqual([both]);
        const r = await admin.get(`/api/custom-events/search?label=${label}&endDate=2026-01-15`);
        expect(r.data.events).toHaveLength(1);
        expect(r.data.events[0].participants.map(p => p.user_id).sort()).toEqual([a.id, b.id].sort());
    });

    it("inscription d'un expert : participant ajouté et planification mise à jour", async () => {
        const { user, resource } = await createExpert(admin);
        const expert = await loginAs(server, user, 'expert');
        const key = (type, date, period) => `${resource.id}_${type}_${date}_${period}`;
        // Demi-journée déjà affectée : conservée
        await admin.post('/api/schedule', { [key('activity', '2025-08-05', 'PM')]: '5' });
        const eventId = await adminCreate({ startDate: '2025-08-04', endDate: '2025-08-05' });

        const r = await expert.post(`/api/my-custom-events/${eventId}/join`);
        expect(r.data).toMatchObject({ success: true, planningUpdated: true, isExpert: true });
        expect(r.data.planningUpdates).toHaveLength(4);
        const schedule = (await admin.get('/api/schedule')).data;
        expect(schedule[key('available', '2025-08-04', 'AM')]).toBe('2');
        expect(schedule[key('activity', '2025-08-04', 'AM')]).toBe('8');
        expect(schedule[key('activity', '2025-08-05', 'PM')]).toBe('5');

        const again = await expert.post(`/api/my-custom-events/${eventId}/join`);
        expect(again.data.planningUpdated).toBe(false);
        expect((await findEvent(eventId)).participants.map(p => p.user_id)).toEqual([user.id]);
        expect((await expert.post('/api/my-custom-events/999999/join')).status).toBe(404);
    });

    it('modification : participants remplacés, type conservé sans type fourni', async () => {
        const a = await createUser(admin);
        const b = await createUser(admin);
        const type = await createType();
        const eventId = await adminCreate({
            type_id: type.id,
            participants: [a.id],
            external_participants: [{ nom: 'X' }]
        });
        const r = await admin.put(`/api/my-custom-events/${eventId}`, {
            startDate: '2025-07-15',
            label: 'Modifié',
            period: 'PM',
            participants: [b.id],
            grist: true
        });
        expect(r.data).toEqual({ success: true });
        expect(await findEvent(eventId)).toMatchObject({
            label: 'Modifié',
            start_date: '2025-07-15',
            end_date: '2025-07-15',
            period: 'PM',
            grist: 1,
            type_id: type.id,
            participants: [{ user_id: b.id }],
            external_participants: []
        });
        // Événement inexistant : sans effet
        expect((await admin.put('/api/custom-events/999999', {})).data).toEqual({ success: true });
    });

    it("l'administrateur peut changer le créateur", async () => {
        const user = await createUser(admin);
        const eventId = await adminCreate({});
        await admin.put(`/api/custom-events/${eventId}`, { startDate: '2025-07-01', label: 'x', createdBy: user.id });
        expect((await findEvent(eventId)).created_by).toBe(user.id);
    });

    it('suppression réservée aux administrateurs', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const client = await loginAs(server, user, 'user');
        const eventId = await adminCreate({ participants: [user.id] });
        expect((await client.delete(`/api/my-custom-events/${eventId}`)).status).toBe(403);
        expect((await admin.delete(`/api/my-custom-events/${eventId}`)).data).toEqual({ success: true });
        expect(await findEvent(eventId)).toBeUndefined();
    });
});

describe('reprise des données', () => {
    it('liste avec participants et modification groupée du type et du libellé', async () => {
        const user = await createUser(admin);
        const type = await createType();
        const eventId = await adminCreate({
            participants: [user.id],
            external_participants: [{ email: 'e@example.test' }]
        });
        const list = (await admin.get('/api/event-types/events')).data.events;
        expect(list.find(e => e.id === eventId).participants).toEqual([
            `${user.prenom} ${user.nom.toUpperCase()}`,
            'e@example.test'
        ]);

        const r = await admin.put('/api/event-types/events/bulk', {
            updates: [
                { id: eventId, label: ' Renommé ', type_id: type.id },
                { id: eventId, label: '' },
                { id: 999999, label: 'x' }
            ]
        });
        expect(r.data).toEqual({ success: true, updated: 1 });
        const event = await findEvent(eventId);
        expect(event).toMatchObject({ label: 'Renommé', type_id: type.id });
        expect(JSON.parse(event.config).bgColor).toBe(color.bg_color);
    });
});
