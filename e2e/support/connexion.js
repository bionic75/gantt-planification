// @ts-check
// Connexion par la mire (bureau et mobile), double authentification comprise.
// Toute connexion pouvant demander un code OTP est faite sous verrou : une seule à la fois sur l'ensemble des
// workers, le code lu étant le plus récent arrivé dans la boîte partagée après la demande.
import { expect } from '@playwright/test';
import { boiteMail } from './boite-mail.js';
import { config } from './config.js';
import { codeTotp } from './totp.js';
import { sousVerrou } from './verrou.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('./config.js').Profil} Profil */
/**
 * @typedef {'application' | 'profil' | 'choix-mfa' | 'code-mfa' | 'totp-setup' | 'mot-de-passe-a-changer' | 'erreur' | 'erreur-mfa'} EtatMire
 * @typedef {{ etat: EtatMire, message?: string, codeUtilise?: string, messageCodeErrone?: string, mfaDemandee?: boolean }} ResultatConnexion
 * @typedef {{ password?: string, login?: string, methode?: 'email' | 'totp', codeMfa?: string, codeErroneAvant?: boolean }} OptionsConnexion
 */

/** État courant de la mire de connexion du bureau, attendu hors des états listés */
async function attendreEtat(/** @type {Page} */ page, /** @type {EtatMire[]} */ exclus = [], timeout = 30000) {
    const handle = await page.waitForFunction(
        exclus => {
            const $ = (/** @type {string} */ id) => document.getElementById(id);
            const actif = (/** @type {string} */ id) => !!$(id)?.classList.contains('active');
            const visible = (/** @type {HTMLElement | null} */ el) =>
                !!el &&
                el.style.display !== 'none' &&
                getComputedStyle(el).display !== 'none' &&
                !!el.textContent?.trim();
            /** @type {string | null} */
            let etat = null;
            if (actif('forcedPasswordModal')) etat = 'mot-de-passe-a-changer';
            else if (actif('mfaCodeModal')) etat = visible($('mfaCodeError')) ? 'erreur-mfa' : 'code-mfa';
            else if (actif('mfaTotpSetupModal')) etat = 'totp-setup';
            else if (actif('mfaMethodChoiceModal')) etat = 'choix-mfa';
            else if (!actif('loginPage')) etat = 'application';
            else if (visible($('loginError'))) etat = 'erreur';
            else if ($('profileSelectGroup')?.style.display === 'block') etat = 'profil';
            if (!etat || exclus.includes(etat)) return null;
            // Bouton occupé : réponse du serveur en attente
            if ($('loginButton')?.classList.contains('lp-busy')) return null;
            return etat;
        },
        exclus,
        { timeout, polling: 200 }
    );
    return /** @type {EtatMire} */ (await handle.jsonValue());
}

const texte = async (/** @type {Page} */ page, /** @type {string} */ sel) =>
    (await page.locator(sel).textContent())?.trim() || '';

/**
 * Connexion par la mire du bureau. Renvoie l'état atteint (application ouverte, erreur, changement de mot de passe…).
 * @param {Page} page
 * @param {Profil} profil
 * @param {OptionsConnexion} [options]
 * @returns {Promise<ResultatConnexion>}
 */
