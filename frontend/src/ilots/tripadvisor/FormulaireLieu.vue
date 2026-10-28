<!-- Fenêtre d'ajout ou de modification d'un lieu, avec suggestions de la base de référence (OpenStreetMap) -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiLieux, type Categorie, type Lieu, type Suggestion } from '@/api/poi';
import AppAlert from '@/composants/AppAlert.vue';
import AppButton from '@/composants/AppButton.vue';
import AppInput from '@/composants/AppInput.vue';
import AppModal from '@/composants/AppModal.vue';
import AppNotation from '@/composants/AppNotation.vue';
import AppSelect from '@/composants/AppSelect.vue';
import AppTag from '@/composants/AppTag.vue';
import { CATEGORIES, km, LISTE_CATEGORIES } from './format';
import { useLieuxStore } from './magasin';

const props = defineProps<{ lieu: Lieu | null }>();
const emit = defineEmits<{ close: [] }>();
const lieux = useLieuxStore();
const p = props.lieu;

const samu = ref(p ? String(p.location_id) : lieux.filtres.loc);
const categorie = ref<Categorie | ''>(p ? p.category : lieux.filtres.cat);
const nom = ref(p?.name ?? '');
const adresse = ref(p?.address ?? '');
const telephone = ref(p?.phone ?? '');
const site = ref(p?.website ?? '');
const commentaire = ref(p?.comment ?? '');
const maNote = ref(0);
const position = ref<{ latitude: number; longitude: number } | null>(
    p && p.latitude != null && p.longitude != null ? { latitude: p.latitude, longitude: p.longitude } : null
);
const osmRef = ref(p?.osm_ref ?? '');
const erreur = ref('');
const enregistrement = ref(false);

const samus = computed(() =>
    (lieux.meta?.locations ?? []).map(l => ({
        value: l.id,
        text: `${l.libelle_court}${l.latitude == null ? ' (non géolocalisé)' : ''}`
    }))
);

// ── Suggestions ────────────────────────────────────────────────────────────
const suggestions = ref<Suggestion[]>([]);
const listeOuverte = ref(false);
const actif = ref(-1);
const message = ref('');
let minuteur: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

/** Recherche après une pause dans la saisie (immédiate au changement de SAMU-SAS) */
function planifierSuggestions(immediat = false) {
    clearTimeout(minuteur);
    const q = nom.value.trim();
    if (q.length < 3) {
        listeOuverte.value = false;
        message.value = '';
        return;
    }
    minuteur = setTimeout(() => void chercher(q), immediat ? 50 : 500);
}

async function chercher(q: string) {
    const n = ++sequence;
    message.value = 'Recherche dans la base de référence…';
    try {
        const { places } = await apiLieux.suggestions(q, samu.value);
        if (n !== sequence) return;
        suggestions.value = places;
        actif.value = -1;
        listeOuverte.value = places.length > 0;
        message.value = places.length
            ? "Choisissez une suggestion pour compléter l'adresse et la position (source : OpenStreetMap), ou continuez la saisie manuelle."
            : "Aucune suggestion : saisissez l'adresse manuellement.";
    } catch {
        if (n !== sequence) return;
        message.value = 'Base de référence indisponible : saisie manuelle possible.';
        listeOuverte.value = false;
    }
}

function choisir(s: Suggestion) {
    nom.value = s.name;
    adresse.value = s.address ?? '';
    if (s.phone) telephone.value = s.phone;
    if (s.website) site.value = s.website;
    position.value = { latitude: s.latitude, longitude: s.longitude };
    osmRef.value = s.osm_ref ?? '';
    listeOuverte.value = false;
    message.value = "Informations complétées depuis OpenStreetMap : vérifiez-les avant d'enregistrer.";
}

