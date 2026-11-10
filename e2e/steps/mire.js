// @ts-check
// Mire de connexion : identifiants mémorisés sur le poste, affichage du mot de passe, choix du profil, mot de passe
// oublié, lien de réinitialisation, étapes de la double authentification. Les réponses de l'API qui enverraient un
// message ou dépendent de la configuration de la double authentification sont simulées (page.route).
import { expect } from '@playwright/test';
import { creerCompte } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */

const CHAMPS = /** @type {Record<string, string>} */ ({
    Identifiant: '#loginUsername',
    'Mot de passe': '#loginPassword'
});
const champ = (/** @type {string} */ libelle) => {
    const sel = CHAMPS[libelle];
    if (!sel) throw new Error(`Champ de la mire inconnu : ${libelle}`);
    return sel;
};

/** Réponse JSON simulée */
const json = (/** @type {Route} */ route, /** @type {unknown} */ corps, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });

/** Image PNG d'un pixel (QR code simulé) */
const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const mireAffichee = async (/** @type {Page} */ page) => {
    await expect(page.locator('#loginPage')).toHaveClass(/active/, { timeout: 30000 });
    await expect(page.locator('#loginUsername')).toBeVisible();
};

/** Ligne d'un identifiant proposé sous le champ « Identifiant » */
const proposition = (/** @type {Page} */ page, /** @type {string} */ login) =>
    page.locator('#loginSuggest > *').filter({ has: page.getByText(login, { exact: true }) });

// ---------- Identifiants mémorisés ----------

Given('le navigateur ne propose pas son gestionnaire de mots de passe', async ({ monde }) => {
    const { context } = await monde.anonyme();
    // Gestionnaire du navigateur (Credential Management) absent : la mire propose ses propres identifiants
    await context.addInitScript(() => {
        // @ts-ignore -- propriété de la fenêtre retirée pour la page de test
        delete window.PasswordCredential;
    });
});

Given('ce poste a déjà servi aux identifiants {string} et {string}', async ({ monde }, a, b) => {
    const { context } = await monde.anonyme();
    await context.addInitScript(
        logins => {
            try {
                localStorage.setItem('gp_known_logins', JSON.stringify(logins));
            } catch {
                /* stockage indisponible */
            }
        },
        [a, b]
    );
});

When('je saisis {string} dans le champ {string} de la mire', async ({ monde }, valeur, libelle) => {
    await monde.page.locator(champ(libelle)).fill(valeur);
});

Then('la mire propose les identifiants {string} et {string}', async ({ monde }, a, b) => {
    await expect(proposition(monde.page, a)).toBeVisible();
    await expect(proposition(monde.page, b)).toBeVisible();
});

When("j'oublie l'identifiant proposé {string}", async ({ monde }, login) => {
    await proposition(monde.page, login).getByTitle('Oublier cet identifiant').click();
});

Then("la mire propose seulement l'identifiant {string}", async ({ monde }, login) => {
    await expect(proposition(monde.page, login)).toBeVisible();
    await expect(monde.page.locator('#loginSuggest').getByText(/^e2e\.mire\./)).toHaveCount(1);
    const memorises = await monde.page.evaluate(() => localStorage.getItem('gp_known_logins'));
    expect(JSON.parse(memorises || '[]')).toEqual([login]);
});

When("je choisis l'identifiant proposé {string}", async ({ monde }, login) => {
    await proposition(monde.page, login).getByText(login, { exact: true }).click();
});

Then('le champ {string} de la mire contient {string}', async ({ monde }, libelle, valeur) => {
    await expect(monde.page.locator(champ(libelle))).toHaveValue(valeur);
});

Then("la mire ne propose plus d'identifiant", async ({ monde }) => {
    await expect(monde.page.locator('#loginSuggest')).toBeHidden();
});

// ---------- Mot de passe affiché ----------

When("je clique sur le bouton d'affichage du mot de passe", async ({ monde }) => {
    await monde.page.getByRole('button', { name: 'Afficher ou masquer le mot de passe' }).click();
});

Then('le mot de passe saisi est lisible', async ({ monde }) => {
    await expect(monde.page.locator('#loginPassword')).toHaveAttribute('type', 'text');
});

