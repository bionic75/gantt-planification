// @ts-check
// Calendrier mensuel d'une ressource (demi-journées, pastilles ASTR / HNO) : aperçu avant impression et envoi par
// e-mail. Construit par le serveur à partir du planning enregistré : la page ne fournit ni contenu ni objet.
import { prisma } from '../../db/prisma.js';
import { escapeHtml as echapper } from '../../lib/html.js';
import { listForPlanning } from '../astreintes/astreintes.service.js';

const MOIS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Activités : libellé et couleur de la demi-journée */
const ACTIVITES = /** @type {Record<string, { label: string, color: string }>} */ ({
    1: { label: 'Indisponible', color: '#95a5a6' },
    2: { label: 'En attente', color: '#9b59b6' },
    3: { label: 'SAMU Dép.', color: '#e67e22' },
    4: { label: 'SAMU Dev.', color: '#d35400' },
    5: { label: 'ANS Dép.', color: '#3498db' },
    6: { label: 'ANS Dev.', color: '#2980b9' },
    7: { label: 'Qualification', color: '#e74c3c' },
    8: { label: 'Divers', color: '#16a085' }
});
const ICONES_LOCALISATION = /** @type {Record<string, string>} */ ({ T: '🏠', TT: '🏠', PSC: '🚨', Aut: '✏️' });

/** Numéro de semaine ISO 8601 */
function semaineIso(/** @type {number} */ annee, /** @type {number} */ mois, /** @type {number} */ jour) {
    const d = new Date(Date.UTC(annee, mois, jour));
    const n = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - n);
    const debut = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - debut) / 86400000 + 1) / 7);
}

/** Libellé et couleur d'une demi-journée : disponibilité, activité, localisation */
function etatDemiJournee(/** @type {string} */ dispo, /** @type {string} */ activite, /** @type {string} */ loc) {
    if (dispo === '1') return { ...ACTIVITES[1] };
    const etat = { ...(ACTIVITES[activite] || ACTIVITES[2]) };
    if (loc && loc !== '-') etat.label += ` (${ICONES_LOCALISATION[loc] || ''} ${loc})`;
    return etat;
}

/**
 * @typedef {{ id: number, type: string, objet: string | null, samu: string | null, tous_samu?: number | null,
 *   date_debut: string, date_fin: string, heure_debut: string | null, heure_fin: string | null }} Astreinte
 */

/** Première astreinte / HNO de la ressource couvrant la demi-journée (selon les heures le premier et le dernier jour) */
function astreinteDeLaCellule(
    /** @type {Astreinte[]} */ astreintes,
    /** @type {string} */ date,
    /** @type {'AM' | 'PM'} */ periode
) {
    for (const a of astreintes) {
        const debut = (a.date_debut || '').substring(0, 10);
        const fin = (a.date_fin || '').substring(0, 10);
        if (date < debut || date > fin) continue;
        const premier = date === debut;
        const dernier = date === fin;
        let couvre = true;
        if (a.heure_debut && a.heure_fin && (premier || dernier)) {
            const hD = parseInt(a.heure_debut.split(':')[0]);
            const hF = parseInt(a.heure_fin.split(':')[0]);
            if (periode === 'AM') {
                couvre = premier ? hD < 12 : true;
                if (dernier) couvre = couvre && hF > 0;
            } else {
                couvre = dernier ? hF > 12 || (hF === 12 && (a.heure_fin.split(':')[1] || '0') > '0') : true;
                if (premier) couvre = couvre && hD < 24;
            }
        }
        if (couvre) return a;
    }
    return null;
}

/** Pastille ASTR / HNO en haut à droite de la demi-journée (aucune pour une activité courante) */
function pastille(/** @type {Astreinte | null} */ a) {
    if (!a || a.type === 'activite_courante') return '';
    const samu = a.tous_samu ? 'Tous SAMU' : a.samu || '';
    const heures = a.heure_debut && a.heure_fin ? `${a.heure_debut}–${a.heure_fin}` : '';
    const astreinte = a.type === 'astreinte';
    const infobulle = astreinte
        ? `Astreinte: ${a.objet || ''} - ${samu}`
        : `HNO: ${a.objet || ''} - ${heures} - ${samu}`;
    return `<span title="${echapper(infobulle)}" style="position: absolute; top: 1px; right: 1px; background: #ffeb3b; color: #d32f2f; padding: 1px 3px; border-radius: 8px; font-size: 7px; font-weight: bold; border: 1px solid #333; box-shadow: 0 1px 2px rgba(0,0,0,0.3); cursor: help; line-height: 1; z-index: 1;">${astreinte ? 'ASTR' : 'HNO'}</span>`;
}

/**
 * Calendrier du mois : en-tête (nom, mois, trigramme) et tableau des semaines
 * @param {{ ressource: { nom: string, prenom: string | null, trigramme: string | null }, annee: number,
 *   mois: number, cellules: Record<string, string>, astreintes: Astreinte[], aujourdhui: string }} donnees
 *   mois de 0 à 11 ; cellules indexées « <type>_<AAAA-MM-JJ>_<AM|PM> » ; aujourdhui « AAAA-MM-JJ »
 */
