// @ts-check
// Suivi des déplacements › cadre (en-tête, onglets, minuteur, recherche, déconnexion), reporting et administration des
// bons de commande. Bons de commande et déplacements de test de l'année 2033 (étapes de steps/deplacements.js),
// supprimés en fin de scénario.
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { action, confirmer, telecharger } from '../support/interface.js';
import { creerDeplacement, villeDeTest } from './deplacements.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const application = (/** @type {Monde} */ monde) => monde.page.locator('#deplacementsContainer');

// ---------- Cadre ----------

Then(
    "l'en-tête des déplacements présente le nom de {string} et le profil {string}",
    async ({ monde }, profil, libelle) => {
        const s = await monde.sessionDe(profil);
        await expect(monde.page.locator('#deplacementsUserDisplayName')).toContainText(String(s.nom));
        await expect(monde.page.locator('#deplacementsUserDisplayRole')).toHaveText(libelle);
    }
);

Then('les onglets des déplacements sont {string}', async ({ monde }, liste) => {
    const onglets = application(monde).locator('.tabs .tab-btn:visible');
    await expect.poll(async () => (await onglets.allTextContents()).map(t => t.trim()).join(', ')).toBe(liste);
});

Then('le minuteur des déplacements décompte', async ({ monde }) => {
    const minuteur = monde.page.locator('#deplacementsTimerDisplay');
    await expect(minuteur).toBeVisible();
    const lire = async () => ((await minuteur.textContent()) ?? '').replace(/[^0-9:]/g, '');
    await expect(minuteur).toHaveText(/\d{2}:\d{2}/);
    const avant = await lire();
    await expect.poll(lire, { timeout: 5000, message: 'décompte du minuteur' }).not.toBe(avant);
});

When('je lance la recherche des déplacements', async ({ monde }) => {
    await application(monde).locator('button[title="Recherche"]').click();
});

const fenetreDeconnexion = (/** @type {Monde} */ monde) => monde.page.locator('#deplacementsLogoutModal');

When('je clique sur la déconnexion des déplacements', async ({ monde }) => {
    await application(monde).locator('.logout-icon').click();
    await expect(fenetreDeconnexion(monde)).toBeVisible();
});

Then('la fenêtre de déconnexion propose {string}, {string} et {string}', async ({ monde }, a, b, c) => {
    for (const libelle of [a, b, c]) {
        await expect(fenetreDeconnexion(monde).getByRole('button', { name: libelle })).toBeVisible();
    }
});

When('je choisis {string} dans la fenêtre de déconnexion', async ({ monde }, libelle) => {
    await fenetreDeconnexion(monde).getByRole('button', { name: libelle }).click();
});

Then("l'application des déplacements est toujours affichée", async ({ monde }) => {
    await expect(fenetreDeconnexion(monde)).toBeHidden();
    await expect(application(monde)).toBeVisible();
});

Then('la Plateforme de planification est affichée', async ({ monde }) => {
    await expect(application(monde)).toBeHidden();
    await expect(monde.page.locator('#mainTabsContainer')).toBeVisible();
});

// ---------- Onglets ----------

const IDS_ONGLETS = /** @type {Record<string, string>} */ ({
    Reporting: '#deplacementsTabReporting',
    Administration: '#deplacementsTabAdmin'
});

When("j'ouvre l'onglet {string} des déplacements", async ({ monde }, libelle) => {
    await monde.page.locator(IDS_ONGLETS[libelle]).click();
    const corps = libelle === 'Reporting' ? '#reportingDeplacementsBody' : '#bonsCommandeBody';
    await expect(monde.page.locator(corps)).toBeVisible();
    await expect(monde.page.locator(corps)).not.toContainText('Chargement');
});

// ---------- Reporting ----------

const ligneSynthese = (/** @type {Monde} */ monde) =>
    monde.page.locator('#reportingBonsCommandeBody tr', { hasText: monde.d.bdc.intitule });

Then(
    'la synthèse présente le bon de commande de test : {string} UO commandées, {string} consommées, solde {string}, {string}',
    async ({ monde }, commandees, consommees, solde, taux) => {
        const l = ligneSynthese(monde);
        await expect(l).toHaveCount(1);
        const cellules = l.locator('td');
        await expect(cellules.nth(0)).toHaveText('NON');
        await expect(cellules.nth(1)).toHaveText(`${monde.d.bdc.intitule} - E2E`);
        await expect(cellules.nth(2)).toHaveText(`01/01/${monde.d.annee} - 31/12/${monde.d.annee}`);
        await expect(cellules.nth(3)).toHaveText(commandees);
        await expect(cellules.nth(4)).toHaveText(consommees);
        await expect(cellules.nth(5)).toHaveText(solde);
        await expect(cellules.nth(6)).toHaveText(taux);
    }
);

