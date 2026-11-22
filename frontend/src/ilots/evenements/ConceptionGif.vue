<!-- Fenêtre de conception du GIF / MP4 : aperçu de l'image finale (WYSIWYG) où l'on place les éléments à la souris
     (glisser), où l'on change leur taille (poignée en bas à droite, curseurs) et où l'on règle titre, légende, compteur
     et logos. Le dessin est celui de l'export : l'aperçu est l'image obtenue (dernière date de la période). -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import AppModal from '@/composants/AppModal.vue';
import {
    ajusterTaille,
    BORNES,
    centreCadre,
    elementEn,
    miseEnPageParDefaut,
    positionApresDeplacement,
    POLICES_GIF,
    REFERENCE_GIF,
    ZOOM_CARTE,
    zoomAutour,
    type Bornes,
    type BoiteElement,
    type MiseEnPage,
    type Position
} from './mise-en-page';
import type { Rendu } from './mise-en-page-rendu';

const props = defineProps<{
    opened: boolean;
    /** Fond de carte et dessin de l'image (null : rien à animer, le motif est signalé par la fenêtre de la carte) */
    creerRendu: (largeur: number, margeHaut: number) => Promise<Rendu | null>;
    /** Images des logos importés, par identifiant (partagées avec l'export) */
    images: Map<number, HTMLImageElement>;
}>();
const emit = defineEmits<{ close: [] }>();
const mep = defineModel<MiseEnPage>({ required: true });

const canvas = ref<HTMLCanvasElement | null>(null);
const rendu = shallowRef<Rendu | null>(null);
const chargement = ref(false);
const messageApercu = ref('');
const messageLogo = ref('');
/** Élément sélectionné : « titre », « legende », « compteur » ou « logo-<id> » */
const selection = ref('titre');
let boites: BoiteElement[] = [];
const curseur = ref('default');

// ---------- Accès aux éléments ----------

type Element = Position & { taille?: number };
function element(id: string): Element | undefined {
    const m = mep.value;
    if (id === 'titre' || id === 'legende' || id === 'compteur') return m[id];
    return m.logos.find(l => `logo-${l.id}` === id);
}
function bornesDe(id: string): Bornes {
    return id === 'titre'
        ? BORNES.titre
        : id === 'legende'
          ? BORNES.legende
          : id === 'compteur'
            ? BORNES.compteur
            : BORNES.logo;
}
const boiteDe = (id: string) => boites.find(b => b.id === id);

// ---------- Dessin ----------

const TAILLE_POIGNEE = 14;
/** Largeur de l'aperçu à l'écran, en pixels de canvas par pixel d'écran */
const echelleEcran = () => {
    const largeurEcran = canvas.value?.getBoundingClientRect().width ?? 0;
    // Aperçu pas encore mis en page (largeur nulle) : échelle neutre
    return canvas.value && largeurEcran > 0 ? canvas.value.width / largeurEcran : 1;
};

function redessiner() {
    const c = canvas.value;
    const r = rendu.value;
    const ctx = c?.getContext('2d');
    if (!c || !r || !ctx) return;
    boites = r.dessiner(ctx, r.dateApercu, mep.value);
    const b = boiteDe(selection.value);
    if (!b) return;
    // Cadre de sélection et poignée de redimensionnement (aperçu seulement, jamais exportés)
    const k = echelleEcran();
    ctx.save();
    ctx.strokeStyle = '#1565c0';
    ctx.lineWidth = 2 * k;
    ctx.setLineDash([6 * k, 4 * k]);
    ctx.strokeRect(b.x, b.y, b.largeur, b.hauteur);
    ctx.setLineDash([]);
    const h = TAILLE_POIGNEE * k;
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(b.x + b.largeur - h / 2, b.y + b.hauteur - h / 2, h, h);
    ctx.restore();
}

let imageProgrammee = 0;
function programmerRedessin() {
    cancelAnimationFrame(imageProgrammee);
    imageProgrammee = requestAnimationFrame(redessiner);
}
watch(mep, programmerRedessin, { deep: true });
watch(selection, programmerRedessin);

