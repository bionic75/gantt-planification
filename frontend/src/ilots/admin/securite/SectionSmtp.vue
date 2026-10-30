<!-- Administration › Configuration Email (SMTP) (sous-îlot) : serveur d'envoi, mot de passe jamais réaffiché, test -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiSmtp } from '@/api/securite';
import AppAlert from '@/composants/AppAlert.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { surReouverture } from '@/ilots/activation';
import { champsSmtp, donneesSmtp, type ChampsSmtp } from './calculs';

const champs = ref<ChampsSmtp>(champsSmtp({}));
const motDePasseEnregistre = ref(false);
const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);

// Comme l'ancien code : configuration relue à chaque ouverture de l'onglet Administration
async function charger() {
    try {
        const c = await apiSmtp.lire();
        champs.value = champsSmtp(c);
        motDePasseEnregistre.value = !!c.passwordSet;
    } catch {
        /* configuration réservée aux administrateurs */
    }
}
onMounted(charger);
surReouverture(() => void charger());

async function enregistrer() {
    message.value = null;
    const corps = donneesSmtp(champs.value, motDePasseEnregistre.value);
    if (!corps) {
        message.value = { type: 'error', texte: '❌ Tous les champs sont requis' };
        return;
    }
    try {
        await apiSmtp.enregistrer(corps);
        champs.value.password = '';
        motDePasseEnregistre.value = true;
        message.value = { type: 'success', texte: '✅ Configuration email sauvegardée !' };
        void apiSmtp.journaliser('Modification configuration email SMTP').catch(() => {});
    } catch (e) {
        message.value = { type: 'error', texte: `❌ Erreur lors de la sauvegarde: ${(e as Error).message}` };
    }
}

async function tester() {
    message.value = null;
    try {
        const r = await apiSmtp.tester();
        message.value = r.success
            ? { type: 'success', texte: '✅ Email de test envoyé avec succès ! Vérifiez votre boîte mail.' }
            : { type: 'error', texte: `❌ Erreur: ${r.error}` };
    } catch {
        message.value = { type: 'error', texte: "Erreur lors du test d'envoi" };
    }
}
</script>

<template>
    <AppSectionAdmin titre="Configuration Email (SMTP)" id-corps="emailSection" teinte="jaune">
        <p class="smtp__aide">
            Recommandé : Office 365 (smtp.office365.com:587) ou Gmail avec mot de passe d'application.
            <a href="https://support.microsoft.com/fr-fr/office" target="_blank" rel="noopener" class="smtp__lien">
                Guide Office 365
            </a>
        </p>
        <div class="form-row">
            <div class="form-group">
                <label for="smtpHost">Serveur SMTP</label>
                <input id="smtpHost" v-model="champs.host" type="text" placeholder="smtp.office365.com" />
            </div>
            <div class="form-group">
                <label for="smtpPort">Port SMTP</label>
                <input id="smtpPort" v-model="champs.port" type="number" placeholder="587" />
            </div>
            <div class="form-group">
                <label for="smtpUser">Email expéditeur</label>
                <input id="smtpUser" v-model="champs.user" type="email" placeholder="votre-email@votredomaine.com" />
            </div>
            <div class="form-group">
                <label for="smtpPassword">Mot de passe</label>
                <input
                    id="smtpPassword"
                    v-model="champs.password"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="
                        motDePasseEnregistre
                            ? 'Mot de passe enregistré (laisser vide pour le conserver)'
                            : 'Mot de passe email'
                    "
                />
            </div>
        </div>
        <AppAlert v-if="message" :type="message.type" :description="message.texte" />
        <div class="button-group">
            <button type="button" @click="enregistrer">Sauvegarder la config email</button>
            <button type="button" class="smtp__tester" @click="tester">Tester l'envoi</button>
        </div>
    </AppSectionAdmin>
</template>

<style scoped>
.smtp__aide {
    margin-bottom: 10px;
    font-size: 12px;
    color: #856404;
}
.smtp__lien {
    color: #856404;
}
.smtp__tester,
.smtp__tester:hover {
    background-color: #f39c12;
}
</style>
