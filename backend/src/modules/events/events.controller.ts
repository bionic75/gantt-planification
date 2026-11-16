import { formatDateFR } from '../../lib/utils.ts';
import { logUserAction } from '../../services/action-log.ts';
import { samuNumber } from '../../lib/samu.ts';
import * as affectation from '../affectation/affectation.service.js';
import { sendTeamsNotificationFromServer } from '../notifications/notifications.service.ts';
import { notifyEventCreated } from './events.notifications.ts';
import * as duplicates from './events.duplicates.ts';
import * as service from './events.service.ts';

import type { Request, Response } from 'express';

const userId = (req: Request) => req.session.userId as number;

// ---------- Types d'événements ----------

export async function listTypes(req: Request, res: Response) {
    res.json({ types: await service.listTypes() });
}

export async function createType(req: Request, res: Response) {
    const { id, label } = await service.createType(req.body);
    logUserAction(req, "Création d'un type d'événement", { id, libelle: label });
    res.json({ success: true, id });
}

export async function updateType(req: Request, res: Response) {
    const id = Number(req.params.id);
    const { label, events } = await service.updateType(id, req.body);
    logUserAction(req, "Modification d'un type d'événement", { id, libelle: label });
    res.json({ success: true, events });
}

/** Suppression : les événements associés basculent sur « Autre(s) » */
export async function deleteType(req: Request, res: Response) {
    const id = Number(req.params.id);
    const { label, moved } = await service.deleteType(id);
    logUserAction(req, "Suppression d'un type d'événement", { id, libelle: label, evenementsBascules: moved });
    res.json({ success: true, moved });
}

/** Reprise des données : tous les événements */
export async function listForReprise(req: Request, res: Response) {
    res.json({ events: await service.listForReprise() });
}

export async function bulkUpdate(req: Request, res: Response) {
    const updated = await service.bulkUpdate(req.body && req.body.updates);
    logUserAction(req, 'Reprise des données des événements (type / libellé)', { modifies: updated });
    res.json({ success: true, updated });
}

// ---------- Événements ----------

export async function search(req: Request, res: Response) {
    res.json({ events: await service.search(req.query) });
}

export async function adminList(req: Request, res: Response) {
    res.json({ events: await service.adminList() });
}

/** Application mobile : tous les événements */
export async function mobileList(req: Request, res: Response) {
    const events = await service.mobileList();
    console.log(`[mobile-events] ${events.length} événements retournés`);
    res.json({ events });
}

/** Tous les profils voient tous les événements ; is_creator sert au contrôle d'accès côté client */
export async function myList(req: Request, res: Response) {
    const isAdmin = req.session.activeProfile === 'admin';
    res.json({
        events: await service.listForUser(
            userId(req),
            isAdmin,
            req.session.activeProfile === 'expert' ? (req.session.resourceId ?? null) : null
        ),
        isAdmin,
        userId: userId(req)
    });
}

/** Création depuis l'administration */
export async function adminCreate(req: Request, res: Response) {
    const { id, period } = await service.createEvent(req.body, userId(req), { withResourceRequest: false });
    console.log(`✅ Événement admin ajouté (ID: ${id}, period: ${period})`);
    res.json({ success: true, eventId: id });
}

/** Création depuis la planification : participants et personnes sollicitées prévenus, notification Teams */
export async function create(req: Request, res: Response) {
    const { id, period } = await service.createEvent(req.body, userId(req), { withResourceRequest: true });
    const { startDate, endDate, label, participants } = req.body;
    await notifyEventCreated(req.body, userId(req));
    sendTeamsNotificationFromServer('evenement', {
        name: label,
        date: `${formatDateFR(startDate)}${endDate && endDate !== startDate ? ' au ' + formatDateFR(endDate) : ''}`,
        createdBy: `${req.session.prenom} ${req.session.nom}`
    });
    console.log(
        `✅ Événement personnalisé ajouté (ID: ${id}, period: ${period}, ${participants?.length || 0} participant(s))`
    );
    res.json({ success: true, eventId: id });
}

/**
 * Inscription comme participant. Quand l'événement relève d'une étape à ressources d'un déploiement, l'expert devient
 * intervenant de l'étape (dans la limite des ressources par jour) et c'est l'affectation qui écrit sa planification ;
 * sinon, ou si l'étape est complète, sa planification est mise à jour directement.
 */
