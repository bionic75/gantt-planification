// @ts-check
// Aide à l'affectation › onglet « Planning des déploiements » : grille (échelle, période, tri, SAMU affichés, lignes
// retirées, légende), affectation des ressources, impression / export. Déploiement, localisation et ressource de test
// (mars 2031), supprimés en fin de scénario ; le report dans la planification n'est jamais validé.
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { telecharger } from '../support/interface.js';
import { ouvrirApplication } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const APPLICATION = "Aide à l'affectation opérationnelle";
const grille = (/** @type {Monde} */ monde) => monde.page.locator('#affPlan');
const ligneSamu = (/** @type {Monde} */ monde) =>
    grille(monde)
        .locator('tbody tr')
        .filter({ has: monde.page.locator('th', { hasText: monde.d.localisation.court }) });
const visites = (/** @type {Monde} */ monde) => ligneSamu(monde).locator('[title^="Visite métier : 03/03/2031"]');

Given("j'ouvre le planning des déploiements en tant que {string}", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
    const page = monde.page;
    await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
    await page.locator('#appSwitcherBtn').click();
    await page.locator('#appSwitcherDropdown > div', { hasText: APPLICATION }).click();
    await expect(page.locator('#affectationContainer')).toBeVisible({ timeout: 20000 });
    await expect(grille(monde).locator('table')).toBeVisible({ timeout: 20000 });
});

When("j'affiche la période du {string} au {string}", async ({ monde }, debut, fin) => {
    const page = monde.page;
    await page.locator('#affRgFrom').fill(debut);
    await page.locator('#affRgFrom').dispatchEvent('change');
    await page.locator('#affRgTo').fill(fin);
    await page.locator('#affRgTo').dispatchEvent('change');
    await expect(grille(monde).locator('thead')).toContainText('Mars');
});

Then('la grille présente la ligne du SAMU de test et son chef de projet', async ({ monde }) => {
    await expect(ligneSamu(monde)).toHaveCount(1);
    await expect(ligneSamu(monde).locator('th')).toContainText('Chef de projet non défini');
});

Then('la grille ne présente plus la ligne du SAMU de test', async ({ monde }) => {
    await expect(ligneSamu(monde)).toHaveCount(0);
});

Then(
    'la visite métier du SAMU de test occupe {int} colonnes, la première indiquant {string}',
    async ({ monde }, n, texte) => {
        await expect(visites(monde)).toHaveCount(n);
        await expect(visites(monde).first()).toHaveText(texte);
        await expect(visites(monde).first()).toHaveAttribute('title', new RegExp(`${texte} ressource\\(s\\) par jour`));
    }
);

Then('la visite métier du SAMU de test indique {string}', async ({ monde }, texte) => {
    await expect(visites(monde).first()).toHaveAttribute('title', new RegExp(texte.replace(/[()]/g, '\\$&')));
});

Then("la visite métier du SAMU de test n'est plus affichée", async ({ monde }) => {
    await expect(ligneSamu(monde)).toHaveCount(1);
    await expect(visites(monde)).toHaveCount(0);
});

const ECHELLES = /** @type {Record<string, string>} */ ({ Jour: 'Jour', Semaine: 'Semaine', Mois: 'Mois' });

When("je choisis l'échelle « {word} »", async ({ monde }, echelle) => {
    await monde.page
        .locator('#affectationPlanningTab')
        .getByRole('button', { name: ECHELLES[echelle], exact: true })
        .click();
});

Then("l'en-tête de la grille présente {string}", async ({ monde }, texte) => {
    await expect(
        grille(monde)
            .locator('thead th', { hasText: new RegExp(`^${texte}$`) })
            .first()
    ).toBeVisible();
});

const boutonTri = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    monde.page.locator('#affectationPlanningTab').getByRole('button', { name: new RegExp(`^${libelle}( [▲▼])?$`) });

When('je trie le planning par « {word} »', async ({ monde }, libelle) => {
    await boutonTri(monde, libelle).click();
});

Then('le bouton de tri « {word} » indique {string}', async ({ monde }, libelle, fleche) => {
    await expect(boutonTri(monde, libelle)).toHaveText(`${libelle} ${fleche}`);
});

// ---------- SAMU affichés, lignes retirées, légende ----------

async function caseSamu(/** @type {Monde} */ monde) {
    const page = monde.page;
    await page
        .locator('#affSamuDd')
        .getByRole('button', { name: /SAMU affichés/ })
        .click();
    return page.locator('#affSamuDd label', { hasText: monde.d.localisation.court }).locator('input');
}

When('je décoche le SAMU de test dans « SAMU affichés »', async ({ monde }) => {
    await (await caseSamu(monde)).uncheck();
});

When('je recoche le SAMU de test dans « SAMU affichés »', async ({ monde }) => {
    const c = monde.page.locator('#affSamuDd label', { hasText: monde.d.localisation.court }).locator('input');
    if (!(await c.isVisible()))
        await monde.page
            .locator('#affSamuDd')
            .getByRole('button', { name: /SAMU affichés/ })
            .click();
    await c.check();
    // Liste refermée par un clic ailleurs
    await monde.page.locator('#affectationPlanningTab h2').click();
});

When('je retire la ligne du SAMU de test', async ({ monde }) => {
    await ligneSamu(monde).getByRole('button', { name: '−', exact: true }).click();
});

When('je rétablis la ligne du SAMU de test depuis « Lignes retirées »', async ({ monde }) => {
    const page = monde.page;
    await page
        .locator('#affRangeCtl')
        .getByRole('button', { name: /Lignes retirées/ })
        .click();
    const ligne = page.locator('#affHidPop .row', { hasText: monde.d.localisation.court });
    await ligne.getByRole('button', { name: 'Rétablir' }).click();
});

