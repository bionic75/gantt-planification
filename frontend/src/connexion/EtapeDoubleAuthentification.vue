<!-- Double authentification, dans la carte de connexion (bureau et mobile) : choix de la méthode, code reçu par e-mail
     (envoyé dès le choix, renvoi possible), code de l'application d'authentification, mise en place de l'application
     (QR code et clé). Repère des tests : data-etape (choix-mfa, code-mfa, totp-setup) et data-methode du code. -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { connexionApi, type MethodeMfa, type UtilisateurConnecte } from '@/api/connexion';

/** Double authentification demandée par le serveur après vérification du mot de passe */
export interface DemandeMfa {
    userId: number;
    profil: string;
    methode: MethodeMfa;
    totpConfigure: boolean;
}

const props = defineProps<{ demande: DemandeMfa }>();
const emit = defineEmits<{
    connecte: [utilisateur: UtilisateurConnecte];
    annuler: [];
    /** Étape impossible (envoi du code, application) : retour aux identifiants avec ce message */
    echec: [message: string];
}>();

type Etape = 'attente' | 'choix-mfa' | 'code-mfa' | 'totp-setup';
const etape = ref<Etape>('attente');
/** Code attendu : reçu par e-mail ou affiché par l'application d'authentification */
const parEmail = ref(false);
const code = ref('');
const erreur = ref('');
const verification = ref(false);
/** Renvoi du code : libellé du bouton (« Renvoyer le code », envoi en cours, envoyé, erreur) */
const renvoi = ref<'pret' | 'envoi' | 'envoye' | 'erreur'>('pret');
const totp = ref<{ secret: string; qrCode: string } | null>(null);
const champ = ref<HTMLInputElement | null>(null);
let minuteur: ReturnType<typeof setTimeout> | undefined;

const LIBELLES_RENVOI = {
    pret: 'Renvoyer le code',
    envoi: 'Envoi en cours...',
    envoye: '✓ Code envoyé !',
    erreur: '❌ Erreur'
};

const messageErreur = (e: unknown, defaut: string) => (e instanceof ErreurApi ? e.message || defaut : defaut);

async function focaliser() {
    await nextTick();
    champ.value?.focus();
}

function afficherCode(email: boolean) {
    parEmail.value = email;
    code.value = '';
    erreur.value = '';
    renvoi.value = 'pret';
    etape.value = 'code-mfa';
    void focaliser();
}

/** Code par e-mail : envoyé dès le choix de la méthode */
async function envoyerParEmail() {
    try {
        await connexionApi.envoyerCode(props.demande.userId);
        afficherCode(true);
    } catch (e) {
        if (!(e instanceof ErreurApi)) {
            emit(
                'echec',
                "Erreur réseau lors de l'envoi du code. Vérifiez la configuration SMTP ou utilisez le code TOTP."
            );
            return;
        }
        const message = e.message || 'Erreur envoi du code';
        emit('echec', /SMTP|timeout|Configuration/.test(message) ? `❌ ${message}` : message);
    }
}

/** Application d'authentification : code demandé si elle est configurée, sinon mise en place */
async function preparerTotp() {
    try {
        totp.value = await connexionApi.preparerTotp(props.demande.userId);
        code.value = '';
        erreur.value = '';
        etape.value = 'totp-setup';
        void focaliser();
    } catch (e) {
        emit('echec', messageErreur(e, 'Erreur configuration TOTP'));
    }
}

async function choisir(methode: 'email' | 'totp') {
    if (methode === 'email') return envoyerParEmail();
    try {
        const { configured } = await connexionApi.etatTotp(props.demande.userId);
        if (configured) afficherCode(false);
        else await preparerTotp();
    } catch {
        emit('echec', 'Erreur de vérification TOTP');
    }
}

async function verifier() {
    if (verification.value) return;
    const saisi = code.value.trim();
    if (saisi.length !== 6) {
        erreur.value = 'Le code doit contenir 6 chiffres';
        return;
    }
    verification.value = true;
    erreur.value = '';
    try {
        const { userId, profil } = props.demande;
        const r =
            etape.value === 'totp-setup'
                ? await connexionApi.confirmerTotp(userId, totp.value!.secret, saisi, profil)
                : await connexionApi.verifierCode(userId, saisi, profil);
        if (r.success && r.user) {
            emit('connecte', r.user);
            return;
        }
        erreur.value = 'Code invalide';
    } catch (e) {
        erreur.value = messageErreur(e, 'Erreur de vérification');
        if (!(e instanceof ErreurApi)) return;
    } finally {
        verification.value = false;
    }
    code.value = '';
    void focaliser();
}

/** Saisie du 6e chiffre au clavier : vérification immédiate */
function frappe() {
    if (etape.value === 'code-mfa' && code.value.length === 6) void verifier();
}

async function renvoyer() {
    if (renvoi.value !== 'pret') return;
    renvoi.value = 'envoi';
    try {
        await connexionApi.envoyerCode(props.demande.userId);
        renvoi.value = 'envoye';
        minuteur = setTimeout(() => (renvoi.value = 'pret'), 3000);
    } catch (e) {
        if (!(e instanceof ErreurApi)) {
            renvoi.value = 'pret';
            return;
        }
        renvoi.value = 'erreur';
        minuteur = setTimeout(() => (renvoi.value = 'pret'), 2000);
    }
}

onMounted(() => {
    const { methode, totpConfigure } = props.demande;
    if (methode === 'choice') etape.value = 'choix-mfa';
    else if (methode === 'email') void envoyerParEmail();
    else if (totpConfigure) afficherCode(false);
    else void preparerTotp();
});
onBeforeUnmount(() => clearTimeout(minuteur));
</script>

