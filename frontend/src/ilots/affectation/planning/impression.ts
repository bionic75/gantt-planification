// Aide à l'affectation › impression et exports du planning (mise en page WYSIWYG) : pages A4 / A3 ou zone du modèle
// PowerPoint, colonnes réparties ou tenant sur une page, lignes réparties d'après leur hauteur réelle ; HTML des exports
import type { ApercuModele, Deploiement, ElementDiapositive, ModeleExport } from '@/api/affectation';
import {
    construireColonnes,
    contenuCellule,
    deploiementsTries,
    definitionEtape,
    fondEtape,
    Trigrammes,
    type ContexteGrille,
    type TriGrille
} from './grille';
import { aujourdhui, esc, JALONS, jourFr, LIBELLE_ECHELLE, type Echelle } from './outils';
import { appliquerStyles, sansStyleEnLigne } from '@/outils/styles-en-ligne';

export const FORMATS_MM: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297] };
const mmPx = (mm: number) => (mm * 96) / 25.4;

/** Options de la fenêtre d'impression */
export interface OptionsImpression {
    title: string;
    from: string;
    to: string;
    zoom: Echelle;
    paper: 'A4' | 'A3';
    orient: 'landscape' | 'portrait';
    fit: 'split' | 'fit';
    keepMonths: boolean;
    legend: boolean;
    tpl: boolean;
    cover: boolean;
    end: boolean;
    samu: Set<number>;
    /** Rubriques masquées (étapes, « _tri ») */
    hidden: Set<string>;
}

export interface MiseEnPage {
    pages: string[];
    subtitles: string[];
    tpl: boolean;
    pxW: number;
    pxH: number;
    mmW: number;
    mmH: number;
    total: number;
    tooTight: boolean;
}

