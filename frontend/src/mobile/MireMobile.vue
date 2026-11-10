<!-- Application mobile : mire de connexion (même présentation que celle du bureau, login.css) et double
     authentification (choix de la méthode, code par courriel ou application Authenticator) -->
<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { UtilisateurMobile } from './session';

const emit = defineEmits<{ connecte: [utilisateur: UtilisateurMobile] }>();

/** Logo de l'Agence (servi par l'application, hors de la construction) */
const LOGO = '/img/logo-ans.webp';

const identifiant = ref('');
const motDePasse = ref('');
const voirMotDePasse = ref(false);
const erreur = ref('');
const connexion = ref(false);
const version = ref('…');

/** Double authentification en attente : utilisateur, profil, méthode, étape affichée */
const mfa = ref<{
    userId: number;
    profil: string;
    etape: 'choix' | 'envoi' | 'code';
    instructions: string;
} | null>(null);
const code = ref('');
const erreurMfa = ref('');
const envoi = ref(false);
const verification = ref(false);
const champCode = ref<HTMLInputElement | null>(null);

const INSTRUCTIONS = {
    choix: 'Choisissez votre méthode de vérification :',
    email: 'Un code de vérification va être envoyé à votre adresse email.',
    totp: 'Saisissez le code à 6 chiffres affiché dans votre application Authenticator.'
};

async function focusCode() {
    await nextTick();
    champCode.value?.focus();
}

async function seConnecter() {
    erreur.value = '';
    const u = identifiant.value.trim();
    if (!u || !motDePasse.value) {
        erreur.value = 'Identifiants requis.';
        return;
    }
    if (connexion.value) return; // évite un double envoi
    connexion.value = true;
    try {
        const r = await fetch('/api/mobile-login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: motDePasse.value })
        });
        const data = (await r.json()) as {
            mfaRequired?: boolean;
            pendingUserId?: number;
            pendingProfile?: string;
            mfaMethod?: 'choice' | 'email' | 'totp';
            success?: boolean;
            user?: UtilisateurMobile;
            error?: string;
        };
        if (r.status === 401) erreur.value = 'Identifiants invalides.';
        else if (r.status === 403) erreur.value = 'Aucun profil valide pour ce compte.';
        else if (r.ok && data.mfaRequired) {
            const etape = data.mfaMethod === 'choice' ? 'choix' : data.mfaMethod === 'email' ? 'envoi' : 'code';
            mfa.value = {
                userId: data.pendingUserId!,
                profil: data.pendingProfile!,
                etape,
                instructions:
                    etape === 'choix' ? INSTRUCTIONS.choix : etape === 'envoi' ? INSTRUCTIONS.email : INSTRUCTIONS.totp
            };
            erreurMfa.value = '';
            if (etape === 'code') void focusCode();
        } else if (r.ok && data.success && data.user) {
            // Connexion directe : l'animation reste affichée le temps du chargement des données
            emit('connecte', data.user);
            return;
        } else erreur.value = data.error || 'Erreur de connexion.';
    } catch {
        erreur.value = 'Erreur réseau.';
    }
    connexion.value = false;
}

function choisirMethode(methode: 'email' | 'totp') {
    if (!mfa.value) return;
    erreurMfa.value = '';
    mfa.value = {
        ...mfa.value,
        etape: methode === 'email' ? 'envoi' : 'code',
        instructions: methode === 'email' ? INSTRUCTIONS.email : INSTRUCTIONS.totp
    };
    if (methode === 'totp') void focusCode();
}

async function envoyerCode() {
    if (!mfa.value) return;
    envoi.value = true;
    erreurMfa.value = '';
    try {
        const r = await fetch('/api/mfa/send-code', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: mfa.value.userId })
        });
        const data = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(data.error || 'Erreur envoi');
        mfa.value = {
            ...mfa.value,
            etape: 'code',
            instructions: 'Code envoyé ! Saisissez-le ci-dessous (valable 10 minutes).'
        };
        void focusCode();
    } catch (e) {
        erreurMfa.value = (e as Error).message;
    } finally {
        envoi.value = false;
    }
}

