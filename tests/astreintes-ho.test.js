// Astreintes HO (heures ouvrées) : déclaration des ressources, planning demi-journée par demi-journée, droits de
// modification, e-mail de mise à jour, automatisations n°5 et n°6
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createExpert, createResource, createUser, loginAs } from './helpers/fixtures.js';
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

// Dates relatives à aujourd'hui (heure de Paris), lundis de semaine
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const addDays = (date, n) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const monday = date => addDays(date, 1 - (new Date(`${date}T00:00:00Z`).getUTCDay() || 7));
const thisWeek = monday(parisToday());
const pastWeek = addDays(thisWeek, -7);
const nextWeek = addDays(thisWeek, 7);
const monthOf = date => date.slice(0, 7);

/** Expert (compte + ressource) déclaré pour les astreintes HO */
async function hoExpert() {
    const e = await createExpert(admin);
    expect(
        (await admin.post(`/api/resources/${e.resource.id}/astreinte`, { type: 'ho', hasAccess: true })).status
    ).toBe(200);
    return { ...e, client: await loginAs(server, e.user, 'expert') };
}
const slot = (resource, date, period = 'AM', action = 'add') => ({ date, period, resource_id: resource.id, action });
const save = (client, ...changes) => client.post('/api/astreintes-ho/save', { changes });
const month = async (client, date) => (await client.get(`/api/astreintes-ho?month=${monthOf(date)}`)).data;
const cells = (data, resourceId) =>
    data.slots.filter(s => s.resource_id === resourceId).map(s => `${s.date} ${s.period}`);

describe('déclaration des astreintes par ressource', () => {
    it('HO, HNO et accompagnement post démarrage se déclarent séparément', async () => {
        const res = await createResource(admin);
        const flags = async () => {
            const r = (await admin.get('/api/resources')).data.find(x => x.id === res.id);
            return [r.astreinte_ho, r.astreinte_volontaire, r.astreinte_apd];
        };
        expect(await flags()).toEqual([0, 0, 0]);
        await admin.post(`/api/resources/${res.id}/astreinte`, { type: 'ho', hasAccess: true });
        await admin.post(`/api/resources/${res.id}/astreinte`, { type: 'apd', hasAccess: true });
        expect(await flags()).toEqual([1, 0, 1]);
        await admin.post(`/api/resources/${res.id}/astreinte`, { hasAccess: true }); // sans type : HNO (comportement historique)
        await admin.post(`/api/resources/${res.id}/astreinte`, { type: 'ho', hasAccess: false });
        expect(await flags()).toEqual([0, 1, 1]);
        expect((await admin.post(`/api/resources/${res.id}/astreinte`, { type: 'xx', hasAccess: true })).status).toBe(
            400
        );
    });

    it("à la création et à la modification d'une ressource", async () => {
        const res = await createResource(admin, { astreinte_ho: 1, astreinte_apd: 1 });
        const get = async () => (await admin.get('/api/resources')).data.find(x => x.id === res.id);
        expect(await get()).toMatchObject({ astreinte_ho: 1, astreinte_apd: 1, astreinte_volontaire: 0 });
        await admin.put(`/api/resources/${res.id}`, {
            ...res,
            astreinte_ho: 0,
            astreinte_volontaire: 1,
            astreinte_apd: 0
        });
        expect(await get()).toMatchObject({ astreinte_ho: 0, astreinte_apd: 0, astreinte_volontaire: 1 });
    });

    it("déclarer l'astreinte HO donne le profil expert au compte rattaché", async () => {
        const res = await createResource(admin);
        const user = await createUser(admin, { is_user: 1, resource_id: res.id });
        await admin.post(`/api/resources/${res.id}/astreinte`, { type: 'ho', hasAccess: true });
        const u = (await admin.get('/api/users')).data.find(x => x.id === user.id);
        expect(u.is_expert).toBe(1);
    });
});

