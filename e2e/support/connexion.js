// @ts-check
// Connexion par la mire (bureau et mobile : même composant, frontend/src/connexion/MireConnexion.vue), double
// authentification comprise. Toute connexion pouvant demander un code OTP est faite sous verrou : une seule à la fois sur
// l'ensemble des workers, le code lu étant le plus récent arrivé dans la boîte partagée après la demande.
import { expect } from '@playwright/test';
import { boiteMail } from './boite-mail.js';
import { config } from './config.js';
import { codeTotp } from './totp.js';
import { sousVerrou } from './verrou.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('./config.js').Profil} Profil */
/**
 * @typedef {'application' | 'acces-reserve' | 'profil' | 'choix-mfa' | 'code-mfa' | 'totp-setup' | 'mot-de-passe-a-changer' | 'erreur' | 'erreur-mfa'} EtatMire
 * @typedef {{ etat: EtatMire, message?: string, codeUtilise?: string, messageCodeErrone?: string, mfaDemandee?: boolean }} ResultatConnexion
 * @typedef {{ password?: string, login?: string, methode?: 'email' | 'totp', codeMfa?: string, codeErroneAvant?: boolean, url?: string }} OptionsConnexion
 */

/**
 * État courant de la mire, attendu hors des états listés. Bureau : application ouverte quand la mire (#loginPage) n'est
 * plus « active » ; mobile : écran du planning ou « Accès réservé » affiché.
 */
async function attendreEtat(
    /** @type {Page} */ page,
    /** @type {EtatMire[]} */ exclus = [],
    mobile = false,
    timeout = 30000
) {
    const handle = await page.waitForFunction(
        ({ exclus, mobile }) => {
            const $ = (/** @type {string} */ id) => document.getElementById(id);
            const visible = (/** @type {HTMLElement | null} */ el) =>
                !!el && getComputedStyle(el).display !== 'none' && !!el.textContent?.trim();
            const cache = (/** @type {string} */ id) => !!$(id)?.classList.contains('hidden');
            /** Étape de la mire (identifiants, choix-mfa, code-mfa, totp-setup ; attente : envoi du code en cours) */
            const etape = document.querySelector('#loginPage [data-etape]')?.getAttribute('data-etape');
            /** @type {string | null} */
            let etat = null;
            if (mobile) {
                if (!cache('accessDeniedScreen')) etat = 'acces-reserve';
                else if (!cache('planningScreen')) etat = 'planning';
                // Connexion validée, écran suivant en cours d'affichage
                else if (cache('loginScreen')) return null;
            } else if ($('forcedPasswordModal')) etat = 'mot-de-passe-a-changer';
            // Application ouverte : mire masquée, ou session ouverte par la mire (gp:session-ouverte) même si une déconnexion
            // l'a aussitôt réaffichée (scénario de déconnexion pendant l'ouverture de l'application)
            else if (!$('loginPage')?.classList.contains('active') || /** @type {any} */ (window).__e2eSessionOuverte)
                etat = 'application';
            if (!etat) {
                if (etape === 'attente') return null;
                if (etape === 'code-mfa') etat = visible($('mfaCodeError')) ? 'erreur-mfa' : 'code-mfa';
                else if (etape === 'totp-setup') etat = 'totp-setup';
                else if (etape === 'choix-mfa') etat = 'choix-mfa';
                else if (visible($('loginError'))) etat = 'erreur';
                else if ($('loginProfile')) etat = 'profil';
            }
            if (etat === 'planning') etat = 'application';
            if (!etat || exclus.includes(etat)) return null;
            // Bouton occupé : réponse du serveur en attente
            if (document.querySelector('#loginPage .lp-busy')) return null;
            return etat;
        },
        { exclus, mobile },
        { timeout, polling: 200 }
    );
    return /** @type {EtatMire} */ (await handle.jsonValue());
}

/** Texte d'un message de la mire ; vide si le message n'est pas affiché (élément créé seulement en cas d'erreur) */
const texte = async (/** @type {Page} */ page, /** @type {string} */ sel) =>
    (
        (await page
            .locator(sel)
            .textContent({ timeout: 2000 })
            .catch(() => '')) ?? ''
    ).trim();

/**
 * Identifiants saisis et validés, puis étapes de la mire parcourues (profil, double authentification) jusqu'à un état
 * final : application ouverte, erreur, mot de passe à changer…
 * @param {Page} page
 * @param {Profil} profil
 * @param {OptionsConnexion} options
 * @param {boolean} mobile
 * @returns {Promise<ResultatConnexion>}
 */
