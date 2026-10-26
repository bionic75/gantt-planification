// @ts-check
// Connexion par la mire, session, double authentification, inactivité, mot de passe à changer
import { expect, request } from '@playwright/test';
import { config, PROFILS, profil as profilDe } from '../support/config.js';
import { connecterBureau, connexionBureau } from '../support/connexion.js';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** Contexte HTTP sans session (cookies propres) */
async function clientSansSession() {
    return request.newContext({ baseURL: config.baseUrl });
}

const champMire = (/** @type {string} */ libelle) =>
    /** @type {Record<string, string>} */ ({ Identifiant: '#loginUsername', 'Mot de passe': '#loginPassword' })[
        libelle
    ];

const mireAffichee = async (/** @type {import('@playwright/test').Page} */ page, timeout = 45000) => {
    await expect(page.locator('#loginPage')).toHaveClass(/active/, { timeout });
    await expect(page.locator('#loginUsername')).toBeVisible();
};

// ---------- Mire ----------

Given('la mire de connexion est ouverte', async ({ monde }) => {
    const { page } = await monde.anonyme();
    await page.goto('/');
    await mireAffichee(page);
});

When("j'ouvre la mire de connexion", async ({ monde }) => {
    const { page } = await monde.anonyme();
    await page.goto('/');
    await mireAffichee(page);
});

When('je me connecte avec les identifiants du profil {string}', async ({ monde }, label) => {
    monde.d.connexion = await connexionBureau(monde.page, profilDe(label));
});

Given('je me suis connecté par la mire avec le profil {string}', async ({ monde }, label) => {
    const { page } = await monde.anonyme();
    monde.d.connexion = await connecterBureau(page, profilDe(label));
});

When(
    "je me connecte avec l'identifiant du profil {string} et le mot de passe {string}",
    async ({ monde }, label, password) => {
        monde.d.connexion = await connexionBureau(monde.page, profilDe(label), { password });
    }
);

When("je me connecte avec l'identifiant {string} et le mot de passe {string}", async ({ monde }, login, password) => {
    const inconnu = { ...PROFILS.user, label: login, login, mfa: false };
    monde.d.connexion = await connexionBureau(monde.page, inconnu, { password });
});

Then("l'application est ouverte avec le profil {string}", async ({ monde }, label) => {
    const p = profilDe(label);
    if (monde.d.connexion) {
        expect(monde.d.connexion.etat, monde.d.connexion.message || '').toBe('application');
    }
    await expect(monde.page.locator('#userInfo')).toBeVisible({ timeout: 30000 });
    const s = await monde.page.request.get('/api/check-session');
    expect(s.status()).toBe(200);
    expect((await s.json()).activeProfile).toBe(p.key);
});

Then("le bandeau affiche le nom de l'utilisateur et le profil {string}", async ({ monde }, libelle) => {
    const page = monde.page;
    const session = await (await page.request.get('/api/check-session')).json();
    await expect(page.locator('#userDisplayName')).toContainText(String(session.nom || '').toUpperCase());
    const role = (await page.locator('#profileSwitcherLabel').isVisible())
        ? page.locator('#profileSwitcherLabel')
        : page.locator('#userDisplayRole');
    await expect(role).toHaveText(new RegExp(libelle, 'i'));
});

Then("la mire affiche l'erreur {string}", async ({ monde }, message) => {
    await expect(monde.page.locator('#loginError')).toContainText(message);
    await expect(monde.page.locator('#loginPage')).toHaveClass(/active/);
});

Then("aucune session n'est ouverte", async ({ monde }) => {
    const r = await monde.page.request.get('/api/check-session');
    expect(r.status()).toBe(401);
});

When('je valide la mire en laissant le champ {string} vide', async ({ monde }, libelle) => {
    const page = monde.page;
    const autre = libelle === 'Identifiant' ? '#loginPassword' : '#loginUsername';
    await page.locator(champMire(libelle)).fill('');
    await page.locator(autre).fill(libelle === 'Identifiant' ? 'Un-mot-de-passe-1!' : PROFILS.user.login);
    await page.locator('#loginButton').click();
});

When("une connexion est demandée à l'API sans mot de passe", async ({ monde }) => {
    const ctx = await clientSansSession();
    const r = await ctx.post('/api/login', { data: { username: PROFILS.user.login } });
    monde.reponse = { status: r.status(), data: await r.json().catch(() => null), headers: r.headers() };
    await ctx.dispose();
});

When("une connexion est demandée à l'API sans identifiant", async ({ monde }) => {
    const ctx = await clientSansSession();
    const r = await ctx.post('/api/login', { data: { password: 'Un-mot-de-passe-1!' } });
    monde.reponse = { status: r.status(), data: await r.json().catch(() => null), headers: r.headers() };
    await ctx.dispose();
});

