// Bandeau « Données synchronisées » de l'onglet Ressources (#syncStatus), affiché quelques secondes après une
// modification des ressources ou des comptes.

let masquage: ReturnType<typeof setTimeout> | undefined;

/** Bandeau affiché quelques secondes ; sans effet onglet fermé */
export function afficherSynchronisation(): void {
    const bandeau = document.getElementById('syncStatus');
    if (!bandeau) return;
    bandeau.hidden = false;
    clearTimeout(masquage);
    masquage = setTimeout(() => (bandeau.hidden = true), 3000);
}
