<!-- Rubrique HNO : disponibilités d'un expert volontaire pour un mois (calendrier cliquable : vert disponible,
     rouge indisponible), compteurs et alertes des règles FPH ; un jour qui dépasse une règle est refusé ; RAZ et
     enregistrement -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiAstreintesHno } from '@/api/astreintes';
import type { Ressource } from '@/api/ressources';
import AppAlert from '@/composants/AppAlert.vue';
import { useConfirmation } from '@/composants/confirmation';
import {
    alertes,
    compteurs,
    moisProposes,
    niveauHeures,
    niveauJour,
    nomExpert,
    refusDisponibilite,
    ressourcesActives,
    semainesDuMois
} from './hno';

const props = defineProps<{ ressources: Ressource[] }>();
const confirmer = useConfirmation();

const mois = moisProposes();
const expert = ref('');
/** Mois suivant proposé par défaut */
const moisChoisi = ref(mois[1]!.valeur);
/** Jours disponibles (« AAAA-MM-JJ ») */
const disponibles = ref<string[]>([]);
const message = ref<{ type: 'error' | 'success'; texte: string } | null>(null);

const volontaires = computed(() => ressourcesActives(props.ressources, true));
const annee = computed(() => Number(moisChoisi.value.split('-')[0]));
const numeroMois = computed(() => Number(moisChoisi.value.split('-')[1]));
const titreMois = computed(() =>
    new Date(annee.value, numeroMois.value - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
);
const semaines = computed(() => semainesDuMois(annee.value, numeroMois.value));
const c = computed(() => compteurs(disponibles.value, annee.value, numeroMois.value));
const nbJours = computed(() => new Date(annee.value, numeroMois.value, 0).getDate());
const listeAlertes = computed(() => alertes(c.value));

/** Disponibilités enregistrées, relues à chaque choix d'expert ou de mois */
watch([expert, moisChoisi], async () => {
    disponibles.value = [];
    message.value = null;
    if (!expert.value || !moisChoisi.value) return;
    try {
        disponibles.value = (await apiAstreintesHno.disponibilites(Number(expert.value), moisChoisi.value)).map(
            d => d.date
        );
    } catch (e) {
        console.error('Erreur chargement dispos:', e);
    }
});

function basculer(date: string) {
    message.value = null;
    if (disponibles.value.includes(date)) {
        disponibles.value = disponibles.value.filter(d => d !== date);
        return;
    }
    const refus = refusDisponibilite(disponibles.value, date, annee.value, numeroMois.value);
    if (refus.length)
        message.value = {
            type: 'error',
            texte: `❌ Impossible de se déclarer disponible ce jour :\n\n${refus.join('\n\n')}`
        };
    else disponibles.value = [...disponibles.value, date];
}

async function raz() {
    message.value = null;
    if (!expert.value || !moisChoisi.value) {
        message.value = { type: 'error', texte: 'Veuillez sélectionner un expert et un mois' };
        return;
    }
    const r = props.ressources.find(x => x.id === Number(expert.value));
    const ok = await confirmer(
        `Voulez-vous réinitialiser toutes les disponibilités de ${r ? nomExpert(r) : 'cet expert'} pour ${titreMois.value} ?\n\nTous les jours repasseront en rouge (indisponible).`,
        'Confirmer',
        { danger: false }
    );
    if (ok) disponibles.value = [];
}

async function valider() {
    message.value = null;
    if (!expert.value || !moisChoisi.value) {
        message.value = { type: 'error', texte: 'Veuillez sélectionner un expert et un mois' };
        return;
    }
    try {
        await apiAstreintesHno.enregistrerDisponibilites(Number(expert.value), moisChoisi.value, disponibles.value);
        message.value = { type: 'success', texte: '✅ Disponibilités enregistrées avec succès !' };
    } catch (e) {
        message.value = { type: 'error', texte: `Erreur: ${(e as Error).message}` };
    }
}
</script>

<template>
    <p class="dispos__aide">
        Sélectionnez un expert et un mois, puis cliquez sur les créneaux pour basculer entre
        <span class="dispos__vert">disponible (vert)</span> et <span class="dispos__rouge">indisponible (rouge)</span>.
    </p>
    <div class="dispos__choix">
        <div>
            <label for="astreinteDispoExpert" class="dispos__libelle">Expert volontaire *</label>
            <select id="astreinteDispoExpert" v-model="expert" class="dispos__liste">
                <option value="">-- Sélectionner un expert --</option>
                <option v-for="r in volontaires" :key="r.id" :value="String(r.id)">
                    {{ r.nom.toUpperCase() }} {{ r.prenom }} ({{ r.trigramme }})
                </option>
            </select>
        </div>
        <div>
            <label for="astreinteDispoMois" class="dispos__libelle">Mois</label>
            <select id="astreinteDispoMois" v-model="moisChoisi" class="dispos__liste">
                <option v-for="m in mois" :key="m.valeur" :value="m.valeur">{{ m.libelle }}</option>
            </select>
        </div>
        <button type="button" class="dispos__valider" @click="valider">✅ Valider</button>
        <button type="button" class="dispos__raz" @click="raz">🔄 RAZ</button>
    </div>
    <div class="dispos__legende">
        <span class="dispos__pastille dispos__pastille--dispo"></span> Disponible
        <span class="dispos__pastille dispos__pastille--indispo"></span> Indisponible
    </div>
    <AppAlert v-if="message" :type="message.type" class="dispos__message" :description="message.texte" />

    <div v-if="expert && moisChoisi" id="astreinteDispoCalendar">
        <div id="astreinteDispoCalendarContent">
            <h4 class="dispos__titre">📅 {{ titreMois }}</h4>
            <div class="dispos__compteurs">
                <div class="dispos__compteur" :class="`dispos__compteur--${niveauHeures(c.heures)}`">
                    <div class="dispos__compteur-libelle">Heures d'astreinte</div>
                    <div class="dispos__compteur-valeur">{{ c.heures }}h <small>/ 144h</small></div>
                </div>
                <div class="dispos__compteur" :class="`dispos__compteur--${niveauJour(c.samedis)}`">
                    <div class="dispos__compteur-libelle">Samedis</div>
                    <div class="dispos__compteur-valeur">{{ c.samedis }} <small>/ 1 max</small></div>
                </div>
                <div class="dispos__compteur" :class="`dispos__compteur--${niveauJour(c.dimanches)}`">
                    <div class="dispos__compteur-libelle">Dimanches</div>
                    <div class="dispos__compteur-valeur">{{ c.dimanches }} <small>/ 1 max</small></div>
                </div>
            </div>
            <table class="dispos__calendrier">
                <thead>
                    <tr>
                        <th v-for="j in ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']" :key="j">{{ j }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(s, i) in semaines" :key="i">
                        <template v-for="(j, k) in s" :key="k">
                            <td v-if="!j" class="dispos__hors"></td>
                            <td v-else class="dispos__case">
                                <div
                                    class="dispos__jour"
                                    :class="
                                        disponibles.includes(j.date) ? 'dispos__jour--dispo' : 'dispos__jour--indispo'
                                    "
                                    role="button"
                                    tabindex="0"
                                    :aria-pressed="disponibles.includes(j.date)"
                                    @click="basculer(j.date)"
                                    @keydown.enter="basculer(j.date)"
                                >
                                    <div class="dispos__numero">{{ j.jour }}</div>
                                    <div :key="String(disponibles.includes(j.date))" class="dispos__icone">
                                        {{ disponibles.includes(j.date) ? '✓' : '✗' }}
                                    </div>
                                </div>
                            </td>
                        </template>
                    </tr>
                </tbody>
            </table>
            <div class="dispos__resume">
                <strong>Résumé :</strong>
                <span :key="`${c.jours}|${c.heures}`" class="dispos__vert"
                    >{{ c.jours }} créneaux disponibles ({{ c.heures }}h)</span
                >
                /
                <span :key="nbJours - c.jours" class="dispos__rouge">{{ nbJours - c.jours }} indisponibilités</span>
            </div>
            <div v-if="listeAlertes.length" class="dispos__alertes">
                <strong>🚨 Alertes règles FPH (Décret n°2002-9) :</strong>
                <ul>
                    <li v-for="a in listeAlertes" :key="a">{{ a }}</li>
                </ul>
            </div>
        </div>
    </div>
    <div v-else id="astreinteDispoPlaceholder" class="dispos__invite">
        <p>👆 Sélectionnez un expert et un mois pour afficher le calendrier des disponibilités</p>
    </div>
</template>

<style scoped>
.dispos__aide {
    font-size: 13px;
    color: #666;
}
.dispos__vert {
    color: #27ae60;
    font-weight: bold;
}
.dispos__rouge {
    color: #e74c3c;
    font-weight: bold;
}
.dispos__choix {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-bottom: 15px;
}
.dispos__libelle {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
}
.dispos__liste {
    min-width: 220px;
}
.dispos__valider,
.dispos__valider:hover,
.dispos__raz,
.dispos__raz:hover {
    padding: 8px 25px;
    font-weight: bold;
}
.dispos__valider,
.dispos__valider:hover {
    background-color: #27ae60;
    color: white;
}
.dispos__raz,
.dispos__raz:hover {
    background-color: #e74c3c;
    color: white;
}
.dispos__legende {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 10px;
}
.dispos__pastille {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 3px;
}
.dispos__pastille--dispo {
    background: #27ae60;
}
.dispos__pastille--indispo {
    background: #e74c3c;
    margin-left: 10px;
}
.dispos__message {
    white-space: pre-line;
}
.dispos__titre {
    color: #e65100;
    margin-bottom: 10px;
    text-transform: capitalize;
}
.dispos__compteurs {
    display: flex;
    gap: 15px;
    margin-bottom: 15px;
    flex-wrap: wrap;
}
.dispos__compteur {
    background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%);
    border: 2px solid #666;
    border-radius: 8px;
    padding: 10px 15px;
    min-width: 100px;
    text-align: center;
    color: #666;
}
.dispos__compteur:first-child {
    min-width: 150px;
}
.dispos__compteur--ok {
    border-color: #27ae60;
    color: #27ae60;
}
.dispos__compteur--attention {
    border-color: #f39c12;
    color: #f39c12;
}
.dispos__compteur--alerte {
    border-color: #e74c3c;
    color: #e74c3c;
}
.dispos__compteur-libelle {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
}
.dispos__compteur-valeur {
    font-size: 24px;
    font-weight: bold;
}
.dispos__compteur-valeur small {
    font-size: 14px;
    font-weight: normal;
}
.dispos__calendrier {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}
.dispos__calendrier th {
    padding: 10px;
    background-color: #ff9800;
    color: white;
    text-align: center;
    font-size: 12px;
    cursor: default;
}
.dispos__calendrier th::after {
    content: none !important;
}
.dispos__hors {
    padding: 5px;
    background-color: #f5f5f5;
}
.dispos__case {
    padding: 3px;
    vertical-align: top;
}
.dispos__jour {
    color: white;
    cursor: pointer;
    text-align: center;
    padding: 12px 8px;
    border: 2px solid white;
    border-radius: 5px;
}
.dispos__jour--dispo {
    background-color: #27ae60;
}
.dispos__jour--indispo {
    background-color: #e74c3c;
}
.dispos__numero {
    font-weight: bold;
    font-size: 18px;
}
.dispos__icone {
    font-size: 22px;
}
.dispos__resume {
    margin-top: 15px;
    padding: 10px;
    background: #fff3e0;
    border-radius: 5px;
    font-size: 12px;
}
.dispos__resume .dispos__vert,
.dispos__resume .dispos__rouge {
    font-weight: normal;
}
.dispos__alertes {
    margin-top: 10px;
    padding: 10px;
    background: #ffebee;
    border: 1px solid #e74c3c;
    border-radius: 5px;
    font-size: 12px;
    color: #c62828;
}
.dispos__alertes ul {
    margin: 5px 0 0 15px;
    padding: 0;
}
.dispos__invite {
    color: #999;
    text-align: center;
    font-style: italic;
}
</style>
