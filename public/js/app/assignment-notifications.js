// Application principale : assignment-notifications
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES NOTIFICATIONS D'AFFECTATION ==========
// Fenêtres des invitations Outlook et des nouvelles affectations : îlot Vue (frontend/src/ilots/saisie), qui lit
// les affectations en attente (affectationsEnAttente, core.js) et signale les envois (gp:invitations-envoyees)

// Générer un ID de session unique pour cette connexion
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Tracker une nouvelle affectation
// Compare avec l'état initial de la session pour éviter les notifications pour des retours à l'état d'origine
function trackAssignment(resourceId, dateKey, period, activity, location) {
    // Trouver l'expert associé à cette ressource
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    // Trouver l'utilisateur expert correspondant à cette ressource
    const expert = users.find(u => u.resource_id === resourceId && u.is_expert);
    if (!expert) return;

    const newActivityInt = parseInt(activity);

    // Récupérer l'état initial COMPLET (disponibilité + activité) au début de la session
    const actKey = `${resourceId}_activity_${dateKey}_${period}`;
    const availKey = `${resourceId}_available_${dateKey}_${period}`;
    const locKey = `${resourceId}_localisation_${dateKey}_${period}`;

    const initialActivity = initialScheduleState[actKey] || '1';
    const initialActivityInt = parseInt(initialActivity);
    const initialAvailability = initialScheduleState[availKey] || '1';
    const initialAvailabilityInt = parseInt(initialAvailability);
    const initialLocation = initialScheduleState[locKey] || '-';

    // Récupérer la disponibilité actuelle
    const currentAvailability = scheduleData[availKey] || '1';
    const currentAvailabilityInt = parseInt(currentAvailability);

    console.log(`📊 trackAssignment: ${dateKey} ${period}`);
    console.log(`   Initial: Dispo=${initialAvailabilityInt}, Act=${initialActivityInt}, Loc=${initialLocation}`);
    console.log(`   Actuel:  Dispo=${currentAvailabilityInt}, Act=${newActivityInt}, Loc=${location || '-'}`);

    // L'état initial avait-il une vraie affectation (>= 3) ?
    const initialHadAssignment = initialActivityInt >= 3;
    // Le nouvel état a-t-il une vraie affectation (>= 3) ?
    const newHasAssignment = newActivityInt >= 3;

    // Comparer l'état COMPLET : si on revient exactement à l'état initial
    const isBackToInitialState =
        currentAvailabilityInt === initialAvailabilityInt && newActivityInt === initialActivityInt;

    // Labels d'activités
    const activityLabelsMap = {
        3: 'SAMU (Déploiement)',
        4: 'SAMU (Dev. usages)',
        5: 'ANS (Déploiement)',
        6: 'ANS (Dev. usages)',
        7: 'Qualification',
        8: 'Divers'
    };

    const activityLabelsMapEmoji = {
        3: '📞 SAMU (Déploiement)',
        4: '📞 SAMU (Dev. usages)',
        5: '📄 ANS (Déploiement)',
        6: '👨‍🏫 ANS (Dev. usages)',
        7: '☑️ Qualification',
        8: '📖 Divers'
    };

    // CAS 1: Retour à l'état initial exact → retirer de la liste
    if (isBackToInitialState) {
        if (pendingAssignments[resourceId]) {
            const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
                a => a.date === dateKey && a.period === period
            );

            if (existingIndex >= 0) {
                pendingAssignments[resourceId].assignments.splice(existingIndex, 1);
                console.log(`↩️ Retour à l'état initial complet: ${dateKey} ${period} - Affectation retirée`);

                if (pendingAssignments[resourceId].assignments.length === 0) {
                    delete pendingAssignments[resourceId];
                    console.log(`🗑️ Expert retiré de la liste: ${resource.prenom} ${resource.nom}`);
                }

                updatePendingEmailBadge();
            }
        }
        return;
    }

    // CAS 2: L'état initial avait une affectation ET on passe à pas d'affectation → SUPPRESSION
    if (initialHadAssignment && !newHasAssignment) {
        // C'est une SUPPRESSION : on doit tracker pour envoyer un email d'annulation
        if (!pendingAssignments[resourceId]) {
            pendingAssignments[resourceId] = {
                expertId: expert.id,
                expertEmail: expert.email,
                expertNom: expert.nom,
                expertPrenom: expert.prenom,
                resourceNom: resource.nom,
                resourcePrenom: resource.prenom,
                assignments: []
            };
        }

        // Retirer toute entrée précédente pour ce créneau
        const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
            a => a.date === dateKey && a.period === period
        );
        if (existingIndex >= 0) {
            pendingAssignments[resourceId].assignments.splice(existingIndex, 1);
        }

        // Ajouter l'entrée de suppression
        pendingAssignments[resourceId].assignments.push({
            date: dateKey,
            period: period,
            activity: activityLabelsMapEmoji[String(initialActivityInt)] || 'Affectation',
            activityCode: String(initialActivityInt),
            location: initialLocation || '-',
            actionType: 'deleted',
            oldActivity: activityLabelsMap[String(initialActivityInt)] || 'Affectation',
            oldActivityCode: String(initialActivityInt),
            oldLocation: initialLocation || '-'
        });

        console.log(`🗑️ Suppression trackée: ${dateKey} ${period} - ${activityLabelsMap[String(initialActivityInt)]}`);
        updatePendingEmailBadge();
        return;
    }

    // CAS 3: Le nouvel état n'est pas une vraie affectation (< 3) ET l'initial n'en avait pas non plus
    if (!newHasAssignment && !initialHadAssignment) {
        if (pendingAssignments[resourceId]) {
            const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
                a => a.date === dateKey && a.period === period
            );

            if (existingIndex >= 0) {
                pendingAssignments[resourceId].assignments.splice(existingIndex, 1);
                console.log(`🗑️ Affectation retirée (pas d'affectation): ${dateKey} ${period}`);

                if (pendingAssignments[resourceId].assignments.length === 0) {
                    delete pendingAssignments[resourceId];
                }

                updatePendingEmailBadge();
            }
        }
        return;
    }

    // CAS 4: C'est une vraie affectation (>= 3)
    // Déterminer si c'est nouveau ou modifié
    const actionType = initialHadAssignment ? 'modified' : 'new';

    if (!pendingAssignments[resourceId]) {
        pendingAssignments[resourceId] = {
            expertId: expert.id,
            expertEmail: expert.email,
            expertNom: expert.nom,
            expertPrenom: expert.prenom,
            resourceNom: resource.nom,
            resourcePrenom: resource.prenom,
            assignments: []
        };
    }

    // Vérifier si une affectation existe déjà pour cette demi-journée
    const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
        a => a.date === dateKey && a.period === period
    );

    const newAssignment = {
        date: dateKey,
        period: period,
        activity: activityLabelsMapEmoji[activity] || activity,
        activityCode: activity,
        location: location || '-',
        actionType: actionType,
        // Infos de l'ancienne affectation (pour modifications)
        oldActivity: initialHadAssignment
            ? activityLabelsMap[String(initialActivityInt)] || String(initialActivityInt)
            : null,
        oldActivityCode: initialHadAssignment ? String(initialActivityInt) : null,
        oldLocation: initialHadAssignment ? initialLocation || '-' : null,
        isModification: initialHadAssignment
    };

    if (existingIndex >= 0) {
        pendingAssignments[resourceId].assignments[existingIndex] = newAssignment;
    } else {
        pendingAssignments[resourceId].assignments.push(newAssignment);
    }

    console.log(`➕ Affectation ajoutée: ${dateKey} ${period} - ${activityLabelsMapEmoji[activity]} (${actionType})`);

    // Mettre à jour le badge du bouton d'envoi d'email
    updatePendingEmailBadge();
}

