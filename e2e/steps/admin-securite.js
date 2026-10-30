// @ts-check
// Administration › Sécurité et messagerie : configuration SMTP, double authentification, clés d'API, connexion Asana
import { expect, request } from '@playwright/test';
import { config } from '../support/config.js';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

// ---------- Configuration Email (SMTP) ----------

const lireSmtp = async (/** @type {Monde} */ monde) => (await adminApi(monde)).ok('GET', '/api/email-config');

Given('la configuration SMTP sera rétablie après le scénario', async ({ monde }) => {
    const api = await adminApi(monde);
    const initiale = await lireSmtp(monde);
    monde.d.smtpInitial = initiale;
    // Mot de passe vide : celui enregistré est conservé
    monde.aNettoyer('configuration SMTP', () =>
        api.post('/api/email-config', {
            host: initiale.host,
            port: initiale.port,
            secure: !!initiale.secure,
            user: initiale.user,
            password: ''
        })
    );
});

Then('la configuration SMTP affichée est celle enregistrée', async ({ monde }) => {
    const page = monde.page;
    const c = await lireSmtp(monde);
    await expect(page.locator('#smtpHost')).toHaveValue(c.host || 'smtp.office365.com');
    await expect(page.locator('#smtpPort')).toHaveValue(String(c.port || 587));
    await expect(page.locator('#smtpUser')).toHaveValue(c.user || '');
});

Then("le champ mot de passe SMTP est vide et indique qu'un mot de passe est enregistré", async ({ monde }) => {
    const champ = monde.page.locator('#smtpPassword');
    expect((await lireSmtp(monde)).passwordSet, 'aucun mot de passe SMTP enregistré').toBeTruthy();
    await expect(champ).toHaveValue('');
    await expect(champ).toHaveAttribute('placeholder', /Mot de passe enregistré/);
});

When("je vide l'e-mail expéditeur SMTP", async ({ monde }) => {
    await monde.page.locator('#smtpUser').fill('');
});

When("j'enregistre la configuration SMTP", async ({ monde }) => {
    await monde.page.getByRole('button', { name: /Sauvegarder la config email/ }).click();
});

Then('la configuration SMTP enregistrée est inchangée, avec un mot de passe toujours enregistré', async ({ monde }) => {
    const avant = monde.d.smtpInitial;
    await expect
        .poll(async () => {
            const c = await lireSmtp(monde);
            return [c.host, c.port, c.user, !!c.passwordSet];
        })
        .toEqual([avant.host, avant.port, avant.user, true]);
});

// ---------- Double authentification ----------

const lireMfa = async (/** @type {Monde} */ monde) =>
    (await (await adminApi(monde)).ok('GET', '/api/mfa/config')).config;

Given('la configuration MFA sera rétablie après le scénario', async ({ monde }) => {
    const api = await adminApi(monde);
    const initiale = await lireMfa(monde);
    monde.d.mfaInitiale = initiale;
    monde.aNettoyer('configuration MFA', () => api.post('/api/mfa/config', { config: initiale }));
});

Then('la configuration MFA affichée est celle enregistrée', async ({ monde }) => {
    const page = monde.page;
    const c = (await lireMfa(monde)) || {};
    const coche = (/** @type {string} */ sel, /** @type {boolean} */ oui) =>
        oui ? expect(page.locator(sel)).toBeChecked() : expect(page.locator(sel)).not.toBeChecked();
    await coche('#mfaEnabled', !!c.enabled);
    if (!c.enabled) return;
    await expect(page.locator(`input[name="mfaMethod"][value="${c.method || 'email'}"]`)).toBeChecked();
    await expect(page.locator('#mfaFrequency')).toHaveValue(c.frequency || 'daily');
    await coche('#mfaProfileAdmin', c.profileAdmin !== false);
    await coche('#mfaProfileExpert', !!c.profileExpert);
    await coche('#mfaProfileUser', !!c.profileUser);
    await expect(page.locator('#mfaCodeValidity')).toHaveValue(String(c.codeValidity || 10));
});

When('je choisis une autre durée de validité du code e-mail', async ({ monde }) => {
    const liste = monde.page.locator('#mfaCodeValidity');
    await expect(liste).toBeVisible();
    const actuelle = await liste.inputValue();
    const valeurs = await liste
        .locator('option')
        .evaluateAll(os => os.map(o => /** @type {HTMLOptionElement} */ (o).value));
    const autre = /** @type {string} */ (valeurs.find(v => v !== actuelle));
    monde.d.validiteChoisie = Number(autre);
    await liste.selectOption(autre);
});

Then(
    'la durée de validité enregistrée est celle choisie, le reste de la configuration MFA est inchangé',
    async ({ monde }) => {
        const attendu = { ...monde.d.mfaInitiale, codeValidity: monde.d.validiteChoisie };
        await expect.poll(async () => lireMfa(monde)).toEqual(attendu);
    }
);

