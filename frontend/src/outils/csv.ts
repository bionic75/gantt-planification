// Cellules des exports CSV ouverts dans un tableur (Excel, LibreOffice)

/** Nombre pur (« -12 », « +3,5 ») : laissé tel quel */
const NOMBRE = /^[+-]?\d+([.,]\d+)?$/;

/**
 * Formule neutralisée : une valeur saisie qui commence par « = », « + », « - », « @ », une tabulation ou un retour
 * chariot serait interprétée comme une formule par le tableur. Elle est préfixée d'une apostrophe, sauf les nombres et
 * un caractère isolé (« - » des cases vides).
 */
export function sansFormule(valeur: unknown): string {
    const s = String(valeur ?? '');
    return s.length > 1 && /^[=+\-@\t\r]/.test(s) && !NOMBRE.test(s) ? `'${s}` : s;
}

/** Cellule entre guillemets (guillemets doublés), formule neutralisée */
export const celluleCsv = (valeur: unknown) => `"${sansFormule(valeur).replace(/"/g, '""')}"`;
