// Comptes rendus d'activité (CRA) : configuration, verrouillage de la saisie, chargement et suivi des corrections
import { env as appEnv } from '../../config/env.js';
import { database, dbGet, dbRun } from '../../db/database.js';
import { logUserAction } from '../../services/action-log.js';
import { enqueueEmail, newBatchId as generateICSUid } from '../../services/email-queue.js';
import { buildCraEmailHtml } from './cra.documents.js';

// Helper : vérifie si les astreintes/HNO d'un utilisateur pour un mois sont verrouillées par un CRA signé
export function checkCraLock(userId, mois, annee) {
    return new Promise((resolve, reject) => {
        database.get(
            `SELECT statut FROM cra WHERE user_id = ? AND mois = ? AND annee = ? AND (deleted IS NULL OR deleted = 0)`,
            [userId, mois, annee],
            (err, row) => {
                if (err) return reject(err);
                const locked = row && row.statut !== 'a_completer';
                resolve({ locked: !!locked, statut: row ? row.statut : null });
            }
        );
    });
}

export async function getCraConfig() {
    return new Promise(resolve => {
        database.get(`SELECT value FROM settings WHERE key = 'automation_4_config'`, (err, row) => {
            if (err || !row) return resolve(null);
            try {
                resolve(JSON.parse(row.value));
            } catch {
                resolve(null);
            }
        });
    });
}

// ---- CRA d'une MAD volante : collecte des activités de la planification ----
export const CRA_ACTIVITY_OBJETS = {
    3: 'SAMU (Déploiement)',
    4: 'SAMU (Dev. usages)',
    5: 'ANS (Déploiement)',
    6: 'ANS (Dev. usages)',
    7: 'Qualification',
    8: 'Divers'
};

export async function craLoadForCollect(req) {
    const cra = await dbGet('SELECT * FROM cra WHERE id = ?', [req.params.id]);
    if (!cra) throw Object.assign(new Error('CRA introuvable'), { status: 404 });
    const isAdmin = req.session.activeProfile === 'admin';
    if (!isAdmin && cra.user_id !== req.session.userId)
        throw Object.assign(new Error('Accès interdit'), { status: 403 });
    const rs = await dbGet(
        `SELECT r.id, r.is_mad_volante FROM users u JOIN resources r ON r.id = COALESCE(u.resource_id, ?) WHERE u.id = ?`,
        [cra.resource_id, cra.user_id]
    );
    return { cra, resourceId: rs ? rs.id : null, isMad: !!(rs && rs.is_mad_volante) };
}

export const craHalfHours = p =>
    p === 'FULL' ? ['09:00', '18:00'] : p === 'AM' ? ['09:00', '12:00'] : ['14:00', '18:00'];

// CRA modifié ou renvoyé par un administrateur : retour chez l'expert (visas remis à zéro, marquage, email). L'admin ne soumet jamais à la place de l'expert.
export async function craMarkAdminModified(req, cra, force) {
    const craId = cra.id;
    const adminNom = `${req.session.prenom || ''} ${req.session.nom || ''}`.trim() || 'Administrateur';
    const recent = !force && cra.modifie_admin_at && Date.now() - Date.parse(cra.modifie_admin_at) < 30 * 60 * 1000; // pas de mail à chaque enregistrement
    await dbRun(
        `UPDATE cra SET modifie_admin_at = ?, modifie_admin_nom = ?, submitted_at = NULL,
                 vise_n1_at = NULL, vise_n1_by = NULL, vise_n2_at = NULL, vise_n2_by = NULL WHERE id = ?`,
        [new Date().toISOString(), adminNom, craId]
    );
    await dbRun('DELETE FROM cra_signatures WHERE cra_id = ?', [craId]);
    logUserAction(req, force ? "CRA renvoyé à l'expert par administrateur" : 'Modification CRA par administrateur', {
        craId: Number(craId),
        expertUserId: cra.user_id
    });
    if (recent) return false;
    try {
        const ex = await dbGet('SELECT prenom, nom, email FROM users WHERE id = ?', [cra.user_id]);
        if (!ex || !ex.email) return false;
        const moisNom = new Date(cra.annee, cra.mois - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const appUrl = appEnv.APP_URL || `${req.protocol}://${req.get('host')}`;
        await enqueueEmail({
            batchId: generateICSUid(),
            recipientEmail: ex.email,
            recipientName: `${ex.prenom} ${ex.nom}`,
            senderName: adminNom,
            senderEmail: req.session.email || '',
            subject: `CRA ${moisNom} — à vérifier et soumettre`,
            htmlBody: buildCraEmailHtml({
                title: 'CRA à vérifier et soumettre',
                expertNom: `${ex.prenom} ${ex.nom}`,
                moisNom,
                craUrl: `${appUrl}/?tab=cra&craId=${cra.id}`,
                action: `${adminNom} a préparé ou modifié votre CRA. Merci de le vérifier, de le corriger si besoin, puis de le soumettre pour validation.`
            }),
            actionType: 'cra_modifie_admin'
        });
        return true;
    } catch (mailErr) {
        console.error('Mail CRA modifié par admin:', mailErr.message);
        return false;
    }
}
