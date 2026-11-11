// Thèmes d'affichage saisonniers : configuration commune (Administration, /api/theme), désactivation par utilisateur
// (préférence du navigateur, clé « gp_theme_off »), décor de l'en-tête et bouton de la barre d'outils. Repris de
// public/js/themes.js (lot 6.5).
import { monterOutil } from './outils-flottants';

const ORDRE = ['saintvalentin', 'saintpatrick', 'paques', 'halloween', 'vacances', 'noel'];
const CLE_DESACTIVE = 'gp_theme_off';
const PALETTE =
    '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>';

interface MetaTheme {
    label: string;
    btn: string;
    particle: 'fall' | 'rise';
    color: string;
    badge: string;
    strip: string;
}

const META: Record<string, MetaTheme> = {
    halloween: {
        label: 'Halloween',
        btn: '#e8590c',
        particle: 'fall',
        color: '#ff9a3c',
        badge: '<path d="M16 8c-8 0-13 5-13 11s5 9 13 9 13-3 13-9S24 8 16 8z" fill="#f57c00"/><path d="M16 8c-3.5 2-4.5 17 0 20M16 8c3.5 2 4.5 17 0 20" stroke="#bf5b00" fill="none" stroke-width="1.2"/><path d="M15 8c0-3 1-5 4-6" stroke="#2e7d32" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M9.5 15l3.5 2.2-3.5 2zM22.5 15l-3.5 2.2 3.5 2zM11 23.5q5 3.5 10 0l-1.5-2-2 1.5-1.5-2-1.5 2-2-1.5z" fill="#3b2300"/>',
        strip: '<path d="M2 0h16l-8 12z" fill="#ff7a18"/><path d="M22 0h16l-8 12z" fill="#7e3ff2"/>'
    },
    noel: {
        label: 'Noël',
        btn: '#b3262f',
        particle: 'fall',
        color: '#ffffff',
        badge: '<path d="M4 25Q7 7 20 5q-2 8 8 20z" fill="#d32f2f"/><rect x="3" y="22" width="26" height="6.5" rx="3.2" fill="#fff"/><circle cx="21" cy="5" r="3.4" fill="#fff"/>',
        strip: '<path d="M0 2Q10 11 20 2T40 2" stroke="#2e7d32" fill="none" stroke-width="1.6"/><circle cx="10" cy="8.5" r="2.7" fill="#ffd54f"/><circle cx="30" cy="8.5" r="2.7" fill="#ef5350"/>'
    },
    saintvalentin: {
        label: 'Saint-Valentin',
        btn: '#d81b60',
        particle: 'rise',
        color: '#ff8fb1',
        badge: '<path d="M16 28S3 19 3 11a6.5 6.5 0 0 1 13-1.5A6.5 6.5 0 0 1 29 11c0 8-13 17-13 17z" fill="#e91e63"/><path d="M8.5 10a4 4 0 0 1 4-2.6" stroke="#ff9ec0" stroke-width="2" fill="none" stroke-linecap="round"/>',
        strip: '<path d="M10 12S3 7 3 4a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-7 8-7 8z" fill="#ff8fb1"/><path d="M30 12S23 7 23 4a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-7 8-7 8z" fill="#f06292"/>'
    },
    saintpatrick: {
        label: 'Saint-Patrick',
        btn: '#1f8a3b',
        particle: 'fall',
        color: '#7ddc8a',
        badge: '<g fill="#2e9d4f"><circle cx="16" cy="9" r="6"/><circle cx="9" cy="17" r="6"/><circle cx="23" cy="17" r="6"/><circle cx="16" cy="14" r="4.5"/></g><path d="M16 17c0 5-1 8-4 11" stroke="#1b6b32" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M12 8.5a4 4 0 0 1 4-3" stroke="#9be8ae" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
        strip: '<g fill="#2e9d4f"><circle cx="10" cy="3.2" r="2.7"/><circle cx="6.6" cy="7.4" r="2.7"/><circle cx="13.4" cy="7.4" r="2.7"/></g><path d="M10 8.5v3.5" stroke="#1b6b32" stroke-width="1.4" stroke-linecap="round"/><circle cx="30" cy="7" r="4.2" fill="#ffc107"/><circle cx="30" cy="7" r="2.4" fill="none" stroke="#e29f00" stroke-width="1"/>'
    },
    paques: {
        label: 'Pâques',
        btn: '#8e6bb8',
        particle: 'fall',
        color: '#f6d365',
        badge: '<path d="M16 3C10 3 5 14 5 20a11 9 0 0 0 22 0C27 14 22 3 16 3z" fill="#ffd54f"/><path d="M6.5 16.5l3.4-2.6 3.4 2.6 3.4-2.6 3.4 2.6 3.4-2.6 2 1.5" stroke="#e91e63" stroke-width="2" fill="none"/><path d="M5.6 22l3.6-2.6 3.6 2.6 3.6-2.6 3.6 2.6 3.6-2.6 1.6 1.4" stroke="#42a5f5" stroke-width="2" fill="none"/>',
        strip: '<ellipse cx="10" cy="7" rx="4" ry="5.2" fill="#f6d365"/><ellipse cx="30" cy="7" rx="4" ry="5.2" fill="#f4a6c8"/>'
    },
    vacances: {
        label: 'Vacances',
        btn: '#e8890c',
        particle: 'rise',
        color: '#bfefff',
        badge: '<circle cx="16" cy="16" r="6.5" fill="#ffb300"/><g stroke="#ffb300" stroke-width="2.2" stroke-linecap="round"><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6.1 6.1l2.8 2.8M23.1 23.1l2.8 2.8M6.1 25.9l2.8-2.8M23.1 8.9l2.8-2.8"/></g>',
        strip: '<path d="M0 8Q5 2 10 8T20 8T30 8T40 8V14H0z" fill="#7fd6e8" opacity=".85"/>'
    }
};

