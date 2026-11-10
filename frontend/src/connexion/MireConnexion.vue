<!-- Mire de connexion commune au bureau et au mobile (présentation adaptée à la largeur de l'écran, mire.css) :
     identifiants, double authentification dans la carte (EtapeDoubleAuthentification).
     Bureau : identifiants déjà utilisés sur ce poste ou gestionnaire de mots de passe du navigateur, choix du profil d'un
     compte à plusieurs profils, mot de passe oublié, changement de mot de passe imposé.
     Mobile (POST /mobile-login) : profil choisi par le serveur, mot de passe à changer refusé par le serveur.
     Rendue dans un conteneur #loginPage (index.html, ApplicationMobile.vue), auquel s'appliquent les styles. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { connexionApi, type ProfilConnexion, type ReponseConnexion, type UtilisateurConnecte } from '@/api/connexion';
import EtapeDoubleAuthentification, { type DemandeMfa } from './EtapeDoubleAuthentification.vue';
import FenetreMotDePasseImpose from './FenetreMotDePasseImpose.vue';
import FenetreMotDePasseOublie from './FenetreMotDePasseOublie.vue';
import {
    gestionnaireDisponible,
    identifiantsConnus,
    identifiantsDuNavigateur,
    memoriserDansLeNavigateur,
    oublierIdentifiant,
    propositions,
    retenirIdentifiant
} from './identifiants';
import './mire.css';

const props = defineProps<{ mode: 'bureau' | 'mobile' }>();
const emit = defineEmits<{ connecte: [utilisateur: UtilisateurConnecte] }>();

/** Logo de l'Agence (servi par l'application, hors de la construction) */
const LOGO = '/img/logo-ans.webp';
const LIBELLES_PROFILS: Record<string, string> = {
    admin: 'Administrateur',
    expert: 'Expert Métier',
    rh: 'Ressources Humaines'
};

const bureau = computed(() => props.mode === 'bureau');

const identifiant = ref('');
const motDePasse = ref('');
const voirMotDePasse = ref(false);
const erreur = ref('');
const occupe = ref(false);
const version = ref(bureau.value ? '1.0.0' : '…');
/** Profils du compte, proposés après vérification du mot de passe (null : pas de choix en cours) */
const profils = ref<ProfilConnexion[] | null>(null);
const profil = ref('');
const mfa = ref<DemandeMfa | null>(null);
/** Utilisateur connecté dont le mot de passe, donné par un administrateur, doit être remplacé */
const aChanger = ref<UtilisateurConnecte | null>(null);
const oubliOuvert = ref(false);
const champMotDePasse = ref<HTMLInputElement | null>(null);

// ── Identifiants déjà utilisés sur ce poste (bureau) ─────────────────────────

const suggestions = ref<string[]>([]);
let lectureNavigateur = false;

function proposer() {
    // Gestionnaire du navigateur disponible : il propose lui-même ses comptes
    suggestions.value =
        !bureau.value || gestionnaireDisponible() ? [] : propositions(identifiant.value, identifiantsConnus());
}
function masquerSuggestions() {
    suggestions.value = [];
}
/** Champ quitté : liste masquée après le choix éventuel d'un identifiant */
function masquerPlusTard() {
    setTimeout(masquerSuggestions, 150);
}
function choisirSuggestion(login: string) {
    identifiant.value = login;
    masquerSuggestions();
    champMotDePasse.value?.focus();
}
function oublierSuggestion(login: string) {
    oublierIdentifiant(login);
    proposer();
}
/** Clic sur le champ vide : comptes enregistrés dans le navigateur */
async function comptesDuNavigateur() {
    if (!bureau.value || lectureNavigateur || identifiant.value) return;
    lectureNavigateur = true;
    try {
        const c = await identifiantsDuNavigateur();
        if (c) {
            identifiant.value = c.id;
            motDePasse.value = c.password;
            masquerSuggestions();
            champMotDePasse.value?.focus();
        }
    } finally {
        lectureNavigateur = false;
    }
}

// ── Connexion ────────────────────────────────────────────────────────────────

function lireVersion() {
    connexionApi
        .version()
        .then(d => {
            if (d?.version) version.value = d.version;
        })
        .catch(() => {});
}

async function seConnecter() {
    if (occupe.value) return; // évite un double envoi
    erreur.value = '';
    const login = identifiant.value.trim();
    if (profils.value && !profil.value) {
        erreur.value = 'Veuillez sélectionner un profil';
        return;
    }
    if (!profils.value && (!login || !motDePasse.value)) {
        erreur.value = 'Veuillez remplir les identifiants';
        return;
    }
    occupe.value = true;
    try {
        const r: ReponseConnexion = bureau.value
            ? await connexionApi.connecter(login, motDePasse.value, profils.value ? profil.value : undefined)
            : await connexionApi.connecterMobile(login, motDePasse.value);
        if (r.profileRequired) {
            // Compte à plusieurs profils : choix du profil, puis nouvelle connexion avec ce profil
            profils.value = r.profiles ?? [];
            profil.value = '';
        } else if (r.mfaRequired && r.pendingUserId !== undefined) {
            mfa.value = {
                userId: r.pendingUserId,
                profil: profil.value || r.profile || r.pendingProfile || '',
                methode: r.mfaMethod ?? 'email',
                totpConfigure: !!r.totpConfigured
            };
        } else if (r.user) {
            terminer(r.user);
        } else {
            erreur.value = 'Erreur de connexion';
        }
    } catch (e) {
        erreur.value =
            e instanceof ErreurApi
                ? e.message || 'Erreur de connexion'
                : `Erreur de connexion — ${(e as Error).message || 'vérifiez la console'}`;
    } finally {
        occupe.value = false;
    }
}

/** Session ouverte : identifiants retenus (bureau), mot de passe imposé remplacé, puis entrée dans l'application */
function terminer(utilisateur: UtilisateurConnecte) {
    mfa.value = null;
    if (bureau.value) {
        memoriserDansLeNavigateur(
            identifiant.value.trim(),
            motDePasse.value,
            `${utilisateur.prenom ?? ''} ${utilisateur.nom ?? ''}`
        );
        retenirIdentifiant(identifiant.value);
        if (utilisateur.mustChangePassword) {
            aChanger.value = utilisateur;
            return;
        }
    }
    emit('connecte', utilisateur);
    vider();
}

function motDePasseChange(nouveau: string) {
    const utilisateur = aChanger.value;
    aChanger.value = null;
    if (!utilisateur) return;
    motDePasse.value = nouveau; // identifiants proposés au navigateur
    terminer({ ...utilisateur, mustChangePassword: false });
}

/** Double authentification annulée : retour aux identifiants, mot de passe à ressaisir */
function annulerMfa() {
    mfa.value = null;
    motDePasse.value = '';
    profils.value = null;
    profil.value = '';
}

function echecMfa(message: string) {
    mfa.value = null;
    erreur.value = message;
}

function vider() {
    identifiant.value = '';
    motDePasse.value = '';
    voirMotDePasse.value = false;
    profils.value = null;
    profil.value = '';
    mfa.value = null;
    masquerSuggestions();
}

/** Mire réaffichée (déconnexion, session perdue) : formulaire vidé, fenêtres fermées, message éventuel, version relue */
function reinitialiser(message?: string) {
    vider();
    occupe.value = false;
    aChanger.value = null;
    oubliOuvert.value = false;
    erreur.value = message ?? '';
    lireVersion();
}

defineExpose({ reinitialiser });

onMounted(lireVersion);
</script>

<template>
    <div class="lp-bg" aria-hidden="true">
        <span class="lp-orb lp-orb-1"></span><span class="lp-orb lp-orb-2"></span><span class="lp-orb lp-orb-3"></span>
    </div>
    <div class="lp-card">
        <div class="lp-head">
            <img class="lp-logo" :src="LOGO" alt="Agence du Numérique en Santé" />
            <div class="lp-app">
                <svg class="lp-app-ico" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 80 80">
                    <rect width="80" height="80" rx="13" fill="#1D70B7" />
                    <circle cx="40" cy="22" r="10" fill="white" />
                    <path d="M22 46 Q40 34 58 46" fill="white" stroke="none" />
                    <rect x="18" y="52" width="44" height="6" rx="3" fill="white" opacity="0.95" />
                    <rect x="25" y="62" width="32" height="5" rx="2.5" fill="white" opacity="0.65" />
                    <polygon points="65,51 71,57 65,63 59,57" fill="white" opacity="0.85" />
                </svg>
                <div class="lp-app-txt">
                    <h2>{{ bureau ? 'Plateforme de Planification' : 'Mon planning' }}</h2>
                    <p>{{ bureau ? 'Gestion opérationnelle des ressources' : 'Plateforme de Planification — ANS' }}</p>
                </div>
            </div>
        </div>

        <EtapeDoubleAuthentification
            v-if="mfa"
            :demande="mfa"
            @connecte="terminer"
            @annuler="annulerMfa"
            @echec="echecMfa"
        />

        <div v-else class="lp-body" data-etape="identifiants">
            <div class="lp-group lp-identifiant">
                <label for="loginUsername">Identifiant</label>
                <div class="lp-field">
                    <span class="lp-ico"
                        ><svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" /></svg
                    ></span>
                    <input
                        id="loginUsername"
                        v-model="identifiant"
                        class="lp-input"
                        type="text"
                        name="username"
                        :autocomplete="bureau ? 'off' : 'username'"
                        autocapitalize="none"
                        spellcheck="false"
                        placeholder="Votre login"
                        @focus="comptesDuNavigateur"
                        @click="comptesDuNavigateur"
                        @input="proposer"
                        @blur="masquerPlusTard"
                        @keydown.esc="masquerSuggestions"
                    />
                </div>
                <div v-if="suggestions.length" id="loginSuggest" class="lp-suggest">
                    <div class="lp-suggest-t">Identifiants utilisés sur ce poste</div>
                    <div
                        v-for="login in suggestions"
                        :key="login"
                        class="lp-suggest-i"
                        @mousedown.prevent="choisirSuggestion(login)"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>{{ login }}</span>
                        <button
                            type="button"
                            title="Oublier cet identifiant"
                            @mousedown.prevent.stop="oublierSuggestion(login)"
                        >
                            ×
                        </button>
                    </div>
                </div>
            </div>
            <div class="lp-group">
                <label for="loginPassword">Mot de passe</label>
                <div class="lp-field lp-has-eye">
                    <span class="lp-ico"
                        ><svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg
                    ></span>
                    <input
                        id="loginPassword"
                        ref="champMotDePasse"
                        v-model="motDePasse"
                        class="lp-input"
                        :type="voirMotDePasse ? 'text' : 'password'"
                        name="password"
                        autocomplete="current-password"
                        placeholder="Votre mot de passe"
                        @keydown.enter="seConnecter"
                    />
                    <button
                        type="button"
                        class="lp-eye"
                        :class="{ on: voirMotDePasse }"
                        aria-label="Afficher ou masquer le mot de passe"
                        title="Afficher / masquer"
                        @click="voirMotDePasse = !voirMotDePasse"
                    >
                        <svg class="eye-on" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                        <svg class="eye-off" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"
                            />
                        </svg>
                    </button>
                </div>
                <div v-if="bureau" class="lp-forgot">
                    <a href="#" @click.prevent="oubliOuvert = true">Mot de passe oublié ?</a>
                </div>
            </div>
            <div v-if="profils" id="profileSelectGroup" class="lp-group">
                <label for="loginProfile">Sélectionnez votre profil</label>
                <div class="lp-field">
                    <span class="lp-ico"
                        ><svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="2" y="7" width="20" height="14" rx="2" />
                            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" /></svg
                    ></span>
                    <select id="loginProfile" v-model="profil" class="lp-input">
                        <option value="">-- Choisir un profil --</option>
                        <option v-for="p in profils" :key="p" :value="p">
                            {{ LIBELLES_PROFILS[p] ?? 'Utilisateur' }}
                        </option>
                    </select>
                </div>
            </div>
            <div v-if="erreur" id="loginError" :key="erreur" class="lp-erreur" role="alert">{{ erreur }}</div>
            <button
                id="loginButton"
                type="button"
                class="lp-btn"
                :class="{ 'lp-busy': occupe }"
                :disabled="occupe"
                :aria-busy="occupe ? 'true' : 'false'"
                @click="seConnecter"
            >
                <span class="lp-btn-label">{{ profils ? 'Se connecter' : bureau ? 'Continuer' : 'Se connecter' }}</span
                ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg
                ><span class="lp-busy-txt" aria-hidden="true"
                    ><i class="lp-spin"></i>Connexion en cours<span class="lp-dots"
                        ><b>.</b><b>.</b><b>.</b></span
                    ></span
                >
            </button>
            <div class="lp-foot">
                <span class="lp-secure"
                    ><svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" /></svg
                    >Connexion sécurisée</span
                >
                <span class="lp-version"
                    >Version <span id="appVersion">{{ version }}</span></span
                >
            </div>
        </div>
    </div>

    <template v-if="bureau">
        <FenetreMotDePasseOublie :ouverte="oubliOuvert" :identifiant="identifiant" @fermer="oubliOuvert = false" />
        <FenetreMotDePasseImpose :ouverte="!!aChanger" @termine="motDePasseChange" />
    </template>
</template>