const puceLegende = (/** @type {Monde} */ monde, /** @type {string} */ etape) =>
    monde.page.locator('#affLegendBar').getByRole('button', { name: etape, exact: true });

When("je masque l'étape « {}» dans la légende", async ({ monde }, etape) => {
    await puceLegende(monde, etape.trim()).click();
});

When("j'affiche l'étape « {}» dans la légende", async ({ monde }, etape) => {
    await puceLegende(monde, etape.trim()).click();
});

// ---------- Affectation ----------

const fenetreAffectation = (/** @type {Monde} */ monde) => monde.page.locator('#affAssignModal');

When("j'ouvre l'affectation de la visite métier du SAMU de test", async ({ monde }) => {
    await visites(monde).first().click();
    await expect(fenetreAffectation(monde)).toBeVisible();
    await expect(monde.page.locator('#affAssignList table')).toBeVisible();
});

Then("la fenêtre d'affectation propose « Synchroniser »", async ({ monde }) => {
    await expect(fenetreAffectation(monde).getByRole('button', { name: 'Synchroniser' })).toBeVisible();
});

Then("la fenêtre d'affectation ne propose pas « Synchroniser »", async ({ monde }) => {
    await expect(fenetreAffectation(monde).getByRole('button', { name: 'Enregistrer' })).toBeVisible();
    await expect(fenetreAffectation(monde).getByRole('button', { name: 'Synchroniser' })).toHaveCount(0);
});

When("je coche le {string} pour la ressource de test et j'enregistre", async ({ monde }, jour) => {
    const page = monde.page;
    const [a, m, j] = jour.split('-');
    const entetes = await page
        .locator('#affAssignList thead th')
        .evaluateAll(ths => ths.map(th => th.getAttribute('title') || ''));
    const index = entetes.findIndex(t => t.startsWith(`${j}/${m}/${a} :`));
    expect(index, `colonne du ${jour}`).toBeGreaterThan(0);
    const ligne = page
        .locator('#affAssignList tbody tr')
        .filter({ has: page.locator('th', { hasText: monde.d.ressource.nom.toUpperCase() }) });
    const caseJour = ligne.locator(`td:nth-child(${index + 1}) button`);
    await caseJour.click();
    await expect(caseJour).toHaveText('✓');
    await fenetreAffectation(monde).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetreAffectation(monde)).toBeHidden();
});

Then('le report dans la planification est proposé et je le remets à plus tard', async ({ monde }) => {
    const fenetre = monde.page.locator('#affSyncModal');
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText("Reporter l'affectation");
    await fenetre.getByRole('button', { name: 'Plus tard' }).click();
    await expect(fenetre).toBeHidden();
});

Then("la fenêtre d'affectation est fermée sans report proposé", async ({ monde }) => {
    await expect(fenetreAffectation(monde)).toBeHidden();
    // Laisse le temps à une éventuelle fenêtre de report de s'ouvrir
    await monde.page.waitForTimeout(1000);
    await expect(monde.page.locator('#affSyncModal')).toBeHidden();
});

Then('la ressource de test intervient le {string} sur la visite métier du déploiement', async ({ monde }, jour) => {
    const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
    const p = projects.find((/** @type {any} */ x) => x.id === monde.d.deploiement.id);
    expect(p.assignment_days?.visite_metier?.[jour]).toContain(monde.d.ressource.id);
});

// ---------- Impression ----------

const fenetreImpression = (/** @type {Monde} */ monde) => monde.page.locator('#affPrintModal');

When("j'ouvre l'impression du planning", async ({ monde }) => {
    await monde.page
        .locator('#affectationPlanningTab')
        .getByRole('button', { name: /Imprimer \/ Exporter/ })
        .click();
    await expect(fenetreImpression(monde)).toBeVisible();
    await expect(monde.page.locator('#affPrintInfo')).toContainText(/page|diapositive/, { timeout: 20000 });
});

When('je saisis le titre {string} et la période du {string} au {string}', async ({ monde }, titre, debut, fin) => {
    const page = monde.page;
    await page.locator('#prTitle').fill(titre);
    await page.locator('#prFrom').fill(debut);
    await page.locator('#prTo').fill(fin);
    await page.locator('#prTo').dispatchEvent('change');
});

Then("l'aperçu annonce au moins {int} page", async ({ monde }, n) => {
    await expect(monde.page.locator('#affPrintInfo')).toContainText(/\d+ (page\(s\)|diapositive\(s\))/, {
        timeout: 20000
    });
    const texte = (await monde.page.locator('#affPrintInfo').textContent()) ?? '';
    expect(Number(/(\d+) (page|diapositive)/.exec(texte)?.[1])).toBeGreaterThanOrEqual(n);
});

Then("l'aperçu présente le titre {string} et le SAMU de test", async ({ monde }, titre) => {
    const apercu = monde.page.locator('#affPrintPreview');
    await expect(apercu).toContainText(titre, { timeout: 20000 });
    await expect(apercu).toContainText(monde.d.localisation.court);
});

When("j'exporte le planning en PDF", async ({ monde }) => {
    const { nom } = await telecharger(monde, fenetreImpression(monde).getByRole('button', { name: 'Exporter en PDF' }));
    monde.d.exportPdf = nom;
});

Then('un fichier PDF est téléchargé', async ({ monde }) => {
    expect(monde.d.exportPdf).toMatch(/\.pdf$/);
});
