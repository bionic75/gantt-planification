<!-- Paramétrage des types d'événements : ajout et modification (libellés, icône, gabarit ou couleurs personnalisées,
     aperçu), modification directe d'un libellé dans le tableau, suppression (événements basculés sur « Autre(s) ») -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiTypesEvenements, type CorpsType, type TypeAdmin } from '@/api/typesEvenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppIcone from '@/composants/AppIcone.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { useConfirmation } from '@/composants/confirmation';
import CartoucheType from './CartoucheType.vue';
import { useTypesEvenementsStore } from './magasin';
import {
    BANQUE_ICONES,
    COULEURS_PAR_DEFAUT,
    couleursDuType,
    gabaritDe,
    GABARITS,
    type Couleurs
} from './types-evenements';

const confirmer = useConfirmation();
const magasin = useTypesEvenementsStore();

// ---------- Formulaire d'ajout ou de modification ----------

const boite = ref<HTMLElement | null>(null);
/** Type modifié ; null : ajout */
const enEdition = ref<number | null>(null);
const long = ref('');
const court = ref('');
const icone = ref('tag');
const gabarit = ref<number | 'custom'>(gabaritDe(COULEURS_PAR_DEFAUT));
/** Couleurs personnalisées (gabarit « Personnalisé… ») */
const perso = ref<Couleurs>({ ...COULEURS_PAR_DEFAUT });
const message = ref('');
const choixIcone = ref(false);
const choixGabarit = ref(false);

const typeEdite = computed(() => (enEdition.value ? magasin.parId(enEdition.value) : undefined));
const couleurs = computed<Couleurs>(() => {
    const g = gabarit.value;
    return g === 'custom' ? perso.value : { bg: GABARITS[g]!.bg, text: GABARITS[g]!.text, border: GABARITS[g]!.border };
});

/** Formulaire réaffiché (ancien écran) : libellés du type modifié, ou vides ; couleurs du type modifié */
function reafficher() {
    const t = typeEdite.value;
    if (enEdition.value && !t) enEdition.value = null;
    long.value = t?.label_long ?? '';
    court.value = t?.label_short ?? '';
    if (t) perso.value = couleursDuType(t);
    message.value = '';
}

/** Formulaire remis à l'ajout d'un type */
function reinitialiser() {
    enEdition.value = null;
    icone.value = 'tag';
    perso.value = { ...COULEURS_PAR_DEFAUT };
    gabarit.value = gabaritDe(COULEURS_PAR_DEFAUT);
    choixIcone.value = false;
    choixGabarit.value = false;
    reafficher();
}

function choisirIcone(nom: string) {
    icone.value = nom;
    choixIcone.value = false;
    message.value = '';
}

function choisirGabarit(g: number | 'custom') {
    if (g === 'custom') perso.value = { ...couleurs.value };
    gabarit.value = g;
    choixGabarit.value = false;
    message.value = '';
}

