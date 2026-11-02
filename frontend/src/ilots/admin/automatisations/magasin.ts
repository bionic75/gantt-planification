// Automatisations : listes des formulaires (comptes avec e-mail, ressources, mois ayant des données) et fenêtre
// partagée de l'historique des envois, du diagnostic des mois et de l'aperçu du nettoyage (une seule fenêtre dans
// l'ancien écran : son bouton « Vider l'historique » vide l'historique de la dernière automatisation consultée)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    apiAutomatisations,
    type ApercuNettoyage,
    type EnvoiAutomatisation,
    type InfosHo,
    type MoisDiagnostic
} from '@/api/automatisations';
import { ErreurApi } from '@/api/client';
import { apiUtilisateurs, type Utilisateur } from '@/api/utilisateurs';
import type { Option } from './calculs';

export type ContenuFenetre =
    | { type: 'envois'; n: 1 | 2 | 3; envois: EnvoiAutomatisation[] | null; erreur?: boolean }
    | { type: 'vidage'; reussi: boolean }
    | { type: 'diagnostic'; mois: MoisDiagnostic[]; orphelins: unknown[] }
    | { type: 'nettoyage'; apercu: ApercuNettoyage };

export const useAutomatisationsStore = defineStore('admin-automatisations', () => {
    /** Comptes (GET /users) : viseurs RH du workflow CRA, destinataires de la communication HO */
    const utilisateurs = ref<Utilisateur[]>([]);
    /** Comptes avec e-mail : destinataires et copie des automatisations n°1 et n°2 */
    const comptes = ref<Option<number>[]>([]);
    const ressources = ref<Array<Option<number> & { inactif: boolean }>>([]);
    const mois = ref<Option[]>([]);
    /** Mois ayant des données : chargement impossible ou aucun mois (liste vide) */
    const moisCharges = ref(false);

    async function chargerListes() {
        const [c, r] = await Promise.allSettled([apiUtilisateurs.liste(), apiUtilisateurs.ressources()]);
        if (c.status === 'fulfilled') utilisateurs.value = c.value;
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

    let infosHo: Promise<InfosHo | null> | null = null;
    /** Astreintes HO (n°5 et n°6) : experts, champs et modèles des mails, chargés une fois */
    const chargerInfosHo = () => (infosHo ??= apiAutomatisations.infosHo().catch(() => null));

    // ---------- Fenêtre partagée ----------

    const fenetre = ref<{ titre: string; contenu: ContenuFenetre } | null>(null);
    /** Automatisation de « Vider l'historique » : dernière dont l'historique a été ouvert (n°1 par défaut) */
    const historiqueCourant = ref<1 | 2 | 3>(1);
    /** Message des outils de l'automatisation n°2 (diagnostic, nettoyage), affiché sous leurs boutons */
    const messageOutils = ref<{ texte: string; erreur: boolean } | null>(null);

    async function ouvrirEnvois(n: 1 | 2 | 3) {
        historiqueCourant.value = n;
        const titre = {
            1: '📋 Historique des envois de rappels',
            2: '📋 Historique des sauvegardes de planning',
            3: '📋 Historique des notifications Teams'
        }[n];
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
        utilisateurs,
        comptes,
        ressources,
        mois,
        moisCharges,
        chargerListes,
        chargerMois,
        preparer,
        chargerInfosHo,
        fenetre,
        historiqueCourant,
        messageOutils,
        ouvrirEnvois,
        ouvrirDiagnostic,
        ouvrirNettoyage
    };
});
