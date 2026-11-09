// Aide à l'affectation › Administration : frise d'un déploiement, formulaire (saisie des périodes, contrôles, corps
// envoyé), entités proposées, historique, modèle PowerPoint, correspondance des activités
import type {
    CandidatsActivite,
    ConfigAffectation,
    CorpsDeploiement,
    Deploiement,
    DeploiementAdmin,
    EtapeAffectation,
    EvenementCandidat,
    PeriodeEtape
} from '@/api/affectation';
import { ajouterJours, jourFr, lundiDe, normaliser, styleFond } from '../planning/outils';

/** Motifs proposés en plus de la couleur */
export const MOTIFS: ReadonlyArray<[string, string]> = [
    ['none', 'Uni'],
    ['diag', 'Rayures'],
    ['diag2', 'Rayures inversées'],
    ['chevron', 'Chevrons'],
    ['grid', 'Quadrillage'],
    ['dots', 'Pois'],
    ['cross', 'Croisillons'],
    ['hlines', 'Lignes horizontales'],
    ['vlines', 'Lignes verticales'],
    ['zigzag', 'Zigzag']
];

/** Formulaire : phases du projet, puis étapes de mise en œuvre (la mise en service et la mise en production en font partie) */
export const PHASES_PROJET = ['cadrage', 'deploiement', 'gel'];
export const ETAPES_MISE_EN_OEUVRE = [
    'mise_en_service',
    'mise_en_production',
    'reunion_lancement',
    'visite_metier',
    'visite_ob',
    'test_prerequis',
    'vft',
    'formation_utilisateurs',
    'accompagnement'
];
/** Activités auxquelles des événements du SAMU peuvent être reliés */
export const ACTIVITES_EVENEMENTS = ETAPES_MISE_EN_OEUVRE;

/** Actions de l'historique : libellé, couleur */
export const ACTIONS_HISTORIQUE: Record<string, [string, string]> = {
    creation: ['Création du déploiement', '#2e7d32'],
    modification: ['Modification', '#1976d2'],
    suppression: ['Suppression', '#b3261e'],
    affectation: ['Affectation de ressources', '#7e57c2'],
    synchro: ['Report planification / événements', '#00897b'],
    import_asana_csv: ['Import Asana (fichier CSV)', '#e65100'],
    import_asana_api: ['Récupération Asana (API)', '#e65100']
};

const fr = (iso: string | null | undefined) => (iso ? jourFr(iso) : '');

export const definition = (config: ConfigAffectation | null, k: string): EtapeAffectation =>
    config?.stages.find(s => s.key === k) ?? { key: k, label: k };

/** Couleur et motif d'une étape, en style de fond */
export const fondEtape = (colors: Record<string, string>, patterns: Record<string, string>, k: string) =>
    styleFond(colors[k] || '#888888', patterns[k] || 'none');

/** Durée inclusive en jours calendaires (début et fin comptés) ; '' si incomplète ou à l'envers */
export function joursEntre(a: string, b: string): number | '' {
    if (!a || !b || b < a) return '';
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}

// ── Frise d'un déploiement (liste de l'administration) ──────────────────────

export interface SegmentFrise {
    cle: string;
    gauche: number;
    largeur: number;
    style: string;
    titre: string;
}
export interface ReperFrise {
    cle: string;
    position: number;
    style: string;
    titre: string;
}

/** Première et dernière date d'un déploiement */
export function bornesDeploiement(p: Deploiement) {
    const dates: (string | null | undefined)[] = [p.date_debut, p.date_mise_en_service, p.date_mise_en_production];
    Object.values(p.periods || {}).forEach(liste => liste.forEach(x => dates.push(x.start, x.end)));
    const ok = dates.filter((d): d is string => !!d).sort();
    return { min: ok[0] ?? '', max: ok[ok.length - 1] ?? '' };
}

/** Périodes (segments) et jalons (repères) d'un déploiement, en pourcentage de sa durée */
export function frise(
    p: Deploiement,
    config: ConfigAffectation,
    colors: Record<string, string>,
    patterns: Record<string, string>
) {
    const { min, max } = bornesDeploiement(p);
    const t0 = Date.parse(min);
    const duree = Math.max(1, Date.parse(max) - t0);
    const pos = (d: string) => ((Date.parse(d) - t0) / duree) * 100;
    const segments: SegmentFrise[] = [];
    config.stages
        .filter(st => st.kind !== 'date' && st.kind !== 'milestone')
        .forEach(st =>
            (p.periods?.[st.key] || []).forEach(x => {
                const gauche = pos(x.start);
                segments.push({
                    cle: st.key,
                    gauche,
                    largeur: Math.max(1.2, pos(x.end) - gauche),
                    style: fondEtape(colors, patterns, st.key),
                    titre: `${st.label} : ${fr(x.start)} → ${fr(x.end)}`
                });
            })
        );
    const reperes: ReperFrise[] = [];
    const jalons: [string, string | null | undefined][] = [
        ['mise_en_service', p.date_mise_en_service],
        ['mise_en_production', p.date_mise_en_production],
        ...['reunion_lancement', 'visite_ob'].map(k => [k, p.periods?.[k]?.[0]?.start] as [string, string | undefined])
    ];
    for (const [k, d] of jalons) {
        if (d)
            reperes.push({
                cle: k,
                position: pos(d),
                style: fondEtape(colors, patterns, k),
                titre: `${definition(config, k).label} : ${fr(d)}`
            });
    }
    return { segments, reperes, debut: fr(min), fin: fr(max) };
}

