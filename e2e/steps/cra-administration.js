// @ts-check
// CRA › administration et vue RH (écran) : lancement, CRA en attente de diffusion, diffusion, visualisation, CRA
// signés, archivés et supprimés, vue RH en consultation
import { expect } from '@playwright/test';
import { config } from '../support/config.js';
import { adminApi, lireRessource, ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';
import { crasDuMois, nettoyerCra } from './cra.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Locator} Locator */

const libelleMois = (/** @type {{ mois: number, annee: number }} */ p) =>
    new Date(p.annee, p.mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const majuscule = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

/** CRA du mois tel que lu par l'administrateur (détail : expert « NOM Prénom », signatures) */
const detailCra = async (/** @type {Monde} */ monde) => (await adminApi(monde)).ok('GET', `/api/cra/${monde.d.craId}`);

/** Nom de l'expert dans les listes de l'administration (« Prénom NOM » ; le détail donne « NOM Prénom ») */
async function nomListes(/** @type {Monde} */ monde) {
    const { session } = await ressourceExpert(monde);
    return [session.prenom, session.nom].filter(Boolean).join(' ');
}

// ---------- CRA à lancer ----------

Given("une période proposée au lancement est libre pour l'expert de test", async ({ monde, $test }) => {
    const { resourceId } = await ressourceExpert(monde);
    // MAD volante : le lancement reprend les lignes de la planification d'un mois réel
    $test.skip(
        (await lireRessource(monde, resourceId)).is_mad_volante === 1,
        "La ressource de l'expert de test est une MAD volante"
    );
    const maintenant = new Date();
    for (let i = 0; i <= 12; i++) {
        const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        const p = { mois: d.getMonth() + 1, annee: d.getFullYear() };
        if ((await crasDuMois(monde, p.mois, p.annee)).length === 0) {
            monde.d.periode = p;
            monde.aNettoyer(`CRA lancé ${p.mois}/${p.annee}`, async () => {
                for (const c of await crasDuMois(monde, p.mois, p.annee)) await nettoyerCra(monde, c.id);
            });
            return;
        }
    }
    $test.skip(true, "Aucune période proposée au lancement n'est libre pour l'expert de test");
});

const boutonLancer = (/** @type {Monde} */ monde) =>
    monde.page.locator('#cra').getByRole('button', { name: /Lancer le CRA/ });

When("je lance un CRA sans choisir d'expert", async ({ monde }) => {
    await expect(monde.page.locator('#craLancerMoisAnnee option').nth(1)).toBeAttached();
    await monde.page.locator('#craLancerExpert').selectOption('');
    await boutonLancer(monde).click();
});

When("je lance le CRA de l'expert de test pour la période libre", async ({ monde }) => {
    const { userId } = await ressourceExpert(monde);
    const page = monde.page;
    await expect(page.locator(`#craLancerExpert option[value="${userId}"]`)).toBeAttached();
    await page.locator('#craLancerExpert').selectOption(String(userId));
    await page.locator('#craLancerMoisAnnee').selectOption(`${monde.d.periode.mois}:${monde.d.periode.annee}`);
    await boutonLancer(monde).click();
});

Then("l'expert de test a un CRA « à compléter » pour la période libre", async ({ monde }) => {
    const { mois, annee } = monde.d.periode;
    await expect
        .poll(async () => (await crasDuMois(monde, mois, annee)).map((/** @type {any} */ c) => c.statut))
        .toEqual(['a_completer']);
});

Then('le CRA de la période libre figure dans « CRA en cours de traitement »', async ({ monde }) => {
    const carte = monde.page
        .locator('#craAdminEnCours > div')
        .filter({ hasText: `Compte-rendu d'activité de ${libelleMois(monde.d.periode)}` })
        .filter({ hasText: await nomListes(monde) });
    await expect(carte).toHaveCount(1);
    await expect(carte).toContainText('À compléter');
});

// ---------- CRA en attente de diffusion ----------

const ligneADiffuser = async (/** @type {Monde} */ monde) =>
    monde.page
        .locator('#craToDiffuseList > div')
        .filter({ hasText: libelleMois(monde.d.mois) })
        .filter({ hasText: await nomListes(monde) });

Then('le bloc « CRA en attente de diffusion » présente le CRA du mois et ses deux viseurs', async ({ monde }) => {
    const [d] = await crasDuMois(monde, monde.d.mois.mois, monde.d.mois.annee);
    await expect(monde.page.locator('#craToDiffuseBox')).toBeVisible();
    const ligne = await ligneADiffuser(monde);
    await expect(ligne).toHaveCount(1);
    await expect(ligne).toContainText(`Visé N1 : ${d.vise_n1_nom}`);
    await expect(ligne).toContainText(`Visé N2 : ${d.vise_n2_nom}`);
});

When('je visualise le CRA du mois depuis le bloc « CRA en attente de diffusion »', async ({ monde }) => {
    await (await ligneADiffuser(monde)).getByRole('button', { name: 'Voir', exact: true }).click();
});

When("j'ouvre la diffusion du CRA du mois", async ({ monde }) => {
    await (await ligneADiffuser(monde)).getByRole('button', { name: /CRA à diffuser/ }).click();
    await expect(fenetreDiffusion(monde)).toBeVisible();
});

// ---------- Visualisation ----------

const visualisation = (/** @type {Monde} */ monde) => monde.page.locator('#craViewerModal');

async function verifierVisualisation(/** @type {Monde} */ monde, /** @type {number} */ signatures) {
    const d = await detailCra(monde);
    await expect(visualisation(monde)).toBeVisible();
    // Titre de la fenêtre (en-tête de niveau 3)
    await expect(visualisation(monde).getByRole('heading', { level: 3 }).first()).toHaveText(
        `CRA — ${d.expert_nom} — ${majuscule(libelleMois(monde.d.mois))}`
    );
    const corps = monde.page.locator('#craViewerBody');
    expect(d.signatures).toHaveLength(signatures);
    for (const s of d.signatures) await expect(corps).toContainText(s.signer_name);
    await expect(corps.getByText('En attente', { exact: true })).toHaveCount(3 - signatures);
}

Then("la visualisation présente le CRA du mois, signé par l'expert et les viseurs N1 et N2", async ({ monde }) => {
    await verifierVisualisation(monde, 3);
});

Then("la visualisation présente le CRA du mois, signé par l'expert seul", async ({ monde }) => {
    await verifierVisualisation(monde, 1);
});

Then("la visualisation ne propose pas de renvoyer l'email", async ({ monde }) => {
    await expect(monde.page.locator('#resendCraEmailBtn')).toBeHidden();
});

Then("la visualisation propose de renvoyer l'email", async ({ monde }) => {
    await expect(monde.page.locator('#resendCraEmailBtn')).toBeVisible();
});

Then('la visualisation présente le journal de diffusion avec la boîte partagée de test', async ({ monde }) => {
    const corps = monde.page.locator('#craViewerBody');
    await expect(corps).toContainText('Diffusion du CRA validé et signé');
    await expect(corps).toContainText(config.mail.sharedAddress);
});

When('je ferme la visualisation', async ({ monde }) => {
    await visualisation(monde).getByRole('button', { name: 'Fermer', exact: true }).last().click();
    await expect(visualisation(monde)).toBeHidden();
});

// ---------- Fenêtre de diffusion ----------

const fenetreDiffusion = (/** @type {Monde} */ monde) => monde.page.locator('#craDiffuserModal');
const SECTIONS_DIFFUSION = /** @type {Record<string, string>} */ ({ 'RH ES': 'RhEs', 'DRH ANS': 'DrhAns' });
const destinataires = (/** @type {Monde} */ monde, /** @type {string} */ section) =>
    monde.page.locator(`#diffuserChips${SECTIONS_DIFFUSION[section] ?? section} [data-email]`);

Then('la fenêtre de diffusion présente le CRA du mois, avec un destinataire expert', async ({ monde }) => {
    const d = await detailCra(monde);
    const titre = fenetreDiffusion(monde).getByRole('heading', { level: 3 }).first();
    await expect(titre).toContainText(d.expert_nom);
    await expect(titre).toContainText(majuscule(libelleMois(monde.d.mois)));
    await expect(destinataires(monde, 'Expert')).toHaveCount(1);
});

Then("l'envoi de la diffusion est impossible tant que le PDF n'est pas généré", async ({ monde }) => {
    await expect(monde.page.locator('#diffuserBtnEnvoyer')).toBeDisabled();
});

async function ajouterDestinataire(
    /** @type {Monde} */ monde,
    /** @type {string} */ section,
    /** @type {string} */ email
) {
    const champ = monde.page.locator(`#diffuserInput${SECTIONS_DIFFUSION[section]}`);
    await champ.fill(email);
    await champ.press('Enter');
}

When("j'ajoute le destinataire RH ES {string}", async ({ monde }, email) => {
    await ajouterDestinataire(monde, 'RH ES', email);
});

Then('les destinataires RH ES comprennent {string}', async ({ monde }, email) => {
    await expect(destinataires(monde, 'RH ES').and(monde.page.locator(`[data-email="${email}"]`))).toHaveCount(1);
});

Then('les destinataires RH ES ne comprennent pas {string}', async ({ monde }, email) => {
    await expect(destinataires(monde, 'RH ES').and(monde.page.locator(`[data-email="${email}"]`))).toHaveCount(0);
});

When('je retire le destinataire RH ES {string}', async ({ monde }, email) => {
    await destinataires(monde, 'RH ES')
        .and(monde.page.locator(`[data-email="${email}"]`))
        .getByTitle('Supprimer')
        .click();
});

When("j'annule la diffusion", async ({ monde }) => {
    await fenetreDiffusion(monde).getByRole('button', { name: 'Annuler', exact: true }).click();
});

Then('la fenêtre de diffusion est fermée', async ({ monde }) => {
    await expect(fenetreDiffusion(monde)).toBeHidden();
});

When('je remplace les destinataires RH par la boîte partagée de test', async ({ monde, $test }) => {
    $test.skip(!config.mail.sharedAddress, 'E2E_SHARED_MAILBOX non renseignée');
    // Seuls l'expert de test et la boîte partagée de test reçoivent la diffusion
    for (const section of ['RH ES', 'DRH ANS']) {
        const liste = destinataires(monde, section);
        while ((await liste.count()) > 0) await liste.first().getByTitle('Supprimer').click();
    }
    await ajouterDestinataire(monde, 'RH ES', config.mail.sharedAddress);
    await expect(destinataires(monde, 'RH ES')).toHaveCount(1);
    await expect(destinataires(monde, 'DRH ANS')).toHaveCount(0);
});

When('je génère le PDF de la diffusion', async ({ monde, $test }) => {
    await monde.page.locator('#diffuserBtnGenPdf').click();
    const statut = monde.page.locator('#diffuserPdfStatus');
    await expect(statut).toContainText(/PDF prêt|Erreur/, { timeout: 120000 });
    const texte = (await statut.textContent()) ?? '';
    $test.skip(/Chromium|503/i.test(texte), 'Chromium indisponible sur le serveur : PDF du CRA non généré');
    expect(texte).toContain('PDF prêt');
});

When("j'envoie la diffusion", async ({ monde }) => {
    await expect(monde.page.locator('#diffuserBtnEnvoyer')).toBeEnabled();
    await monde.page.locator('#diffuserBtnEnvoyer').click();
});

// ---------- Tableaux : CRA signés, archivés ----------

const TABLEAUX = /** @type {Record<string, { filtre: string, tableau: string }>} */ ({
    signés: { filtre: '#craSignFilterExpert', tableau: '#craSignaturesTable' },
    archivés: { filtre: '#craArchiveFilterExpert', tableau: '#craArchivesTable' },
    'archivés RH': { filtre: '#craRhArchiveFilterExpert', tableau: '#craRhArchivesTable' },
    'signés RH': { filtre: '#craRhFilterExpert', tableau: '#craRhSignesTable' }
});

/** Tableau affiché (vue administrateur ou RH) */
const tableau = (/** @type {Monde} */ monde, /** @type {string} */ quoi) => {
    const t = TABLEAUX[quoi];
    const rh = TABLEAUX[`${quoi} RH`];
    return monde.page.locator(rh ? `${t.tableau}:visible, ${rh.tableau}:visible` : `${t.tableau}:visible`);
};

const ligneTableau = (/** @type {Monde} */ monde, /** @type {string} */ quoi) =>
    tableau(monde, quoi).locator('tbody tr', { hasText: libelleMois(monde.d.mois) });

When(/^je recherche les CRA (signés|archivés) de l'expert de test$/, async ({ monde }, quoi) => {
    const { userId } = await ressourceExpert(monde);
    const page = monde.page;
    const filtres = [TABLEAUX[quoi].filtre, TABLEAUX[`${quoi} RH`].filtre].map(f => page.locator(`${f}:visible`));
    const filtre = filtres[0].or(filtres[1]);
    await expect(filtre.locator(`option[value="${userId}"]`)).toBeAttached();
    await filtre.selectOption(String(userId));
    // Bouton « Rechercher » de la ligne des filtres
    await filtre
        .locator('xpath=../..')
        .getByRole('button', { name: /Rechercher/ })
        .click();
});

Then(/^les CRA (signés|archivés) présentent le CRA du mois au statut "(.+)"$/, async ({ monde }, quoi, statut) => {
    const ligne = ligneTableau(monde, quoi);
    await expect(ligne).toHaveCount(1);
    await expect(ligne.locator('td').nth(2)).toContainText(statut);
});

Then('la ligne du CRA du mois propose « Voir », sans archivage, désarchivage ni suppression', async ({ monde }) => {
    const ligne = ligneTableau(monde, 'archivés');
    await expect(ligne.getByRole('button', { name: 'Voir', exact: true })).toBeVisible();
    await expect(ligne.getByRole('button', { name: /Archiver|Désarchiver|Supprimer/ })).toHaveCount(0);
});

When(/^je visualise le CRA du mois depuis les CRA (signés|archivés)$/, async ({ monde }, quoi) => {
    await ligneTableau(monde, quoi).getByRole('button', { name: 'Voir', exact: true }).click();
});

const popupStatut = (/** @type {Monde} */ monde) =>
    monde.page.locator('.status-popup').or(monde.page.getByRole('dialog', { name: /Statut de diffusion/ }));

When("j'ouvre le statut de diffusion du CRA du mois", async ({ monde }) => {
    await ligneTableau(monde, 'signés')
        .getByRole('button', { name: /Statut/ })
        .click();
    await expect(popupStatut(monde)).toBeVisible();
});

Then('le statut de diffusion liste la boîte partagée de test', async ({ monde }) => {
    const popup = popupStatut(monde);
    await expect(popup).toContainText(config.mail.sharedAddress);
    // Fermeture : premier bouton de la fenêtre (✕)
    await popup.getByRole('button').first().click();
    await expect(popup).toBeHidden();
});

When("j'archive le CRA du mois depuis les CRA signés et je confirme", async ({ monde }) => {
    await confirmer(monde, () =>
        ligneTableau(monde, 'signés')
            .getByRole('button', { name: /Archiver/ })
            .click()
    );
});

When('je désarchive le CRA du mois et je confirme', async ({ monde }) => {
    await confirmer(monde, () =>
        ligneTableau(monde, 'archivés')
            .getByRole('button', { name: /Désarchiver/ })
            .click()
    );
});

When('je supprime le CRA du mois depuis les CRA archivés et je confirme', async ({ monde }) => {
    await confirmer(monde, () =>
        ligneTableau(monde, 'archivés')
            .getByRole('button', { name: /Supprimer/ })
            .click()
    );
});

// ---------- CRA supprimés ----------

const ligneSupprimee = async (/** @type {Monde} */ monde) =>
    monde.page
        .locator('#craDeletedTable tbody tr')
        .filter({ hasText: libelleMois(monde.d.mois) })
        .filter({ hasText: await nomListes(monde) });

Then(
    'les CRA supprimés présentent le CRA du mois, « Soumis » et archivé, à restaurer « Vers Archives »',
    async ({ monde }) => {
        const ligne = await ligneSupprimee(monde);
        await expect(ligne).toHaveCount(1);
        await expect(ligne.locator('td').nth(2)).toContainText('Soumis');
        await expect(ligne.locator('td').nth(3)).toHaveText('Oui');
        await expect(ligne.getByRole('button', { name: /Vers Archives/ })).toBeVisible();
    }
);

Then('le bouton « Purger tout » est proposé', async ({ monde }) => {
    await expect(monde.page.locator('#purgeToutBtn')).toBeVisible();
});

When('je restaure le CRA du mois depuis les CRA supprimés et je confirme', async ({ monde }) => {
    await confirmer(monde, async () => (await ligneSupprimee(monde)).getByRole('button', { name: /Vers/ }).click());
});

When('je recharge la liste des CRA supprimés', async ({ monde }) => {
    // Section refermée puis rouverte
    const titre = monde.page.locator('.tab-content.active h3', { hasText: 'CRA supprimés' }).first();
    const bouton = titre.locator('button[aria-expanded]');
    const cible = (await bouton.count()) ? bouton.first() : titre;
    await cible.click();
    await monde.page.waitForTimeout(300);
    await cible.click();
});

When('je purge le CRA du mois depuis les CRA supprimés et je confirme', async ({ monde }) => {
    const ligne = await ligneSupprimee(monde);
    await expect(ligne).toHaveCount(1);
    await confirmer(monde, () => ligne.getByRole('button', { name: /Purger$/ }).click());
});

Then("le CRA du mois n'existe plus", async ({ monde }) => {
    const api = await adminApi(monde);
    await expect.poll(async () => (await api.get(`/api/cra/${monde.d.craId}`)).status).toBe(404);
    await expect(await ligneSupprimee(monde)).toHaveCount(0);
});

// ---------- Vue RH ----------

const MOIS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];

Then('les filtres « Mois » de la vue RH proposent les douze mois', async ({ monde }) => {
    for (const id of ['#craRhFilterMois', '#craRhArchiveFilterMois'])
        await expect(monde.page.locator(`${id} option`)).toHaveText(['Tous', ...MOIS]);
});

Then('les sections « CRA à lancer » et « CRA supprimés » ne sont pas proposées', async ({ monde }) => {
    const onglet = monde.page.locator('#cra');
    await expect(onglet.locator('h3:visible', { hasText: 'CRA à lancer' })).toHaveCount(0);
    await expect(onglet.locator('h3:visible', { hasText: 'CRA supprimés' })).toHaveCount(0);
});
