<!-- Fiche d'une ressource : identité, SAMU et ES, MAD volante, expert principal / secondaire sur des SAMU, astreintes,
     contacts RH de l'ES (une adresse par ligne, contrôlées en direct), historique des taux de MAD. Consultation (profil
     RH) : champs en lecture seule, astreintes en texte, sans ajout de taux. Fermée par un clic sur le fond. -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { apiRessources, type PeriodeMad, type Ressource } from '@/api/ressources';
import { ErreurApi } from '@/api/client';
import AppModal from '@/composants/AppModal.vue';
import { emettre } from '@/evenements';
import { afficherSynchronisation } from '@/outils/synchronisation';
import { dateFr, esDuSamu } from './calculs';
import {
    corpsFiche,
    depuisMois,
    ficheIncomplete,
    formulaireFiche,
    lignesEmail,
    tauxEnregistre,
    type FormulaireFiche
} from './fiche';
import HistoriqueMad from './HistoriqueMad.vue';
import { useRessourcesStore } from './magasin';
import SaisieSamu from './SaisieSamu.vue';

const props = defineProps<{ ressource: Ressource; consultation: boolean }>();
const emit = defineEmits<{ fermer: [] }>();
const magasin = useRessourcesStore();

/** SAMU proposés (libellés courts, ordre alphabétique) */
const samus = computed(() =>
    [...magasin.localisations]
        .sort((a, b) => (a.libelle_court || '').localeCompare(b.libelle_court || ''))
        .map(l => l.libelle_court)
        .filter((s): s is string => !!s)
);
const libellesSamu = computed(() => magasin.localisations.map(l => l.libelle_court));

const f = ref<FormulaireFiche>(formulaireFiche(props.ressource, magasin.affectations[props.ressource.id], samus.value));
const historique = ref<PeriodeMad[]>([]);
const erreur = ref('');
const champContacts = ref<HTMLTextAreaElement | null>(null);

/** Contacts RH invalides, signalés en direct sous le champ (aussi à l'ouverture) */
const contactsInvalides = computed(() => lignesEmail(f.value.contacts).invalides);

function choisirSamu() {
    f.value.es = esDuSamu(magasin.localisations.find(l => l.libelle_court === f.value.samu)?.adresse);
}
function basculerHno() {
    if (!f.value.astreinteHno) f.value.dateAstreinte = '';
}

async function enregistrer() {
    erreur.value = '';
    const incomplet = ficheIncomplete(f.value);
    if (incomplet) {
        erreur.value = incomplet.message;
        if (incomplet.contacts) {
            await nextTick();
            champContacts.value?.focus();
        }
        return;
    }
    const aujourdhui = new Date().toISOString().split('T')[0]!;
    try {
        await apiRessources.modifier(
            props.ressource.id,
            corpsFiche(f.value, props.ressource, tauxEnregistre(historique.value, aujourdhui))
        );
        try {
            await apiRessources.enregistrerAffectations(props.ressource.id, f.value.principal, f.value.secondaire);
        } catch {
            /* affectations non enregistrées (ancien écran : erreur dans la console) */
        }
        afficherSynchronisation();
        apiRessources.journaliser('Modification du planning').catch(() => undefined);
        emettre('ressources-modifiees');
        // Liste relue avant la fermeture (l'ancien écran attendait le rechargement des ressources)
        await magasin.charger();
        emit('fermer');
    } catch (e) {
        const message =
            e instanceof ErreurApi
                ? ((e.donnees as { error?: string } | null)?.error ?? 'Erreur modification')
                : (e as Error).message;
        erreur.value = `Erreur lors de la modification: ${message}`;
    }
}

const ligneAstreinte = (actif: number, libelle: string) => ({ actif: !!actif, libelle });
</script>

