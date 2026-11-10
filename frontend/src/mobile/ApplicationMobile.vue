<!-- Application mobile « Mon planning » : mire et double authentification (communes avec le bureau,
     connexion/MireConnexion.vue), planning d'une ressource (vues Jour, Semaine, Mois ; choix de l'expert ; tiroir d'une
     demi-journée), mode sombre, déconnexion, carte « Autour de moi » -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import MireConnexion from '@/connexion/MireConnexion.vue';
import CarteAutourDeMoi from './CarteAutourDeMoi.vue';
import PlanningMobile from './PlanningMobile.vue';
import {
    ACTIVITES,
    activite,
    deplacer,
    depuisIso,
    EMOJIS_ACTIVITES,
    enConge,
    evenementsEntre,
    iconeDuLibelle,
    LIBELLES_VUES,
    libellePeriode,
    versIso,
    type EvenementMobile,
    type Periode,
    type Planification,
    type Vue
} from './planning';
import { entete, memoriserUtilisateur, utilisateurMemorise, type UtilisateurMobile } from './session';

interface RessourceMobile {
    id: number;
    nom: string;
    prenom: string;
    actif: number | boolean;
}

type Ecran = 'chargement' | 'mire' | 'acces' | 'planning';

const ecran = ref<Ecran>('chargement');
const texteChargement = ref('Vérification de la session…');
const utilisateur = ref<UtilisateurMobile | null>(null);
const ressources = ref<RessourceMobile[]>([]);
const planification = ref<Planification>({});
const evenements = ref<EvenementMobile[]>([]);
const ressource = ref<number | null>(null);
/** Vue par défaut selon la largeur (portrait iPhone ~390 px, paysage ~844 px) */
const vue = ref<Vue>(window.innerWidth >= 600 ? 'month' : 'week');
const curseur = ref(new Date());
const VUES: Vue[] = ['day', 'week', 'month'];
const carte = ref(false);

const enTete = computed(() => (utilisateur.value ? entete(utilisateur.value) : null));
const periode = computed(() => libellePeriode(vue.value, curseur.value));
/** Planning recréé à chaque changement de vue, de période ou de ressource */
const clePlanning = computed(() => `${vue.value}|${versIso(curseur.value)}|${ressource.value}`);

// ── Mode sombre (préférence partagée avec l'application : gp_color_mode) ──

const sombre = ref(document.documentElement.classList.contains('dark-mode'));
function basculerMode() {
    sombre.value = !sombre.value;
    document.documentElement.classList.toggle('dark-mode', sombre.value);
    try {
        localStorage.setItem('gp_color_mode', sombre.value ? 'dark' : 'light');
    } catch {
        /* stockage indisponible */
    }
}

// ── Données ──────────────────────────────────────────────────────────────────

async function charger() {
    ecran.value = 'chargement';
    texteChargement.value = 'Chargement…';
    const [rR, sR] = await Promise.all([
        fetch('/api/resources', { credentials: 'include' }),
        fetch('/api/schedule', { credentials: 'include' })
    ]);
    if (rR.status === 401 || sR.status === 401) {
        memoriserUtilisateur(null);
        ecran.value = 'mire';
        return false;
    }
    ressources.value = ((await rR.json()) as RessourceMobile[]).filter(r => r.actif);
    planification.value = (await sR.json()) as Planification;
    if (!ressource.value && ressources.value.length) ressource.value = ressources.value[0]!.id;
    try {
        const r = await fetch('/api/mobile-events', { credentials: 'include' });
        evenements.value = r.ok ? (((await r.json()) as { events?: EvenementMobile[] }).events ?? []) : [];
    } catch {
        evenements.value = [];
    }
    return true;
}

async function connecte(u: UtilisateurMobile) {
    memoriserUtilisateur(u);
    utilisateur.value = u;
    ressource.value = u.resourceId || null;
    if (await charger()) ecran.value = 'planning';
}

async function deconnecter() {
    memoriserUtilisateur(null);
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    location.reload();
}

function choisirVue(v: Vue) {
    vue.value = v;
}
function naviguer(sens: number) {
    curseur.value = deplacer(vue.value, curseur.value, sens);
}
function ouvrirJour(d: Date) {
    curseur.value = d;
    vue.value = 'day';
}

// ── Tiroir d'une demi-journée ────────────────────────────────────────────────

/** Demi-journée du tiroir (gardée à la fermeture, le temps de l'animation) */
const tiroir = ref<{ iso: string; periode: Periode } | null>(null);
const tiroirOuvert = ref(false);
function ouvrirTiroir(iso: string, periode: Periode) {
    tiroir.value = { iso, periode };
    tiroirOuvert.value = true;
}
const contenuTiroir = computed(() => {
    const t = tiroir.value;
    if (!t || !ressource.value) return null;
    const code = activite(planification.value, ressource.value, t.iso, t.periode);
    return {
        titre: `${depuisIso(t.iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${t.periode === 'AM' ? 'Matin' : 'Après-midi'}`,
        act: code && ACTIVITES[code] ? { code, ...ACTIVITES[code]! } : null,
        conge: enConge(planification.value, ressource.value, t.iso),
        evenements: evenementsEntre(evenements.value, t.iso, t.iso)
    };
});

onMounted(async () => {
    const u = utilisateurMemorise();
    if (!u) {
        ecran.value = 'mire';
        return;
    }
    utilisateur.value = u;
    ressource.value = u.resourceId || null;
    if (await charger()) ecran.value = 'planning';
});
</script>

