// @ts-check
// Administration › Gestion des utilisateurs : création, liste, modification, droits, mot de passe, TOTP,
// déconnexion forcée, suppression, détails et journaux (comptes de test uniquement)
import { expect, request } from '@playwright/test';
import { config } from '../support/config.js';
import { adminApi, creerCompte } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer, telecharger } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const PROFILS_FORMULAIRE = /** @type {Record<string, string>} */ ({
    Administrateur: '#adminProfileAdmin',
    'Expert Métier': '#adminProfileExpert',
    Utilisateur: '#adminProfileUser',
    RH: '#adminProfileRh'
});
const DRAPEAUX = /** @type {Record<string, string>} */ ({
    Administrateur: 'is_admin',
    'Expert Métier': 'is_expert',
    Utilisateur: 'is_user',
    RH: 'is_rh'
});

const lireCompte = async (/** @type {Monde} */ monde, /** @type {number} */ id) =>
    (await (await adminApi(monde)).ok('GET', '/api/users')).find((/** @type {any} */ u) => u.id === id);

const ligne = (/** @type {Monde} */ monde, /** @type {string} */ login = monde.d.compte.username) =>
    monde.page.locator('#usersList tr').filter({ hasText: login });

/** Bouton d'action d'une ligne, par son libellé (aria-label) */
const actionLigne = (/** @type {Monde} */ monde, /** @type {string | RegExp} */ nom) =>
    ligne(monde).getByRole('button', { name: nom });

Given('un compte de test RH existe', async ({ monde }) => {
    // Profil RH : jamais soumis à la double authentification, connexion directe par l'API
    monde.d.compte = await creerCompte(monde, { is_user: 0, is_rh: 1 });
});

/** Session ouverte par l'API pour le compte de test (contexte de requêtes propre) */
async function connecter(/** @type {Monde} */ monde, /** @type {string} */ motDePasse) {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    monde.aNettoyer('session du compte de test', () => ctx.dispose());
    const r = await ctx.post('/api/login', { data: { username: monde.d.compte.username, password: motDePasse } });
    return { ctx, statut: r.status() };
}

Given('le compte de test est connecté', async ({ monde }) => {
    const { ctx, statut } = await connecter(monde, monde.d.compte.password);
    expect(statut).toBe(200);
    monde.d.sessionCompte = ctx;
});

// ---------- Création ----------

/** Champs du formulaire de création ; nettoyage du compte enregistré d'après son login */
async function saisirCompte(/** @type {Monde} */ monde, /** @type {string | null} */ profil) {
    const page = monde.page;
    const id = `${monde.suffixe}${++monde.seq}`;
    const login = `e2e.ecran.${id.toLowerCase()}`;
    monde.d.nouveau = { login, prenom: `Ecran${id.toLowerCase()}`, email: `${login}@example.invalid` };
    const api = await adminApi(monde);
    monde.aNettoyer(`compte ${login}`, async () => {
        const u = (await api.ok('GET', '/api/users')).find((/** @type {any} */ x) => x.username === login);
        if (u) await api.delete(`/api/users/${u.id}`);
    });
    await page.locator('#adminUserNom').fill('E2E');
    await page.locator('#adminUserPrenom').fill(monde.d.nouveau.prenom);
    // Sortie du champ Prénom : login « prénom.nom » proposé, remplacé ensuite par la saisie
    await page.locator('#adminUserPrenom').blur();
    await expect(page.locator('#adminUserUsername')).toHaveValue(`${monde.d.nouveau.prenom.toLowerCase()}.e2e`);
    await page.locator('#adminUserUsername').fill(login);
    await page.locator('#adminUserEmail').fill(monde.d.nouveau.email);
    if (profil) await page.locator(PROFILS_FORMULAIRE[profil]).check();
}

const creer = (/** @type {Monde} */ monde) => monde.page.getByRole('button', { name: "Créer l'utilisateur" }).click();

When('je saisis un nouveau compte {string} avec un mot de passe généré', async ({ monde }, profil) => {
    await saisirCompte(monde, profil);
    await monde.page.getByRole('button', { name: 'Générer un mot de passe' }).click();
    const motDePasse = monde.page.locator('#adminUserPassword');
    await expect(motDePasse).not.toHaveValue('');
    monde.d.nouveau.password = await motDePasse.inputValue();
});

When('je saisis un nouveau compte sans profil', async ({ monde }) => {
    await saisirCompte(monde, null);
    await monde.page.locator('#adminUserPassword').fill('Compte-E2E-2026!');
});