/** Fenêtre de dates d'un thème (« MM-JJ », ou jours avant et après Pâques) */
interface ReglageTheme {
    auto?: boolean;
    start?: string;
    end?: string;
    before?: number;
    after?: number;
}

export interface ConfigThemes {
    mode: 'off' | 'forced' | 'auto' | string;
    forced: string;
    intensity: 'sobre' | 'decore' | 'anime' | string;
    themes: Record<string, ReglageTheme>;
}

/** Thème affiché : identifiant et raison (« forcé », « dates ») */
export interface ThemeAffiche {
    id: string;
    reason: string;
}

const CONFIG_PAR_DEFAUT: ConfigThemes = { mode: 'off', forced: 'noel', intensity: 'sobre', themes: {} };
let cfg: ConfigThemes = CONFIG_PAR_DEFAUT;
let apercuId: string | null = null;

const deux = (n: number) => String(n).padStart(2, '0');

/** Dimanche de Pâques (algorithme de Meeus) */
export function paques(annee: number): Date {
    const a = annee % 19;
    const b = Math.floor(annee / 100);
    const c = annee % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31);
    const jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, mois - 1, jour);
}

function dansSaPeriode(id: string, maintenant: Date) {
    const t = (cfg.themes || {})[id];
    if (!t || t.auto === false) return false;
    if (id === 'paques') {
        const e = paques(maintenant.getFullYear());
        const debut = new Date(e);
        debut.setDate(e.getDate() - (t.before ?? 7));
        const fin = new Date(e);
        fin.setDate(e.getDate() + (t.after ?? 1));
        const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
        return jour >= debut && jour <= fin;
    }
    const cur = `${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}`;
    if (!t.start || !t.end) return false;
    return t.start <= t.end ? cur >= t.start && cur <= t.end : cur >= t.start || cur <= t.end;
}

/** Thème affiché selon la configuration appliquée */
export function themeDuJour(maintenant = new Date()): ThemeAffiche | null {
    if (cfg.mode === 'forced' && META[cfg.forced]) return { id: cfg.forced, reason: 'forcé' };
    if (cfg.mode === 'auto') {
        const id = ORDRE.find(x => dansSaPeriode(x, maintenant));
        if (id) return { id, reason: 'dates' };
    }
    return null;
}

const desactive = () => {
    try {
        return localStorage.getItem(CLE_DESACTIVE) === '1';
    } catch {
        return false;
    }
};

const svg = (contenu: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${contenu}</svg>`;

function retirerDecor() {
    ['themeBadge', 'themeStrip', 'themeParticles'].forEach(id => document.getElementById(id)?.remove());
}

function particules(id: string, niveau: string) {
    if (niveau !== 'anime' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const meta = META[id]!;
    const couche = document.createElement('div');
    couche.id = 'themeParticles';
    couche.className = meta.particle;
    for (let i = 0; i < 16; i++) {
        const sp = document.createElement('span');
        const taille = 8 + Math.round(Math.random() * 8);
        sp.style.left = `${Math.random() * 100}%`;
        sp.style.width = sp.style.height = `${taille}px`;
        sp.style.animationDuration = `${10 + Math.random() * 10}s`;
        sp.style.animationDelay = `${-Math.random() * 16}s`;
        sp.style.setProperty('--th-drift', `${Math.random() * 60 - 30}px`);
        sp.style.opacity = '.7';
        if (id === 'noel') {
            sp.style.borderRadius = '50%';
            sp.style.background = '#fff';
            sp.style.boxShadow = '0 0 4px rgba(255,255,255,.9)';
            sp.style.width = sp.style.height = `${taille / 2}px`;
        } else if (id === 'vacances') {
            sp.style.borderRadius = '50%';
            sp.style.border = `1.5px solid ${meta.color}`;
            sp.style.background = 'rgba(191,239,255,.18)';
        } else sp.innerHTML = svg(meta.badge);
        couche.appendChild(sp);
    }
    document.body.appendChild(couche);
}

function appliquerDecor(id: string | null) {
    retirerDecor();
    const racine = document.documentElement;
    if (!id) {
        racine.removeAttribute('data-theme');
        racine.removeAttribute('data-theme-level');
        return;
    }
    const niveau = cfg.intensity || 'sobre';
    racine.setAttribute('data-theme', id);
    racine.setAttribute('data-theme-level', niveau);
    const meta = META[id]!;
    const entete = document.querySelector('.fixed-header');
    if (entete) {
        const badge = document.createElement('div');
        badge.id = 'themeBadge';
        badge.innerHTML = svg(meta.badge);
        entete.appendChild(badge);
        if (niveau === 'decore' || niveau === 'anime') {
            const bande = document.createElement('div');
            bande.id = 'themeStrip';
            const motif = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="14" viewBox="0 0 40 14">${meta.strip}</svg>`;
            bande.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(motif)}")`;
            entete.appendChild(bande);
        }
    }
    particules(id, niveau);
}

