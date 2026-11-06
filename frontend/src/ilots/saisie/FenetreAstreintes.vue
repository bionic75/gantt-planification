<!-- « Gérer mes astreintes/HNO » (expert) ou « Gérer les astreintes/HNO » (administrateur), bouton de l'en-tête de la
     planification : formulaire repliable d'ajout ou de modification, arborescence des lignes déclarées (Année > Mois ;
     Expert > Année > Mois pour l'administrateur), suppression confirmée. -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { apiLignesAstreinte, type ExpertAstreinte, type LigneAstreinte } from '@/api/astreintes';
import { ErreurApi } from '@/api/client';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppModal from '@/composants/AppModal.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surDemande } from '@/ilots/fenetres';
import { emettre } from '@/liaison';
import { useSessionStore } from '@/stores/session';
import {
    SAMU_ASTREINTES,
    apparenceType,
    arbreAdministrateur,
    arbreExpert,
    controler,
    periode,
    saisieDe,
    saisieVide,
    samuAffiche,
    typesProposes,
    type SaisieAstreinte
} from './astreintes';

const session = useSessionStore();
const { demande, repondre, confirmer } = fournirConfirmation();

const ouverte = ref(false);
const administrateur = ref(false);
const experts = ref<ExpertAstreinte[]>([]);
const lignes = ref<LigneAstreinte[] | null>(null);
/** Nœuds dépliés de l'arborescence (repliés à chaque rechargement, comme l'ancien écran) */
const deplies = ref(new Set<string>());

const saisie = ref<SaisieAstreinte>(saisieVide());
const idModifie = ref<number | null>(null);
/** Type de la ligne en modification (« Activité courante » ajoutée aux types proposés) */
const typeModifie = ref<string | null>(null);
const formulaireOuvert = ref(false);
const titreFormulaire = ref<HTMLElement | null>(null);

const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);

surDemande(() => void ouvrir());

async function ouvrir() {
    const s = await session.charger();
    administrateur.value = s.activeProfile === 'admin';
    message.value = null;
    ouverte.value = true;
    if (administrateur.value) {
        try {
            experts.value = await apiLignesAstreinte.experts();
        } catch {
            experts.value = [];
        }
    }
    await charger();
    reinitialiser();
}

async function charger() {
    try {
        lignes.value = administrateur.value ? await apiLignesAstreinte.toutes() : await apiLignesAstreinte.miennes();
        deplies.value = new Set();
    } catch {
        // Liste inchangée (l'ancien écran gardait l'affichage précédent)
        lignes.value ??= [];
    }
}

const titre = computed(() => (administrateur.value ? 'Gérer les astreintes/HNO' : 'Gérer mes astreintes/HNO'));
const types = computed(() => typesProposes(typeModifie.value));

const arbre = computed(() => {
    const l = lignes.value ?? [];
    return administrateur.value ? arbreAdministrateur(l) : [{ cle: 'moi', libelle: '', annees: arbreExpert(l) }];
});

const cleLigne = (l: LigneAstreinte) =>
    [l.id, l.type, l.date_debut, l.date_fin, l.heure_debut, l.heure_fin, l.samu, l.tous_samu, l.objet].join('|');

const estDeplie = (cle: string) => deplies.value.has(cle);
function basculer(cle: string) {
    const d = new Set(deplies.value);
    if (d.has(cle)) d.delete(cle);
    else d.add(cle);
    deplies.value = d;
}

function reinitialiser() {
    saisie.value = saisieVide();
    idModifie.value = null;
    typeModifie.value = null;
    formulaireOuvert.value = false;
}

/** Date de fin proposée : la date de début, si elle n'est pas renseignée */
function dateDebutChoisie() {
    if (saisie.value.dateDebut && !saisie.value.dateFin) saisie.value.dateFin = saisie.value.dateDebut;
}

function tousSamuChoisi() {
    if (saisie.value.tousSamu) saisie.value.samu = '';
}

