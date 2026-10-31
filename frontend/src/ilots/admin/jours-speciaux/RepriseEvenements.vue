<!-- Reprise des données des événements : tous les événements de la base, type et libellé modifiables (enregistrés
     ensemble), onglets « À traiter » (sans type) / « Traité », recherche, tri, pagination, suggestion des types -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiTypesEvenements, type EvenementReprise, type ModificationReprise } from '@/api/typesEvenements';
import AppIcone from '@/composants/AppIcone.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { useTypesEvenementsStore } from './magasin';
import {
    COLONNES,
    dateFr,
    evenementsAffiches,
    libelleDe,
    ongletApresChargement,
    suggestion,
    traite,
    typeDe,
    type CleColonne,
    type OngletReprise
} from './types-evenements';

const magasin = useTypesEvenementsStore();

const evenements = ref<EvenementReprise[]>([]);
const charge = ref(false);
const erreurChargement = ref('');
const modifications = ref<Record<number, ModificationReprise>>({});
const suggeres = ref(new Set<number>());
const onglet = ref<OngletReprise | null>(null);
const recherche = ref('');
const tri = ref<CleColonne>('start');
const sens = ref<1 | -1>(1);
const page = ref(0);
const taille = ref(100);
const message = ref<{ texte: string; etat: 'info' | 'ok' | 'erreur' } | null>(null);

const affiches = computed(() =>
    evenementsAffiches(evenements.value, {
        modifications: modifications.value,
        types: magasin.types,
        onglet: onglet.value ?? 'done',
        recherche: recherche.value,
        tri: tri.value,
        sens: sens.value
    })
);
const pages = computed(() => Math.max(1, Math.ceil(affiches.value.length / taille.value)));
const pageCourante = computed(() => Math.min(page.value, pages.value - 1));
const lignes = computed(() =>
    affiches.value.slice(pageCourante.value * taille.value, (pageCourante.value + 1) * taille.value)
);
const aTraiter = computed(() => evenements.value.filter(e => !traite(e)).length);
const nbModifications = computed(() => Object.keys(modifications.value).length);

/** Événements relus : modifications non enregistrées abandonnées */
async function recharger() {
    try {
        evenements.value = (await apiTypesEvenements.reprise()).events ?? [];
    } catch (e) {
        erreurChargement.value = `Chargement impossible : ${(e as Error).message}`;
        return;
    }
    erreurChargement.value = '';
    charge.value = true;
    modifications.value = {};
    suggeres.value = new Set();
    page.value = 0;
    message.value = null;
    onglet.value = ongletApresChargement(evenements.value, onglet.value);
}

async function ouverture() {
    await magasin.charger();
    await recharger();
}

// Types modifiés dans le paramétrage : événements relus s'ils sont affichés (modifications en cours abandonnées,
// comme l'ancien écran)
watch(
    () => magasin.version,
    () => {
        if (magasin.origine === 'types' && evenements.value.length) recharger();
    }
);

/** Affichage changé (onglet, recherche, tri, page) : message effacé, comme au réaffichage de l'ancien écran */
function changerOnglet(o: OngletReprise) {
    onglet.value = o;
    page.value = 0;
    message.value = null;
}
function rechercher(q: string) {
    recherche.value = q;
    page.value = 0;
    message.value = null;
}
function trier(k: CleColonne) {
    if (tri.value === k) sens.value = sens.value === 1 ? -1 : 1;
    else {
        tri.value = k;
        sens.value = 1;
    }
    page.value = 0;
    message.value = null;
}
function allerPage(p: number) {
    page.value = p;
    message.value = null;
}
function changerTaille(n: number) {
    taille.value = n;
    page.value = 0;
    message.value = null;
}

function modifier(e: EvenementReprise, champ: 'type_id' | 'label', valeur: string) {
    const m = { ...modifications.value };
    const c: ModificationReprise = { ...m[e.id] };
    if (champ === 'type_id') {
        const v = valeur === '' ? null : Number(valeur);
        if (v === e.type_id) delete c.type_id;
        else c.type_id = v;
        suggeres.value.delete(e.id);
    } else {
        const v = valeur.trim();
        if (v === e.label) delete c.label;
        else c.label = v;
    }
    if (Object.keys(c).length) m[e.id] = c;
    else delete m[e.id];
    modifications.value = m;
}

