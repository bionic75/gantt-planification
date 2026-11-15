// @ts-check
// Gabarit commun des emails de l'application, aux couleurs du site (mire de connexion) : carte blanche aux coins
// arrondis, bandeau dégradé bleu → rose, en-tête « Plateforme de Planification », bouton bleu.
// Les icônes sont celles du site (frontend/src/composants/icones.ts), jointes en PNG (backend/assets/mail, généré par
// backend/scripts/icones-mail.mjs) et référencées par « cid: » : les clients de messagerie n'affichent pas le SVG.
import { fileURLToPath } from 'node:url';
import { escapeHtml as e } from './html.js';

export const COULEUR = '#1d70b7';
const DOSSIER = fileURLToPath(new URL('../../assets/mail/', import.meta.url));

/** Icônes disponibles (backend/assets/mail) : grandes (titre, blanc sur disque) puis petites (lignes d'information) */
const ICONES_MAIL = /** @type {const} */ ([
    'cadenas-grand',
    'cle-grand',
    'calendrier-grand',
    'mallette-grand',
    'modifie-grand',
    'annule-grand',
    'horloge',
    'bouclier',
    'calendrier',
    'evenement',
    'lieu',
    'utilisateur',
    'mallette'
]);

/** @typedef {typeof ICONES_MAIL[number]} IconeMail */

/**
 * Pièces jointes intégrées (images « cid ») des icônes utilisées
 * @param {IconeMail[]} noms
 */
export const piecesIcones = noms =>
    noms.map(nom => ({
        filename: `${nom}.png`,
        path: `${DOSSIER}${nom}.png`,
        cid: `${nom}@planification`,
        contentType: 'image/png'
    }));

/**
 * Pièces jointes des icônes référencées (« cid: ») par un HTML déjà construit, sans doublon
 * @param {string} html
 */
export const piecesDeHtml = html => {
    const noms = new Set(
        [...String(html).matchAll(/cid:([a-z-]+)@planification/g)]
            .map(m => /** @type {IconeMail} */ (m[1]))
            .filter(nom => ICONES_MAIL.includes(nom))
    );
    return piecesIcones([...noms]);
};

/** @param {IconeMail} nom @param {number} taille */
const img = (nom, taille) =>
    `<img src="cid:${nom}@planification" width="${taille}" height="${taille}" alt="" style="display:inline-block;vertical-align:middle;border:0;">`;

/** Ligne d'information : petite icône et texte (HTML déjà échappé par l'appelant) */
export const ligneInfo = (/** @type {IconeMail} */ icone, /** @type {string} */ html) =>
    `<tr><td width="28" valign="top" style="padding:3px 10px 3px 0;">${img(icone, 20)}</td><td valign="top" style="padding:3px 0;font-size:13px;line-height:19px;color:#6b7a8d;">${html}</td></tr>`;

/** Bouton bleu du site */
export const boutonMail = (/** @type {string} */ lien, /** @type {string} */ libelle) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto;"><tr><td bgcolor="${COULEUR}" style="border-radius:12px;background:linear-gradient(135deg,#1d70b7 0%,#2d8fd8 100%);"><a href="${e(lien)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">${e(libelle)}</a></td></tr></table>`;

/**
 * Email complet
 * @param {{ icone: IconeMail, titre: string, corps: string, infos?: string, fin?: string }} p
 *   corps, infos et fin (texte après les informations) : HTML déjà échappé par l'appelant
 */
export const gabaritMail = ({ icone, titre, corps, infos = '', fin = '' }) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(titre)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#2c3e50;border:1px solid #e3e9f1;">
    <tr><td height="5" bgcolor="${COULEUR}" style="height:5px;line-height:5px;font-size:0;background:linear-gradient(90deg,#1d70b7,#4aa3df 55%,#b0285a);">&nbsp;</td></tr>
    <tr><td align="center" style="padding:22px 32px 16px;background:#f6f9fd;border-bottom:1px solid #eef1f6;">
      <div style="font-size:20px;font-weight:700;color:${COULEUR};letter-spacing:-0.2px;">Plateforme de Planification</div>
      <div style="font-size:12.5px;color:#6b7a8d;margin-top:3px;">Agence du Numérique en Santé</div>
    </td></tr>
    <tr><td align="center" style="padding:30px 36px 8px;">
      ${img(icone, 64)}
      <h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:${COULEUR};">${e(titre)}</h1>
    </td></tr>
    <tr><td style="padding:14px 36px 8px;font-size:15px;line-height:23px;color:#2c3e50;">${corps}</td></tr>
    ${infos ? `<tr><td style="padding:8px 36px 26px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #eef1f6;margin-top:6px;">${infos}</table></td></tr>` : ''}
    ${fin ? `<tr><td style="padding:0 36px 26px;font-size:14px;line-height:21px;color:#2c3e50;">${fin}</td></tr>` : ''}
    <tr><td align="center" style="padding:14px 24px;background:#f6f9fd;border-top:1px solid #eef1f6;font-size:11.5px;color:#8a97a8;">Message automatique — merci de ne pas y répondre.</td></tr>
  </table>
</td></tr></table>
</body></html>`;
