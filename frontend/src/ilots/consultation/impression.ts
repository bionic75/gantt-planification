// Impression des calendriers de consultation : fenêtre dédiée (paysage) reprenant le contenu affiché, avec la feuille
// de style des calendriers
import { ecrireDocument } from '@/outils/styles-en-ligne';
import styleCalendriers from './calendriers.css?raw';

const echapper = (texte: string) =>
    texte.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Vue calendrier mensuel : titre de la fenêtre, mois affiché en sous-titre, contenu affiché (navigation, mois, grille,
 * légende). L'impression est demandée une seule fois : au chargement de la page d'impression ou, à défaut, après
 * 500 ms.
 */
export function imprimerCalendrierMensuel(titre: string, sousTitre: string, contenu: HTMLElement): void {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return;
    ecrireDocument(
        fenetre.document,
        `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${echapper(titre)}</title>
                    <style>
                        ${styleCalendriers}
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            margin: 20px;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .gp-impression-mois {
                            text-align: center;
                            color: #1565c0;
                            margin-bottom: 10px;
                        }
                        h3 {
                            color: #1565c0;
                            border-left: 4px solid #1565c0;
                            padding-left: 10px;
                            margin-bottom: 20px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            table-layout: fixed;
                        }
                        th, td {
                            border: 1px solid #bdc3c7;
                            padding: 5px;
                            vertical-align: top;
                        }
                        @media print {
                            body {
                                margin: 10px;
                            }
                            @page {
                                size: landscape;
                                margin: 10mm;
                            }
                        }
                    </style>
                </head>
                <body>
                    <h3>| ${echapper(titre)}</h3>
                    <h2 class="gp-impression-mois">${echapper(sousTitre)}</h2>
                    ${contenu.innerHTML}
                </body>
                </html>
            `
    );
    let imprime = false;
    const imprimer = () => {
        if (imprime) return;
        imprime = true;
        fenetre.print();
    };
    fenetre.onload = imprimer;
    setTimeout(imprimer, 500);
}

/** Logo de l'impression : calendrier stylisé (reliures, bandeau, grille de jours, jour marqué) */
const LOGO_CALENDRIER = `<svg class="gp-logo" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
    <rect x="6" y="10" width="52" height="48" rx="8" fill="#ffffff" stroke="#00838f" stroke-width="3"/>
    <path d="M6 18a8 8 0 0 1 8-8h36a8 8 0 0 1 8 8v8H6z" fill="#00bcd4" stroke="#00838f" stroke-width="3" stroke-linejoin="round"/>
    <rect x="18" y="4" width="6" height="14" rx="3" fill="#ffffff" stroke="#00838f" stroke-width="2.5"/>
    <rect x="40" y="4" width="6" height="14" rx="3" fill="#ffffff" stroke="#00838f" stroke-width="2.5"/>
    <g fill="#90a4ae">
        <rect x="13" y="32" width="6" height="5" rx="1.2"/><rect x="23" y="32" width="6" height="5" rx="1.2"/>
        <rect x="33" y="32" width="6" height="5" rx="1.2"/><rect x="43" y="32" width="6" height="5" rx="1.2"/>
        <rect x="13" y="42" width="6" height="5" rx="1.2"/><rect x="23" y="42" width="6" height="5" rx="1.2"/>
        <rect x="43" y="42" width="6" height="5" rx="1.2"/>
    </g>
    <rect x="31" y="40" width="10" height="9" rx="2" fill="#ffc107" stroke="#f57f17" stroke-width="2"/>
</svg>`;

/** Feuille A4 paysage (marges de 8 mm) : zone imprimable de 281 × 194 mm */
const LARGEUR_FEUILLE_MM = 281;
const HAUTEUR_FEUILLE_MM = 194;

