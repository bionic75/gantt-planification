// Mode sombre appliqué avant l’affichage
// Extrait de mobile.html : script classique, portée globale partagée avec les autres scripts de la page
/* Mode sombre : même préférence que l'application (gp_color_mode) ; appliqué avant l'affichage pour éviter tout flash */
(function () {
    try {
        var m = localStorage.getItem('gp_color_mode') || 'light';
        var d = m === 'dark' || (m === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (d) document.documentElement.classList.add('dark-mode');
    } catch (e) {}
})();
