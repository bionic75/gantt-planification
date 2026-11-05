<!-- Fenêtre contextuelle d'une case du planning HO (choix des experts, désignation HO ANS), placée sous la case ;
     fermée par un clic en dehors ou Échap -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ ancre: HTMLElement; titre: string; ans?: boolean }>();
const emit = defineEmits<{ fermer: [ancre: HTMLElement] }>();
const boite = ref<HTMLElement | null>(null);

/** Position d'après la case (sous elle, dans la largeur de la fenêtre) */
const position = computed(() => {
    const r = props.ancre.getBoundingClientRect();
    return {
        top: `${window.scrollY + r.bottom + 4}px`,
        left: `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 240))}px`
    };
});

function clic(e: MouseEvent) {
    const cible = e.target as Node;
    if (boite.value?.contains(cible) || props.ancre.contains(cible)) return;
    emit('fermer', props.ancre);
}
const touche = (e: KeyboardEvent) => e.key === 'Escape' && emit('fermer', props.ancre);

onMounted(() => {
    document.addEventListener('click', clic);
    document.addEventListener('keydown', touche);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', clic);
    document.removeEventListener('keydown', touche);
});
</script>

<template>
    <Teleport to="body">
        <!-- Position calculée d'après la case -->
        <div
            ref="boite"
            class="ho-popover"
            :class="{ 'ho-ans-popover': ans }"
            role="dialog"
            :aria-label="titre"
            :style="position"
        >
            <div class="choix-ho__titre">{{ titre }}</div>
            <slot />
        </div>
    </Teleport>
</template>

<style scoped>
.choix-ho__titre {
    font-weight: 700;
    margin-bottom: 6px;
}
</style>
