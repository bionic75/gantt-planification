// @ts-check
// Clôture de la migration : politique de sécurité du contenu (aucune violation sur les pages), mode d'affichage
// mémorisé et appliqué avant l'affichage, aide en ligne (icônes, bouton « Retour à l'application »).
import { expect } from '@playwright/test';
import { Given, Then, When } from '../support/fixtures.js';
import { attendreFinDemarrage } from './commun.js';

/** @typedef {import('@playwright/test').Page} Page */

Given(
    'la page {string} est ouverte par {string} en relevant les violations de la politique de sécurité',
    async ({ monde }, adresse, profil) => {
        const { page } = profil === 'personne' ? await monde.anonyme() : await monde.acteur(profil);
        // Violations relevées dès le début du chargement (scripts de la page compris)
        await page.addInitScript(() => {
            const w = /** @type {any} */ (window);
            w.__violationsCsp = [];
            document.addEventListener('securitypolicyviolation', e =>
                w.__violationsCsp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)
            );
        });
        await page.goto(adresse);
        await attendreFinDemarrage(page);
        // Le temps des montages différés (onglet, icônes, décor)
        await page.waitForTimeout(1500);
    }
);

Then('la page ne signale aucune violation de la politique de sécurité', async ({ monde }) => {
    const violations = await monde.page.evaluate(() => /** @type {any} */ (window).__violationsCsp ?? null);
    expect(violations, 'script de relevé non exécuté').not.toBeNull();
    expect(violations).toEqual([]);
});

const sombre = (/** @type {Page} */ page) =>
    page.evaluate(() => document.documentElement.classList.contains('dark-mode'));

/** Bouton de la barre d'outils : passe du mode affiché à l'autre */
async function basculerVers(/** @type {Page} */ page, /** @type {boolean} */ voulu) {
    await expect(page.locator('#colorModeBtn')).toBeVisible({ timeout: 20000 });
    if ((await sombre(page)) !== voulu) await page.locator('#colorModeBtn').click();
    await expect.poll(() => sombre(page)).toBe(voulu);
}

When("je passe en mode sombre par la barre d'outils", async ({ monde }) => {
    await basculerVers(monde.page, true);
});

When("je passe en mode clair par la barre d'outils", async ({ monde }) => {
    await basculerVers(monde.page, false);
});

Then('le mode sombre est appliqué dès le chargement de la page', async ({ monde }) => {
    // Classe posée par le script classique de <head> (frontend/public/mode-affichage.js), avant l'application
    const page = monde.page;
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await sombre(page)).toBe(true);
    await attendreFinDemarrage(page);
});

Then("le mode sombre n'est pas appliqué", async ({ monde }) => {
    expect(await sombre(monde.page)).toBe(false);
});

Then("les émojis de l'aide en ligne sont remplacés par des icônes", async ({ monde }) => {
    const aide = /** @type {Page} */ (monde.d.fenetreAide);
    await expect(aide.locator('svg.ui-emo').first()).toBeAttached({ timeout: 15000 });
});

When("je clique sur « Retour à l'application » dans l'aide en ligne", async ({ monde }) => {
    const aide = /** @type {Page} */ (monde.d.fenetreAide);
    monde.d.fermetureAide = aide.waitForEvent('close');
    await aide.locator('.back-btn').click();
});

Then("la fenêtre de l'aide en ligne est fermée", async ({ monde }) => {
    await monde.d.fermetureAide;
    expect(/** @type {Page} */ (monde.d.fenetreAide).isClosed()).toBe(true);
});
