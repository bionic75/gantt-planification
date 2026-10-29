// ═══════════════════════════════════════════════════════════════════════════
// Types d'événements : paramétrage (Administration), reprise des données ; formulaire de l'onglet Événements : îlot Vue
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
const EVT_ICON_BANK = [
    ['graduation', 'Formation'],
    ['presentation', 'Présentation / congrès'],
    ['book', 'Documentation'],
    ['lightbulb', 'Idée / atelier'],
    ['video', 'Visioconférence'],
    ['mic', 'Intervention'],
    ['power', 'Mise en service'],
    ['rocket', 'Lancement'],
    ['flag', 'Jalon'],
    ['target', 'Objectif'],
    ['star', 'Temps fort'],
    ['check', 'Validation'],
    ['clipboardCheck', 'Recette / VFT'],
    ['listChecks', 'Vérifications'],
    ['clipboard', 'Compte rendu'],
    ['shield', 'Sécurité'],
    ['key', 'Accès'],
    ['flask', 'Tests'],
    ['lifebuoy', 'Accompagnement / support'],
    ['headset', 'Assistance'],
    ['phone', 'Téléphonie'],
    ['smartphone', 'Mobile'],
    ['wifi', 'Réseau'],
    ['server', 'Infrastructure'],
    ['database', 'Données'],
    ['cog', 'Paramétrage'],
    ['pin', 'Visite terrain'],
    ['building', 'Site / établissement'],
    ['eye', 'Observation'],
    ['briefcase', 'Métier'],
    ['map', 'Déplacement'],
    ['car', 'Voiture'],
    ['truck', 'Livraison'],
    ['plane', 'Avion'],
    ['siren', 'Urgence / SAMU'],
    ['tower', 'Centre de régulation'],
    ['wrench', 'Intervention technique'],
    ['camera', 'Photos'],
    ['users', 'Équipe'],
    ['user', 'Personne'],
    ['hand', 'Accueil'],
    ['heart', 'Convivialité'],
    ['calendar', 'Date'],
    ['bell', 'Rappel'],
    ['megaphone', 'Communication'],
    ['mail', 'Courrier'],
    ['chart', 'Suivi'],
    ['doc', 'Document'],
    ['hourglass', 'Attente'],
    ['timer', 'Délai'],
    ['crown', 'Direction'],
    ['umbrella', 'Congés'],
    ['coffee', 'Pause'],
    ['palette', 'Divers'],
    ['tag', 'Autre']
];

// ── Gabarits de couleurs (fond – texte – bordure) ───────────────────────────
const EVT_COLOR_TEMPLATES = [
    { n: 'Jaune · texte bleu', bg: '#ffea00', text: '#0008ff', border: '#000000' },
    { n: 'Jaune · texte rouge', bg: '#ffea00', text: '#d20906', border: '#000000' },
    { n: 'Jaune · texte magenta', bg: '#ffea00', text: '#c2059a', border: '#000000' },
    { n: 'Jaune · texte noir', bg: '#ffeb3b', text: '#000000', border: '#000000' },
    { n: 'Bleu vif · texte blanc', bg: '#0011ff', text: '#ffffff', border: '#000000' },
    { n: 'Bleu · texte blanc', bg: '#0277bd', text: '#ffffff', border: '#01579b' },
    { n: 'Bleu nuit · texte blanc', bg: '#1565c0', text: '#ffffff', border: '#0d47a1' },
    { n: 'Violet · texte blanc', bg: '#7b1fa2', text: '#ffffff', border: '#4a0072' },
    { n: 'Rose · texte blanc', bg: '#ad1457', text: '#ffffff', border: '#78002e' },
    { n: 'Rouge · texte blanc', bg: '#c62828', text: '#ffffff', border: '#8e0000' },
    { n: 'Orange foncé · texte blanc', bg: '#e65100', text: '#ffffff', border: '#bf360c' },
    { n: 'Orange clair · texte noir', bg: '#ffb74d', text: '#000000', border: '#e65100' },
    { n: 'Vert foncé · texte blanc', bg: '#2e7d32', text: '#ffffff', border: '#1b5e20' },
    { n: 'Vert clair · texte vert', bg: '#dff0d8', text: '#427645', border: '#000000' },
    { n: 'Turquoise · texte blanc', bg: '#00897b', text: '#ffffff', border: '#004d40' },
    { n: 'Gris bleu · texte blanc', bg: '#546e7a', text: '#ffffff', border: '#263238' },
    { n: 'Gris clair · texte sombre', bg: '#eceff1', text: '#263238', border: '#90a4ae' },
    { n: 'Blanc · bordure grise', bg: '#ffffff', text: '#333333', border: '#9e9e9e' }
];

// ── Types : chargement et utilitaires ───────────────────────────────────────
let evtTypes = [],
    evtTypesPromise = null;
