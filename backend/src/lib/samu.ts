/**
 * Numéro de SAMU extrait d'un libellé (« SAMU-SAS 25 », « 🚨 SAMU 25 », « SAMU 2A »),
 * pour rapprocher planification, déploiements et CRA
 */
export function samuNumber(label: unknown): string | null {
    const m = /(\d+[A-Za-z]?)\s*$/.exec(String(label || '').trim());
    return m ? m[1].toUpperCase() : null;
}
