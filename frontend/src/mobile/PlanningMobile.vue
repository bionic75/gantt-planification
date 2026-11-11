<!-- Application mobile : planning d'une ressource (vue Jour, Semaine ou Mois) et événements de la période. Recréé à
     chaque changement de vue, de période ou de ressource (clé du parent) : les pictogrammes remplacés par
     decor/icones-emojis.ts ne sont jamais mis à jour en place. -->
<script setup lang="ts">
import { computed } from 'vue';
import CarteEvenementMobile from './CarteEvenementMobile.vue';
import {
    ACTIVITES,
    activite,
    ajouterJours,
    EMOJIS_ACTIVITES,
    enConge,
    estAujourdhui,
    evenementsEntre,
    grilleMois,
    joursSemaine,
    lundiDe,
    MOIS,
    JOURS_COURTS,
    versIso,
    type EvenementMobile,
    type Periode,
    type Planification,
    type Vue
} from './planning';

const props = defineProps<{
    vue: Vue;
    curseur: Date;
    ressource: number | null;
    planification: Planification;
    evenements: EvenementMobile[];
}>();
const emit = defineEmits<{ demiJournee: [iso: string, periode: Periode]; jour: [date: Date] }>();

const PERIODES: Periode[] = ['AM', 'PM'];
const libellePeriode = (p: Periode) => (p === 'AM' ? '☀️ Matin' : '🌙 Après-midi');
const act = (iso: string, p: Periode) => {
    const code = activite(props.planification, props.ressource!, iso, p);
    return code ? (ACTIVITES[code] ? { code, ...ACTIVITES[code]! } : null) : null;
};
const conge = (iso: string) => enConge(props.planification, props.ressource!, iso);

// Jour
const isoJour = computed(() => versIso(props.curseur));
const titreJour = computed(() =>
    props.curseur.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
);
const evenementsJour = computed(() => evenementsEntre(props.evenements, isoJour.value, isoJour.value));

// Semaine
const jours = computed(() => joursSemaine(props.curseur));
const evenementsSemaine = computed(() => {
    const lundi = lundiDe(props.curseur);
    return evenementsEntre(props.evenements, versIso(lundi), versIso(ajouterJours(lundi, 4)));
});

// Mois
const lignes = computed(() => grilleMois(props.curseur));
const titreMois = computed(() => `${MOIS[props.curseur.getMonth()]} ${props.curseur.getFullYear()}`);
const evenementsMois = computed(() => {
    const y = props.curseur.getFullYear();
    const m = props.curseur.getMonth();
    return evenementsEntre(
        props.evenements,
        `${y}-${String(m + 1).padStart(2, '0')}-01`,
        versIso(new Date(y, m + 1, 0))
    );
});
</script>

<template>
    <div v-if="!ressource" class="no-data">Aucun expert sélectionné</div>

    <!-- Vue Jour -->
    <template v-else-if="vue === 'day'">
        <div class="day-title">{{ titreJour }}</div>
        <div v-if="conge(isoJour)" class="conge-banner">🏖️ Journée de congé</div>
        <div class="day-periods">
            <div v-for="p in PERIODES" :key="p" class="period-card">
                <div class="period-label-tag">{{ libellePeriode(p) }}</div>
                <div v-if="act(isoJour, p)" class="act-badge" :style="{ background: act(isoJour, p)!.color }">
                    {{ EMOJIS_ACTIVITES[act(isoJour, p)!.code] || '' }} {{ act(isoJour, p)!.label }}
                </div>
                <div v-else-if="conge(isoJour)" class="act-badge empty mob-badge-conge">🏖️ Congé</div>
                <div v-else class="act-badge empty">— Libre —</div>
            </div>
        </div>
        <div v-if="evenementsJour.length" class="events-section">
            <div class="events-title">Événements du jour</div>
            <CarteEvenementMobile v-for="e in evenementsJour" :key="e.id" :evenement="e" />
        </div>
    </template>

    <!-- Vue Semaine -->
    <template v-else-if="vue === 'week'">
        <div class="week-grid">
            <div v-for="d in jours" :key="versIso(d)" class="week-col-header" :class="{ today: estAujourdhui(d) }">
                <div class="wday">{{ JOURS_COURTS[d.getDay() - 1] }}</div>
                <div class="wnum">{{ d.getDate() }}</div>
            </div>
            <template v-for="(p, pi) in PERIODES" :key="p">
                <div class="week-period-lbl">{{ libellePeriode(p) }}</div>
                <div v-if="pi === 1" class="week-section-gap"></div>
                <div
                    v-for="d in jours"
                    :key="`${p}${versIso(d)}`"
                    class="week-cell"
                    @click="emit('demiJournee', versIso(d), p)"
                >
                    <template v-if="act(versIso(d), p)">
                        <div class="week-dot" :style="{ background: act(versIso(d), p)!.color }"></div>
                        <div class="week-cell-lbl">{{ act(versIso(d), p)!.label }}</div>
                    </template>
                    <template v-else-if="conge(versIso(d))">
                        <div class="week-dot mob-dot-conge"></div>
                        <div class="week-cell-lbl">Congé</div>
                    </template>
                    <div v-else class="week-empty-dot"></div>
                </div>
            </template>
        </div>
        <div v-if="evenementsSemaine.length" class="events-section">
            <div class="events-title">Événements de la semaine</div>
            <CarteEvenementMobile v-for="e in evenementsSemaine" :key="e.id" :evenement="e" />
        </div>
    </template>

    <!-- Vue Mois -->
    <template v-else>
        <div class="month-title">{{ titreMois }}</div>
        <div class="month-grid">
            <div class="month-hdr-cell month-week-hdr"></div>
            <div v-for="(h, i) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="i" class="month-hdr-cell">{{ h }}</div>
            <template v-for="(l, li) in lignes" :key="li">
                <div class="month-week-num">{{ l.semaine }}</div>
                <template v-for="(d, ci) in l.jours" :key="`${li}-${ci}`">
                    <div v-if="!d" class="month-cell empty"></div>
                    <div
                        v-else
                        class="month-cell"
                        :class="{ today: estAujourdhui(d), conge: conge(versIso(d)) }"
                        @click="emit('jour', d)"
                    >
                        <div class="month-day-num">{{ d.getDate() }}</div>
                        <div class="month-dots-row">
                            <div
                                v-for="p in PERIODES.filter(x => act(versIso(d), x))"
                                :key="p"
                                class="mdot"
                                :style="{ background: act(versIso(d), p)!.color }"
                            ></div>
                            <div
                                v-if="conge(versIso(d)) && !act(versIso(d), 'AM') && !act(versIso(d), 'PM')"
                                class="mdot mob-dot-conge"
                            ></div>
                        </div>
                    </div>
                </template>
            </template>
        </div>
        <div v-if="evenementsMois.length" class="events-section">
            <div class="events-title">Événements du mois</div>
            <CarteEvenementMobile v-for="e in evenementsMois" :key="e.id" :evenement="e" />
        </div>
    </template>
</template>