function modifier(t: TypeAdmin) {
    enEdition.value = t.id;
    icone.value = t.icon;
    perso.value = couleursDuType(t);
    gabarit.value = gabaritDe(perso.value);
    choixIcone.value = false;
    choixGabarit.value = false;
    reafficher();
    boite.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function enregistrer() {
    const corps: CorpsType = {
        label_long: long.value.trim(),
        label_short: court.value.trim(),
        icon: icone.value,
        bg_color: couleurs.value.bg,
        text_color: couleurs.value.text,
        border_color: couleurs.value.border
    };
    if (!corps.label_long) {
        message.value = 'Le libellé long est obligatoire.';
        return;
    }
    try {
        if (enEdition.value) await apiTypesEvenements.modifier(enEdition.value, corps);
        else await apiTypesEvenements.creer(corps);
        await magasin.charger();
        reinitialiser();
        magasin.modifies('types');
    } catch (e) {
        message.value = (e as Error).message;
    }
}

// Listes de choix fermées par un clic ailleurs
const zoneIcone = ref<HTMLElement | null>(null);
const zoneGabarit = ref<HTMLElement | null>(null);
function clicAilleurs(e: MouseEvent) {
    const cible = e.target as Node;
    if (choixIcone.value && !zoneIcone.value?.contains(cible)) choixIcone.value = false;
    if (choixGabarit.value && !zoneGabarit.value?.contains(cible)) choixGabarit.value = false;
}
onMounted(() => document.addEventListener('click', clicAilleurs));
onBeforeUnmount(() => document.removeEventListener('click', clicAilleurs));

// ---------- Tableau ----------

const erreurTableau = ref('');
/** Libellé modifié directement dans le tableau */
const cellule = ref<{ id: number; champ: 'long' | 'short' } | null>(null);
const saisieCellule = ref('');
const champCellule = ref<HTMLInputElement[]>([]);

async function editerCellule(t: TypeAdmin, champ: 'long' | 'short') {
    if (t.is_other || (cellule.value?.id === t.id && cellule.value.champ === champ)) return;
    cellule.value = { id: t.id, champ };
    saisieCellule.value = (champ === 'long' ? t.label_long : t.label_short) ?? '';
    await nextTick();
    champCellule.value[0]?.focus();
    champCellule.value[0]?.select();
}

/** Fin de la saisie dans le tableau (Entrée ou clic ailleurs : enregistrée ; Échap : abandonnée) */
async function terminerCellule(enregistrerSaisie: boolean) {
    const c = cellule.value;
    if (!c) return;
    cellule.value = null;
    const t = magasin.parId(c.id);
    if (!t) return;
    const ancien = (c.champ === 'long' ? t.label_long : t.label_short) ?? '';
    const v = saisieCellule.value.trim();
    if (!enregistrerSaisie || v === ancien) return;
    erreurTableau.value = '';
    if (c.champ === 'long' && !v) {
        erreurTableau.value = 'Le libellé long est obligatoire.';
        return;
    }
    try {
        await apiTypesEvenements.modifier(t.id, {
            label_long: c.champ === 'long' ? v : t.label_long,
            label_short: c.champ === 'short' ? v : (t.label_short ?? ''),
            icon: t.icon,
            bg_color: t.bg_color,
            text_color: t.text_color,
            border_color: t.border_color
        });
        await magasin.charger();
        magasin.modifies('types');
    } catch (e) {
        erreurTableau.value = (e as Error).message;
    }
}

async function supprimer(t: TypeAdmin) {
    const n = t.events_count || 0;
    const ok = await confirmer(
        `Supprimer le type « ${t.label_long} » ?` +
            (n ? `\n\n${n} événement(s) associé(s) basculeront sur « Autre(s) ».` : ''),
        'Supprimer'
    );
    if (!ok) return;
    erreurTableau.value = '';
    try {
        await apiTypesEvenements.supprimer(t.id);
        if (enEdition.value === t.id) enEdition.value = null;
        await magasin.charger();
        reafficher();
        magasin.modifies('types');
    } catch (e) {
        erreurTableau.value = (e as Error).message;
    }
}

// ---------- Ouverture, reprise enregistrée ----------

async function ouverture() {
    await magasin.charger();
    reafficher();
}

// Reprise enregistrée : types relus (nombre d'événements), formulaire réaffiché
watch(
    () => magasin.version,
    () => {
        if (magasin.origine === 'reprise') reafficher();
    }
);
</script>

<template>
    <AppSousSectionAdmin
        titre="🏷️ Paramétrage des types d'événements"
        id-corps="specialSub3"
        encadre="orange"
        @ouverture="ouverture"
    >
        <p class="types__aide">
            Chaque événement porte un <strong>type</strong> : libellé long, libellé court (affiché sur le planning et
            sur la carte), icône et gabarit de couleurs (fond – texte – bordure).
        </p>
        <div id="evtTypesAdmin">
            <div ref="boite" class="types__formulaire">
                <div :key="typeEdite?.label_long ?? ''" class="types__titre-formulaire">
                    {{ typeEdite ? `Modifier le type « ${typeEdite.label_long} »` : "Ajouter un type d'événement" }}
                </div>
                <div class="types__grille">
                    <div>
                        <label for="evtTLong" class="types__libelle">Libellé long *</label>
                        <input id="evtTLong" v-model="long" type="text" maxlength="120" class="types__champ" />
                    </div>
                    <div>
                        <label for="evtTShort" class="types__libelle">Libellé court</label>
                        <input
                            id="evtTShort"
                            v-model="court"
                            type="text"
                            maxlength="40"
                            placeholder="planning / carte"
                            class="types__champ"
                        />
                    </div>
                    <div ref="zoneIcone" class="types__choix">
                        <span class="types__libelle">Icône</span>
                        <button
                            id="evtTIconBtn"
                            type="button"
                            class="types__bouton-icone"
                            title="Choisir dans la banque d'icônes"
                            :aria-expanded="choixIcone ? 'true' : 'false'"
                            @click="choixIcone = !choixIcone"
                        >
                            <AppIcone :name="icone" :scale="1.25" /> ▾
                        </button>
                        <div v-show="choixIcone" id="evtTPicker" class="types__icones">
                            <button
                                v-for="[nom, libelle] in BANQUE_ICONES"
                                :key="nom"
                                type="button"
                                class="types__icone"
                                :class="{ 'types__icone--choisie': nom === icone }"
                                :title="libelle"
                                :aria-pressed="nom === icone ? 'true' : 'false'"
                                @click="choisirIcone(nom)"
                            >
                                <AppIcone :name="nom" :scale="18 / 16" />
                            </button>
                        </div>
                    </div>
                    <div ref="zoneGabarit" class="types__choix">
                        <span class="types__libelle">Gabarit de couleurs (fond – texte – bordure)</span>
                        <button
                            id="evtTplBtn"
                            type="button"
                            class="types__bouton-gabarit"
                            title="Choisir un gabarit"
                            :aria-expanded="choixGabarit ? 'true' : 'false'"
                            @click="choixGabarit = !choixGabarit"
                        >
                            <span class="types__gabarit-courant">
                                <CartoucheType :couleurs="couleurs" />
                                <span :key="String(gabarit)" class="types__nom-gabarit">{{
                                    gabarit === 'custom' ? 'Personnalisé…' : GABARITS[gabarit]!.n
                                }}</span>
                            </span>
                            <span aria-hidden="true">▾</span>
                        </button>
                        <div v-show="choixGabarit" id="evtTplList" class="types__gabarits">
                            <button
                                v-for="(g, i) in GABARITS"
                                :key="g.n"
                                type="button"
                                class="types__gabarit"
                                :class="{ 'types__gabarit--choisi': i === gabarit }"
                                :title="g.n"
                                @click="choisirGabarit(i)"
                            >
                                <CartoucheType :couleurs="g" />
                                <span class="types__nom-gabarit">{{ g.n }}</span>
                            </button>
                            <button
                                type="button"
                                class="types__gabarit"
                                :class="{ 'types__gabarit--choisi': gabarit === 'custom' }"
                                @click="choisirGabarit('custom')"
                            >
                                <span class="types__perso">Aa</span>
                                <span class="types__nom-gabarit">Personnalisé…</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div v-if="gabarit === 'custom'" id="evtTCustom" class="types__couleurs">
                    <div>
                        <label for="evtTBg" class="types__libelle">Fond</label>
                        <input id="evtTBg" v-model="perso.bg" type="color" class="types__couleur" />
                    </div>
                    <div>
                        <label for="evtTTx" class="types__libelle">Texte</label>
                        <input id="evtTTx" v-model="perso.text" type="color" class="types__couleur" />
                    </div>
                    <div>
                        <label for="evtTBd" class="types__libelle">Bordure</label>
                        <input id="evtTBd" v-model="perso.border" type="color" class="types__couleur" />
                    </div>
                </div>
                <div class="types__actions">
                    <span class="types__apercu-libelle">Aperçu :</span>
                    <span id="evtTPrev">
                        <CartoucheType
                            :couleurs="couleurs"
                            :icone="icone"
                            :libelle="court.trim() || long.trim() || 'Libellé'"
                        />
                    </span>
                    <span class="types__espace"></span>
                    <span id="evtTMsg" role="status" class="types__message">
                        <span v-if="message" :key="message">{{ message }}</span>
                    </span>
                    <button v-if="enEdition" type="button" class="types__annuler" @click="reinitialiser">
                        Annuler
                    </button>
                    <button type="button" class="types__enregistrer" @click="enregistrer">
                        <span :key="enEdition ? 'm' : 'a'">{{ enEdition ? '💾 Enregistrer' : '➕ Ajouter' }}</span>
                    </button>
                </div>
            </div>

            <AppAlert v-if="erreurTableau" type="error" :description="erreurTableau" />
            <div id="evtTypesTblBox">
                <table class="types__tableau">
                    <thead>
                        <tr>
                            <th class="types__col-icone">Icône</th>
                            <th>Libellé long</th>
                            <th>Libellé court</th>
                            <th>Aperçu</th>
                            <th class="types__droite">Événements</th>
                            <th><span class="types__masque">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="t in magasin.types"
                            :key="t.id"
                            :class="{ 'types__ligne--editee': enEdition === t.id }"
                        >
                            <td class="types__col-icone"><AppIcone :name="t.icon" :scale="1.25" /></td>
                            <td
                                v-for="champ in ['long', 'short'] as const"
                                :key="champ"
                                :class="{ types__editable: !t.is_other }"
                                :title="t.is_other ? undefined : 'Cliquer pour modifier'"
                                :tabindex="t.is_other ? undefined : 0"
                                @click="editerCellule(t, champ)"
                                @keydown.enter.self.prevent="editerCellule(t, champ)"
                            >
                                <input
                                    v-if="cellule?.id === t.id && cellule.champ === champ"
                                    ref="champCellule"
                                    v-model="saisieCellule"
                                    type="text"
                                    :maxlength="champ === 'long' ? 120 : 40"
                                    :placeholder="champ === 'long' ? 'Libellé long' : 'Libellé court'"
                                    :aria-label="champ === 'long' ? 'Libellé long' : 'Libellé court'"
                                    class="types__saisie"
                                    @keydown.enter.prevent="terminerCellule(true)"
                                    @keydown.esc.prevent="terminerCellule(false)"
                                    @blur="terminerCellule(true)"
                                />
                                <template v-else-if="champ === 'long'">
                                    <span class="types__long">{{ t.label_long }}</span>
                                    <template v-if="t.is_other">
                                        {{ ' '
                                        }}<span
                                            class="types__verrou"
                                            title="Type de repli : non modifiable, non supprimable"
                                            >🔒</span
                                        >
                                    </template>
                                </template>
                                <span v-else class="types__court">
                                    <template v-if="t.label_short">{{ t.label_short }}</template>
                                    <span v-else class="types__a-completer">à compléter</span>
                                </span>
                            </td>
                            <td>
                                <CartoucheType
                                    :couleurs="couleursDuType(t)"
                                    :icone="t.icon"
                                    :libelle="t.label_short || t.label_long"
                                    petit
                                />
                            </td>
                            <td class="types__droite">{{ t.events_count || 0 }}</td>
                            <td class="types__droite types__boutons">
                                <template v-if="!t.is_other">
                                    <button
                                        type="button"
                                        class="types__modifier"
                                        title="Modifier (icône, couleurs…)"
                                        @click="modifier(t)"
                                    >
                                        <AppIcone name="pencil" :scale="14 / 16" />
                                    </button>
                                    <button
                                        type="button"
                                        class="types__supprimer"
                                        title="Supprimer"
                                        @click="supprimer(t)"
                                    >
                                        <AppIcone name="trash" :scale="14 / 16" />
                                    </button>
                                </template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="types__note">
                Cliquez sur un <b>libellé long</b> ou <b>court</b> pour le modifier directement (Entrée ou clic ailleurs
                pour valider, Échap pour annuler). Le libellé court s'affiche sur la page de planification et sur la
                carte (à défaut, le libellé long). « Autre(s) » est le type de repli : à la suppression d'un type, ses
                événements basculent sur « Autre(s) ».
            </p>
        </div>
    </AppSousSectionAdmin>
</template>

<style scoped>
.types__aide {
    font-size: 12px;
    color: #e65100;
    margin: 10px 0;
}
.types__formulaire {
    background: #fff;
    border: 1px solid #ffcc80;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
}
.types__titre-formulaire {
    font-weight: 700;
    color: #e65100;
    margin-bottom: 8px;
}
.types__grille {
    display: grid;
    grid-template-columns: 2fr 1fr auto 2fr;
    gap: 10px;
    align-items: end;
}
.types__libelle {
    font-size: 11px;
    color: #e65100;
    display: block;
    margin-bottom: 3px;
    font-weight: normal;
}
.types__champ {
    width: 100%;
    padding: 6px;
    box-sizing: border-box;
}
.types__choix {
    position: relative;
}
.types__bouton-icone,
.types__bouton-icone:hover {
    height: 32px;
    min-width: 56px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    color: #333;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 8px;
}
.types__icones {
    display: grid;
    position: absolute;
    z-index: 50;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
    padding: 8px;
    grid-template-columns: repeat(9, 34px);
    gap: 4px;
    width: max-content;
}
.types__icone,
.types__icone:hover {
    width: 34px;
    height: 34px;
    border: 1px solid #e0e0e0;
    background: #fff;
    color: #333;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}
.types__icone--choisie,
.types__icone--choisie:hover {
    border-color: #e65100;
    background: #fff3e0;
}
.types__bouton-gabarit,
.types__bouton-gabarit:hover {
    width: 100%;
    height: 32px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    color: #333;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px;
    text-align: left;
}
.types__gabarit-courant {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.types__nom-gabarit {
    font-size: 12px;
}
.types__gabarits {
    display: grid;
    position: absolute;
    z-index: 50;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
    padding: 8px;
    grid-template-columns: repeat(3, minmax(150px, 1fr));
    gap: 6px;
    width: max-content;
    max-width: 90vw;
}
.types__gabarit,
.types__gabarit:hover {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 6px 8px;
    border: 1px solid #e0e0e0;
    background: #fff;
    color: #333;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
}
.types__gabarit .types__nom-gabarit {
    font-size: 11px;
}
.types__gabarit--choisi,
.types__gabarit--choisi:hover {
    border-color: #e65100;
    background: #fff3e0;
}
.types__perso {
    display: inline-block;
    padding: 2px 12px;
    border-radius: 10px;
    border: 2px dashed #999;
    font-size: 11px;
    font-weight: bold;
}
.types__couleurs {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    margin-top: 8px;
}
.types__couleur {
    width: 44px;
    height: 32px;
    padding: 0;
    border: 1px solid #ccc;
    cursor: pointer;
}
.types__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    flex-wrap: wrap;
}
.types__apercu-libelle {
    font-size: 12px;
    color: #666;
}
.types__espace {
    flex: 1;
}
.types__message {
    font-size: 12px;
    color: #b3261e;
}
.types__annuler,
.types__annuler:hover {
    background: #eee;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 7px 14px;
    cursor: pointer;
}
.types__enregistrer,
.types__enregistrer:hover {
    background: #ff9800;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 7px 18px;
    font-weight: bold;
    cursor: pointer;
}
.types__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
}
.types__tableau thead tr {
    background: #ffe0b2;
    color: #e65100;
    text-align: left;
}
.types__tableau th,
.types__tableau td {
    padding: 6px 8px;
    border: none;
}
.types__tableau tbody tr {
    border-top: 1px solid #e0e0e0;
}
.types__tableau tbody tr.types__ligne--editee {
    background: #fff8e1;
}
.types__tableau .types__col-icone {
    width: 50px;
    text-align: center;
}
.types__tableau .types__droite {
    text-align: right;
}
.types__boutons {
    white-space: nowrap;
}
.types__editable {
    cursor: text;
}
.types__long {
    font-weight: 600;
    padding: 2px 4px;
    display: inline-block;
    min-width: 60px;
}
.types__court {
    padding: 2px 4px;
    display: inline-block;
    min-width: 80px;
}
.types__a-completer {
    color: #aaa;
    font-style: italic;
}
.types__verrou {
    color: #888;
}
.types__saisie {
    width: 100%;
    padding: 4px 6px;
    box-sizing: border-box;
    border: 2px solid #ff9800;
    border-radius: 4px;
    font-size: 12px;
}
.types__modifier,
.types__modifier:hover,
.types__supprimer,
.types__supprimer:hover {
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
}
.types__modifier,
.types__modifier:hover {
    background: #3498db;
}
.types__supprimer,
.types__supprimer:hover {
    background: #e53935;
    margin-left: 4px;
}
.types__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.types__note {
    font-size: 11px;
    color: #888;
    margin: 8px 0 0;
}
</style>
