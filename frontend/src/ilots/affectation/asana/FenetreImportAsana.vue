<!-- Import depuis Asana : export CSV d'un projet chargé ici, ou projet lu par l'API (« Récupérer ») ; aperçu de chaque
     rubrique (nouvelle, modifiée, conflit…) avant toute écriture, puis application des rubriques cochées -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiAsana, type ApercuAsana, type EtatRubrique } from '@/api/asana';
import AppModal from '@/composants/AppModal.vue';
import IconeAff from '../administration/IconeAff.vue';
import { jourFr } from '../planning/outils';
import { aAppliquer, rubriqueBloquee, rubriqueCochee } from './asana';
import { useAsanaStore, type SourceImport } from './magasin';

const props = defineProps<{ source: SourceImport }>();
const emit = defineEmits<{ fermer: [] }>();

const magasin = useAsanaStore();
const csv = ref('');
const apercu = ref<ApercuAsana | null>(null);
const lecture = ref(false);
const erreur = ref('');
const cochees = ref(new Set<string>());

const BADGES: Record<EtatRubrique, { texte: string; classe: string; titre?: string }> = {
    nouveau: { texte: 'Nouveau', classe: 'ok' },
    modifié: { texte: 'Modifié', classe: 'mid' },
    local: {
        texte: "Modifié dans l'outil",
        classe: 'na',
        titre: "Valeur modifiée dans l'application ; Asana n'a pas changé depuis la dernière reprise : rien à reprendre"
    },
    conflit: {
        texte: '⚠ Conflit',
        classe: 'ko',
        titre: "Modifiée dans l'application et dans Asana depuis la dernière reprise"
    },
    identique: { texte: 'Identique', classe: 'na' },
    absent: { texte: 'Non importé', classe: 'ko' }
};

async function analyser(e?: Event) {
    erreur.value = '';
    try {
        let d: ApercuAsana;
        if (props.source.type === 'api') {
            lecture.value = true;
            d = await apiAsana.apercu(props.source.gid);
        } else {
            const fichier = (e?.target as HTMLInputElement | undefined)?.files?.[0];
            if (fichier) csv.value = await fichier.text();
            if (!csv.value) return;
            d = await apiAsana.apercuCsv(csv.value);
        }
        apercu.value = d;
        cochees.value = new Set(d.rows.filter(rubriqueCochee).map(r => r.key));
    } catch (err) {
        apercu.value = null;
        erreur.value = (err as Error).message;
    } finally {
        lecture.value = false;
    }
}

function cocher(cle: string, oui: boolean) {
    const s = new Set(cochees.value);
    if (oui) s.add(cle);
    else s.delete(cle);
    cochees.value = s;
}

async function appliquer() {
    erreur.value = '';
    const cles = apercu.value?.rows.filter(r => cochees.value.has(r.key)).map(r => r.key) ?? [];
    if (!cles.length) {
        erreur.value = 'Sélectionnez au moins une rubrique.';
        return;
    }
    try {
        const r =
            props.source.type === 'api'
                ? await apiAsana.importer(props.source.gid, cles)
                : await apiAsana.importerCsv(csv.value, cles);
        emit('fermer');
        magasin.deploiementsModifies();
        magasin.montrerMessage(
            `${r.created ? 'Déploiement créé' : 'Déploiement mis à jour'} : ${r.samu_name}.` +
                (r.debutAjuste && r.date_debut
                    ? `\nLe début du projet a été ramené au ${jourFr(r.date_debut)} pour rester antérieur aux autres dates.`
                    : '') +
                (r.created ? '\nPensez à indiquer le nombre de ressources par étape (1 par défaut).' : '')
        );
    } catch (err) {
        erreur.value = (err as Error).message;
    }
}

onMounted(() => {
    if (props.source.type === 'api') void analyser();
});
</script>

