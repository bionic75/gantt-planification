// @ts-check
// Comptes rendus d'activité : lancement, saisie, soumission, visas, refus, diffusion, archivage, collecte (MAD)
import { expect } from '@playwright/test';
import { config } from '../support/config.js';
import { adminApi, cle, lireRessource, nettoyerMoisExpert, ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const pad = (/** @type {number | string} */ n) => String(n).padStart(2, '0');

/** Suppression définitive d'un CRA de test (archivage, corbeille puis purge) */
async function nettoyerCra(/** @type {Monde} */ monde, /** @type {number} */ id) {
    const api = await adminApi(monde);
    await api.post(`/api/cra/${id}/archive`, {});
    await api.post(`/api/cra/${id}/soft-delete`, {});
    await api.delete(`/api/cra/${id}/purge`);
}

const crasDuMois = async (/** @type {Monde} */ monde, /** @type {number} */ mois, /** @type {number} */ annee) => {
    const { userId } = await ressourceExpert(monde);
    return (await adminApi(monde)).ok('GET', `/api/cra/admin/list?user_id=${userId}&mois=${mois}&annee=${annee}`);
};

/** Mois sans CRA pour l'expert de test (année 2090 et suivantes) ; ses CRA sont purgés en fin de scénario */
async function moisInedit(/** @type {Monde} */ monde) {
    for (let essai = 0; essai < 20; essai++) {
        const annee = 2090 + Math.floor(Math.random() * 100);
        const mois = 1 + Math.floor(Math.random() * 12);
        if ((await crasDuMois(monde, mois, annee)).length === 0) {
            monde.aNettoyer(`CRA ${mois}/${annee}`, async () => {
                for (const c of await crasDuMois(monde, mois, annee)) await nettoyerCra(monde, c.id);
            });
            return { mois, annee };
        }
    }
    throw new Error('Aucun mois libre trouvé pour un CRA de test');
}

const expertApi = (/** @type {Monde} */ monde) => monde.apiDe('Expert');

/** CRA du mois de l'expert (créé s'il n'existe pas) */
async function craDuMois(/** @type {Monde} */ monde, periode = monde.d.mois) {
    const { userId } = await ressourceExpert(monde);
    const r = await (
        await expertApi(monde)
    ).ok('GET', `/api/cra/find-or-create?user_id=${userId}&mois=${periode.mois}&annee=${periode.annee}`);
    return /** @type {number} */ (r.id);
}

const idCra = async (/** @type {Monde} */ monde) => (monde.d.craId ||= await craDuMois(monde));
const lireCra = async (/** @type {Monde} */ monde) =>
    (await adminApi(monde)).ok('GET', `/api/cra/${await idCra(monde)}`);

async function appelAdmin(/** @type {Monde} */ monde, /** @type {string} */ action, body = {}) {
    monde.reponse = await (await adminApi(monde)).post(`/api/cra/${await idCra(monde)}/${action}`, body);
    return monde.reponse;
}

async function appelExpert(/** @type {Monde} */ monde, /** @type {string} */ action, body = {}) {
    monde.reponse = await (await expertApi(monde)).post(`/api/cra/${await idCra(monde)}/${action}`, body);
    return monde.reponse;
}

const reussi = (/** @type {Monde} */ monde) =>
    expect(monde.reponse?.status, JSON.stringify(monde.reponse?.data)).toBe(200);

// ---------- Contexte ----------

Given("l'expert de test participe au dispositif Astreintes\\/HNO", async ({ monde }) => {
    const { resourceId } = await ressourceExpert(monde);
    const ressource = await lireRessource(monde, resourceId);
    if (ressource.astreinte_volontaire !== 1) {
        const api = await adminApi(monde);
        await api.ok('POST', `/api/resources/${resourceId}/astreinte`, { hasAccess: true });
        monde.aNettoyer("volontariat astreintes de l'expert", () =>
            api.post(`/api/resources/${resourceId}/astreinte`, { hasAccess: false })
        );
    }
});

Given('un mois de CRA inédit est choisi pour le scénario', async ({ monde }) => {
    monde.d.mois = await moisInedit(monde);
});

// ---------- Lancement ----------

When(/^l'administrateur lance (?:de nouveau )?le CRA du mois pour l'expert de test$/, async ({ monde }) => {
    const { userId } = await ressourceExpert(monde);
    monde.reponse = await (await adminApi(monde)).post('/api/cra/launch', { user_id: userId, ...monde.d.mois });
});

Then("l'expert de test a un CRA « à compléter » pour le mois", async ({ monde }) => {
    const cras = await crasDuMois(monde, monde.d.mois.mois, monde.d.mois.annee);
    expect(cras.map((/** @type {any} */ c) => c.statut)).toEqual(['a_completer']);
});

Then("l'expert de test n'a qu'un seul CRA pour le mois", async ({ monde }) => {
    expect(await crasDuMois(monde, monde.d.mois.mois, monde.d.mois.annee)).toHaveLength(1);
});

// ---------- États préalables ----------

Given("l'expert de test a un CRA à compléter pour le mois", async ({ monde }) => {
    monde.d.craId = await craDuMois(monde);
});

Given("l'expert de test a un CRA soumis pour le mois", async ({ monde }) => {
    monde.d.craId = await craDuMois(monde);
    await appelExpert(monde, 'submit');
    reussi(monde);
});

Given("l'expert de test a un CRA visé N2 pour le mois", async ({ monde }) => {
    monde.d.craId = await craDuMois(monde);
    await appelExpert(monde, 'submit');
    reussi(monde);
    for (const niveau of ['n1', 'n2']) {
        await appelAdmin(monde, `visa/${niveau}`);
        reussi(monde);
    }
});

Given("le CRA est visé jusqu'au niveau précédant {word}", async ({ monde }, niveau) => {
    if (niveau.toUpperCase() === 'N2') {
        await appelAdmin(monde, 'visa/n1');
        reussi(monde);
    }
});

// ---------- Saisie ----------

When("l'expert saisit les lignes suivantes dans son CRA :", async ({ monde }, table) => {
    const { mois, annee } = monde.d.mois;
    const lignes = table.hashes().map((/** @type {any} */ l) => {
        const debut = `${annee}-${pad(mois)}-${pad(l.jour)}`;
        // Créneau de nuit (fin avant le début) : se termine le lendemain
        const lendemain = new Date(`${debut}T12:00:00Z`);
        lendemain.setUTCDate(lendemain.getUTCDate() + 1);
        return {
            type: l.type,
            date_debut: debut,
            date_fin: l.fin <= l['début'] ? lendemain.toISOString().slice(0, 10) : debut,
            heure_debut: l['début'],
            heure_fin: l.fin,
            samu: 'SAMU 75',
            objet: l.objet
        };
    });
    await appelExpert(monde, 'astreintes', { lignes });
    reussi(monde);
});

When("l'expert soumet son CRA", async ({ monde }) => {
    await appelExpert(monde, 'submit', { commentaire: 'Soumis par les tests E2E' });
    reussi(monde);
});

When("l'expert tente de modifier les lignes de son CRA soumis", async ({ monde }) => {
    await appelExpert(monde, 'astreintes', { lignes: [] });
});

When("l'expert déclare « rien à déclarer »", async ({ monde }) => {
    await appelExpert(monde, 'rien-a-declarer');
    reussi(monde);
});

When("l'expert rappelle son CRA", async ({ monde }) => {
    await appelExpert(monde, 'recall');
    reussi(monde);
});

Then('le CRA est au statut {string}', async ({ monde }, statut) => {
    expect((await lireCra(monde)).statut).toBe(statut);
});

Then('le CRA porte la signature de rang 1', async ({ monde }) => {
    expect((await lireCra(monde)).signatures.map((/** @type {any} */ s) => s.rang)).toContain(1);
});

Then('le CRA ne porte plus aucune signature', async ({ monde }) => {
    expect((await lireCra(monde)).signatures).toEqual([]);
});

Then('le CRA contient {int} ligne(s)', async ({ monde }, n) => {
    expect((await lireCra(monde)).astreintes_hno).toHaveLength(n);
});

Then('le CRA est marqué « rien à déclarer »', async ({ monde }) => {
    expect((await lireCra(monde)).rien_a_declarer).toBe(1);
});

// ---------- Visas, refus ----------

When("l'administrateur tente de viser le CRA en {word}", async ({ monde }, niveau) => {
    await appelAdmin(monde, `visa/${niveau.toLowerCase()}`);
});

When("l'administrateur vise le CRA en {word}", async ({ monde }, niveau) => {
    await appelAdmin(monde, `visa/${niveau.toLowerCase()}`);
    reussi(monde);
});

When("l'administrateur refuse le CRA en {word} sans motif", async ({ monde }, niveau) => {
    await appelAdmin(monde, `refuser/${niveau.toLowerCase()}`, { commentaire: ' ' });
});

When("l'administrateur refuse le CRA en {word} avec le motif {string}", async ({ monde }, niveau, motif) => {
    await appelAdmin(monde, `refuser/${niveau.toLowerCase()}`, { commentaire: motif });
    reussi(monde);
});

Then('le CRA porte le commentaire de refus {string}', async ({ monde }, motif) => {
    expect((await lireCra(monde)).commentaire_refus).toBe(motif);
});

Then('chaque visa est horodaté avec le nom du signataire', async ({ monde }) => {
    const signatures = (await lireCra(monde)).signatures;
    expect(signatures.map((/** @type {any} */ s) => s.rang).sort()).toEqual([1, 2, 3]);
    for (const s of signatures) {
        const champs = Object.entries(s);
        expect(
            champs.some(([k, v]) => /(_at|date)/i.test(k) && v),
            JSON.stringify(s)
        ).toBe(true);
        expect(
            champs.some(([k, v]) => /(nom|name|signataire)/i.test(k) && v),
            JSON.stringify(s)
        ).toBe(true);
    }
});

Then("l'historique des signatures comporte les rangs 1, 2 et 3", async ({ monde }) => {
    expect((await lireCra(monde)).signatures.map((/** @type {any} */ s) => s.rang).sort()).toEqual([1, 2, 3]);
});

// ---------- Diffusion ----------

When("l'administrateur tente de diffuser le CRA", async ({ monde }) => {
    await appelAdmin(monde, 'diffuser', {});
});

async function diffuser(
    /** @type {Monde} */ monde,
    /** @type {import('playwright-bdd').BddTestFixtures['$test']} */ $test
) {
    $test.skip(!config.smtpTest, 'Diffusion des CRA : SMTP de test non confirmé (E2E_SMTP_TEST)');
    const api = await adminApi(monde);
    const id = await idCra(monde);
    const pdf = await api.post(`/api/cra/${id}/prepare-pdf`, {});
    $test.skip(pdf.status === 503, 'Chromium indisponible sur le serveur : PDF du CRA non généré');
    expect(pdf.status, JSON.stringify(pdf.data)).toBe(200);
    const recipients = await api.ok('GET', `/api/cra/${id}/diffusion-recipients`);
    monde.reponse = await api.post(`/api/cra/${id}/diffuser`, { recipients, pdfFilename: pdf.data.pdfFilename });
    reussi(monde);
}

When("l'administrateur diffuse le CRA", async ({ monde, $test }) => {
    await diffuser(monde, $test);
});

Given("la ressource de l'expert de test a pour contact RH la boîte partagée", async ({ monde, $test }) => {
    $test.skip(!config.mail.sharedAddress, 'E2E_SHARED_MAILBOX non renseignée');
    const { resourceId } = await ressourceExpert(monde);
    const api = await adminApi(monde);
    const ressource = await lireRessource(monde, resourceId);
    await api.ok('PUT', `/api/resources/${resourceId}`, { ...ressource, contacts_rh: config.mail.sharedAddress });
    monde.aNettoyer("contacts RH de l'expert", async () =>
        api.put(`/api/resources/${resourceId}`, {
            ...(await lireRessource(monde, resourceId)),
            contacts_rh: ressource.contacts_rh || ''
        })
    );
});

When("l'administrateur consulte les destinataires de diffusion du CRA", async ({ monde }) => {
    monde.d.destinataires = await (
        await adminApi(monde)
    ).ok('GET', `/api/cra/${await idCra(monde)}/diffusion-recipients`);
});

Then("les destinataires proposés comprennent l'expert et le contact RH", async ({ monde }) => {
    expect(monde.d.destinataires.expert).toHaveLength(1);
    expect(monde.d.destinataires.rh_es.map((/** @type {any} */ r) => r.email)).toContain(config.mail.sharedAddress);
});

When("l'administrateur ouvre le statut de diffusion du CRA", async ({ monde }) => {
    monde.d.journal = await (await adminApi(monde)).ok('GET', `/api/cra/${await idCra(monde)}/diffusion-log`);
});

Then("le journal de diffusion liste le contact RH et l'expert", async ({ monde }) => {
    const journal = JSON.stringify(monde.d.journal).toLowerCase();
    expect(journal).toContain(config.mail.sharedAddress.toLowerCase());
    expect(journal).toContain('expert');
});

// ---------- Listes et filtres ----------

When("l'administrateur liste les CRA au statut {string}", async ({ monde }, statut) => {
    const { userId } = await ressourceExpert(monde);
    monde.d.liste = await (await adminApi(monde)).ok('GET', `/api/cra/admin/list?user_id=${userId}&statut=${statut}`);
});

const idsListe = async (/** @type {Monde} */ monde) => monde.d.liste.map((/** @type {any} */ c) => c.id);

Then("le CRA du mois n'y figure pas", async ({ monde }) => {
    expect(await idsListe(monde)).not.toContain(await idCra(monde));
});

Then('le CRA du mois y figure', async ({ monde }) => {
    expect(await idsListe(monde)).toContain(await idCra(monde));
});

Then('la liste des CRA indique {int} ligne(s) pour le CRA du mois', async ({ monde }, n) => {
    const [c] = await crasDuMois(monde, monde.d.mois.mois, monde.d.mois.annee);
    expect(c.nb_lignes).toBe(n);
});

When("l'expert déclare « rien à déclarer » sur un autre mois", async ({ monde }) => {
    const { mois, annee } = monde.d.mois;
    monde.d.autreMois = { mois: mois === 12 ? 1 : mois + 1, annee: mois === 12 ? annee + 1 : annee };
    monde.aNettoyer("CRA de l'autre mois", async () => {
        for (const c of await crasDuMois(monde, monde.d.autreMois.mois, monde.d.autreMois.annee))
            await nettoyerCra(monde, c.id);
    });
    const id = await craDuMois(monde, monde.d.autreMois);
    const r = await (await expertApi(monde)).post(`/api/cra/${id}/rien-a-declarer`, {});
    expect(r.status, JSON.stringify(r.data)).toBe(200);
});

Then('la liste des CRA indique {int} ligne(s) pour le CRA de cet autre mois', async ({ monde }, n) => {
    const [c] = await crasDuMois(monde, monde.d.autreMois.mois, monde.d.autreMois.annee);
    expect(c.nb_lignes).toBe(n);
});

When("l'administrateur filtre la liste des CRA sur l'expert de test, le mois et l'année", async ({ monde }) => {
    monde.d.liste = await crasDuMois(monde, monde.d.mois.mois, monde.d.mois.annee);
});

When(
    "l'administrateur filtre la liste des CRA sur l'expert de test et le statut {string}",
    async ({ monde }, statut) => {
        const { userId } = await ressourceExpert(monde);
        monde.d.liste = await (
            await adminApi(monde)
        ).ok('GET', `/api/cra/admin/list?user_id=${userId}&statut=${statut}`);
    }
);

When("l'administrateur liste tous les CRA sans filtre", async ({ monde }) => {
    monde.d.liste = await (await adminApi(monde)).ok('GET', '/api/cra/admin/list');
});

Then('la liste filtrée contient uniquement le CRA du mois', async ({ monde }) => {
    expect(await idsListe(monde)).toEqual([await idCra(monde)]);
});

Then('la liste filtrée ne contient pas le CRA du mois', async ({ monde }) => {
    expect(await idsListe(monde)).not.toContain(await idCra(monde));
});

Then('la liste contient le CRA du mois', async ({ monde }) => {
    expect(await idsListe(monde)).toContain(await idCra(monde));
});

// ---------- Corrections par l'administrateur ----------

When("l'administrateur reprend le CRA pour correction", async ({ monde }) => {
    await appelAdmin(monde, 'admin-correction');
    reussi(monde);
});

When("l'administrateur corrige les lignes du CRA", async ({ monde }) => {
    const { mois, annee } = monde.d.mois;
    const date = `${annee}-${pad(mois)}-15`;
    await appelAdmin(monde, 'astreintes', {
        lignes: [
            {
                type: 'hno',
                date_debut: date,
                date_fin: date,
                heure_debut: '20:00',
                heure_fin: '21:30',
                samu: 'SAMU 75',
                objet: 'Correction admin E2E'
            }
        ]
    });
    reussi(monde);
});

Then("le CRA est marqué « modifié par l'administrateur »", async ({ monde }) => {
    expect((await lireCra(monde)).modifie_admin_nom).toBeTruthy();
});

When("l'administrateur renvoie le CRA à l'expert", async ({ monde }) => {
    await appelAdmin(monde, 'return-to-expert');
});

When("l'administrateur tente de déclarer « rien à déclarer » à la place de l'expert", async ({ monde }) => {
    await appelAdmin(monde, 'rien-a-declarer');
});

// ---------- Collecte (MAD volante) ----------

Given("l'expert de test est une MAD volante", async ({ monde, $test }) => {
    const { resourceId } = await ressourceExpert(monde);
    $test.skip(
        (await lireRessource(monde, resourceId)).is_mad_volante !== 1,
        "La ressource de l'expert de test n'est pas une MAD volante"
    );
});

Given("l'expert de test n'est pas une MAD volante", async ({ monde, $test }) => {
    const { resourceId } = await ressourceExpert(monde);
    $test.skip(
        (await lireRessource(monde, resourceId)).is_mad_volante === 1,
        "La ressource de l'expert de test est une MAD volante"
    );
});

Given(
    "la planification de l'expert de test contient une journée d'activité {string} et une matinée d'activité {string} dans le mois",
    async ({ monde }, journee, matinee) => {
        const { resourceId } = await ressourceExpert(monde);
        const { mois, annee } = monde.d.mois;
        await nettoyerMoisExpert(monde, annee, mois - 1);
        const j = (/** @type {string} */ d) => `${annee}-${pad(mois)}-${d}`;
        await (
            await adminApi(monde)
        ).ok('POST', '/api/schedule', {
            [cle(resourceId, 'available', j('02'), 'AM')]: '2',
            [cle(resourceId, 'activity', j('02'), 'AM')]: journee,
            [cle(resourceId, 'available', j('02'), 'PM')]: '2',
            [cle(resourceId, 'activity', j('02'), 'PM')]: journee,
            [cle(resourceId, 'available', j('03'), 'AM')]: '2',
            [cle(resourceId, 'activity', j('03'), 'AM')]: matinee
        });
    }
);

When("l'expert lance la collecte des activités de son CRA", async ({ monde }) => {
    monde.d.collecte = await (await expertApi(monde)).ok('GET', `/api/cra/${await idCra(monde)}/collect`);
});

Then('la collecte propose les lignes :', async ({ monde }, table) => {
    const { mois, annee } = monde.d.mois;
    expect(monde.d.collecte.allowed).toBe(true);
    const attendu = table
        .hashes()
        .map((/** @type {any} */ l) => [`${annee}-${pad(mois)}-${l.jour}`, l['début'], l.fin, l.objet]);
    expect(
        monde.d.collecte.lines.map((/** @type {any} */ l) => [l.date_debut, l.heure_debut, l.heure_fin, l.objet])
    ).toEqual(attendu);
});

Then("la collecte n'est pas proposée", async ({ monde }) => {
    expect(monde.d.collecte).toEqual({ allowed: false, lines: [] });
});

// ---------- Archivage ----------

When("l'administrateur archive le CRA", async ({ monde }) => {
    await appelAdmin(monde, 'archive');
    reussi(monde);
});

When("l'administrateur désarchive le CRA", async ({ monde }) => {
    await appelAdmin(monde, 'unarchive');
    reussi(monde);
});

When("l'administrateur supprime le CRA \\(corbeille)", async ({ monde }) => {
    await appelAdmin(monde, 'soft-delete');
    reussi(monde);
});

When("l'administrateur restaure le CRA supprimé", async ({ monde }) => {
    await appelAdmin(monde, 'restore-deleted');
    reussi(monde);
});

const idsDe = async (/** @type {Monde} */ monde, /** @type {string} */ url) =>
    (await (await adminApi(monde)).ok('GET', url)).map((/** @type {any} */ c) => c.id);

Then('le CRA figure dans les archives', async ({ monde }) => {
    expect(await idsDe(monde, '/api/cra/admin/archives')).toContain(await idCra(monde));
});

Then('le CRA ne figure plus dans les archives', async ({ monde }) => {
    expect(await idsDe(monde, '/api/cra/admin/archives')).not.toContain(await idCra(monde));
});

Then('le CRA figure dans la corbeille', async ({ monde }) => {
    expect(await idsDe(monde, '/api/cra/admin/deleted')).toContain(await idCra(monde));
});

Then('le CRA ne figure plus dans la corbeille', async ({ monde }) => {
    expect(await idsDe(monde, '/api/cra/admin/deleted')).not.toContain(await idCra(monde));
});

// ---------- PDF d'un CRA diffusé (exploitation) ----------

Given('un CRA diffusé existe', async ({ monde, $test }) => {
    const liste = await (await adminApi(monde)).ok('GET', '/api/cra/admin/list?statut=diffuse');
    $test.skip(liste.length === 0, 'Aucun CRA diffusé dans la base');
    monde.d.craDiffuse = liste[0].id;
});

When('{string} ouvre le PDF de ce CRA', async ({ monde }, profil) => {
    monde.reponse = await (await monde.apiDe(profil)).get(`/api/cra/${monde.d.craDiffuse}/pdf`);
});

Then('un document PDF est renvoyé', async ({ monde }) => {
    expect(monde.reponse?.status).toBe(200);
    expect(monde.reponse?.headers['content-type']).toContain('application/pdf');
});
