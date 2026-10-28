// Demande de confirmation partagée par les composants d'un îlot : le composant racine fournit la fenêtre
// (AppConfirmation), les autres l'appellent comme confirm() mais sans bloquer la page.
import { inject, provide, ref, type InjectionKey } from 'vue';

export interface DemandeConfirmation {
    message: string;
    labelConfirmer: string;
}

type Confirmer = (message: string, labelConfirmer?: string) => Promise<boolean>;

const CLE: InjectionKey<Confirmer> = Symbol('confirmation');

/** Dans le composant racine : état de la fenêtre à passer à AppConfirmation */
export function fournirConfirmation() {
    const demande = ref<DemandeConfirmation | null>(null);
    let reponse: ((ok: boolean) => void) | null = null;

    const repondre = (ok: boolean) => {
        demande.value = null;
        reponse?.(ok);
        reponse = null;
    };
    const confirmer: Confirmer = (message, labelConfirmer = 'Confirmer') => {
        reponse?.(false);
        demande.value = { message, labelConfirmer };
        return new Promise<boolean>(r => (reponse = r));
    };
    provide(CLE, confirmer);
    return { demande, repondre };
}

/** Dans un composant de l'îlot : demande de confirmation */
export function useConfirmation(): Confirmer {
    const confirmer = inject(CLE, null);
    if (!confirmer) throw new Error('Confirmation non fournie par le composant racine (fournirConfirmation)');
    return confirmer;
}
