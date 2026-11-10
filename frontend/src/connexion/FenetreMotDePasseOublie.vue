<!-- Mot de passe oublié (mire du bureau) : lien de réinitialisation envoyé à l'adresse du compte. Réponse identique que le
     compte existe ou non ; nouvelle demande possible après le délai indiqué par le serveur (60 s après un envoi). -->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { ErreurApi } from '@/api/client';
import { connexionApi } from '@/api/connexion';
import AppModal from '@/composants/AppModal.vue';

const props = defineProps<{ ouverte: boolean; identifiant: string }>();
const emit = defineEmits<{ fermer: [] }>();

const login = ref('');
const message = ref<{ texte: string; type: 'succes' | 'erreur' | 'attente' } | null>(null);
const envoi = ref(false);
/** Secondes avant une nouvelle demande (0 : demande possible) */
const delai = ref(0);
let minuteur: ReturnType<typeof setInterval> | undefined;

function arreterDelai() {
    clearInterval(minuteur);
    minuteur = undefined;
    delai.value = 0;
}

function demarrerDelai(secondes: number) {
    arreterDelai();
    delai.value = secondes;
    minuteur = setInterval(() => {
        delai.value--;
        if (delai.value <= 0) arreterDelai();
    }, 1000);
}

watch(
    () => props.ouverte,
    ouverte => {
        if (!ouverte) {
            arreterDelai();
            envoi.value = false;
            return;
        }
        login.value = props.identifiant;
        message.value = null;
    },
    { immediate: true }
);

async function envoyer() {
    if (!login.value) {
        message.value = { texte: 'Veuillez entrer votre identifiant', type: 'erreur' };
        return;
    }
    envoi.value = true;
    try {
        const r = await connexionApi.demanderReinitialisation(login.value);
        if (r.success) {
            message.value = { texte: `✅ ${r.message ?? ''}`, type: 'succes' };
            // Une nouvelle demande pour le même compte n'est prise en compte qu'après 60 secondes
            demarrerDelai(60);
        } else {
            message.value = { texte: `❌ ${r.error || 'Erreur lors de la réinitialisation'}`, type: 'erreur' };
        }
    } catch (e) {
        const donnees = e instanceof ErreurApi ? (e.donnees as { remainingSeconds?: number } | null) : null;
        if (e instanceof ErreurApi && e.statut === 429) {
            message.value = { texte: e.message, type: 'attente' };
            demarrerDelai(donnees?.remainingSeconds ?? 60);
        } else if (e instanceof ErreurApi) {
            message.value = { texte: `❌ ${e.message || 'Erreur lors de la réinitialisation'}`, type: 'erreur' };
        } else {
            message.value = { texte: '❌ Erreur de connexion au serveur', type: 'erreur' };
        }
    } finally {
        envoi.value = false;
    }
}

onBeforeUnmount(arreterDelai);
</script>

<template>
    <AppModal
        id="forgotPasswordModal"
        class="lp-fenetre"
        :opened="ouverte"
        title="Mot de passe oublié"
        is-alert
        fermer-sur-fond
        @close="emit('fermer')"
    >
        <p class="lp-fenetre__texte">
            Entrez votre identifiant. Un lien pour choisir un nouveau mot de passe sera envoyé à l'adresse email
            associée à votre compte.
        </p>
        <div class="form-group">
            <label for="forgotUsername">Identifiant</label>
            <input id="forgotUsername" v-model="login" type="text" placeholder="Votre login" />
        </div>
        <div
            v-if="message"
            id="forgotPasswordMessage"
            :key="message.texte"
            class="lp-fenetre__message"
            :class="`lp-fenetre__message--${message.type}`"
        >
            {{ message.texte }}
        </div>
        <template #footer>
            <button type="button" class="lp-fenetre__annuler" @click="emit('fermer')">Annuler</button>
            <button id="forgotPasswordButton" type="button" :disabled="envoi || delai > 0" @click="envoyer">
                {{ envoi ? 'Envoi en cours...' : delai > 0 ? `Réessayer dans ${delai}s` : 'Envoyer' }}
            </button>
        </template>
    </AppModal>
</template>
