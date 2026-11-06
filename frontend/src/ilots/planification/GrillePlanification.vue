<!-- Grille de la planification : semaines ISO, jours et demi-journées du mois, ligne des congés scolaires et dates
     particulières, une ligne par ressource (disponibilité, affectation, localisation, pastilles des astreintes / HNO),
     totaux. Balisage et classes de l'ancien écran (feuilles de style communes, impression, mode sombre). -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Ressource } from '@/api/ressources';
import AppIcone from '@/composants/AppIcone.vue';
import { avecConfig, datesDuJour, pastille, zonesEnConges } from '@/ilots/consultation/calendrier';
import {
    LIBELLES_AFFECTATION,
    LIBELLES_DISPO,
    PERIODES,
    affichageLocalisation,
    astreintesDeLaCellule,
    couleurAffectation,
    couleurDispo,
    couleurMadVolante,
    dansPeriode,
    infobulleRessource,
    joursAttendus,
    joursDisponibles,
    joursDuMois,
    joursMadVolanteConsommes,
    pastilleAstreinte,
    periodeAcces,
    semainesDuMois,
    valeurs,
    type JourGrille,
    type Periode
} from './grille';
import { usePlanificationStore } from './magasin';

export type LigneCellule = 'disponibilite' | 'affectation' | 'localisation';

const props = defineProps<{
    ressources: Ressource[];
    masquees: Set<number>;
    /** Mise en évidence du jour courant à l'ouverture de l'onglet (perdue à la première modification) */
    surbrillance: boolean;
}>();
const emit = defineEmits<{
    clic: [ligne: LigneCellule, ressource: Ressource, jour: JourGrille, periode: Periode];
    masquer: [id: number];
    trier: [];
    /** Clic droit sur une demi-journée : menu des astreintes / HNO */
    menu: [evenement: MouseEvent, ressource: Ressource, jour: JourGrille, periode: Periode];
    /** Calendrier du mois de la ressource : aperçu avant impression, envoi par e-mail */
    imprimer: [ressource: Ressource];
    envoyer: [ressource: Ressource];
}>();

const p = usePlanificationStore();

const ZONES_LEGENDE = [
    {
        zone: 'A',
        couleur: '#e91e63',
        academies: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers'
    },
    {
        zone: 'B',
        couleur: '#2196f3',
        academies:
            'Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg'
    },
    { zone: 'C', couleur: '#ff9800', academies: 'Créteil, Montpellier, Paris, Toulouse, Versailles' }
];
const COULEUR_ZONE: Record<string, string> = { zoneA: '#e91e63', zoneB: '#2196f3', zoneC: '#ff9800' };
const NOM_ZONE: Record<string, string> = { zoneA: 'Zone A', zoneB: 'Zone B', zoneC: 'Zone C' };

const jours = computed(() => joursDuMois(p.annee, p.mois));
const semaines = computed(() => semainesDuMois(p.annee, p.mois));

const avecCongesOuDates = computed(
    () =>
        !!(p.conges.zoneA?.length || p.conges.zoneB?.length || p.conges.zoneC?.length) ||
        p.datesParticulieres.length > 0
);
const avecConges = computed(() => !!(p.conges.zoneA?.length || p.conges.zoneB?.length || p.conges.zoneC?.length));

/** Ligne des congés et événements : barres des zones, pastilles de la demi-journée (journée entière ou période) */
const congesEtEvenements = computed(() =>
    jours.value.map(j => {
        const zones = zonesEnConges(p.conges, j.date);
        const dates = avecConfig(datesDuJour(p.datesParticulieres, j.date));
        const demi = (periode: Periode) => {
            const pastilles = dates
                .filter(sd => (sd.period || 'FULL') === 'FULL' || sd.period === periode)
                .map((sd, rang) => {
                    const pa = pastille(sd, 'JF', rang);
                    const participants = sd.config.participants?.length
                        ? ` | 👥 ${sd.config.participants.join(', ')}`
                        : '';
                    return { ...pa, infobulle: pa.infobulle + participants };
                });
            return { zones, pastilles, contenu: zones.length > 0 || pastilles.length > 0 };
        };
        return { jour: j, AM: demi('AM'), PM: demi('PM') };
    })
);

