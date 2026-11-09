<!-- Déplacements d'un bon de commande (administration) ; bon soldé en surconsommation : régularisation technique (ligne
     de déplacement sur un autre bon de commande actif, non soldé, absorbant les UO en trop) -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiDeplacements, type BonCommandeSuivi, type DeplacementReporting } from '@/api/deplacements';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppModal from '@/composants/AppModal.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { dateFr } from './calculs';
import { ciblesRegularisation, premierDuMoisSuivant, type LigneBon } from './suivi';

const props = defineProps<{ ligne: LigneBon | null }>();
const emit = defineEmits<{ fermer: []; regularise: [message: string]; message: [texte: string] }>();

const deplacements = ref<DeplacementReporting[]>([]);
const charge = ref(false);
const cibles = ref<BonCommandeSuivi[] | null>(null);
const erreurCibles = ref(false);
const regul = ref({ cible: '', debut: '', commentaire: '' });
const { demande, repondre, confirmer } = fournirConfirmation();

const bon = computed(() => props.ligne?.bc ?? null);
/** Régularisation proposée : bon soldé en surconsommation */
const aRegulariser = computed(() => !!props.ligne && !!props.ligne.bc.solde && props.ligne.surconsommation);
const uoEnTrop = computed(() => props.ligne?.ecart ?? 0);
/** Plus récents en premier */
const lignes = computed(() =>
    [...deplacements.value].sort((a, b) => Date.parse(b.date_debut) - Date.parse(a.date_debut))
);

async function charger(l: LigneBon) {
    charge.value = false;
    deplacements.value = [];
    if (l.bc.solde && l.surconsommation) {
        regul.value = {
            cible: '',
            debut: premierDuMoisSuivant(),
            commentaire: `Régularisation du bon de commande ${l.bc.intitule} qui était en surconsommation`
        };
        cibles.value = null;
        erreurCibles.value = false;
        try {
            // Tous les bons de commande actifs non soldés (quel que soit le titulaire)
            cibles.value = ciblesRegularisation(await apiDeplacements.suiviBons(), l.bc.id);
            if (cibles.value.length === 1) regul.value.cible = String(cibles.value[0]?.id);
        } catch {
            erreurCibles.value = true;
        }
    }
    try {
        deplacements.value = await apiDeplacements.tous(l.bc.id);
    } catch (e) {
        console.error('Erreur chargement déplacements BDC:', e);
    }
    charge.value = true;
}

watch(
    () => props.ligne,
    l => {
        if (l) void charger(l);
    },
    { immediate: true }
);

const libelleCible = (b: BonCommandeSuivi) =>
    `${b.intitule} (${(b.uo_commandees || 0) - (b.uo_consommees || 0)} UO disponibles)`;

async function creerRegularisation() {
    const source = bon.value;
    if (!source) return;
    const cible = cibles.value?.find(b => b.id === Number(regul.value.cible));
    if (!cible) {
        emit('message', 'Veuillez sélectionner un bon de commande cible.');
        return;
    }
    if (!regul.value.debut) {
        emit('message', 'Veuillez renseigner une date de début.');
        return;
    }
    const commentaire = regul.value.commentaire.trim();
    const nbUo = uoEnTrop.value;
    const question =
        `Créer une ligne de régularisation technique de ${nbUo} UO sur le bon de commande :\n\n${libelleCible(cible)}\n\n` +
        `Date de début : ${regul.value.debut}\nCommentaire : ${commentaire}\n\nConfirmer ?`;
    if (!(await confirmer(question, 'Confirmer'))) return;
    try {
        const r = await apiDeplacements.regularisationTechnique({
            source_bdc_id: source.id,
            cible_bdc_id: cible.id,
            nb_uo: nbUo,
            date_debut: regul.value.debut,
            commentaire: commentaire || null
        });
        emit(
            'regularise',
            `✅ Ligne de régularisation créée avec succès !\n\nBDC source : ${r.source_intitule}\nBDC cible : ${r.cible_intitule}\n` +
                `UO régularisées : ${r.nb_uo}\nPériode : ${r.date_debut} → ${r.date_fin}`
        );
    } catch (e) {
        // Réponse en erreur du serveur, ou serveur injoignable
        emit(
            'message',
            e instanceof ErreurApi
                ? `Erreur : ${e.message}`
                : `Erreur réseau : ${e instanceof Error ? e.message : String(e)}`
        );
    }
}
</script>

