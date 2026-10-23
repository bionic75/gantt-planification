// Astreintes et HNO : saisie, planning d'astreinte, disponibilités, génération
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { checkCraLock } from '../cra/cra.service.js';
import { database } from '../../db/database.js';
import { sendTeamsNotificationFromServer } from '../notifications/notifications.service.js';
import { formatDateFR } from '../../lib/utils.js';

const router = Router();

// Vérification du verrouillage CRA pour un utilisateur+mois — admin ou self
router.get('/astreintes-hno/lock-check', requireAuth, async (req, res) => {
    const { user_id, mois, annee } = req.query;
    if (!user_id || !mois || !annee) return res.status(400).json({ error: 'Paramètres manquants' });
    const isAdmin = req.session.activeProfile === 'admin';
    const isSelf = String(req.session.userId) === String(user_id);
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Accès refusé' });
    try {
        const lock = await checkCraLock(user_id, mois, annee);
        res.json(lock);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Récupérer les astreintes/HNO de l'utilisateur connecté
router.get('/mes-astreintes', requireAuth, (req, res) => {
    database.all(
        `
        SELECT * FROM astreintes_hno 
        WHERE user_id = ?
        ORDER BY date_debut DESC
    `,
        [req.session.userId],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération astreintes:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Récupérer toutes les astreintes/HNO pour affichage sur le planning
router.get('/all-astreintes-planning', requireAuth, (req, res) => {
    database.all(
        `
        SELECT a.*, u.nom as user_nom, u.prenom as user_prenom, u.resource_id
        FROM astreintes_hno a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE u.resource_id IS NOT NULL
        ORDER BY a.date_debut
    `,
        [],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération astreintes planning:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Récupérer toutes les astreintes/HNO (admin)
router.get('/astreintes', requireAuth, (req, res) => {
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }

    database.all(
        `
        SELECT a.*, u.nom as user_nom, u.prenom as user_prenom
        FROM astreintes_hno a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY u.nom, u.prenom, a.date_debut DESC
    `,
        [],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération astreintes:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Récupérer la liste des experts (pour admin)
router.get('/experts-list', requireAuth, (req, res) => {
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }

    database.all(
        `
        SELECT id, nom, prenom 
        FROM users 
        WHERE is_expert = 1 AND actif = 1
        ORDER BY nom, prenom
    `,
        [],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération experts:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Créer une astreinte/HNO
router.post('/astreintes', requireAuth, async (req, res) => {
    const { user_id, type, date_debut, date_fin, heure_debut, heure_fin, samu, tous_samu, objet } = req.body;

    // Vérifier les droits
    const targetUserId = req.session.activeProfile === 'admin' ? user_id || req.session.userId : req.session.userId;

    if (!type || !date_debut || !date_fin || !objet) {
        return res.status(400).json({ error: 'Type, dates et objet sont requis' });
    }

    // Vérification du verrou CRA
    const mois = parseInt(date_debut.split('-')[1]);
    const annee = parseInt(date_debut.split('-')[0]);
    try {
        const lock = await checkCraLock(targetUserId, mois, annee);
        if (lock.locked)
            return res.status(403).json({
                error: `Modification impossible : un CRA ${lock.statut} existe pour ce mois. Supprimez-le d'abord pour libérer la saisie.`
            });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }

    // Heures obligatoires pour astreintes ET HNO
    if (!heure_debut || !heure_fin) {
        return res.status(400).json({ error: 'Heures de début et fin requises' });
    }

    if (!tous_samu && !samu) {
        return res.status(400).json({ error: 'SAMU requis ou cocher "Tous les SAMU"' });
    }

    database.run(
        `INSERT INTO astreintes_hno (user_id, type, date_debut, date_fin, heure_debut, heure_fin, samu, tous_samu, objet) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            targetUserId,
            type,
            date_debut,
            date_fin,
            heure_debut,
            heure_fin,
            tous_samu ? null : samu,
            tous_samu ? 1 : 0,
            objet
        ],
        function (err) {
            if (err) {
                console.error('Erreur création astreinte:', err);
                return res.status(500).json({ error: err.message });
            }

            // Envoyer notification Teams
            sendTeamsNotificationFromServer('astreinte', {
                expert: `${req.session.prenom} ${req.session.nom}`,
                type: type,
                date: `${formatDateFR(date_debut)}${date_fin !== date_debut ? ' au ' + formatDateFR(date_fin) : ''}`,
                heureDebut: heure_debut,
                heureFin: heure_fin
            });

            res.json({ id: this.lastID, message: 'Astreinte/HNO créée' });
        }
    );
});

// Modifier une astreinte/HNO
router.put('/astreintes/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const { type, date_debut, date_fin, heure_debut, heure_fin, samu, tous_samu, objet } = req.body;

    try {
        const row = await new Promise((resolve, reject) =>
            database.get(`SELECT user_id, date_debut FROM astreintes_hno WHERE id = ?`, [id], (err, r) =>
                err ? reject(err) : resolve(r)
            )
        );
        if (!row) return res.status(404).json({ error: 'Astreinte non trouvée' });
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin')
            return res.status(403).json({ error: 'Non autorisé' });

        const mois = parseInt(row.date_debut.split('-')[1]);
        const annee = parseInt(row.date_debut.split('-')[0]);
        const lock = await checkCraLock(row.user_id, mois, annee);
        if (lock.locked)
            return res
                .status(403)
                .json({ error: `Modification impossible : un CRA ${lock.statut} existe pour ce mois.` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }

    // Récupérer à nouveau pour le UPDATE (simplifié)
    database.get(`SELECT user_id FROM astreintes_hno WHERE id = ?`, [id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: err?.message || 'Astreinte non trouvée' });

        // Heures obligatoires pour astreintes ET HNO
        if (!heure_debut || !heure_fin) {
            return res.status(400).json({ error: 'Heures de début et fin requises' });
        }

        database.run(
            `UPDATE astreintes_hno 
             SET type = ?, date_debut = ?, date_fin = ?, heure_debut = ?, heure_fin = ?, samu = ?, tous_samu = ?, objet = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [type, date_debut, date_fin, heure_debut, heure_fin, tous_samu ? null : samu, tous_samu ? 1 : 0, objet, id],
            function (err) {
                if (err) {
                    console.error('Erreur modification astreinte:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Astreinte/HNO modifiée' });
            }
        );
    });
});

// Supprimer une astreinte/HNO
router.delete('/astreintes/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    try {
        const row = await new Promise((resolve, reject) =>
            database.get(`SELECT user_id, date_debut FROM astreintes_hno WHERE id = ?`, [id], (err, r) =>
                err ? reject(err) : resolve(r)
            )
        );
        if (!row) return res.status(404).json({ error: 'Astreinte non trouvée' });
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin')
            return res.status(403).json({ error: 'Non autorisé' });
        const mois = parseInt(row.date_debut.split('-')[1]);
        const annee = parseInt(row.date_debut.split('-')[0]);
        const lock = await checkCraLock(row.user_id, mois, annee);
        if (lock.locked)
            return res
                .status(403)
                .json({ error: `Suppression impossible : un CRA ${lock.statut} existe pour ce mois.` });
        await new Promise((resolve, reject) =>
            database.run(`DELETE FROM astreintes_hno WHERE id = ?`, [id], err => (err ? reject(err) : resolve()))
        );
        res.json({ message: 'Astreinte/HNO supprimée' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Supprimer une astreinte/HNO par son id — admin ou propriétaire
router.delete('/astreintes-hno/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    const isAdmin = req.session.activeProfile === 'admin';
    const sessionUserId = req.session.userId;
    try {
        const row = await new Promise((resolve, reject) =>
            database.get(`SELECT * FROM astreintes_hno WHERE id = ?`, [id], (err, r) =>
                err ? reject(err) : resolve(r)
            )
        );
        if (!row) return res.status(404).json({ error: 'Entrée introuvable' });
        if (!isAdmin && String(row.user_id) !== String(sessionUserId))
            return res.status(403).json({ error: 'Accès refusé' });
        const mois = parseInt((row.date_debut || '').split('-')[1]);
        const annee = parseInt((row.date_debut || '').split('-')[0]);
        const lock = await checkCraLock(row.user_id, mois, annee).catch(() => ({ locked: false }));
        if (lock.locked)
            return res
                .status(403)
                .json({ error: `Suppression impossible : un CRA ${lock.statut} existe pour ce mois.` });
        await new Promise((resolve, reject) =>
            database.run(`DELETE FROM astreintes_hno WHERE id = ?`, [id], err => (err ? reject(err) : resolve()))
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lecture directe des astreintes/HNO pour un utilisateur+mois (sans CRA) — admin ou self
router.get('/astreintes-hno/direct', requireAuth, async (req, res) => {
    const { user_id, mois, annee } = req.query;
    if (!user_id || !mois || !annee) return res.status(400).json({ error: 'Paramètres manquants' });
    const isAdmin = req.session.activeProfile === 'admin';
    const isSelf = String(req.session.userId) === String(user_id);
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Accès refusé' });
    const pad = n => String(n).padStart(2, '0');
    const dateStart = `${annee}-${pad(mois)}-01`;
    const dateEnd = `${annee}-${pad(mois)}-31`;
    try {
        const rows = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ? ORDER BY date_debut`,
                [user_id, dateStart, dateEnd],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Sauvegarde directe des astreintes/HNO pour un utilisateur+mois (sans CRA) — admin ou self
router.post('/astreintes-hno/direct', requireAuth, async (req, res) => {
    const { user_id, mois, annee, lignes } = req.body;
    if (!user_id || !mois || !annee) return res.status(400).json({ error: 'Paramètres manquants' });
    const isAdmin = req.session.activeProfile === 'admin';
    const isSelf = String(req.session.userId) === String(user_id);
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Accès refusé' });
    const lock = await checkCraLock(user_id, mois, annee).catch(() => ({ locked: false }));
    if (lock.locked)
        return res.status(403).json({
            error: `Modification impossible : un CRA ${lock.statut} existe pour ce mois. Supprimez-le d'abord pour libérer la saisie.`
        });
    const pad = n => String(n).padStart(2, '0');
    const dateStart = `${annee}-${pad(mois)}-01`;
    const dateEnd = `${annee}-${pad(mois)}-31`;
    try {
        await new Promise((resolve, reject) => {
            database.run(
                `DELETE FROM astreintes_hno WHERE user_id = ? AND date_debut >= ? AND date_debut <= ?`,
                [user_id, dateStart, dateEnd],
                err => (err ? reject(err) : resolve())
            );
        });
        for (const l of lignes || []) {
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO astreintes_hno (user_id, type, date_debut, date_fin, heure_debut, heure_fin, samu, objet)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        user_id,
                        l.type,
                        l.date_debut,
                        l.date_fin,
                        l.heure_debut || null,
                        l.heure_fin || null,
                        l.samu || null,
                        l.objet
                    ],
                    err => (err ? reject(err) : resolve())
                );
            });
        }
        res.json({ success: true, inserted: (lignes || []).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Récupérer la liste des volontaires
router.get('/astreinte/volontaires', requireAdmin, (req, res) => {
    database.all(
        `SELECT id, nom, prenom, trigramme, astreinte_volontaire, astreinte_date_activation 
                  FROM resources WHERE actif = 1 ORDER BY nom, prenom`,
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

// Activer/désactiver un volontaire
router.post('/astreinte/volontaire/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { volontaire } = req.body;

    const dateActivation = volontaire ? new Date().toISOString() : null;

    database.run(
        `UPDATE resources SET astreinte_volontaire = ?, astreinte_date_activation = ? WHERE id = ?`,
        [volontaire ? 1 : 0, dateActivation, id],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

// Récupérer les indisponibilités
router.get('/astreinte/indispos', requireAdmin, (req, res) => {
    database.all(`SELECT * FROM astreinte_indisponibilites ORDER BY date`, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// Récupérer les disponibilités d'un expert pour un mois
router.get('/astreinte/dispos/:expertId/:mois', requireAuth, (req, res) => {
    const { expertId, mois } = req.params;
    console.log('📅 GET astreinte/dispos - expertId:', expertId, 'mois:', mois);

    const [year, month] = mois.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    // On stocke maintenant les DISPONIBILITÉS (jours verts)
    database.all(
        `SELECT * FROM astreinte_disponibilites 
                  WHERE resource_id = ? AND date >= ? AND date <= ?
                  ORDER BY date`,
        [expertId, startDate, endDate],
        (err, rows) => {
            if (err) {
                console.error('📅 Erreur GET dispos:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log('📅 Disponibilités trouvées:', rows?.length || 0);
                res.json(rows || []);
            }
        }
    );
});

// Sauvegarder les disponibilités d'un expert pour un mois
router.post('/astreinte/dispos/:expertId/:mois', requireAuth, async (req, res) => {
    const { expertId, mois } = req.params;
    const { disponibilites } = req.body; // Array de dates disponibles (vertes)
    const [year, month] = mois.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    try {
        // Supprimer les anciennes disponibilités du mois pour cet expert
        await new Promise((resolve, reject) => {
            database.run(
                `DELETE FROM astreinte_disponibilites 
                          WHERE resource_id = ? AND date >= ? AND date <= ?`,
                [expertId, startDate, endDate],
                err => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Insérer les nouvelles disponibilités
        for (const date of disponibilites) {
            // Déterminer le type de créneau selon le jour
            const dateObj = new Date(date);
            const dayOfWeek = dateObj.getDay();
            const typeCreneau = dayOfWeek === 0 || dayOfWeek === 6 ? 'journee' : 'soir';

            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO astreinte_disponibilites (resource_id, date, type_creneau) VALUES (?, ?, ?)`,
                    [expertId, date, typeCreneau],
                    err => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        res.json({ success: true, count: disponibilites.length });
    } catch (error) {
        console.error('Erreur sauvegarde dispos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ajouter une indisponibilité
router.post('/astreinte/indispo', requireAdmin, (req, res) => {
    const { resource_id, date, type_creneau, motif } = req.body;

    database.run(
        `INSERT OR REPLACE INTO astreinte_indisponibilites (resource_id, date, type_creneau, motif) VALUES (?, ?, ?, ?)`,
        [resource_id, date, type_creneau, motif || null],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, id: this.lastID });
            }
        }
    );
});

// Supprimer une indisponibilité
router.delete('/astreinte/indispo/:id', requireAdmin, (req, res) => {
    const { id } = req.params;

    database.run(`DELETE FROM astreinte_indisponibilites WHERE id = ?`, [id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Générer le planning d'astreinte
router.post('/astreinte/generate', requireAdmin, async (req, res) => {
    const { year, month } = req.body;

    try {
        // Récupérer les volontaires actifs
        const volontaires = await new Promise((resolve, reject) => {
            database.all(`SELECT * FROM resources WHERE actif = 1 AND astreinte_volontaire = 1`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        if (volontaires.length === 0) {
            return res.status(400).json({ error: 'Aucun volontaire disponible' });
        }

        // Récupérer les DISPONIBILITÉS du mois (jours verts déclarés)
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

        const disponibilites = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM astreinte_disponibilites WHERE date >= ? AND date <= ?`,
                [startDate, endDate],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Récupérer les affectations existantes (déplacements, bascules)
        const affectations = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM schedule_data WHERE date_key LIKE ? AND type = 'activity' AND value IN ('3', '4')`,
                [`${year}-${String(month).padStart(2, '0')}%`],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Générer les créneaux du mois
        const slots = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = date.getDay();

            if (dayOfWeek === 0 || dayOfWeek === 6) {
                // Week-end : journée complète
                slots.push({ date: dateStr, type_creneau: 'journee', dayOfWeek });
            } else {
                // Semaine : soir seulement
                slots.push({ date: dateStr, type_creneau: 'soir', dayOfWeek });
            }
        }

        // Algorithme de répartition
        const planning = [];
        const compteur = {}; // Compteur d'astreintes par expert
        const dernierAstreinte = {}; // Dernière date d'astreinte par expert
        const warnings = [];

        volontaires.forEach(v => {
            compteur[v.id] = 0;
            dernierAstreinte[v.id] = null;
        });

        // Fonction pour vérifier si un expert est disponible
        const isDisponible = (expertId, date, typeCreneau) => {
            // Vérifier si l'expert a déclaré être DISPONIBLE pour cette date
            const dispo = disponibilites.find(d => d.resource_id === expertId && d.date === date);
            // Si pas de disponibilité déclarée pour cette date = indisponible (rouge par défaut)
            if (!dispo) return false;

            // Vérifier si déplacement/bascule le lendemain (pour astreinte soir)
            if (typeCreneau === 'soir') {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDateStr = nextDay.toISOString().split('T')[0];

                const affectLendemain = affectations.find(
                    a => a.resource_id === expertId && a.date_key === nextDateStr
                );
                if (affectLendemain) return false;
            }

            return true;
        };

        // Fonction pour vérifier les contraintes FPH
        const checkContraintesFPH = (expertId, date) => {
            // Max 15 astreintes par mois
            if (compteur[expertId] >= 15) return false;

            // Calculer les heures sur 7 jours glissants (simplifié)
            // Soir = 14h, Journée WE = 24h
            // Max 72h sur 7 jours
            // Pour simplifier, on limite à 3 créneaux sur 7 jours
            const dateObj = new Date(date);
            let countLast7Days = 0;

            for (const slot of planning) {
                const slotDate = new Date(slot.date);
                const diffDays = Math.abs((dateObj - slotDate) / (1000 * 60 * 60 * 24));
                if (slot.resource_id === expertId && diffDays < 7) {
                    countLast7Days++;
                }
            }

            if (countLast7Days >= 3) return false;

            // Repos de 11h entre deux périodes
            if (dernierAstreinte[expertId]) {
                const lastDate = new Date(dernierAstreinte[expertId]);
                const currentDate = new Date(date);
                const diffHours = (currentDate - lastDate) / (1000 * 60 * 60);
                if (diffHours < 11) return false;
            }

            return true;
        };

        // Assigner les créneaux
        for (const slot of slots) {
            // Trier les volontaires par nombre d'astreintes (équité)
            const sortedVolontaires = [...volontaires].sort((a, b) => compteur[a.id] - compteur[b.id]);

            let assigned = false;
            for (const expert of sortedVolontaires) {
                if (
                    isDisponible(expert.id, slot.date, slot.type_creneau) &&
                    checkContraintesFPH(expert.id, slot.date)
                ) {
                    planning.push({
                        date: slot.date,
                        type_creneau: slot.type_creneau,
                        resource_id: expert.id,
                        year,
                        month
                    });

                    compteur[expert.id]++;
                    dernierAstreinte[expert.id] = slot.date;
                    assigned = true;
                    break;
                }
            }

            if (!assigned) {
                planning.push({
                    date: slot.date,
                    type_creneau: slot.type_creneau,
                    resource_id: null,
                    year,
                    month
                });
                warnings.push(`Aucun expert disponible pour le ${slot.date} (${slot.type_creneau})`);
            }
        }

        // Sauvegarder le planning en base
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM astreinte_planning WHERE year = ? AND month = ?`, [year, month], err => {
                if (err) reject(err);
                else resolve();
            });
        });

        for (const slot of planning) {
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO astreinte_planning (date, type_creneau, resource_id, year, month) VALUES (?, ?, ?, ?, ?)`,
                    [slot.date, slot.type_creneau, slot.resource_id, year, month],
                    function (err) {
                        if (err) reject(err);
                        else {
                            slot.id = this.lastID;
                            resolve();
                        }
                    }
                );
            });
        }

        // Statistiques
        const stats = {};
        volontaires.forEach(v => {
            if (compteur[v.id] > 0) {
                stats[`${v.nom.toUpperCase()} ${v.prenom}`] = compteur[v.id];
            }
        });

        res.json({ planning, warnings, stats, disponibilites });
    } catch (error) {
        console.error('Erreur génération planning:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier une assignation
router.put('/astreinte/slot/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { resource_id } = req.body;

    database.run(`UPDATE astreinte_planning SET resource_id = ? WHERE id = ?`, [resource_id, id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Récupérer le planning d'un mois
router.get('/astreinte/planning/:mois', requireAdmin, (req, res) => {
    const { mois } = req.params;
    const [year, month] = mois.split('-').map(Number);

    database.all(
        `SELECT * FROM astreinte_planning WHERE year = ? AND month = ? ORDER BY date`,
        [year, month],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

export default router;