interface CelluleAffichee {
    cle: string;
    jour: JourGrille;
    periode: Periode;
    accessible: boolean;
    classes: string[];
    dispo: { texte: string; conges: boolean; fond: string; titre: string };
    affectation: { texte: string; conges: boolean; fond: string; titre: string };
    localisation: {
        icone?: string;
        couleur?: string;
        texte: string;
        conges: boolean;
        fond: string;
        titre: string;
        cliquable: boolean;
    };
    pastille: { libelle: string; infobulle: string } | null;
}

const lignes = computed(() => {
    const totDispo = Array<number>(jours.value.length * 2).fill(0);
    const totAffect = Array<number>(jours.value.length * 2).fill(0);
    const rangees = props.ressources.map(r => {
        const historique = p.historiqueMad[r.id];
        const madVolante = !!r.is_mad_volante;
        const madMax = r.jours_max_mad || 0;
        const madRestants = madVolante
            ? Math.max(0, madMax - joursMadVolanteConsommes(p.planning, r.id, r.date_debut, r.date_fin_mad))
            : 0;
        const compte = p.comptes.find(u => u.resource_id === r.id);
        const acces = periodeAcces(r, historique);
        const cellules: CelluleAffichee[] = [];
        jours.value.forEach((j, iJour) => {
            const accessible = dansPeriode(acces, j.date);
            PERIODES.forEach((periode, iPeriode) => {
                const v = valeurs(p.planning, r.id, j.date, periode);
                if (v.dispo === '2' && accessible) totDispo[iJour * 2 + iPeriode]!++;
                if (v.affectation !== '1' && v.affectation !== '2' && v.dispo === '2' && accessible)
                    totAffect[iJour * 2 + iPeriode]!++;
                const conges = v.dispo === '3';
                let titreAffectation = accessible
                    ? (LIBELLES_AFFECTATION[v.affectation] ?? 'undefined')
                    : 'Hors période MAD';
                if (v.auteur && v.affectation !== '1' && v.affectation !== '2')
                    titreAffectation += ` - Affecté par: ${v.auteur}`;
                const loc = affichageLocalisation(v);
                const classes = ['gantt-cell'];
                if (j.aujourdhui) classes.push('today');
                else if (j.weekend) classes.push('weekend-cell');
                if (!accessible) classes.push('disabled');
                if (periode === 'PM') classes.push('day-separator');
                classes.push(periode === 'AM' ? 'half-day-separator' : 'day-separator');
                cellules.push({
                    cle: `${j.date}_${periode}`,
                    jour: j,
                    periode,
                    accessible,
                    classes,
                    dispo: {
                        texte: conges ? '' : v.dispo,
                        conges,
                        fond: accessible ? couleurDispo(v.dispo) : '#d0d0d0',
                        titre: `${accessible ? LIBELLES_DISPO[v.dispo] : 'Hors période MAD'} (${periode})`
                    },
                    affectation: {
                        texte: conges ? '' : v.affectation,
                        conges,
                        fond: accessible ? couleurAffectation(v.dispo, v.affectation) : '#d0d0d0',
                        titre: `${conges ? '🏖️ Congés - Aucune affectation possible' : titreAffectation} (${periode})`
                    },
                    localisation: {
                        ...loc,
                        conges: !!loc.conges,
                        fond: accessible ? (conges ? '#e0f7fa' : '#f0f0f0') : '#d0d0d0',
                        cliquable: accessible && !conges,
                        titre: conges
                            ? '🏖️ Congés'
                            : accessible
                              ? loc.texte !== '-'
                                  ? `Localisation ${periode}: ${v.localisation} (cliquez pour modifier)`
                                  : `Cliquez pour définir la localisation ${periode}`
                              : 'Hors période MAD'
                    },
                    pastille: pastilleAstreinte(astreintesDeLaCellule(p.astreintes, r.id, j.date, periode))
                });
            });
        });
        return {
            ressource: r,
            photo: compte?.profile_photo || null,
            infobulle: infobulleRessource(r, p.affectationsSamu[r.id]),
            madVolante,
            madMax,
            madRestants,
            couleurMad: couleurMadVolante(madRestants, madMax),
            disponibles: joursDisponibles(p.planning, r.id, p.annee, p.mois),
            attendus: joursAttendus(r, p.annee, p.mois, historique, p.particularites[r.id]),
            cellules
        };
    });
    const totaux = jours.value.map((j, i) => ({
        jour: j,
        dispo: ((totDispo[i * 2]! + totDispo[i * 2 + 1]!) / 2).toFixed(1),
        affect: ((totAffect[i * 2]! + totAffect[i * 2 + 1]!) / 2).toFixed(1)
    }));
    return {
        rangees,
        totaux,
        dispoMois: (totDispo.reduce((a, b) => a + b, 0) / 2).toFixed(1),
        affectMois: (totAffect.reduce((a, b) => a + b, 0) / 2).toFixed(1)
    };
});

