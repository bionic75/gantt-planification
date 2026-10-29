<!-- Liste des événements : filtres, tri des années, arborescence année > mois, exports CSV et HTML -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Evenement } from '@/api/evenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppIcone from '@/composants/AppIcone.vue';
import {
    AUTRES,
    exportCsv,
    exportHtml,
    filtrerExport,
    filtrerListe,
    grouperParAnnee,
    MODELES,
    MOIS,
    nomFichierDuJour,
    SANS_FILTRE,
    telecharger,
    type Sens
} from './calculs';
import FicheEvenement from './FicheEvenement.vue';
import { useEvenementsStore } from './magasin';

const emit = defineEmits<{ supprimer: [evenement: Evenement] }>();
const ev = useEvenementsStore();

const filtres = ref({ ...SANS_FILTRE });
const sens = ref<Sens>('desc');
const message = ref('');

const affiches = computed(() => filtrerListe(ev.evenements, filtres.value, ev.typesParId));
const arbre = computed(() => grouperParAnnee(affiches.value, sens.value));

/** Noms proposés pour le filtre « Participant » : comptes et invités externes */
const nomsParticipants = computed(() => [
    ...ev.comptes.map(u => `${u.prenom || ''} ${u.nom || ''}`.trim()).filter(Boolean),
    ...new Set(
        ev.evenements.flatMap(e =>
            (e.external_participants || [])
                .map(p => (p.email || `${p.prenom || ''} ${p.nom || ''}`.trim()).trim())
                .filter(Boolean)
        )
    )
]);

// ── Dépliage ──────────────────────────────────────────────────────────────
// Par défaut : année et mois en cours, et mois de l'événement qui vient d'être modifié. Rechargement de la liste ou
// changement de filtre : retour à l'état par défaut ; changement de tri : état conservé (comme l'ancien écran).
const basculements = ref(new Set<string>());
const maintenant = new Date();
const cleAnnee = (a: number) => `a${a}`;
const cleMois = (a: number, m: number) => `m${a}-${m}`;
function ouvertParDefaut(cle: string) {
    const a = maintenant.getFullYear();
    if (cle === cleAnnee(a) || cle === cleMois(a, maintenant.getMonth())) return true;
    const edite = ev.moisEdite;
    return !!edite && cle === cleMois(edite.annee, edite.mois);
}
const ouvert = (cle: string) => ouvertParDefaut(cle) !== basculements.value.has(cle);
function basculer(cle: string) {
    const s = new Set(basculements.value);
    if (s.has(cle)) s.delete(cle);
    else s.add(cle);
    basculements.value = s;
}
watch([() => ev.version, filtres], () => (basculements.value = new Set()), { deep: true });

const moisCourant = (a: number, m: number) => a === maintenant.getFullYear() && m === maintenant.getMonth();

// ── Exports ───────────────────────────────────────────────────────────────

function exporter(format: 'csv' | 'html') {
    message.value = '';
    const liste = filtrerExport(ev.evenements, filtres.value, ev.typesParId);
    if (!liste.length) {
        message.value = 'Aucun événement à exporter.';
        return;
    }
    if (format === 'csv') telecharger(nomFichierDuJour('csv'), exportCsv(liste), 'text/csv;charset=utf-8');
    else telecharger(nomFichierDuJour('html'), exportHtml(liste), 'text/html;charset=utf-8');
}
</script>

