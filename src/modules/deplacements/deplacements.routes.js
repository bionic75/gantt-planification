// Déplacements et bons de commande
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';

const router = Router();

// Récupérer tous les bons de commande
router.get('/bons-commande', requireAuth, (req, res) => {
    database.all(
        `
        SELECT bc.*, u.nom as creator_nom, u.prenom as creator_prenom
        FROM bons_commande bc
        LEFT JOIN users u ON bc.created_by = u.id
        ORDER BY bc.date_debut DESC
    `,
        [],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération bons de commande:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Créer un bon de commande
router.post('/bons-commande', requireAuth, (req, res) => {
    const { intitule, titulaire, date_debut, date_fin, nb_uo } = req.body;

    if (!intitule || !titulaire || !date_debut || !date_fin || !nb_uo) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Vérifier l'unicité du numéro de CBDC
    database.get(`SELECT id FROM bons_commande WHERE LOWER(intitule) = LOWER(?)`, [intitule], (err, existing) => {
        if (err) {
            console.error('Erreur vérification unicité CBDC:', err);
            return res.status(500).json({ error: err.message });
        }

        if (existing) {
            return res.status(400).json({ error: 'Ce numéro de CBDC existe déjà' });
        }

        database.run(
            `INSERT INTO bons_commande (intitule, titulaire, date_debut, date_fin, nb_uo, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [intitule, titulaire.toUpperCase(), date_debut, date_fin, nb_uo, req.session.userId],
            function (err) {
                if (err) {
                    console.error('Erreur création bon de commande:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, message: 'Bon de commande créé' });
            }
        );
    });
});

// Modifier un bon de commande
router.put('/bons-commande/:id', requireAuth, (req, res) => {
    const { intitule, titulaire, date_debut, date_fin, nb_uo, solde } = req.body;
    const id = req.params.id;

    database.run(
        `UPDATE bons_commande SET intitule = ?, titulaire = ?, date_debut = ?, date_fin = ?, nb_uo = ?, actif = 1, solde = ? WHERE id = ?`,
        [intitule, titulaire ? titulaire.toUpperCase() : null, date_debut, date_fin, nb_uo, solde ? 1 : 0, id],
        function (err) {
            if (err) {
                console.error('Erreur modification bon de commande:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Bon de commande modifié' });
        }
    );
});

// Supprimer un bon de commande
router.delete('/bons-commande/:id', requireAuth, (req, res) => {
    const id = req.params.id;

    // Récupérer les infos du BC et compter les déplacements associés
    database.get(`SELECT COUNT(*) as count FROM deplacements WHERE bon_commande_id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const nbDeplacements = row.count;

        // D'abord, désaffecter tous les déplacements liés à ce BC (mettre bon_commande_id à NULL)
        database.run(`UPDATE deplacements SET bon_commande_id = NULL WHERE bon_commande_id = ?`, [id], function (err) {
            if (err) {
                console.error('Erreur désaffectation déplacements:', err);
                return res.status(500).json({ error: err.message });
            }

            // Ensuite, supprimer le bon de commande
            database.run(`DELETE FROM bons_commande WHERE id = ?`, [id], function (err) {
                if (err) {
                    console.error('Erreur suppression bon de commande:', err);
                    return res.status(500).json({ error: err.message });
                }

                if (nbDeplacements > 0) {
                    console.log(`✅ BC ${id} supprimé, ${nbDeplacements} déplacement(s) désaffecté(s)`);
                    res.json({
                        message: 'Bon de commande supprimé',
                        deplacements_desaffectes: nbDeplacements
                    });
                } else {
                    res.json({ message: 'Bon de commande supprimé' });
                }
            });
        });
    });
});

// Récupérer tous les déplacements (pour reporting) - avec filtre optionnel par bon_commande_id
router.get('/deplacements', requireAuth, (req, res) => {
    const bonCommandeId = req.query.bon_commande_id;

    let query = `
        SELECT d.*, 
               u.nom as user_nom, u.prenom as user_prenom,
               bc.intitule as bon_commande_intitule,
               bc.titulaire as bon_commande_titulaire,
               amoa.nom as amoa_ced_nom,
               amoa.prenom as amoa_ced_prenom
        FROM deplacements d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id
        LEFT JOIN users amoa ON d.amoa_ced_id = amoa.id
    `;

    const params = [];

    if (bonCommandeId) {
        query += ` WHERE d.bon_commande_id = ?`;
        params.push(bonCommandeId);
    }

    query += ` ORDER BY d.date_debut DESC`;

    database.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erreur récupération déplacements:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer les déplacements de l'utilisateur connecté
router.get('/mes-deplacements', requireAuth, (req, res) => {
    // Si admin, afficher tous les déplacements, sinon seulement ceux de l'utilisateur
    const isAdmin = req.session.activeProfile === 'admin';

    let query = `
        SELECT d.*, 
               bc.intitule as bon_commande_intitule, 
               bc.titulaire as bon_commande_titulaire,
               bc.nb_uo as bc_uo_commandees,
               u.nom as amoa_ced_nom,
               u.prenom as amoa_ced_prenom,
               creator.nom as creator_nom,
               creator.prenom as creator_prenom
        FROM deplacements d
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id
        LEFT JOIN users u ON d.amoa_ced_id = u.id
        LEFT JOIN users creator ON d.user_id = creator.id
    `;

    let params = [];

    if (!isAdmin) {
        query += ` WHERE d.user_id = ?`;
        params.push(req.session.userId);
    }

    query += ` ORDER BY d.date_debut DESC`;

    database.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erreur récupération mes déplacements:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer un déplacement par ID
router.get('/deplacements/:id', requireAuth, (req, res) => {
    const id = req.params.id;

    database.get(
        `
        SELECT d.*, bc.intitule as bon_commande_intitule, bc.titulaire as bon_commande_titulaire
        FROM deplacements d
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id
        WHERE d.id = ?
    `,
        [id],
        (err, row) => {
            if (err) {
                console.error('Erreur récupération déplacement:', err);
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                return res.status(404).json({ error: 'Déplacement non trouvé' });
            }
            res.json(row);
        }
    );
});

// Créer un déplacement
router.post('/deplacements', requireAuth, (req, res) => {
    const { amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, commentaire } = req.body;

    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Calculer le nombre d'UO (nombre de jours)
    const start = new Date(date_debut);
    const end = new Date(date_fin);
    const diffTime = Math.abs(end - start);
    const nb_uo = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 pour inclure le jour de départ

    // Utiliser le bon_commande_id passé en paramètre s'il existe
    const bcId = bon_commande_id || null;
    const comm = commentaire ? commentaire.trim() : null;

    // Vérifier si le BC est en surconsommation
    if (bcId) {
        database.get(
            `
            SELECT bc.*, COALESCE(SUM(d.nb_uo), 0) as uo_consommees
            FROM bons_commande bc
            LEFT JOIN deplacements d ON d.bon_commande_id = bc.id
            WHERE bc.id = ?
            GROUP BY bc.id
        `,
            [bcId],
            (err, bc) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                // Calculer si après ajout on sera en surconsommation
                const uoApresAjout = (bc.uo_consommees || 0) + nb_uo;
                const enSurconsommation = uoApresAjout > bc.uo_commandees;

                database.run(
                    `INSERT INTO deplacements (user_id, amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, nb_uo, a_regulariser, commentaire) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.session.userId,
                        amoa_ced_id,
                        date_debut,
                        date_fin,
                        samu,
                        ville.toUpperCase(),
                        bcId,
                        nb_uo,
                        enSurconsommation ? 1 : 0,
                        comm
                    ],
                    function (err) {
                        if (err) {
                            console.error('Erreur création déplacement:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        res.json({
                            id: this.lastID,
                            nb_uo,
                            bon_commande_id: bcId,
                            a_regulariser: enSurconsommation,
                            message: enSurconsommation
                                ? '⚠️ Déplacement créé - À RÉGULARISER (bon de commande en surconsommation)'
                                : 'Déplacement créé'
                        });
                    }
                );
            }
        );
    } else {
        // Pas de BC, pas de vérification de surconsommation
        database.run(
            `INSERT INTO deplacements (user_id, amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, nb_uo, a_regulariser, commentaire) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [req.session.userId, amoa_ced_id, date_debut, date_fin, samu, ville.toUpperCase(), bcId, nb_uo, comm],
            function (err) {
                if (err) {
                    console.error('Erreur création déplacement:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, nb_uo, bon_commande_id: bcId, message: 'Déplacement créé' });
            }
        );
    }
});

// Modifier un déplacement
router.put('/deplacements/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    const { amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, commentaire } = req.body;

    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Calculer le nombre d'UO (nombre de jours)
    const start = new Date(date_debut);
    const end = new Date(date_fin);
    const diffTime = Math.abs(end - start);
    const nb_uo = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const comm = commentaire ? commentaire.trim() : null;

    // Vérifier que le déplacement appartient à l'utilisateur (sauf admin)
    database.get(`SELECT user_id FROM deplacements WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }

        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        database.run(
            `UPDATE deplacements SET amoa_ced_id = ?, date_debut = ?, date_fin = ?, samu = ?, ville = ?, bon_commande_id = ?, nb_uo = ?, commentaire = ? WHERE id = ?`,
            [amoa_ced_id, date_debut, date_fin, samu, ville.toUpperCase(), bon_commande_id || null, nb_uo, comm, id],
            function (err) {
                if (err) {
                    console.error('Erreur modification déplacement:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Déplacement modifié' });
            }
        );
    });
});

// Régularisation d'un déplacement (transfert d'un bon de commande à un autre)
router.post('/deplacements/:id/regularisation', requireAuth, (req, res) => {
    const id = req.params.id;
    const { ancien_bon_commande_id, nouveau_bon_commande_id } = req.body;

    if (!ancien_bon_commande_id || !nouveau_bon_commande_id) {
        return res.status(400).json({ error: 'Les deux bons de commande sont requis' });
    }

    if (ancien_bon_commande_id === nouveau_bon_commande_id) {
        return res.status(400).json({ error: 'Les deux bons de commande doivent être différents' });
    }

    // Vérifier que l'utilisateur est admin ou propriétaire du déplacement
    database.get(`SELECT * FROM deplacements WHERE id = ?`, [id], (err, deplacement) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!deplacement) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }

        if (deplacement.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        // Vérifier que le nouveau bon de commande existe et n'est pas soldé
        database.get(
            `SELECT * FROM bons_commande WHERE id = ? AND (solde IS NULL OR solde = 0)`,
            [nouveau_bon_commande_id],
            (err, nouveauBc) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                if (!nouveauBc) {
                    return res.status(404).json({ error: 'Nouveau bon de commande non trouvé ou soldé' });
                }

                // Vérifier que les dates du déplacement sont dans la période du nouveau BC
                if (deplacement.date_debut < nouveauBc.date_debut || deplacement.date_fin > nouveauBc.date_fin) {
                    return res.status(400).json({
                        error: `Les dates du déplacement (${deplacement.date_debut} - ${deplacement.date_fin}) ne sont pas dans la période du nouveau bon de commande (${nouveauBc.date_debut} - ${nouveauBc.date_fin})`
                    });
                }

                // Calculer les UO disponibles sur le nouveau BC
                database.get(
                    `
                SELECT COALESCE(SUM(nb_uo), 0) as uo_consommees 
                FROM deplacements 
                WHERE bon_commande_id = ?
            `,
                    [nouveau_bon_commande_id],
                    (err, stats) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }

                        const uoDisponibles = nouveauBc.uo_commandees - stats.uo_consommees;

                        if (uoDisponibles < deplacement.nb_uo) {
                            return res.status(400).json({
                                error: `Le nouveau bon de commande n'a pas assez d'UO disponibles (${uoDisponibles} disponibles, ${deplacement.nb_uo} nécessaires)`
                            });
                        }

                        // Effectuer le transfert : mettre à jour le bon de commande du déplacement ET retirer le marquage à régulariser
                        database.run(
                            `UPDATE deplacements SET bon_commande_id = ?, a_regulariser = 0 WHERE id = ?`,
                            [nouveau_bon_commande_id, id],
                            function (err) {
                                if (err) {
                                    console.error('Erreur régularisation déplacement:', err);
                                    return res.status(500).json({ error: err.message });
                                }

                                console.log(
                                    `✅ Régularisation effectuée: Déplacement ${id} transféré du BC ${ancien_bon_commande_id} vers BC ${nouveau_bon_commande_id} (${deplacement.nb_uo} UO)`
                                );

                                res.json({
                                    message: 'Régularisation effectuée avec succès',
                                    details: {
                                        deplacement_id: id,
                                        ancien_bon_commande_id: ancien_bon_commande_id,
                                        nouveau_bon_commande_id: nouveau_bon_commande_id,
                                        nb_uo_transferees: deplacement.nb_uo
                                    }
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

// Réaffectation simple d'un déplacement vers un autre BC (sans vérification des UO disponibles)
// ── Créer une ligne de régularisation technique ──────────────────────────────
// Crée un déplacement "technique" sur le BDC cible pour absorber la surconsommation du BDC source,
// puis met à jour le BDC source avec un commentaire de régularisation.
router.post('/deplacements/regularisation-technique', requireAdmin, async (req, res) => {
    const { source_bdc_id, cible_bdc_id, nb_uo, date_debut, commentaire } = req.body;

    if (!source_bdc_id || !cible_bdc_id || !nb_uo || !date_debut) {
        return res
            .status(400)
            .json({ error: 'Champs manquants : source_bdc_id, cible_bdc_id, nb_uo, date_debut requis' });
    }

    try {
        // Récupérer les infos BDC source et cible
        const [sourceBdc, cibleBdc] = await Promise.all([
            new Promise((res2, rej) =>
                database.get(`SELECT * FROM bons_commande WHERE id = ?`, [source_bdc_id], (err, r) =>
                    err ? rej(err) : res2(r)
                )
            ),
            new Promise((res2, rej) =>
                database.get(`SELECT * FROM bons_commande WHERE id = ?`, [cible_bdc_id], (err, r) =>
                    err ? rej(err) : res2(r)
                )
            )
        ]);

        if (!sourceBdc) return res.status(404).json({ error: 'BDC source introuvable' });
        if (!cibleBdc) return res.status(404).json({ error: 'BDC cible introuvable' });

        // Récupérer l'ID de l'admin système (user admin)
        const adminUser = await new Promise((res2, rej) => {
            database.get(`SELECT id, resource_id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1`, (err, r) =>
                err ? rej(err) : res2(r)
            );
        });

        // Calculer date_fin : date_debut + nb_uo - 1 jours
        const startDate = new Date(date_debut + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + parseInt(nb_uo) - 1);
        const dateDebut = date_debut;
        const dateFin = endDate.toISOString().split('T')[0];

        const comm =
            commentaire || `Régularisation du bon de commande ${sourceBdc.intitule} qui était en surconsommation`;

        // Insérer la ligne de régularisation technique dans deplacements
        const newId = await new Promise((res2, rej) => {
            database.run(
                `INSERT INTO deplacements (user_id, amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, nb_uo, a_regulariser, commentaire, regularisation_source_bdc_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                [
                    adminUser ? adminUser.id : req.session.userId,
                    adminUser ? adminUser.resource_id : null,
                    dateDebut,
                    dateFin,
                    '',
                    '', // SAMU et VILLE vides
                    cible_bdc_id,
                    nb_uo,
                    comm,
                    source_bdc_id
                ],
                function (err) {
                    if (err) rej(err);
                    else res2(this.lastID);
                }
            );
        });

        // Mettre à jour le BDC source : stocker l'ID du BDC cible de régularisation
        await new Promise((res2, rej) => {
            database.run(
                `UPDATE bons_commande SET regularisation_cible_bdc_id = ? WHERE id = ?`,
                [cible_bdc_id, source_bdc_id],
                err => (err ? rej(err) : res2())
            );
        });

        console.log(
            `✅ Régularisation technique créée: BDC ${sourceBdc.intitule} → ${cibleBdc.intitule}, ${nb_uo} UO, déplacement #${newId}`
        );
        res.json({
            success: true,
            deplacement_id: newId,
            source_intitule: sourceBdc.intitule,
            cible_intitule: cibleBdc.intitule,
            nb_uo,
            date_debut: dateDebut,
            date_fin: dateFin
        });
    } catch (error) {
        console.error('Erreur régularisation technique:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/deplacements/:id/reaffecter', requireAuth, (req, res) => {
    const id = req.params.id;
    const { nouveau_bon_commande_id } = req.body;

    if (!nouveau_bon_commande_id) {
        return res.status(400).json({ error: 'Le nouveau bon de commande est requis' });
    }

    // Vérifier que l'utilisateur est admin
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Seul un administrateur peut effectuer cette opération' });
    }

    // Vérifier que le déplacement existe
    database.get(
        `
        SELECT d.*, bc.intitule as ancien_bc_intitule 
        FROM deplacements d 
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id 
        WHERE d.id = ?
    `,
        [id],
        (err, deplacement) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (!deplacement) {
                return res.status(404).json({ error: 'Déplacement non trouvé' });
            }

            // Vérifier que le nouveau bon de commande existe
            database.get(`SELECT * FROM bons_commande WHERE id = ?`, [nouveau_bon_commande_id], (err, nouveauBc) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                if (!nouveauBc) {
                    return res.status(404).json({ error: 'Nouveau bon de commande non trouvé' });
                }

                // Préparer le nouveau commentaire avec la trace de réaffectation
                const ancienBcRef = deplacement.ancien_bc_intitule || 'N/A';
                const nouveauBcRef = nouveauBc.intitule;
                const traceReaffectation = `Réaffectation du BDC n° ${ancienBcRef} vers le BDC n° ${nouveauBcRef}`;

                // Si un commentaire existait, l'ajouter après la trace
                let nouveauCommentaire = traceReaffectation;
                if (deplacement.commentaire && deplacement.commentaire.trim()) {
                    // Vérifier si ce n'est pas déjà une trace de réaffectation
                    if (!deplacement.commentaire.startsWith('Réaffectation du BDC')) {
                        nouveauCommentaire = traceReaffectation + ' | ' + deplacement.commentaire;
                    }
                }

                // Effectuer le transfert : mettre à jour le bon de commande, le commentaire et retirer le marquage à régulariser
                database.run(
                    `UPDATE deplacements SET bon_commande_id = ?, a_regulariser = 0, commentaire = ? WHERE id = ?`,
                    [nouveau_bon_commande_id, nouveauCommentaire, id],
                    function (err) {
                        if (err) {
                            console.error('Erreur réaffectation déplacement:', err);
                            return res.status(500).json({ error: err.message });
                        }

                        console.log(
                            `✅ Réaffectation effectuée: Déplacement ${id} transféré de BC ${ancienBcRef} vers BC ${nouveauBcRef} (${deplacement.nb_uo} UO)`
                        );

                        res.json({
                            message: 'Réaffectation effectuée avec succès',
                            details: {
                                deplacement_id: id,
                                ancien_bon_commande: ancienBcRef,
                                nouveau_bon_commande: nouveauBcRef,
                                nb_uo_transferees: deplacement.nb_uo
                            }
                        });
                    }
                );
            });
        }
    );
});

// Supprimer un déplacement
router.delete('/deplacements/:id', requireAuth, (req, res) => {
    const id = req.params.id;

    // Vérifier que le déplacement appartient à l'utilisateur (sauf admin)
    database.get(`SELECT user_id FROM deplacements WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }

        // Seul l'utilisateur propriétaire ou un admin peut supprimer
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        database.run(`DELETE FROM deplacements WHERE id = ?`, [id], function (err) {
            if (err) {
                console.error('Erreur suppression déplacement:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Déplacement supprimé' });
        });
    });
});

// Reporting: statistiques des bons de commande
router.get('/reporting-deplacements', requireAuth, (req, res) => {
    database.all(
        `
        SELECT 
            bc.id,
            bc.intitule,
            bc.titulaire,
            bc.date_debut,
            bc.date_fin,
            bc.nb_uo as uo_commandees,
            bc.actif,
            bc.solde,
            bc.regularisation_cible_bdc_id,
            COALESCE(SUM(d.nb_uo), 0) as uo_consommees,
            bc2.intitule as regularisation_cible_intitule
        FROM bons_commande bc
        LEFT JOIN deplacements d ON d.bon_commande_id = bc.id
        LEFT JOIN bons_commande bc2 ON bc2.id = bc.regularisation_cible_bdc_id
        GROUP BY bc.id
        ORDER BY bc.date_debut DESC
    `,
        [],
        (err, rows) => {
            if (err) {
                console.error('Erreur reporting déplacements:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// Récupérer la liste des SAMU (depuis les ressources)
router.get('/liste-samu', requireAuth, (req, res) => {
    database.all(
        `SELECT DISTINCT samu FROM resources WHERE samu IS NOT NULL AND samu != '' ORDER BY samu`,
        [],
        (err, rows) => {
            if (err) {
                console.error('Erreur récupération liste SAMU:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows.map(r => r.samu));
        }
    );
});

export default router;