// ── Formulaire d'un déploiement ─────────────────────────────────────────────

/** Ligne d'une période : début, fin, nombre de jours, ressources ; auto : fin calée sur le début (non choisie) */
export interface LignePeriode {
    start: string;
    end: string;
    jours: string;
    needed: string;
    auto: boolean;
}

export interface Formulaire {
    id: number | null;
    samu_name: string;
    location_id: number | null;
    /** Identifiant du chef de projet, '' : aucun */
    chef: string;
    date_debut: string;
    /** Mise en service, mise en production */
    dates: Record<string, string>;
    /** Jalons (une date) */
    jalons: Record<string, string>;
    periodes: Record<string, LignePeriode[]>;
}

export const lignePeriode = (x?: Partial<PeriodeEtape>): LignePeriode => ({
    start: x?.start ?? '',
    end: x?.end ?? '',
    jours: String(joursEntre(x?.start ?? '', x?.end ?? '')),
    needed: x?.needed ? String(x.needed) : '',
    auto: false
});

/** Formulaire d'un déploiement (null : nouveau) ; une ligne vide par étape sans période */
export function formulaireDe(config: ConfigAffectation, p: DeploiementAdmin | null): Formulaire {
    const f: Formulaire = {
        id: p?.id ?? null,
        samu_name: p?.samu_name ?? '',
        location_id: p?.location_id ?? null,
        chef: p?.chef_projet_id ? String(p.chef_projet_id) : '',
        date_debut: p?.date_debut ?? '',
        dates: {},
        jalons: {},
        periodes: {}
    };
    for (const st of config.stages) {
        if (st.kind === 'date') {
            f.dates[st.key] = (p?.[`date_${st.key}` as 'date_mise_en_service'] as string | null) || '';
        } else if (st.kind === 'milestone') {
            f.jalons[st.key] = p?.periods?.[st.key]?.[0]?.start || '';
        } else {
            const liste = p?.periods?.[st.key] || [];
            f.periodes[st.key] = liste.length ? liste.map(x => lignePeriode(x)) : [lignePeriode()];
        }
    }
    return f;
}

/** Début d'une période choisi : la fin se recalcule (nombre de jours) ou se cale sur ce jour */
export function debutModifie(l: LignePeriode) {
    if (l.start) {
        const n = Number(l.jours);
        if (n > 0) {
            l.end = ajouterJours(l.start, n - 1);
            l.auto = false;
        } else if (!l.end || l.auto || l.end < l.start) {
            l.end = l.start;
            l.auto = true;
            l.jours = '1';
        } else {
            l.jours = String(joursEntre(l.start, l.end));
        }
    } else if (l.auto) {
        l.end = '';
        l.auto = false;
        l.jours = '';
    }
}

export function finModifiee(l: LignePeriode) {
    l.auto = false;
    l.jours = l.start ? String(joursEntre(l.start, l.end)) : '';
}

export function joursModifies(l: LignePeriode) {
    const n = Math.floor(Number(l.jours));
    if (l.start && n > 0) {
        l.end = ajouterJours(l.start, n - 1);
        l.auto = false;
    }
}

/** Semaine choisie (« AAAA-Wss ») : la période commence le lundi de cette semaine ISO */
export function semaineChoisie(l: LignePeriode, valeur: string) {
    const m = /^(\d{4})-W(\d{2})$/.exec(valeur);
    // Le 4 janvier est toujours en semaine 1
    l.start = m ? ajouterJours(lundiDe(`${m[1]}-01-04`), (Number(m[2]) - 1) * 7) : '';
    debutModifie(l);
}

/** Entités (localisations) dont le libellé court ou long contient la saisie, sans accents ni casse */
export function entitesProposees<T extends { libelle_court: string; libelle_long: string }>(
    entites: T[],
    saisie: string
) {
    const q = normaliser(saisie);
    return entites.filter(l => !q || normaliser(l.libelle_court).includes(q) || normaliser(l.libelle_long).includes(q));
}

