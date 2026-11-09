<!-- Sondage de date d'un jalon : nom, organisateur, dates et heures proposées, destinataires, copies, message ;
     adresse d'accès unique (génération en brouillon, copie, prévisualisation) ; réponses (actualisables) ; créneau
     retenu et clôture (date planifiée du jalon renseignée), réouverture, suppression ; envoi. Lecture seule pour un
     utilisateur et pour un sondage clôturé. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
    apiAteliers,
    type JalonSimule,
    type OptionSondage,
    type Sondage,
    type UtilisateurAteliers
} from '@/api/ateliers';
import AppModal from '@/composants/AppModal.vue';
import { useConfirmation } from '@/composants/confirmation';
import {
    dateCourte,
    libelleCreneau,
    LIBELLES_SONDAGE,
    nomPersonne,
    objetCourriel,
    pastilleDeCourriel,
    pastilleUtilisateur,
    type Pastille
} from './ateliers';
import IconeAtelier from './IconeAtelier.vue';
import SaisieDestinataires from './SaisieDestinataires.vue';

const props = defineProps<{
    retroplanningId: number;
    ligne: JalonSimule;
    samu: string;
    admin: boolean;
    utilisateurs: UtilisateurAteliers[];
    moi: number | null;
}>();
const emit = defineEmits<{
    fermer: [];
    /** Sondages modifiés : statuts des boutons relus */
    sondages: [];
    /** Clôture (créneau retenu ou non) ou réouverture : rétroplanning relu, fenêtre fermée */
    clos: [retenu: OptionSondage | null, reouvert: boolean];
    annonce: [texte: string, erreur?: boolean];
}>();

const confirmer = useConfirmation();

/** Ligne d'une date proposée ; auto : heure de fin calculée (début + 1 h) */
interface LigneDate {
    id?: number;
    date: string;
    sh: string;
    sm: string;
    eh: string;
    em: string;
    auto: boolean;
}

const charge = ref(false);
const sondage = ref<Sondage | null>(null);
const nom = ref('');
const organisateur = ref('');
const dates = ref<LigneDate[]>([]);
const destinataires = ref<Pastille[]>([]);
const copies = ref<Pastille[]>([]);
const message = ref('');
const reprisDuModele = ref(false);
/** Créneau coché (avant clôture) */
const retenu = ref<number | null>(null);
const coche = ref(false);
const occupe = ref(false);
const actualisation = ref(false);
const url = ref<HTMLInputElement | null>(null);

const statut = computed(() => sondage.value?.statut ?? '');
const termine = computed(() => statut.value === 'termine');
const lectureSeule = computed(() => !props.admin || termine.value);
const HEURES = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const minutes = (mm: string) => {
    const l = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    if (mm && !l.includes(mm)) {
        l.push(mm);
        l.sort();
    }
    return l;
};

const ligneDate = (o: OptionSondage): LigneDate => {
    const [sh = '', sm = ''] = (o.heure || '').split(':');
    const [eh = '', em = ''] = (o.heure_fin || '').split(':');
    return { id: o.id, date: o.date || '', sh, sm: sm || '00', eh, em: em || '00', auto: false };
};
const heure = (h: string, m: string) => (h ? `${h}:${m || '00'}` : null);

async function charger() {
    try {
        const r = await apiAteliers.sondage(props.retroplanningId, props.ligne.key);
        const sd = r.sondage;
        const modele = r.modele;
        sondage.value = sd;
        reprisDuModele.value = !sd && !!modele;
        nom.value = sd?.nom ?? objetCourriel(props.samu, props.ligne);
        // Brouillon portant l'ancien nom par défaut (« … - Sondage - Atelier 2 ») : nomenclature à jour
        if (sd && (!sd.statut || sd.statut === 'brouillon') && / - Sondage - /.test(sd.nom || ''))
            nom.value = objetCourriel(props.samu, props.ligne);
        const org = sd ? sd.organisateur_id : (modele?.organisateur_id ?? props.moi);
        organisateur.value = org ? String(org) : '';
        dates.value = (
            sd ? sd.options : [{ date: props.ligne.proposee || props.ligne.cible || '' } as OptionSondage]
        ).map(ligneDate);
        destinataires.value = (sd?.destinataires ?? modele?.destinataires ?? []).map(e =>
            pastilleDeCourriel(props.utilisateurs, e)
        );
        copies.value = (sd?.cc_user_ids ?? modele?.cc_user_ids ?? [])
            .map(id => props.utilisateurs.find(u => u.id === id))
            .filter((u): u is UtilisateurAteliers => !!u)
            .map(pastilleUtilisateur);
        message.value = sd?.message ?? '';
        retenu.value = sd?.option_retenue_id ?? null;
        coche.value = false;
        charge.value = true;
    } catch (e) {
        emit('annonce', (e as Error).message, true);
        emit('fermer');
    }
}