const classeEnTete = (j: JourGrille) => ['day-header', j.aujourdhui ? 'today' : j.weekend ? 'weekend' : ''];
const classeTotal = (j: JourGrille) => [
    'total-cell',
    j.aujourdhui ? 'today' : j.weekend ? 'weekend' : '',
    'day-separator'
];
</script>

<template>
    <table class="gantt-table">
        <thead>
            <tr>
                <th class="resource-header gp-grille__th-ressource" rowspan="3" @click="emit('trier')">Ressource</th>
                <th class="resource-label gp-grille__th-libelles" rowspan="3">
                    <div class="gp-grille__libelles gp-grille__libelles--entete">
                        <div>Disponibilité</div>
                        <div>Affectation</div>
                        <div>Localisation</div>
                    </div>
                </th>
                <th
                    v-for="(s, i) in semaines"
                    :key="s.numero"
                    class="week-number-header gp-grille__semaine"
                    :class="{ 'gp-grille__semaine--paire': i % 2 === 1 }"
                    :colspan="s.jours * 2"
                >
                    Sem. {{ s.numero }}
                </th>
            </tr>
            <tr>
                <th
                    v-for="j in jours"
                    :key="j.date"
                    :class="[
                        ...classeEnTete(j),
                        'day-name-header',
                        { 'gp-grille__jour--surbrillance': surbrillance && j.aujourdhui }
                    ]"
                    colspan="2"
                >
                    {{ j.nom }}<br /><span class="gd-num">{{ j.jour }}</span>
                </th>
            </tr>
            <tr>
                <template v-for="j in jours" :key="j.date">
                    <th :class="classeEnTete(j)" class="gp-grille__periode">AM</th>
                    <th :class="classeEnTete(j)" class="day-separator gp-grille__periode">PM</th>
                </template>
            </tr>
        </thead>
        <tbody id="ganttBody">
            <tr
                v-if="avecCongesOuDates"
                class="school-holidays-row"
                :class="{ 'gantt-row-hidden': masquees.has(-1) }"
                data-hide-id="-1"
                data-hide-name="Congés scolaires, jours fériés, événements"
            >
                <td class="resource-header gp-grille__conges-titre">
                    <button
                        type="button"
                        class="gantt-hide-btn"
                        title="Masquer cette ligne du planning"
                        aria-label="Masquer cette ligne du planning"
                        @click="emit('masquer', -1)"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                    </button>
                    <div class="gp-grille__conges-entete">
                        <AppIcone name="calendar" :scale="28 / 16" class="gp-grille__conges-icone" />
                        <div class="gp-grille__conges-texte">
                            <strong>Congés scolaires, jours fériés, événements particuliers, ...</strong>
                        </div>
                    </div>
                </td>
                <td class="resource-label gp-grille__conges-zones">
                    <div v-if="avecConges" class="gp-grille__zones-legende">
                        <template v-for="z in ZONES_LEGENDE" :key="z.zone">
                            <span
                                class="gp-grille__zone-barre"
                                :class="`gp-grille__zone-barre--${z.zone}`"
                                :title="`Zone ${z.zone} : ${z.academies}`"
                            ></span>
                            <span class="gp-grille__zone-nom" :title="`Zone ${z.zone} : ${z.academies}`">{{
                                z.zone
                            }}</span>
                        </template>
                    </div>
                </td>
                <template v-for="c in congesEtEvenements" :key="c.jour.date">
                    <td
                        v-for="periode in PERIODES"
                        :key="periode"
                        class="gp-grille__conges-case"
                        :class="{
                            'day-separator': periode === 'PM',
                            'gp-grille__conges-case--weekend': c.jour.weekend
                        }"
                    >
                        <div v-if="c[periode].contenu" class="gp-grille__conges-contenu">
                            <div
                                v-for="z in c[periode].zones"
                                :key="z"
                                class="gp-grille__conges-zone"
                                :style="{ backgroundColor: COULEUR_ZONE[z] }"
                                :title="NOM_ZONE[z]"
                            ></div>
                            <span
                                v-for="pa in c[periode].pastilles"
                                :key="pa.cle"
                                class="gp-grille__evenement"
                                :title="pa.infobulle"
                                :style="{ backgroundColor: pa.fond, color: pa.texte, borderColor: pa.bordure }"
                                ><AppIcone
                                    v-if="pa.icone"
                                    :name="pa.icone"
                                    :scale="9 / 16"
                                    class="gp-grille__evenement-icone"
                                />{{ pa.libelle }}</span
                            >
                        </div>
                    </td>
                </template>
            </tr>

            <tr
                v-for="l in lignes.rangees"
                :key="l.ressource.id"
                :class="{ 'gantt-row-hidden': masquees.has(l.ressource.id) }"
                :data-hide-id="l.ressource.id"
                :data-hide-name="`${l.ressource.nom} ${l.ressource.prenom}`"
                :data-resource-name="`${l.ressource.nom} ${l.ressource.prenom}`"
                :data-resource-id="l.ressource.id"
                :data-user-id="l.ressource.user_id || ''"
            >
                <td class="resource-header">
                    <button
                        type="button"
                        class="gantt-hide-btn"
                        title="Masquer cet expert du planning"
                        aria-label="Masquer cet expert du planning"
                        @click="emit('masquer', l.ressource.id)"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                    </button>
                    <div class="gp-grille__ressource">
                        <div class="gp-grille__identite">
                            <div class="gp-grille__photo-cadre">
                                <div
                                    class="gp-grille__photo"
                                    :class="{ 'gp-grille__photo--mad-volante': l.madVolante }"
                                    :title="l.infobulle"
                                >
                                    <img v-if="l.photo" :src="l.photo" alt="" class="gp-grille__image" />
                                    <span v-else class="gp-grille__trigramme">{{ l.ressource.trigramme || '?' }}</span>
                                </div>
                                <span v-if="l.madVolante" class="gp-grille__mad-volante" title="MAD volante">
                                    <svg
                                        class="app-ico gp-grille__mad-volante-icone"
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
                                        <path d="m22 2-7 20-4-9-9-4z" />
                                        <path d="M22 2 11 13" />
                                    </svg>
                                </span>
                            </div>
                            <div class="gp-grille__infos">
                                <strong>{{ l.ressource.nom.toUpperCase() }} {{ l.ressource.prenom }}</strong
                                ><br />
                                <small>{{ l.ressource.trigramme }}</small
                                ><br />
                                <small v-if="l.madVolante" class="gp-grille__mad" :style="{ color: l.couleurMad }"
                                    >{{ l.madRestants }} j restants / {{ l.madMax }} j max</small
                                >
                                <small v-else class="gp-grille__jours"
                                    >Jours: {{ l.disponibles }}/{{ l.attendus }}</small
                                >
                            </div>
                        </div>
                        <div class="gp-grille__actions">
                            <button
                                type="button"
                                class="gp-grille__imprimer"
                                title="Imprimer le calendrier"
                                @click="emit('imprimer', l.ressource)"
                            >
                                <AppIcone name="print" :scale="15 / 16" class="gp-grille__action-icone" />
                            </button>
                            <button
                                type="button"
                                class="gp-grille__envoyer"
                                title="Envoyer par email"
                                @click="emit('envoyer', l.ressource)"
                            >
                                <AppIcone name="mail" :scale="15 / 16" class="gp-grille__action-icone" />
                            </button>
                        </div>
                    </div>
                </td>
                <td class="resource-label gp-grille__libelles-cellule">
                    <div class="gp-grille__libelles">
                        <div>Disponibilité</div>
                        <div>Affectation</div>
                        <div>Localisation</div>
                    </div>
                </td>
                <td
                    v-for="c in l.cellules"
                    :key="c.cle"
                    :class="[...c.classes, { 'gp-grille__case--surbrillance': surbrillance && c.jour.aujourdhui }]"
                    :data-date="c.jour.dateCourte"
                    :data-period="c.periode"
                    class="gp-grille__case"
                    @contextmenu="emit('menu', $event, l.ressource, c.jour, c.periode)"
                >
                    <span
                        v-if="c.pastille"
                        class="astreinte-badge"
                        :class="{ 'gp-grille__pastille--double': c.pastille.libelle.includes('\n') }"
                        :title="c.pastille.infobulle"
                        >{{ c.pastille.libelle }}</span
                    >
                    <div class="gantt-cell-content">
                        <div
                            class="gantt-cell-row gp-grille__ligne"
                            :class="{ disabled: !c.accessible }"
                            :style="{ backgroundColor: c.dispo.fond }"
                            :title="c.dispo.titre"
                            @click="c.accessible && emit('clic', 'disponibilite', l.ressource, c.jour, c.periode)"
                        >
                            <AppIcone v-if="c.dispo.conges" name="umbrella" :scale="13 / 16" />{{ c.dispo.texte }}
                        </div>
                        <div
                            class="gantt-cell-row gp-grille__ligne"
                            :class="{ disabled: !c.accessible }"
                            :style="{ backgroundColor: c.affectation.fond }"
                            :title="c.affectation.titre"
                            @click="c.accessible && emit('clic', 'affectation', l.ressource, c.jour, c.periode)"
                        >
                            <AppIcone v-if="c.affectation.conges" name="umbrella" :scale="13 / 16" />{{
                                c.affectation.texte
                            }}
                        </div>
                        <div
                            :key="c.localisation.texte"
                            class="gantt-cell-row gp-grille__ligne gp-grille__localisation"
                            :class="{ disabled: !c.accessible }"
                            :style="{ backgroundColor: c.localisation.fond }"
                            :title="c.localisation.titre"
                            @click="
                                c.localisation.cliquable && emit('clic', 'localisation', l.ressource, c.jour, c.periode)
                            "
                        >
                            <AppIcone v-if="c.localisation.conges" name="umbrella" :scale="13 / 16" /><AppIcone
                                v-else-if="c.localisation.icone"
                                :name="c.localisation.icone"
                                :scale="12 / 16"
                                class="gp-grille__localisation-icone"
                                :style="{ color: c.localisation.couleur }"
                            />{{ c.localisation.texte }}
                        </div>
                    </div>
                </td>
            </tr>

            <tr class="total-row">
                <td class="total-label">TOTAL</td>
                <td class="total-sublabel">Dispo: {{ lignes.dispoMois }}j<br />Affect: {{ lignes.affectMois }}j</td>
                <td
                    v-for="t in lignes.totaux"
                    :key="t.jour.date"
                    :class="classeTotal(t.jour)"
                    class="gp-grille__total"
                    colspan="2"
                >
                    D:{{ t.dispo }}<br />A:{{ t.affect }}
                </td>
            </tr>
        </tbody>
    </table>
