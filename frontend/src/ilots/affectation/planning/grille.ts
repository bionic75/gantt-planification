// Aide à l'affectation › grille des déploiements : colonnes d'une échelle de temps (jour, semaine, mois, trimestre, année),
// contenu des cellules (phases, étapes, jalons, trigrammes des experts), tri des SAMU, période affichée.
// Le tableau est produit en HTML : la même mise en forme sert à l'écran et aux pages imprimées / exportées.
import type { ConfigAffectation, Deploiement, PeriodeEtape, RessourceAffectable } from '@/api/affectation';
import {
    ajouterJours,
    aujourdhui,
    erreurPeriode,
    esc,
    ETAPES,
    isoMs,
    jourFr,
    JALONS,
    JOURS_COURTS,
    lundiDe,
    majuscule,
    MOIS,
    PHASES,
    regrouper,
    semaineIso,
    styleFond,
    utcMs,
    valeurSemaine,
    type Echelle
} from './outils';

/** Données et options d'affichage de la grille */
export interface ContexteGrille {
    deploiements: Deploiement[];
    config: ConfigAffectation | null;
    ressources: RessourceAffectable[];
    externes: RessourceAffectable[];
    /** Étapes masquées ; « _tri » : trigrammes masqués ; « _past » : SAMU déjà en service masqués */
    masquees: Set<string>;
    /** Rendu d'impression : barres non cliquables */
    impression?: boolean;
}

export const definitionEtape = (ctx: ContexteGrille, k: string) =>
    ctx.config?.stages.find(x => x.key === k) ?? { key: k, label: k };
export const couleurEtape = (ctx: ContexteGrille, k: string) => ctx.config?.colors?.[k] || '#888888';
export const motifEtape = (ctx: ContexteGrille, k: string) => ctx.config?.patterns?.[k] || 'none';
export const fondEtape = (ctx: ContexteGrille, k: string) => styleFond(couleurEtape(ctx, k), motifEtape(ctx, k));

/** Expert (identifiant positif) ou ressource externe (identifiant négatif) */
export const ressourceDe = (ctx: ContexteGrille, id: number) =>
    ctx.ressources.find(z => z.id === id) ?? ctx.externes.find(z => z.id === id);
const trigrammeDe = (ctx: ContexteGrille, id: number) => {
    const r = ressourceDe(ctx, id);
    return r ? r.trigramme || `${(r.prenom || '').charAt(0)}${(r.nom || '').slice(0, 2)}`.toUpperCase() : '?';
};

/** Colonne de la grille : bornes, week-end, jour courant, largeur de référence (trigrammes) */
export interface Colonne {
    key: string;
    from: string;
    to: string;
    we: boolean;
    today: boolean;
    w: number;
}

/** Contexte des trigrammes : colonnes affichées, échelle, largeur ; nombre de lignes par voie mis en cache */
export class Trigrammes {
    private cache = new Map<string, number>();
    constructor(
        readonly cols: Colonne[],
        readonly zoom: Echelle,
        readonly largeur = 44
    ) {}

    /** Trigrammes (triés, sans doublon) des experts intervenant entre deux dates sur une période d'étape */
    liste(ctx: ContexteGrille, p: Deploiement, k: string, x: PeriodeEtape, from: string, to: string) {
        const set = new Set<string>();
        for (const [d, rids] of Object.entries(p.assignment_days?.[k] ?? {}))
            if (d >= from && d <= to && d >= x.start && d <= x.end) rids.forEach(r => set.add(trigrammeDe(ctx, r)));
        return [...set].sort();
    }

    /** Lignes d'une barre : une par trigramme en vue jour, sinon trigrammes à la suite (retour à la ligne) */
    private lignes(n: number, w: number) {
        return !n ? 1 : this.zoom === 'day' ? n : Math.max(1, Math.ceil((n * 21) / Math.max(24, w)));
    }

    /** Lignes communes à toutes les barres d'une voie (hauteur constante d'une colonne à l'autre) */
    lignesVoie(ctx: ContexteGrille, p: Deploiement, k: string, x: PeriodeEtape, i: number) {
        const cle = `${p.id}|${k}|${i}`;
        const connu = this.cache.get(cle);
        if (connu !== undefined) return connu;
        let max = 1;
        for (const c of this.cols) {
            if (!(x.start <= c.to && x.end >= c.from)) continue;
            const liste = this.liste(ctx, p, k, x, c.from, c.to);
            if (!liste.length) continue;
            const span = (utcMs(c.to) - utcMs(c.from)) / 86400000 + 1;
            const o1 = (utcMs(x.start < c.from ? c.from : x.start) - utcMs(c.from)) / 86400000;
            const o2 = (utcMs(x.end > c.to ? c.to : x.end) - utcMs(c.from)) / 86400000 + 1;
            const w = ((c.w || this.largeur) * (o2 - o1)) / span;
            max = Math.max(max, this.lignes(liste.length, w));
        }
        this.cache.set(cle, max);
        return max;
    }
}

