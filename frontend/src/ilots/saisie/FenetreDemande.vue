<!-- « Faire une demande d'affectation » (bouton de l'en-tête de la planification, administrateur et utilisateur) :
     e-mail aux experts choisis (saisie semi-automatique), dates et demi-journées demandées, message prérempli ;
     fenêtre de confirmation listant les adresses. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiNotifications } from '@/api/notifications';
import { apiRessources } from '@/api/ressources';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { cleDateLocale } from '@/ilots/consultation/calendrier';
import { surDemande } from '@/ilots/fenetres';
import { useSessionStore } from '@/stores/session';
import {
    destinatairesPossibles,
    erreurDates,
    libelleDestinataire,
    preremplissage,
    propositions,
    type Destinataire
} from './demande';
import FenetreMessage from './FenetreMessage.vue';

const session = useSessionStore();

const ouverte = ref(false);
const emailExpediteur = ref('');
const expediteur = ref('');
const sujet = ref('');
const message = ref('');
const debut = ref('');
const fin = ref('');
const periodeDebut = ref('Matin');
const periodeFin = ref('Après-midi');
const erreurDate = ref('');
const erreur = ref('');

const tous = ref<Destinataire[]>([]);
const choisis = ref<Destinataire[]>([]);
const recherche = ref('');
const listeOuverte = ref(false);
const saisieDestinataires = ref<HTMLInputElement | null>(null);
const zoneDestinataires = ref<HTMLElement | null>(null);
const liste = ref<HTMLElement | null>(null);

/** Message sans formulaire : compte sans e-mail, informations indisponibles */
const messageBloquant = ref('');
/** Adresses des experts sollicités (fenêtre « Demande envoyée ») */
const envoyes = ref<string[] | null>(null);

surDemande(() => void ouvrir());

async function ouvrir() {
    let s;
    try {
        s = await session.charger();
    } catch {
        messageBloquant.value = 'Erreur: Informations utilisateur non disponibles';
        return;
    }
    if (!s.email) {
        messageBloquant.value =
            "Erreur: Votre compte utilisateur n'a pas d'adresse email configurée. Veuillez contacter l'administrateur pour ajouter votre email.";
        return;
    }
    const p = preremplissage(s.prenom ?? '', s.nom ?? '');
    emailExpediteur.value = s.email;
    expediteur.value = p.expediteur;
    sujet.value = p.sujet;
    message.value = p.message;
    choisis.value = [];
    recherche.value = '';
    listeOuverte.value = false;
    // Début et fin : aujourd'hui (date locale), du matin à l'après-midi
    debut.value = fin.value = cleDateLocale(new Date());
    periodeDebut.value = 'Matin';
    periodeFin.value = 'Après-midi';
    erreurDate.value = '';
    erreur.value = '';
    ouverte.value = true;
    try {
        tous.value = destinatairesPossibles(await apiRessources.liste());
    } catch {
        erreur.value = 'Erreur lors du chargement des experts';
    }
}

const proposes = computed(() => propositions(tous.value, choisis.value, recherche.value));

function ouvrirListe() {
    listeOuverte.value = true;
}

function ajouter(e: Destinataire) {
    if (!choisis.value.some(c => c.id === e.id)) choisis.value = [...choisis.value, e];
    recherche.value = '';
    listeOuverte.value = false;
    saisieDestinataires.value?.focus();
}

function retirer(id: number) {
    choisis.value = choisis.value.filter(e => e.id !== id);
}

function clavierDestinataires(e: KeyboardEvent) {
    if (e.key === 'Backspace' && recherche.value === '' && choisis.value.length > 0) {
        choisis.value = choisis.value.slice(0, -1);
    }
    if (e.key === 'Escape' && listeOuverte.value) {
        // La liste se ferme, pas la fenêtre
        e.stopPropagation();
        listeOuverte.value = false;
    }
}

/** Clic hors de la zone des destinataires et de la liste : liste fermée */
function clicFenetre(e: MouseEvent) {
    const cible = e.target as Node;
    if (!zoneDestinataires.value?.contains(cible) && !liste.value?.contains(cible)) listeOuverte.value = false;
}

