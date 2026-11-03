// Événements : recherche de doublons (certains et probables) et fusion
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createUser, loginAs } from './helpers/fixtures.js';
import { compareEvents, labelSimilarity, normalizeLabel } from '../src/modules/events/events.duplicates.js';

let server;
let admin;
let seq = 0;

beforeAll(async () => {
    server = await startServer();
    admin = await loginAs(server, ADMIN, 'admin');
});
afterAll(() => server?.stop());

const unique = prefix => `${prefix}${Date.now().toString(36)}${++seq}`;
const color = { bgColor: '#112233', textColor: '#ffffff', borderColor: '#000000' };

async function newLocation() {
    const court = unique('LOC');
    const r = await admin.post('/api/locations', { libelle_long: `${court} long`, libelle_court: court });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { id: r.data.id, court };
}

async function newType(label = unique('Type')) {
    const r = await admin.post('/api/event-types', {
        label_long: label,
        label_short: 'T',
        icon: 'flag',
        bg_color: '#112233',
        text_color: '#ffffff',
        border_color: '#000000'
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.id;
}

async function newEvent(fields) {
    const r = await admin.post('/api/custom-events', {
        startDate: '2031-04-07',
        endDate: '2031-04-07',
        label: unique('Évt'),
        config: color,
        participants: [],
        external_participants: [],
        period: 'FULL',
        grist: false,
        ...fields
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.eventId;
}

const groups = async () => (await admin.get('/api/custom-events/duplicates')).data.groups;
const groupOf = async id => (await groups()).find(g => g.events.some(e => e.id === id));
const exists = async id => (await admin.get('/api/custom-events')).data.events.some(e => e.id === id);

describe('ressemblance (calculs)', () => {
    it('libellés normalisés et similarité', () => {
        expect(normalizeLabel('  Visite  MÉTIER – SAMU 56 ')).toBe('visite metier samu 56');
        expect(labelSimilarity('visite metier', 'visite metier')).toBe(1);
        expect(labelSimilarity('visite metier samu 56', 'visite metier')).toBe(1);
        expect(labelSimilarity('formation bandeau', 'visite metier')).toBeLessThan(0.5);
    });

    it('certain, probable, ou rien', () => {
        const e = (champs = {}) => ({
            type_id: 1,
            location_id: 5,
            start_date: '2031-04-07',
            end_date: '2031-04-07',
            period: 'FULL',
            norm: 'visite metier',
            ...champs
        });
        expect(compareEvents(e(), e())?.niveau).toBe('certain');
        expect(compareEvents(e(), e({ norm: 'visite metier bis' }))?.niveau).toBe('probable');
        expect(compareEvents(e(), e({ norm: 'tout autre chose' }))?.niveau).toBe('probable'); // même type et mêmes dates
        expect(compareEvents(e(), e({ type_id: 2, norm: 'tout autre chose' }))).toBeNull();
        expect(compareEvents(e(), e({ location_id: 6 }))).toBeNull();
        expect(compareEvents(e(), e({ start_date: '2031-05-01', end_date: '2031-05-01' }))).toBeNull();
        expect(compareEvents(e({ location_id: null }), e({ location_id: null, norm: 'autre' }))).toBeNull();
        expect(compareEvents(e({ period: 'AM' }), e({ period: 'PM' }))?.niveau).not.toBe('certain');
    });
});

describe('recherche de doublons', () => {
    it('doublon certain : même type, lieu, dates, période et libellé', async () => {
        const loc = await newLocation();
        const type = await newType();
        const label = unique('FORMATION ');
        const a = await newEvent({ label, type_id: type, location_id: loc.id });
        const b = await newEvent({ label: label.toLowerCase(), type_id: type, location_id: loc.id });
        const g = await groupOf(a);
        expect(g.niveau).toBe('certain');
        expect(g.events.map(e => e.id).sort()).toEqual([a, b].sort());
        expect(g.events[0]).toMatchObject({ location_label: loc.court.toUpperCase() });
    });

    it('doublon probable : mêmes dates et type, libellés différents ; dates qui se recoupent, libellés proches', async () => {
        const loc = await newLocation();
        const type = await newType();
        const a = await newEvent({ label: unique('VFT sur site '), type_id: type, location_id: loc.id });
        const b = await newEvent({ label: unique('Autre intitulé '), type_id: type, location_id: loc.id });
        const g = await groupOf(a);
        expect(g.niveau).toBe('probable');
        expect(g.events.map(e => e.id).sort()).toEqual([a, b].sort());

        const loc2 = await newLocation();
        const base = unique('Accompagnement post demarrage ');
        const c = await newEvent({
            label: base,
            type_id: type,
            location_id: loc2.id,
            startDate: '2031-06-02',
            endDate: '2031-06-06'
        });
        const d = await newEvent({
            label: `${base} bis`,
            type_id: type,
            location_id: loc2.id,
            startDate: '2031-06-04',
            endDate: '2031-06-10'
        });
        expect((await groupOf(c)).events.map(e => e.id).sort()).toEqual([c, d].sort());
    });

    it('pas de doublon : autre lieu, dates disjointes, autre type avec libellé différent', async () => {
        const loc = await newLocation();
        const other = await newLocation();
        const type = await newType();
        const a = await newEvent({ label: unique('Unique '), type_id: type, location_id: loc.id });
        await newEvent({ label: unique('Unique '), type_id: type, location_id: other.id });
        await newEvent({
            label: unique('Unique '),
            type_id: type,
            location_id: loc.id,
            startDate: '2031-09-01',
            endDate: '2031-09-01'
        });
        await newEvent({ label: unique('Zzz '), type_id: await newType(), location_id: loc.id });
        expect(await groupOf(a)).toBeUndefined();
    });

    it('réservé aux administrateurs', async () => {
        const user = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        expect((await user.get('/api/custom-events/duplicates')).status).toBe(403);
        expect((await user.post('/api/custom-events/merge', { keep_id: 1, remove_ids: [2] })).status).toBe(403);
    });
});

describe('fusion', () => {
    it('un seul événement conservé : participants internes et externes réunis, les autres supprimés', async () => {
        const loc = await newLocation();
        const type = await newType();
        const e1 = await createExpert(admin);
        const e2 = await createExpert(admin);
        const label = unique('VISITE ');
        const a = await newEvent({
            label,
            type_id: type,
            location_id: loc.id,
            participants: [e1.user.id],
            external_participants: [{ nom: 'Durand', prenom: 'Léa', email: 'lea@example.test' }]
        });
        const b = await newEvent({
            label,
            type_id: type,
            location_id: loc.id,
            participants: [e1.user.id, e2.user.id],
            external_participants: [
                { nom: 'Durand', prenom: 'Léa', email: 'LEA@example.test' },
                { nom: 'Petit', prenom: 'Zoé', email: 'zoe@example.test' }
            ]
        });
        const merge = await admin.post('/api/custom-events/merge', { keep_id: a, remove_ids: [b] });
        expect(merge.status, JSON.stringify(merge.data)).toBe(200);
        expect(merge.data).toMatchObject({ kept: a, removed: [b], participantsAdded: 2 });
        expect(await exists(a)).toBe(true);
        expect(await exists(b)).toBe(false);
        const kept = (await admin.get('/api/custom-events')).data.events.find(e => e.id === a);
        expect(kept.participants.map(p => p.user_id).sort()).toEqual([e1.user.id, e2.user.id].sort());
        expect(kept.external_participants.map(p => p.email.toLowerCase()).sort()).toEqual([
            'lea@example.test',
            'zoe@example.test'
        ]);
        expect(await groupOf(a)).toBeUndefined();
    });

    it('le lien d’un déploiement vers un événement supprimé pointe vers l’événement conservé', async () => {
        const loc = await newLocation();
        const type = await newType();
        const proj = await admin.post('/api/affectation/projects', {
            samu_name: loc.court,
            location_id: loc.id,
            date_debut: '2031-01-04',
            periods: { visite_metier: [{ start: '2031-04-07', end: '2031-04-07', needed: 1 }] }
        });
        expect(proj.status, JSON.stringify(proj.data)).toBe(200);
        const a = await newEvent({ type_id: type, location_id: loc.id, label: 'DOUBLON LIE' });
        const b = await newEvent({ type_id: type, location_id: loc.id, label: 'DOUBLON LIE' });
        const link = await admin.put(`/api/affectation/projects/${proj.data.id}/event-link`, {
            key: 'visite_metier',
            eventId: b
        });
        expect(link.status, JSON.stringify(link.data)).toBe(200);
        await admin.post('/api/custom-events/merge', { keep_id: a, remove_ids: [b] });
        const cand = (await admin.get(`/api/affectation/projects/${proj.data.id}/events-candidates`)).data;
        expect(cand.candidates.visite_metier.linked).toBe(a);
    });

    it('la planification des participants n’est pas remise en situation (contrairement à une suppression)', async () => {
        const loc = await newLocation();
        const type = await newType();
        const { user, resource } = await createExpert(admin);
        const samuNo = (loc.court.match(/\d+/) || [''])[0];
        const label = unique('FORM ');
        const a = await newEvent({ label, type_id: type, location_id: loc.id, participants: [user.id] });
        const b = await newEvent({ label, type_id: type, location_id: loc.id, participants: [user.id] });
        const cle = n => `${resource.id}_${n}_2031-04-07_AM`;
        await admin.post('/api/schedule', {
            [cle('available')]: '2',
            [cle('activity')]: '3',
            [cle('localisation')]: `🚨 SAMU ${samuNo}`
        });
        await admin.post('/api/custom-events/merge', { keep_id: a, remove_ids: [b] });
        const sch = (await admin.get('/api/schedule')).data;
        expect(sch[cle('activity')]).toBe('3');
    });

    it('contrôles : événement conservé et à fusionner obligatoires, inconnus refusés', async () => {
        const a = await newEvent({});
        expect((await admin.post('/api/custom-events/merge', { keep_id: a, remove_ids: [] })).status).toBe(400);
        expect((await admin.post('/api/custom-events/merge', { keep_id: a, remove_ids: [a] })).status).toBe(400);
        expect((await admin.post('/api/custom-events/merge', { keep_id: 'x', remove_ids: [a] })).status).toBe(400);
        expect((await admin.post('/api/custom-events/merge', { keep_id: a, remove_ids: [999999] })).status).toBe(404);
        expect(await exists(a)).toBe(true);
    });
});

describe('libellés voisins', () => {
    it('même type et même lieu, dates qui se recoupent, libellés voisins : probable', () => {
        const e = (norm, champs = {}) => ({
            type_id: 1,
            location_id: 5,
            start_date: '2031-04-05',
            end_date: '2031-04-09',
            period: 'FULL',
            norm,
            ...champs
        });
        const r = compareEvents(
            e('formation bandeau'),
            e('formation du bandeau de communication', { start_date: '2031-04-07', end_date: '2031-04-12' })
        );
        expect(r?.niveau).toBe('probable');
        // Type différent : rien
        expect(
            compareEvents(
                e('formation bandeau'),
                e('formation du bandeau de communication', {
                    type_id: 2,
                    start_date: '2031-04-07',
                    end_date: '2031-04-12'
                })
            )
        ).toBeNull();
    });
});
