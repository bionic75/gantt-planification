// @ts-check
// Mise en place : connexion de chaque profil, l'un après l'autre (jamais en parallèle), pour lire les codes OTP
// dans la boîte partagée dans l'ordre chronologique des connexions. Les sessions sont enregistrées dans .auth/
// et réutilisées par les scénarios (et par les lancements suivants tant qu'elles restent valides).
import fs from 'fs';
import { expect, request, test as setup } from '@playwright/test';
import { config, ORDRE_CONNEXIONS, PROFILS, storageStatePath } from './support/config.js';
import { connecterBureau } from './support/connexion.js';

setup.describe.configure({ mode: 'serial' });

/** Session enregistrée encore utilisable : assez récente et acceptée par le serveur */
async function sessionValide(/** @type {string} */ fichier) {
    if (!config.reuseAuth || !fs.existsSync(fichier)) return false;
    if (Date.now() - fs.statSync(fichier).mtimeMs > config.authMaxAgeMs) return false;
    const ctx = await request.newContext({ baseURL: config.baseUrl, storageState: fichier });
    try {
        const r = await ctx.get('/api/check-session');
        return r.status() === 200 && !(await r.json()).mustChangePassword;
    } finally {
        await ctx.dispose();
    }
}

for (const key of ORDRE_CONNEXIONS) {
    const profil = PROFILS[key];
    setup(`connexion ${profil.label}`, async ({ browser }) => {
        setup.setTimeout(config.mail.otpTimeoutMs + 120_000);
        const fichier = storageStatePath(key);
        if (await sessionValide(fichier)) {
            setup.info().annotations.push({ type: 'session', description: 'session existante réutilisée' });
            return;
        }
        expect(profil.password, `Mot de passe du profil ${profil.label} absent de e2e/.env`).toBeTruthy();
        const context = await browser.newContext({
            baseURL: config.baseUrl,
            locale: 'fr-FR',
            timezoneId: 'Europe/Paris'
        });
        try {
            const page = await context.newPage();
            await connecterBureau(page, profil);
            const session = await page.request.get('/api/check-session');
            expect(session.status()).toBe(200);
            expect((await session.json()).activeProfile).toBe(key);
            fs.mkdirSync(config.authDir, { recursive: true });
            await context.storageState({ path: fichier });
        } finally {
            await context.close();
        }
    });
}