When("je demande la réinitialisation du MFA de tous les utilisateurs puis j'annule", async ({ monde }) => {
    const page = monde.page;
    monde.d.reinitialisationsMfa = 0;
    page.on('request', r => {
        if (r.url().includes('/api/mfa/reset-all')) monde.d.reinitialisationsMfa++;
    });
    monde.d.confirmation = await annulerConfirmation(monde, () =>
        page.getByRole('button', { name: /Réinitialiser le MFA de tous les utilisateurs/ }).click()
    );
});

Then("aucune réinitialisation du MFA n'a été envoyée au serveur", async ({ monde }) => {
    await monde.page.waitForTimeout(500);
    expect(monde.d.reinitialisationsMfa).toBe(0);
});

// ---------- Clés d'API ----------

const appelPublic = async (/** @type {string} */ cleApi) => {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    try {
        return (await ctx.get('/api/public/events', { headers: { 'X-Api-Key': cleApi } })).status();
    } finally {
        await ctx.dispose();
    }
};

const ligneCle = (/** @type {Monde} */ monde) =>
    monde.page.locator('#apiKeysTableContainer tbody tr').filter({ hasText: monde.d.libelleCle });

When("je génère une clé d'API", async ({ monde }) => {
    const libelle = monde.unique('E2E Clé');
    monde.d.libelleCle = libelle;
    const api = await adminApi(monde);
    monde.aNettoyer(`clé d'API ${libelle}`, async () => {
        for (const k of (await api.ok('GET', '/api/admin/api-keys')).filter(
            (/** @type {any} */ x) => x.label === libelle
        ))
            await api.delete(`/api/admin/api-keys/${k.id}/permanent`);
    });
    await monde.page.locator('#apiKeyLabel').fill(libelle);
    await monde.page.getByRole('button', { name: /Générer une clé/ }).click();
});

When("je génère une clé d'API sans libellé", async ({ monde }) => {
    await monde.page.locator('#apiKeyLabel').fill('');
    await monde.page.getByRole('button', { name: /Générer une clé/ }).click();
});

Then(
    "la nouvelle clé est affichée une seule fois et donne accès à l'API publique des événements",
    async ({ monde }) => {
        const valeur = monde.page.locator('#apiKeyValue');
        await expect(valeur).toHaveText(/^ans_[0-9a-f]{48}$/);
        monde.d.cleApi = ((await valeur.textContent()) || '').trim();
        await expect(monde.page.getByText('elle ne sera plus affichée')).toBeVisible();
        expect(await appelPublic(monde.d.cleApi)).toBe(200);
    }
);

Then('la liste des clés présente la nouvelle clé « Active » avec son préfixe', async ({ monde }) => {
    const ligne = ligneCle(monde);
    await expect(ligne).toHaveCount(1);
    await expect(ligne).toContainText(monde.d.cleApi.slice(0, 12));
    await expect(ligne).toContainText('Active');
});

When('je révoque la nouvelle clé et je confirme', async ({ monde }) => {
    monde.d.confirmation = await confirmer(monde, () =>
        ligneCle(monde).getByRole('button', { name: 'Révoquer' }).click()
    );
});

Then('la liste des clés présente la nouvelle clé « Révoquée »', async ({ monde }) => {
    await expect(ligneCle(monde)).toContainText('Révoquée');
    await expect(ligneCle(monde).getByRole('button', { name: 'Révoquer' })).toHaveCount(0);
});

Then("l'API publique des événements refuse la nouvelle clé", async ({ monde }) => {
    expect(await appelPublic(monde.d.cleApi)).toBe(401);
});

// ---------- Connexion Asana ----------

const lireAsana = async (/** @type {Monde} */ monde) =>
    (await adminApi(monde)).ok('GET', '/api/affectation/asana/config');
const boiteAsana = (/** @type {Monde} */ monde) => monde.page.locator('#asanaCfgBox');

Given('le filtre Asana sera rétabli après le scénario', async ({ monde }) => {
    const api = await adminApi(monde);
    const { nameFilter } = await lireAsana(monde);
    monde.aNettoyer('filtre Asana', () => api.put('/api/affectation/asana/config', { nameFilter }));
});

Then("l'état du jeton Asana affiché correspond à la configuration", async ({ monde }) => {
    const { tokenSet } = await lireAsana(monde);
    await expect(boiteAsana(monde)).toContainText(tokenSet ? 'enregistré' : 'non configuré');
    await expect(monde.page.locator('#asanaTokenInput')).toHaveValue('');
});

When("j'enregistre un jeton Asana vide", async ({ monde }) => {
    await monde.page.locator('#asanaTokenInput').fill('');
    await boiteAsana(monde).getByRole('button', { name: 'Enregistrer', exact: true }).click();
});

When("j'enregistre le filtre Asana {string}", async ({ monde }, filtre) => {
    await expect(monde.page.locator('#asanaFilterInput')).toBeVisible();
    await monde.page.locator('#asanaFilterInput').fill(filtre);
    await boiteAsana(monde).getByRole('button', { name: 'Enregistrer le filtre' }).click();
});

Then('le message Asana indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#asanaCfgMsg')).toContainText(texte);
});

Then('le filtre Asana enregistré est {string}', async ({ monde }, filtre) => {
    await expect.poll(async () => (await lireAsana(monde)).nameFilter).toBe(filtre);
});
