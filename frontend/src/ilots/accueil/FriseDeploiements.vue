<!-- Déploiements en cours sur une frise mensuelle : barres (cadrage, déploiement opérationnel) et points (visite métier,
     mise en service, mise en production, VFT, formation) -->
<script setup lang="ts">
import { computed } from 'vue';
import { dateFr } from './calculs';
import {
    COULEURS_DEFAUT,
    ETAPES_BARRE,
    ETAPES_POINT,
    LIBELLES_ETAPES,
    pourcent,
    type Barre,
    type Point
} from './deploiements';
import { useAccueilStore } from './magasin';

const accueil = useAccueilStore();

const couleur = (cle: string) => accueil.couleursEtapes[cle] || COULEURS_DEFAUT[cle] || '#888888';
/** Repère du jour dans la frise, absent hors de la période affichée */
const repereAujourdhui = computed(() =>
    accueil.aujourdhui >= accueil.frise.debut && accueil.aujourdhui <= accueil.frise.fin
        ? pourcent(accueil.frise, accueil.aujourdhui) + 50 / accueil.frise.jours
        : null
);
const periode = computed(
    () => `${accueil.frise.mois[0]?.libelle} – ${accueil.frise.mois[accueil.frise.mois.length - 1]?.libelle}`
);

const infoBarre = (b: Barre) => `${b.libelle} : ${dateFr(b.debut)} → ${dateFr(b.fin)}`;
const infoPoint = (p: Point) => `${p.libelle} : ${dateFr(p.date)}${p.fin ? ' → ' + dateFr(p.fin) : ''}`;
</script>

<template>
    <section class="ac-carte" aria-labelledby="ac-deploiements" data-testid="accueil-deploiements">
        <div class="ac-semaine-entete">
            <h3 id="ac-deploiements" class="ac-carte__titre">Déploiements en cours</h3>
            <div class="ac-nav" role="group" aria-label="Changer de période">
                <button
                    type="button"
                    class="ac-nav__bouton"
                    title="Trois mois plus tôt"
                    aria-label="Trois mois plus tôt"
                    data-testid="accueil-frise-precedente"
                    @click="accueil.changerFrise(-3)"
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <span class="ac-nav__periode ac-nav__periode--large" data-testid="accueil-frise-periode">{{
                    periode
                }}</span>
                <button
                    type="button"
                    class="ac-nav__bouton"
                    title="Trois mois plus tard"
                    aria-label="Trois mois plus tard"
                    data-testid="accueil-frise-suivante"
                    @click="accueil.changerFrise(3)"
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <button
                    v-if="accueil.decalageMois !== 0"
                    type="button"
                    class="ac-nav__retour"
                    title="Revenir au mois en cours"
                    data-testid="accueil-frise-courante"
                    @click="accueil.changerFrise(0)"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                    Mois en cours
                </button>
            </div>
        </div>

        <ul class="ac-legende" aria-label="Légende">
            <li v-for="cle in ETAPES_BARRE" :key="cle">
                <i class="ac-legende__barre" :style="{ background: couleur(cle) }" />{{ LIBELLES_ETAPES[cle] }}
            </li>
            <li v-for="cle in ETAPES_POINT" :key="cle">
                <i class="ac-legende__point" :style="{ background: couleur(cle) }" />{{ LIBELLES_ETAPES[cle] }}
            </li>
        </ul>

        <p v-if="accueil.charge && !accueil.lignesFrise.length" class="ac-vide" data-testid="accueil-frise-vide">
            Aucun déploiement en cours sur cette période.
        </p>
        <div v-else class="ac-defile">
            <div class="ac-frise" data-testid="accueil-frise">
                <div class="ac-frise__ligne ac-frise__ligne--tete">
                    <div class="ac-frise__nom">SAMU</div>
                    <div class="ac-frise__piste ac-frise__piste--tete">
                        <span
                            v-for="m in accueil.frise.mois"
                            :key="m.debut"
                            class="ac-frise__mois"
                            :style="{ width: m.largeur + '%' }"
                            >{{ m.libelle }}</span
                        >
                    </div>
                </div>
                <div
                    v-for="l in accueil.lignesFrise"
                    :key="l.id"
                    class="ac-frise__ligne"
                    data-testid="accueil-frise-ligne"
                >
                    <div class="ac-frise__nom" :title="l.nom">{{ l.nom }}</div>
                    <div class="ac-frise__piste">
                        <span
                            v-for="m in accueil.frise.mois"
                            :key="m.debut"
                            class="ac-frise__fond"
                            :style="{ width: m.largeur + '%' }"
                        />
                        <span
                            v-if="repereAujourdhui !== null"
                            class="ac-frise__aujourdhui"
                            :style="{ left: repereAujourdhui + '%' }"
                            title="Aujourd’hui"
                        />
                        <span
                            v-for="(b, i) in l.barres"
                            :key="'b' + i"
                            class="ac-frise__barre"
                            :class="{
                                'ac-frise__barre--avant': b.coupeeAvant,
                                'ac-frise__barre--apres': b.coupeeApres,
                                'ac-frise__barre--deploiement': b.cle === 'deploiement'
                            }"
                            :style="{ left: b.gauche + '%', width: b.largeur + '%', background: b.couleur }"
                            :title="infoBarre(b)"
                        />
                        <span
                            v-for="(p, i) in l.points"
                            :key="'p' + i"
                            class="ac-frise__point"
                            :style="{ left: p.gauche + '%', background: p.couleur }"
                            :title="infoPoint(p)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
