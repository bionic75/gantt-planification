// Application principale : planning-navigation
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== ZOOM DU PLANNING ==========

let currentZoomLevel = 100; // Niveau de zoom en pourcentage
const minZoom = 80;
const maxZoom = 140;
const zoomStep = 10;

function zoomPlanning(direction) {
    // Calculer le nouveau niveau de zoom
    const newZoom = currentZoomLevel + direction * zoomStep;

    // Vérifier les limites
    if (newZoom < minZoom || newZoom > maxZoom) {
        return;
    }

    currentZoomLevel = newZoom;
    applyZoom();
}

function resetZoomPlanning() {
    currentZoomLevel = 100;
    applyZoom();
}

function applyZoom() {
    const ganttWrapper = document.getElementById('ganttWrapper');
    const ganttSection = document.getElementById('ganttDisplaySection');
    if (!ganttWrapper || !ganttSection) return;

    // Créer ou mettre à jour la feuille de style dynamique pour le zoom
    let zoomStyle = document.getElementById('ganttZoomStyle');
    if (!zoomStyle) {
        zoomStyle = document.createElement('style');
        zoomStyle.id = 'ganttZoomStyle';
        document.head.appendChild(zoomStyle);
    }

    // Valeurs de base calibrées pour afficher ~12 jours à 100%
    // 80% -> ~16 jours, 90% -> ~14 jours, 100% -> ~12 jours, 110% -> ~10 jours, 120% -> ~8 jours
    const baseCellWidth = 45; // Largeur de base pour ~12 jours à 100%
    const baseResourceWidth = 180;
    const baseLabelWidth = 100;

    const zoomFactor = currentZoomLevel / 100;

    const newCellWidth = Math.round(baseCellWidth * zoomFactor);
    const newResourceWidth = Math.round(baseResourceWidth * zoomFactor);
    const newLabelWidth = Math.round(baseLabelWidth * zoomFactor);
    const newFontSize = Math.max(8, Math.round(11 * zoomFactor));
    const newCellFontSize = Math.max(7, Math.round(10 * zoomFactor));

    // Toujours appliquer le style (même à 100%) pour avoir un comportement cohérent
    zoomStyle.textContent = `
                /* ===== ZOOM: Colonnes des jours (AM/PM) ===== */
                #ganttWrapper .gantt-table .day-header {
                    min-width: ${newCellWidth}px !important;
                    max-width: ${newCellWidth}px !important;
                    width: ${newCellWidth}px !important;
                    font-size: ${Math.max(8, Math.round(10 * zoomFactor))}px !important;
                    padding: ${Math.max(2, Math.round(4 * zoomFactor))}px !important;
                }
                
                #ganttWrapper .gantt-table .day-name-header {
                    font-size: ${Math.max(10, Math.round(14 * zoomFactor))}px !important;
                    line-height: 1.25 !important;
                }
                #ganttWrapper .gantt-table .day-name-header .gd-num {
                    font-size: ${Math.max(12, Math.round(18 * zoomFactor))}px !important;
                }
                
                #ganttWrapper .gantt-table .gantt-cell {
                    min-width: ${newCellWidth}px !important;
                    max-width: ${newCellWidth}px !important;
                    width: ${newCellWidth}px !important;
                    height: ${Math.round(85 * zoomFactor)}px !important;
                }
                
                /* Cellules des congés scolaires */
                #ganttWrapper .gantt-table .school-holidays-row td:not(.resource-header):not(.resource-label) {
                    min-width: ${newCellWidth}px !important;
                    max-width: ${newCellWidth}px !important;
                    width: ${newCellWidth}px !important;
                }
                
                /* ===== ZOOM: Colonne Ressource (sticky) ===== */
                #ganttWrapper .gantt-table .resource-header {
                    min-width: ${newResourceWidth}px !important;
                    max-width: ${newResourceWidth}px !important;
                    width: ${newResourceWidth}px !important;
                }
                
                /* ===== ZOOM: Colonne Labels (sticky) ===== */
                #ganttWrapper .gantt-table .resource-label {
                    min-width: ${newLabelWidth}px !important;
                    max-width: ${newLabelWidth}px !important;
                    width: ${newLabelWidth}px !important;
                    left: ${newResourceWidth}px !important;
                    font-size: ${Math.max(9, Math.round(11 * zoomFactor))}px !important;
                }
                
                /* Ajuster aussi total-sublabel */
                #ganttWrapper .gantt-table .total-sublabel {
                    left: ${newResourceWidth}px !important;
                    min-width: ${newLabelWidth}px !important;
                    max-width: ${newLabelWidth}px !important;
                    width: ${newLabelWidth}px !important;
                }
                
                #ganttWrapper .gantt-table .total-label {
                    min-width: ${newResourceWidth}px !important;
                    max-width: ${newResourceWidth}px !important;
                    width: ${newResourceWidth}px !important;
                }
                
                /* ===== ZOOM: Contenu des cellules ===== */
                #ganttWrapper .gantt-cell-row {
                    font-size: ${newCellFontSize}px !important;
                    min-height: ${Math.max(16, Math.round(26 * zoomFactor))}px !important;
                }
                
                /* ===== ZOOM: Localisation (3ème ligne des cellules) ===== */
                #ganttWrapper .gantt-cell-content > div:nth-child(3),
                #ganttWrapper .gantt-cell-row:last-child {
                    font-size: ${Math.max(6, Math.round(8 * zoomFactor))}px !important;
                    line-height: 1.1 !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                }
                
                /* ===== ZOOM: Cartouches événements ===== */
                #ganttWrapper .gantt-table .school-holidays-row span {
                    font-size: ${Math.max(5, Math.round(7 * zoomFactor))}px !important;
                    padding: ${Math.max(0, Math.round(1 * zoomFactor))}px ${Math.max(1, Math.round(2 * zoomFactor))}px !important;
                    border-radius: ${Math.max(2, Math.round(4 * zoomFactor))}px !important;
                    line-height: 1.1 !important;
                    max-width: ${newCellWidth - 4}px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: normal !important;
                    display: -webkit-box !important;
                    -webkit-line-clamp: 2 !important;
                    -webkit-box-orient: vertical !important;
                }
                
                /* ===== ZOOM: Info ressource ===== */
                #ganttWrapper .gantt-table tbody td.resource-header > div {
                    font-size: ${Math.max(9, Math.round(11 * zoomFactor))}px !important;
                }
                
                #ganttWrapper .gantt-table tbody td.resource-header strong {
                    font-size: ${Math.max(10, Math.round(12 * zoomFactor))}px !important;
                }
                
                #ganttWrapper .gantt-table tbody td.resource-header small {
                    font-size: ${Math.max(8, Math.round(10 * zoomFactor))}px !important;
                }
                
                #ganttWrapper .gantt-table tbody td.resource-header img,
                #ganttWrapper .gantt-table tbody td.resource-header > div > div > div:first-child {
                    width: ${Math.round(38 * zoomFactor)}px !important;
                    height: ${Math.round(38 * zoomFactor)}px !important;
                }
                
                #ganttWrapper .gantt-table tbody td.resource-header button {
                    padding: ${Math.max(2, Math.round(4 * zoomFactor))}px ${Math.max(4, Math.round(8 * zoomFactor))}px !important;
                    font-size: ${Math.max(8, Math.round(10 * zoomFactor))}px !important;
                }
                
                /* ===== ZOOM: Ligne totaux ===== */
                #ganttWrapper .gantt-table .total-cell {
                    min-width: ${newCellWidth}px !important;
                    max-width: ${newCellWidth}px !important;
                    width: ${newCellWidth}px !important;
                    font-size: ${newCellFontSize}px !important;
                    padding: ${Math.max(4, Math.round(8 * zoomFactor))}px !important;
                }
            `;

    // Mettre à jour l'affichage du niveau de zoom
    const zoomDisplay = document.getElementById('zoomLevelDisplay');
    if (zoomDisplay) {
        zoomDisplay.textContent = `${currentZoomLevel}%`;
    }
}

