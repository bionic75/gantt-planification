<!-- Zone de l'utilisateur dans l'en-tête, commune à la Planification et aux applications (EnTeteApplication) : rond
     (photo, trigramme ou initiales ; un clic ouvre le profil), nom, profil. Planification seulement : pastille des
     nouvelles affectations de l'expert et changement de profil d'un compte à plusieurs profils (page rechargée).
     Identifiants de l'ancien en-tête conservés : « profileCircle », « userDisplayName »… sans préfixe (Planification),
     « {prefixe}ProfileCircle »… pour une application. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { api, ErreurApi } from '@/api/client';
import type { Profil, Session } from '@/api/types';
import { ouvrirPhotoProfil } from '@/liaison';

const props = withDefaults(
    defineProps<{
        session: Session | null;
        /** Préfixe des identifiants (application) ; vide pour la Planification */
        prefixe?: string;
        /** Nom affiché : « NOM Prénom » (Planification) ou « Prénom Nom » (applications) */
        format?: 'nom-prenom' | 'prenom-nom';
        /** Changement de profil proposé (compte à plusieurs profils) */
        changementProfil?: boolean;
        /** Nouvelles affectations de l'expert (pastille sur le rond) ; null : pas de pastille */
        nouvellesAffectations?: number | null;
    }>(),
    { prefixe: '', format: 'prenom-nom', changementProfil: false, nouvellesAffectations: null }
);
const emit = defineEmits<{ 'nouvelles-affectations': [] }>();

/** Identifiant de l'ancien en-tête : « profileCircle » (Planification), « analyseProfileCircle »… (applications) */
const id = (nom: string) => (props.prefixe ? `${props.prefixe}${nom}` : `${nom[0]!.toLowerCase()}${nom.slice(1)}`);

const LIBELLES: Record<Profil, string> = {
    admin: 'Administrateur',
    expert: 'Expert Métier',
    user: 'Utilisateur',
    rh: 'RH'
};
/** Profils d'un compte, dans l'ordre de l'ancien sélecteur */
const ORDRE: Profil[] = ['admin', 'expert', 'rh', 'user'];

const nom = computed(() => {
    const s = props.session;
    if (!s) return '';
    if (props.format === 'nom-prenom') return `${(s.nom || '').toUpperCase()} ${s.prenom || ''}`.trim();
    return `${s.prenom || ''} ${s.nom || ''}`.trim() || s.username;
});

/** Rond sans photo : trigramme, à défaut les initiales du prénom et du nom */
const initiales = computed(() => {
    const s = props.session;
    if (!s) return '?';
    return s.trigramme || `${s.prenom?.charAt(0) || ''}${s.nom?.charAt(0) || ''}` || '??';
});

const libelleProfil = computed(() => (props.session ? LIBELLES[props.session.activeProfile] : ''));

const profils = computed(() => {
    const s = props.session;
    if (!s) return [];
    const drapeaux: Record<Profil, boolean> = { admin: s.is_admin, expert: s.is_expert, rh: s.is_rh, user: s.is_user };
    return ORDRE.filter(p => drapeaux[p]);
});
const selecteur = computed(() => props.changementProfil && profils.value.length > 1);

// ── Changement de profil ─────────────────────────────────────────────────────

const ouverte = ref(false);
const erreur = ref('');
const zoneSelecteur = ref<HTMLElement | null>(null);

function fermerSurClic(e: MouseEvent) {
    if (!zoneSelecteur.value?.contains(e.target as Node)) fermer();
}
function fermer() {
    ouverte.value = false;
    document.removeEventListener('click', fermerSurClic);
}
function basculer() {
    if (ouverte.value) return fermer();
    erreur.value = '';
    ouverte.value = true;
    setTimeout(() => document.addEventListener('click', fermerSurClic), 0);
}

async function choisir(profil: Profil) {
    if (profil === props.session?.activeProfile) return fermer();
    try {
        await api.post('/switch-profile', { profile: profil });
        // Interface cohérente avec le nouveau profil : page rechargée
        location.reload();
    } catch (e) {
        erreur.value = `Erreur : ${e instanceof ErreurApi ? e.message : 'Impossible de changer de profil'}`;
    }
}

onBeforeUnmount(fermer);
</script>