// Mettre à jour le badge du bouton d'envoi d'email
function updatePendingEmailBadge() {
    const badge = document.getElementById('pendingEmailBadge');
    const btn = document.getElementById('sendEmailBtn');

    if (!badge || !btn) return;

    // Compter le nombre total d'affectations en attente par type
    let totalNew = 0,
        totalModified = 0,
        totalDeleted = 0;
    for (const data of Object.values(pendingAssignments)) {
        data.assignments.forEach(a => {
            if (a.actionType === 'deleted') totalDeleted++;
            else if (a.actionType === 'modified') totalModified++;
            else totalNew++;
        });
    }

    const totalAssignments = totalNew + totalModified + totalDeleted;

    if (totalAssignments > 0) {
        badge.textContent = totalAssignments;
        badge.style.display = 'flex';
        // Colorer le badge selon les types
        if (totalDeleted > 0 && totalNew === 0 && totalModified === 0) {
            badge.style.backgroundColor = '#D60B51'; // Rouge pour suppressions uniquement
        } else if (totalModified > 0 && totalNew === 0 && totalDeleted === 0) {
            badge.style.backgroundColor = '#ff9800'; // Orange pour modifications uniquement
        } else {
            badge.style.backgroundColor = '#e74c3c'; // Rouge par défaut
        }
    } else {
        badge.style.display = 'none';
    }
}

// Pastille des nouvelles affectations de l'expert (en-tête), relue toutes les 30 secondes (mfa.js)
async function loadNewAssignments() {
    console.log('🔔 Vérification des notifications...');
    try {
        const response = await fetch(`${API_URL}/notifications/count`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            console.log('📊 Notifications:', data.count);

            const badge = document.getElementById('notificationBadge');
            const count = document.getElementById('notificationCount');

            if (data.count > 0) {
                console.log('✅ Badge affiché avec count:', data.count);
                badge.style.display = 'flex';
                count.textContent = data.count;
            } else {
                console.log('⚪ Badge caché, pas de notifications');
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Erreur chargement notifications:', error);
    }
}
