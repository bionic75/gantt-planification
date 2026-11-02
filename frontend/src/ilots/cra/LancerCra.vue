<!-- Onglet CRA, administrateur : « CRA à lancer » — CRA d'un expert (ressource active participant aux astreintes)
     pour l'un des treize derniers mois ; liste des experts relue à chaque ouverture de l'onglet -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiCra, type ExpertCra } from '@/api/cra';
import { surReouverture } from '@/ilots/activation';
import { emettre } from '@/liaison';
import { periodesLancement } from './administration';
import { useCraStore } from './magasin';

const magasin = useCraStore();

const experts = ref<ExpertCra[]>([]);
const periodes = ref(periodesLancement());
const expert = ref('');
const periode = ref('');
const enCours = ref(false);

async function preparer() {
    periodes.value = periodesLancement();
    expert.value = '';
    // Mois courant proposé par défaut
    periode.value = periodes.value[periodes.value.length - 1]!.valeur;
    try {
        experts.value = await apiCra.expertsLancement();
    } catch (e) {
        console.warn('Erreur chargement experts CRA lancer:', e);
    }
}
onMounted(preparer);
surReouverture(preparer);

async function lancer() {
    magasin.messageAdmin = null;
    if (!expert.value || !periode.value) {
        magasin.messageAdmin = { type: 'error', texte: 'Veuillez sélectionner un expert et une période.' };
        return;
    }
    const [mois, annee] = periode.value.split(':').map(Number);
    enCours.value = true;
    try {
        await apiCra.lancer(Number(expert.value), mois!, annee!);
        expert.value = '';
        periode.value = '';
        await magasin.rafraichir();
        emettre('cra-modifies');
    } catch (e) {
        magasin.messageAdmin = {
            type: 'error',
            texte:
                e instanceof ErreurApi
                    ? `⚠️ Impossible de lancer le CRA :\n${e.message}`
                    : 'Erreur réseau lors du lancement du CRA.'
        };
    } finally {
        enCours.value = false;
    }
}
</script>

<template>
    <div class="cra-lancer">
        <h3 class="cra-lancer__titre">🚀 CRA à lancer</h3>
        <div class="cra-lancer__ligne">
            <div>
                <label for="craLancerExpert" class="cra-lancer__libelle">Expert</label>
                <select id="craLancerExpert" v-model="expert" class="cra-lancer__expert">
                    <option value="">— Choisir un expert —</option>
                    <option v-for="e in experts" :key="e.user_id" :value="String(e.user_id)">
                        {{ e.nom }} {{ e.prenom }}
                    </option>
                </select>
            </div>
            <div>
                <label for="craLancerMoisAnnee" class="cra-lancer__libelle">Mois / Année</label>
                <select id="craLancerMoisAnnee" v-model="periode" class="cra-lancer__periode">
                    <option value="">— Choisir une période —</option>
                    <option v-for="p in periodes" :key="p.valeur" :value="p.valeur">{{ p.libelle }}</option>
                </select>
            </div>
            <button type="button" class="cra-lancer__bouton" :disabled="enCours" @click="lancer">
                <span :key="String(enCours)">{{ enCours ? '⏳ Lancement...' : '▶ Lancer le CRA' }}</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.cra-lancer {
    background: #e3f2fd;
    border: 1px solid #90caf9;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 16px;
}
.cra-lancer__titre {
    color: #1565c0;
    margin: 0 0 12px;
    font-size: 15px;
}
.cra-lancer__ligne {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: flex-end;
}
.cra-lancer__libelle {
    font-size: 12px;
    color: #555;
    display: block;
    margin-bottom: 4px;
    font-weight: normal;
}
.cra-lancer__expert,
.cra-lancer__periode {
    padding: 6px;
    border: 1px solid #90caf9;
    border-radius: 4px;
    font-size: 13px;
}
.cra-lancer__expert {
    width: 240px;
}
.cra-lancer__periode {
    width: 180px;
}
.cra-lancer__bouton,
.cra-lancer__bouton:hover {
    background: #1565c0;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
}
</style>
