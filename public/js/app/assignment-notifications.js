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
