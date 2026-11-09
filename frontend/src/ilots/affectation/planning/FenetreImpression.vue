<!-- Impression et exports du planning des déploiements : format (A4 / A3, portrait / paysage) ou modèle PowerPoint,
titre, période, échelle, largeur, mois non coupés, légende, rubriques et SAMU inclus ; aperçu page par page, impression
du navigateur, exports PDF et PowerPoint produits par le serveur -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiAffectation, type ApercuModele, type ModeleExport } from '@/api/affectation';
import AppModal from '@/composants/AppModal.vue';
import { deploiementsTries, periodeAffichee } from './grille';
import cssGrille from './grille.css?raw';
import {
    apercuAvecModele,
    apercuPages,
    htmlExport,
    mettreEnPage,
    NOM_EXPORT_DEFAUT,
    nomFichierExport,
    type MiseEnPage,
    type OptionsImpression
} from './impression';
import cssImpression from './impression.css?raw';
import { usePlanningAffectationStore } from './magasin';
import { erreurPeriode, type Echelle } from './outils';

const emit = defineEmits<{ fermer: [] }>();
const magasin = usePlanningAffectationStore();

const ouverte = ref(false);
const modele = ref<ModeleExport>({ exists: false });
const apercuModele = ref<ApercuModele | null>(null);
const nomExport = ref(NOM_EXPORT_DEFAUT);

const RUBRIQUES: [string, string][] = [
    ['cadrage', 'Cadrage'],
    ['deploiement', 'Déploiement opérationnel'],
    ['gel', 'Période(s) de gel'],
    ['mise_en_service', 'Mise en service'],
    ['mise_en_production', 'Mise en production'],
    ['reunion_lancement', 'Réunion de lancement stratégique'],
    ['visite_metier', 'Visite métier'],
    ['visite_ob', 'Visite OB'],
    ['test_prerequis', 'Test des prérequis'],
    ['vft', 'VFT'],
    ['formation_utilisateurs', 'Formation « Utilisateurs »'],
    ['accompagnement', 'Accompagnement'],
    ['_tri', 'Trigrammes des experts (dans les étapes)']
];
const ECHELLES: [Echelle, string][] = [
    ['day', 'Jours'],
    ['week', 'Semaines'],
    ['month', 'Mois'],
    ['quarter', 'Trimestres'],
    ['year', 'Années']
];

const { min, max } = periodeAffichee(magasin.deploiements, magasin.bornes);
const deploiements = deploiementsTries(magasin.contexte, magasin.tri, magasin.retirees, true);
const options = ref({
    title: 'Planning des déploiements des SAMU',
    from: min,
    to: max,
    zoom: magasin.zoom as Echelle,
    paper: 'A4' as 'A4' | 'A3',
    orient: 'landscape' as 'landscape' | 'portrait',
    fit: 'split' as 'split' | 'fit',
    keepMonths: false,
    legend: true,
    tpl: false,
    cover: false,
    end: false,
    samu: new Set(deploiements.filter(p => !magasin.retirees.has(p.id)).map(p => p.id)),
    hidden: new Set(RUBRIQUES.map(([k]) => k).filter(k => magasin.masquees.has(k)))
});

function basculer<T>(ensemble: Set<T>, valeur: T, oui: boolean) {
    const s = new Set(ensemble);
    if (oui) s.add(valeur);
    else s.delete(valeur);
    return s;
}

const avecModele = computed(() => options.value.tpl && modele.value.exists);

// ── Aperçu ───────────────────────────────────────────────────────────────────

const apercu = ref<HTMLElement | null>(null);
const pagesHtml = ref('');
const info = ref('');
const erreur = ref('');
const enCours = ref(false);
let miseEnPage: MiseEnPage | null = null;
let optionsMisesEnPage: OptionsImpression | null = null;
let jeton = 0;
let minuterie: ReturnType<typeof setTimeout> | undefined;