function majBoutonRapide(actif: ThemeAffiche | null) {
    let bouton = document.getElementById('themeQuickBtn');
    const utilisateur = document.getElementById('userInfo');
    const connecte = !!utilisateur && utilisateur.style.display !== 'none';
    if (!actif || !connecte) {
        if (bouton) bouton.style.display = 'none';
        return;
    }
    if (!bouton) {
        bouton = document.createElement('button');
        bouton.id = 'themeQuickBtn';
        (bouton as HTMLButtonElement).type = 'button';
        bouton.addEventListener('click', () => themes.setUserEnabled(desactive()));
        monterOutil(bouton, 2);
    }
    const meta = META[actif.id]!;
    bouton.style.display = 'flex';
    bouton.style.setProperty('--th-btn', meta.btn);
    bouton.classList.toggle('off', desactive());
    bouton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${PALETTE}</svg>`;
    bouton.title = desactive() ? `Réactiver le thème ${meta.label}` : `Désactiver le thème ${meta.label}`;
}

function rafraichir() {
    const actif = apercuId ? { id: apercuId, reason: 'aperçu' } : themeDuJour();
    const montre = actif && (apercuId || !desactive());
    const racine = document.documentElement;
    const courant = racine.getAttribute('data-theme');
    const niveau = racine.getAttribute('data-theme-level');
    const voulu = montre ? actif.id : null;
    if (
        courant !== voulu ||
        (voulu && niveau !== (cfg.intensity || 'sobre')) ||
        (voulu && !document.getElementById('themeBadge') && document.querySelector('.fixed-header'))
    ) {
        appliquerDecor(voulu);
    }
    majBoutonRapide(apercuId ? null : actif);
}

async function charger() {
    try {
        const r = await fetch('/api/theme', { credentials: 'include' });
        if (r.ok) cfg = (await r.json()) as ConfigThemes;
    } catch {
        /* configuration précédente conservée */
    }
    rafraichir();
}

/** Décor des thèmes, piloté par l'écran d'administration et la fenêtre « Mon profil » */
export const themes = {
    /** Thème saisonnier affiché pour l'utilisateur (préférence du navigateur) */
    userEnabled: () => !desactive(),
    setUserEnabled(actif: boolean) {
        try {
            if (actif) localStorage.removeItem(CLE_DESACTIVE);
            else localStorage.setItem(CLE_DESACTIVE, '1');
        } catch {
            /* stockage indisponible */
        }
        rafraichir();
    },
    /** Libellés et vignettes (tracés SVG 32×32) */
    catalogue: (): Record<string, { label: string; badge: string }> =>
        Object.fromEntries(Object.entries(META).map(([id, m]) => [id, { label: m.label, badge: m.badge }])),
    /** Configuration relue ou enregistrée par l'administration : appliquée au décor */
    appliquerConfig(config: unknown) {
        cfg = (config as ConfigThemes | null) || CONFIG_PAR_DEFAUT;
        rafraichir();
    },
    /** Aperçu de 6 secondes d'un thème, à l'intensité choisie */
    apercu(id: string, intensite: string) {
        apercuId = id;
        const niveauPrecedent = cfg.intensity;
        cfg = { ...cfg, intensity: intensite };
        rafraichir();
        setTimeout(() => {
            apercuId = null;
            cfg = { ...cfg, intensity: niveauPrecedent };
            rafraichir();
        }, 6000);
    },
    /** Thème affiché selon la configuration appliquée */
    compute: () => themeDuJour()
};

export type Themes = typeof themes;

let installe = false;

/** Configuration lue (puis toutes les 5 minutes), décor tenu à jour toutes les 3 secondes */
export function installerThemes(): void {
    if (installe) return;
    installe = true;
    void charger();
    setInterval(rafraichir, 3000);
    setInterval(() => void charger(), 5 * 60 * 1000);
}
