// CRA : statuts, cartes, étapes du circuit, actions proposées selon le profil, saisie des lignes (contrôles,
// chevauchements, collecte depuis la planification, corrections à reporter)
import type { Parametres } from '@/api/parametrages';
import type {
    CorrectionCra,
    Cra,
    DetailCra,
    InstantaneLigne,
    LigneCra,
    LigneEnregistree,
    OrigineLigne,
    ResultatReport,
    StatutCra,
    TypeLigne
} from '@/api/cra';
import type { Localisation } from '@/api/localisations';

// ---------- Dates ----------

/** « mars 2093 » */
export const libelleMois = (mois: number, annee: number) =>
    new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Date d'une ligne ou d'une étape (« 05/03/2093 »), vide si absente */
export const dateFr = (date: string | null | undefined) => (date ? new Date(date).toLocaleDateString('fr-FR') : '');

/** Date et heure d'une signature (« 05/03/2093 à 14:02:11 ») */
export function dateHeureFr(date: string) {
    const d = new Date(date);
    return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR')}`;
}

// ---------- Statuts et cartes ----------

export const STATUTS: Record<StatutCra, { libelle: string; icone: string }> = {
    a_completer: { libelle: 'À compléter', icone: '✏️' },
    soumis: { libelle: 'Soumis — en attente visa N1', icone: '📤' },
    vise_n1: { libelle: 'Visé N1 — en attente visa N2', icone: '✅' },
    vise_n2: { libelle: 'Visé N2 — prêt à diffuser', icone: '✅' },
    diffuse: { libelle: 'Diffusé auprès de la RH', icone: '📨' }
};

/** Pastille d'une carte : statut, ou « Modifier » pour un CRA déjà soumis une fois (rappelé ou refusé) */
export function pastille(cra: Cra): { cle: string; libelle: string; icone: string } {
    if (cra.statut === 'a_completer' && cra.refuse_at) return { cle: 'modifier', libelle: 'Modifier', icone: '✏️' };
    const s = STATUTS[cra.statut] ?? { libelle: cra.statut, icone: '❓' };
    return { cle: cra.statut, ...s };
}

/** Vue de l'onglet selon le profil actif : administrateur, RH (compte RH hors profil administrateur), expert sinon */
export function vueCra(s: { activeProfile: string; is_rh: boolean }): 'admin' | 'rh' | 'expert' {
    if (s.activeProfile === 'admin') return 'admin';
    return s.is_rh ? 'rh' : 'expert';
}

/** Administrateur : CRA en cours, hors archivés, diffusés et en attente de diffusion (bloc de l'ancien code) */
export const enCoursAdmin = (cras: Cra[]) =>
    cras.filter(c => !c.archived && c.statut !== 'diffuse' && c.statut !== 'vise_n2');

/** Expert : CRA en cours et CRA signés (diffusés), hors archivés */
export const cartesExpert = (cras: Cra[]) => ({
    enCours: cras.filter(c => !c.archived && c.statut !== 'diffuse'),
    signes: cras.filter(c => !c.archived && c.statut === 'diffuse')
});

/** Viseurs d'une carte : « Viseur N1 : … | Viseur N2 : … » */
export const viseurs = (cra: Cra) =>
    `${cra.vise_n1_nom ? `Viseur N1 : ${cra.vise_n1_nom}` : ''}${cra.vise_n2_nom ? ` | Viseur N2 : ${cra.vise_n2_nom}` : ''}`;

// ---------- Workflow (automatisation n°4) ----------

export interface ConfigCra {
    admin_n1_id?: number | string | null;
    admin_n2_id?: number | string | null;
    admin_n1_nom?: string;
    admin_n2_nom?: string;
}

export function configCra(parametres: Parametres): ConfigCra {
    try {
        return parametres.automation_4_config ? JSON.parse(parametres.automation_4_config) : {};
    } catch {
        return {};
    }
}

// ---------- Détail : étapes et signatures ----------

export interface Etape {
    libelle: string;
    fait: boolean;
    courante: boolean;
    date: string;
}