async function parcourirMire(page, profil, options, mobile) {
    const password = options.password ?? profil.password;
    if (!password) throw new Error(`Mot de passe du profil ${profil.label} absent : renseigner e2e/.env`);
    await page.locator('#loginUsername').fill(options.login ?? profil.login);
    await page.locator('#loginPassword').fill(password);

    const methode = options.methode || (profil.totpSecret && !mobile ? 'totp' : 'email');
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
    // Session ouverte par la mire du bureau : repère posé avant la connexion
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__e2eSessionOuverte = false;
        window.addEventListener('gp:session-ouverte', () => (w.__e2eSessionOuverte = true), { once: true });
    });
    await page.locator('#loginButton').click();

    let mfaDemandee = false;
    /** @type {EtatMire[]} */
    let exclus = [];
    for (let tour = 0; tour < 6; tour++) {
        const etat = await attendreEtat(page, exclus, mobile);
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
                    // Code envoyé dès le choix de la méthode : repère pris avant
                    boite = boite || boiteMail();
                    repere = await boite.repere();
                    await page
                        .locator('#loginPage')
                        .getByRole('button', { name: /Code par email/ })
                        .click();
                }
                exclus = ['choix-mfa', 'profil'];
                break;
            case 'code-mfa': {
                const parTotp = (await page.locator('#loginPage [data-etape]').getAttribute('data-methode')) === 'totp';
                let code = options.codeMfa;
                if (!code && parTotp) {
                    if (!profil.totpSecret)
                        throw new Error(`Code TOTP demandé pour ${profil.label} : secret TOTP absent de e2e/.env`);
                    code = codeTotp(profil.totpSecret);
                }
                if (!code) {
                    if (!boite)
                        throw (
                            erreurBoite || new Error('Code par e-mail demandé sans repère pris dans la boîte partagée')
                        );
                    code = await boite.attendreCode(repere);
                }
                /** @type {string | undefined} */
                let messageCodeErrone;
                if (options.codeErroneAvant) {
                    await page.locator('#mfaCodeInput').fill(code === '000000' ? '111111' : '000000');
                    await page.locator('#mfaVerifyButton').click();
                    expect(await attendreEtat(page, ['code-mfa'], mobile)).toBe('erreur-mfa');
                    messageCodeErrone = await texte(page, '#mfaCodeError');
                }
                // fill() ne déclenche pas la vérification automatique (keyup) : un seul envoi du code
                await page.locator('#mfaCodeInput').fill(code);
                await page.locator('#mfaVerifyButton').click();
                let suite;
                try {
                    suite = await attendreEtat(page, ['code-mfa', 'erreur-mfa'], mobile);
                } catch {
                    return {
                        etat: 'erreur-mfa',
                        message: await texte(page, '#mfaCodeError'),
                        codeUtilise: code,
                        messageCodeErrone,
                        mfaDemandee
                    };
                }
                if (suite === 'mot-de-passe-a-changer' || suite === 'application' || suite === 'acces-reserve') {
                    return { etat: suite, codeUtilise: code, messageCodeErrone, mfaDemandee };
                }
                exclus = ['code-mfa', 'erreur-mfa'];
                break;
            }
            case 'totp-setup':
                throw new Error(`Application TOTP non configurée pour ${profil.label} : utiliser la méthode « email »`);
            case 'erreur':
                return { etat, message: await texte(page, '#loginError'), mfaDemandee };
            case 'erreur-mfa':
                return { etat, message: await texte(page, '#mfaCodeError'), mfaDemandee };
            default:
                return { etat, mfaDemandee };
        }
    }
    throw new Error('Connexion : enchaînement des écrans de la mire inattendu');
}

/**
 * Connexion par la mire du bureau. Renvoie l'état atteint (application ouverte, erreur, changement de mot de passe…).
 * @param {Page} page
 * @param {Profil} profil
 * @param {OptionsConnexion} [options]
 * @returns {Promise<ResultatConnexion>}
 */
export async function connexionBureau(page, profil, options = {}) {
    const run = async () => {
        // Adresse de la page : lien d'une notification (« /?tab=cra&cra_id=… »), traité à la connexion
        await page.goto(options.url ?? '/');
        await expect(page.locator('#loginPage')).toHaveClass(/active/);
        await expect(page.locator('#loginUsername')).toBeVisible();
        return parcourirMire(page, profil, options, false);
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
        const r = await parcourirMire(page, profil, {}, true);
        if (r.etat === 'application') return { etat: /** @type {const} */ ('planning') };
        if (r.etat === 'acces-reserve') return { etat: r.etat };
        return { etat: /** @type {const} */ ('erreur'), message: r.message || r.etat };
    };
    return /** @type {Promise<{ etat: 'planning' | 'acces-reserve' | 'erreur', message?: string }>} */ (
        profil.mfa ? sousVerrou(config.lockDir, run) : run()
    );
}
