// @ts-check
// Administration › accès des comptes aux applications et grille d'accès aux onglets par profil
import { expect } from '@playwright/test';
import { profil as profilDe } from '../support/config.js';
import { adminApi, creerCompte } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';
import { ongletCle } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

// ---------- Accès aux applications ----------

const APPLICATIONS = /** @type {Record<string, string>} */ ({
    'Plateforme de suivi des déplacements': 'deplacements',
    'Analyse de fichiers': 'analyse',
    "Aide à l'affectation opérationnelle": 'affectation'
});
const cleApplication = (/** @type {string} */ libelle) => {
    const k = APPLICATIONS[libelle];
    if (!k) throw new Error(`Application inconnue : ${libelle}`);
    return k;
};

/** Nom affiché d'un compte : NOM Prénom */
const nomAffiche = (/** @type {any} */ c) => `${c.nom.toUpperCase()} ${c.prenom}`;

const carte = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    monde.page.locator('#appAccessContent > *').filter({ hasText: libelle });

const autorises = async (/** @type {Monde} */ monde, /** @type {string} */ app) =>
    (await (await adminApi(monde)).ok('GET', '/api/app-access'))[app].users.map((/** @type {any} */ u) => u.id);

Given('un compte de test existe', async ({ monde }) => {
    monde.d.compte = await creerCompte(monde);
});

Given("le compte de test a reçu l'accès à l'application {string}", async ({ monde }, app) => {
    await (await adminApi(monde)).ok('POST', `/api/app-access/${app}/users`, { userId: monde.d.compte.id });
});

/** Saisie dans la recherche d'une application ; attente de la réponse du serveur */
async function rechercher(/** @type {Monde} */ monde, /** @type {string} */ libelle) {
    const page = monde.page;
    const reponse = page.waitForResponse(r => r.url().includes('/api/users/search'));
    await page.locator(`#appAccessSearch_${cleApplication(libelle)}`).fill(monde.d.compte.prenom);
    await reponse;
}

const suggestions = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    monde.page.locator(`#appAccessSuggestions_${cleApplication(libelle)}`);

When("j'ajoute le compte de test à l'application {string} par la recherche", async ({ monde }, libelle) => {
    await rechercher(monde, libelle);
    await suggestions(monde, libelle).getByText(nomAffiche(monde.d.compte)).click();
});

When("je recherche le compte de test pour l'application {string}", async ({ monde }, libelle) => {
    monde.d.applicationRecherchee = libelle;
    await rechercher(monde, libelle);
});

Then('la recherche propose le compte de test', async ({ monde }) => {
    await expect(suggestions(monde, monde.d.applicationRecherchee)).toContainText(nomAffiche(monde.d.compte));
});

Then('la recherche ne propose pas le compte de test', async ({ monde }) => {
    // Résultat affiché après la réponse : court délai pour l'affichage
    await monde.page.waitForTimeout(300);
    const liste = suggestions(monde, monde.d.applicationRecherchee);
    if (await liste.isVisible()) await expect(liste).not.toContainText(nomAffiche(monde.d.compte));
});

Then("l'application {string} liste le compte de test", async ({ monde }, libelle) => {
    await expect(carte(monde, libelle)).toContainText(nomAffiche(monde.d.compte));
});

Then("l'application {string} ne liste plus le compte de test", async ({ monde }, libelle) => {
    await expect(carte(monde, libelle)).not.toContainText(nomAffiche(monde.d.compte));
});

When("je retire le compte de test de l'application {string} et je confirme", async ({ monde }, libelle) => {
    const pastille = carte(monde, libelle)
        .locator('span:has(button)')
        .filter({ hasText: nomAffiche(monde.d.compte) });
    await confirmer(monde, () => pastille.getByRole('button').click());
});

Then("le compte de test a accès à l'application {string}", async ({ monde }, app) => {
    await expect.poll(async () => (await autorises(monde, app)).includes(monde.d.compte.id)).toBe(true);
});

Then("le compte de test n'a plus accès à l'application {string}", async ({ monde }, app) => {
    await expect.poll(async () => (await autorises(monde, app)).includes(monde.d.compte.id)).toBe(false);
});

// ---------- Accès aux onglets ----------

/** Case modifiée en parallèle par 02-profils-et-acces (onglet CRA du profil RH) : non comparée */
const CASE_PARTAGEE = 'rh|cra';

const lireOnglets = async (/** @type {Monde} */ monde) => (await adminApi(monde)).ok('GET', '/api/tab-access');

/** Grille affichée : « profil|onglet » → coché */
const grille = async (/** @type {Monde} */ monde) => {
    const cases = monde.page.locator('#tabAccessTable input[data-ta]');
    await expect(cases.first()).toBeVisible();
    return Object.fromEntries(
        await cases.evaluateAll(els =>
            els.map(e => [/** @type {HTMLInputElement} */ (e).dataset.ta, /** @type {HTMLInputElement} */ (e).checked])
        )
    );
};

/** Configuration « profil → onglet → booléen » mise à plat comme la grille */
const aPlat = (/** @type {Record<string, Record<string, boolean>>} */ cfg) =>
    Object.fromEntries(
        Object.entries(cfg).flatMap(([p, onglets]) =>
            Object.entries(onglets).map(([t, v]) => [`${p}|${t}`, p === 'admin' && t === 'admin' ? true : !!v])
        )
    );

const sansCasePartagee = (/** @type {Record<string, boolean>} */ o) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => k !== CASE_PARTAGEE));

Then("la grille d'accès aux onglets présente la configuration enregistrée", async ({ monde }) => {
    const { config } = await lireOnglets(monde);
    monde.d.ongletsInitiaux = config;
    expect(sansCasePartagee(await grille(monde))).toEqual(sansCasePartagee(aPlat(config)));
});

Then("la grille d'accès aux onglets présente les valeurs par défaut", async ({ monde }) => {
    const { defaults } = await lireOnglets(monde);
    expect(await grille(monde)).toEqual(aPlat(defaults));
});

Then('la case {string} du profil {string} est cochée et verrouillée', async ({ monde }, onglet, label) => {
    const c = monde.page.locator(`#tabAccessTable input[data-ta="${profilDe(label).key}|${ongletCle(onglet)}"]`);
    await expect(c).toBeChecked();
    await expect(c).toBeDisabled();
});

When("je rétablis les valeurs par défaut de l'accès aux onglets", async ({ monde }) => {
    await monde.page
        .locator('#tabAccessSection')
        .getByRole('button', { name: 'Rétablir les valeurs par défaut' })
        .click();
});

Then("la configuration enregistrée de l'accès aux onglets est inchangée", async ({ monde }) => {
    const { config } = await lireOnglets(monde);
    expect(sansCasePartagee(aPlat(config))).toEqual(sansCasePartagee(aPlat(monde.d.ongletsInitiaux)));
});
