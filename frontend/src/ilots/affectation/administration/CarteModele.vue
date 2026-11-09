<!-- Modèle PowerPoint des exports du planning (import, suppression, diapositive et zone utilisées) et modèle du nom des
     fichiers produits (exemple, enregistrement, nom par défaut) -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiAffectation, type ModeleExport } from '@/api/affectation';
import { useConfirmation } from '@/composants/confirmation';
import { surReouverture } from '@/ilots/activation';
import { NOM_EXPORT_DEFAUT, nomFichierExport } from '../planning/impression';
import { aujourdhui, jourFr } from '../planning/outils';
import { taille } from './administration';
import CarteAdministration from './CarteAdministration.vue';
import IconeAff from './IconeAff.vue';

const confirmer = useConfirmation();
const modele = ref<ModeleExport>({ exists: false });
const charge = ref(false);
const nom = ref({ pattern: NOM_EXPORT_DEFAUT, defaultPattern: NOM_EXPORT_DEFAUT });
const saisie = ref(NOM_EXPORT_DEFAUT);
const message = ref<{ texte: string; classe: string }>({ texte: '', classe: '' });
const fichier = ref<HTMLInputElement | null>(null);

const info = computed(() => modele.value.info ?? null);
const exemple = computed(
    () =>
        `${nomFichierExport(saisie.value.trim() || nom.value.defaultPattern, {
            from: aujourdhui(),
            to: aujourdhui(),
            zoom: 'day',
            title: 'Planning des déploiements des SAMU'
        })}.pptx`
);

function nomLu(r: { pattern?: string; defaultPattern?: string }) {
    nom.value = { ...nom.value, ...r } as typeof nom.value;
    saisie.value = nom.value.pattern;
}

async function charger() {
    try {
        modele.value = await apiAffectation.modele();
    } catch {
        modele.value = { exists: false };
    }
    try {
        nomLu(await apiAffectation.nomExport());
    } catch {
        /* valeur par défaut */
    }
    charge.value = true;
}

const dire = (texte: string, classe = message.value.classe) => (message.value = { texte, classe });

async function enregistrerNom() {
    try {
        nomLu(await apiAffectation.enregistrerNomExport(saisie.value.trim()));
        dire('Nom de fichier enregistré.', 'aff-msg-ok2');
    } catch (e) {
        dire((e as Error).message, 'aff-msg-ko2');
    }
}

async function nomParDefaut() {
    saisie.value = '';
    await enregistrerNom();
}

/** Fichier lu en data URI */
const lireFichier = (f: File) =>
    new Promise<string>((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => ko(new Error('Lecture du fichier impossible'));
        r.readAsDataURL(f);
    });

async function importer() {
    const champ = fichier.value;
    const f = champ?.files?.[0];
    if (champ) champ.value = '';
    if (!f) return;
    if (!/\.pptx$/i.test(f.name)) {
        dire('Choisissez un fichier PowerPoint (.pptx).', 'aff-msg-ko2');
        return;
    }
    dire('Import et analyse du modèle…', '');
    try {
        modele.value = await apiAffectation.importerModele(f.name, await lireFichier(f));
        saisie.value = nom.value.pattern;
        dire('Modèle importé.', 'aff-msg-ok2');
    } catch (e) {
        dire((e as Error).message, 'aff-msg-ko2');
    }
}

async function supprimer() {
    if (
        !(await confirmer(
            'Supprimer le modèle PowerPoint ? Les exports reviendront à la mise en page standard.',
            'Supprimer'
        ))
    )
        return;
    try {
        modele.value = await apiAffectation.supprimerModele();
        saisie.value = nom.value.pattern;
        dire('Modèle supprimé.');
    } catch (e) {
        dire((e as Error).message);
    }
}

onMounted(() => void charger());
surReouverture(() => void charger());
</script>

