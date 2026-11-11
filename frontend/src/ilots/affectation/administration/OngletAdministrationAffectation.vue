<!-- Aide à l'affectation › onglet « Administration » (administrateur) : déploiements de SAMU (légende, frises,
     historique, modification, suppression ; rafraîchissements et import Asana), connexion Asana (projets, import en masse),
     correspondance des activités, modèle PowerPoint et nom des fichiers d'export, couleurs des étapes. Onglet de
     l'application (ApplicationAffectation.vue). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DeploiementAdmin, EvenementLie } from '@/api/affectation';
import { ErreurApi } from '@/api/client';
import { apiAffectation } from '@/api/affectation';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { ecouter, emettre } from '@/evenements';
import { useAsanaStore } from '../asana/magasin';
import { fondEtape, frise } from './administration';
import CarteAdministration from './CarteAdministration.vue';
import CarteConnexionAsana from './CarteConnexionAsana.vue';
import CarteCorrespondance from './CarteCorrespondance.vue';
import CarteCouleurs from './CarteCouleurs.vue';
import CarteModele from './CarteModele.vue';
import FenetreDeploiement from './FenetreDeploiement.vue';
import FenetreHistorique from './FenetreHistorique.vue';
import FenetreSuppression from './FenetreSuppression.vue';
import IconeAff from './IconeAff.vue';
import { useAdministrationAffectationStore } from './magasin';
import { jourFr } from '../planning/outils';
import './administration.css';

/** Logo servi par l'application (public/img), hors de la construction */
const LOGO_ASANA = '/img/asana-logo.png';
const magasin = useAdministrationAffectationStore();
const asana = useAsanaStore();
const { demande, repondre, confirmer } = fournirConfirmation();
const annonce = ref<{ texte: string; erreur: boolean } | null>(null);

function annoncer(texte: string, erreur = false, duree = 4000) {
    annonce.value = { texte, erreur };
    setTimeout(() => {
        if (annonce.value?.texte === texte) annonce.value = null;
    }, duree);
}

const etapes = computed(() => magasin.config?.stages ?? []);
const fond = (k: string) => fondEtape(magasin.couleurs, magasin.motifs, k);
const frises = computed(() => {
    const cfg = magasin.config;
    const out = new Map<number, ReturnType<typeof frise>>();
    if (cfg) for (const p of magasin.deploiements) out.set(p.id, frise(p, cfg, magasin.couleurs, magasin.motifs));
    return out;
});

/** Déploiements modifiés : grille des déploiements prévenue, liste relue (écoute ci-dessous) */
const deploiementsModifies = () => emettre('deploiements-modifies');

// ── Formulaire, historique ───────────────────────────────────────────────────

/** Déploiement modifié dans le formulaire ; null : nouveau ; undefined : formulaire fermé */
const formulaire = ref<DeploiementAdmin | null | undefined>(undefined);
const historique = ref<DeploiementAdmin | null>(null);

function enregistre() {
    formulaire.value = undefined;
    deploiementsModifies();
}

// ── Suppression ──────────────────────────────────────────────────────────────

const suppression = ref<{ p: DeploiementAdmin; evenements: EvenementLie[] } | null>(null);

async function supprimer(p: DeploiementAdmin, mode?: 'keep' | 'delete') {
    if (!mode && !(await confirmer(`Supprimer le déploiement « ${p.samu_name} » ?`, 'Supprimer'))) return;
    try {
        const r = await apiAffectation.supprimerDeploiement(p.id, mode);
        suppression.value = null;
        deploiementsModifies();
        if (r.eventsRemoved)
            annoncer(
                `Déploiement supprimé avec ${r.eventsRemoved} événement(s) ; ${r.planningReset} demi-journée(s) de planification remises en « Disponible / En attente d'affectation ».`,
                false,
                7000
            );
    } catch (e) {
        const d = e instanceof ErreurApi ? (e.donnees as { code?: string; events?: EvenementLie[] } | null) : null;
        if (d?.code === 'EVENTS_LINKED') {
            suppression.value = { p, evenements: d.events ?? [] };
            return;
        }
        annoncer((e as Error).message, true, 7000);
    }
}

// ── Ouverture ────────────────────────────────────────────────────────────────

let arreterEcoute: (() => void) | null = null;
onMounted(() => {
    void magasin.charger();
    // Déploiements modifiés (ici, ou par les fenêtres Asana) : liste relue
    arreterEcoute = ecouter('deploiements-modifies', () => void magasin.relireDeploiements());
});
onBeforeUnmount(() => arreterEcoute?.());
surReouverture(() => void magasin.charger());
</script>

