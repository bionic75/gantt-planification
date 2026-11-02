// Ressources : liste, historiques des taux de MAD (dates et statut), affectations SAMU, localisations (SAMU proposés)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiLocalisations, type Localisation } from '@/api/localisations';
import { apiRessources, type PeriodeMad, type Ressource } from '@/api/ressources';

export const useRessourcesStore = defineStore('ressources', () => {
    const ressources = ref<Ressource[]>([]);
    const historiques = ref<Record<number, PeriodeMad[]>>({});
    const affectations = ref<Record<number, { principal: string[]; secondaire: string[] }>>({});
    const localisations = ref<Localisation[]>([]);
    const charge = ref(false);
    /** Fiche ouverte : ressource, en modification ou en consultation (profil RH) */
    const fiche = ref<{ id: number; consultation: boolean } | null>(null);
    /** Rechargement : incrémenté à chaque nouvelle liste (ordre d'affichage remis à zéro, comme l'ancien écran) */
    const version = ref(0);

    async function charger() {
        try {
            const liste = await apiRessources.liste();
            const [h, a] = await Promise.all([
                Promise.all(liste.map(r => apiRessources.historiqueMad(r.id).catch(() => undefined))),
                apiRessources.affectations().catch(() => [])
            ]);
            const parRessource: Record<number, PeriodeMad[]> = {};
            liste.forEach((r, i) => {
                const periodes = h[i];
                if (periodes) parRessource[r.id] = periodes;
            });
            const parAffectation: Record<number, { principal: string[]; secondaire: string[] }> = {};
            for (const x of a)
                (parAffectation[x.resource_id] ??= { principal: [], secondaire: [] })[x.role].push(x.samu);
            ressources.value = liste;
            historiques.value = parRessource;
            affectations.value = parAffectation;
            charge.value = true;
            version.value++;
        } catch {
            /* liste inchangée */
        }
    }

    async function chargerLocalisations() {
        try {
            localisations.value = (await apiLocalisations.liste()).locations ?? [];
        } catch {
            /* liste inchangée */
        }
    }

    return {
        ressources,
        historiques,
        affectations,
        localisations,
        charge,
        version,
        fiche,
        charger,
        chargerLocalisations
    };
});