export function etapes(cra: DetailCra, config: ConfigCra): Etape[] {
    const liste = [
        { libelle: 'Créé', fait: true, at: cra.created_at },
        { libelle: "Soumis par l'expert", fait: !!cra.submitted_at, at: cra.submitted_at },
        { libelle: `Visé par ${config.admin_n1_nom || 'Viseur N1'}`, fait: !!cra.vise_n1_at, at: cra.vise_n1_at },
        { libelle: `Visé par ${config.admin_n2_nom || 'Viseur N2'}`, fait: !!cra.vise_n2_at, at: cra.vise_n2_at },
        { libelle: 'Diffusé à la RH', fait: !!cra.diffuse_at, at: cra.diffuse_at }
    ];
    const courante = liste.findIndex(e => !e.fait);
    return liste.map((e, i) => ({ libelle: e.libelle, fait: e.fait, courante: i === courante, date: dateFr(e.at) }));
}

export interface SignatureDetail {
    role: 'expert' | 'n1' | 'n2';
    libelle: string;
    nom: string;
    date: string;
}

export function signatures(cra: DetailCra): SignatureDetail[] {
    const liste: SignatureDetail[] = [];
    if (cra.submitted_at)
        liste.push({ role: 'expert', libelle: 'Expert', nom: cra.expert_nom || '—', date: cra.submitted_at });
    if (cra.vise_n1_at)
        liste.push({ role: 'n1', libelle: 'Viseur N1', nom: cra.vise_n1_nom || '—', date: cra.vise_n1_at });
    if (cra.vise_n2_at)
        liste.push({ role: 'n2', libelle: 'Viseur N2', nom: cra.vise_n2_nom || '—', date: cra.vise_n2_at });
    return liste;
}

export const TYPES_LIGNE: Record<TypeLigne, { libelle: string; icone: string }> = {
    astreinte: { libelle: 'Astreinte', icone: '🔔' },
    activite_courante: { libelle: 'Activité courante', icone: '✅' },
    hno: { libelle: 'HNO', icone: '🌙' }
};

/** Type inconnu : affiché comme du travail HNO (ancien écran) */
export const typeLigne = (type: string) => TYPES_LIGNE[type as TypeLigne] ?? TYPES_LIGNE.hno;

/** « 20:00 → 23:30 » */
export const heures = (l: { heure_debut?: string | null; heure_fin?: string | null }) =>
    `${l.heure_debut || ''} ${l.heure_fin ? `→ ${l.heure_fin}` : ''}`;

