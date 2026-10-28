<!-- Fenêtre modale ; interface de DsfrModal (VueDsfr) : opened, title, isAlert, événement close.
     Accessibilité : rôle dialog (alertdialog pour une confirmation), titre associé, focus placé dans la fenêtre et
     maintenu à l'intérieur, Échap pour fermer, focus rendu à l'élément d'origine à la fermeture. -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import AppButton from './AppButton.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{ opened: boolean; title: string; isAlert?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const idTitre = `gp-modale-${useId()}`;
const boite = ref<HTMLElement | null>(null);
let origine: HTMLElement | null = null;

const FOCALISABLES =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const elementsFocalisables = () =>
    // Hors éléments masqués (attribut hidden, v-show)
    [...(boite.value?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])].filter(
        el => !el.closest('[hidden], [style*="display: none"]')
    );

function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        e.stopPropagation();
        emit('close');
        return;
    }
    if (e.key !== 'Tab') return;
    const elements = elementsFocalisables();
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (!premier || !dernier) return;
    if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
    }
}

watch(
    () => props.opened,
    async ouverte => {
        if (ouverte) {
            origine = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            await nextTick();
            // Premier champ, ou à défaut premier bouton après celui de fermeture
            const elements = elementsFocalisables();
            const champ = elements.find(el => el.matches('input, select, textarea'));
            (champ ?? elements[props.isAlert ? 0 : 1] ?? elements[0])?.focus();
        } else {
            origine?.focus();
            origine = null;
        }
    },
    { immediate: true }
);

onBeforeUnmount(() => origine?.focus());
</script>

<template>
    <Teleport to="body">
        <div v-if="opened" v-bind="$attrs" class="gp-modale">
            <div
                ref="boite"
                class="gp-modale__boite"
                :class="{ 'gp-modale__boite--alerte': isAlert }"
                :role="isAlert ? 'alertdialog' : 'dialog'"
                aria-modal="true"
                :aria-labelledby="idTitre"
                @keydown="clavier"
            >
                <div class="gp-modale__entete">
                    <h3 :id="idTitre" class="gp-modale__titre">{{ title }}</h3>
                    <AppButton
                        v-if="!isAlert"
                        secondary
                        icon="fermer"
                        icon-only
                        label="Fermer"
                        @click="emit('close')"
                    />
                </div>
                <slot />
                <div v-if="$slots.footer" class="gp-modale__actions">
                    <slot name="footer" />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.gp-modale {
    position: fixed;
    inset: 0;
    background: var(--gp-voile);
    z-index: 3000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: auto;
    padding: 30px var(--gp-espace-3);
}
.gp-modale__boite {
    background: var(--gp-fond);
    color: var(--gp-texte);
    width: min(760px, 100%);
    border-radius: var(--gp-rayon-3);
    padding: 18px var(--gp-espace-5);
    box-shadow: var(--gp-ombre-fenetre);
    box-sizing: border-box;
}
.gp-modale__boite--alerte {
    width: min(460px, 100%);
    margin-top: 10vh;
}
.gp-modale__entete {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--gp-espace-3);
}
.gp-modale__titre {
    margin: 0;
    border: none;
    padding: 0;
    font-size: 18px;
    color: var(--gp-texte-titre);
}
.gp-modale__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--gp-espace-2);
    margin-top: var(--gp-espace-3);
}
</style>
