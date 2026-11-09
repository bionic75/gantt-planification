<!-- Suivi des déplacements › onglet « Planification des déplacements » : formulaire d'ajout (UO, bon de commande
     présélectionné, avertissement de dépassement), liste des déplacements (de l'utilisateur, ou tous pour
     l'administrateur), modification et suppression. Identifiants des champs de l'ancien écran conservés. -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiDeplacements, type AmoaCed, type BonCommande, type Deplacement } from '@/api/deplacements';
import type { Session } from '@/api/types';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { LISTE_SAMU } from '@/composants/samu';
import { surReouverture } from '@/ilots/activation';
import FenetreMessage from '@/ilots/saisie/FenetreMessage.vue';
import { useSessionStore } from '@/stores/session';
import {
    bonCouvrant,
    controler,
    depassements,
    libelleBon,
    ligneDeplacement,
    nombreUo,
    trier,
    type ColonneTri,
    type SaisieDeplacement
} from './calculs';
import FenetreDeplacement from './FenetreDeplacement.vue';

const sessionStore = useSessionStore();
const session = ref<Session | null>(null);
const admin = computed(() => session.value?.activeProfile === 'admin');

const deplacements = ref<Deplacement[]>([]);
const charge = ref(false);
const bons = ref<BonCommande[]>([]);
const amoaCed = ref<AmoaCed[]>([]);
const message = ref('');
const { demande, repondre, confirmer } = fournirConfirmation();

// ---------- Formulaire d'ajout ----------

const vide = (): SaisieDeplacement => ({ amoa: '', debut: '', fin: '', samu: '', ville: '', bon: '', commentaire: '' });
const saisie = ref<SaisieDeplacement>(vide());
const nbUo = computed(() => nombreUo(saisie.value.debut, saisie.value.fin));
const bonsDisponibles = computed(() => bons.value.filter(b => b.solde !== 1));
const avertissement = ref<{ intitule: string; solde: number; demandees: number } | null>(null);

/** Nom fixe de l'utilisateur (AMOA CED de ses propres déplacements) */
const nomFixe = computed(() => {
    const s = session.value;
    if (!s) return '';
    const nom = `${s.nom ? s.nom.toUpperCase() : ''} ${s.prenom || ''}${s.trigramme ? ` (${s.trigramme})` : ''}`.trim();
    return nom || s.username;
});

/** Dépassement du solde du bon de commande choisi, d'après les UO déjà consommées */
let verification = 0;
async function verifierDepassement() {
    const id = Number(saisie.value.bon);
    const demandees = nbUo.value;
    const bon = bons.value.find(b => b.id === id);
    const n = ++verification;
    if (!id || demandees === 0 || !bon) {
        avertissement.value = null;
        return;
    }
    try {
        const suivi = (await apiDeplacements.suiviBons()).find(b => b.id === id);
        if (n !== verification) return;
        const solde = suivi ? (suivi.uo_commandees || 0) - (suivi.uo_consommees || 0) : null;
        avertissement.value =
            solde !== null && solde - demandees < 0 ? { intitule: bon.intitule, solde, demandees } : null;
    } catch {
        if (n === verification) avertissement.value = null;
    }
}

/** Dates saisies : bon de commande non soldé couvrant la période présélectionné, puis contrôle du solde */
watch(
    () => [saisie.value.debut, saisie.value.fin],
    ([debut, fin]) => {
        if (debut && fin) {
            const bon = bonCouvrant(bons.value, debut, fin);
            if (bon) saisie.value.bon = String(bon.id);
        }
        void verifierDepassement();
    }
);
watch(
    () => saisie.value.bon,
    () => void verifierDepassement()
);

function erreur(e: unknown, defaut: string) {
    return e instanceof ErreurApi && e.statut !== 401 && e.message && !/^Erreur \d+$/.test(e.message)
        ? e.message
        : defaut;
}

