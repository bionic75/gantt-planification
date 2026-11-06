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
