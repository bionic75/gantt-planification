<!-- Conversations avec les utilisateurs connectés : une fenêtre par interlocuteur, en bas à droite, de droite à gauche ;
     en-tête (un clic réduit ou rouvre la fenêtre ; messages non lus d'une fenêtre réduite), messages, saisie (Ctrl+Entrée
     ou bouton pour envoyer). Identifiants de l'ancien écran conservés (pcp_{id}, pcpHead_{id}, pcpTxt_{id}…). -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { ICONES_APPLICATION } from '@/composants/icones-application';
import BadgeProfil from './BadgeProfil.vue';
import { useDiscussionsStore, type Discussion } from './discussions';
import { useConnectesStore } from './magasin';

const LARGEUR = 300;
const ECART = 10;
const BORD = 24;

const discussions = useDiscussionsStore();
const connectes = useConnectesStore();
const saisies = ref<Record<number, string>>({});
const listes = ref<Record<number, HTMLElement | null>>({});

const droite = (i: number) => `${BORD + i * (LARGEUR + ECART)}px`;
const heure = (iso: string) =>
    iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const initiale = (nom: string | null) => (nom || '?').charAt(0).toUpperCase();
/** Profil de l'interlocuteur : celui du message reçu, à défaut celui de la liste des connectés */
const profil = (d: Discussion) => d.profile ?? connectes.liste.find(u => u.userId === d.userId)?.profile ?? null;

async function envoyer(d: Discussion) {
    if (await discussions.envoyer(d.userId, saisies.value[d.userId] ?? '')) saisies.value[d.userId] = '';
}

function clavier(e: KeyboardEvent, d: Discussion) {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        void envoyer(d);
    }
}

/** Derniers messages visibles */
async function descendre(userId: number) {
    await nextTick();
    const l = listes.value[userId];
    if (l) l.scrollTop = l.scrollHeight;
}

watch(
    () => discussions.discussions.map(d => `${d.userId}:${d.messages.length}:${d.minimized}`).join(','),
    () => discussions.discussions.forEach(d => void descendre(d.userId))
);
// Conversation ouverte depuis la liste des connectés : champ de saisie focalisé
watch(
    () => discussions.focus,
    async id => {
        if (id === null) return;
        await nextTick();
        document.getElementById(`pcpTxt_${id}`)?.focus();
        discussions.focus = null;
    }
);
</script>

<template>
    <div
        v-for="(d, i) in discussions.discussions"
        :id="`pcp_${d.userId}`"
        :key="d.userId"
        class="gp-discussion"
        :style="{ right: droite(i) }"
    >
        <div
            :id="`pcpHead_${d.userId}`"
            class="gp-discussion__tete"
            :class="{ 'gp-discussion__tete--reduite': d.minimized }"
            role="button"
            tabindex="0"
            :aria-expanded="!d.minimized"
            @click="discussions.basculer(d.userId)"
            @keydown.enter="discussions.basculer(d.userId)"
        >
            <img v-if="d.photo" :src="d.photo" alt="" class="gp-discussion__avatar gp-discussion__avatar--tete" />
            <span v-else class="gp-discussion__avatar gp-discussion__avatar--tete">{{ initiale(d.name) }}</span>
            <span class="gp-discussion__nom">{{ d.name }}</span>
            <BadgeProfil :profil="profil(d)" sombre />
            <span v-if="d.minimized && d.unread" :id="`pcpBadge_${d.userId}`" class="gp-discussion__non-lus">{{
                d.unread
            }}</span>
            <span class="gp-discussion__action" :title="d.minimized ? 'Rouvrir' : 'Réduire'"
                ><!-- eslint-disable vue/no-v-html -- tracés fixes de l'application -->
                <svg
                    class="app-ico"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    v-html="ICONES_APPLICATION[d.minimized ? 'chevronUp' : 'minus']"
                ></svg
                ><!-- eslint-enable vue/no-v-html --></span
            >
            <button
                type="button"
                class="gp-discussion__action gp-discussion__fermer"
                title="Fermer"
                aria-label="Fermer la conversation"
                @click.stop="discussions.fermer(d.userId)"
            >
                <svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
        </div>
        <div v-show="!d.minimized" :id="`pcpBody_${d.userId}`" class="gp-discussion__corps">
            <div
                :id="`pcpMsgs_${d.userId}`"
                :ref="el => (listes[d.userId] = el as HTMLElement)"
                class="gp-discussion__messages"
            >
                <div
                    v-for="(m, j) in d.messages"
                    :key="j"
                    class="gp-discussion__message"
                    :class="{ 'gp-discussion__message--moi': m.isOwn }"
                >
                    <template v-if="!m.isOwn">
                        <img v-if="m.senderPhoto" :src="m.senderPhoto" alt="" class="gp-discussion__avatar" />
                        <span v-else class="gp-discussion__avatar gp-discussion__avatar--autre">{{
                            initiale(m.senderName)
                        }}</span>
                    </template>
                    <div class="gp-discussion__bulle-zone">
                        <div class="gp-discussion__heure">{{ heure(m.time) }}</div>
                        <div class="gp-discussion__bulle">{{ m.text }}</div>
                    </div>
                </div>
            </div>
            <p v-if="d.erreur" class="gp-discussion__erreur" role="alert">{{ d.erreur }}</p>
            <div class="gp-discussion__saisie">
                <textarea
                    :id="`pcpTxt_${d.userId}`"
                    v-model="saisies[d.userId]"
                    placeholder="Votre message… (Ctrl+↵)"
                    maxlength="500"
                    rows="2"
                    :aria-label="`Message à ${d.name}`"
                    @keydown="clavier($event, d)"
                ></textarea>
                <button type="button" class="gp-discussion__envoyer" title="Envoyer (Ctrl+↵)" @click="envoyer(d)">
                    <svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="M22 2 11 13" />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<style>
