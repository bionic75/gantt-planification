// Application « Aide à l'affectation opérationnelle » : onglet « Planification des ateliers métier »
// Rétroplanning automatisé des ateliers métier d'un SAMU : Paramétrage, Simulation, Rétroplanning (SAMU enregistrés).
// Les dates sont calculées par le serveur (POST /api/affectation/ateliers/simulate), avec les mêmes règles que le
// classeur « Rétroplanning SAMU automatique » : MEP ferme, ateliers reculés depuis la MEP, week-ends et vacances de la zone évités.
(function () {
    const AT = {
        meta: null,
        list: [],
        f: null, // formulaire (état partagé entre « Paramétrage » et « Simulation »)
        sim: null,
        timer: null,
        seq: 0,
        sond: [], // sondages du rétroplanning affiché
        sondFor: null
    };

    const blank = () => ({
        id: null,
        samu: '',
        mep: '',
        nb: 4,
        zone: '',
        delaiVisite: 14,
        delaiMep: 28,
        ecart12: 7,
        ecartAteliers: 14,
        jalons: {},
        contenus: {},
        planifiees: {},
        heures: {},
        custom: {}, // ateliers dont le contenu / objectif est saisi à la main (liste « Personnalisé… » choisie)
        invites: {},
        teams: '',
        destinataires: { userIds: [], emails: [] },
        savedAt: null
    });
    AT.f = blank();

    const esc = v =>
        String(v == null ? '' : v).replace(
            /[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const isAdmin = () => typeof currentUser !== 'undefined' && currentUser && currentUser.activeProfile === 'admin';
    const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const frDate = d => {
        if (!d) return '—';
        const [y, m, day] = d.split('-').map(Number);
        return `${DAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]} ${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    };
    const frShort = d => (d ? d.split('-').reverse().join('/') : '—');

    async function atApi(path, opts) {
        const r = await fetch(`${API_URL}${path}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            ...(opts || {})
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
        return data;
    }

    function toast(message, error = false) {
        const el = document.createElement('div');
        el.className = `at-toast${error ? ' err' : ''}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), error ? 7000 : 4500);
    }

    // ---- Icônes (même style que le reste de l'application) ----
    const ICONS = {
        sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
        flask: '<path d="M9 3h6M10 3v6L4.5 19A2 2 0 0 0 6.3 22h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
        trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
        mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
        pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
        calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'
    };
    const ico = (name, cls = 'at-ico') =>
        `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

    const STYLE = `
        #atelierRoot .at-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px 18px; align-items: start; }
        #atelierRoot .at-field label { display: block; margin: 0 0 5px; font-size: 12px; font-weight: 700; color: #455a64; }
        #atelierRoot .at-field input, #atelierRoot .at-field select { width: 100%; padding: 8px 10px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; background: #fff; box-sizing: border-box; }
        #atelierRoot .at-hint { margin-top: 4px; font-size: 11px; color: #7a8799; line-height: 1.35; }
        #atelierRoot .at-hint button { padding: 0; border: 0; background: none; color: #1d70b7; font-size: 11px; cursor: pointer; text-decoration: underline; }
        #atelierRoot .at-card-title { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: #0f4c5c; }
          .at-ico { width: 22px; height: 22px; fill: none; stroke: #0f766e; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
          .at-ico-sm { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #atelierRoot table.at-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        #atelierRoot table.at-table th { padding: 8px 10px; text-align: left; font-size: 11px; color: #fff; background: #2c4a6b; font-weight: 700; white-space: nowrap; }
        #atelierRoot table.at-table th::after { content: none !important; }
        #atelierRoot table.at-table td { padding: 7px 10px; border-top: 1px solid #e6ebf2; vertical-align: top; }
        #atelierRoot table.at-table tr.at-fixed td { background: #f0f4fa; }
        #atelierRoot table.at-table tr.at-mep td { background: #e8f5e9; font-weight: 700; }
        #atelierRoot table.at-table select, #atelierRoot table.at-table input[type=date], #atelierRoot table.at-table input[type=time] { width: 100%; min-width: 150px; padding: 5px 7px; border: 1px solid #cfd8e6; border-radius: 6px; font-size: 12px; box-sizing: border-box; }
        #atelierRoot .at-jalon { font-weight: 700; color: #1f2d3d; }
        #atelierRoot .at-badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #e9edf3; color: #455a64; }
        #atelierRoot .at-badge.ok { background: #d7f2e3; color: #167a45; }
        #atelierRoot .at-badge.warn { background: #ffeccc; color: #9a5b00; }
        #atelierRoot .at-badge.info { background: #d9e8fb; color: #1d5fa8; }
        #atelierRoot .at-badge.fix { background: #e8def8; color: #5b3a99; }
        #atelierRoot .at-warn { margin: 10px 0; padding: 9px 12px; border-left: 4px solid #ef6c00; background: #fff3e0; border-radius: 6px; font-size: 12px; color: #7a4100; }
        #atelierRoot .at-actions { display: flex; gap: 6px; }
        #atelierRoot .at-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 0; border-radius: 9px; color: #fff; cursor: pointer; padding: 0; }
        #atelierRoot .at-icon-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        #atelierRoot .at-icon-btn.edit { background: #f39c12; }
        #atelierRoot .at-icon-btn.del { background: #e74c3c; }
        #atelierRoot .at-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
        #atelierRoot .at-empty { padding: 22px; text-align: center; color: #8a97a8; border: 1px dashed #cfd8e6; border-radius: 10px; }
        .at-toast { position: fixed; right: 20px; bottom: 20px; z-index: 10040; max-width: 420px; padding: 12px 16px; border-radius: 8px; background: #263238; color: #fff; font-size: 13px; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
        .at-toast.err { background: #b71c1c; }
        .at-modal-bg { position: fixed; inset: 0; z-index: 10030; background: rgba(15,30,45,.5); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .at-modal { width: 100%; max-width: 620px; max-height: 90vh; overflow: auto; background: #fff; border-radius: 14px; padding: 18px 20px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
        .at-modal h3 { margin: 0 0 12px; border: none; padding: 0; }
        .at-modal label { display: block; margin: 10px 0 4px; font-size: 12px; font-weight: 700; color: #455a64; }
        .at-modal input[type=text], .at-modal textarea { width: 100%; padding: 8px 10px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; box-sizing: border-box; font-family: inherit; }
        .at-users { max-height: 190px; overflow: auto; border: 1px solid #cfd8e6; border-radius: 8px; padding: 4px; }
        .at-users label { display: flex; align-items: center; gap: 8px; margin: 0; padding: 4px 6px; font-weight: 600; cursor: pointer; border-radius: 4px; }
        .at-users label:hover { background: #eceff1; }
        .at-users input { width: 16px; height: 16px; margin: 0; flex: 0 0 16px; }
        .at-chips-box { position: relative; }
        .at-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 8px; border: 1px solid #cfd8e6; border-radius: 10px; background: #f3f4f6; min-height: 44px; box-sizing: border-box; }
        .at-chips.ro { background: #eef0f3; }
        .at-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 4px; border: 1px solid #d6dbe3; border-radius: 999px; background: #eceff3; font-size: 13px; color: #1a2b3c; max-width: 100%; }
        .at-chip-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .at-av { width: 24px; height: 24px; flex: 0 0 24px; border-radius: 50%; color: #fff; font-style: normal; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .at-chip button { border: 0; background: none; cursor: pointer; color: #8a97a8; font-size: 16px; padding: 0 2px; line-height: 1; }
        .at-chip button:hover { color: #b3261e; }
        .at-modal .at-chips-in { flex: 1 1 140px; min-width: 120px; width: auto !important; border: 0 !important; background: transparent !important; outline: none; padding: 4px !important; font-size: 13px; box-shadow: none !important; }
        .at-chips-dd { border: 1px solid #cfd8e6; border-radius: 8px; background: #fff; margin-top: 4px; max-height: 220px; overflow: auto; box-shadow: 0 4px 14px rgba(0,0,0,.12); }
        .at-chips-opt { display: flex; gap: 8px; align-items: center; padding: 6px 10px; cursor: pointer; font-size: 13px; }
        .at-chips-opt.on, .at-chips-opt:hover { background: #e8f0fb; }
        .at-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
        #atelierRoot .at-sd { border: 1px solid #1d70b7; background: #fff; color: #1d70b7; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        #atelierRoot .at-sd:disabled { opacity: .5; cursor: not-allowed; }
        #atelierRoot .at-sd.brouillon { background: #e3f0fb; }
        #atelierRoot .at-sd.envoye { background: #fff3e0; border-color: #e08a00; color: #a65f00; }
        #atelierRoot .at-sd.reponses { background: #e6f4ea; border-color: #1b7f3b; color: #1b7f3b; }
        #atelierRoot .at-sd.termine { background: #455a64; border-color: #455a64; color: #fff; }
        .at-modal.large { max-width: 760px; }
        .at-opt { display: flex; gap: 8px; align-items: center; margin-bottom: 0; padding: 7px 10px; border-radius: 8px; flex-wrap: nowrap; }
        .at-opt:nth-child(odd) { background: #f3f5f8; }
        .at-opt:nth-child(even) { background: #e2e7ee; }
        .at-modal .at-opt input.d { width: auto !important; flex: 1 1 160px; min-width: 0; }
        .at-modal .at-opt .hm { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto; white-space: nowrap; }
        .at-modal .at-opt select { width: auto !important; padding: 6px 4px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; }
        .at-modal .at-opt button { flex: 0 0 auto; }
        .at-opt input { padding: 6px 8px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; font-family: inherit; }
        .at-url { display: flex; gap: 6px; align-items: center; }
        .at-res { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 4px; }
        .at-res th, .at-res td { border: 1px solid #d5deea; padding: 4px 6px; text-align: center; }
        .at-res td.nom, .at-res th.nom { text-align: left; }
        .at-res td.oui { background: #e6f4ea; color: #1b7f3b; font-weight: 700; }
    `;

    function ensureStyle() {
        if (document.getElementById('atelierStyle')) return;
        const s = document.createElement('style');
        s.id = 'atelierStyle';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    // ---- Affichage de l'onglet ----
    async function show() {
        ensureStyle();
        const root = document.getElementById('atelierRoot');
        if (!root) return;
        root.innerHTML = '<p class="aff-muted">Chargement…</p>';
        try {
            const [meta, list] = await Promise.all([
                atApi('/affectation/ateliers/meta'),
                atApi('/affectation/ateliers')
            ]);
            AT.meta = meta;
            AT.list = list.retroplannings || [];
        } catch (e) {
            root.innerHTML = `<p style="color:#b3261e;">${esc(e.message)}</p>`;
            return;
        }
        render();
        recompute();
    }

    const samuOptions = () =>
        `<option value="">— Choisir un SAMU —</option>` +
        AT.meta.samus
            .map(
                s =>
                    `<option value="${esc(s.samu_name)}" ${s.samu_name === AT.f.samu ? 'selected' : ''}>${esc(s.samu_name)}${s.saved ? ' ✔' : ''}</option>`
            )
            .join('');
    const nbOptions = () =>
        Array.from({ length: AT.meta.limites.max - AT.meta.limites.min + 1 }, (_, i) => AT.meta.limites.min + i)
            .map(n => `<option value="${n}" ${Number(AT.f.nb) === n ? 'selected' : ''}>${n} ateliers</option>`)
            .join('');
    const zoneOptions = () =>
        `<option value="">— Zone —</option>` +
        AT.meta.zones.map(z => `<option value="${z}" ${AT.f.zone === z ? 'selected' : ''}>Zone ${z}</option>`).join('');

    function currentProject() {
        return AT.meta.samus.find(s => s.samu_name === AT.f.samu) || null;
    }

    function zoneHint() {
        const p = currentProject();
        if (!p) return 'La zone est proposée selon le département du SAMU.';
        if (!p.zone) return 'Zone non déterminée pour ce SAMU (hors métropole ?) : choisissez-la.';
        return p.zone === AT.f.zone
            ? `Zone ${p.zone} : zone scolaire de ce SAMU (corrigeable).`
            : `Zone proposée pour ce SAMU : ${p.zone}. <button type="button" onclick="AtelierPlanner.resetZone()">↺ la reprendre</button>`;
    }
    function render() {
        const f = AT.f;
        const root = document.getElementById('atelierRoot');
        root.innerHTML = `
        <h2 style="margin:0 0 4px;">Planification des ateliers métier</h2>
        <p class="aff-muted" style="margin:0 0 14px;">Rétroplanning automatisé : à partir de la date de mise en production (MEP) ferme, les ateliers métier sont reculés en évitant les week-ends et les vacances scolaires de la zone du SAMU.</p>

        <section class="aff-card" id="atCardParams">
            <header class="aff-card-head"><span class="at-card-title">${ico('sliders')}Paramétrage</span></header>
            <div class="at-grid">
                <div class="at-field"><label for="atDelaiVisite">Délai visite métier → atelier 1 (jours)</label>
                    <input type="number" min="0" max="365" id="atDelaiVisite" data-at="delaiVisite" value="${esc(f.delaiVisite)}">
                    <div class="at-hint">Par défaut 14 jours.</div></div>
                <div class="at-field"><label for="atDelaiMep">Délai minimal avant la MEP (jours)</label>
                    <input type="number" min="0" max="365" id="atDelaiMep" data-at="delaiMep" value="${esc(f.delaiMep)}">
                    <div class="at-hint">Par défaut 28 jours : le dernier atelier a lieu au plus tard 28 jours avant la MEP.</div></div>
                <div class="at-field"><label for="atEcart12">Écart atelier 1 → atelier 2 (jours)</label>
                    <input type="number" min="0" max="365" id="atEcart12" data-at="ecart12" value="${esc(f.ecart12)}">
                    <div class="at-hint">Par défaut 7 jours (règle du classeur de référence).</div></div>
                <div class="at-field"><label for="atEcartAteliers">Écart entre les ateliers suivants (jours)</label>
                    <input type="number" min="0" max="365" id="atEcartAteliers" data-at="ecartAteliers" value="${esc(f.ecartAteliers)}">
                    <div class="at-hint">Par défaut 14 jours.</div></div>
            </div>
        </section>

        <section class="aff-card" id="atCardSim">
            <header class="aff-card-head"><span class="at-card-title">${ico('flask')}Simulation</span><span id="atSavedBadge"></span></header>
            <div class="at-grid" style="margin-bottom:14px;">
                <div class="at-field"><label for="atSamu2">SAMU (déploiements)</label><select id="atSamu2" data-at="samu">${samuOptions()}</select><div class="at-hint">${AT.meta.samus.length ? '✔ = rétroplanning déjà enregistré.' : 'Aucun déploiement : créez d’abord un déploiement de SAMU.'}</div></div>
                <div class="at-field"><label for="atMep2">Date de MEP</label><input type="date" id="atMep2" data-at="mep" value="${esc(f.mep)}"><div class="at-hint">${currentProject() && currentProject().mep && currentProject().mep === f.mep ? 'Reprise du déploiement.' : 'Date ferme de mise en production.'}</div></div>
                <div class="at-field"><label for="atNb2">Nombre d’ateliers</label><select id="atNb2" data-at="nb">${nbOptions()}</select></div>
                <div class="at-field"><label for="atZone2">Zone de vacances scolaires</label><select id="atZone2" data-at="zone">${zoneOptions()}</select><div class="at-hint" id="atZoneHint">${zoneHint()}</div></div>
            </div>
            <div id="atWarnings"></div>
            <div style="overflow-x:auto;" id="atTableBox"><div class="at-empty">Choisissez un SAMU, une date de MEP et une zone pour simuler le rétroplanning.</div></div>
            <div class="at-bar">
                ${isAdmin() ? `<button type="button" class="aff-btn aff-btn-primary" id="atSaveBtn" onclick="AtelierPlanner.save()">${ico('save', 'at-ico-sm')}Enregistrer le rétroplanning</button>` : ''}
                <button type="button" class="aff-btn" onclick="AtelierPlanner.reset()">${ico('undo', 'at-ico-sm')}Nouvelle simulation</button>
                ${isAdmin() ? '' : '<span class="aff-muted">Seuls les administrateurs enregistrent un rétroplanning.</span>'}
            </div>
        </section>

        <section class="aff-card" id="atCardList">
            <header class="aff-card-head"><span class="at-card-title">${ico('list')}Rétroplanning</span><span class="aff-muted" id="atListCount"></span></header>
            <div id="atList"></div>
        </section>`;
        renderSaved();
        renderList();
        root.querySelectorAll('[data-at]').forEach(el => {
            el.addEventListener(el.tagName === 'INPUT' && el.type !== 'date' ? 'input' : 'change', () => onField(el));
        });
    }

    // ---- Champs ----
    const mirrors = field => [...document.querySelectorAll(`#atelierRoot [data-at="${field}"]`)];
    function setField(field, value) {
        mirrors(field).forEach(el => {
            if (el.value !== String(value)) el.value = value;
        });
    }

    async function onField(el) {
        const field = el.dataset.at;
        const v = el.value;
        if (field === 'samu') return chooseSamu(v);
        if (field === 'nb') AT.f.nb = Number(v);
        else if (['delaiVisite', 'delaiMep', 'ecart12', 'ecartAteliers'].includes(field))
            AT.f[field] = v === '' ? '' : Number(v);
        else AT.f[field] = v;
        setField(field, v);
        if (field === 'zone') {
            const h = document.getElementById('atZoneHint');
            if (h) h.innerHTML = zoneHint();
        }
        schedule();
    }

    function chooseSamu(name) {
        const saved = AT.list.find(r => r.samu_name === name);
        const p = AT.meta.samus.find(s => s.samu_name === name);
        const keep = {
            delaiVisite: AT.f.delaiVisite,
            delaiMep: AT.f.delaiMep,
            ecart12: AT.f.ecart12,
            ecartAteliers: AT.f.ecartAteliers,
            nb: AT.f.nb
        };
        AT.f = blank();
        AT.f.samu = name;
        AT.sondFor = null; // statuts des sondages rechargés pour ce SAMU
        if (saved) {
            AT.f.id = saved.id;
            AT.f.mep = saved.mep_date;
            AT.f.nb = saved.nb_ateliers;
            AT.f.zone = saved.zone;
            AT.f.delaiVisite = saved.delai_visite_atelier;
            AT.f.delaiMep = saved.delai_mep;
            AT.f.ecart12 = saved.lignes.ecarts?.ecart12 ?? 7;
            AT.f.ecartAteliers = saved.lignes.ecarts?.ecartAteliers ?? 14;
            AT.f.jalons = { ...(saved.lignes.jalons || {}) };
            AT.f.contenus = { ...(saved.lignes.contenus || {}) };
            AT.f.planifiees = { ...(saved.lignes.planifiees || {}) };
            AT.f.heures = { ...(saved.lignes.heures || {}) };
            AT.f.invites = { ...(saved.lignes.invites || {}) };
            AT.f.teams = saved.lignes.teams || '';
            AT.f.destinataires = { userIds: [], emails: [], ...(saved.lignes.destinataires || {}) };
            AT.f.savedAt = saved.updated_at;
        } else if (p) {
            AT.f.mep = p.mep || '';
            AT.f.zone = p.zone || '';
            AT.f.nb = keep.nb;
            AT.f.delaiVisite = keep.delaiVisite;
            AT.f.delaiMep = keep.delaiMep;
            AT.f.ecart12 = keep.ecart12;
            AT.f.ecartAteliers = keep.ecartAteliers;
        }
        render();
        recompute();
    }

    function schedule() {
        clearTimeout(AT.timer);
        AT.timer = setTimeout(recompute, 250);
    }

    // ---- Simulation ----
    async function recompute() {
        const f = AT.f;
        const box = document.getElementById('atTableBox');
        const warn = document.getElementById('atWarnings');
        if (!box) return;
        renderSaved();
        if (!f.mep || !f.zone || !f.nb) {
            AT.sim = null;
            box.innerHTML =
                '<div class="at-empty">Choisissez un SAMU, une date de MEP et une zone pour simuler le rétroplanning.</div>';
            warn.innerHTML = '';
            return;
        }
        const seq = ++AT.seq;
        try {
            const r = await atApi('/affectation/ateliers/simulate', { method: 'POST', body: JSON.stringify(body()) });
            if (seq !== AT.seq) return;
            AT.sim = r;
            renderTable();
        } catch (e) {
            if (seq !== AT.seq) return;
            AT.sim = null;
            box.innerHTML = `<div class="at-empty" style="color:#b3261e;">${esc(e.message)}</div>`;
            warn.innerHTML = '';
        }
    }

    const body = () => ({
        samu_name: AT.f.samu,
        mep: AT.f.mep,
        nb: Number(AT.f.nb),
        zone: AT.f.zone,
        delaiVisite: AT.f.delaiVisite === '' ? 14 : AT.f.delaiVisite,
        delaiMep: AT.f.delaiMep === '' ? 28 : AT.f.delaiMep,
        ecart12: AT.f.ecart12 === '' ? 7 : AT.f.ecart12,
        ecartAteliers: AT.f.ecartAteliers === '' ? 14 : AT.f.ecartAteliers,
        lignes: {
            jalons: AT.f.jalons,
            contenus: AT.f.contenus,
            planifiees: AT.f.planifiees,
            heures: AT.f.heures,
            invites: AT.f.invites,
            teams: AT.f.teams,
            destinataires: AT.f.destinataires
        }
    });

    // ---- Sondages de date (un par jalon) ----
    const SD_LABEL = {
        brouillon: 'Sondage (brouillon)',
        envoye: 'Sondage en cours',
        reponses: 'Réponses en cours',
        termine: 'Sondage terminé'
    };
    const sondageOf = key => AT.sond.find(x => x.retroplanning_id === AT.f.id && x.ligne === key);
    function sondageCell(r) {
        if (r.key === 'mep' || r.key === 'livrables') return '<span class="aff-muted">—</span>';
        const sd = AT.f.id ? sondageOf(r.key) : null;
        const st = sd ? sd.statut : '';
        const label = st === 'reponses' ? `Réponses en cours (${sd.reponses})` : SD_LABEL[st] || 'Sondage';
        const off = !AT.f.id || (!sd && !isAdmin());
        return `<button type="button" class="at-sd ${st}" ${off ? 'disabled' : ''} title="${AT.f.id ? 'Concevoir ou suivre le sondage de date de ce jalon' : 'Enregistrez d’abord le rétroplanning'}" onclick="AtelierPlanner.openSondage('${r.key}')">${esc(label)}</button>`;
    }
    async function loadSondages() {
        const id = AT.f.id;
        if (!id) {
            AT.sond = [];
            AT.sondFor = null;
            return;
        }
        try {
            AT.sond = (await atApi('/affectation/ateliers-sondages')).sondages || [];
        } catch (e) {
            AT.sond = [];
        }
        AT.sondFor = id;
        if (AT.sim && document.getElementById('atTableBox')) renderTable();
    }

    // Bouton d'invitation à l'atelier, dès que le jalon est planifié
    function inviteBtn(r) {
        if (!r.planifiee || r.key === 'mep' || r.key === 'livrables' || !/^Planifi/.test(r.statut) || !AT.f.id)
            return '';
        const sent = AT.f.invites[r.key];
        return `<button type="button" class="at-sd ${sent ? 'reponses' : ''}" ${isAdmin() ? '' : 'disabled'} title="${sent ? 'Invitation déjà envoyée le ' + esc(sent.slice(0, 10).split('-').reverse().join('/')) + ' : renvoyer' : 'Envoyer l’invitation (ics avec lien Teams)'}" onclick="AtelierPlanner.openInvite('${r.key}')">${ico('calendar', 'at-ico-sm')} ${sent ? 'Invitation envoyée' : 'Inviter'}</button>`;
    }

    function renderTable() {
        if (AT.f.id && AT.sondFor !== AT.f.id) {
            AT.sondFor = AT.f.id;
            loadSondages();
        }
        const { rows, warnings } = AT.sim;
        document.getElementById('atWarnings').innerHTML = warnings
            .map(w => `<div class="at-warn">⚠ ${esc(w)}</div>`)
            .join('');
        const sel = (key, list, current, kind) =>
            `<select data-row="${key}" data-kind="${kind}">${list.map(x => `<option ${x === current ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
        // Contenu / objectifs d'un atelier : une proposition de la liste, ou un texte personnalisé (titre de l'atelier)
        const contenuCell = r => {
            const inList = AT.meta.contenus.includes(r.contenu);
            const perso = !inList || AT.f.custom[r.key];
            return `<select data-row="${r.key}" data-kind="contenus">${AT.meta.contenus
                .map(x => `<option ${!perso && x === r.contenu ? 'selected' : ''}>${esc(x)}</option>`)
                .join(
                    ''
                )}<option value="__perso__" ${perso ? 'selected' : ''}>✎ Personnalisé…</option></select>${perso ? `<input type="text" class="at-perso" data-row="${r.key}" data-kind="contenus-perso" maxlength="200" value="${esc(r.contenu)}" placeholder="Titre / objectif de l’atelier (repris dans les e-mails)" style="margin-top:4px;width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid #cfd8e6;border-radius:6px;font-size:12px;">` : ''}`;
        };
        const body = rows
            .map(r => {
                const atelier = /^a\d$/.test(r.key);
                const cls = r.key === 'mep' ? 'at-mep' : r.key === 'livrables' ? 'at-fixed' : '';
                const jalon = `<span class="at-jalon">${esc(r.jalon)}</span>`;
                const contenu = atelier ? contenuCell(r) : esc(r.contenu);
                const decale = r.proposee && r.cible && r.proposee !== r.cible;
                return `<tr class="${cls}">
                    <td>${jalon}</td>
                    <td>${contenu}</td>
                    <td>${esc(frDate(r.cible))}</td>
                    <td style="font-weight:700;${decale ? 'color:#b26a00;' : ''}">${esc(frDate(r.proposee))}</td>
                    <td>${sondageCell(r)}</td>
                    <td><div style="display:flex;flex-direction:column;gap:4px;"><input type="date" data-row="${r.key}" data-kind="planifiees" value="${esc(r.planifiee || '')}" ${isAdmin() ? '' : 'disabled'}> <input type="time" data-row="${r.key}" data-kind="heures" value="${esc((r.planifiee && AT.f.heures[r.key]) || '')}" title="Heure retenue (facultative)" ${isAdmin() && r.planifiee ? '' : 'disabled'}></div></td>
                    <td><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span class="at-badge ${r.niveau}">${esc(r.statut)}</span>${inviteBtn(r)}</div></td></tr>`;
            })
            .join('');
        document.getElementById('atTableBox').innerHTML =
            `<table class="at-table"><thead><tr><th>Jalon</th><th>Contenu / objectifs</th><th>Date cible théorique</th><th>Date proposée</th><th>Sondage</th><th>Date réellement planifiée</th><th>Statut</th></tr></thead><tbody>${body}</tbody></table>`;
        document.querySelectorAll('#atTableBox [data-row]').forEach(el => {
            el.addEventListener('change', () => {
                const key = el.dataset.row;
                const kind = el.dataset.kind;
                if (kind === 'planifiees') {
                    if (el.value) AT.f.planifiees[key] = el.value;
                    else {
                        delete AT.f.planifiees[key];
                        delete AT.f.heures[key];
                    }
                } else if (kind === 'heures') {
                    if (el.value) AT.f.heures[key] = el.value;
                    else delete AT.f.heures[key];
                } else if (kind === 'contenus') {
                    if (el.value === '__perso__') {
                        // Personnalisation : le texte actuel sert de point de départ
                        AT.f.custom[key] = true;
                        const cur = (AT.sim.rows.find(x => x.key === key) || {}).contenu;
                        if (cur) AT.f.contenus[key] = cur;
                        renderTable();
                        const field = document.querySelector(`#atTableBox input.at-perso[data-row="${key}"]`);
                        if (field) field.focus();
                        return;
                    }
                    delete AT.f.custom[key];
                    AT.f.contenus[key] = el.value;
                } else if (kind === 'contenus-perso') {
                    const t = el.value.trim();
                    if (t) AT.f.contenus[key] = t;
                    else delete AT.f.contenus[key];
                } else AT.f[kind][key] = el.value;
                schedule();
            });
        });
    }

    function renderSaved() {
        const el = document.getElementById('atSavedBadge');
        if (!el) return;
        el.innerHTML = AT.f.id
            ? `<span class="at-badge ok">Rétroplanning enregistré${AT.f.savedAt ? ` le ${esc(frShort(AT.f.savedAt.slice(0, 10)))}` : ''}</span>`
            : AT.f.samu
              ? '<span class="at-badge info">Non enregistré</span>'
              : '';
    }

    // ---- Enregistrement ----
    async function save() {
        if (!AT.f.samu) return toast('Choisissez un SAMU parmi les déploiements.', true);
        const btn = document.getElementById('atSaveBtn');
        if (btn) btn.disabled = true;
        try {
            const r = await atApi('/affectation/ateliers', { method: 'PUT', body: JSON.stringify(body()) });
            toast(r.created ? 'Rétroplanning enregistré.' : 'Rétroplanning mis à jour.');
            const [meta, list] = await Promise.all([
                atApi('/affectation/ateliers/meta'),
                atApi('/affectation/ateliers')
            ]);
            AT.meta = meta;
            AT.list = list.retroplannings || [];
            AT.f.id = r.id;
            AT.f.savedAt = new Date().toISOString();
            document.querySelectorAll('#atelierRoot [data-at="samu"]').forEach(el => (el.innerHTML = samuOptions()));
            renderSaved();
            renderList();
        } catch (e) {
            toast(e.message, true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function reset() {
        AT.f = blank();
        render();
        recompute();
    }

    // ---- Rétroplanning : un SAMU par ligne ----
    function nextMilestone(r) {
        const today = new Date().toISOString().slice(0, 10);
        const m = r.jalons.find(j => (j.planifiee || j.proposee) >= today && j.key !== 'livrables');
        return m ? `${m.jalon} — ${frShort(m.planifiee || m.proposee)}` : 'Terminé';
    }

    function renderList() {
        const box = document.getElementById('atList');
        if (!box) return;
        document.getElementById('atListCount').textContent = AT.list.length ? `${AT.list.length} SAMU` : '';
        if (!AT.list.length) {
            box.innerHTML =
                '<div class="at-empty">Aucun rétroplanning enregistré. Simulez puis enregistrez un rétroplanning pour un SAMU.</div>';
            return;
        }
        const admin = isAdmin();
        box.innerHTML = `<div style="overflow-x:auto;"><table class="at-table"><thead><tr><th>SAMU</th><th>MEP</th><th>Zone</th><th>Ateliers</th><th>Avancement</th><th>Prochain jalon</th><th>Dernière diffusion</th><th style="width:${admin ? 130 : 50}px">Actions</th></tr></thead><tbody>${AT.list
            .map(r => {
                const ateliers = r.jalons.filter(j => j.key === 'visite' || /^a\d$/.test(j.key));
                const planned = ateliers.filter(j => j.planifiee).length;
                return `<tr>
                    <td><strong>${esc(r.samu_name)}</strong></td>
                    <td>${esc(frDate(r.mep_date))}</td>
                    <td>${esc(r.zone)}</td>
                    <td>${r.nb_ateliers}</td>
                    <td><span class="at-badge ${planned === ateliers.length ? 'ok' : planned ? 'info' : ''}">${planned}/${ateliers.length} planifiés</span>${r.warnings.length ? ' <span title="' + esc(r.warnings.join(' ')) + '" style="cursor:help;">⚠️</span>' : ''}</td>
                    <td>${esc(nextMilestone(r))}</td>
                    <td>${r.last_sent_at ? esc(frShort(r.last_sent_at.slice(0, 10))) : '<span class="aff-muted">jamais</span>'}</td>
                    <td><div class="at-actions">
                        <button type="button" class="at-icon-btn edit" title="Modifier : ouvrir dans la simulation" aria-label="Modifier" onclick="AtelierPlanner.edit(${r.id})">${ico('edit', 'at-ico-sm')}</button>
                        ${
                            admin
                                ? `<button type="button" class="at-icon-btn del" title="Supprimer ce rétroplanning" aria-label="Supprimer" onclick="AtelierPlanner.remove(${r.id})">${ico('trash', 'at-ico-sm')}</button>`
                                : ''
                        }
                    </div></td></tr>`;
            })
            .join('')}</tbody></table></div>`;
    }

    function edit(id) {
        const r = AT.list.find(x => x.id === id);
        if (!r) return;
        try {
            chooseSamu(r.samu_name);
            document.getElementById('atCardSim').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            console.error(e);
            toast(`Ouverture impossible : ${e.message}`, true);
        }
    }

    async function remove(id) {
        const r = AT.list.find(x => x.id === id);
        if (!r || !confirm(`Supprimer le rétroplanning des ateliers métier de ${r.samu_name} ?`)) return;
        try {
            await atApi(`/affectation/ateliers/${id}`, { method: 'DELETE' });
            toast('Rétroplanning supprimé.');
            if (AT.f.id === id) AT.f.id = null;
            await show();
        } catch (e) {
            toast(e.message, true);
        }
    }

    // ---- Diffusion par e-mail ----
    function sendStatus(text, done) {
        let el = document.getElementById('atSendStatus');
        if (!el) {
            el = document.createElement('div');
            el.id = 'atSendStatus';
            el.setAttribute('role', 'status');
            el.style.cssText =
                'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10060;background:#1f2d3d;color:#fff;padding:12px 22px;border-radius:10px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.3);display:flex;align-items:center;gap:10px;';
            document.body.appendChild(el);
        }
        el.style.background = done ? '#2e7d32' : '#1f2d3d';
        el.innerHTML = `${done ? '✔' : '<span style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:atSpin .8s linear infinite;"></span>'} ${esc(text)}<style>@keyframes atSpin{to{transform:rotate(360deg)}}</style>`;
        clearTimeout(el._t);
        if (done) el._t = setTimeout(() => el.remove(), 3500);
    }

    let users = null;
    // ---- Champ de destinataires en « pastilles » : nom ou e-mail, propositions parmi les utilisateurs ----
    const CHIPS = {};
    const AV_COLORS = ['#4caf50', '#ff9800', '#3f51b5', '#e91e63', '#009688', '#795548', '#607d8b', '#9c27b0'];
    const nrm = v =>
        String(v || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    const isMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const personName = u => `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim();
    const chipUser = u => ({
        id: 'u' + u.id,
        uid: u.id,
        email: u.email || '',
        label: personName(u),
        initials: ((u.prenom || '').charAt(0) + (u.nom || '').charAt(0)).toUpperCase() || '?',
        color: AV_COLORS[u.id % AV_COLORS.length]
    });
    const chipFree = email => ({
        id: 'e' + email.toLowerCase(),
        email,
        label: email,
        initials: '@',
        color: '#90a4ae',
        free: true
    });
    const chipCands = () => (users || []).filter(u => u.email).map(chipUser);
    /** Pastille d'une adresse : l'utilisateur correspondant s'il existe, sinon l'adresse libre */
    const chipOfEmail = email => {
        const u = (users || []).find(x => x.email && x.email.toLowerCase() === String(email).toLowerCase());
        return u ? chipUser(u) : chipFree(email);
    };
    function chipsInit(id, { items = [], free = false, ro = false, placeholder = '' }) {
        CHIPS[id] = { items, free, ro, placeholder, opts: [], sel: 0 };
        chipsRender(id);
    }
    function chipsRender(id) {
        const st = CHIPS[id];
        const box = document.getElementById(id);
        if (!box) return;
        box.className = 'at-chips-box';
        box.innerHTML = `<div class="at-chips${st.ro ? ' ro' : ''}">${st.items
            .map(
                (it, i) =>
                    `<span class="at-chip"><i class="at-av" style="background:${it.color}">${esc(it.initials)}</i><span class="at-chip-l" title="${esc(it.email || it.label)}">${esc(it.label)}</span>${st.ro ? '' : `<button type="button" data-rm="${i}" aria-label="Retirer">×</button>`}</span>`
            )
            .join(
                ''
            )}${st.ro ? '' : `<input type="text" class="at-chips-in" placeholder="${esc(st.items.length ? '' : st.placeholder)}" autocomplete="off">`}</div><div class="at-chips-dd" hidden></div>`;
        if (st.ro) return;
        const input = box.querySelector('.at-chips-in');
        const dd = box.querySelector('.at-chips-dd');
        const add = it => {
            if (
                !it ||
                st.items.some(
                    x => x.id === it.id || (x.email && it.email && x.email.toLowerCase() === it.email.toLowerCase())
                )
            )
                return;
            st.items.push(it);
            chipsRender(id);
            box.querySelector('.at-chips-in').focus();
        };
        const refresh = () => {
            const text = input.value.trim();
            const q = nrm(text);
            const taken = x =>
                st.items.some(it => it.id === x.id || (it.email && it.email.toLowerCase() === x.email.toLowerCase()));
            st.opts = q
                ? chipCands()
                      .filter(c => !taken(c) && nrm(`${c.label} ${c.email}`).includes(q))
                      .slice(0, 8)
                : [];
            if (
                st.free &&
                isMail(text) &&
                !st.opts.some(c => c.email.toLowerCase() === text.toLowerCase()) &&
                !taken(chipFree(text))
            )
                st.opts.push(chipFree(text));
            st.sel = Math.min(st.sel, Math.max(0, st.opts.length - 1));
            dd.hidden = !st.opts.length;
            dd.innerHTML = st.opts
                .map(
                    (c, i) =>
                        `<div class="at-chips-opt${i === st.sel ? ' on' : ''}" data-i="${i}"><i class="at-av" style="background:${c.color}">${esc(c.initials)}</i><b>${c.free ? 'Ajouter ' : ''}${esc(c.label)}</b>${c.free ? '' : `<span class="aff-muted">${esc(c.email)}</span>`}</div>`
                )
                .join('');
        };
        box.querySelectorAll('[data-rm]').forEach(b =>
            b.addEventListener('click', () => {
                st.items.splice(Number(b.dataset.rm), 1);
                chipsRender(id);
                box.querySelector('.at-chips-in').focus();
            })
        );
        dd.addEventListener('mousedown', e => {
            const o = e.target.closest('.at-chips-opt');
            if (o) {
                e.preventDefault();
                add(st.opts[Number(o.dataset.i)]);
            }
        });
        input.addEventListener('input', () => {
            st.sel = 0;
            refresh();
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!st.opts.length) return;
                e.preventDefault();
                st.sel = (st.sel + (e.key === 'ArrowDown' ? 1 : -1) + st.opts.length) % st.opts.length;
                refresh();
            } else if (['Enter', 'Tab', ',', ';'].includes(e.key) && input.value.trim()) {
                const pick = st.opts[st.sel];
                if (pick) {
                    e.preventDefault();
                    add(pick);
                } else if (e.key === 'Enter') e.preventDefault();
            } else if (e.key === 'Backspace' && !input.value && st.items.length) {
                st.items.pop();
                chipsRender(id);
                box.querySelector('.at-chips-in').focus();
            }
        });
        // Adresse saisie en entier puis champ quitté : ajoutée comme destinataire libre
        input.addEventListener('blur', () => {
            const text = input.value.trim();
            setTimeout(() => {
                if (!document.getElementById(id)) return;
                if (st.free && isMail(text)) add(chipFree(text));
                else {
                    const el = document.getElementById(id).querySelector('.at-chips-in');
                    if (el) el.value = '';
                    const d2 = document.getElementById(id).querySelector('.at-chips-dd');
                    if (d2) d2.hidden = true;
                }
            }, 150);
        });
    }
    const chipsItems = id => (CHIPS[id] ? CHIPS[id].items : []);

    // Objet des e-mails : [SI-SAMU] SAMU 44 - Atelier Métier #1 | Configuration téléphonique du CRRA
    const atelierTitle = row => (/^a\d+$/.test(row.key) ? `Atelier Métier #${row.key.slice(1)}` : row.jalon);
    const samuShort = () => {
        const m = /(\d+[A-Za-z]?)\s*$/.exec(AT.f.samu || '');
        return m ? `SAMU ${m[1]}` : AT.f.samu;
    };
    // Après « | » : le contenu / objectif de l'atelier (modifiable)
    const mailTail = row => row.contenu || 'Configuration téléphonique du CRRA';
    const mailSubject = row => `[SI-SAMU] ${samuShort()} - ${atelierTitle(row)} | ${mailTail(row)}`;

    // ---- Invitation à un atelier planifié (e-mail + .ics avec lien Teams) ----
    const timeAdd1h = t => {
        const [h, m] = t.split(':').map(Number);
        return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    async function openInvite(key) {
        const row = AT.sim && AT.sim.rows.find(x => x.key === key);
        if (!row || !row.planifiee || !AT.f.id) return;
        try {
            if (!users) {
                const all = await atApi('/users');
                users = (Array.isArray(all) ? all : all.users || []).filter(u => u.actif !== 0);
            }
        } catch (e) {
            return toast(e.message, true);
        }
        // Sans destinataires déjà retenus pour les invitations, reprise de ceux du dernier sondage de ce SAMU
        let dest = AT.f.destinataires;
        if (!dest.userIds.length && !dest.emails.length) {
            try {
                const got = await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${key}`);
                const m = got.modele || got.sondage;
                if (m) dest = { userIds: [], emails: m.destinataires || [] };
            } catch (e) {
                /* aucun destinataire proposé */
            }
        }
        const me = typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
        const start = AT.f.heures[key] || '';
        const teams = AT.f.teams || ''; // lien déjà renseigné pour ce SAMU, proposé pour ses autres ateliers
        const bg = document.createElement('div');
        bg.className = 'at-modal-bg';
        bg.id = 'atMailModal';
        bg.dataset.key = key;
        bg.innerHTML = `<div class="at-modal" role="dialog" aria-label="Invitation à l’atelier">
            <h3>${ico('calendar')} Invitation — ${esc(row.jalon)} · ${esc(AT.f.samu)}</h3>
            <p class="aff-muted" style="margin:0 0 4px;font-size:12px;">${esc(row.contenu)}<br><b>${esc(frDate(row.planifiee))}${start ? ' à ' + esc(start) : ' (journée entière : aucune heure retenue)'}</b></p>
            <label>Identité (organisateur)</label>
            <select id="atMailOrg" style="width:100%;padding:8px;border:1px solid #cfd8e6;border-radius:8px;">
                <option value="">— Choisir —</option>${users.map(u => `<option value="${u.id}" ${u.id === me ? 'selected' : ''}>${esc(personName(u))}</option>`).join('')}
            </select>
            <label>Destinataires <span class="aff-muted" style="font-weight:400;">${dest.userIds.length || dest.emails.length ? '(repris pour ce SAMU, modifiables)' : '(nom ou adresse e-mail)'}</span></label>
            <div id="atMailTo"></div>
            <label>Lien de la réunion Teams <span class="aff-muted" style="font-weight:400;">${teams ? '(repris de ce SAMU, modifiable)' : '(à renseigner une fois : proposé pour les autres ateliers de ce SAMU)'}</span></label>
            <input type="text" id="atMailTeams" value="${esc(teams)}" placeholder="https://teams.microsoft.com/l/meetup-join/…">
            ${start ? `<label>Fin de l’atelier</label><input type="time" id="atMailEnd" value="${timeAdd1h(start)}" style="padding:6px 8px;border:1px solid #cfd8e6;border-radius:8px;">` : ''}
            <label>Objet</label>
            <input type="text" id="atMailSubject" value="${esc(mailSubject(row))}">
            <label>Message (facultatif)</label>
            <textarea id="atMailMessage" rows="3"></textarea>
            <div class="at-modal-actions"><button type="button" class="aff-btn" onclick="AtelierPlanner.closeMail()">Annuler</button><button type="button" class="aff-btn aff-btn-primary" id="atMailSend" onclick="AtelierPlanner.sendInvite()">${ico('mail', 'at-ico-sm')}Envoyer l’invitation</button></div>
        </div>`;
        document.body.appendChild(bg);
        chipsInit('atMailTo', {
            free: true,
            placeholder: 'Nom ou adresse e-mail…',
            items: [
                ...dest.userIds
                    .map(id => (users.find(u => u.id === id) ? chipUser(users.find(u => u.id === id)) : null))
                    .filter(Boolean),
                ...dest.emails.map(chipOfEmail)
            ].filter((it, i, all) => all.findIndex(x => x.id === it.id) === i)
        });
    }

    function closeMail() {
        const m = document.getElementById('atMailModal');
        if (m) m.remove();
    }

    async function sendInvite() {
        const key = document.getElementById('atMailModal').dataset.key;
        const items = chipsItems('atMailTo');
        const userIds = items.filter(it => it.uid).map(it => it.uid);
        const emails = items.filter(it => !it.uid).map(it => it.email);
        if (!items.length) return toast('Choisissez au moins un destinataire.', true);
        const btn = document.getElementById('atMailSend');
        btn.disabled = true;
        sendStatus('Envoi en cours…');
        try {
            const end = document.getElementById('atMailEnd');
            const r = await atApi(`/affectation/ateliers/${AT.f.id}/invitation/${key}`, {
                method: 'POST',
                body: JSON.stringify({
                    userIds,
                    emails,
                    organisateur_id: Number(document.getElementById('atMailOrg').value) || null,
                    teams: document.getElementById('atMailTeams').value,
                    heure_fin: end ? end.value : null,
                    subject: document.getElementById('atMailSubject').value,
                    message: document.getElementById('atMailMessage').value
                })
            });
            closeMail();
            sendStatus(`Invitation envoyée (${r.sent} destinataire${r.sent > 1 ? 's' : ''})`, true);
            const list = await atApi('/affectation/ateliers');
            AT.list = list.retroplannings || [];
            const saved = AT.list.find(x => x.id === AT.f.id);
            if (saved) {
                AT.f.teams = saved.lignes.teams || '';
                AT.f.invites = { ...(saved.lignes.invites || {}) };
                AT.f.destinataires = { userIds: [], emails: [], ...(saved.lignes.destinataires || {}) };
            }
            renderList();
            renderTable();
        } catch (e) {
            btn.disabled = false;
            document.getElementById('atSendStatus')?.remove();
            toast(e.message, true);
        }
    }

    // ---- Fenêtre de conception d'un sondage ----
    const SD = { key: null, data: null, row: null };
    async function loadUsers() {
        if (!users) {
            const all = await atApi('/users');
            users = (Array.isArray(all) ? all : all.users || []).filter(u => u.actif !== 0);
        }
        return users;
    }
    // Heure en deux listes : choisir l'heure suffit, les minutes valent 00 par défaut
    const sdHourSel = (cls, v, title) => {
        const [hh = '', mm = ''] = (v || '').split(':');
        const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
        if (mm && !mins.includes(mm)) (mins.push(mm), mins.sort());
        return `<span class="hm" title="${title}"><select class="${cls}h" aria-label="${title} (heure)"><option value="">--</option>${Array.from(
            { length: 24 },
            (_, i) => String(i).padStart(2, '0')
        )
            .map(h => `<option ${h === hh ? 'selected' : ''}>${h}</option>`)
            .join(
                ''
            )}</select> h <select class="${cls}m" aria-label="${title} (minutes)">${mins.map(m => `<option ${m === (mm || '00') ? 'selected' : ''}>${m}</option>`).join('')}</select></span>`;
    };
    const sdTime = (el, cls) => {
        const h = el.querySelector(`.${cls}h`).value;
        return h ? `${h}:${el.querySelector(`.${cls}m`).value || '00'}` : null;
    };
    const sdOptRow = o =>
        `<div class="at-opt" data-id="${o.id || ''}"><input type="date" class="d" value="${esc(o.date || '')}">${sdHourSel('s', o.heure, 'Heure de début')} – ${sdHourSel('e', o.heure_fin, 'Heure de fin (facultative)')}<button type="button" class="aff-btn" style="padding:3px 8px;" onclick="const b=this.closest('#sdOpts'); this.parentNode.remove(); b.dispatchEvent(new Event('change'))" title="Retirer cette date">×</button></div>`;
    const sdOrgName = u => `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim();

    async function openSondage(key) {
        const row = AT.sim && AT.sim.rows.find(x => x.key === key);
        if (!row || !AT.f.id) return;
        let all;
        try {
            all = await loadUsers();
        } catch (e) {
            return toast(e.message, true);
        }
        let sd;
        let modele; // destinataires du dernier sondage de ce SAMU, proposés pour un nouveau sondage
        try {
            const got = await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${key}`);
            sd = got.sondage;
            modele = got.modele;
        } catch (e) {
            return toast(e.message, true);
        }
        SD.key = key;
        SD.data = sd;
        SD.row = row;
        const ro = !isAdmin();
        const me = typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
        const d = sd || {
            nom: mailSubject(row),
            organisateur_id: (modele && modele.organisateur_id) || me,
            destinataires: modele ? modele.destinataires : [],
            cc_user_ids: modele ? modele.cc_user_ids : [],
            message: '',
            options: [{ date: row.proposee || row.cible || '' }],
            reponses: [],
            statut: ''
        };
        // Brouillon portant l'ancien nom par défaut (« … - Sondage - Atelier 2 ») : repris avec la nomenclature à jour
        if (sd && (!sd.statut || sd.statut === 'brouillon') && / - Sondage - /.test(sd.nom || ''))
            d.nom = mailSubject(row);
        const bg = document.createElement('div');
        bg.className = 'at-modal-bg';
        bg.id = 'atSondageModal';
        const closed = d.statut === 'termine';
        const dis = ro || closed ? 'disabled' : '';
        bg.innerHTML = `<div class="at-modal large" role="dialog" aria-label="Sondage">
            <h3>${ico('calendar')} Sondage — ${esc(row.jalon)} <span class="at-badge" id="sdBadge" style="margin-left:8px;">${esc(SD_LABEL[d.statut] || 'Nouveau')}</span></h3>
            <label>Nom du sondage</label>
            <input type="text" id="sdNom" value="${esc(d.nom)}" ${dis}>
            <label>Identité (organisateur)</label>
            <select id="sdOrg" style="width:100%;padding:8px;border:1px solid #cfd8e6;border-radius:8px;" ${dis}>
                <option value="">— Choisir —</option>${all.map(u => `<option value="${u.id}" ${u.id === d.organisateur_id ? 'selected' : ''}>${esc(sdOrgName(u))}</option>`).join('')}
            </select>
            <label>Dates et heures proposées <span class="aff-muted" style="font-weight:400;">(le calendrier s’ouvre autour de la date proposée : ${esc(frShort(row.proposee))})</span></label>
            <div id="sdOpts">${d.options.map(sdOptRow).join('')}</div>
            ${ro || closed ? '' : '<button type="button" class="aff-btn" onclick="AtelierPlanner.sondageAddDate()">+ Ajouter une date</button>'}
            <label>Destinataires du sondage ${!sd && modele ? '<span class="aff-muted" style="font-weight:400;">(repris du dernier sondage de ce SAMU, modifiables)</span>' : '<span class="aff-muted" style="font-weight:400;">(nom ou adresse e-mail)</span>'}</label>
            <div id="sdDest"></div>
            <label>En copie <span class="aff-muted" style="font-weight:400;">(utilisateurs de l’application)</span></label>
            <div id="sdCc"></div>
            <label>Message (facultatif)</label>
            <textarea id="sdMsg" rows="2" ${dis}>${esc(d.message || '')}</textarea>
            <label>Adresse d’accès unique</label>
            <div class="at-url"><input type="text" id="sdUrl" readonly value="${esc(sd ? sd.url : '')}" placeholder="Pas encore générée">${sd ? '' : `<button type="button" class="aff-btn aff-btn-primary" id="sdGen" ${ro ? 'disabled' : ''} onclick="AtelierPlanner.sondageGenerate()" title="Crée le sondage (brouillon) et son adresse d’accès, sans l’envoyer">Génération</button>`}<button type="button" class="aff-btn" ${sd ? '' : 'disabled'} onclick="AtelierPlanner.sondageCopy()">Copier</button><button type="button" class="aff-btn" ${sd ? '' : 'disabled'} onclick="AtelierPlanner.sondagePreview()" title="Ouvre la page publique du sondage dans un nouvel onglet">Prévisualiser</button></div>
            <div id="sdChoix">${sd ? sdChoix(d, ro || closed) : ''}</div>
            <div id="sdResults">${sdResults(d)}</div>
            <div class="at-modal-actions">
                ${sd && !ro ? '<button type="button" class="aff-btn" style="margin-right:auto;color:#b3261e;" onclick="AtelierPlanner.sondageDelete()">Supprimer</button>' : ''}
                <button type="button" class="aff-btn" onclick="AtelierPlanner.closeSondage()">Fermer</button>
                ${sd && !ro ? (closed ? '<button type="button" class="aff-btn aff-btn-primary" id="sdReopen" onclick="AtelierPlanner.sondageReopen()">Réouvrir</button>' : '<button type="button" class="aff-btn" id="sdClose" style="border-color:#455a64;color:#455a64;" onclick="AtelierPlanner.sondageClose()">Clôturer</button>') : ''}
                ${ro || closed ? '' : `<button type="button" class="aff-btn" id="sdSave" onclick="AtelierPlanner.sondageSave()">Enregistrer</button><button type="button" class="aff-btn aff-btn-primary" id="sdSend" onclick="AtelierPlanner.sondageSend()">${ico('mail', 'at-ico-sm')}${sd && sd.statut !== 'brouillon' ? 'Renvoyer le sondage' : 'Envoyer le sondage'}</button>`}
            </div>
        </div>`;
        document.body.appendChild(bg);
        if (ro || closed)
            bg.querySelectorAll('#sdOpts input, #sdOpts select, #sdOpts button').forEach(el => (el.disabled = true));
        // Les dates du formulaire alimentent aussitôt la liste « Créneau retenu »
        document.getElementById('sdOpts').addEventListener('input', sdRenderChoix);
        document.getElementById('sdOpts').addEventListener('change', sdRenderChoix);
        // Heure de fin proposée : début + 1 h, tant que l'heure de fin n'a pas été choisie à la main
        document.getElementById('sdOpts').addEventListener('change', e => {
            const row = e.target.closest('.at-opt');
            if (!row) return;
            const cls = e.target.className;
            if (cls === 'eh' || cls === 'em') {
                row.dataset.auto = '';
                return;
            }
            if (cls !== 'sh' && cls !== 'sm') return;
            const eh = row.querySelector('.eh');
            if (eh.value && row.dataset.auto !== '1') return;
            const h = row.querySelector('.sh').value;
            if (!h || Number(h) >= 23) {
                if (row.dataset.auto === '1') eh.value = '';
                return;
            }
            eh.value = String(Number(h) + 1).padStart(2, '0');
            row.querySelector('.em').value = row.querySelector('.sm').value;
            row.dataset.auto = '1';
        });
        chipsInit('sdDest', {
            free: true,
            ro: !!(ro || closed),
            placeholder: 'Nom ou adresse e-mail…',
            items: (d.destinataires || []).map(chipOfEmail)
        });
        chipsInit('sdCc', {
            ro: !!(ro || closed),
            placeholder: 'Nom d’un utilisateur…',
            items: (d.cc_user_ids || [])
                .map(id => users.find(u => u.id === id))
                .filter(Boolean)
                .map(chipUser)
        });
    }

    const sdLabel = o => `${frDate(o.date)}${o.heure ? ` · ${o.heure}${o.heure_fin ? ' – ' + o.heure_fin : ''}` : ''}`;
    // Créneau retenu : une des dates proposées, avec le nombre de réponses favorables
    function sdChoix(d, locked) {
        if (!d.options.length) return '';
        return `<label>Créneau retenu${locked && !d.option_retenue_id ? ' <span class="aff-muted" style="font-weight:400;">(aucun)</span>' : ''}</label>${locked ? `<div class="aff-muted" style="font-size:12px;margin-bottom:4px;">${d.statut === 'termine' ? '🔒 Sondage clôturé : cliquez sur « Réouvrir » pour changer le créneau retenu.' : 'Lecture seule : seuls les administrateurs choisissent le créneau retenu.'}</div>` : '<div class="aff-muted" style="font-size:12px;margin-bottom:4px;">Cochez le créneau à retenir, puis « Clôturer ».</div>'}${d.options
            .map(
                o =>
                    `<label style="display:flex;align-items:center;gap:8px;margin:0;padding:3px 0;font-weight:600;cursor:pointer;"><input type="radio" name="sdRet" value="${o.id || ''}" ${o.id && d.option_retenue_id === o.id ? 'checked' : ''} ${locked || !o.id ? 'disabled' : ''} style="width:16px;height:16px;margin:0;flex:0 0 16px;"> ${esc(sdLabel(o))} ${o.id ? `<span class="aff-muted" style="font-weight:400;">${d.reponses.filter(r => r.options.includes(o.id)).length} réponse(s)</span>` : '<span style="font-weight:400;color:#b26a00;">date non enregistrée : cliquez sur « Enregistrer » pour pouvoir la retenir</span>'}</label>`
            )
            .join('')}`;
    }

    // « Créneau retenu » : dates du formulaire (enregistrées ou non), réponses issues du serveur
    function sdRenderChoix() {
        const box = document.getElementById('sdChoix');
        const d = SD.data;
        if (!box || !d) return;
        const locked = !isAdmin() || d.statut === 'termine';
        const kept = document.querySelector('input[name="sdRet"]:checked');
        const rows = [...document.querySelectorAll('#sdOpts .at-opt')]
            .map(el => ({
                id: el.dataset.id ? Number(el.dataset.id) : null,
                date: el.querySelector('.d').value,
                heure: sdTime(el, 's'),
                heure_fin: sdTime(el, 'e')
            }))
            .filter(o => o.date);
        box.innerHTML = sdChoix(
            {
                ...d,
                options: locked || !rows.length ? d.options : rows,
                option_retenue_id: kept && !locked ? Number(kept.value) : d.option_retenue_id
            },
            locked
        );
    }

    async function refreshRetro() {
        AT.list = (await atApi('/affectation/ateliers')).retroplannings || [];
        const r = AT.list.find(x => x.id === AT.f.id);
        if (r) {
            AT.f.planifiees = { ...(r.lignes.planifiees || {}) };
            AT.f.heures = { ...(r.lignes.heures || {}) };
        }
        closeSondage();
        await loadSondages();
        recompute();
    }

    async function sondageClose() {
        const pick = document.querySelector('input[name="sdRet"]:checked');
        const opt = pick && SD.data && SD.data.options.find(o => o.id === Number(pick.value));
        const msg = opt
            ? `Clôturer le sondage avec le créneau retenu :\n${sdLabel(opt)}\n\nLa date réellement planifiée du jalon sera renseignée (date et heure). Les réponses ne seront plus modifiables.`
            : 'Clôturer le sondage sans créneau retenu ?\n\nLes réponses ne seront plus modifiables.';
        if (!confirm(msg)) return;
        try {
            await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}/close`, {
                method: 'POST',
                body: JSON.stringify({ option_id: opt ? opt.id : null })
            });
            toast(opt ? `Sondage terminé : ${sdLabel(opt)}.` : 'Sondage clôturé.');
            await refreshRetro();
        } catch (e) {
            toast(e.message, true);
        }
    }

    async function sondageReopen() {
        if (!confirm('Rouvrir le sondage ? Il redevient modifiable et accepte de nouveau des réponses.')) return;
        try {
            await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}/reopen`, { method: 'POST', body: '{}' });
            toast('Sondage rouvert.');
            await refreshRetro();
        } catch (e) {
            toast(e.message, true);
        }
    }

    const SD_REFRESH_ICO =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px;"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>';
    // Réponses reçues, avec un bouton pour les actualiser sans perdre la saisie en cours
    function sdResults(d) {
        if (!d.id) return '';
        const opts = d.options;
        const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;"><span style="font-size:12px;font-weight:700;color:#455a64;">Réponses (${d.reponses.length})</span><button type="button" class="aff-btn" id="sdRefresh" style="border-color:#1d70b7;color:#1d70b7;font-weight:700;" onclick="AtelierPlanner.sondageRefresh()" title="Recharger les réponses reçues">${SD_REFRESH_ICO}Actualiser</button></div>`;
        if (!d.reponses.length)
            return `${head}<div class="aff-muted" style="padding:8px 0;font-size:12px;">Aucune réponse pour le moment.</div>`;
        return `${head}<div style="overflow:auto;"><table class="at-res"><thead><tr><th class="nom">Nom</th>${opts.map(o => `<th>${esc(frShort(o.date))}${o.heure ? '<br>' + esc(o.heure) : ''}</th>`).join('')}</tr></thead><tbody>${d.reponses
            .map(
                r =>
                    `<tr><td class="nom">${esc(r.nom)}</td>${opts.map(o => (r.options.includes(o.id) ? '<td class="oui">✓</td>' : '<td>–</td>')).join('')}</tr>`
            )
            .join(
                ''
            )}<tr><td class="nom"><b>Total</b></td>${opts.map(o => `<td><b>${d.reponses.filter(r => r.options.includes(o.id)).length}</b></td>`).join('')}</tr></tbody></table></div>`;
    }

    async function sondageRefresh() {
        const btn = document.getElementById('sdRefresh');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '.6';
        }
        try {
            const sd = (await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}`)).sondage;
            if (!sd) throw new Error('Sondage introuvable');
            SD.data = sd;
            sdRenderChoix();
            document.getElementById('sdResults').innerHTML = sdResults(sd);
            const badge = document.getElementById('sdBadge');
            if (badge) badge.textContent = SD_LABEL[sd.statut] || 'Nouveau';
            toast(`Réponses actualisées (${sd.reponses.length}).`);
            loadSondages();
        } catch (e) {
            const again = document.getElementById('sdRefresh');
            if (again) {
                again.disabled = false;
                again.style.opacity = '';
            }
            toast(e.message, true);
        }
    }

    function sondageForm() {
        const options = [...document.querySelectorAll('#sdOpts .at-opt')]
            .map(el => ({
                id: el.dataset.id ? Number(el.dataset.id) : undefined,
                date: el.querySelector('.d').value,
                heure: sdTime(el, 's'),
                heure_fin: sdTime(el, 'e')
            }))
            .filter(o => o.date);
        return {
            nom: document.getElementById('sdNom').value,
            organisateur_id: Number(document.getElementById('sdOrg').value) || null,
            options,
            destinataires: chipsItems('sdDest').map(it => it.email),
            cc_user_ids: chipsItems('sdCc').map(it => it.uid),
            message: document.getElementById('sdMsg').value
        };
    }

    // Crée le sondage (brouillon) pour obtenir son adresse, puis rouvre la fenêtre sur le sondage créé
    async function sondageGenerate() {
        const btn = document.getElementById('sdGen');
        try {
            const body = sondageForm();
            if (btn) btn.disabled = true;
            await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            const key = SD.key;
            closeSondage();
            await loadSondages();
            toast('Adresse générée. Le sondage reste en brouillon tant que le mail n’est pas envoyé.');
            await openSondage(key);
        } catch (e) {
            if (btn) btn.disabled = false;
            toast(e.message, true);
        }
    }

    async function sondageSave(thenSend) {
        const btns = ['sdSave', 'sdSend'].map(i => document.getElementById(i)).filter(Boolean);
        try {
            const body = sondageForm();
            btns.forEach(b => (b.disabled = true));
            await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            if (thenSend) {
                const sent = await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}/send`, {
                    method: 'POST',
                    body: '{}'
                });
                toast(
                    `Sondage envoyé (${sent.sent} destinataire${sent.sent > 1 ? 's' : ''}${sent.cc ? `, ${sent.cc} en copie` : ''}).`
                );
            } else {
                toast('Données enregistrées.');
            }
            const key = SD.key;
            closeSondage();
            await loadSondages();
            // Enregistrer seul : la fenêtre reste ouverte (rechargée avec les données enregistrées)
            if (!thenSend) await openSondage(key);
        } catch (e) {
            btns.forEach(b => (b.disabled = false));
            toast(e.message, true);
        }
    }

    async function sondageDelete() {
        if (!confirm('Supprimer ce sondage, ses dates et ses réponses ?')) return;
        try {
            await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}`, { method: 'DELETE' });
            closeSondage();
            await loadSondages();
        } catch (e) {
            toast(e.message, true);
        }
    }

    function closeSondage() {
        const m = document.getElementById('atSondageModal');
        if (m) m.remove();
    }

    function sondagePreview() {
        const v = document.getElementById('sdUrl').value;
        if (/^https?:\/\//.test(v)) window.open(v, '_blank', 'noopener');
    }

    async function sondageCopy() {
        const v = document.getElementById('sdUrl').value;
        try {
            await navigator.clipboard.writeText(v);
            toast('Adresse copiée.');
        } catch (e) {
            document.getElementById('sdUrl').select();
        }
    }

    function sondageAddDate() {
        const last = [...document.querySelectorAll('#sdOpts .at-opt .d')].pop();
        const tpl = document.createElement('div');
        tpl.innerHTML = sdOptRow({ date: (last && last.value) || (SD.row && (SD.row.proposee || SD.row.cible)) || '' });
        document.getElementById('sdOpts').appendChild(tpl.firstChild);
        sdRenderChoix();
    }

    window.AtelierPlanner = {
        show,
        save,
        reset,
        edit,
        remove,
        openInvite,
        closeMail,
        sendInvite,
        openSondage,
        closeSondage,
        sondageSave: () => sondageSave(false),
        sondageSend: () => sondageSave(true),
        sondageDelete,
        sondageClose,
        sondageReopen,
        sondageCopy,
        sondageGenerate,
        sondageRefresh,
        sondagePreview,
        sondageAddDate,
        resetZone() {
            const p = currentProject();
            if (p && p.zone) {
                AT.f.zone = p.zone;
                setField('zone', p.zone);
                document.getElementById('atZoneHint').innerHTML = zoneHint();
                schedule();
            }
        }
    };
})();