// Appliquer le zoom au chargement de la page pour avoir le bon affichage initial
document.addEventListener('DOMContentLoaded', function () {
    // Attendre un peu que le tableau soit rendu
    setTimeout(applyZoom, 500);
});

// ========== NAVIGATION MOIS PRÉCÉDENT/SUIVANT ==========

function navigateMonth(direction) {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');

    let currentYear = parseInt(yearSelect.value);
    let currentMonth = parseInt(monthSelect.value);

    // Ajouter la direction (-1 pour mois précédent, +1 pour mois suivant)
    currentMonth += direction;

    // Gérer les changements d'année
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }

    // Mettre à jour les selects
    yearSelect.value = currentYear;
    monthSelect.value = currentMonth;

    // Rafraîchir le planning
    updateGantt();
}

// ========== NOTIFICATIONS EXPERTS ==========

let notificationCheckInterval = null;

function checkNotifications() {
    if (!currentUser || currentUser.activeProfile !== 'expert') {
        console.log('❌ Pas un expert ou pas connecté');
        return;
    }

    console.log('🔔 Vérification des notifications...');

    fetch('/api/notifications/count')
        .then(response => response.json())
        .then(data => {
            console.log('📊 Nombre de notifications:', data.count);
            const badge = document.getElementById('notificationBadge');
            const countSpan = document.getElementById('notificationCount');

            if (!badge) {
                console.error('❌ Badge non trouvé dans le DOM');
                return;
            }

            // Mettre à jour le compteur
            countSpan.textContent = data.count;

            if (data.count > 0) {
                // Afficher en rouge si notifications
                badge.style.display = 'flex';
                badge.style.backgroundColor = '#e74c3c';
                badge.style.color = 'white';
                console.log('🔴 Badge affiché en rouge avec', data.count, 'notifications');
            } else {
                // Cacher si pas de notifications
                badge.style.display = 'none';
                console.log('⚪ Badge caché, pas de notifications');
            }
        })
        .catch(error => {
            console.error('Erreur vérification notifications:', error);
        });
}

