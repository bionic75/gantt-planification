// Fenêtres d'impression (planning, CRA, reporting…) ouvertes sans adresse et remplies par document.write : sans la
// feuille de style de l'application, les icônes SVG prendraient toute la place. Repris de public/js/app/core.js.

const STYLE_ICONES =
    '<style>svg.ui-emo,svg.app-ico{width:1.15em;height:1.15em;vertical-align:middle;margin:0 .15em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}</style>';

let installe = false;

/** Style des icônes ajouté à l'en-tête du document écrit dans une fenêtre ouverte sans adresse */
export function installerStyleImpression(): void {
    if (installe) return;
    installe = true;
    const ouvrir = window.open.bind(window);
    window.open = (url?: string | URL, cible?: string, options?: string) => {
        const w = ouvrir(url, cible, options);
        if (w && !url) {
            try {
                const d = w.document;
                const ecrire = d.write.bind(d);
                d.write = (...html: string[]) => ecrire(html.join('').replace(/<head>/i, `<head>${STYLE_ICONES}`));
            } catch {
                /* fenêtre inaccessible */
            }
        }
        return w;
    };
}
