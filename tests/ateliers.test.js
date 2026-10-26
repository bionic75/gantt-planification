// Planification des ateliers métier : rétroplanning automatisé (calcul identique au classeur Excel de référence),
// paramétrage depuis les déploiements, enregistrement par SAMU, diffusion par e-mail
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, startServer } from './helpers/server.js';
import { createUser, loginAs } from './helpers/fixtures.js';
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

const dates = rows => Object.fromEntries(rows.map(r => [r.key, [r.cible, r.proposee]]));
const sim = (client, body) => client.post('/api/affectation/ateliers/simulate', body);

async function deployment(name, extra = {}) {
    const r = await admin.post('/api/affectation/projects', { samu_name: name, date_debut: '2026-01-05', ...extra });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data;
}

describe('calcul des dates (cas calculés avec les formules du classeur Excel)', () => {
    it('zone B, 4 ateliers : l’atelier 4 est reculé avant les vacances d’été', async () => {
        const r = await sim(admin, { mep: '2027-09-28', nb: 4, zone: 'B' });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(dates(r.data.rows)).toEqual({
            visite: ['2027-05-14', '2027-05-14'],
            a1: ['2027-05-28', '2027-05-28'],
            a2: ['2027-06-04', '2027-06-04'],
            a3: ['2027-06-18', '2027-06-18'],
            a4: ['2027-08-31', '2027-07-02'],
            livrables: ['2027-07-02', '2027-07-02'],
            mep: ['2027-09-28', '2027-09-28']
        });
        expect(r.data.rows.find(x => x.key === 'a4').statut).toBe('Décalé hors vacances / week-end');
        expect(r.data.rows.find(x => x.key === 'a3').statut).toBe('Date cible');
        expect(r.data.rows.map(x => x.ordre)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('zone A, 7 ateliers : atelier 4 reculé avant les vacances de la Toussaint', async () => {
        const r = await sim(admin, { mep: '2026-12-31', nb: 7, zone: 'A' });
        expect(dates(r.data.rows)).toEqual({
            visite: ['2026-08-28', '2026-08-28'],
            a1: ['2026-09-11', '2026-09-11'],
            a2: ['2026-09-18', '2026-09-18'],
            a3: ['2026-10-02', '2026-10-02'],
            a4: ['2026-10-22', '2026-10-16'],
            a5: ['2026-11-05', '2026-11-05'],
            a6: ['2026-11-19', '2026-11-19'],
            a7: ['2026-12-03', '2026-12-03'],
            livrables: ['2026-12-03', '2026-12-03'],
            mep: ['2026-12-31', '2026-12-31']
        });
    });

    it('zone C : atelier 2 et atelier 6 reculés avant les vacances de Toussaint et de Noël', async () => {
        const c = await sim(admin, { mep: '2027-02-08', nb: 7, zone: 'C' });
        expect(c.data.rows.find(x => x.key === 'a6')).toMatchObject({ cible: '2026-12-28', proposee: '2026-12-18' });
        expect(c.data.rows.find(x => x.key === 'a2')).toMatchObject({ cible: '2026-10-23', proposee: '2026-10-16' });
    });

    it('la même MEP donne des dates différentes selon les vacances d’hiver de la zone', async () => {
        const at = async zone =>
            (await sim(admin, { mep: '2027-04-01', nb: 3, zone })).data.rows.find(x => x.key === 'a3');
        expect(await at('B')).toMatchObject({ cible: '2027-03-04', proposee: '2027-02-19' });
        expect(await at('A')).toMatchObject({ cible: '2027-03-04', proposee: '2027-03-04' });
        expect(await at('C')).toMatchObject({ cible: '2027-03-04', proposee: '2027-03-04' });
    });

    it('délais paramétrables : visite / atelier 1 et marge avant la MEP', async () => {
        const base = (await sim(admin, { mep: '2027-03-15', nb: 3, zone: 'B' })).data.rows;
        const custom = (await sim(admin, { mep: '2027-03-15', nb: 3, zone: 'B', delaiVisite: 21, delaiMep: 35 })).data
            .rows;
        const day = (rows, k) => rows.find(r => r.key === k).cible;
        const diff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
        expect(diff('2027-03-15', day(base, 'a3'))).toBe(28);
        expect(diff('2027-03-15', day(custom, 'a3'))).toBe(35);
        expect(diff(base.find(r => r.key === 'a1').proposee, base.find(r => r.key === 'visite').cible)).toBe(14);
        expect(diff(custom.find(r => r.key === 'a1').proposee, custom.find(r => r.key === 'visite').cible)).toBe(21);
    });

    it('la visite métier est une date théorique calculée (jamais reprise du déploiement)', async () => {
        const r = await sim(admin, { mep: '2027-03-15', nb: 3, zone: 'B', visiteDate: '2027-01-04' });
        expect(r.status).toBe(200);
        const visite = r.data.rows.find(x => x.key === 'visite');
        const a1 = r.data.rows.find(x => x.key === 'a1');
        expect(['Date cible', 'Décalé hors vacances / week-end']).toContain(visite.statut);
        expect(visite.cible).not.toBe('2027-01-04');
        expect(Math.round((Date.parse(a1.proposee) - Date.parse(visite.cible)) / 86400000)).toBe(14);
        expect(r.data.warnings.join(' ')).not.toMatch(/trop proche/);
    });

    it('dates réellement planifiées, jalons et contenus choisis : statut et écart', async () => {
        const r = await sim(admin, {
            mep: '2027-03-15',
            nb: 3,
            zone: 'B',
            lignes: {
                planifiees: { a1: '2027-01-20', mep: '2027-03-15' },
                jalons: { a2: 'Atelier 5' },
                contenus: { a2: 'Guides vocaux' }
            }
        });
        const a1 = r.data.rows.find(x => x.key === 'a1');
        expect(a1.planifiee).toBe('2027-01-20');
        expect(a1.statut).toMatch(/^Planifié/);
        expect(r.data.rows.find(x => x.key === 'mep').statut).toBe('MEP planifiée (conforme)');
        expect(r.data.rows.find(x => x.key === 'a2')).toMatchObject({ jalon: 'Atelier 5', contenu: 'Guides vocaux' });
    });

    it('paramètres invalides refusés', async () => {
        for (const body of [
            { mep: '2027-03-15', nb: 2, zone: 'B' },
            { mep: '2027-03-15', nb: 8, zone: 'B' },
            { mep: '2027-03-15', nb: 4, zone: 'D' },
            { mep: '2027-02-30', nb: 4, zone: 'B' },
            { mep: '2027-03-15', nb: 4, zone: 'B', delaiMep: -1 }
        ]) {
            expect((await sim(admin, body)).status, JSON.stringify(body)).toBe(400);
        }
    });
});

describe('paramétrage depuis les déploiements', () => {
    it('SAMU des déploiements, zone selon le département, MEP reprise', async () => {
        await deployment('SAMU-SAS 56', {
            date_mise_en_production: '2027-05-20',
            periods: { visite_metier: [{ start: '2027-03-02', end: '2027-03-02', needed: 1 }] }
        });
        await deployment('SAMU-SAS 75');
        await deployment('SAMU-SAS 06');
        await deployment('SAMU-SAS 69');
        await deployment('SAMU 2A');
        const m = (await admin.get('/api/affectation/ateliers/meta')).data;
        const by = n => m.samus.find(s => s.samu_name === n);
        expect(by('SAMU-SAS 56')).toMatchObject({
            zone: 'B',
            mep: '2027-05-20',
            saved: false
        });
        expect(by('SAMU-SAS 75').zone).toBe('C');
        expect(by('SAMU-SAS 06').zone).toBe('B');
        expect(by('SAMU-SAS 69').zone).toBe('A');
        expect(by('SAMU 2A').zone).toBe('B');
        expect(m.contenus).toHaveLength(7);
        expect(m.defaults).toMatchObject({ delaiVisite: 14, delaiMep: 28 });
        expect(m.limites).toEqual({ min: 3, max: 7 });
    });
});

describe('rétroplannings enregistrés', () => {
    it('création, mise à jour (un par SAMU), liste avec jalons, suppression', async () => {
        const body = {
            samu_name: 'SAMU-SAS 56',
            mep: '2027-05-20',
            nb: 4,
            zone: 'B',

            lignes: { planifiees: { a1: '2027-03-30' } }
        };
        const created = await admin.put('/api/affectation/ateliers', body);
        expect(created.status, JSON.stringify(created.data)).toBe(200);
        expect(created.data).toMatchObject({ created: true, samu_name: 'SAMU-SAS 56' });
        const again = await admin.put('/api/affectation/ateliers', { ...body, nb: 5, zone: 'A' });
        expect(again.data).toMatchObject({ created: false, id: created.data.id });

        const list = (await admin.get('/api/affectation/ateliers')).data.retroplannings;
        const row = list.find(r => r.samu_name === 'SAMU-SAS 56');
        expect(list.filter(r => r.samu_name === 'SAMU-SAS 56')).toHaveLength(1);
        expect(row).toMatchObject({ nb_ateliers: 5, zone: 'A', mep_date: '2027-05-20' });
        expect(row.jalons).toHaveLength(8);
        expect(row.jalons.find(j => j.key === 'a1').planifiee).toBe('2027-03-30');
        expect(
            (await admin.get('/api/affectation/ateliers/meta')).data.samus.find(s => s.samu_name === 'SAMU-SAS 56')
                .saved
        ).toBe(true);

        expect((await admin.delete(`/api/affectation/ateliers/${created.data.id}`)).status).toBe(200);
        expect((await admin.delete(`/api/affectation/ateliers/${created.data.id}`)).status).toBe(404);
        expect(
            (await admin.get('/api/affectation/ateliers')).data.retroplannings.some(r => r.samu_name === 'SAMU-SAS 56')
        ).toBe(false);
    });

    it('SAMU hors déploiements ou paramètres invalides refusés ; modifications réservées aux administrateurs', async () => {
        expect(
            (
                await admin.put('/api/affectation/ateliers', {
                    samu_name: 'SAMU-SAS 99',
                    mep: '2027-05-20',
                    nb: 4,
                    zone: 'B'
                })
            ).status
        ).toBe(400);
        expect((await admin.put('/api/affectation/ateliers', { mep: '2027-05-20', nb: 4, zone: 'B' })).status).toBe(
            400
        );
        expect(
            (
                await admin.put('/api/affectation/ateliers', {
                    samu_name: 'SAMU-SAS 75',
                    mep: '2027-05-20',
                    nb: 9,
                    zone: 'B'
                })
            ).status
        ).toBe(400);
        const user = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        for (const r of [
            await user.put('/api/affectation/ateliers', {
                samu_name: 'SAMU-SAS 75',
                mep: '2027-05-20',
                nb: 4,
                zone: 'C'
            }),
            await user.delete('/api/affectation/ateliers/1'),
            await user.post('/api/affectation/ateliers/1/send', { emails: ['a@b.fr'] })
        ]) {
            expect(r.status).toBe(403); // pas d'accès à l'application d'aide à l'affectation sans droit
        }
    });
});

describe('diffusion par e-mail', () => {
    it('tableau et calendrier .ics envoyés ; adresses invalides et destinataires manquants refusés', async () => {
        const created = await admin.put('/api/affectation/ateliers', {
            samu_name: 'SAMU-SAS 75',
            mep: '2027-06-10',
            nb: 3,
            zone: 'C'
        });
        const id = created.data.id;
        const recipient = await createUser(admin, { is_user: 1 });
        expect((await admin.post(`/api/affectation/ateliers/${id}/send`, {})).status).toBe(400);
        const bad = await admin.post(`/api/affectation/ateliers/${id}/send`, { emails: ['pas-une-adresse'] });
        expect(bad.status).toBe(400);
        expect(bad.data.error).toMatch(/invalide/);

        const r = await admin.post(`/api/affectation/ateliers/${id}/send`, {
            userIds: [recipient.id],
            emails: ['direct@example.test', recipient.email],
            subject: 'Calendrier ateliers SAMU 75',
            message: 'Bonjour à tous'
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(r.data.sent).toBe(2);
        const mail = await smtp.waitFor(/Subject: Calendrier ateliers SAMU 75/, 15000);
        expect(mail).toContain(recipient.email);
        expect(mail).toContain('direct@example.test');
        expect(mail).toMatch(/text\/calendar/);
        expect(mail).toMatch(/\.ics/);
        const list = (await admin.get('/api/affectation/ateliers')).data.retroplannings;
        expect(list.find(x => x.id === id).last_sent_at).toBeTruthy();
    });
});
