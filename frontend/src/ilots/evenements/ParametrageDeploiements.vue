<!-- Rubrique « Paramétrage des déploiements » (administrateur) : statuts (couleur, motif, ordre) et statut de chaque SAMU -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppIcone from '@/composants/AppIcone.vue';
import { useConfirmation } from '@/composants/confirmation';
import type { StatutDeploiement } from '@/api/deploiements';
import { dateFr } from './calculs';
import { normaliser } from './carte';
import { useEvenementsStore } from './magasin';
import { useDeploiementsStore } from './magasin-deploiements';
import { fondMotif } from './motifs';
import SelecteurStyle from './SelecteurStyle.vue';

const dep = useDeploiementsStore();
const ev = useEvenementsStore();
const confirmer = useConfirmation();
const ouvert = ref(false);

// Les localisations sont chargées avec l'onglet (magasin des événements)
onMounted(() => void dep.charger());

function basculer() {
    ouvert.value = !ouvert.value;
    if (ouvert.value) void dep.charger();
}

const valeur = (e: Event) => (e.target as HTMLInputElement).value;

// ---------- Statuts ----------

const nouveauLibelle = ref('');
const nouvelleCouleur = ref('');
const nouveauMotif = ref('plein');
const couleurNouveau = computed(() => nouvelleCouleur.value || dep.palette[0] || '#9e9e9e');

async function ajouterStatut() {
    if (!nouveauLibelle.value.trim()) return;
    if (await dep.ajouterStatut(nouveauLibelle.value, couleurNouveau.value, nouveauMotif.value)) {
        nouveauLibelle.value = '';
    }
}

function renommer(s: StatutDeploiement, e: Event) {
    const label = valeur(e).trim();
    if (label && label !== s.label) void dep.modifierStatut(s.id, { label, color: s.color, pattern: s.pattern });
    else (e.target as HTMLInputElement).value = s.label;
}

async function supprimer(s: StatutDeploiement) {
    if (await confirmer(`Supprimer le statut « ${s.label} » ?`, 'Supprimer')) await dep.supprimerStatut(s.id);
}

// Réordonnancement : glisser la poignée, ou flèches haut / bas au clavier
const glisse = ref<number | null>(null);
const survol = ref<number | null>(null);

function deposer(cible: number) {
    const id = glisse.value;
    glisse.value = survol.value = null;
    if (id != null) void dep.deposerStatut(id, cible);
}

// ---------- SAMU suivis ----------

const recherche = ref('');
/** null : tous ; 0 : sans statut ; sinon identifiant du statut */
const filtre = ref<number | null>(null);
const samuAAjouter = ref('');

const statutDe = (id: number | null) => dep.statuts.find(s => s.id === id);
const estService = (id: number | null) => !!statutDe(id)?.is_service;

const lignes = computed(() =>
    dep.deploiements.filter(
        d =>
            (!recherche.value || normaliser(d.samu_name).includes(normaliser(recherche.value))) &&
            (filtre.value === null || (filtre.value === 0 ? d.status_id === null : d.status_id === filtre.value))
    )
);

const localisationsLibres = computed(() => {
    const presentes = new Set(dep.deploiements.map(d => d.location_id));
    return [...ev.localisations]
        .filter(l => !presentes.has(l.id))
        .sort((a, b) => a.libelle_court.localeCompare(b.libelle_court, 'fr', { numeric: true }));
});

/** Choisir un SAMU dans la liste l'ajoute aussitôt */
async function ajouterSamu(e: Event) {
    const id = Number(valeur(e));
    if (id) await dep.ajouterSamu(id);
    samuAAjouter.value = '';
}

function changerStatut(locationId: number, e: Event) {
    const v = valeur(e);
    void dep.affecter(locationId, v ? Number(v) : null);
}

function changerDate(locationId: number, statusId: number | null, e: Event) {
    void dep.affecter(locationId, statusId, valeur(e) || null);
}
</script>