<template>
    <div id="myEventsTableContainer">
        <p v-if="!ev.charge" class="ev-liste__vide">Chargement...</p>
        <p v-else-if="!ev.evenements.length" class="ev-liste__vide">Aucun événement personnalisé</p>
        <template v-else>
            <div class="ev-liste__barre">
                <span class="ev-liste__intitule">Trier / Filtrer par :</span>
                <button type="button" class="ev-liste__tri" @click="sens = sens === 'desc' ? 'asc' : 'desc'">
                    Année {{ sens === 'desc' ? '▼ (récent → ancien)' : '▲ (ancien → récent)' }}
                </button>
                <div class="ev-liste__filtre">
                    <label for="myEventsLabelFilter">Libellé</label>
                    <select
                        id="myEventsLabelFilter"
                        v-model="filtres.libelle"
                        class="ev-liste__champ ev-liste__champ--large"
                    >
                        <option value="">— Tous —</option>
                        <option v-for="m in MODELES" :key="m.code" :value="m.label">{{ m.label }}</option>
                        <option :value="AUTRES">— AUTRES —</option>
                    </select>
                </div>
                <div class="ev-liste__filtre">
                    <label for="myEventsLocFilter">Localisation</label>
                    <select
                        id="myEventsLocFilter"
                        v-model="filtres.localisation"
                        class="ev-liste__champ ev-liste__champ--large"
                    >
                        <option value="">— Toutes —</option>
                        <option v-for="l in ev.localisations" :key="l.id" :value="String(l.id)">
                            {{ l.libelle_court || l.libelle_long }}
                        </option>
                    </select>
                </div>
                <div class="ev-liste__filtre">
                    <label for="myEventsParticipantFilter">Participant</label>
                    <input
                        id="myEventsParticipantFilter"
                        v-model="filtres.participant"
                        type="text"
                        list="myEventsParticipantList"
                        placeholder="Nom ou prénom…"
                        class="ev-liste__champ ev-liste__champ--participant"
                    />
                    <datalist id="myEventsParticipantList">
                        <option v-for="(n, i) in nomsParticipants" :key="i" :value="n" />
                    </datalist>
                </div>
                <div class="ev-liste__filtre">
                    <label for="myEventsDateDebut">Date début</label>
                    <input id="myEventsDateDebut" v-model="filtres.debut" type="date" class="ev-liste__champ" />
                </div>
                <div class="ev-liste__filtre">
                    <label for="myEventsDateFin">Date fin</label>
                    <input id="myEventsDateFin" v-model="filtres.fin" type="date" class="ev-liste__champ" />
                </div>
                <div class="ev-liste__filtre">
                    <span class="ev-liste__espace" aria-hidden="true">_</span>
                    <div class="ev-liste__exports">
                        <button
                            type="button"
                            class="ev-liste__export ev-liste__export--csv"
                            title="Exporter les résultats filtrés en CSV"
                            @click="exporter('csv')"
                        >
                            ⬇ CSV
                        </button>
                        <button
                            type="button"
                            class="ev-liste__export ev-liste__export--html"
                            title="Exporter les résultats filtrés en HTML"
                            @click="exporter('html')"
                        >
                            ⬇ HTML
                        </button>
                    </div>
                </div>
            </div>
            <AppAlert v-if="message" type="error" small :description="message" />

            <div>
                <div v-for="g in arbre" :key="g.annee" class="ev-liste__annee">
                    <button
                        type="button"
                        class="ev-liste__entete-annee"
                        :aria-expanded="ouvert(cleAnnee(g.annee)) ? 'true' : 'false'"
                        @click="basculer(cleAnnee(g.annee))"
                    >
                        <span class="ev-liste__fleche" aria-hidden="true">{{
                            ouvert(cleAnnee(g.annee)) ? '▼' : '▶'
                        }}</span>
                        <AppIcone name="calendar" :scale="0.9" />
                        {{ g.annee }}
                        <span class="ev-liste__compte">{{ g.nombre }} événement(s)</span>
                    </button>
                    <div v-show="ouvert(cleAnnee(g.annee))" class="ev-liste__contenu-annee">
                        <div v-for="m in g.mois" :key="m.mois" class="ev-liste__mois">
                            <button
                                type="button"
                                class="ev-liste__entete-mois"
                                :class="{ 'ev-liste__entete-mois--courant': moisCourant(g.annee, m.mois) }"
                                :aria-expanded="ouvert(cleMois(g.annee, m.mois)) ? 'true' : 'false'"
                                @click="basculer(cleMois(g.annee, m.mois))"
                            >
                                <span class="ev-liste__fleche" aria-hidden="true">{{
                                    ouvert(cleMois(g.annee, m.mois)) ? '▼' : '▶'
                                }}</span>
                                {{ MOIS[m.mois] }}
                                <span class="ev-liste__compte ev-liste__compte--mois"
                                    >{{ m.evenements.length }} événement(s)</span
                                >
                            </button>
                            <div v-show="ouvert(cleMois(g.annee, m.mois))" class="ev-liste__contenu-mois">
                                <FicheEvenement
                                    v-for="e in m.evenements"
                                    :key="e.id"
                                    :evenement="e"
                                    @supprimer="x => emit('supprimer', x)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.ev-liste__vide {
    color: #999;
    font-size: 12px;
    font-style: italic;
    text-align: center;
    padding: 20px;
}
.ev-liste__barre {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 15px;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 8px;
    align-items: flex-end;
}
.ev-liste__intitule {
    font-size: 12px;
    color: #666;
    display: flex;
    align-items: center;
}
.ev-liste__tri {
    background: #ff9800;
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 400;
}
.ev-liste__tri:hover {
    background: #fb8c00;
}
.ev-liste__filtre {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.ev-liste__filtre label,
.ev-liste__espace {
    font-size: 10px;
    color: #888;
    font-weight: 400;
    margin: 0;
}
.ev-liste__espace {
    color: transparent;
}
.ev-liste__champ {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 11px;
    width: auto;
}
.ev-liste__champ--large {
    min-width: 160px;
}
.ev-liste__champ--participant {
    min-width: 180px;
}
.ev-liste__exports {
    display: flex;
    gap: 5px;
}
.ev-liste__export {
    padding: 4px 10px;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
}
.ev-liste__export--csv,
.ev-liste__export--csv:hover {
    background: #2e7d32;
}
.ev-liste__export--html,
.ev-liste__export--html:hover {
    background: #1565c0;
}
.ev-liste__annee {
    margin-bottom: 10px;
}
.ev-liste__entete-annee,
.ev-liste__entete-mois {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: none;
    cursor: pointer;
    text-align: left;
    font: inherit;
}
.ev-liste__entete-annee {
    padding: 10px;
    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    border-radius: 6px;
    font-weight: bold;
    color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.ev-liste__entete-annee:hover {
    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}
.ev-liste__contenu-annee {
    margin-left: 15px;
    margin-top: 8px;
}
.ev-liste__mois {
    margin-bottom: 8px;
}
.ev-liste__entete-mois {
    padding: 8px 12px;
    background: linear-gradient(135deg, #ffb74d 0%, #ffa726 100%);
    border-radius: 5px;
    color: #333;
    font-weight: 400;
}
.ev-liste__entete-mois:hover {
    background: linear-gradient(135deg, #ffb74d 0%, #ffa726 100%);
}
.ev-liste__entete-mois--courant,
.ev-liste__entete-mois--courant:hover {
    background: linear-gradient(135deg, #f57c00 0%, #e65100 100%);
    color: white;
    box-shadow: 0 2px 6px rgba(230, 81, 0, 0.4);
}
.ev-liste__entete-annee:focus-visible,
.ev-liste__entete-mois:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 2px;
}
.ev-liste__compte {
    font-size: 11px;
    font-weight: normal;
    margin-left: auto;
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 8px;
    border-radius: 10px;
}
.ev-liste__compte--mois {
    font-size: 10px;
    background: rgba(0, 0, 0, 0.1);
    padding: 2px 6px;
    border-radius: 8px;
}
.ev-liste__contenu-mois {
    margin-left: 15px;
    margin-top: 5px;
}
</style>