/**
 * Contenu d'une cellule : phases (bandeau haut), étapes (bandes du bas ; cliquables pour affecter, attribut
 * data-affecter « id|étape »), jalons et début du projet
 */
export function contenuCellule(ctx: ContexteGrille, tri: Trigrammes, p: Deploiement, c: Colonne): string {
    const masque = ctx.masquees;
    const barre = (k: string, x: PeriodeEtape, i: number, etape: boolean) => {
        if (masque.has(k) || !(x.start <= c.to && x.end >= c.from)) return '';
        const tete = x.start >= c.from && x.start <= c.to;
        const queue = x.end >= c.from && x.end <= c.to;
        const def = definitionEtape(ctx, k);
        const affectes = p.assignments?.[k] ?? [];
        const obtenu = affectes.length;
        const necessaire = x.needed || 0;
        const noms = affectes.map(id => {
            const r = ressourceDe(ctx, id);
            return r ? `${r.prenom || ''} ${(r.nom || '').toUpperCase()}`.trim() : `Ressource ${id}`;
        });
        const infobulle =
            `${def.label} : ${jourFr(x.start)} → ${jourFr(x.end)}` +
            (etape && necessaire
                ? ` — ${obtenu}/${necessaire} ressource(s) par jour` + (noms.length ? ` :\n• ${noms.join('\n• ')}` : '')
                : '') +
            (etape && necessaire ? ' (cliquer pour voir / affecter)' : '');
        const cliquable = etape && !ctx.impression && necessaire;
        // Position proportionnelle dans la colonne (vue semaine / mois) : une journée reste une petite barre
        const span = (utcMs(c.to) - utcMs(c.from)) / 86400000 + 1;
        const o1 = (utcMs(x.start < c.from ? c.from : x.start) - utcMs(c.from)) / 86400000;
        const o2 = (utcMs(x.end > c.to ? c.to : x.end) - utcMs(c.from)) / 86400000 + 1;
        const pos =
            span > 1
                ? `margin-left:${((o1 / span) * 100).toFixed(2)}%;width:max(${(((o2 - o1) / span) * 100).toFixed(2)}%,24px);flex:0 0 auto;`
                : '';
        // Trigrammes des experts du jour (ou des jours de la colonne), sauf si masqués par le commutateur de la légende
        const avecTri = etape && necessaire && !masque.has('_tri');
        const trig = avecTri ? tri.liste(ctx, p, k, x, c.from, c.to) : [];
        const voies = avecTri ? tri.lignesVoie(ctx, p, k, x, i) : 1;
        const libelle = trig.length
            ? tri.zoom === 'day'
                ? trig.map(t => `<span>${esc(t)}</span>`).join('')
                : esc(trig.join(' '))
            : tete && etape && necessaire
              ? `${obtenu}/${necessaire}`
              : '';
        const classes = [
            'b',
            avecTri ? 'tri' : '',
            tete ? 'hd' : '',
            queue ? 'tl' : '',
            cliquable ? 'go' : '',
            etape && necessaire && obtenu >= necessaire ? 'ok' : '',
            k === 'gel' ? 'gel' : ''
        ]
            .filter(Boolean)
            .join(' ');
        const attributs = cliquable
            ? ` data-affecter="${p.id}|${esc(k)}" role="button" tabindex="0" aria-label="${esc(`Affecter des ressources : ${def.label}, ${p.samu_name}`)}"`
            : '';
        return `<div class="${classes}" style="${avecTri ? `--tl:${voies};` : ''}${fondEtape(ctx, k)}${pos}" title="${esc(infobulle)}"${attributs}>${libelle}</div>`;
    };
    // Une voie fixe par période du projet : une barre garde la même hauteur d'une colonne à l'autre
    const voies = (cles: string[], etape: boolean) =>
        cles
            .map(k =>
                masque.has(k)
                    ? ''
                    : (p.periods?.[k] ?? [])
                          .map(
                              (x, i) =>
                                  barre(k, x, i, etape) ||
                                  // Emplacement vide : même hauteur que la barre de cette voie dans les autres colonnes
                                  (etape && x.needed && !masque.has('_tri')
                                      ? `<div class="b tri" style="visibility:hidden;--tl:${tri.lignesVoie(ctx, p, k, x, i)}"></div>`
                                      : '<div class="b" style="visibility:hidden"></div>')
                          )
                          .join('')
            )
            .join('');
    let ph = voies(PHASES, false);
    let st = voies(ETAPES, true);
    // Un groupe de voies n'est retiré que si la ligne n'a aucune période de ce groupe
    const aDes = (cles: string[]) => cles.some(k => !masque.has(k) && (p.periods?.[k] ?? []).length);
    if (!aDes(PHASES)) ph = '';
    if (!aDes(ETAPES)) st = '';
    let jalons = '';
    const span = (utcMs(c.to) - utcMs(c.from)) / 86400000 + 1;
    const position = (d: string) => ((utcMs(d) - utcMs(c.from)) / 86400000 / span) * 100;
    const dates: [string, string | null | undefined][] = [
        ['mise_en_service', p.date_mise_en_service],
        ['mise_en_production', p.date_mise_en_production],
        ...JALONS.map(k => [k, p.periods?.[k]?.[0]?.start ?? null] as [string, string | null])
    ];
    for (const [k, d] of dates) {
        if (d && !masque.has(k) && d >= c.from && d <= c.to)
            jalons += `<span class="aff-mk" style="left:${(position(d) + 50 / span).toFixed(2)}%" title="${esc(definitionEtape(ctx, k).label)} : ${jourFr(d)}"><i style="${fondEtape(ctx, k)}"></i></span>`;
    }
    // Début du projet : trait vertical au bord gauche du jour, aligné sur le début des barres
    if (p.date_debut >= c.from && p.date_debut <= c.to)
        jalons += `<span class="aff-mk start" style="left:${position(p.date_debut).toFixed(2)}%" title="Début du projet : ${jourFr(p.date_debut)}"><i style="background:#263238"></i></span>`;
    return ph || st || jalons
        ? `${jalons}<div class="aff-pc"><div class="ph">${ph}</div><div class="st">${st}</div></div>`
        : '';
}