Then('le mot de passe saisi est masqué', async ({ monde }) => {
    await expect(monde.page.locator('#loginPassword')).toHaveAttribute('type', 'password');
});

// ---------- Choix du profil ----------

Given('un compte de test a les profils Expert et Utilisateur', async ({ monde }) => {
    monde.d.compteMire = await creerCompte(monde, { is_expert: 1, is_user: 1 });
});

When('je saisis les identifiants du compte de test et valide la mire', async ({ monde }) => {
    const page = monde.page;
    await page.locator('#loginUsername').fill(monde.d.compteMire.username);
    await page.locator('#loginPassword').fill(monde.d.compteMire.password);
    await page.locator('#loginButton').click();
});

Then('la mire propose les profils {string} et {string}', async ({ monde }, a, b) => {
    const liste = monde.page.locator('#loginProfile');
    await expect(liste).toBeVisible({ timeout: 15000 });
    await expect(liste.locator('option')).toContainText([a, b]);
});

Then('le bouton de la mire devient {string}', async ({ monde }, libelle) => {
    await expect(monde.page.locator('#loginButton')).toContainText(libelle);
});

When('je valide la mire sans choisir de profil', async ({ monde }) => {
    await monde.page.locator('#loginButton').click();
});

// ---------- Mot de passe oublié ----------

const fenetreOubli = (/** @type {Page} */ page) => page.locator('#forgotPasswordModal');

When('je clique sur « Mot de passe oublié ? »', async ({ monde }) => {
    await monde.page.getByText('Mot de passe oublié ?', { exact: true }).click();
});

Then("la fenêtre « Mot de passe oublié » reprend l'identifiant {string}", async ({ monde }, login) => {
    await expect(fenetreOubli(monde.page)).toBeVisible();
    await expect(monde.page.locator('#forgotUsername')).toHaveValue(login);
});

When("je vide l'identifiant de la fenêtre « Mot de passe oublié » et demande l'envoi", async ({ monde }) => {
    await monde.page.locator('#forgotUsername').fill('');
    await monde.page.locator('#forgotPasswordButton').click();
});

When("je demande l'envoi du lien de réinitialisation", async ({ monde }) => {
    await monde.page.locator('#forgotPasswordButton').click();
});

Then('la fenêtre « Mot de passe oublié » signale {string}', async ({ monde }, message) => {
    await expect(monde.page.locator('#forgotPasswordMessage')).toContainText(message);
});

When("j'annule la fenêtre « Mot de passe oublié »", async ({ monde }) => {
    await fenetreOubli(monde.page).getByRole('button', { name: 'Annuler' }).click();
});

Then('la fenêtre « Mot de passe oublié » est fermée', async ({ monde }) => {
    await expect(fenetreOubli(monde.page)).toBeHidden();
});

Given('la demande de mot de passe oublié sera acceptée \\(réponse simulée)', async ({ monde }) => {
    const { page } = await monde.anonyme();
    await page.route('**/api/forgot-password', route =>
        json(route, {
            success: true,
            message:
                "Si un compte actif correspond à cet identifiant, un email contenant un lien de réinitialisation vient d'être envoyé à l'adresse associée."
        })
    );
});

Then("le bouton d'envoi indique {string} et reste désactivé", async ({ monde }, texte) => {
    const bouton = monde.page.locator('#forgotPasswordButton');
    await expect(bouton).toContainText(texte);
    await expect(bouton).toBeDisabled();
});

// ---------- Lien de réinitialisation ----------

const fenetreNouveau = (/** @type {Page} */ page) => page.locator('#newPasswordModal');

When("j'ouvre l'application avec un lien de réinitialisation invalide", async ({ monde }) => {
    const { page } = await monde.anonyme();
    await page.goto(`/?reset_token=e2e-invalide-${Date.now()}`);
});

Given('le lien de réinitialisation sera accepté \\(réponses simulées)', async ({ monde }) => {
    const { page } = await monde.anonyme();
    monde.d.jetonReinit = `e2e-simule-${Date.now()}`;
    await page.route('**/api/reset-password/check', route => json(route, { passwordRule: '8 caractères minimum' }));
    await page.route('**/api/reset-password', route => {
        monde.d.envoiReinit = route.request().postDataJSON();
        return json(route, { message: 'Mot de passe modifié (simulation)' });
    });
});

