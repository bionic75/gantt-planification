// @ts-check
// Fenêtre « Mon profil » (mode d'affichage, onglet par défaut, mot de passe, photo, SAMU de l'expert), nouveautés de
// l'aide et favicon à la connexion (paramètres simulés), bandeau de mise en production (version simulée, horloge du
// navigateur avancée). Comptes de test jetables ; SAMU de l'expert de test rétablis en fin de scénario.
import { expect, request } from '@playwright/test';
import { config } from '../support/config.js';
import { ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */

const fenetre = (/** @type {Page} */ page) => page.locator('#profilePhotoModal');

/** Image PNG de 2 × 2 pixels */
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDGgAcYwAwBUsQIDdDHrmgAAAABJRU5ErkJggg==',
    'base64'
);

When("j'ouvre la fenêtre de mon profil", async ({ monde }) => {
    const page = monde.page;
    // Rond de l'utilisateur dans l'en-tête de la Planification
    await page.locator('#profileCircle').click();
    await expect(fenetre(page)).toBeVisible();
});

// ---------- Mode d'affichage ----------

When("je choisis le mode d'affichage {string}", async ({ monde }, libelle) => {
    await fenetre(monde.page).getByLabel(libelle, { exact: false }).first().check();
});

Then("l'application est affichée en mode {word}", async ({ monde }, mode) => {
    const html = monde.page.locator('html');
    if (mode === 'sombre') await expect(html).toHaveClass(/dark-mode/);
    else await expect(html).not.toHaveClass(/dark-mode/);
    const memorise = await monde.page.evaluate(() => localStorage.getItem('gp_color_mode'));
    expect(memorise).toBe(mode === 'sombre' ? 'dark' : 'light');
});

// ---------- Onglet par défaut ----------

/** Liste des onglets proposés (bouton de la liste à icônes) */
async function ouvrirOnglets(/** @type {Page} */ page) {
    const liste = fenetre(page).locator('#defaultTabPicker');
    if (!(await liste.locator('[role="option"]').first().isVisible())) await liste.locator('button').first().click();
    await expect(liste.locator('[role="option"]').first()).toBeVisible();
    return liste;
}

When("je choisis le premier onglet proposé après l'Accueil comme onglet par défaut", async ({ monde }) => {
    const liste = await ouvrirOnglets(monde.page);
    const option = liste.locator('[role="option"]:not([data-tab="accueil"])').first();
    monde.d.ongletDefaut = {
        cle: await option.getAttribute('data-tab'),
        libelle: ((await option.textContent()) ?? '').trim()
    };
    await option.click();
});

When("je choisis l'Accueil comme onglet par défaut", async ({ monde }) => {
    const liste = await ouvrirOnglets(monde.page);
    await liste.locator('[role="option"][data-tab="accueil"]').click();
    monde.d.ongletDefaut = { cle: 'accueil', libelle: 'Accueil' };
});

Then("un message confirme l'onglet par défaut choisi", async ({ monde }) => {
    await expect(
        monde.page.getByText(`Onglet par défaut : ${monde.d.ongletDefaut.libelle}`, { exact: false })
    ).toBeVisible();
});

Then("la connexion du compte de test indique l'onglet par défaut choisi", async ({ monde }) => {
    const c = monde.d.compteEntete;
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const r = await ctx.post('/api/login', { data: { username: c.username, password: c.password, profile: 'rh' } });
    const data = await r.json();
    await ctx.dispose();
    expect(data.user?.defaultTab, JSON.stringify(data)).toBe(monde.d.ongletDefaut.cle);
});

// ---------- Mot de passe ----------

When('je saisis le nouveau mot de passe {string} dans mon profil', async ({ monde }, motDePasse) => {
    await monde.page.locator('#newPassword').fill(motDePasse);
});

When('je saisis le nouveau mot de passe {string} et sa confirmation dans mon profil', async ({ monde }, motDePasse) => {
    monde.d.nouveauMotDePasse = motDePasse;
    await monde.page.locator('#newPassword').fill(motDePasse);
    await monde.page.locator('#confirmPassword').fill(motDePasse);
});