<template>
    <AppModal
        id="bdcDeplacementsModal"
        :opened="!!ligne"
        title="📋 Déplacements du bon de commande"
        class="dep-bdc"
        @close="emit('fermer')"
    >
        <p v-if="bon" id="bdcDeplacementsModalTitle" class="dep-bdc__sous-titre">
            {{ bon.intitule }} - {{ bon.titulaire || 'N/A' }}
        </p>

        <div v-if="aRegulariser" id="bdcRegularisationSection" class="dep-bdc__regul">
            <div class="dep-bdc__regul-entete">
                <span class="dep-bdc__regul-icone" aria-hidden="true">⚠️</span>
                <div>
                    <strong class="dep-bdc__regul-titre">Ce bon de commande est SOLDÉ et en SURCONSOMMATION</strong>
                    <div class="dep-bdc__regul-aide">
                        Merci de régulariser en reportant la surconsommation de
                        <strong id="bdcUoEnTrop">{{ uoEnTrop }}</strong> UO sur un autre bon de commande.
                    </div>
                </div>
            </div>

            <div class="dep-bdc__regul-formulaire">
                <div class="dep-bdc__regul-intitule">Créer une ligne de déplacement technique de régularisation</div>
                <div class="dep-bdc__regul-grille">
                    <div>
                        <label for="bdcCibleRegularisation">Bon de commande cible *</label>
                        <select id="bdcCibleRegularisation" v-model="regul.cible">
                            <option v-if="erreurCibles" value="">-- Erreur de chargement --</option>
                            <option v-else-if="cibles === null" value="">-- Chargement... --</option>
                            <option v-else-if="!cibles.length" value="">-- Aucun BDC actif disponible --</option>
                            <template v-else>
                                <option value="">-- Sélectionner un BDC --</option>
                                <option v-for="b in cibles" :key="b.id" :value="String(b.id)">
                                    {{ libelleCible(b) }}
                                </option>
                            </template>
                        </select>
                    </div>
                    <div>
                        <label for="bdcRegulDateDebut">Date de début *</label>
                        <input id="bdcRegulDateDebut" v-model="regul.debut" type="date" />
                    </div>
                </div>
                <div class="dep-bdc__regul-commentaire">
                    <label for="bdcRegulCommentaire">Commentaire</label>
                    <input
                        id="bdcRegulCommentaire"
                        v-model="regul.commentaire"
                        type="text"
                        placeholder="Régularisation du bon de commande ... qui était en surconsommation"
                    />
                </div>
                <div class="dep-bdc__regul-actions">
                    <div class="dep-bdc__regul-uo">
                        UO à régulariser : <span id="bdcRegulUo">{{ uoEnTrop }}</span>
                    </div>
                    <button type="button" class="dep-bdc__regul-creer" @click="creerRegularisation">
                        ✅ Créer la ligne de régularisation
                    </button>
                </div>
            </div>
        </div>

        <div class="dep-bdc__tableau">
            <table>
                <thead id="bdcDeplacementsHead">
                    <tr>
                        <th>Utilisateur</th>
                        <th>SAMU</th>
                        <th>Ville</th>
                        <th>Date début</th>
                        <th>Date fin</th>
                        <th>Nb UO</th>
                    </tr>
                </thead>
                <tbody id="bdcDeplacementsBody">
                    <tr v-if="!charge">
                        <td colspan="6" class="dep-bdc__vide">Chargement...</td>
                    </tr>
                    <tr v-else-if="!lignes.length">
                        <td colspan="6" class="dep-bdc__vide">Aucun déplacement</td>
                    </tr>
                    <tr
                        v-for="d in lignes"
                        :key="d.id"
                        :class="{ 'dep-bdc__regularisation': !!d.regularisation_source_bdc_id }"
                    >
                        <td>
                            {{ d.user_prenom || '' }} {{ d.user_nom || ''
                            }}<span v-if="d.regularisation_source_bdc_id" class="dep-bdc__etiquette"
                                >Régularisation</span
                            >
                        </td>
                        <td>{{ d.samu || '-' }}</td>
                        <td>{{ d.ville || '-' }}</td>
                        <td>{{ dateFr(d.date_debut) }}</td>
                        <td>{{ dateFr(d.date_fin) }}</td>
                        <td class="dep-bdc__uo">{{ d.nb_uo }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <template #footer>
            <button type="button" class="dep-bdc__fermer" @click="emit('fermer')">Fermer</button>
        </template>
    </AppModal>
    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
</template>

<style>
.gp-modale.dep-bdc .gp-modale__boite {
    width: min(900px, 100%);
}
.dep-bdc__sous-titre {
    font-size: 16px;
    color: #3498db;
    margin: 4px 0 15px;
    padding-bottom: 12px;
    border-bottom: 3px solid #3498db;
}
.dep-bdc__regul {
    background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
    padding: 15px;
    border-radius: 10px;
    margin-bottom: 20px;
    border: 2px solid #e74c3c;
}
.dep-bdc__regul-entete {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
}
.dep-bdc__regul-icone {
    font-size: 24px;
}
.dep-bdc__regul-titre {
    color: #c62828;
    font-size: 14px;
}
.dep-bdc__regul-aide {
    font-size: 12px;
    color: #555;
    margin-top: 3px;
}
.dep-bdc__regul-formulaire {
    background: white;
    padding: 15px;
    border-radius: 8px;
    border: 1px solid #ffcdd2;
}
.dep-bdc__regul-intitule {
    font-size: 13px;
    font-weight: bold;
    color: #b71c1c;
    margin-bottom: 12px;
}
.dep-bdc__regul-grille {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
}
.dep-bdc__regul label {
    font-size: 11px;
    font-weight: bold;
    color: #555;
    display: block;
    margin-bottom: 4px;
}
.dep-bdc__regul select,
.dep-bdc__regul input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    box-sizing: border-box;
}
.dep-bdc__regul-commentaire {
    margin-bottom: 12px;
}
.dep-bdc__regul-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.dep-bdc__regul-uo {
    background: #ffebee;
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 12px;
    color: #c62828;
    font-weight: bold;
}
.dep-bdc__regul-creer {
    background: #c62828;
    color: white;
    border: none;
    padding: 9px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    font-size: 13px;
}
.dep-bdc__tableau {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 8px;
}
.dep-bdc__tableau table {
    width: 100%;
    border-collapse: collapse;
}
.dep-bdc__tableau thead {
    position: sticky;
    top: 0;
    background: #f8f9fa;
}
.dep-bdc__vide {
    text-align: center;
    color: #999;
    padding: 20px;
}
.dep-bdc__tableau tr.dep-bdc__regularisation {
    background: #e8f5e9;
    font-style: italic;
}
.dep-bdc__etiquette {
    background: #27ae60;
    color: white;
    border-radius: 8px;
    padding: 1px 6px;
    font-size: 10px;
    margin-left: 4px;
}
.dep-bdc__uo {
    text-align: center;
    font-weight: bold;
}
.dep-bdc__fermer {
    padding: 12px 25px;
    background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
}
</style>
