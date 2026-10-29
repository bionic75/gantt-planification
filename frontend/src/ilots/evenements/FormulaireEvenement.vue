<!-- Formulaire repliable d'ajout ou de modification d'un événement, avec prévisualisation -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { CorpsEvenement, Evenement } from '@/api/evenements';
import AppAlert from '@/composants/AppAlert.vue';
import AppIcone from '@/composants/AppIcone.vue';
import AppSaisieParticipants, { type Participant } from '@/composants/AppSaisieParticipants.vue';
import { COULEURS_PARTICIPANTS, cocheGrist, couleurs, dateFr, libelleModele } from './calculs';
import { useEvenementsStore } from './magasin';
import NouvelleLocalisation from './NouvelleLocalisation.vue';

const ev = useEvenementsStore();

const COULEURS_DEFAUT = { fond: '#ffeb3b', texte: '#000000', bordure: '#fbc02d' };

const ouvert = ref(false);
const zone = ref<HTMLElement | null>(null);
const createur = ref('');
const typeId = ref('');
const debut = ref('');
const fin = ref('');
const libelle = ref('');
const participants = ref<Participant[]>([]);
const localisation = ref('');
const besoinRessources = ref(false);
const nombreRessources = ref('1');
const sollicites = ref<string[]>([]);
const grist = ref(false);
const periode = ref('FULL');
const couleursEv = ref({ ...COULEURS_DEFAUT });
const erreur = ref('');
const nouvelleLocalisation = ref(false);

const enEdition = computed(() => !!ev.edition);
const unSeulJour = computed(() => !!debut.value && (!fin.value || fin.value === debut.value));
const typeChoisi = computed(() => (typeId.value ? ev.typesParId.get(Number(typeId.value)) : undefined));
const comptesTries = computed(() =>
    [...ev.comptes].sort((a, b) =>
        `${a.nom || ''} ${a.prenom || ''}`.toLowerCase().localeCompare(`${b.nom || ''} ${b.prenom || ''}`.toLowerCase())
    )
);
const sollicitables = computed(() =>
    ev.comptesSollicitables
        .filter(u => u.actif === 1 && u.email)
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
);
const libelleLocalisation = (l: { libelle_court: string; libelle_long: string }) =>
    `${l.libelle_court} – ${l.libelle_long}`;
const localisationChoisie = computed(() => ev.localisations.find(l => String(l.id) === localisation.value));

function appliquerCouleursDuType() {
    const t = typeChoisi.value;
    if (t) couleursEv.value = { fond: t.bg_color, texte: t.text_color, bordure: t.border_color };
}

function typeChange() {
    appliquerCouleursDuType();
    const t = typeChoisi.value;
    if (t && cocheGrist(libelleModele(t.code))) grist.value = true;
}

function libelleSaisi(v: string) {
    libelle.value = v.toUpperCase();
    if (cocheGrist(libelle.value)) grist.value = true;
}

/** Date de fin préremplie par la date de début (vide ou antérieure) */
function debutChange() {
    if (debut.value && (!fin.value || fin.value < debut.value)) fin.value = debut.value;
}
// Demi-journée proposée pour un seul jour, journée entière sinon
watch(unSeulJour, seul => {
    if (!seul) periode.value = 'FULL';
});

/** Formulaire vidé et replié (après enregistrement) */
function reinitialiser() {
    createur.value = '';
    typeId.value = '';
    debut.value = '';
    fin.value = '';
    libelle.value = '';
    participants.value = [];
    localisation.value = '';
    besoinRessources.value = false;
    nombreRessources.value = '1';
    sollicites.value = [];
    grist.value = false;
    periode.value = 'FULL';
    couleursEv.value = { ...COULEURS_DEFAUT };
    erreur.value = '';
    ev.finEdition();
    ouvert.value = false;
}

/** Repli pendant une modification : retour au mode ajout (saisie conservée) */
function basculer() {
    ouvert.value = !ouvert.value;
    if (!ouvert.value && enEdition.value) ev.finEdition();
}

