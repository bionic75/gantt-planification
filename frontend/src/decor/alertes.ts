// Page principale : les ⚠️ affichés sont remplacés par une icône SVG colorée selon la gravité suggérée par la couleur du
// texte : jaune (info), orange (anomalie), rouge (bloquant). Repris de public/js/app/warning-icons.js (lot 6.5).

const CORPS =
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>';
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE', 'INPUT', 'SELECT']);
const RE = /⚠️?/g;

/** Couleur de l'icône d'après la teinte du texte */
export function couleurGravite(rgb: string): string {
    const m = rgb.match(/\d+/g);
    if (!m) return '#f9a825';
    const [r, g, b] = m.map(Number) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 150 || (max - min) / max < 0.45) return '#f9a825';
    let teinte: number;
    if (max === r) teinte = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) teinte = 60 * ((b - r) / (max - min) + 2);
    else teinte = 60 * ((r - g) / (max - min) + 4);
    if (teinte < 0) teinte += 360;
    if (teinte < 12 || teinte > 340) return '#d32f2f';
    if (teinte < 34) return '#ef6c00';
    return '#f9a825';
}

function icone(couleur: string): ChildNode | null {
    const span = document.createElement('span');
    span.className = 'alert-ico-wrap';
    span.innerHTML = `<svg class="alert-ico" viewBox="0 0 24 24" aria-hidden="true" style="stroke:${couleur};fill:${couleur}33;">${CORPS}</svg>`;
    return span.firstChild;
}

function convertir(noeud: Text) {
    const parent = noeud.parentNode;
    if (!parent || SKIP.has(parent.nodeName) || !noeud.nodeValue || noeud.nodeValue.indexOf('⚠') === -1) return;
    const el = parent.nodeType === 1 ? (parent as Element) : (parent.parentElement ?? document.body);
    const couleur = couleurGravite(getComputedStyle(el).color);
    const fragment = document.createDocumentFragment();
    const parts = noeud.nodeValue.split(RE);
    parts.forEach((texte, i) => {
        if (texte) fragment.appendChild(document.createTextNode(texte));
        if (i < parts.length - 1) {
            const ic = icone(couleur);
            if (ic) fragment.appendChild(ic);
        }
    });
    parent.replaceChild(fragment, noeud);
}

function parcourir(racine: Node) {
    if (racine.nodeType === 3) {
        convertir(racine as Text);
        return;
    }
    if (racine.nodeType !== 1 || SKIP.has(racine.nodeName)) return;
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
        acceptNode: n =>
            n.nodeValue && n.nodeValue.indexOf('⚠') !== -1 && !SKIP.has(n.parentNode?.nodeName ?? '')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT
    });
    const noeuds: Text[] = [];
    while (marcheur.nextNode()) noeuds.push(marcheur.currentNode as Text);
    noeuds.forEach(convertir);
}

let installe = false;

export function installerIconesAlerte(): void {
    if (installe) return;
    installe = true;
    let enAttente = new Set<Node>();
    let prevu = false;
    const traiter = () => {
        prevu = false;
        const lot = enAttente;
        enAttente = new Set();
        lot.forEach(n => {
            if (n.isConnected) parcourir(n);
        });
    };
    new MutationObserver(mutations => {
        for (const mu of mutations) {
            if (mu.type === 'characterData') enAttente.add(mu.target);
            else mu.addedNodes.forEach(n => enAttente.add(n));
        }
        if (!prevu && enAttente.size) {
            prevu = true;
            setTimeout(traiter, 30);
        }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    parcourir(document.body);
}