<template>
    <div class="gp-zone-utilisateur__rond-zone">
        <button
            :id="id('ProfileCircle')"
            type="button"
            class="gp-zone-utilisateur__rond"
            title="Cliquer pour changer la photo"
            @click="ouvrirPhotoProfil()"
        >
            <img
                v-if="session?.profilePhoto"
                :id="id('ProfilePhoto')"
                :src="session.profilePhoto"
                alt=""
                class="gp-zone-utilisateur__photo"
            />
            <span v-else :id="id('ProfileTrigramme')" class="gp-zone-utilisateur__trigramme">{{ initiales }}</span>
        </button>
        <button
            v-if="nouvellesAffectations"
            :id="id('NotificationBadge')"
            type="button"
            class="gp-zone-utilisateur__pastille"
            title="Nouvelles affectations"
            @click="emit('nouvelles-affectations')"
        >
            <span :id="id('NotificationCount')">{{ nouvellesAffectations }}</span>
        </button>
    </div>
    <span :id="id('UserDisplayName')" class="user-info-name gp-zone-utilisateur__nom">{{ nom }}</span>
    <span v-if="!selecteur" :id="id('UserDisplayRole')" class="user-info-role gp-zone-utilisateur__role">{{
        libelleProfil
    }}</span>
    <div v-else :id="id('ProfileSwitcher')" ref="zoneSelecteur" class="gp-zone-utilisateur__selecteur">
        <button
            :id="id('ProfileSwitcherBtn')"
            type="button"
            class="gp-zone-utilisateur__profil"
            :aria-expanded="ouverte"
            @click="basculer"
        >
            <span :id="id('ProfileSwitcherLabel')">{{ libelleProfil }}</span
            ><span class="gp-zone-utilisateur__fleche" aria-hidden="true">▼</span>
        </button>
        <div v-show="ouverte" :id="id('ProfileDropdown')" class="gp-zone-utilisateur__liste">
            <div
                v-for="p in profils"
                :key="p"
                class="gp-zone-utilisateur__choix"
                :class="{ 'gp-zone-utilisateur__choix--actif': p === session?.activeProfile }"
                role="button"
                tabindex="0"
                @click="choisir(p)"
                @keydown.enter="choisir(p)"
            >
                <span class="gp-zone-utilisateur__point" :class="`gp-zone-utilisateur__point--${p}`"></span>
                <span class="gp-zone-utilisateur__libelle">{{ LIBELLES[p] }}</span>
                <span v-if="p === session?.activeProfile" class="gp-zone-utilisateur__coche">✓</span>
            </div>
            <div v-if="erreur" class="gp-zone-utilisateur__erreur" role="alert">{{ erreur }}</div>
        </div>
    </div>
</template>

<style>
.gp-zone-utilisateur__rond-zone {
    position: relative;
    display: flex;
    align-items: center;
}
.gp-zone-utilisateur__rond {
    width: 50px;
    height: 50px;
    padding: 0;
    border-radius: 50%;
    border: 3px solid #1d70b7;
    background-color: #7f8c8d;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
}
.gp-zone-utilisateur__trigramme {
    color: white;
    font-weight: bold;
    font-size: 16px;
}
.gp-zone-utilisateur__photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.gp-zone-utilisateur__pastille {
    position: absolute;
    top: -8px;
    left: -8px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
}
.gp-zone-utilisateur__pastille span {
    background-color: #e74c3c;
    color: white;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    border: 2px solid #34495e;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
.gp-zone-utilisateur__nom {
    margin-left: 15px;
}
.gp-zone-utilisateur__role {
    cursor: default;
}
.gp-zone-utilisateur__selecteur {
    display: inline-flex;
    position: relative;
    margin-left: 4px;
}
.gp-zone-utilisateur__profil {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: white;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
}
.gp-zone-utilisateur__fleche {
    font-size: 9px;
}
.gp-zone-utilisateur__liste {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: white;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    min-width: 160px;
    z-index: 9999;
    overflow: hidden;
}
.gp-zone-utilisateur__choix {
    padding: 10px 16px;
    font-size: 13px;
    color: #222;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid #eee;
    background: white;
    transition: background 0.15s;
}
.gp-zone-utilisateur__choix--actif {
    background: #f0f4ff;
}
.gp-zone-utilisateur__choix:hover {
    background: #e8eeff;
}
.gp-zone-utilisateur__point {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
}
.gp-zone-utilisateur__point--admin {
    background: #c0392b;
}
.gp-zone-utilisateur__point--expert {
    background: #e67e22;
}
.gp-zone-utilisateur__point--user {
    background: #2980b9;
}
.gp-zone-utilisateur__point--rh {
    background: #8e44ad;
}
.gp-zone-utilisateur__choix--actif .gp-zone-utilisateur__point {
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.15);
}
.gp-zone-utilisateur__libelle {
    flex: 1;
}
.gp-zone-utilisateur__choix--actif .gp-zone-utilisateur__libelle {
    font-weight: 600;
}
.gp-zone-utilisateur__coche {
    color: #27ae60;
    font-size: 14px;
    font-weight: bold;
}
.gp-zone-utilisateur__erreur {
    padding: 8px 16px;
    font-size: 12px;
    color: #c0392b;
}
</style>
