// @ts-check
// Sécurité : CSRF, injection SQL, cookies, secrets, requêtes volumineuses, en-têtes ; exploitation et non-régression
import { spawnSync } from 'child_process';
import http from 'http';
import https from 'https';
import path from 'path';
import { expect, request } from '@playwright/test';
import { config, E2E_DIR, PROFILS } from '../support/config.js';
import { adminApi, cle } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { ongletCle } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const ORIGINE_APPLICATION = new URL(config.baseUrl).origin;

// ---------- CSRF ----------

Given('le paramètre de test {string} sera supprimé après le scénario', async ({ monde }, cleParam) => {
    const api = await adminApi(monde);
    monde.aNettoyer(`paramètre ${cleParam}`, () => api.post('/api/settings', { key: cleParam, value: '' }));
});

When(
    "{string} enregistre le paramètre {string} à {string} depuis l'origine {string}",
    async ({ monde }, profil, k, v, origine) => {
        monde.reponse = await (
            await monde.apiDe(profil)
        ).post('/api/settings', { key: k, value: v }, { Origin: origine });
    }
);

When(
    "{string} enregistre le paramètre {string} à {string} avec l'en-tête Sec-Fetch-Site {string}",
    async ({ monde }, profil, k, v, site) => {
        monde.reponse = await (
            await monde.apiDe(profil)
        ).post('/api/settings', { key: k, value: v }, { 'Sec-Fetch-Site': site });
    }
);

When(
    "{string} enregistre le paramètre {string} à {string} depuis l'origine de l'application",
    async ({ monde }, profil, k, v) => {
        monde.reponse = await (
            await monde.apiDe(profil)
        ).post('/api/settings', { key: k, value: v }, { Origin: ORIGINE_APPLICATION });
    }
);

Then('le paramètre {string} vaut {string}', async ({ monde }, k, v) => {
    expect((await (await adminApi(monde)).ok('GET', '/api/settings'))[k]).toBe(v);
});

When("une connexion est demandée à l'API depuis l'origine {string}", async ({ monde }, origine) => {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const r = await ctx.post('/api/login', {
        data: { username: 'csrf.e2e', password: 'x' },
        headers: { Origin: origine }
    });
    monde.reponse = { status: r.status(), data: await r.json().catch(() => null), headers: r.headers() };
    await ctx.dispose();
});

// ---------- Injection SQL ----------

When('{string} appelle {string} avec la saisie {string}', async ({ monde }, profil, appel, saisie) => {
    const [methode, url] = appel.split(/\s+/);
    monde.reponse = await (
        await monde.apiDe(profil)
    ).appel(methode, url.replace('{saisie}', encodeURIComponent(saisie)));
});

Then("la réponse n'est pas une erreur serveur", async ({ monde }) => {
    expect(monde.reponse?.status, JSON.stringify(monde.reponse?.data)?.slice(0, 300)).toBeLessThan(500);
});

Then("la réponse ne contient pas d'erreur SQL", async ({ monde }) => {
    expect(JSON.stringify(monde.reponse?.data)).not.toMatch(/SQLITE_|syntax error|SQL syntax|PrismaClient|near "/i);
});

Then('la réponse ne renvoie pas de résultat inattendu', async ({ monde }) => {
    const d = monde.reponse?.data;
    if (monde.reponse?.status !== 200) return;
    const liste = Array.isArray(d) ? d : Object.values(d || {}).find(v => Array.isArray(v));
    expect(liste || [], JSON.stringify(d).slice(0, 300)).toHaveLength(0);
});

// ---------- Cookie de session ----------

When("un client ouvre une session par l'API de connexion", async ({ monde }) => {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    // Profil RH : jamais soumis à la double authentification, session ouverte directement
    const r = await ctx.post('/api/login', { data: { username: PROFILS.rh.login, password: PROFILS.rh.password } });
    expect(r.status(), await r.text()).toBe(200);
    monde.d.setCookie = r
        .headersArray()
        .filter(h => h.name.toLowerCase() === 'set-cookie')
        .map(h => h.value);
    await ctx.post('/api/logout');
    await ctx.dispose();
});

Then('le cookie de session est HttpOnly avec un attribut SameSite', async ({ monde }) => {
    expect(monde.d.setCookie.length, 'aucun cookie posé à la connexion').toBeGreaterThan(0);
    for (const c of monde.d.setCookie) {
        expect(c).toMatch(/;\s*HttpOnly/i);
        expect(c).toMatch(/;\s*SameSite=(Lax|Strict|None)/i);
    }
});

Then("le cookie de session est Secure si l'application est servie en HTTPS", async ({ monde }) => {
    const enHttps = config.baseUrl.startsWith('https:');
    for (const c of monde.d.setCookie) {
        if (enHttps) expect(c).toMatch(/;\s*Secure/i);
        else expect(c).not.toMatch(/;\s*Secure/i);
    }
});

Then('aucun utilisateur renvoyé ne contient de mot de passe, de hachage ni de secret TOTP', async ({ monde }) => {
    const texte = JSON.stringify(monde.reponse?.data);
    expect(texte).not.toMatch(/"password"\s*:/i);
    expect(texte).not.toMatch(/\$2[aby]\$\d{2}\$/);
    expect(texte).not.toMatch(/"totp_secret"\s*:/i);
});

// ---------- Requêtes volumineuses ----------

When("un client sans session interrompt l'envoi d'un fichier de 5 Mo", async () => {
    const url = new URL('/api/login', config.baseUrl);
    await new Promise(resolve => {
        const req = (url.protocol === 'https:' ? https : http).request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': 5 * 1024 * 1024 }
        });
        req.on('error', () => resolve(undefined));
        req.on('close', () => resolve(undefined));
        req.write(`{"username":"${'x'.repeat(1024 * 1024)}`);
        setTimeout(() => {
            req.destroy();
            resolve(undefined);
        }, 500);
    });
});

