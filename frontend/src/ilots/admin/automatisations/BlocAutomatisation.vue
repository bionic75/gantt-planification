<!-- Cadre d'une automatisation : case d'activation et titre, bouton de repli du contenu (replié à l'ouverture).
     Teinte : orange (n°1 à 3), violet (workflow CRA), vert (astreintes HO). -->
<script setup lang="ts">
import { ref } from 'vue';

/** icone : tracés SVG 24×24 (constantes de l'écran, jamais de donnée saisie) ; absente : titre seul (émoji) */
const props = withDefaults(
    defineProps<{ numero: number; titre: string; icone?: string; teinte?: 'orange' | 'violet' | 'vert' }>(),
    { icone: undefined, teinte: 'orange' }
);
/** bascule : nouvelle activation (à enregistrer ; le modèle du parent peut ne pas être encore à jour) */
const emit = defineEmits<{ bascule: [actif: boolean] }>();
const actif = defineModel<boolean>('actif', { required: true });
const ouvert = ref(false);

const idCorps = `automation${props.numero}Body`;
</script>

<template>
    <div class="automatisation" :class="`automatisation--${teinte}`">
        <div class="automatisation__entete">
            <label class="automatisation__activation">
                <input
                    :id="`automation${numero}Enabled`"
                    v-model="actif"
                    type="checkbox"
                    class="automatisation__case"
                    @change="emit('bascule', ($event.target as HTMLInputElement).checked)"
                />
                <span class="automatisation__titre">
                    <!-- Tracés constants de l'écran, jamais de donnée saisie -->
                    <!-- eslint-disable vue/no-v-html -->
                    <svg
                        v-if="icone"
                        class="automatisation__icone"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        v-html="icone"
                    />
                    <!-- eslint-enable vue/no-v-html -->{{ titre }}
                </span>
            </label>
            <button
                type="button"
                class="automatisation__repli"
                title="Réduire / développer"
                :aria-expanded="ouvert ? 'true' : 'false'"
                :aria-controls="idCorps"
                :aria-label="`${ouvert ? 'Réduire' : 'Développer'} : ${titre}`"
                @click="ouvert = !ouvert"
            >
                <span :id="`${idCorps}SubIcon`" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span>
            </button>
        </div>
        <div v-show="ouvert" :id="idCorps">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.automatisation {
    background-color: white;
    border: 1px solid #ffcc80;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
}
.automatisation__entete {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 15px;
}
.automatisation__activation {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin: 0;
}
.automatisation__case {
    width: 18px;
    height: 18px;
    margin: 0;
}
.automatisation__titre {
    font-weight: bold;
    color: #e65100;
    font-size: 14px;
}
.automatisation__icone {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -3px;
    margin-right: 6px;
}
.automatisation__repli,
.automatisation__repli:hover {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #e65100;
    padding: 2px 8px;
}
.automatisation--violet {
    border-color: #b39ddb;
}
.automatisation--violet .automatisation__titre,
.automatisation--violet .automatisation__repli {
    color: #6a1b9a;
}
.automatisation--vert {
    border-color: #aed581;
}
.automatisation--vert .automatisation__titre,
.automatisation--vert .automatisation__repli {
    color: #33691e;
}
</style>