<template>
    <h2>Administration</h2>

    <CarteAdministration id="affCardDeploy" titre="Déploiements de SAMU" icone="rocket">
        <template #actions>
            <span class="aff-entete-actions">
                <button
                    id="affRefreshAll"
                    type="button"
                    class="aff-btn"
                    :class="{ 'aff-busy': asana.toutEnCours }"
                    title="Relire dans Asana tous les déploiements qui ont un projet correspondant (rubriques nouvelles ou modifiées uniquement)"
                    @click="asana.toutRafraichir()"
                >
                    <IconeAff nom="asanasync" classe="aff-ico-sm" />{{
                        asana.toutEnCours ? 'Rafraîchissement en cours…' : 'Tout rafraîchir depuis Asana'
                    }}
                </button>
                <button
                    type="button"
                    class="aff-btn"
                    title="Récupérer les dates d'un projet de déploiement depuis un export CSV d'Asana"
                    @click="asana.ouvrirImport()"
                >
                    <IconeAff nom="save" classe="aff-ico-sm" />Importer depuis Asana
                </button>
                <button type="button" class="aff-btn aff-btn-primary" @click="formulaire = null">
                    <IconeAff nom="plus" classe="aff-ico-sm" />Nouveau déploiement
                </button>
            </span>
        </template>
        <div id="affLegend" class="aff-legend">
            <span v-for="st in etapes" :key="st.key"><i :style="fond(st.key)"></i>{{ st.label }}</span>
        </div>
        <div id="affProjects">
            <p v-if="magasin.erreur" class="aff-error aff-proj-erreur">Chargement impossible : {{ magasin.erreur }}</p>
            <p v-else-if="!magasin.charge" class="aff-muted aff-proj-vide">Chargement…</p>
            <p v-else-if="!magasin.deploiements.length" class="aff-muted aff-proj-vide">
                Aucun déploiement pour le moment. Cliquez sur « Nouveau déploiement » pour commencer.
            </p>
            <template v-else>
                <div v-for="p in magasin.deploiements" :key="p.id" class="aff-proj">
                    <div>
                        <div class="aff-proj-name">
                            {{ p.samu_name
                            }}<img
                                v-if="p.from_asana"
                                :src="LOGO_ASANA"
                                alt="Asana"
                                title="Projet repris d'Asana"
                                class="aff-logo-asana"
                            />
                        </div>
                        <div class="aff-proj-sub">
                            <IconeAff nom="user" />{{ p.chef_projet_nom || 'Chef de projet non défini' }}
                        </div>
                        <div class="aff-proj-sub"><IconeAff nom="flag" />Début : {{ jourFr(p.date_debut) }}</div>
                    </div>
                    <div v-if="frises.get(p.id)">
                        <div class="aff-tl">
                            <span
                                v-for="(s, i) in frises.get(p.id)!.segments"
                                :key="`s${i}`"
                                class="aff-tl-seg"
                                :style="`left:${s.gauche}%;width:${s.largeur}%;${s.style}`"
                                :title="s.titre"
                            ></span>
                            <span
                                v-for="r in frises.get(p.id)!.reperes"
                                :key="r.cle"
                                class="aff-tl-mark"
                                :style="`left:${r.position}%;${r.style}`"
                                :title="r.titre"
                            ></span>
                        </div>
                        <div class="aff-tl-scale">
                            <span>{{ frises.get(p.id)!.debut }}</span
                            ><span>{{ frises.get(p.id)!.fin }}</span>
                        </div>
                    </div>
                    <div class="aff-row-actions">
                        <button
                            type="button"
                            class="aff-icon-btn aff-icon-btn--asana-taches"
                            title="Tâches du projet Asana : consulter les échéances et remplacer une donnée reprise"
                            @click="asana.ouvrirTaches(p.id)"
                        >
                            <IconeAff nom="asanatasks" classe="aff-ico-sm" />
                        </button>
                        <button
                            type="button"
                            class="aff-icon-btn aff-asyn aff-icon-btn--asana"
                            title="Rafraîchir depuis Asana : reprend les dates nouvelles ou modifiées du projet Asana de ce SAMU"
                            :class="{ 'aff-busy': asana.enCours.has(p.id) }"
                            @click="asana.rafraichir(p.id)"
                        >
                            <IconeAff nom="asanasync" classe="aff-ico-sm" />
                        </button>
                        <button
                            type="button"
                            class="aff-icon-btn aff-icon-btn--historique"
                            title="Historique : qui a modifié quoi et quand"
                            @click="historique = p"
                        >
                            <IconeAff nom="search" classe="aff-ico-sm" />
                        </button>
                        <button
                            type="button"
                            class="aff-icon-btn aff-icon-btn--modifier"
                            title="Modifier les dates"
                            @click="formulaire = p"
                        >
                            <IconeAff nom="pencil" classe="aff-ico-sm" />
                        </button>
                        <button
                            type="button"
                            class="aff-icon-btn aff-icon-btn--supprimer"
                            title="Supprimer ce déploiement"
                            @click="supprimer(p)"
                        >
                            <IconeAff nom="trash" classe="aff-ico-sm" />
                        </button>
                    </div>
                </div>
            </template>
        </div>
    </CarteAdministration>

    <CarteAdministration
        id="affAsanaCard"
        titre="Connexion Asana"
        icone="save"
        sous-titre="Récupération des dates des projets de déploiement (lecture seule)"
    >
        <CarteConnexionAsana />
    </CarteAdministration>

    <CarteCorrespondance />
    <CarteModele />
    <CarteCouleurs />

    <FenetreDeploiement
        v-if="formulaire !== undefined && magasin.config"
        :deploiement="formulaire"
        @fermer="formulaire = undefined"
        @enregistre="enregistre"
        @annonce="annoncer"
    />
    <FenetreHistorique v-if="historique" :deploiement="historique" @fermer="historique = null" />
    <FenetreSuppression
        v-if="suppression"
        :deploiement="suppression.p"
        :evenements="suppression.evenements"
        @fermer="suppression = null"
        @supprimer="mode => supprimer(suppression!.p, mode)"
    />

    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :label-annuler="demande?.labelAnnuler"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />
    <div v-if="annonce" class="aff-toast" :class="{ err: annonce.erreur }" role="status">{{ annonce.texte }}</div>
</template>

<style>
.aff-logo-asana {
    width: 14px;
    height: 14px;
    vertical-align: -2px;
    margin-left: 5px;
    object-fit: contain;
}
.aff-icon-btn--asana-taches {
    background: #8e6cc9;
}
.aff-icon-btn--asana {
    background: #f06a6a;
}
.aff-icon-btn--historique {
    background: #6b7a8d;
}
.aff-icon-btn--modifier {
    background: #3498db;
}
.aff-icon-btn--supprimer {
    background: #d60b51;
}
</style>