Then('le serveur reste disponible', async () => {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const r = await ctx.get('/api/version');
    expect(r.status()).toBe(200);
    await ctx.dispose();
});

When('un client sans session envoie une demande de connexion de {int} Ko', async ({ monde }, ko) => {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const r = await ctx.post('/api/login', { data: { username: 'x'.repeat(ko * 1024), password: 'x' } });
    monde.reponse = { status: r.status(), data: await r.json().catch(() => null), headers: r.headers() };
    await ctx.dispose();
});

// ---------- Journal des actions ----------

When("l'administrateur enregistre une affectation dans la planification de cette ressource", async ({ monde }) => {
    monde.d.debutAction = Date.now();
    await (
        await adminApi(monde)
    ).ok('POST', '/api/schedule/save', { [cle(monde.d.ressource.id, 'activity', '2031-01-06', 'AM')]: '5' });
});

Then("le journal des actions de l'administrateur contient une action de sauvegarde du planning", async ({ monde }) => {
    const { userId } = await monde.sessionDe('Administrateur');
    const api = await adminApi(monde);
    await expect(async () => {
        const { logs } = await api.ok('GET', `/api/logs/actions?userId=${userId}`);
        monde.d.journal = logs;
        expect(
            logs.some((/** @type {any} */ a) =>
                /planning/i.test(`${a.action_type} ${a.action || ''} ${a.description || ''}`)
            )
        ).toBe(true);
    }).toPass({ timeout: 10000 });
});

Then('le journal des actions ne contient aucun secret', async ({ monde }) => {
    const texte = JSON.stringify(monde.d.journal);
    for (const p of Object.values(PROFILS))
        if (p.password) expect(texte.includes(p.password), `mot de passe ${p.label}`).toBe(false);
    expect(texte).not.toMatch(/"(password|token|secret)"\s*:\s*"[^"*]+"/i);
});

// ---------- En-têtes, version, page d'accueil ----------

When("un client sans session ouvre la page d'accueil", async ({ monde }) => {
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const r = await ctx.get('/');
    monde.d.accueil = { status: r.status(), headers: r.headers(), corps: await r.text() };
    await ctx.dispose();
});

Then('les en-têtes de sécurité sont présents', async ({ monde }) => {
    const h = monde.d.accueil.headers;
    expect(h['x-powered-by']).toBeUndefined();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBeTruthy();
    expect(h['content-security-policy']).toMatch(/frame-ancestors/);
    expect(h['content-security-policy']).toMatch(/object-src 'none'/);
});

When('un client sans session appelle {string}', async ({ monde }, appel) => {
    const [methode, url] = appel.split(/\s+/);
    const { api } = await monde.anonyme('sans-session');
    monde.reponse = await api.appel(methode, url);
});

Then("la version de l'application est renseignée", async ({ monde }) => {
    expect(monde.reponse?.data?.version).toMatch(/^v?\d+\.\d+\.\d+/);
});

Then('la mire de connexion est servie', async ({ monde }) => {
    expect(monde.d.accueil.status).toBe(200);
    expect(monde.d.accueil.corps).toContain('id="loginPage"');
});

When("je consulte la version de Node.js de l'environnement", async ({ monde }) => {
    monde.d.versionNode = process.version.replace(/^v/, '');
});

Then('la version est {int}.{int}.{int} ou supérieure', async ({ monde }, maj, min, patch) => {
    const [a, b, c] = monde.d.versionNode.split('.').map(Number);
    const ok = a > maj || (a === maj && (b > min || (b === min && c >= patch)));
    expect(ok, `Node.js ${monde.d.versionNode}`).toBe(true);
});

When("je lance la vérification de parité des routes de l'application", async ({ monde, $test }) => {
    // Entrée du serveur de l'ancienne version (ex. server.legacy.js), comparée à server.js
    const reference = process.env.E2E_PARITY_REFERENCE?.trim();
    $test.skip(!reference, "E2E_PARITY_REFERENCE non renseignée (entrée du serveur de l'ancienne version)");
    const r = spawnSync('npm', ['run', 'test:parity', '--', String(reference)], {
        cwd: path.resolve(E2E_DIR, '..'),
        shell: true,
        encoding: 'utf8'
    });
    monde.d.parite = r;
    await monde.testInfo.attach('parité des routes', { body: `${r.stdout}\n${r.stderr}` });
});

Then("toutes les routes de l'ancienne version existent avec les mêmes contrôles d'accès", async ({ monde }) => {
    expect(monde.d.parite.status, monde.d.parite.stderr || monde.d.parite.stdout).toBe(0);
});

// ---------- Non-régression ----------

When("j'ouvre successivement chaque onglet visible", async ({ monde }) => {
    const page = monde.page;
    const onglets = await page
        .locator('#mainTabsContainer button.tab-btn')
        .evaluateAll(bs =>
            bs
                .filter(b => /** @type {HTMLElement} */ (b).offsetParent !== null)
                .map(b => /** @type {HTMLElement} */ (b).dataset.tab)
        );
    for (const k of onglets) {
        await page
            .locator(`#mainTabsContainer button.tab-btn[data-tab="${k}"]`)
            .evaluate(b => /** @type {HTMLElement} */ (b).click());
        await expect(page.locator(`#${k}.tab-content`)).toHaveClass(/active/);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(500);
    }
    monde.d.ongletsOuverts = onglets;
});

Then('au moins les onglets {string} ont été ouverts', async ({ monde }, liste) => {
    for (const libelle of liste.split(',').map(s => s.trim()))
        expect(monde.d.ongletsOuverts).toContain(ongletCle(libelle));
});
