// Montage des îlots Vue dans les onglets de la page existante : à la première ouverture de l'onglet (classe « active »
// posée par l'ancien code), démontage à la fin de la session, nouveau montage à la prochaine ouverture.
import { createPinia, type Pinia } from 'pinia';
import { createApp, type App, type Component } from 'vue';
import { ecouter } from '@/liaison';

/** Composant racine d'un îlot, chargé à la demande (fichier séparé dans le build) */
export type ChargeurIlot = () => Promise<{ default: Component }>;

/** Îlots : identifiant du conteneur de l'onglet (ex. « tripadvisor ») → composant racine */
export type RegistreIlots = Record<string, ChargeurIlot>;

interface IlotSurveille {
    conteneur: HTMLElement;
    chargeur: ChargeurIlot;
    app: App | null;
    observateur: MutationObserver | null;
}

const estActif = (el: HTMLElement) => el.classList.contains('active');

/**
 * Surveille les conteneurs des îlots présents dans la page ; renvoie la fonction d'arrêt (tests)
 * @param registre îlots à monter
 * @param creerMagasin magasin Pinia partagé par les îlots (session…), recréé à chaque nouvelle session
 */
export function surveillerIlots(registre: RegistreIlots, creerMagasin: () => Pinia = createPinia): () => void {
    const ilots: IlotSurveille[] = [];
    let pinia = creerMagasin();

    async function monter(ilot: IlotSurveille) {
        if (ilot.app) return;
        ilot.observateur?.disconnect();
        ilot.observateur = null;
        const { default: composant } = await ilot.chargeur();
        const app = createApp(composant);
        app.use(pinia);
        ilot.app = app;
        // Contenu de l'ancien onglet remplacé par l'îlot ; le conteneur (id, classes) est conservé
        app.mount(ilot.conteneur);
    }

    /** Montage immédiat si l'onglet est affiché, sinon à sa première ouverture */
    function armer(ilot: IlotSurveille) {
        if (estActif(ilot.conteneur)) {
            void monter(ilot);
            return;
        }
        ilot.observateur = new MutationObserver(() => {
            if (estActif(ilot.conteneur)) void monter(ilot);
        });
        ilot.observateur.observe(ilot.conteneur, { attributes: true, attributeFilter: ['class'] });
    }

    for (const [id, chargeur] of Object.entries(registre)) {
        const conteneur = document.getElementById(id);
        if (!conteneur) continue;
        const ilot: IlotSurveille = { conteneur, chargeur, app: null, observateur: null };
        ilots.push(ilot);
        armer(ilot);
    }

    // Fin de session : îlots démontés et nouveau magasin, aucune donnée d'un utilisateur visible par le suivant
    const arreterEcoute = ecouter('session-terminee', () => {
        pinia = creerMagasin();
        for (const ilot of ilots) {
            ilot.app?.unmount();
            ilot.app = null;
            ilot.observateur?.disconnect();
            armer(ilot);
        }
    });

    return () => {
        arreterEcoute();
        for (const ilot of ilots) {
            ilot.app?.unmount();
            ilot.observateur?.disconnect();
        }
    };
}
