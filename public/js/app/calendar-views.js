// Application principale : calendar-views
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Vue calendrier mensuel et calendrier des congés et événements : îlot Vue (frontend/src/ilots/consultation)
// ========== NOTIFICATIONS NOUVELLES AFFECTATIONS v12.0 ==========

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

async function openNewAssignmentsModal() {
    try {
        const response = await fetch(`${API_URL}/notifications/list`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            console.log('🔍 Notifications reçues:', data);

            // Marquer les notifications comme lues dès l'ouverture de la modal
            await markNotificationsAsRead();

            const content = document.getElementById('newAssignmentsContent');

            if (data.notifications.length === 0) {
                content.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Aucune nouvelle affectation</p>';
            } else {
                let html = '<table style="width: 100%; border-collapse: collapse;">';
                html += `<thead>
                            <tr style="background-color: #34495e; color: white;">
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Date</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Période</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Affectation</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Localisation</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Auteur</th>
                            </tr>
                        </thead><tbody>`;

                data.notifications.forEach(notif => {
                    // Parser la date correctement (format YYYY-MM-DD)
                    const [year, month, day] = notif.date.split('-').map(Number);
                    const notifDate = new Date(year, month - 1, day);

                    // Afficher la localisation si disponible
                    const localisationDisplay = notif.localisation || '-';

                    html += `<tr style="background-color: white;">
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notifDate.toLocaleDateString('fr-FR')}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notif.period}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notif.activity_name || 'Non défini'}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${localisationDisplay}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notif.requester_name || 'Système'}</td>
                            </tr>`;
                });

                html += '</tbody></table>';
                content.innerHTML = html;
            }

            document.getElementById('newAssignmentsModal').classList.add('active');

            // Marquer les notifications comme lues
            await markNotificationsAsRead();
        }
    } catch (error) {
        console.error('Erreur ouverture modal notifications:', error);
    }
}

async function markNotificationsAsRead() {
    try {
        const response = await fetch(`${API_URL}/notifications/mark-read`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            console.log('✅ Notifications marquées comme lues');
        }
    } catch (error) {
        console.error('Erreur marquage notifications:', error);
    }
}

function closeNewAssignmentsModal() {
    document.getElementById('newAssignmentsModal').classList.remove('active');
    // Recharger le badge pour refléter qu'il n'y a plus de notifications
    loadNewAssignments();
}