const STYLE_IMPRESSION_EVENEMENTS = `
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, sans-serif; }
    #feuille {
        width: ${LARGEUR_FEUILLE_MM}mm;
        height: ${HAUTEUR_FEUILLE_MM}mm;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    .gp-impr-entete { display: flex; align-items: center; justify-content: center; gap: 12px; flex: none; }
    .gp-impr-entete h1 { margin: 0; font-size: 22px; color: #00838f; }
    .gp-impr-mois { color: #2c3e50; font-weight: normal; }
    .gp-logo { flex: none; width: 46px; height: 46px; }
    .gp-impr-legende {
        flex: none; display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
        gap: 4px 10px; margin: 4px 0 6px; padding: 3px 8px; background: #f5f5f5; border-radius: 6px; font-size: 9px;
    }
    .gp-calendrier-evenements__legende-zone { display: inline-flex; align-items: center; gap: 4px; }
    .gp-calendrier-evenements__barre { display: inline-block; width: 18px; height: 4px; }
    .gp-calendrier-evenements__ferie { display: inline-block; width: 14px; height: 10px; background: #ffeb3b; border: 1px solid #fbc02d; border-radius: 2px; }
    .gp-calendrier-evenements__separateur { display: inline-block; width: 1px; height: 12px; background: #ccc; }
    .gp-ce-type { padding: 1px 6px; border-radius: 7px; font-size: 8px; font-weight: bold; border: 1px solid #000; }
    .gp-ce-type--formation { background-color: #ffea00; color: #0008ff; }
    .gp-ce-type--mes { background-color: #ffea00; color: #d20906; }
    .gp-ce-type--apd { background-color: #ffea00; color: #c2059a; }
    .gp-ce-type--visite { background-color: #0011ff; color: #ffffff; }
    .gp-ce-type--congres { background-color: #dff0d8; color: #427645; }
    #tableau { flex: 1 1 auto; min-height: 0; overflow: hidden; }
    #tableau .gp-ce-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
    #tableau .gp-ce-table th { padding: 4px; font-size: 10px; background-clip: padding-box; }
    #tableau .gp-ce-table th.gp-ce-sem, #tableau .gp-ce-table th.gp-ce-jour-nom { padding: 4px; }
    #tableau .gp-ce-table td.gp-ce-jour, #tableau .gp-ce-table td.gp-ce-vide { padding: 3px; overflow: hidden; }
    #tableau .gp-ce-table td.gp-ce-sem { padding: 2px; font-size: 9px; }
    #tableau .gp-ce-numero { font-size: 11px; margin-bottom: 2px; }
    #tableau .gp-ce-zones { margin-bottom: 2px; }
    #tableau .gp-ce-evenements { gap: 1px; }
    #tableau .gp-ce-evenement { font-size: 8px; padding: 1px 3px; cursor: default; }
`;

/**
 * Impression sur une seule page A4 : si le contenu du mois dépasse la zone du tableau (mois à 6 semaines, jours très
 * chargés), le tableau est réduit (échelle) jusqu'à tenir. Sans effet hors d'un vrai document (tests).
 */
export function ajusterUnePage(doc: Document): void {
    const zone = doc.getElementById?.('tableau');
    const table = zone?.querySelector<HTMLElement>('table');
    if (!zone || !table) return;
    const disponible = zone.clientHeight;
    // Hauteur naturelle du contenu (sans étirement du tableau sur la zone)
    table.style.height = 'auto';
    const naturelle = table.offsetHeight;
    if (disponible > 0 && naturelle > disponible) {
        const zoom = Math.max(0.3, (disponible - 1) / naturelle);
        table.style.transformOrigin = 'top left';
        table.style.transform = `scale(${zoom})`;
        table.style.width = `${100 / zoom}%`;
        table.style.height = `${disponible / zoom}px`;
    } else {
        table.style.height = '100%';
    }
}

/** Calendrier des congés et événements : une seule page A4 paysage, avec légende ; fenêtre fermée après l'impression */
export function imprimerCalendrierEvenements(mois: string, contenu: HTMLElement, legende?: HTMLElement | null): void {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return;
    ecrireDocument(
        fenetre.document,
        `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Calendrier des événements - ${echapper(mois)}</title>
                    <style>
                        ${styleCalendriers}
                        ${STYLE_IMPRESSION_EVENEMENTS}
                    </style>
                </head>
                <body>
                    <div id="feuille">
                        <div class="gp-impr-entete">
                            ${LOGO_CALENDRIER}
                            <h1>Calendrier des congés et événements <span class="gp-impr-mois">— ${echapper(mois)}</span></h1>
                        </div>
                        ${legende ? `<div class="gp-impr-legende">${legende.innerHTML}</div>` : ''}
                        <div id="tableau">${contenu.innerHTML}</div>
                    </div>
                </body>
                </html>
            `
    );
    fenetre.focus();
    setTimeout(() => {
        ajusterUnePage(fenetre.document);
        fenetre.print();
        fenetre.close();
    }, 500);
}
