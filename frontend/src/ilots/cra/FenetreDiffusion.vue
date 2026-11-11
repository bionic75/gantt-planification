<!-- Diffusion d'un CRA doublement visé : destinataires par catégorie (expert, RH ES, DRH ANS) pré-remplis et
     modifiables (saisie avec suggestions des utilisateurs), génération du PDF signé, puis envoi -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ErreurApi } from '@/api/client';
import {
    apiCra,
    urlPdfEnregistre,
    type CategorieDestinataire,
    type DestinataireDiffusion,
    type DestinatairesDiffusion
} from '@/api/cra';
import { apiUtilisateurs, type Utilisateur } from '@/api/utilisateurs';
import AppAlert from '@/composants/AppAlert.vue';
import AppModal from '@/composants/AppModal.vue';
import { emettre } from '@/evenements';
import { adresseValide, ajouterDestinataire, libelleDestinataire, suggestions } from './administration';
import { libelleMois, majuscule } from './calculs';
import { useCraStore } from './magasin';

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ fermer: [] }>();
const magasin = useCraStore();

const CATEGORIES: Array<{ cle: CategorieDestinataire; id: string; titre: string; aide: string }> = [
    { cle: 'expert', id: 'Expert', titre: '👤 Expert', aide: 'Ajouter email expert...' },
    { cle: 'rh_es', id: 'RhEs', titre: '🏥 RH ES', aide: 'Ajouter email RH ES...' },
    { cle: 'drh_ans', id: 'DrhAns', titre: '🏛️ DRH ANS', aide: 'Ajouter email DRH ANS...' }
];

const pret = ref(false);
const titre = ref('📤 Diffuser le CRA');
const destinataires = ref<DestinatairesDiffusion>({ expert: [], rh_es: [], drh_ans: [] });
const saisies = ref<Record<CategorieDestinataire, string>>({ expert: '', rh_es: '', drh_ans: '' });
const refusees = ref<Record<CategorieDestinataire, boolean>>({ expert: false, rh_es: false, drh_ans: false });
const utilisateurs = ref<Utilisateur[]>([]);
const pdf = ref<{ etat: 'attente' | 'encours' | 'pret' | 'erreur'; texte: string; fichier: string | null }>({
    etat: 'attente',
    texte: 'Cliquez sur "Générer le PDF" pour préparer la pièce jointe.',
    fichier: null
});
const envoi = ref(false);
const erreur = ref('');

const envoiPossible = computed(() => !!pdf.value.fichier && !envoi.value);

onMounted(async () => {
    try {
        utilisateurs.value = (await apiUtilisateurs.liste()) || [];
    } catch {
        utilisateurs.value = [];
    }
    try {
        const [d, cra] = await Promise.all([apiCra.destinataires(props.id), apiCra.detail(props.id)]);
        titre.value = `📤 Diffuser le CRA — ${cra.expert_nom || ''} — ${majuscule(libelleMois(Number(cra.mois), Number(cra.annee)))}`;
        for (const c of CATEGORIES)
            for (const r of d[c.cle] || [])
                destinataires.value[c.cle] = ajouterDestinataire(destinataires.value[c.cle], r);
    } catch (e) {
        console.error('Erreur chargement destinataires:', e);
    }
    pret.value = true;
});

function ajouter(c: CategorieDestinataire, d: DestinataireDiffusion) {
    destinataires.value[c] = ajouterDestinataire(destinataires.value[c], d);
    saisies.value[c] = '';
}

/** Adresse saisie : ajoutée si elle contient « @ », sinon champ signalé un instant */
function ajouterSaisie(c: CategorieDestinataire) {
    const valeur = saisies.value[c].trim();
    if (!adresseValide(valeur)) {
        refusees.value[c] = true;
        setTimeout(() => (refusees.value[c] = false), 1500);
        return;
    }
    ajouter(c, { email: valeur, nom: '' });
}

function retirer(c: CategorieDestinataire, email: string) {
    destinataires.value[c] = destinataires.value[c].filter(d => d.email !== email);
}

async function genererPdf() {
    pdf.value = {
        etat: 'encours',
        texte: '⏳ Génération du PDF en cours, veuillez patienter (30-60s)...',
        fichier: null
    };
    try {
        const r = await apiCra.preparerPdf(props.id);
        pdf.value = { etat: 'pret', texte: '✅ PDF prêt : ', fichier: r.pdfFilename };
    } catch (e) {
        pdf.value = {
            etat: 'erreur',
            texte: e instanceof ErreurApi ? `❌ Erreur : ${e.message}` : `❌ Erreur réseau : ${(e as Error).message}`,
            fichier: null
        };
    }
}