Then('mon profil signale {string}', async ({ monde }, message) => {
    await expect(fenetre(monde.page)).toContainText(message);
});

When('je change le mot de passe de mon profil et confirme', async ({ monde }) => {
    await confirmer(monde, () =>
        fenetre(monde.page)
            .getByRole('button', { name: /Changer le mot de passe/ })
            .click()
    );
    // Message dans la fenêtre, ou fenêtre du navigateur (ancien écran, acceptée par le monde)
    await expect
        .poll(async () => `${monde.dialogues.join('\n')} ${await fenetre(monde.page).textContent()}`)
        .toContain('Mot de passe changé avec succès');
});

Then('le nouveau mot de passe du compte de test est accepté', async ({ monde }) => {
    const c = monde.d.compteEntete;
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const r = await ctx.post('/api/login', {
        data: { username: c.username, password: monde.d.nouveauMotDePasse, profile: 'rh' }
    });
    expect(r.status()).toBe(200);
    await ctx.dispose();
});

// ---------- Photo ----------

When('je choisis une image de test comme photo de profil', async ({ monde }) => {
    await fenetre(monde.page)
        .locator('input[type="file"]')
        .setInputFiles({ name: 'photo-e2e.png', mimeType: 'image/png', buffer: PNG });
});

Then("l'aperçu de mon profil présente la photo choisie", async ({ monde }) => {
    await expect(fenetre(monde.page).locator('img[src^="data:image/png"]')).toBeVisible();
});

When("j'enregistre la photo de mon profil", async ({ monde }) => {
    await fenetre(monde.page)
        .getByRole('button', { name: /Valider la photo/ })
        .click();
});

Then("la photo du compte de test est enregistrée et affichée dans l'en-tête", async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#profilePhoto')).toHaveAttribute('src', /^data:image\/png/, { timeout: 15000 });
    await expect(page.locator('#profilePhoto')).toBeVisible();
    const s = await (await page.request.get('/api/check-session')).json();
    expect(String(s.profilePhoto)).toMatch(/^data:image\/png/);
});

// ---------- SAMU de l'expert ----------

/** SAMU d'une ressource par rôle (lignes { role, samu } de l'API) */
async function samuDe(/** @type {any} */ api, /** @type {number} */ resourceId) {
    const lignes = /** @type {{ role: string, samu: string }[]} */ (
        await api.ok('GET', `/api/resources/${resourceId}/samu-assignments`)
    );
    const role = (/** @type {string} */ r) => lignes.filter(l => l.role === r).map(l => l.samu);
    return { principal: role('principal'), secondaire: role('secondaire') };
}

Given("les SAMU de l'expert de test seront rétablis après le scénario", async ({ monde }) => {
    const { resourceId } = await ressourceExpert(monde);
    const api = await monde.apiDe('Expert');
    const avant = await samuDe(api, resourceId);
    monde.d.samuExpert = { resourceId };
    monde.aNettoyer("SAMU de l'expert de test", () => api.put('/api/me/samu-assignments', avant));
});

When("j'ajoute {string} aux SAMU dont je suis expert principal", async ({ monde }, samu) => {
    const zone = fenetre(monde.page);
    const champ = zone.locator('input[placeholder="Taper le nom d\'un SAMU..."]').first();
    await champ.click();
    await champ.fill(samu);
    await zone.getByText(samu, { exact: true }).last().click();
    // Suggestions fermées par un clic ailleurs (elles se rouvrent quand le champ reprend le focus ; Échap fermerait la
    // fenêtre)
    await zone.getByRole('heading', { name: /Mes affectations SAMU/ }).click();
});

When("j'enregistre mes SAMU", async ({ monde }) => {
    await fenetre(monde.page)
        .getByRole('button', { name: /Enregistrer mes affectations SAMU/ })
        .click();
    await expect(fenetre(monde.page).getByText('Affectations sauvegardées')).toBeVisible();
});

