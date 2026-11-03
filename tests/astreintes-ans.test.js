// Astreintes HO ANS : case « Astreinte HO ANS » des utilisateurs, planning d'un utilisateur par jour ouvré, droits de
// modification, e-mail de mise à jour (automatisation n°8) et automatisations n°7 et n°8
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createResource, createUser, loginAs } from './helpers/fixtures.js';
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

/** Utilisateur (profil « utilisateur ») avec la case « Astreinte HO ANS » cochée */
async function ansUser(flag = true) {
    const user = await createUser(admin, { is_user: 1 });
    if (flag)
        expect((await admin.post(`/api/users/${user.id}/astreinte-ho-ans`, { hasAccess: true })).status).toBe(200);
    return { ...user, client: await loginAs(server, user, 'user') };
}
const set = (date, user) => ({ date, user_id: user ? user.id : null });
const save = (client, ...ansChanges) => client.post('/api/astreintes-ho/save', { ansChanges });
const month = async (client, date) => (await client.get(`/api/astreintes-ho?month=${date.slice(0, 7)}`)).data;
const holder = (data, date) => data.ans.slots.find(s => s.date === date)?.user_id ?? null;

describe('case « Astreinte HO ANS »', () => {
    it('cochée par un administrateur, visible dans la liste des utilisateurs, réservée aux administrateurs', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const flag = async () => (await admin.get('/api/users')).data.find(u => u.id === user.id).astreinte_ho_ans;
        expect(await flag()).toBe(0);
        await admin.post(`/api/users/${user.id}/astreinte-ho-ans`, { hasAccess: true });
        expect(await flag()).toBe(1);
        const other = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        expect((await other.post(`/api/users/${user.id}/astreinte-ho-ans`, { hasAccess: false })).status).toBe(403);
        await admin.post(`/api/users/${user.id}/astreinte-ho-ans`, { hasAccess: false });
        expect(await flag()).toBe(0);
    });

    it('trigramme : celui du compte, sinon celui de la ressource, sinon les initiales', async () => {
        const own = await createUser(admin, { is_user: 1 });
        expect(
            (
                await admin.put(`/api/users/${own.id}`, {
                    nom: own.nom,
                    prenom: own.prenom,
                    email: own.email,
                    trigramme: 'ZZZ',
                    is_user: 1
                })
            ).status
        ).toBe(200);
        const resource = await createResource(admin);
        const linked = await createUser(admin, { is_expert: 1, resource_id: resource.id });
        const plain = await createUser(admin, { is_user: 1, nom: 'Durand', prenom: 'Léa' });
        for (const u of [own, linked, plain])
            await admin.post(`/api/users/${u.id}/astreinte-ho-ans`, { hasAccess: true });
        const users = (await month(admin, thisWeek)).ans.users;
        const tri = id => users.find(u => u.user_id === id).trigramme;
        expect(tri(own.id)).toBe('ZZZ');
        expect(tri(linked.id)).toBe(resource.trigramme);
        expect(tri(plain.id)).toBe('LDU');
    });

    it('le planning ne propose que les comptes actifs ayant la case cochée', async () => {
        const a = await ansUser();
        const b = await ansUser(false);
        const users = (await month(admin, thisWeek)).ans.users.map(u => u.user_id);
        expect(users).toContain(a.id);
        expect(users).not.toContain(b.id);
    });
});

describe('planning : un utilisateur par jour', () => {
    it('un administrateur désigne, remplace et libère un jour', async () => {
        const a = await ansUser();
        const b = await ansUser();
        const day = addDays(nextWeek, 1);
        expect((await save(admin, set(day, a))).status).toBe(200);
        expect(holder(await month(admin, day), day)).toBe(a.id);
        const r = await save(admin, set(day, b));
        expect(r.data.ans.applied[0]).toMatchObject({ action: 'set', user_id: b.id });
        expect(holder(await month(admin, day), day)).toBe(b.id);
        expect((await save(admin, set(day, b))).data.ans.skipped).toBe(1);
        expect((await save(admin, set(day, null))).data.ans.applied[0].action).toBe('clear');
        expect(holder(await month(admin, day), day)).toBeNull();
    });

    it('contrôles : jour ouvré, utilisateur ayant la case, un seul changement par jour, modifications obligatoires', async () => {
        const a = await ansUser();
        const nonFlagged = await ansUser(false);
        expect((await save(admin, set(addDays(nextWeek, 5), a))).status).toBe(400); // samedi
        expect((await save(admin, set(nextWeek, nonFlagged))).status).toBe(400);
        expect((await save(admin, set(nextWeek, a), set(nextWeek, null))).status).toBe(400);
        expect((await admin.post('/api/astreintes-ho/save', {})).status).toBe(400);
    });
});