/** CRA modifié par un administrateur, encore à compléter : message pour l'expert ou pour les administrateurs */
export function messageModifAdmin(cra: DetailCra, userId: number | null): string | null {
    if (!cra.modifie_admin_at || cra.statut !== 'a_completer') return null;
    const dt = new Date(cra.modifie_admin_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const qui = cra.modifie_admin_nom || 'Un administrateur';
    return userId === cra.user_id
        ? `${qui} a modifié ce CRA le ${dt}. Vérifiez-le, corrigez si besoin, puis soumettez-le à nouveau : les validations précédentes ont été remises à zéro.`
        : `Modifié par ${qui} le ${dt}. L'expert doit le vérifier et le soumettre à nouveau avant toute validation.`;
}

// ---------- Actions proposées ----------

export interface Droits {
    admin: boolean;
    proprietaire: boolean;
    n1: boolean;
    n2: boolean;
    /** Aucun viseur désigné : tout administrateur vise */
    toutAdmin: boolean;
}

/** Utilisateur connecté (session) : administrateur par son compte ou par son profil actif, comme l'ancien écran */
export interface Utilisateur {
    userId: number;
    is_admin: boolean;
    activeProfile: string;
}

export function droits(cra: Cra, u: Utilisateur, config: ConfigCra): Droits {
    const admin = !!u.is_admin || u.activeProfile === 'admin';
    return {
        admin,
        proprietaire: String(cra.user_id) === String(u.userId),
        n1: admin && String(u.userId) === String(config.admin_n1_id),
        n2: admin && String(u.userId) === String(config.admin_n2_id),
        toutAdmin: admin && !config.admin_n1_id && !config.admin_n2_id
    };
}

export type CleAction =
    | 'completer'
    | 'renvoyer'
    | 'soumettre'
    | 'corriger'
    | 'rappeler'
    | 'viser-n1'
    | 'refuser-n1'
    | 'viser-n2'
    | 'refuser-n2';

export interface ActionCra {
    cle: CleAction;
    libelle: string;
    titre?: string;
}

/** Actions du circuit proposées, dans l'ordre de l'ancien écran */
export function actions(cra: Cra, d: Droits): ActionCra[] {
    const liste: ActionCra[] = [];
    if (cra.statut === 'a_completer' && (d.proprietaire || d.admin)) {
        const pourAdmin = d.admin && !d.proprietaire;
        liste.push({
            cle: 'completer',
            libelle: pourAdmin
                ? '✏️ Modifier ce CRA (admin)'
                : cra.refuse_at
                  ? '✏️ Corriger/Compléter mon CRA'
                  : '✏️ Compléter mon CRA'
        });
        liste.push(
            pourAdmin
                ? {
                      cle: 'renvoyer',
                      libelle: "📨 Renvoyer à l'expert pour vérification",
                      titre: "L'administrateur ne soumet pas à la place de l'expert : le CRA lui est renvoyé pour vérification et soumission"
                  }
                : { cle: 'soumettre', libelle: '📤 Valider et soumettre' }
        );
    }
    if (d.admin && !['a_completer', 'vise_n2', 'diffuse'].includes(cra.statut))
        liste.push({ cle: 'corriger', libelle: '🔧 Corriger ce CRA (admin)' });
    if (cra.statut === 'soumis' && d.proprietaire && !d.admin)
        liste.push({ cle: 'rappeler', libelle: '✏️ Corriger/Compléter mon CRA' });
    if (cra.statut === 'soumis' && (d.n1 || d.toutAdmin))
        liste.push({ cle: 'viser-n1', libelle: '✅ Viser (niveau 1)' }, { cle: 'refuser-n1', libelle: '❌ Refuser' });
    if (cra.statut === 'vise_n1' && (d.n2 || d.toutAdmin))
        liste.push({ cle: 'viser-n2', libelle: '✅ Viser (niveau 2)' }, { cle: 'refuser-n2', libelle: '❌ Refuser' });
    return liste;
}

/** « Rien à déclarer » : expert propriétaire, CRA à compléter */
export const rienADeclarerPropose = (cra: Cra, d: Droits) => cra.statut === 'a_completer' && d.proprietaire && !d.admin;

/** Document PDF : fichier signé enregistré (CRA visé N2 ou diffusé), sinon document produit par le navigateur */
export const pdfEnregistre = (cra: Cra) => cra.statut === 'diffuse' || cra.statut === 'vise_n2';

// ---------- Saisie des lignes ----------

export const TYPES_SAISIE: Array<{ valeur: TypeLigne; libelle: string }> = [
    { valeur: 'activite_courante', libelle: 'Activité courante' },
    { valeur: 'astreinte', libelle: 'Astreinte' },
    { valeur: 'hno', libelle: 'Travail HNO' }
];

export interface FormulaireLigne {
    type: TypeLigne;
    date_debut: string;
    date_fin: string;
    heure_debut: string;
    heure_fin: string;
    samu: string;
    objet: string;
}

export const formulaireVide = (): FormulaireLigne => ({
    type: 'activite_courante',
    date_debut: '',
    date_fin: '',
    heure_debut: '',
    heure_fin: '',
    samu: '',
    objet: ''
});

export const formulaireDe = (l: LigneCra): FormulaireLigne => ({
    type: l.type,
    date_debut: l.date_debut,
    date_fin: l.date_fin,
    heure_debut: l.heure_debut,
    heure_fin: l.heure_fin,
    samu: l.samu,
    objet: l.objet
});

/** Ligne enregistrée reprise dans la saisie */
export const ligneSaisie = (l: LigneEnregistree): LigneCra => ({
    id: l.id,
    type: l.type,
    date_debut: l.date_debut,
    date_fin: l.date_fin,
    heure_debut: l.heure_debut || '',
    heure_fin: l.heure_fin || '',
    samu: l.samu || '',
    objet: l.objet || ''
});

const pad = (n: number) => String(n).padStart(2, '0');

/** Dates proposées : le mois du CRA */
export function bornesMois(mois: number, annee: number) {
    const dernier = new Date(annee, mois, 0).getDate();
    return { min: `${annee}-${pad(mois)}-01`, max: `${annee}-${pad(mois)}-${pad(dernier)}` };
}

/** Options de la liste des SAMU : valeur = libellé court (à défaut, long) */
export const optionsSamu = (localisations: Localisation[]) =>
    localisations.map(l => ({
        valeur: l.libelle_court || l.libelle_long || '',
        libelle: l.libelle_court ? `${l.libelle_court} — ${l.libelle_long || ''}` : l.libelle_long
    }));

const debut = (l: Pick<LigneCra, 'date_debut' | 'heure_debut'>) => `${l.date_debut}T${l.heure_debut || '00:00'}`;
const fin = (l: Pick<LigneCra, 'date_fin' | 'heure_fin'>) => `${l.date_fin}T${l.heure_fin || '23:59'}`;

/** Chevauchement de deux lignes du même type (dates et heures) */
const chevauche = (a: LigneCra, b: LigneCra) => a.type === b.type && debut(a) < fin(b) && fin(a) > debut(b);

/** Ligne du même type en conflit (hors ligne en cours de modification) */
export function conflit(lignes: LigneCra[], ligne: LigneCra, ignorer: number | null): LigneCra | null {
    return lignes.find((l, i) => i !== ignorer && chevauche(ligne, l)) ?? null;
}

const LIBELLES_CONFLIT: Record<TypeLigne, string> = {
    astreinte: 'Astreinte',
    activite_courante: 'Activité courante',
    hno: 'HNO'
};

/** Ligne saisie refusée : message, ou null si elle peut être ajoutée */
export function controleLigne(f: FormulaireLigne, lignes: LigneCra[], ignorer: number | null): string | null {
    const objet = f.objet.trim();
    if (!f.date_debut || !f.date_fin || !f.heure_debut || !f.heure_fin || !f.samu || !objet)
        return 'Veuillez remplir tous les champs obligatoires (*)';
    if (f.date_fin < f.date_debut) return 'La date de fin doit être ≥ à la date de début';
    if (f.heure_fin <= f.heure_debut && f.date_debut === f.date_fin)
        return "L'heure de fin doit être > à l'heure de début";
    const c = conflit(lignes, { ...f, objet }, ignorer);
    if (!c) return null;
    const dates =
        c.date_debut === c.date_fin ? dateFr(c.date_debut) : `${dateFr(c.date_debut)} → ${dateFr(c.date_fin)}`;
    return `⚠️ Conflit détecté\n\nUn(e) ${LIBELLES_CONFLIT[f.type]} existe déjà sur cette période :\n📅 ${dates}  ⏰ ${c.heure_debut}–${c.heure_fin}\n📝 ${c.objet}\n\nModifiez les dates/heures ou supprimez l'entrée existante.`;
}

/** Ligne ajoutée ou modifiée : l'origine d'une ligne collectée est conservée */
export function ligneDuFormulaire(f: FormulaireLigne, remplacee: LigneCra | undefined): LigneCra {
    const ligne: LigneCra = { ...f, objet: f.objet.trim() };
    if (remplacee) {
        ligne.id = remplacee.id;
        if (remplacee.origin) {
            ligne.origin = remplacee.origin;
            ligne.orig = remplacee.orig;
        }
    }
    return ligne;
}

/** Dates d'une ligne de la saisie : « 05/03/2093 » ou « 05/03/2093 → 06/03/2093 » */
export const datesLigne = (l: LigneCra) =>
    `${dateFr(l.date_debut)}${l.date_fin !== l.date_debut ? ` → ${dateFr(l.date_fin)}` : ''}`;

// ---------- Collecte depuis la planification (MAD volante) ----------

const instantane = (l: LigneCra): InstantaneLigne => ({
    date_debut: l.date_debut,
    date_fin: l.date_fin,
    heure_debut: l.heure_debut,
    heure_fin: l.heure_fin,
    samu: l.samu,
    objet: l.objet
});

export interface Collecte {
    lignes: LigneCra[];
    /** Lignes saisies qui chevauchent une ligne de la planification, sans lui correspondre */
    differentes: Array<{ saisies: LigneCra[]; proposee: LigneCra }>;
    ajoutees: number;
    doublons: number;
}

/** Lignes de la planification ajoutées sans doublon ni chevauchement ; les lignes identiques y sont rattachées */
export function collecter(lignes: LigneCra[], collectees: LigneCra[]): Collecte {
    const liste = lignes.map(l => ({ ...l }));
    const differentes: Collecte['differentes'] = [];
    let ajoutees = 0;
    let doublons = 0;
    for (const l of collectees) {
        const identique = liste.find(
            x =>
                x.type === l.type &&
                x.date_debut === l.date_debut &&
                x.date_fin === l.date_fin &&
                x.heure_debut === l.heure_debut &&
                x.heure_fin === l.heure_fin &&
                (x.samu || '') === (l.samu || '') &&
                (x.objet || '') === (l.objet || '')
        );
        if (identique) {
            if (!identique.origin) {
                identique.origin = l.origin;
                identique.orig = instantane(identique);
            }
            doublons++;
            continue;
        }
        const saisies = liste.filter(x => chevauche(x, l));
        if (saisies.length) {
            differentes.push({ saisies, proposee: l });
            continue;
        }
        liste.push({ ...l, orig: instantane(l) });
        ajoutees++;
    }
    return { lignes: liste, differentes, ajoutees, doublons };
}

/** Lignes saisies différentes remplacées par celles de la planification */
export function remplacer(c: Collecte): { lignes: LigneCra[]; remplacees: number } {
    const liste = [...c.lignes];
    let remplacees = 0;
    for (const d of c.differentes) {
        for (const s of d.saisies) {
            const i = liste.indexOf(s);
            if (i >= 0) liste.splice(i, 1);
        }
        if (!liste.some(x => chevauche(x, d.proposee))) {
            liste.push({ ...d.proposee, orig: instantane(d.proposee) });
            remplacees++;
        }
    }
    return { lignes: liste, remplacees };
}

export const trierLignes = (lignes: LigneCra[]) =>
    [...lignes].sort((a, b) =>
        (a.date_debut + (a.heure_debut || '')).localeCompare(b.date_debut + (b.heure_debut || ''))
    );

const resumeLigne = (l: LigneCra) =>
    `${datesLigne(l)} ${l.heure_debut}-${l.heure_fin} ${l.samu || '(pas de SAMU)'} — ${l.objet}`;

export function questionRemplacement(differentes: Collecte['differentes']) {
    const detail = differentes
        .map(d => `• Saisi : ${d.saisies.map(resumeLigne).join(' / ')}\n  Planification : ${resumeLigne(d.proposee)}`)
        .join('\n');
    return `${differentes.length} ligne(s) déjà saisie(s) ne correspondent pas à la planification :\n\n${detail}\n\nLes remplacer par les données de la planification ?\n(Remplacer = données de la planification, Conserver = ce que vous avez saisi)`;
}

export const bilanCollecte = (n: { ajoutees: number; remplacees: number; doublons: number; conservees: number }) =>
    `${n.ajoutees} ligne(s) ajoutée(s)` +
    (n.remplacees ? `, ${n.remplacees} remplacée(s)` : '') +
    (n.doublons ? `, ${n.doublons} déjà conforme(s)` : '') +
    (n.conservees ? `, ${n.conservees} différente(s) conservée(s)` : '') +
    '. Vérifiez et corrigez si besoin.';

// ---------- Corrections à reporter dans la planification ----------

const CHAMPS_REPORTES = ['date_debut', 'date_fin', 'heure_debut', 'heure_fin'] as const;

/** Lignes collectées corrigées (dates, heures) ou supprimées pendant la saisie */
export function corrections(lignes: LigneCra[], supprimees: OrigineLigne[]): CorrectionCra[] {
    const liste: CorrectionCra[] = [];
    for (const l of lignes) {
        if (l.origin && l.orig && CHAMPS_REPORTES.some(k => l[k] !== l.orig![k]))
            liste.push({
                origin: l.origin,
                line: {
                    date_debut: l.date_debut,
                    date_fin: l.date_fin,
                    heure_debut: l.heure_debut,
                    heure_fin: l.heure_fin
                }
            });
    }
    for (const o of supprimees) liste.push({ origin: o, line: null });
    return liste;
}

export const questionReport = (nb: number, nbSupprimees: number) =>
    `Vous avez corrigé ${nb - nbSupprimees} ligne(s)` +
    (nbSupprimees ? ` et supprimé ${nbSupprimees} ligne(s)` : '') +
    ` issues de la planification.\n\nReporter ces corrections dans la page de planification (activités, créneaux d'astreinte) ?`;

export const bilanReport = (r: ResultatReport) =>
    `Planification mise à jour : ${r.activity} activité(s), ${r.astreinte} astreinte(s).` +
    (r.skipped && r.skipped.length ? `\n\nNon reporté :\n- ${r.skipped.join('\n- ')}` : '');
