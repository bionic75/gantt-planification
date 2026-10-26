// @ts-check
// Profils, accès aux onglets, menu Applications, routes réservées
import { expect } from '@playwright/test';
import { profil as profilDe } from '../support/config.js';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { ongletCle } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

async function memoriserAccesOnglets(/** @type {Monde} */ monde) {
    if (monde.d.accesOngletsInitial) return;
    const api = await adminApi(monde);
    const { config } = await api.ok('GET', '/api/tab-access');
    monde.d.accesOngletsInitial = config;
    monde.aNettoyer("configuration de l'accès aux onglets", () => api.put('/api/tab-access', { config }));
}

Given("la configuration de l'accès aux onglets sera rétablie après le scénario", async ({ monde }) => {
    await memoriserAccesOnglets(monde);
});

When("je décoche l'onglet {string} pour le profil {string}", async ({ monde }, onglet, label) => {
    const page = monde.page;
    const caseACocher = page.locator(`#tabAccessTable input[data-ta="${profilDe(label).key}|${ongletCle(onglet)}"]`);
    await expect(caseACocher).toBeVisible();
    await caseACocher.uncheck();
});

When("j'enregistre la configuration de l'accès aux onglets", async ({ monde }) => {
    await monde.page.locator('#tabAccessSection button[onclick="TabAccess.adminSave()"]').click();
});

Then("le message de l'accès aux onglets contient {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#tabAccessMsg')).toContainText(texte);
});

Given("l'onglet {string} est décoché pour le profil {string}", async ({ monde }, onglet, label) => {
    await memoriserAccesOnglets(monde);
    const api = await adminApi(monde);
    const { config } = await api.ok('GET', '/api/tab-access');
    const key = profilDe(label).key;
    await api.ok('PUT', '/api/tab-access', {
        config: { ...config, [key]: { ...config[key], [ongletCle(onglet)]: false } }
    });
});

Given(
    "la configuration de l'accès aux onglets est celle par défaut pour l'onglet {string}",
    async ({ monde }, onglet) => {
        const api = await adminApi(monde);
        const { config, defaults } = await api.ok('GET', '/api/tab-access');
        const k = ongletCle(onglet);
        const ecarts = Object.keys(defaults || {}).filter(p => !!config?.[p]?.[k] !== !!defaults[p]?.[k]);
        if (ecarts.length) {
            await memoriserAccesOnglets(monde);
            const corrige = { ...config };
            for (const p of ecarts) corrige[p] = { ...config[p], [k]: defaults[p][k] };
            await api.ok('PUT', '/api/tab-access', { config: corrige });
        }
    }
);

Then("le contenu de l'onglet {string} est affiché", async ({ monde }, onglet) => {
    const contenu = monde.page.locator(`#${ongletCle(onglet)}.tab-content`);
    await expect(contenu).toHaveClass(/active/);
    await expect(contenu).toBeVisible();
});

// ---------- Menu Applications ----------

Then('le menu Applications est affiché', async ({ monde, $test }) => {
    const { availableApps } = await monde.sessionDe('Administrateur');
    $test.skip(!availableApps?.length, 'Aucune application supplémentaire attribuée au compte administrateur de test');
    await expect(monde.page.locator('#appSwitcher')).toBeVisible();
});

const ouvrirMenuApplications = async (/** @type {import('@playwright/test').Page} */ page) => {
    await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
    if (!(await page.locator('#appSwitcherDropdown').isVisible())) await page.locator('#appSwitcherBtn').click();
    await expect(page.locator('#appSwitcherDropdown')).toBeVisible();
};

/** Ouvre chaque application du menu, vérifie le menu dans l'application puis revient à la Planification */
async function parcourirApplications(/** @type {Monde} */ monde, /** @type {boolean} */ verifierRetour) {
    const page = monde.page;
    await ouvrirMenuApplications(page);
    const applications = (await page.locator('#appSwitcherDropdown > div').allTextContents())
        .map(t => t.trim())
        .filter(Boolean);
    expect(applications.length, 'aucune application proposée').toBeGreaterThan(0);
    for (const app of applications) {
        await ouvrirMenuApplications(page);
        await page.locator('#appSwitcherDropdown > div', { hasText: app }).click();
        await page.waitForTimeout(2500);
        await ouvrirMenuApplications(page);
        if (verifierRetour) await expect(page.locator('#appSwitcherDropdown')).toContainText('Planification');
        await page.locator('#appSwitcherDropdown > div', { hasText: 'Planification' }).click();
        await expect(page.locator('.container').first()).toBeVisible({ timeout: 20000 });
    }
    monde.d.applications = applications;
}

Then(
    'pour chaque application proposée, le menu Applications reste disponible et propose le retour à la Planification',
    async ({ monde }) => {
        await parcourirApplications(monde, true);
    }
);

When("j'ouvre successivement chaque application du menu Applications", async ({ monde }) => {
    await parcourirApplications(monde, false);
});

When("j'ouvre l'application {string} depuis le menu Applications", async ({ monde }, libelle) => {
    const page = monde.page;
    await ouvrirMenuApplications(page);
    await page.locator('#appSwitcherDropdown > div', { hasText: libelle }).click();
});

// ---------- Routes réservées ----------

When('{string} appelle les routes réservées suivantes :', async ({ monde }, label, table) => {
    const api = await monde.apiDe(label);
    monde.d.appels = [];
    for (const { méthode, route } of table.hashes()) {
        const r = await api.appel(méthode, route, méthode === 'GET' ? undefined : {});
        monde.d.appels.push({ appel: `${méthode} ${route}`, ...r });
    }
});

When('un client sans session appelle les routes protégées suivantes :', async ({ monde }, table) => {
    const { api } = await monde.anonyme('sans-session');
    monde.d.appels = [];
    for (const { méthode, route } of table.hashes()) {
        const r = await api.appel(méthode, route, méthode === 'GET' ? undefined : {});
        monde.d.appels.push({ appel: `${méthode} ${route}`, ...r });
    }
});

/** Réponse de refus : un seul champ d'erreur, aucune donnée métier */
const sansDonnees = (/** @type {any} */ data) =>
    data == null ||
    typeof data === 'string' ||
    Object.keys(data).every(k => ['error', 'message', 'authenticated'].includes(k));

Then(/^chaque route répond (\d+) sans renvoyer de données$/, async ({ monde }, statut) => {
    for (const a of monde.d.appels) {
        expect(a.status, a.appel).toBe(Number(statut));
        expect(sansDonnees(a.data), `${a.appel} : ${JSON.stringify(a.data)}`).toBe(true);
    }
});

Then("aucun bouton « Archiver » ou « Désarchiver » n'est proposé", async ({ monde }) => {
    const page = monde.page;
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    await expect(page.locator('#cra button:visible', { hasText: /archiver/i })).toHaveCount(0);
});
