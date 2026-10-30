<!-- Thèmes d'affichage : mode (aucun, automatique, forcé), périodes par thème, aperçu, intensité du décor ; décor
     appliqué par l'ancien code (public/js/themes.js) -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiThemes } from '@/api/parametrages';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { themesAncienCode } from '@/liaison';
import { champsThemes, configThemes, etatTheme, THEMES, type ChampsThemes } from './calculs';

const champs = ref<ChampsThemes | null>(null);
const etat = ref('');
const message = ref<{ ok: boolean; texte: string } | null>(null);

const catalogue = computed(() => themesAncienCode()?.catalogue() ?? {});
const libelle = (id: string) => catalogue.value[id]?.label ?? id;

function majEtat() {
    etat.value = etatTheme(themesAncienCode()?.compute() ?? null, libelle);
}

/** Configuration relue à chaque ouverture de la sous-section, et appliquée au décor (comme l'ancien écran) */
async function charger() {
    message.value = null;
    try {
        const c = await apiThemes.lire();
        themesAncienCode()?.appliquerConfig(c);
        champs.value = champsThemes(c);
        majEtat();
    } catch {
        /* configuration inchangée */
    }
}

function apercu(id: string) {
    if (champs.value) themesAncienCode()?.apercu(id, champs.value.intensite);
}

async function enregistrer() {
    if (!champs.value) return;
    try {
        const c = await apiThemes.enregistrer(configThemes(champs.value));
        themesAncienCode()?.appliquerConfig(c);
        majEtat();
        message.value = { ok: true, texte: 'Enregistré.' };
    } catch (e) {
        message.value = { ok: false, texte: `Erreur : ${(e as Error).message}` };
    }
}
</script>

<template>
    <AppSousSectionAdmin
        titre="Thèmes d'affichage (Halloween, Noël, Saint-Valentin, Saint-Patrick, Pâques, Vacances)"
        id-corps="subTheme"
        @ouverture="charger"
    >
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="13.5" cy="6.5" r=".6" />
                <circle cx="17.5" cy="10.5" r=".6" />
                <circle cx="8.5" cy="7.5" r=".6" />
                <circle cx="6.5" cy="12.5" r=".6" />
                <path
                    d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"
                />
            </svg>
        </template>
        <div id="themeAdminStatus" class="themes__etat">{{ etat }}</div>
        <template v-if="champs">
            <fieldset class="themes__bloc">
                <legend class="themes__titre">Thème actif pour tous les utilisateurs</legend>
                <label class="themes__mode">
                    <input v-model="champs.mode" type="radio" name="themeMode" value="off" /> Aucun thème
                </label>
                <label class="themes__mode">
                    <input v-model="champs.mode" type="radio" name="themeMode" value="auto" /> Automatique selon les
                    dates ci-dessous (un seul thème à la fois)
                </label>
                <label class="themes__mode themes__mode--dernier">
                    <input v-model="champs.mode" type="radio" name="themeMode" value="forced" /> Forcer le thème :
                    <select id="themeForced" v-model="champs.force" class="themes__liste" aria-label="Thème forcé">
                        <option v-for="id in THEMES" :key="id" :value="id">{{ libelle(id) }}</option>
                    </select>
                </label>
            </fieldset>
            <div class="themes__bloc themes__bloc--defilant">
                <div class="themes__titre">Périodes d'activation automatique</div>
                <table class="themes__periodes">
                    <thead>
                        <tr>
                            <th class="themes__gauche">Thème</th>
                            <th>Auto</th>
                            <th class="themes__gauche">Période</th>
                            <th><span class="themes__masque">Aperçu</span></th>
                        </tr>
                    </thead>
                    <tbody id="themeAdminRows">
                        <tr v-for="id in THEMES" :key="id" class="themes__ligne">
                            <td class="themes__nom">
                                <!-- Vignette du thème : tracés constants de l'ancien code (themes.js) -->
                                <!-- eslint-disable vue/no-v-html -->
                                <svg
                                    viewBox="0 0 32 32"
                                    aria-hidden="true"
                                    class="themes__vignette"
                                    v-html="catalogue[id]?.badge ?? ''"
                                />
                                <!-- eslint-enable vue/no-v-html -->
                                <strong>{{ libelle(id) }}</strong>
                            </td>
                            <td class="themes__centre">
                                <input
                                    :id="`thAuto_${id}`"
                                    v-model="champs.themes[id]!.auto"
                                    type="checkbox"
                                    class="themes__case"
                                    :aria-label="`Activation automatique : ${libelle(id)}`"
                                />
                            </td>
                            <td>
                                <template v-if="id === 'paques'">
                                    Pâques −<input
                                        id="thEasterBefore"
                                        v-model.number="champs.themes[id]!.avant"
                                        type="number"
                                        min="0"
                                        max="30"
                                        class="themes__jours"
                                        aria-label="Jours avant Pâques"
                                    />
                                    j / +<input
                                        id="thEasterAfter"
                                        v-model.number="champs.themes[id]!.apres"
                                        type="number"
                                        min="0"
                                        max="30"
                                        class="themes__jours"
                                        aria-label="Jours après Pâques"
                                    />
                                    j
                                </template>
                                <template v-else>
                                    du
                                    <input
                                        :id="`thStart_${id}`"
                                        v-model="champs.themes[id]!.debut"
                                        type="date"
                                        class="themes__date"
                                        :aria-label="`Début : ${libelle(id)}`"
                                    />
                                    au
                                    <input
                                        :id="`thEnd_${id}`"
                                        v-model="champs.themes[id]!.fin"
                                        type="date"
                                        class="themes__date"
                                        :aria-label="`Fin : ${libelle(id)}`"
                                    />
                                </template>
                            </td>
                            <td>
                                <button type="button" class="themes__apercu" @click="apercu(id)">Aperçu</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="themes__bloc">
                <label for="themeIntensity" class="themes__titre">Intensité du décor</label>
                <select id="themeIntensity" v-model="champs.intensite" class="themes__liste">
                    <option value="sobre">Sobre : couleurs de l'en-tête + petit ornement animé (défaut)</option>
                    <option value="decore">Décoré : + frise sous la barre d'onglets</option>
                    <option value="anime">Animé : + légères particules qui défilent en fond</option>
                </select>
                <div class="themes__note">
                    Les animations sont désactivées automatiquement pour les utilisateurs dont le système demande de
                    réduire les mouvements.
                </div>
            </div>
            <button type="button" class="export-btn themes__enregistrer" @click="enregistrer">Enregistrer</button>
            <span
                id="themeAdminMsg"
                role="status"
                class="themes__message"
                :class="message && (message.ok ? 'themes__message--ok' : 'themes__message--erreur')"
            >
                {{ message?.texte }}
            </span>
            <div class="themes__note themes__note--bas">
                Chaque utilisateur peut désactiver le thème pour lui-même (bouton rond en haut de l'écran ou « Mon
                profil »).
            </div>
        </template>
    </AppSousSectionAdmin>
