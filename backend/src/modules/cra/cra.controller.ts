import { env } from '../../config/env.ts';
import { badRequest, forbidden, notFound } from '../../lib/http-error.ts';
import { logUserAction } from '../../services/action-log.ts';
import { testAutomation4 } from './cra.automation.ts';
import * as collect from './cra.collect.ts';
import * as diffusion from './cra.diffusion.ts';
import { notifyAdminModified, notifyRefused, notifySubmitted, notifyVisa } from './cra.notifications.ts';
import * as service from './cra.service.ts';

import type { Request, Response } from 'express';

const userId = (req: Request) => req.session.userId as number;
const isAdmin = (req: Request) => req.session.activeProfile === 'admin';
const appUrlOf = (req: Request) => env.APP_URL || `${req.protocol}://${req.get('host')}`;

/** Utilisateur connecté en tant qu'expéditeur des emails */
const senderOf = (req: Request) => ({
    name: `${req.session.prenom} ${req.session.nom}`,
    email: req.session.email || ''
});

/** Utilisateur connecté en tant que signataire (soumission, visas) */
const signerOf = (req: Request) => ({
    userId: userId(req),
    ...senderOf(req),
    ip: req.ip,
    userAgent: req.headers['user-agent'] || ''
});

const context = (req: Request) => ({ appUrl: appUrlOf(req), sender: senderOf(req) });

/** Lecture réservée au propriétaire du CRA, aux administrateurs et à la RH */
function assertCanRead(req: Request, cra: { user_id: number }) {
    const profile = req.session.activeProfile;
    if (profile !== 'admin' && profile !== 'rh' && cra.user_id !== userId(req)) throw forbidden('Accès interdit');
}

/**
 * CRA modifié ou renvoyé par un administrateur : retour chez l'expert, prévenu par email
 * (au plus un email toutes les 30 minutes, sauf renvoi explicite)
 */
async function markAdminModified(req: Request, cra: service.Cra, force: boolean) {
    const adminName = `${req.session.prenom || ''} ${req.session.nom || ''}`.trim() || 'Administrateur';
    const mail = await service.markAdminModified(cra, adminName, force);
    logUserAction(req, force ? "CRA renvoyé à l'expert par administrateur" : 'Modification CRA par administrateur', {
        craId: cra.id,
        expertUserId: cra.user_id
    });
    if (!mail) return false;
    try {
        const expert = await service.getUserContact(cra.user_id);
        return await notifyAdminModified(
            cra,
            expert,
            { name: adminName, email: req.session.email || '' },
            appUrlOf(req)
        );
    } catch (mailErr: any) {
        console.error('Mail CRA modifié par admin:', mailErr.message);
        return false;
    }
}

// ---------- Listes ----------

export async function myList(req: Request, res: Response) {
    res.json(await service.listForProfile(req.session.activeProfile, userId(req)));
}

export async function adminList(req: Request, res: Response) {
    res.json(await service.adminList(req.query));
}

export async function archives(req: Request, res: Response) {
    res.json(await service.adminList(req.query, { archived: true }));
}

export async function deletedList(req: Request, res: Response) {
    res.json(await service.listDeleted());
}

export async function astreinteExperts(req: Request, res: Response) {
    res.json(await service.listAstreinteExperts());
}

/** Experts des ressources actives (« CRA à lancer ») */
export async function allExpertsFull(req: Request, res: Response) {
    res.json(await service.listCraExperts({ activeOnly: true, fallbackToResourceName: true }));
}

/** Tous les experts volontaires aux astreintes, actifs ou non (filtres) */
export async function allExperts(req: Request, res: Response) {
    res.json(await service.listCraExperts({ activeOnly: false, fallbackToResourceName: false }));
}

export async function saveRhRecipients(req: Request, res: Response) {
    const { recipients } = req.body;
    if (!recipients || typeof recipients !== 'object') throw badRequest('Destinataires manquants');
    await service.saveRhRecipients(recipients);
    res.json({ success: true });
}

// ---------- Création ----------

/** Lancement manuel d'un CRA ; pour une MAD volante, lignes pré-remplies depuis la planification */
export async function launch(req: Request, res: Response) {
    const { user_id, mois, annee } = req.body;
    if (!user_id || !mois || !annee) throw badRequest('Paramètres manquants');
    const expert = await service.findExpertWithResource(user_id);
    if (!expert) throw notFound('Expert introuvable');
    const cra = await service.createForMonth(expert, mois, annee);
    if (expert.is_mad_volante) await collect.prefillMadLines(expert, cra);
    res.json({ success: true });
}

