// Mise en page robuste : espace sous l'en-tête fixe calculé, détection du zoom du navigateur, bouton « Ajuster
// l'affichage » (barre d'outils flottante). Repris de public/js/layout-fix.js (lot 6.5).
import './mise-en-page.css';
import { emettre } from '@/evenements';
import { rendreColonnesRedimensionnables } from '@/outils/colonnes';
import { monterOutil } from './outils-flottants';

const ICONE =
    '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>';

/** Hauteur de l'en-tête affiché (plusieurs applications ont chacune le leur) : variable --gp-header-h */
function majEspace() {
    const entete = [...document.querySelectorAll('.fixed-header')].find(h => h.getBoundingClientRect().height > 0);
    if (!entete) return;
    const bande = entete.querySelector('#themeStrip');
    const h = Math.ceil(entete.getBoundingClientRect().height) + (bande ? 14 : 0) + 6;
    document.documentElement.style.setProperty('--gp-header-h', `${h}px`);
}

/** Zoom estimé du navigateur : largeur de fenêtre (non zoomée) / largeur de contenu (zoomée) */
function zoomNavigateur() {
    if (!window.outerWidth || !window.innerWidth) return 100;
    return Math.round((window.outerWidth / window.innerWidth) * 100);
}
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function message(html: string) {
    document.getElementById('layoutToast')?.remove();
    const t = document.createElement('div');
    t.id = 'layoutToast';
    t.innerHTML = html;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 7000);
}

function majBouton() {
    const bouton = document.getElementById('layoutResetBtn');
    if (!bouton) return;
    const utilisateur = document.getElementById('userInfo');
    const connecte = !!utilisateur && utilisateur.style.display !== 'none';
    bouton.style.display = connecte ? 'flex' : 'none';
    const z = zoomNavigateur();
    const zoome = Math.abs(z - 100) > 7;
    bouton.classList.toggle('zoomed', zoome);
    bouton.title = zoome
        ? `Ajuster l'affichage (zoom navigateur détecté : ~${z} %)`
        : "Ajuster l'affichage (remet la mise en page au propre)";
}

type TableauColonnes = HTMLTableElement & { _colResizable?: boolean };

function reinitialiser() {
    // Zoom de la grille de la planification
    emettre('zoom-grille-reinitialise');
    // Largeurs de colonnes figées par le redimensionnement manuel
    document.querySelectorAll<TableauColonnes>('table').forEach(t => {
        if (!t._colResizable) return;
        t._colResizable = false;
        t.style.tableLayout = '';
        t.querySelectorAll<HTMLElement>('thead th').forEach(th => {
            th.style.width = '';
            th.style.position = '';
        });
        t.querySelectorAll('.col-resize-handle').forEach(h => h.remove());
        if (t.offsetWidth > 0) rendreColonnesRedimensionnables(t);
    });
    majEspace();
    window.dispatchEvent(new Event('resize'));
    majBouton();

    const z = zoomNavigateur();
    const touche = mac ? '⌘ + 0' : 'Ctrl + 0';
    if (Math.abs(z - 100) > 7) {
        message(
            `Zoom du navigateur détecté : <b>~${z} %</b>.<br>Pour revenir à 100 %, appuie sur <b>${touche}</b> (un site web ne peut pas le faire à ta place).`
        );
    } else {
        message("Mise en page recalculée. Si l'affichage reste incorrect, recharge la page (F5).");
    }
}

let installe = false;

export function installerMiseEnPage(): void {
    if (installe) return;
    installe = true;
    const bouton = document.createElement('button');
    bouton.id = 'layoutResetBtn';
    bouton.type = 'button';
    bouton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONE}</svg><span class="dot"></span>`;
    bouton.addEventListener('click', reinitialiser);
    monterOutil(bouton, 3);

    // En-têtes montés et démontés avec la session et les applications : observés à chaque vérification
    const observateur = 'ResizeObserver' in window ? new ResizeObserver(majEspace) : null;
    const observes = new WeakSet<Element>();
    const observerEntetes = () =>
        document.querySelectorAll('.fixed-header').forEach(h => {
            if (observateur && !observes.has(h)) {
                observes.add(h);
                observateur.observe(h);
            }
        });
    window.addEventListener('resize', () => {
        majEspace();
        majBouton();
    });
    setInterval(() => {
        observerEntetes();
        majEspace();
        majBouton();
    }, 2000);
    observerEntetes();
    majEspace();
    majBouton();
}
