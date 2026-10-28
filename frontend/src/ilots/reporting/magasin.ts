// Reporting : référentiels communs aux sections (experts, fonctions, comptes), chargés à l'ouverture de l'onglet
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiReporting, type CompteReporting, type RessourceReporting } from '@/api/reporting';
import { useSessionStore } from '@/stores/session';

export const useReportingStore = defineStore('reporting', () => {
    /** Ressources actives, triées par nom puis prénom */
    const experts = ref<RessourceReporting[]>([]);
    /** Fonctions des ressources actives, triées */
    const fonctions = ref<string[]>([]);
    /** Comptes : filtre du suivi des connexions (administrateur) */
    const comptesConnexions = ref<CompteReporting[]>([]);
    /** Comptes : participants du suivi des événements */
    const participants = ref<CompteReporting[]>([]);
    const estAdmin = ref(false);
    let chargement: Promise<void> | null = null;

    /**
     * Comme l'ancien écran : listes des experts et des comptes chargées pour un administrateur seulement (autres
     * profils ayant accès au reporting : listes vides, anomalie connue). Participants : comptes visibles du profil.
     */
    async function charger() {
        chargement ??= (async () => {
            const session = useSessionStore();
            estAdmin.value = (await session.charger()).activeProfile === 'admin';
            const [ressources, comptes] = await Promise.all([
                estAdmin.value ? apiReporting.ressources().catch(() => []) : Promise.resolve([]),
                apiReporting.comptes(estAdmin.value).catch(() => [])
            ]);
            const actifs = ressources
                .filter(r => r.actif)
                .sort((a, b) =>
                    `${a.nom} ${a.prenom}`.toLowerCase().localeCompare(`${b.nom} ${b.prenom}`.toLowerCase())
                );
            experts.value = actifs;
            fonctions.value = [...new Set(actifs.map(r => r.fonction).filter((f): f is string => !!f))].sort();
            participants.value = comptes;
            comptesConnexions.value = estAdmin.value
                ? [...comptes].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
                : [];
        })();
        return chargement;
    }

    return { experts, fonctions, comptesConnexions, participants, estAdmin, charger };
});