.gp-discussion {
    position: fixed;
    bottom: 24px;
    width: 300px;
    z-index: 99999;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.22s ease;
    font-family: inherit;
}
.gp-discussion__tete {
    background: #3f51b5;
    border-radius: 12px 12px 0 0;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    flex-shrink: 0;
    user-select: none;
}
.gp-discussion__tete--reduite {
    border-radius: 12px;
}
.gp-discussion__avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    color: white;
}
.gp-discussion__avatar--tete {
    width: 26px;
    height: 26px;
    background: rgba(255, 255, 255, 0.25);
    border: 2px solid rgba(255, 255, 255, 0.5);
    box-sizing: border-box;
}
.gp-discussion__avatar--autre {
    background: #9fa8da;
}
.gp-discussion__nom {
    color: white;
    font-size: 12px;
    font-weight: bold;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.gp-discussion__non-lus {
    background: #e53935;
    color: white;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 10px;
    font-weight: bold;
}
.gp-discussion__action {
    color: rgba(255, 255, 255, 0.8);
    line-height: 1;
    display: inline-flex;
}
.gp-discussion__action svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
}
.gp-discussion__fermer {
    background: none;
    border: none;
    padding: 0;
    margin-left: 2px;
    cursor: pointer;
}
.gp-discussion__corps {
    display: flex;
    flex-direction: column;
    max-height: 420px;
}
.gp-discussion__messages {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 60px;
    max-height: 290px;
}
.gp-discussion__message {
    display: flex;
    gap: 6px;
    align-items: flex-start;
}
.gp-discussion__message--moi {
    justify-content: flex-end;
}
.gp-discussion__bulle-zone {
    max-width: 82%;
}
.gp-discussion__heure {
    font-size: 10px;
    color: #ccc;
    margin-bottom: 2px;
}
.gp-discussion__message--moi .gp-discussion__heure {
    text-align: right;
}
.gp-discussion__bulle {
    background: #f0f2ff;
    color: #2c3e50;
    border-radius: 3px 10px 10px 10px;
    padding: 7px 10px;
    font-size: 12px;
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
}
.gp-discussion__message--moi .gp-discussion__bulle {
    background: #3f51b5;
    color: white;
    border-radius: 10px 3px 10px 10px;
}
.gp-discussion__erreur {
    margin: 0;
    padding: 4px 10px;
    font-size: 12px;
    color: #c0392b;
}
.gp-discussion__saisie {
    padding: 8px 10px;
    border-top: 1px solid #e8eaf6;
    flex-shrink: 0;
    display: flex;
    gap: 6px;
    align-items: flex-end;
}
.gp-discussion__saisie textarea {
    flex: 1;
    border: 1px solid #c5cae9;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 12px;
    resize: none;
    box-sizing: border-box;
    font-family: inherit;
}
.gp-discussion__envoyer {
    background: #3f51b5;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
}
.gp-discussion__envoyer svg {
    width: 16px;
    height: 16px;
    stroke: white;
    fill: none;
}
</style>
