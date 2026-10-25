// warning-icons
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

// Remplace les ⚠️ affichés dans la page par une icône SVG : jaune (info), orange (anomalie), rouge (bloquant)
(function () {
    const BODY =
        '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>';
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE', 'INPUT', 'SELECT']);
    const RE = /⚠️?/g;

    function severityColor(el) {
        const m = getComputedStyle(el).color.match(/\d+/g);
        if (!m) return '#f9a825';
        const [r, g, b] = m.map(Number);
        const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
        if (max < 150 || (max - min) / max < 0.45) return '#f9a825';
        let hue = 0;
        if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
        else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
        else hue = 60 * ((r - g) / (max - min) + 4);
        if (hue < 0) hue += 360;
        if (hue < 12 || hue > 340) return '#d32f2f';
        if (hue < 34) return '#ef6c00';
        return '#f9a825';
    }

    function makeIcon(color) {
        const span = document.createElement('span');
        span.className = 'alert-ico-wrap';
        span.innerHTML =
            '<svg class="alert-ico" viewBox="0 0 24 24" aria-hidden="true" style="stroke:' +
            color +
            ';fill:' +
            color +
            '33;">' +
            BODY +
            '</svg>';
        return span.firstChild;
    }

    function convertText(node) {
        const parent = node.parentNode;
        if (!parent || SKIP.has(parent.nodeName) || !node.nodeValue || node.nodeValue.indexOf('⚠') === -1) return;
        const color = severityColor(parent.nodeType === 1 ? parent : parent.parentElement || document.body);
        const frag = document.createDocumentFragment();
        const parts = node.nodeValue.split(RE);
        parts.forEach((txt, i) => {
            if (txt) frag.appendChild(document.createTextNode(txt));
            if (i < parts.length - 1) frag.appendChild(makeIcon(color));
        });
        parent.replaceChild(frag, node);
    }

    function scan(root) {
        if (root.nodeType === 3) {
            convertText(root);
            return;
        }
        if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: n =>
                n.nodeValue && n.nodeValue.indexOf('⚠') !== -1 && !SKIP.has(n.parentNode.nodeName)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(convertText);
    }

    let pending = new Set(),
        scheduled = false;
    function flush() {
        scheduled = false;
        const batch = pending;
        pending = new Set();
        batch.forEach(n => {
            if (n.isConnected) scan(n);
        });
    }
    new MutationObserver(muts => {
        for (const mu of muts) {
            if (mu.type === 'characterData') pending.add(mu.target);
            else mu.addedNodes.forEach(n => pending.add(n));
        }
        if (!scheduled && pending.size) {
            scheduled = true;
            setTimeout(flush, 30);
        }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan(document.body);
})();