async function modifier(l: LigneAstreinte) {
    message.value = null;
    saisie.value = saisieDe(l);
    idModifie.value = l.id;
    typeModifie.value = l.type;
    if (saisie.value.tousSamu) saisie.value.samu = '';
    formulaireOuvert.value = true;
    await nextTick();
    titreFormulaire.value?.scrollIntoView({ behavior: 'smooth' });
}

/** Ligne enregistrée : formulaire remis à zéro, liste et planification rechargées */
async function apresEnregistrement(texte: string) {
    message.value = { type: 'success', texte };
    reinitialiser();
    await charger();
    emettre('astreintes-modifiees');
}

async function enregistrer() {
    const s = await session.charger();
    const resultat = controler(saisie.value, {
        administrateur: administrateur.value,
        modification: idModifie.value !== null,
        adhesion: s.activeProfile === 'expert' ? s.astreinte_date_activation : null
    });
    if ('erreur' in resultat) {
        message.value = { type: 'error', texte: resultat.erreur };
        return;
    }
    const modification = idModifie.value;
    try {
        if (modification !== null) await apiLignesAstreinte.modifier(modification, resultat.corps);
        else await apiLignesAstreinte.creer(resultat.corps);
    } catch (e) {
        message.value = {
            type: 'error',
            texte: e instanceof ErreurApi && e.statut < 500 ? e.message : "Erreur lors de l'enregistrement"
        };
        return;
    }
    await apresEnregistrement(
        modification !== null ? 'Astreinte/HNO modifiée avec succès' : 'Astreinte/HNO créée avec succès'
    );
}

async function supprimer(l: LigneAstreinte) {
    message.value = null;
    if (!(await confirmer('Êtes-vous sûr de vouloir supprimer cette astreinte/HNO ?', 'Supprimer', { danger: true })))
        return;
    try {
        await apiLignesAstreinte.supprimer(l.id);
    } catch (e) {
        message.value = {
            type: 'error',
            texte: e instanceof ErreurApi && e.statut < 500 ? e.message : 'Erreur lors de la suppression'
        };
        return;
    }
    message.value = { type: 'success', texte: 'Astreinte/HNO supprimée avec succès' };
    await charger();
    emettre('astreintes-modifiees');
}
</script>

