// Notifications : messages instantanés (SSE), invitations d'affectation, affectations en attente,
// demandes d'affectation, notifications des experts, Teams
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

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Premiers événements reçus sur la connexion SSE d'un client */
async function readSse(client, predicate, timeoutMs = 5000) {
    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}/api/sse`, {
        headers: { Cookie: client.cookie },
        signal: controller.signal
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const deadline = Date.now() + timeoutMs;
    try {
        while (Date.now() < deadline && !predicate(text)) {
            const { value, done } = await Promise.race([
                reader.read(),
                new Promise(r => setTimeout(() => r({ value: undefined, done: false }), 200))
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
        const stream = await readSse(client, t => t.includes('push-message'));
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

    it('affectations en attente : enregistrement, liste, envoi groupé', async () => {
        const { user, resource } = await createExpert(admin);
        const sessionId = `s-${Date.now()}`;
        await admin.post('/api/pending-notifications', {
            sessionId,
            resourceId: resource.id,
            expertId: user.id,
            assignmentData: { dates: '01/06/2027', activity: 'ANS', location: 'Paris' }
        });
        const list = (await admin.get(`/api/pending-notifications/${sessionId}`)).data;
        expect(list).toEqual([
            expect.objectContaining({ session_id: sessionId, email: user.email, resource_nom: resource.nom })
        ]);
        const sent = await admin.post('/api/send-assignment-notifications', { sessionId });
        expect(sent.data).toEqual({
            success: true,
            results: [{ success: true, expert: `${user.prenom} ${user.nom}` }]
        });
        await smtp.waitFor(new RegExp(`To: ${escape(user.email)}[\\s\\S]*Nouvelle affectation`), 15000);
        expect((await admin.get(`/api/pending-notifications/${sessionId}`)).data).toEqual([]);
        expect((await admin.delete(`/api/pending-notifications/${sessionId}`)).data).toEqual({
            success: true,
            deleted: 0
        });
    });
});

describe('notifications des experts', () => {
    it('création groupée, liste avec la localisation, lecture, purge', async () => {
        const { user, resource } = await createExpert(admin);
        const expert = await loginAs(server, user, 'expert');
        await admin.post('/api/schedule', { [`${resource.id}_localisation_2027-06-10_AM`]: 'SAMU 13' });
        const r = await admin.post('/api/notifications/create-batch', {
            notifications: [
                { resourceId: resource.id, date: '2027-06-10', period: 'Matin', activity: 'ANS', location: 'SAMU 13' },
                { resourceId: resource.id, date: '2027-06-10', period: 'Matin', activity: 'Qualif' },
                { resourceId: resource.id, date: '2027-06-11', period: 'Après-midi', activity: 'Divers' },
                { resourceId: 999999, date: '2027-06-11', period: 'Matin', activity: 'x' }
            ]
        });
        expect(r.data).toEqual({ success: true, created: 3, errors: 0 });
        expect((await expert.get('/api/notifications/count')).data).toEqual({ count: 2 });
        const list = (await expert.get('/api/notifications/list')).data.notifications;
        const byDate = Object.fromEntries(list.map(n => [n.date, n]));
        expect(byDate['2027-06-10']).toMatchObject({
            activity_name: 'Qualif',
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

describe('Teams', () => {
    it('test du canal et notifications selon la configuration', async () => {
        expect((await admin.post('/api/teams/test', {})).status).toBe(400);
        expect((await admin.post('/api/teams/test', { teamsEmail: 'canal@teams.test' })).data).toEqual({
            success: true
        });
        await smtp.waitFor(/To: canal@teams\.test[\s\S]*Test de notification/, 15000);

        expect((await admin.post('/api/teams/notify', { type: 'evenement', data: {} })).data).toEqual({
            success: false,
            reason: 'Configuration non trouvée'
        });
        await admin.put('/api/settings', {
            key: 'automation_3_config',
            value: JSON.stringify({ enabled: true, notifications: ['evenement'], teamsEmail: 'canal@teams.test' })
        });
        expect((await admin.post('/api/teams/notify', { type: 'astreinte', data: {} })).data).toEqual({
            success: false,
            reason: 'Type de notification non activé'
        });
        expect(
            (
                await admin.post('/api/teams/notify', {
                    type: 'evenement',
                    data: { name: 'Reunion Teams', date: '01/06' }
                })
            ).data
        ).toEqual({ success: true });
        // Textes recherchés en ASCII : le puits SMTP de test ne décode pas l'UTF-8
        await smtp.waitFor(/To: canal@teams\.test[\s\S]*Reunion Teams/, 15000);

        // Notification émise par le serveur à la création d'un événement
        await admin.post('/api/my-custom-events', { startDate: '2027-06-20', label: 'Evenement Teams' });
        await smtp.waitFor(/To: canal@teams\.test[\s\S]*Evenement Teams/, 15000);
    });
});

describe('envoi du calendrier par email', () => {
    it("envoyé à l'utilisateur rattaché à la ressource, jamais à l'adresse fournie par le client", async () => {
        const { user, resource } = await createExpert(admin);
        const requester = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        const r = await requester.post('/api/send-calendar-email', {
            resourceId: resource.id,
            email: 'victime@exterieur.example',
            html: '<p>Calendrier</p>',
            subject: 'Planning calendrier-test'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        const mail = await smtp.waitFor(/Planning calendrier-test/);
        expect(mail).toContain(`To: ${user.email}`);
        expect(smtp.messages.some(m => m.includes('victime@exterieur.example'))).toBe(false);
    });

    it('refusé pour une ressource sans utilisateur avec email', async () => {
        const r = await admin.post('/api/send-calendar-email', { resourceId: 999999, html: '<p>x</p>', subject: 'x' });
        expect(r.status).toBe(400);
    });
});
