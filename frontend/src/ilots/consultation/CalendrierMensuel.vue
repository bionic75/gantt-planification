<!-- Vue calendrier mensuel (bouton de l'en-tête de la planification) : experts disponibles pour l'ANS par
     demi-journée, congés scolaires et dates particulières, sur le mois affiché par la planification ; navigation entre
     les mois, impression. Données : instantané de la planification lu à l'ouverture (liaison). -->
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import AppIcone from '@/composants/AppIcone.vue';
import AppModal from '@/composants/AppModal.vue';
import { surDemande } from '@/cadre/fenetres';
import { usePlanificationStore } from '@/ilots/planification/magasin';
import type { EtatPlanning } from '@/evenements';
import {
    JOURS_SEMAINE,
    NOM_ZONE,
    avecConfig,
    couleurExpert,
    datesDuJour,
    disponibles,
    grilleMois,
    moisVoisin,
    pastille,
    ressourcesAffichees,
    titreMois,
    zonesEnConges,
    type CaseJour
} from './calendrier';
import { imprimerCalendrierMensuel } from './impression';
import './calendriers.css';

const TITRE = 'Vue Calendrier Mensuel';

const ouverte = ref(false);
const etat = shallowRef<EtatPlanning | null>(null);
const annee = ref(0);
const mois = ref(0);
const contenu = ref<HTMLElement | null>(null);

const planification = usePlanificationStore();

// Données de la grille (magasin de la planification), chargées à la première ouverture
surDemande(async () => {
    await planification.charger();
    const e = planification.etatPlanning;
    etat.value = e;
    annee.value = e.annee;
    mois.value = e.mois;
    ouverte.value = true;
});

function naviguer(sens: number) {
    ({ annee: annee.value, mois: mois.value } = moisVoisin(annee.value, mois.value, sens));
}

/** Ressources affichées et leur couleur (rang dans la liste) */
const experts = computed(() =>
    etat.value ? ressourcesAffichees(etat.value).map((r, rang) => ({ ressource: r, couleur: couleurExpert(rang) })) : []
);
const couleurDe = computed(() => new Map(experts.value.map(e => [e.ressource.id, e.couleur])));

function contenuDuJour(c: CaseJour) {
    const e = etat.value!;
    const dates = avecConfig(datesDuJour(e.datesParticulieres, c.date));
    const parPeriode = (garder: (p: string | undefined) => boolean) =>
        dates.filter(sd => garder(sd.period)).map((sd, rang) => pastille(sd, 'JF', rang));
    const presents = (periode: 'AM' | 'PM') =>
        disponibles(
            e,
            experts.value.map(x => x.ressource),
            c.date,
            periode
        ).map(r => ({ id: r.id, trigramme: r.trigramme, couleur: couleurDe.value.get(r.id) }));
    // Pastilles : journée entière, matin puis après-midi (groupes vides non affichés)
    const groupes = [
        { cle: 'journee', liste: parPeriode(p => !p || p === 'FULL'), suffixe: '', classe: '' },
        { cle: 'matin', liste: parPeriode(p => p === 'AM'), suffixe: ' (matin)', classe: 'gp-cm-pastilles--matin' },
        { cle: 'apres-midi', liste: parPeriode(p => p === 'PM'), suffixe: ' (après-midi)', classe: '' }
    ].filter(g => g.liste.length > 0);
    return {
        zones: zonesEnConges(e.conges, c.date),
        groupes,
        expertsMatin: presents('AM'),
        expertsApresMidi: presents('PM')
    };
}

const semaines = computed(() =>
    etat.value
        ? grilleMois(annee.value, mois.value).map(s => ({
              numero: s.numero,
              cases: s.cases.map((c, colonne) => ({
                  cle: c ? c.date : `vide-${s.numero}-${colonne}`,
                  jour: c,
                  contenu: c ? contenuDuJour(c) : null
              }))
          }))
        : []
);

function imprimer() {
    if (contenu.value) imprimerCalendrierMensuel(TITRE, titreMois(annee.value, mois.value), contenu.value);
}
</script>

<template>
    <AppModal
        id="monthlyCalendarModal"
        :opened="ouverte"
        :title="TITRE"
        class="gp-calendrier-mensuel"
        @close="ouverte = false"
    >
        <div ref="contenu" class="gp-calendrier-mensuel__contenu">
            <div class="gp-cm-entete">
                <div class="gp-cm-nav">
                    <button type="button" class="gp-cm-fleche" title="Mois précédent" @click="naviguer(-1)">◀</button>
                    <h2 class="gp-cm-mois">{{ titreMois(annee, mois) }}</h2>
                    <button type="button" class="gp-cm-fleche" title="Mois suivant" @click="naviguer(1)">▶</button>
                </div>
                <p class="gp-cm-sous-titre">Vue d'ensemble des disponibilités par demi-journée</p>
            </div>
            <table class="gp-cm-table">
                <thead>
                    <tr>
                        <th class="gp-cm-sem">Sem.</th>
                        <th
                            v-for="(nom, i) in JOURS_SEMAINE"
                            :key="nom"
                            class="gp-cm-jour-nom"
                            :class="{ 'gp-cm-jour-nom--weekend': i >= 5 }"
                        >
                            {{ nom }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in semaines" :key="s.numero">
                        <td class="gp-cm-sem">{{ s.numero }}</td>
                        <template v-for="c in s.cases" :key="c.cle">
                            <td v-if="!c.jour || !c.contenu" class="gp-cm-vide"></td>
                            <td
                                v-else
                                class="gp-cm-jour"
                                :class="{
                                    'gp-cm-jour--weekend': c.jour.weekend,
                                    'gp-cm-jour--aujourdhui': c.jour.aujourdhui
                                }"
                            >
                                <div class="gp-cm-numero" :class="{ 'gp-cm-numero--aujourdhui': c.jour.aujourdhui }">
                                    {{ c.jour.jour }}
                                </div>
                                <div v-if="c.contenu.zones.length" class="gp-cm-zones">
                                    <div
                                        v-for="z in c.contenu.zones"
                                        :key="z"
                                        class="gp-cm-zone"
                                        :class="`gp-zone--${z}`"
                                        :title="NOM_ZONE[z]"
                                    ></div>
                                </div>
                                <div
                                    v-for="groupe in c.contenu.groupes"
                                    :key="groupe.cle"
                                    class="gp-cm-pastilles"
                                    :class="groupe.classe"
                                >
                                    <span
                                        v-for="p in groupe.liste"
                                        :key="p.cle"
                                        class="gp-cm-pastille"
                                        :title="p.infobulle + groupe.suffixe"
                                        :style="{ backgroundColor: p.fond, color: p.texte, borderColor: p.bordure }"
                                        ><AppIcone v-if="p.icone" :name="p.icone" :scale="0.5" />{{ p.libelle }}</span
                                    >
                                </div>
                                <div class="gp-cm-demi gp-cm-demi--matin">
                                    <div class="gp-cm-demi-titre">☀️ Matin:</div>
                                    <div class="gp-cm-trigrammes">
                                        <span
                                            v-for="x in c.contenu.expertsMatin"
                                            :key="x.id"
                                            class="gp-cm-trigramme"
                                            :style="{ backgroundColor: x.couleur }"
                                            >{{ x.trigramme }}</span
                                        >
                                        <span v-if="!c.contenu.expertsMatin.length" class="gp-cm-aucun">Aucun</span>
                                    </div>
                                </div>
                                <div class="gp-cm-demi">
                                    <div class="gp-cm-demi-titre">🌙 A-midi:</div>
                                    <div class="gp-cm-trigrammes">
                                        <span
                                            v-for="x in c.contenu.expertsApresMidi"
                                            :key="x.id"
                                            class="gp-cm-trigramme"
                                            :style="{ backgroundColor: x.couleur }"
                                            >{{ x.trigramme }}</span
                                        >
                                        <span v-if="!c.contenu.expertsApresMidi.length" class="gp-cm-aucun">Aucun</span>
                                    </div>
                                </div>
                            </td>
                        </template>
                    </tr>
                </tbody>
            </table>
            <div class="gp-cm-legende">
                <div class="gp-cm-legende-titre">Légende des experts:</div>
                <div class="gp-cm-legende-liste">
                    <div v-for="x in experts" :key="x.ressource.id" class="gp-cm-legende-expert">
                        <span class="gp-cm-legende-couleur" :style="{ backgroundColor: x.couleur }"></span>
                        <span class="gp-cm-legende-nom"
                            >{{ x.ressource.trigramme }} - {{ x.ressource.nom }} {{ x.ressource.prenom }}</span
                        >
                    </div>
                </div>
            </div>
        </div>
        <template #footer>
            <button type="button" class="gp-calendrier-mensuel__imprimer" @click="imprimer">🖨️ Imprimer</button>
            <button type="button" class="gp-calendrier-mensuel__fermer" @click="ouverte = false">Fermer</button>
        </template>
    </AppModal>
</template>

<style>
/* Fenêtre téléportée hors du composant : règles ciblées par sa classe */
.gp-modale.gp-calendrier-mensuel .gp-modale__boite {
    width: min(1200px, 95%);
}
.gp-calendrier-mensuel__contenu {
    max-height: 70vh;
    overflow-y: auto;
    margin: 20px 0;
}
.gp-calendrier-mensuel__imprimer,
.gp-calendrier-mensuel__fermer {
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    cursor: pointer;
}
.gp-calendrier-mensuel__imprimer {
    background-color: #3498db;
}
.gp-calendrier-mensuel__fermer {
    background-color: #95a5a6;
}
</style>