<template>
    <div
        class="lp-body lp-mfa"
        :data-etape="etape"
        :data-methode="etape === 'code-mfa' ? (parEmail ? 'email' : 'totp') : undefined"
    >
        <div class="lp-mfa__tete">
            <div class="lp-mfa-ico">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <rect x="9" y="11" width="6" height="5" rx="1" />
                    <path d="M10 11V9a2 2 0 0 1 4 0v2" />
                </svg>
            </div>
            <template v-if="etape === 'choix-mfa'">
                <div class="lp-mfa__titre">Choisissez votre méthode de vérification</div>
                <p class="lp-mfa__texte">Comment souhaitez-vous recevoir votre code de vérification ?</p>
            </template>
            <template v-else-if="etape === 'totp-setup'">
                <div class="lp-mfa__titre">Configuration de l'authentification</div>
                <p class="lp-mfa__texte">
                    Scannez ce QR code avec votre application d'authentification<br /><span class="lp-mfa__note"
                        >(Google Authenticator, Microsoft Authenticator, Authy, etc.)</span
                    >
                </p>
            </template>
            <template v-else>
                <div class="lp-mfa__titre">Vérification en deux étapes</div>
                <p v-if="etape === 'code-mfa'" id="mfaCodeMessage" class="lp-mfa__texte">
                    {{
                        parEmail
                            ? 'Un code de vérification a été envoyé à votre adresse email.'
                            : "Entrez le code affiché dans votre application d'authentification."
                    }}
                </p>
            </template>
        </div>

        <!-- Choix de la méthode -->
        <div v-if="etape === 'choix-mfa'" class="lp-choix">
            <button type="button" class="lp-choix__methode" @click="choisir('email')">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                </svg>
                <span>
                    <span class="lp-choix__titre">Code par email</span>
                    <span class="lp-choix__detail">Recevez un code à 6 chiffres sur votre adresse email</span>
                </span>
            </button>
            <button id="mfaMethodTotpButton" type="button" class="lp-choix__methode" @click="choisir('totp')">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="2" width="12" height="20" rx="2.5" />
                    <path d="M11 18h2" />
                </svg>
                <span>
                    <span class="lp-choix__titre">{{
                        demande.totpConfigure ? "Application d'authentification" : 'Configurer une application'
                    }}</span>
                    <span class="lp-choix__detail">{{
                        demande.totpConfigure
                            ? 'Utilisez votre application configurée'
                            : 'Première utilisation : configuration requise'
                    }}</span>
                </span>
            </button>
        </div>

        <!-- Code reçu par e-mail ou affiché par l'application -->
        <template v-else-if="etape === 'code-mfa'">
            <div class="lp-group">
                <label for="mfaCodeInput">Entrez le code à 6 chiffres</label>
                <input
                    id="mfaCodeInput"
                    ref="champ"
                    v-model="code"
                    class="lp-input lp-code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    placeholder="000000"
                    maxlength="6"
                    @keyup="frappe"
                    @keydown.enter="verifier"
                />
            </div>
            <div v-if="erreur" id="mfaCodeError" class="lp-erreur" role="alert">{{ erreur }}</div>
            <button
                id="mfaVerifyButton"
                type="button"
                class="lp-btn"
                :class="{ 'lp-busy': verification }"
                :disabled="verification"
                @click="verifier"
            >
                <span class="lp-btn-label">Vérifier</span
                ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg
                ><span class="lp-busy-txt" aria-hidden="true"
                    ><i class="lp-spin"></i>Vérification en cours<span class="lp-dots"
                        ><b>.</b><b>.</b><b>.</b></span
                    ></span
                >
            </button>
            <button
                v-if="parEmail"
                id="mfaResendButton"
                :key="renvoi"
                type="button"
                class="lp-btn lp-secondary"
                :disabled="renvoi !== 'pret'"
                @click="renvoyer"
            >
                <span class="lp-btn-label">{{ LIBELLES_RENVOI[renvoi] }}</span>
            </button>
        </template>

        <!-- Mise en place de l'application d'authentification -->
        <template v-else-if="etape === 'totp-setup' && totp">
            <div class="lp-qr">
                <div id="mfaTotpQrCode" class="lp-qr__cadre">
                    <img class="lp-qr__image" :src="totp.qrCode" alt="QR Code" />
                </div>
            </div>
            <div class="lp-cle">
                <p class="lp-mfa__note">Ou entrez cette clé manuellement :</p>
                <code id="mfaTotpSecret">{{ totp.secret }}</code>
            </div>
            <div class="lp-group">
                <label for="mfaTotpConfirmCode">Entrez le code affiché dans votre application pour confirmer :</label>
                <input
                    id="mfaTotpConfirmCode"
                    ref="champ"
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
            <div v-if="erreur" id="mfaTotpSetupError" class="lp-erreur" role="alert">{{ erreur }}</div>
            <button
                type="button"
                class="lp-btn"
                :class="{ 'lp-busy': verification }"
                :disabled="verification"
                @click="verifier"
            >
                <span class="lp-btn-label">✓ Confirmer</span
                ><span class="lp-busy-txt" aria-hidden="true"
                    ><i class="lp-spin"></i>Vérification en cours<span class="lp-dots"
                        ><b>.</b><b>.</b><b>.</b></span
                    ></span
                >
            </button>
        </template>

        <button type="button" class="lp-link" @click="emit('annuler')">Annuler</button>
    </div>
</template>
