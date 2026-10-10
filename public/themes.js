// Thèmes d'affichage saisonniers : configuration commune (Administration), désactivation par utilisateur.
(function () {
    'use strict';

    const ORDER = ['saintvalentin', 'paques', 'halloween', 'vacances', 'noel'];
    const OFF_KEY = 'gp_theme_off';
    const PALETTE_ICON = '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>';

    const META = {
        halloween: {
            label: 'Halloween', btn: '#e8590c', particle: 'fall', color: '#ff9a3c',
            badge: '<path d="M16 8c-8 0-13 5-13 11s5 9 13 9 13-3 13-9S24 8 16 8z" fill="#f57c00"/><path d="M16 8c-3.5 2-4.5 17 0 20M16 8c3.5 2 4.5 17 0 20" stroke="#bf5b00" fill="none" stroke-width="1.2"/><path d="M15 8c0-3 1-5 4-6" stroke="#2e7d32" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M9.5 15l3.5 2.2-3.5 2zM22.5 15l-3.5 2.2 3.5 2zM11 23.5q5 3.5 10 0l-1.5-2-2 1.5-1.5-2-1.5 2-2-1.5z" fill="#3b2300"/>',
            strip: '<path d="M2 0h16l-8 12z" fill="#ff7a18"/><path d="M22 0h16l-8 12z" fill="#7e3ff2"/>'
        },
        noel: {
            label: 'Noël', btn: '#b3262f', particle: 'fall', color: '#ffffff',
            badge: '<path d="M4 25Q7 7 20 5q-2 8 8 20z" fill="#d32f2f"/><rect x="3" y="22" width="26" height="6.5" rx="3.2" fill="#fff"/><circle cx="21" cy="5" r="3.4" fill="#fff"/>',
            strip: '<path d="M0 2Q10 11 20 2T40 2" stroke="#2e7d32" fill="none" stroke-width="1.6"/><circle cx="10" cy="8.5" r="2.7" fill="#ffd54f"/><circle cx="30" cy="8.5" r="2.7" fill="#ef5350"/>'
        },
        saintvalentin: {
            label: 'Saint-Valentin', btn: '#d81b60', particle: 'rise', color: '#ff8fb1',
            badge: '<path d="M16 28S3 19 3 11a6.5 6.5 0 0 1 13-1.5A6.5 6.5 0 0 1 29 11c0 8-13 17-13 17z" fill="#e91e63"/><path d="M8.5 10a4 4 0 0 1 4-2.6" stroke="#ff9ec0" stroke-width="2" fill="none" stroke-linecap="round"/>',
            strip: '<path d="M10 12S3 7 3 4a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-7 8-7 8z" fill="#ff8fb1"/><path d="M30 12S23 7 23 4a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-7 8-7 8z" fill="#f06292"/>'
        },
        paques: {
            label: 'Pâques', btn: '#8e6bb8', particle: 'fall', color: '#f6d365',
            badge: '<path d="M16 3C10 3 5 14 5 20a11 9 0 0 0 22 0C27 14 22 3 16 3z" fill="#ffd54f"/><path d="M6.5 16.5l3.4-2.6 3.4 2.6 3.4-2.6 3.4 2.6 3.4-2.6 2 1.5" stroke="#e91e63" stroke-width="2" fill="none"/><path d="M5.6 22l3.6-2.6 3.6 2.6 3.6-2.6 3.6 2.6 3.6-2.6 1.6 1.4" stroke="#42a5f5" stroke-width="2" fill="none"/>',
            strip: '<ellipse cx="10" cy="7" rx="4" ry="5.2" fill="#f6d365"/><ellipse cx="30" cy="7" rx="4" ry="5.2" fill="#f4a6c8"/>'
        },
        vacances: {
            label: 'Vacances', btn: '#e8890c', particle: 'rise', color: '#bfefff',
            badge: '<circle cx="16" cy="16" r="6.5" fill="#ffb300"/><g stroke="#ffb300" stroke-width="2.2" stroke-linecap="round"><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6.1 6.1l2.8 2.8M23.1 23.1l2.8 2.8M6.1 25.9l2.8-2.8M23.1 8.9l2.8-2.8"/></g>',
            strip: '<path d="M0 8Q5 2 10 8T20 8T30 8T40 8V14H0z" fill="#7fd6e8" opacity=".85"/>'
        }
    };

    const DEFAULT_CFG = { mode: 'off', forced: 'noel', intensity: 'sobre', themes: {} };
    let cfg = DEFAULT_CFG;
    let previewId = null;

    const pad = n => String(n).padStart(2, '0');

    function easter(year) {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }

    function inWindow(id, now) {
        const t = (cfg.themes || {})[id];
        if (!t || t.auto === false) return false;
        if (id === 'paques') {
            const e = easter(now.getFullYear());
            const from = new Date(e); from.setDate(e.getDate() - (t.before ?? 7));
            const to = new Date(e); to.setDate(e.getDate() + (t.after ?? 1));
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return today >= from && today <= to;
        }
        const cur = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        if (!t.start || !t.end) return false;
        return t.start <= t.end ? (cur >= t.start && cur <= t.end) : (cur >= t.start || cur <= t.end);
    }

    function computeTheme(now = new Date()) {
        if (cfg.mode === 'forced' && META[cfg.forced]) return { id: cfg.forced, reason: 'forcé' };
        if (cfg.mode === 'auto') {
            const id = ORDER.find(x => inWindow(x, now));
            if (id) return { id, reason: 'dates' };
        }
        return null;
    }

    const userOff = () => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } };

    function svg(inner, cls) {
        return `<svg viewBox="0 0 32 32" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${inner}</svg>`;
    }

    function clearDecor() {
        ['themeBadge', 'themeStrip', 'themeParticles'].forEach(id => document.getElementById(id)?.remove());
    }

    function buildParticles(id, level) {
        if (level !== 'anime' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const meta = META[id];
        const layer = document.createElement('div');
        layer.id = 'themeParticles';
        layer.className = meta.particle;
        for (let i = 0; i < 16; i++) {
            const sp = document.createElement('span');
            const size = 8 + Math.round(Math.random() * 8);
            sp.style.left = (Math.random() * 100) + '%';
            sp.style.width = sp.style.height = size + 'px';
            sp.style.animationDuration = (10 + Math.random() * 10) + 's';
            sp.style.animationDelay = (-Math.random() * 16) + 's';
            sp.style.setProperty('--th-drift', (Math.random() * 60 - 30) + 'px');
            sp.style.opacity = '.7';
            if (id === 'noel') sp.style.cssText += `;border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,.9);width:${size / 2}px;height:${size / 2}px`;
            else if (id === 'vacances') sp.style.cssText += `;border-radius:50%;border:1.5px solid ${meta.color};background:rgba(191,239,255,.18)`;
            else sp.innerHTML = svg(meta.badge);
            layer.appendChild(sp);
        }
        document.body.appendChild(layer);
    }

    function applyDecor(id) {
        clearDecor();
        const root = document.documentElement;
        if (!id) {
            root.removeAttribute('data-theme');
            root.removeAttribute('data-theme-level');
            return;
        }
        const level = cfg.intensity || 'sobre';
        root.setAttribute('data-theme', id);
        root.setAttribute('data-theme-level', level);
        const meta = META[id];
        const header = document.querySelector('.fixed-header');
        if (header) {
            const badge = document.createElement('div');
            badge.id = 'themeBadge';
            badge.innerHTML = svg(meta.badge);
            header.appendChild(badge);
            if (level === 'decore' || level === 'anime') {
                const strip = document.createElement('div');
                strip.id = 'themeStrip';
                const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="14" viewBox="0 0 40 14">${meta.strip}</svg>`;
                strip.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(tile)}")`;
                header.appendChild(strip);
            }
        }
        buildParticles(id, level);
    }

    function updateQuickButton(active) {
        let btn = document.getElementById('themeQuickBtn');
        const logged = document.getElementById('userInfo') && document.getElementById('userInfo').style.display !== 'none';
        if (!active || !logged) { if (btn) btn.style.display = 'none'; return; }
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'themeQuickBtn';
            btn.type = 'button';
            btn.onclick = () => Themes.setUserEnabled(userOff());
            document.body.appendChild(btn);
        }
        const meta = META[active.id];
        btn.style.display = 'flex';
        btn.style.setProperty('--th-btn', meta.btn);
        btn.classList.toggle('off', userOff());
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${PALETTE_ICON}</svg>`;
        btn.title = userOff() ? `Réactiver le thème ${meta.label}` : `Désactiver le thème ${meta.label}`;
    }

    function refresh() {
        const active = previewId ? { id: previewId, reason: 'aperçu' } : computeTheme();
        const show = active && (previewId || !userOff());
        const current = document.documentElement.getAttribute('data-theme');
        const level = document.documentElement.getAttribute('data-theme-level');
        const wanted = show ? active.id : null;
        if (current !== wanted || (wanted && level !== (cfg.intensity || 'sobre')) || (wanted && !document.getElementById('themeBadge') && document.querySelector('.fixed-header'))) {
            applyDecor(wanted);
        }
        updateQuickButton(previewId ? null : active);
        syncProfileUI(active);
    }

    function syncProfileUI(active) {
        const box = document.getElementById('themeUserSection');
        if (!box) return;
        box.style.display = active ? 'block' : 'none';
        if (!active) return;
        const chk = document.getElementById('themeUserToggle');
        if (chk) chk.checked = !userOff();
        const lbl = document.getElementById('themeUserLabel');
        if (lbl) lbl.textContent = META[active.id].label;
    }

    async function load() {
        try {
            const res = await fetch('/api/theme', { credentials: 'include' });
            if (res.ok) cfg = await res.json();
        } catch (e) { /* conserve la config précédente */ }
        refresh();
    }

    // ---------- Administration ----------
    const toISO = mmdd => `${new Date().getFullYear()}-${mmdd}`;

    function adminStatus() {
        const el = document.getElementById('themeAdminStatus');
        if (!el) return;
        const a = computeTheme();
        el.textContent = a ? `Thème affiché actuellement : ${META[a.id].label} (${a.reason})` : 'Aucun thème affiché actuellement.';
    }

    function adminRender() {
        const host = document.getElementById('themeAdminRows');
        if (!host) return;
        const rows = ['halloween', 'noel', 'saintvalentin', 'paques', 'vacances'].map(id => {
            const t = (cfg.themes || {})[id] || {};
            const meta = META[id];
            const win = id === 'paques'
                ? `Pâques −<input type="number" min="0" max="30" id="thEasterBefore" value="${t.before ?? 7}" style="width:60px;display:inline-block;"> j / +<input type="number" min="0" max="30" id="thEasterAfter" value="${t.after ?? 1}" style="width:60px;display:inline-block;"> j`
                : `du <input type="date" id="thStart_${id}" value="${toISO(t.start || '01-01')}" style="width:auto;display:inline-block;"> au <input type="date" id="thEnd_${id}" value="${toISO(t.end || '01-01')}" style="width:auto;display:inline-block;">`;
            return `<tr style="border-top:1px solid #e0e0e0;">
                <td style="padding:6px 8px;white-space:nowrap;"><span style="display:inline-block;width:22px;height:22px;vertical-align:middle;margin-right:6px;">${svg(meta.badge)}</span><strong>${meta.label}</strong></td>
                <td style="padding:6px 8px;text-align:center;"><input type="checkbox" id="thAuto_${id}" ${t.auto === false ? '' : 'checked'} style="width:auto;display:inline-block;"></td>
                <td style="padding:6px 8px;">${win}</td>
                <td style="padding:6px 8px;"><button type="button" onclick="Themes.adminPreview('${id}')" style="background:#6c757d;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">Aperçu</button></td>
            </tr>`;
        }).join('');
        host.innerHTML = rows;
        const forced = document.getElementById('themeForced');
        if (forced && !forced.options.length) {
            forced.innerHTML = ['halloween', 'noel', 'saintvalentin', 'paques', 'vacances'].map(id => `<option value="${id}">${META[id].label}</option>`).join('');
        }
        if (forced) forced.value = cfg.forced || 'noel';
        const r = document.querySelector(`input[name="themeMode"][value="${cfg.mode || 'off'}"]`);
        if (r) r.checked = true;
        const lvl = document.getElementById('themeIntensity');
        if (lvl) lvl.value = cfg.intensity || 'sobre';
        adminStatus();
    }

    function collect() {
        const out = { mode: 'off', forced: 'noel', intensity: 'sobre', themes: {} };
        out.mode = document.querySelector('input[name="themeMode"]:checked')?.value || 'off';
        out.forced = document.getElementById('themeForced').value;
        out.intensity = document.getElementById('themeIntensity').value;
        ['halloween', 'noel', 'saintvalentin', 'paques', 'vacances'].forEach(id => {
            const t = { auto: document.getElementById('thAuto_' + id).checked };
            if (id === 'paques') {
                t.before = Number(document.getElementById('thEasterBefore').value);
                t.after = Number(document.getElementById('thEasterAfter').value);
            } else {
                t.start = (document.getElementById('thStart_' + id).value || '').slice(5);
                t.end = (document.getElementById('thEnd_' + id).value || '').slice(5);
            }
            out.themes[id] = t;
        });
        return out;
    }

    const Themes = {
        setUserEnabled(enabled) {
            try { enabled ? localStorage.removeItem(OFF_KEY) : localStorage.setItem(OFF_KEY, '1'); } catch (e) { /* stockage indisponible */ }
            refresh();
        },
        syncProfileUI() { refresh(); },
        async adminLoad() { await load(); adminRender(); },
        adminPreview(id) {
            previewId = id;
            const prevLevel = cfg.intensity;
            cfg = { ...cfg, intensity: document.getElementById('themeIntensity').value };
            refresh();
            setTimeout(() => { previewId = null; cfg = { ...cfg, intensity: prevLevel }; refresh(); }, 6000);
        },
        async adminSave() {
            const msg = document.getElementById('themeAdminMsg');
            try {
                const res = await fetch('/api/theme', {
                    method: 'PUT', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(collect())
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || res.status);
                cfg = data;
                refresh();
                adminStatus();
                msg.style.color = '#2e7d32';
                msg.textContent = 'Enregistré.';
            } catch (e) {
                msg.style.color = '#c62828';
                msg.textContent = 'Erreur : ' + e.message;
            }
        },
        compute: computeTheme
    };
    window.Themes = Themes;

    document.addEventListener('DOMContentLoaded', () => {
        load();
        setInterval(refresh, 3000);
        setInterval(load, 5 * 60 * 1000);
    });
})();
