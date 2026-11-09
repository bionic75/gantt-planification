// Aide à l'affectation › planning des déploiements : déploiements, étapes et couleurs, ressources ; préférences
// d'affichage (échelle, tri, période, lignes retirées, étapes masquées, largeur de la colonne SAMU), mémorisées dans le
// navigateur sous les clés de l'ancien écran
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { apiAffectation, type ConfigAffectation, type Deploiement, type RessourceAffectable } from '@/api/affectation';
import { bornesValides, type BornesGrille, type CleTri, type ContexteGrille, type TriGrille } from './grille';
import type { Echelle } from './outils';

const lire = <T>(cle: string, defaut: T): T => {
    try {
        const v = localStorage.getItem(cle);
        return v === null ? defaut : (JSON.parse(v) as T);
    } catch {
        return defaut;
    }
};
const ecrire = (cle: string, valeur: unknown) => {
    try {
        if (valeur === null) localStorage.removeItem(cle);
        else localStorage.setItem(cle, typeof valeur === 'string' ? valeur : JSON.stringify(valeur));
    } catch {
        /* stockage indisponible */
    }
};

export const LARGEUR_SAMU_MIN = 140;
export const LARGEUR_SAMU_MAX = 700;

export const usePlanningAffectationStore = defineStore('affectation-planning', () => {
    const deploiements = shallowRef<Deploiement[]>([]);
    const config = shallowRef<ConfigAffectation | null>(null);
    const ressources = shallowRef<RessourceAffectable[]>([]);
    const externes = shallowRef<RessourceAffectable[]>([]);
    const charge = ref(false);
    const erreur = ref('');
    /** Nombre de rechargements (grille redessinée à position de défilement conservée) */
    const version = ref(0);

    const zoom = ref<Echelle>('day');
    const tri = ref<TriGrille>({ key: 'samu', dir: 1 });
    const bornes = ref<BornesGrille | null>(bornesValides(lire<BornesGrille | null>('affPlanRange', null)));
    const retirees = ref(new Set<number>(lire<number[]>('affHiddenRows', [])));
    const masquees = ref(new Set<string>(lire<string[]>('affHiddenStages', [])));
    const largeurSamu = ref(
        Math.max(
            LARGEUR_SAMU_MIN,
            Math.min(LARGEUR_SAMU_MAX, parseInt(String(lire<number | string>('affSamW', 280)), 10) || 280)
        )
    );

    const contexte = computed<ContexteGrille>(() => ({
        deploiements: deploiements.value,
        config: config.value,
        ressources: ressources.value,
        externes: externes.value,
        masquees: masquees.value
    }));

    async function relireDeploiements() {
        deploiements.value = (await apiAffectation.deploiements()).projects;
        version.value++;
    }

    /**
     * Étapes, couleurs, déploiements et ressources ; puis participants des événements repris comme ressources affectées
     * (si quelque chose a changé, les déploiements sont relus)
     */
    async function charger() {
        erreur.value = '';
        try {
            const [cfg, proj, res] = await Promise.all([
                apiAffectation.config(),
                apiAffectation.deploiements(),
                apiAffectation.ressources().catch(() => null)
            ]);
            if (res) {
                ressources.value = res.resources;
                externes.value = res.externals ?? [];
            }
            deploiements.value = proj.projects;
            config.value = cfg;
            charge.value = true;
            version.value++;
        } catch (e) {
            erreur.value = e instanceof Error ? e.message : String(e);
            return;
        }
        apiAffectation
            .synchroniserDepuisEvenements()
            .then(async sy => {
                if ((sy.changes ?? []).length) await relireDeploiements();
            })
            .catch(() => {
                /* ignoré */
            });
    }

    /** Ressources (affectation) : relues si elles n'ont pas encore été chargées */
    async function chargerRessources() {
        if (ressources.value.length || externes.value.length) return;
        const r = await apiAffectation.ressources();
        ressources.value = r.resources;
        externes.value = r.externals ?? [];
    }

    function trier(key: CleTri) {
        tri.value = tri.value.key === key ? { key, dir: tri.value.dir === 1 ? -1 : 1 } : { key, dir: 1 };
    }

    function basculerEtape(k: string) {
        const s = new Set(masquees.value);
        if (s.has(k)) s.delete(k);
        else s.add(k);
        masquees.value = s;
        ecrire('affHiddenStages', [...s]);
    }

    function definirRetirees(s: Set<number>) {
        retirees.value = s;
        ecrire('affHiddenRows', [...s]);
    }
    const retirer = (id: number) => definirRetirees(new Set([...retirees.value, id]));
    const retablir = (id: number) => definirRetirees(new Set([...retirees.value].filter(x => x !== id)));
    const toutRetablir = () => definirRetirees(new Set());
    const afficherSamu = (id: number, oui: boolean) => (oui ? retablir(id) : retirer(id));
    const afficherTous = (oui: boolean) =>
        definirRetirees(oui ? new Set() : new Set(deploiements.value.map(p => p.id)));

    function definirBornes(b: BornesGrille | null) {
        bornes.value = b;
        ecrire('affPlanRange', b);
    }

    function definirLargeurSamu(w: number, memoriser: boolean) {
        largeurSamu.value = Math.max(LARGEUR_SAMU_MIN, Math.min(LARGEUR_SAMU_MAX, Math.round(w)));
        if (memoriser) ecrire('affSamW', String(largeurSamu.value));
    }

    /** Déploiement modifié par l'affectation (ressources et journées d'une étape) */
    function mettreAJour(p: Deploiement) {
        deploiements.value = deploiements.value.map(x => (x.id === p.id ? p : x));
        version.value++;
    }

    return {
        deploiements,
        config,
        ressources,
        externes,
        charge,
        erreur,
        version,
        zoom,
        tri,
        bornes,
        retirees,
        masquees,
        largeurSamu,
        contexte,
        charger,
        relireDeploiements,
        chargerRessources,
        trier,
        basculerEtape,
        retirer,
        retablir,
        toutRetablir,
        afficherSamu,
        afficherTous,
        definirBornes,
        definirLargeurSamu,
        mettreAJour
    };
});
