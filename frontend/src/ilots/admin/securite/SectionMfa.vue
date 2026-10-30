<!-- Administration › Authentification à deux facteurs (sous-îlot) : activation, méthode, fréquence, profils,
     validité du code, enregistrés à chaque changement ; réinitialisation de tous les utilisateurs -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiMfa, type ConfigMfa } from '@/api/securite';
import AppAlert from '@/composants/AppAlert.vue';
import AppConfirmation from '@/composants/AppConfirmation.vue';
import AppSectionAdmin from '@/composants/AppSectionAdmin.vue';
import { fournirConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { champsMfa } from './calculs';

const { demande, repondre, confirmer } = fournirConfirmation();
const config = ref<ConfigMfa>(champsMfa(null));
const message = ref<{ type: 'success' | 'error'; texte: string } | null>(null);

const METHODES = [
    { valeur: 'email', titre: 'Code par email', detail: 'Un code à 6 chiffres est envoyé par email' },
    { valeur: 'totp', titre: 'Application TOTP', detail: 'Google Authenticator, Microsoft Authenticator, etc.' },
    { valeur: 'both', titre: "Au choix de l'utilisateur", detail: "L'utilisateur choisit sa méthode préférée" }
] as const;
const FREQUENCES = [
    { valeur: 'always', label: 'À chaque connexion' },
    { valeur: 'daily', label: '1 fois par jour' },
    { valeur: 'weekly', label: '1 fois par semaine' },
    { valeur: 'monthly', label: '1 fois par mois' }
] as const;
const VALIDITES = [5, 10, 15, 30];

// Comme l'ancien code : configuration relue à chaque ouverture de l'onglet Administration
async function charger() {
    try {
        config.value = champsMfa((await apiMfa.lire()).config);
    } catch {
        /* configuration réservée aux administrateurs */
    }
}
onMounted(charger);
surReouverture(() => void charger());

/** Enregistrement à chaque changement, comme l'ancien écran (sans message en cas de succès) */
async function enregistrer() {
    try {
        await apiMfa.enregistrer({ ...config.value });
        if (message.value?.type === 'error') message.value = null;
    } catch (e) {
        message.value = { type: 'error', texte: `❌ Erreur: ${(e as Error).message}` };
    }
}

async function reinitialiserTout() {
    const ok = await confirmer(
        '⚠️ Êtes-vous sûr de vouloir réinitialiser le MFA de tous les utilisateurs ?\n\nTous les utilisateurs devront reconfigurer leur authentification TOTP.',
        'Réinitialiser'
    );
    if (!ok) return;
    try {
        await apiMfa.reinitialiserTout();
        message.value = { type: 'success', texte: '✅ MFA réinitialisé pour tous les utilisateurs' };
    } catch (e) {
        message.value = { type: 'error', texte: `❌ Erreur: ${(e as Error).message}` };
    }
}
</script>

<template>
    <AppSectionAdmin titre="Authentification à deux facteurs (MFA)" id-corps="mfaSection" teinte="vert">
        <p class="mfa__intro">
            Renforcez la sécurité de l'application en activant l'authentification à deux facteurs pour tous les
            utilisateurs.
        </p>
        <div class="mfa__boite">
            <label class="mfa__activation">
                <input id="mfaEnabled" v-model="config.enabled" type="checkbox" @change="enregistrer" />
                <span>Activer l'authentification à deux facteurs</span>
            </label>

            <div v-if="config.enabled" id="mfaConfig">
                <fieldset class="mfa__groupe">
                    <legend class="mfa__libelle">Méthode d'authentification :</legend>
                    <div class="mfa__choix mfa__choix--colonne">
                        <label v-for="m in METHODES" :key="m.valeur" class="mfa__option">
                            <input
                                v-model="config.method"
                                type="radio"
                                name="mfaMethod"
                                :value="m.valeur"
                                @change="enregistrer"
                            />
                            <span>
                                <svg
                                    v-if="m.valeur === 'email'"
                                    class="app-ico mfa__icone"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <rect x="2" y="4" width="20" height="16" rx="2" />
                                    <path d="m22 7-10 6L2 7" />
                                </svg>
                                <svg
                                    v-else-if="m.valeur === 'totp'"
                                    class="app-ico mfa__icone"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <rect x="6" y="2" width="12" height="20" rx="2" />
                                    <path d="M11 18h2" />
                                </svg>
                                <svg v-else class="app-ico mfa__icone" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M21 12a9 9 0 0 0-15.5-6.2L3 8" />
                                    <path d="M3 3v5h5" />
                                    <path d="M3 12a9 9 0 0 0 15.5 6.2L21 16" />
                                    <path d="M21 21v-5h-5" />
                                </svg>
                                <strong>{{ m.titre }}</strong> - {{ m.detail }}
                            </span>
                        </label>
                    </div>
                </fieldset>

                <div class="mfa__groupe">
                    <label for="mfaFrequency" class="mfa__libelle">Fréquence de vérification :</label>
                    <select
                        id="mfaFrequency"
                        v-model="config.frequency"
                        class="mfa__liste mfa__liste--large"
                        @change="enregistrer"
                    >
                        <option v-for="f in FREQUENCES" :key="f.valeur" :value="f.valeur">{{ f.label }}</option>
                    </select>
                    <p class="mfa__note">
                        Après une vérification réussie, l'utilisateur ne sera plus sollicité pendant la période choisie
                        (sur le même appareil).
                    </p>
                </div>

                <fieldset class="mfa__groupe">
                    <legend class="mfa__libelle">Profils concernés :</legend>
                    <div class="mfa__choix">
                        <label class="mfa__option">
                            <input
                                id="mfaProfileAdmin"
                                v-model="config.profileAdmin"
                                type="checkbox"
                                @change="enregistrer"
                            />
                            <span>
                                <svg class="app-ico mfa__icone" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M2 18 4 7l5 5 3-7 3 7 5-5 2 11z" />
                                    <path d="M2 21h20" />
                                </svg>
                                Administrateurs
                            </span>
                        </label>
                        <label class="mfa__option">
                            <input
                                id="mfaProfileExpert"
                                v-model="config.profileExpert"
                                type="checkbox"
                                @change="enregistrer"
                            />
                            <span>
                                <svg class="app-ico mfa__icone" viewBox="0 0 24 24" aria-hidden="true">
                                    <rect x="2" y="7" width="20" height="14" rx="2" />
                                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" />
                                </svg>
                                Experts Métier
                            </span>
                        </label>
                        <label class="mfa__option">
                            <input
                                id="mfaProfileUser"
                                v-model="config.profileUser"
                                type="checkbox"
                                @change="enregistrer"
                            />
                            <span>
                                <svg class="app-ico mfa__icone" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                Utilisateurs
                            </span>
                        </label>
                    </div>
                </fieldset>

                <div class="mfa__groupe">
                    <label for="mfaCodeValidity" class="mfa__libelle">Durée de validité du code email :</label>
                    <select
                        id="mfaCodeValidity"
                        v-model.number="config.codeValidity"
                        class="mfa__liste"
                        @change="enregistrer"
                    >
                        <option v-for="v in VALIDITES" :key="v" :value="v">{{ v }} minutes</option>
                    </select>
                </div>

                <AppAlert v-if="message" :type="message.type" :description="message.texte" />
                <div class="button-group mfa__actions">
                    <button type="button" class="mfa__enregistrer" @click="enregistrer">
                        <svg class="app-ico mfa__icone" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <path d="M17 21v-8H7v8M7 3v5h8" />
                        </svg>
                        Sauvegarder la configuration MFA
                    </button>
                    <button type="button" class="mfa__reinitialiser" @click="reinitialiserTout">
                        <svg class="app-ico mfa__icone" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M21 12a9 9 0 0 0-15.5-6.2L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 15.5 6.2L21 16" />
                            <path d="M21 21v-5h-5" />
                        </svg>
                        Réinitialiser le MFA de tous les utilisateurs
                    </button>
                </div>

                <div class="mfa__info">
                    <p>
                        <strong>
                            <svg class="app-ico mfa__icone mfa__icone--info" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4M12 8h.01" />
                            </svg>
                            Information :
                        </strong>
                        Lorsque le MFA TOTP est activé, les utilisateurs devront configurer leur application
                        d'authentification lors de leur prochaine connexion. Un QR code leur sera présenté.
                    </p>
                </div>
            </div>
        </div>
        <AppConfirmation
            :opened="!!demande"
            :message="demande?.message ?? ''"
            :label-confirmer="demande?.labelConfirmer"
            @confirm="repondre(true)"
            @cancel="repondre(false)"
        />
    </AppSectionAdmin>
</template>

<style scoped>
.mfa__intro {
    margin-bottom: 15px;
    font-size: 12px;
    color: #2e7d32;
}
.mfa__boite {
    background: white;
    border: 1px solid #a5d6a7;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
}
.mfa__activation {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin: 0 0 15px;
    font-weight: bold;
    color: #2e7d32;
    font-size: 14px;
}
.mfa__activation input {
    width: 18px;
    height: 18px;
    margin: 0;
}
.mfa__groupe {
    margin: 0 0 15px;
    padding: 0;
    border: none;
    min-width: 0;
}
.mfa__libelle {
    font-size: 12px;
    font-weight: bold;
    color: #555;
    display: block;
    margin-bottom: 8px;
    padding: 0;
}
.mfa__choix {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 5px;
}
.mfa__choix--colonne {
    flex-direction: column;
    gap: 8px;
}
.mfa__option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    margin: 0;
}
.mfa__option input {
    width: 16px;
    height: 16px;
    margin: 0;
}
.mfa__icone {
    width: 17px;
    height: 17px;
    stroke: currentColor;
    vertical-align: -3px;
    margin-right: 6px;
}
.mfa__icone--info {
    stroke: #1565c0;
}
.mfa__liste {
    width: 100%;
    max-width: 200px;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
}
.mfa__liste--large {
    max-width: 300px;
}
.mfa__note {
    font-size: 11px;
    color: #666;
    margin-top: 5px;
}
.mfa__actions {
    margin-top: 20px;
}
.mfa__enregistrer,
.mfa__enregistrer:hover {
    background-color: #4caf50;
}
.mfa__reinitialiser,
.mfa__reinitialiser:hover {
    background-color: #ff9800;
}
.mfa__actions .mfa__icone {
    margin-right: 7px;
}
.mfa__info {
    margin-top: 15px;
    padding: 10px;
    background: #e3f2fd;
    border-radius: 5px;
    border-left: 3px solid #2196f3;
}
.mfa__info p {
    font-size: 11px;
    color: #1565c0;
    margin: 0;
}
</style>