<template>
    <AppModal id="affAsanaModal" opened title="Importer depuis Asana" class="aff-asana-import" @close="emit('fermer')">
        <p class="aff-muted aff-asana-import__aide">
            Dans Asana : ouvrez le projet de déploiement (ex. « [SAMU 25] SF4 - Déploiement »), menu du projet ›
            <strong>Exporter</strong> › <strong>CSV</strong> (avec tous les champs personnalisés). Chargez ensuite le
            fichier ici : un aperçu s'affiche avant toute écriture.
        </p>
        <div v-if="source.type === 'csv'" class="aff-asana-import__fichier">
            <div id="affAsanaFileBox" class="aff-field">
                <label class="lbl" for="affAsanaFile">Fichier CSV Asana</label>
                <input id="affAsanaFile" type="file" accept=".csv,text/csv" @change="analyser" />
            </div>
        </div>
        <div id="affAsanaResult">
            <p v-if="lecture" class="aff-muted">Lecture du projet Asana…</p>
            <template v-else-if="apercu">
                <div class="aff-sync-sec aff-asana-import__resume">
                    <b>{{ apercu.samuName }}</b> — projet Asana « {{ apercu.projectName }} » ({{
                        apercu.taskCount
                    }}
                    tâches lues)<br />
                    <span v-if="apercu.existing" class="aff-muted"
                        >Un déploiement existe déjà pour ce SAMU : il sera <b>mis à jour</b> (le chef de projet, les
                        périodes de gel et le nombre de ressources sont conservés).</span
                    >
                    <span v-else class="aff-muted"
                        >Aucun déploiement pour ce SAMU : il sera <b>créé</b> (nombre de ressources à 1 par défaut, à
                        ajuster ensuite).</span
                    >
                    <template v-if="!apercu.locationFound"
                        ><br /><span class="aff-error"
                            >Entité SAMU introuvable dans la liste des localisations : le déploiement sera créé sans
                            entité liée.</span
                        ></template
                    >
                </div>
                <table class="aff-asana-table aff-asana-import__table">
                    <thead>
                        <tr>
                            <th class="aff-asana-import__case"></th>
                            <th>Rubrique</th>
                            <th>Actuel</th>
                            <th>Asana</th>
                            <th>État</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in apercu.rows" :key="r.key">
                            <td>
                                <input
                                    type="checkbox"
                                    :data-ak="r.key"
                                    :checked="cochees.has(r.key)"
                                    :disabled="rubriqueBloquee(r)"
                                    :aria-label="`Reprendre : ${r.label}`"
                                    @change="cocher(r.key, ($event.target as HTMLInputElement).checked)"
                                />
                            </td>
                            <td class="aff-asana-import__libelle">{{ r.label }}</td>
                            <td>
                                <template v-if="r.old">{{ r.old }}</template
                                ><span v-else class="aff-muted">—</span>
                            </td>
                            <td>
                                <template v-if="r.new">{{ r.new }}</template
                                ><span v-else class="aff-muted">—</span>
                                <div v-if="r.reason" class="aff-muted aff-asana-petit">{{ r.reason }}</div>
                                <div v-if="r.status === 'conflit'" class="aff-asana-import__conflit">
                                    ⚠ Modifiée dans l'application{{
                                        r.previous ? ` (dernière reprise d'Asana : ${r.previous})` : ''
                                    }}
                                    : cochez pour reprendre la valeur d'Asana ; sinon la valeur de l'application est
                                    conservée.
                                </div>
                            </td>
                            <td>
                                <span
                                    class="aff-av-b"
                                    :class="BADGES[r.status].classe"
                                    :title="BADGES[r.status].titre"
                                    >{{ BADGES[r.status].texte }}</span
                                >
                            </td>
                        </tr>
                    </tbody>
                </table>
            </template>
        </div>
        <template #footer>
            <span id="affAsanaError" class="aff-error">{{ erreur }}</span>
            <button type="button" class="aff-btn" @click="emit('fermer')">Fermer</button>
            <button
                v-if="apercu && aAppliquer(apercu.rows)"
                id="affAsanaOk"
                type="button"
                class="aff-btn aff-btn-primary"
                @click="appliquer"
            >
                <IconeAff nom="save" classe="aff-ico-sm" />Appliquer la sélection
            </button>
        </template>
    </AppModal>
</template>