Given("le navigateur a déjà mémorisé l'identifiant du profil {string}", async ({ monde }, label) => {
    const { context } = await monde.anonyme();
    const login = profilDe(label).login;
    await context.addInitScript(l => {
        try {
            localStorage.setItem('gp_known_logins', JSON.stringify([l]));
        } catch {
            /* stockage indisponible */
        }
    }, login);
});

Then('le champ {string} est vide', async ({ monde }, libelle) => {
    await expect(monde.page.locator(champMire(libelle))).toHaveValue('');
});

When('je clique dans le champ {string}', async ({ monde }, libelle) => {
    await monde.page.locator(champMire(libelle)).click();
});

Then("le champ {string} n'est pas pré-rempli par l'application", async ({ monde }, libelle) => {
    await monde.page.waitForTimeout(1000);
    await expect(monde.page.locator(champMire(libelle))).toHaveValue('');
});

Then(
    "le mot de passe n'apparaît ni dans le localStorage, ni dans le sessionStorage, ni dans les cookies",
    async ({ monde }) => {
        const page = monde.page;
        const password = PROFILS.user.password;
        const stockages = await page.evaluate(
            () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
        );
        expect(stockages.includes(password), 'mot de passe trouvé dans le stockage du navigateur').toBe(false);
        const cookies = JSON.stringify(await page.context().cookies());
        expect(cookies.includes(password), 'mot de passe trouvé dans les cookies').toBe(false);
        expect(cookies.includes(encodeURIComponent(password)), 'mot de passe trouvé dans les cookies').toBe(false);
    }
);

Then('le cookie de session est HttpOnly', async ({ monde }) => {
    const cookies = await monde.page.context().cookies(config.baseUrl);
    expect(cookies.length, 'aucun cookie de session').toBeGreaterThan(0);
    const session = cookies.filter(c => /sid|sess/i.test(c.name));
    for (const c of session.length ? session : cookies) expect(c.httpOnly, `cookie ${c.name}`).toBe(true);
});

// ---------- Session perdue, déconnexion ----------

When('la session est supprimée côté serveur', async ({ monde }) => {
    const r = await monde.page.request.post('/api/logout');
    expect(r.status()).toBe(200);
});

When("j'effectue une action dans l'application", async ({ monde }) => {
    // Rechargement des ressources, comme le fait chaque écran (requête interceptée par l'application)
    monde.d.statutAction = await monde.page.evaluate(
        async () => (await fetch('/api/resources', { credentials: 'include' })).status
    );
});

Then("l'application a reçu une réponse 401 et non 403", async ({ monde }) => {
    expect(monde.d.statutAction).toBe(401);
});

Then("la mire de connexion est affichée, sans écran blanc ni boucle d'erreurs", async ({ monde }) => {
    const page = monde.page;
    await mireAffichee(page, 15000);
    // La mire reste affichée et l'application ne relance pas d'appels en boucle
    let appels = 0;
    const compter = (/** @type {import('@playwright/test').Request} */ r) => {
        if (r.url().includes('/api/')) appels++;
    };
    page.on('request', compter);
    await page.waitForTimeout(5000);
    page.off('request', compter);
    await expect(page.locator('#loginPage')).toHaveClass(/active/);
    expect(appels, `${appels} appels à l'API en 5 s sur la mire`).toBeLessThan(15);
});

Then('les applications ouvertes sont fermées', async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('.container').first()).toBeHidden();
    for (const id of ['affectationContainer', 'analyseContainer', 'deplacementsContainer', 'userInfo']) {
        const el = page.locator(`#${id}`);
        if (await el.count()) await expect(el).toBeHidden();
    }
});

When("je clique sur l'icône de déconnexion et confirme", async ({ monde }) => {
    // La fenêtre de confirmation est acceptée automatiquement (monde.dialogues)
    await monde.page.locator('.logout-icon').first().click();
});

Then('la mire de connexion est affichée', async ({ monde }) => {
    await mireAffichee(monde.page);
});

When("j'utilise le bouton Précédent du navigateur", async ({ monde }) => {
    const page = monde.page;
    await page.goBack().catch(() => {});
    // L'application tient sur une seule page : « Précédent » sort de l'application ; on y revient par l'historique
    // (page éventuellement restituée par le cache du navigateur) pour vérifier qu'aucun écran protégé ne réapparaît
    if (!page.url().startsWith(config.baseUrl)) await page.goForward().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
});

// ---------- Double authentification ----------