<template>
    <div id="app">
        <!-- En-tête -->
        <header id="header" :class="{ hidden: ecran !== 'planning' && ecran !== 'acces' }">
            <div id="userCircle">
                <span id="userInitials">{{ enTete?.initiales ?? '??' }}</span>
            </div>
            <span id="userNameEl">{{ enTete?.nom }}</span>
            <span id="userRoleBadge">{{ enTete?.profil ?? 'Expert Métier' }}</span>
            <div class="spacer"></div>
            <button
                id="nearBtn"
                class="icon-btn"
                type="button"
                title="Lieux autour de moi"
                aria-label="Lieux autour de moi"
                @click="carte = true"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
                    <circle cx="12" cy="10" r="2.6" />
                </svg>
            </button>
            <button
                id="colorModeBtn"
                class="icon-btn"
                type="button"
                :title="sombre ? 'Passer en mode clair' : 'Passer en mode sombre'"
                aria-label="Mode sombre / clair"
                @click="basculerMode"
            >
                <svg v-if="sombre" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path
                        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                    />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
            </button>
            <button id="logoutBtn" type="button" title="Déconnexion" aria-label="Déconnexion" @click="deconnecter">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="m16 17 5-5-5-5M21 12H9" />
                </svg>
            </button>
        </header>

        <!-- Barre d'outils -->
        <div id="toolbar" :class="{ hidden: ecran !== 'planning' }">
            <div class="mob-onglets">
                <div id="viewTabs" class="view-tabs">
                    <button
                        v-for="v in VUES"
                        :key="v"
                        type="button"
                        class="view-tab"
                        :class="{ active: v === vue }"
                        @click="choisirVue(v)"
                    >
                        {{ LIBELLES_VUES[v] }}
                    </button>
                </div>
            </div>
            <div class="nav-row">
                <button id="prevBtn" type="button" class="nav-btn" aria-label="Précédent" @click="naviguer(-1)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <span id="periodLabel">{{ periode }}</span>
                <button id="nextBtn" type="button" class="nav-btn" aria-label="Suivant" @click="naviguer(1)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
            </div>
            <div id="expertRow">
                <label for="expertSelect">Expert :</label>
                <select
                    id="expertSelect"
                    :value="ressource ?? ''"
                    @change="ressource = Number(($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="r in ressources" :key="r.id" :value="r.id">{{ r.prenom }} {{ r.nom }}</option>
                </select>
            </div>
        </div>

        <!-- Contenu -->
        <main id="content">
            <div id="loadingScreen" :class="{ hidden: ecran !== 'chargement' }">
                <div class="spinner"></div>
                <div id="loadingText">{{ texteChargement }}</div>
            </div>
            <div id="loginScreen" :class="{ hidden: ecran !== 'mire' }">
                <div id="loginPage" class="lp-page">
                    <MireConnexion mode="mobile" @connecte="connecte" />
                </div>
            </div>
            <!-- Jamais affiché (anomalie consignée : accès mobile réservé aux experts non appliqué) -->
            <div id="accessDeniedScreen" :class="{ hidden: ecran !== 'acces' }">
                <div class="big-icon">🔒</div>
                <h2>Accès réservé</h2>
                <p>Cette application est réservée<br />aux experts métier.</p>
            </div>
            <div id="planningScreen" class="screen" :class="{ hidden: ecran !== 'planning' }">
                <PlanningMobile
                    v-if="ecran === 'planning'"
                    :key="clePlanning"
                    :vue="vue"
                    :curseur="curseur"
                    :ressource="ressource"
                    :planification="planification"
                    :evenements="evenements"
                    @demi-journee="ouvrirTiroir"
                    @jour="ouvrirJour"
                />
            </div>
        </main>
    </div>

    <CarteAutourDeMoi :ouverte="carte" @fermer="carte = false" />

    <!-- Tiroir d'une demi-journée -->
    <div id="drawerOverlay" :class="{ visible: tiroirOuvert }" @click="tiroirOuvert = false"></div>
    <div id="drawer" :class="{ open: tiroirOuvert }">
        <div class="drawer-handle"></div>
        <div id="drawerTitle">{{ contenuTiroir?.titre }}</div>
        <div v-if="contenuTiroir" id="drawerBody" :key="`${tiroir?.iso}${tiroir?.periode}`">
            <div
                v-if="contenuTiroir.act"
                class="act-badge mob-tiroir-badge"
                :style="{ background: contenuTiroir.act.color }"
            >
                {{ EMOJIS_ACTIVITES[contenuTiroir.act.code] || '' }} {{ contenuTiroir.act.label }}
            </div>
            <div v-else-if="contenuTiroir.conge" class="conge-banner">🏖️ Journée de congé</div>
            <div v-else class="no-data">Aucune activité planifiée</div>
            <div v-for="e in contenuTiroir.evenements" :key="e.id" class="mob-tiroir-evt">
                <div class="mob-tiroir-evt__libelle">
                    <!-- eslint-disable-next-line vue/no-v-html -- tracés fixes de l'application -->
                    <svg class="evt-ico" viewBox="0 0 24 24" aria-hidden="true" v-html="iconeDuLibelle(e.label)"></svg
                    >{{ e.label }}
                </div>
                <div v-if="e.location_libelle_court" class="mob-tiroir-evt__lieu">
                    📍 {{ e.location_libelle_court }}
                </div>
            </div>
        </div>
        <div v-else id="drawerBody"></div>
    </div>
</template>
