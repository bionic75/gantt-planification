<!-- Liste des comptes : tri par colonne, profils, accès Reporting, validation RH, activation, dernière connexion,
     actions (modifier, mot de passe, TOTP, déconnexion, suppression) ; détails au clic sur le nom -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { apiUtilisateurs, type Utilisateur } from '@/api/utilisateurs';
import AppIcone from '@/composants/AppIcone.vue';
import { useConfirmation } from '@/composants/confirmation';
import { rendreColonnesRedimensionnables } from '@/liaison';
import { badges, derniereConnexion, parNom, peutValidationRh, trier, trigramme, type ColonneTri } from './calculs';
import { useUtilisateursStore } from './magasin';

const emit = defineEmits<{ modifier: [u: Utilisateur]; motDePasse: [u: Utilisateur]; details: [u: Utilisateur] }>();
const store = useUtilisateursStore();
const confirmer = useConfirmation();
const tableau = ref<HTMLTableElement | null>(null);

/** Tri courant ; sens mémorisé par colonne, comme l'ancien écran (premier clic : croissant) */
const tri = ref<ColonneTri | null>(null);
const croissant = ref<Partial<Record<ColonneTri, boolean>>>({});
const lignes = computed(() => {
    const base = parNom(store.utilisateurs);
    return tri.value ? trier(base, tri.value, !!croissant.value[tri.value]) : base;
});

function trierPar(c: ColonneTri) {
    croissant.value[c] = !croissant.value[c];
    tri.value = c;
}

const COLONNES: Array<{ libelle: string; tri?: ColonneTri; titre?: string; classe?: string }> = [
    { libelle: 'Nom', tri: 'nom' },
    { libelle: 'Prénom', tri: 'prenom' },
    { libelle: 'Trigramme', tri: 'trigramme' },
    { libelle: 'Login', tri: 'username' },
    { libelle: 'Email', tri: 'email' },
    { libelle: 'Téléphone', classe: 'no-sort' },
    { libelle: 'Profil(s)', tri: 'profils' },
    { libelle: 'Reporting', classe: 'no-sort', titre: "Accès à l'onglet Reporting" },
    { libelle: 'Validation RH', classe: 'no-sort', titre: 'Validation RH' },
    // Tri sans effet dans l'ancien écran (colonne mal référencée) : anomalie conservée
    { libelle: 'Actif' },
    { libelle: 'Dernière connexion' },
    { libelle: 'Actions', classe: 'no-sort liste__actions-entete' }
];

// Colonnes redimensionnables, comme les autres tableaux de l'application
watch(tableau, t => {
    if (t) void nextTick(() => rendreColonnesRedimensionnables(t));
});

const nomComplet = (u: Utilisateur) => `${u.prenom} ${u.nom}`;

async function basculerActif(u: Utilisateur) {
    try {
        await apiUtilisateurs.basculerActif(u.id);
        await store.apresModification(true);
    } catch {
        /* comme l'ancien écran : sans message */
    }
}

async function accesReporting(u: Utilisateur, oui: boolean) {
    try {
        await apiUtilisateurs.accesReporting(u.id, oui);
    } catch {
        store.signaler('error', "Erreur lors de la modification de l'accès au reporting");
    }
    await store.apresModification();
}

async function validationRh(u: Utilisateur, oui: boolean) {
    try {
        await apiUtilisateurs.validationRh(u.id, oui);
    } catch {
        store.signaler('error', 'Erreur modification accès RH');
    }
    await store.apresModification();
}

async function reinitialiserTotp(u: Utilisateur) {
    const nom = nomComplet(u);
    const ok = await confirmer(
        `Réinitialiser l'appairage TOTP de ${nom} ?\n\nL'utilisateur devra rescanner un nouveau QR code à sa prochaine connexion.`
    );
    if (!ok) return;
    try {
        await apiUtilisateurs.reinitialiserTotp(u.id);
        store.signaler(
            'success',
            `✅ TOTP réinitialisé pour ${nom}.\nL'utilisateur devra configurer un nouvel appairage à sa prochaine connexion.`
        );
    } catch (e) {
        store.signaler('error', `Erreur : ${(e as Error).message}`);
    }
}

async function deconnecter(u: Utilisateur) {
    const nom = nomComplet(u);
    if (!(await confirmer(`Forcer la déconnexion de ${nom} ?`))) return;
    try {
        const r = await apiUtilisateurs.deconnecter(u.id);
        if (r.success)
            store.signaler(
                r.wasConnected ? 'success' : 'info',
                r.wasConnected ? `✅ ${nom} a été déconnecté(e).` : `ℹ️ ${nom} n'était pas connecté(e).`
            );
        else store.signaler('error', `Erreur : ${r.error || 'inconnue'}`);
    } catch (e) {
        store.signaler('error', `Erreur : ${(e as Error).message}`);
    }
}

async function supprimer(u: Utilisateur) {
    if (!(await confirmer('Confirmer la suppression ?'))) return;
    try {
        await apiUtilisateurs.supprimer(u.id);
        await store.apresModification(true);
    } catch (e) {
        store.signaler('error', (e as Error).message);
    }
}
</script>

