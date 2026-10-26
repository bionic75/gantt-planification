// @ts-check
// Administration : localisations, dump, thèmes et mode sombre, modèle de nom, couleurs des étapes, SMTP,
// automatisations, aide en ligne
import { expect } from '@playwright/test';
import { config, ORDRE_CONNEXIONS, PROFILS, storageStatePath } from '../support/config.js';
import { connecterBureau } from '../support/connexion.js';
import { adminApi, creerEvenement, lireRessource } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

// ---------- Localisations ----------

const localisation = async (/** @type {Monde} */ monde) =>
    (await (await adminApi(monde)).ok('GET', '/api/locations')).locations.find(
        (/** @type {any} */ l) => l.id === monde.d.loc.id
    );

When(
    "l'administrateur crée une localisation avec le libellé long {string}, le libellé court {string} et l'adresse {string}",
    async ({ monde }, long, court, adresse) => {
        const api = await adminApi(monde);
        const libelle = `${long} ${monde.suffixe}`;
        monde.reponse = await api.post('/api/locations', { libelle_long: libelle, libelle_court: court, adresse });
        if (monde.reponse.status === 200) {
            monde.d.loc = { id: monde.reponse.data.id, long: libelle, court, adresse };
            monde.aNettoyer(`localisation ${libelle}`, () => api.delete(`/api/locations/${monde.d.loc.id}`));
        }
    }
);

Then('la localisation est enregistrée en majuscules avec son adresse', async ({ monde }) => {
    const { long, court, adresse } = monde.d.loc;
    expect(await localisation(monde)).toMatchObject({
        libelle_long: long.toUpperCase(),
        libelle_court: court.toUpperCase(),
        adresse: adresse.toUpperCase()
    });
});

When("l'administrateur crée une localisation avec le même libellé long", async ({ monde }) => {
    monde.reponse = await (
        await adminApi(monde)
    ).post('/api/locations', { libelle_long: monde.d.loc.long, libelle_court: 'DOUBLON' });
});