export async function connexionBureau(page, profil, options = {}) {
    const password = options.password ?? profil.password;
    if (!password) throw new Error(`Mot de passe du profil ${profil.label} absent : renseigner e2e/.env`);
    const run = async () => {
        await page.goto('/');
        await expect(page.locator('#loginPage')).toHaveClass(/active/);
        await page.locator('#loginUsername').fill(options.login ?? profil.login);
        await page.locator('#loginPassword').fill(password);

        const methode = options.methode || (profil.totpSecret ? 'totp' : 'email');
        // Méthode « email » configurée : le code part dès la réponse de connexion, le repère est pris avant.
        // Boîte non configurée : l'erreur n'est levée que si un code est effectivement demandé.
        /** @type {import('./boite-mail.js').BoiteMail | null} */
        let boite = null;
        /** @type {unknown} */
        let repere = null;
        /** @type {Error | null} */
        let erreurBoite = null;
        if (profil.mfa && methode === 'email' && !options.codeMfa) {
            try {
                boite = boiteMail();
                repere = await boite.repere();
            } catch (/** @type {any} */ e) {
                erreurBoite = e;
            }
        }
        await page.locator('#loginButton').click();

        let mfaDemandee = false;
        /** @type {EtatMire[]} */
        let exclus = [];
        for (let tour = 0; tour < 6; tour++) {
            const etat = await attendreEtat(page, exclus);
            if (etat === 'choix-mfa' || etat === 'code-mfa') mfaDemandee = true;
            switch (etat) {
                case 'profil':
                    await page.locator('#loginProfile').selectOption(profil.key);
                    await page.locator('#loginButton').click();
                    exclus = ['profil'];
                    break;
                case 'choix-mfa':
                    if (methode === 'totp') {
                        await page.locator('#mfaMethodTotpButton').click();
                    } else {
                        boite = boite || boiteMail();
                        repere = await boite.repere();
                        await page
                            .locator('#mfaMethodChoiceModal button[onclick="chooseMfaMethod(\'email\')"]')
                            .click();
                    }
                    exclus = ['choix-mfa', 'profil'];
                    break;
                case 'code-mfa': {
                    const parTotp = (await texte(page, '#mfaCodeIcon')) === '📱';
                    let code = options.codeMfa;
                    if (!code && parTotp) {
                        if (!profil.totpSecret)
                            throw new Error(`Code TOTP demandé pour ${profil.label} : secret TOTP absent de e2e/.env`);
                        code = codeTotp(profil.totpSecret);
                    }
                    if (!code) {
                        if (!boite)
                            throw (
                                erreurBoite ||
                                new Error('Code par e-mail demandé sans repère pris dans la boîte partagée')
                            );
                        code = await boite.attendreCode(repere);
                    }
                    /** @type {string | undefined} */
                    let messageCodeErrone;
                    if (options.codeErroneAvant) {
                        await page.locator('#mfaCodeInput').fill(code === '000000' ? '111111' : '000000');
                        await page.locator('#mfaVerifyButton').click();
                        expect(await attendreEtat(page, ['code-mfa'])).toBe('erreur-mfa');
                        messageCodeErrone = await texte(page, '#mfaCodeError');
                    }
                    // fill() ne déclenche pas la vérification automatique (keyup) : un seul envoi du code
                    await page.locator('#mfaCodeInput').fill(code);
                    await page.locator('#mfaVerifyButton').click();
                    let suite;
                    try {
                        suite = await attendreEtat(page, ['code-mfa', 'erreur-mfa']);
                    } catch {
                        return {
                            etat: 'erreur-mfa',
                            message: await texte(page, '#mfaCodeError'),
                            codeUtilise: code,
                            messageCodeErrone,
                            mfaDemandee
                        };
                    }
                    if (suite === 'mot-de-passe-a-changer' || suite === 'application') {
                        return { etat: suite, codeUtilise: code, messageCodeErrone, mfaDemandee };
                    }
                    exclus = ['code-mfa', 'erreur-mfa'];
                    break;
                }
                case 'totp-setup':
                    throw new Error(
                        `Application TOTP non configurée pour ${profil.label} : utiliser la méthode « email »`
                    );
                case 'erreur':
                    return { etat, message: await texte(page, '#loginError'), mfaDemandee };
                case 'erreur-mfa':
                    return { etat, message: await texte(page, '#mfaCodeError'), mfaDemandee };
                default:
                    return { etat, mfaDemandee };
            }
        }
        throw new Error('Connexion : enchaînement des écrans de la mire inattendu');
    };
    return profil.mfa ? sousVerrou(config.lockDir, run) : run();
}

