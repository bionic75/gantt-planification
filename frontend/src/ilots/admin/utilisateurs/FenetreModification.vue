<!-- Modification d'un compte : identité, trigramme, ressource liée, profils, statut -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiUtilisateurs, type Utilisateur } from '@/api/utilisateurs';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { erreurSaisie, trigramme } from './calculs';
import { useUtilisateursStore } from './magasin';

const props = defineProps<{ utilisateur: Utilisateur | null }>();
const emit = defineEmits<{ fermer: [] }>();
const store = useUtilisateursStore();

const champs = ref({
    username: '',
    nom: '',
    prenom: '',
    trigramme: '',
    email: '',
    resource_id: '',
    is_admin: false,
    is_expert: false,
    is_user: false,
    is_rh: false,
    actif: false
});
const erreur = ref('');

// Ouverture : champs remplis, ressources rechargées (liste complète, comme l'ancien écran)
watch(
    () => props.utilisateur,
    u => {
        if (!u) return;
        erreur.value = '';
        champs.value = {
            username: u.username,
            nom: u.nom,
            prenom: u.prenom,
            trigramme: trigramme(u),
            email: u.email,
            resource_id: u.resource_id ? String(u.resource_id) : '',
            is_admin: u.is_admin === 1,
            is_expert: u.is_expert === 1,
            is_user: u.is_user === 1,
            is_rh: u.is_rh === 1,
            actif: u.actif === 1
        };
        void store.chargerRessources();
    }
);

const PROFILS = [
    { cle: 'is_admin', id: 'editUserIsAdmin', libelle: 'Administrateur' },
    { cle: 'is_expert', id: 'editUserIsExpert', libelle: 'Expert' },
    { cle: 'is_user', id: 'editUserIsUser', libelle: 'Utilisateur' },
    { cle: 'is_rh', id: 'editProfileRh', libelle: 'RH' }
] as const;

async function enregistrer() {
    const u = props.utilisateur;
    if (!u) return;
    const c = champs.value;
    const donnees = {
        username: c.username.trim(),
        nom: c.nom.trim(),
        prenom: c.prenom.trim(),
        email: c.email.trim(),
        trigramme: c.trigramme.trim().toUpperCase(),
        resource_id: c.resource_id || null,
        is_admin: c.is_admin ? 1 : 0,
        is_expert: c.is_expert ? 1 : 0,
        is_user: c.is_user ? 1 : 0,
        is_rh: c.is_rh ? 1 : 0,
        actif: c.actif ? 1 : 0
    };
    const e = erreurSaisie(donnees);
    if (e) {
        erreur.value = e;
        return;
    }
    try {
        await apiUtilisateurs.modifier(u.id, donnees);
        store.signaler('success', '✅ Utilisateur modifié avec succès !');
        emit('fermer');
        await store.apresModification(true);
    } catch (x) {
        erreur.value = (x as Error).message;
    }
}
</script>

<template>
    <AppModal id="editUserModal" :opened="!!utilisateur" title="Modifier l'utilisateur" @close="emit('fermer')">
        <div class="form-group">
            <label for="editUserUsername">Nom d'utilisateur</label>
            <input id="editUserUsername" v-model="champs.username" type="text" required />
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="editUserNom">Nom</label>
                <input
                    id="editUserNom"
                    v-model="champs.nom"
                    type="text"
                    required
                    @input="champs.nom = champs.nom.toUpperCase()"
                />
            </div>
            <div class="form-group">
                <label for="editUserPrenom">Prénom</label>
                <input id="editUserPrenom" v-model="champs.prenom" type="text" required />
            </div>
            <div class="form-group modif__trigramme">
                <label for="editUserTrigramme">Trigramme</label>
                <input
                    id="editUserTrigramme"
                    v-model="champs.trigramme"
                    type="text"
                    maxlength="5"
                    placeholder="ABC"
                    class="modif__trigramme-champ"
                    @input="champs.trigramme = champs.trigramme.toUpperCase()"
                />
            </div>
        </div>
        <div class="form-group">
            <label for="editUserEmail">Email</label>
            <input id="editUserEmail" v-model="champs.email" type="email" required />
        </div>
        <div class="form-group">
            <label for="editUserResourceId">Ressource liée (optionnel)</label>
            <select id="editUserResourceId" v-model="champs.resource_id">
                <option value="">-- Aucune ressource --</option>
                <option v-for="r in store.ressources" :key="r.id" :value="String(r.id)">
                    {{ r.prenom }} {{ r.nom }} ({{ r.trigramme }})
                </option>
            </select>
        </div>
        <fieldset class="form-group modif__groupe">
            <legend>Profils autorisés</legend>
            <div class="checkbox-group">
                <div v-for="p in PROFILS" :key="p.id" class="checkbox-item">
                    <input :id="p.id" v-model="champs[p.cle]" type="checkbox" />
                    <label :for="p.id">{{ p.libelle }}</label>
                </div>
            </div>
        </fieldset>
        <fieldset class="form-group modif__groupe">
            <legend>Statut</legend>
            <div class="checkbox-group">
                <div class="checkbox-item">
                    <input id="editUserActif" v-model="champs.actif" type="checkbox" />
                    <label for="editUserActif">Compte actif</label>
                </div>
            </div>
        </fieldset>
        <AppAlert v-if="erreur" type="error" :description="erreur" />
        <template #footer>
            <div class="modal-button-group">
                <button type="button" class="modif__annuler" @click="emit('fermer')">Annuler</button>
                <button type="button" @click="enregistrer">Enregistrer les modifications</button>
            </div>
        </template>
    </AppModal>
</template>

<style scoped>
.modif__trigramme {
    max-width: 120px;
}
.modif__trigramme-champ {
    text-transform: uppercase;
    font-weight: bold;
    letter-spacing: 1px;
    text-align: center;
}
.modif__groupe {
    border: none;
    margin: 0 0 15px;
    padding: 0;
    min-width: 0;
}
/* Légende à l'apparence des libellés de champ (style global « label » de l'ancien code) */
.modif__groupe legend {
    padding: 0;
    margin-bottom: 5px;
    color: #2c3e50;
    font-weight: bold;
    font-size: 13px;
}
.modif__annuler,
.modif__annuler:hover {
    background-color: #95a5a6;
}
</style>