<template>
    <CarteAdministration
        id="affCardTemplate"
        titre="Modèle PowerPoint d'export"
        icone="print"
        sous-titre="Charte et nom des fichiers des exports PDF / PowerPoint du planning"
    >
        <div id="affTplBox">
            <p v-if="!charge" class="aff-muted">Chargement…</p>
            <div v-else-if="modele.exists" class="aff-tpl">
                <div class="aff-tpl-n">
                    <IconeAff nom="print" classe="aff-ico-sm" /><b>{{ modele.name }}</b>
                    <span class="aff-muted"
                        >({{ taille(modele.size ?? 0) }}) · importé le
                        {{ jourFr(String(modele.uploadedAt || '').slice(0, 10))
                        }}{{ modele.uploadedBy ? ` par ${modele.uploadedBy}` : '' }}</span
                    >
                </div>
                <ul class="aff-tpl-l">
                    <li>
                        Diapositive utilisée : n° <b>{{ info?.baseSlide }}</b> sur {{ info?.slides }} (disposition «
                        {{ info?.layout || '—' }} »)
                    </li>
                    <li>
                        Pages reprises : {{ info?.cover ? 'page de garde, ' : '' }}diapositive de planning{{
                            info?.end ? ', page de fin' : ''
                        }}
                        (les pages de garde et de fin sont facultatives à l'export)
                    </li>
                    <li>
                        Titre, logo, sous-titre et pied de page repris du modèle ; la date « JJ-MM-AAAA » du pied de
                        page est remplacée par la date du jour
                    </li>
                    <li>
                        Zone du planning et de la légende :
                        <b>{{ info?.zone ? `${info.zone.wMm} × ${info.zone.hMm} mm` : '—' }}</b
                        >, centrée entre le titre et le pied de page
                    </li>
                </ul>
            </div>
            <p v-else class="aff-muted aff-tpl-vide">
                Aucun modèle importé : les exports PDF / PowerPoint utilisent la mise en page standard.
            </p>
        </div>
        <p class="aff-muted aff-aide-modele">
            Le modèle doit contenir une diapositive « Titre et contenu » (titre, sous-titre, pied de page). Le planning
            et sa légende sont insérés au centre, sans empiéter sur le titre ni sur le pied de page.
        </p>
        <div class="aff-fn">
            <label class="lbl" for="affFnPattern">Nom des fichiers produits (PDF / PowerPoint)</label>
            <div class="aff-fn-ligne">
                <input
                    id="affFnPattern"
                    v-model="saisie"
                    type="text"
                    maxlength="150"
                    placeholder="SI-SAMU_Planning_Déploiement_{AAAAMMJJ}_{HHMM}"
                />
                <button type="button" class="aff-btn aff-btn-primary" @click="enregistrerNom">Enregistrer</button>
                <button type="button" class="aff-btn" @click="nomParDefaut">Par défaut</button>
            </div>
            <div class="aff-muted aff-fn-exemple">
                Exemple : <b id="affFnExample">{{ exemple }}</b> — jetons : <code>{AAAAMMJJ}</code> date ·
                <code>{HHMM}</code> heure · <code>{AAAA}</code> <code>{MM}</code> <code>{JJ}</code> <code>{HH}</code>
                <code>{MN}</code> · <code>{DEBUT}</code> <code>{FIN}</code> période affichée ·
                <code>{ECHELLE}</code> jour / semaine / mois… · <code>{TITRE}</code> titre saisi à l'export
            </div>
        </div>
        <div class="aff-actions aff-actions--modele">
            <input
                id="affTplFile"
                ref="fichier"
                type="file"
                accept=".pptx"
                class="aff-fichier-cache"
                aria-label="Modèle PowerPoint (.pptx)"
                @change="importer"
            />
            <button type="button" class="aff-btn aff-btn-primary" @click="fichier?.click()">
                <IconeAff nom="plus" classe="aff-ico-sm" />Importer un modèle (.pptx)
            </button>
            <button v-if="modele.exists" id="affTplRemove" type="button" class="aff-btn" @click="supprimer">
                Supprimer le modèle
            </button>
            <span id="affTplMsg" class="aff-muted" :class="message.classe">{{ message.texte }}</span>
        </div>
    </CarteAdministration>
</template>
