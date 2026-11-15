// @ts-check
// Paramétrage des déploiements (onglet Événements / Cartographie) : statuts colorés, statut et date de mise en service
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
    await rubrique(monde).getByRole('button', { name: 'Ajouter' }).click();
});

Then('le statut de déploiement de test est listé', async ({ monde }) => {
    await expect(rubrique(monde).getByTestId('deploiements-statuts')).toContainText(monde.d.statutDeploiement);
});

When('je passe le déploiement de test « En service » le {string}', async ({ monde }, date) => {
    const nom = monde.d.deploiement.samu_name;
    const ligne = rubrique(monde).getByTestId('deploiements-tableau').locator('tr', { hasText: nom });
    await ligne.getByLabel(`Statut de ${nom}`).selectOption({ label: 'En service' });
    const champ = ligne.getByLabel(`Date de mise en service de ${nom}`);
    await expect(champ).toBeVisible();
    await champ.fill(date);
    await champ.blur();
});

Then('le déploiement de test est « En service » depuis le {string} sur la carte', async ({ monde }, date) => {
    const api = await adminApi(monde);
    await expect
        .poll(async () => {
            const carte = await api.ok('GET', '/api/affectation/deployment-map');
            const service = carte.statuses.find((/** @type {any} */ s) => s.is_service);
            const d = carte.deployments.find((/** @type {any} */ x) => x.id === monde.d.deploiement.id);
            return d && d.status_id === service.id ? d.date_mise_en_service : null;
        })
        .toBe(date);
});

Then("la rubrique de paramétrage des déploiements n'est pas affichée", async ({ monde }) => {
    await expect(monde.page.locator('.tab-content.active h2', { hasText: 'Événements / Cartographie' })).toBeVisible();
    await expect(rubrique(monde)).toHaveCount(0);
});

Given('le déploiement de test est « En service » depuis le {string}', async ({ monde }, date) => {
    const api = await adminApi(monde);
    const service = (await api.ok('GET', '/api/affectation/deployment-statuses')).statuses.find(
        (/** @type {any} */ s) => s.is_service
    );
    const r = await api.put(`/api/affectation/projects/${monde.d.deploiement.id}/status`, {
        status_id: service.id,
        date_mise_en_service: date
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
});

When("j'ouvre la carte des événements", async ({ monde }) => {
    await monde.page
        .locator('#evenements')
        .getByRole('button', { name: /Carte des Événements/ })
        .click();
    await expect(monde.page.locator('#modalMapEventCount')).not.toHaveText('');
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