function debutChoisi(l: LigneDate) {
    if (l.eh && !l.auto) return;
    if (!l.sh || Number(l.sh) >= 23) {
        if (l.auto) l.eh = '';
        return;
    }
    l.eh = String(Number(l.sh) + 1).padStart(2, '0');
    l.em = l.sm;
    l.auto = true;
}

function ajouterDate() {
    const derniere = dates.value[dates.value.length - 1]?.date;
    dates.value.push(ligneDate({ date: derniere || props.ligne.proposee || props.ligne.cible || '' }));
}

/** Créneaux proposés : dates du formulaire (enregistrées ou non), sinon celles du sondage */
const creneaux = computed(() => {
    const sd = sondage.value;
    if (!sd) return [];
    const saisies = dates.value
        .filter(l => l.date)
        .map(l => ({ id: l.id, date: l.date, heure: heure(l.sh, l.sm), heure_fin: heure(l.eh, l.em) }));
    return lectureSeule.value || !saisies.length ? sd.options : saisies;
});
const favorables = (id: number | undefined) =>
    id ? (sondage.value?.reponses ?? []).filter(r => r.options.includes(id)).length : 0;

function corps() {
    return {
        nom: nom.value,
        organisateur_id: Number(organisateur.value) || null,
        options: dates.value
            .filter(l => l.date)
            .map(l => ({ id: l.id, date: l.date, heure: heure(l.sh, l.sm), heure_fin: heure(l.eh, l.em) })),
        destinataires: destinataires.value.map(p => p.email),
        cc_user_ids: copies.value.map(p => p.uid!).filter(Boolean),
        message: message.value
    };
}

/** Sondage créé en brouillon pour obtenir son adresse ; fenêtre rouverte sur le sondage créé */
async function generer() {
    occupe.value = true;
    try {
        await apiAteliers.enregistrerSondage(props.retroplanningId, props.ligne.key, corps());
        emit('sondages');
        emit('annonce', 'Adresse générée. Le sondage reste en brouillon tant que le mail n’est pas envoyé.');
        charge.value = false;
        await charger();
    } catch (e) {
        emit('annonce', (e as Error).message, true);
    } finally {
        occupe.value = false;
    }
}

async function enregistrer(envoyer: boolean) {
    occupe.value = true;
    try {
        await apiAteliers.enregistrerSondage(props.retroplanningId, props.ligne.key, corps());
        if (envoyer) {
            const r = await apiAteliers.envoyerSondage(props.retroplanningId, props.ligne.key);
            emit(
                'annonce',
                `Sondage envoyé (${r.sent} destinataire${r.sent > 1 ? 's' : ''}${r.cc ? `, ${r.cc} en copie` : ''}).`
            );
        } else emit('annonce', 'Données enregistrées.');
        emit('sondages');
        // Enregistrer seul : la fenêtre reste ouverte (relue avec les données enregistrées)
        if (envoyer) emit('fermer');
        else {
            charge.value = false;
            await charger();
        }
    } catch (e) {
        emit('annonce', (e as Error).message, true);
    } finally {
        occupe.value = false;
    }
}

