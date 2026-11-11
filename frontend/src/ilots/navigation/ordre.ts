// Ordre des onglets de la Planification choisi par glisser-déposer, mémorisé dans le navigateur pour l'utilisateur
// (localStorage « tabOrder_{id} », clé de l'ancien code)

const cle = (userId: number) => `tabOrder_${userId}`;

/** Ordre mémorisé, complété par les onglets absents de la mémoire (dans l'ordre d'origine) */
export function ordreMemorise(userId: number, origine: string[]): string[] {
    let memorise: unknown;
    try {
        memorise = JSON.parse(localStorage.getItem(cle(userId)) || 'null');
    } catch {
        memorise = null;
    }
    if (!Array.isArray(memorise)) return [...origine];
    const connus = memorise.filter((o): o is string => typeof o === 'string' && origine.includes(o));
    return [...new Set([...connus, ...origine])];
}

export function memoriserOrdre(userId: number, ordre: string[]) {
    try {
        localStorage.setItem(cle(userId), JSON.stringify(ordre));
    } catch {
        /* stockage indisponible */
    }
}

/**
 * Onglet déposé sur un autre : placé après lui s'il venait d'avant, sinon avant lui (comme l'ancienne barre)
 */
export function reordonner(ordre: string[], source: string, cible: string): string[] {
    const de = ordre.indexOf(source);
    const vers = ordre.indexOf(cible);
    if (de < 0 || vers < 0 || de === vers) return ordre;
    const reste = ordre.filter(o => o !== source);
    const position = reste.indexOf(cible) + (de < vers ? 1 : 0);
    return [...reste.slice(0, position), source, ...reste.slice(position)];
}