When('je coche le profil {string} du nouveau compte', async ({ monde }, profil) => {
    await monde.page.locator(PROFILS_FORMULAIRE[profil]).check();
});

Then('le choix de la ressource associée est proposé', async ({ monde }) => {
    await expect(monde.page.locator('#adminUserResource')).toBeVisible();
});

When('je crée un compte sans renseigner les champs requis', async ({ monde }) => {
    await creer(monde);
});

When('je crée le compte', async ({ monde }) => {
    await creer(monde);
});

When('je crée le compte sans envoyer le mot de passe par e-mail', async ({ monde }) => {
    monde.d.confirmation = await annulerConfirmation(monde, () => creer(monde), 'Ne pas envoyer');
});

Then("la question d'envoi par e-mail mentionnait l'adresse et le mot de passe du compte", async ({ monde }) => {
    expect(monde.d.confirmation).toContain('Voulez-vous envoyer le mot de passe par email');
    expect(monde.d.confirmation).toContain(monde.d.nouveau.email);
    expect(monde.d.confirmation).toContain(monde.d.nouveau.password);
});

Then('la liste des utilisateurs présente le nouveau compte avec le profil {string}', async ({ monde }, profil) => {
    const tr = ligne(monde, monde.d.nouveau.login);
    await expect(tr).toHaveCount(1);
    await expect(tr).toContainText(monde.d.nouveau.prenom);
    await expect(tr).toContainText(profil);
});

Then('le nouveau compte existe avec le profil {string}', async ({ monde }, profil) => {
    const u = (await (await adminApi(monde)).ok('GET', '/api/users')).find(
        (/** @type {any} */ x) => x.username === monde.d.nouveau.login
    );
    expect(u).toMatchObject({ prenom: monde.d.nouveau.prenom, email: monde.d.nouveau.email, actif: 1 });
    expect(u[DRAPEAUX[profil]]).toBe(1);
});

Then('le compteur des utilisateurs indique les comptes actifs et le total', async ({ monde }) => {
    await expect(monde.page.locator('#usersListCount')).toHaveText(/^\(\d+ actifs? \/ \d+ au total\)$/);
});

// ---------- Modification et droits ----------

When('je modifie le compte de test : prénom {string}, profil RH en plus', async ({ monde }, prenom) => {
    const page = monde.page;
    await actionLigne(monde, "Modifier l'utilisateur").click();
    await expect(page.locator('#editUserPrenom')).toBeVisible();
    await page.locator('#editUserPrenom').fill(prenom);
    await page.locator('#editProfileRh').check();
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
});

Then('le compte de test a le prénom {string} et les profils {string} et {string}', async ({ monde }, prenom, a, b) => {
    await expect
        .poll(async () => {
            const u = await lireCompte(monde, monde.d.compte.id);
            return [u.prenom, u[DRAPEAUX[a]], u[DRAPEAUX[b]]];
        })
        .toEqual([prenom, 1, 1]);
});

// Colonnes de la liste : 8 = accès Reporting, 9 = validation RH, 10 = actif
When('je désactive le compte de test depuis la liste', async ({ monde }) => {
    await ligne(monde).locator('td:nth-child(10) .toggle-switch').click();
});

When("je donne au compte de test l'accès Reporting depuis la liste", async ({ monde }) => {
    await ligne(monde).locator('td:nth-child(8) input[type="checkbox"]').check();
});

When('je donne au compte de test la validation RH depuis la liste', async ({ monde }) => {
    await ligne(monde).locator('td:nth-child(9) input[type="checkbox"]').check();
});

const drapeau = (/** @type {Monde} */ monde, /** @type {string} */ cle) =>
    expect.poll(async () => (await lireCompte(monde, monde.d.compte.id))[cle]);

Then('le compte de test est inactif', async ({ monde }) => {
    await drapeau(monde, 'actif').toBe(0);
});

Then("le compte de test a l'accès Reporting", async ({ monde }) => {
    await drapeau(monde, 'has_reporting_access').toBe(1);
});

Then('le compte de test a la validation RH', async ({ monde }) => {
    await drapeau(monde, 'is_rh').toBe(1);
});

// ---------- Mot de passe, déconnexion, TOTP ----------