function clavierNom(e: KeyboardEvent) {
    if (!listeOuverte.value) return;
    const n = suggestions.value.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        actif.value = (actif.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (e.key === 'Enter' && actif.value >= 0) {
        e.preventDefault();
        const s = suggestions.value[actif.value];
        if (s) choisir(s);
    } else if (e.key === 'Escape') {
        // Fermeture de la liste seulement, pas de la fenêtre
        e.stopPropagation();
        listeOuverte.value = false;
    }
}

const zoneNom = ref<HTMLElement | null>(null);
const clicAilleurs = (e: MouseEvent) => {
    if (!zoneNom.value?.contains(e.target as Node)) listeOuverte.value = false;
};
onMounted(() => document.addEventListener('click', clicAilleurs));
onBeforeUnmount(() => {
    document.removeEventListener('click', clicAilleurs);
    clearTimeout(minuteur);
});

function nomSaisi(v: string) {
    nom.value = v;
    planifierSuggestions();
}

/** Adresse modifiée à la main : position recalculée par le serveur à l'enregistrement */
function adresseSaisie(v: string) {
    adresse.value = v;
    position.value = null;
    osmRef.value = '';
}

function samuChoisi(v: string) {
    samu.value = v;
    planifierSuggestions(true);
}

async function enregistrer() {
    erreur.value = '';
    enregistrement.value = true;
    try {
        await lieux.enregistrer(p?.id ?? null, {
            location_id: Number(samu.value),
            category: categorie.value,
            name: nom.value.trim(),
            address: adresse.value.trim(),
            latitude: position.value?.latitude ?? null,
            longitude: position.value?.longitude ?? null,
            osm_ref: osmRef.value ?? '',
            phone: telephone.value.trim(),
            website: site.value.trim(),
            comment: commentaire.value.trim(),
            rating: maNote.value || undefined
        });
        emit('close');
    } catch (e) {
        erreur.value = (e as Error).message;
    } finally {
        enregistrement.value = false;
    }
}
</script>

<template>
    <AppModal id="tripModal" opened :title="lieu ? 'Modifier le lieu' : 'Ajouter un lieu'" @close="emit('close')">
        <div class="tr-form">
            <AppSelect
                select-id="tfLoc"
                label="SAMU-SAS de rattachement"
                required
                default-unselected-text="— Choisir —"
                :options="samus"
                :model-value="samu"
                @update:model-value="samuChoisi"
            />
            <div role="group" aria-labelledby="tfCatLibelle">
                <span id="tfCatLibelle" class="gp-champ__libelle">Typologie *</span>
                <div class="tr-form__categories">
                    <AppTag
                        v-for="c in LISTE_CATEGORIES"
                        :key="c"
                        selectable
                        :icon="CATEGORIES[c].icone"
                        :label="CATEGORIES[c].label"
                        :couleur="`var(--gp-cat-${c})`"
                        :selected="categorie === c"
                        @select="categorie = c"
                    />
                </div>
            </div>
            <div ref="zoneNom" class="tr-form__nom">
                <AppInput
                    id="tfName"
                    :model-value="nom"
                    label="Nom du lieu"
                    required
                    hint="tapez le nom : les lieux connus (OpenStreetMap) autour du SAMU-SAS sont proposés"
                    maxlength="120"
                    autocomplete="off"
                    placeholder="Ex : Hôtel Ibis, Brasserie du Port…"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="tfSug"
                    :aria-expanded="listeOuverte ? 'true' : 'false'"
                    :aria-activedescendant="actif >= 0 ? `tfSug_${actif}` : undefined"
                    aria-describedby="tfSugMsg"
                    @update:model-value="nomSaisi"
                    @keydown="clavierNom"
                >
                    <ul
                        v-show="listeOuverte"
                        id="tfSug"
                        class="tr-form__suggestions"
                        role="listbox"
                        aria-label="Suggestions"
                    >
                        <li
                            v-for="(s, i) in suggestions"
                            :id="`tfSug_${i}`"
                            :key="`${s.osm_ref ?? ''}${i}`"
                            role="option"
                            :aria-selected="i === actif ? 'true' : 'false'"
                            :class="{ 'tr-form__suggestion--active': i === actif }"
                            @click="choisir(s)"
                        >
                            <b>{{ s.name }}</b>
                            <template v-if="s.category">
                                {{ ' '
                                }}<AppTag
                                    :label="CATEGORIES[s.category].label"
                                    :icon="CATEGORIES[s.category].icone"
                                    :couleur="`var(--gp-cat-${s.category})`"
                                />
                            </template>
                            <br />
                            <span class="tr-form__suggestion-adresse"
                                >{{ s.address || ''
                                }}<template v-if="s.distance_km != null">
                                    · {{ km(s.distance_km) }} km du SAMU-SAS</template
                                ></span
                            >
                        </li>
                    </ul>
                </AppInput>
                <div id="tfSugMsg" class="tr-form__message" aria-live="polite">{{ message }}</div>
            </div>
            <AppInput
                id="tfAddr"
                :model-value="adresse"
                label="Adresse"
                maxlength="250"
                placeholder="Remplie automatiquement ; modifiable"
                @update:model-value="adresseSaisie"
            />
            <div class="tr-form__position" :class="{ 'tr-form__position--ok': position }">
                <template v-if="position">
                    ✔ Position repérée ({{ position.latitude.toFixed(5) }}, {{ position.longitude.toFixed(5) }})
                </template>
                <template v-else>La position sera calculée à partir de l'adresse à l'enregistrement.</template>
            </div>
            <div class="tr-form__deux">
                <AppInput id="tfPhone" v-model="telephone" label="Téléphone" maxlength="40" />
                <AppInput id="tfWeb" v-model="site" label="Site web" maxlength="250" />
            </div>
            <AppInput
                id="tfComment"
                v-model="commentaire"
                is-textarea
                label="Mon commentaire (pourquoi cette adresse ?)"
                rows="3"
                maxlength="2000"
                placeholder="Prix, ambiance, accès, conseils…"
            />
            <div v-if="!lieu">
                <span class="gp-champ__libelle">Ma note</span>
                <AppNotation v-model="maNote" :taille="26" label="Ma note" />
            </div>
            <AppAlert v-if="erreur" type="error" :description="erreur" />
        </div>
        <template #footer>
            <AppButton secondary label="Annuler" @click="emit('close')" />
            <AppButton icon="valider" label="Enregistrer" :disabled="enregistrement" @click="enregistrer" />
        </template>
    </AppModal>
</template>

<style scoped>
.tr-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: var(--gp-espace-2);
}
.tr-form__categories {
    display: flex;
    gap: var(--gp-espace-2);
    flex-wrap: wrap;
}
.tr-form__nom :deep(.gp-champ) {
    position: relative;
}
.tr-form__suggestions {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 10;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--gp-fond);
    border: 1px solid var(--gp-bordure);
    border-radius: 0 0 10px 10px;
    box-shadow: var(--gp-ombre-liste);
    max-height: 290px;
    overflow: auto;
}
.tr-form__suggestions li {
    padding: var(--gp-espace-2) var(--gp-espace-3);
    cursor: pointer;
    font-size: var(--gp-police-m);
    border-top: 1px solid var(--gp-bordure-legere);
}
.tr-form__suggestions li:hover,
.tr-form__suggestion--active {
    background: var(--gp-fond-survol);
}
.tr-form__suggestion-adresse {
    font-size: var(--gp-police-s);
    color: var(--gp-texte-doux);
}
.tr-form__message {
    font-size: var(--gp-police-xs);
    color: var(--gp-texte-discret);
    margin-top: 3px;
}
.tr-form__position {
    font-size: var(--gp-police-s);
    margin-top: -6px;
    color: var(--gp-texte-discret);
}
.tr-form__position--ok {
    color: var(--gp-succes);
}
.tr-form__deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}
</style>
