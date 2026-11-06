<!-- Calendrier des congés et événements (bouton « Visualiser les événements » de l'en-tête de la planification) :
     congés scolaires par zone et dates particulières (jours fériés, événements et leurs participants), à partir du mois
     courant ; navigation entre les mois, impression. Données : instantané de la planification lu à l'ouverture. -->
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import AppIcone from '@/composants/AppIcone.vue';
import AppModal from '@/composants/AppModal.vue';
import { surDemande } from '@/ilots/fenetres';
import { usePlanificationStore } from '@/ilots/planification/magasin';
import type { EtatPlanning } from '@/liaison';
import {
    JOURS_SEMAINE,
    NOM_ZONE,
    avecConfig,
    datesDuJour,
    grilleMois,
    moisVoisin,
    pastille,
    titreMois,
    zonesEnConges
} from './calendrier';
import { imprimerCalendrierEvenements } from './impression';
import './calendriers.css';

const ouverte = ref(false);
const etat = shallowRef<EtatPlanning | null>(null);
const annee = ref(0);
const mois = ref(0);
const contenu = ref<HTMLElement | null>(null);

// Ouverture sur le mois courant
const planification = usePlanificationStore();

// Données de la grille (magasin de la planification), chargées à la première ouverture
surDemande(async () => {
    await planification.charger();
    const e = planification.etatPlanning;
    etat.value = e;
    const maintenant = new Date();
    annee.value = maintenant.getFullYear();
    mois.value = maintenant.getMonth();
    ouverte.value = true;
});

function naviguer(sens: number) {
    ({ annee: annee.value, mois: mois.value } = moisVoisin(annee.value, mois.value, sens));
}

const titre = computed(() => titreMois(annee.value, mois.value));

const SUFFIXES: Record<string, string> = { AM: ' ☀️', PM: ' 🌙' };

const semaines = computed(() => {
    const e = etat.value;
    if (!e) return [];
    return grilleMois(annee.value, mois.value).map(s => ({
        numero: s.numero,
        cases: s.cases.map((c, colonne) => {
            if (!c) return { cle: `vide-${s.numero}-${colonne}`, jour: null, zones: [], evenements: [] };
            const dates = datesDuJour(e.datesParticulieres, c.date);
            const evenements = avecConfig(dates).map((sd, rang) => {
                const p = pastille(sd, 'Événement', rang);
                const participants = sd.config.participants?.length ? `\n👥 ${sd.config.participants.join(', ')}` : '';
                return { ...p, infobulle: p.infobulle + participants, suffixe: SUFFIXES[sd.period || 'FULL'] ?? '' };
            });
            const zones = zonesEnConges(e.conges, c.date);
            // Fond « avec contenu » : congés ou dates particulières (même sans apparence)
            return { cle: c.date, jour: c, zones, evenements, contenu: zones.length > 0 || dates.length > 0 };
        })
    }));
});

/** Légende des zones : académies de chacune */
const ZONES_LEGENDE = [
    {
        zone: 'zoneA' as const,
        academies: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers'
    },
    {
        zone: 'zoneB' as const,
        academies:
            'Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg'
    },
    { zone: 'zoneC' as const, academies: 'Créteil, Montpellier, Paris, Toulouse, Versailles' }
];

/** Types d'événements de la légende (libellés et couleurs de l'ancien écran) */
const TYPES_LEGENDE = [
    { libelle: 'FORMATION', classe: 'gp-ce-type--formation' },
    { libelle: 'MISE EN SERVICE', classe: 'gp-ce-type--mes' },
    { libelle: 'ACCOMP. POST DÉM.', classe: 'gp-ce-type--apd' },
    { libelle: 'VISITE TERRAIN', classe: 'gp-ce-type--visite' },
    { libelle: 'CONGRÈS', classe: 'gp-ce-type--congres' }
];

function imprimer() {
    if (contenu.value) imprimerCalendrierEvenements(titre.value, contenu.value);
}
</script>

<template>
    <AppModal
        id="eventsCalendarModal"
        :opened="ouverte"
        title="Calendrier des congés et événements"
        class="gp-calendrier-evenements"
        @close="ouverte = false"
    >
        <div class="gp-calendrier-evenements__nav">
            <button type="button" class="gp-calendrier-evenements__fleche" @click="naviguer(-1)">
                ◀ Mois précédent
            </button>
            <span id="eventsCalendarTitle" class="gp-calendrier-evenements__titre">{{ titre }}</span>
            <button type="button" class="gp-calendrier-evenements__fleche" @click="naviguer(1)">Mois suivant ▶</button>
        </div>

        <div class="gp-calendrier-evenements__legende">
            <span
                v-for="z in ZONES_LEGENDE"
                :key="z.zone"
                class="gp-calendrier-evenements__legende-zone"
                :title="z.academies"
            >
                <span class="gp-calendrier-evenements__barre" :class="`gp-zone--${z.zone}`"></span>
                {{ NOM_ZONE[z.zone] }}
            </span>
            <span class="gp-calendrier-evenements__legende-zone gp-calendrier-evenements__legende-zone--simple">
                <span class="gp-calendrier-evenements__ferie"></span> Jour férié
            </span>
            <span class="gp-calendrier-evenements__separateur"></span>
            <span v-for="t in TYPES_LEGENDE" :key="t.libelle" class="gp-ce-type" :class="t.classe">{{
                t.libelle
            }}</span>
        </div>

        <div ref="contenu" class="gp-calendrier-evenements__contenu">
            <table class="gp-ce-table">
                <thead>
                    <tr>
                        <th class="gp-ce-sem">Sem.</th>
                        <th
                            v-for="(nom, i) in JOURS_SEMAINE"
                            :key="nom"
                            class="gp-ce-jour-nom"
                            :class="{ 'gp-ce-jour-nom--weekend': i >= 5 }"
                        >
                            {{ nom }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in semaines" :key="s.numero">
                        <td class="gp-ce-sem">{{ s.numero }}</td>
                        <template v-for="c in s.cases" :key="c.cle">
                            <td v-if="!c.jour" class="gp-ce-vide"></td>
                            <td
                                v-else
                                class="gp-ce-jour"
                                :class="{
                                    'gp-ce-jour--contenu': c.contenu,
                                    'gp-ce-jour--weekend': c.jour.weekend,
                                    'gp-ce-jour--aujourdhui': c.jour.aujourdhui
                                }"
                            >
                                <div class="gp-ce-numero" :class="{ 'gp-ce-numero--aujourdhui': c.jour.aujourdhui }">
                                    {{ c.jour.jour }}
                                </div>
                                <div v-if="c.zones.length" class="gp-ce-zones">
                                    <div
                                        v-for="z in c.zones"
                                        :key="z"
                                        class="gp-ce-zone"
                                        :class="`gp-zone--${z}`"
                                        :title="NOM_ZONE[z]"
                                    ></div>
                                </div>
                                <div v-if="c.evenements.length" class="gp-ce-evenements">
                                    <div
                                        v-for="ev in c.evenements"
                                        :key="ev.cle + ev.suffixe"
                                        class="gp-ce-evenement"
                                        :title="ev.infobulle"
                                        :style="{ backgroundColor: ev.fond, color: ev.texte, borderColor: ev.bordure }"
                                    >
                                        <AppIcone v-if="ev.icone" :name="ev.icone" :scale="11 / 16" />{{ ev.libelle
                                        }}{{ ev.suffixe }}
                                    </div>
                                </div>
                            </td>
                        </template>
                    </tr>
                </tbody>
            </table>
        </div>

        <template #footer>
            <button type="button" class="gp-calendrier-evenements__imprimer" @click="imprimer">🖨️ Imprimer</button>
            <button type="button" class="gp-calendrier-evenements__fermer" @click="ouverte = false">Fermer</button>
        </template>
    </AppModal>
</template>

<style>
/* Fenêtre téléportée hors du composant : règles ciblées par sa classe */
.gp-modale.gp-calendrier-evenements .gp-modale__boite {
    width: min(1200px, 95%);
}
.gp-modale.gp-calendrier-evenements .gp-modale__titre {
    color: #00bcd4;
}
.gp-calendrier-evenements__nav {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    margin: 15px 0 20px;
}
.gp-calendrier-evenements__fleche {
    padding: 8px 15px;
    background: #00bcd4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.gp-calendrier-evenements__titre {
    font-size: 20px;
    font-weight: bold;
    color: #2c3e50;
    min-width: 200px;
    text-align: center;
}
.gp-calendrier-evenements__legende {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 15px;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 8px;
    justify-content: center;
    align-items: center;
}
.gp-calendrier-evenements__legende-zone {
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: help;
}
.gp-calendrier-evenements__legende-zone--simple {
    cursor: default;
}
.gp-calendrier-evenements__barre {
    display: inline-block;
    width: 20px;
    height: 4px;
}
.gp-calendrier-evenements__ferie {
    display: inline-block;
    width: 16px;
    height: 12px;
    background: #ffeb3b;
    border: 1px solid #fbc02d;
    border-radius: 2px;
}
.gp-calendrier-evenements__separateur {
    display: inline-block;
    width: 1px;
    height: 16px;
    background: #ccc;
}
.gp-ce-type {
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: bold;
    border: 1.5px solid #000;
}
.gp-ce-type--formation {
    background-color: #ffea00;
    color: #0008ff;
}
.gp-ce-type--mes {
    background-color: #ffea00;
    color: #d20906;
}
.gp-ce-type--apd {
    background-color: #ffea00;
    color: #c2059a;
}
.gp-ce-type--visite {
    background-color: #0011ff;
    color: #ffffff;
}
.gp-ce-type--congres {
    background-color: #dff0d8;
    color: #427645;
}
.gp-calendrier-evenements__contenu {
    max-height: 60vh;
    overflow-y: auto;
}
.gp-calendrier-evenements__imprimer,
.gp-calendrier-evenements__fermer {
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    cursor: pointer;
}
.gp-calendrier-evenements__imprimer {
    background-color: #3498db;
}
.gp-calendrier-evenements__fermer {
    background-color: #95a5a6;
}
</style>
