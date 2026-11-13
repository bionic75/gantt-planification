<!-- Sablier stylisé qui se retourne en continu : chargement en cours (lecture d'Asana, etc.) -->
<script setup lang="ts">
defineProps<{ texte?: string }>();
</script>

<template>
    <span class="app-sablier" role="status" aria-live="polite">
        <svg class="app-sablier__icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
                class="app-sablier__verre"
                d="M6 2h12M6 22h12M7 2v4.2c0 1.2.6 2.3 1.6 3L12 12l-3.4 2.8c-1 .7-1.6 1.8-1.6 3V22M17 2v4.2c0 1.2-.6 2.3-1.6 3L12 12l3.4 2.8c1 .7 1.6 1.8 1.6 3V22"
            />
            <path class="app-sablier__sable-haut" d="M9 5.5h6l-3 4.5Z" />
            <path class="app-sablier__sable-bas" d="M8.6 20h6.8c-.5-1.8-2-3-3.4-3s-2.9 1.2-3.4 3Z" />
        </svg>
        <span v-if="texte" class="app-sablier__texte">{{ texte }}</span>
    </span>
</template>

<style scoped>
.app-sablier {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #0f766e;
    font-size: 13px;
}
.app-sablier__texte {
    color: #455a64;
}
.app-sablier__icone {
    flex: 0 0 auto;
    animation: app-sablier-tour 2.2s cubic-bezier(0.6, 0, 0.3, 1) infinite;
}
.app-sablier__verre {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.app-sablier__sable-haut,
.app-sablier__sable-bas {
    fill: #e0a526;
    transform-box: fill-box;
    transform-origin: center;
    animation: app-sablier-sable 2.2s linear infinite;
}
.app-sablier__sable-bas {
    animation-name: app-sablier-sable-bas;
}
@keyframes app-sablier-tour {
    0%,
    70% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(180deg);
    }
}
@keyframes app-sablier-sable {
    0% {
        transform: scaleY(1);
    }
    70%,
    100% {
        transform: scaleY(0.15);
    }
}
@keyframes app-sablier-sable-bas {
    0% {
        transform: scaleY(0.3);
    }
    70%,
    100% {
        transform: scaleY(1);
    }
}
@media (prefers-reduced-motion: reduce) {
    .app-sablier__icone,
    .app-sablier__sable-haut,
    .app-sablier__sable-bas {
        animation: none;
    }
}
</style>
