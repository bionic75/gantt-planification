// @ts-check
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { badRequest, forbidden, HttpError, notFound, unauthorized } from '../../lib/http-error.js';
import { emailConfig, sendEmail } from '../../lib/mailer.js';
import { PASSWORD_RULE, passwordStrengthError } from '../../lib/password.js';
import { rejectRevokedSession } from '../../middlewares/auth.js';
import { activeSessions, revokeUserSessions } from '../../state/sessions.js';
import { mfaCodeEmail, passwordResetLinkEmail } from './auth.emails.js';
import * as auth from './auth.service.js';
import { consumeMfaAttempt, MAX_CODE_SENDS, startMfaPending } from './mfa-pending.js';
import * as mfa from './mfa.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */
/** @typedef {import('./auth.service.js').Profile} Profile */

const tooManyAttempts = () => new HttpError(429, 'Trop de tentatives. Veuillez vous reconnecter.');

// ---------- Ouverture de session ----------

/**
 * Ouvre la session (nouvel identifiant de session : prévient la fixation et efface une connexion MFA en attente)
 * et renvoie le profil de l'utilisateur au client.
 * @param {Request} req
 * @param {Response} res
 * @param {any} user
 * @param {Profile} profile
 */
async function completeLogin(req, res, user, profile) {
    await new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve(undefined))));
    Object.assign(req.session, {
        userId: user.id,
        username: user.username,
        nom: user.nom,
        prenom: user.prenom,
        activeProfile: profile,
        resourceId: user.resource_id,
        email: user.email,
        loginAt: Date.now(),
        // Mot de passe donné par un administrateur : l'application reste bloquée jusqu'à son remplacement
        mustChangePassword: user.must_change_password === 1
    });

    activeSessions.set(user.id, {
        lastActivity: Date.now(),
        profile,
        username: user.username,
        fullName: `${user.prenom || ''} ${user.nom || ''}`.trim() || user.username,
        profilePhoto: user.profile_photo || null
    });
    console.log(`🟢 Session active pour ${user.username} (userId: ${user.id})`);

    const logId = await auth.recordLogin(user, profile);
    if (logId !== null) req.session.logId = logId;

    const availableApps = await auth.getAvailableApps(user.id).catch(() => []);
    const amoaCed = availableApps.includes('deplacements');
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            trigramme: user.trigramme || null,
            profilePhoto: user.profile_photo || null,
            activeProfile: profile,
            resourceId: user.resource_id,
            hasReportingAccess: user.has_reporting_access === 1 || user.is_admin === 1,
            is_admin: user.is_admin === 1,
            is_expert: user.is_expert === 1,
            is_user: user.is_user === 1,
            is_rh: user.is_rh === 1,
            astreinte_volontaire: user.astreinte_volontaire === 1,
            astreinte_date_activation: user.astreinte_date_activation || null,
            defaultTab: user.default_tab || 'planning',
            mustChangePassword: user.must_change_password === 1,
            availableApps,
            amoaCed,
            is_amoa_ced: amoaCed
        }
    });
}

/**
 * Après vérification du mot de passe : demande le MFA si le profil y est soumis et qu'aucune
 * vérification récente n'est valide, sinon ouvre la session.
 * @param {Request} req
 * @param {Response} res
 * @param {any} user
 * @param {Profile} profile
 * @param {Record<string, unknown>} [extra] champs supplémentaires de la réponse « MFA requis »
 */
async function loginOrRequireMfa(req, res, user, profile, extra = {}) {
    const config = await mfa.getMfaConfig();
    if (mfa.profileRequiresMfa(config, profile) && !(await mfa.isMfaStillValid(user.id, config.frequency))) {
        startMfaPending(req, user.id, profile);
        return res.json({
            mfaRequired: true,
            mfaMethod: mfa.clientMfaMethod(config),
            totpConfigured: await mfa.isTotpConfigured(user.id),
            pendingUserId: user.id,
            ...extra
        });
    }
    await completeLogin(req, res, user, profile);
}

