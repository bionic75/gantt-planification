// SAMU-SAS TripAdVisor : typologies, modes de trajet et mises en forme (dates, notes, distances, durées)
import type { Categorie, ModeTrajet } from '@/api/poi';
import type { NomIcone } from '@/composants/icones';

export const CATEGORIES: Record<Categorie, { label: string; icone: NomIcone }> = {
    hebergement: { label: 'Hébergement', icone: 'lit' },
    restaurant: { label: 'Restaurant', icone: 'couverts' },
    bar: { label: 'Bar', icone: 'biere' }
};

export const LISTE_CATEGORIES = Object.keys(CATEGORIES) as Categorie[];

export const MODES_TRAJET: Record<ModeTrajet, { label: string; emoji: string }> = {
    walk: { label: 'À pied', emoji: '🚶' },
    car: { label: 'Voiture', emoji: '🚗' },
    transit: { label: 'Transports en commun', emoji: '🚆' }
};

export const LISTE_MODES = Object.keys(MODES_TRAJET) as ModeTrajet[];

/** France métropolitaine, Corse incluse (cadrage de la carte sans filtre) */
export const FRANCE: [[number, number], [number, number]] = [
    [41.2, -5.3],
    [51.2, 9.7]
];

const deux = (n: number) => String(n).padStart(2, '0');

/** Horodatage UTC de la base (« AAAA-MM-JJ HH:MM:SS ») → « JJ/MM/AAAA HH:MM », heure locale */
export function dateHeure(d: string | null | undefined): string {
    if (!d) return '';
    const x = new Date(`${d.replace(' ', 'T')}Z`);
    if (isNaN(x.getTime())) return '';
    return `${deux(x.getDate())}/${deux(x.getMonth() + 1)}/${x.getFullYear()} ${deux(x.getHours())}:${deux(x.getMinutes())}`;
}

/** Note moyenne au format français (« 3,5 ») */
export const note = (n: number) => n.toFixed(1).replace('.', ',');

/** Distance en kilomètres au format français (« 1,2 ») */
export const km = (n: number) => String(n).replace('.', ',');

export const pluriel = (n: number, mot: string, marque = 's') => `${n} ${mot}${n > 1 ? marque : ''}`;

/** Durée d'un trajet (secondes) : « 12 min » ou « 1 h 05 » */
export function duree(secondes: number): string {
    const m = Math.round(secondes / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${deux(m % 60)}`;
}

/** Distance d'un trajet (mètres) : « · 1,2 km » */
export const distanceTrajet = (metres: number | null | undefined) =>
    metres == null ? '' : ` · ${(metres / 1000).toFixed(1).replace('.', ',')} km`;

/** Adresse d'un site web, complétée en https:// si besoin */
export const lienSite = (site: string) => (/^https?:\/\//i.test(site) ? site : `https://${site}`);

/** Échappement HTML (contenu des marqueurs et bulles de la carte, construits hors de Vue) */
export const echapper = (v: unknown) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
    );