<template>
    <AppModal id="astreintesModal" :opened="ouverte" :title="titre" class="gp-astreintes" @close="ouverte = false">
        <span id="astreintesModalTitle" :key="titre" class="gp-astreintes__titre-lu">{{ titre }}</span>
        <AppAlert v-if="message" :type="message.type" :description="message.texte" />

        <div class="gp-astreintes__formulaire">
            <button
                type="button"
                class="gp-astreintes__bascule"
                :aria-expanded="formulaireOuvert"
                @click="formulaireOuvert = !formulaireOuvert"
            >
                <span class="gp-astreintes__fleche">{{ formulaireOuvert ? '▼' : '▶' }}</span>
                <span id="astreintesFormTitle" ref="titreFormulaire" class="gp-astreintes__titre-formulaire">{{
                    idModifie !== null ? "Modifier l'astreinte/HNO" : 'Ajouter une astreinte/HNO'
                }}</span>
            </button>
            <div v-show="formulaireOuvert" class="gp-astreintes__corps">
                <div v-if="administrateur" class="gp-astreintes__champ">
                    <label for="astreintesExpert" class="gp-astreintes__libelle">Expert *</label>
                    <select id="astreintesExpert" v-model="saisie.expert" class="gp-astreintes__saisie">
                        <option value="">-- Sélectionner un expert --</option>
                        <option v-for="e in experts" :key="e.id" :value="String(e.id)">
                            {{ e.nom }} {{ e.prenom }}
                        </option>
                    </select>
                </div>
                <div class="gp-astreintes__grille">
                    <div>
                        <label for="astreintesType" class="gp-astreintes__libelle">Type *</label>
                        <select id="astreintesType" v-model="saisie.type" class="gp-astreintes__saisie">
                            <option v-for="t in types" :key="t.valeur" :value="t.valeur">{{ t.libelle }}</option>
                        </select>
                    </div>
                    <div>
                        <label for="astreintesDateDebut" class="gp-astreintes__libelle">Date de début *</label>
                        <input
                            id="astreintesDateDebut"
                            v-model="saisie.dateDebut"
                            type="date"
                            class="gp-astreintes__saisie"
                            @change="dateDebutChoisie"
                        />
                    </div>
                    <div>
                        <label for="astreintesDateFin" class="gp-astreintes__libelle">Date de fin *</label>
                        <input
                            id="astreintesDateFin"
                            v-model="saisie.dateFin"
                            type="date"
                            class="gp-astreintes__saisie"
                        />
                    </div>
                </div>
                <div class="gp-astreintes__heures">
                    <div>
                        <label for="astreintesHeureDebut" class="gp-astreintes__libelle">Heure de début *</label>
                        <input
                            id="astreintesHeureDebut"
                            v-model="saisie.heureDebut"
                            type="time"
                            class="gp-astreintes__saisie"
                        />
                    </div>
                    <div>
                        <label for="astreintesHeureFin" class="gp-astreintes__libelle">Heure de fin *</label>
                        <input
                            id="astreintesHeureFin"
                            v-model="saisie.heureFin"
                            type="time"
                            class="gp-astreintes__saisie"
                        />
                    </div>
                </div>
                <div class="gp-astreintes__champ-haut">
                    <label for="astreintesSamu" class="gp-astreintes__libelle">SAMU *</label>
                    <div class="gp-astreintes__samu">
                        <select
                            id="astreintesSamu"
                            v-model="saisie.samu"
                            class="gp-astreintes__saisie gp-astreintes__saisie--samu"
                            :disabled="saisie.tousSamu"
                        >
                            <option value="">-- Sélectionner un SAMU --</option>
                            <option v-for="s in SAMU_ASTREINTES" :key="s" :value="s">{{ s }}</option>
                        </select>
                        <label class="gp-astreintes__tous">
                            <input
                                id="astreintesTousSamu"
                                v-model="saisie.tousSamu"
                                type="checkbox"
                                @change="tousSamuChoisi"
                            />
                            <span>Tous les SAMU</span>
                        </label>
                    </div>
                </div>
                <div class="gp-astreintes__champ-haut">
                    <label for="astreintesObjet" class="gp-astreintes__libelle">Objet *</label>
                    <input
                        id="astreintesObjet"
                        v-model="saisie.objet"
                        type="text"
                        placeholder="Objet de l'astreinte/HNO"
                        class="gp-astreintes__saisie"
                    />
                </div>
                <div class="gp-astreintes__actions">
                    <button type="button" class="gp-astreintes__enregistrer" @click="enregistrer">
                        💾 Enregistrer
                    </button>
                    <button type="button" class="gp-astreintes__reinitialiser" @click="reinitialiser">
                        🔄 Réinitialiser
                    </button>
                </div>
            </div>
        </div>

        <div class="gp-astreintes__liste">
            <h4 class="gp-astreintes__titre-liste">Liste des astreintes/HNO</h4>
            <div id="astreintesTreeView" class="gp-astreintes__arbre">
                <p v-if="lignes === null" class="gp-astreintes__vide">Chargement...</p>
                <p v-else-if="lignes.length === 0" class="gp-astreintes__vide">Aucune astreinte/HNO enregistrée</p>
                <template v-else>
                    <div
                        v-for="expert in arbre"
                        :key="expert.cle"
                        :class="{ 'gp-astreintes__branche': administrateur }"
                    >
                        <button
                            v-if="administrateur"
                            type="button"
                            class="gp-astreintes__noeud gp-astreintes__noeud--1"
                            :aria-expanded="estDeplie(expert.cle)"
                            @click="basculer(expert.cle)"
                        >
                            <span :key="String(estDeplie(expert.cle))">{{ estDeplie(expert.cle) ? '▼' : '▶' }}</span> 👤
                            {{ expert.libelle }}
                        </button>
                        <div
                            v-show="!administrateur || estDeplie(expert.cle)"
                            :class="{ 'gp-astreintes__contenu': administrateur }"
                        >
                            <div
                                v-for="annee in expert.annees"
                                :key="annee.cle"
                                :class="administrateur ? 'gp-astreintes__sous-branche' : 'gp-astreintes__branche'"
                            >
                                <button
                                    type="button"
                                    class="gp-astreintes__noeud"
                                    :class="administrateur ? 'gp-astreintes__noeud--2' : 'gp-astreintes__noeud--1'"
                                    :aria-expanded="estDeplie(annee.cle)"
                                    @click="basculer(annee.cle)"
                                >
                                    <span :key="String(estDeplie(annee.cle))">{{
                                        estDeplie(annee.cle) ? '▼' : '▶'
                                    }}</span>
                                    📅 {{ annee.libelle }}
                                </button>
                                <div v-show="estDeplie(annee.cle)" class="gp-astreintes__contenu">
                                    <div v-for="mois in annee.mois" :key="mois.cle" class="gp-astreintes__sous-branche">
                                        <button
                                            type="button"
                                            class="gp-astreintes__noeud"
                                            :class="
                                                administrateur ? 'gp-astreintes__noeud--3' : 'gp-astreintes__noeud--2'
                                            "
                                            :aria-expanded="estDeplie(mois.cle)"
                                            @click="basculer(mois.cle)"
                                        >
                                            <span :key="String(estDeplie(mois.cle))">{{
                                                estDeplie(mois.cle) ? '▼' : '▶'
                                            }}</span>
                                            {{ mois.libelle }}
                                        </button>
                                        <div v-show="estDeplie(mois.cle)" class="gp-astreintes__contenu">
                                            <!-- Recréée à chaque changement : textes avec émojis (ui-icons.js) -->
                                            <div
                                                v-for="l in mois.lignes"
                                                :key="cleLigne(l)"
                                                class="gp-astreintes__ligne"
                                                :class="`gp-astreintes__ligne--${apparenceType(l.type).classe}`"
                                            >
                                                <div class="gp-astreintes__ligne-corps">
                                                    <div>
                                                        <span
                                                            class="gp-astreintes__type"
                                                            :class="`gp-astreintes__type--${apparenceType(l.type).classe}`"
                                                            >{{ apparenceType(l.type).libelle }}</span
                                                        >
                                                        <div class="gp-astreintes__objet">{{ l.objet }}</div>
                                                        <div class="gp-astreintes__details">
                                                            📅 {{ periode(l) }}<br />
                                                            🏥 {{ samuAffiche(l) }}
                                                        </div>
                                                    </div>
                                                    <div class="gp-astreintes__boutons">
                                                        <button
                                                            type="button"
                                                            class="gp-astreintes__modifier"
                                                            title="Modifier"
                                                            aria-label="Modifier"
                                                            @click="modifier(l)"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            type="button"
                                                            class="gp-astreintes__supprimer"
                                                            title="Supprimer"
                                                            aria-label="Supprimer"
                                                            @click="supprimer(l)"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </AppModal>
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :label-annuler="demande?.labelAnnuler"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>