</template>

<style scoped>
.themes__etat {
    font-size: 12px;
    color: #555;
    margin-bottom: 12px;
}
.themes__bloc {
    border: 1px solid #c5cae9;
    border-radius: 6px;
    padding: 12px 14px;
    margin: 0 0 12px;
    min-width: 0;
}
.themes__bloc--defilant {
    overflow-x: auto;
}
.themes__titre {
    display: block;
    font-weight: bold;
    color: #283593;
    font-size: 13px;
    margin-bottom: 8px;
    padding: 0;
}
.themes__mode {
    display: block;
    font-size: 13px;
    margin-bottom: 6px;
    font-weight: normal;
    color: inherit;
}
.themes__mode--dernier {
    margin-bottom: 0;
}
.themes__mode input {
    width: auto;
    display: inline-block;
    margin-right: 6px;
}
.themes__liste {
    width: auto;
    display: inline-block;
    padding: 3px 6px;
}
.themes__periodes {
    font-size: 13px;
    border-collapse: collapse;
    width: 100%;
}
.themes__periodes thead tr {
    background: #e8eaf6;
}
.themes__periodes th {
    padding: 5px 8px;
    color: inherit;
}
.themes__gauche {
    text-align: left;
}
.themes__ligne {
    border-top: 1px solid #e0e0e0;
}
.themes__ligne td {
    padding: 6px 8px;
}
.themes__nom {
    white-space: nowrap;
}
.themes__vignette {
    display: inline-block;
    width: 22px;
    height: 22px;
    vertical-align: middle;
    margin-right: 6px;
}
.themes__centre {
    text-align: center;
}
.themes__case,
.themes__date {
    width: auto;
    display: inline-block;
}
.themes__jours {
    width: 60px;
    display: inline-block;
}
.themes__apercu,
.themes__apercu:hover {
    background: #6c757d;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
}
.themes__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.themes__note {
    font-size: 11px;
    color: #777;
    margin-top: 6px;
}
.themes__note--bas {
    margin-top: 10px;
}
.themes__enregistrer,
.themes__enregistrer:hover {
    background: #3949ab;
}
.themes__message {
    margin-left: 10px;
    font-size: 12px;
}
.themes__message--ok {
    color: #2e7d32;
}
.themes__message--erreur {
    color: #c62828;
}
</style>