async function verifier() {
    if (!mfa.value) return;
    erreurMfa.value = '';
    const c = code.value.trim();
    if (!c) {
        erreurMfa.value = 'Veuillez saisir le code.';
        return;
    }
    verification.value = true;
    try {
        const r = await fetch('/api/mfa/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: mfa.value.userId, code: c, profile: mfa.value.profil })
        });
        const data = (await r.json()) as { success?: boolean; user?: UtilisateurMobile; error?: string };
        if (!r.ok) {
            erreurMfa.value = data.error || 'Code invalide';
            return;
        }
        if (data.success && data.user) emit('connecte', data.user);
    } catch {
        erreurMfa.value = 'Erreur réseau. Réessayez.';
    } finally {
        verification.value = false;
    }
}

function retour() {
    mfa.value = null;
    code.value = '';
    erreurMfa.value = '';
    erreur.value = '';
}

onMounted(() => {
    // Version de la plateforme affichée sur la mire
    fetch('/api/version', { cache: 'no-store' })
        .then(r => r.json())
        .then((d: { version?: string }) => {
            if (d?.version) version.value = d.version;
        })
        .catch(() => {});
});
</script>

<template>
    <div id="loginPage" class="lp-page lp-mobile">
        <div class="lp-bg" aria-hidden="true">
            <span class="lp-orb lp-orb-1"></span><span class="lp-orb lp-orb-2"></span
            ><span class="lp-orb lp-orb-3"></span>
        </div>
        <div class="lp-card">
            <div class="lp-head">
                <img class="lp-logo" :src="LOGO" alt="Agence du Numérique en Santé" />
                <div class="lp-app">
                    <svg
                        class="lp-app-ico"
                        xmlns="http://www.w3.org/2000/svg"
                        width="50"
                        height="50"
                        viewBox="0 0 80 80"
                    >
                        <rect width="80" height="80" rx="13" fill="#1D70B7" />
                        <circle cx="40" cy="22" r="10" fill="white" />
                        <path d="M22 46 Q40 34 58 46" fill="white" stroke="none" />
                        <rect x="18" y="52" width="44" height="6" rx="3" fill="white" opacity="0.95" />
                        <rect x="25" y="62" width="32" height="5" rx="2.5" fill="white" opacity="0.65" />
                        <polygon points="65,51 71,57 65,63 59,57" fill="white" opacity="0.85" />
                    </svg>
                    <div class="lp-app-txt">
                        <h2>Mon planning</h2>
                        <p>Plateforme de Planification — ANS</p>
                    </div>
                </div>
            </div>

            <!-- Formulaire identifiants -->
            <div id="loginForm" class="lp-body" :class="{ hidden: mfa }">
                <div class="lp-group">
                    <label for="loginUser">Identifiant</label>
                    <div class="lp-field">
                        <span class="lp-ico"
                            ><svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" /></svg
                        ></span>
                        <input
                            id="loginUser"
                            v-model="identifiant"
                            class="lp-input"
                            type="text"
                            autocomplete="username"
                            autocapitalize="none"
                            spellcheck="false"
                            placeholder="Votre login"
                        />
                    </div>
                </div>
                <div class="lp-group">
                    <label for="loginPass">Mot de passe</label>
                    <div class="lp-field lp-has-eye">
                        <span class="lp-ico"
                            ><svg viewBox="0 0 24 24" aria-hidden="true">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg
                        ></span>
                        <input
                            id="loginPass"
                            v-model="motDePasse"
                            class="lp-input"
                            :type="voirMotDePasse ? 'text' : 'password'"
                            autocomplete="current-password"
                            placeholder="Votre mot de passe"
                            @keydown.enter="seConnecter"
                        />
                        <button
                            id="loginEye"
                            type="button"
                            class="lp-eye"
                            :class="{ on: voirMotDePasse }"
                            aria-label="Afficher ou masquer le mot de passe"
                            @click="voirMotDePasse = !voirMotDePasse"
                        >
                            <svg class="eye-on" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                            <svg class="eye-off" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
                <div id="loginError">{{ erreur }}</div>
                <button
                    id="loginBtn"
                    type="button"
                    class="lp-btn"
                    :class="{ 'lp-busy': connexion }"
                    :disabled="connexion"
                    @click="seConnecter"
                >
                    <span class="lp-btn-label">Se connecter</span
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

            <!-- Étape MFA -->
            <div id="mfaForm" class="lp-body" :class="{ hidden: !mfa }">
                <div class="mob-mfa__tete">
                    <div class="lp-mfa-ico">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <rect x="9" y="11" width="6" height="5" rx="1" />
                            <path d="M10 11V9a2 2 0 0 1 4 0v2" />
                        </svg>
                    </div>
                    <div class="mob-mfa__titre">Vérification en deux étapes</div>
                    <div id="mfaInstructions" class="mob-mfa__instructions">{{ mfa?.instructions }}</div>
                </div>
                <!-- Affichage piloté comme l'ancien écran (repères des tests : display flex / block) -->
                <div
                    id="mfaMethodChoice"
                    class="mob-mfa__choix"
                    :style="{ display: mfa?.etape === 'choix' ? 'flex' : 'none' }"
                >
                    <button type="button" class="lp-btn lp-secondary" @click="choisirMethode('email')">
                        <svg viewBox="0 0 24 24" aria-hidden="true" class="mob-mfa__ico">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-10 6L2 7" /></svg
                        ><span>Recevoir un code par email</span>
                    </button>
                    <button type="button" class="lp-btn lp-secondary" @click="choisirMethode('totp')">
                        <svg viewBox="0 0 24 24" aria-hidden="true" class="mob-mfa__ico">
                            <rect x="6" y="2" width="12" height="20" rx="2.5" />
                            <path d="M11 18h2" /></svg
                        ><span>Utiliser l'application Authenticator</span>
                    </button>
                </div>
                <div
                    id="mfaSendEmailBlock"
                    class="mob-mfa__envoi"
                    :style="{ display: mfa?.etape === 'envoi' ? 'block' : 'none' }"
                >
                    <button
                        id="mfaSendBtn"
                        type="button"
                        class="lp-btn lp-secondary"
                        :disabled="envoi"
                        @click="envoyerCode"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" class="mob-mfa__ico">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-10 6L2 7" /></svg
                        ><span>{{ envoi ? 'Envoi en cours…' : 'Envoyer le code par email' }}</span>
                    </button>
                </div>
                <div id="mfaCodeBlock" :style="{ display: mfa?.etape === 'code' ? 'block' : 'none' }">
                    <div class="lp-group">
                        <label for="mfaCodeInput">Code de vérification</label>
                        <input
                            id="mfaCodeInput"
                            ref="champCode"
                            v-model="code"
                            class="lp-input lp-code"
                            type="text"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            placeholder="000000"
                            maxlength="6"
                            @keydown.enter="verifier"
                        />
                    </div>
                    <button
                        id="mfaVerifyBtn"
                        type="button"
                        class="lp-btn"
                        :class="{ 'lp-busy': verification }"
                        :disabled="verification"
                        @click="verifier"
                    >
                        <span class="lp-btn-label">Valider le code</span
                        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg
                        ><span class="lp-busy-txt" aria-hidden="true"
                            ><i class="lp-spin"></i>Vérification en cours<span class="lp-dots"
                                ><b>.</b><b>.</b><b>.</b></span
                            ></span
                        >
                    </button>
                </div>
                <div id="mfaError">{{ erreurMfa }}</div>
                <button type="button" class="lp-link" @click="retour">← Retour à la connexion</button>
            </div>
        </div>
    </div>
</template>