When("l'administrateur modifie le libellé court de la localisation en {string}", async ({ monde }, court) => {
    monde.reponse = await (
        await adminApi(monde)
    ).put(`/api/locations/${monde.d.loc.id}`, {
        libelle_long: monde.d.loc.long,
        libelle_court: court,
        adresse: monde.d.loc.adresse
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

Then('la localisation a le libellé court {string}', async ({ monde }, court) => {
    expect((await localisation(monde)).libelle_court).toBe(court);
});

When("l'administrateur crée un événement sur la localisation le {string}", async ({ monde }, date) => {
    monde.d.evenement = await creerEvenement(monde, { startDate: date, location_id: monde.d.loc.id });
});

Then("l'usage de la localisation indique {int} événement(s) rattaché(s)", async ({ monde }, n) => {
    const usage = await (await adminApi(monde)).ok('GET', `/api/locations/${monde.d.loc.id}/usage`);
    expect(usage.count).toBe(n);
    expect(usage.events.map((/** @type {any} */ e) => e.id)).toContain(monde.d.evenement);
});

When("l'administrateur supprime la localisation", async ({ monde }) => {
    monde.reponse = await (await adminApi(monde)).delete(`/api/locations/${monde.d.loc.id}`);
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

Then("la localisation n'existe plus", async ({ monde }) => {
    expect(await localisation(monde)).toBeUndefined();
});

// ---------- Dump ----------

When("l'administrateur génère un dump complet", async ({ monde, $test }) => {
    const r = await (await adminApi(monde)).get('/api/admin/dump');
    $test.skip(r.status === 501, 'Sauvegarde intégrée disponible uniquement avec SQLite');
    expect(r.status).toBe(200);
    monde.d.dump = { contenu: /** @type {Buffer} */ (r.data), nom: r.headers['x-dump-filename'] };
    expect(monde.d.dump.nom).toMatch(/\.gpdump$/);
});

When("l'administrateur supprime la ressource", async ({ monde }) => {
    const r = await (await adminApi(monde)).delete(`/api/resources/${monde.d.ressource.id}`);
    expect(r.status).toBe(200);
});

/** Analyse du fichier par le serveur (contrôles de taille, version, date) */
const inspecter = async (/** @type {Monde} */ monde, /** @type {Buffer} */ contenu, /** @type {string} */ nom) =>
    (await adminApi(monde)).appel('POST', '/api/admin/dump/inspect', contenu, {
        'Content-Type': 'application/octet-stream',
        'X-Dump-Filename': encodeURIComponent(nom)
    });

When("l'administrateur restaure le dump", async ({ monde }) => {
    const analyse = await inspecter(monde, monde.d.dump.contenu, monde.d.dump.nom);
    expect(analyse.status, JSON.stringify(analyse.data)).toBe(200);
    monde.d.analyseDump = analyse.data;
    monde.reponse = await (
        await adminApi(monde)
    ).post('/api/admin/dump/restore', {
        token: analyse.data.token,
        confirmation: analyse.data.current?.hostname || new URL(config.baseUrl).hostname,
        // Dump produit par l'environnement de test lui-même : son SMTP (de test) est conservé, sans quoi plus aucun
        // code de double authentification ne pourrait être envoyé
        options: { neutralizeEmails: false }
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
    // Toutes les sessions sont fermées par la restauration : nouvelle connexion de chaque profil, une à la fois,
    // et sessions enregistrées remplacées pour la suite de la campagne
    for (const key of ORDRE_CONNEXIONS) {
        const a = await monde.acteur(PROFILS[key].label);
        await a.context.clearCookies();
        delete a.session;
        await connecterBureau(a.page, PROFILS[key]);
        await a.context.storageState({ path: storageStatePath(key) });
    }
});

Then('la restauration est acceptée après contrôle de la taille, de la version et de la date', async ({ monde }) => {
    const a = monde.d.analyseDump;
    expect(a.fileSize).toBe(monde.d.dump.contenu.length);
    expect(a.manifest).toBeTruthy();
    expect(a).toHaveProperty('versionRelation');
    expect(monde.reponse?.data).toMatchObject({ success: true });
});

Then('la ressource existe de nouveau après reconnexion', async ({ monde }) => {
    expect(await lireRessource(monde, monde.d.ressource.id)).toBeTruthy();
});

When("l'administrateur soumet un fichier corrompu à la restauration", async ({ monde }) => {
    monde.reponse = await inspecter(monde, Buffer.from('fichier corrompu E2E, pas un dump'), 'corrompu.gpdump');
});

// ---------- Thèmes et mode sombre ----------

Given("le thème de l'application sera rétabli après le scénario", async ({ monde }) => {
    const api = await adminApi(monde);
    const theme = await api.ok('GET', '/api/theme');
    monde.aNettoyer('thème', () => api.put('/api/theme', theme));
});

When("l'administrateur impose le thème {string}", async ({ monde }, theme) => {
    monde.reponse = await (await adminApi(monde)).put('/api/theme', { mode: 'forced', forced: theme });
    expect(monde.reponse.status).toBe(200);
    expect(monde.reponse.data).toMatchObject({ mode: 'forced', forced: theme });
});

Then('le thème {string} est appliqué pour tous, y compris sur la mire de connexion', async ({ monde }, theme) => {
    const { page } = await monde.anonyme(`theme-${theme}`);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 15000 });
});

When('je bascule le mode sombre', async ({ monde }) => {
    await monde.page.locator('#colorModeBtn').click();
});

Then("l'application est en mode sombre", async ({ monde }) => {
    await expect(monde.page.locator('html')).toHaveClass(/dark-mode/);
});

Then("l'application n'est plus en mode sombre", async ({ monde }) => {
    await expect(monde.page.locator('html')).not.toHaveClass(/dark-mode/);
});

// ---------- Modèle de nom des exports ----------

Given('le modèle de nom des exports sera rétabli après le scénario', async ({ monde }) => {
    const api = await adminApi(monde);
    const { pattern, defaultPattern } = await api.ok('GET', '/api/affectation/export-config');
    monde.aNettoyer('modèle de nom', () =>
        api.put('/api/affectation/export-config', { pattern: pattern === defaultPattern ? '' : pattern })
    );
});

When("l'administrateur définit le modèle de nom {string}", async ({ monde }, pattern) => {
    monde.reponse = await (await adminApi(monde)).put('/api/affectation/export-config', { pattern });
    expect(monde.reponse.status).toBe(200);
});

Then('le modèle de nom des exports est {string}', async ({ monde }, pattern) => {
    expect((await (await adminApi(monde)).ok('GET', '/api/affectation/export-config')).pattern).toBe(pattern);
});

Then('le modèle de nom des exports est le modèle par défaut', async ({ monde }) => {
    const { pattern, defaultPattern } = await (await adminApi(monde)).ok('GET', '/api/affectation/export-config');
    expect(pattern).toBe(defaultPattern);
});

// ---------- Couleurs et motifs des étapes ----------

Given('les couleurs et motifs des étapes seront rétablis après le scénario', async ({ monde }) => {
    const api = await adminApi(monde);
    const { colors, patterns } = await api.ok('GET', '/api/affectation/config');
    monde.aNettoyer('couleurs des étapes', () => api.put('/api/affectation/colors', { colors, patterns }));
});

When(
    "l'administrateur choisit la couleur {string} et le motif {string} pour l'étape {string}",
    async ({ monde }, couleur, motif, etape) => {
        monde.reponse = await (
            await adminApi(monde)
        ).put('/api/affectation/colors', {
            colors: { [etape]: couleur },
            patterns: { [etape]: motif }
        });
        expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
    }
);

When("l'administrateur choisit la couleur {string} pour l'étape {string}", async ({ monde }, couleur, etape) => {
    monde.reponse = await (await adminApi(monde)).put('/api/affectation/colors', { colors: { [etape]: couleur } });
});

When("l'administrateur choisit le motif {string} pour l'étape {string}", async ({ monde }, motif, etape) => {
    monde.reponse = await (await adminApi(monde)).put('/api/affectation/colors', { patterns: { [etape]: motif } });
});

Then("l'étape {string} a la couleur {string} et le motif {string}", async ({ monde }, etape, couleur, motif) => {
    const { colors, patterns } = await (await adminApi(monde)).ok('GET', '/api/affectation/config');
    expect(colors[etape]).toBe(couleur);
    expect(patterns[etape]).toBe(motif);
});

// ---------- SMTP ----------

When("l'administrateur consulte la configuration SMTP", async ({ monde }) => {
    monde.reponse = await (await adminApi(monde)).get('/api/email-config');
});

Then('la configuration SMTP ne contient pas le mot de passe en clair', async ({ monde }) => {
    expect(monde.reponse?.data, 'mot de passe SMTP renvoyé au navigateur').not.toHaveProperty('password');
});

Then("la configuration SMTP indique qu'un mot de passe est enregistré", async ({ monde }) => {
    expect(monde.reponse?.data?.passwordSet).toBe(true);
});

When("l'administrateur réenregistre la configuration SMTP sans ressaisir le mot de passe", async ({ monde, $test }) => {
    $test.skip(!config.smtpTest, 'SMTP de test non confirmé (E2E_SMTP_TEST)');
    const api = await adminApi(monde);
    const { host, port, secure, user } = await api.ok('GET', '/api/email-config');
    monde.reponse = await api.post('/api/email-config', { host, port, secure: !!secure, user, password: '' });
});

When("l'administrateur envoie un e-mail de test", async ({ monde, $test }) => {
    $test.skip(!config.smtpTest, 'SMTP de test non confirmé (E2E_SMTP_TEST)');
    monde.reponse = await (await adminApi(monde)).post('/api/email-config/test', {});
});

Then("l'envoi de l'e-mail de test est confirmé", async ({ monde }) => {
    expect(monde.reponse?.data, JSON.stringify(monde.reponse?.data)).toMatchObject({ success: true });
});

// ---------- Automatisations ----------

Given("la configuration de l'automatisation {int} sera rétablie après le scénario", async ({ monde, $test }, n) => {
    $test.skip(!config.smtpTest, 'SMTP de test non confirmé (E2E_SMTP_TEST)');
    const api = await adminApi(monde);
    const { config: initiale } = await api.ok('GET', `/api/automation/config/${n}`);
    monde.d.automatisation = initiale;
    monde.aNettoyer(`automatisation ${n}`, () => api.post(`/api/automation/config/${n}`, { config: initiale }));
});

When("l'administrateur bascule l'activation de l'automatisation {int}", async ({ monde }, n) => {
    const initiale = monde.d.automatisation;
    monde.reponse = await (
        await adminApi(monde)
    ).post(`/api/automation/config/${n}`, { config: { ...initiale, enabled: !initiale.enabled } });
    expect(monde.reponse.status).toBe(200);
});

Then(
    "l'activation de l'automatisation {int} est inversée et ses autres paramètres sont conservés",
    async ({ monde }, n) => {
        const { config: lue } = await (await adminApi(monde)).ok('GET', `/api/automation/config/${n}`);
        const { enabled, ...autres } = monde.d.automatisation;
        expect(!!lue.enabled).toBe(!enabled);
        expect(lue).toMatchObject(autres);
    }
);

// ---------- Aide en ligne ----------

When("j'ouvre l'aide en ligne", async ({ monde }) => {
    const { page } = await monde.anonyme('aide');
    await page.goto('/aide.html');
    await expect(page).toHaveTitle(/aide/i);
});

Then(
    "l'aide en ligne contient les notes de version jusqu'à la version courante de l'application",
    async ({ monde }) => {
        const { version } = await (await adminApi(monde)).ok('GET', '/api/version');
        monde.d.version = String(version).replace(/^v/, '');
        await expect(monde.page.locator('#section-notes-version')).toContainText(`v${monde.d.version}`);
    }
);

Then('la dernière version porte le badge « Actuelle »', async ({ monde }) => {
    const carte = monde.page.locator('#section-notes-version .card').first();
    await expect(carte.locator('.badge-current')).toHaveText('Actuelle');
    await expect(carte).toContainText(`v${monde.d.version}`);
});