export async function join(req: Request, res: Response) {
    const isExpert = req.session.activeProfile === 'expert';
    const resourceId = req.session.resourceId;
    const eventId = Number(req.params.id);
    const stages =
        isExpert && resourceId && Number.isInteger(eventId) ? await affectation.affStagesOfEvent(eventId) : [];
    const joined = await service.joinEvent(req.params.id, {
        userId: userId(req),
        resourceId,
        isExpert,
        skipPlanning: stages.length > 0
    });
    let { planningUpdates } = joined;
    let deploiements: typeof stages = [];
    if (stages.length && resourceId) {
        try {
            for (const project of new Set(stages.map(s => s.project)))
                await affectation.affSyncAllFromEvents(req, project);
            deploiements = await affectation.affAssignedAmong(resourceId, stages);
        } catch (e) {
            console.error('Synchro événements → affectations :', (e as Error).message);
        }
        // Événement tagué : planification toujours en « 2 - 3 » avec le SAMU-SAS, même avec un déploiement
        if (!deploiements.length || (await service.ecritSamu(joined.event)))
            planningUpdates = await service.applyJoinPlanning(joined.event, resourceId);
    }
    res.json({
        success: true,
        planningUpdated: planningUpdates.length > 0,
        planningUpdates,
        deploiements,
        isExpert,
        eventLabel: joined.event.label
    });
}

/**
 * « Me retirer » : l'utilisateur quitte les participants. Pour un expert dont l'événement relève d'une activité de
 * déploiement, il est aussi retiré de l'affectation de cette activité et sa planification est remise en
 * « 2 - Disponible / 2 - En attente d'affectation » sur les jours de l'événement.
 */
export async function leave(req: Request, res: Response) {
    const isExpert = req.session.activeProfile === 'expert';
    const resourceId = req.session.resourceId;
    const eventId = Number(req.params.id);
    const { event, removed } = await service.leaveEvent(req.params.id, userId(req));
    let desaffectations = 0;
    let planningReset = 0;
    if (removed && isExpert && resourceId && Number.isInteger(eventId)) {
        try {
            const stages = await affectation.affStagesOfEvent(eventId);
            const affectes = await affectation.affAssignedAmong(resourceId, stages);
            if (!affectes.length && (await service.ecritSamu(event))) {
                const no = samuNumber(await service.localisationSamu(event));
                planningReset += await affectation.affResetPlanning({
                    resourceIds: [resourceId],
                    start: event.start_date,
                    end: event.end_date,
                    period: event.period,
                    samuNo: no
                });
            }
            for (const s of affectes) {
                const samuNo = samuNumber(s.samu);
                await affectation.affUnassignResourceFromStage(s.project, s.stage, resourceId);
                planningReset += await affectation.affResetPlanning({
                    resourceIds: [resourceId],
                    start: event.start_date,
                    end: event.end_date,
                    period: event.period,
                    samuNo
                });
                desaffectations++;
            }
        } catch (e) {
            console.error('Retrait de participant → affectations :', (e as Error).message);
        }
    }
    res.json({ success: true, removed: removed > 0, desaffectations, planningReset, eventLabel: event.label });
}

/** Modification depuis l'administration (le créateur peut être changé) */
export async function adminUpdate(req: Request, res: Response) {
    await service.updateEvent(req.params.id, req.body, { allowCreator: true });
    res.json({ success: true });
}

/** Modification depuis la planification (ouverte à tous les utilisateurs connectés) */
export async function update(req: Request, res: Response) {
    await service.updateEvent(req.params.id, req.body, { allowCreator: false });
    res.json({ success: true });
}

export async function remove(req: Request, res: Response) {
    await service.deleteEvent(req.params.id);
    res.json({ success: true });
}

// ---------- Doublons ----------

/** Doublons certains et probables, par groupes */
export async function listDuplicates(_req: Request, res: Response) {
    res.json({ groups: await duplicates.findDuplicateGroups() });
}

/** Fusion : { keep_id, remove_ids } — un seul événement conservé, participants réunis */
export async function mergeDuplicates(req: Request, res: Response) {
    const r = await duplicates.mergeEvents(req.body && req.body.keep_id, req.body && req.body.remove_ids);
    logUserAction(req, "Fusion d'événements en doublon", {
        conserve: r.kept,
        supprimes: r.removed,
        participantsAjoutes: r.participantsAdded,
        liensAffectation: r.relinked
    });
    res.json({ success: true, ...r });
}
