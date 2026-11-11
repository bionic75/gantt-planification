// Colonnes d'un tableau redimensionnables (poignée à droite de chaque en-tête) et masquables (clic droit sur un
// en-tête), colonnes masquées mémorisées dans le navigateur par tableau (« col-hide:coltbl-N »). Repris de l'ancien
// code (public/js/app/planning.js, lot 6.4b) ; public/js/layout-fix.js remet les largeurs à zéro (« Ajuster
// l'affichage ») puis rappelle window.makeColResizable.
import './colonnes.css';

type TableauColonnes = HTMLTableElement & { _colResizable?: boolean; _colCtxMenu?: boolean };

let numero = 0;

/** Feuille de style des colonnes masquées, partagée par les tableaux */
function feuille(): CSSStyleSheet | null {
    let style = document.getElementById('col-hide-styles') as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = 'col-hide-styles';
        document.head.appendChild(style);
    }
    return style.sheet;
}

const lire = (cle: string): number[] => {
    try {
        const v: unknown = JSON.parse(localStorage.getItem(cle) || '[]');
        return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
    } catch {
        return [];
    }
};

/** Libellé d'un en-tête (sans flèches de tri ni retour à la ligne) */
const libelle = (th: HTMLElement) =>
    (th.querySelector('.cra-th-label')?.textContent || (th.textContent ?? '').replace(/[▲▼↑↓]/g, ''))
        .split('\n')[0]!
        .trim();

function retirerMenu() {
    document.querySelector('.col-ctx-menu')?.remove();
}

function menuColonnes(tableau: TableauColonnes) {
    if (tableau._colCtxMenu) return;
    tableau._colCtxMenu = true;
    if (!tableau.dataset.coltblId) tableau.dataset.coltblId = `coltbl-${++numero}`;
    const id = tableau.dataset.coltblId;
    const cle = `col-hide:${id}`;
    // Rangs des colonnes masquées (nth-child, à partir de 1)
    const masquees = new Set(lire(cle));

    const enregistrer = () => {
        try {
            localStorage.setItem(cle, JSON.stringify([...masquees]));
        } catch {
            /* stockage indisponible */
        }
    };

    const appliquer = () => {
        const s = feuille();
        if (!s) return;
        for (let i = s.cssRules.length - 1; i >= 0; i--) {
            if ((s.cssRules[i] as CSSStyleRule).selectorText?.includes(id)) s.deleteRule(i);
        }
        masquees.forEach(n => {
            s.insertRule(
                `[data-coltbl-id="${id}"] td:nth-child(${n}),[data-coltbl-id="${id}"] th:nth-child(${n}) { display:none !important; }`,
                s.cssRules.length
            );
        });
    };

    const ths = Array.from(tableau.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'));
    ths.forEach((th, idx) => {
        const rang = idx + 1;
        th.addEventListener('contextmenu', e => {
            e.preventDefault();
            retirerMenu();
            const menu = document.createElement('div');
            menu.className = 'col-ctx-menu';
            // Position du clic, sans déborder de la fenêtre
            menu.style.left = `${Math.min(e.clientX, window.innerWidth - 220 - 8)}px`;
            menu.style.top = `${Math.min(e.clientY, window.innerHeight - 200 - 8)}px`;

            const entree = (texte: string, classe: string, action: () => void) => {
                const d = document.createElement('div');
                d.className = `col-ctx-menu__entree ${classe}`;
                d.textContent = texte;
                d.onclick = () => {
                    action();
                    appliquer();
                    enregistrer();
                    retirerMenu();
                };
                return d;
            };

            if (!masquees.has(rang)) {
                menu.appendChild(
                    entree(`👁 Masquer "${libelle(th)}"`, 'col-ctx-menu__entree--masquer', () => masquees.add(rang))
                );
            }
            if (masquees.size > 0) {
                const sep = document.createElement('div');
                sep.className = 'col-ctx-menu__separateur';
                menu.appendChild(sep);
                const titre = document.createElement('div');
                titre.className = 'col-ctx-menu__titre';
                titre.textContent = 'Colonnes masquées :';
                menu.appendChild(titre);
                masquees.forEach(n => {
                    const thMasque = ths[n - 1];
                    if (!thMasque) return;
                    menu.appendChild(
                        entree(`↩ Afficher "${libelle(thMasque)}"`, 'col-ctx-menu__entree--afficher', () =>
                            masquees.delete(n)
                        )
                    );
                });
            }
            document.body.appendChild(menu);
            setTimeout(() => document.addEventListener('click', retirerMenu, { once: true }), 0);
        });
    });

    // État mémorisé restauré
    if (masquees.size > 0) appliquer();
}

/** Colonnes redimensionnables et masquables, comme les autres tableaux de l'application */
export function rendreColonnesRedimensionnables(table: HTMLTableElement | null | undefined): void {
    const tableau = table as TableauColonnes | null | undefined;
    if (!tableau || tableau._colResizable) return;
    tableau._colResizable = true;
    tableau.style.tableLayout = 'fixed';
    const ths = Array.from(tableau.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'));
    // Largeurs naturelles figées
    ths.forEach(th => {
        if (th.offsetWidth > 0) th.style.width = `${th.offsetWidth}px`;
        th.classList.add('col-resizable');
    });
    // Poignées (sauf la dernière colonne)
    ths.slice(0, -1).forEach((th, idx) => {
        if (th.querySelector('.col-resize-handle')) return;
        const poignee = document.createElement('div');
        poignee.className = 'col-resize-handle';
        poignee.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            const departX = e.clientX;
            const largeur = th.offsetWidth;
            const suivant = ths[idx + 1];
            const largeurSuivant = suivant ? suivant.offsetWidth : 0;
            const deplacer = (m: MouseEvent) => {
                const nouvelle = Math.max(40, largeur + m.clientX - departX);
                const ecart = nouvelle - largeur;
                if (suivant) {
                    const nouvelleSuivant = largeurSuivant - ecart;
                    if (nouvelleSuivant < 40) return;
                    suivant.style.width = `${nouvelleSuivant}px`;
                }
                th.style.width = `${nouvelle}px`;
            };
            const lacher = () => {
                document.removeEventListener('mousemove', deplacer);
                document.removeEventListener('mouseup', lacher);
            };
            document.addEventListener('mousemove', deplacer);
            document.addEventListener('mouseup', lacher);
        });
        th.appendChild(poignee);
    });
    menuColonnes(tableau);
}
