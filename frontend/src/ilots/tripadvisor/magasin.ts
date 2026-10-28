// SAMU-SAS TripAdVisor : lieux, filtres, trajet affiché et actions (notes, commentaires, lieux)
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    apiLieux,
    type Categorie,
    type CorpsLieu,
    type FiltresLieux,
    type Lieu,
    type MetaLieux,
    type ModeTrajet,
    type TrajetsLieu
} from '@/api/poi';
import { LISTE_CATEGORIES, LISTE_MODES } from './format';

const SANS_FILTRE: FiltresLieux = { loc: '', cat: '', creator: '', q: '' };

/** Trajet d'un lieu vers son SAMU-SAS (un seul affiché à la fois) */
export interface TrajetAffiche {
    id: number;
    donnees: TrajetsLieu | null;
    erreur: string;
    mode: ModeTrajet | null;
}

export const useLieuxStore = defineStore('tripadvisor', () => {
    const meta = ref<MetaLieux | null>(null);
    const lieux = ref<Lieu[]>([]);
    const estAdmin = ref(false);
    const userId = ref<number | null>(null);
    const filtres = ref<FiltresLieux>({ ...SANS_FILTRE });
    const erreur = ref('');
    /** Incrémenté à chaque rechargement de la liste : les avis ouverts se rechargent */
    const version = ref(0);
    const avisOuverts = ref<number[]>([]);
    const trajet = ref<TrajetAffiche | null>(null);
    /** Demande de centrage de la carte sur un lieu (compteur : même lieu redemandé) */
    const focus = ref<{ id: number; n: number } | null>(null);
    /** Fiche mise en évidence après un clic sur son marqueur */
    const enEvidence = ref<number | null>(null);
    let minuteurRecherche: ReturnType<typeof setTimeout> | undefined;
    let minuteurEvidence: ReturnType<typeof setTimeout> | undefined;

    const sansFiltre = computed(() => {
        const f = filtres.value;
        return !f.loc && !f.cat && !f.creator && !f.q.trim();
    });

    /** Nombre de lieux par typologie pour le SAMU-SAS choisi (ou tous), et total */
    const compteurs = computed(() => {
        const parCategorie = Object.fromEntries(LISTE_CATEGORIES.map(c => [c, 0])) as Record<Categorie, number>;
        for (const [lid, nombres] of Object.entries(meta.value?.counts ?? {})) {
            if (filtres.value.loc && lid !== filtres.value.loc) continue;
            for (const c of LISTE_CATEGORIES) parCategorie[c] += nombres[c] ?? 0;
        }
        const total = LISTE_CATEGORIES.reduce((s, c) => s + parCategorie[c], 0);
        return { parCategorie, total };
    });

    async function charger() {
        try {
            meta.value = await apiLieux.meta();
            await rafraichir();
        } catch (e) {
            erreur.value = (e as Error).message;
        }
    }

    /** Liste selon les filtres, puis compteurs et créateurs (qui suivent les ajouts et suppressions) */
    async function rafraichir() {
        try {
            const r = await apiLieux.liste(filtres.value);
            lieux.value = r.pois;
            estAdmin.value = r.isAdmin;
            userId.value = r.userId;
            erreur.value = '';
            trajet.value = null;
            version.value++;
            meta.value = await apiLieux.meta();
        } catch (e) {
            erreur.value = (e as Error).message;
        }
    }

    /** Choisir un SAMU-SAS affiche tous ses lieux : les autres filtres sont remis à zéro */
    function filtrer<K extends keyof FiltresLieux>(cle: K, valeur: FiltresLieux[K]) {
        clearTimeout(minuteurRecherche);
        if (cle === 'loc') filtres.value = { ...SANS_FILTRE, loc: valeur };
        else filtres.value = { ...filtres.value, [cle]: valeur };
        return rafraichir();
    }

    /** Recherche à la saisie, après une courte pause */
    function rechercher(q: string) {
        filtres.value = { ...filtres.value, q };
        clearTimeout(minuteurRecherche);
        minuteurRecherche = setTimeout(() => void rafraichir(), 300);
    }

    function reinitialiser() {
        clearTimeout(minuteurRecherche);
        filtres.value = { ...SANS_FILTRE };
        return rafraichir();
    }

    // ── Avis ───────────────────────────────────────────────────────────────

    function basculerAvis(id: number) {
        avisOuverts.value = avisOuverts.value.includes(id)
            ? avisOuverts.value.filter(x => x !== id)
            : [...avisOuverts.value, id];
    }

    async function apres(action: Promise<unknown>) {
        await action;
        await rafraichir();
    }

    const noter = (id: number, n: number) => apres(apiLieux.noter(id, n));
    const retirerNote = (id: number, autre?: number) => apres(apiLieux.retirerNote(id, autre));
    const commenter = (id: number, texte: string) => apres(apiLieux.commenter(id, texte));
    const modifierCommentaire = (cid: number, texte: string) => apres(apiLieux.modifierCommentaire(cid, texte));
    const supprimerCommentaire = (cid: number) => apres(apiLieux.supprimerCommentaire(cid));

    // ── Lieux ──────────────────────────────────────────────────────────────

    async function enregistrer(id: number | null, corps: CorpsLieu) {
        await apres(id ? apiLieux.modifier(id, corps) : apiLieux.creer(corps));
    }

    async function supprimer(id: number) {
        await apiLieux.supprimer(id);
        avisOuverts.value = avisOuverts.value.filter(x => x !== id);
        await rafraichir();
    }

    // ── Trajet et carte ────────────────────────────────────────────────────

    /** Ouvre le trajet d'un lieu (et ferme celui d'un autre), ou le ferme s'il est déjà ouvert */
    async function basculerTrajet(id: number) {
        if (trajet.value?.id === id) {
            trajet.value = null;
            return;
        }
        const t: TrajetAffiche = { id, donnees: null, erreur: '', mode: null };
        trajet.value = t;
        try {
            const donnees = await apiLieux.trajets(id);
            if (trajet.value?.id !== id) return;
            trajet.value = { ...t, donnees, mode: LISTE_MODES.find(m => !donnees.modes[m]?.error) ?? null };
        } catch (e) {
            if (trajet.value?.id === id) trajet.value = { ...t, erreur: (e as Error).message };
        }
    }

    function choisirMode(mode: ModeTrajet) {
        if (trajet.value?.donnees && !trajet.value.donnees.modes[mode]?.error) trajet.value = { ...trajet.value, mode };
    }

    function centrerSur(id: number) {
        focus.value = { id, n: (focus.value?.n ?? 0) + 1 };
    }

    function mettreEnEvidence(id: number) {
        enEvidence.value = id;
        clearTimeout(minuteurEvidence);
        minuteurEvidence = setTimeout(() => (enEvidence.value = null), 2500);
    }

    return {
        meta,
        lieux,
        estAdmin,
        userId,
        filtres,
        erreur,
        version,
        avisOuverts,
        trajet,
        focus,
        enEvidence,
        sansFiltre,
        compteurs,
        charger,
        rafraichir,
        filtrer,
        rechercher,
        reinitialiser,
        basculerAvis,
        noter,
        retirerNote,
        commenter,
        modifierCommentaire,
        supprimerCommentaire,
        enregistrer,
        supprimer,
        basculerTrajet,
        choisirMode,
        centrerSur,
        mettreEnEvidence
    };
});
