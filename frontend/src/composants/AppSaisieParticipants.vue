<!-- Participants choisis en étiquettes, avec suggestions à la saisie (nom ou email).
     Options : invités externes (Entrée ou dernière suggestion : saisie libre, email ou nom), suggestions détaillées
     (email, badge Expert), couleurs des pastilles. Identifiants des éléments fournis (repères des tests e2e). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/** Compte proposé (interne) */
export interface CompteParticipant {
    id: number;
    nom: string | null;
    prenom: string | null;
    email?: string | null;
    username?: string;
    is_expert?: number | boolean | null;
}

/** Participant choisi : compte interne, ou invité externe (sans identifiant) */
export interface Participant {
    id?: number;
    nom: string | null;
    prenom: string | null;
    email?: string | null;
    username?: string;
    external?: boolean;
}

const props = withDefaults(
    defineProps<{
        comptes: CompteParticipant[];
        label: string;
        idSaisie: string;
        idCadre: string;
        idListe: string;
        externes?: boolean;
        detaille?: boolean;
        couleurs?: string[];
    }>(),
    // Couleurs des pastilles par défaut (reporting)
    { couleurs: () => ['#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#ff9800'] }
);
const choisis = defineModel<Participant[]>({ default: () => [] });

const saisie = ref('');
const ouverte = ref(false);
const actif = ref(-1);
const zone = ref<HTMLElement | null>(null);
const champ = ref<HTMLInputElement | null>(null);

const nomAffiche = (p: Participant) => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
const libelleCompte = (c: Participant) => nomAffiche(c) || c.username || '';
const libelleEtiquette = (p: Participant) => nomAffiche(p) || p.email || '?';
const initiales = (p: Participant) =>
    ((p.prenom || '')[0] || '').toUpperCase() + ((p.nom || '')[0] || '').toUpperCase();

/** Couleur stable selon le nom affiché */
function couleur(nom: string) {
    let h = 0;
    for (let i = 0; i < nom.length; i++) h = nom.charCodeAt(i) + ((h << 5) - h);
    return props.couleurs[Math.abs(h) % props.couleurs.length] as string;
}

/** Comptes non choisis dont le nom ou l'email contient la saisie (8 au plus) */
const suggestions = computed(() => {
    const q = saisie.value.toLowerCase().trim();
    const deja = new Set(choisis.value.filter(p => !p.external).map(p => p.id));
    return props.comptes
        .filter(c => {
            if (deja.has(c.id)) return false;
            if (!q) return true;
            const nom = `${c.prenom || ''} ${c.nom || ''}`.toLowerCase();
            return nom.includes(q) || (c.email || '').toLowerCase().includes(q);
        })
        .slice(0, 8);
});
/** Invité externe proposé après les comptes (saisie non vide) */
const externe = computed(() => (props.externes ? saisie.value.toLowerCase().trim() : ''));
const nbOptions = computed(() => suggestions.value.length + (externe.value ? 1 : 0));
const listeVisible = computed(() => ouverte.value && nbOptions.value > 0);

function ouvrir() {
    ouverte.value = true;
    actif.value = -1;
}

function apresAjout() {
    saisie.value = '';
    ouverte.value = false;
    champ.value?.focus();
}

function ajouter(c: CompteParticipant) {
    if (!choisis.value.some(p => !p.external && p.id === c.id)) {
        choisis.value = [
            ...choisis.value,
            { id: c.id, nom: c.nom || '', prenom: c.prenom || '', email: c.email || '' }
        ];
    }
    apresAjout();
}

/** Invité externe : adresse email, sinon nom */
function ajouterExterne(texte: string) {
    const q = texte.trim();
    if (!q) return;
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
    choisis.value = [
        ...choisis.value,
        email ? { external: true, nom: '', prenom: '', email: q } : { external: true, nom: q, prenom: '', email: '' }
    ];
    apresAjout();
}

function retirer(i: number) {
    choisis.value = choisis.value.filter((_, j) => j !== i);
}

