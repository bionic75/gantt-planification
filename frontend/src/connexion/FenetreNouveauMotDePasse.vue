<!-- Nouveau mot de passe, ouvert depuis le lien reçu par e-mail (?reset_token=…) : lien vérifié à l'ouverture (règle
     du mot de passe affichée), nouveau mot de passe enregistré une seule fois -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { ErreurApi } from '@/api/client';
import { connexionApi } from '@/api/connexion';
import AppModal from '@/composants/AppModal.vue';

const props = defineProps<{ jeton: string | null }>();
const emit = defineEmits<{ fermer: [] }>();

/** Jeton encore utilisable (null : lien refusé ou mot de passe déjà enregistré) */
const actif = ref<string | null>(null);
const regle = ref('');
const nouveau = ref('');
const confirmation = ref('');
const message = ref<{ texte: string; ok: boolean } | null>(null);
const envoi = ref(false);

const texteErreur = (e: unknown, defaut: string) =>
    (e instanceof ErreurApi ? e.message : (e as Error).message) || defaut;

watch(
    () => props.jeton,
    async jeton => {
        actif.value = null;
        regle.value = '';
        nouveau.value = '';
        confirmation.value = '';
        message.value = null;
        if (!jeton) return;
        try {
            const r = await connexionApi.verifierLienReinitialisation(jeton);
            regle.value = `Règle : ${r.passwordRule}.`;
            actif.value = jeton;
        } catch (e) {
            message.value = { texte: `❌ ${texteErreur(e, 'Lien invalide')}`, ok: false };
        }
    },
    { immediate: true }
);

async function valider() {
    if (!actif.value) return;
    if (nouveau.value !== confirmation.value) {
        message.value = { texte: '❌ Les deux mots de passe ne correspondent pas', ok: false };
        return;
    }
    envoi.value = true;
    try {
        const r = await connexionApi.reinitialiser(actif.value, nouveau.value);
        actif.value = null;
        message.value = { texte: `✅ ${r.message}`, ok: true };
    } catch (e) {
        message.value = { texte: `❌ ${texteErreur(e, 'Erreur lors de la modification')}`, ok: false };
    } finally {
        envoi.value = false;
    }
}
</script>

<template>
    <AppModal
        id="newPasswordModal"
        class="lp-fenetre"
        :opened="!!jeton"
        title="Choisir un nouveau mot de passe"
        is-alert
        @close="emit('fermer')"
    >
        <p id="newPasswordRule" class="lp-fenetre__texte">{{ regle }}</p>
        <div v-if="actif" id="newPasswordForm">
            <div class="form-group">
                <label for="newPasswordValue">Nouveau mot de passe</label>
                <input id="newPasswordValue" v-model="nouveau" type="password" autocomplete="new-password" />
            </div>
            <div class="form-group">
                <label for="newPasswordConfirm">Confirmation</label>
                <input id="newPasswordConfirm" v-model="confirmation" type="password" autocomplete="new-password" />
            </div>
        </div>
        <div
            v-if="message"
            id="newPasswordMessage"
            :key="message.texte"
            class="lp-fenetre__message"
            :class="message.ok ? 'lp-fenetre__message--succes' : 'lp-fenetre__message--erreur'"
        >
            {{ message.texte }}
        </div>
        <template #footer>
            <button type="button" class="lp-fenetre__annuler" @click="emit('fermer')">Fermer</button>
            <button v-if="actif" id="newPasswordButton" type="button" :disabled="envoi" @click="valider">
                Valider
            </button>
        </template>
    </AppModal>
</template>