<template>
    <div class="table-container">
        <table id="usersTable" ref="tableau">
            <thead>
                <tr>
                    <th
                        v-for="c in COLONNES"
                        :key="c.libelle"
                        :class="c.classe"
                        :title="c.titre"
                        :tabindex="c.tri ? 0 : undefined"
                        :aria-sort="
                            c.tri && tri === c.tri ? (croissant[c.tri] ? 'ascending' : 'descending') : undefined
                        "
                        @click="c.tri && trierPar(c.tri)"
                        @keydown.enter.prevent="c.tri && trierPar(c.tri)"
                    >
                        {{ c.libelle }}
                    </th>
                </tr>
            </thead>
            <tbody id="usersList">
                <tr v-for="u in lignes" :key="u.id">
                    <td class="ell" :title="u.nom">
                        <button type="button" class="liste__nom" @click="emit('details', u)">{{ u.nom }}</button>
                    </td>
                    <td class="ell" :title="u.prenom">{{ u.prenom }}</td>
                    <td class="ell liste__trigramme">{{ trigramme(u) }}</td>
                    <td class="ell" :title="u.username">{{ u.username }}</td>
                    <td class="ell" :title="u.email">{{ u.email }}</td>
                    <td class="ell">{{ u.telephone || '-' }}</td>
                    <td>
                        <div class="liste__badges">
                            <span
                                v-for="b in badges(u)"
                                :key="b.profil"
                                class="liste__badge"
                                :class="`liste__badge--${b.profil}`"
                            >
                                {{ b.libelle }}
                            </span>
                            <span v-if="!badges(u).length" class="liste__sans-profil">—</span>
                        </div>
                    </td>
                    <td class="liste__centre">
                        <input
                            type="checkbox"
                            class="liste__case"
                            :checked="u.has_reporting_access === 1 || u.is_admin === 1"
                            :disabled="u.is_admin === 1"
                            :title="u.is_admin === 1 ? 'Les admins ont toujours accès' : undefined"
                            :aria-label="`Accès Reporting de ${nomComplet(u)}`"
                            @change="accesReporting(u, ($event.target as HTMLInputElement).checked)"
                        />
                    </td>
                    <td class="liste__centre">
                        <input
                            v-if="peutValidationRh(u)"
                            type="checkbox"
                            class="liste__case"
                            :checked="u.is_rh === 1"
                            title="Validation RH"
                            :aria-label="`Validation RH de ${nomComplet(u)}`"
                            @change="validationRh(u, ($event.target as HTMLInputElement).checked)"
                        />
                        <input
                            v-else
                            type="checkbox"
                            class="liste__case liste__case--interdite"
                            disabled
                            title="Réservé aux profils Admin, Utilisateur et RH"
                            :aria-label="`Validation RH de ${nomComplet(u)} (réservée aux profils Admin, Utilisateur et RH)`"
                        />
                    </td>
                    <td>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                :checked="!!u.actif"
                                :aria-label="`Compte actif : ${nomComplet(u)}`"
                                @change="basculerActif(u)"
                            />
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td class="liste__connexion">{{ derniereConnexion(u.last_login) }}</td>
                    <td>
                        <div class="icon-actions">
                            <button
                                type="button"
                                class="icon-btn liste__action--modifier"
                                title="Modifier l'utilisateur"
                                aria-label="Modifier l'utilisateur"
                                @click="emit('modifier', u)"
                            >
                                <AppIcone name="crayon" />
                            </button>
                            <button
                                type="button"
                                class="icon-btn liste__action--mot-de-passe"
                                title="Réinitialiser le mot de passe"
                                aria-label="Réinitialiser le mot de passe"
                                @click="emit('motDePasse', u)"
                            >
                                <AppIcone name="cle" />
                            </button>
                            <button
                                type="button"
                                class="icon-btn liste__action--totp"
                                title="Réinitialiser l'appairage TOTP (changement de téléphone)"
                                aria-label="Réinitialiser l'appairage TOTP (changement de téléphone)"
                                @click="reinitialiserTotp(u)"
                            >
                                <AppIcone name="mobile" />
                            </button>
                            <button
                                type="button"
                                class="icon-btn liste__action--deconnecter"
                                title="Déconnecter immédiatement cet utilisateur"
                                aria-label="Déconnecter immédiatement cet utilisateur"
                                @click="deconnecter(u)"
                            >
                                <AppIcone name="deconnexion" />
                            </button>
                            <button
                                type="button"
                                class="icon-btn liste__action--supprimer"
                                title="Supprimer l'utilisateur"
                                aria-label="Supprimer l'utilisateur"
                                @click="supprimer(u)"
                            >
                                <AppIcone name="corbeille" />
                            </button>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
/* Toute la cellule est cliquable, comme dans l'ancien écran */
.liste__nom,
.liste__nom:hover {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: #1d70b7;
    font: inherit;
    font-weight: bold;
    cursor: pointer;
    text-align: left;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}
.liste__trigramme {
    font-weight: bold;
    letter-spacing: 1px;
}
.liste__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
}
.liste__badge {
    color: white;
    padding: 2px 7px;
    border-radius: 3px;
    font-size: 11px;
    white-space: nowrap;
}
.liste__badge--admin {
    background-color: #e74c3c;
}
.liste__badge--expert {
    background-color: #f39c12;
}
.liste__badge--user {
    background-color: #3498db;
}
.liste__badge--rh {
    background-color: #8e44ad;
}
.liste__sans-profil {
    color: #bdc3c7;
    font-size: 11px;
}
.liste__centre {
    text-align: center;
}
.liste__case {
    width: 18px;
    height: 18px;
    cursor: pointer;
}
.liste__case:disabled {
    cursor: not-allowed;
}
.liste__case--interdite {
    opacity: 0.4;
}
.liste__connexion {
    font-size: 11px;
    white-space: nowrap;
}
:deep(.liste__actions-entete) {
    width: 192px;
    min-width: 192px;
}
.icon-btn :deep(.gp-icone) {
    margin: 0;
    vertical-align: middle;
}
.liste__action--modifier {
    background-color: #3498db;
}
.liste__action--mot-de-passe {
    background-color: #f39c12;
}
.liste__action--totp {
    background-color: #9c27b0;
}
.liste__action--deconnecter {
    background-color: #e65100;
}
.liste__action--supprimer {
    background-color: #d60b51;
}
</style>
