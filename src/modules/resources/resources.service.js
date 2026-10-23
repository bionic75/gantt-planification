// @ts-check
// Accès aux données : ressources, historique des taux MAD, particularités, affectations SAMU
import { database, dbAll, dbGet, dbRun } from '../../db/database.js';
import { badRequest, notFound } from '../../lib/http-error.js';

export const today = () => new Date().toISOString().split('T')[0];
const OPEN_END = '9999-12-31';

// ---------- Ressources ----------

export async function listResources() {
    const rows = await dbAll(`
        SELECT r.*, u.email as user_email, u.id as user_id
        FROM resources r
        LEFT JOIN users u ON u.resource_id = r.id AND u.is_expert = 1
        ORDER BY r.nom, r.prenom
    `);
    // L'email du compte expert, s'il existe, prime sur celui de la ressource
    return rows.map(row => ({ ...row, email: row.user_email || row.email }));
}

/** Ressources rattachées à un établissement (carte des experts) */
export function listExpertsMap() {
    return dbAll(
        `SELECT r.id, r.nom, r.prenom, r.trigramme, r.es_rattachement, r.samu, u.profile_photo
         FROM resources r
         LEFT JOIN users u ON u.resource_id = r.id AND u.is_expert = 1
         WHERE r.es_rattachement IS NOT NULL AND r.es_rattachement != ''`
    );
}

/**
 * @param {Record<string, any>} data
 * @param {number} createdBy
 */
