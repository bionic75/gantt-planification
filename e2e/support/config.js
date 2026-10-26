// @ts-check
// Configuration des tests lue dans e2e/.env (les variables d'environnement du système sont prioritaires)
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(E2E_DIR, '.env'), quiet: true });

const str = (/** @type {string} */ name, fallback = '') => (process.env[name] ?? fallback).trim();
const bool = (/** @type {string} */ name, fallback = false) => {
    const v = str(name);
    return v ? /^(1|true|oui|yes)$/i.test(v) : fallback;
};
const int = (/** @type {string} */ name, fallback = 0) => {
    const v = parseInt(str(name), 10);
    return Number.isFinite(v) ? v : fallback;
};

/**
 * Profils de l'application : clé interne (celle de l'API), libellé utilisé dans les scénarios, préfixe des variables
 * @typedef {'admin' | 'expert' | 'user' | 'rh'} ProfilKey
 * @typedef {{ key: ProfilKey, label: string, login: string, password: string, totpSecret: string, mfa: boolean }} Profil
 */

/** @type {Record<ProfilKey, Profil>} */
export const PROFILS = {
    admin: {
        key: 'admin',
        label: 'Administrateur',
        login: str('E2E_ADMINISTRATEUR_LOGIN', 'planifadministrateur.testsansurgences'),
        password: str('E2E_ADMINISTRATEUR_PASSWORD'),
        totpSecret: str('E2E_ADMINISTRATEUR_TOTP_SECRET'),
        mfa: true
    },
    expert: {
        key: 'expert',
        label: 'Expert',
        login: str('E2E_EXPERT_LOGIN', 'planifexpert.testsansurgences'),
        password: str('E2E_EXPERT_PASSWORD'),
        totpSecret: str('E2E_EXPERT_TOTP_SECRET'),
        mfa: true
    },
    user: {
        key: 'user',
        label: 'Utilisateur',
        login: str('E2E_UTILISATEUR_LOGIN', 'planifutilisateur.testsansurgences'),
        password: str('E2E_UTILISATEUR_PASSWORD'),
        totpSecret: str('E2E_UTILISATEUR_TOTP_SECRET'),
        mfa: true
    },
    // Le profil RH n'est jamais soumis à la double authentification (src/modules/auth/mfa.service.js)
    rh: {
        key: 'rh',
        label: 'RH',
        login: str('E2E_RH_LOGIN', 'planifrh.testsansurgences'),
        password: str('E2E_RH_PASSWORD'),
        totpSecret: '',
        mfa: false
    }
};

/** Ordre des connexions de la mise en place : un code OTP à la fois, dans l'ordre chronologique des envois */
export const ORDRE_CONNEXIONS = /** @type {ProfilKey[]} */ (['admin', 'expert', 'user', 'rh']);

/** Libellé d'un scénario (« Administrateur », « Expert métier »…) → profil */
export function profil(/** @type {string} */ label) {
    const l = label.trim().toLowerCase();
    const key = /** @type {ProfilKey | undefined} */ (
        {
            administrateur: 'admin',
            admin: 'admin',
            expert: 'expert',
            'expert métier': 'expert',
            utilisateur: 'user',
            user: 'user',
            rh: 'rh'
        }[l]
    );
    if (!key) throw new Error(`Profil inconnu dans le scénario : « ${label} »`);
    return PROFILS[key];
}

export const config = {
    baseUrl: str('E2E_BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
    mail: {
        provider: str('E2E_MAIL_PROVIDER', 'imap').toLowerCase(),
        imap: {
            host: str('E2E_IMAP_HOST'),
            port: int('E2E_IMAP_PORT', 993),
            secure: bool('E2E_IMAP_SECURE', true),
            user: str('E2E_IMAP_USER'),
            password: str('E2E_IMAP_PASSWORD'),
            mailbox: str('E2E_IMAP_MAILBOX', 'INBOX')
        },
        mailpitUrl: str('E2E_MAILPIT_URL', 'http://localhost:8025').replace(/\/+$/, ''),
        sharedAddress: str('E2E_SHARED_MAILBOX'),
        otpSubject: str('E2E_OTP_SUBJECT', 'Code de vérification'),
        otpTimeoutMs: int('E2E_OTP_TIMEOUT', 90) * 1000
    },
    reuseAuth: bool('E2E_REUSE_AUTH', true),
    authMaxAgeMs: int('E2E_AUTH_MAX_AGE_HOURS', 8) * 3600 * 1000,
    tags: str('E2E_TAGS', 'not @manuel and not @destructif and not @exploitation and not @asana and not @lent'),
    workers: int('E2E_WORKERS', 2),
    asanaEnabled: bool('E2E_ASANA_ENABLED'),
    smtpTest: bool('E2E_SMTP_TEST', true),
    allowMfaReset: bool('E2E_ALLOW_MFA_RESET'),
    authDir: path.join(E2E_DIR, '.auth'),
    lockDir: path.join(E2E_DIR, '.auth', 'otp.lock')
};

/** Fichier de session enregistrée d'un profil */
export const storageStatePath = (/** @type {ProfilKey} */ key) => path.join(config.authDir, `${key}.json`);
