// Reporting et exports : disponibilités, astreintes/HNO, carte des événements, exports
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.
import { Router } from 'express';
import { requireAuth, requireReportingAccess } from '../../middlewares/auth.js';
import { database } from '../../db/database.js';
import { logUserAction } from '../../services/action-log.js';
import { getActivityLabel } from './reporting.service.js';

const router = Router();

// Endpoint pour le rapport de disponibilités/affectations
router.post('/reporting/availability', requireReportingAccess, async (req, res) => {
    try {
        const { startMonth, startYear, endMonth, endYear, expertIds, includeLeave } = req.body;

        console.log('📊 Génération rapport:', {
            startMonth,
            startYear,
            endMonth,
            endYear,
            expertIds: expertIds?.length,
            includeLeave
        });

        // Vérification de sécurité
        if (!expertIds || !Array.isArray(expertIds) || expertIds.length === 0) {
            return res.status(400).json({ error: 'Aucun expert sélectionné' });
        }

        // Générer la liste des mois (avec protection contre boucle infinie)
        const months = [];
        let currentDate = new Date(startYear, startMonth, 1);
        const endDate = new Date(endYear, endMonth + 1, 0);
        const maxMonths = 60; // Maximum 5 ans

        while (currentDate <= endDate && months.length < maxMonths) {
            months.push({
                year: currentDate.getFullYear(),
                month: currentDate.getMonth()
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        if (months.length === 0) {
            return res.status(400).json({ error: 'Période invalide' });
        }

        // Récupérer les experts sélectionnés
        const placeholders = expertIds.map(() => '?').join(',');
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM resources WHERE id IN (${placeholders}) ORDER BY nom, prenom`,
                expertIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Calculer le nombre moyen de jours ouvrés par mois (sur la période)
        let totalWorkingDays = 0;
        for (const month of months) {
            const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(month.year, month.month, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    totalWorkingDays++;
                }
            }
        }
        const avgWorkingDaysPerMonth = months.length > 0 ? totalWorkingDays / months.length : 22;

        // Pour chaque expert, calculer les stats mensuelles
        const expertsWithStats = await Promise.all(
            experts.map(async expert => {
                const monthlyStats = {};

                for (const month of months) {
                    const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;

                    // Calculer le nombre de jours ouvrés dans le mois
                    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
                    let workingDays = 0;
                    let leaveDays = 0;

                    for (let day = 1; day <= daysInMonth; day++) {
                        const date = new Date(month.year, month.month, day);
                        const dayOfWeek = date.getDay();
                        // Exclure samedi (6) et dimanche (0)
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                            workingDays++;
                        }
                    }

                    // Récupérer les données de disponibilité et d'affectation pour ce mois
                    // Chercher avec les deux formats possibles: 2025-12-% et 2025-12-%
                    const monthPattern1 = `${monthKey}-%`;
                    const monthPattern2 = `${month.year}-${month.month + 1}-%`; // Format sans zéro

                    const scheduleData = await new Promise((resolve, reject) => {
                        database.all(
                            `SELECT date_key, type, value FROM schedule_data 
                         WHERE resource_id = ? AND (date_key LIKE ? OR date_key LIKE ?)`,
                            [expert.id, monthPattern1, monthPattern2],
                            (err, rows) => {
                                if (err) reject(err);
                                else resolve(rows || []);
                            }
                        );
                    });

                    // Organiser les données par date et période
                    // Gérer les formats: 2025-12-15_AM, 2025-12-15_PM, 2025-12-15 (ancien format = journée complète)
                    const dataByDatePeriod = {};
                    scheduleData.forEach(row => {
                        let dateKey = row.date_key;

                        // Si le format n'a pas _AM ou _PM, c'est l'ancien format (journée complète)
                        // On le compte comme AM et PM
                        if (!dateKey.includes('_AM') && !dateKey.includes('_PM')) {
                            // Normaliser la date d'abord (ex: 2025-9-15 -> 2025-09-15)
                            const parts = dateKey.split('-');
                            if (parts.length >= 3) {
                                const normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                                // Ajouter pour AM
                                const amKey = `${normalizedDate}_AM`;
                                if (!dataByDatePeriod[amKey]) dataByDatePeriod[amKey] = {};
                                dataByDatePeriod[amKey][row.type] = row.value;
                                // Ajouter pour PM
                                const pmKey = `${normalizedDate}_PM`;
                                if (!dataByDatePeriod[pmKey]) dataByDatePeriod[pmKey] = {};
                                dataByDatePeriod[pmKey][row.type] = row.value;
                            }
                        } else {
                            // Format moderne avec _AM ou _PM
                            // Normaliser la partie date si nécessaire
                            const [datePart, period] = dateKey.split('_');
                            const parts = datePart.split('-');
                            if (parts.length >= 3) {
                                const normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                                const normalizedKey = `${normalizedDate}_${period}`;
                                if (!dataByDatePeriod[normalizedKey]) dataByDatePeriod[normalizedKey] = {};
                                dataByDatePeriod[normalizedKey][row.type] = row.value;
                            }
                        }
                    });

                    // Compter les jours disponibles, affectés et congés
                    // Disponible = disponibilité = "2"
                    // Affecté = activité = "3", "4", "5", "6", "7" ou "8"
                    // Congés = disponibilité = "3"
                    let availableDays = 0;
                    let assignedDays = 0;

                    // Parcourir toutes les demi-journées du mois (y compris week-ends)
                    for (let day = 1; day <= daysInMonth; day++) {
                        const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                        // Vérifier AM
                        const amKey = `${dateStr}_AM`;
                        const amData = dataByDatePeriod[amKey] || {};

                        // Disponible = valeur 2
                        if (amData.available === '2') {
                            availableDays += 0.5;
                        }
                        // Congés = valeur 3
                        if (amData.available === '3') {
                            leaveDays += 0.5;
                        }
                        // Affecté = activité 3, 4, 5, 6, 7 ou 8
                        const amActivity = amData.activity;
                        if (amActivity && ['3', '4', '5', '6', '7', '8'].includes(amActivity)) {
                            assignedDays += 0.5;
                        }

                        // Vérifier PM
                        const pmKey = `${dateStr}_PM`;
                        const pmData = dataByDatePeriod[pmKey] || {};

                        if (pmData.available === '2') {
                            availableDays += 0.5;
                        }
                        if (pmData.available === '3') {
                            leaveDays += 0.5;
                        }
                        const pmActivity = pmData.activity;
                        if (pmActivity && ['3', '4', '5', '6', '7', '8'].includes(pmActivity)) {
                            assignedDays += 0.5;
                        }
                    }

                    // Calculer le taux : Affecté / Disponible
                    // Si "Prendre en compte les congés" est coché, on ajuste le taux
                    // mais on affiche toujours les vrais chiffres bruts
                    let effectiveAvailable = availableDays;
                    let rateBase = availableDays;

                    if (includeLeave && leaveDays > 0) {
                        // Le taux est calculé sur la capacité réelle (disponible - congés ne fait pas sens car congés != disponible)
                        // En fait, on garde availableDays tel quel car les congés sont déjà exclus de availableDays
                        // (available=3 n'est pas compté dans availableDays)
                        rateBase = availableDays;
                    }

                    // Calculer le taux : Affecté / Disponible
                    const rate = rateBase > 0 ? (assignedDays / rateBase) * 100 : 0;

                    monthlyStats[monthKey] = {
                        workingDays,
                        available: Math.round(availableDays * 10) / 10,
                        assigned: Math.round(assignedDays * 10) / 10,
                        leave: Math.round(leaveDays * 10) / 10,
                        rate: Math.round(rate * 10) / 10
                    };
                }

                return {
                    id: expert.id,
                    name: `${expert.prenom} ${expert.nom}`,
                    tauxMad: expert.taux || 100,
                    avgWorkingDaysPerMonth: Math.round(avgWorkingDaysPerMonth * 10) / 10,
                    monthlyStats
                };
            })
        );

        res.json({
            success: true,
            months,
            experts: expertsWithStats
        });
    } catch (error) {
        console.error('Erreur génération rapport:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint de diagnostic pour voir les données brutes d'un expert sur un mois
router.get('/reporting/diagnose/:expertId/:year/:month', requireReportingAccess, async (req, res) => {
    try {
        const { expertId, year, month } = req.params;
        const monthKey = `${year}-${String(parseInt(month)).padStart(2, '0')}`;
        const monthPattern1 = `${monthKey}-%`;
        const monthPattern2 = `${year}-${parseInt(month)}-%`; // Format sans zéro

        // Récupérer toutes les données brutes
        const rawData = await new Promise((resolve, reject) => {
            database.all(
                `SELECT date_key, type, value FROM schedule_data 
                 WHERE resource_id = ? AND (date_key LIKE ? OR date_key LIKE ?)
                 ORDER BY date_key, type`,
                [expertId, monthPattern1, monthPattern2],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Compter
        let availableCount = 0;
        let assignedCount = 0;
        let leaveCount = 0;

        rawData.forEach(row => {
            if (row.type === 'available' && row.value === '2') availableCount++;
            if (row.type === 'available' && row.value === '3') leaveCount++;
            if (row.type === 'activity' && ['3', '4', '5', '6', '7', '8'].includes(row.value)) assignedCount++;
        });

        res.json({
            success: true,
            expertId,
            monthKey,
            patterns: [monthPattern1, monthPattern2],
            totalRows: rawData.length,
            summary: {
                availableSlots: availableCount,
                assignedSlots: assignedCount,
                leaveSlots: leaveCount,
                availableDays: availableCount / 2,
                assignedDays: assignedCount / 2,
                leaveDays: leaveCount / 2
            },
            rawData: rawData.slice(0, 100) // Limiter à 100 lignes
        });
    } catch (error) {
        console.error('Erreur diagnostic reporting:', error);
        res.status(500).json({ error: error.message });
    }
});

// Routes d'export Excel
router.get('/export/resources', requireAuth, (req, res) => {
    database.all('SELECT * FROM resources ORDER BY nom, prenom', (err, resources) => {
        if (err) {
            console.error('Erreur export resources:', err);
            return res.status(500).json({ error: err.message });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Générer CSV
        let csv = '\ufeff'; // BOM UTF-8
        csv += 'ID,Nom,Prénom,Trigramme,Email,Téléphone,Taux MAD (%),SAMU,Début MAD,Fin MAD,Actif,Date création\n';

        resources.forEach(r => {
            csv += `${r.id},"${r.nom}","${r.prenom}","${r.trigramme}","${r.email || ''}","${r.telephone || ''}",${r.taux},"${r.samu}","${r.date_debut || ''}","${r.date_fin || ''}",${r.actif ? 'Oui' : 'Non'},"${r.created_at}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=resources_${timestamp}.csv`);

        logUserAction(req, 'Export ressources Excel', { count: resources.length });
        res.send(csv);
    });
});

router.get('/export/gantt', requireAuth, (req, res) => {
    const { year, month, filename } = req.query;

    if (!year || month === undefined) {
        return res.status(400).json({ error: 'Année et mois requis' });
    }

    const monthInt = parseInt(month);

    database.all('SELECT * FROM resources WHERE actif = 1 ORDER BY nom, prenom', (err, resources) => {
        if (err) {
            console.error('Erreur export gantt:', err);
            return res.status(500).json({ error: err.message });
        }

        database.all('SELECT * FROM schedule_data', (err2, scheduleData) => {
            if (err2) {
                console.error('Erreur export schedule:', err2);
                return res.status(500).json({ error: err2.message });
            }

            const monthNames = [
                'Janvier',
                'Février',
                'Mars',
                'Avril',
                'Mai',
                'Juin',
                'Juillet',
                'Août',
                'Septembre',
                'Octobre',
                'Novembre',
                'Décembre'
            ];

            // Format du mois pour la clé de date (avec zéro devant si nécessaire)
            const monthStr = String(monthInt + 1).padStart(2, '0');

            // Générer CSV
            let csv = '\ufeff'; // BOM UTF-8
            csv += `Planning - ${monthNames[monthInt]} ${year}\n\n`;

            // En-tête
            csv += 'Ressource,Trigramme,SAMU';

            const lastDay = new Date(parseInt(year), monthInt + 1, 0).getDate();
            for (let day = 1; day <= lastDay; day++) {
                const date = new Date(parseInt(year), monthInt, day);
                const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()];
                csv += `,${dayName} ${day} AM,${dayName} ${day} PM`;
            }
            csv += '\n';

            // Données par ressource
            resources.forEach(resource => {
                csv += `"${resource.nom} ${resource.prenom}","${resource.trigramme}","${resource.samu}"`;

                for (let day = 1; day <= lastDay; day++) {
                    const dayStr = String(day).padStart(2, '0');
                    const dateKeyBase = `${year}-${monthStr}-${dayStr}`;

                    // AM
                    const dateKeyAM = `${dateKeyBase}_AM`;
                    const availAM = scheduleData.find(
                        s => s.resource_id === resource.id && s.date_key === dateKeyAM && s.type === 'available'
                    );
                    const actAM = scheduleData.find(
                        s => s.resource_id === resource.id && s.date_key === dateKeyAM && s.type === 'activity'
                    );
                    const locAM = scheduleData.find(
                        s => s.resource_id === resource.id && s.date_key === dateKeyAM && s.type === 'localisation'
                    );

                    // PM
                    const dateKeyPM = `${dateKeyBase}_PM`;
                    const availPM = scheduleData.find(
                        s => s.resource_id === resource.id && s.date_key === dateKeyPM && s.type === 'available'
                    );
                    const actPM = scheduleData.find(
                        s => s.resource_id === resource.id && s.date_key === dateKeyPM && s.type === 'activity'
                    );
                    const locPM = scheduleData.find(
                        s => s.resource_id === resource.id && s.date_key === dateKeyPM && s.type === 'localisation'
                    );

                    const availLabelAM = availAM ? (availAM.value === '1' ? 'Indispo' : 'Dispo') : '-';
                    const actLabelAM = actAM ? getActivityLabel(actAM.value) : '-';
                    const locLabelAM = locAM ? locAM.value : '-';

                    const availLabelPM = availPM ? (availPM.value === '1' ? 'Indispo' : 'Dispo') : '-';
                    const actLabelPM = actPM ? getActivityLabel(actPM.value) : '-';
                    const locLabelPM = locPM ? locPM.value : '-';

                    csv += `,"${availLabelAM} / ${actLabelAM} / ${locLabelAM}","${availLabelPM} / ${actLabelPM} / ${locLabelPM}"`;
                }

                csv += '\n';
            });

            // Utiliser le nom de fichier personnalisé si fourni, sinon générer un nom par défaut
            const finalFilename = filename || `planning_${monthNames[monthInt]}_${year}.csv`;

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);

            logUserAction(req, 'Export planning CSV', {
                year,
                month: monthNames[monthInt],
                resources: resources.length
            });
            res.send(csv);
        });
    });
});