/** Modification demandée depuis la liste : formulaire rempli, déplié et affiché */
function remplir(e: Evenement) {
    const c = couleurs(e);
    couleursEv.value = { fond: c.fond, texte: c.texte === '#000' ? '#000000' : c.texte, bordure: c.bordure };
    debut.value = e.start_date;
    fin.value = e.end_date;
    libelle.value = e.label;
    typeId.value = e.type_id ? String(e.type_id) : '';
    appliquerCouleursDuType();
    periode.value = e.start_date === e.end_date ? e.period || 'FULL' : 'FULL';
    localisation.value = e.location_id ? String(e.location_id) : '';
    grist.value = !!e.grist;
    participants.value = [
        ...(e.participants || []).map(p => ({ id: p.user_id, nom: p.nom, prenom: p.prenom, email: p.email })),
        ...(e.external_participants || []).map(p => ({ external: true, nom: p.nom, prenom: p.prenom, email: p.email }))
    ];
    createur.value = ev.profil === 'admin' && e.created_by ? String(e.created_by) : '';
    erreur.value = '';
    ouvert.value = true;
    void nextTick(() => zone.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
watch(
    () => ev.ouvertureFormulaire,
    () => {
        if (ev.edition) remplir(ev.edition);
    }
);

function corps(): CorpsEvenement {
    const finEffective = fin.value || debut.value;
    return {
        startDate: debut.value,
        endDate: finEffective,
        label: libelle.value.trim(),
        type_id: typeId.value ? Number(typeId.value) : undefined,
        config: {
            bgColor: couleursEv.value.fond,
            textColor: couleursEv.value.texte,
            borderColor: couleursEv.value.bordure
        },
        participants: participants.value.filter(p => !p.external && p.id != null).map(p => p.id as number),
        external_participants: participants.value
            .filter(p => p.external)
            .map(p => ({ nom: p.nom, prenom: p.prenom, email: p.email ?? '' })),
        period: finEffective === debut.value ? periode.value : 'FULL',
        location_id: localisation.value ? Number(localisation.value) : null,
        grist: grist.value
    };
}

async function valider() {
    erreur.value = '';
    const libelleNet = libelle.value.trim();
    let c: CorpsEvenement;
    if (enEdition.value) {
        if (!debut.value || !libelleNet) {
            erreur.value = 'Date de début et libellé requis';
            return;
        }
        c = corps();
        // Administrateur : créateur choisi (route de l'administration)
        if (ev.profil === 'admin' && createur.value) c.createdBy = Number(createur.value);
    } else {
        if (!typeId.value) {
            erreur.value = "Veuillez choisir un type d'événement";
            return;
        }
        if (!debut.value) {
            erreur.value = 'Veuillez sélectionner une date de début';
            return;
        }
        if (!libelleNet) {
            erreur.value = 'Veuillez saisir un libellé';
            return;
        }
        c = {
            ...corps(),
            needs_resources: besoinRessources.value,
            resources_count: parseInt(nombreRessources.value || '1'),
            notify_user_ids: sollicites.value.map(Number)
        };
    }
    try {
        await ev.enregistrer(c);
        reinitialiser();
    } catch (e) {
        erreur.value = `Erreur: ${(e as Error).message}`;
    }
}

async function localisationCreee(id: number) {
    nouvelleLocalisation.value = false;
    await ev.localisationCreee();
    localisation.value = String(id);
}

/** Prévisualisation : participants affichés */
const nomsParticipants = computed(() =>
    participants.value.map(p => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || p.email || '?')
);
const styleType = computed(() =>
    typeChoisi.value
        ? {
              background: typeChoisi.value.bg_color,
              color: typeChoisi.value.text_color,
              borderColor: typeChoisi.value.border_color
          }
        : undefined
);
</script>

<template>
    <div ref="zone" class="ev-form">
        <h3 class="ev-form__titre">
            <button
                type="button"
                class="ev-form__basculer"
                :aria-expanded="ouvert ? 'true' : 'false'"
                aria-controls="myEventFormBody"
                @click="basculer"
            >
                <span class="ev-form__fleche" aria-hidden="true">{{ ouvert ? '▼' : '▶' }}</span>
                ➕ Ajouter / Modifier un événement
            </button>
        </h3>
        <div v-show="ouvert" id="myEventFormBody" class="ev-form__corps">
            <div v-if="enEdition && ev.profil === 'admin'" id="myEventCreatorSection" class="ev-form__createur">
                <label for="myEventCreator" class="ev-form__libelle-createur">👤 Modifier le créateur</label>
                <select id="myEventCreator" v-model="createur" class="ev-form__select-createur">
                    <option value="">-- Sélectionner un créateur --</option>
                    <option v-for="u in comptesTries" :key="u.id" :value="String(u.id)">
                        {{ `${u.nom || ''} ${u.prenom || ''}`.trim() || u.username }}
                    </option>
                </select>
            </div>

            <div class="ev-form__type">
                <label for="myEventTypeId" class="ev-form__libelle">Type *</label>
                <select id="myEventTypeId" v-model="typeId" class="ev-form__champ" @change="typeChange">
                    <option value="">— Choisir un type —</option>
                    <option v-for="t in ev.types" :key="t.id" :value="String(t.id)">
                        {{ t.label_long }}{{ t.label_short ? ` (${t.label_short})` : '' }}
                    </option>
                </select>
            </div>
            <div class="ev-form__grille">
                <div>
                    <label for="myEventStartDate" class="ev-form__libelle">Date de début *</label>
                    <input
                        id="myEventStartDate"
                        v-model="debut"
                        type="date"
                        class="ev-form__champ"
                        @change="debutChange"
                    />
                </div>
                <div>
                    <label for="myEventEndDate" class="ev-form__libelle">Date de fin</label>
                    <input id="myEventEndDate" v-model="fin" type="date" class="ev-form__champ" />
                </div>
                <div>
                    <label for="myEventLabel" class="ev-form__libelle">Libellé de l'événement *</label>
                    <input
                        id="myEventLabel"
                        :value="libelle"
                        type="text"
                        class="ev-form__champ ev-form__majuscules"
                        placeholder="Ex: Formation SAMU 25, Congrès SFMU..."
                        @input="libelleSaisi(($event.target as HTMLInputElement).value)"
                    />
                </div>
                <AppSaisieParticipants
                    v-model="participants"
                    :comptes="ev.comptes"
                    label="👥 Participant(s)"
                    id-saisie="myEventParticipantInput"
                    id-cadre="myEventParticipantsContainer"
                    id-liste="myEventParticipantDropdown"
                    externes
                    detaille
                    :couleurs="COULEURS_PARTICIPANTS"
                />
            </div>

            <div class="ev-form__localisation">
                <label for="myEventLocationId" class="ev-form__libelle">📍 Localisation</label>
                <select id="myEventLocationId" v-model="localisation" class="ev-form__select">
                    <option value="">— Aucune localisation —</option>
                    <option v-for="l in ev.localisations" :key="l.id" :value="String(l.id)">
                        {{ libelleLocalisation(l) }}
                    </option>
                </select>
                <div class="ev-form__creer-localisation">
                    <a href="#" @click.prevent="nouvelleLocalisation = true">➕ Localisation introuvable ? Créer…</a>
                </div>
            </div>

            <div class="ev-form__ressources">
                <div class="ev-form__case">
                    <input
                        id="myEventNeedsResources"
                        v-model="besoinRessources"
                        type="checkbox"
                        class="ev-form__coche"
                    />
                    <label for="myEventNeedsResources" class="ev-form__libelle-ressources">Besoin de ressources</label>
                </div>
                <div v-show="besoinRessources" id="myEventResourcesPanel">
                    <div class="ev-form__nombre">
                        <label for="myEventResourcesCount" class="ev-form__texte-ressources"
                            >Nombre de ressources nécessaires :</label
                        >
                        <select id="myEventResourcesCount" v-model="nombreRessources" class="ev-form__nombre-select">
                            <option v-for="n in 5" :key="n" :value="String(n)">{{ n }}</option>
                        </select>
                        <span class="ev-form__compte">
                            — Participants renseignés :
                            <strong id="myEventParticipantCount">{{ participants.length }}</strong> /
                            <strong id="myEventResourcesCountDisplay">{{ nombreRessources }}</strong>
                        </span>
                    </div>
                    <div class="ev-form__sollicites">
                        <label for="myEventNotifyUsers" class="ev-form__texte-ressources ev-form__bloc"
                            >📧 Envoyer une demande de mobilisation à :</label
                        >
                        <select
                            id="myEventNotifyUsers"
                            class="ev-form__multiple"
                            multiple
                            aria-describedby="myEventNotifyUsersAide"
                            @change="
                                sollicites = [...($event.target as HTMLSelectElement).selectedOptions].map(o => o.value)
                            "
                        >
                            <option
                                v-for="u in sollicitables"
                                :key="u.id"
                                :value="String(u.id)"
                                :selected="sollicites.includes(String(u.id))"
                            >
                                {{ (u.nom || '').toUpperCase() }} {{ u.prenom || '' }}
                            </option>
                        </select>
                        <p id="myEventNotifyUsersAide" class="ev-form__aide">
                            Ctrl+clic pour sélectionner plusieurs personnes
                        </p>
                    </div>
                </div>
            </div>

            <div class="ev-form__case ev-form__grist">
                <input id="myEventGrist" v-model="grist" type="checkbox" class="ev-form__coche" />
                <label for="myEventGrist" class="ev-form__libelle-grist">GRIST</label>
            </div>

            <fieldset v-show="unSeulJour" id="myEventPeriodSection" class="ev-form__periode">
                <legend class="ev-form__libelle-periode">🕐 Demi-journée</legend>
                <div class="ev-form__radios">
                    <label class="ev-form__radio"
                        ><input
                            id="myEventPeriodFull"
                            v-model="periode"
                            type="radio"
                            name="myEventPeriod"
                            value="FULL"
                        />
                        Journée entière</label
                    >
                    <label class="ev-form__radio"
                        ><input id="myEventPeriodAM" v-model="periode" type="radio" name="myEventPeriod" value="AM" />
                        Matin (AM)</label
                    >
                    <label class="ev-form__radio"
                        ><input id="myEventPeriodPM" v-model="periode" type="radio" name="myEventPeriod" value="PM" />
                        Après-midi (PM)</label
                    >
                </div>
            </fieldset>

            <div class="ev-form__previsualisation">
                <span class="ev-form__previsualisation-titre">Prévisualisation :</span>
                <div id="myEventPreview" class="ev-form__apercu">
                    <span v-if="debut"
                        ><b>{{ dateFr(debut) }}</b
                        ><template v-if="(fin || debut) !== debut">
                            - <b>{{ dateFr(fin) }}</b></template
                        ></span
                    >
                    <span v-else class="ev-form__vide">Dates</span>
                    <span class="ev-form__sep">|</span>
                    <span v-if="typeChoisi" class="ev-form__type-apercu" :style="styleType"
                        ><AppIcone :name="typeChoisi.icon" :scale="0.8" />{{
                            typeChoisi.label_short || typeChoisi.label_long
                        }}</span
                    >
                    <span v-else class="ev-form__type-absent">Type non défini</span>
                    <span class="ev-form__sep">|</span>
                    <span v-if="libelle.trim()">{{ libelle.trim() }}</span>
                    <span v-else class="ev-form__vide">Libellé de l'événement</span>
                    <span class="ev-form__sep">|</span>
                    <span v-if="localisationChoisie"
                        ><AppIcone name="pin" :scale="0.8" class="ev-form__icone-apercu" />{{
                            libelleLocalisation(localisationChoisie)
                        }}</span
                    >
                    <span v-else class="ev-form__vide">Localisation</span>
                    <span class="ev-form__sep">|</span>
                    <span v-if="nomsParticipants.length"
                        ><AppIcone name="users" :scale="0.8" class="ev-form__icone-apercu" />{{
                            nomsParticipants.join(', ')
                        }}</span
                    >
                    <span v-else class="ev-form__vide">Participants</span>
                </div>
            </div>

            <AppAlert v-if="erreur" type="error" small :description="erreur" />
            <div class="ev-form__actions">
                <button id="myEventActionBtn" type="button" class="ev-form__valider" @click="valider">
                    {{ enEdition ? '💾 Modifier' : '➕ Ajouter' }}
                </button>
            </div>
        </div>
        <NouvelleLocalisation
            v-if="nouvelleLocalisation"
            @close="nouvelleLocalisation = false"
            @created="localisationCreee"
        />
    </div>
</template>

<style scoped>
.ev-form {
    background: #fff3e0;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
}
.ev-form__titre {
    margin: 0;
    padding: 0;
    border: none;
    font-size: 14px;
}
.ev-form__basculer {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: #e65100;
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
}
.ev-form__basculer:hover {
    background: none;
}
.ev-form__basculer:focus-visible {
    outline: 2px solid var(--gp-primaire);
    outline-offset: 3px;
}
.ev-form__fleche {
    font-size: 13px;
}
.ev-form__corps {
    margin-top: 15px;
}
.ev-form__createur {
    margin-bottom: 15px;
    background: #e3f2fd;
    padding: 10px;
    border-radius: 5px;
}
.ev-form__libelle-createur {
    font-size: 11px;
    color: #1565c0;
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
}
.ev-form__select-createur {
    width: 100%;
    max-width: 300px;
    padding: 6px;
    border: 1px solid #90caf9;
    border-radius: 4px;
}
.ev-form__type {
    margin-bottom: 10px;
    max-width: 460px;
}
.ev-form__libelle {
    font-size: 11px;
    color: #e65100;
    display: block;
    margin-bottom: 3px;
    line-height: 14px;
    height: 14px;
    font-weight: 400;
}
.ev-form__champ {
    width: 100%;
    padding: 5px 6px;
    height: 32px;
    box-sizing: border-box;
}
.ev-form__majuscules {
    text-transform: uppercase;
}
.ev-form__grille {
    display: grid;
    grid-template-columns: 1fr 1fr 2fr 2fr;
    gap: 10px;
    align-items: start;
}
.ev-form__localisation {
    margin-top: 8px;
}
.ev-form__select {
    width: 100%;
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
}
.ev-form__creer-localisation {
    text-align: right;
    margin-top: 3px;
}
.ev-form__creer-localisation a {
    font-size: 11px;
    color: #3f51b5;
    text-decoration: none;
}
.ev-form__ressources {
    margin-top: 10px;
    padding: 10px;
    background: #e8f5e9;
    border-radius: 6px;
    border: 1px solid #a5d6a7;
}
.ev-form__case {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}
.ev-form__coche {
    width: auto;
    margin: 0;
    cursor: pointer;
}
.ev-form__libelle-ressources {
    cursor: pointer;
    font-size: 12px;
    color: #2e7d32;
    font-weight: bold;
    margin: 0;
}
.ev-form__nombre {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}
.ev-form__texte-ressources {
    font-size: 12px;
    color: #2e7d32;
    white-space: nowrap;
    font-weight: 400;
    margin: 0;
}
.ev-form__bloc {
    display: block;
    margin-bottom: 4px;
}
.ev-form__nombre-select {
    width: 80px;
    padding: 4px;
}
.ev-form__compte {
    font-size: 12px;
    color: #555;
}
.ev-form__sollicites {
    margin-bottom: 8px;
}
.ev-form__multiple {
    width: 100%;
    height: 100px;
    padding: 4px;
    border: 1px solid #a5d6a7;
    border-radius: 4px;
    font-size: 12px;
}
.ev-form__aide {
    font-size: 11px;
    color: #666;
    margin: 4px 0 0;
}
.ev-form__grist {
    margin-top: 8px;
    margin-bottom: 0;
}
.ev-form__libelle-grist {
    cursor: pointer;
    font-size: 12px;
    color: #555;
    font-weight: bold;
    margin: 0;
}
.ev-form__periode {
    margin: 8px 0 0;
    padding: 8px 12px;
    background: #e8f4fd;
    border-radius: 6px;
    border: 1px solid #bee3f8;
}
.ev-form__libelle-periode {
    font-size: 11px;
    color: #1565c0;
    font-weight: bold;
    margin-bottom: 6px;
    padding: 0;
    float: left;
    width: 100%;
}
.ev-form__radios {
    display: flex;
    gap: 8px;
    clear: both;
}
.ev-form__radio {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
    margin: 0;
}
.ev-form__radio input {
    width: auto;
}
.ev-form__previsualisation {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.ev-form__previsualisation-titre {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
}
.ev-form__apercu {
    flex: 1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 0;
    padding: 8px 12px;
    background: #fff;
    border: 1px dashed #ffcc80;
    border-radius: 8px;
    font-size: 12px;
    color: #333;
}
.ev-form__sep {
    color: #bbb;
    margin: 0 8px;
}
.ev-form__vide {
    color: #aaa;
    font-style: italic;
}
.ev-form__type-apercu {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    border: 2px solid;
    white-space: nowrap;
}
.ev-form__type-absent {
    color: #999;
    font-size: 11px;
    font-style: italic;
}
.ev-form__icone-apercu {
    margin-right: 3px;
}
.ev-form__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 15px;
}
.ev-form__valider {
    background-color: #ff9800;
    color: white;
    padding: 8px 20px;
    white-space: nowrap;
    font-size: 13px;
    font-weight: bold;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.ev-form__valider:hover {
    background-color: #fb8c00;
}
</style>