<template>
    <div class="pd" data-testid="parametrage-deploiements">
        <h3 class="pd__titre">
            <button
                type="button"
                class="pd__basculer"
                :aria-expanded="ouvert ? 'true' : 'false'"
                aria-controls="parametrageDeploiementsCorps"
                @click="basculer"
            >
                <span class="pd__fleche" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span>
                Paramétrage des déploiements
            </button>
        </h3>
        <div v-show="ouvert" id="parametrageDeploiementsCorps" class="pd__corps">
            <AppAlert v-if="dep.erreur" type="error" :description="dep.erreur" />

            <div class="pd__entete">
                <span>Statuts</span>
                <span class="pd__aide">Glissez la poignée pour changer l'ordre</span>
            </div>
            <ul class="pd__liste" data-testid="deploiements-statuts">
                <li
                    v-for="(s, i) in dep.statuts"
                    :key="s.id"
                    class="pd__statut"
                    :class="{ 'pd__statut--cible': survol === i && glisse !== null }"
                    :draggable="glisse === s.id"
                    @dragover.prevent="survol = i"
                    @drop.prevent="deposer(i)"
                    @dragstart="$event.dataTransfer?.setData('text/plain', String(s.id))"
                    @dragend="glisse = survol = null"
                >
                    <button
                        type="button"
                        class="pd__poignee"
                        :aria-label="`Déplacer le statut ${s.label} (glisser, ou flèches haut et bas)`"
                        title="Glisser pour réordonner"
                        @mousedown="glisse = s.id"
                        @mouseup="glisse = null"
                        @keydown.up.prevent="dep.deplacerStatut(s.id, -1)"
                        @keydown.down.prevent="dep.deplacerStatut(s.id, 1)"
                    >
                        ⋮⋮
                    </button>
                    <SelecteurStyle
                        :couleur="s.color"
                        :motif="s.pattern"
                        :palette="dep.palette"
                        :motifs="dep.motifs"
                        :libelle="`Couleur et motif du statut ${s.label}`"
                        @update:couleur="
                            dep.modifierStatut(s.id, { label: s.label, color: $event, pattern: s.pattern })
                        "
                        @update:motif="dep.modifierStatut(s.id, { label: s.label, color: s.color, pattern: $event })"
                    />
                    <span v-if="s.is_service" class="pd__nom" title="Statut fixe : il porte la date de mise en service">
                        {{ s.label }} <AppIcone name="cadenas" />
                    </span>
                    <input
                        v-else
                        type="text"
                        class="pd__libelle"
                        :value="s.label"
                        :aria-label="`Libellé du statut ${s.label}`"
                        @change="renommer(s, $event)"
                    />
                    <span class="pd__nb">{{ s.nb_samu }} SAMU</span>
                    <button
                        v-if="!s.is_service && !s.nb_samu"
                        type="button"
                        class="pd__icone"
                        :aria-label="`Supprimer le statut ${s.label}`"
                        title="Supprimer"
                        @click="supprimer(s)"
                    >
                        <AppIcone name="corbeille" />
                    </button>
                    <span
                        v-else-if="!s.is_service"
                        class="pd__icone pd__icone--inactif"
                        title="Utilisé par des SAMU : changez leur statut pour pouvoir le supprimer"
                    >
                        <AppIcone name="corbeille" />
                    </span>
                    <span v-else></span>
                </li>
                <li class="pd__statut pd__statut--ajout">
                    <span></span>
                    <SelecteurStyle
                        :couleur="couleurNouveau"
                        :motif="nouveauMotif"
                        :palette="dep.palette"
                        :motifs="dep.motifs"
                        libelle="Couleur et motif du nouveau statut"
                        @update:couleur="nouvelleCouleur = $event"
                        @update:motif="nouveauMotif = $event"
                    />
                    <input
                        v-model="nouveauLibelle"
                        type="text"
                        class="pd__libelle pd__libelle--ajout"
                        placeholder="Nouveau statut"
                        aria-label="Libellé du nouveau statut"
                        @keydown.enter.prevent="ajouterStatut"
                    />
                    <span></span>
                    <button type="button" class="pd__bouton" @click="ajouterStatut">Ajouter</button>
                </li>
            </ul>

            <div class="pd__entete">
                <span>SAMU suivis ({{ dep.deploiements.length }})</span>
                <span class="pd__aide">Le statut se change directement dans la liste</span>
            </div>
            <AppAlert v-if="dep.information" type="success" :description="dep.information" />
            <div class="pd__barre">
                <input
                    v-model="recherche"
                    type="search"
                    class="pd__champ pd__champ--recherche"
                    placeholder="Rechercher un SAMU"
                    aria-label="Rechercher un SAMU"
                />
                <span class="pd__filtres" role="group" aria-label="Filtrer par statut">
                    <button type="button" class="pd__filtre" :aria-pressed="filtre === null" @click="filtre = null">
                        Tous
                    </button>
                    <button
                        v-for="s in dep.statuts"
                        :key="s.id"
                        type="button"
                        class="pd__filtre"
                        :aria-pressed="filtre === s.id"
                        @click="filtre = filtre === s.id ? null : s.id"
                    >
                        <span class="pd__puce" :style="{ background: fondMotif(s.color, s.pattern) }"></span>
                        {{ s.label }}
                    </button>
                    <button
                        type="button"
                        class="pd__filtre"
                        :aria-pressed="filtre === 0"
                        @click="filtre = filtre === 0 ? null : 0"
                    >
                        Sans statut
                    </button>
                </span>
            </div>
            <div class="pd__barre">
                <select
                    v-model="samuAAjouter"
                    class="pd__champ"
                    aria-label="SAMU à ajouter"
                    @change="ajouterSamu($event)"
                >
                    <option value="">Ajouter un SAMU à la liste…</option>
                    <option v-for="l in localisationsLibres" :key="l.id" :value="l.id">{{ l.libelle_court }}</option>
                </select>
                <button
                    type="button"
                    class="pd__bouton pd__bouton--discret"
                    title="Passe « En service » les SAMU sans statut dont la mise en service (événement) est déjà passée"
                    @click="dep.reprendreMisesEnService()"
                >
                    Reprendre les mises en service <AppIcone name="info" />
                </button>
            </div>
            <p v-if="!lignes.length" class="pd__vide">Aucun SAMU ne correspond.</p>
            <div v-else class="pd__tableau" role="table" data-testid="deploiements-tableau">
                <div class="pd__ligne pd__ligne--tete" role="row">
                    <span role="columnheader">SAMU</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Mise en service</span>
                    <span role="columnheader"></span>
                </div>
                <div v-for="d in lignes" :key="d.id" class="pd__ligne" role="row">
                    <span role="cell">{{ d.samu_name }}</span>
                    <span role="cell" class="pd__cellule">
                        <span
                            class="pd__puce"
                            :style="{
                                background: statutDe(d.status_id)
                                    ? fondMotif(statutDe(d.status_id)!.color, statutDe(d.status_id)!.pattern)
                                    : 'transparent'
                            }"
                        ></span>
                        <select
                            class="pd__champ"
                            :value="d.status_id ?? ''"
                            :aria-label="`Statut de ${d.samu_name}`"
                            @change="changerStatut(d.id, $event)"
                        >
                            <option value="">Sans statut</option>
                            <option v-for="s in dep.statuts" :key="s.id" :value="s.id">{{ s.label }}</option>
                        </select>
                    </span>
                    <span role="cell" class="pd__cellule">
                        <template v-if="estService(d.status_id)">
                            <input
                                type="date"
                                class="pd__champ pd__champ--date"
                                :value="d.date_mise_en_service ?? ''"
                                :aria-label="`Date de mise en service de ${d.samu_name}`"
                                @change="changerDate(d.id, d.status_id, $event)"
                            />
                            <span v-if="d.date_suggeree && d.date_suggeree !== d.date_mise_en_service" class="pd__aide">
                                événement : {{ dateFr(d.date_suggeree) }}
                            </span>
                        </template>
                        <span v-else-if="d.date_suggeree" class="pd__aide"
                            >événement : {{ dateFr(d.date_suggeree) }}</span
                        >
                    </span>
                    <span role="cell">
                        <button
                            v-if="!d.derive"
                            type="button"
                            class="pd__icone"
                            :aria-label="`Retirer ${d.samu_name} de la liste`"
                            title="Retirer de la liste (SAMU ajouté à la main)"
                            @click="dep.retirerSamu(d.id)"
                        >
                            <AppIcone name="fermer" />
                        </button>
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.pd {
    background: #f3f4fb;
    border: 1px solid #dfe3f5;
    padding: 12px 15px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 13px;
}
.pd__titre {
    margin: 0;
    padding: 0;
    border: none;
    font-size: 14px;
}
.pd__basculer,
.pd__basculer:hover {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: #3f51b5;
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
}
.pd__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.pd__fleche {
    font-size: 13px;
}
.pd__corps {
    margin-top: 10px;
}
.pd__entete {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 12px 0 5px;
    font-weight: 700;
    color: #2c3e50;
}
.pd__aide {
    font-size: 12px;
    font-weight: 400;
    color: #7f8c8d;
}
.pd__liste {
    list-style: none;
    margin: 0;
    padding: 0;
    background: #fff;
    border: 1px solid #dfe3f5;
    border-radius: 6px;
}
.pd__statut {
    display: grid;
    grid-template-columns: 16px 34px minmax(0, 1fr) 64px 70px;
    align-items: center;
    gap: 10px;
    padding: 5px 10px;
    border-bottom: 1px solid #eef0fa;
}
.pd__statut:last-child {
    border-bottom: none;
}
.pd__statut--cible {
    box-shadow: inset 0 2px 0 #3f51b5;
}
.pd__poignee,
.pd__poignee:hover {
    padding: 0;
    border: none;
    background: none;
    color: #9fa8da;
    font-size: 15px;
    font-weight: 400;
    letter-spacing: -2px;
    line-height: 1;
    cursor: grab;
}
.pd__nom {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
}
.pd__libelle {
    width: 100%;
    padding: 3px 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    font: inherit;
}
.pd__libelle:hover {
    border-color: #c5cae9;
}
.pd__libelle:focus {
    border-color: #3f51b5;
    background: #fff;
}
.pd__libelle--ajout {
    border-color: #dfe3f5;
    background: #fff;
}
.pd__nb {
    font-size: 12px;
    color: #7f8c8d;
    text-align: right;
}
.pd__icone,
.pd__icone:hover {
    justify-self: end;
    padding: 3px 5px;
    border: none;
    border-radius: 4px;
    background: none;
    color: #7f8c8d;
    cursor: pointer;
    line-height: 0;
}
.pd__icone:hover {
    background: #eef0fa;
    color: #c62828;
}
.pd__icone--inactif,
.pd__icone--inactif:hover {
    opacity: 0.3;
    cursor: help;
    background: none;
    color: #7f8c8d;
}
.pd__bouton,
.pd__bouton:hover {
    padding: 4px 12px;
    border: none;
    border-radius: 4px;
    background: #3f51b5;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
.pd__bouton:hover {
    background: #303f9f;
}
.pd__bouton--discret,
.pd__bouton--discret:hover {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #fff;
    color: #3f51b5;
    border: 1px solid #c5cae9;
}
.pd__bouton--discret:hover {
    background: #eef0fa;
}
.pd__barre {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
}
.pd__champ {
    width: auto;
    padding: 4px 8px;
    border: 1px solid #c5cae9;
    border-radius: 4px;
    background: #fff;
    font-size: 12px;
}
.pd__champ--recherche {
    width: 200px;
}
.pd__champ--date {
    width: 135px;
}
.pd__filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}
.pd__filtre,
.pd__filtre:hover {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px;
    border: 1px solid #c5cae9;
    border-radius: 12px;
    background: #fff;
    color: #44505c;
    font-size: 12px;
    font-weight: 400;
    cursor: pointer;
}
.pd__filtre:hover {
    background: #eef0fa;
}
.pd__filtre[aria-pressed='true'],
.pd__filtre[aria-pressed='true']:hover {
    background: #e8eaf6;
    border-color: #3f51b5;
    color: #1a237e;
    font-weight: 700;
}
.pd__puce {
    display: inline-block;
    flex: none;
    width: 14px;
    height: 14px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
.pd__vide {
    margin: 8px 0;
    color: #7f8c8d;
    font-size: 12px;
}
.pd__tableau {
    background: #fff;
    border: 1px solid #dfe3f5;
    border-radius: 6px;
    max-height: 420px;
    overflow-y: auto;
}
.pd__ligne {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 32px;
    align-items: center;
    gap: 10px;
    padding: 4px 10px;
    border-bottom: 1px solid #eef0fa;
}
.pd__ligne:last-child {
    border-bottom: none;
}
.pd__ligne--tete {
    position: sticky;
    top: 0;
    background: #f3f4fb;
    font-size: 12px;
    font-weight: 700;
    color: #5c6bc0;
}
.pd__cellule {
    display: flex;
    align-items: center;
    gap: 6px;
}
</style>