export async function createResource(data, createdBy) {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } =
        data;
    const { astreinte_volontaire, astreinte_date_activation, is_mad_volante, date_fin_mad, jours_max_mad } = data;

    if (!nom || !prenom || !trigramme || !samu) throw badRequest('Champs obligatoires manquants');
    if (!is_mad_volante && !taux) throw badRequest('Champs obligatoires manquants');
    if (is_mad_volante && (!date_fin_mad || !jours_max_mad)) {
        throw badRequest('Date de fin et jours max obligatoires pour une MAD volante');
    }

    const { lastID: id } = await dbRun(
        `INSERT INTO resources (nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction, astreinte_volontaire, astreinte_date_activation, is_mad_volante, date_fin_mad, jours_max_mad)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            nom,
            prenom,
            trigramme,
            email || null,
            telephone || null,
            is_mad_volante ? 0 : parseFloat(taux),
            samu,
            date_debut || null,
            date_fin || null,
            es_rattachement || null,
            fonction || null,
            astreinte_volontaire ? 1 : 0,
            astreinte_date_activation || null,
            is_mad_volante ? 1 : 0,
            date_fin_mad || null,
            jours_max_mad || null
        ]
    );

    // Période initiale de l'historique MAD (une erreur ici n'annule pas la création)
    dbRun(
        'INSERT INTO resource_mad_history (resource_id, taux, date_debut, date_fin, created_by) VALUES (?, ?, ?, NULL, ?)',
        [id, taux, date_debut || today(), createdBy]
    ).catch(err => console.error('Erreur création historique MAD:', err));

    return id;
}

/**
 * @param {string | number} id
 * @param {Record<string, any>} data
 */
export async function updateResource(id, data) {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } =
        data;
    const {
        contacts_rh,
        astreinte_volontaire,
        astreinte_date_activation,
        is_mad_volante,
        date_fin_mad,
        jours_max_mad
    } = data;

    await dbRun(
        `UPDATE resources
         SET nom = ?, prenom = ?, trigramme = ?, email = ?, telephone = ?, taux = ?, samu = ?, date_debut = ?, date_fin = ?, es_rattachement = ?, fonction = ?, contacts_rh = ?, astreinte_volontaire = ?, astreinte_date_activation = ?, is_mad_volante = ?, date_fin_mad = ?, jours_max_mad = ?
         WHERE id = ?`,
        [
            nom,
            prenom,
            trigramme,
            email || null,
            telephone || null,
            is_mad_volante ? 0 : parseFloat(taux) || 0,
            samu,
            date_debut || null,
            date_fin || null,
            es_rattachement || null,
            fonction || null,
            contacts_rh || null,
            astreinte_volontaire ? 1 : 0,
            astreinte_date_activation || null,
            is_mad_volante ? 1 : 0,
            date_fin_mad || null,
            jours_max_mad || null,
            id
        ]
    );
    // Une ressource volontaire aux astreintes doit avoir un compte expert
    if (astreinte_volontaire) {
        dbRun('UPDATE users SET is_expert = 1 WHERE resource_id = ?', [id]).catch(() => {});
    }
}

/** Supprime la ressource et ses données rattachées (historique MAD, affectations SAMU, planning) */
export async function deleteResource(/** @type {string | number} */ id) {
    await dbRun('DELETE FROM resources WHERE id = ?', [id]);
    await Promise.all([
        dbRun('DELETE FROM resource_mad_particularites WHERE resource_id = ?', [id]),
        dbRun('DELETE FROM resource_mad_history WHERE resource_id = ?', [id]),
        dbRun('DELETE FROM resource_samu_assignments WHERE resource_id = ?', [id])
    ]).catch(err => console.error('Erreur suppression données ressource:', err));
    await dbRun('DELETE FROM schedule_data WHERE resource_id = ?', [id]).catch(err =>
        console.error('Erreur suppression schedule:', err)
    );
}

/** Bascule actif / inactif ; renvoie le nouvel état */
export async function toggleResource(/** @type {string | number} */ id) {
    const row = await dbGet('SELECT actif FROM resources WHERE id = ?', [id]);
    if (!row) throw notFound('Ressource non trouvée');
    const actif = row.actif === 1 ? 0 : 1;
    await dbRun('UPDATE resources SET actif = ? WHERE id = ?', [actif, id]);
    return actif;
}

/** Volontariat aux astreintes (implique le profil expert pour les comptes rattachés) */
export async function setAstreinteVolontaire(/** @type {string | number} */ id, /** @type {boolean} */ enabled) {
    await dbRun('UPDATE resources SET astreinte_volontaire = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    if (enabled) await dbRun('UPDATE users SET is_expert = 1 WHERE resource_id = ?', [id]).catch(() => {});
}

// ---------- Affectations SAMU (principal / secondaire) ----------

export function listAllSamuAssignments() {
    return dbAll('SELECT id, resource_id, samu, role FROM resource_samu_assignments ORDER BY samu');
}

export function listSamuAssignments(/** @type {string | number} */ resourceId) {
    return dbAll(
        'SELECT id, resource_id, samu, role FROM resource_samu_assignments WHERE resource_id = ? ORDER BY samu',
        [resourceId]
    );
}

/**
 * Remplace toutes les affectations SAMU d'une ressource
 * @param {string | number} resourceId
 * @param {unknown} principal
 * @param {unknown} secondaire
 * @returns {Promise<void>}
 */
export function replaceSamuAssignments(resourceId, principal, secondaire) {
    const entries = [
        ...(Array.isArray(principal) ? principal : []).map(samu => [samu, 'principal']),
        ...(Array.isArray(secondaire) ? secondaire : []).map(samu => [samu, 'secondaire'])
    ].filter(([samu]) => typeof samu === 'string' && samu.trim());

    return new Promise((resolve, reject) => {
        database.serialize(() => {
            database.run('DELETE FROM resource_samu_assignments WHERE resource_id = ?', [resourceId], delErr => {
                if (delErr) return reject(delErr);
                const stmt = database.prepare(
                    'INSERT OR IGNORE INTO resource_samu_assignments (resource_id, samu, role) VALUES (?, ?, ?)'
                );
                for (const [samu, role] of entries) stmt.run(resourceId, samu.trim(), role);
                stmt.finalize(finErr => (finErr ? reject(finErr) : resolve()));
            });
        });
    });
}

// ---------- Historique des taux MAD ----------

export function listMadHistory(/** @type {string | number} */ resourceId) {
    return dbAll('SELECT * FROM resource_mad_history WHERE resource_id = ? ORDER BY date_debut', [resourceId]);
}

/**
 * Refuse une période qui partage au moins un jour avec une autre (des périodes contiguës sont admises)
 * @param {Array<{ date_debut: string, date_fin: string | null }>} others
 * @param {string} start
 * @param {string | null | undefined} end
 */
function assertNoMadOverlap(others, start, end) {
    const thisEnd = end || OPEN_END;
    for (const other of others) {
        const overlapStart = start > other.date_debut ? start : other.date_debut;
        const otherEnd = other.date_fin || OPEN_END;
        const overlapEnd = thisEnd < otherEnd ? thisEnd : otherEnd;
        if (overlapStart <= overlapEnd) {
            throw badRequest(
                `Chevauchement de dates détecté avec la période ${other.date_debut} - ${other.date_fin || 'en cours'}`
            );
        }
    }
}

/** Le taux courant de la ressource suit la période MAD en cours */
async function syncCurrentRate(
    /** @type {string | number} */ resourceId,
    /** @type {unknown} */ taux,
    /** @type {string} */ start,
    /** @type {string | null | undefined} */ end
) {
    const now = today();
    if (start <= now && (!end || end >= now)) {
        await dbRun('UPDATE resources SET taux = ? WHERE id = ?', [taux, resourceId]);
    }
}

/**
 * @param {string | number} resourceId
 * @param {{ taux?: unknown, date_debut?: string, date_fin?: string }} data
 * @param {number} createdBy
 */
export async function addMadPeriod(resourceId, { taux, date_debut, date_fin }, createdBy) {
    if (taux === undefined || !date_debut) throw badRequest('Taux et date de début requis');

    assertNoMadOverlap(await listMadHistory(resourceId), date_debut, date_fin);
    const { lastID } = await dbRun(
        'INSERT INTO resource_mad_history (resource_id, taux, date_debut, date_fin, created_by) VALUES (?, ?, ?, ?, ?)',
        [resourceId, taux, date_debut, date_fin || null, createdBy]
    );
    await syncCurrentRate(resourceId, taux, date_debut, date_fin);
    return lastID;
}

/**
 * @param {string | number} resourceId
 * @param {string | number} historyId
 * @param {{ taux?: unknown, date_debut: string, date_fin?: string }} data
 */
export async function updateMadPeriod(resourceId, historyId, { taux, date_debut, date_fin }) {
    const others = await dbAll('SELECT * FROM resource_mad_history WHERE resource_id = ? AND id != ?', [
        resourceId,
        historyId
    ]);
    assertNoMadOverlap(others, date_debut, date_fin);
    await dbRun(
        'UPDATE resource_mad_history SET taux = ?, date_debut = ?, date_fin = ? WHERE id = ? AND resource_id = ?',
        [taux, date_debut, date_fin || null, historyId, resourceId]
    );
    await syncCurrentRate(resourceId, taux, date_debut, date_fin);
}

/** Supprime une période MAD et ses particularités ; la dernière période ne peut pas être supprimée */
export async function deleteMadPeriod(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ historyId
) {
    const { count } = await dbGet('SELECT COUNT(*) as count FROM resource_mad_history WHERE resource_id = ?', [
        resourceId
    ]);
    if (count <= 1) throw badRequest('Impossible de supprimer le dernier taux MAD');

    await dbRun('DELETE FROM resource_mad_particularites WHERE mad_history_id = ?', [historyId]);
    await dbRun('DELETE FROM resource_mad_history WHERE id = ? AND resource_id = ?', [historyId, resourceId]);
}

// ---------- Particularités MAD (taux temporaire à l'intérieur d'une période) ----------

export function listParticularites(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ historyId
) {
    return dbAll(
        'SELECT * FROM resource_mad_particularites WHERE resource_id = ? AND mad_history_id = ? ORDER BY date_debut',
        [resourceId, historyId]
    );
}

/** Particularités de la même période qui chevauchent [start, end] */
function findParticulariteOverlaps(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ historyId,
    /** @type {string} */ start,
    /** @type {string} */ end,
    excludeId = /** @type {string | number | null} */ (null)
) {
    return dbAll(
        `SELECT * FROM resource_mad_particularites
         WHERE resource_id = ? AND mad_history_id = ? ${excludeId !== null ? 'AND id != ?' : ''}
         AND (
             (date_debut <= ? AND date_fin >= ?)
             OR (date_debut <= ? AND date_fin >= ?)
             OR (date_debut >= ? AND date_debut <= ?)
         )`,
        [resourceId, historyId, ...(excludeId !== null ? [excludeId] : []), start, start, end, end, start, end]
    );
}

/**
 * @param {string | number} resourceId
 * @param {string | number} historyId
 * @param {{ taux?: unknown, date_debut?: string, date_fin?: string, motif?: string }} data
 * @param {number} createdBy
 */
export async function addParticularite(resourceId, historyId, { taux, date_debut, date_fin, motif }, createdBy) {
    if (taux === undefined || !date_debut || !date_fin) {
        throw badRequest('Taux, date de début et date de fin requis');
    }

    const parent = await dbGet('SELECT * FROM resource_mad_history WHERE id = ? AND resource_id = ?', [
        historyId,
        resourceId
    ]);
    if (!parent) throw notFound('Période MAD non trouvée');
    if (date_debut < parent.date_debut || (parent.date_fin && date_fin > parent.date_fin)) {
        throw badRequest('Les dates doivent être dans la période MAD parente');
    }
    if ((await findParticulariteOverlaps(resourceId, historyId, date_debut, date_fin)).length > 0) {
        throw badRequest('Chevauchement de dates détecté avec une particularité existante');
    }

    const { lastID } = await dbRun(
        `INSERT INTO resource_mad_particularites (resource_id, mad_history_id, taux, date_debut, date_fin, motif, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [resourceId, historyId, taux, date_debut, date_fin, motif || null, createdBy]
    );
    return lastID;
}