When("j'ouvre l'application avec ce lien de réinitialisation", async ({ monde }) => {
    await monde.page.goto(`/?reset_token=${monde.d.jetonReinit}`);
});

Then('la fenêtre « Choisir un nouveau mot de passe » signale {string} sans formulaire', async ({ monde }, message) => {
    await expect(fenetreNouveau(monde.page)).toBeVisible({ timeout: 15000 });
    await expect(monde.page.locator('#newPasswordMessage')).toContainText(message);
    await expect(monde.page.locator('#newPasswordValue')).toBeHidden();
    await expect(fenetreNouveau(monde.page).getByRole('button', { name: 'Valider' })).toBeHidden();
});

Then('la fenêtre « Choisir un nouveau mot de passe » présente la règle {string}', async ({ monde }, regle) => {
    await expect(fenetreNouveau(monde.page)).toBeVisible({ timeout: 15000 });
    await expect(monde.page.locator('#newPasswordRule')).toHaveText(regle);
});

Then('la fenêtre « Choisir un nouveau mot de passe » signale {string}', async ({ monde }, message) => {
    await expect(monde.page.locator('#newPasswordMessage')).toContainText(message);
});

When(
    'je saisis le nouveau mot de passe {string} et la confirmation {string}',
    async ({ monde }, motDePasse, confirmation) => {
        await monde.page.locator('#newPasswordValue').fill(motDePasse);
        await monde.page.locator('#newPasswordConfirm').fill(confirmation);
        await fenetreNouveau(monde.page).getByRole('button', { name: 'Valider' }).click();
    }
);

Then('le nouveau mot de passe a été envoyé avec le jeton du lien', async ({ monde }) => {
    expect(monde.d.envoiReinit).toEqual({ token: monde.d.jetonReinit, newPassword: 'Nouveau-E2E-2026!' });
});

Then("le jeton n'apparaît plus dans l'adresse de la page", async ({ monde }) => {
    expect(monde.page.url()).not.toContain('reset_token');
});

When('je ferme la fenêtre « Choisir un nouveau mot de passe »', async ({ monde }) => {
    await fenetreNouveau(monde.page).getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetreNouveau(monde.page)).toBeHidden();
});

// ---------- Double authentification (réponses simulées) ----------

/** Connexion simulée : double authentification demandée pour un compte fictif (page mobile : POST /mobile-login) */
async function simulerConnexion(
    /** @type {any} */ monde,
    /** @type {Record<string, unknown>} */ reponse,
    mobile = false
) {
    const { page } = mobile ? await monde.anonyme('mobile-mire', { mobile: true }) : await monde.anonyme();
    await page.route(mobile ? '**/api/mobile-login' : '**/api/login', (/** @type {Route} */ route) =>
        json(route, { mfaRequired: true, pendingUserId: 999999, profile: 'user', pendingProfile: 'user', ...reponse })
    );
    return page;
}

Given(
    "la connexion mobile demandera de configurer une application d'authentification \\(réponses simulées)",
    async ({ monde }) => {
        const page = await simulerConnexion(monde, { mfaMethod: 'totp', totpConfigured: false }, true);
        await page.route('**/api/mfa/totp-setup', route => json(route, { secret: 'JBSWY3DPEHPK3PXP', qrCode: PNG }));
    }
);

Given(
    "la connexion mobile sera refusée tant que le mot de passe n'est pas changé \\(réponse simulée)",
    async ({ monde }) => {
        const { page } = await monde.anonyme('mobile-mire', { mobile: true });
        await page.route('**/api/mobile-login', route =>
            json(
                route,
                {
                    error: 'Mot de passe à changer : connectez-vous une première fois depuis un ordinateur pour choisir votre mot de passe.'
                },
                403
            )
        );
    }
);

Then('la mire mobile est affichée avec le mot de passe vidé', async ({ monde }) => {
    await expect(monde.page.locator('#loginScreen')).not.toHaveClass(/\bhidden\b/);
    await expect(monde.page.locator('#loginUsername')).toBeVisible();
    await expect(monde.page.locator('#loginPassword')).toHaveValue('');
});

