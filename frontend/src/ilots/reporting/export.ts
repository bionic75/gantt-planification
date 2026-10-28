// Reporting : export CSV d'un tableau affiché et impression dans une nouvelle fenêtre (comme l'ancien écran)

/** Texte affiché d'une cellule (sauts de ligne compris) ; textContent hors navigateur (tests) */
const texteAffiche = (el: HTMLElement) => (typeof el.innerText === 'string' ? el.innerText : (el.textContent ?? ''));

/**
 * CSV d'un tableau (séparateur « ; », valeurs entre guillemets, BOM pour Excel)
 * @param surUneLigne sauts de ligne d'une cellule remplacés par des espaces
 */
export function csvDuTableau(tableau: HTMLTableElement, surUneLigne = false): string {
    const lignes = [...tableau.querySelectorAll('tr')].map(tr =>
        [...tr.querySelectorAll<HTMLElement>('th, td')]
            .map(cellule => {
                let texte = texteAffiche(cellule).replace(/"/g, '""');
                if (surUneLigne) texte = texte.replace(/\n/g, ' ').trim();
                return `"${texte}"`;
            })
            .join(';')
    );
    return `\uFEFF${lignes.join('\n')}`;
}

/** Téléchargement d'un fichier CSV construit dans le navigateur */
export function telechargerCsv(nomFichier: string, contenu: string) {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8;' }));
    lien.download = nomFichier;
    lien.click();
}

/** Nom de fichier daté du jour : « préfixe_AAAA-MM-JJ.csv » */
export const nomFichierDuJour = (prefixe: string) => `${prefixe}_${new Date().toISOString().slice(0, 10)}.csv`;

/**
 * Impression : nouvelle fenêtre avec titre, date de génération et contenu, au format A4 paysage
 * @param styles styles du contenu (tableaux du reporting) et de l'impression
 */
export function imprimer(titre: string, styles: string, contenuHtml: string) {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return;
    fenetre.document.write(`
                <html>
                <head>
                    <title>${titre}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        ${styles}
                        @media print {
                            @page { size: A4 landscape; margin: 10mm; }
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <h2>${titre}</h2>
                    <p>Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                    ${contenuHtml}
                </body>
                </html>
            `);
    fenetre.document.close();
    fenetre.print();
}
