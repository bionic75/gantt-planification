// Aide à l'affectation › Administration : étapes, couleurs et motifs (modifiables avant enregistrement), déploiements,
// chefs de projet possibles, entités (localisations)
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import {
    apiAffectation,
    type ConfigAffectation,
    type DeploiementAdmin,
    type UtilisateurAffectation
} from '@/api/affectation';
import { apiLocalisations, type Localisation } from '@/api/localisations';

export const useAdministrationAffectationStore = defineStore('affectation-administration', () => {
    const config = shallowRef<ConfigAffectation | null>(null);
    /** Couleurs et motifs en cours de choix (aperçu dans la légende et les frises) */
    const couleurs = ref<Record<string, string>>({});
    const motifs = ref<Record<string, string>>({});
    const deploiements = shallowRef<DeploiementAdmin[]>([]);
    const utilisateurs = shallowRef<UtilisateurAffectation[]>([]);
    const entites = shallowRef<Localisation[]>([]);
    const charge = ref(false);
    const erreur = ref('');

    async function charger() {
        erreur.value = '';
        try {
            const [cfg, proj, users, locs] = await Promise.all([
                apiAffectation.config(),
                apiAffectation.deploiementsAdmin(),
                apiAffectation.utilisateurs(),
                apiLocalisations.liste()
            ]);
            config.value = cfg;
            couleurs.value = { ...cfg.colors };
            motifs.value = { ...(cfg.patterns || {}) };
            deploiements.value = proj.projects;
            utilisateurs.value = users.users;
            entites.value = locs.locations || [];
            charge.value = true;
        } catch (e) {
            erreur.value = e instanceof Error ? e.message : String(e);
        }
    }

    async function relireDeploiements() {
        deploiements.value = (await apiAffectation.deploiementsAdmin()).projects;
    }

    return {
        config,
        couleurs,
        motifs,
        deploiements,
        utilisateurs,
        entites,
        charge,
        erreur,
        charger,
        relireDeploiements
    };
});