async function ajouter() {
    const s = { ...saisie.value, amoa: admin.value ? saisie.value.amoa : String(session.value?.userId ?? '') };
    const refus = controler(s, bons.value, true);
    if (refus) {
        message.value = refus;
        return;
    }
    try {
        const r = await apiDeplacements.creer(corps(s));
        saisie.value = { ...vide(), amoa: admin.value ? '' : saisie.value.amoa };
        avertissement.value = null;
        void chargerListe();
        message.value = r.a_regulariser
            ? '⚠️ ATTENTION - Déplacement créé sur un bon de commande en SURCONSOMMATION !\n\n' +
              'Ce déplacement est marqué "À RÉGULARISER".\n\n' +
              "Vous devrez le transférer vers un autre bon de commande disposant d'UO disponibles.\n\n" +
              'Pour régulariser : cliquez sur le bouton "🔄 Régulariser" dans la liste des déplacements.'
            : 'Déplacement ajouté avec succès';
    } catch (e) {
        console.error('Erreur ajout déplacement:', e);
        message.value = erreur(e, "Erreur lors de l'ajout");
    }
}

const corps = (s: SaisieDeplacement) => ({
    amoa_ced_id: Number(s.amoa),
    date_debut: s.debut,
    date_fin: s.fin,
    samu: s.samu,
    ville: s.ville.trim().toUpperCase(),
    bon_commande_id: Number(s.bon),
    commentaire: s.commentaire.trim()
});

// ---------- Liste ----------

const tri = ref<{ colonne: ColonneTri; croissant: boolean } | null>(null);
const lignes = computed(() => {
    const depasse = depassements(deplacements.value);
    const liste = deplacements.value.map(d => ligneDeplacement(d, amoaCed.value, depasse.has(d.id)));
    return tri.value ? trier(liste, tri.value.colonne, tri.value.croissant) : liste;
});
const colonnes = computed(() => (admin.value ? 11 : 9));

function trierPar(colonne: ColonneTri) {
    tri.value =
        tri.value?.colonne === colonne ? { colonne, croissant: !tri.value.croissant } : { colonne, croissant: true };
}
const classeTri = (colonne: ColonneTri) =>
    tri.value?.colonne === colonne ? (tri.value.croissant ? 'asc' : 'desc') : undefined;

async function chargerListe() {
    try {
        deplacements.value = await apiDeplacements.mes();
    } catch (e) {
        console.error('Erreur chargement mes déplacements:', e);
    }
    charge.value = true;
}

async function supprimer(d: Deplacement) {
    if (!(await confirmer('Êtes-vous sûr de vouloir supprimer ce déplacement ?', 'Supprimer'))) return;
    try {
        await apiDeplacements.supprimer(d.id);
        void chargerListe();
        message.value = 'Déplacement supprimé';
    } catch (e) {
        console.error('Erreur suppression déplacement:', e);
        message.value = erreur(e, 'Erreur lors de la suppression');
    }
}

// ---------- Modification ----------

const enModification = ref<Deplacement | null>(null);

async function modifier(d: Deplacement) {
    try {
        const detail = await apiDeplacements.detail(d.id);
        if (!amoaCed.value.length) amoaCed.value = await apiDeplacements.amoaCed().catch(() => []);
        enModification.value = detail;
    } catch (e) {
        console.error('Erreur chargement déplacement:', e);
        message.value = 'Erreur lors du chargement du déplacement';
    }
}

async function enregistrer(s: SaisieDeplacement) {
    const d = enModification.value;
    if (!d) return;
    const refus = controler(s, bons.value, false);
    if (refus) {
        message.value = refus;
        return;
    }
    try {
        await apiDeplacements.modifier(d.id, corps(s));
        enModification.value = null;
        void chargerListe();
        message.value = 'Déplacement modifié avec succès';
    } catch (e) {
        console.error('Erreur modification déplacement:', e);
        message.value = erreur(e, 'Erreur lors de la modification');
    }
}

// ---------- Ouverture de l'onglet ----------

/** Comme l'ancien écran à chaque ouverture de l'onglet : liste, bons de commande et AMOA CED relus */
async function ouvrir() {
    session.value = await sessionStore.charger();
    await Promise.all([
        chargerListe(),
        apiDeplacements
            .bons()
            .then(b => (bons.value = b))
            .catch(e => console.error('Erreur chargement bons de commande:', e)),
        admin.value
            ? apiDeplacements
                  .amoaCed()
                  .then(u => (amoaCed.value = u))
                  .catch(e => console.error('Erreur chargement AMOA CED:', e))
            : Promise.resolve()
    ]);
}

onMounted(() => void ouvrir());
surReouverture(() => void ouvrir());
</script>

