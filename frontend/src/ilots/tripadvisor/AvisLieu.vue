<!-- Avis d'un lieu : ma note, notes des contributeurs, commentaires (ajout, modification, suppression selon les droits) -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { apiLieux, type DetailLieu, type Lieu } from '@/api/poi';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppEtoiles from '@/composants/AppEtoiles.vue';
import AppInput from '@/composants/AppInput.vue';
import AppNotation from '@/composants/AppNotation.vue';
import { useConfirmation } from '@/composants/confirmation';
import { dateHeure } from './format';
import { useLieuxStore } from './magasin';

const props = defineProps<{ lieu: Lieu }>();
const lieux = useLieuxStore();
const confirmer = useConfirmation();

const detail = ref<DetailLieu | null>(null);
const erreur = ref('');
const brouillon = ref('');
const edition = ref<{ id: number; texte: string } | null>(null);

const maNote = computed(() => detail.value?.ratings.find(r => r.user_id === lieux.userId) ?? null);

async function charger() {
    try {
        detail.value = await apiLieux.detail(props.lieu.id);
    } catch (e) {
        erreur.value = (e as Error).message;
    }
}
onMounted(charger);
// Liste rechargée (note, commentaire, autre action) : avis à jour, édition en cours abandonnée
watch(
    () => lieux.version,
    () => {
        edition.value = null;
        void charger();
    }
);

async function agir(action: () => Promise<unknown>) {
    erreur.value = '';
    try {
        await action();
        return true;
    } catch (e) {
        erreur.value = (e as Error).message;
        return false;
    }
}

const noter = (n: number) => agir(() => lieux.noter(props.lieu.id, n));
const retirerNote = (autre?: number) => agir(() => lieux.retirerNote(props.lieu.id, autre));

async function publier() {
    const texte = brouillon.value.trim();
    if (!texte) {
        erreur.value = 'Saisissez un commentaire.';
        return;
    }
    if (await agir(() => lieux.commenter(props.lieu.id, texte))) brouillon.value = '';
}

function enregistrerCommentaire() {
    const e = edition.value;
    if (e) void agir(() => lieux.modifierCommentaire(e.id, e.texte));
}

async function supprimerCommentaire(cid: number) {
    if (await confirmer('Supprimer ce commentaire ?', 'Supprimer')) await agir(() => lieux.supprimerCommentaire(cid));
}
</script>

<template>
    <div class="tr-avis">
        <AppAlert v-if="erreur" type="error" small :description="erreur" />
        <template v-if="detail">
            <div class="tr-avis__ma-note">
                <b>Ma note</b>
                <AppNotation
                    :model-value="maNote?.rating ?? 0"
                    :taille="24"
                    label="Ma note"
                    @update:model-value="noter"
                />
                <AppButton v-if="maNote" link danger label="retirer ma note" @click="retirerNote()" />
                <span v-else class="tr-avis__aide">Cliquez sur une étoile pour noter ce lieu</span>
            </div>
            <div v-if="detail.ratings.length" class="tr-avis__notes">
                Notes :
                <span
                    v-for="r in detail.ratings"
                    :key="r.user_id"
                    class="tr-avis__note"
                    :title="`Le ${dateHeure(r.updated_at)}`"
                >
                    <AppEtoiles :note="r.rating" :taille="11" /> {{ r.author }}
                    <AppButton
                        v-if="r.can_edit && r.user_id !== lieux.userId && lieux.estAdmin"
                        link
                        danger
                        icon="fermer"
                        icon-only
                        :label="`Supprimer la note de ${r.author}`"
                        @click="retirerNote(r.user_id)"
                    />
                </span>
            </div>
            <div class="tr-avis__titre">Commentaires ({{ detail.comments.length }})</div>
            <div v-for="c in detail.comments" :id="`trC_${c.id}`" :key="c.id" class="tr-avis__commentaire">
                <template v-if="edition?.id === c.id">
                    <AppInput
                        :id="`trEd_${c.id}`"
                        v-model="edition.texte"
                        is-textarea
                        :label-visible="false"
                        label="Modifier le commentaire"
                        rows="3"
                        maxlength="2000"
                    />
                    <div class="tr-avis__actions">
                        <AppButton secondary label="Annuler" @click="edition = null" />
                        <AppButton label="Enregistrer" @click="enregistrerCommentaire" />
                    </div>
                </template>
                <template v-else>
                    <div class="tr-avis__entete">
                        <b class="tr-avis__auteur">{{ c.author }}</b> le {{ dateHeure(c.created_at) }}
                        <template v-if="c.updated_at !== c.created_at">
                            · modifié le {{ dateHeure(c.updated_at) }}</template
                        >
                        <span v-if="c.can_edit" class="tr-avis__liens">
                            <AppButton link label="Modifier" @click="edition = { id: c.id, texte: c.text }" />
                            <AppButton link danger label="Supprimer" @click="supprimerCommentaire(c.id)" />
                        </span>
                    </div>
                    <div class="tr-avis__texte">{{ c.text }}</div>
                </template>
            </div>
            <div v-if="!detail.comments.length" class="tr-avis__aide">Aucun commentaire pour le moment.</div>
            <div class="tr-avis__nouveau">
                <AppInput
                    :id="`trNew_${lieu.id}`"
                    v-model="brouillon"
                    is-textarea
                    :label-visible="false"
                    label="Ajouter un commentaire"
                    placeholder="Ajouter un commentaire…"
                    rows="2"
                    maxlength="2000"
                />
                <div class="tr-avis__actions">
                    <AppButton icon="commentaire" label="Publier" @click="publier" />
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.tr-avis {
    border-top: 1px dashed var(--gp-bordure-tiretee);
    margin-top: 10px;
    padding-top: 10px;
}
.tr-avis__ma-note {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: var(--gp-espace-2);
    font-size: var(--gp-police-m);
}
.tr-avis__aide {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-discret);
}
.tr-avis__notes {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
    margin-bottom: 10px;
}
.tr-avis__note {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-right: 10px;
}
.tr-avis__titre {
    font-weight: 700;
    font-size: var(--gp-police-m);
    margin-bottom: var(--gp-espace-1);
}
.tr-avis__commentaire {
    padding: var(--gp-espace-2) 0;
    border-top: 1px solid var(--gp-bordure-legere);
    font-size: var(--gp-police-m);
}
.tr-avis__commentaire:first-of-type {
    border-top: none;
}
.tr-avis__entete {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
    display: flex;
    gap: var(--gp-espace-2);
    flex-wrap: wrap;
    align-items: center;
}
.tr-avis__auteur {
    color: var(--gp-texte);
}
.tr-avis__liens {
    margin-left: auto;
    display: inline-flex;
    gap: 6px;
}
.tr-avis__texte {
    white-space: pre-wrap;
    margin-top: 3px;
}
.tr-avis__nouveau {
    margin-top: var(--gp-espace-2);
}
.tr-avis__actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: var(--gp-espace-1);
}
</style>
