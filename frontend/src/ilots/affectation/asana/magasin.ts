// Aide à l'affectation › Asana : fenêtres communes au planning et à l'administration (changements constatés, conflits
// à trancher, import, tâches d'un projet, message, annonce) et rafraîchissements. Magasin partagé par les îlots ; la
// fenêtre « asana » (FenetresAsana.vue) est montée à la première demande.
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiAsana, type ChangementAsana, type ConflitsDeploiement } from '@/api/asana';
import { emettre } from '@/evenements';

export interface DeploiementChange {
    samu: string;
    created: boolean;
    asana?: string;
    changes: ChangementAsana[];
}

/** Contenu de la fenêtre des changements constatés */
export interface Changements {
    titre: string;
    items: DeploiementChange[];
    unchanged?: string[];
    noMatch?: string[];
    errors?: { samu: string; error: string }[];
}

/** Import : export CSV chargé dans la fenêtre, ou projet Asana (lu par l'API) */
export type SourceImport = { type: 'csv' } | { type: 'api'; gid: string };

export interface Annonce {
    texte: string;
    erreur: boolean;
    /** Fermée d'un clic (rafraîchissement de tous les déploiements) */
    cliquable?: boolean;
}

export const useAsanaStore = defineStore('affectation-asana', () => {
    const changements = ref<Changements | null>(null);
    const conflits = ref<ConflitsDeploiement[]>([]);
    const importation = ref<SourceImport | null>(null);
    /** Déploiement dont les tâches du projet Asana sont affichées */
    const taches = ref<number | null>(null);
    const message = ref('');
    const annonce = ref<Annonce | null>(null);
    /** Rafraîchissement de tous les déploiements en cours */
    const toutEnCours = ref(false);
    /** Déploiements en cours de rafraîchissement */
    const enCours = ref(new Set<number>());

    /** Fenêtres montées à la première demande */
    const afficher = () => emettre('fenetre-demandee', { fenetre: 'asana' });
    const deploiementsModifies = () => emettre('deploiements-modifies');

    function annoncer(texte: string, erreur = false, duree = 4500, cliquable = false) {
        annonce.value = { texte, erreur, cliquable };
        afficher();
        setTimeout(() => {
            if (annonce.value?.texte === texte) annonce.value = null;
        }, duree);
    }

    function montrerChangements(c: Changements) {
        changements.value = c;
        afficher();
    }

    function montrerConflits(liste: ConflitsDeploiement[]) {
        const avec = liste.filter(x => x?.rows?.length);
        if (!avec.length) return;
        conflits.value = avec;
        afficher();
    }

    function montrerMessage(texte: string) {
        message.value = texte;
        afficher();
    }

    function ouvrirImport(source: SourceImport = { type: 'csv' }) {
        importation.value = source;
        afficher();
    }

    function ouvrirTaches(id: number) {
        taches.value = id;
        afficher();
    }

    /** Rafraîchissement d'un déploiement : changements constatés, conflits à trancher */
    async function rafraichir(id: number, bouton?: HTMLElement | null) {
        if (enCours.value.has(id)) return;
        enCours.value = new Set([...enCours.value, id]);
        // Bouton de la ligne de la grille (HTML de la grille, hors rendu Vue)
        bouton?.classList.add('aff-busy');
        try {
            const r = await apiAsana.rafraichir(id);
            if (r.unchanged) annoncer(`${r.samu_name} : déjà à jour avec Asana (${r.asana}).`);
            else if (r.updated || r.created)
                montrerChangements({
                    titre: `Changements issus d'Asana — ${r.samu_name}`,
                    items: [{ samu: r.samu_name, created: !!r.created, asana: r.asana, changes: r.changes ?? [] }]
                });
            if (r.conflicts?.length) montrerConflits([{ id, samu: r.samu_name, asana: r.asana, rows: r.conflicts }]);
            if (!r.unchanged && (r.updated || r.created)) deploiementsModifies();
        } catch (e) {
            annoncer((e as Error).message, true, 7000);
        } finally {
            const s = new Set(enCours.value);
            s.delete(id);
            enCours.value = s;
            bouton?.classList.remove('aff-busy');
        }
    }

    /** Rafraîchissement de tous les déploiements qui ont un projet Asana correspondant */
    async function toutRafraichir() {
        if (toutEnCours.value) return;
        toutEnCours.value = true;
        try {
            const r = await apiAsana.toutRafraichir();
            montrerChangements({
                titre: 'Rafraîchissement depuis Asana — changements constatés',
                items: r.updated.map(u => ({ samu: u.samu, created: false, asana: u.asana, changes: u.changes })),
                unchanged: r.unchanged,
                noMatch: r.noMatch,
                errors: r.errors
            });
            if (r.updated.length) deploiementsModifies();
            montrerConflits(r.conflicts);
        } catch (e) {
            annoncer((e as Error).message, true, 12000, true);
        } finally {
            toutEnCours.value = false;
        }
    }

    return {
        changements,
        conflits,
        importation,
        taches,
        message,
        annonce,
        toutEnCours,
        enCours,
        annoncer,
        montrerChangements,
        montrerConflits,
        montrerMessage,
        ouvrirImport,
        ouvrirTaches,
        rafraichir,
        toutRafraichir,
        deploiementsModifies
    };
});
