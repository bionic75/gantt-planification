// @ts-check

/**
 * Numéro de SAMU extrait d'un libellé (« SAMU-SAS 25 », « 🚨 SAMU 25 », « SAMU 2A »),
 * pour rapprocher planification, déploiements et CRA
 * @param {unknown} label
 * @returns {string | null}
 */
export function samuNumber(label) {
    const m = /(\d+[A-Za-z]?)\s*$/.exec(String(label || '').trim());
    return m ? m[1].toUpperCase() : null;
}