const libelleBoutonPdf = computed(() =>
    pdf.value.etat === 'encours'
        ? '⏳ Génération en cours...'
        : pdf.value.etat === 'pret'
          ? '🔄 Regénérer le PDF'
          : pdf.value.etat === 'erreur'
            ? '📄 Réessayer'
            : '📄 Générer le PDF'
);

async function envoyer() {
    erreur.value = '';
    if (!pdf.value.fichier) {
        erreur.value = "Veuillez d'abord générer le PDF.";
        return;
    }
    const d = destinataires.value;
    if (d.rh_es.length + d.drh_ans.length === 0) {
        erreur.value = 'Veuillez ajouter au moins un destinataire RH ES ou DRH ANS.';
        return;
    }
    envoi.value = true;
    try {
        const r = await apiCra.diffuser(props.id, d, pdf.value.fichier);
        magasin.messageAdmin = { type: 'success', texte: `✅ CRA diffusé — ${r.sent} email(s) envoyé(s).` };
        emit('fermer');
        await magasin.rafraichir();
        emettre('cra-modifies');
    } catch (e) {
        erreur.value = e instanceof ErreurApi ? `Erreur : ${e.message}` : `Erreur réseau : ${(e as Error).message}`;
        envoi.value = false;
    }
}
</script>

<template>
    <AppModal id="craDiffuserModal" :opened="pret" :title="titre" class="cra-diffusion" @close="emit('fermer')">
        <div v-for="c in CATEGORIES" :key="c.cle" class="cra-diffusion__categorie" :class="`cra-diffusion--${c.cle}`">
            <div class="cra-diffusion__rubrique">{{ c.titre }}</div>
            <div :id="`diffuserChips${c.id}`" class="cra-diffusion__destinataires">
                <span
                    v-for="d in destinataires[c.cle]"
                    :key="d.email"
                    class="cra-diffusion__destinataire"
                    :data-email="d.email"
                    :data-nom="d.nom || ''"
                >
                    <span :title="d.email">{{ libelleDestinataire(d) }}</span>
                    <button
                        type="button"
                        class="cra-diffusion__retirer"
                        title="Supprimer"
                        @click="retirer(c.cle, d.email)"
                    >
                        ×
                    </button>
                </span>
            </div>
            <div class="cra-diffusion__saisie">
                <input
                    :id="`diffuserInput${c.id}`"
                    v-model="saisies[c.cle]"
                    type="text"
                    :placeholder="c.aide"
                    :aria-label="c.aide"
                    class="cra-diffusion__champ"
                    :class="{ 'cra-diffusion__champ--refuse': refusees[c.cle] }"
                    @keydown.enter.prevent="ajouterSaisie(c.cle)"
                />
                <div v-if="suggestions(utilisateurs, saisies[c.cle]).length" class="cra-diffusion__suggestions">
                    <button
                        v-for="u in suggestions(utilisateurs, saisies[c.cle])"
                        :key="u.id"
                        type="button"
                        class="cra-diffusion__suggestion"
                        @click="ajouter(c.cle, { email: u.email, nom: `${u.prenom || ''} ${u.nom || ''}` })"
                    >
                        <strong>{{ u.prenom || '' }} {{ u.nom || '' }}</strong>
                        <span class="cra-diffusion__suggestion-email">{{ u.email }}</span>
                    </button>
                </div>
                <button type="button" class="cra-diffusion__ajouter" title="Ajouter" @click="ajouterSaisie(c.cle)">
                    +
                </button>
            </div>
        </div>

        <div class="cra-diffusion__pdf">
            <div class="cra-diffusion__pdf-titre">📄 Génération du PDF</div>
            <div
                id="diffuserPdfStatus"
                class="cra-diffusion__pdf-statut"
                :class="`cra-diffusion__pdf-statut--${pdf.etat}`"
            >
                <span :key="pdf.texte">{{ pdf.texte }}</span>
                <a v-if="pdf.fichier" :href="urlPdfEnregistre(pdf.fichier)" target="_blank" class="cra-diffusion__lien"
                    >📄 {{ pdf.fichier }}</a
                >
            </div>
            <button
                id="diffuserBtnGenPdf"
                type="button"
                class="cra-diffusion__generer"
                :disabled="pdf.etat === 'encours'"
                @click="genererPdf"
            >
                <span :key="libelleBoutonPdf">{{ libelleBoutonPdf }}</span>
            </button>
        </div>
        <AppAlert v-if="erreur" type="error" :description="erreur" />

        <template #footer>
            <button type="button" class="cra-diffusion__annuler" @click="emit('fermer')">Annuler</button>
            <button
                id="diffuserBtnEnvoyer"
                type="button"
                class="cra-diffusion__envoyer"
                :disabled="!envoiPossible"
                @click="envoyer"
            >
                <span :key="String(envoi)">{{ envoi ? '⏳ Envoi en cours...' : '📧 Envoyer' }}</span>
            </button>
        </template>
    </AppModal>
