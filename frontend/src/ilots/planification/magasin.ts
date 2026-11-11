// Planification : données de la grille (chargées à l'API), mois et filtres affichés, saisie enregistrée cellule par
// cellule, affectations en attente d'invitation Outlook. Partagé par l'onglet Planification et les fenêtres ouvertes
// depuis ses en-têtes (calendriers, recherche, invitations).
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { api } from '@/api/client';
import {
    apiPlanification,
    type AstreintePlanning,
    type CompteGrille,
    type Conges,
    type ParticulariteMad,
    type PeriodeMadGrille,
    type Planning
} from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import {
    ecouter,
    type DateParticuliere,
    type EtatInvitations,
    type EtatPlanning,
    type ExpertEnAttente
} from '@/evenements';
import { afficherSynchronisation } from '@/outils/synchronisation';
import { useSessionStore } from '@/stores/session';
import type { Periode } from './grille';
import { appliquer, suivreAffectation, type Changements, type Suivi } from './saisie';

type AffectationsSamu = Record<number, { principal: string[]; secondaire: string[] }>;

/** Délais des nouvelles tentatives d'enregistrement (ms) */
const NOUVELLES_TENTATIVES = [2000, 4000, 6000];

export const usePlanificationStore = defineStore('planification', () => {
    const session = useSessionStore();

    const ressources = shallowRef<Ressource[]>([]);
    const planning = shallowRef<Planning>({});
    /** Planning au chargement : référence des affectations en attente d'invitation */
    let initial: Planning = {};
    const comptes = shallowRef<CompteGrille[]>([]);
    const conges = shallowRef<Conges>({});
    const datesParticulieres = shallowRef<DateParticuliere[]>([]);
    const astreintes = shallowRef<AstreintePlanning[]>([]);
    const historiqueMad = shallowRef<Record<number, PeriodeMadGrille[]>>({});
    const particularites = shallowRef<Record<number, ParticulariteMad[]>>({});
    const affectationsSamu = shallowRef<AffectationsSamu>({});
    const charge = ref(false);

    // Affichage
    const maintenant = new Date();
    const annee = ref(maintenant.getFullYear());
    const mois = ref(maintenant.getMonth());
    /** Identifiants des ressources choisies (« » : toutes) */
    const filtreRessources = ref<string[]>([]);
    const filtreFonctions = ref<string[]>([]);

    // Saisie de la session
    const enAttente = ref<Record<string, ExpertEnAttente>>({});
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    /** Demi-journées déjà modifiées pendant la session : plus de confirmation */
    const modifiees = new Set<string>();

    let chargement: Promise<void> | null = null;

    async function chargerRessources() {
        const liste = await apiPlanification.ressources();
        ressources.value = liste;
        // Historique des MAD et particularités de chaque ressource (en parallèle)
        const historiques: Record<number, PeriodeMadGrille[]> = {};
        const parts: Record<number, ParticulariteMad[]> = {};
        await Promise.all(
            liste.map(async r => {
                try {
                    const h = await apiPlanification.historiqueMad(r.id);
                    historiques[r.id] = h;
                    parts[r.id] = (
                        await Promise.all(h.map(p => apiPlanification.particularites(r.id, p.id).catch(() => [])))
                    ).flat();
                } catch {
                    // Ressource sans historique lisible : calcul sur ses dates
                }
            })
        );
        historiqueMad.value = historiques;
        particularites.value = parts;
        const samu: AffectationsSamu = {};
        try {
            for (const a of await apiPlanification.affectationsSamu()) {
                samu[a.resource_id] ??= { principal: [], secondaire: [] };
                samu[a.resource_id]![a.role].push(a.samu);
            }
        } catch {
            // Infobulles sans SAMU
        }
        affectationsSamu.value = samu;
    }

    async function chargerPlanning() {
        const p = await apiPlanification.planning();
        planning.value = p;
        initial = { ...p };
    }

    async function chargerComptes() {
        const s = await session.charger();
        comptes.value = await apiPlanification.comptes(s.activeProfile === 'admin').catch(() => []);
    }

    async function chargerConges(fichiers = false) {
        try {
            conges.value = fichiers
                ? (await apiPlanification.congesDesFichiers()).periods || {}
                : (await apiPlanification.conges()).holidays || {};
        } catch {
            // Congés inchangés
        }
    }

    async function chargerDates() {
        datesParticulieres.value =
            (await apiPlanification.datesParticulieres().catch(() => ({ dates: [] }))).dates || [];
    }

    async function chargerAstreintes() {
        astreintes.value = await apiPlanification.astreintes().catch(() => astreintes.value);
    }

    /** Chargement complet, une seule fois (appels simultanés regroupés) */
    function charger(): Promise<void> {
        chargement ??= (async () => {
            await Promise.all([
                chargerRessources(),
                chargerPlanning(),
                chargerComptes(),
                chargerConges(),
                chargerDates(),
                chargerAstreintes()
            ]);
            charge.value = true;
        })();
        return chargement;
    }

    // Données modifiées ailleurs (autres écrans) : rechargées, si elles ont déjà été chargées (magasin créé
    // aussi par l'en-tête, pour l'enveloppe des invitations, avant toute ouverture de la Planification)
    const siCharge = (fn: () => void) => () => {
        if (chargement) fn();
    };
    const arrets = [
        ecouter(
            'evenements-modifies',
            siCharge(() => void chargerDates())
        ),
        ecouter(
            'dates-particulieres-modifiees',
            siCharge(() => void chargerDates())
        ),
        ecouter(
            'conges-modifies',
            siCharge(() => void chargerConges(true))
        ),
        ecouter(
            'ressources-rechargees',
            siCharge(() => void chargerRessources())
        ),
        ecouter(
            'utilisateurs-modifies',
            siCharge(() => void chargerComptes())
        ),
        ecouter(
            'planning-modifie',
            siCharge(() => void chargerPlanning())
        ),
        ecouter(
            'astreintes-modifiees',
            siCharge(() => void chargerAstreintes())
        ),
        ecouter(
            'grille-a-rafraichir',
            siCharge(() => {
                void chargerPlanning();
                void chargerComptes();
                void chargerAstreintes();
            })
        )
    ];
    const arretSession = ecouter('session-terminee', () => {
        arrets.forEach(a => a());
        arretSession();
    });

    /** Enregistre les cellules modifiées (nouvelles tentatives en cas d'échec, comme l'ancien écran) */
    async function enregistrer(changements: Changements, tentative = 0): Promise<void> {
        const updates = Object.entries(changements).map(([key, value]) => ({ key, value }));
        try {
            await apiPlanification.enregistrer(updates);
            afficherSynchronisation();
            void apiPlanification.journaliser('Modification du planning').catch(() => {});
        } catch (e) {
            const delai = NOUVELLES_TENTATIVES[tentative];
            if (delai === undefined) {
                console.error('Erreur enregistrement du planning', e);
                return;
            }
            await new Promise(r => setTimeout(r, delai));
            await enregistrer(changements, tentative + 1);
        }
    }

    /**
     * Saisie d'une demi-journée : planning mis à jour, affectation suivie pour les invitations, cellules enregistrées
     */
    function saisir(
        ressource: Ressource,
        date: string,
        periode: Periode,
        changements: Changements,
        suivi: Suivi | null
    ) {
        planning.value = appliquer(planning.value, changements);
        if (suivi) {
            const e = { ...enAttente.value };
            suivreAffectation(e, initial, planning.value, ressource, comptes.value, date, periode, suivi);
            enAttente.value = e;
        }
        void enregistrer(changements);
    }

    /** Experts notifiés ou abandonnés : retirés des affectations en attente */
    function retirerInvitations(ressourceIds: number[]) {
        const e = { ...enAttente.value };
        for (const id of ressourceIds) delete e[String(id)];
        enAttente.value = e;
    }

    /**
     * Déconnexion : affectations en attente jamais envoyées par invitation journalisées, sans courriel (elles restent
     * en attente jusqu'à la fin de la session)
     */
    async function journaliserInvitations() {
        const modifications = Object.entries(enAttente.value).flatMap(([id, d]) =>
            d.assignments.map(a => ({
                resourceId: Number(id),
                resourceName: `${d.expertPrenom} ${d.expertNom}`,
                date: a.date,
                period: a.period === 'AM' ? 'Matin' : 'Après-midi',
                activity: a.activity,
                location: a.location || '-',
                emailSent: false
            }))
        );
        if (!modifications.length) return;
        await api.post('/logs/save-planning-modifications', { modifications }).catch(() => {});
    }

    const etatInvitations = (): EtatInvitations => ({ sessionId, experts: enAttente.value });

    /** Données de la grille pour les fenêtres de consultation (calendriers, recherche) */
    const etatPlanning = computed((): EtatPlanning => ({
        ressources: ressources.value,
        planning: planning.value,
        datesParticulieres: datesParticulieres.value,
        conges: conges.value,
        historiqueMad: historiqueMad.value,
        annee: annee.value,
        mois: mois.value,
        filtre: filtreRessources.value
    }));

    return {
        ressources,
        planning,
        comptes,
        conges,
        datesParticulieres,
        astreintes,
        historiqueMad,
        particularites,
        affectationsSamu,
        charge,
        annee,
        mois,
        filtreRessources,
        filtreFonctions,
        enAttente,
        modifiees,
        charger,
        saisir,
        retirerInvitations,
        journaliserInvitations,
        etatInvitations,
        etatPlanning
    };
});
