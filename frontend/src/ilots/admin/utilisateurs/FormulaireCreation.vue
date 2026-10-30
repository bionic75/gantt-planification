<!-- Création d'un compte : nom en majuscules, prénom capitalisé et login « prénom.nom » proposés à la sortie des
     champs, mot de passe généré, profils, ressource d'un expert ; envoi du mot de passe par e-mail au choix -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiUtilisateurs } from '@/api/utilisateurs';
import AppIcone from '@/composants/AppIcone.vue';
import { useConfirmation } from '@/composants/confirmation';
import {
    capitaliser,
    champsCreationVides,
    erreurSaisie,
    genererMotDePasse,
    loginPropose,
    messageCreation
} from './calculs';
import { useUtilisateursStore } from './magasin';

const store = useUtilisateursStore();
const confirmer = useConfirmation();
const champs = ref(champsCreationVides());
const motDePasseVisible = ref(false);
let minuteur: ReturnType<typeof setTimeout> | undefined;

const ressourcesActives = computed(() => store.ressources.filter(r => r.actif));

const PROFILS = [
    { cle: 'is_admin', id: 'adminProfileAdmin', libelle: 'Administrateur' },
    { cle: 'is_expert', id: 'adminProfileExpert', libelle: 'Expert Métier' },
    { cle: 'is_user', id: 'adminProfileUser', libelle: 'Utilisateur' },
    { cle: 'is_rh', id: 'adminProfileRh', libelle: 'RH' }
] as const;

function proposerLogin() {
    const login = loginPropose(champs.value.nom, champs.value.prenom);
    if (login) champs.value.username = login;
}
function sortiePrenom() {
    champs.value.prenom = capitaliser(champs.value.prenom);
    proposerLogin();
}

/** Mot de passe généré, affiché en clair 3 secondes */
function generer() {
    champs.value.password = genererMotDePasse();
    motDePasseVisible.value = true;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => (motDePasseVisible.value = false), 3000);
}

/** Ressources rechargées à chaque choix du profil Expert Métier, comme l'ancien écran */
function changementExpert() {
    if (champs.value.is_expert) void store.chargerRessources();
}

async function creer() {
    const c = champs.value;
    const saisie = {
        ...c,
        username: c.username.trim(),
        nom: c.nom.trim(),
        prenom: c.prenom.trim(),
        email: c.email.trim(),
        telephone: c.telephone.trim(),
        resource_id: c.resource_id || null
    };
    const erreur = erreurSaisie(saisie);
    if (erreur) {
        store.signaler('error', erreur);
        return;
    }
    store.message = null;
    const envoi = await confirmer(
        `Voulez-vous envoyer le mot de passe par email à ${saisie.email} ?\n\nMot de passe : ${saisie.password}`,
        'Envoyer par e-mail',
        { labelAnnuler: 'Ne pas envoyer', danger: false }
    );
    try {
        const r = await apiUtilisateurs.creer({ ...saisie, sendEmail: envoi });
        const m = messageCreation(envoi, !!r.emailSent);
        store.signaler(m.type, m.texte);
        champs.value = champsCreationVides();
        await store.apresModification(true);
    } catch (e) {
        store.signaler('error', (e as Error).message);
    }
}
</script>

<template>
    <div class="creation">
        <h4 class="creation__titre">➕ Ajouter un nouvel utilisateur</h4>
        <div class="form-row">
            <div class="form-group">
                <label for="adminUserNom">Nom *</label>
                <input
                    id="adminUserNom"
                    v-model="champs.nom"
                    type="text"
                    placeholder="Nom"
                    @input="champs.nom = champs.nom.toUpperCase()"
                    @blur="proposerLogin"
                />
            </div>
            <div class="form-group">
                <label for="adminUserPrenom">Prénom *</label>
                <input
                    id="adminUserPrenom"
                    v-model="champs.prenom"
                    type="text"
                    placeholder="Prénom"
                    @blur="sortiePrenom"
                />
            </div>
            <div class="form-group">
                <label for="adminUserUsername">Login (prenom.nom) *</label>
                <input id="adminUserUsername" v-model="champs.username" type="text" placeholder="prenom.nom" />
            </div>
            <div class="form-group">
                <label for="adminUserEmail">Email *</label>
                <input id="adminUserEmail" v-model="champs.email" type="email" placeholder="email@example.com" />
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="adminUserTelephone">Téléphone</label>
                <input id="adminUserTelephone" v-model="champs.telephone" type="tel" placeholder="+33 6 XX XX XX XX" />
            </div>
            <div class="form-group">
                <label for="adminUserPassword">Mot de passe *</label>
                <div class="creation__mot-de-passe">
                    <input
                        id="adminUserPassword"
                        v-model="champs.password"
                        :type="motDePasseVisible ? 'text' : 'password'"
                        placeholder="Mot de passe"
                        autocomplete="new-password"
                    />
                    <button
                        type="button"
                        class="creation__generer"
                        title="Générer un mot de passe"
                        aria-label="Générer un mot de passe"
                        @click="generer"
                    >
                        <AppIcone name="cle" :scale="1.25" />
                    </button>
                </div>
            </div>
            <fieldset class="form-group creation__profils">
                <legend>Profils * (au moins un requis)</legend>
                <div class="checkbox-group">
                    <div v-for="p in PROFILS" :key="p.id" class="checkbox-item">
                        <input
                            :id="p.id"
                            v-model="champs[p.cle]"
                            type="checkbox"
                            @change="p.cle === 'is_expert' && changementExpert()"
                        />
                        <label :for="p.id">{{ p.libelle }}</label>
                    </div>
                </div>
            </fieldset>
            <div v-if="champs.is_expert" id="expertResourceGroup" class="form-group">
                <label for="adminUserResource">Ressource associée (pour Expert Métier)</label>
                <select id="adminUserResource" v-model="champs.resource_id">
                    <option value="">-- Sélectionner une ressource --</option>
                    <option v-for="r in ressourcesActives" :key="r.id" :value="String(r.id)">
                        {{ r.prenom }} {{ r.nom }} ({{ r.trigramme }})
                    </option>
                </select>
            </div>
        </div>
        <div class="button-group">
            <button type="button" @click="creer">Créer l'utilisateur</button>
        </div>
    </div>
</template>

<style scoped>
.creation {
    background: #e3f2fd;
    border: 1px solid #90caf9;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 20px;
}
.creation__titre {
    color: #1565c0;
    margin: 0 0 12px;
    font-size: 14px;
}
.creation__mot-de-passe {
    display: flex;
    gap: 5px;
}
.creation__mot-de-passe input {
    flex: 1;
}
.creation__generer,
.creation__generer:hover {
    padding: 8px 12px;
    background-color: #9b59b6;
    color: white;
}
.creation__profils {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
}
/* Légende à l'apparence des libellés de champ (style global « label » de l'ancien code) */
.creation__profils legend {
    padding: 0;
    margin-bottom: 5px;
    color: #2c3e50;
    font-weight: bold;
    font-size: 13px;
}
</style>
