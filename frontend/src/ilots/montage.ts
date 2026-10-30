// Montage des îlots Vue dans les onglets de la page existante : à la première ouverture de l'onglet (classe « active »
// posée par l'ancien code), démontage à la fin de la session, nouveau montage à la prochaine ouverture.
// Un îlot peut aussi n'occuper qu'une section d'un onglet (sous-îlot) : il se monte dans son propre conteneur, placé
// dans l'onglet, à l'ouverture de cet onglet.
import { createPinia, type Pinia } from 'pinia';
import { createApp, ref, type App, type Component, type Ref } from 'vue';
import { CLE_ACTIVATIONS } from '@/ilots/activation';
import { ecouter } from '@/liaison';

/** Composant racine d'un îlot, chargé à la demande (fichier séparé dans le build) */
export type ChargeurIlot = () => Promise<{ default: Component }>;

/** Sous-îlot : section d'un onglet (identifiant du conteneur de l'onglet, ex. « admin ») */
export interface SousIlot {
    chargeur: ChargeurIlot;
    onglet: string;
}

/**
 * Îlots : identifiant du conteneur → composant racine. Conteneur de l'onglet (ex. « tripadvisor »), ou conteneur
 * d'une section placé dans l'onglet (sous-îlot, ex. « adminLocalisations »)
 */
export type RegistreIlots = Record<string, ChargeurIlot | SousIlot>;

interface IlotSurveille {
    conteneur: HTMLElement;
    /** Élément dont la classe « active » déclenche le montage : l'onglet */
    onglet: HTMLElement;
    chargeur: ChargeurIlot;
    app: App | null;
    /** Nombre de réouvertures de l'onglet depuis le montage */
    activations: Ref<number>;
    actif: boolean;
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
        const { default: composant } = await ilot.chargeur();
        if (ilot.app) return;
        const app = createApp(composant);
        app.use(pinia);
        ilot.activations = ref(0);
        app.provide(CLE_ACTIVATIONS, ilot.activations);
        ilot.app = app;
        // Contenu de l'ancien onglet remplacé par l'îlot ; le conteneur (id, classes) est conservé
        app.mount(ilot.conteneur);
    }

    /** Ouverture de l'onglet : montage la première fois, signal de réouverture ensuite */
    function surChangement(ilot: IlotSurveille) {
        const actif = estActif(ilot.onglet);
        if (actif && !ilot.actif) {
            if (ilot.app) ilot.activations.value++;
            else void monter(ilot);
        }
        ilot.actif = actif;
    }

    function armer(ilot: IlotSurveille) {
        ilot.actif = false;
        ilot.observateur ??= new MutationObserver(() => surChangement(ilot));
        ilot.observateur.observe(ilot.onglet, { attributes: true, attributeFilter: ['class'] });
        surChangement(ilot);
    }

    for (const [id, entree] of Object.entries(registre)) {
        const conteneur = document.getElementById(id);
        const { chargeur, onglet: idOnglet } = typeof entree === 'function' ? { chargeur: entree, onglet: id } : entree;
        const onglet = document.getElementById(idOnglet);
        if (!conteneur || !onglet) continue;
        const ilot: IlotSurveille = {
            conteneur,
            onglet,
            chargeur,
            app: null,
            activations: ref(0),
            actif: false,
            observateur: null
        };
        ilots.push(ilot);
        armer(ilot);
    }

    // Fin de session : îlots démontés et nouveau magasin, aucune donnée d'un utilisateur visible par le suivant
    const arreterEcoute = ecouter('session-terminee', () => {
        pinia = creerMagasin();
        for (const ilot of ilots) {
            ilot.app?.unmount();
            ilot.app = null;
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