function openNotificationsModal() {
    fetch('/api/notifications/list')
        .then(response => response.json())
        .then(data => {
            const listDiv = document.getElementById('notificationsList');

            if (data.notifications.length === 0) {
                listDiv.innerHTML =
                    '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Aucune nouvelle notification</p>';
            } else {
                let html = '<table style="width: 100%; border-collapse: collapse;">';
                html += '<thead><tr style="background-color: #34495e; color: white;">';
                html += '<th style="padding: 10px; text-align: left;">Date</th>';
                html += '<th style="padding: 10px; text-align: left;">Période</th>';
                html += '<th style="padding: 10px; text-align: left;">Affectation</th>';
                html += '<th style="padding: 10px; text-align: left;">Demandeur</th>';
                html += '</tr></thead><tbody>';

                data.notifications.forEach(notif => {
                    // Parser correctement la date au format YYYY-MM-DD
                    const dateParts = notif.date.split('-');
                    const dateObj = new Date(
                        parseInt(dateParts[0]),
                        parseInt(dateParts[1]) - 1,
                        parseInt(dateParts[2])
                    );
                    const date = dateObj.toLocaleDateString('fr-FR');
                    html += '<tr style="border-bottom: 1px solid #ecf0f1;">';
                    html += `<td style="padding: 10px;">${date}</td>`;
                    html += `<td style="padding: 10px;">${notif.period}</td>`;
                    html += `<td style="padding: 10px;"><strong>${notif.activity_name}</strong></td>`;
                    html += `<td style="padding: 10px;">${notif.requester_name}</td>`;
                    html += '</tr>';
                });

                html += '</tbody></table>';
                listDiv.innerHTML = html;
            }

            document.getElementById('notificationsModal').style.display = 'block';

            // Marquer comme lues après un court délai pour laisser l'utilisateur voir
            markNotificationsAsRead();
        })
        .catch(error => {
            console.error('Erreur chargement notifications:', error);
        });
}

function closeNotificationsModal() {
    document.getElementById('notificationsModal').style.display = 'none';
}