/**
 * Connexion. Sans profil : un compte à profil unique est connecté directement ; pour un compte à plusieurs
 * profils, la réponse { profileRequired, profiles } invite à en choisir un, puis à se reconnecter avec ce profil.
 * Les profils ne sont révélés qu'après vérification du mot de passe.
 */
export async function login(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { username, password, profile } = req.body;
    if (!username || !password) throw badRequest('Identifiant et mot de passe requis');

    const user = await auth.authenticate(username, password);
    if (!user) throw unauthorized('Identifiants incorrects');
    const profiles = auth.profilesOf(user);
    if (profile) {
        if (!profiles.includes(profile)) throw forbidden('Profil non autorisé');
        return loginOrRequireMfa(req, res, user, profile);
    }
    if (profiles.length === 0) throw forbidden('Aucun profil disponible');
    // Profil choisi par le serveur : rappelé au client si la double authentification est demandée
    if (profiles.length === 1) return loginOrRequireMfa(req, res, user, profiles[0], { profile: profiles[0] });
    res.json({ profileRequired: true, profiles });
}

/** Application mobile : profil choisi automatiquement (admin > expert > user) */
export async function mobileLogin(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { username, password } = req.body;
    if (!username || !password) throw badRequest('Username et password requis');

    const user = await auth.authenticate(username, password);
    if (!user) throw unauthorized('Identifiants incorrects');
    const profile = auth.profilesOf(user).find(p => p !== 'rh');
    if (!profile) throw forbidden('Aucun profil valide');
    // L'application mobile n'a pas d'écran de changement de mot de passe
    if (user.must_change_password === 1) {
        throw forbidden(
            'Mot de passe à changer : connectez-vous une première fois depuis un ordinateur pour choisir votre mot de passe.'
        );
    }

    await loginOrRequireMfa(req, res, user, profile, { pendingProfile: profile });
}

export async function logout(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { userId, username } = req.session;
    if (userId) {
        activeSessions.delete(userId);
        console.log(`🔴 Session terminée pour ${username} (userId: ${userId})`);
        auth.recordLogout(userId, username);
    }
    // Réponse après la suppression de la session en base : une requête suivante ne doit plus être authentifiée
    await new Promise(resolve => req.session.destroy(resolve));
    res.json({ success: true });
}

export async function checkSession(/** @type {Request} */ req, /** @type {Response} */ res) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ authenticated: false });
    }
    if (rejectRevokedSession(req, res)) return;
    const { userId } = req.session;
    const userData = await auth.getSessionUserData(userId).catch(err => {
        console.error('Erreur récupération données session:', err);
        return null;
    });
    const availableApps = await auth.getAvailableApps(userId).catch(() => []);
    res.json({
        userId,
        username: req.session.username,
        nom: req.session.nom,
        prenom: req.session.prenom,
        email: userData?.email || null,
        activeProfile: req.session.activeProfile,
        resourceId: req.session.resourceId,
        trigramme: userData?.trigramme || null,
        profilePhoto: userData?.profile_photo || null,
        availableApps,
        amoaCed: availableApps.includes('deplacements'),
        is_amoa_ced: availableApps.includes('deplacements'),
        is_admin: userData?.is_admin === 1,
        is_expert: userData?.is_expert === 1,
        is_user: userData?.is_user === 1,
        is_rh: userData?.is_rh === 1,
        astreinte_volontaire: userData?.astreinte_volontaire === 1,
        astreinte_date_activation: userData?.astreinte_date_activation || null,
        mustChangePassword: !!req.session.mustChangePassword
    });
}

/** Changer de profil sans se déconnecter */
export async function switchProfile(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { profile } = req.body;
    const userId = /** @type {number} */ (req.session.userId);
    const profiles = await auth.getUserProfiles(userId);
    if (!profiles) throw new HttpError(500, 'Utilisateur introuvable');
    if (!profiles.includes(profile)) throw forbidden('Profil non autorisé');

    req.session.activeProfile = profile;
    const tracked = activeSessions.get(userId);
    if (tracked) tracked.profile = profile;
    console.log(`🔄 ${req.session.username} a switché vers le profil: ${profile}`);
    res.json({ success: true, activeProfile: profile });
}