export type CleTri = 'samu' | 'chef' | 'mes' | 'mep';
export interface TriGrille {
    key: CleTri;
    dir: 1 | -1;
}

/** Déploiements affichés, triés : SAMU déjà en service masqués (« _past »), lignes retirées (sauf includeHidden) */
export function deploiementsTries(
    ctx: ContexteGrille,
    tri: TriGrille,
    retirees: Set<number>,
    avecRetirees = false,
    jour = aujourdhui()
) {
    const cmp = (a: unknown, b: unknown) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true });
    const valeur: Record<CleTri, (p: Deploiement) => string | null> = {
        samu: p => p.samu_name,
        chef: p => p.chef_projet_nom,
        mes: p => p.date_mise_en_service,
        mep: p => p.date_mise_en_production
    };
    const k = valeur[tri.key];
    let liste = ctx.masquees.has('_past')
        ? ctx.deploiements.filter(p => !(p.date_mise_en_service && p.date_mise_en_service < jour))
        : ctx.deploiements;
    if (!avecRetirees) liste = liste.filter(p => !retirees.has(p.id));
    return [...liste].sort((a, b) => {
        const va = k(a);
        const vb = k(b);
        // Valeurs vides toujours en bas
        if (!va && vb) return 1;
        if (va && !vb) return -1;
        return cmp(va, vb) * tri.dir || cmp(a.samu_name, b.samu_name);
    });
}