/** CRA du mois pour un expert (administrateur, ou l'expert lui-même), créé si besoin */
export async function findOrCreate(req: Request, res: Response) {
    const { user_id, mois, annee } = req.query;
    if (!user_id || !mois || !annee) throw badRequest('Paramètres manquants');
    if (!isAdmin(req) && String(req.session.userId) !== String(user_id)) throw forbidden('Accès refusé');
    res.json(await service.findOrCreate(user_id, mois, annee));
}

// ---------- Archivage et corbeille ----------

export async function archive(req: Request, res: Response) {
    await service.setArchived(req.params.id, true);
    logUserAction(req, 'Archivage CRA', { craId: req.params.id });
    res.json({ success: true });
}

export async function unarchive(req: Request, res: Response) {
    await service.setArchived(req.params.id, false);
    logUserAction(req, 'Désarchivage CRA', { craId: req.params.id });
    res.json({ success: true });
}

export async function softDelete(req: Request, res: Response) {
    await service.softDelete(req.params.id);
    logUserAction(req, 'Suppression (soft) CRA', { craId: req.params.id });
    res.json({ success: true });
}

export async function restoreDeleted(req: Request, res: Response) {
    await service.restoreDeleted(req.params.id);
    logUserAction(req, 'Restauration CRA supprimé', { craId: req.params.id });
    res.json({ success: true });
}

export async function purge(req: Request, res: Response) {
    await service.purge(req.params.id);
    logUserAction(req, 'Purge définitive CRA', { craId: req.params.id });
    res.json({ success: true });
}

// ---------- Consultation et saisie ----------

export async function detail(req: Request, res: Response) {
    const cra = await service.getDetail(req.params.id);
    if (!cra) throw notFound('CRA introuvable');
    assertCanRead(req, cra);
    res.json(cra);
}