/** Rubriques de la légende imprimée, dans l'ordre */
const CLES_LEGENDE = [
    'cadrage',
    'deploiement',
    'gel',
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

/**
 * Construit toutes les pages (HTML statique) : colonnes réparties selon l'option choisie, lignes remplies page après page
 * d'après leur hauteur réelle, mesurée dans hote (élément de la page portant les styles de la grille)
 */
export function mettreEnPage(
    o: OptionsImpression,
    donnees: ContexteGrille,
    tri: TriGrille,
    retirees: Set<number>,
    modele: ModeleExport,
    hote: HTMLElement
): MiseEnPage {
    const [pw, ph] = FORMATS_MM[o.paper] ?? FORMATS_MM.A4!;
    // Modèle PowerPoint : la page est la zone libre de la diapositive (titre, logo et pied de page viennent du modèle)
    const T = o.tpl && modele.exists && modele.info ? modele.info.zone : null;
    const mmW = T ? T.wMm : o.orient === 'portrait' ? ph : pw;
    const mmH = T ? T.hMm : o.orient === 'portrait' ? pw : ph;
    const pxW = mmPx(mmW);
    const pxH = mmPx(mmH);
    const padX = mmPx(T ? 1 : 8);
    const padY = mmPx(T ? 1 : 7);
    const contentW = pxW - 2 * padX;
    const contentH = pxH - 2 * padY;
    const samW = o.zoom === 'day' || o.zoom === 'week' ? 110 : 140;
    const colWBase = { day: 20, week: 44, month: 68, quarter: 90, year: 120 }[o.zoom] || 60;
    const ctx: ContexteGrille = { ...donnees, masquees: new Set(o.hidden), impression: true };
    const base = construireColonnes(o.zoom, o.from, o.to, { print: true, noToday: true });
    const n = base.cols.length;
    // « Ne pas couper un mois » (échelle jour ou semaine, mode réparti) : les pages se terminent en fin de mois ; si un
    // mois est plus large qu'une page, les colonnes sont resserrées pour qu'il y tienne
    let groupes: { mk: string; start: number; len: number }[] | null = null;
    let colWUse = colWBase;
    if (o.keepMonths && o.fit !== 'fit' && (o.zoom === 'day' || o.zoom === 'week')) {
        groupes = [];
        base.cols.forEach((c, i) => {
            const mk = String(c.from).slice(0, 7);
            const dernier = groupes![groupes!.length - 1];
            if (!dernier || dernier.mk !== mk) groupes!.push({ mk, start: i, len: 0 });
            groupes![groupes!.length - 1]!.len++;
        });
        const plusLarge = Math.max(...groupes.map(g => g.len));
        if (plusLarge > Math.floor((contentW - samW) / colWBase)) colWUse = Math.max(6, (contentW - samW) / plusLarge);
    }
    const parPage = o.fit === 'fit' ? n : Math.max(1, Math.floor((contentW - samW) / colWUse));
    // « Tout sur une page » comprime ; en mode réparti, un planning plus étroit que la page est étalé sur toute la largeur
    const colW = o.fit === 'fit' || n <= parPage ? Math.max(1, (contentW - samW) / n) : colWUse;
    const fs = Math.max(5.5, Math.min(10, colW * 0.4));
    // Trigrammes des experts : lignes communes à toute la voie, calculées sur l'ensemble des colonnes imprimées
    const trig = new Trigrammes(base.cols, o.zoom, colW);
    const tranches: [number, number][] = [];
    if (groupes) {
        let from = 0;
        let count = 0;
        for (const g of groupes) {
            if (count && count + g.len > parPage) {
                tranches.push([from, from + count]);
                from += count;
                count = 0;
            }
            count += g.len;
        }
        if (count) tranches.push([from, from + count]);
    } else for (let a = 0; a < n; a += parPage) tranches.push([a, Math.min(n, a + parPage)]);
    const pagesColonnes = tranches.map(([a, b]) => {
        const tranche = base.cols.slice(a, b);
        return construireColonnes(o.zoom, tranche[0]!.from, tranche[tranche.length - 1]!.to, {
            print: true,
            noToday: true
        });
    });
    const deploiements = deploiementsTries(ctx, tri, retirees, true).filter(p => o.samu.has(p.id));
    const tableau = (sub: ReturnType<typeof construireColonnes>, liste: Deploiement[]) => {
        const w = samW + sub.cols.length * colW;
        const tete = sub.rows
            .map((r, i) => `<tr>${i === 0 ? `<th class="corner" rowspan="${sub.rows.length}">SAMU</th>` : ''}${r}</tr>`)
            .join('');
        const corps = liste
            .map(
                pr =>
                    `<tr><th class="sam"><div class="n">${esc(pr.samu_name)}</div><div class="c">${esc(pr.chef_projet_nom || 'Chef de projet non défini')}</div></th>${sub.cols.map(c => `<td class="${c.we ? 'we' : ''}">${contenuCellule(ctx, trig, pr, c)}</td>`).join('')}</tr>`
            )
            .join('');
        return `<table class="aff-plan-table pt" style="--pfs:${fs.toFixed(1)}px;--samw:${samW}px;width:${w.toFixed(1)}px;"><colgroup><col style="width:${samW}px">${sub.cols.map(() => `<col style="width:${colW.toFixed(2)}px">`).join('')}</colgroup><thead>${tete}</thead><tbody>${corps}</tbody></table>`;
    };
    const cles = CLES_LEGENDE.filter(k => !o.hidden.has(k));
    const legende = o.legend
        ? `<div class="pg-leg">${cles.map(k => `<span><i class="${k === 'mise_en_service' || k === 'mise_en_production' || JALONS.includes(k) ? 'dot' : ''}" style="${fondEtape(ctx, k)}"></i>${esc(definitionEtape(ctx, k).label)}</span>`).join('')}</div>`
        : '';
    // Mesure : hauteur de chaque ligne, de l'en-tête de tableau et des blocs fixes de la page
    const mesure = document.createElement('div');
    mesure.className = 'aff-print-root';
    mesure.style.cssText = `position:absolute;left:-20000px;top:0;width:${contentW}px;`;
    // Styles réappliqués avant la mesure (attributs style refusés par la politique de contenu)
    mesure.innerHTML = sansStyleEnLigne(
        T
            ? `${legende}${deploiements.length ? tableau(pagesColonnes[0]!, deploiements) : ''}`
            : `<div class="pg-head"><b>${esc(o.title)}</b><span>x</span></div>${legende}${deploiements.length ? tableau(pagesColonnes[0]!, deploiements) : ''}<div class="pg-foot"><span>x</span></div>`
    );
    hote.appendChild(mesure);
    appliquerStyles(mesure);
    const hauteurs = [...mesure.querySelectorAll('tbody tr')].map(tr => tr.getBoundingClientRect().height);
    const hauteur = (sel: string) => mesure.querySelector(sel)?.getBoundingClientRect().height ?? 0;
    const headH = hauteur('thead');
    const legH = mesure.querySelector('.pg-leg') ? hauteur('.pg-leg') + 5 : 0;
    const fixedH = T ? legH : hauteur('.pg-head') + 5 + legH + hauteur('.pg-foot') + 6;
    mesure.remove();
    const disponible = contentH - fixedH - headH - 4;
    const pagesLignes: Deploiement[][] = [];
    if (!deploiements.length) pagesLignes.push([]);
    else {
        let cur: Deploiement[] = [];
        let used = 0;
        deploiements.forEach((pr, i) => {
            const h = hauteurs[i] ?? 0;
            if (cur.length && used + h > disponible) {
                pagesLignes.push(cur);
                cur = [];
                used = 0;
            }
            cur.push(pr);
            used += h;
        });
        if (cur.length) pagesLignes.push(cur);
    }
    const total = pagesColonnes.length * pagesLignes.length;
    const sousTitre = `${jourFr(o.from)} → ${jourFr(o.to)} · échelle : ${LIBELLE_ECHELLE[o.zoom]} · édité le ${jourFr(aujourdhui())}`;
    const pages: string[] = [];
    const subtitles: string[] = [];
    const aucun = '<p style="color:#778;font-size:11px;">Aucun SAMU sélectionné.</p>';
    pagesColonnes.forEach((cp, ci) =>
        pagesLignes.forEach((rp, ri) => {
            const k = pages.length + 1;
            const partie =
                (pagesColonnes.length > 1 ? ` · colonnes ${ci + 1}/${pagesColonnes.length}` : '') +
                (pagesLignes.length > 1 ? ` · SAMU ${ri + 1}/${pagesLignes.length}` : '');
            if (T) {
                subtitles.push(`${jourFr(o.from)} → ${jourFr(o.to)}`);
                pages.push(
                    `<div class="pg tplpg" style="width:${pxW.toFixed(2)}px;height:${pxH.toFixed(2)}px;padding:${padY.toFixed(1)}px ${padX.toFixed(1)}px;background:transparent;justify-content:flex-start;align-items:flex-start;">${legende}${rp.length ? tableau(cp, rp) : aucun}</div>`
                );
                return;
            }
            pages.push(
                `<div class="pg" style="width:${pxW.toFixed(2)}px;height:${pxH.toFixed(2)}px;padding:${padY.toFixed(1)}px ${padX.toFixed(1)}px;"><div class="pg-head"><b>${esc(o.title)}</b><span>${esc(sousTitre)}</span></div>${legende}${rp.length ? tableau(cp, rp) : aucun}<div class="pg-foot"><span>${esc(partie.replace(/^ · /, ''))}</span><span>Page ${k} / ${total}</span></div></div>`
            );
        })
    );
    return { pages, subtitles, tpl: !!T, pxW, pxH, mmW, mmH, total, tooTight: o.fit === 'fit' && colW < 5 };
}

/** Diapositive du modèle (page de garde, planning, page de fin) avec ses textes, logos et pied de page */
function diapositive(
    apercu: ApercuModele,
    items: ElementDiapositive[],
    o: OptionsImpression,
    lay: MiseEnPage,
    n: number,
    indexPlanning: number | null
) {
    const W = apercu.W / 9525;
    const H = apercu.H / 9525;
    const px = (v: number) => `${(v / 9525).toFixed(1)}px`;
    const date = jourFr(aujourdhui()).replace(/\//g, '-');
    const alignements: Record<string, string> = { l: 'left', ctr: 'center', r: 'right', just: 'left' };
    const parts = items
        .map(it => {
            if (it.t === 'img')
                return `<img src="${esc(it.src)}" alt="" style="position:absolute;left:${px(it.x)};top:${px(it.y)};width:${px(it.w)};height:${px(it.h)};">`;
            if (it.t === 'rect')
                return `<div style="position:absolute;left:${px(it.x)};top:${px(it.y)};width:${px(it.w)};height:${px(it.h)};background:${esc(it.color)};"></div>`;
            let texte = String(it.text || '')
                .replace(/JJ-MM-AAAA/g, date)
                .replace(/\{n\}/g, String(n));
            if (it.role === 'title' || it.role === 'ctrTitle') texte = o.title;
            if (it.role === 'subtitle13') texte = (indexPlanning != null && lay.subtitles[indexPlanning]) || '';
            return `<div style="position:absolute;left:${px(it.x)};top:${px(it.y)};width:${px(it.w)};height:${px(it.h)};display:flex;align-items:${it.anchor === 'ctr' ? 'center' : it.anchor === 'b' ? 'flex-end' : 'flex-start'};box-sizing:border-box;padding:4px 8px;overflow:visible;"><div style="width:100%;font-size:${((((it.sz ?? 1800) / 100) * 96) / 72).toFixed(1)}px;line-height:1.15;font-weight:${it.b ? 700 : 400};color:${esc(it.color)};font-family:${it.font ? `'${esc(it.font)}',` : ''}Arial,sans-serif;text-align:${alignements[it.algn ?? ''] || 'left'};white-space:pre-wrap;">${esc(texte)}</div></div>`;
        })
        .join('');
    const z = apercu.zone;
    const page =
        indexPlanning != null
            ? `<div style="position:absolute;left:${px(z.x)};top:${px(z.y)};width:${px(z.w)};height:${px(z.h)};">${lay.pages[indexPlanning]}</div>`
            : '';
    return `<div style="position:relative;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px;background:#fff;overflow:hidden;">${parts}${page}</div>`;
}

/** Aperçu fidèle au modèle : diapositives (page de garde, planning, page de fin) ; HTML et texte d'information */
export function apercuAvecModele(apercu: ApercuModele, lay: MiseEnPage, o: OptionsImpression, largeur: number) {
    const W = apercu.W / 9525;
    const H = apercu.H / 9525;
    const cadres: string[] = [];
    const garde = apercu.slides.find(x => x.kind === 'cover');
    const planning = apercu.slides.find(x => x.kind === 'plan');
    const fin = apercu.slides.find(x => x.kind === 'end');
    if (garde && o.cover) cadres.push(diapositive(apercu, garde.items, o, lay, 1, null));
    lay.pages.forEach((_, i) => cadres.push(diapositive(apercu, planning?.items ?? [], o, lay, cadres.length + 1, i)));
    if (fin && o.end) cadres.push(diapositive(apercu, fin.items, o, lay, cadres.length + 1, null));
    const k = Math.min(1, (largeur - 30) / W);
    return {
        html: cadres
            .map(
                f =>
                    `<div class="pw" style="background:#fff;width:${(W * k).toFixed(1)}px;height:${(H * k).toFixed(1)}px;"><div style="transform:scale(${k.toFixed(4)});transform-origin:0 0;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px;">${f}</div></div>`
            )
            .join(''),
        info: `[Modèle PowerPoint] ${cadres.length} diapositive(s) dont ${lay.total} de planning · aperçu simplifié : les images au format EMF du modèle ne s'affichent pas ici mais figurent dans le fichier`
    };
}

/** Aperçu des pages, réduites à la largeur disponible ; HTML et texte d'information */
export function apercuPages(lay: MiseEnPage, largeur: number) {
    const k = Math.min(1, (largeur - 30) / lay.pxW);
    return {
        html: lay.pages
            .map(
                pg =>
                    `<div class="pw" style="background:#fff;width:${(lay.pxW * k).toFixed(1)}px;height:${(lay.pxH * k).toFixed(1)}px;"><div style="transform:scale(${k.toFixed(4)});transform-origin:0 0;width:${lay.pxW.toFixed(1)}px;height:${lay.pxH.toFixed(1)}px;">${pg}</div></div>`
            )
            .join(''),
        info:
            (lay.tpl ? '[Modèle PowerPoint] zone du planning · ' : '') +
            `${lay.total} page(s) · ${lay.mmW} × ${lay.mmH} mm` +
            (lay.tooTight
                ? ' — ⚠ échelle trop fine pour tenir sur une page : choisissez « Répartir sur plusieurs pages » ou une échelle plus large'
                : '')
    };
}

/** Document HTML des pages (impression du navigateur, exports PDF et PowerPoint par le serveur) */
export function htmlExport(lay: MiseEnPage, css: string) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planning des déploiements</title><style>${css}@page{size:${lay.mmW}mm ${lay.mmH}mm;margin:0}html,body{margin:0;padding:0;background:#fff}.aff-print-root .pg{height:${(lay.pxH - 1.5).toFixed(2)}px !important}</style></head><body><div id="affectationContainer" class="aff-print-root" style="display:block;padding:0;background:#fff;">${lay.pages.join('')}</div></body></html>`;
}

/**
 * Nom de fichier d'après le modèle : jetons {AAAAMMJJ} {HHMM} {AAAA} {MM} {JJ} {HH} {MN} {DEBUT} {FIN} {ECHELLE} {TITRE}
 */
export function nomFichierExport(
    modele: string | undefined,
    o: { from?: string; to?: string; zoom?: Echelle; title?: string } | null,
    d = new Date()
) {
    const z = (n: number) => String(n).padStart(2, '0');
    const ymd = (iso?: string) => String(iso || '').replace(/-/g, '');
    const slug = (v?: string) =>
        String(v || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^\w]+/g, '_')
            .replace(/^_+|_+$/g, '');
    const valeurs: Record<string, string> = {
        AAAAMMJJ: `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}`,
        HHMM: `${z(d.getHours())}${z(d.getMinutes())}`,
        AAAA: String(d.getFullYear()),
        MM: z(d.getMonth() + 1),
        JJ: z(d.getDate()),
        HH: z(d.getHours()),
        MN: z(d.getMinutes()),
        DEBUT: ymd(o?.from),
        FIN: ymd(o?.to),
        ECHELLE: (o?.zoom && LIBELLE_ECHELLE[o.zoom]) || '',
        TITRE: slug(o?.title)
    };
    const nom = String(modele || NOM_EXPORT_DEFAUT)
        .replace(/\{([A-Z]+)\}/g, (m, k: string) => (k in valeurs ? valeurs[k]! : m))
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/\.+$/, '')
        .slice(0, 150);
    return nom || 'planning-deploiements';
}

export const NOM_EXPORT_DEFAUT = 'SI-SAMU_Planning_Déploiement_{AAAAMMJJ}_{HHMM}';