</template>

<style scoped>
.cra-diffusion__categorie {
    margin-top: 16px;
}
.cra-diffusion__rubrique {
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
}
.cra-diffusion--expert {
    --cra-teinte: #6a1b9a;
}
.cra-diffusion--rh_es {
    --cra-teinte: #2e7d32;
}
.cra-diffusion--drh_ans {
    --cra-teinte: #1a237e;
}
.cra-diffusion__rubrique {
    color: var(--cra-teinte);
}
.cra-diffusion__destinataires {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 36px;
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fafafa;
    align-items: center;
    box-sizing: border-box;
}
.cra-diffusion__destinataire {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: color-mix(in srgb, var(--cra-teinte) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--cra-teinte) 33%, transparent);
    border-radius: 14px;
    padding: 2px 8px 2px 10px;
    font-size: 11px;
    color: var(--cra-teinte);
}
.cra-diffusion__retirer,
.cra-diffusion__retirer:hover {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cra-teinte);
    font-size: 13px;
    line-height: 1;
    padding: 0 0 0 2px;
}
.cra-diffusion__saisie {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    position: relative;
}
.cra-diffusion__champ {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 12px;
}
.cra-diffusion__champ--refuse {
    border-color: #e53935;
}
.cra-diffusion__suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 40px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 150px;
    overflow-y: auto;
    z-index: 10;
}
.cra-diffusion__suggestion,
.cra-diffusion__suggestion:hover {
    display: block;
    width: 100%;
    text-align: left;
    background: white;
    color: inherit;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    padding: 7px 12px;
    cursor: pointer;
    font-size: 12px;
}
.cra-diffusion__suggestion:hover {
    background: #f5f5f5;
}
.cra-diffusion__suggestion-email {
    color: #999;
    margin-left: 4px;
}
.cra-diffusion__ajouter,
.cra-diffusion__ajouter:hover {
    padding: 5px 10px;
    background: var(--cra-teinte);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}
.cra-diffusion__pdf {
    background: #fff8e1;
    border: 1px solid #ffe082;
    border-radius: 8px;
    padding: 14px;
    margin-top: 20px;
}
.cra-diffusion__pdf-titre {
    font-size: 12px;
    font-weight: bold;
    color: #e65100;
    margin-bottom: 10px;
}
.cra-diffusion__pdf-statut {
    font-size: 12px;
    color: #666;
    margin-bottom: 10px;
}
.cra-diffusion__pdf-statut--encours {
    color: #e65100;
}
.cra-diffusion__pdf-statut--pret {
    color: #2e7d32;
}
.cra-diffusion__pdf-statut--erreur {
    color: #c62828;
}
.cra-diffusion__lien {
    color: #1565c0;
    font-weight: bold;
}
.cra-diffusion__generer,
.cra-diffusion__generer:hover {
    background: #f57c00;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
}
.cra-diffusion__annuler,
.cra-diffusion__annuler:hover,
.cra-diffusion__envoyer,
.cra-diffusion__envoyer:hover {
    color: white;
    padding: 10px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.cra-diffusion__annuler,
.cra-diffusion__annuler:hover {
    background: #90a4ae;
}
.cra-diffusion__envoyer,
.cra-diffusion__envoyer:hover {
    background: #1565c0;
    font-weight: bold;
}
.cra-diffusion__envoyer:disabled {
    background: #bdbdbd;
    cursor: not-allowed;
}
</style>

<style>
/* Fenêtre téléportée hors du composant : règles non limitées, ciblées par sa classe */
.gp-modale.cra-diffusion .gp-modale__boite {
    width: min(700px, 100%);
}
.gp-modale.cra-diffusion .gp-modale__entete {
    background: #e65100;
    margin: -18px -20px 0;
    padding: 15px 20px;
    border-radius: var(--gp-rayon-3) var(--gp-rayon-3) 0 0;
}
.gp-modale.cra-diffusion .gp-modale__titre {
    color: white;
    font-size: 15px;
}
</style>
