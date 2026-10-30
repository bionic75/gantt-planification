<!-- Import d'un fichier CSV de localisations et message d'état (import, suppression) -->
<script setup lang="ts">
import { ref } from 'vue';
import { libelleSeparateur } from './calculs';
import { useLocalisationsStore } from './magasin';

const loc = useLocalisationsStore();
const fichier = ref<HTMLInputElement | null>(null);

async function importer() {
    const f = fichier.value?.files?.[0];
    if (!f) {
        loc.statut = { texte: '⚠️ Aucun fichier sélectionné.' };
        return;
    }
    loc.statut = { texte: '⏳ Lecture du fichier…' };
    await loc.importer(await f.text());
}
</script>

<template>
    <div class="loc-import">
        <label for="locCsvFile" class="loc-import__titre">📥 Import CSV</label>
        <p class="loc-import__aide">
            Format attendu : <code>libelle_long;libelle_court;adresse;latitude;longitude</code> (avec en-tête)
        </p>
        <div class="loc-import__choix">
            <input id="locCsvFile" ref="fichier" type="file" accept=".csv" class="loc-import__fichier" />
            <button type="button" class="loc-import__bouton" @click="importer">📤 Importer</button>
        </div>
        <div id="locImportStatus" class="loc-import__statut" role="status">
            <!-- Recréé à chaque message : les émojis du texte sont remplacés par des icônes (public/js/ui-icons.js),
                 un nœud texte converti n'est plus mis à jour par Vue -->
            <span v-if="loc.statut" :key="loc.statut.texte">
                {{ loc.statut.texte }}
                <small v-if="loc.statut.detail" class="loc-import__detail">
                    Séparateur : <code>{{ libelleSeparateur(loc.statut.detail.separateur) }}</code> | En-têtes :
                    <code>{{ loc.statut.detail.entetes.join(' | ') }}</code>
                </small>
                <small v-if="loc.statut.apercu" class="loc-import__detail">
                    Aperçu :
                    <ul class="loc-import__apercu">
                        <li v-for="(l, i) in loc.statut.apercu" :key="i">
                            <strong>{{ l.libelle_court }}</strong> — lat: <code>{{ l.latitude ?? '⚠️ null' }}</code
                            >, lng:
                            <code>{{ l.longitude ?? '⚠️ null' }}</code>
                        </li>
                    </ul>
                </small>
            </span>
        </div>
    </div>
</template>

<style scoped>
.loc-import {
    background: #e8eaf6;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 15px;
    border: 1px solid #9fa8da;
}
.loc-import__titre {
    font-size: 13px;
    color: #283593;
    font-weight: bold;
    display: block;
    margin-bottom: 8px;
}
.loc-import__aide {
    font-size: 11px;
    color: #3949ab;
    margin-bottom: 8px;
}
.loc-import__choix {
    display: flex;
    gap: 10px;
    align-items: center;
}
.loc-import__fichier {
    flex: 1;
}
.loc-import__bouton,
.loc-import__bouton:hover {
    background: #3f51b5;
    color: white;
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
}
.loc-import__statut {
    margin-top: 8px;
    font-size: 12px;
}
.loc-import__detail {
    display: block;
}
.loc-import__apercu {
    margin: 3px 0 0 15px;
}
</style>