export async function pdf(req: Request, res: Response) {
    const { buffer, filename } = await diffusion.consultationPdf(req.params.id, {
        userId: userId(req),
        profile: req.session.activeProfile
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
}

/** Lignes proposées à une MAD volante depuis la planification */
export async function collectLines(req: Request, res: Response) {
    const { cra, resourceId, isMad } = await collect.loadForCollect(req.params.id, {
        userId: userId(req),
        isAdmin: isAdmin(req)
    });
    if (!isMad || !resourceId) return res.json({ allowed: false, lines: [] });
    res.json({ allowed: true, lines: await collect.collectLines(cra, resourceId) });
}

/** Report vers la planification des corrections acceptées par l'utilisateur */
export async function propagate(req: Request, res: Response) {
    const { cra, resourceId, isMad } = await collect.loadForCollect(req.params.id, {
        userId: userId(req),
        isAdmin: isAdmin(req)
    });
    if (!isMad || !resourceId) throw badRequest('Report réservé aux MAD volantes');
    if (cra.statut !== 'a_completer') throw badRequest('CRA non modifiable dans ce statut');
    const out = await collect.propagate(cra, resourceId, req.body.corrections);
    logUserAction(req, 'Report de corrections CRA vers la planification', { craId: cra.id, ...out });
    res.json(out);
}

/** Enregistrement des lignes du mois (propriétaire ou administrateur, CRA à compléter) */
export async function saveLines(req: Request, res: Response) {
    const cra = await service.getCra(req.params.id);
    if (!cra) throw notFound('CRA introuvable');
    if (!isAdmin(req) && cra.user_id !== userId(req)) throw forbidden('Accès interdit');
    if (cra.statut !== 'a_completer') throw badRequest('CRA non modifiable dans ce statut');
    const inserted = await service.replaceLines(cra, req.body.lignes);
    if (isAdmin(req) && cra.user_id !== userId(req)) await markAdminModified(req, cra, false);
    res.json({ success: true, inserted });
}

// ---------- Circuit de validation ----------

export async function submit(req: Request, res: Response) {
    const cra = await service.submit(req.params.id, signerOf(req), req.body.commentaire);
    await notifySubmitted(cra, senderOf(req), appUrlOf(req));
    res.json({ success: true });
}

export async function declareNothing(req: Request, res: Response) {
    await service.declareNothing(req.params.id, signerOf(req));
    res.json({ success: true });
}

/** Rappel par l'expert de son CRA soumis, avant tout visa */
export async function recall(req: Request, res: Response) {
    await service.recall(req.params.id, userId(req));
    logUserAction(req, 'Rappel CRA (correction)', { craId: req.params.id });
    res.json({ success: true });
}

export async function visa(req: Request, res: Response) {
    const { niveau } = req.params;
    const cra = await service.visa(req.params.id, niveau, signerOf(req));
    if (niveau === 'n1' || niveau === 'n2') {
        const expert = (await service.getCraWithExpert({ id: cra.id })) as NonNullable<
            Awaited<ReturnType<typeof service.getCraWithExpert>>
        >;
        await notifyVisa(cra, niveau, expert, senderOf(req), appUrlOf(req));
    }
    if (niveau === 'n2') logUserAction(req, 'CRA visé N2 — en attente de diffusion manuelle', { craId: req.params.id });
    res.json({ success: true });
}

/** Refus par un viseur, avec motif obligatoire : retour à l'expert */
export async function refuse(req: Request, res: Response) {
    const { niveau } = req.params;
    const { commentaire } = req.body;
    if (typeof commentaire !== 'string' || !commentaire.trim()) {
        throw badRequest('Un commentaire de refus est obligatoire');
    }
    const cra = await service.refuse(req.params.id, niveau, userId(req), commentaire.trim());
    const expert = (await service.getCraWithExpert({ id: cra.id })) as NonNullable<
        Awaited<ReturnType<typeof service.getCraWithExpert>>
    >;
    await notifyRefused(cra, niveau === 'n1' ? 'n1' : 'n2', expert, senderOf(req), commentaire.trim());
    res.json({ success: true, message: `CRA renvoyé à l'expert avec motif de refus` });
}

/** Remise à zéro des validations par un administrateur */
export async function adminCorrection(req: Request, res: Response) {
    await service.adminCorrection(req.params.id);
    res.json({ success: true, statut: 'a_completer' });
}

/** CRA préparé par un administrateur renvoyé à l'expert pour vérification et soumission */
export async function returnToExpert(req: Request, res: Response) {
    const cra = await service.getActiveCra(req.params.id);
    if (!cra) throw notFound('CRA introuvable');
    if (cra.user_id === userId(req)) throw badRequest('Ce CRA est le vôtre : soumettez-le directement.');
    if (cra.statut !== 'a_completer') throw badRequest("Seul un CRA à compléter peut être renvoyé à l'expert.");
    res.json({ success: true, mailed: await markAdminModified(req, cra, true) });
}

// ---------- Diffusion ----------

export async function diffusionRecipients(req: Request, res: Response) {
    res.json(await diffusion.diffusionRecipients(req.params.id));
}

export async function preparePdf(req: Request, res: Response) {
    res.json({ success: true, pdfFilename: await diffusion.prepareSignedPdf(req.params.id) });
}

/** PDF signé d'un CRA : mêmes droits que le CRA ; fichier sans CRA connu (ancienne diffusion) : administration et RH */
export async function pdfSaved(req: Request, res: Response) {
    const { filename, buffer } = await diffusion.savedPdf(req.params.filename, cra => {
        if (cra) assertCanRead(req, cra);
        else if (req.session.activeProfile !== 'admin' && req.session.activeProfile !== 'rh') {
            throw forbidden('Accès interdit');
        }
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
}

export async function diffuse(req: Request, res: Response) {
    const { sent, pdfFilename } = await diffusion.diffuse(req.params.id, req.body, context(req));
    logUserAction(req, 'CRA diffusé manuellement', { craId: req.params.id, sent, pdfFilename });
    res.json({ success: true, sent });
}

export async function diffusionLog(req: Request, res: Response) {
    res.json(await service.getDiffusionLog(req.params.id));
}

/**
 * Renvoi aux destinataires RH précédents. Réponse immédiate : la génération du document peut prendre
 * plusieurs dizaines de secondes (expiration du proxy) ; l'envoi passe de toute façon par la file d'attente.
 */
export async function resendAll(req: Request, res: Response) {
    const craId = req.params.id;
    const { count, send } = await diffusion.prepareResendAll(craId, context(req));
    res.json({ success: true, sent: count });
    send().catch(err => console.error(`❌ Renvoi CRA ${craId}: échec en arrière-plan:`, err.message));
    logUserAction(req, 'Renvoi email diffusion CRA (tous destinataires)', { craId, count });
}

/** Renvoi d'un email de diffusion (en échec) ; le PDF est régénéré en arrière-plan */
export async function resendOne(req: Request, res: Response) {
    const { id: craId, logId } = req.params;
    const { toExpert, send } = await diffusion.prepareResend(craId, logId, context(req));
    if (toExpert) {
        logUserAction(req, "Renvoi notification de diffusion CRA à l'expert", { craId, logId });
        return res.json({ success: true });
    }
    logUserAction(req, 'Renvoi email diffusion CRA', { craId, logId });
    res.json({ success: true });
    send?.().catch(err =>
        console.error(`❌ Renvoi CRA ${craId} (log ${logId}): échec mise en file en arrière-plan:`, err.message)
    );
}

// ---------- Automatisation ----------

/** Test de l'automatisation n°4 (rappels CRA) */
export async function triggerAutomation(req: Request, res: Response) {
    const { sent, logs } = await testAutomation4(req.body?.user_id);
    res.json({ success: true, sent, logs });
}