/** Colonnes et lignes d'en-tête (HTML) d'une échelle de temps entre deux dates */
export function construireColonnes(
    zoom: Echelle,
    min: string,
    max: string,
    o: { print?: boolean; noToday?: boolean; jour?: string } = {}
): { cols: Colonne[]; rows: string[] } {
    const t = o.noToday ? '9999-12-31' : (o.jour ?? aujourdhui());
    const mw = (w: number) => (o.print ? '' : `style="min-width:${w}px;"`);
    const th = (n: number, txt: string | number) => `<th class="" colspan="${n}" >${txt}</th>`;
    const lignes: string[] = [];
    let cols: Colonne[];
    const we = (d: string) => [0, 6].includes(new Date(utcMs(d)).getUTCDay());
    if (zoom === 'day') {
        const jours: string[] = [];
        for (let ms = utcMs(min); ms <= utcMs(max); ms += 86400000) jours.push(isoMs(ms));
        cols = jours.map(d => ({ key: d, from: d, to: d, we: we(d), today: d === t, w: 30 }));
        lignes.push(
            regrouper(jours, d => d.slice(0, 4))
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            regrouper(
                jours,
                d => d.slice(0, 7),
                d => majuscule(MOIS[+d.slice(5, 7) - 1] ?? '')
            )
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            regrouper(
                jours,
                d => {
                    const w = semaineIso(d);
                    return `${w.year}-${w.week}`;
                },
                d => `S${semaineIso(d).week}`
            )
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            jours
                .map(
                    d =>
                        `<th class="${we(d) ? 'we' : ''} ${d === t ? 'today' : ''}" ${d === t ? 'data-today="1"' : ''} ${mw(30)}>${+d.slice(8)}</th>`
                )
                .join('')
        );
        lignes.push(
            jours
                .map(
                    d =>
                        `<th class="${we(d) ? 'we' : ''} ${d === t ? 'today' : ''}">${JOURS_COURTS[new Date(utcMs(d)).getUTCDay()]}</th>`
                )
                .join('')
        );
    } else if (zoom === 'week') {
        const lundis: string[] = [];
        for (let m = lundiDe(min); m <= max; m = ajouterJours(m, 7)) lundis.push(m);
        const ceLundi = lundiDe(t);
        cols = lundis.map(m => ({ key: m, from: m, to: ajouterJours(m, 6), we: false, today: m === ceLundi, w: 64 }));
        lignes.push(
            regrouper(lundis, m => m.slice(0, 4))
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            regrouper(
                lundis,
                m => m.slice(0, 7),
                m => majuscule(MOIS[+m.slice(5, 7) - 1] ?? '')
            )
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            lundis
                .map(
                    m =>
                        `<th class="${m === ceLundi ? 'today' : ''}" ${m === ceLundi ? 'data-today="1"' : ''} ${mw(64)}>S${semaineIso(m).week}</th>`
                )
                .join('')
        );
        lignes.push(
            lundis
                .map(
                    m =>
                        `<th class="${m === ceLundi ? 'today' : ''}" style="font-size:11px;font-weight:500;">${m.slice(8)}/${m.slice(5, 7)}</th>`
                )
                .join('')
        );
    } else if (zoom === 'month') {
        const mois: string[] = [];
        for (let m = min.slice(0, 7); m <= max.slice(0, 7);) {
            mois.push(m);
            const y = +m.slice(0, 4);
            const mo = +m.slice(5, 7);
            m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
        }
        cols = mois.map(m => {
            const y = +m.slice(0, 4);
            const mo = +m.slice(5, 7);
            return {
                key: m,
                from: `${m}-01`,
                to: ajouterJours(mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`, -1),
                we: false,
                today: m === t.slice(0, 7),
                w: 100
            };
        });
        lignes.push(
            regrouper(mois, m => m.slice(0, 4))
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            mois
                .map(
                    m =>
                        `<th class="${m === t.slice(0, 7) ? 'today' : ''}" ${m === t.slice(0, 7) ? 'data-today="1"' : ''} ${mw(100)}>${majuscule(MOIS[+m.slice(5, 7) - 1] ?? '')}</th>`
                )
                .join('')
        );
    } else if (zoom === 'quarter') {
        const trimestres: { y: number; q: number }[] = [];
        let qy = +min.slice(0, 4);
        let qq = Math.floor((+min.slice(5, 7) - 1) / 3);
        const ey = +max.slice(0, 4);
        const eq = Math.floor((+max.slice(5, 7) - 1) / 3);
        while (qy < ey || (qy === ey && qq <= eq)) {
            trimestres.push({ y: qy, q: qq });
            qq++;
            if (qq > 3) {
                qq = 0;
                qy++;
            }
        }
        const tq = { y: +t.slice(0, 4), q: Math.floor((+t.slice(5, 7) - 1) / 3) };
        cols = trimestres.map(x => ({
            key: `${x.y}-T${x.q + 1}`,
            from: `${x.y}-${String(x.q * 3 + 1).padStart(2, '0')}-01`,
            to: ajouterJours(x.q === 3 ? `${x.y + 1}-01-01` : `${x.y}-${String(x.q * 3 + 4).padStart(2, '0')}-01`, -1),
            we: false,
            today: x.y === tq.y && x.q === tq.q,
            w: 110
        }));
        lignes.push(
            regrouper(
                trimestres,
                x => x.y,
                x => x.y
            )
                .map(g => th(g.n, g.label))
                .join('')
        );
        lignes.push(
            trimestres
                .map(
                    x =>
                        `<th class="${x.y === tq.y && x.q === tq.q ? 'today' : ''}" ${x.y === tq.y && x.q === tq.q ? 'data-today="1"' : ''} ${mw(110)}>T${x.q + 1}</th>`
                )
                .join('')
        );
    } else {
        const annees: number[] = [];
        for (let y = +min.slice(0, 4); y <= +max.slice(0, 4); y++) annees.push(y);
        cols = annees.map(y => ({
            key: String(y),
            from: `${y}-01-01`,
            to: `${y}-12-31`,
            we: false,
            today: String(y) === t.slice(0, 4),
            w: 140
        }));
        lignes.push(
            annees
                .map(
                    y =>
                        `<th class="${String(y) === t.slice(0, 4) ? 'today' : ''}" ${String(y) === t.slice(0, 4) ? 'data-today="1"' : ''} ${mw(140)}>${y}</th>`
                )
                .join('')
        );
    }
    return { cols, rows: lignes };
}

// ── Période affichée ─────────────────────────────────────────────────────────

/** Bornes choisies par l'utilisateur ; une borne absente reste automatique */
export interface BornesGrille {
    from: string | null;
    to: string | null;
}

/** Période couvrant tous les déploiements (3 jours avant, 7 jours après) ; à défaut 3 mois à partir du mois courant */
export function periodeAutomatique(deploiements: Deploiement[], jour = aujourdhui()) {
    let min: string | null = null;
    let max: string | null = null;
    for (const p of deploiements) {
        const dates: (string | null | undefined)[] = [p.date_debut, p.date_mise_en_service, p.date_mise_en_production];
        Object.values(p.periods ?? {}).forEach(l => l.forEach(x => dates.push(x.start, x.end)));
        for (const d of dates.filter((x): x is string => !!x)) {
            if (!min || d < min) min = d;
            if (!max || d > max) max = d;
        }
    }
    if (!min || !max) {
        min = `${jour.slice(0, 8)}01`;
        max = ajouterJours(min, 90);
    }
    return { min: ajouterJours(min, -3), max: ajouterJours(max, 7) };
}

export function periodeAffichee(deploiements: Deploiement[], bornes: BornesGrille | null) {
    const a = periodeAutomatique(deploiements);
    return { min: bornes?.from || a.min, max: bornes?.to || a.max };
}

/** Bornes mémorisées aberrantes (ex. année 0002) : retour à l'affichage automatique */
export function bornesValides(b: BornesGrille | null): BornesGrille | null {
    if (!b) return null;
    if (b.from && erreurPeriode(b.from, b.to || b.from, 'month')) return null;
    if (b.to && erreurPeriode(b.from || b.to, b.to, 'month')) return null;
    return b;
}

/** Type des champs de bornes selon l'échelle : calendrier (jour), semaine, mois */
export type TypeBorne = 'date' | 'week' | 'month';
export const typeBorne = (zoom: Echelle): TypeBorne => (zoom === 'week' ? 'week' : zoom === 'month' ? 'month' : 'date');
export const valeurBorne = (type: TypeBorne, iso: string) =>
    type === 'date' ? iso : type === 'week' ? valeurSemaine(iso) : iso.slice(0, 7);
export function debutBorne(type: TypeBorne, v: string): string | null {
    if (!v) return null;
    if (type === 'date') return v;
    if (type === 'month') return `${v}-01`;
    const m = /^(\d{4})-W(\d{2})$/.exec(v);
    return m ? ajouterJours(lundiDe(`${m[1]}-01-04`), (+m[2]! - 1) * 7) : null;
}
export function finBorne(type: TypeBorne, v: string): string | null {
    if (!v) return null;
    if (type === 'date') return v;
    if (type === 'month') {
        const [y, mo] = v.split('-').map(Number) as [number, number];
        return ajouterJours(mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`, -1);
    }
    const st = debutBorne('week', v);
    return st ? ajouterJours(st, 6) : null;
}

/** Logo Asana à côté du nom d'un SAMU repris d'Asana */
export const marqueAsana = (p: Deploiement) =>
    p.from_asana
        ? `<img src="/img/asana-logo.png" alt="Asana" title="Projet repris d'Asana" style="width:14px;height:14px;vertical-align:-2px;margin-left:5px;object-fit:contain;">`
        : '';