// ---------- Mot de passe oublié ----------

const RESET_REQUESTED_MESSAGE =
    "Si un compte actif correspond à cet identifiant, un email contenant un lien de réinitialisation vient d'être envoyé à l'adresse associée. Le lien est valable 1 heure. Sans email reçu, contactez un administrateur.";
const INVALID_RESET_LINK = 'Lien de réinitialisation invalide ou expiré. Faites une nouvelle demande.';

/**
 * Envoie un lien de réinitialisation à usage unique. Le mot de passe actuel n'est pas modifié.
 * La réponse est identique que le compte existe ou non (pas de divulgation des identifiants),
 * et l'email est envoyé après la réponse (temps de réponse indépendant du compte).
 */
export async function forgotPassword(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { username } = req.body;
    if (!username || typeof username !== 'string') throw badRequest('Identifiant requis');

    const reset = await auth.createPasswordResetToken(username);
    res.json({ success: true, message: RESET_REQUESTED_MESSAGE });
    if (!reset) return;

    const { user, token } = reset;
    // Jamais l'en-tête Host (contrôlable par le client) : APP_URL est obligatoire en production
    const link = `${env.APP_URL || `${req.protocol}://${req.get('host')}`}/?reset_token=${token}`;
    sendEmail(
        user.email,
        'Réinitialisation de votre mot de passe',
        passwordResetLinkEmail({ prenom: user.prenom, nom: user.nom, username: user.username, link })
    ).catch(err => console.error(`Erreur envoi lien de réinitialisation (userId ${user.id}):`, err.message));
}

/** Vérifie un lien avant d'afficher le formulaire de nouveau mot de passe */
export async function checkResetToken(/** @type {Request} */ req, /** @type {Response} */ res) {
    if (!(await auth.findValidResetToken(req.body.token))) throw badRequest(INVALID_RESET_LINK);
    res.json({ valid: true, passwordRule: PASSWORD_RULE });
}

/** Définit le nouveau mot de passe à partir d'un lien valide ; les sessions ouvertes du compte sont fermées */
export async function resetPassword(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { token, newPassword } = req.body;
    const reset = await auth.findValidResetToken(token);
    if (!reset) throw badRequest(INVALID_RESET_LINK);

    const weakness = passwordStrengthError(newPassword);
    if (weakness) throw badRequest(weakness);
    if (!(await auth.applyPasswordReset(reset, newPassword))) throw badRequest(INVALID_RESET_LINK);

    await revokeUserSessions(reset.user.id);
    res.json({ success: true, message: 'Mot de passe modifié. Vous pouvez vous connecter.' });
}

// ---------- MFA : administration ----------

export async function getMfaConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ config: (await mfa.getMfaConfig()) || {} });
}

export async function saveMfaConfig(/** @type {Request} */ req, /** @type {Response} */ res) {
    await mfa.saveMfaConfig(req.body.config);
    console.log('🔐 Configuration MFA sauvegardée:', req.body.config);
    res.json({ success: true });
}

export async function resetUserTotp(/** @type {Request} */ req, /** @type {Response} */ res) {
    await mfa.resetUserMfa(req.params.userId);
    console.log(`🔐 TOTP réinitialisé pour userId: ${req.params.userId}`);
    res.json({ success: true });
}

export async function resetAllMfa(/** @type {Request} */ req, /** @type {Response} */ res) {
    await mfa.resetAllMfa();
    console.log('🔐 MFA réinitialisé pour tous les utilisateurs');
    res.json({ success: true });
}

// ---------- MFA : vérification (connexion en attente, voir mfa-pending.js) ----------

const pendingOf = (/** @type {Request} */ req) => /** @type {NonNullable<Request['mfaPending']>} */ (req.mfaPending);

