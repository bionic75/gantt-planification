// Localisations (administration) : liste, localisation en modification, message d'état, actions
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiLocalisations, type DonneesLocalisation, type Localisation } from '@/api/localisations';
import { emettre } from '@/liaison';
import {
    analyserCsv,
    donneesConflit,
    libelleSeparateur,
    repartir,
    resumeImport,
    type Conflit,
    type LigneCsv,
    type UsageNomme
} from './calculs';

/** Message sous l'import (import, suppression) */
export interface Statut {
    texte: string;
    /** Séparateur et en-têtes lus (colonnes introuvables) */
    detail?: { separateur: string; entetes: string[] };
    /** Premières lignes lues (import en cours) */
    apercu?: LigneCsv[];
}

export const useLocalisationsStore = defineStore('admin-localisations', () => {
    const localisations = ref<Localisation[]>([]);
    const charge = ref(false);
    const statut = ref<Statut | null>(null);
    /** Localisation modifiée dans le formulaire */
    const edition = ref<Localisation | null>(null);
    /** Demande d'ouverture du formulaire (compteur : même localisation redemandée) */
    const ouvertureFormulaire = ref(0);
    /** Localisations du fichier importé déjà en base, en attente d'une décision */
    const conflits = ref<Conflit[]>([]);

    async function charger() {
        localisations.value = (await apiLocalisations.liste().catch(() => ({ locations: [] }))).locations ?? [];
        charge.value = true;
    }

    /** Après une modification : liste rechargée ici et dans l'ancien code (planning, CRA, événements…) */
    async function apresModification() {
        await charger();
        emettre('localisations-modifiees');
    }

    function modifier(l: Localisation) {
        edition.value = l;
        ouvertureFormulaire.value++;
    }

    async function enregistrer(corps: DonneesLocalisation) {
        if (edition.value) await apiLocalisations.modifier(edition.value.id, corps);
        else await apiLocalisations.creer(corps);
        edition.value = null;
        await apresModification();
    }

    /** Usages de chaque localisation (événements rattachés), lus avant une suppression */
    async function usages(ids: number[]): Promise<UsageNomme[]> {
        const resultat: UsageNomme[] = [];
        for (const id of ids) {
            try {
                const u = await apiLocalisations.usage(id);
                const l = localisations.value.find(x => x.id === id);
                resultat.push({ id, nom: l?.libelle_long || `#${id}`, count: u.count, events: u.events });
            } catch {
                /* usage indisponible : localisation non signalée */
            }
        }
        return resultat;
    }

    /** Suppressions une à une ; les événements du planning affichent ensuite « NON DÉFINI » */
    async function supprimer(ids: number[]) {
        let supprimees = 0;
        for (const id of ids) {
            try {
                await apiLocalisations.supprimer(id);
                supprimees++;
            } catch {
                /* localisation non supprimée */
            }
        }
        await apresModification();
        emettre('evenements-modifies');
        statut.value = { texte: `✅ ${supprimees} localisation(s) supprimée(s).` };
    }

    /**
     * Import d'un fichier CSV : lignes nouvelles importées, celles déjà en base (même libellé long) placées en
     * conflit, à résoudre dans la fenêtre dédiée
     */
    async function importer(texte: string) {
        const analyse = analyserCsv(texte);
        if (!analyse.ok) {
            statut.value = { texte: analyse.message, detail: analyse.detail };
            return;
        }
        const { nouvelles, conflits: enBase } = repartir(analyse.lignes, localisations.value);
        statut.value = {
            texte: `⏳ Import de ${analyse.lignes.length} ligne(s)… sep=${libelleSeparateur(analyse.separateur)}`,
            apercu: analyse.lignes.slice(0, 3)
        };
        let ajoutees = 0;
        if (nouvelles.length) {
            try {
                ajoutees = (await apiLocalisations.importer(nouvelles)).inserted || 0;
            } catch (e) {
                statut.value = { texte: `❌ Erreur réseau : ${(e as Error).message}` };
                return;
            }
            await apresModification();
        }
        if (enBase.length) {
            statut.value = { texte: resumeImport(ajoutees, enBase) };
            conflits.value = enBase;
        } else statut.value = { texte: `✅ ${ajoutees} localisation(s) importée(s) avec succès.` };
    }

    function fermerConflits() {
        conflits.value = [];
    }

    /** Choix appliqués : localisations écrasées par le fichier ou par la saisie manuelle, les autres conservées */
    async function appliquerConflits() {
        let misesAJour = 0;
        let erreurs = 0;
        for (const c of conflits.value) {
            const corps = donneesConflit(c);
            if (!corps) continue;
            try {
                await apiLocalisations.modifier(c.existante.id, corps);
                misesAJour++;
            } catch {
                erreurs++;
            }
        }
        fermerConflits();
        await apresModification();
        statut.value = {
            texte: erreurs
                ? `⚠️ ${misesAJour} mise(s) à jour, ${erreurs} erreur(s).`
                : `✅ ${misesAJour} localisation(s) mise(s) à jour avec les données du CSV.`
        };
    }

    return {
        localisations,
        charge,
        statut,
        edition,
        ouvertureFormulaire,
        conflits,
        charger,
        apresModification,
        modifier,
        enregistrer,
        usages,
        supprimer,
        importer,
        fermerConflits,
        appliquerConflits
    };
});