Given('la double authentification par e-mail est demandée au profil {string}', async ({ monde, $test }, label) => {
    const p = profilDe(label);
    const api = await adminApi(monde);
    const { config: mfa } = await api.ok('GET', '/api/mfa/config');
    const flag = { admin: 'profileAdmin', expert: 'profileExpert', user: 'profileUser', rh: '' }[p.key];
    $test.skip(!mfa?.enabled || !flag || !mfa[flag], `Double authentification non activée pour le profil ${p.label}`);
    $test.skip(mfa.method === 'totp', 'Double authentification configurée en TOTP seul');
    if (mfa.frequency !== 'always' && config.allowMfaReset) {
        // Validation récente effacée pour que le code soit redemandé (efface aussi le TOTP du compte)
        const { userId } = await monde.sessionDe(label);
        await api.ok('POST', `/api/mfa/reset-totp/${userId}`, {});
    }
});

When("je me connecte avec le profil {string} en saisissant d'abord un code erroné", async ({ monde, $test }, label) => {
    monde.d.connexion = await connexionBureau(monde.page, profilDe(label), { methode: 'email', codeErroneAvant: true });
    $test.skip(
        !monde.d.connexion.mfaDemandee,
        'Code non redemandé (validation MFA encore valide) : E2E_ALLOW_MFA_RESET=true pour forcer la vérification'
    );
});

Then('le code erroné a été refusé avec le message {string}', async ({ monde }, message) => {
    expect(monde.d.connexion.messageCodeErrone).toContain(message);
});

Given("le profil {string} dispose d'une application TOTP configurée", async ({ monde, $test }, label) => {
    const p = profilDe(label);
    $test.skip(!p.totpSecret, `Secret TOTP du profil ${p.label} absent de e2e/.env`);
    const { config: mfa } = await (await adminApi(monde)).ok('GET', '/api/mfa/config');
    $test.skip(!mfa?.enabled || mfa.method === 'email', 'Méthode TOTP non proposée par la configuration MFA');
});

When('je me connecte avec le profil {string} en validant par code TOTP', async ({ monde, $test }, label) => {
    monde.d.connexion = await connexionBureau(monde.page, profilDe(label), { methode: 'totp' });
    $test.skip(!monde.d.connexion.mfaDemandee, 'Code non redemandé (validation MFA encore valide)');
});

// ---------- Inactivité ----------

Given("le délai d'inactivité est fixé à {int} minute", async ({ monde }, minutes) => {
    const api = await adminApi(monde);
    const avant = await api.ok('GET', '/api/settings');
    for (const [key, value] of [
        ['inactivity_enabled', 'true'],
        ['inactivity_timeout', String(minutes)]
    ]) {
        const precedent = avant[key];
        await api.ok('POST', '/api/settings', { key, value });
        monde.aNettoyer(`paramètre ${key}`, () =>
            api.post('/api/settings', { key, value: precedent ?? (key === 'inactivity_enabled' ? 'false' : '15') })
        );
    }
});

const resteMinuteur = async (/** @type {import('@playwright/test').Page} */ page) => {
    const m = Number(await page.locator('#timerMinutes').textContent());
    const s = Number(await page.locator('#timerSeconds').textContent());
    return m * 60 + s;
};

Then("le minuteur d'inactivité est affiché", async ({ monde }) => {
    await expect(monde.page.locator('#inactivityTimerDisplay')).toBeVisible({ timeout: 15000 });
});

When("j'effectue une action avant l'échéance", async ({ monde }) => {
    await monde.page.waitForTimeout(8000);
    monde.d.resteAvantAction = await resteMinuteur(monde.page);
    await monde.page.mouse.click(5, 300);
});

Then("le minuteur d'inactivité est remis à zéro", async ({ monde }) => {
    await expect.poll(() => resteMinuteur(monde.page), { timeout: 5000 }).toBeGreaterThan(monde.d.resteAvantAction + 3);
});

When("je reste inactif jusqu'à l'échéance", async ({ monde }) => {
    await expect(monde.page.locator('#inactivityModal')).toHaveClass(/active/, { timeout: 120000 });
});

Then("un avertissement d'inactivité est affiché", async ({ monde }) => {
    await expect(monde.page.locator('#inactivityModal')).toBeVisible();
});

// ---------- Mot de passe à changer ----------

Given('un administrateur a créé un compte {string} avec un mot de passe initial', async ({ monde, $test }, label) => {
    const p = profilDe(label);
    const api = await adminApi(monde);
    const { config: mfa } = await api.ok('GET', '/api/mfa/config');
    const mfaProfil =
        !!mfa?.enabled &&
        !!mfa[{ admin: 'profileAdmin', expert: 'profileExpert', user: 'profileUser', rh: 'x' }[p.key]];
    $test.skip(
        mfaProfil && !config.mail.sharedAddress,
        'E2E_SHARED_MAILBOX requis : le nouveau compte recevra un code OTP'
    );
    const login = `e2e.${monde.suffixe.toLowerCase()}`;
    const compte = {
        username: login,
        password: 'Initial-E2E-2026!',
        nom: 'E2E',
        prenom: `Compte${monde.suffixe}`,
        email: config.mail.sharedAddress || `${login}@example.invalid`,
        [`is_${p.key}`]: 1
    };
    const r = await api.post('/api/users', compte);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    monde.aNettoyer(`compte ${login}`, () => api.delete(`/api/users/${r.data.id}`));
    monde.d.compte = { ...compte, id: r.data.id, profil: p };
});