<style>
/* Fenêtre téléportée hors du composant : règles ciblées par sa classe */
.gp-modale.gp-astreintes .gp-modale__boite {
    width: min(900px, 95%);
    padding: 25px;
    border-radius: 12px;
}
.gp-modale.gp-astreintes .gp-modale__entete {
    border-bottom: 2px solid #9c27b0;
    padding-bottom: 10px;
    margin-bottom: 20px;
}
.gp-modale.gp-astreintes .gp-modale__titre {
    color: #9c27b0;
}
/* Titre de la fenêtre repris pour les tests et l'ancien identifiant (affiché par l'en-tête de la fenêtre) */
.gp-astreintes__titre-lu {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}
.gp-astreintes__formulaire {
    background: #f3e5f5;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
}
.gp-astreintes__bascule {
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: #7b1fa2;
}
.gp-astreintes__bascule:hover,
.gp-astreintes__bascule:focus {
    background: none;
}
.gp-astreintes__fleche {
    font-size: 13px;
}
.gp-astreintes__titre-formulaire {
    margin: 0;
    font-weight: bold;
    font-size: 1em;
}
.gp-astreintes__corps {
    margin-top: 15px;
}
.gp-astreintes__champ {
    margin-bottom: 15px;
}
.gp-astreintes__champ-haut {
    margin-top: 15px;
}
.gp-astreintes__libelle {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
    color: #333;
}
.gp-astreintes__saisie {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box;
}
.gp-astreintes__grille {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
}
.gp-astreintes__heures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-top: 15px;
}
.gp-astreintes__samu {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
}
.gp-astreintes__saisie--samu {
    flex: 1;
    min-width: 200px;
    width: auto;
}
.gp-astreintes__tous {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    white-space: nowrap;
}
.gp-astreintes__actions {
    margin-top: 20px;
    display: flex;
    gap: 10px;
}
.gp-astreintes__enregistrer,
.gp-astreintes__reinitialiser {
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.gp-astreintes__enregistrer {
    background: #9c27b0;
    font-weight: bold;
}
.gp-astreintes__reinitialiser {
    background: #95a5a6;
}
.gp-astreintes__liste {
    background: #fafafa;
    padding: 20px;
    border-radius: 8px;
}
.gp-astreintes__titre-liste {
    margin: 0 0 15px 0;
    color: #7b1fa2;
}
.gp-astreintes__arbre {
    max-height: 400px;
    overflow-y: auto;
}
.gp-astreintes__vide {
    color: #999;
    text-align: center;
}
.gp-astreintes__branche {
    margin-bottom: 10px;
}
.gp-astreintes__sous-branche {
    margin-bottom: 5px;
}
.gp-astreintes__contenu {
    margin-left: 20px;
    margin-top: 5px;
}
.gp-astreintes__noeud {
    width: 100%;
    cursor: pointer;
    border: none;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 5px;
    text-align: left;
    color: inherit;
    font-size: inherit;
}
.gp-astreintes__noeud--1 {
    padding: 8px;
    background: #e1bee7;
    font-weight: bold;
}
.gp-astreintes__noeud--2 {
    padding: 6px;
    background: #ce93d8;
}
.gp-astreintes__noeud--3 {
    padding: 5px;
    background: #f3e5f5;
}
.gp-astreintes__ligne {
    background: white;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 5px;
    border-left: 3px solid #2196f3;
}
.gp-astreintes__ligne--astreinte {
    border-left-color: #ff9800;
}
.gp-astreintes__ligne--activite {
    border-left-color: #2e7d32;
}
.gp-astreintes__ligne-corps {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}
.gp-astreintes__type {
    background: #2196f3;
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
}
.gp-astreintes__type--astreinte {
    background: #ff9800;
}
.gp-astreintes__type--activite {
    background: #2e7d32;
}
.gp-astreintes__objet {
    margin-top: 5px;
    font-weight: bold;
}
.gp-astreintes__details {
    font-size: 12px;
    color: #666;
    margin-top: 3px;
}
.gp-astreintes__boutons {
    display: flex;
    gap: 5px;
}
.gp-astreintes__modifier,
.gp-astreintes__supprimer {
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
}
.gp-astreintes__modifier {
    background: #3498db;
}
.gp-astreintes__supprimer {
    background: #e74c3c;
}
</style>
