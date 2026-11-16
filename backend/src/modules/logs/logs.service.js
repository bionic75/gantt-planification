// @ts-check
// Journaux : connexions, actions, sessions actives, purge
import { prisma } from '../../db/prisma.ts';
import { idParam } from '../../db/values.ts';
import { badRequest, notFound } from '../../lib/http-error.ts';
import { activeSessions } from '../../state/sessions.ts';

/** Inactivité au-delà de laquelle un utilisateur n'est plus considéré comme connecté */
const ACTIVE_TIMEOUT_MS = 15 * 60 * 1000;

/** Utilisateurs actifs dans les 15 dernières minutes, avec nom, trigramme et photo */
export async function listActiveUsers() {
    const now = Date.now();
    const active = [...activeSessions].filter(([, s]) => now - s.lastActivity <= ACTIVE_TIMEOUT_MS);
    if (active.length === 0) return [];
    const users = await prisma.user.findMany({
        where: { id: { in: active.map(([id]) => id) } },
        select: { id: true, nom: true, prenom: true, profile_photo: true, resource_id: true }
    });
    const resources = await prisma.resource.findMany({
        where: { id: { in: users.map(u => u.resource_id).filter(id => id != null) } },
        select: { id: true, trigramme: true }
    });
    const trigrammes = new Map(resources.map(r => [r.id, r.trigramme]));
    const byId = new Map(users.map(u => [u.id, u]));
    return active.map(([userId, session]) => {
        const u = byId.get(userId);
        return {
            userId,
            profile: session.profile,
            username: session.username,
            nom: u?.nom || '',
            prenom: u?.prenom || '',
            trigramme: (u?.resource_id != null && trigrammes.get(u.resource_id)) || '',
            profilePhoto: u?.profile_photo || null,
            lastActivity: session.lastActivity
        };
    });
}

/**
 * Connexions par utilisateur sur une période (jours inclus), hors compte système
 * @param {{ dateStart?: unknown, dateEnd?: unknown, userIds?: unknown }} query
 */
export async function connectionsReport({ dateStart, dateEnd, userIds }) {
    if (!dateStart || !dateEnd) throw badRequest('dateStart et dateEnd requis');
    /** @type {any[]} */
    const and = [
        // Jour de connexion compris entre les deux dates (horodatages « AAAA-MM-JJ HH:MM:SS »)
        { login_time: { gte: String(dateStart), lt: `${dateEnd}￿` } },
        { profile: { not: 'system' } }
    ];
    const ids =
        typeof userIds === 'string'
            ? userIds
                  .split(',')
                  .map(id => id.trim())
                  .filter(Boolean)
            : [];
    if (ids.length > 0) and.push({ user_id: { in: ids.map(idParam) } });
    const groups = await prisma.connectionLog.groupBy({
        by: ['user_id', 'username', 'nom', 'prenom', 'profile'],
        where: { AND: and },
        _count: { _all: true },
        _max: { login_time: true }
    });
    return groups
        .sort((a, b) => b._count._all - a._count._all || (a.user_id ?? -1) - (b.user_id ?? -1))
        .map(g => ({
            username: g.username,
            nom: g.nom,
            prenom: g.prenom,
            profile: g.profile,
            nb_connexions: g._count._all,
            derniere_connexion: g._max.login_time
        }));
}

/** 100 dernières actions d'un utilisateur */
export function listUserActions(/** @type {unknown} */ userId) {
    if (!userId) throw badRequest('userId requis');
    return prisma.actionLog.findMany({
        where: { user_id: idParam(userId) },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 100
    });
}

const sansAccent = (/** @type {string} */ t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Catégorie d'une action journalisée (d'après son libellé ou son type) */
export function categorieAction(/** @type {string} */ libelle) {
    const t = sansAccent(libelle);
    /** @type {Array<[string, RegExp]>} */
    const regles = [
        ['Asana', /asana/],
        ['Déploiements et affectation', /deploiement|affectation|activite|synchronis/],
        ['Événements', /evenement/],
        ['Planification', /planning|planification|disponibilit/],
        ['Ressources', /ressource/],
        ['CRA', /\bcra\b/],
        ['Astreintes', /astreinte/],
        ['Automatisations et e-mails', /automatisation|e-?mail|mail|sondage|invitation|atelier/],
        ['Utilisateurs et profils', /utilisateur|compte|mot de passe|totp|profil|deconnexion|connexion/],
        ['Administration', /administration|parametr|theme|acces|onglet|localisation|conges|jours speciaux|type d/],
        ['Journaux', /journal|purge|historique|logs?\b/]
    ];
    return regles.find(([, re]) => re.test(t))?.[0] ?? 'Autre';
}

/**
 * Journal complet d'un utilisateur pour l'export : connexions (une ligne par connexion) et toutes ses actions
 * (journal des sessions et journal des actions), catégorisées, de la plus ancienne à la plus récente
 */
