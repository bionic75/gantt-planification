<!-- Suivi des connexions utilisateurs : nombre de connexions par utilisateur sur un mois ou un intervalle -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiReporting } from '@/api/reporting';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppMultiselect from '@/composants/AppMultiselect.vue';
import AppRadio from '@/composants/AppRadio.vue';
import BadgeProfil from './BadgeProfil.vue';
import {
    ANNEES,
    basculerTri,
    bornesDuMois,
    dateConnexion,
    libelleProfil,
    MOIS,
    regrouperConnexions,
    TRI_CONNEXIONS,
    trierConnexions,
    type CleTriConnexions,
    type UtilisateurConnexions
} from './calculs';
import { useReportingStore } from './magasin';

const reporting = useReportingStore();
const maintenant = new Date();
const mode = ref<'month' | 'free'>('month');
const mois = ref(String(maintenant.getMonth() + 1).padStart(2, '0'));
const annee = ref(String(maintenant.getFullYear()));
const debut = ref('');
const fin = ref('');
const comptesChoisis = ref<string[]>([]);
const message = ref('');
const utilisateurs = ref<UtilisateurConnexions[] | null>(null);
/** Tri conservé d'une génération à l'autre */
const tri = ref(TRI_CONNEXIONS);

const optionsComptes = computed(() =>
    reporting.comptesConnexions.map(c => ({ value: c.id, text: `${c.prenom} ${c.nom} (${c.username})` }))
);
watch(
    () => reporting.comptesConnexions,
    comptes => (comptesChoisis.value = comptes.map(c => String(c.id))),
    { immediate: true }
);

const total = computed(() => (utilisateurs.value ?? []).reduce((s, u) => s + u.total, 0));
const lignes = computed(() => (utilisateurs.value ? trierConnexions(utilisateurs.value, tri.value) : []));

const COLONNES: Array<{ cle: CleTriConnexions; label: string }> = [
    { cle: 'nom', label: 'Utilisateur' },
    { cle: 'login', label: 'Login' },
    { cle: 'profil', label: 'Profil' },
    { cle: 'total', label: 'Nb connexions' },
    { cle: 'last', label: 'Dernière connexion' }
];
const sensAffiche = (cle: CleTriConnexions) => (tri.value.cle === cle ? (tri.value.sens > 0 ? 'asc' : 'desc') : '');
const ariaSort = (cle: CleTriConnexions) =>
    tri.value.cle === cle ? (tri.value.sens > 0 ? 'ascending' : 'descending') : 'none';

async function generer() {
    message.value = '';
    let bornes: { dateStart: string; dateEnd: string };
    if (mode.value === 'month') {
        if (!mois.value || !annee.value) return;
        bornes = bornesDuMois(mois.value, annee.value);
    } else {
        if (!debut.value || !fin.value) {
            message.value = 'Veuillez renseigner les deux dates.';
            return;
        }
        bornes = { dateStart: debut.value, dateEnd: fin.value };
    }
    try {
        const { rows } = await apiReporting.connexions(bornes.dateStart, bornes.dateEnd, comptesChoisis.value);
        utilisateurs.value = regrouperConnexions(rows ?? []);
    } catch (e) {
        // Comme l'ancien écran : rapport précédent conservé, erreur dans la console seulement
        console.error('Erreur reporting connexions', e);
    }
}
</script>

