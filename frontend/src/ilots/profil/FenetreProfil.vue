<!-- Fenêtre « Mon profil », ouverte par le rond de l'utilisateur (en-tête de la Planification et des applications) :
     photo, mode d'affichage, thème saisonnier, mot de passe, SAMU de l'expert (sa ressource), onglet ouvert à la
     connexion. Identifiants de l'ancienne fenêtre conservés (#profilePhotoModal, #newPassword…). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import { apiProfil } from '@/api/profil';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppModal from '@/composants/AppModal.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { LISTE_SAMU } from '@/composants/samu';
import { surDemande } from '@/ilots/fenetres';
import { libelleOnglet, ONGLETS } from '@/ilots/onglets';
import SaisieSamu from '@/ilots/ressources/SaisieSamu.vue';
import { choisirModeAffichage, emettre, modeAffichage, themesAncienCode, type ModeAffichage } from '@/liaison';
import { ongletsAccessibles } from '@/ilots/navigation/navigation';
import { useSessionStore } from '@/stores/session';
import { estImage, initiales, regleMotDePasse, TAILLE_MAX_PHOTO } from './profil';

const magasin = useSessionStore();
const session = computed(() => magasin.session);
const { demande, repondre, confirmer } = fournirConfirmation();

const ouverte = ref(false);

/** Message bref en bas à droite de la page (enregistrements), visible même fenêtre fermée */
const toast = ref<{ texte: string; fort?: string } | null>(null);
let minuteurToast: ReturnType<typeof setTimeout> | undefined;
function annoncer(texte: string, fort?: string) {
    clearTimeout(minuteurToast);
    toast.value = { texte, fort };
    minuteurToast = setTimeout(() => (toast.value = null), 2300);
}

// ── Photo ────────────────────────────────────────────────────────────────────

const photoChoisie = ref<string | null>(null);
const messagePhoto = ref('');
const champPhoto = ref<HTMLInputElement | null>(null);
const apercu = computed(() => photoChoisie.value ?? session.value?.profilePhoto ?? null);

