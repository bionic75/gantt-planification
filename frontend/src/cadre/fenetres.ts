// Fenêtres ouvertes par les boutons des en-têtes (événement « gp:fenetre-demandee ») : chaque fenêtre est chargée à sa
// première demande puis gardée pendant la session (cadre/FenetresDemandees.vue) ; les demandes suivantes lui sont
// signalées (surDemande).
import { inject, watch, type InjectionKey, type Ref } from 'vue';
import type { NomFenetre } from '@/evenements';
import type { ChargeurVue } from './vues';

/** Compteur des demandes d'ouverture de la fenêtre (1 à la première) */
export const CLE_DEMANDES: InjectionKey<Ref<number>> = Symbol('demandes-fenetre');

/** Fenêtres : nom → composant racine */
export const FENETRES: Record<NomFenetre, ChargeurVue> = {
    'calendrier-mensuel': () => import('@/ilots/consultation/CalendrierMensuel.vue'),
    'calendrier-evenements': () => import('@/ilots/consultation/CalendrierEvenements.vue'),
    'recherche-avancee': () => import('@/ilots/consultation/RechercheAvancee.vue'),
    'astreintes-hno': () => import('@/ilots/saisie/FenetreAstreintes.vue'),
    'demande-affectation': () => import('@/ilots/saisie/FenetreDemande.vue'),
    invitations: () => import('@/ilots/saisie/FenetreInvitations.vue'),
    'nouvelles-affectations': () => import('@/ilots/saisie/FenetreNouvellesAffectations.vue'),
    // Fenêtres Asana de l'aide à l'affectation (planning et administration)
    asana: () => import('@/ilots/affectation/asana/FenetresAsana.vue'),
    // Fenêtre « Mon profil », ouverte par le rond de l'utilisateur
    profil: () => import('@/ilots/profil/FenetreProfil.vue')
};

/** Composant racine d'une fenêtre : action à chaque demande d'ouverture, la première comprise */
export function surDemande(action: () => void): void {
    const demandes = inject(CLE_DEMANDES, null);
    if (demandes) watch(demandes, action, { immediate: true });
}
