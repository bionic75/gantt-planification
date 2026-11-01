<!-- Accueil : qui travaille et sur quelle mission, événements du jour et de la semaine, accès rapides -->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppIcone from '@/composants/AppIcone.vue';
import type { NomIcone } from '@/composants/icones';
import { surReouverture } from '@/ilots/activation';
import { demandeAjoutLieu, demandeNouvelEvenement } from '@/ilots/demandes';
import { ouvrirApplication, ouvrirOnglet } from '@/liaison';
import { dateFr, dateLongue, memeMission, type JourPersonne, type Mission } from './calculs';
import FriseDeploiements from './FriseDeploiements.vue';
import LigneEvenement from './LigneEvenement.vue';
import { useAccueilStore } from './magasin';
import './accueil.css';

const accueil = useAccueilStore();

onMounted(() => void accueil.charger());
// Comme à chaque ouverture d'un onglet : données rechargées
surReouverture(() => void accueil.charger());

interface Raccourci {
    id: string;
    libelle: string;
    description: string;
    icone: NomIcone | string;
    visible: boolean;
    action: () => void;
}

const raccourcis = computed<Raccourci[]>(() => {
    const a = accueil.acces;
    if (!a) return [];
    return [
        {
            id: 'affecter',
            libelle: 'Affecter à une mission',
            description: 'Planification',
            icone: 'target',
            visible: a.planning && a.affecter,
            action: () => ouvrirOnglet('planning')
        },
        {
            id: 'planning',
            libelle: 'Renseigner mon planning',
            description: 'Planification',
            icone: 'calendar',
            visible: a.planning && a.ressource,
            action: () => ouvrirOnglet('planning')
        },
        {
            id: 'evenement',
            libelle: 'Créer un événement',
            description: 'Événements',
            icone: 'flag',
            visible: a.evenements,
            action: () => {
                demandeNouvelEvenement.value = true;
                ouvrirOnglet('evenements');
            }
        },
        {
            id: 'lieu',
            libelle: 'Ajouter un lieu',
            description: 'Hôtel, restaurant… (SAMU-SAS TripAdVisor)',
            icone: 'repere',
            visible: a.lieux,
            action: () => {
                demandeAjoutLieu.value = true;
                ouvrirOnglet('tripadvisor');
            }
        },
        {
            id: 'astreinte',
            libelle: 'M’ajouter en astreinte HO',
            description: 'Astreintes',
            icone: 'bell',
            visible: a.astreintes && accueil.peutSInscrireHo,
            action: () => ouvrirOnglet('astreintesGestion')
        },
        {
            id: 'deploiement',
            libelle: 'Gérer le planning d’un déploiement',
            description: 'Aide à l’affectation opérationnelle',
            icone: 'rocket',
            visible: a.affectation,
            action: () => ouvrirApplication('affectation')
        },
        {
            id: 'deplacements',
            libelle: 'Gérer mes déplacements',
            description: 'Suivi des déplacements',
            icone: 'car',
            visible: a.deplacements,
            action: () => ouvrirApplication('deplacements')
        },
        {
            id: 'cra',
            libelle: 'Voir et gérer mes CRA',
            description: 'CRA',
            icone: 'doc',
            visible: a.cra,
            action: () => ouvrirOnglet('cra')
        }
    ].filter(r => r.visible);
});

const premierJour = computed(() => accueil.semaine[0]?.date ?? accueil.aujourdhui);
const dernierJour = computed(() => accueil.semaine[accueil.semaine.length - 1]?.date ?? accueil.aujourdhui);
const libelleSemaine = computed(() =>
    accueil.estSemaineEnCours ? 'cette semaine' : 'la semaine du ' + dateFr(premierJour.value).slice(0, 5)
);
const periodesHo = [
    { cle: 'AM', libelle: 'Matin' },
    { cle: 'PM', libelle: 'Après-midi' }
] as const;

const titreAujourdhui = computed(() => dateLongue(accueil.aujourdhui));

