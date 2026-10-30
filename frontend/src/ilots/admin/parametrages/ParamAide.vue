<!-- Aide en ligne : publication des nouveautés de la version, envoi d'une page d'aide HTML, fichier actuel et
     retour à la page par défaut -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { apiAide, apiParametres } from '@/api/parametrages';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { useConfirmation } from '@/composants/confirmation';
import { messagePublication, miseAJourAide } from './calculs';
import { useParametragesStore } from './magasin';

const store = useParametragesStore();
const confirmer = useConfirmation();
const publication = ref(false);
const message = ref<{ type: 'success' | 'error' | 'warning'; texte: string } | null>(null);
const fichier = ref<HTMLInputElement | null>(null);
const envoi = ref<{ ok: boolean | null; texte: string } | null>(null);
/** Fichier actuel : date de mise à jour, null pour la page par défaut, undefined avant lecture */
const actuel = ref<string | null | undefined>(undefined);
const lectureImpossible = ref(false);

watch(
    () => store.parametres.help_publication_enabled,
    v => (publication.value = v === 'true'),
    { immediate: true }
);

async function lireFichier() {
    try {
        const i = await apiAide.info();
        actuel.value = i.exists && i.updatedAt ? i.updatedAt : null;
        lectureImpossible.value = false;
    } catch {
        lectureImpossible.value = true;
    }
}
onMounted(lireFichier);

/** Publication : activée ou non, pour la version enregistrée, horodatée pour être réaffichée à tous */
async function enregistrerPublication() {
    message.value = null;
    try {
        const version = (await apiParametres.lire()).app_version || '';
        await apiParametres.enregistrer('help_publication_enabled', publication.value ? 'true' : 'false');
        await apiParametres.enregistrer('help_publication_version', version);
        await apiParametres.enregistrer('help_publication_timestamp', Date.now().toString());
        message.value = { type: 'success', texte: messagePublication(publication.value, version) };
    } catch {
        message.value = { type: 'error', texte: 'Erreur sauvegarde' };
    }
}

async function envoyer() {
    message.value = null;
    const f = fichier.value?.files?.[0];
    if (!f) {
        message.value = { type: 'warning', texte: 'Sélectionnez un fichier HTML' };
        return;
    }
    envoi.value = { ok: null, texte: 'Upload en cours...' };
    try {
        const r = await apiAide.envoyer(await f.text());
        if (!r.success) throw new Error(r.error);
        envoi.value = { ok: true, texte: "✅ Page d'aide mise à jour avec succès" };
        await lireFichier();
    } catch (e) {
        envoi.value = { ok: false, texte: `❌ Erreur : ${(e as Error).message}` };
    }
}

async function supprimer() {
    if (!(await confirmer("Supprimer la page d'aide uploadée et revenir à la page par défaut ?"))) return;
    try {
        await apiAide.supprimer();
        await lireFichier();
    } catch {
        message.value = { type: 'error', texte: 'Erreur suppression' };
    }
}
</script>

<template>
    <AppSousSectionAdmin titre="Administration de l'aide en ligne" id-corps="subAideEnLigne">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
                <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
            </svg>
        </template>
        <div class="aide__publication">
            <input id="helpPublicationEnabled" v-model="publication" type="checkbox" class="aide__case" />
            <label for="helpPublicationEnabled" class="aide__libelle">
                Publier les nouveautés de la version
                <strong id="currentVersionLabel">{{ store.parametres.app_version }}</strong> — afficher la popup à la
                prochaine connexion de chaque utilisateur
            </label>
            <button type="button" class="aide__enregistrer" @click="enregistrerPublication">💾 Sauvegarder</button>
        </div>
        <AppAlert v-if="message" :type="message.type" :description="message.texte" class="aide__message" />

        <div class="aide__envoi">
            <p class="aide__explication">
                Uploadez un fichier HTML qui remplacera la page d'aide en ligne. Peu importe son nom, il sera servi à
                l'URL <code>/aide.html</code>.
            </p>
            <div class="aide__fichier">
                <label for="helpFileInput" class="aide__masque">Page d'aide (fichier HTML)</label>
                <input id="helpFileInput" ref="fichier" type="file" accept=".html" class="aide__champ" />
                <button type="button" class="aide__uploader" @click="envoyer">📤 Uploader</button>
            </div>
            <div
                id="helpUploadStatus"
                role="status"
                class="aide__statut"
                :class="envoi?.ok === true ? 'aide__statut--ok' : envoi?.ok === false ? 'aide__statut--erreur' : ''"
            >
                <span v-if="envoi" :key="envoi.texte">{{ envoi.texte }}</span>
            </div>
        </div>

        <div id="helpCurrentFile" class="aide__actuel">
            <template v-if="lectureImpossible">Impossible de vérifier le fichier</template>
            <template v-else-if="actuel === undefined">Chargement...</template>
            <!-- Recréé à chaque date : émojis convertis en icônes (public/js/ui-icons.js) -->
            <span v-else-if="actuel" :key="actuel">
                📄 Page d'aide active — {{ miseAJourAide(actuel) }} —
                <button type="button" class="aide__supprimer" @click="supprimer">
                    🗑️ Supprimer (revenir à la page par défaut)
                </button>
            </span>
            <template v-else>Page d'aide par défaut (aucun fichier uploadé)</template>
        </div>
    </AppSousSectionAdmin>
</template>

<style scoped>
.aide__publication {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
    padding: 10px;
    background: #e8eaf6;
    border-radius: 6px;
}
.aide__case {
    width: auto;
    margin: 0;
    cursor: pointer;
}
.aide__libelle {
    cursor: pointer;
    margin: 0;
    font-weight: normal;
}
.aide__enregistrer,
.aide__enregistrer:hover {
    white-space: nowrap;
    background-color: #3949ab;
    color: white;
}
.aide__message {
    white-space: pre-line;
}
.aide__envoi {
    margin-top: 12px;
}
.aide__explication {
    font-size: 12px;
    color: #555;
    margin-bottom: 8px;
}
.aide__fichier {
    display: flex;
    gap: 10px;
    align-items: center;
}
.aide__champ {
    flex: 1;
}
.aide__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.aide__uploader,
.aide__uploader:hover {
    background-color: #43a047;
    color: white;
    white-space: nowrap;
}
.aide__statut {
    margin-top: 8px;
    font-size: 12px;
}
.aide__statut--ok {
    color: green;
}
.aide__statut--erreur {
    color: red;
}
.aide__actuel {
    margin-top: 12px;
    font-size: 12px;
    color: #555;
    font-style: italic;
}
.aide__supprimer,
.aide__supprimer:hover {
    background: none;
    border: none;
    color: #c0392b;
    cursor: pointer;
    text-decoration: underline;
    font-size: 12px;
    padding: 0;
}
</style>