<template>
    <div class="rp-modes" role="radiogroup" aria-label="Période">
        <AppRadio
            id="connexionsModeMonth"
            v-model="mode"
            name="connexionsPeriodMode"
            value="month"
            label="Période mensuelle"
        />
        <AppRadio
            id="connexionsModeInterval"
            v-model="mode"
            name="connexionsPeriodMode"
            value="free"
            label="Intervalle libre"
        />
    </div>

    <div class="rp-filtres">
        <div v-if="mode === 'month'" id="connexionsMonthBlock" role="group" aria-labelledby="connexionsMoisLibelle">
            <span id="connexionsMoisLibelle" class="rp-champ__libelle">Mois / Année</span>
            <div class="rp-ligne">
                <select id="connexionsMonth" v-model="mois" class="rp-saisie" aria-label="Mois">
                    <option v-for="(nom, i) in MOIS" :key="i" :value="String(i + 1).padStart(2, '0')">{{ nom }}</option>
                </select>
                <select id="connexionsYear" v-model="annee" class="rp-saisie" aria-label="Année">
                    <option v-for="a in ANNEES" :key="a" :value="String(a)">{{ a }}</option>
                </select>
            </div>
        </div>
        <div v-else id="connexionsIntervalBlock" role="group" aria-labelledby="connexionsIntervalleLibelle">
            <span id="connexionsIntervalleLibelle" class="rp-champ__libelle">Intervalle libre</span>
            <div class="rp-ligne rp-ligne--intervalle">
                <input id="connexionsStart" v-model="debut" type="date" class="rp-saisie" aria-label="Date de début" />
                <span class="rp-fleche" aria-hidden="true">→</span>
                <input id="connexionsEnd" v-model="fin" type="date" class="rp-saisie" aria-label="Date de fin" />
            </div>
        </div>
        <AppMultiselect
            id="connexionsUserSelect"
            v-model="comptesChoisis"
            class="rp-comptes"
            label="Utilisateurs"
            :options="optionsComptes"
        />
        <div class="rp-filtres__action">
            <AppButton size="lg" couleur="#2e7d32" label="📊 Générer" @click="generer" />
        </div>
    </div>
    <AppAlert v-if="message" type="error" small :description="message" />

    <div v-if="utilisateurs" id="connexionsReportResult">
        <p class="rp-total">
            Total : <span id="connexionsTotalCount">{{ total }}</span> connexion(s) sur la période
        </p>
        <div class="rp-conteneur">
            <table class="rp-tableau rp-connexions">
                <thead>
                    <tr>
                        <th
                            v-for="c in COLONNES"
                            :key="c.cle"
                            :data-ck="c.cle"
                            :data-dir="sensAffiche(c.cle)"
                            :aria-sort="ariaSort(c.cle)"
                            title="Trier"
                            tabindex="0"
                            @click="tri = basculerTri(tri, c.cle)"
                            @keydown.enter.prevent="tri = basculerTri(tri, c.cle)"
                            @keydown.space.prevent="tri = basculerTri(tri, c.cle)"
                        >
                            {{ c.label }}
                        </th>
                    </tr>
                </thead>
                <tbody id="connexionsReportBody">
                    <tr v-if="!lignes.length">
                        <td colspan="5" class="rp-connexions__vide">Aucune connexion sur cette période</td>
                    </tr>
                    <tr v-for="u in lignes" :key="u.login.toLowerCase()">
                        <td>{{ u.nom }}</td>
                        <td>{{ u.login }}</td>
                        <td>
                            <span v-for="p in u.profils" :key="p.profil" class="rp-profil">
                                <BadgeProfil :profil="p.profil">{{ libelleProfil(p.profil) }}</BadgeProfil>
                                <span v-if="u.profils.length > 1" class="rp-profil__nb">×{{ p.nb }}</span>
                            </span>
                        </td>
                        <td class="rp-connexions__total">{{ u.total }}</td>
                        <td>{{ dateConnexion(u.derniere) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
.rp-modes {
    display: flex;
    gap: 20px;
    align-items: center;
    margin-bottom: 14px;
    --gp-radio-couleur: #2e7d32;
}
.rp-filtres {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 15px;
}
.rp-ligne {
    display: flex;
    gap: 5px;
}
.rp-ligne--intervalle {
    gap: 8px;
    align-items: center;
}
.rp-saisie {
    width: auto;
    padding: 7px;
    border: 1px solid #a5d6a7;
    border-radius: 4px;
}
.rp-fleche {
    color: #555;
    font-size: 13px;
}
.rp-comptes :deep(select) {
    border: 1px solid #a5d6a7;
    padding: 4px;
}
.rp-filtres__action {
    padding-top: 22px;
}
.rp-total {
    font-size: 13px;
    color: #2e7d32;
    font-weight: bold;
    margin-bottom: 10px;
}
.rp-conteneur {
    overflow-x: auto;
    margin-top: 20px;
    border-radius: 10px;
}
.rp-profil {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-right: 6px;
}
.rp-profil__nb {
    font-size: 11px;
    color: #777;
}
</style>