When('je me connecte avec ce nouveau compte et son mot de passe initial', async ({ monde }) => {
    const c = monde.d.compte;
    monde.d.connexion = await connexionBureau(monde.page, {
        ...c.profil,
        label: c.username,
        login: c.username,
        password: c.password,
        mfa: true
    });
});

Then('le changement de mot de passe est imposé avant tout accès', async ({ monde }) => {
    expect(monde.d.connexion.etat, monde.d.connexion.message || '').toBe('mot-de-passe-a-changer');
    await expect(monde.page.locator('#forcedPasswordModal')).toBeVisible();
    await expect(monde.page.locator('#loginPage')).toHaveClass(/active/);
});

Then("l'API refuse l'accès aux données tant que le mot de passe n'est pas changé", async ({ monde }) => {
    const r = await monde.page.request.get('/api/resources');
    expect(r.status()).toBe(403);
    expect((await r.json()).error).toBe('PASSWORD_CHANGE_REQUIRED');
});

When('je choisis un nouveau mot de passe personnel', async ({ monde }) => {
    const page = monde.page;
    monde.d.compte.nouveau = 'Nouveau-E2E-2026!';
    await page.locator('#forcedNewPassword').fill(monde.d.compte.nouveau);
    await page.locator('#forcedConfirmPassword').fill(monde.d.compte.nouveau);
    await page.locator('#forcedPasswordButton').click();
});

Then("l'application est ouverte pour ce nouveau compte", async ({ monde }) => {
    await expect(monde.page.locator('#userInfo')).toBeVisible({ timeout: 30000 });
    await expect(monde.page.locator('#forcedPasswordModal')).toBeHidden();
});

Then("l'ancien mot de passe de ce compte n'est plus accepté", async ({ monde }) => {
    const ctx = await clientSansSession();
    const r = await ctx.post('/api/login', {
        data: { username: monde.d.compte.username, password: monde.d.compte.password }
    });
    expect(r.status()).toBe(401);
    await ctx.dispose();
});

// ---------- Mots de passe repris de l'ancienne version ----------

When("le compte du profil {string} s'authentifie auprès de l'API", async ({ monde }, label) => {
    const p = profilDe(label);
    const ctx = await clientSansSession();
    const r = await ctx.post('/api/login', { data: { username: p.login, password: p.password } });
    monde.reponse = { status: r.status(), data: await r.json().catch(() => null), headers: r.headers() };
    await ctx.dispose();
});

Then('le mot de passe est accepté', async ({ monde }) => {
    const r = monde.reponse;
    expect(r?.status, JSON.stringify(r?.data)).toBe(200);
    expect(!!(r?.data.success || r?.data.mfaRequired || r?.data.profileRequired)).toBe(true);
});

// ---------- Utilisateurs connectés ----------

const nomComplet = (/** @type {any} */ s) => `${s.prenom || ''} ${s.nom || ''}`.trim() || s.username;

When('{string} ouvre la liste des utilisateurs connectés', async ({ monde }, label) => {
    const { page } = await monde.acteur(label);
    await expect(page.locator('#onlineUsersContainer')).toBeVisible({ timeout: 30000 });
    await page.locator('#onlineUsersContainer').click();
    await expect(page.locator('#onlineUsersTooltip')).toBeVisible();
});

Then('la liste des utilisateurs connectés contient {string}', async ({ monde }, label) => {
    const nom = nomComplet(await monde.sessionDe(label));
    const page = monde.page;
    // Liste rafraîchie périodiquement par l'application
    await expect(async () => {
        if (!(await page.locator('#onlineUsersTooltip').isVisible()))
            await page.locator('#onlineUsersContainer').click();
        await expect(page.locator('#onlineUsersTooltipList')).toContainText(nom, { timeout: 2000 });
    }).toPass({ timeout: 60000 });
});

When('{string} clique sur le bouton de message de {string}', async ({ monde }, label, cible) => {
    const { page } = await monde.acteur(label);
    const nom = nomComplet(await monde.sessionDe(cible));
    await page.locator(`#onlineUsersTooltipList button[title="Envoyer un message à ${nom}"]`).click();
});

Then('une fenêtre de messagerie vers {string} est ouverte', async ({ monde }, cible) => {
    const { userId } = await monde.sessionDe(cible);
    await expect(monde.page.locator(`#pcpHead_${userId}`)).toBeVisible();
});
