<!-- Dates particulières (jours fériés…) : import d'un .ics avec apparence (libellé, couleurs), liste des fichiers,
     modification de l'apparence, suppression -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiDatesParticulieres, type ApparenceDates, type FichierDates } from '@/api/joursSpeciaux';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/liaison';
import FenetreApparence from './FenetreApparence.vue';
import { apparence, APPARENCE_PAR_DEFAUT, lireIcs } from './ics';

const confirmer = useConfirmation();
const fichiers = ref<FichierDates[]>([]);
const champ = ref<HTMLInputElement | null>(null);
const statut = ref<{ etat: 'erreur' | 'ok'; texte: string } | null>(null);
const erreur = ref('');
/** Import en cours de configuration : fichier choisi */
const aImporter = ref<File | null>(null);
const erreurImport = ref('');
/** Fichier dont l'apparence est modifiée */
const enModification = ref<FichierDates | null>(null);
const erreurModification = ref('');

async function charger() {
    try {
        fichiers.value = (await apiDatesParticulieres.liste()).files ?? [];
    } catch {
        /* liste inchangée */
    }
}
onMounted(charger);

/** Fichiers modifiés : liste relue, dates de la planification rechargées par l'ancien code */
async function apresModification() {
    await charger();
    emettre('dates-particulieres-modifiees');
}

function configurer() {
    const f = champ.value?.files?.[0];
    if (!f) {
        statut.value = { etat: 'erreur', texte: '❌ Veuillez sélectionner un fichier .ics' };
        return;
    }
    erreurImport.value = '';
    aImporter.value = f;
}

async function importer(a: ApparenceDates) {
    const f = aImporter.value;
    if (!f) return;
    erreurImport.value = '';
    try {
        const content = await f.text();
        const events = lireIcs(content);
        if (!events.length) {
            erreurImport.value = 'Aucun événement trouvé dans le fichier';
            return;
        }
        await apiDatesParticulieres.importer({ filename: f.name, content, events, config: a });
        statut.value = { etat: 'ok', texte: `✅ ${events.length} date(s) importée(s)` };
        if (champ.value) champ.value.value = '';
        aImporter.value = null;
        await apresModification();
    } catch (e) {
        erreurImport.value = `Erreur: ${(e as Error).message}`;
    }
}

function modifier(f: FichierDates) {
    erreurModification.value = '';
    enModification.value = f;
}

async function enregistrer(a: ApparenceDates) {
    const f = enModification.value;
    if (!f) return;
    try {
        await apiDatesParticulieres.modifier(f.id, a);
        enModification.value = null;
        await apresModification();
    } catch (e) {
        erreurModification.value = `Erreur: ${(e as Error).message}`;
    }
}

async function supprimer(f: FichierDates) {
    if (!(await confirmer('Voulez-vous vraiment supprimer ce fichier de dates particulières ?'))) return;
    erreur.value = '';
    try {
        await apiDatesParticulieres.supprimer(f.id);
        await apresModification();
    } catch {
        erreur.value = 'Erreur lors de la suppression';
    }
}
</script>

<template>
    <AppSousSectionAdmin
        titre="Injection de dates particulières (jours fériés, ...)"
        id-corps="specialSub2"
        encadre="orange"
    >
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
            </svg>
        </template>
        <p class="dates__aide">
            Importez des fichiers <strong>.ics</strong> contenant des dates particulières (jours fériés, événements...).
            Personnalisez l'affichage de chaque fichier avec un libellé et des couleurs.
        </p>
        <div class="dates__import">
            <label for="specialDatesFile" class="dates__masque">Fichier .ics des dates particulières</label>
            <input id="specialDatesFile" ref="champ" type="file" accept=".ics" class="dates__fichier" />
            <button type="button" class="dates__importer" @click="configurer">📤 Importer et configurer</button>
        </div>
        <div id="specialDatesStatus" role="status" class="dates__statut">
            <span v-if="statut" :key="statut.texte" :class="`dates__statut--${statut.etat}`">{{ statut.texte }}</span>
        </div>
        <AppAlert v-if="erreur" type="error" :description="erreur" />

        <div id="specialDatesFilesList" class="dates__liste">
            <p v-if="!fichiers.length" class="dates__vide">Aucun fichier importé</p>
            <div v-else class="dates__cadre">
                <table class="dates__tableau">
                    <thead>
                        <tr>
                            <th class="dates__gauche">Fichier</th>
                            <th>Apparence</th>
                            <th>Dates</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="f in fichiers" :key="f.id">
                            <td class="dates__gauche">{{ f.filename }}</td>
                            <td>
                                <!-- Couleurs choisies par l'administrateur -->
                                <span
                                    class="dates__cartouche"
                                    :style="{
                                        backgroundColor: f.config?.bgColor || '#ffeb3b',
                                        color: f.config?.textColor || '#000',
                                        borderColor: f.config?.borderColor || '#fbc02d'
                                    }"
                                >
                                    {{ f.config?.label || 'JF' }}
                                </span>
                            </td>
                            <td>{{ f.dates_count || 0 }}</td>
                            <td>
                                <button
                                    type="button"
                                    class="dates__modifier"
                                    :aria-label="`Modifier l'apparence de ${f.filename}`"
                                    @click="modifier(f)"
                                >
                                    ✏️
                                </button>
                                <button
                                    type="button"
                                    class="dates__supprimer"
                                    :aria-label="`Supprimer ${f.filename}`"
                                    @click="supprimer(f)"
                                >
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <FenetreApparence
            :initiale="aImporter ? { ...APPARENCE_PAR_DEFAUT } : null"
            :fichier="aImporter?.name ?? ''"
            prefixe="specialDates"
            :erreur="erreurImport"
            @valider="importer"
            @fermer="aImporter = null"
        />
        <FenetreApparence
            :initiale="enModification ? apparence(enModification.config) : null"
            prefixe="editSpecialDates"
            :erreur="erreurModification"
            @valider="enregistrer"
            @fermer="enModification = null"
        />
    </AppSousSectionAdmin>
</template>

<style scoped>
.dates__aide {
    font-size: 12px;
    color: #e65100;
    margin: 10px 0;
}
.dates__import {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 10px;
}
.dates__fichier {
    flex: 1;
}
.dates__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.dates__importer {
    background-color: #ff9800;
    color: white;
    white-space: nowrap;
}
.dates__importer:hover {
    background-color: #f57c00;
}
.dates__statut {
    margin-top: 10px;
    font-size: 12px;
}
.dates__statut--erreur {
    color: #e53935;
}
.dates__statut--ok {
    color: #4caf50;
}
.dates__liste {
    margin-top: 15px;
}
.dates__vide {
    color: #999;
    font-size: 12px;
    font-style: italic;
}
.dates__cadre {
    border: 1px solid #ffcc80;
    border-radius: 4px;
    overflow: hidden;
}
.dates__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.dates__tableau thead tr {
    background: #ffe0b2;
}
.dates__tableau th,
.dates__tableau td {
    padding: 8px;
    text-align: center;
    border: none;
}
.dates__tableau tbody tr {
    border-top: 1px solid #ffcc80;
}
.dates__tableau .dates__gauche {
    text-align: left;
}
.dates__cartouche {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: bold;
    border: 2px solid;
}
.dates__modifier,
.dates__supprimer {
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.dates__modifier,
.dates__modifier:hover {
    background: #1e88e5;
    margin-right: 5px;
}
.dates__supprimer,
.dates__supprimer:hover {
    background: #e53935;
}
</style>
