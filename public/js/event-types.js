// ═══════════════════════════════════════════════════════════════════════════
// Types d'événements : icônes et affichage des événements typés (planning, carte, calendriers, aide à l'affectation).
// Paramétrage des types et reprise des données (Administration), formulaire de l'onglet Événements : îlots Vue.
// Chargé après le script principal (defer) : partage ses variables et fonctions globales.
// ═══════════════════════════════════════════════════════════════════════════

// ── Banque d'icônes (en plus de celles du script principal) ─────────────────
Object.assign(UI_ICONS, {
    flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    headset:
        '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="4" height="6" rx="1.5"/><rect x="18" y="14" width="4" height="6" rx="1.5"/><path d="M20 20a4 4 0 0 1-4 2h-3"/>',
    truck: '<path d="M1 6h13v10H1z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.1 9.5l6.1-.9z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    lightbulb:
        '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/>',
    server: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    coffee: '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2M7 3v2M11 3v2"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>'
});

// ── Affichage des événements typés ──────────────────────────────────────────
const evtEsc = v =>
    String(v == null ? '' : v).replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
// Libellé affiché (planning, carte) : court du type, à défaut long ; « Autre(s) » ou sans type : libellé de l'événement
const evtHasType = e => !!(e && e.type_long && !e.type_other);
const evtShown = e => (evtHasType(e) ? e.type_short || e.type_long : (e && e.label) || '');
const evtIconFor = (e, size, style) =>
    evtHasType(e) && e.type_icon ? uiIcon(e.type_icon, size || 13, 'margin-right:5px;' + (style || '')) : '';
// Info-bulle d'un événement du planning (config issue de /special-dates)
function evtTip(cfg, locCourt, fallback) {
    if (!cfg || !cfg.typeLong) return fallback;
    return (
        (locCourt ? locCourt + ' | ' : '') +
        cfg.typeLong +
        (cfg.label && cfg.label !== cfg.typeLong ? ' — ' + cfg.label : '')
    );
}
const evtChip = (t, small) =>
    t
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:${small ? '1px 6px' : '3px 10px'};border-radius:10px;font-size:${small ? 10 : 11}px;font-weight:bold;background:${t.bg_color};color:${t.text_color};border:2px solid ${t.border_color};white-space:nowrap;">${uiIcon(t.icon, small ? 11 : 13, 'margin:0;')}${evtEsc(t.label_short || t.label_long)}</span>`
        : '<span style="color:#999;font-size:11px;font-style:italic;">Type non défini</span>';
