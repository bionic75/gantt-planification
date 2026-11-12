// @ts-check
// Échappement HTML des données insérées dans les emails et les documents PDF (noms, commentaires, libellés…) :
// une donnée saisie par un utilisateur ne doit pas pouvoir injecter du HTML, des liens ou des scripts.

/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Texte échappé pour un contenu ou un attribut HTML (null / undefined : chaîne vide)
 * @param {unknown} value
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, c => ENTITIES[c]);
}

/** Texte multiligne échappé, retours à la ligne en <br> */
export const escapeHtmlLines = (/** @type {unknown} */ value) => escapeHtml(value).replace(/\r?\n/g, '<br>');
