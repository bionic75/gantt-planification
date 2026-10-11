// Mode d'affichage clair / sombre / automatique (préférence mémorisée dans le navigateur)
(function () {
    'use strict';
    const KEY = 'gp_color_mode';
    const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
    const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const get = () => { try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; } };
    const isDark = () => { const m = get(); return m === 'dark' || (m === 'auto' && mq.matches); };

    function updateButton() {
        const btn = document.getElementById('colorModeBtn');
        if (!btn) return;
        const dark = isDark();
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${dark ? SUN : MOON}</svg>`;
        btn.title = dark ? 'Passer en mode clair' : 'Passer en mode sombre';
    }

    function syncProfile() {
        const r = document.querySelector(`input[name="colorMode"][value="${get()}"]`);
        if (r) r.checked = true;
    }

    function apply() {
        document.documentElement.classList.toggle('dark-mode', isDark());
        updateButton();
        syncProfile();
    }

    function set(mode) {
        try { localStorage.setItem(KEY, mode); } catch (e) { /* stockage indisponible */ }
        apply();
    }

    // Barre d'outils flottante : se place à gauche des pastilles fixes de l'en-tête, quelle que soit l'application
    const PILLS = ['appSwitcher', 'backToPlanificationBtn', 'onlineUsersContainer', 'deplacementsOnlineUsersContainer',
                   'inactivityTimerDisplay', 'deplacementsTimerDisplay',
                   'affectationBackBtn', 'affectationOnlineUsersContainer', 'affectationTimerDisplay',
                   'analyseOnlineUsersContainer', 'analyseTimerDisplay'];
    function positionTools() {
        const bar = document.getElementById('gpTools');
        if (!bar) return;
        let minLeft = window.innerWidth - 10;
        PILLS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.top < 60 && r.left < minLeft) minLeft = r.left;
        });
        bar.style.right = Math.max(10, window.innerWidth - minLeft + 10) + 'px';
    }
    window.GPTools = {
        mount(btn, order) {
            let bar = document.getElementById('gpTools');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'gpTools';
                document.body.appendChild(bar);
            }
            btn.style.order = order;
            bar.appendChild(btn);
            positionTools();
        },
        position: positionTools
    };
    window.addEventListener('resize', positionTools);

    window.ColorMode = { get, set, toggle: () => set(isDark() ? 'light' : 'dark'), sync: syncProfile };

    apply();
    mq.addEventListener('change', apply);

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.createElement('button');
        btn.id = 'colorModeBtn';
        btn.type = 'button';
        btn.onclick = () => window.ColorMode.toggle();
        window.GPTools.mount(btn, 1);
        updateButton();
        setInterval(() => { updateButton(); positionTools(); }, 1000);
    });
})();
