// Paramétrages divers : paramètres enregistrés (version, inactivité, favicon, publication de l'aide)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiParametres, type Parametres } from '@/api/parametrages';

export const useParametragesStore = defineStore('admin-parametrages', () => {
    const parametres = ref<Parametres>({});
    const charge = ref(false);

    async function charger() {
        try {
            parametres.value = await apiParametres.lire();
            charge.value = true;
        } catch {
            /* paramètres inchangés */
        }
    }

    /** Enregistrement d'une ou plusieurs clés ; toutes doivent réussir */
    async function enregistrer(valeurs: Record<string, string>) {
        const reponses = [];
        for (const [cle, valeur] of Object.entries(valeurs))
            reponses.push(await apiParametres.enregistrer(cle, valeur));
        if (reponses.some(r => !r.success)) throw new Error('Erreur lors de la sauvegarde');
        parametres.value = { ...parametres.value, ...valeurs };
    }

    return { parametres, charge, charger, enregistrer };
});
