// Application principale : planning-navigation
// Navigation, zoom et grille de la planification : îlot Vue (frontend/src/ilots/planification)

// Zoom de la grille remis à 100 % (mise en page réinitialisée, layout-fix.js)
function resetZoomPlanning() {
    window.dispatchEvent(new CustomEvent('gp:zoom-grille-reinitialise'));
}

// Nouvelles affectations de l'expert (pastille de l'en-tête) : îlot Vue (frontend/src/ilots/entete)
