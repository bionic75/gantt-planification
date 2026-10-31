// Types d'événements partagés par le paramétrage et la reprise des données ; une modification est signalée aux deux
// sous-sections (version) et à l'ancien code (planning) comme à l'onglet Événements (îlot Vue)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiTypesEvenements, type TypeAdmin } from '@/api/typesEvenements';
import { emettre } from '@/liaison';

export const useTypesEvenementsStore = defineStore('admin-types-evenements', () => {
    const types = ref<TypeAdmin[]>([]);
    /** Incrémentée à chaque modification des types (paramétrage) ou des événements (reprise) */
    const version = ref(0);
    const origine = ref<'types' | 'reprise' | null>(null);

    async function charger() {
        try {
            types.value = (await apiTypesEvenements.liste()).types ?? [];
        } catch {
            /* liste inchangée */
        }
    }

    /** Types ou événements modifiés : planning (dates particulières) et onglet Événements rafraîchis */
    function modifies(par: 'types' | 'reprise') {
        origine.value = par;
        version.value++;
        emettre('types-evenements-modifies');
        emettre('dates-particulieres-modifiees');
    }

    const parId = (id: number | null | undefined) => types.value.find(t => t.id === Number(id));

    return { types, version, origine, charger, modifies, parId };
});