When(
    "je réinitialise le mot de passe du compte de test en {string} sans l'envoyer par e-mail",
    async ({ monde }, motDePasse) => {
        const page = monde.page;
        await actionLigne(monde, 'Réinitialiser le mot de passe').click();
        await expect(page.locator('#adminResetPassword')).toBeVisible();
        await page.locator('#adminResetPassword').fill(motDePasse);
        await page.locator('#sendPasswordEmail').uncheck();
        await page.locator('#resetPasswordModal').getByRole('button', { name: 'Réinitialiser', exact: true }).click();
    }
);

Then('le nouveau mot de passe {string} est affiché, sans e-mail envoyé', async ({ monde }, motDePasse) => {
    await expect(monde.page.locator('#passwordConfirmValue')).toHaveText(motDePasse);
    await expect(monde.page.locator('#passwordConfirmEmailMsg')).toContainText('Aucun email envoyé');
});

Then('le compte de test se connecte avec le mot de passe {string}', async ({ monde }, motDePasse) => {
    expect((await connecter(monde, motDePasse)).statut).toBe(200);
    expect((await connecter(monde, monde.d.compte.password)).statut).toBe(401);
});

When('je force la déconnexion du compte de test et je confirme', async ({ monde }) => {
    await confirmer(monde, () => actionLigne(monde, 'Déconnecter immédiatement cet utilisateur').click());
});

Then('la session du compte de test est fermée', async ({ monde }) => {
    /** @type {import('@playwright/test').APIRequestContext} */
    const ctx = monde.d.sessionCompte;
    await expect.poll(async () => (await ctx.get('/api/check-session')).status()).toBe(401);
});

When("je réinitialise l'appairage TOTP du compte de test et je confirme", async ({ monde }) => {
    await confirmer(monde, () => actionLigne(monde, /Réinitialiser l'appairage TOTP/).click());
});

// ---------- Détails et journaux ----------

const details = (/** @type {Monde} */ monde) => monde.page.locator('#userDetailsModal');

When("j'ouvre les détails du compte de test", async ({ monde }) => {
    await ligne(monde).locator('td').first().click();
    await expect(details(monde)).toBeVisible();
});

Then('les détails présentent le login du compte de test et ses connexions', async ({ monde }) => {
    await expect(details(monde)).toContainText(monde.d.compte.username);
    await expect(details(monde)).toContainText(/Dernières connexions \([1-9]/);
});

Then("l'export CSV des détails donne le fichier des journaux du compte de test", async ({ monde }) => {
    const { nom, contenu } = await telecharger(monde, details(monde).getByRole('button', { name: /Export CSV/ }));
    expect(nom).toMatch(
        new RegExp(`^logs_${monde.d.compte.username.replace(/\./g, '\\.')}_\\d{4}-\\d{2}-\\d{2}\\.csv$`)
    );
    expect(contenu).toContain('=== LOGS DE CONNEXION ===');
    expect(contenu).toContain(monde.d.compte.username);
});

When('je remets à zéro les connexions du compte de test et je confirme', async ({ monde }) => {
    await confirmer(monde, () => details(monde).getByRole('button', { name: /RAZ/ }).first().click());
});

Then('les détails indiquent {string}', async ({ monde }, texte) => {
    await expect(details(monde)).toContainText(texte);
});

// ---------- Suppression ----------

When('je supprime le compte de test depuis la liste et je confirme', async ({ monde }) => {
    await confirmer(monde, () => actionLigne(monde, "Supprimer l'utilisateur").click());
});

Then('la liste des utilisateurs ne présente plus le compte de test', async ({ monde }) => {
    await expect(ligne(monde)).toHaveCount(0);
});

Then("le compte de test n'existe plus", async ({ monde }) => {
    await expect.poll(async () => !!(await lireCompte(monde, monde.d.compte.id))).toBe(false);
});

// ---------- Tri ----------

When('je trie la liste des utilisateurs par {string}', async ({ monde }, colonne) => {
    await monde.page
        .locator('#usersTable thead th', { hasText: new RegExp(`^\\s*${colonne}`) })
        .first()
        .click();
});

Then(
    /^la liste des utilisateurs est triée par login dans l'ordre (croissant|décroissant)$/,
    async ({ monde }, ordre) => {
        await expect(async () => {
            const logins = (await monde.page.locator('#usersList tr td:nth-child(4)').allTextContents()).map(t =>
                t.trim().toLowerCase()
            );
            const attendu = [...logins].sort((a, b) => a.localeCompare(b));
            if (ordre === 'décroissant') attendu.reverse();
            expect(logins).toEqual(attendu);
        }).toPass({ timeout: 5000 });
    }
);
