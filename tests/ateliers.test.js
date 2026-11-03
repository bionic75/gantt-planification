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

    it('cas de référence du classeur : zone B, MEP 15/11/2026, 7 ateliers (vacances d’été 2026 saisies dans l’application ignorées)', async () => {
        const holidays = {
            zoneA: [],
            zoneB: [{ name: 'Vacances d’été 2026', start: '2026-07-04', end: '2026-09-01' }],
            zoneC: []
        };
        expect((await admin.post('/api/school-holidays', { holidays })).status).toBe(200);
        const r = await sim(admin, { mep: '2026-11-15', nb: 7, zone: 'B' });
        expect(dates(r.data.rows)).toEqual({
            visite: ['2026-07-17', '2026-07-17'],
            a1: ['2026-07-31', '2026-07-31'],
            a2: ['2026-08-07', '2026-08-07'],
            a3: ['2026-08-21', '2026-08-21'],
            a4: ['2026-09-04', '2026-09-04'],
            a5: ['2026-09-18', '2026-09-18'],
            a6: ['2026-10-02', '2026-10-02'],
            a7: ['2026-10-18', '2026-10-16'],
            livrables: ['2026-10-16', '2026-10-16'],
            mep: ['2026-11-15', '2026-11-15']
        });
        expect(r.data.rows.find(x => x.key === 'a7').statut).toBe('Décalé hors vacances / week-end');
    });

    it('vacances saisies dans l’application : prises en compte après la période du classeur (après août 2028)', async () => {
        const holidays = {
            zoneA: [],
            zoneB: [{ name: 'Hiver 2029', start: '2029-02-10', end: '2029-02-25' }],
            zoneC: []
        };
        await admin.post('/api/school-holidays', { holidays });
        const at = async zone =>
            (await sim(admin, { mep: '2029-03-30', nb: 3, zone })).data.rows.find(x => x.key === 'a3');
        // cible : MEP − 28 jours = 2029-03-02
        expect(await at('A')).toMatchObject({ cible: '2029-03-02', proposee: '2029-03-02' });
        expect(await at('B')).toMatchObject({ cible: '2029-03-02', proposee: '2029-03-02' });
        const winter = (await sim(admin, { mep: '2029-03-16', nb: 3, zone: 'B' })).data.rows.find(x => x.key === 'a3');
        expect(winter).toMatchObject({ cible: '2029-02-16', proposee: '2029-02-09' });
        await admin.post('/api/school-holidays', { holidays: { zoneA: [], zoneB: [], zoneC: [] } });
    });

    it('écarts paramétrables : atelier 1 → 2 (7 j par défaut) et ateliers suivants (14 j par défaut)', async () => {
        const gap = (rows, a, b) =>
            Math.round(
                (Date.parse(rows.find(r => r.key === b).cible) - Date.parse(rows.find(r => r.key === a).cible)) /
                    86400000
            );
        const base = (await sim(admin, { mep: '2027-09-14', nb: 5, zone: 'A' })).data.rows;
        expect(gap(base, 'a1', 'a2')).toBe(7);
        expect(gap(base, 'a2', 'a3')).toBe(14);
        const custom = (await sim(admin, { mep: '2027-09-14', nb: 5, zone: 'A', ecart12: 14, ecartAteliers: 21 })).data
            .rows;
        expect(gap(custom, 'a1', 'a2')).toBe(14);
        expect(gap(custom, 'a2', 'a3')).toBe(21);
        expect((await sim(admin, { mep: '2027-09-14', nb: 5, zone: 'A', ecart12: -1 })).status).toBe(400);
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
        expect(bad.status, JSON.stringify(bad.data)).toBe(400);
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

describe('sondages de date des jalons', () => {
    it('conception, envoi (copie, adresse unique), réponses publiques et statuts', async () => {
        await deployment('SAMU-SAS 77');
        const created = await admin.put('/api/affectation/ateliers', {
            samu_name: 'SAMU-SAS 77',
            mep: '2027-06-10',
            nb: 3,
            zone: 'C'
        });
        expect(created.status, JSON.stringify(created.data)).toBe(200);
        const id = created.data.id;
        const cc = await createUser(admin, { is_user: 1 });
        const base = `/api/affectation/ateliers/${id}/sondages/a1`;
        expect((await admin.get(base)).data.sondage).toBeNull();
        // Pas d'envoi sans date ni destinataire
        expect((await admin.post(`${base}/send`, {})).status).toBe(404);
        const bad = await admin.put(base, { nom: 'x', options: [{ date: '2027-13-45' }] });
        expect(bad.status, JSON.stringify(bad.data)).toBe(400);

        const saved = await admin.put(base, {
            nom: '[SI-SAMU] SAMU-SAS 77 - Sondage - Atelier 1',
            options: [
                { date: '2027-04-12', heure: '09:00', heure_fin: '12:00' },
                { date: '2027-04-13', heure: '14:00' }
            ],
            destinataires: ['direct@example.test', 'direct@example.test'],
            cc_user_ids: [cc.id],
            message: 'Merci de répondre'
        });
        expect(saved.status, JSON.stringify(saved.data)).toBe(200);
        const sd = saved.data.sondage;
        expect(sd).toMatchObject({ statut: 'brouillon', destinataires: ['direct@example.test'] });
        expect(sd.url).toMatch(/\/sondage\/[a-f0-9]{32}$/);
        expect(sd.options).toHaveLength(2);

        const sent = await admin.post(`${base}/send`, {});
        expect(sent.status, JSON.stringify(sent.data)).toBe(200);
        expect(sent.data).toMatchObject({ sent: 1, cc: 1 });
        const mail = await smtp.waitFor(/Subject: \[SI-SAMU\] SAMU-SAS 77 - Sondage - Atelier 1/, 15000);
        expect(mail).toContain(sd.url);
        expect(mail).toContain(cc.email);
        const statuts = () => admin.get('/api/affectation/ateliers-sondages').then(r => r.data.sondages);
        expect((await statuts()).find(x => x.ligne === 'a1')).toMatchObject({ statut: 'envoye', reponses: 0 });

        // Accès public : sans connexion, ni adresses e-mail ni identifiants d'utilisateurs
        const token = sd.url.split('/').pop();
        const anon = server.client();
        const pub = await anon.get(`/api/sondages-publics/${token}`);
        expect(pub.status).toBe(200);
        expect(pub.data.options).toHaveLength(2);
        expect(JSON.stringify(pub.data)).not.toContain('direct@example.test');
        expect((await anon.get('/api/sondages-publics/' + 'f'.repeat(32))).status).toBe(404);
        const page = await anon.get(`/sondage/${token}`);
        expect(page.status).toBe(200);

        const [o1, o2] = pub.data.options;
        expect((await anon.post(`/api/sondages-publics/${token}/reponses`, { nom: '', options: [o1.id] })).status).toBe(
            400
        );
        expect(
            (await anon.post(`/api/sondages-publics/${token}/reponses`, { nom: 'Alice', options: [999999] })).status
        ).toBe(400);
        expect(
            (await anon.post(`/api/sondages-publics/${token}/reponses`, { nom: 'Alice', options: [o1.id] })).status
        ).toBe(200);
        expect((await statuts()).find(x => x.ligne === 'a1')).toMatchObject({ statut: 'reponses', reponses: 1 });
        // Même nom : réponse remplacée
        const again = await anon.post(`/api/sondages-publics/${token}/reponses`, {
            nom: 'alice',
            options: [o1.id, o2.id]
        });
        expect(again.data.replaced).toBe(true);
        expect((await admin.get(base)).data.sondage.reponses).toEqual([
            { id: expect.any(Number), nom: 'alice', options: [o1.id, o2.id] }
        ]);

        // Date supprimée : retirée aussi des réponses
        const upd = await admin.put(base, {
            nom: sd.nom,
            options: [sd.options[0]],
            destinataires: ['direct@example.test']
        });
        expect(upd.data.sondage.reponses[0].options).toEqual([o1.id]);

        // Droits : seuls les administrateurs conçoivent
        const user = await loginAs(server, await createUser(admin, { is_user: 1 }), 'user');
        expect((await user.put(base, { nom: 'x', options: [] })).status).toBe(403);

        expect((await admin.delete(base)).status).toBe(200);
        expect((await anon.get(`/api/sondages-publics/${token}`)).status).toBe(404);
    });
});
