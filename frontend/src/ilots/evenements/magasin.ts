// Événements : liste, référentiels (types, localisations, comptes), édition en cours et actions
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    apiEvenements,
    type Compte,
    type CorpsEvenement,
    type Evenement,
    type Localisation,
    type TypeEvenement
} from '@/api/evenements';
import { emettre } from '@/liaison';
import { useSessionStore } from '@/stores/session';

/** Message affiché au-dessus de la liste (inscription, erreur) */
export interface MessageEvenements {
    type: 'success' | 'error';
    texte: string;
}

export const useEvenementsStore = defineStore('evenements', () => {
    const evenements = ref<Evenement[]>([]);
    const estAdmin = ref(false);
    const userId = ref<number | null>(null);
    const profil = ref<string | null>(null);
    const types = ref<TypeEvenement[]>([]);
    const localisations = ref<Localisation[]>([]);
    /** Comptes proposés comme participants (administrateur : tous ; sinon liste publique) */
    const comptes = ref<Compte[]>([]);
    /** Personnes à solliciter (« Besoin de ressources ») : comptes actifs avec email (liste de l'administrateur) */
    const comptesSollicitables = ref<Compte[]>([]);
    const charge = ref(false);
    const message = ref<MessageEvenements | null>(null);
    /** Événement modifié dans le formulaire */
    const edition = ref<Evenement | null>(null);
    /** Demande d'ouverture du formulaire (compteur : même événement redemandé) */
    const ouvertureFormulaire = ref(0);
    /** Mois gardé déplié après la modification d'un événement */
    const moisEdite = ref<{ annee: number; mois: number } | null>(null);
    /** Incrémenté à chaque rechargement de la liste : dépliage de l'arbre remis à l'état initial */
    const version = ref(0);

    const typesParId = computed(() => new Map(types.value.map(t => [t.id, t])));

    async function chargerListe() {
        const r = await apiEvenements.liste();
        evenements.value = r.events ?? [];
        estAdmin.value = !!r.isAdmin;
        userId.value = r.userId ?? null;
        version.value++;
    }

    async function chargerTypes() {
        types.value = (await apiEvenements.types().catch(() => ({ types: [] }))).types ?? [];
    }

    async function chargerLocalisations() {
        localisations.value = (await apiEvenements.localisations().catch(() => ({ locations: [] }))).locations ?? [];
    }

    /** Ouverture de l'onglet : référentiels et liste */
    async function charger() {
        const session = await useSessionStore()
            .charger()
            .catch(() => null);
        profil.value = session?.activeProfile ?? null;
        const admin = profil.value === 'admin';
        await Promise.all([
            chargerTypes(),
            chargerLocalisations(),
            apiEvenements
                .comptes(admin)
                .then(c => (comptes.value = c))
                .catch(() => (comptes.value = [])),
            // Comme l'ancien écran : liste de l'administration demandée pour tous (refusée hors administrateur)
            apiEvenements
                .comptes(true)
                .then(c => (comptesSollicitables.value = c))
                .catch(() => (comptesSollicitables.value = [])),
            chargerListe().catch(() => undefined)
        ]);
        charge.value = true;
    }

    // ── Formulaire ─────────────────────────────────────────────────────────

    function modifier(ev: Evenement) {
        edition.value = ev;
        const [annee, mois] = ev.start_date.split('-').map(Number);
        moisEdite.value = { annee: annee ?? 0, mois: (mois ?? 1) - 1 };
        ouvertureFormulaire.value++;
    }

    function finEdition() {
        edition.value = null;
    }

    /** Enregistrement : liste rechargée, planning de l'ancien code mis à jour */
    async function enregistrer(corps: CorpsEvenement) {
        if (edition.value) await apiEvenements.modifier(edition.value.id, corps);
        else await apiEvenements.creer(corps);
        edition.value = null;
        await chargerListe();
        emettre('evenements-modifies');
    }

    async function supprimer(id: number) {
        await apiEvenements.supprimer(id);
        await chargerListe();
        emettre('evenements-modifies');
    }

    /** Inscription de l'expert : sa planification est mise à jour par le serveur */
    async function participer(id: number) {
        message.value = null;
        try {
            const r = await apiEvenements.participer(id);
            if (r.planningUpdated) {
                message.value = {
                    type: 'success',
                    texte:
                        `✅ Vous avez été inscrit(e) comme participant à "${r.eventLabel}".\n\n` +
                        `⚡ Votre planning a été mis à jour automatiquement :\n` +
                        `• Disponibilité : passée à "En attente" (code 2)\n` +
                        `• Affectation : passée à "Divers" (code 8) par défaut\n\n` +
                        `💡 Nous vous invitons à vérifier votre planning et à sélectionner un code d'affectation plus précis si nécessaire (ex: SAMU Déploiement, ANS Déploiement...).`
                };
                emettre('planning-modifie');
            }
            await chargerListe();
        } catch (e) {
            message.value = { type: 'error', texte: `Erreur lors de l'inscription : ${(e as Error).message}` };
        }
    }

    /** Localisation créée depuis le formulaire : listes rechargées ici et dans l'ancien code */
    async function localisationCreee() {
        await chargerLocalisations();
        emettre('localisations-modifiees');
    }

    return {
        evenements,
        estAdmin,
        userId,
        profil,
        types,
        typesParId,
        localisations,
        comptes,
        comptesSollicitables,
        charge,
        message,
        edition,
        ouvertureFormulaire,
        moisEdite,
        version,
        charger,
        chargerListe,
        chargerTypes,
        modifier,
        finEdition,
        enregistrer,
        supprimer,
        participer,
        localisationCreee
    };
});
