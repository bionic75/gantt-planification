<!-- Administration › Configuration de l'accès aux onglets (sous-îlot) : grille profils × onglets, enregistrement,
     valeurs par défaut (affichées, à enregistrer) ; relue à chaque ouverture de la section -->
<script setup lang="ts">
import { ref } from 'vue';
import { apiOnglets, type ConfigOnglets } from '@/api/acces';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { surReouverture } from '@/ilots/activation';
import { emettre } from '@/liaison';
import { grille, ONGLETS, PROFILS, verrouillee } from './calculs';

const ouverte = ref(false);
const cases = ref<ConfigOnglets | null>(null);
const defauts = ref<ConfigOnglets | null>(null);
const message = ref<{ type: 'ok' | 'attention' | 'erreur'; texte: string } | null>(null);

async function charger() {
    message.value = null;
    try {
        const d = await apiOnglets.lire();
        cases.value = grille(d.config);
        defauts.value = d.defaults;
    } catch {
        /* grille inchangée */
    }
}
surReouverture(() => {
    if (ouverte.value) void charger();
});

function retablir() {
    if (!defauts.value) return;
    cases.value = grille(defauts.value);
    message.value = { type: 'attention', texte: 'Valeurs par défaut rétablies : pensez à enregistrer.' };
}

async function enregistrer() {
    if (!cases.value) return;
    try {
        const { config } = await apiOnglets.enregistrer(cases.value);
        cases.value = grille(config);
        message.value = {
            type: 'ok',
            texte: 'Enregistré. Les utilisateurs verront les changements à leur prochaine connexion ou changement de profil.'
        };
        emettre('onglets-modifies', { config });
    } catch (e) {
        message.value = { type: 'erreur', texte: (e as Error).message };
    }
}
</script>

<template>
    <AppSectionAdmin
        v-model:ouverte="ouverte"
        titre="Configuration de l'accès aux onglets"
        id-corps="tabAccessSection"
        teinte="indigo-fonce"
        class="onglets-section"
        @ouverture="charger"
    >
        <p class="onglets__intro">
            Cochez les onglets visibles pour chaque profil. Les valeurs par défaut reprennent le fonctionnement
            d'origine de la plateforme.
        </p>
        <div class="onglets__cadre">
            <table id="tabAccessTable" class="onglets__grille">
                <thead v-if="cases">
                    <tr>
                        <th class="onglets__onglet">Onglet</th>
                        <th v-for="[p, libelle] in PROFILS" :key="p" class="onglets__profil">{{ libelle }}</th>
                    </tr>
                </thead>
                <tbody v-if="cases">
                    <tr v-for="[t, libelleOnglet] in ONGLETS" :key="t">
                        <td class="onglets__nom">{{ libelleOnglet }}</td>
                        <td v-for="[p, libelleProfil] in PROFILS" :key="p" class="onglets__case">
                            <input
                                v-model="cases[p]![t]"
                                type="checkbox"
                                :data-ta="`${p}|${t}`"
                                :disabled="verrouillee(p, t)"
                                :title="
                                    verrouillee(p, t)
                                        ? 'L\'administrateur garde toujours l\'accès à l\'Administration'
                                        : undefined
                                "
                                :aria-label="`${libelleOnglet} — ${libelleProfil}`"
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="onglets__note">
            L'administrateur conserve toujours l'accès à l'Administration. L'onglet CRA reste réservé aux experts
            déclarés volontaires aux astreintes. L'onglet « Astreintes » commande aussi le bouton de gestion des
            astreintes/HNO.
        </div>
        <button type="button" class="export-btn onglets__enregistrer" @click="enregistrer">Enregistrer</button>
        <button type="button" class="export-btn onglets__defaut" @click="retablir">
            Rétablir les valeurs par défaut
        </button>
        <span
            id="tabAccessMsg"
            role="status"
            class="onglets__message"
            :class="message && `onglets__message--${message.type}`"
        >
            {{ message?.texte }}
        </span>
    </AppSectionAdmin>
</template>

<style scoped>
.onglets-section {
    margin-top: 20px;
}
.onglets__intro {
    color: #555;
    font-size: 13px;
    margin-bottom: 14px;
}
.onglets__cadre {
    border: 1px solid #c5cae9;
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 12px;
    overflow-x: auto;
    background: #fff;
}
.onglets__grille {
    font-size: 13px;
    border-collapse: collapse;
    width: 100%;
    max-width: 720px;
}
.onglets__grille thead tr {
    background: #e8eaf6;
}
.onglets__grille th {
    padding: 6px 10px;
    color: inherit;
}
.onglets__onglet {
    text-align: left;
}
.onglets__profil,
.onglets__case {
    text-align: center;
}
.onglets__nom {
    padding: 6px 10px;
    font-weight: 600;
}
.onglets__case {
    padding: 6px 10px;
}
.onglets__case input {
    width: auto;
    display: inline-block;
    margin: 0;
    cursor: pointer;
}
.onglets__case input:disabled {
    cursor: default;
}
.onglets__note {
    font-size: 11px;
    color: #777;
    margin-bottom: 10px;
}
.onglets__enregistrer,
.onglets__enregistrer:hover {
    background: #3949ab;
}
.onglets__defaut,
.onglets__defaut:hover {
    background: #78909c;
    margin-left: 8px;
}
.onglets__message {
    margin-left: 10px;
    font-size: 12px;
}
.onglets__message--ok {
    color: #2e7d32;
}
.onglets__message--attention {
    color: #e65100;
}
.onglets__message--erreur {
    color: #c62828;
}
</style>