async function supprimer() {
    if (!(await confirmer('Supprimer ce sondage, ses dates et ses réponses ?', 'Supprimer'))) return;
    try {
        await apiAteliers.supprimerSondage(props.retroplanningId, props.ligne.key);
        emit('sondages');
        emit('fermer');
    } catch (e) {
        emit('annonce', (e as Error).message, true);
    }
}

async function cloturer() {
    const opt = sondage.value?.options.find(o => o.id === retenu.value) ?? null;
    const texte = opt
        ? `Clôturer le sondage avec le créneau retenu :\n${libelleCreneau(opt)}\n\nLa date réellement planifiée du jalon sera renseignée (date et heure). Les réponses ne seront plus modifiables.`
        : 'Clôturer le sondage sans créneau retenu ?\n\nLes réponses ne seront plus modifiables.';
    if (!(await confirmer(texte, 'Confirmer', { danger: false }))) return;
    try {
        await apiAteliers.cloturer(props.retroplanningId, props.ligne.key, opt ? opt.id : null);
        emit('clos', opt, false);
    } catch (e) {
        emit('annonce', (e as Error).message, true);
    }
}

async function rouvrir() {
    if (
        !(await confirmer(
            'Rouvrir le sondage ? Il redevient modifiable et accepte de nouveau des réponses.',
            'Confirmer',
            { danger: false }
        ))
    )
        return;
    try {
        await apiAteliers.rouvrir(props.retroplanningId, props.ligne.key);
        emit('annonce', 'Sondage rouvert.');
        emit('clos', null, true);
    } catch (e) {
        emit('annonce', (e as Error).message, true);
    }
}

/** Réponses relues sans perdre la saisie en cours */
async function actualiser() {
    actualisation.value = true;
    try {
        const sd = (await apiAteliers.sondage(props.retroplanningId, props.ligne.key)).sondage;
        if (!sd) throw new Error('Sondage introuvable');
        sondage.value = sd;
        if (!coche.value) retenu.value = sd.option_retenue_id;
        emit('annonce', `Réponses actualisées (${sd.reponses.length}).`);
        emit('sondages');
    } catch (e) {
        emit('annonce', (e as Error).message, true);
    } finally {
        actualisation.value = false;
    }
}

async function copier() {
    try {
        await navigator.clipboard.writeText(sondage.value?.url ?? '');
        emit('annonce', 'Adresse copiée.');
    } catch {
        url.value?.select();
    }
}