/** Début choisi : la fin est alignée sur le début */
function debutChoisi() {
    if (debut.value) fin.value = debut.value;
    erreurDate.value = erreurDates(debut.value, fin.value);
}

function finChoisie() {
    erreurDate.value = erreurDates(debut.value, fin.value);
}

async function envoyer() {
    erreur.value = '';
    erreurDate.value = erreurDates(debut.value, fin.value);
    if (erreurDate.value) return;
    if (choisis.value.length === 0) {
        erreur.value = 'Veuillez sélectionner au moins un expert.';
        return;
    }
    try {
        const r = await apiNotifications.demanderAffectation({
            fromName: expediteur.value,
            fromEmail: emailExpediteur.value,
            expertIds: choisis.value.map(e => e.id),
            subject: sujet.value,
            startDate: debut.value,
            startPeriod: periodeDebut.value,
            endDate: fin.value,
            endPeriod: periodeFin.value,
            message: message.value
        });
        if (!r.success) {
            erreur.value = `Erreur lors de l'envoi de la demande:\n\n${r.error || 'Erreur inconnue'}`;
            return;
        }
        ouverte.value = false;
        envoyes.value = r.emails;
    } catch (e) {
        erreur.value =
            e instanceof ErreurApi
                ? `Erreur lors de l'envoi de la demande:\n\n${e.message}`
                : `Erreur lors de l'envoi de la demande: ${e instanceof Error ? e.message : String(e)}`;
    }
}
</script>

<template>
    <AppModal
        id="requestModal"
        :opened="ouverte"
        title="Faire une demande d'affectation"
        class="gp-demande"
        @close="ouverte = false"
    >
        <form id="requestForm" class="gp-demande__formulaire" @submit.prevent="envoyer" @click="clicFenetre">
            <div class="form-group">
                <label for="requestFrom">De (Expéditeur)</label>
                <input id="requestFrom" :value="expediteur" type="text" readonly class="gp-demande__lecture" />
            </div>
            <div class="form-group gp-demande__destinataires">
                <label for="requestExpertsInput">Destinataires (Experts) *</label>
                <div
                    id="requestExpertsTags"
                    ref="zoneDestinataires"
                    class="samu-tag-box"
                    @click="saisieDestinataires?.focus()"
                >
                    <span v-for="e in choisis" :key="e.id" class="samu-tag principal"
                        ><span>{{ libelleDestinataire(e) }}</span
                        ><button
                            type="button"
                            class="samu-tag-remove"
                            title="Retirer"
                            :aria-label="`Retirer ${libelleDestinataire(e)}`"
                            @click.stop="retirer(e.id)"
                        >
                            &times;
                        </button></span
                    >
                    <input
                        id="requestExpertsInput"
                        ref="saisieDestinataires"
                        v-model="recherche"
                        type="text"
                        placeholder="Taper le nom d'un expert..."
                        class="samu-tag-input"
                        autocomplete="off"
                        @input="ouvrirListe"
                        @focus="ouvrirListe"
                        @keydown="clavierDestinataires"
                    />
                </div>
                <div
                    v-show="listeOuverte"
                    id="requestExpertsDropdown"
                    ref="liste"
                    class="samu-tag-dropdown gp-demande__liste"
                    role="listbox"
                >
                    <div v-if="proposes.length === 0" class="samu-tag-dropdown-empty">Aucun expert disponible</div>
                    <div
                        v-for="e in proposes"
                        :key="e.id"
                        class="samu-tag-dropdown-item"
                        role="option"
                        tabindex="0"
                        :aria-selected="false"
                        @click="ajouter(e)"
                        @keydown.enter.prevent="ajouter(e)"
                    >
                        {{ libelleDestinataire(e) }} — <span class="gp-demande__email">{{ e.email }}</span>
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label for="requestSubject">Sujet *</label>
                <input id="requestSubject" v-model="sujet" type="text" required />
            </div>
            <div class="form-group">
                <label for="requestStartDate">Dates demandées *</label>
                <div class="gp-demande__dates">
                    <div>
                        <label for="requestStartDate" class="gp-demande__sous-libelle">Début</label>
                        <input id="requestStartDate" v-model="debut" type="date" required @change="debutChoisi" />
                        <select
                            id="requestStartPeriod"
                            v-model="periodeDebut"
                            class="gp-demande__periode"
                            required
                            aria-label="Demi-journée de début"
                        >
                            <option value="Matin">Matin</option>
                            <option value="Après-midi">Après-midi</option>
                        </select>
                    </div>
                    <div>
                        <label for="requestEndDate" class="gp-demande__sous-libelle">Fin</label>
                        <input id="requestEndDate" v-model="fin" type="date" required @change="finChoisie" />
                        <select
                            id="requestEndPeriod"
                            v-model="periodeFin"
                            class="gp-demande__periode"
                            required
                            aria-label="Demi-journée de fin"
                        >
                            <option value="Matin">Matin</option>
                            <option value="Après-midi">Après-midi</option>
                        </select>
                    </div>
                </div>
                <div v-show="erreurDate" id="dateError" class="gp-demande__erreur-date">{{ erreurDate }}</div>
            </div>
            <div class="form-group">
                <label for="requestMessage">Message *</label>
                <textarea id="requestMessage" v-model="message" required class="gp-demande__message"></textarea>
            </div>
            <AppAlert v-if="erreur" type="error" :description="erreur" class="gp-demande__alerte" />
            <div class="button-group">
                <button type="submit" class="gp-demande__envoyer">✉️ Envoyer la demande</button>
                <button type="button" class="gp-demande__annuler" @click="ouverte = false">Annuler</button>
            </div>
        </form>
    </AppModal>

    <AppModal
        id="confirmationModal"
        :opened="envoyes !== null"
        title="✓ Demande envoyée avec succès"
        class="gp-demande-envoyee"
        @close="envoyes = null"
    >
        <p class="gp-demande-envoyee__texte">Votre demande a été envoyée aux experts suivants :</p>
        <ul id="confirmationEmailList" class="gp-demande-envoyee__liste">
            <li v-for="email in envoyes ?? []" :key="email">{{ email }}</li>
        </ul>
        <button type="button" class="gp-demande-envoyee__fermer" @click="envoyes = null">Fermer</button>
    </AppModal>

    <FenetreMessage :message="messageBloquant" @fermer="messageBloquant = ''" />
