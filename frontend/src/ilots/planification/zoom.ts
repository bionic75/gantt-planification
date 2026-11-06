// Zoom de la grille : feuille de style calculée selon le niveau (80 à 140 %, pas de 10), valeurs de l'ancien écran
// (environ 12 jours visibles à 100 %)

export const ZOOM = { min: 80, max: 140, pas: 10 };

export function styleZoom(niveau: number): string {
    const f = niveau / 100;
    const r = (v: number) => Math.round(v * f);
    const cellule = r(45);
    const ressource = r(180);
    const libelle = r(100);
    const police = Math.max(7, r(10));
    return `
#ganttWrapper .gantt-table .day-header {
    min-width: ${cellule}px !important;
    max-width: ${cellule}px !important;
    width: ${cellule}px !important;
    font-size: ${Math.max(8, r(10))}px !important;
    padding: ${Math.max(2, r(4))}px !important;
}
#ganttWrapper .gantt-table .day-name-header {
    font-size: ${Math.max(10, r(14))}px !important;
    line-height: 1.25 !important;
}
#ganttWrapper .gantt-table .day-name-header .gd-num {
    font-size: ${Math.max(12, r(18))}px !important;
}
#ganttWrapper .gantt-table .gantt-cell {
    min-width: ${cellule}px !important;
    max-width: ${cellule}px !important;
    width: ${cellule}px !important;
    height: ${r(85)}px !important;
}
#ganttWrapper .gantt-table .school-holidays-row td:not(.resource-header):not(.resource-label) {
    min-width: ${cellule}px !important;
    max-width: ${cellule}px !important;
    width: ${cellule}px !important;
}
#ganttWrapper .gantt-table .resource-header {
    min-width: ${ressource}px !important;
    max-width: ${ressource}px !important;
    width: ${ressource}px !important;
}
#ganttWrapper .gantt-table .resource-label {
    min-width: ${libelle}px !important;
    max-width: ${libelle}px !important;
    width: ${libelle}px !important;
    left: ${ressource}px !important;
    font-size: ${Math.max(9, r(11))}px !important;
}
#ganttWrapper .gantt-table .total-sublabel {
    left: ${ressource}px !important;
    min-width: ${libelle}px !important;
    max-width: ${libelle}px !important;
    width: ${libelle}px !important;
}
#ganttWrapper .gantt-table .total-label {
    min-width: ${ressource}px !important;
    max-width: ${ressource}px !important;
    width: ${ressource}px !important;
}
#ganttWrapper .gantt-cell-row {
    font-size: ${police}px !important;
    min-height: ${Math.max(16, r(26))}px !important;
}
#ganttWrapper .gantt-cell-content > div:nth-child(3),
#ganttWrapper .gantt-cell-row:last-child {
    font-size: ${Math.max(6, r(8))}px !important;
    line-height: 1.1 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
#ganttWrapper .gantt-table .school-holidays-row span {
    font-size: ${Math.max(5, r(7))}px !important;
    padding: ${Math.max(0, r(1))}px ${Math.max(1, r(2))}px !important;
    border-radius: ${Math.max(2, r(4))}px !important;
    line-height: 1.1 !important;
    max-width: ${cellule - 4}px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: normal !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
}
#ganttWrapper .gantt-table tbody td.resource-header > div {
    font-size: ${Math.max(9, r(11))}px !important;
}
#ganttWrapper .gantt-table tbody td.resource-header strong {
    font-size: ${Math.max(10, r(12))}px !important;
}
#ganttWrapper .gantt-table tbody td.resource-header small {
    font-size: ${Math.max(8, r(10))}px !important;
}
#ganttWrapper .gantt-table tbody td.resource-header img,
#ganttWrapper .gantt-table tbody td.resource-header > div > div > div:first-child {
    width: ${r(38)}px !important;
    height: ${r(38)}px !important;
}
#ganttWrapper .gantt-table tbody td.resource-header button {
    padding: ${Math.max(2, r(4))}px ${Math.max(4, r(8))}px !important;
    font-size: ${Math.max(8, r(10))}px !important;
}
#ganttWrapper .gantt-table .total-cell {
    min-width: ${cellule}px !important;
    max-width: ${cellule}px !important;
    width: ${cellule}px !important;
    font-size: ${police}px !important;
    padding: ${Math.max(4, r(8))}px !important;
}
`;
}
