// File d'attente des emails : envoi en arrière-plan des emails du circuit CRA
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.ts';
import { createExpert, loginAs } from './helpers/fixtures.ts';
import { startSmtpSink, type SmtpSink } from './helpers/smtp-sink.ts';
import type { Client } from './helpers/client.ts';
import type { TestServer } from './helpers/server.ts';

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

it("le refus d'un CRA envoie un email à l'expert via la file d'attente", async () => {
    const { user } = await createExpert(admin);
    const expert = await loginAs(server, user, 'expert');
    const { data } = await expert.get(`/api/cra/find-or-create?user_id=${user.id}&mois=4&annee=2032`);
    await expert.post(`/api/cra/${data.id}/submit`);
    await admin.post(`/api/cra/${data.id}/refuser/n1`, { commentaire: 'À compléter' });

    const mail = await smtp.waitFor(new RegExp(`To: ${user.email.replace('.', '\\.')}[\\s\\S]*refus`, 'i'), 15000);
    // Lien dans un attribut HTML : « & » échappé, décodé par le client de messagerie
    expect(mail).toContain(`${server.appUrl}/cra/${data.id}`);
});