// Reporting HNO/Astreintes
router.post('/reporting/hno-astreintes', requireAuth, (req, res) => {
    const { startMonth, startYear, endMonth, endYear, expertIds, showHno, showAstreintes } = req.body;

    // Récupérer les ressources sélectionnées avec leurs user_id
    database.all(
        `
        SELECT r.id as resource_id, r.nom, r.prenom, u.id as user_id
        FROM resources r
        LEFT JOIN users u ON u.resource_id = r.id
        WHERE r.id IN (${expertIds.map(() => '?').join(',')})
        ORDER BY r.nom, r.prenom
    `,
        expertIds,
        (err, experts) => {
            if (err) {
                console.error('Erreur récupération experts:', err);
                return res.status(500).json({ error: err.message });
            }

            // Récupérer toutes les astreintes/HNO pour ces experts dans la période
            const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;
            const endDate = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-31`;

            const userIds = experts.map(e => e.user_id).filter(id => id != null);

            if (userIds.length === 0) {
                // Aucun expert n'a de compte utilisateur associé
                return res.json({
                    experts: experts.map(e => ({
                        resource_id: e.resource_id,
                        nom: e.nom,
                        prenom: e.prenom,
                        monthlyData: {}
                    }))
                });
            }

            database.all(
                `
            SELECT a.*, u.resource_id
            FROM astreintes_hno a
            JOIN users u ON a.user_id = u.id
            WHERE a.user_id IN (${userIds.map(() => '?').join(',')})
            AND a.date_debut <= ?
            AND a.date_fin >= ?
        `,
                [...userIds, endDate, startDate],
                (err, astreintes) => {
                    if (err) {
                        console.error('Erreur récupération astreintes:', err);
                        return res.status(500).json({ error: err.message });
                    }

                    // Calculer les données par expert et par mois
                    const result = {
                        experts: experts.map(expert => {
                            const monthlyData = {};

                            // Pour chaque mois de la période
                            let currentDate = new Date(startYear, startMonth, 1);
                            const endPeriod = new Date(endYear, endMonth + 1, 0);

                            while (currentDate <= endPeriod) {
                                const month = currentDate.getMonth();
                                const year = currentDate.getFullYear();
                                const key = `${year}-${month}`;

                                monthlyData[key] = { hno: 0, astreintes: 0 };

                                // Compter les astreintes/HNO pour cet expert ce mois
                                astreintes.forEach(a => {
                                    if (a.resource_id !== expert.resource_id) return;

                                    const aStart = new Date(a.date_debut);
                                    const aEnd = new Date(a.date_fin);
                                    const monthStart = new Date(year, month, 1);
                                    const monthEnd = new Date(year, month + 1, 0);

                                    // Vérifier si l'astreinte chevauche ce mois
                                    if (aStart <= monthEnd && aEnd >= monthStart) {
                                        // Compter le nombre de jours dans ce mois
                                        const overlapStart = aStart > monthStart ? aStart : monthStart;
                                        const overlapEnd = aEnd < monthEnd ? aEnd : monthEnd;
                                        const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;

                                        if (a.type === 'hno') {
                                            monthlyData[key].hno += days;
                                        } else if (a.type === 'astreinte') {
                                            monthlyData[key].astreintes += days;
                                        }
                                    }
                                });

                                currentDate.setMonth(currentDate.getMonth() + 1);
                            }

                            return {
                                resource_id: expert.resource_id,
                                nom: expert.nom,
                                prenom: expert.prenom,
                                monthlyData
                            };
                        })
                    };

                    res.json(result);
                }
            );
        }
    );
});

// ── Reporting carte événements géolocalisés ──
router.get('/reporting/events-map', requireAuth, async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        let sql = `
            SELECT ce.id, ce.label, ce.start_date, ce.end_date, ce.period, ce.created_by, ce.config,
                   l.id as location_id, l.libelle_long, l.libelle_court, l.adresse,
                   l.latitude, l.longitude,
                   u.nom as creator_nom, u.prenom as creator_prenom,
                   et.label_long AS type_long, et.label_short AS type_short, et.icon AS type_icon, et.is_other AS type_other
            FROM custom_events ce
            LEFT JOIN locations l ON ce.location_id = l.id
            LEFT JOIN users u ON ce.created_by = u.id
            LEFT JOIN event_types et ON ce.type_id = et.id
            WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
        `;
        const params = [];
        if (startDate) {
            sql += ` AND ce.end_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            sql += ` AND ce.start_date <= ?`;
            params.push(endDate);
        }
        sql += ` ORDER BY ce.start_date`;

        const events = await new Promise((resolve, reject) => {
            database.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });

        // Charger les participants pour chaque événement
        if (events.length > 0) {
            const ids = events.map(e => e.id);
            const participants = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT cep.event_id, u.nom, u.prenom
                     FROM custom_event_participants cep
                     JOIN users u ON cep.user_id = u.id
                     WHERE cep.event_id IN (${ids.map(() => '?').join(',')})`,
                    ids,
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });
            const byEvent = {};
            participants.forEach(p => {
                if (!byEvent[p.event_id]) byEvent[p.event_id] = [];
                byEvent[p.event_id].push(`${p.prenom} ${(p.nom || '').toUpperCase()}`.trim());
            });
            events.forEach(e => {
                e.participants = byEvent[e.id] || [];
            });
        }

        res.json({ events });
    } catch (error) {
        console.error('Erreur reporting events-map:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
