// Mise en page robuste : espace sous l'en-tête fixe calculé, détection du zoom navigateur, bouton « Ajuster l'affichage »
(function () {
    'use strict';

    const ICON = '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>';

    const style = document.createElement('style');
    style.textContent = `
        .header-spacer { height: var(--gp-header-h, 110px) !important; }
        #layoutResetBtn {
            position: fixed; top: 10px; right: 204px; width: 32px; height: 32px;
            border: none; border-radius: 50%; background: #fff; cursor: pointer; z-index: 1001; padding: 0;
            box-shadow: 0 2px 8px rgba(0,0,0,.2); display: none; align-items: center; justify-content: center;
            transition: transform .2s;
        }
        #layoutResetBtn:hover { transform: scale(1.1); }
        #layoutResetBtn svg { width: 18px; height: 18px; fill: none; stroke: #3949ab; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
        #layoutResetBtn .dot { position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: #ef6c00; border: 2px solid #fff; display: none; }
        #layoutResetBtn.zoomed .dot { display: block; }
        #layoutToast {
            position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 100000;
            background: #263238; color: #fff; padding: 12px 18px; border-radius: 8px; font-size: 13px;
            box-shadow: 0 6px 20px rgba(0,0,0,.3); max-width: 90vw; line-height: 1.5;
        }
        #layoutToast b { color: #ffd166; }
    `;
    document.head.appendChild(style);

    function updateSpacer() {
        const header = document.querySelector('.fixed-header');
        if (!header) return;
        const strip = document.getElementById('themeStrip');
        const h = Math.ceil(header.getBoundingClientRect().height) + (strip ? 14 : 0) + 6;
        document.documentElement.style.setProperty('--gp-header-h', h + 'px');
    }

    // Estimation du zoom navigateur : largeur de fenêtre (non zoomée) / largeur de contenu (zoomée)
    function browserZoom() {
        if (!window.outerWidth || !window.innerWidth) return 100;
        return Math.round((window.outerWidth / window.innerWidth) * 100);
    }
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    function toast(html) {
        document.getElementById('layoutToast')?.remove();
        const t = document.createElement('div');
        t.id = 'layoutToast';
        t.innerHTML = html;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 7000);
    }

    function updateButton() {
        const btn = document.getElementById('layoutResetBtn');
        if (!btn) return;
        const logged = document.getElementById('userInfo') && document.getElementById('userInfo').style.display !== 'none';
        btn.style.display = logged ? 'flex' : 'none';
        const z = browserZoom();
        const zoomed = Math.abs(z - 100) > 7;
        btn.classList.toggle('zoomed', zoomed);
        btn.title = zoomed
            ? `Ajuster l'affichage (zoom navigateur détecté : ~${z} %)`
            : "Ajuster l'affichage (remet la mise en page au propre)";
    }

    function resetLayout() {
        // Zoom du planning
        try { if (typeof window.resetZoomPlanning === 'function') window.resetZoomPlanning(); } catch (e) { /* sans effet */ }
        // Largeurs de colonnes figées par le redimensionnement manuel
        document.querySelectorAll('table').forEach(t => {
            if (!t._colResizable) return;
            t._colResizable = false;
            t.style.tableLayout = '';
            t.querySelectorAll('thead th').forEach(th => { th.style.width = ''; th.style.position = ''; });
            t.querySelectorAll('.col-resize-handle').forEach(h => h.remove());
            if (t.offsetWidth > 0 && typeof window.makeColResizable === 'function') window.makeColResizable(t);
        });
        updateSpacer();
        window.dispatchEvent(new Event('resize'));
        updateButton();

        const z = browserZoom();
        const key = isMac ? '⌘ + 0' : 'Ctrl + 0';
        if (Math.abs(z - 100) > 7) {
            toast(`Zoom du navigateur détecté : <b>~${z} %</b>.<br>Pour revenir à 100 %, appuie sur <b>${key}</b> (un site web ne peut pas le faire à ta place).`);
        } else {
            toast("Mise en page recalculée. Si l'affichage reste incorrect, recharge la page (F5).");
        }
    }

    window.GPLayout = { reset: resetLayout, update: updateSpacer, zoom: browserZoom };

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.createElement('button');
        btn.id = 'layoutResetBtn';
        btn.type = 'button';
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON}</svg><span class="dot"></span>`;
        btn.onclick = resetLayout;
        document.body.appendChild(btn);

        const header = document.querySelector('.fixed-header');
        if (header && 'ResizeObserver' in window) new ResizeObserver(updateSpacer).observe(header);
        window.addEventListener('resize', () => { updateSpacer(); updateButton(); });
        setInterval(() => { updateSpacer(); updateButton(); }, 2000);
        updateSpacer();
        updateButton();
    });
})();