function choisirOption(i: number) {
    const c = suggestions.value[i];
    if (c) ajouter(c);
    else if (externe.value) ajouterExterne(externe.value);
}

function clavier(e: KeyboardEvent) {
    if (e.key === 'Backspace' && !saisie.value && choisis.value.length) {
        choisis.value = choisis.value.slice(0, -1);
    } else if (e.key === 'Escape') {
        ouverte.value = false;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!listeVisible.value) return ouvrir();
        e.preventDefault();
        const n = nbOptions.value;
        actif.value = (actif.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (e.key === 'Enter') {
        if (listeVisible.value && actif.value >= 0) {
            e.preventDefault();
            choisirOption(actif.value);
        } else if (props.externes && saisie.value.trim()) {
            e.preventDefault();
            ajouterExterne(saisie.value);
        }
    }
}

const clicAilleurs = (e: MouseEvent) => {
    if (!zone.value?.contains(e.target as Node)) ouverte.value = false;
};
onMounted(() => document.addEventListener('click', clicAilleurs));
onBeforeUnmount(() => document.removeEventListener('click', clicAilleurs));
</script>

<template>
    <div ref="zone" class="gp-participants" :class="{ 'gp-participants--detaille': detaille }">
        <label class="gp-participants__libelle" :for="idSaisie">{{ label }}</label>
        <div :id="idCadre" class="gp-participants__cadre" @click="champ?.focus()">
            <span
                v-for="(p, i) in choisis"
                :key="`${p.external ? 'e' : 'i'}${p.id ?? ''}${p.email ?? ''}${p.nom ?? ''}${i}`"
                class="gp-participants__etiquette"
                :class="{ 'gp-participants__etiquette--externe': p.external }"
                :title="p.external ? (p.email ? `Invité externe — ${p.email}` : 'Invité externe') : undefined"
            >
                <span
                    class="gp-participants__avatar gp-participants__avatar--petit"
                    :style="{ background: p.external ? '#78909c' : couleur(libelleEtiquette(p)) }"
                    >{{ p.external ? '✉' : initiales(p) }}</span
                >
                <span class="gp-participants__nom">{{ libelleEtiquette(p) }}</span>
                <button
                    type="button"
                    class="gp-participants__retirer"
                    :aria-label="`Retirer ${libelleEtiquette(p)}`"
                    title="Retirer"
                    @click.stop="retirer(i)"
                >
                    &times;
                </button>
            </span>
            <input
                :id="idSaisie"
                ref="champ"
                v-model="saisie"
                type="text"
                class="gp-participants__saisie"
                placeholder="Nom ou email..."
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                :aria-controls="idListe"
                :aria-expanded="listeVisible ? 'true' : 'false'"
                :aria-activedescendant="actif >= 0 ? `${idListe}-${actif}` : undefined"
                @input="ouvrir"
                @focus="ouvrir"
                @keydown="clavier"
            />
        </div>
        <ul v-show="listeVisible" :id="idListe" class="gp-participants__liste" role="listbox" :aria-label="label">
            <li
                v-for="(c, i) in suggestions"
                :id="`${idListe}-${i}`"
                :key="c.id"
                role="option"
                :aria-selected="i === actif ? 'true' : 'false'"
                :class="{ 'gp-participants__option--active': i === actif }"
                @click.stop="ajouter(c)"
            >
                <span class="gp-participants__avatar" :style="{ background: couleur(libelleCompte(c)) }">{{
                    initiales(c)
                }}</span>
                <span v-if="detaille" class="gp-participants__detail">
                    <span class="gp-participants__compte"
                        >{{ libelleCompte(c)
                        }}<span v-if="c.is_expert" class="gp-participants__expert">Expert</span></span
                    >
                    <span v-if="c.email" class="gp-participants__email">{{ c.email }}</span>
                </span>
                <span v-else>{{ libelleCompte(c) }}</span>
            </li>
            <li
                v-if="externe"
                :id="`${idListe}-${suggestions.length}`"
                role="option"
                class="gp-participants__option-externe"
                :aria-selected="actif === suggestions.length ? 'true' : 'false'"
                :class="{ 'gp-participants__option--active': actif === suggestions.length }"
                @click.stop="ajouterExterne(externe)"
            >
                <span class="gp-participants__avatar gp-participants__avatar--externe">✉</span>
                <span class="gp-participants__detail">
                    <span class="gp-participants__ajout-externe">➕ Ajouter comme invité externe</span>
                    <span class="gp-participants__email">{{ externe }}</span>
                </span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.gp-participants {
    position: relative;
}
.gp-participants__libelle {
    font-size: 12px;
    color: #555;
    font-weight: normal;
    display: block;
    margin-bottom: 5px;
}
.gp-participants__cadre {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-height: 36px;
    min-width: 220px;
    max-width: 340px;
    align-items: center;
    background: white;
    cursor: text;
    box-sizing: border-box;
}
.gp-participants__saisie {
    border: none;
    outline: none;
    flex: 1;
    min-width: 80px;
    width: auto;
    padding: 2px 0;
    font-size: 12px;
}
.gp-participants__saisie:focus {
    box-shadow: none;
}
.gp-participants__etiquette {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 15px;
    padding: 2px 8px 2px 2px;
    font-size: 11px;
    white-space: nowrap;
}
.gp-participants__etiquette--externe {
    background: #eceff1;
    border-color: #b0bec5;
}
.gp-participants__nom {
    color: #333;
}
.gp-participants__retirer {
    border: none;
    background: none;
    padding: 0;
    margin-left: 2px;
    color: #999;
    font-size: 14px;
    font-weight: 400;
    line-height: 1;
    cursor: pointer;
}
.gp-participants__retirer:hover {
    background: none;
    color: #555;
}
.gp-participants__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    flex-shrink: 0;
}
.gp-participants__avatar--petit {
    width: 20px;
    height: 20px;
    font-size: 9px;
}
.gp-participants__avatar--externe {
    background: #78909c;
    font-size: 14px;
}
.gp-participants__liste {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
}
.gp-participants__liste li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid #f5f5f5;
    font-size: 13px;
}
.gp-participants__liste li:hover,
.gp-participants__option--active {
    background: #f5f5f5;
}
.gp-participants__liste li.gp-participants__option-externe {
    border-bottom: none;
    border-top: 1px dashed #e0e0e0;
    background: #f9f9f9;
}
.gp-participants__liste li.gp-participants__option-externe:hover {
    background: #eceff1;
}
.gp-participants__detail {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
}
.gp-participants__compte {
    font-size: 13px;
    font-weight: 500;
    color: #333;
}
.gp-participants__expert {
    background: #ffe0b2;
    color: #e65100;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 9px;
    margin-left: 6px;
}
.gp-participants__email {
    font-size: 11px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.gp-participants__ajout-externe {
    font-size: 12px;
    font-weight: 500;
    color: #546e7a;
}

/* Formulaire d'événement : libellé, cadre et liste de l'ancien formulaire */
.gp-participants--detaille .gp-participants__libelle {
    font-size: 11px;
    color: #e65100;
    margin-bottom: 3px;
    line-height: 14px;
    height: 14px;
}
.gp-participants--detaille .gp-participants__cadre {
    padding: 3px 6px;
    min-height: 32px;
    min-width: 0;
    max-width: none;
}
.gp-participants--detaille .gp-participants__saisie {
    padding: 3px 0;
}
.gp-participants--detaille .gp-participants__avatar:not(.gp-participants__avatar--petit) {
    width: 32px;
    height: 32px;
    font-size: 12px;
}
.gp-participants--detaille .gp-participants__etiquette--externe .gp-participants__avatar {
    font-size: 10px;
}
.gp-participants--detaille .gp-participants__liste {
    z-index: 10010;
}
.gp-participants--detaille .gp-participants__avatar--externe {
    font-size: 14px;
}
</style>