<template>
    <AppModal
        id="editModal"
        opened
        :title="consultation ? 'Détail de la ressource' : 'Modifier la ressource'"
        class="fiche"
        :class="{ 'fiche--consultation': consultation }"
        fermer-sur-fond
        @close="emit('fermer')"
    >
        <fieldset :disabled="consultation" class="fiche__champs">
            <legend class="fiche__masque">Ressource</legend>
            <div class="fiche__ligne fiche__ligne--deux">
                <div class="form-group">
                    <label for="editNom">Nom</label>
                    <input id="editNom" v-model="f.nom" type="text" />
                </div>
                <div class="form-group">
                    <label for="editPrenom">Prénom</label>
                    <input id="editPrenom" v-model="f.prenom" type="text" />
                </div>
            </div>
            <div class="fiche__ligne fiche__ligne--trois">
                <div class="form-group">
                    <label for="editTrigramme">Trigramme</label>
                    <input id="editTrigramme" v-model="f.trigramme" type="text" maxlength="3" />
                </div>
                <div class="form-group">
                    <label for="editSamu">SAMU</label>
                    <select id="editSamu" v-model="f.samu" @change="choisirSamu">
                        <option value="">-- Choisir un SAMU --</option>
                        <option v-for="s in samus" :key="s" :value="s">{{ s }}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="editFonction">Fonction</label>
                    <input id="editFonction" v-model="f.fonction" type="text" placeholder="Ex: Médecin..." />
                </div>
            </div>
            <div class="form-group">
                <label for="editEsRattachement">ES de rattachement</label>
                <input
                    id="editEsRattachement"
                    v-model="f.es"
                    type="text"
                    placeholder="Auto-rempli selon le SAMU choisi, ou saisir manuellement"
                />
            </div>

            <div class="fiche__volante">
                <input id="editMadVolante" v-model="f.madVolante" type="checkbox" class="fiche__case" />
                <label for="editMadVolante" class="fiche__volante-libelle">
                    <svg class="fiche__avion" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="M22 2 11 13" />
                    </svg>
                    MAD volante
                    <span class="fiche__volante-aide"
                        >(contrat à durée déterminée avec un nombre de jours maximum)</span
                    >
                </label>
            </div>
            <div
                v-show="f.madVolante"
                id="editMadVolanteFields"
                class="fiche__ligne fiche__ligne--deux fiche__volante-champs"
            >
                <div class="form-group">
                    <label for="editDateDebutMad">Date de début MAD *</label>
                    <input id="editDateDebutMad" v-model="f.dateDebutMad" type="date" />
                </div>
                <div class="form-group">
                    <label for="editDateFinMad">Date de fin MAD *</label>
                    <input id="editDateFinMad" v-model="f.dateFinMad" type="date" />
                </div>
                <div class="form-group">
                    <label for="editJoursMaxMad">Jours max sur la période *</label>
                    <input
                        id="editJoursMaxMad"
                        :value="f.joursMaxMad"
                        type="number"
                        placeholder="Ex: 20"
                        min="1"
                        @input="f.joursMaxMad = ($event.target as HTMLInputElement).value"
                    />
                </div>
            </div>

            <div class="fiche__ligne fiche__ligne--deux fiche__samus">
                <SaisieSamu
                    v-model="f.principal"
                    v-model:autres="f.secondaire"
                    cle="edit_principal"
                    role="principal"
                    libelle="🅿️ Expert principal sur le(s) SAMU"
                    :samus="libellesSamu"
                    :lecture-seule="consultation"
                />
                <SaisieSamu
                    v-model="f.secondaire"
                    v-model:autres="f.principal"
                    cle="edit_secondaire"
                    role="secondaire"
                    libelle="🅢 Expert secondaire sur le(s) SAMU"
                    :samus="libellesSamu"
                    :lecture-seule="consultation"
                />
            </div>

            <div v-if="consultation" id="editAstreintesBlock" class="fiche__astreintes-lecture">
                <div class="fiche__astreintes-titre">🔔 Astreintes</div>
                <div
                    v-for="l in [
                        ligneAstreinte(ressource.astreinte_ho, 'Astreintes HO'),
                        ligneAstreinte(ressource.astreinte_volontaire, 'Astreintes HNO'),
                        ligneAstreinte(ressource.astreinte_apd, 'Astreintes « Accompagnement post démarrage »')
                    ]"
                    :key="l.libelle"
                    class="fiche__astreinte-ligne"
                >
                    <template v-if="l.actif">
                        <span class="fiche__astreinte-oui">✔ {{ l.libelle }}</span>
                        <span v-if="l.libelle === 'Astreintes HNO'" class="fiche__astreinte-depuis">
                            — régime actif depuis le
                            <strong>{{
                                ressource.astreinte_date_activation ? dateFr(ressource.astreinte_date_activation) : '—'
                            }}</strong
                            >{{ depuisMois(ressource.astreinte_date_activation) }}</span
                        >
                    </template>
                    <span v-else class="fiche__astreinte-non">✖ {{ l.libelle }} : non</span>
                </div>
            </div>
            <div v-else id="editAstreintesBlock" class="fiche__astreintes">
                <div class="fiche__astreintes-titre">🔔 Astreintes (activités à différencier)</div>
                <label class="fiche__astreinte fiche__astreinte--ho">
                    <input id="editAstreinteHo" v-model="f.astreinteHo" type="checkbox" class="fiche__case" />
                    <span
                        ><strong>Astreintes HO</strong>
                        <span class="fiche__astreinte-aide">(jours de la semaine, heures ouvrées)</span></span
                    >
                </label>
                <label class="fiche__astreinte fiche__astreinte--hno">
                    <input
                        id="editAstreinteVolontaire"
                        v-model="f.astreinteHno"
                        type="checkbox"
                        class="fiche__case"
                        @change="basculerHno"
                    />
                    <span
                        ><strong>Astreintes HNO</strong>
                        <span class="fiche__astreinte-aide">(jours et heures non ouvrés)</span></span
                    >
                </label>
                <div v-show="f.astreinteHno" id="editAstreinteDateBlock" class="fiche__date">
                    <label for="editAstreinteDate" class="fiche__date-libelle"
                        >📅 Date de démarrage du régime d'astreintes HNO *</label
                    >
                    <input id="editAstreinteDate" v-model="f.dateAstreinte" type="date" class="fiche__date-champ" />
                </div>
                <label class="fiche__astreinte fiche__astreinte--apd">
                    <input id="editAstreinteApd" v-model="f.astreinteApd" type="checkbox" class="fiche__case" />
                    <span
                        ><strong>Astreintes « Accompagnement post démarrage »</strong>
                        <span class="fiche__astreinte-aide"
                            >(jours et heures non ouvrés, dans le cadre d'un déploiement)</span
                        ></span
                    >
                </label>
            </div>

            <div class="fiche__contacts">
                <label for="editContactsRh" class="fiche__contacts-libelle"
                    >📧 Contacts RH de l'ES <span class="fiche__contacts-aide">(un email par ligne)</span></label
                >
                <textarea
                    id="editContactsRh"
                    ref="champContacts"
                    v-model="f.contacts"
                    placeholder="rh@etablissement.fr&#10;drh@hopital.fr"
                    rows="3"
                    class="fiche__contacts-champ"
                    :class="{ 'fiche__contacts-champ--invalide': contactsInvalides.length }"
                ></textarea>
                <div v-if="contactsInvalides.length" class="fiche__contacts-erreur">
                    Adresse(s) e-mail invalide(s) : {{ contactsInvalides.join(' · ') }}
                </div>
            </div>
        </fieldset>

        <HistoriqueMad v-model="historique" :ressource="ressource" :consultation="consultation" />

        <p v-if="erreur" :key="erreur" role="alert" class="fiche__erreur">{{ erreur }}</p>
        <template #footer>
            <template v-if="consultation">
                <button type="button" class="fiche__annuler" @click="emit('fermer')">Fermer</button>
            </template>
            <template v-else>
                <button type="button" class="fiche__annuler" @click="emit('fermer')">Annuler</button>
                <button type="button" @click="enregistrer">Enregistrer</button>
            </template>
        </template>
    </AppModal>
</template>

<style scoped>
.fiche__champs {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
}
.fiche__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.fiche__ligne {
    display: grid;
    gap: 15px;
}
.fiche__ligne--deux {
    grid-template-columns: 1fr 1fr;
}
.fiche__ligne--trois {
    grid-template-columns: 1fr 1fr 1fr;
}
.fiche__volante {
    margin-top: 10px;
    padding: 10px 14px;
    background: #f3e5f5;
    border: 1px solid #ce93d8;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.fiche__case {
    width: 16px;
    height: 16px;
    cursor: pointer;
}
.fiche__volante-libelle {
    font-size: 13px;
    font-weight: bold;
    color: #6a1b9a;
    cursor: pointer;
    margin: 0;
}
.fiche__avion {
    width: 16px;
    height: 16px;
    stroke: #7b1fa2;
    fill: #e1bee7;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -3px;
    margin-right: 6px;
}
.fiche__volante-aide {
    font-weight: normal;
    color: #888;
    font-size: 12px;
}
.fiche__volante-champs {
    margin-top: 10px;
}
.fiche__samus {
    margin-top: 10px;
}
.fiche__astreintes {
    margin-top: 16px;
    padding: 12px;
    background: #fff8e1;
    border: 1px solid #ffe082;
    border-radius: 6px;
}
.fiche__astreintes-titre {
    font-size: 13px;
    font-weight: bold;
    color: #e65100;
    margin-bottom: 8px;
}
.fiche__astreinte {
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    margin-bottom: 6px;
}
.fiche__astreinte--ho {
    color: #33691e;
}
.fiche__astreinte--hno {
    color: #e65100;
}
.fiche__astreinte--apd {
    color: #4a148c;
    margin-bottom: 0;
}
.fiche__astreinte-aide {
    font-size: 11px;
    color: #777;
}
.fiche__date {
    margin: 0 0 8px 26px;
}
.fiche__date-libelle {
    font-size: 12px;
    color: #555;
    display: block;
    margin-bottom: 4px;
}
.fiche__date-champ {
    padding: 6px 10px;
    border: 1px solid #ffe082;
    border-radius: 4px;
    font-size: 13px;
}
.fiche__astreintes-lecture {
    margin-top: 16px;
    padding: 10px;
    background: #fff8e1;
    border: 1px solid #ffe082;
    border-radius: 6px;
}
.fiche__astreintes-lecture .fiche__astreintes-titre {
    margin-bottom: 4px;
}
.fiche__astreinte-ligne {
    margin: 4px 0;
}
.fiche__astreinte-oui {
    font-weight: bold;
    color: #2e7d32;
}
.fiche__astreinte-depuis {
    font-size: 12px;
    color: #555;
}
.fiche__astreinte-non {
    color: #999;
}
.fiche__contacts {
    margin-top: 16px;
}
.fiche__contacts-libelle {
    font-size: 13px;
    font-weight: bold;
    color: #6a1b9a;
    display: block;
    margin-bottom: 6px;
}
.fiche__contacts-aide {
    font-size: 11px;
    font-weight: normal;
    color: #888;
}
.fiche__contacts-champ {
    width: 100%;
    font-size: 12px;
    padding: 8px;
    border: 1px solid #b39ddb;
    border-radius: 4px;
    resize: vertical;
    box-sizing: border-box;
}
.fiche__contacts-champ--invalide {
    border-color: #c62828;
}
.fiche__contacts-erreur {
    font-size: 11px;
    color: #c62828;
    margin-top: 4px;
}
/* Consultation : champs grisés */
.fiche--consultation input,
.fiche--consultation select,
.fiche--consultation textarea {
    background: #f5f5f5;
    cursor: not-allowed;
}
.fiche__erreur {
    color: #e74c3c;
    font-size: 13px;
    white-space: pre-line;
}
.fiche__annuler,
.fiche__annuler:hover {
    background-color: #95a5a6;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.fiche .gp-modale__boite {
    width: min(800px, 100%);
}
</style>
