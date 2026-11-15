// Paramétrage des déploiements : statuts (libellé, couleur, ordre) et statut de chaque déploiement
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiDeploiements, type DeploiementCarte, type StatutDeploiement } from '@/api/deploiements';
import { emettre } from '@/evenements';

export const useDeploiementsStore = defineStore('deploiements', () => {
    const statuts = ref<StatutDeploiement[]>([]);
    const deploiements = ref<DeploiementCarte[]>([]);
    const erreur = ref('');

    async function charger() {
        try {
            const r = await apiDeploiements.carte();
            statuts.value = r.statuses ?? [];
            deploiements.value = r.deployments ?? [];
        } catch (e) {
            erreur.value = e instanceof Error ? e.message : 'Chargement impossible';
        }
    }

    /** Écriture : message d'erreur du serveur gardé, sinon relecture et information de la carte */
    async function ecrire(action: () => Promise<unknown>, recharger = true) {
        erreur.value = '';
        try {
            await action();
        } catch (e) {
            erreur.value = e instanceof Error ? e.message : 'Enregistrement impossible';
            return false;
        }
        if (recharger) await charger();
        emettre('statuts-deploiements-modifies');
        return true;
    }

    const ajouterStatut = (label: string, couleur: string) =>
        ecrire(() => apiDeploiements.creer({ label: label.trim(), color: couleur }));
    const modifierStatut = (id: number, d: { label: string; color: string }) =>
        ecrire(() => apiDeploiements.modifier(id, d));
    const supprimerStatut = (id: number) => ecrire(() => apiDeploiements.supprimer(id));

    /** Un cran vers le haut (-1) ou le bas (1) : l'ordre complet est envoyé */
    async function deplacerStatut(id: number, sens: -1 | 1) {
        const ids = statuts.value.map(s => s.id);
        const i = ids.indexOf(id);
        const j = i + sens;
        if (i < 0 || j < 0 || j >= ids.length) return false;
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
        return ecrire(async () => {
            statuts.value = (await apiDeploiements.reordonner(ids)).statuses;
        }, false);
    }

    /** Statut d'un déploiement ; la date n'est envoyée que pour un statut « En service » */
    function affecter(projectId: number, statusId: number | null, date?: string | null) {
        const service = statuts.value.find(s => s.id === statusId)?.is_service;
        const corps: { status_id: number | null; date_mise_en_service?: string | null } = { status_id: statusId };
        if (service && date !== undefined) corps.date_mise_en_service = date;
        return ecrire(() => apiDeploiements.affecter(projectId, corps));
    }

    return {
        statuts,
        deploiements,
        erreur,
        charger,
        ajouterStatut,
        modifierStatut,
        supprimerStatut,
        deplacerStatut,
        affecter
    };
});
