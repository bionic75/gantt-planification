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
    ecrireDocument(fenetre.document, `
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
            `);
    let imprime = false;
    const imprimer = () => {
        if (imprime) return;
        imprime = true;
        fenetre.print();
    };
    fenetre.onload = imprimer;
    setTimeout(imprimer, 500);
}

/** Calendrier des congés et événements : grille du mois ; fenêtre fermée après l'impression */
export function imprimerCalendrierEvenements(mois: string, contenu: HTMLElement): void {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return;
    ecrireDocument(fenetre.document, `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Calendrier des événements - ${echapper(mois)}</title>
                    <style>
                        ${styleCalendriers}
                        @page { size: landscape; margin: 1cm; }
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { text-align: center; color: #00bcd4; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #bdc3c7; padding: 8px; }
                        th { background-color: #00bcd4 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        td { vertical-align: top; min-height: 80px; }
                        div { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    </style>
                </head>
                <body>
                    <h1>📆 Calendrier des congés et événements - ${echapper(mois)}</h1>
                    ${contenu.innerHTML}
                </body>
                </html>
            `);
    fenetre.focus();
    setTimeout(() => {
        fenetre.print();
        fenetre.close();
    }, 500);
}
