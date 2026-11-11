// Mode d'affichage clair / sombre / automatique (préférence mémorisée dans le navigateur, clé « gp_color_mode ») et son
// bouton dans la barre d'outils flottante. Repris de public/js/darkmode.js (lot 6.5). La classe « dark-mode » est posée
// avant l'affichage par frontend/public/mode-affichage.js (script classique, sans flash).
import { monterOutil, positionnerOutils } from './outils-flottants';

export type ModeAffichage = 'light' | 'dark' | 'auto';

const CLE = 'gp_color_mode';
const LUNE = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
const SOLEIL =
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';

const prefereSombre = () => window.matchMedia('(prefers-color-scheme: dark)');

export function modeAffichage(): ModeAffichage {
    try {
        return (localStorage.getItem(CLE) as ModeAffichage | null) || 'light';
    } catch {
        return 'light';
    }
}

const sombre = () => {
    const m = modeAffichage();
    return m === 'dark' || (m === 'auto' && prefereSombre().matches);
};

function majBouton() {
    const bouton = document.getElementById('colorModeBtn');
    if (!bouton) return;
    const s = sombre();
    bouton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${s ? SOLEIL : LUNE}</svg>`;
    bouton.title = s ? 'Passer en mode clair' : 'Passer en mode sombre';
}

function appliquer() {
    document.documentElement.classList.toggle('dark-mode', sombre());
    majBouton();
}

export function choisirModeAffichage(mode: ModeAffichage): void {
    try {
        localStorage.setItem(CLE, mode);
    } catch {
        /* stockage indisponible */
    }
    appliquer();
}

let installe = false;

/** Mode appliqué, suivi du réglage du système (mode automatique), bouton de la barre d'outils */
export function installerModeAffichage(): void {
    if (installe) return;
    installe = true;
    appliquer();
    prefereSombre().addEventListener('change', appliquer);
    const bouton = document.createElement('button');
    bouton.id = 'colorModeBtn';
    bouton.type = 'button';
    bouton.addEventListener('click', () => choisirModeAffichage(sombre() ? 'light' : 'dark'));
    monterOutil(bouton, 1);
    majBouton();
    setInterval(() => {
        majBouton();
        positionnerOutils();
    }, 1000);
}
