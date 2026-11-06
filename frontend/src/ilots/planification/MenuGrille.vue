<!-- Menu d'une demi-journée de la grille (clic droit) : vérification du verrou par un CRA soumis, puis modification ou
     suppression des astreintes / HNO de la demi-journée et ajout. Fermé au clic suivant ou par Échap. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiAstreintesMois } from '@/api/astreintes';
import type { AstreintePlanning } from '@/api/planification';
import type { Ressource } from '@/api/ressources';
import { astreintesDeLaCellule, type Periode } from './grille';
import { usePlanificationStore } from './magasin';
import { entreesMenu, enteteMenu, positionMenu, type EntreeMenu } from './menu';

const props = defineProps<{ x: number; y: number; ressource: Ressource; date: string; periode: Periode }>();
const emit = defineEmits<{
    fermer: [];
    ajouter: [];
    modifier: [astreinte: AstreintePlanning];
    supprimer: [astreinte: AstreintePlanning];
}>();

const p = usePlanificationStore();

/** Astreintes / HNO de la demi-journée (lignes complètes) */
const astreintes = computed(() => {
    const ids = astreintesDeLaCellule(p.astreintes, props.ressource.id, props.date, props.periode).map(a => a.id);
    return ids.map(id => p.astreintes.find(a => a.id === id)!).filter(Boolean);
});

/** Entrées ; null pendant la vérification du verrou */
const entrees = ref<EntreeMenu[] | null>(null);
const position = computed(() =>
    positionMenu(props.x, props.y, astreintes.value.length, window.innerWidth, window.innerHeight)
);

/** Entrée choisie : le parent ferme le menu */
function choisir(e: EntreeMenu) {
    if (e.type === 'ajouter') emit('ajouter');
    else if (e.type === 'modifier') emit('modifier', e.astreinte);
    else if (e.type === 'supprimer') emit('supprimer', e.astreinte);
}

const fermer = () => emit('fermer');
const clavier = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
let attente: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
    // Fermeture au clic suivant (hors de ce clic droit)
    attente = setTimeout(() => document.addEventListener('click', fermer, { once: true }), 0);
    document.addEventListener('keydown', clavier);
    const [annee, mois] = props.date.split('-').map(Number) as [number, number];
    let verrou: { locked: boolean; statut?: string } = { locked: false };
    if (props.ressource.user_id) {
        try {
            verrou = await apiAstreintesMois.verrou(props.ressource.user_id, mois, annee);
        } catch {
            // Vérification impossible : saisie proposée (le serveur contrôle à l'enregistrement)
        }
    }
    entrees.value = entreesMenu(verrou, astreintes.value);
});

onBeforeUnmount(() => {
    if (attente) clearTimeout(attente);
    document.removeEventListener('click', fermer);
    document.removeEventListener('keydown', clavier);
});
</script>

<template>
    <div
        id="ganttContextMenu"
        class="gp-menu-grille"
        role="menu"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        @click.stop
    >
        <div id="ganttContextMenuHeader" class="gp-menu-grille__entete">
            {{ enteteMenu(ressource, date, periode) }}
        </div>
        <div id="ganttContextMenuItems">
            <div v-if="entrees === null" class="gp-menu-grille__attente">⏳ Vérification…</div>
            <template v-for="e in entrees ?? []" :key="e.cle">
                <div v-if="e.type === 'separateur'" class="gp-menu-grille__separateur" role="separator"></div>
                <div
                    v-else-if="e.type === 'verrou'"
                    class="gp-menu-grille__entree gp-menu-grille__entree--verrou"
                    role="menuitem"
                    aria-disabled="true"
                >
                    <span>🔒</span><span :key="e.libelle">{{ e.libelle }}</span>
                </div>
                <button
                    v-else
                    type="button"
                    class="gp-menu-grille__entree"
                    :class="`gp-menu-grille__entree--${e.type}`"
                    role="menuitem"
                    @click="choisir(e)"
                >
                    <span>{{ e.type === 'modifier' ? '✏️' : e.type === 'supprimer' ? '🗑️' : '➕' }}</span
                    ><span :key="e.libelle">{{ e.libelle }}</span>
                </button>
            </template>
        </div>
    </div>
</template>

<style>
.gp-menu-grille {
    position: fixed;
    z-index: 99999;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    padding: 4px 0;
    min-width: 240px;
    font-size: 13px;
}
.gp-menu-grille__entete {
    padding: 6px 14px 4px;
    font-size: 11px;
    color: #888;
    border-bottom: 1px solid #eee;
    margin-bottom: 2px;
    font-weight: 600;
}
.gp-menu-grille__attente {
    padding: 8px 16px;
    color: #888;
    font-size: 12px;
}
.gp-menu-grille__entree,
.gp-menu-grille__entree:hover,
.gp-menu-grille__entree:focus {
    padding: 9px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    border-radius: 0;
    text-align: left;
    font-size: 13px;
    font-weight: normal;
    cursor: pointer;
    color: #222;
}
.gp-menu-grille__entree:hover,
.gp-menu-grille__entree:focus-visible {
    background: #f5f5f5;
}
.gp-menu-grille__entree--ajouter {
    color: #6a1b9a;
}
.gp-menu-grille__entree--modifier {
    color: #1565c0;
}
.gp-menu-grille__entree--supprimer {
    color: #c62828;
}
.gp-menu-grille__entree--verrou {
    color: #aaa;
    cursor: default;
}
.gp-menu-grille__separateur {
    border-top: 1px solid #eee;
    margin: 3px 0;
}
</style>