Given(
    'la connexion demandera le choix de la méthode de double authentification \\(réponse simulée)',
    async ({ monde }) => {
        await simulerConnexion(monde, { mfaMethod: 'choice', totpConfigured: true });
    }
);

Given('la connexion demandera un code par e-mail \\(réponses simulées)', async ({ monde }) => {
    const page = await simulerConnexion(monde, { mfaMethod: 'email', totpConfigured: false });
    monde.d.envoisCode = 0;
    await page.route('**/api/mfa/send-code', route => {
        monde.d.envoisCode++;
        return json(route, { success: true });
    });
    await page.route('**/api/mfa/verify', route => json(route, { error: 'Code invalide ou expiré' }, 401));
});

Given(
    "la connexion demandera de configurer une application d'authentification \\(réponses simulées)",
    async ({ monde }) => {
        const page = await simulerConnexion(monde, { mfaMethod: 'totp', totpConfigured: false });
        await page.route('**/api/mfa/totp-setup', route => json(route, { secret: 'JBSWY3DPEHPK3PXP', qrCode: PNG }));
    }
);

When('je saisis des identifiants de test et valide la mire', async ({ monde }) => {
    const page = monde.page;
    await page.locator('#loginUsername').fill('e2e.mire.mfa');
    await page.locator('#loginPassword').fill('Mot-de-passe-E2E-1!');
    await page.locator('#loginButton').click();
});

Then("la mire propose un code par e-mail ou une application d'authentification", async ({ monde }) => {
    await expect(monde.page.getByRole('button', { name: /code par e-?mail/i })).toBeVisible();
    await expect(monde.page.getByRole('button', { name: /application d'authentification/i })).toBeVisible();
});

When(
    /^j'annule (?:la double authentification|la mise en place de l'application d'authentification)$/,
    async ({ monde }) => {
        await monde.page.getByRole('button', { name: 'Annuler', exact: true }).click();
    }
);

Then('la mire de connexion est affichée avec le mot de passe vidé', async ({ monde }) => {
    await mireAffichee(monde.page);
    await expect(monde.page.locator('#loginPassword')).toHaveValue('');
    await expect(monde.page.getByRole('button', { name: 'Annuler', exact: true })).toBeHidden();
});

Then("la mire indique qu'un code a été envoyé par e-mail", async ({ monde }) => {
    await expect(monde.page.getByText('Un code de vérification a été envoyé à votre adresse email.')).toBeVisible();
});

When('je demande un nouveau code', async ({ monde }) => {
    await monde.page.getByRole('button', { name: /Renvoyer le code/ }).click();
});

Then("la mire confirme l'envoi du nouveau code", async ({ monde }) => {
    await expect(monde.page.getByRole('button', { name: /Code envoyé/ })).toBeVisible();
});

Then("le serveur a reçu {int} demandes d'envoi de code", async ({ monde }, n) => {
    await expect.poll(() => monde.d.envoisCode).toBe(n);
});

When('je saisis le code de vérification {string} et le valide', async ({ monde }, code) => {
    await monde.page.locator('#mfaCodeInput').fill(code);
    await monde.page.locator('#mfaVerifyButton').click();
});

Then("la mire signale l'erreur de code {string}", async ({ monde }, message) => {
    await expect(monde.page.locator('#mfaCodeError')).toContainText(message);
});

Then('la mire présente le QR code et la clé {string}', async ({ monde }, cle) => {
    await expect(monde.page.locator('#mfaTotpQrCode img')).toBeVisible();
    await expect(monde.page.locator('#mfaTotpSecret')).toHaveText(cle);
});

When('je saisis le code de mise en place {string} et le confirme', async ({ monde }, code) => {
    await monde.page.locator('#mfaTotpConfirmCode').fill(code);
    await monde.page.getByRole('button', { name: /Confirmer/ }).click();
});

Then("la mire signale l'erreur de mise en place {string}", async ({ monde }, message) => {
    await expect(monde.page.locator('#mfaTotpSetupError')).toContainText(message);
});
