// Application principale : assignment-notifications
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES NOTIFICATIONS D'AFFECTATION ==========
// Fenêtres des invitations Outlook et des nouvelles affectations : îlot Vue (frontend/src/ilots/saisie)

// Affectations en attente (pendingAssignments) : relevées par la grille (îlot Vue, frontend/src/ilots/planification),
// copiées ici par l'événement gp:invitations-en-attente (core.js) ; comptées par l'enveloppe, journalisées à la
// déconnexion (saveAssignmentLogs)

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

// Déplacé de deplacements.js (lot 5.2b), tel quel
// Fonction pour sauvegarder les logs des affectations sans envoyer d'email
async function saveAssignmentLogs() {
    const expertCount = Object.keys(pendingAssignments).length;

    if (expertCount === 0) {
        console.log('⏭️ Aucune affectation en attente');
        return;
    }

    console.log(`📝 Enregistrement des logs pour ${expertCount} expert(s)`);

    // Créer les logs pour toutes les modifications
    const allModifications = [];

    for (const [resourceId, data] of Object.entries(pendingAssignments)) {
        data.assignments.forEach(assignment => {
            allModifications.push({
                resourceId: parseInt(resourceId),
                resourceName: `${data.expertPrenom} ${data.expertNom}`,
                date: assignment.date,
                period: assignment.period === 'AM' ? 'Matin' : 'Après-midi',
                activity: assignment.activity,
                location: assignment.location || '-',
                emailSent: false
            });
        });
    }

    if (allModifications.length > 0) {
        try {
            const logResponse = await fetch(`${API_URL}/logs/save-planning-modifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ modifications: allModifications })
            });

            if (logResponse.ok) {
                console.log('✅ Logs enregistrés');
            } else {
                console.error('❌ Erreur enregistrement logs:', logResponse.status);
            }
        } catch (error) {
            console.error('❌ Erreur appel API logs:', error);
        }
    }

    // Ne PAS réinitialiser pendingAssignments ici car l'utilisateur peut vouloir envoyer les emails avant
}
