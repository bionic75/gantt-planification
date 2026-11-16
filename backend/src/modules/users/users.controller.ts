import { env } from '../../config/env.ts';
import { badRequest, forbidden } from '../../lib/http-error.ts';
import { sendEmail } from '../../lib/mailer.ts';
import { logUserAction } from '../../services/action-log.ts';
import { activeSessions, revokeUserSessions } from '../../state/sessions.ts';
import { accountCreatedEmail, passwordResetByAdminEmail } from './users.emails.ts';
import * as service from './users.service.ts';

import type { Request, Response } from 'express';

const userId = (req: Request) => req.session.userId as number;
const appUrlOf = (req: Request) => env.APP_URL || `${req.protocol}://${req.get('host')}`;

/** Envoi d'email non bloquant pour l'opération : renvoie true si l'email est parti */
async function trySendEmail(to: string, subject: string, html: string) {
    try {
        await sendEmail(to, subject, html);
        return true;
    } catch (error) {
        console.error('Erreur envoi email:', error);
        return false;
    }
}

// ---------- Lecture ----------

export async function list(req: Request, res: Response) {
    res.json(await service.listUsers());
}

export async function listPublic(req: Request, res: Response) {
    res.json(await service.listPublicUsers());
}

export async function listAmoaCed(req: Request, res: Response) {
    res.json(await service.listAmoaCedUsers());
}

export async function search(req: Request, res: Response) {
    res.json(await service.searchUsers(String(req.query.q || '')));
}

export async function emailByResource(req: Request, res: Response) {
    const user = await service.getExpertByResource(req.params.resourceId);
    res.json(user && user.email ? { email: user.email, nom: user.nom, prenom: user.prenom } : { email: null });
}

// ---------- Création / modification ----------

export async function create(req: Request, res: Response) {
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

export async function update(req: Request, res: Response) {
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

export async function remove(req: Request, res: Response) {
    const { id } = req.params;
    await service.deleteUser(id);
    logUserAction(req, 'Suppression utilisateur', { userId: id });
    res.json({ success: true });
}

export async function toggle(req: Request, res: Response) {
    const actif = await service.toggleUser(req.params.id);
    res.json({ success: true, actif });
}

/** Ferme toutes les sessions ouvertes de l'utilisateur (effet à leur prochaine requête) */
export async function forceLogout(req: Request, res: Response) {
    const targetId = parseInt(req.params.id);
    if (targetId === req.session.userId) throw badRequest('Vous ne pouvez pas vous déconnecter vous-même.');
    const wasConnected = activeSessions.has(targetId);
    await revokeUserSessions(targetId);
    logUserAction(req, 'Force déconnexion utilisateur', { targetUserId: targetId });
    res.json({ success: true, wasConnected });
}

// ---------- Droits ----------

export async function setReportingAccess(req: Request, res: Response) {
    const { hasAccess } = req.body;
    await service.setUserFlag(req.params.id, 'has_reporting_access', !!hasAccess);
    res.json({ success: true, hasReportingAccess: hasAccess });
}

export async function setRhAccess(req: Request, res: Response) {
    await service.setUserFlag(req.params.id, 'is_rh', !!req.body.hasAccess);
    res.json({ success: true });
}

/** Case « Astreinte HO ANS » : le compte peut être désigné sur le planning des astreintes HO ANS */
export async function setAstreinteHoAns(req: Request, res: Response) {
    await service.setUserFlag(req.params.id, 'astreinte_ho_ans', !!req.body.hasAccess);
    res.json({ success: true });
}

export async function setAmoaCed(req: Request, res: Response) {
    const { hasAccess } = req.body;
    await service.setUserFlag(req.params.id, 'amoa_ced', !!hasAccess);
    res.json({ success: true, amoaCed: hasAccess });
}

export async function setAstreinteAccess(req: Request, res: Response) {
    await service.setAstreinteAccess(req.params.id, !!req.body.hasAccess);
    res.json({ success: true });
}

export async function listAppAccess(req: Request, res: Response) {
    res.json(await service.listAppAccess());
}

export async function grantAppAccess(req: Request, res: Response) {
    await service.grantAppAccess(req.params.app, req.body.userId);
    res.json({ success: true });
}

export async function revokeAppAccess(req: Request, res: Response) {
    await service.revokeAppAccess(req.params.app, req.params.userId);
    res.json({ success: true });
}

// ---------- Mots de passe ----------

export async function resetPassword(req: Request, res: Response) {
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

export async function changePassword(req: Request, res: Response) {
    await service.changePassword(userId(req), req.body.oldPassword, req.body.newPassword);
    res.json({ success: true });
}

export async function changeProfilePassword(req: Request, res: Response) {
    await service.changeProfilePassword(userId(req), req.body.newPassword);
    req.session.mustChangePassword = false;
    logUserAction(req, 'Changement de mot de passe', { userId: userId(req) });
    res.json({ success: true });
}

// ---------- Préférences du compte ----------

export async function getProfilePhoto(req: Request, res: Response) {
    res.json({ photo: await service.getProfilePhoto(userId(req)) });
}

export async function setProfilePhoto(req: Request, res: Response) {
    await service.setProfilePhoto(userId(req), req.body.photo);
    res.json({ success: true });
}

export async function setDefaultTab(req: Request, res: Response) {
    if (parseInt(req.params.id) !== req.session.userId) throw forbidden('Non autorisé');
    await service.setDefaultTab(userId(req), req.body.defaultTab);
    res.json({ success: true });
}
