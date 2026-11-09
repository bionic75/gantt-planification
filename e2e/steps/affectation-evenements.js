// @ts-check
// Aide à l'affectation › onglet « Événements » : filtres, recherche, tri, comparaison avec le planning des
// déploiements, suppression, fusion des doublons. Localisation, déploiement et événements de test (2031), supprimés en
// fin de scénario.
import { expect } from '@playwright/test';
import { adminApi, creerDeploiement, creerEvenement, typeParCode } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer } from '../support/interface.js';
import { ouvrirApplication } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const APPLICATION = "Aide à l'affectation opérationnelle";

/** Intitulé de l'événement de test « A », « B »… (préfixe unique au scénario) */
const intitule = (/** @type {Monde} */ monde, /** @type {string} */ nom) => {
    monde.d.prefixeEvenements ??= monde.unique('E2E AFF EVT');
    return `${monde.d.prefixeEvenements} ${nom}`;
};

Given('un déploiement de test a une visite métier du {string} au {string}', async ({ monde }, debut, fin) => {
    await creerDeploiement(monde, { visite: [debut, fin] });
});

async function evenementVisite(/** @type {Monde} */ monde, /** @type {string} */ nom, debut = '', fin = '') {
    const visite = await typeParCode(monde, 'visiteMetier');
    const id = await creerEvenement(monde, {
        startDate: debut,
        endDate: fin || debut,
        label: intitule(monde, nom),
        type_id: visite.id,
        location_id: monde.d.localisation.id
    });
    (monde.d.evenements ??= []).push({ nom, id });
    return id;
}

Given(
    'un événement « Visite métier » de test {string} a lieu du {string} au {string}',
    async ({ monde }, nom, debut, fin) => {
        await evenementVisite(monde, nom, debut, fin);
    }
);

Given('un événement « Visite métier » de test {string} a lieu le {string}', async ({ monde }, nom, jour) => {
    await evenementVisite(monde, nom, jour);
});

Given(
    'un événement « Visite métier » de test {string} en double a lieu du {string} au {string}',
    async ({ monde }, nom, debut, fin) => {
        // Création postérieure (identifiant plus grand) : l'original reste présélectionné pour être conservé
        await evenementVisite(monde, nom, debut, fin);
    }
);

Given("{string} a accès à l'application « Aide à l'affectation opérationnelle »", async ({ monde }, profil) => {
    const api = await adminApi(monde);
    const { userId } = await monde.sessionDe(profil);
    const acces = await api.ok('GET', '/api/app-access');
    if ((acces.affectation?.users ?? []).some((/** @type {any} */ u) => u.id === userId)) return;
    await api.ok('POST', '/api/app-access/affectation/users', { userId });
    monde.aNettoyer(`accès Affectation de ${profil}`, () => api.delete(`/api/app-access/affectation/users/${userId}`));
});

const onglet = (/** @type {Monde} */ monde) => monde.page.locator('#affectationEventsTab');
const lignes = (/** @type {Monde} */ monde) => onglet(monde).locator('tbody tr');
const ligne = (/** @type {Monde} */ monde, /** @type {string} */ nom) =>
    lignes(monde).filter({ has: monde.page.locator('td', { hasText: new RegExp(`^${intitule(monde, nom)}$`) }) });

Given("j'ouvre les événements de l'aide à l'affectation en tant que {string}", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
    const page = monde.page;
    await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
    await page.locator('#appSwitcherBtn').click();
    await page.locator('#appSwitcherDropdown > div', { hasText: APPLICATION }).click();
    await expect(page.locator('#affectationContainer')).toBeVisible({ timeout: 20000 });
    await page.locator('#affectationTabEvents').click();
    await expect(onglet(monde)).toBeVisible();
    await expect(onglet(monde).getByPlaceholder('SAMU, intitulé, participant…')).toBeVisible();
});

const filtres = (/** @type {Monde} */ monde) => onglet(monde).locator('select');

When('je filtre les événements sur le SAMU de test', async ({ monde }) => {
    await filtres(monde).nth(0).selectOption(monde.d.localisation.court);
});

When('je filtre les événements sur le type « Mise en service »', async ({ monde }) => {
    await filtres(monde).nth(1).selectOption({ label: 'Mise en service' });
});

const recherche = (/** @type {Monde} */ monde) => onglet(monde).getByPlaceholder('SAMU, intitulé, participant…');

When("je recherche l'intitulé de l'événement {string}", async ({ monde }, nom) => {
    await recherche(monde).fill(intitule(monde, nom));
});

When("j'efface la recherche des événements", async ({ monde }) => {
    await recherche(monde).fill('');
});

Then('la liste des événements compte {string}', async ({ monde }, texte) => {
    await expect(onglet(monde).getByText(/^\d+ événements?$/)).toHaveText(texte);
});

Then("la liste présente l'événement {string} seulement", async ({ monde }, nom) => {
    await expect(lignes(monde)).toHaveCount(1);
    await expect(ligne(monde, nom)).toHaveCount(1);
});

Then("aucun événement n'est listé pour ces critères", async ({ monde }) => {
    await expect(onglet(monde).getByText('Aucun événement pour ces critères.')).toBeVisible();
});

