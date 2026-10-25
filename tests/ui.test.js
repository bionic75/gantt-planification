// Interface dans un vrai navigateur (Chromium) : connexion par l'écran de connexion, chaque onglet ouvert, page
// mobile et page d'aide, sans erreur JavaScript ni violation de la politique de contenu (CSP).
// Filet de sécurité du découpage du frontend : un script manquant ou chargé dans le mauvais ordre fait échouer ces tests.
import puppeteer from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, BROWSER_PATH, startServer } from './helpers/server.js';
import { createExpert, createUser, loginAs } from './helpers/fixtures.js';

const MOBILE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe.skipIf(!BROWSER_PATH)('interface (navigateur)', { timeout: 120000 }, () => {
    let server;
    let admin;
    let browser;

    beforeAll(async () => {
        server = await startServer();
        admin = await loginAs(server, ADMIN, 'admin');
        browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--no-sandbox'] });
    }, 120000);
    afterAll(async () => {
        await browser?.close();
        await server?.stop();
    });

    /** Nouvel onglet du navigateur ; problems : erreurs JavaScript non interceptées et violations CSP */
    async function openPage({ userAgent } = {}) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        if (userAgent) await page.setUserAgent(userAgent);
        const problems = [];
        page.on('pageerror', e => problems.push(`JS : ${e.message}`));
        page.on('console', m => {
            if (/Content Security Policy/i.test(m.text())) problems.push(`CSP : ${m.text()}`);
        });
        page.on('response', r => {
            // Fichiers de l'application introuvables (script ou feuille de style déplacés)
            if (r.status() === 404 && r.url().startsWith(server.baseUrl)) problems.push(`404 : ${r.url()}`);
        });
        return { page, problems, close: () => context.close() };
    }

    const pause = ms => new Promise(r => setTimeout(r, ms));
    const visible = (page, selector) =>
        page.$eval(selector, el => !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null);

    /** Connexion par le formulaire de l'écran de connexion */
    async function uiLogin(page, { username, password }) {
        await page.goto(server.baseUrl + '/', { waitUntil: 'networkidle2' });
        await page.type('#loginUsername', username);
        await page.type('#loginPassword', password);
        await page.click('#loginButton');
    }

    const waitForApp = page =>
        page.waitForFunction(() => !document.getElementById('loginPage').classList.contains('active'), {
            timeout: 20000
        });

    /** Ouvre chaque onglet visible de l'application ; renvoie les onglets ouverts */
    async function visitTabs(page) {
        const tabs = await page.$$eval('#mainTabsContainer button.tab-btn', buttons =>
            buttons.filter(b => b.offsetParent !== null).map(b => b.dataset.tab)
        );
        for (const tab of tabs) {
            // Clic par le DOM : une fenêtre ou un bandeau peut recouvrir la barre d'onglets
            await page.$eval(`#mainTabsContainer button.tab-btn[data-tab="${tab}"]`, b => b.click());
            await pause(600);
        }
        return tabs;
    }

    it('administrateur : connexion, tous les onglets', async () => {
        const { page, problems, close } = await openPage();
        try {
            await uiLogin(page, ADMIN);
            await waitForApp(page);
            const tabs = await visitTabs(page);
            expect(tabs).toEqual(expect.arrayContaining(['resources', 'planning', 'admin', 'reporting']));
            expect(problems).toEqual([]);
        } finally {
            await close();
        }
    });

    it('expert : connexion, onglets de son profil', async () => {
        const { user } = await createExpert(admin);
        const { page, problems, close } = await openPage();
        try {
            await uiLogin(page, user);
            await waitForApp(page);
            const tabs = await visitTabs(page);
            expect(tabs).toContain('planning');
            expect(tabs).not.toContain('admin');
            expect(problems).toEqual([]);
        } finally {
            await close();
        }
    });

    it('compte à plusieurs profils : choix du profil après le mot de passe', async () => {
        const user = await createUser(admin, { is_user: 1, is_rh: 1 });
        const { page, problems, close } = await openPage();
        try {
            await uiLogin(page, user);
            await page.waitForFunction(() => document.getElementById('profileSelectGroup').style.display !== 'none');
            const options = await page.$$eval('#loginProfile option', o => o.map(x => x.value).filter(Boolean));
            expect(options.sort()).toEqual(['rh', 'user']);
            await page.select('#loginProfile', 'user');
            await page.click('#loginButton');
            await waitForApp(page);
            expect(problems).toEqual([]);
        } finally {
            await close();
        }
    });

    it('double authentification : profil unique choisi par le serveur et transmis à la vérification', async () => {
        const mfaConfig = enabled => ({
            config: {
                enabled,
                method: 'both',
                frequency: 'always',
                profileAdmin: false,
                profileExpert: false,
                profileUser: true
            }
        });
        expect((await admin.post('/api/mfa/config', mfaConfig(true))).status).toBe(200);
        const user = await createUser(admin, { is_user: 1 });
        const { page, problems, close } = await openPage();
        try {
            await uiLogin(page, user);
            await page.waitForSelector('#mfaMethodChoiceModal.active', { timeout: 20000 });
            expect(await page.$eval('#mfaMethodPendingProfile', i => i.value)).toBe('user');
            expect(problems).toEqual([]);
        } finally {
            await close();
            await admin.post('/api/mfa/config', mfaConfig(false));
        }
    });

    it('mot de passe donné par un administrateur : changement obligatoire avant l’application, y compris après rechargement', async () => {
        const user = await createUser(admin, { is_user: 1 }, { changePassword: false });
        const { page, problems, close } = await openPage();
        try {
            await uiLogin(page, user);
            await page.waitForSelector('#forcedPasswordModal.active', { timeout: 20000 });
            expect(await page.$eval('#loginPage', p => p.classList.contains('active'))).toBe(true);

            // Rechargement : la session est ouverte mais l'application reste bloquée
            await page.reload({ waitUntil: 'networkidle2' });
            await page.waitForSelector('#forcedPasswordModal.active', { timeout: 20000 });

            await page.type('#forcedNewPassword', 'Choisi-par-moi-1');
            await page.type('#forcedConfirmPassword', 'Autre-chose-1');
            await page.click('#forcedPasswordButton');
            await page.waitForFunction(() =>
                /correspondent/.test(document.getElementById('forcedPasswordError').textContent)
            );

            await page.$eval('#forcedConfirmPassword', i => (i.value = ''));
            await page.type('#forcedConfirmPassword', 'Choisi-par-moi-1');
            await page.click('#forcedPasswordButton');
            await waitForApp(page);
            expect(await page.$eval('#forcedPasswordModal', m => m.classList.contains('active'))).toBe(false);
            expect(problems.filter(p => !p.includes('PASSWORD_CHANGE_REQUIRED'))).toEqual([]);
        } finally {
            await close();
        }
        expect(
            (await server.client().login(user.username, 'Choisi-par-moi-1', 'user')).data.user.mustChangePassword
        ).toBe(false);
    });

    it('mauvais mot de passe : message d’erreur, profils non révélés', async () => {
        const user = await createUser(admin, { is_user: 1, is_rh: 1 });
        const { page, problems, close } = await openPage();
        try {
            await uiLogin(page, { username: user.username, password: 'mauvais' });
            await page.waitForFunction(() => document.getElementById('loginError').textContent.trim() !== '');
            expect(await visible(page, '#profileSelectGroup')).toBe(false);
            expect(await page.$eval('#loginError', e => e.textContent)).toMatch(/Identifiants incorrects/);
            expect(problems).toEqual([]);
        } finally {
            await close();
        }
    });

    it('page mobile : connexion d’un expert', async () => {
        const { user } = await createExpert(admin);
        const { page, problems, close } = await openPage({ userAgent: MOBILE_UA });
        try {
            await page.goto(server.baseUrl + '/mobile', { waitUntil: 'networkidle2' });
            await page.waitForSelector('#loginUser', { visible: true });
            await page.type('#loginUser', user.username);
            await page.type('#loginPass', user.password);
            await page.click('#loginBtn');
            await page.waitForFunction(() => document.getElementById('loginScreen').classList.contains('hidden'), {
                timeout: 20000
            });
            await pause(800);
            expect(problems).toEqual([]);
        } finally {
            await close();
        }
    });

    it("page d'aide et application d'aide à l'affectation", async () => {
        const { page, problems, close } = await openPage();
        try {
            await page.goto(server.baseUrl + '/aide.html', { waitUntil: 'networkidle2' });
            expect(await page.title()).toMatch(/aide/i);
            await uiLogin(page, ADMIN);
            await waitForApp(page);
            await page.goto(server.baseUrl + '/affectation', { waitUntil: 'networkidle2' });
            await pause(800);
            expect(problems).toEqual([]);
        } finally {
            await close();
        }
    });
});