describe('droits de modification', () => {
    it('un utilisateur ANS s’inscrit et se retire lui-même, de la semaine en cours aux semaines à venir', async () => {
        const a = await ansUser();
        const day = addDays(nextWeek, 2);
        expect((await save(a.client, set(day, a))).status).toBe(200);
        expect(holder(await month(a.client, day), day)).toBe(a.id);
        expect((await save(a.client, set(day, null))).status).toBe(200);
        expect(holder(await month(a.client, day), day)).toBeNull();
        expect((await save(a.client, set(thisWeek, a))).status).toBe(200);
    });

    it('il ne désigne personne d’autre, ne libère pas un autre, ne touche pas aux semaines passées', async () => {
        const a = await ansUser();
        const b = await ansUser();
        const day = addDays(nextWeek, 3);
        expect((await save(a.client, set(day, b))).status).toBe(403);
        await save(admin, set(day, b));
        expect((await save(a.client, set(day, null))).status).toBe(403);
        expect((await save(a.client, set(day, a))).status).toBe(403); // remplacerait b
        expect((await save(a.client, set(pastWeek, a))).status).toBe(403);
    });

    it('un utilisateur sans la case ne modifie pas ; un administrateur modifie le passé', async () => {
        const a = await ansUser(false);
        const b = await ansUser();
        expect((await save(a.client, set(nextWeek, a))).status).toBe(403);
        expect((await save(a.client, set(nextWeek, b))).status).toBe(403);
        expect((await save(admin, set(pastWeek, b))).status).toBe(200);
        const me = (await month(a.client, thisWeek)).ans.me;
        expect(me).toMatchObject({ isAdmin: false, canEdit: false });
        expect((await month(admin, thisWeek)).ans.me).toMatchObject({ isAdmin: true, canEdit: true });
    });
});

describe('e-mail de mise à jour (automatisation n°8) et envois', () => {
    it('modification de la semaine en cours : e-mail « MAJ » ; autre semaine : aucun e-mail', async () => {
        const a = await ansUser();
        const recipient = await createUser(admin, { is_user: 1 });
        await admin.post('/api/automation/config/8', {
            config: {
                enabled: true,
                weekDays: [1],
                hour: 8,
                recipients: [recipient.id],
                subject: 'Planning ANS semaine {semaine}',
                body: 'Bonjour,\n\n{planning}\n\n{modifications}'
            }
        });
        expect((await month(a.client, thisWeek)).ans.updateMail).toEqual({ enabled: true, recipients: 1 });
        const far = await save(a.client, set(addDays(nextWeek, 1), a));
        expect(far.data.ans.mail).toMatchObject({ sent: false });
        const day = addDays(thisWeek, 4); // vendredi de la semaine en cours (le lundi est pris par un autre test)
        const r = await save(a.client, set(day, a));
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.ans.touchesCurrentWeek).toBe(true);
        expect(r.data.ans.mail).toEqual({ sent: true, recipients: 1 });
        const mail = await smtp.waitFor(
            new RegExp(
                `To: ${recipient.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*Subject: MAJ - Planning ANS semaine`
            ),
            15000
        );
        expect(mail).toContain(`${a.prenom} ${a.nom}`);
        await admin.post('/api/automation/config/8', { config: { enabled: false, recipients: [recipient.id] } });
        expect((await save(a.client, set(day, null))).data.ans.mail).toMatchObject({ sent: false });
    });

    it('n°7 : planning ANS de la semaine suivante envoyé aux utilisateurs choisis', async () => {
        const a = await ansUser();
        const b = await ansUser();
        await admin.post('/api/automation/config/7', {
            config: {
                enabled: true,
                weekDay: 4,
                hour: 9,
                allExperts: false,
                recipients: [a.id],
                subject: 'ANS a completer S{semaine}',
                body: 'Bonjour {debut} au {fin}\n{planning}'
            }
        });
        await save(admin, set(nextWeek, a));
        const r = await admin.post('/api/astreintes-ho/automation/7/send');
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data).toMatchObject({ sent: true, recipients: 1 });
        const mail = await smtp.waitFor(
            new RegExp(`To: ${a.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*Subject: ANS a completer S`),
            15000
        );
        expect(mail).not.toContain(`To: ${b.email}`);
        expect(mail).toContain('pourvoir');
        const logs = (await admin.get('/api/automation/logs/7')).data.logs;
        expect(logs[0]).toMatchObject({ automation_id: 7, recipients_count: 1 });
    });

    it('n°8 : communication ; réservé aux administrateurs ; gabarits et utilisateurs ANS pour l’administration', async () => {
        const recipient = await createUser(admin, { is_user: 1 });
        await admin.post('/api/automation/config/8', {
            config: {
                enabled: true,
                weekDays: [1, 3],
                hour: 8,
                week: 'next',
                recipients: [recipient.id],
                subject: 'Communication ANS S{semaine}'
            }
        });
        const r = await admin.post('/api/astreintes-ho/automation/8/send');
        expect(r.data).toMatchObject({ sent: true, recipients: 1 });
        await smtp.waitFor(
            new RegExp(
                `To: ${recipient.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*Subject: Communication ANS S`
            ),
            15000
        );
        const user = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        expect((await user.post('/api/astreintes-ho/automation/8/send')).status).toBe(403);
        const info = (await admin.get('/api/astreintes-ho/info')).data;
        expect(info.templates[7].subject).toContain('HO ANS');
        expect(info.templates[8].body).toContain('{modifications}');
        expect(Array.isArray(info.ansUsers)).toBe(true);
    });
});
