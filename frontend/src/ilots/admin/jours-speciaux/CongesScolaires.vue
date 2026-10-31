<!-- Congés scolaires : import de fichiers .ics des zones A, B et C (historique), suppression d'un fichier, légende -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiConges, type FichierConges } from '@/api/joursSpeciaux';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/liaison';
import { lireIcs, zones } from './ics';

const confirmer = useConfirmation();
const fichiers = ref<FichierConges[]>([]);
const champ = ref<HTMLInputElement | null>(null);
const statut = ref<{ etat: 'erreur' | 'encours' | 'ok'; texte: string } | null>(null);
const erreur = ref('');

async function charger() {
    try {
        fichiers.value = (await apiConges.liste()).files ?? [];
    } catch {
        /* liste inchangée */
    }
}
onMounted(charger);

/** Fichiers modifiés : liste relue, congés de la planification rechargés par l'ancien code */
async function apresModification() {
    await charger();
    emettre('conges-modifies');
}

async function importer() {
    const f = champ.value?.files?.[0];
    if (!f) {
        statut.value = { etat: 'erreur', texte: '❌ Veuillez sélectionner un fichier .ics' };
        return;
    }
    statut.value = { etat: 'encours', texte: '⏳ Importation en cours...' };
    try {
        const content = await f.text();
        const { zoneA, zoneB, zoneC, total } = zones(lireIcs(content));
        if (!total) {
            statut.value = { etat: 'erreur', texte: '❌ Aucune période de vacances trouvée dans le fichier' };
            return;
        }
        await apiConges.importer({ filename: f.name, content, zoneA, zoneB, zoneC });
        statut.value = { etat: 'ok', texte: `✅ ${total} période(s) importée(s) depuis ${f.name}` };
        if (champ.value) champ.value.value = '';
        await apresModification();
    } catch (e) {
        statut.value = { etat: 'erreur', texte: `❌ Erreur: ${(e as Error).message}` };
    }
}

async function supprimer(f: FichierConges) {
    if (!(await confirmer('Voulez-vous vraiment supprimer ce fichier de congés scolaires ?'))) return;
    erreur.value = '';
    try {
        await apiConges.supprimer(f.id);
        await apresModification();
    } catch {
        erreur.value = 'Erreur lors de la suppression';
    }
}

const ZONES = [
    {
        nom: 'Zone A',
        classe: 'a',
        academies: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers'
    },
    {
        nom: 'Zone B',
        classe: 'b',
        academies:
            'Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg'
    },
    { nom: 'Zone C', classe: 'c', academies: 'Créteil, Montpellier, Paris, Toulouse, Versailles' }
];
</script>

<template>
    <AppSousSectionAdmin titre="Injection des périodes de congés scolaires" id-corps="specialSub1" encadre="vert">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 18 0z" />
                <path d="M12 12v7a2 2 0 0 0 4 0" />
            </svg>
        </template>
        <p class="conges__aide">
            Importez des fichiers <strong>.ics</strong> contenant les vacances scolaires des zones A, B et C. Chaque
            fichier importé est conservé dans l'historique et peut être supprimé individuellement.
        </p>
        <div class="conges__import">
            <label for="schoolHolidaysFile" class="conges__masque">Fichier .ics des congés scolaires</label>
            <input id="schoolHolidaysFile" ref="champ" type="file" accept=".ics" class="conges__fichier" />
            <button type="button" class="conges__importer" @click="importer">📤 Importer</button>
        </div>
        <div id="schoolHolidaysStatus" role="status" class="conges__statut">
            <span v-if="statut" :key="statut.texte" :class="`conges__statut--${statut.etat}`">{{ statut.texte }}</span>
        </div>
        <AppAlert v-if="erreur" type="error" :description="erreur" />

        <div id="schoolHolidaysFilesList" class="conges__liste">
            <p v-if="!fichiers.length" class="conges__vide">Aucun fichier importé</p>
            <div v-else class="conges__cadre">
                <table class="conges__tableau">
                    <thead>
                        <tr>
                            <th class="conges__gauche">Fichier</th>
                            <th>Importé le</th>
                            <th>Périodes</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="f in fichiers" :key="f.id">
                            <td class="conges__gauche">{{ f.filename }}</td>
                            <td>{{ new Date(f.imported_at).toLocaleDateString('fr-FR') }}</td>
                            <td>{{ f.periods_count || 0 }}</td>
                            <td>
                                <button
                                    type="button"
                                    class="conges__supprimer"
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

        <div class="conges__legende">
            <span class="conges__legende-titre">Légende des zones :</span>
            <div class="conges__zones">
                <div v-for="z in ZONES" :key="z.nom" class="conges__zone" :title="z.academies">
                    <span class="conges__trait" :class="`conges__trait--${z.classe}`" aria-hidden="true"></span>
                    <span>{{ z.nom }}</span>
                </div>
            </div>
        </div>
    </AppSousSectionAdmin>
</template>

<style scoped>
.conges__aide {
    font-size: 12px;
    color: #2e7d32;
    margin: 10px 0;
}
.conges__import {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 10px;
}
.conges__fichier {
    flex: 1;
}
.conges__masque {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
.conges__importer {
    background-color: #43a047;
    color: white;
    white-space: nowrap;
}
.conges__importer:hover {
    background-color: #2e7d32;
}
.conges__statut {
    margin-top: 10px;
    font-size: 12px;
}
.conges__statut--erreur {
    color: #e53935;
}
.conges__statut--encours {
    color: #1565c0;
}
.conges__statut--ok {
    color: #4caf50;
}
.conges__liste {
    margin-top: 15px;
}
.conges__vide {
    color: #999;
    font-size: 12px;
    font-style: italic;
}
.conges__cadre {
    border: 1px solid #a5d6a7;
    border-radius: 4px;
    overflow: hidden;
}
.conges__tableau {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.conges__tableau thead tr {
    background: #c8e6c9;
}
.conges__tableau th,
.conges__tableau td {
    padding: 8px;
    text-align: center;
    border: none;
}
.conges__tableau tbody tr {
    border-top: 1px solid #a5d6a7;
}
.conges__tableau .conges__gauche {
    text-align: left;
}
.conges__supprimer,
.conges__supprimer:hover {
    background: #e53935;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.conges__legende {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px dashed #a5d6a7;
}
.conges__legende-titre {
    font-size: 11px;
    color: #555;
    font-weight: bold;
}
.conges__zones {
    display: flex;
    gap: 20px;
    margin-top: 5px;
}
.conges__zone {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: help;
    font-size: 11px;
}
.conges__trait {
    display: inline-block;
    width: 20px;
    height: 4px;
    border-radius: 2px;
}
.conges__trait--a {
    background-color: #e91e63;
}
.conges__trait--b {
    background-color: #2196f3;
}
.conges__trait--c {
    background-color: #ff9800;
}
</style>
