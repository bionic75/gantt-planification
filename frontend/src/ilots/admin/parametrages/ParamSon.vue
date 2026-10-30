<!-- Son de notification : activation, essai, son personnalisé ; réglage propre au navigateur (stockage local, lu par
     l'ancien code pour jouer les notifications) -->
<script setup lang="ts">
import { ref } from 'vue';
import AppAlert from '@/composants/AppAlert.vue';
import AppSousSectionAdmin from '@/composants/AppSousSectionAdmin.vue';
import { jouerSonNotification } from '@/liaison';
import { TAILLE_MAX_SON } from './calculs';

const CLE_ACTIF = 'notifSoundEnabled';
const CLE_SON = 'notifSoundData';

const actif = ref(true);
const personnalise = ref(false);
const champ = ref<HTMLInputElement | null>(null);
const message = ref<{ type: 'success' | 'warning'; texte: string } | null>(null);

const lire = (cle: string) => {
    try {
        return localStorage.getItem(cle);
    } catch {
        return null;
    }
};

/** État relu à chaque ouverture de la sous-section, comme l'ancien écran */
function charger() {
    actif.value = lire(CLE_ACTIF) !== 'false';
    personnalise.value = !!lire(CLE_SON);
}
charger();

function changerActivation() {
    try {
        localStorage.setItem(CLE_ACTIF, actif.value ? 'true' : 'false');
    } catch {
        /* stockage indisponible */
    }
}

function choisirSon() {
    const f = champ.value?.files?.[0];
    if (!f) return;
    message.value = null;
    if (f.size > TAILLE_MAX_SON) {
        message.value = {
            type: 'warning',
            texte: 'Fichier trop volumineux (max 3 Mo — privilégiez un son court de 2-3 s).'
        };
        if (champ.value) champ.value.value = '';
        return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => {
        try {
            localStorage.setItem(CLE_SON, String(lecteur.result));
            charger();
            message.value = {
                type: 'success',
                texte: 'Son personnalisé enregistré. Cliquez sur "Tester" pour vérifier.'
            };
        } catch {
            message.value = { type: 'warning', texte: 'Son trop volumineux pour le stockage du navigateur.' };
        }
    };
    lecteur.readAsDataURL(f);
}

function sonParDefaut() {
    try {
        localStorage.removeItem(CLE_SON);
    } catch {
        /* stockage indisponible */
    }
    if (champ.value) champ.value.value = '';
    message.value = null;
    charger();
}
</script>

<template>
    <AppSousSectionAdmin titre="Son de notification push" id-corps="subNotifSound" @ouverture="charger">
        <template #icone>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
        </template>
        <div class="son">
            <div class="son__activation">
                <input
                    id="notifSoundEnabled"
                    v-model="actif"
                    type="checkbox"
                    class="son__case"
                    @change="changerActivation"
                />
                <label for="notifSoundEnabled" class="son__libelle">Activer le son de notification</label>
                <button type="button" class="son__tester" @click="jouerSonNotification">▶ Tester</button>
            </div>
            <div class="son__personnalise">
                <label for="notifSoundFile" class="son__titre">
                    🎵 Son personnalisé (mp3 ou wav, durée max ~3 s recommandée)
                </label>
                <div class="son__choix">
                    <input
                        id="notifSoundFile"
                        ref="champ"
                        type="file"
                        accept=".mp3,.wav,audio/mpeg,audio/wav"
                        class="son__fichier"
                        @change="choisirSon"
                    />
                    <button type="button" class="son__defaut" @click="sonParDefaut">
                        🔄 Remettre le son par défaut
                    </button>
                </div>
                <div id="notifSoundStatus" class="son__statut" :class="{ 'son__statut--personnalise': personnalise }">
                    <span :key="String(personnalise)">{{
                        personnalise ? '🎵 Son personnalisé chargé' : '🎵 Son par défaut'
                    }}</span>
                </div>
                <AppAlert v-if="message" :type="message.type" :description="message.texte" />
                <p class="son__note">
                    Le son est stocké localement dans ce navigateur. Chaque utilisateur peut configurer le sien.
                </p>
            </div>
        </div>
    </AppSousSectionAdmin>
</template>

<style scoped>
.son {
    background: #e8eaf6;
    border-radius: 8px;
    padding: 14px 16px;
}
.son__activation {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
}
.son__case {
    width: 16px;
    height: 16px;
    cursor: pointer;
}
.son__libelle {
    font-size: 13px;
    font-weight: bold;
    color: #283593;
    cursor: pointer;
    margin: 0;
}
.son__tester,
.son__tester:hover {
    margin-left: auto;
    background: #3f51b5;
    color: white;
    border: none;
    padding: 5px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
.son__personnalise {
    border-top: 1px solid #c5cae9;
    padding-top: 12px;
}
.son__titre {
    font-size: 12px;
    color: #283593;
    font-weight: bold;
    display: block;
    margin-bottom: 6px;
}
.son__choix {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.son__fichier {
    font-size: 12px;
    flex: 1;
    min-width: 200px;
}
.son__defaut,
.son__defaut:hover {
    background: #e53935;
    color: white;
    border: none;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
}
.son__statut {
    margin-top: 8px;
    font-size: 12px;
    color: #888;
}
.son__statut--personnalise {
    color: #2e7d32;
}
.son__note {
    font-size: 11px;
    color: #7986cb;
    margin: 6px 0 0;
}
</style>