function evtLoadTypes(force) {
    if (force || !evtTypesPromise) {
        evtTypesPromise = fetch(`${API_URL}/event-types`, { credentials: 'include' })
            .then(r => {
                if (!r.ok) {
                    evtTypesPromise = null;
                    return { types: evtTypes };
                }
                return r.json();
            })
            .then(d => {
                evtTypes = d.types || [];
                return evtTypes;
            })
            .catch(() => {
                evtTypesPromise = null;
                return evtTypes;
            });
    }
    return evtTypesPromise;
}
const evtTypeById = id => evtTypes.find(t => t.id === Number(id));
const evtEsc = v =>
    String(v == null ? '' : v).replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const evtFd = iso => (iso ? String(iso).split('-').reverse().join('/') : '');
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

// ── Administration : paramétrage des types ──────────────────────────────────
const evtAdm = { editId: null, icon: 'tag', pickerOpen: false, tplOpen: false, tpl: null };
async function evtAdminOpen() {
    await evtLoadTypes(true);
    evtRenderTypesAdmin();
}
function evtTplIndexOf(t) {
    return EVT_COLOR_TEMPLATES.findIndex(x => x.bg === t.bg && x.text === t.text && x.border === t.border);
}
function evtTypesTableHtml() {
    const edit = (t, f) =>
        t.is_other
            ? ''
            : ` onclick="evtInlineEdit(this,${t.id},'${f}')" title="Cliquer pour modifier" style="cursor:text;"`;
    const rows = evtTypes
        .map(
            t => `<tr style="border-top:1px solid #e0e0e0;${evtAdm.editId === t.id ? 'background:#fff8e1;' : ''}">
        <td style="padding:6px 8px;text-align:center;">${uiIcon(t.icon, 20, 'margin:0;')}</td>
        <td class="evtEditable" ${edit(t, 'long')} ><span style="font-weight:600;padding:2px 4px;display:inline-block;min-width:60px;">${evtEsc(t.label_long)}</span>${t.is_other ? ' <span title="Type de repli : non modifiable, non supprimable" style="color:#888;">🔒</span>' : ''}</td>
        <td class="evtEditable" ${edit(t, 'short')}><span style="padding:2px 4px;display:inline-block;min-width:80px;">${t.label_short ? evtEsc(t.label_short) : '<span style="color:#aaa;font-style:italic;">à compléter</span>'}</span></td>
        <td style="padding:6px 8px;">${evtChip(t, true)}</td>
        <td style="padding:6px 8px;text-align:right;">${t.events_count || 0}</td>
        <td style="padding:6px 8px;white-space:nowrap;text-align:right;">${
            t.is_other
                ? ''
                : `<button type="button" onclick="evtEditType(${t.id})" title="Modifier (icône, couleurs…)" style="background:#3498db;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;">${uiIcon('pencil', 14, 'margin:0;')}</button>
            <button type="button" onclick="evtDeleteType(${t.id})" title="Supprimer" style="background:#e53935;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;margin-left:4px;">${uiIcon('trash', 14, 'margin:0;')}</button>`
        }</td></tr>`
        )
        .join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:6px;overflow:hidden;">
        <thead><tr style="background:#ffe0b2;color:#e65100;text-align:left;"><th style="padding:6px 8px;width:50px;text-align:center;">Icône</th><th style="padding:6px 8px;">Libellé long</th><th style="padding:6px 8px;">Libellé court</th><th style="padding:6px 8px;">Aperçu</th><th style="padding:6px 8px;text-align:right;">Événements</th><th style="padding:6px 8px;"></th></tr></thead>
        <tbody>${rows}</tbody></table>`;
}
// Modification directe d'un libellé en cliquant sur le texte
function evtInlineEdit(td, id, field) {
    const t = evtTypeById(id);
    if (!t || t.is_other || td.querySelector('input')) return;
    const old = field === 'long' ? t.label_long : t.label_short;
    td.innerHTML = `<input type="text" value="${evtEsc(old)}" maxlength="${field === 'long' ? 120 : 40}" placeholder="${field === 'long' ? 'Libellé long' : 'Libellé court'}" style="width:100%;padding:4px 6px;box-sizing:border-box;border:2px solid #ff9800;border-radius:4px;font-size:12px;">`;
    const inp = td.firstChild;
    inp.focus();
    inp.select();
    let done = false;
    const refreshTable = () => {
        const b = document.getElementById('evtTypesTblBox');
        if (b) b.innerHTML = evtTypesTableHtml();
    };
    const finish = async save => {
        if (done) return;
        done = true;
        const v = inp.value.trim();
        if (!save || v === old) {
            refreshTable();
            return;
        }
        if (field === 'long' && !v) {
            alert('Le libellé long est obligatoire.');
            refreshTable();
            return;
        }
        const body = {
            label_long: field === 'long' ? v : t.label_long,
            label_short: field === 'short' ? v : t.label_short,
            icon: t.icon,
            bg_color: t.bg_color,
            text_color: t.text_color,
            border_color: t.border_color
        };
        try {
            const r = await fetch(`${API_URL}/event-types/${id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
            await evtLoadTypes(true);
            refreshTable();
            evtRefreshAfterTypeChange();
        } catch (e) {
            alert(e.message);
            refreshTable();
        }
    };
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
    });
    inp.addEventListener('blur', () => finish(true));
}
function evtRenderTypesAdmin() {
    const box = document.getElementById('evtTypesAdmin');
    if (!box) return;
    const editing = evtAdm.editId ? evtTypeById(evtAdm.editId) : null;
    const cur = editing
        ? { bg: editing.bg_color, text: editing.text_color, border: editing.border_color }
        : evtAdm._cur || { bg: '#ffeb3b', text: '#000000', border: '#000000' };
    if (evtAdm.tpl === null || evtAdm.tpl === undefined)
        evtAdm.tpl = evtTplIndexOf(cur) >= 0 ? evtTplIndexOf(cur) : 'custom';
    const tplIdx = evtAdm.tpl === 'custom' ? -1 : evtAdm.tpl;
    box.innerHTML = `
        <div style="background:#fff;border:1px solid #ffcc80;border-radius:8px;padding:12px;margin-bottom:12px;">
            <div style="font-weight:700;color:#e65100;margin-bottom:8px;">${editing ? 'Modifier le type « ' + evtEsc(editing.label_long) + ' »' : "Ajouter un type d'événement"}</div>
            <div style="display:grid;grid-template-columns:2fr 1fr auto 2fr;gap:10px;align-items:end;">
                <div><label style="font-size:11px;color:#e65100;display:block;margin-bottom:3px;">Libellé long *</label><input type="text" id="evtTLong" maxlength="120" value="${evtEsc(editing ? editing.label_long : '')}" style="width:100%;padding:6px;box-sizing:border-box;" oninput="evtTypePreview()"></div>
                <div><label style="font-size:11px;color:#e65100;display:block;margin-bottom:3px;">Libellé court</label><input type="text" id="evtTShort" maxlength="40" value="${evtEsc(editing ? editing.label_short : '')}" placeholder="planning / carte" style="width:100%;padding:6px;box-sizing:border-box;" oninput="evtTypePreview()"></div>
                <div style="position:relative;"><label style="font-size:11px;color:#e65100;display:block;margin-bottom:3px;">Icône</label>
                    <button type="button" onclick="evtTogglePicker()" id="evtTIconBtn" title="Choisir dans la banque d'icônes" style="height:32px;min-width:56px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#333;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 8px;">${uiIcon(evtAdm.icon, 20, 'margin:0;')} ▾</button>
                    <div id="evtTPicker" style="display:${evtAdm.pickerOpen ? 'grid' : 'none'};position:absolute;z-index:50;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.2);padding:8px;grid-template-columns:repeat(9,34px);gap:4px;width:max-content;">
                        ${EVT_ICON_BANK.map(([n, l]) => `<button type="button" onclick="evtPickIcon('${n}')" title="${evtEsc(l)}" style="width:34px;height:34px;border:1px solid ${n === evtAdm.icon ? '#e65100' : '#e0e0e0'};background:${n === evtAdm.icon ? '#fff3e0' : '#fff'};color:#333;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">${uiIcon(n, 18, 'margin:0;')}</button>`).join('')}
                    </div></div>
                <div style="position:relative;"><label style="font-size:11px;color:#e65100;display:block;margin-bottom:3px;">Gabarit de couleurs (fond – texte – bordure)</label>
                    <button type="button" id="evtTplBtn" onclick="evtTplToggle()" title="Choisir un gabarit" style="width:100%;height:32px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#333;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px;text-align:left;">
                        <span style="display:inline-flex;align-items:center;gap:8px;">${evtTplSwatch(cur)}<span style="font-size:12px;">${tplIdx >= 0 ? evtEsc(EVT_COLOR_TEMPLATES[tplIdx].n) : 'Personnalisé…'}</span></span><span>▾</span></button>
                    <div id="evtTplList" style="display:${evtAdm.tplOpen ? 'grid' : 'none'};position:absolute;z-index:50;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.2);padding:8px;grid-template-columns:repeat(3,minmax(150px,1fr));gap:6px;width:max-content;max-width:90vw;">
                        ${EVT_COLOR_TEMPLATES.map((x, i) => `<button type="button" onclick="evtTplPick(${i})" title="${evtEsc(x.n)}" style="display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:6px 8px;border:1px solid ${i === tplIdx ? '#e65100' : '#e0e0e0'};background:${i === tplIdx ? '#fff3e0' : '#fff'};color:#333;border-radius:8px;cursor:pointer;text-align:left;">${evtTplSwatch(x)}<span style="font-size:11px;">${evtEsc(x.n)}</span></button>`).join('')}
                        <button type="button" onclick="evtTplPick('custom')" style="display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:6px 8px;border:1px solid ${tplIdx < 0 ? '#e65100' : '#e0e0e0'};background:${tplIdx < 0 ? '#fff3e0' : '#fff'};color:#333;border-radius:8px;cursor:pointer;text-align:left;"><span style="display:inline-block;padding:2px 12px;border-radius:10px;border:2px dashed #999;font-size:11px;font-weight:bold;">Aa</span><span style="font-size:11px;">Personnalisé…</span></button>
                    </div></div>
            </div>
            <div id="evtTCustom" style="display:${tplIdx < 0 ? 'flex' : 'none'};gap:12px;align-items:end;margin-top:8px;">
                ${[
                    ['Fond', 'evtTBg', cur.bg],
                    ['Texte', 'evtTTx', cur.text],
                    ['Bordure', 'evtTBd', cur.border]
                ]
                    .map(
                        ([l, id, v]) =>
                            `<div><label style="font-size:11px;color:#e65100;display:block;margin-bottom:3px;">${l}</label><input type="color" id="${id}" value="${v}" style="width:44px;height:32px;padding:0;border:1px solid #ccc;cursor:pointer;" onchange="evtTypePreview()"></div>`
                    )
                    .join('')}
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap;">
                <span style="font-size:12px;color:#666;">Aperçu :</span><span id="evtTPrev"></span>
                <span style="flex:1;"></span>
                <span id="evtTMsg" style="font-size:12px;"></span>
                ${editing ? '<button type="button" onclick="evtCancelEdit()" style="background:#eee;color:#333;border:1px solid #ccc;border-radius:6px;padding:7px 14px;cursor:pointer;">Annuler</button>' : ''}
                <button type="button" onclick="evtSaveType()" style="background:#ff9800;color:#fff;border:none;border-radius:6px;padding:7px 18px;font-weight:bold;cursor:pointer;">${editing ? '💾 Enregistrer' : '➕ Ajouter'}</button>
            </div>
        </div>
        <div id="evtTypesTblBox">${evtTypesTableHtml()}</div>
        <p style="font-size:11px;color:#888;margin:8px 0 0;">Cliquez sur un <b>libellé long</b> ou <b>court</b> pour le modifier directement (Entrée ou clic ailleurs pour valider, Échap pour annuler). Le libellé court s'affiche sur la page de planification et sur la carte (à défaut, le libellé long). « Autre(s) » est le type de repli : à la suppression d'un type, ses événements basculent sur « Autre(s) ».</p>`;
    evtTypePreview();
}
const evtTplSwatch = c =>
    `<span style="display:inline-block;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:bold;background:${c.bg};color:${c.text};border:2px solid ${c.border};white-space:nowrap;">Aa</span>`;
