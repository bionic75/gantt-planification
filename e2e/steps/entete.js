// @ts-check
// En-tête de la Planification : utilisateur et profil, changement de profil, boutons, déconnexion. Comptes de test
// jetables (profils RH et Utilisateur), supprimés en fin de scénario ; session ouverte pour le scénario.
import { expect } from '@playwright/test';
import { PROFILS } from '../support/config.js';
import { connexionBureau } from '../support/connexion.js';
import { creerCompte } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const LIBELLES = /** @type {Record<string, string>} */ ({ RH: 'rh', Utilisateur: 'user' });

Given('un compte de test a les profils RH et Utilisateur', async ({ monde }) => {
    monde.d.compteEntete = await creerCompte(monde, { is_rh: 1, is_user: 1 });
});

Given("un compte de test n'a que le profil RH", async ({ monde }) => {
    monde.d.compteEntete = await creerCompte(monde, { is_rh: 1, is_user: 0 });
});

When('je me connecte avec ce compte de test et le profil {string}', async ({ monde }, libelle) => {
    const c = monde.d.compteEntete;
    const { page } = await monde.anonyme();
    // Profil RH : jamais soumis à la double authentification
    const r = await connexionBureau(page, {
        ...PROFILS.rh,
        key: /** @type {any} */ (LIBELLES[libelle]),
        label: c.username,
        login: c.username,
        password: c.password,
        mfa: false
    });
    // Compte créé par un administrateur : mot de passe à remplacer avant d'entrer dans l'application
    if (r.etat === 'mot-de-passe-a-changer') {
        c.password = `${c.password}-2`;
        await page.locator('#forcedNewPassword').fill(c.password);
        await page.locator('#forcedConfirmPassword').fill(c.password);
        await page.locator('#forcedPasswordButton').click();
    } else expect(r.etat, r.message || '').toBe('application');
    await expect(page.locator('#userInfo')).toBeVisible({ timeout: 30000 });
});

Then("l'en-tête présente le compte de test avec le profil {string}", async ({ monde }, libelle) => {
    const page = monde.page;
    const c = monde.d.compteEntete;
    await expect(page.locator('#userDisplayName')).toHaveText(`${c.nom.toUpperCase()} ${c.prenom}`, {
        ignoreCase: true
    });
    const selecteur = page.locator('#profileSwitcherLabel');
    const role = (await selecteur.isVisible()) ? selecteur : page.locator('#userDisplayRole');
    await expect(role).toHaveText(libelle);
});

Then("l'enveloppe des invitations n'est pas proposée", async ({ monde }) => {
    await expect(monde.page.locator('#sendEmailBtn')).toBeHidden();
});

Then("l'enveloppe des invitations est proposée", async ({ monde }) => {
    await expect(monde.page.locator('#sendEmailBtn')).toBeAttached();
    await expect(monde.page.locator('#sendEmailBtn')).not.toHaveCSS('display', 'none');
});

When("j'ouvre la liste des profils de l'en-tête", async ({ monde }) => {
    await monde.page.locator('#profileSwitcherBtn').click();
    await expect(monde.page.locator('#profileDropdown')).toBeVisible();
});

Then('la liste des profils propose {string}, profil actif, et {string}', async ({ monde }, actif, autre) => {
    const liste = monde.page.locator('#profileDropdown');
    await expect(liste.locator(':scope > *')).toHaveCount(2);
    await expect(liste.locator(':scope > *', { hasText: actif })).toContainText('✓');
    await expect(liste.locator(':scope > *', { hasText: autre })).not.toContainText('✓');
});

When("je choisis le profil {string} dans l'en-tête", async ({ monde }, libelle) => {
    const page = monde.page;
    // Changement de profil : page rechargée
    await Promise.all([page.waitForEvent('load'), page.locator('#profileDropdown > *', { hasText: libelle }).click()]);
    await expect(page.locator('#userInfo')).toBeVisible({ timeout: 30000 });
});

Then('la session du compte de test a le profil {string}', async ({ monde }, libelle) => {
    const s = await (await monde.page.request.get('/api/check-session')).json();
    expect(s.activeProfile).toBe(LIBELLES[libelle]);
});

Then("l'en-tête ne propose pas de changement de profil", async ({ monde }) => {
    await expect(monde.page.locator('#profileSwitcherBtn')).toBeHidden();
});

When("je clique sur le bouton d'aide en ligne de l'en-tête", async ({ monde }) => {
    const page = monde.page;
    [monde.d.fenetreAide] = await Promise.all([page.waitForEvent('popup'), page.locator('#helpBtn').click()]);
});

Then("l'aide en ligne s'ouvre dans une nouvelle fenêtre", async ({ monde }) => {
    const aide = monde.d.fenetreAide;
    await aide.waitForLoadState();
    expect(new URL(aide.url()).pathname).toBe('/aide.html');
    monde.aNettoyer("fenêtre de l'aide en ligne", () => aide.close().catch(() => {}));
});

When("je clique sur le bouton Accueil de l'en-tête", async ({ monde }) => {
    await monde.page.locator('#homeBtn').click();
});

Then("l'accueil de la Planification est affiché", async ({ monde }) => {
    const accueil = monde.page.locator('#accueil.tab-content');
    await expect(accueil).toHaveClass(/active/);
    await expect(accueil).toBeVisible();
});

When("je clique sur l'icône de déconnexion et annule", async ({ monde }) => {
    monde.d.texteConfirmation = await annulerConfirmation(monde, () =>
        monde.page.locator('#userInfo ~ .tabs .logout-icon, #mainTabsContainer .logout-icon').first().click()
    );
});

Then("l'application reste ouverte", async ({ monde }) => {
    expect(monde.d.texteConfirmation).toContain('Voulez-vous vraiment vous déconnecter ?');
    await expect(monde.page.locator('#userInfo')).toBeVisible();
    await expect(monde.page.locator('#loginPage')).not.toHaveClass(/active/);
    expect((await monde.page.request.get('/api/check-session')).status()).toBe(200);
});
