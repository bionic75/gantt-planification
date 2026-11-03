// @ts-check
import { formatDateFR } from '../../lib/utils.js';
import { logUserAction } from '../../services/action-log.js';
import * as affectation from '../affectation/affectation.service.js';
import { sendTeamsNotificationFromServer } from '../notifications/notifications.service.js';
import { notifyEventCreated } from './events.notifications.js';
import * as duplicates from './events.duplicates.js';
import * as service from './events.service.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */

const userId = (/** @type {Request} */ req) => /** @type {number} */ (req.session.userId);

// ---------- Types d'événements ----------

export async function listTypes(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ types: await service.listTypes() });
}

export async function createType(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id, label } = await service.createType(req.body);
    logUserAction(req, "Création d'un type d'événement", { id, libelle: label });
    res.json({ success: true, id });
}

export async function updateType(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const { label, events } = await service.updateType(id, req.body);
    logUserAction(req, "Modification d'un type d'événement", { id, libelle: label });
    res.json({ success: true, events });
}

/** Suppression : les événements associés basculent sur « Autre(s) » */
export async function deleteType(/** @type {Request} */ req, /** @type {Response} */ res) {
    const id = Number(req.params.id);
    const { label, moved } = await service.deleteType(id);
    logUserAction(req, "Suppression d'un type d'événement", { id, libelle: label, evenementsBascules: moved });
    res.json({ success: true, moved });
}

/** Reprise des données : tous les événements */
export async function listForReprise(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ events: await service.listForReprise() });
}

export async function bulkUpdate(/** @type {Request} */ req, /** @type {Response} */ res) {
    const updated = await service.bulkUpdate(req.body && req.body.updates);
    logUserAction(req, 'Reprise des données des événements (type / libellé)', { modifies: updated });
    res.json({ success: true, updated });
}

// ---------- Événements ----------

export async function search(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ events: await service.search(req.query) });
}

export async function adminList(/** @type {Request} */ req, /** @type {Response} */ res) {
    res.json({ events: await service.adminList() });
}

/** Application mobile : tous les événements */
export async function mobileList(/** @type {Request} */ req, /** @type {Response} */ res) {
    const events = await service.mobileList();
    console.log(`[mobile-events] ${events.length} événements retournés`);
    res.json({ events });
}

/** Tous les profils voient tous les événements ; is_creator sert au contrôle d'accès côté client */
export async function myList(/** @type {Request} */ req, /** @type {Response} */ res) {
    const isAdmin = req.session.activeProfile === 'admin';
    res.json({ events: await service.listForUser(userId(req), isAdmin), isAdmin, userId: userId(req) });
}

/** Création depuis l'administration */
export async function adminCreate(/** @type {Request} */ req, /** @type {Response} */ res) {
    const { id, period } = await service.createEvent(req.body, userId(req), { withResourceRequest: false });
    console.log(`✅ Événement admin ajouté (ID: ${id}, period: ${period})`);
    res.json({ success: true, eventId: id });
}

/** Création depuis la planification : participants et personnes sollicitées prévenus, notification Teams */
export async function create(/** @type {Request} */ req, /** @type {Response} */ res) {
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
export async function join(/** @type {Request} */ req, /** @type {Response} */ res) {
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
    /** @type {typeof stages} */
    let deploiements = [];
    if (stages.length && resourceId) {
        try {
            for (const project of new Set(stages.map(s => s.project)))
                await affectation.affSyncAllFromEvents(req, project);
            deploiements = await affectation.affAssignedAmong(resourceId, stages);
        } catch (e) {
            console.error('Synchro événements → affectations :', /** @type {Error} */ (e).message);
        }
        if (!deploiements.length) planningUpdates = await service.applyJoinPlanning(joined.event, resourceId);
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

/** Modification depuis l'administration (le créateur peut être changé) */
export async function adminUpdate(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.updateEvent(req.params.id, req.body, { allowCreator: true });
    res.json({ success: true });
}

/** Modification depuis la planification (ouverte à tous les utilisateurs connectés) */
export async function update(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.updateEvent(req.params.id, req.body, { allowCreator: false });
    res.json({ success: true });
}

export async function remove(/** @type {Request} */ req, /** @type {Response} */ res) {
    await service.deleteEvent(req.params.id);
    res.json({ success: true });
}

// ---------- Doublons ----------

/** Doublons certains et probables, par groupes */
export async function listDuplicates(/** @type {Request} */ _req, /** @type {Response} */ res) {
    res.json({ groups: await duplicates.findDuplicateGroups() });
}

/** Fusion : { keep_id, remove_ids } — un seul événement conservé, participants réunis */
export async function mergeDuplicates(/** @type {Request} */ req, /** @type {Response} */ res) {
    const r = await duplicates.mergeEvents(req.body && req.body.keep_id, req.body && req.body.remove_ids);
    logUserAction(req, "Fusion d'événements en doublon", {
        conserve: r.kept,
        supprimes: r.removed,
        participantsAjoutes: r.participantsAdded,
        liensAffectation: r.relinked
    });
    res.json({ success: true, ...r });
}