async function charger() {
    chargement.value = true;
    messageApercu.value = '';
    const r = await props.creerRendu(REFERENCE_GIF, mep.value.margeHaut);
    chargement.value = false;
    rendu.value = r;
    if (!r) {
        messageApercu.value = "Aucun aperçu : il n'y a aucune mise en service à animer.";
        return;
    }
    await nextTick();
    if (canvas.value) {
        canvas.value.width = r.largeur;
        canvas.value.height = r.hauteur;
    }
    // Après la mise en page : l'échelle d'écran sert au cadre de sélection
    programmerRedessin();
}

watch(
    () => props.opened,
    ouverte => {
        if (ouverte) {
            selection.value = 'titre';
            messageLogo.value = '';
            void charger();
        } else rendu.value = null;
    },
    { immediate: true }
);

// La carte est recadrée quand la marge du haut change (délai : un curseur envoie beaucoup de valeurs)
let delai: ReturnType<typeof setTimeout> | undefined;
watch(
    () => mep.value.margeHaut,
    () => {
        clearTimeout(delai);
        if (props.opened) delai = setTimeout(() => void charger(), 200);
    }
);
onBeforeUnmount(() => {
    clearTimeout(delai);
    cancelAnimationFrame(imageProgrammee);
});

// ---------- Souris ----------

interface Geste {
    /** Déplacer ou redimensionner un élément, ou déplacer la carte (fond de l'aperçu) */
    mode: 'deplacer' | 'taille' | 'carte';
    id: string;
    x0: number;
    y0: number;
    position0: Position;
    taille0: number;
    boite0: BoiteElement;
}
let geste: Geste | null = null;

function pointDe(e: PointerEvent) {
    const r = canvas.value!.getBoundingClientRect();
    return {
        x: ((e.clientX - r.left) * canvas.value!.width) / r.width,
        y: ((e.clientY - r.top) * canvas.value!.height) / r.height
    };
}
/** Le point est-il sur la poignée (coin bas droit) de l'élément sélectionné ? */
function surPoignee(p: { x: number; y: number }) {
    const b = boiteDe(selection.value);
    if (!b) return false;
    const h = (TAILLE_POIGNEE * echelleEcran()) / 2 + 3;
    return Math.abs(p.x - (b.x + b.largeur)) <= h && Math.abs(p.y - (b.y + b.hauteur)) <= h;
}

function appuyer(e: PointerEvent) {
    const p = pointDe(e);
    let mode: Geste['mode'] = 'deplacer';
    let id = selection.value;
    if (surPoignee(p)) mode = 'taille';
    else {
        const trouve = elementEn(boites, p.x, p.y);
        if (!trouve) {
            // Fond de l'aperçu : la carte se déplace
            geste = {
                mode: 'carte',
                id: '',
                x0: p.x,
                y0: p.y,
                position0: { x: mep.value.carte.x, y: mep.value.carte.y },
                taille0: 0,
                boite0: { id: '', x: 0, y: 0, largeur: 0, hauteur: 0 }
            };
            curseur.value = 'grabbing';
            canvas.value!.setPointerCapture(e.pointerId);
            canvas.value!.focus();
            return;
        }
        id = trouve;
        selection.value = id;
    }
    const el = element(id);
    const b = boiteDe(id);
    if (!el || !b) return;
    geste = { mode, id, x0: p.x, y0: p.y, position0: { x: el.x, y: el.y }, taille0: el.taille ?? 0, boite0: { ...b } };
    canvas.value!.setPointerCapture(e.pointerId);
    canvas.value!.focus();
}

function deplacerSouris(e: PointerEvent) {
    const p = pointDe(e);
    if (!geste) {
        curseur.value = surPoignee(p) ? 'nwse-resize' : elementEn(boites, p.x, p.y) ? 'move' : 'grab';
        return;
    }
    const dx = p.x - geste.x0;
    const dy = p.y - geste.y0;
    if (geste.mode === 'carte') {
        const c = mep.value.carte;
        c.x = Math.min(1, Math.max(-1, geste.position0.x + dx / canvas.value!.width));
        c.y = Math.min(1, Math.max(-1, geste.position0.y + dy / canvas.value!.height));
        return;
    }
    const el = element(geste.id);
    if (!el) return;
    if (geste.mode === 'deplacer') {
        Object.assign(
            el,
            positionApresDeplacement(geste.position0, { dx, dy }, geste.boite0, {
                largeur: canvas.value!.width,
                hauteur: canvas.value!.height
            })
        );
    } else if (el.taille !== undefined) {
        el.taille = ajusterTaille(geste.taille0, geste.boite0.largeur, geste.boite0.largeur + dx, bornesDe(geste.id));
    }
}
function relacher() {
    if (geste?.mode === 'carte') curseur.value = 'grab';
    geste = null;
}