/** Connexion réussie : application ouverte, bandeau utilisateur affiché */
export async function connecterBureau(
    /** @type {Page} */ page,
    /** @type {Profil} */ profil,
    /** @type {OptionsConnexion} */ options = {}
) {
    const r = await connexionBureau(page, profil, options);
    if (r.etat !== 'application') {
        throw new Error(
            `Connexion de ${profil.label} (${profil.login}) : état « ${r.etat} » ${r.message || ''}`.trim()
        );
    }
    await expect(page.locator('#userInfo')).toBeVisible({ timeout: 30000 });
    return r;
}

/**
 * Connexion par la page mobile (/mobile.html). Renvoie 'planning', 'acces-reserve' ou l'erreur affichée.
 * @param {Page} page
 * @param {Profil} profil
 * @returns {Promise<{ etat: 'planning' | 'acces-reserve' | 'erreur', message?: string }>}
 */
export async function connexionMobile(page, profil) {
    const run = async () => {
        await page.goto('/mobile.html');
        // Vérification de session au chargement terminée (elle réaffiche la mire et effacerait une saisie en cours)
        await expect(page.locator('#loginScreen')).not.toHaveClass(/\bhidden\b/, { timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.locator('#loginUser').fill(profil.login);
        await page.locator('#loginPass').fill(profil.password);
        await page.locator('#loginBtn').click();

        const etatMobile = async () =>
            (
                await page.waitForFunction(
                    () => {
                        const $ = (/** @type {string} */ id) => document.getElementById(id);
                        const cache = (/** @type {string} */ id) => !!$(id)?.classList.contains('hidden');
                        if (!cache('accessDeniedScreen')) return 'acces-reserve';
                        if (!cache('planningScreen')) return 'planning';
                        // Connexion validée, écran suivant en cours d'affichage
                        if (cache('loginScreen')) return null;
                        if (!cache('mfaForm')) {
                            if ($('mfaError')?.textContent?.trim()) return 'erreur-mfa';
                            if ($('mfaMethodChoice')?.style.display === 'flex') return 'choix';
                            if ($('mfaSendEmailBlock')?.style.display === 'block') return 'envoi';
                            if ($('mfaCodeBlock')?.style.display === 'block') return 'code';
                        }
                        if ($('loginError')?.textContent?.trim()) return 'erreur';
                        return null;
                    },
                    undefined,
                    { timeout: 30000, polling: 200 }
                )
            ).jsonValue();

        /** @type {import('./boite-mail.js').BoiteMail | null} */
        let boite = null;
        /** @type {unknown} */
        let repere = null;
        for (let tour = 0; tour < 5; tour++) {
            const etat = await etatMobile();
            if (etat === 'planning' || etat === 'acces-reserve') return { etat };
            if (etat === 'erreur' || etat === 'erreur-mfa') {
                return {
                    etat: 'erreur',
                    message: (await page.locator(etat === 'erreur' ? '#loginError' : '#mfaError').textContent())?.trim()
                };
            }
            if (etat === 'choix') {
                await page.locator('#mfaMethodChoice button', { hasText: 'email' }).click();
            } else if (etat === 'envoi') {
                boite = boite || boiteMail();
                repere = await boite.repere();
                await page.locator('#mfaSendBtn').click();
                await expect(page.locator('#mfaCodeBlock')).toBeVisible({ timeout: 30000 });
            } else if (etat === 'code') {
                const code = boite && repere !== null ? await boite.attendreCode(repere) : codeTotp(profil.totpSecret);
                await page.locator('#mfaCodeInput').fill(code);
                await page.locator('#mfaVerifyBtn').click();
                await page.waitForFunction(
                    () =>
                        !!document.getElementById('loginScreen')?.classList.contains('hidden') ||
                        !document.getElementById('accessDeniedScreen')?.classList.contains('hidden') ||
                        !!document.getElementById('mfaError')?.textContent?.trim(),
                    undefined,
                    { timeout: 30000 }
                );
            }
        }
        throw new Error('Connexion mobile : enchaînement des écrans inattendu');
    };
    return /** @type {Promise<{ etat: 'planning' | 'acces-reserve' | 'erreur', message?: string }>} */ (
        profil.mfa ? sousVerrou(config.lockDir, run) : run()
    );
}
