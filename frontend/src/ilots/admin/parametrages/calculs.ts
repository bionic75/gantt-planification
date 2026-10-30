// Paramétrages divers : favicon, inactivité, analyse d'un dump, configuration des thèmes (sans affichage)
import type { AnalyseDump, ConfigThemes, Parametres } from '@/api/parametrages';

// ---------- Inactivité ----------

export const DELAIS_INACTIVITE = [5, 10, 15, 30, 60];

export const inactivite = (p: Parametres) => ({
    active: p.inactivity_enabled === 'true',
    minutes: p.inactivity_timeout ? String(p.inactivity_timeout) : '15'
});

// ---------- Favicon ----------

export const FAVICONS = [
    { id: 'calendrier', libelle: 'Calendrier', indice: 'Planning par jour' },
    { id: 'gantt', libelle: 'Gantt', indice: 'Barres de planification' },
    { id: 'grille', libelle: 'Grille', indice: 'Affectations par case' },
    { id: 'timeline', libelle: 'Timeline', indice: 'Expert dans le temps' }
] as const;

export const imageFavicon = (id: string) => `/img/favicon-${id}.svg`;

// ---------- Aide en ligne ----------

export const messagePublication = (active: boolean, version: string) =>
    active
        ? `Publication activée pour la version ${version}.\nLa popup s'affichera à la prochaine connexion de chaque utilisateur.`
        : 'Publication désactivée.';

/** Page d'aide envoyée : « mise à jour le JJ/MM/AAAA à HH:MM:SS » */
export function miseAJourAide(dateIso: string) {
    const d = new Date(dateIso);
    return `mise à jour le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR')}`;
}

// ---------- Dump ----------

/** Taille lisible (octets, Ko, Mo, Go) */
export function octets(n: number | null | undefined): string {
    if (n == null) return '—';
    if (n < 1024) return `${n} o`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} Ko`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(1)} Mo`;
    return `${(n / 1073741824).toFixed(2)} Go`;
}

/** Version du dump par rapport au serveur : identique (vert), plus récente (rouge), plus ancienne (orange) */
export const niveauVersion = (relation: number) =>
    relation === 0 ? 'identique' : relation === 1 ? 'recente' : 'ancienne';

export interface LigneTable {
    table: string;
    dump: number | undefined;
    actuel: number | undefined;
    note: string;
    /** Différence ou remarque : ligne mise en évidence */
    ecart: boolean;
}

/** Tables du dump et du serveur actuel, triées, avec les écarts */
export function lignesTables(d: AnalyseDump): LigneTable[] {
    const dump = d.manifest.tables ?? {};
    const actuel = d.current.tables ?? {};
    return [...new Set([...Object.keys(dump), ...Object.keys(actuel)])].sort().map(table => {
        const a = dump[table];
        const b = actuel[table];
        const note =
            a === undefined ? 'absente du dump (sera vidée)' : b === undefined ? 'inconnue localement (ignorée)' : '';
        return { table, dump: a, actuel: b, note, ecart: !!note || (a !== undefined && b !== undefined && a !== b) };
    });
}

/** Colonnes ignorées ou ramenées à leur valeur par défaut */
export function notesColonnes(d: AnalyseDump): string[] {
    const s = d.schemaDiff ?? {};
    return [
        ...Object.entries(s.columnsIgnored ?? {}).map(([t, c]) => `${t} : colonnes ignorées (${c.join(', ')})`),
        ...Object.entries(s.columnsDefaulted ?? {}).map(
            ([t, c]) => `${t} : colonnes à valeur par défaut (${c.join(', ')})`
        )
    ];
}

export const messageRestauration = (r: {
    durationMs: number;
    rows: number;
    tables: number;
    pdfs: number;
    safetyBackup: string;
}) =>
    `✅ Restauration terminée en ${(r.durationMs / 1000).toFixed(1)} s\n\n${r.rows} lignes dans ${r.tables} tables, ${r.pdfs} PDF.\nSauvegarde de sécurité : ${r.safetyBackup}\n\nIl est recommandé de redémarrer le serveur, puis de vous reconnecter avec un compte du dump.`;

// ---------- Thèmes ----------

export const THEMES = ['halloween', 'noel', 'saintvalentin', 'saintpatrick', 'paques', 'vacances'] as const;

/** Période d'un thème à l'écran : dates complètes (année en cours) ou jours autour de Pâques */
export interface ChampsTheme {
    auto: boolean;
    debut: string;
    fin: string;
    avant: number;
    apres: number;
}

export interface ChampsThemes {
    mode: ConfigThemes['mode'];
    force: string;
    intensite: ConfigThemes['intensity'];
    themes: Record<string, ChampsTheme>;
}

/** Date « MM-JJ » de la configuration → date de l'année en cours pour le champ */
const versDate = (mmjj: string, annee: number) => `${annee}-${mmjj}`;

export function champsThemes(c: Partial<ConfigThemes>, annee = new Date().getFullYear()): ChampsThemes {
    return {
        mode: c.mode || 'off',
        force: c.forced || 'noel',
        intensite: c.intensity || 'sobre',
        themes: Object.fromEntries(
            THEMES.map(id => {
                const t = c.themes?.[id] ?? {};
                return [
                    id,
                    {
                        auto: t.auto !== false,
                        debut: versDate(t.start || '01-01', annee),
                        fin: versDate(t.end || '01-01', annee),
                        avant: t.before ?? 7,
                        apres: t.after ?? 1
                    }
                ];
            })
        )
    };
}

/** Configuration enregistrée : dates réduites à « MM-JJ », jours autour de Pâques pour Pâques */
export function configThemes(c: ChampsThemes): ConfigThemes {
    return {
        mode: c.mode,
        forced: c.force,
        intensity: c.intensite,
        themes: Object.fromEntries(
            THEMES.map(id => {
                const t = c.themes[id] as ChampsTheme;
                return [
                    id,
                    id === 'paques'
                        ? { auto: t.auto, before: Number(t.avant), after: Number(t.apres) }
                        : { auto: t.auto, start: (t.debut || '').slice(5), end: (t.fin || '').slice(5) }
                ];
            })
        )
    };
}

/** État du thème affiché */
export const etatTheme = (affiche: { id: string; reason: string } | null, libelle: (id: string) => string) =>
    affiche
        ? `Thème affiché actuellement : ${libelle(affiche.id)} (${affiche.reason})`
        : 'Aucun thème affiché actuellement.';

// ---------- Son de notification ----------

/** Taille maximale d'un son personnalisé (3 Mo) */
export const TAILLE_MAX_SON = 3 * 1024 * 1024;