/** Molette : zoom de la carte autour du pointeur */
function molette(e: WheelEvent) {
    const r = rendu.value;
    const c = canvas.value;
    if (!r || !c) return;
    const rect = c.getBoundingClientRect();
    const pointeur = {
        x: ((e.clientX - rect.left) * c.width) / rect.width,
        y: ((e.clientY - rect.top) * c.height) / rect.height
    };
    const image = { largeur: r.largeur, hauteur: r.hauteur };
    const cadre = mep.value.carte;
    mep.value.carte = zoomAutour(
        cadre,
        cadre.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1),
        pointeur,
        image,
        centreCadre(image, mep.value.margeHaut)
    );
}

function recentrerCarte() {
    mep.value.carte = { x: 0, y: 0, zoom: ZOOM_CARTE.defaut };
}

/** Flèches : déplacement de 2 px (10 px avec Maj) ; Suppr : retire le logo sélectionné */
function clavier(e: KeyboardEvent) {
    const id = selection.value;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (id.startsWith('logo-')) {
            e.preventDefault();
            retirerLogo(Number(id.slice(5)));
        }
        return;
    }
    const pas = e.shiftKey ? 10 : 2;
    const delta = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key];
    const el = element(id);
    const b = boiteDe(id);
    if (!delta || !el || !b || !canvas.value) return;
    e.preventDefault();
    Object.assign(
        el,
        positionApresDeplacement(el, { dx: delta[0]!, dy: delta[1]! }, b, {
            largeur: canvas.value.width,
            hauteur: canvas.value.height
        })
    );
}

// ---------- Logos ----------

const TAILLE_MAX_LOGO = 2 * 1024 * 1024;
let prochainLogo = 1;

/** Logos choisis dans des fichiers image (PNG, JPEG, SVG, WebP ; 2 Mo au plus), posés en haut à droite */
async function ajouterLogos(e: Event) {
    const entree = e.target as HTMLInputElement;
    const fichiers = [...(entree.files ?? [])];
    entree.value = '';
    messageLogo.value = '';
    for (const f of fichiers) {
        if (!f.type.startsWith('image/')) {
            messageLogo.value = `« ${f.name} » n'est pas une image.`;
            continue;
        }
        if (f.size > TAILLE_MAX_LOGO) {
            messageLogo.value = `« ${f.name} » dépasse 2 Mo.`;
            continue;
        }
        const url = URL.createObjectURL(f);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            // Une image SVG sans dimensions se décode avec 0 × 0 : proportions 2 pour 1 par défaut
            const id = prochainLogo++;
            props.images.set(id, image);
            mep.value.logos.push({
                id,
                nom: f.name,
                largeur: image.naturalWidth || 300,
                hauteur: image.naturalHeight || 150,
                taille: BORNES.logo.defaut,
                x: 0.78,
                y: 0.03 + Math.min(mep.value.logos.length, 5) * 0.03
            });
            selection.value = `logo-${id}`;
        } catch {
            messageLogo.value = `« ${f.name} » n'a pas pu être lu comme une image.`;
        }
    }
}
function retirerLogo(id: number) {
    props.images.delete(id);
    mep.value.logos = mep.value.logos.filter(l => l.id !== id);
    selection.value = 'titre';
}

function reinitialiser() {
    props.images.clear();
    mep.value = miseEnPageParDefaut();
    selection.value = 'titre';
    void charger();
}

const nomLogo = (id: string) => mep.value.logos.find(l => `logo-${l.id}` === id)?.nom ?? '';
</script>