Then("les SAMU de l'expert de test comprennent {string} en principal", async ({ monde }, samu) => {
    const api = await monde.apiDe('Expert');
    const a = await samuDe(api, monde.d.samuExpert.resourceId);
    expect(a.principal).toContain(samu);
});

// ---------- Nouveautés de l'aide et favicon (paramètres simulés) ----------

Given(
    "la publication de l'aide {string} et le favicon {string} seront lus à la connexion \\(réponse simulée)",
    async ({ monde }, version, favicon) => {
        const { page } = await monde.anonyme();
        const horodatage = `${Date.now()}`;
        await page.route('**/api/settings', (/** @type {Route} */ route) =>
            route.request().method() === 'GET'
                ? route.fulfill({
                      status: 200,
                      contentType: 'application/json',
                      body: JSON.stringify({
                          help_publication_enabled: 'true',
                          help_publication_version: version,
                          help_publication_timestamp: horodatage,
                          favicon
                      })
                  })
                : route.continue()
        );
    }
);

const fenetreNouveautes = (/** @type {Page} */ page) => page.locator('#helpVersionModal');

Then('la fenêtre des nouveautés présente la version {string}', async ({ monde }, version) => {
    await expect(fenetreNouveautes(monde.page)).toBeVisible({ timeout: 15000 });
    await expect(fenetreNouveautes(monde.page)).toContainText(`Nouveautés de la version ${version}`);
});

Then('le favicon de la page est {string}', async ({ monde }, favicon) => {
    await expect(monde.page.locator('link[rel="icon"]')).toHaveAttribute(
        'href',
        new RegExp(`favicon-${favicon}\\.svg`)
    );
});

When('je ferme la fenêtre des nouveautés', async ({ monde }) => {
    await fenetreNouveautes(monde.page)
        .getByRole('button', { name: /J'ai pris connaissance des nouveautés/ })
        .click();
});

Then('la fenêtre des nouveautés est fermée', async ({ monde }) => {
    await expect(fenetreNouveautes(monde.page)).toBeHidden();
});

// ---------- Bandeau de mise en production (version simulée) ----------

Given("la version de l'application est simulée", async ({ monde }) => {
    const { page } = await monde.anonyme();
    monde.d.versionSimulee = /** @type {string | null} */ ('v-e2e-1');
    await page.clock.install();
    await page.route('**/api/version', (/** @type {Route} */ route) =>
        monde.d.versionSimulee
            ? route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: JSON.stringify({ version: monde.d.versionSimulee })
              })
            : route.abort()
    );
});

/** Relecture de la version par le bandeau (premier contrôle 5 s après le chargement, puis toutes les 30 s) */
const relire = (/** @type {Page} */ page) => page.clock.runFor(31000);

When('la version {string} est relue', async ({ monde }, version) => {
    monde.d.versionSimulee = version;
    await relire(monde.page);
});

When('le serveur ne répond plus pendant {int} relectures', async ({ monde }, n) => {
    monde.d.versionSimulee = null;
    for (let i = 0; i < n; i++) await relire(monde.page);
});

const bandeau = (/** @type {Page} */ page) => page.locator('#deployBanner');

Then("aucun bandeau de mise en production n'est affiché", async ({ monde }) => {
    await expect(bandeau(monde.page)).toBeHidden();
});

Then('le bandeau annonce la nouvelle version {string}', async ({ monde }, version) => {
    await expect(bandeau(monde.page)).toBeVisible();
    await expect(bandeau(monde.page)).toContainText(`Nouvelle version disponible (${version})`);
    await expect(bandeau(monde.page).getByRole('button', { name: /Recharger/ })).toBeVisible();
});

When('je masque le bandeau de mise en production', async ({ monde }) => {
    await bandeau(monde.page).getByRole('button', { name: 'Masquer' }).click();
});

Then('le bandeau annonce une mise en production en cours', async ({ monde }) => {
    await expect(bandeau(monde.page)).toBeVisible();
    await expect(bandeau(monde.page)).toContainText('Mise en production en cours');
});