function suggerer() {
    let n = 0;
    const m = { ...modifications.value };
    for (const e of evenements.value) {
        if (traite(e) || typeDe(e, m)) continue;
        const t = suggestion(libelleDe(e, m), magasin.types);
        if (t) {
            m[e.id] = { ...m[e.id], type_id: t.id };
            suggeres.value.add(e.id);
            n++;
        }
    }
    modifications.value = m;
    message.value = {
        etat: 'info',
        texte: n
            ? `${n} type(s) suggéré(s) d'après le libellé : vérifiez puis enregistrez.`
            : 'Aucune suggestion : les libellés restants ne correspondent à aucun type.'
    };
}

async function enregistrer() {
    const updates = Object.entries(modifications.value).map(([id, c]) => ({ id: Number(id), ...c }));
    if (!updates.length) return;
    try {
        const { updated } = await apiTypesEvenements.enregistrerReprise(updates);
        await magasin.charger();
        await recharger();
        message.value = { etat: 'ok', texte: `${updated} événement(s) mis à jour.` };
        magasin.modifies('reprise');
    } catch (e) {
        message.value = { etat: 'erreur', texte: (e as Error).message };
    }
}

const fleche = (k: CleColonne) => (tri.value === k ? (sens.value > 0 ? ' ▲' : ' ▼') : '');
const createur = (e: EvenementReprise) => `${e.creator_prenom || ''} ${(e.creator_nom || '').toUpperCase()}`.trim();
</script>