function evtCurrentColors() {
    if (evtAdm.tpl !== 'custom' && evtAdm.tpl !== null && evtAdm.tpl !== undefined) {
        const x = EVT_COLOR_TEMPLATES[Number(evtAdm.tpl)];
        return { bg: x.bg, text: x.text, border: x.border };
    }
    const v = id => (document.getElementById(id) || {}).value;
    return {
        bg: v('evtTBg') || (evtAdm._cur && evtAdm._cur.bg) || '#ffeb3b',
        text: v('evtTTx') || (evtAdm._cur && evtAdm._cur.text) || '#000000',
        border: v('evtTBd') || (evtAdm._cur && evtAdm._cur.border) || '#000000'
    };
}
function evtTypePreview() {
    const c = evtCurrentColors(),
        el = document.getElementById('evtTPrev');
    if (!el) return;
    evtAdm._cur = c;
    const short = (document.getElementById('evtTShort') || {}).value || '',
        long = (document.getElementById('evtTLong') || {}).value || '';
    el.innerHTML = evtChip({
        bg_color: c.bg,
        text_color: c.text,
        border_color: c.border,
        icon: evtAdm.icon,
        label_short: short.trim(),
        label_long: long.trim() || 'Libellé'
    });
}
function evtTplToggle() {
    evtAdm.tplOpen = !evtAdm.tplOpen;
    const l = document.getElementById('evtTplList');
    if (l) l.style.display = evtAdm.tplOpen ? 'grid' : 'none';
}
function evtKeepFormAndRender() {
    const f = ['evtTLong', 'evtTShort'].map(id => (document.getElementById(id) || {}).value);
    evtRenderTypesAdmin();
    if (document.getElementById('evtTLong')) {
        document.getElementById('evtTLong').value = f[0] || '';
        document.getElementById('evtTShort').value = f[1] || '';
        evtTypePreview();
    }
}
function evtTplPick(i) {
    const c = evtCurrentColors();
    evtAdm.tplOpen = false;
    if (i === 'custom') {
        evtAdm._cur = c;
        evtAdm.tpl = 'custom';
    } else evtAdm.tpl = i;
    evtKeepFormAndRender();
}
function evtTogglePicker() {
    evtAdm.pickerOpen = !evtAdm.pickerOpen;
    const p = document.getElementById('evtTPicker');
    if (p) p.style.display = evtAdm.pickerOpen ? 'grid' : 'none';
}
function evtPickIcon(n) {
    evtAdm._cur = evtCurrentColors();
    evtAdm.icon = n;
    evtAdm.pickerOpen = false;
    evtKeepFormAndRender();
}
document.addEventListener('click', e => {
    const inside = sel => e.target.closest && e.target.closest(sel);
    if (evtAdm.pickerOpen && !inside('#evtTPicker, #evtTIconBtn')) {
        evtAdm.pickerOpen = false;
        const p = document.getElementById('evtTPicker');
        if (p) p.style.display = 'none';
    }
    if (evtAdm.tplOpen && !inside('#evtTplList, #evtTplBtn')) {
        evtAdm.tplOpen = false;
        const l = document.getElementById('evtTplList');
        if (l) l.style.display = 'none';
    }
});
function evtEditType(id) {
    const t = evtTypeById(id);
    if (!t) return;
    evtAdm.editId = id;
    evtAdm.icon = t.icon;
    evtAdm._cur = null;
    evtAdm.tpl = null;
    evtAdm.pickerOpen = false;
    evtAdm.tplOpen = false;
    evtRenderTypesAdmin();
    const b = document.getElementById('evtTypesAdmin');
    if (b) b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function evtCancelEdit() {
    evtAdm.editId = null;
    evtAdm.icon = 'tag';
    evtAdm._cur = null;
    evtAdm.tpl = null;
    evtRenderTypesAdmin();
}
async function evtSaveType() {
    const msg = document.getElementById('evtTMsg'),
        c = evtCurrentColors();
    const body = {
        label_long: document.getElementById('evtTLong').value.trim(),
        label_short: document.getElementById('evtTShort').value.trim(),
        icon: evtAdm.icon,
        bg_color: c.bg,
        text_color: c.text,
        border_color: c.border
    };
    if (!body.label_long) {
        msg.style.color = '#b3261e';
        msg.textContent = 'Le libellé long est obligatoire.';
        return;
    }
    try {
        const r = await fetch(`${API_URL}/event-types${evtAdm.editId ? '/' + evtAdm.editId : ''}`, {
            method: evtAdm.editId ? 'PUT' : 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
        evtAdm.editId = null;
        evtAdm.icon = 'tag';
        evtAdm._cur = null;
        evtAdm.tpl = null;
        await evtLoadTypes(true);
        evtRenderTypesAdmin();
        evtRefreshAfterTypeChange();
    } catch (e) {
        msg.style.color = '#b3261e';
        msg.textContent = e.message;
    }
}
async function evtDeleteType(id) {
    const t = evtTypeById(id);
    if (!t) return;
    const n = t.events_count || 0;
    if (
        !confirm(
            `Supprimer le type « ${t.label_long} » ?` +
                (n ? `\n\n${n} événement(s) associé(s) basculeront sur « Autre(s) ».` : '')
        )
    )
        return;
    try {
        const r = await fetch(`${API_URL}/event-types/${id}`, { method: 'DELETE', credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
        if (evtAdm.editId === id) evtAdm.editId = null;
        await evtLoadTypes(true);
        evtRenderTypesAdmin();
        evtRefreshAfterTypeChange();
    } catch (e) {
        alert(e.message);
    }
}
// Après modification des types : planning et onglet Événements (îlot Vue, frontend/src/liaison.ts) sont rafraîchis
async function evtRefreshAfterTypeChange() {
    window.dispatchEvent(new CustomEvent('gp:types-evenements-modifies'));
    try {
        if (typeof loadSpecialDates === 'function') await loadSpecialDates();
        if (typeof updateGantt === 'function') updateGantt();
    } catch (e) {
        /* ignoré */
    }
    if (evtRec.rows.length) evtRecLoad();
}

// ── Administration : reprise des données (type et libellé modifiables) ──────
const evtRec = {
    rows: [],
    changes: {},
    suggested: new Set(),
    sortKey: 'start',
    dir: 1,
    q: '',
    tab: null,
    page: 0,
    size: 100
};
// Onglets : « À traiter » = événements sans type en base ; « Traité » = type déjà affecté (enregistré)
const evtRecIsDone = r => !!r.type_id;
const evtNorm = t =>
    String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
// Libellés historiques (anciens gabarits) → type
const EVT_LEGACY = [
    ['reunion de lancement strategique', 'reunionLancement'],
    ['accomp post dem', 'apd'],
    ['accompagnement post demarrage', 'apd'],
    ['mise en service', 'mes'],
    ['visite terrain', 'visite'],
    ['visite metier', 'visiteMetier'],
    ['visite post mes', 'visitePostMes'],
    ['visite ob', 'visiteOb'],
    ['vft sur site', 'vftSite'],
    ['verif prerequis', 'verifPrereq'],
    ['verification des prerequis', 'verifPrereq'],
    ['formations utilisateurs', 'formation'],
    ['formation', 'formation'],
    ['congres', 'congres']
];
function evtSuggest(label) {
    const l = evtNorm(label);
    const hit = EVT_LEGACY.find(([k]) => l === k || l.startsWith(k + ' '));
    if (hit) return evtTypes.find(t => t.code === hit[1]) || null;
    return evtTypes.find(t => !t.is_other && evtNorm(t.label_long) === l) || null;
}
async function evtRecOpen() {
    await evtLoadTypes(true);
    await evtRecLoad();
}
async function evtRecLoad() {
    const box = document.getElementById('evtRecoveryAdmin');
    if (!box) return;
    try {
        const r = await fetch(`${API_URL}/event-types/events`, { credentials: 'include' });
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        evtRec.rows = (await r.json()).events || [];
    } catch (e) {
        box.innerHTML = `<p style="color:#b3261e;">Chargement impossible : ${evtEsc(e.message)}</p>`;
        return;
    }
    evtRec.changes = {};
    evtRec.suggested = new Set();
    evtRec.page = 0;
    if (!evtRec.tab || !evtRec.rows.some(r => !evtRecIsDone(r) === (evtRec.tab === 'todo')))
        evtRec.tab = evtRec.rows.some(r => !evtRecIsDone(r)) ? 'todo' : 'done';
    evtRecRender();
}
const evtRecType = row =>
    evtRec.changes[row.id] && evtRec.changes[row.id].type_id !== undefined
        ? evtRec.changes[row.id].type_id
        : row.type_id;
const evtRecLabel = row =>
    evtRec.changes[row.id] && evtRec.changes[row.id].label !== undefined ? evtRec.changes[row.id].label : row.label;
const EVT_REC_COLS = [
    { k: 'start', t: 'Début', v: r => r.start_date },
    { k: 'end', t: 'Fin', v: r => r.end_date },
    { k: 'type', t: 'Type', v: r => (evtTypeById(evtRecType(r)) || {}).label_long || '' },
    { k: 'label', t: 'Libellé', v: r => evtRecLabel(r) },
    { k: 'loc', t: 'Localisation', v: r => r.location_court || r.location_long || '' },
    { k: 'parts', t: 'Participants', v: r => (r.participants || []).join(', ') },
    { k: 'creator', t: 'Créé par', v: r => `${r.creator_nom || ''} ${r.creator_prenom || ''}`.trim() }
];
function evtRecSort(k) {
    if (evtRec.sortKey === k) evtRec.dir = -evtRec.dir;
    else {
        evtRec.sortKey = k;
        evtRec.dir = 1;
    }
    evtRec.page = 0;
    evtRecRender();
}
function evtRecEdit(id, field, value) {
    const row = evtRec.rows.find(r => r.id === id);
    if (!row) return;
    const c = (evtRec.changes[id] = evtRec.changes[id] || {});
    if (field === 'type_id') {
        const v = value === '' ? null : Number(value);
        if (v === row.type_id) delete c.type_id;
        else c.type_id = v;
        evtRec.suggested.delete(id);
    } else {
        if (value === row.label) delete c.label;
        else c.label = value;
    }
    if (!Object.keys(c).length) delete evtRec.changes[id];
    evtRecCounters();
    const tr = document.getElementById('evtRecRow' + id);
    if (tr) tr.style.background = evtRec.changes[id] ? '#fff8e1' : '';
}
function evtRecCounters() {
    const n = Object.keys(evtRec.changes).length,
        b = document.getElementById('evtRecSave');
    if (b) {
        b.textContent = `💾 Enregistrer (${n})`;
        b.disabled = !n;
        b.style.opacity = n ? 1 : 0.5;
    }
}
function evtRecSuggest() {
    let n = 0;
    evtRec.rows.forEach(r => {
        if (evtRecIsDone(r) || evtRecType(r)) return;
        const t = evtSuggest(evtRecLabel(r));
        if (t) {
            (evtRec.changes[r.id] = evtRec.changes[r.id] || {}).type_id = t.id;
            evtRec.suggested.add(r.id);
            n++;
        }
    });
    evtRecRender();
    const m = document.getElementById('evtRecMsg');
    if (m) {
        m.style.color = '#555';
        m.textContent = n
            ? `${n} type(s) suggéré(s) d'après le libellé : vérifiez puis enregistrez.`
            : 'Aucune suggestion : les libellés restants ne correspondent à aucun type.';
    }
}
async function evtRecSave() {
    const updates = Object.entries(evtRec.changes).map(([id, c]) => ({ id: Number(id), ...c }));
    if (!updates.length) return;
    const m = document.getElementById('evtRecMsg');
    try {
        const r = await fetch(`${API_URL}/event-types/events/bulk`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
        await evtLoadTypes(true);
        await evtRecLoad();
        const m2 = document.getElementById('evtRecMsg');
        if (m2) {
            m2.style.color = '#1b7f3b';
            m2.textContent = `${d.updated} événement(s) mis à jour.`;
        }
        // Onglet Événements (îlot Vue, frontend/src/liaison.ts) : types et événements rechargés
        window.dispatchEvent(new CustomEvent('gp:types-evenements-modifies'));
        try {
            if (typeof loadSpecialDates === 'function') await loadSpecialDates();
            if (typeof updateGantt === 'function') updateGantt();
        } catch (e) {
            /* ignoré */
        }
        if (document.getElementById('evtTypesAdmin') && document.getElementById('evtTypesAdmin').innerHTML)
            evtRenderTypesAdmin();
    } catch (e) {
        if (m) {
            m.style.color = '#b3261e';
            m.textContent = e.message;
        }
    }
}
function evtRecFiltered() {
    const q = evtNorm(evtRec.q),
        col = EVT_REC_COLS.find(c => c.k === evtRec.sortKey) || EVT_REC_COLS[0];
    let rows = evtRec.rows.filter(
        r =>
            (evtRec.tab === 'done') === evtRecIsDone(r) &&
            (!q || evtNorm(EVT_REC_COLS.map(c => c.v(r)).join(' ')).includes(q))
    );
    rows = rows
        .map(r => ({ r, v: col.v(r) }))
        .sort((a, b) => String(a.v).localeCompare(String(b.v), 'fr', { numeric: true }) * evtRec.dir || a.r.id - b.r.id)
        .map(x => x.r);
    return rows;
}
function evtRecRender() {
    const box = document.getElementById('evtRecoveryAdmin');
    if (!box) return;
    const all = evtRecFiltered(),
        pages = Math.max(1, Math.ceil(all.length / evtRec.size));
    evtRec.page = Math.min(evtRec.page, pages - 1);
    const rows = all.slice(evtRec.page * evtRec.size, (evtRec.page + 1) * evtRec.size);
    const todoN = evtRec.rows.filter(r => !evtRecIsDone(r)).length,
        doneN = evtRec.rows.length - todoN;
    const tabBtn = (k, label, n) =>
        `<button type="button" onclick="evtRec.tab='${k}';evtRec.page=0;evtRecRender();" style="padding:8px 18px;border:1px solid #90caf9;border-bottom:${evtRec.tab === k ? '2px solid #fff' : '1px solid #90caf9'};border-radius:8px 8px 0 0;margin-right:4px;margin-bottom:-1px;cursor:pointer;font-weight:700;font-size:13px;background:${evtRec.tab === k ? '#fff' : '#bbdefb'};color:${evtRec.tab === k ? '#1565c0' : '#455a64'};">${label} <span style="display:inline-block;min-width:22px;padding:1px 7px;border-radius:10px;font-size:11px;background:${k === 'todo' ? (n ? '#e53935' : '#9e9e9e') : '#43a047'};color:#fff;">${n}</span></button>`;
    const opts = sel =>
        (evtRec.tab === 'done' ? '' : `<option value="" ${sel ? '' : 'selected'}>— Non défini —</option>`) +
        evtTypes
            .map(
                t =>
                    `<option value="${t.id}" ${Number(sel) === t.id ? 'selected' : ''}>${evtEsc(t.label_long)}</option>`
            )
            .join('');
    const arrow = k => (evtRec.sortKey === k ? (evtRec.dir > 0 ? ' ▲' : ' ▼') : '');
    box.innerHTML = `
        <div style="display:flex;border-bottom:1px solid #90caf9;margin-bottom:10px;">${tabBtn('todo', 'À traiter', todoN)}${tabBtn('done', 'Traité', doneN)}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
            <input type="search" id="evtRecQ" value="${evtEsc(evtRec.q)}" placeholder="Rechercher dans tous les champs…" oninput="evtRec.q=this.value;evtRec.page=0;evtRecRender();document.getElementById('evtRecQ').focus();" style="padding:6px 10px;min-width:260px;border:1px solid #ccc;border-radius:6px;">
            ${evtRec.tab === 'todo' ? `<button type="button" onclick="evtRecSuggest()" title="Propose un type d'après le libellé actuel (non appliqué tant que vous n'enregistrez pas)" style="background:#fff;border:1px solid #ff9800;color:#e65100;border-radius:6px;padding:6px 12px;cursor:pointer;">${uiIcon('lightbulb', 14, 'margin-right:4px;')}Suggérer les types</button>` : '<span style="font-size:12px;color:#555;">Types déjà affectés : modifiables à tout moment.</span>'}
            <span style="flex:1;"></span>
            <span id="evtRecMsg" style="font-size:12px;"></span>
            <button type="button" onclick="evtRecLoad()" style="background:#eee;border:1px solid #ccc;border-radius:6px;padding:6px 12px;cursor:pointer;" title="Abandonner les modifications non enregistrées et recharger">↺ Recharger</button>
            <button type="button" id="evtRecSave" onclick="evtRecSave()" style="background:#ff9800;color:#fff;border:none;border-radius:6px;padding:7px 16px;font-weight:bold;cursor:pointer;">💾 Enregistrer (0)</button>
        </div>
        <div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">
            <thead style="position:sticky;top:0;z-index:2;"><tr style="background:#ffe0b2;color:#e65100;text-align:left;">${EVT_REC_COLS.map(c => `<th onclick="evtRecSort('${c.k}')" title="Trier" style="padding:7px 8px;cursor:pointer;white-space:nowrap;user-select:none;">${c.t}${arrow(c.k)}</th>`).join('')}</tr></thead>
            <tbody>${
                rows
                    .map(
                        r => `<tr id="evtRecRow${r.id}" style="border-top:1px solid #eee;${evtRec.changes[r.id] ? 'background:#fff8e1;' : ''}">
                <td style="padding:5px 8px;white-space:nowrap;">${evtFd(r.start_date)}${r.period && r.period !== 'FULL' ? ' <span style="color:#888;">(' + r.period + ')</span>' : ''}</td>
                <td style="padding:5px 8px;white-space:nowrap;">${evtFd(r.end_date)}</td>
                <td style="padding:5px 8px;"><select onchange="evtRecEdit(${r.id},'type_id',this.value)" style="max-width:230px;padding:3px;${evtRec.suggested.has(r.id) ? 'outline:2px dashed #ff9800;' : ''}" ${evtRec.suggested.has(r.id) ? 'title="Type suggéré"' : ''}>${opts(evtRecType(r))}</select></td>
                <td style="padding:5px 8px;"><input type="text" value="${evtEsc(evtRecLabel(r))}" onchange="evtRecEdit(${r.id},'label',this.value.trim())" style="width:100%;min-width:180px;padding:3px 5px;box-sizing:border-box;"></td>
                <td style="padding:5px 8px;color:#444;">${evtEsc(r.location_court || r.location_long || '')}</td>
                <td style="padding:5px 8px;color:#444;max-width:260px;">${evtEsc((r.participants || []).join(', '))}</td>
                <td style="padding:5px 8px;color:#444;white-space:nowrap;">${evtEsc(`${r.creator_prenom || ''} ${(r.creator_nom || '').toUpperCase()}`.trim())}</td></tr>`
                    )
                    .join('') ||
                '<tr><td colspan="7" style="padding:14px;text-align:center;color:#999;">Aucun événement</td></tr>'
            }</tbody></table></div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px;font-size:12px;color:#555;">
            <span>${all.length} événement(s) ${evtRec.tab === 'todo' ? 'à traiter' : 'traité(s)'}${evtRec.q ? ' (filtrés)' : ''}</span><span style="flex:1;"></span>
            <button type="button" ${evtRec.page <= 0 ? 'disabled' : ''} onclick="evtRec.page--;evtRecRender();" style="padding:3px 10px;">◀</button>
            <span>Page ${evtRec.page + 1} / ${pages}</span>
            <button type="button" ${evtRec.page >= pages - 1 ? 'disabled' : ''} onclick="evtRec.page++;evtRecRender();" style="padding:3px 10px;">▶</button>
            <select onchange="evtRec.size=Number(this.value);evtRec.page=0;evtRecRender();" style="padding:3px;">${[50, 100, 250, 500].map(n => `<option value="${n}" ${evtRec.size === n ? 'selected' : ''}>${n} / page</option>`).join('')}</select>
        </div>
        <p style="font-size:11px;color:#888;margin:6px 0 0;">Seuls le <b>type</b> et le <b>libellé</b> sont modifiables ; les autres colonnes sont affichées pour repère. Cliquez sur un en-tête pour trier.</p>`;
    evtRecCounters();
}

// Chargement initial des types (libellés et icônes du planning, du calendrier et de l'aide à l'affectation)
document.addEventListener('DOMContentLoaded', () => evtLoadTypes());
