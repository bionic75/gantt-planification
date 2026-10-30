<!-- Nouveau mot de passe donné par l'administrateur (saisi ou généré, envoyé par e-mail au choix), puis affichage
     unique du mot de passe donné -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiUtilisateurs, type Utilisateur } from '@/api/utilisateurs';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { genererMotDePasse } from './calculs';
import { useUtilisateursStore } from './magasin';

const props = defineProps<{ utilisateur: Utilisateur | null }>();
const emit = defineEmits<{ fermer: [] }>();
const store = useUtilisateursStore();

const motDePasse = ref('');
const envoyer = ref(true);
const erreur = ref('');
/** Mot de passe donné, affiché une seule fois */
const donne = ref<{ motDePasse: string; emailEnvoye: boolean } | null>(null);
const copie = ref(false);

watch(
    () => props.utilisateur,
    u => {
        if (!u) return;
        motDePasse.value = '';
        envoyer.value = true;
        erreur.value = '';
    }
);

function fermer() {
    motDePasse.value = '';
    emit('fermer');
}

async function reinitialiser() {
    const u = props.utilisateur;
    if (!u) return;
    erreur.value = '';
    if (!motDePasse.value || motDePasse.value.length < 6) {
        erreur.value = 'Le mot de passe doit contenir au moins 6 caractères';
        return;
    }
    try {
        const r = await apiUtilisateurs.nouveauMotDePasse(u.id, motDePasse.value, envoyer.value);
        donne.value = { motDePasse: motDePasse.value, emailEnvoye: envoyer.value && !!r.emailSent };
        copie.value = false;
        fermer();
        await store.apresModification(true);
    } catch (e) {
        erreur.value = `Erreur lors de la réinitialisation : ${(e as Error).message}`;
    }
}

async function copier() {
    if (!donne.value) return;
    await navigator.clipboard.writeText(donne.value.motDePasse);
    copie.value = true;
    setTimeout(() => (copie.value = false), 2000);
}
</script>

<template>
    <AppModal id="resetPasswordModal" :opened="!!utilisateur" title="Réinitialiser le mot de passe" @close="fermer">
        <div class="form-group">
            <label for="adminResetPassword">Nouveau mot de passe</label>
            <div class="mdp__saisie">
                <input id="adminResetPassword" v-model="motDePasse" type="text" placeholder="Nouveau mot de passe" />
                <button type="button" class="mdp__generer" @click="motDePasse = genererMotDePasse()">🎲 Générer</button>
            </div>
        </div>
        <div class="form-group">
            <label class="mdp__envoi">
                <input id="sendPasswordEmail" v-model="envoyer" type="checkbox" />
                <span>Envoyer le mot de passe par email</span>
            </label>
        </div>
        <AppAlert v-if="erreur" type="error" :description="erreur" />
        <template #footer>
            <div class="modal-button-group">
                <button type="button" class="mdp__annuler" @click="fermer">Annuler</button>
                <button type="button" @click="reinitialiser">Réinitialiser</button>
            </div>
        </template>
    </AppModal>

    <AppModal
        id="passwordConfirmModal"
        :opened="!!donne"
        title="✅ Mot de passe réinitialisé"
        class="mdp-donne"
        @close="donne = null"
    >
        <div class="mdp-donne__corps">
            <p id="passwordConfirmEmailMsg" class="mdp-donne__email">
                {{
                    donne?.emailEnvoye
                        ? "📧 Un email a également été envoyé à l'utilisateur."
                        : '⚠️ Aucun email envoyé — communiquez ce mot de passe manuellement.'
                }}
            </p>
            <p class="mdp-donne__libelle">Nouveau mot de passe :</p>
            <div class="mdp-donne__valeur">
                <code id="passwordConfirmValue" class="mdp-donne__code">{{ donne?.motDePasse }}</code>
                <button id="copyConfirmBtn" type="button" class="mdp-donne__copier" @click="copier">
                    <!-- Recréé à chaque changement : émojis convertis en icônes (public/js/ui-icons.js) -->
                    <span :key="String(copie)">{{ copie ? '✅ Copié !' : '📋 Copier' }}</span>
                </button>
            </div>
            <p class="mdp-donne__alerte">⚠️ Notez ce mot de passe — il ne sera plus affiché.</p>
            <button type="button" class="mdp-donne__fermer" @click="donne = null">Fermer</button>
        </div>
    </AppModal>
</template>

<style scoped>
.mdp__saisie {
    display: flex;
    gap: 10px;
}
.mdp__saisie input {
    flex: 1;
}
.mdp__generer,
.mdp__generer:hover {
    background-color: #9b59b6;
    padding: 8px 15px;
}
.mdp__envoi {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}
.mdp__envoi input {
    width: auto;
    margin: 0;
}
.mdp__annuler,
.mdp__annuler:hover {
    background-color: #95a5a6;
}
.mdp-donne__corps {
    text-align: center;
}
.mdp-donne__email {
    font-size: 13px;
    color: #555;
    margin-bottom: 16px;
}
.mdp-donne__libelle {
    font-size: 13px;
    color: #333;
    margin-bottom: 8px;
    font-weight: bold;
}
.mdp-donne__valeur {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
}
.mdp-donne__code {
    font-size: 20px;
    letter-spacing: 3px;
    background: #f5f5f5;
    border: 2px solid #a5d6a7;
    border-radius: 6px;
    padding: 10px 18px;
    color: #1b5e20;
    font-family: monospace;
}
.mdp-donne__copier,
.mdp-donne__copier:hover {
    background: #2e7d32;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
}
.mdp-donne__alerte {
    font-size: 11px;
    color: #e53935;
    margin-bottom: 20px;
}
.mdp-donne__fermer,
.mdp-donne__fermer:hover {
    background: #546e7a;
    color: white;
    border: none;
    padding: 8px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.mdp-donne .gp-modale__boite {
    width: min(460px, 100%);
}
.gp-modale.mdp-donne .gp-modale__titre {
    color: #2e7d32;
}
</style>
