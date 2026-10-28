// Liaison entre l'interface Vue (îlots) et l'ancien code de la page (public/js) : événements du navigateur préfixés
// « gp: », émis et écoutés des deux côtés. Disparaît avec l'ancien code (phase 6 de docs/migration-vue.md).

/** Événements échangés et leur contenu */
export interface EvenementsLiaison {
    /** Déconnexion ou session perdue (émis par resetUiForLogin de l'ancien code) */
    'session-terminee': undefined;
    /** Session refusée par le serveur lors d'un appel d'un îlot (401) : l'ancien code renvoie vers la mire */
    'session-perdue': { message?: string };
}

export type NomEvenement = keyof EvenementsLiaison;

const prefixe = (nom: NomEvenement) => `gp:${nom}`;

export function emettre<N extends NomEvenement>(nom: N, detail?: EvenementsLiaison[N]): void {
    window.dispatchEvent(new CustomEvent(prefixe(nom), { detail }));
}

/** Abonnement ; renvoie la fonction de désabonnement */
export function ecouter<N extends NomEvenement>(nom: N, fn: (detail: EvenementsLiaison[N]) => void): () => void {
    const handler = (e: Event) => fn((e as CustomEvent<EvenementsLiaison[N]>).detail);
    window.addEventListener(prefixe(nom), handler);
    return () => window.removeEventListener(prefixe(nom), handler);
}

/** Fonction globale de l'ancien code qui ramène sur la mire de connexion (public/js/app/core.js) */
interface FenetreAncienCode {
    forceSessionEnd?: (message?: string) => void;
}

/** Session perdue : l'ancien code (mire, démontage de l'interface) prend le relais */
export function installerLiaisonAncienCode(): void {
    ecouter('session-perdue', detail => {
        (window as unknown as FenetreAncienCode).forceSessionEnd?.(detail?.message);
    });
}