export async function exportUserLogs(/** @type {unknown} */ userId) {
    if (!userId) throw badRequest('userId requis');
    const id = idParam(userId);
    const [sessions, actionLogs] = await Promise.all([
        prisma.connectionLog.findMany({ where: { user_id: id }, orderBy: [{ login_time: 'asc' }, { id: 'asc' }] }),
        prisma.actionLog.findMany({ where: { user_id: id }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }] })
    ]);
    /** @type {Array<{ date: string, categorie: string, profil: string, action: string, details: string }>} */
    const actions = [];
    for (const s of sessions) {
        const brut = (s.modifications || '').trim();
        if (!brut) continue;
        /** @type {any} */
        let liste;
        try {
            liste = JSON.parse(brut);
        } catch {
            liste = null;
        }
        if (Array.isArray(liste)) {
            for (const e of liste) {
                const libelle = String(e?.action ?? '');
                actions.push({
                    date: String(e?.timestamp ?? s.login_time ?? ''),
                    categorie: categorieAction(libelle),
                    profil: String(e?.profile ?? s.profile ?? ''),
                    action: libelle,
                    details: e?.details && Object.keys(e.details).length ? JSON.stringify(e.details) : ''
                });
            }
        } else {
            // Ancien format : lignes « date - modification »
            for (const ligne of brut.split('\n')) {
                const m = /^(.*?) - (.*)$/.exec(ligne);
                const libelle = m ? m[2] : ligne;
                actions.push({
                    date: m ? m[1] : String(s.login_time ?? ''),
                    categorie: categorieAction(libelle),
                    profil: s.profile,
                    action: libelle,
                    details: ''
                });
            }
        }
    }
    for (const a of actionLogs) {
        const libelle =
            a.action_type === 'planning_modification'
                ? 'Modification du planning'
                : a.action_type === 'email_request'
                  ? "Demande d'affectation envoyée"
                  : a.action_type;
        actions.push({
            date: String(a.created_at ?? ''),
            categorie: a.action_type === 'planning_modification' ? 'Planification' : categorieAction(libelle),
            profil: '',
            action: libelle,
            details: a.details ?? ''
        });
    }
    actions.sort((x, y) => x.date.localeCompare(y.date));
    return {
        connexions: sessions.map(s => ({ login_time: s.login_time ?? '', profile: s.profile })),
        actions
    };
}

/** Ajoute une modification (horodatée) au journal de la connexion en cours */
export async function addModification(/** @type {number} */ logId, /** @type {unknown} */ modification) {
    const row = await prisma.connectionLog.findUnique({ where: { id: logId }, select: { modifications: true } });
    const current = row && row.modifications ? row.modifications : '';
    const entry = `${new Date().toLocaleString('fr-FR')} - ${modification}`;
    await prisma.connectionLog.updateMany({
        where: { id: logId },
        data: { modifications: current ? `${current}\n${entry}` : entry }
    });
}

/** Diagnostic des journaux de modification du planning */
export async function planningDebug() {
    const where = { action_type: 'planning_modification' };
    const groups = await prisma.actionLog.groupBy({ by: ['user_id'], where, _count: { _all: true } });
    const stats = groups
        .map(g => ({ user_id: g.user_id, count: g._count._all }))
        .sort((a, b) => b.count - a.count || a.user_id - b.user_id);
    // user_id est obligatoire dans le schéma : aucun journal sans utilisateur
    const nullLogs = /** @type {any[]} */ ([]);
    return {
        stats,
        nullLogsCount: nullLogs.length,
        nullLogsExamples: nullLogs,
        message: stats.find(s => s.user_id === null)
            ? '⚠️ Des logs de planning ont user_id NULL'
            : '✅ Tous les logs de planning ont un user_id'
    };
}

const RAZ = {
    connexions: 'Suppression connexions',
    planning: 'Suppression modifications planning',
    emails: 'Suppression demandes affectation'
};

/**
 * Remise à zéro des journaux d'un utilisateur : connexions (par identifiant de connexion),
 * modifications du planning ou demandes d'affectation
 * @returns {Promise<{ deleted: number, username: string, description: string }>}
 */
export async function resetUserLogs(/** @type {unknown} */ type, /** @type {unknown} */ userId) {
    if (!type || !userId) throw badRequest('Paramètres manquants');
    const user = await prisma.user.findUnique({ where: { id: idParam(userId) }, select: { username: true } });
    if (!user) throw notFound('Utilisateur non trouvé');
    const user_id = idParam(userId);
    let result;
    if (type === 'connexions') {
        // Par identifiant de connexion : couvre aussi les anciens journaux sans user_id
        result = await prisma.connectionLog.deleteMany({ where: { username: user.username } });
    } else if (type === 'planning') {
        result = await prisma.actionLog.deleteMany({ where: { user_id, action_type: 'planning_modification' } });
    } else if (type === 'emails') {
        result = await prisma.actionLog.deleteMany({ where: { user_id, action_type: 'email_request' } });
    } else {
        throw badRequest('Type de log inconnu');
    }
    return { deleted: result.count, username: user.username, description: RAZ[/** @type {keyof typeof RAZ} */ (type)] };
}

/** Purge complète d'une table de journaux (actions : éventuellement d'un seul type) */
export async function purgeAll(/** @type {unknown} */ table, /** @type {unknown} */ type) {
    if (!table) throw badRequest('Paramètre table manquant');
    if (table === 'connection_logs') return (await prisma.connectionLog.deleteMany()).count;
    if (table === 'action_logs') {
        return (await prisma.actionLog.deleteMany(type ? { where: { action_type: String(type) } } : undefined)).count;
    }
    throw badRequest('Table invalide');
}
