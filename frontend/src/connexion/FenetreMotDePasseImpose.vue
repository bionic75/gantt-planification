<!-- Changement de mot de passe obligatoire : mot de passe donné par un administrateur (compte initial, créé ou
     réinitialisé). Le serveur refuse toute autre action tant qu'il n'est pas remplacé (PASSWORD_CHANGE_REQUIRED) ; la
     fenêtre ne se ferme pas, sauf par la déconnexion. -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { ErreurApi } from '@/api/client';
import { connexionApi } from '@/api/connexion';
import AppModal from '@/composants/AppModal.vue';

const props = defineProps<{ ouverte: boolean }>();
const emit = defineEmits<{ termine: [motDePasse: string] }>();

const nouveau = ref('');
const confirmation = ref('');
const erreur = ref('');
const envoi = ref(false);

watch(
    () => props.ouverte,
    ouverte => {
        if (!ouverte) return;
        nouveau.value = '';
        confirmation.value = '';
        erreur.value = '';
    },
    { immediate: true }
);

async function valider() {
    if (!nouveau.value) {
        erreur.value = 'Saisissez un nouveau mot de passe';
        return;
    }
    if (nouveau.value !== confirmation.value) {
        erreur.value = 'Les deux mots de passe ne correspondent pas';
        return;
    }
    envoi.value = true;
    erreur.value = '';
    try {
        await connexionApi.changerMotDePasse(nouveau.value);
        emit('termine', nouveau.value);
    } catch (e) {
        erreur.value =
            e instanceof ErreurApi
                ? e.message || 'Impossible de changer le mot de passe'
                : `Erreur de connexion — ${(e as Error).message || 'réessayez'}`;
    } finally {
        envoi.value = false;
    }
}

async function seDeconnecter() {
    await connexionApi.deconnecter().catch(() => {});
    location.reload();
}
</script>

<template>
    <AppModal
        id="forcedPasswordModal"
        class="lp-fenetre"
        :opened="ouverte"
        title="Choisissez votre mot de passe"
        is-alert
        @close="() => {}"
    >
        <p class="lp-fenetre__texte">
            Votre mot de passe actuel vous a été attribué par un administrateur. Choisissez un nouveau mot de passe
            personnel pour accéder à l'application (8 caractères minimum, dont au moins 1 caractère spécial).
        </p>
        <div class="form-group">
            <label for="forcedNewPassword">Nouveau mot de passe</label>
            <input id="forcedNewPassword" v-model="nouveau" type="password" autocomplete="new-password" />
        </div>
        <div class="form-group">
            <label for="forcedConfirmPassword">Confirmation</label>
            <input
                id="forcedConfirmPassword"
                v-model="confirmation"
                type="password"
                autocomplete="new-password"
                @keydown.enter="valider"
            />
        </div>
        <div v-if="erreur" id="forcedPasswordError" class="lp-fenetre__message lp-fenetre__message--erreur">
            {{ erreur }}
        </div>
        <template #footer>
            <button type="button" class="lp-fenetre__annuler" @click="seDeconnecter">Se déconnecter</button>
            <button id="forcedPasswordButton" type="button" :disabled="envoi" @click="valider">Valider</button>
        </template>
    </AppModal>
</template>
