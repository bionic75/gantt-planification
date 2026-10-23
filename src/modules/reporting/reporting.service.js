// Reporting : libellés des activités
// Code repris à l'identique de server.js (phase 1) ; découpage contrôleurs / services en phase 2.

export function getActivityLabel(value) {
    const labels = {
        1: 'Indisponible',
        2: 'En attente',
        3: 'SAMU Dép.',
        4: 'SAMU Dev.',
        5: 'ANS Dép.',
        6: 'ANS Dev.',
        7: 'Qualification',
        8: 'Divers'
    };
    return labels[value] || '-';
}
