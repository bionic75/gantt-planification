// @ts-check
import { env } from '../../config/env.js';
import { badRequest, forbidden } from '../../lib/http-error.js';
import { sendEmail } from '../../lib/mailer.js';
import { logUserAction } from '../../services/action-log.js';
import { activeSessions, revokeUserSessions } from '../../state/sessions.js';
import { accountCreatedEmail, passwordResetByAdminEmail } from './users.emails.js';
import * as service from './users.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const userId = (/** @type {Request} */ req) => /** @type {number} */ (req.session.userId);
const appUrlOf = (/** @type {Request} */ req) => env.APP_URL || `${req.protocol}://${req.get('host')}`;

/** Envoi d'email non bloquant pour l'opération : renvoie true si l'email est parti */
async function trySendEmail(/** @type {string} */ to, /** @type {string} */ subject, /** @type {string} */ html) {
    try {
        await sendEmail(to, subject, html);
        return true;
    } catch (error) {
        console.error('Erreur envoi email:', error);
        return false;
    }
}

// ---------- Lecture ----------

export async function list(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listUsers());
}

export async function listPublic(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listPublicUsers());
}

export async function listAmoaCed(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listAmoaCedUsers());
}

export async function search(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.searchUsers(String(req.query.q || '')));
}

export async function emailByResource(/** @type {Request} */ req, /** @type {Response} */ res) {
    const user = await service.getExpertByResource(req.params.resourceId);
    res.json(user && user.email ? { email: user.email, nom: user.nom, prenom: user.prenom } : { email: null });
}

// ---------- Création / modification ----------

export async function create(/** @type {Request} */ req, /** @type {Response} */ res) {
    const {
        username,
        password,
        nom,
        prenom,
        email,
        is_admin,
        is_expert,
        is_user,
        sendEmail: shouldSendEmail
    } = req.body;
    const id = await service.createUser(req.body);

    let emailSent = false;
    if (shouldSendEmail) {
        const roles = [is_admin && 'Administrateur', is_expert && 'Expert Métier', is_user && 'Utilisateur']
            .filter(Boolean)
            .join(', ');
        emailSent = await trySendEmail(
            email,
            'Création de votre compte - Planification GANTT',
            accountCreatedEmail({ prenom, nom, username, password, roles, appUrl: appUrlOf(req) })
        );
    }

    logUserAction(req, 'Création utilisateur', {
        userId: id,
        username,
        nom,
        prenom,
        roles: { is_admin, is_expert, is_user }
    });
    res.json({ id, success: true, emailSent });
}

export async function update(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id } = req.params;
    const resourceId = await service.updateUser(id, req.body);
    const { nom, prenom, is_admin, is_expert, is_user, has_reporting_access, amoa_ced } = req.body;
    logUserAction(req, 'Modification utilisateur', {
        userId: id,
        nom,
        prenom,
        roles: { is_admin, is_expert, is_user },
        resource_id: resourceId,
        has_reporting_access,
        amoa_ced
    });
    res.json({ success: true });
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id } = req.params;
    await service.deleteUser(id);
    logUserAction(req, 'Suppression utilisateur', { userId: id });
    res.json({ success: true });
}

export async function toggle(/** @type {Request} */ req, /** @type {Response} */ res) {
    const actif = await service.toggleUser(req.params.id);
    res.json({ success: true, actif });
}

/** Ferme toutes les sessions ouvertes de l'utilisateur (effet à leur prochaine requête) */
export async function forceLogout(/** @type {Request} */ req, /** @type {Response} */ res) {
    const targetId = parseInt(req.params.id);
    if (targetId === req.session.userId) throw badRequest('Vous ne pouvez pas vous déconnecter vous-même.');
    const wasConnected = activeSessions.has(targetId);
    await revokeUserSessions(targetId);
    logUserAction(req, 'Force déconnexion utilisateur', { targetUserId: targetId });
    res.json({ success: true, wasConnected });
}

// ---------- Droits ----------

export async function setReportingAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { hasAccess } = req.body;
    await service.setUserFlag(req.params.id, 'has_reporting_access', !!hasAccess);
    res.json({ success: true, hasReportingAccess: hasAccess });
}

export async function setRhAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.setUserFlag(req.params.id, 'is_rh', !!req.body.hasAccess);
    res.json({ success: true });
}

export async function setAmoaCed(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { hasAccess } = req.body;
    await service.setUserFlag(req.params.id, 'amoa_ced', !!hasAccess);
    res.json({ success: true, amoaCed: hasAccess });
}

export async function setAstreinteAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.setAstreinteAccess(req.params.id, !!req.body.hasAccess);
    res.json({ success: true });
}

export async function listAppAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json(await service.listAppAccess());
}

export async function grantAppAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.grantAppAccess(req.params.app, req.body.userId);
    res.json({ success: true });
}

export async function revokeAppAccess(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.revokeAppAccess(req.params.app, req.params.userId);
    res.json({ success: true });
}

// ---------- Mots de passe ----------

export async function resetPassword(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { newPassword, sendEmail: shouldSendEmail } = req.body;
    const user = await service.resetPassword(req.params.id, newPassword);

    const emailSent = shouldSendEmail
        ? await trySendEmail(
              user.email,
              'Réinitialisation de votre mot de passe - Planification GANTT',
              passwordResetByAdminEmail({
                  prenom: user.prenom,
                  nom: user.nom,
                  username: user.username,
                  password: newPassword,
                  appUrl: appUrlOf(req)
              })
          )
        : false;
    res.json({ success: true, emailSent });
}

export async function changePassword(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.changePassword(userId(req), req.body.oldPassword, req.body.newPassword);
    res.json({ success: true });
}

export async function changeProfilePassword(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.changeProfilePassword(userId(req), req.body.newPassword);
    req.session.mustChangePassword = false;
    logUserAction(req, 'Changement de mot de passe', { userId: userId(req) });
    res.json({ success: true });
}

// ---------- Préférences du compte ----------

export async function getProfilePhoto(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ photo: await service.getProfilePhoto(userId(req)) });
}

export async function setProfilePhoto(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.setProfilePhoto(userId(req), req.body.photo);
    res.json({ success: true });
}

export async function setDefaultTab(/** @type {Request} */ req, /** @type {Response} */ res) {
    if (parseInt(req.params.id) !== req.session.userId) throw forbidden('Non autorisé');
    await service.setDefaultTab(userId(req), req.body.defaultTab);
    res.json({ success: true });
}
