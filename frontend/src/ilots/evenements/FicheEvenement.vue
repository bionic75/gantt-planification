<!-- Fiche d'un événement de la liste : type et localisation, créateur, dates, participants, GRIST, actions -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Evenement } from '@/api/evenements';
import AppIcone from '@/composants/AppIcone.vue';
import {
    aUnType,
    couleurParticipant,
    couleurs,
    iconeEvenement,
    initiales,
    libelleAffiche,
    libelleCourt,
    mentionCreation,
    nomCreateur,
    nomParticipant,
    periodeAffichee
} from './calculs';
import { useEvenementsStore } from './magasin';

const props = defineProps<{ evenement: Evenement }>();
const emit = defineEmits<{ supprimer: [evenement: Evenement] }>();
const ev = useEvenementsStore();

const e = computed(() => props.evenement);
const c = computed(() => couleurs(e.value));
const periode = computed(() => periodeAffichee(e.value));
const createur = computed(() => nomCreateur(e.value));
const mention = computed(() => mentionCreation(e.value.created_at));
const libelleSecondaire = computed(() =>
    aUnType(e.value) && e.value.label && e.value.label !== libelleCourt(e.value) ? e.value.label : ''
);
const participants = computed(() => [
    ...(e.value.participants || []).map(p => ({
        externe: false,
        nom: nomParticipant(p),
        initiales: initiales(p.prenom, p.nom),
        email: p.email
    })),
    ...(e.value.external_participants || []).map(p => ({
        externe: true,
        nom: p.email || nomParticipant(p) || '?',
        initiales: '✉',
        email: p.email
    }))
]);
/**
 * « Participer » proposé à un expert non participant. Comme l'ancien écran, la comparaison porte sur un champ « id »
 * que les participants n'ont pas (« user_id ») : le bouton reste proposé à un expert déjà participant (anomalie connue).
 */
const peutParticiper = computed(
    () =>
        ev.profil === 'expert' &&
        !(e.value.participants as Array<{ id?: number }>).some(p => p.id != null && p.id === ev.userId)
);
const styleEtiquette = computed(() => ({
    background: c.value.fond,
    color: c.value.texte,
    borderColor: c.value.bordure
}));
</script>