function previsualiser() {
    const v = sondage.value?.url ?? '';
    if (/^https?:\/\//.test(v)) window.open(v, '_blank', 'noopener');
}

onMounted(() => void charger());
</script>

<template>
    <AppModal
        id="atSondageModal"
        opened
        :title="`Sondage — ${ligne.jalon}`"
        class="at-fenetre at-fenetre--large"
        @close="emit('fermer')"
    >
        <p v-if="!charge" class="aff-muted">Chargement…</p>
        <template v-else>
            <span id="sdBadge" class="at-badge">{{
                (statut && LIBELLES_SONDAGE[statut as keyof typeof LIBELLES_SONDAGE]) || 'Nouveau'
            }}</span>
            <label for="sdNom">Nom du sondage</label>
            <input id="sdNom" v-model="nom" type="text" :disabled="lectureSeule" />
            <label for="sdOrg">Identité (organisateur)</label>
            <select id="sdOrg" v-model="organisateur" class="at-fenetre__liste" :disabled="lectureSeule">
                <option value="">— Choisir —</option>
                <option v-for="u in utilisateurs" :key="u.id" :value="String(u.id)">{{ nomPersonne(u) }}</option>
            </select>
            <label
                >Dates et heures proposées
                <span class="aff-muted at-fenetre__precision"
                    >(le calendrier s’ouvre autour de la date proposée : {{ dateCourte(ligne.proposee) }})</span
                ></label
            >
            <div id="sdOpts">
                <div v-for="(l, i) in dates" :key="i" class="at-opt" :data-id="l.id ?? ''">
                    <input v-model="l.date" type="date" class="d" :disabled="lectureSeule" aria-label="Date proposée" />
                    <span class="hm" title="Heure de début"
                        ><select
                            v-model="l.sh"
                            class="sh"
                            aria-label="Heure de début (heure)"
                            :disabled="lectureSeule"
                            @change="debutChoisi(l)"
                        >
                            <option value="">--</option>
                            <option v-for="h in HEURES" :key="h">{{ h }}</option>
                        </select>
                        h
                        <select
                            v-model="l.sm"
                            class="sm"
                            aria-label="Heure de début (minutes)"
                            :disabled="lectureSeule"
                            @change="debutChoisi(l)"
                        >
                            <option v-for="m in minutes(l.sm)" :key="m">{{ m }}</option>
                        </select></span
                    >
                    –
                    <span class="hm" title="Heure de fin (facultative)"
                        ><select
                            v-model="l.eh"
                            class="eh"
                            aria-label="Heure de fin (facultative) (heure)"
                            :disabled="lectureSeule"
                            @change="l.auto = false"
                        >
                            <option value="">--</option>
                            <option v-for="h in HEURES" :key="h">{{ h }}</option>
                        </select>
                        h
                        <select
                            v-model="l.em"
                            class="em"
                            aria-label="Heure de fin (facultative) (minutes)"
                            :disabled="lectureSeule"
                            @change="l.auto = false"
                        >
                            <option v-for="m in minutes(l.em)" :key="m">{{ m }}</option>
                        </select></span
                    >
                    <button
                        type="button"
                        class="aff-btn at-opt__retirer"
                        title="Retirer cette date"
                        :disabled="lectureSeule"
                        @click="dates.splice(i, 1)"
                    >
                        ×
                    </button>
                </div>
            </div>
            <button v-if="!lectureSeule" type="button" class="aff-btn" @click="ajouterDate">+ Ajouter une date</button>
            <label
                >Destinataires du sondage
                <span class="aff-muted at-fenetre__precision">{{
                    reprisDuModele ? '(repris du dernier sondage de ce SAMU, modifiables)' : '(nom ou adresse e-mail)'
                }}</span></label
            >
            <SaisieDestinataires
                id="sdDest"
                v-model="destinataires"
                :utilisateurs="utilisateurs"
                libre
                :lecture-seule="lectureSeule"
                indication="Nom ou adresse e-mail…"
            />
            <label>En copie <span class="aff-muted at-fenetre__precision">(utilisateurs de l’application)</span></label>
            <SaisieDestinataires
                id="sdCc"
                v-model="copies"
                :utilisateurs="utilisateurs"
                :lecture-seule="lectureSeule"
                indication="Nom d’un utilisateur…"
            />
            <label for="sdMsg">Message (facultatif)</label>
            <textarea id="sdMsg" v-model="message" rows="2" :disabled="lectureSeule"></textarea>
            <label for="sdUrl">Adresse d’accès unique</label>
            <div class="at-url">
                <input
                    id="sdUrl"
                    ref="url"
                    type="text"
                    readonly
                    :value="sondage?.url ?? ''"
                    placeholder="Pas encore générée"
                />
                <button
                    v-if="!sondage"
                    id="sdGen"
                    type="button"
                    class="aff-btn aff-btn-primary"
                    :disabled="!admin || occupe"
                    title="Crée le sondage (brouillon) et son adresse d’accès, sans l’envoyer"
                    @click="generer"
                >
                    Génération
                </button>
                <button type="button" class="aff-btn" :disabled="!sondage" @click="copier">Copier</button>
                <button
                    type="button"
                    class="aff-btn"
                    :disabled="!sondage"
                    title="Ouvre la page publique du sondage dans un nouvel onglet"
                    @click="previsualiser"
                >
                    Prévisualiser
                </button>
            </div>
            <div id="sdChoix">
                <template v-if="sondage && creneaux.length">
                    <label
                        >Créneau retenu<template v-if="lectureSeule && !sondage.option_retenue_id">
                            <span class="aff-muted at-fenetre__precision">(aucun)</span></template
                        ></label
                    >
                    <div class="aff-muted at-sd-aide">
                        {{
                            lectureSeule
                                ? termine
                                    ? '🔒 Sondage clôturé : cliquez sur « Réouvrir » pour changer le créneau retenu.'
                                    : 'Lecture seule : seuls les administrateurs choisissent le créneau retenu.'
                                : 'Cochez le créneau à retenir, puis « Clôturer ».'
                        }}
                    </div>
                    <label v-for="(o, i) in creneaux" :key="o.id ?? `n${i}`" class="at-creneau"
                        ><input
                            type="radio"
                            name="sdRet"
                            :value="o.id ?? ''"
                            :checked="!!o.id && retenu === o.id"
                            :disabled="lectureSeule || !o.id"
                            @change="
                                retenu = o.id ?? null;
                                coche = true;
                            "
                        />
                        {{ libelleCreneau(o) }}
                        <span v-if="o.id" class="aff-muted at-creneau__nb">{{ favorables(o.id) }} réponse(s)</span
                        ><span v-else class="at-creneau__non-enregistre"
                            >date non enregistrée : cliquez sur « Enregistrer » pour pouvoir la retenir</span
                        ></label
                    >
                </template>
            </div>
            <div id="sdResults">
                <template v-if="sondage">
                    <div class="at-reponses__tete">
                        <span class="at-reponses__titre">Réponses ({{ sondage.reponses.length }})</span>
                        <button
                            id="sdRefresh"
                            type="button"
                            class="aff-btn at-reponses__actualiser"
                            :disabled="actualisation"
                            title="Recharger les réponses reçues"
                            @click="actualiser"
                        >
                            <IconeAtelier nom="refresh" classe="at-ico-sm" />Actualiser
                        </button>
                    </div>
                    <div v-if="!sondage.reponses.length" class="aff-muted at-reponses__vide">
                        Aucune réponse pour le moment.
                    </div>
                    <div v-else class="at-reponses__defile">
                        <table class="at-res">
                            <thead>
                                <tr>
                                    <th class="nom">Nom</th>
                                    <th v-for="o in sondage.options" :key="o.id">
                                        {{ dateCourte(o.date) }}<template v-if="o.heure"><br />{{ o.heure }}</template>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(r, i) in sondage.reponses" :key="i">
                                    <td class="nom">{{ r.nom }}</td>
                                    <template v-for="o in sondage.options" :key="o.id">
                                        <td v-if="r.options.includes(o.id)" class="oui">✓</td>
                                        <td v-else>–</td>
                                    </template>
                                </tr>
                                <tr>
                                    <td class="nom"><b>Total</b></td>
                                    <td v-for="o in sondage.options" :key="o.id">
                                        <b>{{ favorables(o.id) }}</b>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>
            </div>
        </template>
        <template #footer>
            <button v-if="sondage && admin" type="button" class="aff-btn at-sd-supprimer" @click="supprimer">
                Supprimer
            </button>
            <button type="button" class="aff-btn" @click="emit('fermer')">Fermer</button>
            <template v-if="sondage && admin">
                <button v-if="termine" id="sdReopen" type="button" class="aff-btn aff-btn-primary" @click="rouvrir">
                    Réouvrir
                </button>
                <button
                    v-else
                    id="sdClose"
                    type="button"
                    class="aff-btn"
                    :class="sondage.option_retenue_id || coche ? 'aff-btn-primary' : 'at-sd-cloture-neutre'"
                    @click="cloturer"
                >
                    Clôturer
                </button>
            </template>
            <template v-if="charge && !lectureSeule">
                <button id="sdSave" type="button" class="aff-btn" :disabled="occupe" @click="enregistrer(false)">
                    Enregistrer
                </button>
                <button
                    id="sdSend"
                    type="button"
                    class="aff-btn aff-btn-primary"
                    :disabled="occupe"
                    @click="enregistrer(true)"
                >
                    <IconeAtelier nom="mail" classe="at-ico-sm" />{{
                        sondage && sondage.statut !== 'brouillon' ? 'Renvoyer le sondage' : 'Envoyer le sondage'
                    }}
                </button>
            </template>
        </template>
    </AppModal>
</template>
