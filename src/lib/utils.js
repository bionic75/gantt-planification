// Utilitaires
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.

// Formater une date en français
export function formatDateFR(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Pause utilitaire
export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
