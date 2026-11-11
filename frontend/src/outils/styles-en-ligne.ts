// Styles en ligne sans 'unsafe-inline' (lot 6.6) : la politique de sécurité du contenu bloque les attributs style="…"
// et les blocs <style> du HTML inséré dans la page (v-html, innerHTML, document.write), mais pas les styles posés en
// JavaScript (CSSOM). Le HTML construit en chaîne (grille et impressions de l'aide à l'affectation, bulles des cartes,
// HTML du serveur) garde donc ses styles sous la forme data-style="…", réappliqués après l'insertion ; les blocs
// <style> d'un document écrit (fenêtres d'impression) deviennent une feuille construite (adoptedStyleSheets).
import type { Directive } from 'vue';

/** Attribut style d'une balise (un par balise) */
const ATTRIBUT_STYLE = /(<[a-zA-Z][^<>]*?\s)style(\s*=)/g;
/** Bloc <style> d'un document */
const BLOC_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/** Icônes SVG des fenêtres d'impression : sans la feuille de l'application, elles prendraient toute la place */
const STYLE_ICONES =
    'svg.ui-emo,svg.app-ico{width:1.15em;height:1.15em;vertical-align:middle;margin:0 .15em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}';

/** HTML dont les attributs style="…" deviennent data-style="…" (à réappliquer par appliquerStyles) */
export function sansStyleEnLigne(html: string): string {
    return html.replace(ATTRIBUT_STYLE, '$1data-style$2');
}

/** Styles data-style="…" d'un élément et de ses descendants posés en JavaScript, autorisés par la CSP */
export function appliquerStyles(racine: ParentNode | null | undefined): void {
    if (!racine) return;
    const elements: Element[] = [...racine.querySelectorAll('[data-style]')];
    if (racine instanceof Element && racine.hasAttribute('data-style')) elements.unshift(racine);
    for (const el of elements) {
        const style = (el as HTMLElement | SVGElement).style;
        if (style) style.cssText = el.getAttribute('data-style') ?? '';
        el.removeAttribute('data-style');
    }
}

/**
 * Directive des éléments qui reçoivent du HTML construit en chaîne (v-html="sansStyleEnLigne(html)") : styles
 * réappliqués à chaque mise à jour
 */
export const vStylesEnLigne: Directive<HTMLElement> = {
    mounted: el => appliquerStyles(el),
    updated: el => appliquerStyles(el)
};

/** Feuille construite dans le document (adoptedStyleSheets), autorisée par la CSP */
export function adopterFeuille(doc: Document, css: string): void {
    const vue = doc.defaultView as (Window & typeof globalThis) | null;
    if (!vue?.CSSStyleSheet || !('adoptedStyleSheets' in doc)) return;
    try {
        const feuille = new vue.CSSStyleSheet();
        feuille.replaceSync(css);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, feuille];
    } catch {
        /* navigateur sans feuilles construites */
    }
}

/** Feuille de la page modifiée par le code (zoom, colonnes masquées) : feuille construite, à la place d'un <style> */
export interface FeuilleConstruite {
    /** Règles remplacées */
    remplacer(css: string): void;
    /** Règle ajoutée ; renvoie son rang */
    ajouter(regle: string): number;
    /** Règles en place (lecture, suppression) */
    readonly regles: CSSRuleList | null;
    supprimer(rang: number): void;
}

export function feuilleConstruite(doc: Document = document): FeuilleConstruite {
    let feuille: CSSStyleSheet | null = null;
    const obtenir = () => {
        if (feuille) return feuille;
        try {
            feuille = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet();
            doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, feuille];
        } catch {
            feuille = null;
        }
        return feuille;
    };
    return {
        remplacer: css => obtenir()?.replaceSync(css),
        ajouter: regle => {
            const f = obtenir();
            return f ? f.insertRule(regle, f.cssRules.length) : -1;
        },
        get regles() {
            return obtenir()?.cssRules ?? null;
        },
        supprimer: rang => obtenir()?.deleteRule(rang)
    };
}

/**
 * Document complet écrit dans une fenêtre ou un cadre d'impression : blocs <style> repris en feuille construite (avec
 * le style des icônes), attributs style="…" réappliqués en JavaScript
 */
export function ecrireDocument(doc: Document, html: string): void {
    const feuilles: string[] = [];
    const sansBlocs = html.replace(BLOC_STYLE, (_tout, css: string) => {
        feuilles.push(css);
        return '';
    });
    doc.open();
    doc.write(sansStyleEnLigne(sansBlocs));
    doc.close();
    adopterFeuille(doc, `${feuilles.join('\n')}\n${STYLE_ICONES}`);
    appliquerStyles(doc);
}
