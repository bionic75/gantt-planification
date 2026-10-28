<!-- Fiche d'un lieu : typologie, SAMU-SAS, note moyenne, coordonnées, commentaire du créateur, actions -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Lieu } from '@/api/poi';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppEtoiles from '@/composants/AppEtoiles.vue';
import AppIcone from '@/composants/AppIcone.vue';
import AppTag from '@/composants/AppTag.vue';
import { useConfirmation } from '@/composants/confirmation';
import AvisLieu from './AvisLieu.vue';
import { CATEGORIES, dateHeure, km, note, pluriel, lienSite } from './format';
import { useLieuxStore } from './magasin';
import TrajetLieu from './TrajetLieu.vue';

const props = defineProps<{ lieu: Lieu }>();
const emit = defineEmits<{ modifier: [lieu: Lieu]; carte: [] }>();
const lieux = useLieuxStore();
const confirmer = useConfirmation();

const fiche = ref<HTMLElement | null>(null);
const erreur = ref('');
const categorie = computed(() => CATEGORIES[props.lieu.category]);
const modifie = computed(() => props.lieu.updated_at && props.lieu.updated_at !== props.lieu.created_at);
const avisOuverts = computed(() => lieux.avisOuverts.includes(props.lieu.id));

// Clic sur le marqueur du lieu : fiche affichée et mise en évidence
watch(
    () => lieux.enEvidence,
    id => {
        if (id === props.lieu.id) fiche.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
);

async function supprimer() {
    if (!(await confirmer(`Supprimer « ${props.lieu.name} » ainsi que ses commentaires et ses notes ?`, 'Supprimer')))
        return;
    erreur.value = '';
    try {
        await lieux.supprimer(props.lieu.id);
    } catch (e) {
        erreur.value = (e as Error).message;
    }
}
</script>

<template>
    <article
        :id="`trCard_${lieu.id}`"
        ref="fiche"
        class="tr-fiche"
        :class="[`tr-fiche--${lieu.category}`, { 'tr-fiche--evidence': lieux.enEvidence === lieu.id }]"
    >
        <div class="tr-fiche__haut">
            <div>
                <AppTag
                    v-if="categorie"
                    :label="categorie.label"
                    :icon="categorie.icone"
                    :couleur="`var(--gp-cat-${lieu.category})`"
                />
                <span class="tr-meta tr-fiche__samu">
                    <AppIcone name="batiment" :scale="0.8" />{{ lieu.loc_court
                    }}<template v-if="lieu.distance_km != null"> · à {{ km(lieu.distance_km) }} km</template>
                </span>
                <h3 class="tr-fiche__nom">{{ lieu.name }}</h3>
            </div>
            <div class="tr-fiche__note">
                <AppEtoiles :note="lieu.avg_rating" :taille="18" />
                <div class="tr-fiche__note-texte">
                    <template v-if="lieu.avg_rating != null">
                        <b>{{ note(lieu.avg_rating) }}</b> / 5 · {{ pluriel(lieu.n_ratings, 'note') }}
                    </template>
                    <template v-else>Pas encore noté</template>
                </div>
            </div>
        </div>
        <div class="tr-meta">
            <span v-if="lieu.address"><AppIcone name="epingle" :scale="0.8" /> {{ lieu.address }}</span>
            <span v-if="lieu.phone"><AppIcone name="telephone" :scale="0.8" /> {{ lieu.phone }}</span>
            <a v-if="lieu.website" :href="lienSite(lieu.website)" target="_blank" rel="noopener">
                <AppIcone name="globe" :scale="0.8" /> Site web
            </a>
            <AppButton
                secondary
                size="sm"
                icon="repere"
                title="Voir sur la carte"
                label="Carte"
                @click="emit('carte')"
            />
        </div>
        <div v-if="lieu.comment" class="tr-fiche__commentaire">{{ lieu.comment }}</div>
        <div class="tr-meta tr-fiche__auteur">
            <AppIcone name="utilisateur" :scale="0.8" /> Ajouté par <b>{{ lieu.creator }}</b> le
            {{ dateHeure(lieu.created_at)
            }}<template v-if="modifie"> · modifié le {{ dateHeure(lieu.updated_at) }}</template>
        </div>
        <div class="tr-fiche__actions">
            <AppButton
                secondary
                icon="repere"
                title="Parcours et temps de trajet jusqu'au SAMU-SAS"
                label="Trajet vers le SAMU-SAS"
                :aria-expanded="lieux.trajet?.id === lieu.id ? 'true' : 'false'"
                @click="lieux.basculerTrajet(lieu.id)"
            />
            <AppButton
                secondary
                icon="commentaire"
                :label="`Avis et notes (${pluriel(lieu.n_comments, 'commentaire')})`"
                :aria-expanded="avisOuverts ? 'true' : 'false'"
                @click="lieux.basculerAvis(lieu.id)"
            />
            <template v-if="lieu.can_edit">
                <AppButton secondary icon="crayon" label="Modifier" @click="emit('modifier', lieu)" />
                <AppButton danger icon="corbeille" label="Supprimer" @click="supprimer" />
            </template>
        </div>
        <AppAlert v-if="erreur" type="error" small :description="erreur" />
        <TrajetLieu v-if="lieux.trajet?.id === lieu.id" />
        <AvisLieu v-if="avisOuverts" :lieu="lieu" />
    </article>
</template>

<style scoped>
.tr-fiche {
    background: var(--gp-fond);
    border: 1px solid var(--gp-bordure-carte);
    border-left: 5px solid var(--gp-cat-aucune);
    border-radius: var(--gp-rayon-2);
    padding: var(--gp-espace-3) 14px;
    transition: box-shadow 0.15s;
}
.tr-fiche--hebergement {
    border-left-color: var(--gp-cat-hebergement);
}
.tr-fiche--restaurant {
    border-left-color: var(--gp-cat-restaurant);
}
.tr-fiche--bar {
    border-left-color: var(--gp-cat-bar);
}
.tr-fiche--evidence {
    box-shadow: 0 0 0 3px var(--gp-primaire-halo);
}
.tr-fiche__haut {
    display: flex;
    justify-content: space-between;
    gap: var(--gp-espace-2);
    flex-wrap: wrap;
    align-items: flex-start;
}
.tr-fiche__samu {
    display: inline-flex;
    margin-left: 6px;
}
.tr-fiche__nom {
    margin: 6px 0 2px;
    font-size: var(--gp-police-xl);
    color: var(--gp-texte-titre);
    border: none;
    padding: 0;
}
.tr-fiche__note {
    text-align: right;
}
.tr-fiche__note-texte {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
}
.tr-meta {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
    display: flex;
    flex-wrap: wrap;
    gap: 4px var(--gp-espace-3);
    align-items: center;
}
.tr-fiche__commentaire {
    margin: var(--gp-espace-2) 0;
    padding: var(--gp-espace-2) 10px;
    background: var(--gp-fond-doux);
    border-radius: var(--gp-rayon-1);
    font-size: var(--gp-police-m);
    color: var(--gp-texte);
    white-space: pre-wrap;
}
.tr-fiche__auteur {
    margin-top: var(--gp-espace-1);
    gap: 3px;
}
.tr-fiche__actions {
    display: flex;
    gap: var(--gp-espace-2);
    flex-wrap: wrap;
    margin-top: 10px;
    align-items: center;
}
</style>