<template>
    <h2>Mes déplacements</h2>

    <div class="form-section">
        <h3>Ajouter un déplacement</h3>
        <div class="form-row">
            <div class="form-group">
                <label :for="admin ? 'deplacementAmoaCed' : undefined">AMOA CED *</label>
                <select v-if="admin" id="deplacementAmoaCed" v-model="saisie.amoa">
                    <option value="">
                        {{ amoaCed.length ? '-- Sélectionner un AMOA CED --' : '-- Aucun AMOA CED disponible --' }}
                    </option>
                    <option v-for="u in amoaCed" :key="u.id" :value="String(u.id)">
                        {{ u.nom.toUpperCase() }} {{ u.prenom }}{{ u.trigramme ? ` (${u.trigramme})` : '' }}
                    </option>
                </select>
                <div v-else id="deplacementAmoaCedFixed" class="dep-mes__amoa-fixe">
                    <span id="deplacementAmoaCedFixedName">{{ nomFixe }}</span>
                </div>
            </div>
            <div class="form-group">
                <label for="deplacementDateDebut">Date de début *</label>
                <input id="deplacementDateDebut" v-model="saisie.debut" type="date" />
            </div>
            <div class="form-group">
                <label for="deplacementDateFin">Date de fin *</label>
                <input id="deplacementDateFin" v-model="saisie.fin" type="date" />
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="deplacementSamu">SAMU *</label>
                <select id="deplacementSamu" v-model="saisie.samu">
                    <option value="">-- Sélectionner un SAMU --</option>
                    <option v-for="s in LISTE_SAMU" :key="s" :value="s">{{ s }}</option>
                </select>
            </div>
            <div class="form-group">
                <label for="deplacementVille">Ville *</label>
                <input
                    id="deplacementVille"
                    :value="saisie.ville"
                    type="text"
                    placeholder="Nom de la ville"
                    class="dep-mes__majuscules"
                    @input="saisie.ville = ($event.target as HTMLInputElement).value.toUpperCase()"
                />
            </div>
            <div class="form-group">
                <label for="deplacementBonCommande">Bon de commande *</label>
                <select id="deplacementBonCommande" v-model="saisie.bon">
                    <option value="">-- Sélectionner un bon de commande --</option>
                    <option v-for="b in bonsDisponibles" :key="b.id" :value="String(b.id)">{{ libelleBon(b) }}</option>
                </select>
            </div>
            <div class="form-group">
                <label for="deplacementNbUO">Nombre d'UO</label>
                <input id="deplacementNbUO" :value="String(nbUo)" type="text" readonly class="dep-mes__lecture" />
            </div>
        </div>
        <div class="form-row">
            <div class="form-group dep-mes__large">
                <label for="deplacementCommentaire">Commentaire</label>
                <textarea
                    id="deplacementCommentaire"
                    v-model="saisie.commentaire"
                    placeholder="Commentaire optionnel..."
                    rows="2"
                    class="dep-mes__commentaire"
                ></textarea>
            </div>
        </div>
        <div v-if="avertissement" id="deplacementSurconsommationWarning" class="dep-mes__avertissement" role="alert">
            <strong>⚠️ ATTENTION :</strong>
            <span id="deplacementSurconsommationMessage">
                Le solde du bon de commande <strong>"{{ avertissement.intitule }}"</strong> sera dépassé ({{
                    avertissement.solde
                }}
                UO disponibles, {{ avertissement.demandees }} UO demandées).<br />Merci de penser à régulariser sur le
                prochain bon de commande.
            </span>
        </div>
        <div class="button-group">
            <button type="button" @click="ajouter">Ajouter le déplacement</button>
        </div>
    </div>

    <div class="form-section">
        <h3 id="mesDeplacementsTitle">{{ admin ? 'Liste de tous les déplacements' : 'Liste de mes déplacements' }}</h3>
        <div class="table-container">
            <table id="mesDeplacementsTable">
                <thead>
                    <tr>
                        <th class="sortable" :class="classeTri('debut')" @click="trierPar('debut')">Date début</th>
                        <th class="sortable" :class="classeTri('fin')" @click="trierPar('fin')">Date fin</th>
                        <th class="sortable" :class="classeTri('uo')" @click="trierPar('uo')">Nb UO</th>
                        <th class="sortable" :class="classeTri('samu')" @click="trierPar('samu')">SAMU</th>
                        <th class="sortable" :class="classeTri('ville')" @click="trierPar('ville')">Ville</th>
                        <th class="sortable" :class="classeTri('amoa')" @click="trierPar('amoa')">AMOA CED</th>
                        <th class="sortable" :class="classeTri('bon')" @click="trierPar('bon')">Bon de commande</th>
                        <template v-if="admin">
                            <th class="sortable" :class="classeTri('createur')" @click="trierPar('createur')">
                                Créé par
                            </th>
                            <th class="sortable" :class="classeTri('creeLe')" @click="trierPar('creeLe')">Créé le</th>
                        </template>
                        <th>Commentaire</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="!charge">
                        <td :colspan="colonnes" class="dep-mes__vide">Chargement...</td>
                    </tr>
                    <tr v-else-if="!lignes.length">
                        <td :colspan="colonnes" class="dep-mes__vide">Aucun déplacement enregistré</td>
                    </tr>
                    <tr v-for="l in lignes" :key="l.d.id" :class="{ 'dep-mes__attention': l.attention }">
                        <td>{{ l.debut }}</td>
                        <td>{{ l.fin }}</td>
                        <td>{{ l.d.nb_uo }}</td>
                        <td>{{ l.d.samu }}</td>
                        <td>{{ l.d.ville }}</td>
                        <td>{{ l.amoa }}</td>
                        <td>
                            <span v-if="l.sansBon" class="dep-mes__a-affecter">⚠️ À affecter</span>
                            <template v-else
                                >{{ l.bon
                                }}<span v-if="l.aRegulariser" class="dep-mes__badge">⚠️ À RÉGULARISER</span></template
                            >
                        </td>
                        <template v-if="admin">
                            <td class="dep-mes__petit">{{ l.createur }}</td>
                            <td class="dep-mes__petit">{{ l.creeLe }}</td>
                        </template>
                        <td class="dep-mes__commentaire-cellule">
                            <span
                                v-if="l.commentaire"
                                :title="l.commentaire"
                                :class="{ 'dep-mes__commentaire--depasse': l.depasse }"
                                >{{ l.commentaireCourt }}</span
                            >
                            <span v-else class="dep-mes__sans">-</span>
                        </td>
                        <td>
                            <button
                                type="button"
                                class="dep-mes__modifier"
                                :class="{ 'dep-mes__modifier--attention': l.attention }"
                                @click="modifier(l.d)"
                            >
                                <span :key="l.action">{{ l.action }}</span>
                            </button>
                            <button type="button" class="dep-mes__supprimer" @click="supprimer(l.d)">
                                🗑️ Supprimer
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <FenetreDeplacement
        :deplacement="enModification"
        :amoa-ced="amoaCed"
        :bons="bons"
        :admin="admin"
        @fermer="enModification = null"
        @enregistrer="enregistrer"
    />
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
    <FenetreMessage :message="message" @fermer="message = ''" />
