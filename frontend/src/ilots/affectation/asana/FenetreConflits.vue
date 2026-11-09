<!-- Conflits avec Asana : rubriques modifiées dans l'application ET dans Asana depuis la dernière reprise, jamais écrasées
     sans accord ; choix, rubrique par rubrique, de conserver la valeur de l'application ou de reprendre celle d'Asana -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiAsana, type ConflitsDeploiement } from '@/api/asana';
import AppModal from '@/composants/AppModal.vue';
import IconeAff from '../administration/IconeAff.vue';
import { useAsanaStore } from './magasin';

const props = defineProps<{ conflits: ConflitsDeploiement[] }>();
const emit = defineEmits<{ fermer: [] }>();

const magasin = useAsanaStore();
/** Choix par déploiement (indice) et rubrique ; l'application par défaut */
const choix = ref<Record<string, 'app' | 'asana'>[]>(
    props.conflits.map(d => Object.fromEntries(d.rows.map(r => [r.key, 'app' as const])))
);
const nombre = computed(() => props.conflits.reduce((n, d) => n + d.rows.length, 0));
const erreur = ref('');
const envoi = ref(false);

function tout(i: number, valeur: 'app' | 'asana') {
    const c = choix.value[i]!;
    for (const k of Object.keys(c)) c[k] = valeur;
}

async function valider() {
    envoi.value = true;
    erreur.value = '';
    let reprises = 0;
    let gardees = 0;
    try {
        for (const [i, d] of props.conflits.entries()) {
            const r = await apiAsana.trancher(d.id, choix.value[i]!);
            reprises += r.applied;
            gardees += r.kept;
        }
        emit('fermer');
        magasin.deploiementsModifies();
        magasin.annoncer(
            `Conflits tranchés : ${reprises} reprise(s) depuis Asana, ${gardees} valeur(s) conservée(s) dans l'application.`,
            false,
            6000
        );
    } catch (e) {
        erreur.value = (e as Error).message;
        envoi.value = false;
    }
}
</script>

<template>
    <AppModal
        id="affAsanaConfModal"
        opened
        title="Conflits avec Asana : à vous de trancher"
        class="aff-asana-conf"
        @close="emit('fermer')"
    >
        <div id="affAsanaConfBody">
            <p class="aff-asana-intro">
                <b>{{ nombre }}</b> donnée(s) ont été modifiées <b>dans l'application</b> et ont aussi changé
                <b>dans Asana</b> : rien n'a été écrasé. Pour chacune, choisissez la valeur à conserver.
            </p>
            <div v-for="(d, i) in conflits" :key="d.id" class="aff-asana-bloc">
                <div class="aff-asana-bloc__tete aff-asana-bloc__tete--conflit">
                    <b>{{ d.samu }}</b
                    ><span v-if="d.asana" class="aff-muted aff-asana-petit">Projet Asana : {{ d.asana }}</span>
                    <span class="aff-asana-conf__tout"
                        ><a href="#" @click.prevent="tout(i, 'app')">tout conserver (application)</a> ·
                        <a href="#" @click.prevent="tout(i, 'asana')">tout reprendre (Asana)</a></span
                    >
                </div>
                <table class="aff-asana-table">
                    <thead>
                        <tr>
                            <th class="aff-asana-conf__rubrique">Rubrique</th>
                            <th>Dans l'application</th>
                            <th>Dans Asana</th>
                            <th>Votre choix</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in d.rows" :key="r.key" class="aff-asana-conf__ligne">
                            <td class="aff-asana-conf__libelle">
                                {{ r.label }}
                                <div v-if="r.previous" class="aff-muted aff-asana-conf__precedente">
                                    Dernière reprise d'Asana : {{ r.previous }}
                                </div>
                            </td>
                            <td class="aff-asana-conf__app">✎ {{ r.app || '—' }}</td>
                            <td class="aff-asana-conf__asana">{{ r.asana || '—' }}</td>
                            <td class="aff-asana-conf__choix">
                                <label
                                    ><input
                                        v-model="choix[i]![r.key]"
                                        type="radio"
                                        :name="`aconf_${i}_${r.key}`"
                                        value="app"
                                    />
                                    Conserver l'application</label
                                >
                                <label
                                    ><input
                                        v-model="choix[i]![r.key]"
                                        type="radio"
                                        :name="`aconf_${i}_${r.key}`"
                                        value="asana"
                                    />
                                    Reprendre Asana</label
                                >
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <template #footer>
            <span id="affAsanaConfMsg" class="aff-error">{{ erreur }}</span>
            <button type="button" class="aff-btn" @click="emit('fermer')">Plus tard</button>
            <button
                id="affAsanaConfOk"
                type="button"
                class="aff-btn aff-btn-primary"
                :disabled="envoi"
                @click="valider"
            >
                <IconeAff nom="save" classe="aff-ico-sm" />Valider mes choix
            </button>
        </template>
    </AppModal>
</template>
