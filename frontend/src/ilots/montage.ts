// Montage des îlots Vue dans les onglets de la page existante : à la première ouverture de l'onglet (classe « active »
// posée par l'ancien code), démontage à la fin de la session, nouveau montage à la prochaine ouverture.
// Un îlot peut aussi n'occuper qu'une section d'un onglet (sous-îlot) : il se monte dans son propre conteneur, placé
// dans l'onglet, à l'ouverture de cet onglet. Une application entière (Suivi des déplacements…) se monte dans son
// conteneur quand l'ancien code l'affiche (style display) ; chaque nouvel affichage est une réouverture. L'onglet d'une
// application encore tenue par l'ancien code (Aide à l'affectation) se monte à son ouverture, application affichée.
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
 * Application entière (Suivi des déplacements…) : montée dans son conteneur quand l'ancien code l'affiche
 * (style display), sans onglet
 */
export interface IlotApplication {
    chargeur: ChargeurIlot;
    application: true;
}

/**
 * Onglet d'une application encore tenue par l'ancien code (Aide à l'affectation…) : monté à l'ouverture de l'onglet
 * (classe « active »), seulement si le conteneur de l'application (identifiant) est affiché ; l'onglet garde sa classe
 * « active » quand l'application est masquée
 */
export interface OngletApplication {
    chargeur: ChargeurIlot;
    application: string;
}

/**
 * Îlots : identifiant du conteneur → composant racine. Conteneur de l'onglet (ex. « tripadvisor »), conteneur
 * d'une section placé dans l'onglet (sous-îlot, ex. « adminLocalisations »), conteneur d'une application
 * (ex. « deplacementsContainer ») ou onglet d'une application (ex. « affectationEventsTab »)
 */
export type RegistreIlots = Record<string, ChargeurIlot | SousIlot | IlotApplication | OngletApplication>;

interface IlotSurveille {
    conteneur: HTMLElement;
    /** Élément dont la classe « active » déclenche le montage : l'onglet ; null pour une application entière */
    onglet: HTMLElement | null;
    /** Conteneur de l'application (entière, ou dont l'îlot est un onglet) : l'îlot ne se monte que s'il est affiché */
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
            (!ilot.onglet || estActif(ilot.onglet)) &&
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
        if (ilot.onglet) ilot.observateur.observe(ilot.onglet, { attributes: true, attributeFilter: ['class'] });
        if (ilot.application)
            ilot.observateur.observe(ilot.application, { attributes: true, attributeFilter: ['style'] });
        surChangement(ilot);
    }

    for (const [id, entree] of Object.entries(registre)) {
        const conteneur = document.getElementById(id);
        if (!conteneur) continue;
        let chargeur: ChargeurIlot;
        let onglet: HTMLElement | null = null;
        let application: HTMLElement | null = null;
        if (typeof entree === 'function') {
            chargeur = entree;
            onglet = conteneur;
        } else if ('application' in entree && entree.application === true) {
            // Application entière : son conteneur, affiché ou masqué par l'ancien code
            chargeur = entree.chargeur;
            application = conteneur;
        } else if ('application' in entree) {
            // Onglet d'une application : ouverture de l'onglet, application affichée
            chargeur = entree.chargeur;
            onglet = conteneur;
            application = document.getElementById(entree.application);
            if (!application) continue;
        } else {
            chargeur = entree.chargeur;
            onglet = document.getElementById(entree.onglet);
            if (!onglet) continue;
        }
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