async function rafraichir() {
    erreur.value = '';
    const o: OptionsImpression = {
        ...options.value,
        samu: new Set(options.value.samu),
        hidden: new Set(options.value.hidden)
    };
    if (!o.from || !o.to || o.to < o.from) {
        erreur.value = 'Période invalide : la date de fin doit suivre la date de début.';
        return;
    }
    const refus = erreurPeriode(o.from, o.to, o.zoom);
    if (refus) {
        erreur.value = refus;
        return;
    }
    const n = ++jeton;
    info.value = 'Mise en page…';
    await new Promise(r => setTimeout(r, 30));
    const hote = document.getElementById('affectationContainer') ?? document.body;
    let lay: MiseEnPage;
    try {
        lay = mettreEnPage(o, magasin.contexte, magasin.tri, magasin.retirees, modele.value, hote);
    } catch (e) {
        erreur.value = e instanceof Error ? e.message : String(e);
        return;
    }
    // Une option a changé entre-temps
    if (n !== jeton) return;
    miseEnPage = lay;
    optionsMisesEnPage = o;
    const largeur = apercu.value?.clientWidth ?? 900;
    const rendu =
        lay.tpl && apercuModele.value?.slides
            ? apercuAvecModele(apercuModele.value, lay, o, largeur)
            : apercuPages(lay, largeur);
    pagesHtml.value = rendu.html;
    info.value = rendu.info;
}

/** Options modifiées : aperçu refait après une courte pause (saisie au clavier) */
watch(
    options,
    () => {
        clearTimeout(minuterie);
        minuterie = setTimeout(() => void rafraichir(), 300);
    },
    { deep: true }
);
onBeforeUnmount(() => clearTimeout(minuterie));

// ── Impression, exports ──────────────────────────────────────────────────────

const css = `${cssGrille}${cssImpression}`;

function imprimer() {
    if (!miseEnPage) return;
    const cadre = document.createElement('iframe');
    cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(cadre);
    const doc = cadre.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(htmlExport(miseEnPage, css));
    doc.close();
    setTimeout(() => {
        cadre.contentWindow?.focus();
        cadre.contentWindow?.print();
        setTimeout(() => cadre.remove(), 60000);
    }, 500);
}