describe('planning mensuel', () => {
    it('semaines du lundi au vendredi, sans week-end, tous profils en lecture', async () => {
        const data = await month(admin, thisWeek);
        expect(data.weeks.length).toBeGreaterThanOrEqual(4);
        for (const w of data.weeks) {
            expect(w.days).toHaveLength(5);
            expect(new Date(`${w.monday}T00:00:00Z`).getUTCDay()).toBe(1);
        }
        const user = await createUser(admin, { is_user: 1 });
        const viewer = await loginAs(server, user, 'user');
        const v = await month(viewer, thisWeek);
        expect(v.me).toMatchObject({ canEdit: false, isAdmin: false });
        expect((await viewer.get('/api/astreintes-ho?month=2026-13')).status).toBe(400);
        expect((await server.client().get(`/api/astreintes-ho?month=${monthOf(thisWeek)}`)).status).toBe(401);
    });
});

describe('droits de modification', () => {
    it('un expert déclaré HO modifie ses propres inscriptions (semaine en cours et à venir)', async () => {
        const e = await hoExpert();
        const r = await save(e.client, slot(e.resource, thisWeek, 'AM'), slot(e.resource, nextWeek, 'PM'));
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.applied.map(c => `${c.date} ${c.period} ${c.action}`)).toEqual([
            `${thisWeek} AM add`,
            `${nextWeek} PM add`
        ]);
        const data = await month(e.client, thisWeek);
        expect(data.me).toMatchObject({ canEdit: true, isAdmin: false, resourceId: e.resource.id });
        expect(cells(data, e.resource.id)).toContain(`${thisWeek} AM`);
        // retrait puis opérations sans effet
        const back = await save(
            e.client,
            slot(e.resource, thisWeek, 'AM', 'remove'),
            slot(e.resource, nextWeek, 'PM', 'add')
        );
        expect(back.data.applied).toHaveLength(1);
        expect(back.data.skipped).toBe(1);
    });

    it("un expert ne modifie ni les inscriptions d'un autre expert, ni les semaines passées", async () => {
        const a = await hoExpert();
        const b = await hoExpert();
        const other = await save(a.client, slot(b.resource, nextWeek));
        expect(other.status).toBe(403);
        expect(other.data.error).toMatch(/propres inscriptions/);
        const past = await save(a.client, slot(a.resource, pastWeek, 'PM'));
        expect(past.status).toBe(403);
        expect(past.data.error).toMatch(/semaines passées/);
        expect(cells(await month(admin, pastWeek), a.resource.id)).toEqual([]);
    });

    it('les autres profils et les experts non déclarés ne modifient pas', async () => {
        const declared = await hoExpert();
        const notDeclared = await createExpert(admin);
        const expert = await loginAs(server, notDeclared.user, 'expert');
        const user = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        for (const client of [expert, user]) {
            const r = await save(client, slot(declared.resource, nextWeek));
            expect(r.status).toBe(403);
        }
        expect((await expert.get(`/api/astreintes-ho?month=${monthOf(thisWeek)}`)).data.me.canEdit).toBe(false);
    });

    it('un administrateur modifie toutes les inscriptions, y compris les semaines passées', async () => {
        const e = await hoExpert();
        const r = await save(admin, slot(e.resource, pastWeek, 'AM'), slot(e.resource, nextWeek, 'AM'));
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.applied).toHaveLength(2);
        expect(cells(await month(admin, pastWeek), e.resource.id)).toContain(`${pastWeek} AM`);
        // l'expert voit son inscription passée mais ne peut plus la retirer
        expect((await save(e.client, slot(e.resource, pastWeek, 'AM', 'remove'))).status).toBe(403);
    });

    it('2 experts ou plus sur la même demi-journée ; contrôles des données', async () => {
        const a = await hoExpert();
        const b = await hoExpert();
        const day = addDays(nextWeek, 2);
        expect((await save(a.client, slot(a.resource, day, 'AM'))).status).toBe(200);
        expect((await save(b.client, slot(b.resource, day, 'AM'))).status).toBe(200);
        const here = (await month(admin, day)).slots.filter(s => s.date === day && s.period === 'AM');
        expect(here.map(s => s.resource_id).sort()).toEqual([a.resource.id, b.resource.id].sort());

        const bad = c => save(admin, c).then(r => r.status);
        expect(await bad(slot(a.resource, addDays(nextWeek, 5)))).toBe(400); // samedi
        expect(await bad(slot(a.resource, addDays(nextWeek, 6)))).toBe(400); // dimanche
        expect(await bad({ ...slot(a.resource, day), period: 'SOIR' })).toBe(400);
        expect(await bad({ ...slot(a.resource, day), action: 'toggle' })).toBe(400);
        expect(await bad(slot(a.resource, '2026-02-30'))).toBe(400);
        expect(await bad(slot(await createResource(admin), day))).toBe(400); // expert non déclaré HO
        expect((await admin.post('/api/astreintes-ho/save', { changes: [] })).status).toBe(400);
    });
});

