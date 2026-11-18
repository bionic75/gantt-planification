// Notifications : messages instantanés (SSE), invitations d'affectation, affectations en attente,
// demandes d'affectation, notifications des experts, Teams
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.ts';
import { createExpert, createUser, loginAs } from './helpers/fixtures.ts';
import { startSmtpSink } from './helpers/smtp-sink.ts';
import type { TestServer } from './helpers/server.ts';
import type { Client } from './helpers/client.ts';
import type { SmtpSink } from './helpers/smtp-sink.ts';

let server: TestServer;
let admin: Client;
let smtp: SmtpSink;

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

const escape = (s: any) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Premiers événements reçus sur la connexion SSE d'un client */
async function readSse(client: Client, predicate: any, timeoutMs = 5000) {
    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}/api/sse`, {
        headers: { Cookie: client.cookie },
        signal: controller.signal
    });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = '';
    const deadline = Date.now() + timeoutMs;
    try {
        while (Date.now() < deadline && !predicate(text)) {
            const { value, done } = await Promise.race([
                reader.read(),
                new Promise<{ value: undefined; done: false }>(r =>
                    setTimeout(() => r({ value: undefined, done: false }), 200)
                )
            ]);
            if (done) break;
            if (value) text += decoder.decode(value);
        }
    } finally {
        controller.abort();
    }
    return text;
}

describe('messages instantanés', () => {
    it('message à un utilisateur déconnecté : conservé puis livré à sa connexion SSE', async () => {
        const user = await createUser(admin, { is_user: 1 });
        const r = await admin.post('/api/push-message', { toUserId: user.id, message: '  Bonjour  ' });
        expect(r.data).toEqual({ ok: true, pending: true });
        expect((await admin.post('/api/push-message', { toUserId: user.id, message: ' ' })).status).toBe(400);

        const client = await loginAs(server, user, 'user');
        const stream = await readSse(client, (t: any) => t.includes('push-message'));
        expect(stream).toContain('event: push-message');
        const payload = JSON.parse(stream.split('data: ')[1].split('\n')[0]);
        expect(payload).toMatchObject({ fromUserId: 1, message: 'Bonjour' });
        // Livré une seule fois
        expect(await readSse(client, () => false, 600)).not.toContain('push-message');
    });
});

describe('emails', () => {
    it("invitations d'affectation mises en file, suivi du lot", async () => {
        const { user, resource } = await createExpert(admin);
        const r = await admin.post('/api/send-assignment-emails', {
            assignments: [
                {
                    resourceId: resource.id,
                    email: user.email,
                    expertNom: user.nom,
                    expertPrenom: user.prenom,
                    assignments: [
                        { date: '2027-06-01', period: 'AM', activityCode: '5', activity: 'ANS', location: 'SAMU 75' },
                        { date: '2027-06-01', period: 'PM', activityCode: '5', activity: 'ANS', location: 'SAMU 75' },
                        { date: '2027-06-03', period: 'AM', actionType: 'deleted', oldActivityCode: '3', activity: 'x' }
                    ]
                },
                { expertName: 'Sans email', assignments: [] },
                // Adresse sans rapport avec la ressource : ignorée
                {
                    resourceId: resource.id,
                    email: 'victime@exterieur.example',
                    assignments: [{ date: '2027-06-02', period: 'AM', activityCode: '5', activity: 'ANS' }]
                }
            ]
        });
        expect(r.data).toMatchObject({ success: true, enqueued: 2 });
        const invite = await smtp.waitFor(new RegExp(`To: ${escape(user.email)}[\\s\\S]*METHOD:REQUEST`), 15000);
        expect(invite).toContain('Domaines des Urgences - Affectation');
        // Gabarit du site : icônes jointes en « cid »
        expect(invite).toMatch(/Content-ID: <mallette-grand@planification>/i);
        expect(invite).toMatch(/Content-ID: <lieu@planification>/i);
        await smtp.waitFor(new RegExp(`To: ${escape(user.email)}[\\s\\S]*METHOD:CANCEL`), 15000);

        let status;
        for (let i = 0; i < 50; i++) {
            status = (await admin.get(`/api/email-queue/status/${r.data.batchId}`)).data;
            if (status.isComplete) break;
            await new Promise(res => setTimeout(res, 200));
        }
        expect(status).toMatchObject({
            success: true,
            total: 2,
            sent: 2,
            failed: 0,
            pending: 0,
            progress: 100,
            failures: []
        });
        expect((await admin.post('/api/send-assignment-emails', { assignments: [] })).status).toBe(400);
        expect((await admin.get('/api/email-queue/status/inconnu')).data).toMatchObject({
            total: 0,
            isComplete: true,
            progress: 0
        });
    });

    it("demande d'affectation envoyée aux experts", async () => {
        const { user, resource } = await createExpert(admin);
        const r = await admin.post('/api/request-assignment', {
            fromName: 'Chef',
            fromEmail: 'chef@example.test',
            expertIds: [resource.id],
            subject: 'Renfort',
            startDate: '2027-06-07',
            startPeriod: 'Matin',
            endDate: '2027-06-08',
            endPeriod: 'Soir',
            message: "Bonjour [Prénom de l'utilisateur],\n\nDisponible ?"
        });
        expect(r.data).toEqual({ success: true, message: 'Demande envoyée à 1 expert(s)', emails: [user.email] });
        const mail = await smtp.waitFor(new RegExp(`To: ${escape(user.email)}[\\s\\S]*Renfort`), 15000);
        expect(mail).toContain(`Bonjour ${resource.prenom},`);
        expect((await admin.post('/api/request-assignment', { expertIds: [] })).status).toBe(400);
        expect((await admin.post('/api/request-assignment', { expertIds: [999999], fromEmail: 'x@y.z' })).status).toBe(
            404
        );
    });

    // Audit de sécurité, lot 2 : expéditeur pris dans la session, profils alignés sur l'interface
    it("expéditeur de la demande d'affectation : le compte connecté, jamais celui de la requête", async () => {
        const { user, resource } = await createExpert(admin);
        const r = await admin.post('/api/request-assignment', {
            fromName: 'Faux nom',
            fromEmail: 'pirate@exterieur.example',
            expertIds: [resource.id],
            subject: 'Expéditeur',
            startDate: '2027-06-07',
            startPeriod: 'Matin',
            endDate: '2027-06-08',
            endPeriod: 'Soir',
            message: 'Bonjour'
        });
        expect(r.status).toBe(200);
        const mail = await smtp.waitFor(new RegExp(`To: ${escape(user.email)}[\\s\\S]*Exp`), 15000);
        expect(mail).not.toContain('pirate@exterieur.example');
        expect(mail).not.toContain('Faux nom');
    });

    it('invitations refusées au profil RH, demande d’affectation refusée aux profils expert et RH', async () => {
        const rhUser = await createUser(admin, { is_rh: 1 });
        const rh = await loginAs(server, rhUser, 'rh');
        const { user: expertUser, resource } = await createExpert(admin);
        const expert = await loginAs(server, expertUser, 'expert');
        const invitation = { assignments: [{ resourceId: resource.id, assignments: [] }] };
        expect((await rh.post('/api/send-assignment-emails', invitation)).status).toBe(403);
        for (const client of [rh, expert]) {
            expect((await client.post('/api/request-assignment', { expertIds: [resource.id] })).status).toBe(403);
        }
    });

    // Audit de sécurité, lot 2 : routes inutilisées par l'interface, ouvertes à tout compte connecté (faux emails
    // d'affectation, message Teams libre), supprimées
    it.each([
        ['POST', '/api/pending-notifications'],
        ['DELETE', '/api/pending-notifications/s-1'],
        ['POST', '/api/send-assignment-notifications'],
        ['POST', '/api/notifications/create-batch'],
        ['POST', '/api/teams/notify']
    ])('%s %s supprimée', async (method, url) => {
        expect((await admin.request(method, url, {})).status).toBe(404);
    });
});

describe('notifications des experts', () => {
    it('liste avec la localisation (une notification par demi-journée), lecture, purge', async () => {
        const { user, resource } = await createExpert(admin);
        const expert = await loginAs(server, user, 'expert');
        const r = resource.id;
        // Notifications créées par les affectations posées dans le planning par l'administrateur (après la réponse)
        await admin.post('/api/schedule/save', {
            updates: [
                { key: `${r}_localisation_2027-06-10_AM`, value: 'SAMU 13' },
                { key: `${r}_activity_2027-06-10_AM`, value: '5' }
            ]
        });
        await new Promise(res => setTimeout(res, 300));
        // Même demi-journée réaffectée : la notification non lue est remplacée
        await admin.post('/api/schedule/save', { updates: [{ key: `${r}_activity_2027-06-10_AM`, value: '7' }] });
        await admin.post('/api/schedule/save', { updates: [{ key: `${r}_activity_2027-06-11_PM`, value: '8' }] });
        for (let i = 0; i < 50 && (await expert.get('/api/notifications/count')).data.count < 2; i++) {
            await new Promise(res => setTimeout(res, 100));
        }
        await new Promise(res => setTimeout(res, 300));
        expect((await expert.get('/api/notifications/count')).data).toEqual({ count: 2 });
        const list = (await expert.get('/api/notifications/list')).data.notifications;
        const byDate = Object.fromEntries(list.map((n: any) => [n.date, n]));
        expect(byDate['2027-06-10']).toMatchObject({
            activity_name: 'Qualification (SAMU 13)',
            requester_name: 'Système Admin',
            action_type: 'Nouvelle affectation',
            localisation: 'SAMU 13'
        });
        expect(byDate['2027-06-11'].localisation).toBeNull();

        await expert.post('/api/notifications/mark-read');
        expect((await expert.get('/api/notifications/count')).data).toEqual({ count: 0 });
        const cleared = (await admin.post('/api/notifications/clear-all')).data;
        expect(cleared).toMatchObject({ success: true });
        expect(cleared.statsByExpert).toContainEqual({ expert_id: user.id, username: user.username, count: 2 });
        expect((await expert.post('/api/notifications/clear-all')).status).toBe(403);
    });
});

describe('notifications créées par les enregistrements du planning', () => {
    /** Notifications créées après la réponse : attente du nombre voulu */
    const attendre = async (client: Client, n: any) => {
        for (let i = 0; i < 50; i++) {
            const { count } = (await client.get('/api/notifications/count')).data;
            if (count >= n) return count;
            await new Promise(r => setTimeout(r, 100));
        }
        return (await client.get('/api/notifications/count')).data.count;
    };

    it("une affectation posée par l'administrateur notifie l'expert, pas sa propre modification", async () => {
        const { user, resource } = await createExpert(admin);
        const expert = await loginAs(server, user, 'expert');
        const r = resource.id;
        const save = await admin.post('/api/schedule/save', {
            updates: [
                { key: `${r}_available_2027-08-02_AM`, value: '2' },
                { key: `${r}_activity_2027-08-02_AM`, value: '3' },
                { key: `${r}_localisation_2027-08-02_AM`, value: '🚨 SAMU 13' },
                // Activité « En attente » (2) : pas une affectation
                { key: `${r}_activity_2027-08-02_PM`, value: '2' }
            ]
        });
        expect(save.status).toBe(200);
        expect(await attendre(expert, 1)).toBe(1);
        const [n] = (await expert.get('/api/notifications/list')).data.notifications;
        expect(n).toMatchObject({
            date: '2027-08-02',
            period: 'Matin',
            activity_name: '🚨 SAMU (Déploiement) (🚨 SAMU 13)',
            action_type: 'Nouvelle affectation',
            localisation: '🚨 SAMU 13'
        });

        // Même planning renvoyé : aucune cellule modifiée, aucune nouvelle notification
        await expert.post('/api/notifications/mark-read');
        await admin.post('/api/schedule/save', {
            updates: [{ key: `${r}_activity_2027-08-02_AM`, value: '3' }]
        });
        await new Promise(res => setTimeout(res, 500));
        expect((await expert.get('/api/notifications/count')).data).toEqual({ count: 0 });

        // L'expert modifie sa propre ligne : pas de notification pour lui-même
        await expert.post('/api/schedule/save', { updates: [{ key: `${r}_activity_2027-08-03_AM`, value: '3' }] });
        await new Promise(res => setTimeout(res, 500));
        expect((await expert.get('/api/notifications/count')).data).toEqual({ count: 0 });
    });
});

describe('Teams', () => {
    it('test du canal et notifications selon la configuration', async () => {
        expect((await admin.post('/api/teams/test', {})).status).toBe(400);
        expect((await admin.post('/api/teams/test', { teamsEmail: 'canal@teams.test' })).data).toEqual({
            success: true
        });
        await smtp.waitFor(/To: canal@teams\.test[\s\S]*Test de notification/, 15000);

        const config = { enabled: true, notifications: ['evenement'], teamsEmail: 'canal@teams.test' };
        expect((await admin.post('/api/automation/config/3', { config })).status).toBe(200);
        // Notification émise par le serveur à la création d'un événement (textes recherchés en ASCII : le puits SMTP de
        // test ne décode pas l'UTF-8)
        await admin.post('/api/my-custom-events', { startDate: '2027-06-20', label: 'Evenement Teams' });
        await smtp.waitFor(/To: canal@teams\.test[\s\S]*Evenement Teams/, 15000);
    });
});

describe('envoi du calendrier par email', () => {
    it("envoyé à l'utilisateur rattaché à la ressource, contenu et objet construits par le serveur", async () => {
        const { user, resource } = await createExpert(admin);
        const requester = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        const r = await requester.post('/api/send-calendar-email', {
            resourceId: resource.id,
            year: 2027,
            month: 2,
            // Champs d'une ancienne page : ignorés
            email: 'victime@exterieur.example',
            html: '<p>INJECTION-CALENDRIER</p>',
            subject: 'Objet INJECTION-CALENDRIER'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const mail = await smtp.waitFor(new RegExp(`To: ${escape(user.email)}[\\s\\S]*Mars 2027`));
        expect(mail).toContain(`Planning ${resource.nom}`);
        expect(smtp.messages.some(m => m.includes('victime@exterieur.example'))).toBe(false);
        expect(smtp.messages.some(m => m.includes('INJECTION-CALENDRIER'))).toBe(false);
    });

    it('refusé sans mois valide, ou pour une ressource sans utilisateur avec email', async () => {
        const { resource } = await createExpert(admin);
        for (const corps of [
            { resourceId: resource.id },
            { resourceId: resource.id, year: 2027, month: 12 },
            { resourceId: 'x', year: 2027, month: 1 },
            { resourceId: 999999, year: 2027, month: 1 }
        ]) {
            expect((await admin.post('/api/send-calendar-email', corps)).status, JSON.stringify(corps)).toBe(400);
        }
    });
});

describe('calendrier d’une ressource (aperçu)', () => {
    it('demi-journées et pastilles du mois, construites à partir du planning enregistré', async () => {
        const { resource } = await createExpert(admin);
        const k = (type: any, date: string, p: any) => `${resource.id}_${type}_${date}_${p}`;
        await admin.post('/api/schedule', {
            [k('available', '2027-03-03', 'AM')]: '2',
            [k('activity', '2027-03-03', 'AM')]: '5',
            [k('localisation', '2027-03-03', 'AM')]: 'T'
        });
        const r = await admin.get(`/api/resource-calendar/${resource.id}?year=2027&month=2`);
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.titre).toBe(`Planning ${resource.nom} ${resource.prenom} - Mars 2027`);
        expect(r.data.contenu).toContain('ANS Dép. (🏠 T)');
        expect(r.data.contenu).toContain('Trigramme:');
        expect((await admin.get(`/api/resource-calendar/${resource.id}?year=2027`)).status).toBe(400);
        expect((await admin.get('/api/resource-calendar/999999?year=2027&month=2')).status).toBe(404);
    });
});
