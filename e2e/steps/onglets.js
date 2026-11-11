// @ts-check
// Onglets de la Planification (ordre par glisser-déposer, pastille des CRA, onglet ouvert à l'arrivée) et application
// rouverte après un rechargement de la page.
import { expect } from '@playwright/test';
import { Then, When } from '../support/fixtures.js';
import { ongletCle } from './commun.js';

/** @typedef {import('@playwright/test').Page} Page */

const bouton = (/** @type {Page} */ page, /** @type {string} */ libelle) =>
    page.locator(`#mainTabsContainer button.tab-btn[data-tab="${ongletCle(libelle)}"]`);

When("je fais glisser l'onglet {string} sur l'onglet {string}", async ({ monde }, source, cible) => {
    const page = monde.page;
    await expect(bouton(page, source)).toBeVisible({ timeout: 20000 });
    await bouton(page, source).dragTo(bouton(page, cible));
});

Then("l'onglet {string} précède l'onglet {string}", async ({ monde }, avant, apres) => {
    const page = monde.page;
    await expect(bouton(page, avant)).toBeVisible({ timeout: 20000 });
    await expect
        .poll(async () => {
            const ordre = await page.$$eval('#mainTabsContainer button.tab-btn[data-tab]', b =>
                b.map(x => /** @type {HTMLElement} */ (x).dataset.tab)
            );
            return ordre.indexOf(ongletCle(avant)) < ordre.indexOf(ongletCle(apres));
        })
        .toBe(true);
});

Then("la pastille de l'onglet CRA présente le nombre de CRA en cours de {string}", async ({ monde }, label) => {
    const api = await monde.apiDe(label);
    const liste = /** @type {{ archived?: boolean, statut?: string }[]} */ (await api.ok('GET', '/api/cra/my-list'));
    const enCours = liste.filter(c => !c.archived && c.statut !== 'diffuse').length;
    const pastille = monde.page.locator('#craPendingBadge');
    await expect(monde.page.locator('#craTabBtn')).toBeVisible({ timeout: 20000 });
    if (enCours > 0) await expect(pastille).toHaveText(String(enCours));
    else await expect(pastille).toBeHidden();
});

When("l'onglet par défaut du compte de test devient {string}", async ({ monde }, libelle) => {
    const page = monde.page;
    const s = await (await page.request.get('/api/check-session')).json();
    const r = await page.request.put(`/api/users/${s.userId}/default-tab`, {
        data: { defaultTab: ongletCle(libelle) }
    });
    expect(r.status()).toBe(200);
});

const CONTENEURS = /** @type {Record<string, string>} */ ({
    'Analyse de fichiers': '#analyseContainer',
    'Suivi des déplacements': '#deplacementsContainer',
    "Aide à l'affectation opérationnelle": '#affectationContainer'
});

Then("l'application « {}» est affichée", async ({ monde }, libelle) => {
    const sel = CONTENEURS[libelle.trim()];
    if (!sel) throw new Error(`Application inconnue : ${libelle}`);
    await expect(monde.page.locator(sel)).toBeVisible({ timeout: 30000 });
    await expect(monde.page.locator('.container').first()).toBeHidden();
});

Then('la Planification est affichée', async ({ monde }) => {
    await expect(monde.page.locator('.container').first()).toBeVisible({ timeout: 30000 });
    await expect(monde.page.locator('#userInfo')).toBeVisible();
    for (const sel of Object.values(CONTENEURS)) await expect(monde.page.locator(sel)).toBeHidden();
});