</template>

<style>
.dep-mes__amoa-fixe {
    padding: 10px 15px;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    color: #333;
    font-weight: bold;
}
.dep-mes__majuscules {
    text-transform: uppercase;
}
.dep-mes__lecture {
    background-color: #f5f5f5;
    color: #666;
}
.dep-mes__large {
    flex: 1;
}
.dep-mes__commentaire {
    width: 100%;
    resize: vertical;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
}
.dep-mes__avertissement {
    margin: 15px 0;
    padding: 15px;
    background-color: #ffebee;
    border: 2px solid #e74c3c;
    border-radius: 8px;
    color: #c62828;
}
.dep-mes__vide {
    text-align: center;
    color: #999;
}
#mesDeplacementsTable tr.dep-mes__attention,
#mesDeplacementsTable tr.dep-mes__attention:nth-child(n) {
    background-color: #ffebee;
    border-left: 4px solid #e74c3c;
}
.dep-mes__a-affecter {
    color: #e74c3c;
    font-weight: bold;
}
.dep-mes__badge {
    display: inline-block;
    background-color: #e74c3c;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 10px;
    font-weight: bold;
    margin-left: 5px;
}
.dep-mes__petit {
    font-size: 11px;
}
.dep-mes__commentaire-cellule {
    font-size: 11px;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dep-mes__commentaire--depasse {
    color: #e74c3c;
    font-weight: bold;
}
.dep-mes__sans {
    color: #999;
}
.dep-mes__modifier,
.dep-mes__supprimer {
    color: white;
    padding: 5px 10px;
    font-size: 12px;
}
.dep-mes__modifier {
    background-color: #3498db;
    margin-right: 5px;
}
.dep-mes__modifier--attention,
.dep-mes__supprimer {
    background-color: #e74c3c;
}
</style>
