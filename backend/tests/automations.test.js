// Automatisations : configuration, rappel de saisie des disponibilités (n°1), sauvegarde du planning (n°2),
// diagnostic et nettoyage des clés de planification
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
const pad = n => String(n).padStart(2, '0');
const next = (() => {
    const d = new Date();
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
})();

describe('configuration et journaux', () => {
    it('lecture, enregistrement, journal vide', async () => {
        expect((await admin.get('/api/automation/config/9')).data).toEqual({ success: true, config: {} });
        await admin.post('/api/automation/config/9', { config: { enabled: true, days: 3 } });
        expect((await admin.get('/api/automation/config/9')).data.config).toEqual({ enabled: true, days: 3 });
        expect((await admin.get('/api/automation/logs/9')).data).toEqual({ success: true, logs: [] });
        expect((await admin.get('/api/automation/download/2/999999')).status).toBe(404);
    });
});

describe('n°1 : rappel de saisie des disponibilités', () => {
    it('experts sans disponibilité le mois prochain, rappel envoyé et journalisé', async () => {
        const without = await createExpert(admin);
        const withDispo = await createExpert(admin);
        await admin.post('/api/schedule', {
            [`${withDispo.resource.id}_available_${next.year}-${pad(next.month)}-05_AM`]: '2'
        });
        const test = (await admin.get('/api/automation/test/1')).data;
        expect(test).toMatchObject({ success: true, year: next.year, month: next.month });
        const ids = test.expertsWithoutAvailability.map(e => e.id);
        expect(ids).toContain(without.user.id);
        expect(ids).not.toContain(withDispo.user.id);

        const copy = await createUser(admin);
        await admin.post('/api/automation/config/1', { config: { enabled: false, copyUserId: copy.id } });
        const expert = test.expertsWithoutAvailability.find(e => e.id === without.user.id);
        const r = await admin.post('/api/automation/send-reminder', {
            experts: [expert],
            targetMonth: test.targetMonth
        });
        expect(r.data).toEqual({ success: true, sent: 1, failed: 0 });
        const mail = await smtp.waitFor(new RegExp(`To: ${escape(without.user.email)}`), 15000);
        expect(mail).toContain(`Cc: ${copy.email}`);
        expect(mail).toContain(`Bonjour ${without.user.prenom} ${without.user.nom},`);

        let logs = [];
        for (let i = 0; i < 20 && logs.length === 0; i++) {
            await new Promise(res => setTimeout(res, 100));
            logs = (await admin.get('/api/automation/logs/1')).data.logs;
        }
        expect(logs[0]).toMatchObject({
            automation_id: 1,
            expert_id: without.user.id,
            target_month: test.targetMonth,
            recipients_count: 0
        });
        await admin.delete('/api/automation/logs/1');
        expect((await admin.get('/api/automation/logs/1')).data.logs).toEqual([]);
        expect((await admin.post('/api/automation/send-reminder', { experts: [] })).status).toBe(400);
    });
});

describe('n°2 : sauvegarde du planning', () => {
    it('mois disponibles, aperçu, envoi et téléchargement du fichier', async () => {
        const { resource } = await createExpert(admin);
        await admin.post('/api/schedule', {
            [`${resource.id}_available_2029-03-05_AM`]: '2',
            [`${resource.id}_activity_2029-03-05_AM`]: '5',
            [`${resource.id}_localisation_2029-03-05_AM`]: 'SAMU 75',
            [`${resource.id}_available_2029-03-06_PM`]: '1'
        });
        const months = (await admin.get('/api/automation/available-months')).data.months;
        expect(months).toContainEqual({ value: '2029-03', label: 'Mars 2029' });

        const recipient = await createUser(admin);
        const body = {
            recipients: [recipient.id, recipient.id],
            selectedMonths: ['2029-03'],
            allExperts: false,
            expertsList: [resource.id],
            excludeEmpty: true,
            format: 'csv'
        };
        const preview = (await admin.post('/api/automation/preview/2', body)).data;
        expect(preview).toMatchObject({
            success: true,
            recipientsCount: 1,
            emailsCount: 1,
            recipientsList: [`${recipient.prenom} ${recipient.nom} (Individuel)`],
            expertsCount: 1,
            expertsNamesList: [`${resource.prenom} ${resource.nom}`],
            monthsLabel: 'Mars 2029',
            excludeEmpty: true
        });
        expect(preview.filename).toMatch(/^Expert_Planning_Sauvegarde_de_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.csv$/);

        const sent = await admin.post('/api/automation/send/2', body);
        expect(sent.data).toEqual({ success: true, sent: 1, emailsSent: 1, failed: 0 });
        await smtp.waitFor(new RegExp(`To: ${escape(recipient.email)}[\\s\\S]*Sauvegarde`), 15000);
        const log = (await admin.get('/api/automation/logs/2')).data.logs[0];
        expect(log).toMatchObject({ automation_id: 2, target_month: 'Mars 2029', recipients_count: 1 });
        const file = await admin.get(`/api/automation/download/2/${log.id}`);
        expect(file.data.split('\n').filter(Boolean)).toEqual([
            'Expert,Date,Période,Disponibilité,Affectation,Localisation',
            `"${resource.prenom} ${resource.nom}","2029-03-05","AM","Disponible","ANS Déploiement","SAMU 75"`
        ]);
        expect((await admin.post('/api/automation/send/2', { ...body, selectedMonths: [] })).status).toBe(400);
        expect((await admin.post('/api/automation/send/2', { ...body, recipients: [] })).status).toBe(400);
    });
});

describe('diagnostic et nettoyage', () => {
    it('clés au mois sur un chiffre normalisées, mois 0 supprimé', async () => {
        const { resource } = await createExpert(admin);
        await admin.post('/api/schedule', {
            [`${resource.id}_available_2030-4-7_AM`]: '2',
            [`${resource.id}_available_2030-0-1_AM`]: '2'
        });
        const diag = (await admin.get('/api/automation/diagnose-months')).data;
        expect(diag.months.find(m => m.raw === '2030-4-')).toMatchObject({
            label: 'Avril 2030',
            totalRows: 1,
            availableNot1: 1
        });

        const preview = (await admin.post('/api/automation/cleanup-dates-preview')).data;
        expect(preview.toDelete).toContainEqual({
            date_key: '2030-0-1_AM',
            type: 'available',
            value: '2',
            resource_id: resource.id
        });
        expect(preview.toNormalize).toContainEqual({
            oldKey: '2030-4-7_AM',
            newKey: '2030-04-07_AM',
            rowCount: 1,
            hasConflict: false,
            existingCount: 0
        });
        const done = (await admin.post('/api/automation/cleanup-dates-execute')).data;
        expect(done).toMatchObject({ success: true });
        expect(done.deleted).toBeGreaterThanOrEqual(1);
        expect(done.normalized).toBeGreaterThanOrEqual(1);
        const schedule = (await admin.get('/api/schedule')).data;
        expect(schedule[`${resource.id}_available_2030-04-07_AM`]).toBe('2');
        expect(schedule).not.toHaveProperty(`${resource.id}_available_2030-0-1_AM`);
    });
});