/**
 * @param {string | number} resourceId
 * @param {string | number} historyId
 * @param {string | number} particulariteId
 * @param {{ taux?: unknown, date_debut: string, date_fin: string, motif?: string }} data
 */
export async function updateParticularite(
    resourceId,
    historyId,
    particulariteId,
    { taux, date_debut, date_fin, motif }
) {
    const overlaps = await findParticulariteOverlaps(resourceId, historyId, date_debut, date_fin, particulariteId);
    if (overlaps.length > 0) throw badRequest('Chevauchement de dates détecté');

    await dbRun(
        'UPDATE resource_mad_particularites SET taux = ?, date_debut = ?, date_fin = ?, motif = ? WHERE id = ?',
        [taux, date_debut, date_fin, motif || null, particulariteId]
    );
}

export async function deleteParticularite(
    /** @type {string | number} */ resourceId,
    /** @type {string | number} */ particulariteId
) {
    await dbRun('DELETE FROM resource_mad_particularites WHERE id = ? AND resource_id = ?', [
        particulariteId,
        resourceId
    ]);
}

/**
 * Taux MAD applicable à une date : particularité, sinon période de l'historique, sinon taux de la ressource
 * @param {string | number} resourceId
 * @param {string} date AAAA-MM-JJ
 */
export async function getEffectiveMadRate(resourceId, date) {
    const particularite = await dbGet(
        'SELECT p.* FROM resource_mad_particularites p WHERE p.resource_id = ? AND p.date_debut <= ? AND p.date_fin >= ?',
        [resourceId, date, date]
    );
    if (particularite) return { taux: particularite.taux, source: 'particularite', particularite };

    const history = await dbGet(
        'SELECT * FROM resource_mad_history WHERE resource_id = ? AND date_debut <= ? AND (date_fin IS NULL OR date_fin >= ?)',
        [resourceId, date, date]
    );
    if (history) return { taux: history.taux, source: 'history', history };

    const resource = await dbGet('SELECT taux FROM resources WHERE id = ?', [resourceId]);
    return { taux: resource ? resource.taux : 0, source: 'resource' };
}