</template>

<style>
/* Classes de l'ancien écran (app.css, darkmode.css, sections.css) ; compléments de ses styles en ligne */
.gp-grille__th-ressource {
    z-index: 50;
    cursor: pointer;
}
.gp-grille__th-libelles {
    z-index: 49;
    vertical-align: middle;
    padding: 4px;
}
.gp-grille__libelles {
    display: flex;
    flex-direction: column;
    height: 90px;
    justify-content: space-between;
}
.gp-grille__libelles--entete {
    height: 60px;
}
.gp-grille__libelles > div {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
.gp-grille__libelles:not(.gp-grille__libelles--entete) > div {
    min-height: 28px;
}
.gp-grille__libelles-cellule {
    vertical-align: middle;
    padding: 4px;
}
.gantt-table .gp-grille__semaine {
    background-color: #2c3e50;
    color: white;
    font-size: 15px;
    font-weight: bold;
    padding: 6px 0;
    letter-spacing: 0.6px;
    z-index: 19;
}
.gantt-table .gp-grille__semaine--paire {
    background-color: #3d566e;
}
.gantt-table .day-name-header {
    text-align: center;
    font-size: 14px;
    line-height: 1.25;
}
.gantt-table .day-name-header .gd-num {
    font-size: 18px;
    font-weight: 800;
}
.gantt-table .gp-grille__periode {
    font-size: 10px;
    padding: 4px;
}
.gantt-table th.gp-grille__jour--surbrillance {
    background-color: #fbc02d;
    font-weight: bold;
}
.gp-grille__conges-titre {
    background-color: #9ea158;
    vertical-align: top;
    padding-top: 8px;
}
.gp-grille__conges-entete {
    display: flex;
    align-items: center;
    gap: 10px;
}
.gp-grille__conges-icone {
    stroke: #fff;
    margin-left: 14px;
    stroke-width: 1.8;
}
.gp-grille__conges-texte {
    color: white;
}
.gp-grille__conges-texte strong {
    font-size: 11px;
}
.gp-grille__conges-zones {
    background-color: #9ea158;
    vertical-align: top;
    text-align: center;
    font-size: 9px;
    padding-top: 8px;
}
.gp-grille__zones-legende {
    display: flex;
    align-items: center;
    gap: 2px;
    justify-content: center;
}
.gp-grille__zone-barre {
    display: inline-block;
    width: 10px;
    height: 3px;
    border-radius: 1px;
    cursor: help;
}
.gp-grille__zone-barre--A {
    background-color: #e91e63;
}
.gp-grille__zone-barre--B {
    background-color: #2196f3;
    margin-left: 3px;
}
.gp-grille__zone-barre--C {
    background-color: #ff9800;
    margin-left: 3px;
}
.gp-grille__zone-nom {
    color: white;
    cursor: help;
}
.gantt-table td.gp-grille__conges-case {
    background-color: #f5f5f5;
    padding: 0;
    min-height: 30px;
    vertical-align: top;
}
.gantt-table td.gp-grille__conges-case--weekend {
    background-color: #e8e8e8;
}
.gp-grille__conges-contenu {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    height: 100%;
    gap: 1px;
    padding-top: 2px;
}
.gp-grille__conges-zone {
    width: 100%;
    height: 4px;
    cursor: help;
}
.gp-grille__evenement {
    display: inline-block;
    padding: 1px 3px;
    border-radius: 6px;
    font-size: 8px;
    font-weight: bold;
    cursor: help;
    align-self: center;
    border: 1px solid;
    margin-bottom: 1px;
}
.gp-grille__evenement-icone {
    margin-right: 2px;
}
.gp-grille__ressource {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.gp-grille__identite {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
}
.gp-grille__photo-cadre {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
}
.gp-grille__photo {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid #1d70b7;
    background-color: #7f8c8d;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: help;
}
.gp-grille__photo--mad-volante {
    border-color: #9c27b0;
}
.gp-grille__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.gp-grille__trigramme {
    color: white;
    font-weight: bold;
    font-size: 14px;
}
.gp-grille__mad-volante {
    position: absolute;
    bottom: -5px;
    right: -6px;
    line-height: 1;
}
.gp-grille__mad-volante-icone {
    width: 13px;
    height: 13px;
    stroke: #7b1fa2;
    fill: #e1bee7;
    vertical-align: top;
    background: white;
    border-radius: 50%;
    padding: 1px;
}
.gp-grille__infos {
    text-align: left;
}
.gp-grille__mad {
    font-size: 10px;
}
.gp-grille__jours {
    font-size: 10px;
    color: #bdc3c7;
}
.gp-grille__actions {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-left: 10px;
}
.gp-grille__imprimer,
.gp-grille__envoyer {
    padding: 4px 8px;
    font-size: 10px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}
.gp-grille__imprimer {
    background-color: #3498db;
}
.gp-grille__envoyer {
    background-color: #27ae60;
}
.gp-grille__action-icone {
    stroke: white;
    vertical-align: middle;
}
.gantt-table td.gp-grille__case {
    min-width: 50px;
    max-width: 50px;
    width: 50px;
    position: relative;
}
.gantt-table td.gp-grille__case--surbrillance {
    background-color: #fff9c4;
    box-shadow: 0 0 10px rgba(251, 192, 45, 0.5);
}
.gp-grille__ligne {
    color: white;
    font-size: 11px;
    min-height: 20px;
}
.gp-grille__localisation {
    color: #333;
    font-size: 8px;
    font-weight: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.gp-grille__localisation-icone {
    margin-right: 3px;
    vertical-align: -2px;
    stroke: currentColor;
}
.gp-grille__pastille--double {
    white-space: pre;
    line-height: 1.3;
    padding: 1px 3px;
}
.gantt-table td.gp-grille__total {
    font-size: 9px;
    padding: 3px;
}
</style>