When('je filtre le reporting sur le bon de commande de test', async ({ monde }) => {
    await monde.page.locator('#filterReportingBdc').selectOption(String(monde.d.bdc.id));
});

Then('le reporting compte {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#reportingDeplacementsCount')).toHaveText(texte);
    await expect(monde.page.locator('#reportingDeplacementsBody tr')).toHaveCount(1);
});

Then("l'export CSV du reporting contient le déplacement de test", async ({ monde }) => {
    const { nom, contenu } = await telecharger(monde, application(monde).getByRole('button', { name: /Export CSV/ }));
    expect(nom).toMatch(/^export_deplacements_\d{4}-\d{2}-\d{2}\.csv$/);
    const lignes = contenu.split('\n');
    expect(lignes[0]).toBe('\uFEFFN° de BDC;Titulaire;Date début;Date fin;Créé par;AMOA CED;SAMU;Ville;Nb UO');
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatch(
        new RegExp(
            `^${monde.d.bdc.intitule};E2E;${monde.d.annee}-04-01;${monde.d.annee}-04-03;[^;]+;[^;]*;SAMU 75;${villeDeTest(monde)};3$`
        )
    );
});

When('je réinitialise les filtres du reporting', async ({ monde }) => {
    await application(monde)
        .getByRole('button', { name: /Réinitialiser/ })
        .click();
});

Then(
    'le filtre du bon de commande est vide et la liste présente aussi le déplacement sans bon de commande',
    async ({ monde }) => {
        await expect(monde.page.locator('#filterReportingBdc')).toHaveValue('');
        const corps = monde.page.locator('#reportingDeplacementsBody');
        await expect(corps.locator('tr', { hasText: villeDeTest(monde) })).toHaveCount(2);
        await expect(corps.locator('tr', { hasText: villeDeTest(monde, 'C') })).toContainText('À affecter');
        await expect(monde.page.locator('#reportingDeplacementsCount')).not.toHaveText(/^1 déplacement/);
    }
);

// ---------- Administration ----------

const ligneBon = (/** @type {Monde} */ monde, /** @type {string} */ intitule) =>
    monde.page
        .locator('#bonsCommandeBody tr')
        .filter({ has: monde.page.locator('td:first-child', { hasText: new RegExp(`^\\s*${intitule}\\s*$`) }) });

/** Saisie du formulaire de création (bon de l'écran : 5 UO, année de test) */
async function saisirBon(/** @type {Monde} */ monde) {
    const page = monde.page;
    await page.locator('#bcIntitule').fill(monde.d.bonEcran);
    await page.locator('#bcTitulaire').fill('e2e titulaire');
    await page.locator('#bcDateDebut').fill(`${monde.d.annee}-01-01`);
    await page.locator('#bcDateFin').fill(`${monde.d.annee}-12-31`);
    await page.locator('#bcNbUO').fill('5');
    await application(monde).getByRole('button', { name: 'Créer le bon de commande' }).click();
}

When("je crée un bon de commande de test depuis l'écran", async ({ monde }) => {
    const api = await adminApi(monde);
    monde.d.bonEcran = monde.unique('BDC-E2E-ECRAN').replace(/\s+/g, '-');
    monde.aNettoyer("bon de commande créé depuis l'écran", async () => {
        const bons = await api.ok('GET', '/api/bons-commande');
        const bon = bons.find((/** @type {any} */ b) => b.intitule === monde.d.bonEcran);
        if (bon) await api.delete(`/api/bons-commande/${bon.id}`);
    });
    await saisirBon(monde);
});

When('je crée à nouveau le même bon de commande', async ({ monde }) => {
    await saisirBon(monde);
});

When("j'ajoute le bon de commande sans le remplir", async ({ monde }) => {
    await application(monde).getByRole('button', { name: 'Créer le bon de commande' }).click();
});

Then('la liste des bons de commande présente le bon créé, titulaire {string}', async ({ monde }, titulaire) => {
    const l = ligneBon(monde, monde.d.bonEcran);
    await expect(l).toHaveCount(1);
    await expect(l.locator('td').nth(1)).toHaveText(titulaire);
    await expect(l.locator('td').nth(5)).toHaveText('5');
});

