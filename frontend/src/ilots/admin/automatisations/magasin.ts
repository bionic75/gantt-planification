// Automatisations : listes des formulaires (comptes avec e-mail, ressources, mois ayant des données) et fenêtre
// partagée de l'historique des envois, du diagnostic des mois et de l'aperçu du nettoyage (une seule fenêtre dans
// l'ancien écran : son bouton « Vider l'historique » vide l'historique de la dernière automatisation consultée)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    apiAutomatisations,
    type ApercuNettoyage,
    type EnvoiAutomatisation,
    type MoisDiagnostic
} from '@/api/automatisations';
import { ErreurApi } from '@/api/client';
import { apiUtilisateurs } from '@/api/utilisateurs';
import type { Option } from './calculs';

export type ContenuFenetre =
    | { type: 'envois'; n: 1 | 2; envois: EnvoiAutomatisation[] | null; erreur?: boolean }
    | { type: 'vidage'; reussi: boolean }
    | { type: 'diagnostic'; mois: MoisDiagnostic[]; orphelins: unknown[] }
    | { type: 'nettoyage'; apercu: ApercuNettoyage };

export const useAutomatisationsStore = defineStore('admin-automatisations', () => {
    const comptes = ref<Option<number>[]>([]);
    const ressources = ref<Array<Option<number> & { inactif: boolean }>>([]);
    const mois = ref<Option[]>([]);
    /** Mois ayant des données : chargement impossible ou aucun mois (liste vide) */
    const moisCharges = ref(false);

    async function chargerListes() {
        const [c, r] = await Promise.allSettled([apiUtilisateurs.liste(), apiUtilisateurs.ressources()]);
        if (c.status === 'fulfilled')
            comptes.value = c.value
                .filter(u => u.email)
                .map(u => ({ valeur: u.id, libelle: `${u.prenom} ${u.nom} (${u.email})` }));
        if (r.status === 'fulfilled')
            ressources.value = r.value.map(x => ({
                valeur: x.id,
                libelle: `${x.prenom} ${x.nom}${x.actif ? '' : ' (inactif)'}`,
                inactif: !x.actif
            }));
    }

    async function chargerMois() {
        try {
            mois.value = ((await apiAutomatisations.moisDisponibles()).months ?? []).map(m => ({
                valeur: m.value,
                libelle: m.label
            }));
            moisCharges.value = true;
        } catch {
            /* liste inchangée */
        }
    }

    let listesPretes: Promise<void> | null = null;
    /** Listes chargées une fois (comptes, ressources, mois), avant d'afficher les configurations */
    const preparer = () => (listesPretes ??= Promise.all([chargerListes(), chargerMois()]).then(() => undefined));

    // ---------- Fenêtre partagée ----------

    const fenetre = ref<{ titre: string; contenu: ContenuFenetre } | null>(null);
    /** Automatisation de « Vider l'historique » : dernière dont l'historique a été ouvert (n°1 par défaut) */
    const historiqueCourant = ref<1 | 2>(1);
    /** Message des outils de l'automatisation n°2 (diagnostic, nettoyage), affiché sous leurs boutons */
    const messageOutils = ref<{ texte: string; erreur: boolean } | null>(null);

    async function ouvrirEnvois(n: 1 | 2) {
        historiqueCourant.value = n;
        const titre = n === 1 ? '📋 Historique des envois de rappels' : '📋 Historique des sauvegardes de planning';
        fenetre.value = { titre, contenu: { type: 'envois', n, envois: null } };
        try {
            const envois = (await apiAutomatisations.envois(n)).logs ?? [];
            if (fenetre.value?.contenu.type === 'envois')
                fenetre.value = { titre, contenu: { type: 'envois', n, envois } };
        } catch {
            if (fenetre.value?.contenu.type === 'envois')
                fenetre.value = { titre, contenu: { type: 'envois', n, envois: null, erreur: true } };
        }
    }

    async function ouvrirDiagnostic() {
        messageOutils.value = null;
        try {
            const d = await apiAutomatisations.diagnostic();
            fenetre.value = {
                titre: '🔍 Diagnostic des données',
                contenu: { type: 'diagnostic', mois: d.months ?? [], orphelins: d.orphanData ?? [] }
            };
        } catch (e) {
            messageOutils.value = {
                texte: e instanceof ErreurApi ? 'Erreur lors du diagnostic' : `Erreur: ${(e as Error).message}`,
                erreur: true
            };
        }
    }

    async function ouvrirNettoyage() {
        messageOutils.value = null;
        try {
            const apercu = await apiAutomatisations.apercuNettoyage();
            fenetre.value = { titre: '🧹 Nettoyage des données', contenu: { type: 'nettoyage', apercu } };
        } catch (e) {
            messageOutils.value = { texte: `Erreur: ${(e as Error).message}`, erreur: true };
        }
    }

    return {
        comptes,
        ressources,
        mois,
        moisCharges,
        chargerListes,
        chargerMois,
        preparer,
        fenetre,
        historiqueCourant,
        messageOutils,
        ouvrirEnvois,
        ouvrirDiagnostic,
        ouvrirNettoyage
    };
});