async function exporter(type: 'pdf' | 'pptx') {
    const lay = miseEnPage;
    const o = optionsMisesEnPage;
    if (!lay) return;
    enCours.value = true;
    const generation = 'Génération du fichier…';
    erreur.value = generation;
    try {
        const r = await fetch(`/api/affectation/export/${type}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                html: htmlExport(lay, css),
                wMm: lay.mmW,
                hMm: lay.mmH,
                name: 'planning-deploiements',
                tpl: lay.tpl
                    ? {
                          use: true,
                          title: o?.title || 'Planning des déploiements des SAMU',
                          subtitles: lay.subtitles,
                          cover: !!o?.cover,
                          end: !!o?.end
                      }
                    : undefined
            })
        });
        if (!r.ok) {
            const d = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(d.error || `Erreur ${r.status}`);
        }
        const blob = await r.blob();
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(blob);
        lien.download = `${nomFichierExport(nomExport.value, o)}.${type}`;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        setTimeout(() => URL.revokeObjectURL(lien.href), 30000);
        if (erreur.value === generation) erreur.value = '';
    } catch (e) {
        erreur.value = e instanceof Error ? e.message : String(e);
    } finally {
        enCours.value = false;
    }
}

// ── Ouverture ────────────────────────────────────────────────────────────────

async function ouvrir() {
    try {
        modele.value = await apiAffectation.modele();
    } catch {
        modele.value = { exists: false };
    }
    try {
        const n = await apiAffectation.nomExport();
        nomExport.value = n.pattern || n.defaultPattern || NOM_EXPORT_DEFAUT;
    } catch {
        /* valeur par défaut */
    }
    if (modele.value.exists) {
        try {
            apercuModele.value = await apiAffectation.apercuModele();
        } catch {
            apercuModele.value = null;
        }
        // Modèle présent : utilisé par défaut, pages de garde et de fin comprises
        options.value.tpl = true;
        options.value.cover = !!modele.value.info?.cover;
        options.value.end = !!modele.value.info?.end;
    }
    ouverte.value = true;
    setTimeout(() => void rafraichir(), 50);
}
onMounted(() => void ouvrir());
</script>

<template>
    <AppModal
        id="affPrintModal"
        :opened="ouverte"
        title="Imprimer / Exporter le planning"
        class="aff-impression"
        @close="emit('fermer')"
    >
        <div class="aff-impression__corps">
            <div id="affPrintCtl" class="aff-print-ctl">
                <div class="g">
                    <span class="lbl">Format de page</span>
                    <div id="prFormat" class="aff-fmt" :class="{ 'aff-impression__inactif': avecModele }">
                        <button
                            type="button"
                            :class="{ on: options.orient === 'portrait' }"
                            title="Portrait (vertical)"
                            :disabled="avecModele"
                            @click="options.orient = 'portrait'"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width="30"
                                height="30"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <rect x="6" y="2.5" width="12" height="19" rx="1.5" />
                                <path d="M9 8h6M9 12h6M9 16h4" stroke-linecap="round" /></svg
                            ><span>Portrait</span>
                        </button>
                        <button
                            type="button"
                            :class="{ on: options.orient === 'landscape' }"
                            title="Paysage (horizontal)"
                            :disabled="avecModele"
                            @click="options.orient = 'landscape'"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width="30"
                                height="30"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
                                <path d="M6 10h12M6 13h8" stroke-linecap="round" /></svg
                            ><span>Paysage</span>
                        </button>
                        <span class="sep"></span>
                        <button
                            v-for="f in ['A4', 'A3'] as const"
                            :key="f"
                            type="button"
                            :data-p="f"
                            :class="{ on: options.paper === f }"
                            :title="`Papier ${f}`"
                            :disabled="avecModele"
                            @click="options.paper = f"
                        >
                            <b>{{ f }}</b>
                        </button>
                    </div>
                </div>
                <div class="g">
                    <label class="lbl" for="prTitle">Titre</label
                    ><input id="prTitle" v-model="options.title" type="text" />
                </div>
                <div v-if="modele.exists" class="g aff-impression__modele">
                    <label class="chk"
                        ><input id="prTpl" v-model="options.tpl" type="checkbox" />
                        <b>Utiliser le modèle PowerPoint</b></label
                    >
                    <div class="aff-muted aff-impression__aide">
                        {{ modele.name }} — titre, logo et pied de page du modèle ; planning et légende centrés. Format
                        de page imposé par le modèle.
                    </div>
                    <label v-if="modele.info?.cover" class="chk aff-impression__garde"
                        ><input id="prCover" v-model="options.cover" type="checkbox" /> Page de garde du modèle</label
                    >
                    <label v-if="modele.info?.end" class="chk"
                        ><input id="prEnd" v-model="options.end" type="checkbox" /> Page de fin du modèle</label
                    >
                </div>
                <div class="g two">
                    <div>
                        <label class="lbl" for="prFrom">Début</label
                        ><input id="prFrom" v-model="options.from" type="date" min="2000-01-01" max="2100-12-31" />
                    </div>
                    <div>
                        <label class="lbl" for="prTo">Fin</label
                        ><input id="prTo" v-model="options.to" type="date" min="2000-01-01" max="2100-12-31" />
                    </div>
                </div>
                <div class="g">
                    <label class="lbl" for="prZoom">Échelle de temps</label>
                    <select id="prZoom" v-model="options.zoom">
                        <option v-for="[z, nom] in ECHELLES" :key="z" :value="z">{{ nom }}</option>
                    </select>
                </div>
                <div class="g">
                    <label class="lbl" for="prFit">Largeur</label>
                    <select id="prFit" v-model="options.fit">
                        <option value="split">Répartir sur plusieurs pages (colonnes lisibles)</option>
                        <option value="fit">Tout sur une page en largeur</option>
                    </select>
                </div>
                <div class="g">
                    <label
                        class="chk"
                        title="Échelle jour ou semaine : chaque page se termine en fin de mois (les colonnes sont resserrées si un mois est plus large qu'une page)"
                        ><input id="prMonths" v-model="options.keepMonths" type="checkbox" /> Ne pas couper un mois sur
                        deux pages</label
                    >
                </div>
                <div class="g">
                    <label class="chk"
                        ><input id="prLegend" v-model="options.legend" type="checkbox" /> Afficher la légende</label
                    >
                </div>
                <div class="g">
                    <span class="lbl">Rubriques affichées</span>
                    <div id="prStages" class="box">
                        <label v-for="[k, nom] in RUBRIQUES" :key="k" class="chk"
                            ><input
                                type="checkbox"
                                :value="k"
                                :checked="!options.hidden.has(k)"
                                @change="
                                    options.hidden = basculer(
                                        options.hidden,
                                        k,
                                        !($event.target as HTMLInputElement).checked
                                    )
                                "
                            />
                            {{ nom }}</label
                        >
                    </div>
                </div>
                <div class="g">
                    <span class="lbl"
                        >SAMU à inclure
                        <a
                            href="#"
                            class="aff-impression__lien"
                            @click.prevent="options.samu = new Set(deploiements.map(p => p.id))"
                            >tous</a
                        >
                        ·
                        <a href="#" class="aff-impression__lien" @click.prevent="options.samu = new Set()"
                            >aucun</a
                        ></span
                    >
                    <div id="prSamu" class="box aff-impression__samu">
                        <label v-for="p in deploiements" :key="p.id" class="chk"
                            ><input
                                type="checkbox"
                                :value="p.id"
                                :checked="options.samu.has(p.id)"
                                @change="
                                    options.samu = basculer(
                                        options.samu,
                                        p.id,
                                        ($event.target as HTMLInputElement).checked
                                    )
                                "
                            />
                            {{ p.samu_name
                            }}<span v-if="magasin.retirees.has(p.id)" class="aff-muted">
                                (retiré de l'affichage)</span
                            ></label
                        >
                    </div>
                </div>
            </div>
            <div class="aff-impression__zone">
                <div id="affPrintInfo" class="aff-muted aff-impression__info" role="status">{{ info }}</div>
                <!-- Pages produites par impression.ts (textes échappés) -->
                <!-- eslint-disable vue/no-v-html -->
                <div
                    id="affPrintPreview"
                    ref="apercu"
                    class="aff-print-root aff-print-preview"
                    v-html="pagesHtml"
                ></div>
                <!-- eslint-enable vue/no-v-html -->
            </div>
        </div>
        <template #footer>
            <span id="affPrintErr" class="aff-error">{{ erreur }}</span>
            <button type="button" class="aff-btn" @click="emit('fermer')">Fermer</button>
            <button
                type="button"
                class="aff-btn"
                :disabled="avecModele || enCours"
                :title="avecModele ? 'Avec le modèle PowerPoint, utilisez l\'export PDF ou PowerPoint' : ''"
                @click="imprimer"
            >
                <svg class="aff-ico-sm" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" rx="1" /></svg
                >Imprimer
            </button>
            <button type="button" class="aff-btn" :disabled="enCours" @click="exporter('pdf')">Exporter en PDF</button>
            <button type="button" class="aff-btn aff-btn-primary" :disabled="enCours" @click="exporter('pptx')">
                Exporter en PowerPoint
            </button>
        </template>
    </AppModal>
</template>

<style>
.gp-modale.aff-impression .gp-modale__boite {
    width: min(1320px, 98vw);
    height: 94vh;
    display: flex;
    flex-direction: column;
}
.aff-impression__corps {
    display: flex;
    flex: 1;
    min-height: 0;
}
.aff-impression__zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #e9edf3;
}
.aff-impression__info {
    padding: 8px 14px;
    font-size: 12px;
}
.aff-impression__inactif {
    opacity: 0.4;
    pointer-events: none;
}
.aff-impression__modele {
    background: #eef6ff;
    border: 1px solid #cfe0f5;
    border-radius: 10px;
    padding: 8px 10px;
}
.aff-impression__aide {
    font-size: 11px;
    margin-top: 3px;
}
.aff-impression__garde {
    margin-top: 6px;
}
.aff-impression__lien {
    font-weight: 400;
}
.aff-print-ctl .box.aff-impression__samu {
    max-height: 220px;
}
</style>