const cellules = (/** @type {Monde} */ monde, /** @type {string} */ nom) => ligne(monde, nom).locator('td');

Then(
    "l'événement {string} est daté {string}, de type « Visite métier », avec « ✔ mêmes dates »",
    async ({ monde }, nom, dates) => {
        await expect(cellules(monde, nom).nth(0)).toHaveText(monde.d.localisation.court);
        await expect(cellules(monde, nom).nth(1)).toHaveText('Visite métier');
        await expect(cellules(monde, nom).nth(3)).toHaveText(dates);
        await expect(cellules(monde, nom).nth(4)).toHaveText('—');
        await expect(cellules(monde, nom).nth(5)).toContainText('mêmes dates');
    }
);

Then(
    "l'événement {string} est daté {string} et signale « ⚠ activité prévue : {string} »",
    async ({ monde }, nom, dates, prevue) => {
        await expect(cellules(monde, nom).nth(3)).toHaveText(dates);
        await expect(cellules(monde, nom).nth(5)).toContainText(`activité prévue : ${prevue}`);
    }
);

When('je trie les événements par « Intitulé »', async ({ monde }) => {
    await onglet(monde).locator('th', { hasText: 'Intitulé' }).click();
});

Then("les événements sont dans l'ordre {string}", async ({ monde }, ordre) => {
    const attendu = ordre.split(/\s*,\s*/).map(n => intitule(monde, n));
    await expect(lignes(monde).locator('td:nth-child(3)')).toHaveText(attendu);
});

const boutonSupprimer = (/** @type {Monde} */ monde, /** @type {string} */ nom) =>
    onglet(monde).getByRole('button', { name: `Supprimer l'événement ${intitule(monde, nom)}` });

When("je supprime l'événement {string} et j'annule", async ({ monde }, nom) => {
    const texte = await annulerConfirmation(monde, () => boutonSupprimer(monde, nom).click());
    expect(texte).toContain(`Supprimer l'événement « ${intitule(monde, nom)} »`);
});

When("je supprime l'événement {string} et je confirme", async ({ monde }, nom) => {
    const texte = await confirmer(monde, () => boutonSupprimer(monde, nom).click());
    expect(texte).toContain("remise en « Disponible / En attente d'affectation »");
});

Then("un message annonce la suppression de l'événement {string}", async ({ monde }, nom) => {
    await expect(monde.page.getByText(`Événement « ${intitule(monde, nom)} » supprimé.`)).toBeVisible();
});

/** Événements de test encore présents, par intitulé */
async function evenementsDeTest(/** @type {Monde} */ monde, /** @type {string} */ nom) {
    const { events } = await (await adminApi(monde)).ok('GET', '/api/custom-events');
    return events.filter((/** @type {any} */ e) => e.label === intitule(monde, nom));
}

Then("l'événement {string} n'existe plus", async ({ monde }, nom) => {
    expect(await evenementsDeTest(monde, nom)).toHaveLength(0);
});

Then('un seul événement {string} existe encore', async ({ monde }, nom) => {
    const restants = await evenementsDeTest(monde, nom);
    expect(restants).toHaveLength(1);
    // L'original (créé en premier) est conservé
    const original = monde.d.evenements.find((/** @type {any} */ e) => e.nom === nom).id;
    expect(restants[0].id).toBe(original);
});

// ---------- Doublons ----------

const doublons = (/** @type {Monde} */ monde) => monde.page.locator('#affDupModal');
const groupe = (/** @type {Monde} */ monde, /** @type {string} */ nom) =>
    doublons(monde)
        .locator('table')
        .filter({ hasText: intitule(monde, nom) });

When('je recherche les doublons des événements', async ({ monde }) => {
    await onglet(monde)
        .getByRole('button', { name: /Rechercher les doublons/ })
        .click();
    await expect(doublons(monde)).toBeVisible();
    await expect(doublons(monde)).not.toContainText('Recherche des doublons…');
});

Then('les doublons présentent un groupe « Certain » avec les {int} événements {string}', async ({ monde }, n, nom) => {
    const g = groupe(monde, nom);
    await expect(g).toHaveCount(1);
    await expect(g.locator('tbody tr')).toHaveCount(n);
    await expect(g.locator('xpath=preceding-sibling::*[1]')).toContainText('Certain');
});

When('je fusionne le groupe des événements {string} et je confirme', async ({ monde }, nom) => {
    const bouton = groupe(monde, nom)
        .locator('xpath=following-sibling::div[1]')
        .getByRole('button', { name: /Fusionner/ });
    const texte = await confirmer(monde, () => bouton.click());
    expect(texte).toContain(`Conserver « ${intitule(monde, nom)} »`);
});

Then('la fenêtre des doublons annonce {string}', async ({ monde }, message) => {
    await expect(doublons(monde).getByText(message)).toBeVisible();
});

Then("aucun bouton de suppression ni de recherche des doublons n'est proposé", async ({ monde }) => {
    await expect(lignes(monde).first()).toBeVisible();
    await expect(onglet(monde).getByRole('button', { name: /Supprimer l'événement/ })).toHaveCount(0);
    await expect(onglet(monde).getByRole('button', { name: /Rechercher les doublons/ })).toHaveCount(0);
});