/** Corps envoyé : entité reconnue par son libellé court, périodes saisies (lignes vides ignorées), jalons d'un jour */
export function corpsDuFormulaire(f: Formulaire, entites: { id: number; libelle_court: string }[]): CorpsDeploiement {
    const samu = f.samu_name.trim();
    const exacte = entites.find(l => normaliser(l.libelle_court) === normaliser(samu));
    const periods: Record<string, PeriodeEtape[]> = {};
    for (const [k, lignes] of Object.entries(f.periodes)) {
        const liste = lignes
            .filter(l => l.start || l.end)
            .map(l => ({ start: l.start, end: l.end, ...(l.needed ? { needed: Number(l.needed) } : {}) }));
        if (liste.length) periods[k] = liste;
    }
    for (const [k, d] of Object.entries(f.jalons)) if (d) periods[k] = [{ start: d, end: d }];
    return {
        samu_name: samu,
        location_id: exacte ? exacte.id : null,
        chef_projet_id: f.chef ? Number(f.chef) : null,
        date_debut: f.date_debut,
        date_mise_en_service: f.dates.mise_en_service || null,
        date_mise_en_production: f.dates.mise_en_production || null,
        periods
    };
}

/** Oubli du formulaire : message et champ à corriger (samu, debut, date:clé, jalon:clé, clé:ligne:start|end|needed) */
export interface Oubli {
    message: string;
    champ: string;
}

/** Contrôle du formulaire : liste précise des oublis, dans l'ordre des champs */
export function controler(f: Formulaire, config: ConfigAffectation): Oubli[] {
    const oublis: Oubli[] = [];
    const ajouter = (message: string, champ: string) => oublis.push({ message, champ });
    const libelle = (k: string) => definition(config, k).label;
    const debut = f.date_debut;
    if (!f.samu_name.trim()) ajouter('Nom du SAMU : à renseigner.', 'samu');
    if (!debut) ajouter('Date de début du projet : à renseigner.', 'debut');
    for (const k of ['mise_en_service', 'mise_en_production']) {
        const d = f.dates[k];
        if (d && debut && d < debut)
            ajouter(`${libelle(k)} : la date (${fr(d)}) précède le début du projet.`, `date:${k}`);
    }
    for (const k of ['reunion_lancement', 'visite_ob']) {
        const d = f.jalons[k];
        if (d && debut && d < debut)
            ajouter(`${libelle(k)} : la date (${fr(d)}) précède le début du projet.`, `jalon:${k}`);
    }
    for (const k of [...PHASES_PROJET, ...ETAPES_MISE_EN_OEUVRE]) {
        const def = definition(config, k);
        (f.periodes[k] || []).forEach((l, i) => {
            if (!l.start && !l.end && !l.needed) return; // ligne vide : étape non utilisée
            const champ = (c: string) => `${k}:${i}:${c}`;
            if (!l.start) ajouter(`${def.label} : date de début à renseigner.`, champ('start'));
            if (!l.end) ajouter(`${def.label} : date de fin à renseigner.`, champ('end'));
            if (l.start && l.end && l.end < l.start)
                ajouter(`${def.label} : la date de fin précède la date de début.`, champ('end'));
            if (l.start && debut && l.start < debut)
                ajouter(`${def.label} : commence avant le début du projet.`, champ('start'));
            if (def.resources && !l.needed)
                ajouter(`${def.label} : nombre de ressources nécessaires à renseigner.`, champ('needed'));
        });
    }
    return oublis;
}

/** Dates de l'activité saisies dans le formulaire (date, jalon, ou première période) ; null si non datée */
export function datesActivite(f: Formulaire, k: string): { start: string; end: string } | null {
    if (k in f.dates || k in f.jalons) {
        const d = f.dates[k] ?? f.jalons[k];
        return d ? { start: d, end: d } : null;
    }
    const l = f.periodes[k]?.[0];
    return l?.start ? { start: l.start, end: l.end || l.start } : null;
}

// ── Événements reliés ───────────────────────────────────────────────────────

export const datesEvenement = (e: { start: string; end: string }) =>
    e.start === e.end ? fr(e.start) : `${fr(e.start)} → ${fr(e.end)}`;

/** Libellé d'un événement proposé (liste déroulante) */
export const libelleCandidat = (e: EvenementCandidat) =>
    `${datesEvenement(e)} · ${e.label}${e.participants ? ` · ${e.participants} part.` : ''}${e.type ? ` · ${e.type}` : ''}`;

/** Résumé des parties reliées d'une activité découpable */
export function resumeParties(c: CandidatsActivite) {
    const liees = [...c.matching, ...c.others].filter(e => c.linkedIds.includes(e.id));
    return liees.length
        ? `${liees.length} partie(s) : ${liees.map(datesEvenement).join(' ; ')}`
        : '— Aucun événement lié —';
}

// ── Historique, modèle PowerPoint, correspondance ───────────────────────────

/** Date d'une entrée de l'historique (enregistrée en UTC « AAAA-MM-JJ HH:MM:SS »), à l'heure locale */
export const dateHistorique = (at: string) =>
    new Date(`${String(at).replace(' ', 'T')}Z`).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });

/** Taille d'un fichier : « 1,5 Mo » ou « 320 ko » */
export const taille = (n: number) =>
    n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.round(n / 1024)} ko`;

/** Valeur choisie dans la liste des activités Asana : '' (par défaut), règle connue, ou « Autre » */
export function choixRegle(regle: string, connues: { value: string }[]) {
    if (!regle) return '';
    return connues.some(x => x.value === regle) ? regle : '__custom';
}
