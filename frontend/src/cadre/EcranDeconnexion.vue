<!-- Déconnexion en cours (écran d'attente) et échec de la déconnexion (message à fermer), session/session.ts -->
<script setup lang="ts">
import { etatSession } from '@/session/session';
</script>

<template>
    <div v-if="etatSession.deconnexion" id="logout-loading" class="gp-deconnexion" role="status">
        <div class="gp-deconnexion__roue"></div>
        <div>Déconnexion en cours...</div>
    </div>
    <div v-if="etatSession.erreur" class="gp-deconnexion-erreur" role="alert">
        <span>{{ etatSession.erreur }}</span>
        <button
            type="button"
            class="gp-deconnexion-erreur__fermer"
            aria-label="Fermer"
            @click="etatSession.erreur = ''"
        >
            ×
        </button>
    </div>
</template>

<style>
.gp-deconnexion {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    color: white;
    font-size: 18px;
    font-weight: bold;
}
.gp-deconnexion__roue {
    border: 8px solid #f3f3f3;
    border-top: 8px solid #3498db;
    border-radius: 50%;
    width: 60px;
    height: 60px;
    animation: gp-deconnexion-tour 1s linear infinite;
    margin-bottom: 20px;
}
@keyframes gp-deconnexion-tour {
    to {
        transform: rotate(360deg);
    }
}
.gp-deconnexion-erreur {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fdecea;
    color: #b71c1c;
    border: 1px solid #f5c6cb;
    border-radius: 6px;
    padding: 10px 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    font-size: 14px;
}
.gp-deconnexion-erreur__fermer {
    background: none;
    border: none;
    color: inherit;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
}
</style>