function choisirPhoto(e: Event) {
    const fichier = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    messagePhoto.value = '';
    if (!fichier) return;
    if (!estImage(fichier.type)) {
        messagePhoto.value = 'Veuillez sélectionner une image';
        return;
    }
    if (fichier.size > TAILLE_MAX_PHOTO) {
        messagePhoto.value = "L'image est trop grande (max 2MB)";
        return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => (photoChoisie.value = String(lecteur.result));
    lecteur.readAsDataURL(fichier);
}

async function enregistrerPhoto() {
    if (!photoChoisie.value) return;
    try {
        await apiProfil.enregistrerPhoto(photoChoisie.value);
        // En-têtes (session relue) et grille de la planification (photos des experts)
        emettre('photo-modifiee');
        emettre('grille-a-rafraichir');
        fermer();
        annoncer('✅ Photo mise à jour avec succès !');
    } catch (e) {
        messagePhoto.value = `Erreur lors de l'upload : ${e instanceof ErreurApi ? e.message : 'erreur inconnue'}`;
    }
}

// ── Mode d'affichage et thème saisonnier ─────────────────────────────────────

const MODES: { valeur: ModeAffichage; libelle: string }[] = [
    { valeur: 'light', libelle: 'Clair' },
    { valeur: 'dark', libelle: 'Sombre' },
    { valeur: 'auto', libelle: 'Automatique (selon le système)' }
];
const mode = ref<ModeAffichage>('light');
const theme = ref<{ libelle: string; actif: boolean } | null>(null);

function lireAffichage() {
    mode.value = modeAffichage();
    const themes = themesAncienCode();
    const affiche = themes?.compute();
    theme.value =
        themes && affiche
            ? { libelle: themes.catalogue()[affiche.id]?.label ?? affiche.id, actif: themes.userEnabled() }
            : null;
}
function changerMode(m: ModeAffichage) {
    mode.value = m;
    choisirModeAffichage(m);
}
function basculerTheme(actif: boolean) {
    themesAncienCode()?.setUserEnabled(actif);
    if (theme.value) theme.value.actif = actif;
}

// ── Mot de passe ─────────────────────────────────────────────────────────────

const nouveau = ref('');
const confirmation = ref('');
const messageMotDePasse = ref<{ texte: string; ok: boolean } | null>(null);
const regle = computed(() => regleMotDePasse(nouveau.value));
const correspondance = computed(() => (confirmation.value ? { ok: nouveau.value === confirmation.value } : null));

async function changerMotDePasse() {
    messageMotDePasse.value = null;
    const erreur = (texte: string) => (messageMotDePasse.value = { texte, ok: false });
    if (!nouveau.value || !confirmation.value) return erreur('Veuillez remplir tous les champs');
    if (!regle.value?.ok) return erreur('Le mot de passe doit contenir au moins 8 caractères et 1 caractère spécial');
    if (nouveau.value !== confirmation.value) return erreur('Les mots de passe ne correspondent pas');
    if (!(await confirmer('Êtes-vous sûr de vouloir changer votre mot de passe ?', 'Confirmer', { danger: false })))
        return;
    try {
        await apiProfil.changerMotDePasse(nouveau.value);
        nouveau.value = '';
        confirmation.value = '';
        messageMotDePasse.value = { texte: '✅ Mot de passe changé avec succès !', ok: true };
    } catch (e) {
        erreur(`Erreur : ${e instanceof ErreurApi ? e.message : 'Impossible de changer le mot de passe'}`);
    }
}

// ── SAMU de l'expert ─────────────────────────────────────────────────────────

const avecSamu = computed(() => session.value?.activeProfile === 'expert' && !!session.value.resourceId);
const principal = ref<string[]>([]);
const secondaire = ref<string[]>([]);
const messageSamu = ref<{ texte: string; ok: boolean } | null>(null);
let minuteurSamu: ReturnType<typeof setTimeout> | undefined;

async function lireSamu() {
    principal.value = [];
    secondaire.value = [];
    if (!avecSamu.value) return;
    try {
        const a = await apiProfil.samu(session.value!.resourceId!);
        principal.value = a.principal;
        secondaire.value = a.secondaire;
    } catch {
        /* SAMU non affichés */
    }
}

async function enregistrerSamu() {
    clearTimeout(minuteurSamu);
    try {
        await apiProfil.enregistrerSamu({ principal: principal.value, secondaire: secondaire.value });
        messageSamu.value = { texte: '✅ Affectations sauvegardées', ok: true };
        minuteurSamu = setTimeout(() => (messageSamu.value = null), 3000);
    } catch (e) {
        messageSamu.value = { texte: `Erreur : ${e instanceof ErreurApi ? e.message : 'inconnue'}`, ok: false };
    }
}

// ── Onglet par défaut ────────────────────────────────────────────────────────

const ongletDefaut = ref('accueil');
const listeOnglets = ref(false);
const messageOnglet = ref('');
/** L'Accueil, accessible à tous les profils, puis les onglets du profil */
const onglets = computed(() => (session.value ? ['accueil', ...ongletsAccessibles(session.value.activeProfile)] : []));
const zoneOnglets = ref<HTMLElement | null>(null);

function fermerListeOnglets(e: MouseEvent) {
    if (!zoneOnglets.value?.contains(e.target as Node)) listeOnglets.value = false;
}
document.addEventListener('click', fermerListeOnglets);

async function choisirOnglet(cle: string) {
    listeOnglets.value = false;
    messageOnglet.value = '';
    const s = session.value;
    if (!s) return;
    try {
        await apiProfil.ongletParDefaut(s.userId, cle);
        ongletDefaut.value = cle;
        s.defaultTab = cle;
        annoncer('✅ Onglet par défaut : ', libelleOnglet(cle));
    } catch (e) {
        messageOnglet.value = `Erreur : ${e instanceof ErreurApi ? e.message : 'erreur lors de la sauvegarde'}`;
    }
}

// ── Ouverture et fermeture ───────────────────────────────────────────────────

surDemande(() => void ouvrir());

async function ouvrir() {
    const s = await magasin.charger().catch(() => null);
    if (!s) return;
    photoChoisie.value = null;
    messagePhoto.value = '';
    messageMotDePasse.value = null;
    messageSamu.value = null;
    messageOnglet.value = '';
    ongletDefaut.value = s.defaultTab || 'accueil';
    lireAffichage();
    void lireSamu();
    ouverte.value = true;
}

function fermer() {
    ouverte.value = false;
    photoChoisie.value = null;
    nouveau.value = '';
    confirmation.value = '';
    listeOnglets.value = false;
}

onBeforeUnmount(() => {
    document.removeEventListener('click', fermerListeOnglets);
    clearTimeout(minuteurToast);
    clearTimeout(minuteurSamu);
});
</script>

<template>
    <AppModal id="profilePhotoModal" class="gp-profil" :opened="ouverte" title="👤 Mon profil" @close="fermer">
        <!-- Photo -->
        <h3 class="gp-profil__rubrique gp-profil__rubrique--photo">📷 Photo de profil</h3>
        <div class="gp-profil__photo">
            <div id="previewCircle" class="gp-profil__apercu">
                <img v-if="apercu" id="previewPhoto" :src="apercu" alt="" class="gp-profil__image" />
                <span v-else id="previewTrigramme" class="gp-profil__trigramme">{{
                    session ? initiales(session) : '?'
                }}</span>
            </div>
            <input
                id="photoInput"
                ref="champPhoto"
                type="file"
                accept="image/*"
                class="gp-profil__fichier"
                @change="choisirPhoto"
            />
            <button type="button" class="gp-profil__bouton gp-profil__bouton--bleu" @click="champPhoto?.click()">
                📁 Choisir une photo
            </button>
            <button
                v-if="photoChoisie"
                id="uploadPhotoBtn"
                type="button"
                class="gp-profil__bouton gp-profil__bouton--vert"
                @click="enregistrerPhoto"
            >
                ✓ Valider la photo
            </button>
            <p v-if="messagePhoto" class="gp-profil__message gp-profil__message--erreur" role="alert">
                {{ messagePhoto }}
            </p>
        </div>

        <!-- Mode d'affichage -->
        <h3 class="gp-profil__rubrique gp-profil__rubrique--mode">
            <svg class="app-ico gp-profil__icone gp-profil__icone--mode" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg
            >Mode d'affichage
        </h3>
        <div class="gp-profil__modes">
            <label v-for="m in MODES" :key="m.valeur" class="gp-profil__mode">
                <input
                    type="radio"
                    name="colorMode"
                    :value="m.valeur"
                    :checked="mode === m.valeur"
                    @change="changerMode(m.valeur)"
                />
                {{ m.libelle }}
            </label>
        </div>

        <!-- Thème saisonnier -->
        <div v-if="theme" id="themeUserSection">
            <h3 class="gp-profil__rubrique gp-profil__rubrique--theme">Thème d'affichage</h3>
            <label class="gp-profil__mode">
                <input
                    id="themeUserToggle"
                    type="checkbox"
                    :checked="theme.actif"
                    @change="basculerTheme(($event.target as HTMLInputElement).checked)"
                />
                Afficher le thème saisonnier en cours (<span id="themeUserLabel">{{ theme.libelle }}</span
                >)
            </label>
        </div>

        <!-- Mot de passe -->
        <h3 class="gp-profil__rubrique gp-profil__rubrique--mdp">🔒 Changer mon mot de passe</h3>
        <div class="gp-profil__champ">
            <label for="newPassword">Nouveau mot de passe</label>
            <input
                id="newPassword"
                v-model="nouveau"
                type="password"
                name="new-password"
                autocomplete="new-password"
                placeholder="Minimum 8 caractères avec 1 caractère spécial"
            />
            <small v-if="regle" id="passwordStrength" :class="regle.ok ? 'gp-profil__ok' : 'gp-profil__ko'">{{
                regle.texte
            }}</small>
        </div>
        <div class="gp-profil__champ">
            <label for="confirmPassword">Confirmer le mot de passe</label>
            <input
                id="confirmPassword"
                v-model="confirmation"
                type="password"
                name="confirm-password"
                autocomplete="new-password"
                placeholder="Resaisir le mot de passe"
            />
            <small
                v-if="correspondance"
                id="passwordMatch"
                :class="correspondance.ok ? 'gp-profil__ok' : 'gp-profil__ko'"
                >{{
                    correspondance.ok ? '✓ Les mots de passe correspondent' : '✗ Les mots de passe ne correspondent pas'
                }}</small
            >
        </div>
        <button
            type="button"
            class="gp-profil__bouton gp-profil__bouton--large gp-profil__bouton--rouge"
            @click="changerMotDePasse"
        >
            🔐 Changer le mot de passe
        </button>
        <p
            v-if="messageMotDePasse"
            :key="messageMotDePasse.texte"
            class="gp-profil__message"
            :class="messageMotDePasse.ok ? 'gp-profil__message--ok' : 'gp-profil__message--erreur'"
            role="alert"
        >
            {{ messageMotDePasse.texte }}
        </p>

        <!-- SAMU de l'expert -->
        <div v-if="avecSamu" id="profileSamuSection">
            <h3 class="gp-profil__rubrique gp-profil__rubrique--samu">🏥 Mes affectations SAMU</h3>
            <SaisieSamu
                v-model="principal"
                v-model:autres="secondaire"
                cle="profil_principal"
                role="principal"
                libelle="🅿️ Expert principal sur le(s) SAMU"
                :samus="LISTE_SAMU"
            />
            <SaisieSamu
                v-model="secondaire"
                v-model:autres="principal"
                cle="profil_secondaire"
                role="secondaire"
                libelle="🅢 Expert secondaire sur le(s) SAMU"
                :samus="LISTE_SAMU"
            />
            <p
                v-if="messageSamu"
                id="profileSamuSaveMsg"
                :key="messageSamu.texte"
                class="gp-profil__message"
                :class="messageSamu.ok ? 'gp-profil__message--ok' : 'gp-profil__message--erreur'"
                role="status"
            >
                {{ messageSamu.texte }}
            </p>
            <button
                type="button"
                class="gp-profil__bouton gp-profil__bouton--large gp-profil__bouton--orange"
                @click="enregistrerSamu"
            >
                💾 Enregistrer mes affectations SAMU
            </button>
        </div>

        <!-- Onglet par défaut -->
        <h3 class="gp-profil__rubrique gp-profil__rubrique--onglet">⚙️ Paramétrer l'affichage à l'ouverture</h3>
        <div class="gp-profil__champ">
            <span class="gp-profil__etiquette">Onglet affiché par défaut à la connexion</span>
            <div id="defaultTabPicker" ref="zoneOnglets" class="gp-profil__onglets">
                <button
                    type="button"
                    class="gp-profil__onglet-choisi"
                    :aria-expanded="listeOnglets"
                    @click="listeOnglets = !listeOnglets"
                >
                    <span class="gp-profil__onglet">
                        <!-- eslint-disable vue/no-v-html -- tracés fixes de l'application -->
                        <svg
                            class="tab-ico gp-profil__onglet-icone"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            v-html="ONGLETS[ongletDefaut]?.traces ?? ''"
                        ></svg
                        ><!-- eslint-enable vue/no-v-html -->{{ libelleOnglet(ongletDefaut) }}
                    </span>
                    <span class="gp-profil__fleche" aria-hidden="true">▼</span>
                </button>
                <div v-show="listeOnglets" class="gp-profil__liste-onglets" role="listbox">
                    <div
                        v-for="cle in onglets"
                        :key="cle"
                        role="option"
                        :data-tab="cle"
                        :aria-selected="cle === ongletDefaut"
                        class="gp-profil__onglet gp-profil__option"
                        :class="{ 'gp-profil__option--choisie': cle === ongletDefaut }"
                        @click="choisirOnglet(cle)"
                    >
                        <!-- eslint-disable vue/no-v-html -- tracés fixes de l'application -->
                        <svg
                            class="tab-ico gp-profil__onglet-icone"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            v-html="ONGLETS[cle]?.traces ?? ''"
                        ></svg
                        ><!-- eslint-enable vue/no-v-html -->{{ libelleOnglet(cle) }}
                    </div>
                </div>
            </div>
            <small class="gp-profil__aide"
                >Choisissez l'onglet qui s'affichera automatiquement lors de votre prochaine connexion.</small
            >
            <p v-if="messageOnglet" class="gp-profil__message gp-profil__message--erreur" role="alert">
                {{ messageOnglet }}
            </p>
        </div>

        <template #footer>
            <button type="button" class="gp-profil__bouton gp-profil__bouton--gris" @click="fermer">Fermer</button>
        </template>
    </AppModal>

    <AppConfirmation
        :opened="!!demande"
        :message="demande?.message ?? ''"
        :label-confirmer="demande?.labelConfirmer"
        :danger="demande?.danger"
        @confirm="repondre(true)"
        @cancel="repondre(false)"
    />

    <Teleport to="body">
        <div v-if="toast" :key="toast.texte + (toast.fort ?? '')" class="gp-profil__toast" role="status">
            {{ toast.texte }}<strong v-if="toast.fort">{{ toast.fort }}</strong>
        </div>
    </Teleport>
</template>

<style>
.gp-modale.gp-profil .gp-modale__boite {
    width: min(550px, 100%);
}
.gp-profil__rubrique {
    color: #2c3e50;
    font-size: 16px;
    margin: 26px 0 10px;
    padding-left: 10px;
    border-left: 3px solid #1d70b7;
}
.gp-profil__rubrique--mode {
    border-left-color: #3949ab;
}
.gp-profil__rubrique--theme {
    border-left-color: #f39c12;
}
.gp-profil__rubrique--mdp {
    border-left-color: #e74c3c;
}
.gp-profil__rubrique--samu {
    border-left-color: #e67e22;
}
.gp-profil__rubrique--onglet {
    border-left-color: #9b59b6;
}
.gp-profil__icone {
    width: 18px;
    height: 18px;
    vertical-align: -3px;
    margin-right: 6px;
}
.gp-profil__icone--mode {
    stroke: #3949ab;
}
.gp-profil__photo {
    text-align: center;
    margin: 16px 0;
}
.gp-profil__apercu {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    border: 4px solid #1d70b7;
    background-color: #7f8c8d;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    overflow: hidden;
}
.gp-profil__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.gp-profil__trigramme {
    color: white;
    font-weight: bold;
    font-size: 48px;
}
.gp-profil__fichier {
    display: none;
}
.gp-profil__bouton {
    padding: 10px 20px;
    margin: 10px;
    border: none;
    border-radius: 5px;
    color: white;
    cursor: pointer;
}
.gp-profil__bouton--large {
    width: 100%;
    margin: 10px 0 0;
    padding: 12px;
    font-weight: bold;
    font-size: 14px;
}
.gp-profil__bouton--bleu {
    background-color: #1d70b7;
}
.gp-profil__bouton--vert {
    background-color: #27ae60;
}
.gp-profil__bouton--rouge {
    background-color: #e74c3c;
}
.gp-profil__bouton--orange {
    background-color: #e67e22;
}
.gp-profil__bouton--gris {
    background-color: #95a5a6;
    margin: 0;
}
.gp-profil__modes {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    font-size: 14px;
    color: #2c3e50;
}
.gp-profil__mode {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 14px;
    color: #2c3e50;
}
.gp-profil__champ {
    margin-bottom: 15px;
}
.gp-profil__champ label,
.gp-profil__etiquette {
    display: block;
    margin-bottom: 5px;
    color: #2c3e50;
    font-weight: bold;
}
.gp-profil__champ input {
    width: 100%;
    padding: 10px;
    border: 1px solid #bdc3c7;
    border-radius: 5px;
    font-size: 14px;
    box-sizing: border-box;
}
.gp-profil__champ small {
    display: block;
    margin-top: 5px;
}
.gp-profil__ok {
    color: #27ae60;
}
.gp-profil__ko {
    color: #e74c3c;
}
.gp-profil__aide {
    color: #7f8c8d;
}
.gp-profil__message {
    font-size: 13px;
    margin: 8px 0 0;
}
.gp-profil__message--ok {
    color: #27ae60;
}
.gp-profil__message--erreur {
    color: #c0392b;
}
.gp-profil__onglets {
    position: relative;
}
.gp-profil__onglet-choisi {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 10px;
    border: 1px solid #bdc3c7;
    border-radius: 5px;
    background: #fff;
    color: #2c3e50;
    font-size: 14px;
    cursor: pointer;
    text-align: left;
}
.gp-profil__onglet {
    display: flex;
    align-items: center;
    flex: 1;
}
.gp-profil__onglet-icone {
    width: 18px;
    height: 18px;
    margin-right: 10px;
    vertical-align: middle;
}
.gp-profil__fleche {
    font-size: 10px;
    color: #7f8c8d;
}
.gp-profil__liste-onglets {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    background: #fff;
    border: 1px solid #bdc3c7;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
    z-index: 10;
    overflow: hidden;
}
.gp-profil__option {
    padding: 10px 12px;
    cursor: pointer;
    font-size: 14px;
    color: #2c3e50;
}
.gp-profil__option:hover {
    background: #f0f4ff;
}
.gp-profil__option--choisie {
    background: #e8eaf6;
    font-weight: bold;
}
.gp-profil__toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #27ae60;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 20000;
    font-size: 14px;
}
</style>
