// Jeton du lien de réinitialisation du mot de passe reçu par e-mail (« /?reset_token=… ») : retiré de l'adresse dès le
// chargement de la page (historique, en-tête Referer), avant que le routeur ne lise l'adresse, puis remis à la mire.

let enAttente: string | null = null;

/** Jeton retiré de l'adresse et gardé pour la mire */
export function retirerJetonDeLAdresse(): void {
    const params = new URLSearchParams(window.location.search);
    const jeton = params.get('reset_token');
    if (!jeton) return;
    enAttente = jeton;
    params.delete('reset_token');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
}

/** Jeton du lien, remis une seule fois ; null sans lien */
export function prendreJeton(): string | null {
    retirerJetonDeLAdresse();
    const jeton = enAttente;
    enAttente = null;
    return jeton;
}
