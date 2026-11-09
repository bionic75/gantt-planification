// Analyse de fichiers › état de l'application : fichier lu, lignes, types des filtres, filtres, colonnes affichées,
// doublons, page. Les lignes (jusqu'à plusieurs centaines de milliers) ne sont pas rendues réactives en profondeur.
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { clesEnDoublon, cleDoublon, filtrer, nombreFiltresActifs, type Filtre, type Filtres } from './filtres';
import { choisirLigneEntete, type FichierLu, type Ligne, type MetaFichier } from './lecture';
import { typesDesFiltres, type ColonneFiltrable } from './profil';

export const TAILLES_PAGE = [50, 100, 200, 500];

export const useAnalyseStore = defineStore('analyse', () => {
    /** Fichier lu (cellules) : changement de la ligne d'intitulés */
    const lu = shallowRef<FichierLu | null>(null);
    const nomFichier = ref('');
    const encodage = ref<string | null>(null);
    const meta = ref<MetaFichier | null>(null);
    const lignes = shallowRef<Ligne[]>([]);
    const entetes = ref<string[]>([]);
    const colonnes = shallowRef<Record<string, ColonneFiltrable>>({});
    const filtres = ref<Filtres>({});
    const visibles = ref<string[]>([]);
    const colonnesDoublons = ref<string[]>([]);
    const page = ref(1);
    const taillePage = ref(100);
    /** Nombre de fichiers intégrés : les saisies liées à un fichier (structure, filtres) repartent de zéro */
    const integrations = ref(0);

    const charge = computed(() => lignes.value.length > 0);
    const filtrees = computed(() => filtrer(lignes.value, entetes.value, colonnes.value, filtres.value));
    const nombreFiltres = computed(() => nombreFiltresActifs(filtres.value));
    const affichees = computed(() => visibles.value.filter(c => entetes.value.includes(c)));
    const doublons = computed(() => clesEnDoublon(lignes.value, colonnesDoublons.value));
    const enDoublon = (l: Ligne) =>
        colonnesDoublons.value.length > 0 && doublons.value.has(cleDoublon(l, colonnesDoublons.value));
    /** Lignes filtrées en doublon ; null sans colonne de comparaison */
    const lignesEnDoublon = computed(() =>
        colonnesDoublons.value.length ? filtrees.value.filter(enDoublon).length : null
    );
    const pages = computed(() => Math.max(1, Math.ceil(filtrees.value.length / taillePage.value)));
    const pageAffichee = computed(() => Math.min(page.value, pages.value));
    const lignesDeLaPage = computed(() =>
        filtrees.value.slice((pageAffichee.value - 1) * taillePage.value, pageAffichee.value * taillePage.value)
    );

    /** Lignes intégrées : types des filtres, toutes les colonnes affichées, filtres et doublons remis à zéro */
    function integrer(nouvelles: Ligne[], nom: string, enc: string | null, m: MetaFichier) {
        const premiere = nouvelles[0] ?? {};
        entetes.value = Object.keys(premiere);
        lignes.value = nouvelles;
        nomFichier.value = nom;
        encodage.value = enc;
        meta.value = m;
        colonnes.value = typesDesFiltres(nouvelles, entetes.value);
        filtres.value = {};
        page.value = 1;
        colonnesDoublons.value = [];
        visibles.value = [...entetes.value];
        integrations.value++;
    }

    function ouvrirFichier(fichier: FichierLu, nouvelles: Ligne[], nom: string) {
        lu.value = fichier;
        integrer(nouvelles, nom, fichier.encodage, fichier.meta);
    }

    function changerLigneEntete(valeur: string | number) {
        if (!lu.value) return;
        const r = choisirLigneEntete(lu.value, valeur);
        integrer(r.lignes, nomFichier.value, encodage.value, r.meta);
    }

    /** Colonnes renommées (structure) : ancien nom → nouveau nom */
    function renommer(noms: Map<string, string>) {
        const renommees = lignes.value.map(r => {
            const o: Ligne = {};
            for (const [ancien, nouveau] of noms) o[nouveau] = r[ancien] ?? '';
            return o;
        });
        integrer(renommees, nomFichier.value, encodage.value, { ...(meta.value ?? { kind: 'excel' }), mapped: true });
    }

    function reinitialiser() {
        lu.value = null;
        lignes.value = [];
        entetes.value = [];
        colonnes.value = {};
        filtres.value = {};
        visibles.value = [];
        colonnesDoublons.value = [];
        page.value = 1;
        nomFichier.value = '';
        encodage.value = null;
        meta.value = null;
    }

    /** Filtre d'une colonne (null : retiré) ; retour à la 1re page */
    function definirFiltre(col: string, f: Filtre) {
        const suivants = { ...filtres.value };
        if (f === null || f === undefined) delete suivants[col];
        else suivants[col] = f;
        filtres.value = suivants;
        page.value = 1;
    }

    function effacerFiltres() {
        filtres.value = {};
        page.value = 1;
    }

    function afficherColonne(col: string, visible: boolean) {
        if (visible) {
            if (!visibles.value.includes(col)) visibles.value = [...visibles.value, col];
        } else visibles.value = visibles.value.filter(c => c !== col);
    }

    function comparerColonne(col: string, oui: boolean) {
        if (oui) {
            if (!colonnesDoublons.value.includes(col)) colonnesDoublons.value = [...colonnesDoublons.value, col];
        } else colonnesDoublons.value = colonnesDoublons.value.filter(c => c !== col);
    }

    function comparerToutes(oui: boolean) {
        colonnesDoublons.value = oui ? [...entetes.value] : [];
    }

    function allerPage(n: number) {
        page.value = Math.max(1, Math.min(pages.value, n));
    }

    function changerTaillePage(n: number) {
        taillePage.value = n;
        page.value = 1;
    }

    return {
        lu,
        nomFichier,
        encodage,
        meta,
        lignes,
        entetes,
        colonnes,
        filtres,
        visibles,
        colonnesDoublons,
        page: pageAffichee,
        taillePage,
        integrations,
        charge,
        filtrees,
        nombreFiltres,
        affichees,
        lignesEnDoublon,
        pages,
        lignesDeLaPage,
        enDoublon,
        ouvrirFichier,
        integrer,
        changerLigneEntete,
        renommer,
        reinitialiser,
        definirFiltre,
        effacerFiltres,
        afficherColonne,
        comparerColonne,
        comparerToutes,
        allerPage,
        changerTaillePage
    };
});