<template>
    <div class="ev-fiche" :style="{ borderLeftColor: c.bordure }">
        <div class="ev-fiche__ligne">
            <div class="ev-fiche__contenu">
                <div class="ev-fiche__entete">
                    <span class="ev-fiche__etiquette" :style="styleEtiquette"
                        ><AppIcone
                            v-if="iconeEvenement(e)"
                            :name="iconeEvenement(e)"
                            :scale="0.8"
                            class="ev-fiche__icone"
                        />{{ libelleAffiche(e, ev.localisations) }}</span
                    >
                    <span v-if="libelleSecondaire" class="ev-fiche__libelle" :title="`Type : ${e.type_long}`">{{
                        libelleSecondaire
                    }}</span>
                    <span
                        v-if="e.creator_prenom || e.creator_nom"
                        class="ev-fiche__createur"
                        :title="`${mention}${createur}`"
                        >{{ mention
                        }}<span
                            class="ev-fiche__avatar ev-fiche__avatar--createur"
                            :style="{ background: couleurParticipant(createur) }"
                            >{{ initiales(e.creator_prenom, e.creator_nom) }}</span
                        >{{ createur }}</span
                    >
                    <span v-else class="ev-fiche__createur-inconnu"
                        ><AppIcone name="user" :scale="0.8" class="ev-fiche__icone" />{{ mention }}{{ createur }}</span
                    >
                </div>
                <div class="ev-fiche__dates">
                    <AppIcone name="calendar" :scale="0.85" class="ev-fiche__icone" />{{ periode.texte }}
                    <span class="ev-fiche__jours">({{ periode.jours }} jour{{ periode.jours > 1 ? 's' : '' }})</span>
                </div>
                <div v-if="participants.length" class="ev-fiche__participants">
                    <span class="ev-fiche__icone-participants"><AppIcone name="users" :scale="0.85" /></span>
                    <span
                        v-for="(p, i) in participants"
                        :key="i"
                        class="ev-fiche__participant"
                        :class="{ 'ev-fiche__participant--externe': p.externe }"
                        :title="p.externe ? `Invité externe : ${p.nom}` : `${p.nom}${p.email ? ` (${p.email})` : ''}`"
                    >
                        <span
                            class="ev-fiche__avatar"
                            :class="{ 'ev-fiche__avatar--externe': p.externe }"
                            :style="{ background: p.externe ? '#78909c' : couleurParticipant(p.nom) }"
                            >{{ p.initiales }}</span
                        >
                        {{ p.nom }}
                    </span>
                </div>
                <div class="ev-fiche__grist">
                    <input
                        type="checkbox"
                        :checked="!!e.grist"
                        disabled
                        :aria-label="`GRIST : ${e.grist ? 'oui' : 'non'}`"
                    />
                    <span>GRIST</span>
                </div>
            </div>
            <div class="ev-fiche__actions">
                <button
                    v-if="peutParticiper"
                    type="button"
                    class="ev-fiche__participer"
                    title="Me déclarer participant"
                    @click="ev.participer(e.id)"
                >
                    <AppIcone name="hand" :scale="0.85" class="ev-fiche__icone" />Participer
                </button>
                <button
                    type="button"
                    class="ev-fiche__bouton ev-fiche__bouton--modifier"
                    title="Modifier l'événement"
                    aria-label="Modifier l'événement"
                    @click="ev.modifier(e)"
                >
                    <AppIcone name="pencil" />
                </button>
                <button
                    v-if="ev.profil === 'admin'"
                    type="button"
                    class="ev-fiche__bouton ev-fiche__bouton--supprimer"
                    title="Supprimer l'événement"
                    aria-label="Supprimer l'événement"
                    @click="emit('supprimer', e)"
                >
                    <AppIcone name="trash" />
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ev-fiche {
    background: white;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 6px;
    border-left: 4px solid #fbc02d;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.ev-fiche__ligne {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
}
.ev-fiche__contenu {
    flex: 1;
}
.ev-fiche__entete {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 5px;
}
.ev-fiche__etiquette {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    border: 2px solid;
}
.ev-fiche__icone {
    margin-right: 5px;
}
.ev-fiche__libelle {
    font-size: 12px;
    color: #444;
}
.ev-fiche__createur {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #777;
}
.ev-fiche__createur-inconnu {
    font-size: 10px;
    color: #888;
}
.ev-fiche__avatar {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: bold;
}
.ev-fiche__avatar--createur {
    width: 20px;
    height: 20px;
    color: #fff;
    font-size: 9px;
}
.ev-fiche__avatar--externe {
    font-size: 9px;
}
.ev-fiche__dates {
    font-size: 11px;
    color: #666;
}
.ev-fiche__jours {
    color: #999;
}
.ev-fiche__participants {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
}
.ev-fiche__icone-participants {
    font-size: 10px;
    color: #888;
    margin-right: 2px;
}
.ev-fiche__participant {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #f0f0f0;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 1px 7px 1px 1px;
    font-size: 10px;
}
.ev-fiche__participant--externe {
    background: #eceff1;
    border-color: #b0bec5;
}
.ev-fiche__grist {
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
}
.ev-fiche__grist input {
    margin: 0;
    width: auto;
    cursor: default;
    opacity: 0.5;
}
.ev-fiche__grist span {
    font-size: 10px;
    color: #aaa;
    font-weight: bold;
}
.ev-fiche__actions {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    align-items: center;
}
.ev-fiche__participer {
    background: #27ae60;
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
}
.ev-fiche__bouton {
    width: 30px;
    height: 30px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 6px;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
.ev-fiche__bouton:hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
}
.ev-fiche__bouton--modifier {
    background: #ff9800;
}
.ev-fiche__bouton--modifier:hover {
    background: #ff9800;
}
.ev-fiche__bouton--supprimer {
    background: #e53935;
}
.ev-fiche__bouton--supprimer:hover {
    background: #e53935;
}
</style>