function intituleMission(m: Mission): string {
    return m.lieu && !m.enAttente ? `${m.libelle} · ${m.lieu}` : m.enAttente ? m.libelle : `${m.libelle}`;
}

/** Une ou deux missions à afficher pour un jour (matin / après-midi) */
function missions(jour: JourPersonne): Array<{ moment: string | null; mission: Mission }> {
    if (memeMission(jour) && jour.matin) return [{ moment: null, mission: jour.matin }];
    const liste: Array<{ moment: string | null; mission: Mission }> = [];
    if (jour.matin) liste.push({ moment: 'Matin', mission: jour.matin });
    if (jour.apresMidi) liste.push({ moment: 'Après-midi', mission: jour.apresMidi });
    return liste;
}
</script>

<template>
    <div class="ac-racine" data-testid="accueil">
        <div class="ac-entete">
            <h2 class="ac-titre"><AppIcone name="home" :scale="1.6" class="ac-titre__icone" />Accueil</h2>
            <p class="ac-date" data-testid="accueil-date">{{ titreAujourdhui }}</p>
        </div>

        <AppAlert v-if="accueil.erreur" type="error" :description="accueil.erreur" />

        <section v-if="raccourcis.length" class="ac-carte" aria-labelledby="ac-raccourcis">
            <h3 id="ac-raccourcis" class="ac-carte__titre">Accès rapides</h3>
            <div class="ac-raccourcis">
                <button
                    v-for="r in raccourcis"
                    :key="r.id"
                    type="button"
                    class="ac-raccourci"
                    :data-testid="`accueil-${r.id}`"
                    @click="r.action"
                >
                    <span class="ac-raccourci__icone"><AppIcone :name="r.icone" :scale="1.5" /></span>
                    <span class="ac-raccourci__texte">
                        <strong>{{ r.libelle }}</strong>
                        <small>{{ r.description }}</small>
                    </span>
                </button>
            </div>
        </section>

        <div class="ac-colonnes">
            <section class="ac-carte" aria-labelledby="ac-jour">
                <h3 id="ac-jour" class="ac-carte__titre">Aujourd’hui</h3>

                <h4 class="ac-sous-titre"><AppIcone name="users" /> Qui travaille aujourd’hui</h4>
                <p v-if="!accueil.charge" class="ac-vide">Chargement…</p>
                <p v-else-if="!accueil.presentsAujourdhui.length" class="ac-vide" data-testid="accueil-jour-vide">
                    Aucun expert disponible aujourd’hui.
                </p>
                <ul v-else class="ac-liste" data-testid="accueil-jour-presents">
                    <li v-for="p in accueil.presentsAujourdhui" :key="p.id" class="ac-ligne">
                        <span class="ac-nom">{{ p.nom }}</span>
                        <span class="ac-missions">
                            <span
                                v-for="(m, i) in missions(p.jours[0]!)"
                                :key="i"
                                class="ac-mission"
                                :class="{ 'ac-mission--attente': m.mission.enAttente }"
                                :style="{ '--ac-couleur': m.mission.couleur }"
                            >
                                <em v-if="m.moment">{{ m.moment }}</em>
                                {{ intituleMission(m.mission) }}
                            </span>
                        </span>
                    </li>
                </ul>

                <h4 class="ac-sous-titre"><AppIcone name="bell" /> Qui est en astreinte HO</h4>
                <ul class="ac-liste" data-testid="accueil-jour-astreinte-ho">
                    <li v-for="p in periodesHo" :key="p.cle" class="ac-ligne">
                        <span class="ac-evt-periode ac-moment">{{ p.libelle }}</span>
                        <span v-if="accueil.astreintesHoAujourdhui[p.cle].length" class="ac-nom">{{
                            accueil.astreintesHoAujourdhui[p.cle].join(', ')
                        }}</span>
                        <span v-else class="ac-vide">Personne</span>
                    </li>
                </ul>

                <h4 class="ac-sous-titre"><AppIcone name="calendar" /> Événements du jour</h4>
                <p v-if="accueil.charge && !accueil.evenementsAujourdhui.length" class="ac-vide">
                    Aucun événement aujourd’hui.
                </p>
                <ul v-else class="ac-liste" data-testid="accueil-jour-evenements">
                    <LigneEvenement v-for="e in accueil.evenementsAujourdhui" :key="e.id" :evenement="e" />
                </ul>
            </section>

            <section class="ac-carte ac-carte--large" aria-labelledby="ac-semaine">
                <div class="ac-semaine-entete">
                    <h3 id="ac-semaine" class="ac-carte__titre">
                        {{ accueil.estSemaineEnCours ? 'Semaine en cours' : 'Semaine du ' + dateFr(premierJour) }}
                    </h3>
                    <div class="ac-nav" role="group" aria-label="Changer de semaine">
                        <button
                            type="button"
                            class="ac-nav__bouton"
                            title="Semaine précédente"
                            aria-label="Semaine précédente"
                            data-testid="accueil-semaine-precedente"
                            @click="accueil.changerSemaine(-1)"
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                        </button>
                        <span class="ac-nav__periode" data-testid="accueil-semaine-periode">
                            {{ dateFr(premierJour).slice(0, 5) }} – {{ dateFr(dernierJour).slice(0, 5) }}
                        </span>
                        <button
                            type="button"
                            class="ac-nav__bouton"
                            title="Semaine suivante"
                            aria-label="Semaine suivante"
                            data-testid="accueil-semaine-suivante"
                            @click="accueil.changerSemaine(1)"
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </button>
                        <button
                            v-if="!accueil.estSemaineEnCours"
                            type="button"
                            class="ac-nav__retour"
                            title="Revenir à la semaine en cours"
                            data-testid="accueil-semaine-courante"
                            @click="accueil.changerSemaine(0)"
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                            Semaine en cours
                        </button>
                    </div>
                </div>

                <h4 class="ac-sous-titre"><AppIcone name="users" /> Qui travaille {{ libelleSemaine }}</h4>
                <p v-if="!accueil.charge" class="ac-vide">Chargement…</p>
                <p v-else-if="!accueil.presentsSemaine.length" class="ac-vide" data-testid="accueil-semaine-vide">
                    Aucun expert disponible sur cette période.
                </p>
                <div v-else class="ac-defile">
                    <table class="ac-table" data-testid="accueil-semaine-presents">
                        <thead>
                            <tr>
                                <th scope="col">Expert</th>
                                <th
                                    v-for="j in accueil.semaine"
                                    :key="j.date"
                                    scope="col"
                                    :class="{ 'ac-aujourdhui': j.aujourdhui }"
                                >
                                    {{ j.libelle }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="p in accueil.presentsSemaine" :key="p.id">
                                <th scope="row" class="ac-nom">{{ p.nom }}</th>
                                <td
                                    v-for="(jour, i) in p.jours"
                                    :key="i"
                                    :class="{ 'ac-aujourdhui': accueil.semaine[i]?.aujourdhui }"
                                >
                                    <span
                                        v-for="(m, k) in missions(jour)"
                                        :key="k"
                                        class="ac-mission ac-mission--compacte"
                                        :class="{ 'ac-mission--attente': m.mission.enAttente }"
                                        :style="{ '--ac-couleur': m.mission.couleur }"
                                        :title="`${m.moment ? m.moment + ' : ' : ''}${intituleMission(m.mission)}`"
                                    >
                                        <em v-if="m.moment">{{ m.moment === 'Matin' ? 'M' : 'AM' }}</em>
                                        {{ intituleMission(m.mission) }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h4 class="ac-sous-titre"><AppIcone name="calendar" /> Événements de la semaine</h4>
                <p v-if="accueil.charge && !accueil.evenementsSemaine.length" class="ac-vide">
                    Aucun événement sur cette période.
                </p>
                <ul v-else class="ac-liste" data-testid="accueil-semaine-evenements">
                    <LigneEvenement v-for="e in accueil.evenementsSemaine" :key="e.id" :evenement="e" />
                </ul>
            </section>
        </div>

        <FriseDeploiements v-if="accueil.acces?.affectation" />
    </div>
</template>
