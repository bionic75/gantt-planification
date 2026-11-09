// Carte des événements : pastilles et bulles des lieux et des experts, construites hors de Vue (contenu des marqueurs
// Leaflet). Textes insérés par textContent ; couleurs du type posées par le DOM (pas d'attribut style dans le HTML).
import type { EvenementCarte } from '@/api/carte';
import { ICONES } from '@/composants/icones';
import { ICONES_APPLICATION } from '@/composants/icones-application';
import { dateFr } from './calculs';
import type { ExpertPlace, LieuCarte } from './carte';

const el = <K extends keyof HTMLElementTagNameMap>(balise: K, classe: string, texte?: string) => {
    const e = document.createElement(balise);
    e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
};

/** Icône d'un type d'événement (nom enregistré en base) */
function icone(nom: string, taille: number) {
    const traces = (ICONES as Record<string, string>)[nom] ?? ICONES_APPLICATION[nom];
    if (!traces) return null;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gp-icone ev-carte-bulle__icone');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(taille));
    svg.setAttribute('height', String(taille));
    svg.setAttribute('aria-hidden', 'true');
    // Tracés constants du jeu d'icônes, jamais de donnée saisie
    svg.innerHTML = traces;
    return svg;
}

/** Événement typé (hors type « Autre ») */
const estType = (e: EvenementCarte) => !!(e.type_long && !e.type_other);

/** Couleurs de l'événement (configuration du type) */
function couleursEvenement(e: EvenementCarte) {
    let c: { bgColor?: string; textColor?: string; borderColor?: string };
    try {
        c = (typeof e.config === 'string' ? JSON.parse(e.config) : e.config) ?? {};
    } catch {
        c = {};
    }
    const fond = c.bgColor || '#3f51b5';
    return { fond, bordure: c.borderColor || fond };
}

/** Libellé affiché : libellé court du type (événement typé), sinon libellé de l'événement */
const libelleCarte = (e: EvenementCarte) => (estType(e) ? e.type_short || e.type_long || '' : e.label || '');

const periode = (e: EvenementCarte) => (e.period === 'AM' ? ' ☀️' : e.period === 'PM' ? ' 🌙' : '');

const dates = (e: EvenementCarte) =>
    e.end_date && e.end_date !== e.start_date
        ? `${dateFr(e.start_date)} → ${dateFr(e.end_date)}`
        : dateFr(e.start_date);

/** Pastille d'un lieu : nombre d'événements (animée quand le nombre change pendant la lecture) */
export function htmlPastilleLieu(nombre: number, animee: boolean) {
    return `<div class="ev-carte-pastille${animee ? ' ev-carte-pastille--apparition' : ''}">${nombre}</div>`;
}

/** Bulle d'un lieu : libellé, adresse, nombre et liste des événements */
export function bulleLieu(lieu: LieuCarte) {
    const div = el('div', 'ev-carte-bulle');
    div.append(el('div', 'ev-carte-bulle__lieu', `📍 ${lieu.libelle}`));
    if (lieu.adresse) div.append(el('div', 'ev-carte-bulle__adresse', lieu.adresse));
    div.append(el('div', 'ev-carte-bulle__nombre', `${lieu.evenements.length} événement(s)`));
    for (const e of lieu.evenements) {
        const { fond, bordure } = couleursEvenement(e);
        const carte = el('div', 'ev-carte-bulle__evenement');
        const repere = el('div', 'ev-carte-bulle__repere');
        repere.style.background = fond;
        repere.style.borderColor = bordure;
        const corps = el('div', 'ev-carte-bulle__corps');
        const titre = el('div', 'ev-carte-bulle__titre');
        titre.style.color = fond === '#ffffff' || fond === '#fff' ? '#333' : fond;
        const ic = estType(e) && e.type_icon ? icone(e.type_icon, 13) : null;
        if (ic) titre.append(ic);
        titre.append(`${libelleCarte(e)}${periode(e)}`);
        corps.append(titre);
        if (estType(e) && e.label && e.label !== libelleCarte(e))
            corps.append(el('div', 'ev-carte-bulle__libelle', e.label));
        corps.append(el('div', 'ev-carte-bulle__dates', `📅 ${dates(e)}`));
        if (e.participants?.length)
            corps.append(el('div', 'ev-carte-bulle__participants', `👥 ${e.participants.join(', ')}`));
        carte.append(repere, corps);
        div.append(carte);
    }
    return div;
}

const initiales = (x: ExpertPlace) => `${(x.prenom || '')[0] || ''}${(x.nom || '')[0] || ''}`.toUpperCase();

/** Photo acceptée : image intégrée (data:image/…) ou adresse web */
const photoValide = (p: string | null) => !!p && /^(data:image\/|https?:\/\/)/i.test(p);

/** Pastille d'un expert : photo ou initiales, trigramme */
export function pastilleExpert(x: ExpertPlace) {
    const div = el('div', 'ev-carte-expert');
    const cadre = el('div', 'ev-carte-expert__cadre');
    if (photoValide(x.profile_photo)) {
        const img = el('img', 'ev-carte-expert__photo');
        img.src = x.profile_photo as string;
        img.alt = '';
        cadre.append(img);
    } else cadre.append(el('div', 'ev-carte-expert__initiales', initiales(x)));
    div.append(cadre, el('div', 'ev-carte-expert__trigramme', x.trigramme || initiales(x)));
    return div;
}

/** Bulle d'un expert : nom, établissement de rattachement, SAMU */
export function bulleExpert(x: ExpertPlace) {
    const div = el('div', 'ev-carte-bulle-expert');
    div.append(el('div', 'ev-carte-bulle-expert__nom', `👤 ${x.prenom} ${x.nom}`));
    div.append(el('div', 'ev-carte-bulle-expert__detail', `🏥 ${x.es_rattachement}`));
    if (x.samu) div.append(el('div', 'ev-carte-bulle-expert__detail', `🚑 ${x.samu}`));
    return div;
}
