// @ts-check
// Paramétrage des déploiements (onglet Événements / Cartographie) : statuts colorés, SAMU suivis, date de mise en service
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const rubrique = (/** @type {Monde} */ monde) => monde.page.getByTestId('parametrage-deploiements');

When("j'ajoute le statut de déploiement de test", async ({ monde }) => {
    const label = (monde.d.statutDeploiement = monde.unique('Statut E2E'));
    const api = await adminApi(monde);
    monde.aNettoyer(`statut de déploiement ${label}`, async () => {
        const statuts = (await api.ok('GET', '/api/affectation/deployment-statuses')).statuses;
        const s = statuts.find((/** @type {any} */ x) => x.label === label);
        if (s) await api.delete(`/api/affectation/deployment-statuses/${s.id}`);
    });
    await rubrique(monde).getByLabel('Libellé du nouveau statut').fill(label);
    await rubrique(monde).getByRole('button', { name: 'Ajouter', exact: true }).click();
});

Then('le statut de déploiement de test est listé', async ({ monde }) => {
    await expect(rubrique(monde).getByTestId('deploiements-statuts')).toContainText(monde.d.statutDeploiement);
});

/** Ligne du SAMU de test dans le tableau (libellé comparé sans tenir compte de la casse) */
const ligneSamu = (/** @type {Monde} */ monde) =>
    rubrique(monde)
        .getByTestId('deploiements-tableau')
        .locator('tr', { hasText: new RegExp(monde.d.localisation.court, 'i') });

/** Le SAMU de test, une fois ajouté, doit être retiré en fin de scénario */
const nettoyerSamu = async (/** @type {Monde} */ monde) => {
    const api = await adminApi(monde);
    const id = monde.d.localisation.id;
    monde.aNettoyer(`SAMU suivi ${id}`, () => api.delete(`/api/affectation/deployment-samus/${id}`));
};

When("j'ajoute le SAMU de test à la liste des déploiements", async ({ monde }) => {
    await nettoyerSamu(monde);
    // Choisir un SAMU dans la liste l'ajoute aussitôt
    await rubrique(monde).getByLabel('SAMU à ajouter').selectOption(String(monde.d.localisation.id));
    await expect(ligneSamu(monde)).toHaveCount(1);
});

When('je passe le SAMU de test « En service » le {string}', async ({ monde }, date) => {
    const ligne = ligneSamu(monde);
    await ligne.getByRole('combobox').selectOption({ label: 'En service' });
    const champ = ligne.locator('input[type="date"]');
    await expect(champ).toBeVisible();
    await champ.fill(date);
    await champ.blur();
});

/** Statut « En service » et ligne de la carte des déploiements pour le SAMU de test */
const ligneCarte = async (/** @type {Monde} */ monde) => {
    const carte = await (await adminApi(monde)).ok('GET', '/api/affectation/deployment-map');
    const service = carte.statuses.find((/** @type {any} */ s) => s.is_service);
    const d = carte.deployments.find((/** @type {any} */ x) => x.location_id === monde.d.localisation.id);
    return { service, d };
};

Then('le SAMU de test est « En service » depuis le {string}', async ({ monde }, date) => {
    await expect
        .poll(async () => {
            const { service, d } = await ligneCarte(monde);
            return d && d.status_id === service.id ? d.date_mise_en_service : null;
        })
        .toBe(date);
});

Given('le SAMU de test a le statut « En service » depuis le {string}', async ({ monde }, date) => {
    await nettoyerSamu(monde);
    const api = await adminApi(monde);
    const { service } = await ligneCarte(monde);
    const r = await api.put(`/api/affectation/deployment-samus/${monde.d.localisation.id}`, {
        status_id: service.id,
        date_mise_en_service: date
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
});

Then('la carte colore {int} département', async ({ monde }, nombre) => {
    await expect(monde.page.locator('#eventMapModalContainer path.leaflet-interactive')).toHaveCount(nombre);
});

When('je masque le calque « Départements » de la carte', async ({ monde }) => {
    const b = monde.page.locator('#toggleDepartementsMapBtn');
    await expect(b).toContainText('ON');
    await b.click();
});

When("j'affiche le calque « Départements » de la carte", async ({ monde }) => {
    const b = monde.page.locator('#toggleDepartementsMapBtn');
    await expect(b).toContainText('OFF');
    await b.click();
});

Then("la rubrique de paramétrage des déploiements n'est pas affichée", async ({ monde }) => {
    await expect(monde.page.locator('.tab-content.active h2', { hasText: 'Événements / Cartographie' })).toBeVisible();
    await expect(rubrique(monde)).toHaveCount(0);
});
