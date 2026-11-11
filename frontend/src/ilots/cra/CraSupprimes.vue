<!-- Onglet CRA, administrateur : « CRA supprimés » (corbeille), chargés à l'ouverture de la section ; restauration
     dans la section d'origine, purge d'un CRA ou de toute la corbeille -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { apiCra, type CraSupprime } from '@/api/cra';
import { useConfirmation } from '@/composants/confirmation';
import { emettre } from '@/evenements';
import { rendreColonnesRedimensionnables } from '@/outils/colonnes';
import { restaurerVers, statutTableau } from './administration';
import { libelleMois } from './calculs';
import { useCraStore } from './magasin';
import SectionCra from './SectionCra.vue';

const magasin = useCraStore();
const confirmer = useConfirmation();

const lignes = ref<CraSupprime[] | null>(null);
const ouverte = ref(false);
const tableau = ref<HTMLTableElement | null>(null);

async function charger() {
    try {
        lignes.value = await apiCra.supprimes();
        await nextTick();
        if (tableau.value) rendreColonnesRedimensionnables(tableau.value);
    } catch (e) {
        console.error('Erreur chargement CRA supprimés:', e);
    }
}

function ouverture() {
    ouverte.value = true;
    lignes.value = null;
    void charger();
}

watch(
    () => magasin.version,
    () => {
        if (ouverte.value) void charger();
    }
);

const erreur = (e: unknown) => (magasin.messageAdmin = { type: 'error', texte: `Erreur : ${(e as Error).message}` });

async function restaurer(c: CraSupprime) {
    magasin.messageAdmin = null;
    if (!(await confirmer("Restaurer ce CRA dans sa section d'origine ?", 'Confirmer', { danger: false }))) return;
    try {
        await apiCra.restaurer(c.id);
        await magasin.rafraichir();
        emettre('cra-modifies');
    } catch (e) {
        erreur(e);
    }
}

async function purger(c: CraSupprime) {
    magasin.messageAdmin = null;
    if (!(await confirmer('⚠️ Purger définitivement ce CRA ?\n\nCette action est irréversible.'))) return;
    try {
        await apiCra.purger(c.id);
        await charger();
    } catch (e) {
        erreur(e);
    }
}

async function purgerTout() {
    magasin.messageAdmin = null;
    if (!(await confirmer('⚠️ Purger TOUS les CRA supprimés ?\n\nCette action est irréversible.'))) return;
    try {
        for (const c of await apiCra.supprimes()) await apiCra.purger(c.id);
    } catch (e) {
        erreur(e);
    }
    await charger();
}
</script>

<template>
    <SectionCra titre="🗑️ CRA supprimés" teinte="rose" @ouverture="ouverture" @fermeture="ouverte = false">
        <template #actions>
            <button
                v-if="ouverte && lignes && lignes.length"
                id="purgeToutBtn"
                type="button"
                class="cra-corbeille__purger-tout"
                @click="purgerTout"
            >
                🗑️ Purger tout
            </button>
        </template>
        <div id="craDeletedTable">
            <p v-if="!lignes" class="cra-corbeille__vide">⏳ Chargement...</p>
            <p v-else-if="!lignes.length" class="cra-corbeille__vide">Aucun CRA supprimé.</p>
            <table v-else ref="tableau" class="cra-corbeille">
                <thead>
                    <tr>
                        <th>Expert</th>
                        <th>Période</th>
                        <th>Statut avant suppression</th>
                        <th>Était archivé</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(c, i) in lignes" :key="c.id" :class="{ 'cra-corbeille__impaire': i % 2 }">
                        <td>{{ c.expert_nom || '—' }}</td>
                        <td>{{ libelleMois(c.mois, c.annee) }}</td>
                        <td>
                            <span :key="String(c.pre_delete_statut)">{{ statutTableau(c.pre_delete_statut) }}</span>
                        </td>
                        <td>{{ c.pre_delete_archived ? 'Oui' : 'Non' }}</td>
                        <td class="cra-corbeille__actions">
                            <button type="button" class="cra-corbeille__restaurer" @click="restaurer(c)">
                                {{ restaurerVers(c) }}
                            </button>
                            <button type="button" class="cra-corbeille__purger" @click="purger(c)">🗑️ Purger</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </SectionCra>
</template>

<style scoped>
.cra-corbeille__vide {
    color: #999;
    text-align: center;
    padding: 15px;
    margin: 0;
}
.cra-corbeille {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.cra-corbeille th {
    background: #880e4f;
    color: white;
    padding: 8px;
    text-align: left;
}
.cra-corbeille td {
    padding: 6px 8px;
}
.cra-corbeille tbody tr {
    background: white;
    border-bottom: 1px solid #f48fb1;
}
.cra-corbeille tbody tr.cra-corbeille__impaire {
    background: #fce4ec;
}
.cra-corbeille__actions {
    white-space: nowrap;
}
.cra-corbeille__restaurer,
.cra-corbeille__restaurer:hover,
.cra-corbeille__purger,
.cra-corbeille__purger:hover {
    font-size: 11px;
    padding: 3px 8px;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.cra-corbeille__restaurer,
.cra-corbeille__restaurer:hover {
    background: #388e3c;
    margin-right: 4px;
}
.cra-corbeille__purger,
.cra-corbeille__purger:hover {
    background: #b71c1c;
}
.cra-corbeille__purger-tout,
.cra-corbeille__purger-tout:hover {
    background: #c62828;
    color: white;
    border: none;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
</style>