</template>

<style>
/* Fenêtres téléportées hors du composant : règles ciblées par leur classe */
.gp-modale.gp-demande .gp-modale__boite {
    width: min(700px, 100%);
    padding: 30px;
}
.gp-modale.gp-demande .gp-modale__titre {
    color: #2c3e50;
    font-size: 1.5em;
}
.gp-demande__formulaire {
    margin-top: 20px;
}
.gp-demande__lecture {
    background-color: #ecf0f1;
}
.gp-demande__destinataires {
    position: relative;
}
.gp-demande__liste {
    display: block;
}
/* Croix d'un destinataire : bouton sans l'apparence globale des boutons */
.gp-demande .samu-tag-remove,
.gp-demande .samu-tag-remove:hover {
    background: none;
    border: none;
    color: inherit;
    padding: 0;
}
.gp-demande__email {
    color: #27ae60;
}
.gp-demande__sous-libelle {
    font-size: 12px;
    color: #7f8c8d;
}
.gp-demande__dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
.gp-demande__periode {
    margin-top: 5px;
}
.gp-demande__erreur-date {
    color: #e74c3c;
    font-size: 12px;
    margin-top: 5px;
}
.gp-demande__message {
    min-height: 150px;
    resize: vertical;
    width: 100%;
}
.gp-demande__alerte {
    white-space: pre-line;
}
.gp-demande__envoyer {
    background-color: #27ae60;
}
.gp-demande__annuler {
    background-color: #7f8c8d;
}
.gp-modale.gp-demande-envoyee .gp-modale__boite {
    width: min(500px, 100%);
    margin-top: 120px;
}
.gp-modale.gp-demande-envoyee .gp-modale__titre {
    color: #27ae60;
}
.gp-demande-envoyee__texte {
    margin: 15px 0 10px;
}
.gp-demande-envoyee__liste {
    margin: 15px 0;
    padding-left: 20px;
    color: #2c3e50;
}
.gp-demande-envoyee__liste li {
    margin-bottom: 5px;
}
.gp-demande-envoyee__fermer {
    background-color: #1d70b7;
    width: 100%;
    margin-top: 15px;
}
</style>
