// Fenêtres Vue ouvertes par des boutons de l'ancien code (en-têtes de la page, de la planification) : chaque fenêtre est
// chargée et montée à sa première demande (événement « gp:fenetre-demandee »), dans son propre conteneur ajouté à la
// page ; les demandes suivantes lui sont signalées. Démontage à la fin de la session.
import { createPinia } from 'pinia';
import { createApp, inject, ref, watch, type App, type InjectionKey, type Ref } from 'vue';
import type { ChargeurIlot } from '@/ilots/montage';
import { ecouter, type NomFenetre } from '@/liaison';

/** Compteur des demandes d'ouverture de la fenêtre (1 à la première) */
export const CLE_DEMANDES: InjectionKey<Ref<number>> = Symbol('demandes-fenetre');

export type RegistreFenetres = Partial<Record<NomFenetre, ChargeurIlot>>;

interface FenetreMontee {
    app: App;
    conteneur: HTMLElement;
    demandes: Ref<number>;
}

/** Surveille les demandes d'ouverture ; renvoie la fonction d'arrêt (tests) */
export function surveillerFenetres(registre: RegistreFenetres): () => void {
    const montees = new Map<NomFenetre, FenetreMontee>();
    const enChargement = new Set<NomFenetre>();
    // Session terminée pendant un chargement : la fenêtre n'est pas montée
    let session = 0;

    async function ouvrir(nom: NomFenetre) {
        const montee = montees.get(nom);
        if (montee) {
            montee.demandes.value++;
            return;
        }
        const chargeur = registre[nom];
        if (!chargeur || enChargement.has(nom)) return;
        enChargement.add(nom);
        const sessionDemande = session;
        try {
            const { default: composant } = await chargeur();
            if (sessionDemande !== session) return;
            const conteneur = document.createElement('div');
            conteneur.dataset.fenetre = nom;
            document.body.appendChild(conteneur);
            const demandes = ref(1);
            const app = createApp(composant);
            app.use(createPinia());
            app.provide(CLE_DEMANDES, demandes);
            app.mount(conteneur);
            montees.set(nom, { app, conteneur, demandes });
        } finally {
            enChargement.delete(nom);
        }
    }

    function toutDemonter() {
        for (const { app, conteneur } of montees.values()) {
            app.unmount();
            conteneur.remove();
        }
        montees.clear();
    }

    const arreterDemandes = ecouter('fenetre-demandee', detail => void ouvrir(detail.fenetre));
    const arreterSession = ecouter('session-terminee', () => {
        session++;
        toutDemonter();
    });

    return () => {
        arreterDemandes();
        arreterSession();
        toutDemonter();
    };
}

/** Composant racine d'une fenêtre : action à chaque demande d'ouverture, la première comprise */
export function surDemande(action: () => void): void {
    const demandes = inject(CLE_DEMANDES, null);
    if (demandes) watch(demandes, action, { immediate: true });
}
