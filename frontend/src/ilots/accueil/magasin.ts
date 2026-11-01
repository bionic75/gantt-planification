// Accueil : données de la journée et de la semaine
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiAccueil } from '@/api/accueil';
import type { Evenement } from '@/api/evenements';
import { accesAccueil, type AccesAccueil } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import { debutMoisDecale, friseMois, lignesDeploiements, type Deploiement } from './deploiements';
import {
    ajouterJours,
    astreintesDuJour,
    cleDate,
    evenementsEntre,
    joursOuvres,
    presences,
    type AstreintesHo,
    type Planning,
    type RessourceAccueil
} from './calculs';

export const useAccueilStore = defineStore('accueil', () => {
    const planning = ref<Planning>({});
    const ressources = ref<RessourceAccueil[]>([]);
    const evenements = ref<Evenement[]>([]);
    const acces = ref<AccesAccueil | null>(null);
    const astreintesHo = ref<AstreintesHo | null>(null);
    const deploiements = ref<Deploiement[]>([]);
    const couleursEtapes = ref<Record<string, string>>({});
    /** Mois de décalage de la frise des déploiements avec le mois en cours */
    const decalageMois = ref(0);
    const MOIS_AFFICHES = 12;
    const prenom = ref<string | null>(null);
    const charge = ref(false);
    const erreur = ref<string | null>(null);
    /** Date du jour, relue à chaque chargement (l'onglet peut rester ouvert plusieurs jours) */
    const aujourdhui = ref(cleDate(new Date()));

    /** Semaines de décalage avec la semaine en cours affichée (négatif : précédentes) */
    const decalageSemaine = ref(0);
    const semaine = computed(() =>
        joursOuvres(ajouterJours(aujourdhui.value, 7 * decalageSemaine.value), aujourdhui.value)
    );
    const estSemaineEnCours = computed(() => decalageSemaine.value === 0);

    const astreintesHoAujourdhui = computed(() => astreintesDuJour(astreintesHo.value, aujourdhui.value));
    /** Expert déclaré pour les astreintes HO : peut s'y inscrire */
    const peutSInscrireHo = computed(() => astreintesHo.value?.me?.canEdit === true && !astreintesHo.value.me.isAdmin);

    const frise = computed(() => friseMois(debutMoisDecale(aujourdhui.value, decalageMois.value), MOIS_AFFICHES));
    const lignesFrise = computed(() =>
        lignesDeploiements(deploiements.value, frise.value, aujourdhui.value, couleursEtapes.value)
    );

    /** Décalage de la frise par trimestre ; 0 : retour au mois en cours */
    function changerFrise(delta: number) {
        decalageMois.value = delta === 0 ? 0 : decalageMois.value + delta;
    }

    function changerSemaine(delta: number) {
        decalageSemaine.value = delta === 0 ? 0 : decalageSemaine.value + delta;
    }
    /** Les événements couvrent toute la semaine, week-end compris (le tableau des présences : lundi à vendredi) */
    const dateFinSemaine = computed(() => ajouterJours(semaine.value[0]?.date ?? aujourdhui.value, 6));

    const presentsAujourdhui = computed(() =>
        presences(planning.value, ressources.value, [aujourdhui.value], aujourdhui.value)
    );
    const presentsSemaine = computed(() =>
        presences(
            planning.value,
            ressources.value,
            semaine.value.map(j => j.date),
            aujourdhui.value
        )
    );
    const evenementsAujourdhui = computed(() => evenementsEntre(evenements.value, aujourdhui.value, aujourdhui.value));
    const evenementsSemaine = computed(() =>
        evenementsEntre(evenements.value, semaine.value[0]?.date ?? aujourdhui.value, dateFinSemaine.value)
    );

    async function charger() {
        aujourdhui.value = cleDate(new Date());
        decalageSemaine.value = 0;
        decalageMois.value = 0;
        erreur.value = null;
        const session = await useSessionStore()
            .charger()
            .catch(() => null);
        prenom.value = session?.prenom ?? null;
        acces.value = accesAccueil();
        // Déploiements : réservés aux utilisateurs habilités à l'Aide à l'affectation
        const habilite = acces.value?.affectation === true;
        const [dep, cfg] = habilite
            ? await Promise.allSettled([apiAccueil.deploiements(), apiAccueil.configDeploiements()])
            : [null, null];
        deploiements.value = dep?.status === 'fulfilled' ? (dep.value.projects ?? []) : [];
        couleursEtapes.value = cfg?.status === 'fulfilled' ? (cfg.value.colors ?? {}) : {};
        astreintesHo.value = await apiAccueil.astreintesHo(aujourdhui.value.slice(0, 7)).catch(() => null);
        const [p, r, e] = await Promise.allSettled([
            apiAccueil.planning(),
            apiAccueil.ressources(),
            apiAccueil.evenements()
        ]);
        planning.value = p.status === 'fulfilled' ? p.value : {};
        ressources.value = r.status === 'fulfilled' ? r.value : [];
        evenements.value = e.status === 'fulfilled' ? (e.value.events ?? []) : [];
        if (p.status === 'rejected' || r.status === 'rejected') {
            erreur.value = 'Le planning n’a pas pu être chargé.';
        }
        charge.value = true;
    }

    return {
        acces,
        aujourdhui,
        charge,
        erreur,
        evenementsAujourdhui,
        evenementsSemaine,
        charger,
        prenom,
        presentsAujourdhui,
        presentsSemaine,
        astreintesHoAujourdhui,
        changerFrise,
        peutSInscrireHo,
        couleursEtapes,
        changerSemaine,
        frise,
        lignesFrise,
        decalageMois,
        estSemaineEnCours,
        semaine
    };
});
