// Échappement HTML des données insérées dans les emails et les documents PDF (noms, commentaires, libellés…) :
// une donnée saisie par un utilisateur ne doit pas pouvoir injecter du HTML, des liens ou des scripts.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Texte échappé pour un contenu ou un attribut HTML (null / undefined : chaîne vide) */
export function escapeHtml(value: unknown) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, c => ENTITIES[c]);
}

/** Texte multiligne échappé, retours à la ligne en <br> */
export const escapeHtmlLines = (value: unknown) => escapeHtml(value).replace(/\r?\n/g, '<br>');