<template>
    <AppModal
        id="conceptionGifModal"
        :opened="opened"
        title="🎨 Mise en page du GIF / MP4"
        class="conception"
        @close="emit('close')"
    >
        <div class="conception__corps">
            <div class="conception__apercu">
                <canvas
                    ref="canvas"
                    class="conception__canvas"
                    :style="{ cursor: curseur }"
                    tabindex="0"
                    role="img"
                    aria-label="Aperçu de l'image : éléments déplaçables à la souris ou aux flèches"
                    @wheel.prevent="molette"
                    @pointerdown="appuyer"
                    @pointermove="deplacerSouris"
                    @pointerup="relacher"
                    @pointercancel="relacher"
                    @keydown="clavier"
                ></canvas>
                <p v-if="chargement" class="conception__info">Préparation de l'aperçu…</p>
                <p v-else-if="messageApercu" role="alert" class="conception__info">{{ messageApercu }}</p>
                <p class="conception__aide">
                    Cliquez sur un élément pour le sélectionner, faites-le glisser pour le placer, tirez le carré bleu
                    du coin pour changer sa taille. Glissez le fond pour déplacer la carte, molette pour zoomer. Flèches
                    : déplacement fin (Maj : plus large).
                </p>
            </div>

            <div class="conception__panneau">
                <div class="conception__elements" role="group" aria-label="Éléments de l'image">
                    <button
                        type="button"
                        class="conception__element"
                        :class="{ 'conception__element--actif': selection === 'titre' }"
                        :aria-pressed="selection === 'titre'"
                        @click="selection = 'titre'"
                    >
                        Titre
                    </button>
                    <button
                        type="button"
                        class="conception__element"
                        :class="{ 'conception__element--actif': selection === 'legende' }"
                        :aria-pressed="selection === 'legende'"
                        @click="selection = 'legende'"
                    >
                        Légende
                    </button>
                    <button
                        type="button"
                        class="conception__element"
                        :class="{ 'conception__element--actif': selection === 'compteur' }"
                        :aria-pressed="selection === 'compteur'"
                        @click="selection = 'compteur'"
                    >
                        Compteur
                    </button>
                    <button
                        v-for="l in mep.logos"
                        :key="l.id"
                        type="button"
                        class="conception__element"
                        :class="{ 'conception__element--actif': selection === `logo-${l.id}` }"
                        :aria-pressed="selection === `logo-${l.id}`"
                        :title="l.nom"
                        @click="selection = `logo-${l.id}`"
                    >
                        Logo · {{ l.nom }}
                    </button>
                </div>

                <fieldset v-if="selection === 'titre'" class="conception__groupe">
                    <legend>Titre</legend>
                    <label class="conception__case"
                        ><input v-model="mep.titre.visible" type="checkbox" /> Afficher le titre</label
                    >
                    <label
                        >Texte
                        <input
                            id="conceptionTitre"
                            v-model="mep.titre.texte"
                            type="text"
                            maxlength="80"
                            placeholder="Titre de l'image"
                        />
                    </label>
                    <label
                        >Police
                        <select v-model="mep.titre.police">
                            <option v-for="p in POLICES_GIF" :key="p.valeur" :value="p.valeur">{{ p.libelle }}</option>
                        </select>
                    </label>
                    <label
                        >Taille : {{ mep.titre.taille }}
                        <input
                            v-model.number="mep.titre.taille"
                            type="range"
                            :min="BORNES.titre.min"
                            :max="BORNES.titre.max"
                        />
                    </label>
                </fieldset>

                <fieldset v-else-if="selection === 'legende'" class="conception__groupe">
                    <legend>Légende</legend>
                    <label class="conception__case"
                        ><input v-model="mep.legende.visible" type="checkbox" /> Afficher la légende</label
                    >
                    <label class="conception__case"
                        ><input v-model="mep.legende.statuts" type="checkbox" /> Statuts (couleurs de la carte)</label
                    >
                    <label
                        >Texte libre (une ligne par ligne de légende)
                        <textarea
                            v-model="mep.legende.texte"
                            rows="3"
                            maxlength="300"
                            placeholder="Facultatif"
                        ></textarea>
                    </label>
                    <label
                        >Police
                        <select v-model="mep.legende.police">
                            <option v-for="p in POLICES_GIF" :key="p.valeur" :value="p.valeur">{{ p.libelle }}</option>
                        </select>
                    </label>
                    <label
                        >Taille : {{ mep.legende.taille }}
                        <input
                            v-model.number="mep.legende.taille"
                            type="range"
                            :min="BORNES.legende.min"
                            :max="BORNES.legende.max"
                        />
                    </label>
                </fieldset>

                <fieldset v-else-if="selection === 'compteur'" class="conception__groupe">
                    <legend>Compteur (date et nombre de mises en service)</legend>
                    <label class="conception__case"
                        ><input v-model="mep.compteur.visible" type="checkbox" /> Afficher le compteur</label
                    >
                    <label
                        >Taille : {{ mep.compteur.taille }}
                        <input
                            v-model.number="mep.compteur.taille"
                            type="range"
                            :min="BORNES.compteur.min"
                            :max="BORNES.compteur.max"
                        />
                    </label>
                </fieldset>

                <fieldset v-else-if="element(selection)" class="conception__groupe">
                    <legend>Logo · {{ nomLogo(selection) }}</legend>
                    <label
                        >Taille : {{ element(selection)?.taille }}
                        <input
                            :value="element(selection)?.taille"
                            type="range"
                            :min="BORNES.logo.min"
                            :max="BORNES.logo.max"
                            @input="element(selection)!.taille = Number(($event.target as HTMLInputElement).value)"
                        />
                    </label>
                    <button type="button" class="conception__retirer" @click="retirerLogo(Number(selection.slice(5)))">
                        Retirer ce logo
                    </button>
                </fieldset>

                <fieldset class="conception__groupe">
                    <legend>Image</legend>
                    <label
                        >Logo à ajouter (PNG, JPEG, SVG ou WebP ; 2 Mo au plus)
                        <input
                            id="conceptionLogo"
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            multiple
                            @change="ajouterLogos"
                        />
                    </label>
                    <p v-if="messageLogo" role="alert" class="conception__erreur">{{ messageLogo }}</p>
                    <label
                        >Zoom de la carte : {{ Math.round(mep.carte.zoom * 100) }} %
                        <input
                            v-model.number="mep.carte.zoom"
                            type="range"
                            :min="ZOOM_CARTE.min"
                            :max="ZOOM_CARTE.max"
                            step="0.05"
                        />
                    </label>
                    <button type="button" class="conception__secondaire" @click="recentrerCarte">
                        Recentrer la carte
                    </button>
                    <label
                        >Espace libre au-dessus de la carte : {{ Math.round(mep.margeHaut * 100) }} %
                        <input v-model.number="mep.margeHaut" type="range" min="0" max="0.3" step="0.01" />
                    </label>
                </fieldset>
            </div>
        </div>
        <template #footer>
            <button type="button" class="conception__secondaire" @click="reinitialiser">Réinitialiser</button>
            <button type="button" @click="emit('close')">Terminé</button>
        </template>
    </AppModal>