<template>
    <AppSousSectionAdmin
        titre="🗂️ Reprise des données des événements (type et libellé)"
        id-corps="specialSub4"
        encadre="bleu"
        @ouverture="ouverture"
    >
        <p class="reprise__aide">
            Tous les événements en base : modifiez leur <strong>type</strong> et leur <strong>libellé</strong> ; les
            autres informations sont affichées pour repère. Les colonnes sont triables.
        </p>
        <div id="evtRecoveryAdmin">
            <p v-if="erreurChargement" class="reprise__erreur">{{ erreurChargement }}</p>
            <p v-else-if="!charge" class="reprise__chargement">Chargement…</p>
            <template v-else>
                <div class="reprise__onglets">
                    <button
                        v-for="[k, libelle, n] in [
                            ['todo', 'À traiter', aTraiter],
                            ['done', 'Traité', evenements.length - aTraiter]
                        ] as const"
                        :key="k"
                        type="button"
                        class="reprise__onglet"
                        :class="{ 'reprise__onglet--actif': onglet === k }"
                        :aria-pressed="onglet === k ? 'true' : 'false'"
                        @click="changerOnglet(k)"
                    >
                        {{ libelle }}
                        <span
                            class="reprise__compteur"
                            :class="
                                k === 'done' ? 'reprise__compteur--traite' : n ? 'reprise__compteur--a-traiter' : ''
                            "
                            >{{ n }}</span
                        >
                    </button>
                </div>
                <div class="reprise__outils">
                    <input
                        id="evtRecQ"
                        :value="recherche"
                        type="search"
                        placeholder="Rechercher dans tous les champs…"
                        aria-label="Rechercher dans tous les champs"
                        class="reprise__recherche"
                        @input="rechercher(($event.target as HTMLInputElement).value)"
                    />
                    <button
                        v-if="onglet === 'todo'"
                        type="button"
                        class="reprise__suggerer"
                        title="Propose un type d'après le libellé actuel (non appliqué tant que vous n'enregistrez pas)"
                        @click="suggerer"
                    >
                        <AppIcone name="lightbulb" :scale="14 / 16" class="reprise__icone" />Suggérer les types
                    </button>
                    <span v-else class="reprise__info">Types déjà affectés : modifiables à tout moment.</span>
                    <span class="reprise__espace"></span>
                    <span id="evtRecMsg" role="status" class="reprise__message">
                        <span v-if="message" :key="message.texte" :class="`reprise__message--${message.etat}`">{{
                            message.texte
                        }}</span>
                    </span>
                    <button
                        type="button"
                        class="reprise__recharger"
                        title="Abandonner les modifications non enregistrées et recharger"
                        @click="recharger"
                    >
                        ↺ Recharger
                    </button>
                    <button
                        id="evtRecSave"
                        type="button"
                        class="reprise__enregistrer"
                        :disabled="!nbModifications"
                        @click="enregistrer"
                    >
                        <span :key="nbModifications">💾 Enregistrer ({{ nbModifications }})</span>
                    </button>
                </div>
                <div class="reprise__cadre">
                    <table class="reprise__tableau">
                        <thead>
                            <tr>
                                <th
                                    v-for="c in COLONNES"
                                    :key="c.k"
                                    title="Trier"
                                    :aria-sort="tri === c.k ? (sens > 0 ? 'ascending' : 'descending') : undefined"
                                    tabindex="0"
                                    @click="trier(c.k)"
                                    @keydown.enter.prevent="trier(c.k)"
                                >
                                    {{ c.t }}{{ fleche(c.k) }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="e in lignes"
                                :id="`evtRecRow${e.id}`"
                                :key="e.id"
                                :class="{ 'reprise__ligne--modifiee': modifications[e.id] }"
                            >
                                <td class="reprise__date">
                                    {{ dateFr(e.start_date) }}
                                    <span v-if="e.period && e.period !== 'FULL'" class="reprise__periode"
                                        >({{ e.period }})</span
                                    >
                                </td>
                                <td class="reprise__date">{{ dateFr(e.end_date) }}</td>
                                <td>
                                    <select
                                        :value="typeDe(e, modifications) ?? ''"
                                        class="reprise__type"
                                        :class="{ 'reprise__type--suggere': suggeres.has(e.id) }"
                                        :title="suggeres.has(e.id) ? 'Type suggéré' : undefined"
                                        :aria-label="`Type de ${libelleDe(e, modifications)}`"
                                        @change="modifier(e, 'type_id', ($event.target as HTMLSelectElement).value)"
                                    >
                                        <option v-if="onglet !== 'done'" value="">— Non défini —</option>
                                        <option v-for="t in magasin.types" :key="t.id" :value="t.id">
                                            {{ t.label_long }}
                                        </option>
                                    </select>
                                </td>
                                <td>
                                    <input
                                        :value="libelleDe(e, modifications)"
                                        type="text"
                                        class="reprise__libelle"
                                        :aria-label="`Libellé de l'événement du ${dateFr(e.start_date)}`"
                                        @change="modifier(e, 'label', ($event.target as HTMLInputElement).value)"
                                    />
                                </td>
                                <td class="reprise__repere">{{ e.location_court || e.location_long || '' }}</td>
                                <td class="reprise__repere reprise__participants">
                                    {{ (e.participants || []).join(', ') }}
                                </td>
                                <td class="reprise__repere reprise__date">{{ createur(e) }}</td>
                            </tr>
                            <tr v-if="!lignes.length">
                                <td colspan="7" class="reprise__vide">Aucun événement</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="reprise__pied">
                    <span
                        >{{ affiches.length }} événement(s) {{ onglet === 'todo' ? 'à traiter' : 'traité(s)'
                        }}{{ recherche ? ' (filtrés)' : '' }}</span
                    >
                    <span class="reprise__espace"></span>
                    <button
                        type="button"
                        class="reprise__page"
                        :disabled="pageCourante <= 0"
                        aria-label="Page précédente"
                        @click="allerPage(pageCourante - 1)"
                    >
                        ◀
                    </button>
                    <span>Page {{ pageCourante + 1 }} / {{ pages }}</span>
                    <button
                        type="button"
                        class="reprise__page"
                        :disabled="pageCourante >= pages - 1"
                        aria-label="Page suivante"
                        @click="allerPage(pageCourante + 1)"
                    >
                        ▶
                    </button>
                    <select
                        :value="taille"
                        class="reprise__taille"
                        aria-label="Événements par page"
                        @change="changerTaille(Number(($event.target as HTMLSelectElement).value))"
                    >
                        <option v-for="n in [50, 100, 250, 500]" :key="n" :value="n">{{ n }} / page</option>
                    </select>
                </div>
                <p class="reprise__note">
                    Seuls le <b>type</b> et le <b>libellé</b> sont modifiables ; les autres colonnes sont affichées pour
                    repère. Cliquez sur un en-tête pour trier.
                </p>
            </template>
        </div>
    </AppSousSectionAdmin>
</template>

<style scoped>
.reprise__aide {
    font-size: 12px;
    color: #1565c0;
    margin: 10px 0;
}
.reprise__chargement {
    color: #999;
    font-size: 12px;
}
.reprise__erreur {
    color: #b3261e;
}
.reprise__onglets {
    display: flex;
    border-bottom: 1px solid #90caf9;
    margin-bottom: 10px;
}
.reprise__onglet,
.reprise__onglet:hover {
    padding: 8px 18px;
    border: 1px solid #90caf9;
    border-bottom: 1px solid #90caf9;
    border-radius: 8px 8px 0 0;
    margin-right: 4px;
    margin-bottom: -1px;
    cursor: pointer;
    font-weight: 700;
    font-size: 13px;
    background: #bbdefb;
    color: #455a64;
}
.reprise__onglet--actif,
.reprise__onglet--actif:hover {
    border-bottom: 2px solid #fff;
    background: #fff;
    color: #1565c0;
}
.reprise__compteur {
    display: inline-block;
    min-width: 22px;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 11px;
    background: #9e9e9e;
    color: #fff;
}
.reprise__compteur--a-traiter {
    background: #e53935;
}
.reprise__compteur--traite {
    background: #43a047;
}
.reprise__outils {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 10px;
}
.reprise__recherche {
    padding: 6px 10px;
    min-width: 260px;
    border: 1px solid #ccc;
    border-radius: 6px;
}
.reprise__suggerer,
.reprise__suggerer:hover {
    background: #fff;
    border: 1px solid #ff9800;
    color: #e65100;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
}
.reprise__icone {
    margin-right: 4px;
}
.reprise__info {
    font-size: 12px;
    color: #555;
}
.reprise__espace {
    flex: 1;
}
.reprise__message {
    font-size: 12px;
}
.reprise__message--info {
    color: #555;
}
.reprise__message--ok {
    color: #1b7f3b;
}
.reprise__message--erreur {
    color: #b3261e;
}
.reprise__recharger,
.reprise__recharger:hover {
    background: #eee;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
}
.reprise__enregistrer,
.reprise__enregistrer:hover {
    background: #ff9800;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-weight: bold;
    cursor: pointer;
}
.reprise__enregistrer:disabled {
    opacity: 0.5;
}
.reprise__cadre {
    overflow: auto;
    max-height: 520px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
}
.reprise__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    background: #fff;
}
.reprise__tableau thead {
    position: sticky;
    top: 0;
    z-index: 2;
}
.reprise__tableau thead tr {
    background: #ffe0b2;
    color: #e65100;
    text-align: left;
}
.reprise__tableau th {
    padding: 7px 8px;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    border: none;
}
.reprise__tableau td {
    padding: 5px 8px;
    border: none;
}
.reprise__tableau tbody tr {
    border-top: 1px solid #eee;
}
.reprise__tableau tbody tr.reprise__ligne--modifiee {
    background: #fff8e1;
}
.reprise__date {
    white-space: nowrap;
}
.reprise__periode {
    color: #888;
}
.reprise__type {
    max-width: 230px;
    padding: 3px;
}
.reprise__type--suggere {
    outline: 2px dashed #ff9800;
}
.reprise__libelle {
    width: 100%;
    min-width: 180px;
    padding: 3px 5px;
    box-sizing: border-box;
}
.reprise__repere {
    color: #444;
}
.reprise__participants {
    max-width: 260px;
}
.reprise__vide {
    padding: 14px;
    text-align: center;
    color: #999;
}
.reprise__pied {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    font-size: 12px;
    color: #555;
}
.reprise__page {
    padding: 3px 10px;
}
.reprise__taille {
    padding: 3px;
}
.reprise__note {
    font-size: 11px;
    color: #888;
    margin: 6px 0 0;
}
</style>