export async function sendMfaCode(/** @type {Request} */ req, /** @type {Response} */ res) {
    const pending = pendingOf(req);
    if (pending.codeSends >= MAX_CODE_SENDS) {
        throw new HttpError(429, 'Trop de demandes de code. Veuillez vous reconnecter.');
    }
    pending.codeSends++;

    const user = await auth.getUserContact(pending.userId);
    if (!user || !user.email) throw badRequest('Utilisateur sans email');
    if (!emailConfig.user || !emailConfig.password) {
        throw new HttpError(
            500,
            'Configuration SMTP non renseignée dans Administration → Configuration Email. Veuillez utiliser le code TOTP (QR code) à la place.'
        );
    }

    const code = await mfa.createEmailCode(pending.userId);
    try {
        await sendEmail(
            user.email,
            '🔐 Code de vérification - Planning ANS',
            mfaCodeEmail({ prenom: user.prenom, code })
        );
    } catch (/** @type {any} */ error) {
        console.error('Erreur envoi code MFA:', error);
        let msg = error.message;
        if (error.code === 'ETIMEDOUT' || msg.includes('timeout')) {
            msg = `Impossible de joindre le serveur SMTP (${emailConfig.host}:${emailConfig.port}). Vérifiez la configuration email dans Administration, ou utilisez le code TOTP (QR code) à la place.`;
        } else if (error.code === 'EAUTH' || msg.includes('auth')) {
            msg = `Authentification SMTP échouée. Vérifiez l'email et le mot de passe dans Administration → Configuration Email.`;
        }
        throw new HttpError(500, msg);
    }
    console.log(`🔐 Code MFA envoyé à ${user.email}`);
    res.json({ success: true });
}

/** Valide un code email ou TOTP et ouvre la session */
export async function verifyMfa(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { userId, profile } = pendingOf(req);
    const code = String(req.body.code || '');
    if (!consumeMfaAttempt(req)) throw tooManyAttempts();

    let valid = await mfa.consumeEmailCode(userId, code);
    if (!valid) {
        const secret = await mfa.getTotpSecret(userId);
        valid = !!secret && mfa.verifyTotp(secret, code);
    }
    if (!valid) throw unauthorized('Code invalide ou expiré');

    await mfa.recordMfaValidation(userId);
    await completeLogin(req, res, await auth.getUserForLogin(userId), profile);
}

export async function totpStatus(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ configured: await mfa.isTotpConfigured(pendingOf(req).userId) });
}

/** Génère un secret TOTP (gardé en session jusqu'à confirmation) et son QR code */
export async function setupTotp(/** @type {Request} */ req, /** @type {Response} */ res) {
    const pending = pendingOf(req);
    // Un TOTP déjà configuré ne peut être remplacé qu'après réinitialisation par un administrateur
    if (await mfa.isTotpConfigured(pending.userId)) {
        throw forbidden('TOTP déjà configuré. Contactez un administrateur pour le réinitialiser.');
    }
    const user = await auth.getUserForLogin(pending.userId);
    if (!user) throw notFound('Utilisateur non trouvé');

    const secret = mfa.generateTotpSecret();
    pending.totpSecret = secret;
    res.json({ secret, qrCode: await QRCode.toDataURL(mfa.otpauthUrl(user.username, secret)) });
}

/** Confirme la configuration TOTP par un premier code et ouvre la session */
export async function confirmTotp(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { userId, profile, totpSecret: secret } = pendingOf(req);
    const code = String(req.body.code || '');

    if (!secret) throw badRequest('Aucune configuration TOTP en cours.');
    if (!consumeMfaAttempt(req)) throw tooManyAttempts();
    if (!mfa.verifyTotp(secret, code)) throw unauthorized('Code invalide');

    await mfa.saveTotpSecret(userId, secret);
    await mfa.recordMfaValidation(userId);
    console.log(`🔐 TOTP configuré pour l'utilisateur ${userId}`);
    await completeLogin(req, res, await auth.getUserForLogin(userId), profile);
}
