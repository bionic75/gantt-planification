// Session de l'utilisateur connecté, partagée par les îlots
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '@/api/client';
import type { Session } from '@/api/types';

export const useSessionStore = defineStore('session', () => {
    const session = ref<Session | null>(null);
    let chargement: Promise<Session> | null = null;

    /** Session lue une seule fois auprès du serveur (appels simultanés regroupés) */
    async function charger(): Promise<Session> {
        if (session.value) return session.value;
        chargement ??= api.get<Session>('/check-session').then(s => (session.value = s));
        try {
            return await chargement;
        } finally {
            chargement = null;
        }
    }

    function oublier() {
        session.value = null;
    }

    const profil = computed(() => session.value?.activeProfile ?? null);
    const estAdmin = computed(() => profil.value === 'admin');

    return { session, profil, estAdmin, charger, oublier };
});