describe('e-mail de mise à jour (automatisation n°6) et envois', () => {
    it('modification de la semaine en cours : e-mail « MAJ » avec les modifications ; autre semaine : aucun e-mail', async () => {
        const e = await hoExpert();
        const recipient = await createUser(admin, { is_user: 1 });
        await admin.post('/api/automation/config/6', {
            config: {
                enabled: true,
                weekDays: [1],
                hour: 8,
                recipients: [recipient.id],
                subject: 'Planning HO semaine {semaine}',
                body: 'Bonjour,\n\n{planning}\n\nLien {lien}'
            }
        });
        const info = (await month(e.client, thisWeek)).updateMail;
        expect(info).toEqual({ enabled: true, recipients: 1 });

        const far = await save(e.client, slot(e.resource, nextWeek, 'AM'));
        expect(far.data.mail).toMatchObject({ sent: false });
        const r = await save(e.client, slot(e.resource, thisWeek, 'PM'));
        expect(r.data.touchesCurrentWeek).toBe(true);
        expect(r.data.mail).toEqual({ sent: true, recipients: 1 });
        const mail = await smtp.waitFor(
            new RegExp(
                `To: ${recipient.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*Subject: MAJ - Planning HO semaine`
            ),
            15000
        );
        expect(mail).toContain(`${e.user.prenom} ${e.user.nom}`);
        expect(mail).toMatch(/Modifications apport/);

        // désactivée : plus d'e-mail
        await admin.post('/api/automation/config/6', { config: { enabled: false, recipients: [recipient.id] } });
        const off = await save(e.client, slot(e.resource, thisWeek, 'PM', 'remove'));
        expect(off.data.mail).toMatchObject({ sent: false });
        expect((await month(e.client, thisWeek)).updateMail.enabled).toBe(false);
    });

    it('n°5 : planning de la semaine suivante envoyé aux experts HO choisis, gabarit personnalisé', async () => {
        const a = await hoExpert();
        const b = await hoExpert();
        await admin.post('/api/automation/config/5', {
            config: {
                enabled: true,
                weekDay: 4,
                hour: 9,
                allExperts: false,
                recipients: [a.user.id],
                subject: 'HO a completer S{semaine}',
                body: 'Bonjour {debut} au {fin}\n{planning}'
            }
        });
        await save(admin, slot(a.resource, nextWeek, 'AM'));
        const r = await admin.post('/api/astreintes-ho/automation/5/send');
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data).toMatchObject({ sent: true, recipients: 1 });
        const mail = await smtp.waitFor(
            new RegExp(
                `To: ${a.user.email.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*Subject: HO a completer S`
            ),
            15000
        );
        expect(mail).not.toContain(`To: ${b.user.email}`);
        const logs = (await admin.get('/api/automation/logs/5')).data.logs;
        expect(logs[0]).toMatchObject({ automation_id: 5, recipients_count: 1 });
    });

    it('n°6 : communication aux utilisateurs choisis ; réservé aux administrateurs', async () => {
        const recipient = await createUser(admin, { is_user: 1 });
        await admin.post('/api/automation/config/6', {
            config: {
                enabled: true,
                weekDays: [1, 3],
                hour: 8,
                week: 'next',
                recipients: [recipient.id],
                subject: 'Communication HO S{semaine}'
            }
        });
        const r = await admin.post('/api/astreintes-ho/automation/6/send');
        expect(r.data).toMatchObject({ sent: true, recipients: 1 });
        await smtp.waitFor(
            new RegExp(
                `To: ${recipient.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*Subject: Communication HO S`
            ),
            15000
        );
        const user = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        expect((await user.post('/api/astreintes-ho/automation/6/send')).status).toBe(403);
        expect((await admin.post('/api/astreintes-ho/automation/7/send')).status).toBe(400);
        const info = (await admin.get('/api/astreintes-ho/info')).data;
        expect(info.templates[5].subject).toBeTruthy();
        expect(info.fields.map(f => f[0])).toContain('{planning}');
    });
});
