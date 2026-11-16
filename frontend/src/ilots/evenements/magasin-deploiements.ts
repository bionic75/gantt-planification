// Paramétrage des déploiements : statuts (libellé, couleur, ordre) et statut de chaque déploiement
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiDeploiements, type DeploiementCarte, type StatutDeploiement } from '@/api/deploiements';
import { emettre } from '@/evenements';

export const useDeploiementsStore = defineStore('deploiements', () => {
    const statuts = ref<StatutDeploiement[]>([]);
    const deploiements = ref<DeploiementCarte[]>([]);
    const erreur = ref('');
    /** Couleurs proposées pour les statuts, de la moins à la plus avancée */
    const palette = ref<string[]>([]);
    /** Motifs de remplissage proposés */
    const motifs = ref<string[]>([]);
    /** Résultat de la dernière reprise des mises en service */
    const information = ref('');

    async function charger() {
        try {
            const r = await apiDeploiements.carte();
            statuts.value = r.statuses ?? [];
            palette.value = r.palette ?? [];
            motifs.value = r.patterns ?? [];
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

    const ajouterStatut = (label: string, couleur: string, motif = 'plein') =>
        ecrire(() => apiDeploiements.creer({ label: label.trim(), color: couleur, pattern: motif }));
    const modifierStatut = (id: number, d: { label: string; color: string; pattern?: string }) =>
        ecrire(() => apiDeploiements.modifier(id, d));
    const supprimerStatut = (id: number) => ecrire(() => apiDeploiements.supprimer(id));

    /** Envoie l'ordre complet des statuts ; la liste renvoyée remplace la locale */
    function reordonner(ids: number[]) {
        return ecrire(async () => {
            statuts.value = (await apiDeploiements.reordonner(ids)).statuses;
        }, false);
    }

    /** Un cran vers le haut (-1) ou le bas (1) */
    async function deplacerStatut(id: number, sens: -1 | 1) {
        const ids = statuts.value.map(s => s.id);
        const i = ids.indexOf(id);
        return deposerStatut(id, i + sens);
    }

    /** Dépose un statut à la place `cible` (indice dans la liste) ; sans effet si la place ne change pas */
    async function deposerStatut(id: number, cible: number) {
        const ids = statuts.value.map(s => s.id);
        const i = ids.indexOf(id);
        if (i < 0 || cible < 0 || cible >= ids.length || cible === i) return false;
        ids.splice(i, 1);
        ids.splice(cible, 0, id);
        return reordonner(ids);
    }

    /** Statut d'un SAMU (localisation) ; la date n'est envoyée que pour un statut « En service » */
    function affecter(locationId: number, statusId: number | null, date?: string | null) {
        const service = statuts.value.find(s => s.id === statusId)?.is_service;
        const corps: { status_id: number | null; date_mise_en_service?: string | null } = { status_id: statusId };
        if (service && date !== undefined) corps.date_mise_en_service = date;
        return ecrire(() => apiDeploiements.affecter(locationId, corps));
    }

    /** Ajoute un SAMU à la liste (sans statut) */
    const ajouterSamu = (locationId: number) => affecter(locationId, null);
    const retirerSamu = (locationId: number) => ecrire(() => apiDeploiements.retirer(locationId));

    /** « En service » pour les SAMU sans statut dont la mise en service (événement) est passée */
    async function reprendreMisesEnService() {
        information.value = '';
        let n = 0;
        const ok = await ecrire(async () => {
            n = (await apiDeploiements.importerMes()).imported;
        });
        if (ok)
            information.value = n
                ? `${n} SAMU passé(s) « En service » d'après les événements « Mise en service ».`
                : 'Aucun SAMU à mettre à jour.';
    }

    return {
        statuts,
        deploiements,
        erreur,
        palette,
        motifs,
        information,
        charger,
        ajouterStatut,
        modifierStatut,
        supprimerStatut,
        deplacerStatut,
        deposerStatut,
        affecter,
        ajouterSamu,
        retirerSamu,
        reprendreMisesEnService
    };
});