When('je change le titulaire du bon créé en {string}', async ({ monde }, titulaire) => {
    await ligneBon(monde, monde.d.bonEcran)
        .getByRole('button', { name: /Modifier/ })
        .click();
    const fenetre = monde.page.locator('#editBonCommandeModal');
    await expect(fenetre).toBeVisible();
    await expect(monde.page.locator('#editBcIntitule')).toHaveValue(monde.d.bonEcran);
    await monde.page.locator('#editBcTitulaire').fill(titulaire);
    await fenetre.getByRole('button', { name: /Enregistrer/ }).click();
    await expect(fenetre).toBeHidden();
});

When('je supprime le bon créé et je confirme', async ({ monde }) => {
    const texte = await confirmer(monde, () =>
        ligneBon(monde, monde.d.bonEcran)
            .getByRole('button', { name: /Supprimer/ })
            .click()
    );
    expect(texte).toContain(monde.d.bonEcran);
});

Then('la liste des bons de commande ne présente plus le bon créé', async ({ monde }) => {
    await expect(ligneBon(monde, monde.d.bonEcran)).toHaveCount(0);
});

Then("l'observation du bon de commande de test indique {string}", async ({ monde }, texte) => {
    await expect(ligneBon(monde, monde.d.bdc.intitule).locator('td').nth(7)).toContainText(texte);
});

const fenetreBon = (/** @type {Monde} */ monde) => monde.page.locator('#bdcDeplacementsModal');

When("j'ouvre les déplacements du bon de commande de test", async ({ monde }) => {
    await action(ligneBon(monde, monde.d.bdc.intitule), monde.d.bdc.intitule).click();
    await expect(fenetreBon(monde)).toBeVisible();
    await expect(fenetreBon(monde)).toContainText(`${monde.d.bdc.intitule} - E2E`);
});

Then('la fenêtre liste le déplacement de test avec {string} UO', async ({ monde }, uo) => {
    const l = monde.page.locator('#bdcDeplacementsBody tr', { hasText: villeDeTest(monde) });
    await expect(l).toHaveCount(1);
    await expect(l.locator('td').nth(1)).toHaveText('SAMU 75');
    await expect(l.locator('td').nth(3)).toHaveText(`01/04/${monde.d.annee}`);
    await expect(l.locator('td').nth(5)).toHaveText(uo);
});

Then('la fenêtre ne propose pas de régularisation', async ({ monde }) => {
    await expect(monde.page.locator('#bdcRegularisationSection')).toBeHidden();
});

Given('le bon de commande de test, soldé, a consommé {int} UO', async ({ monde }, uo) => {
    await creerDeplacement(monde, villeDeTest(monde), Number(uo), true, '04-01');
    await (
        await adminApi(monde)
    ).ok('PUT', `/api/bons-commande/${monde.d.bdc.id}`, {
        intitule: monde.d.bdc.intitule,
        titulaire: 'E2E',
        date_debut: `${monde.d.annee}-01-01`,
        date_fin: `${monde.d.annee}-12-31`,
        nb_uo: 10,
        solde: true
    });
});

Given("un second bon de commande de test couvre l'année de test", async ({ monde }) => {
    const api = await adminApi(monde);
    const intitule = monde.unique('BDC-E2E-CIBLE').replace(/\s+/g, '-');
    monde.aNettoyer('second bon de commande de test', async () => {
        if (!monde.d.bdc2) return;
        const lignes = await api.ok('GET', `/api/deplacements?bon_commande_id=${monde.d.bdc2.id}`);
        for (const d of lignes) await api.delete(`/api/deplacements/${d.id}`);
        await api.delete(`/api/bons-commande/${monde.d.bdc2.id}`);
    });
    const r = await api.ok('POST', '/api/bons-commande', {
        intitule,
        titulaire: 'E2E',
        date_debut: `${monde.d.annee}-01-01`,
        date_fin: `${monde.d.annee}-12-31`,
        nb_uo: 10
    });
    monde.d.bdc2 = { id: r.id, intitule };
});

When(
    'je régularise les {int} UO sur le second bon de commande de test et je confirme',
    async ({ monde }, /** @type {number} */ uo) => {
        await expect(monde.page.locator('#bdcRegularisationSection')).toBeVisible();
        await expect(monde.page.locator('#bdcUoEnTrop')).toHaveText(String(uo));
        await monde.page.locator('#bdcCibleRegularisation').selectOption(String(monde.d.bdc2.id));
        const texte = await confirmer(monde, () =>
            fenetreBon(monde)
                .getByRole('button', { name: /Créer la ligne de régularisation/ })
                .click()
        );
        expect(texte).toContain(`${uo} UO`);
        expect(texte).toContain(monde.d.bdc2.intitule);
    }
);
