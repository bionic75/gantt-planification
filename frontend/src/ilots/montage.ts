// Montage des îlots Vue dans les onglets de la page existante : à la première ouverture de l'onglet (classe « active »
// posée par l'ancien code), démontage à la fin de la session, nouveau montage à la prochaine ouverture.
// Un îlot peut aussi n'occuper qu'une section d'un onglet (sous-îlot) : il se monte dans son propre conteneur, placé
// dans l'onglet, à l'ouverture de cet onglet. L'onglet d'une application (Déplacements…) garde sa classe « active » quand
// l'application est masquée : son îlot ne se monte que si le conteneur de l'application est affiché.
import { createPinia, type Pinia } from 'pinia';
import { createApp, ref, type App, type Component, type Ref } from 'vue';
import { CLE_ACTIVATIONS } from '@/ilots/activation';
import { ecouter } from '@/liaison';

/** Composant racine d'un îlot, chargé à la demande (fichier séparé dans le build) */
export type ChargeurIlot = () => Promise<{ default: Component }>;

/**
 * Sous-îlot : section d'un onglet (identifiant du conteneur de l'onglet, ex. « admin »), ou onglet d'une application
 * (identifiant du conteneur de l'application, affiché ou masqué par l'ancien code, ex. « deplacementsContainer »)
 */
export interface SousIlot {
    chargeur: ChargeurIlot;
    onglet: string;
    application?: string;
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
    /** Conteneur de l'application (onglet d'une application) : l'îlot ne se monte que s'il est affiché */
    application: HTMLElement | null;
    chargeur: ChargeurIlot;
    app: App | null;
    /** Nombre de réouvertures de l'onglet depuis le montage */
    activations: Ref<number>;
    actif: boolean;
    observateur: MutationObserver | null;
}

const estActif = (el: HTMLElement) => el.classList.contains('active');

/**
 * Mire de connexion affichée (aucune session) : elle masque l'application sans retirer la classe « active » de
 * l'onglet courant (Ressources au chargement de la page). Un îlot monté alors appellerait l'API sans session
 */
const mire = () => document.getElementById('loginPage');

/** Magasin Pinia de la session en cours, partagé avec les fenêtres (ilots/fenetres.ts) */
let piniaPartagee: Pinia | null = null;
export const piniaDesIlots = (): Pinia => (piniaPartagee ??= createPinia());

/**
 * Surveille les conteneurs des îlots présents dans la page ; renvoie la fonction d'arrêt (tests)
 * @param registre îlots à monter
 * @param creerMagasin magasin Pinia partagé par les îlots (session…), recréé à chaque nouvelle session
 */
export function surveillerIlots(registre: RegistreIlots, creerMagasin: () => Pinia = createPinia): () => void {
    const ilots: IlotSurveille[] = [];
    let pinia = (piniaPartagee = creerMagasin());

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
        const pageMire = mire();
        // Mire affichée : onglet tenu pour fermé, l'îlot se monte quand la connexion masque la mire
        const actif =
            estActif(ilot.onglet) &&
            !(pageMire && estActif(pageMire)) &&
            (!ilot.application || ilot.application.style.display !== 'none');
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
        if (ilot.application)
            ilot.observateur.observe(ilot.application, { attributes: true, attributeFilter: ['style'] });
        surChangement(ilot);
    }

    for (const [id, entree] of Object.entries(registre)) {
        const conteneur = document.getElementById(id);
        const {
            chargeur,
            onglet: idOnglet,
            application: idApplication
        }: SousIlot = typeof entree === 'function' ? { chargeur: entree, onglet: id } : entree;
        const onglet = document.getElementById(idOnglet);
        const application = idApplication ? document.getElementById(idApplication) : null;
        if (!conteneur || !onglet || (idApplication && !application)) continue;
        const ilot: IlotSurveille = {
            conteneur,
            onglet,
            application,
            chargeur,
            app: null,
            activations: ref(0),
            actif: false,
            observateur: null
        };
        ilots.push(ilot);
        armer(ilot);
    }

    const pageMire = mire();
    const observateurMire = pageMire ? new MutationObserver(() => ilots.forEach(surChangement)) : null;
    if (pageMire) observateurMire?.observe(pageMire, { attributes: true, attributeFilter: ['class'] });

    // Fin de session : îlots démontés et nouveau magasin, aucune donnée d'un utilisateur visible par le suivant.
    // Un onglet resté marqué « active » (la mire de connexion le masque sans changer sa classe) n'est pas remonté
    // aussitôt : sans session, l'îlot appellerait l'API ; il l'est à la connexion suivante (mire masquée, onglet rouvert)
    const arreterEcoute = ecouter('session-terminee', () => {
        pinia = piniaPartagee = creerMagasin();
        for (const ilot of ilots) {
            ilot.app?.unmount();
            ilot.app = null;
            ilot.actif = false;
        }
    });

    return () => {
        arreterEcoute();
        observateurMire?.disconnect();
        for (const ilot of ilots) {
            ilot.app?.unmount();
            ilot.observateur?.disconnect();
        }
    };
}
