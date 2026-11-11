// Mode sombre appliqué avant l'affichage de la page (sans flash) : même préférence que l'application (gp_color_mode).
// Script classique servi tel quel sous /vue/ (dossier public de Vite), chargé dans <head> de index.html et mobile.html ;
// le reste du mode d'affichage est dans frontend/src/decor/mode-affichage.ts.
(function () {
    try {
        const m = localStorage.getItem('gp_color_mode') || 'light';
        const d = m === 'dark' || (m === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (d) document.documentElement.classList.add('dark-mode');
    } catch {
        /* stockage indisponible */
    }
})();