</template>

<style scoped>
.conception {
    z-index: 3050;
}
.conception :deep(.gp-modale__boite) {
    width: min(1180px, 100%);
}
.conception__corps {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
    margin-top: 12px;
}
.conception__apercu {
    min-width: 0;
}
.conception__canvas {
    display: block;
    width: 100%;
    height: auto;
    background: #e8eef5;
    border: 1px solid #b0bec5;
    border-radius: 4px;
    touch-action: none;
    outline-offset: 2px;
}
.conception__info {
    margin: 6px 0 0;
    font-style: italic;
}
.conception__aide {
    margin: 8px 0 0;
    font-size: 12px;
    color: #546e7a;
}
.conception__panneau {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}
.conception__elements {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.conception__element {
    padding: 4px 10px;
    border: 1px solid #90a4ae;
    border-radius: 14px;
    background: #fff;
    color: #263238;
    font-size: 12px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}
.conception__element--actif {
    background: #1565c0;
    border-color: #1565c0;
    color: #fff;
}
.conception__groupe {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #cfd8dc;
    border-radius: 6px;
    min-width: 0;
}
.conception__groupe legend {
    padding: 0 4px;
    font-weight: 600;
}
.conception__groupe label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
}
.conception__groupe label.conception__case {
    flex-direction: row;
    align-items: center;
    gap: 6px;
}
.conception__groupe label.conception__case input {
    width: auto;
}
.conception__erreur {
    margin: 0;
    color: #b71c1c;
    font-size: 12px;
}
.conception__retirer,
.conception__secondaire {
    background: #eceff1;
    color: #37474f;
    border: 1px solid #b0bec5;
}
@media (max-width: 900px) {
    .conception__corps {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
