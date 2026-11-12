// CRA : génération PDF et diffusion (nécessite un navigateur Chromium, sinon les tests sont ignorés)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, BROWSER_PATH, startServer } from './helpers/server.js';
import { createExpert, createUser, loginAs } from './helpers/fixtures.js';

describe.skipIf(!BROWSER_PATH)('PDF et diffusion des CRA', () => {
    let server;
    let admin;

    beforeAll(async () => {
        server = await startServer();
        admin = await loginAs(server, ADMIN, 'admin');
    });
    afterAll(() => server?.stop());

    /** CRA doublement visé, avec une ligne d'activité */
    async function visedCra(mois) {
        const { user } = await createExpert(admin);
        const expert = await loginAs(server, user, 'expert');
        const { data } = await expert.get(`/api/cra/find-or-create?user_id=${user.id}&mois=${mois}&annee=2033`);
        const date = `2033-${String(mois).padStart(2, '0')}-10`;
        await expert.post(`/api/cra/${data.id}/astreintes`, {
            lignes: [
                {
                    type: 'hno',
                    date_debut: date,
                    date_fin: date,
                    heure_debut: '20:00',
                    heure_fin: '23:00',
                    objet: 'Intervention'
                }
            ]
        });
        await expert.post(`/api/cra/${data.id}/submit`);
        await admin.post(`/api/cra/${data.id}/visa/n1`);
        await admin.post(`/api/cra/${data.id}/visa/n2`);
        return { user, expert, craId: data.id };
    }
    const isPdf = r =>
        r.status === 200 && r.headers.get('content-type') === 'application/pdf' && String(r.data).startsWith('%PDF');

    it('PDF à la demande : auteur et admin, pas un autre expert', async () => {
        const { expert, craId } = await visedCra(1);
        const other = await createExpert(admin);
        const otherClient = await loginAs(server, other.user, 'expert');
        expect(isPdf(await expert.get(`/api/cra/${craId}/pdf`))).toBe(true);
        expect(isPdf(await admin.get(`/api/cra/${craId}/pdf`))).toBe(true);
        expect((await otherClient.get(`/api/cra/${craId}/pdf`)).status).toBe(403);
    }, 60000);

    it('préparation du PDF puis diffusion à la RH', async () => {
        const { craId } = await visedCra(2);

        // Visé N1 seulement : PDF non disponible
        const notReady = await createExpert(admin);
        const nrClient = await loginAs(server, notReady.user, 'expert');
        const nr = await nrClient.get(`/api/cra/find-or-create?user_id=${notReady.user.id}&mois=3&annee=2033`);
        await nrClient.post(`/api/cra/${nr.data.id}/submit`);
        await admin.post(`/api/cra/${nr.data.id}/visa/n1`);
        expect((await admin.post(`/api/cra/${nr.data.id}/prepare-pdf`)).status).toBe(400);

        const prepared = await admin.post(`/api/cra/${craId}/prepare-pdf`);
        expect(prepared.status).toBe(200);
        const { pdfFilename } = prepared.data;
        expect(pdfFilename).toMatch(/^SI-SAMU_CRA_.*\.pdf$/);
        expect(isPdf(await admin.get(`/api/cra/pdf-saved/${pdfFilename}`))).toBe(true);

        expect((await admin.post(`/api/cra/${craId}/diffuser`, { recipients: {} })).status).toBe(400);
        const sent = await admin.post(`/api/cra/${craId}/diffuser`, {
            pdfFilename,
            recipients: { rh_es: [{ email: 'rh@es.test', nom: 'RH' }], drh_ans: [], expert: [] }
        });
        expect(sent.data).toEqual({ success: true, sent: 1 });
        expect((await admin.get(`/api/cra/${craId}`)).data).toMatchObject({
            statut: 'diffuse',
            pdf_filename: pdfFilename
        });
        expect(
            (await admin.get(`/api/cra/${craId}/diffusion-log`)).data.map(d => [d.recipient_email, d.recipient_type])
        ).toEqual([['rh@es.test', 'rh_es']]);

        const rhUser = await createUser(admin, { is_rh: 1 });
        const rh = await loginAs(server, rhUser, 'rh');
        expect((await rh.get('/api/cra/my-list')).data.map(c => c.id)).toContain(craId);
    }, 90000);
});
