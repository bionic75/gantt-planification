<!-- Calendrier de saisie des dates avec numéros de semaine, ouvert à la place de celui du navigateur sur les champs date
     de la zone (formulaire d'un déploiement). Clic sur un numéro de semaine : lundi (vendredi pour une fin de période). -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ajouterJours, aujourdhui, lundiDe, majuscule, MOIS, semaineIso } from '../planning/outils';

const props = defineProps<{ zone: HTMLElement | null }>();

const ouvert = ref(false);
const place = ref(false);
const annee = ref(0);
const mois = ref(0);
const position = ref({ left: 0, top: 0 });
const boite = ref<HTMLElement | null>(null);
/** Champ en cours de saisie */
const champ = ref<HTMLInputElement | null>(null);

const jour = aujourdhui();
const estFin = computed(() => champ.value?.dataset.pf === 'end');

const semaines = computed(() => {
    const ch = champ.value;
    if (!ch) return [];
    const min = ch.min || '';
    const valeur = ch.value;
    const m = mois.value + 1;
    const lignes: {
        numero: number;
        choix: string;
        jours: { iso: string; classes: Record<string, boolean>; choix: string; numero: number }[];
    }[] = [];
    let lundi = lundiDe(`${annee.value}-${String(m).padStart(2, '0')}-01`);
    for (let w = 0; w < 6; w++) {
        const jours = Array.from({ length: 7 }, (_, d) => {
            const iso = ajouterJours(lundi, d);
            const desactive = !!min && iso < min;
            return {
                iso,
                numero: +iso.slice(8),
                choix: desactive ? '' : iso,
                classes: {
                    o: +iso.slice(5, 7) !== m,
                    we: d > 4,
                    today: iso === jour,
                    sel: iso === valeur,
                    dis: desactive
                }
            };
        });
        lignes.push({ numero: semaineIso(lundi).week, choix: estFin.value ? ajouterJours(lundi, 4) : lundi, jours });
        lundi = ajouterJours(lundi, 7);
        if (w >= 3 && +lundi.slice(5, 7) !== m && +ajouterJours(lundi, -1).slice(5, 7) !== m) break;
    }
    return lignes;
});

async function ouvrir(input: HTMLInputElement) {
    champ.value = input;
    // Ouvert sur la date déjà choisie ; à défaut, sur la borne basse de la période
    const debut = input.closest('.pr')?.querySelector<HTMLInputElement>('input[data-pf="start"]');
    const base = input.value || (input.dataset.pf === 'end' && debut?.value) || input.min || aujourdhui();
    annee.value = +base.slice(0, 4);
    mois.value = +base.slice(5, 7) - 1;
    place.value = false;
    ouvert.value = true;
    await nextTick();
    const r = input.getBoundingClientRect();
    const h = boite.value?.offsetHeight ?? 0;
    const w = boite.value?.offsetWidth ?? 0;
    position.value = {
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
        top: r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4
    };
    place.value = true;
}

function fermer() {
    ouvert.value = false;
    champ.value = null;
}

function naviguer(n: number) {
    let m = mois.value + n;
    let a = annee.value;
    if (m < 0) {
        m = 11;
        a--;
    }
    if (m > 11) {
        m = 0;
        a++;
    }
    mois.value = m;
    annee.value = a;
}

function choisir(iso: string) {
    const ch = champ.value;
    if (!iso || !ch) return;
    // Une semaine entamée avant le minimum se cale sur celui-ci
    ch.value = ch.min && iso < ch.min ? ch.min : iso;
    ch.dispatchEvent(new Event('input', { bubbles: true }));
    ch.dispatchEvent(new Event('change', { bubbles: true }));
    fermer();
}

const cible = (e: Event) => {
    const i = e.target as HTMLElement | null;
    return i?.matches?.('input[type="date"]') && props.zone?.contains(i) ? (i as HTMLInputElement) : null;
};

function appui(e: MouseEvent) {
    const i = cible(e);
    if (i) {
        e.preventDefault();
        void ouvrir(i);
    } else if (ouvert.value && boite.value && !boite.value.contains(e.target as Node)) fermer();
}
function clic(e: MouseEvent) {
    if (cible(e)) e.preventDefault();
}
function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape' && ouvert.value) {
        // Seul le calendrier se ferme (pas la fenêtre)
        e.stopPropagation();
        fermer();
    }
    if (e.key === 'Enter' && cible(e)) {
        e.preventDefault();
        void ouvrir(e.target as HTMLInputElement);
    }
}

onMounted(() => {
    document.addEventListener('mousedown', appui, true);
    document.addEventListener('click', clic, true);
    document.addEventListener('keydown', clavier, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', appui, true);
    document.removeEventListener('click', clic, true);
    document.removeEventListener('keydown', clavier, true);
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="ouvert"
            ref="boite"
            class="aff-dp"
            :class="{ 'aff-dp--place': place }"
            :style="{ left: `${position.left}px`, top: `${position.top}px` }"
            @mousedown.prevent
        >
            <div class="hd">
                <button type="button" aria-label="Mois précédent" @click="naviguer(-1)">‹</button
                ><span>{{ majuscule(MOIS[mois]!) }} {{ annee }}</span
                ><button type="button" aria-label="Mois suivant" @click="naviguer(1)">›</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th title="Numéro de semaine">S</th>
                        <th v-for="(x, i) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="i">{{ x }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in semaines" :key="s.choix">
                        <td
                            class="wk"
                            :title="`Choisir la semaine ${s.numero} (${estFin ? 'vendredi' : 'lundi'})`"
                            @click="choisir(s.choix)"
                        >
                            {{ s.numero }}
                        </td>
                        <td v-for="j in s.jours" :key="j.iso" class="d" :class="j.classes">
                            <button type="button" @click="choisir(j.choix)">{{ j.numero }}</button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div class="ft">
                <button type="button" @click="choisir(jour)">Aujourd'hui</button
                ><span>Cliquer sur un n° de semaine pour la choisir</span>
            </div>
        </div>
    </Teleport>
</template>

<style>
.aff-dp:not(.aff-dp--place) {
    visibility: hidden;
}
</style>