export function calendrierRessource({ ressource, annee, mois, cellules, astreintes, aujourdhui }) {
    const nom = `${String(ressource.nom || '').toUpperCase()} ${ressource.prenom || ''}`.trim();
    const titre = `Planning ${ressource.nom} ${ressource.prenom || ''} - ${MOIS[mois]} ${annee}`;
    const dernierJour = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    const decalage = (new Date(Date.UTC(annee, mois, 1)).getUTCDay() + 6) % 7; // 0 = lundi

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">';
    html += '<thead><tr>';
    html += `<th style="width: 8%; padding: 10px; background-color: #2c3e50; color: white; border: 1px solid #bdc3c7; font-size: 10px;">Sem.</th>`;
    JOURS.forEach((j, i) => {
        const weekEnd = i >= 5;
        html += `<th style="width: 13.14%; padding: 10px; background-color: ${weekEnd ? '#ffc107' : '#1D70B7'}; color: ${weekEnd ? '#333' : 'white'}; border: 1px solid #bdc3c7;">${j}</th>`;
    });
    html += '</tr></thead><tbody>';

    let jour = 1;
    const semaines = Math.ceil((decalage + dernierJour) / 7);
    for (let s = 0; s < semaines; s++) {
        html += '<tr>';
        html += `<td style="width: 8%; padding: 5px; border: 1px solid #bdc3c7; background-color: #ecf0f1; text-align: center; vertical-align: middle; font-weight: bold; color: #2c3e50; font-size: 11px;">${semaineIso(annee, mois, Math.min(jour, dernierJour))}</td>`;
        for (let j = 0; j < 7; j++) {
            if ((s === 0 && j < decalage) || jour > dernierJour) {
                html +=
                    '<td style="width: 13.14%; padding: 15px; border: 1px solid #bdc3c7; background-color: #f5f5f5;"></td>';
                continue;
            }
            const date = `${annee}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
            const weekEnd = j >= 5;
            const estAujourdhui = date === aujourdhui;
            const demi = (/** @type {'AM' | 'PM'} */ p) => {
                const etat = etatDemiJournee(
                    cellules[`available_${date}_${p}`] || '1',
                    cellules[`activity_${date}_${p}`] || '1',
                    cellules[`localisation_${date}_${p}`] || '-'
                );
                return `<div style="position: relative; font-size: 10px; ${p === 'AM' ? 'margin-bottom: 3px; ' : ''}padding: 5px; background-color: ${etat.color}; color: white; border-radius: 3px;">
                                <strong>${p}:</strong> ${echapper(etat.label)}${pastille(astreinteDeLaCellule(astreintes, date, p))}
                            </div>`;
            };
            html += `<td style="width: 13.14%; padding: 5px; border: 1px solid #bdc3c7; ${weekEnd ? 'background-color: #fff8e1;' : estAujourdhui ? 'background-color: #d4edda;' : ''} vertical-align: top;">
                            <div style="font-weight: bold; text-align: center; margin-bottom: 5px; padding: 3px; background-color: ${estAujourdhui ? '#28a745' : '#34495e'}; color: white; border-radius: 3px;">${jour}</div>
                            ${demi('AM')}
                            ${demi('PM')}
                        </td>`;
            jour++;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    const entete = `<div style="text-align: center; margin-bottom: 20px; page-break-after: avoid;">
                        <h2 style="margin: 0; color: #2c3e50;">Planning - ${echapper(nom)}</h2>
                        <h3 style="margin: 5px 0; color: #7f8c8d;">${MOIS[mois]} ${annee}</h3>
                        <p style="margin: 5px 0; font-size: 13px; color: #95a5a6;">Trigramme: ${echapper(ressource.trigramme)}</p>
                    </div>`;
    const contenu = `${entete}${html}`;
    const document = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${echapper(titre)}</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
    ${contenu}
</body>
</html>`;
    return { titre, contenu, document };
}

/** Date du jour à Paris, « AAAA-MM-JJ » */
const aujourdhuiParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/**
 * Calendrier d'une ressource pour un mois (0 à 11) ; null si la ressource n'existe pas
 * @param {number} resourceId
 * @param {number} annee
 * @param {number} mois
 */
export async function calendrierDeLaRessource(resourceId, annee, mois) {
    const ressource = await prisma.resource.findUnique({
        where: { id: resourceId },
        select: { nom: true, prenom: true, trigramme: true }
    });
    if (!ressource) return null;
    const prefixe = `${annee}-${String(mois + 1).padStart(2, '0')}-`;
    const lignes = await prisma.scheduleData.findMany({
        where: { resource_id: resourceId, date_key: { startsWith: prefixe } },
        select: { type: true, date_key: true, value: true },
        orderBy: { id: 'asc' }
    });
    /** @type {Record<string, string>} */
    const cellules = {};
    for (const l of lignes) cellules[`${l.type}_${l.date_key}`] = l.value;
    const astreintes = (await listForPlanning()).filter(a => a.resource_id === resourceId);
    return calendrierRessource({
        ressource,
        annee,
        mois,
        cellules,
        astreintes: /** @type {Astreinte[]} */ (astreintes),
        aujourdhui: aujourdhuiParis()
    });
}
