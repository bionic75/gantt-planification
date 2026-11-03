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
        pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>'
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
        #atelierRoot table.at-table select, #atelierRoot table.at-table input[type=date] { width: 100%; min-width: 150px; padding: 5px 7px; border: 1px solid #cfd8e6; border-radius: 6px; font-size: 12px; box-sizing: border-box; }
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
        #atelierRoot .at-icon-btn.mail { background: #1d70b7; }
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
        .at-modal .at-opt input.h, .at-modal .at-opt input.f { width: 120px !important; flex: 0 0 120px; }
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
        lignes: { jalons: AT.f.jalons, contenus: AT.f.contenus, planifiees: AT.f.planifiees, heures: AT.f.heures }
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
        const body = rows
            .map(r => {
                const atelier = /^a\d$/.test(r.key);
                const cls = r.key === 'mep' ? 'at-mep' : r.key === 'livrables' ? 'at-fixed' : '';
                const jalon = `<span class="at-jalon">${esc(r.jalon)}</span>`;
                const contenu = atelier ? sel(r.key, AT.meta.contenus, r.contenu, 'contenus') : esc(r.contenu);
                const decale = r.proposee && r.cible && r.proposee !== r.cible;
                return `<tr class="${cls}">
                    <td>${jalon}</td>
                    <td>${contenu}</td>
                    <td>${esc(frDate(r.cible))}</td>
                    <td style="font-weight:700;${decale ? 'color:#b26a00;' : ''}">${esc(frDate(r.proposee))}</td>
                    <td>${sondageCell(r)}</td>
                    <td style="white-space:nowrap;"><input type="date" data-row="${r.key}" data-kind="planifiees" value="${esc(r.planifiee || '')}" ${isAdmin() ? '' : 'disabled'}> <input type="time" data-row="${r.key}" data-kind="heures" value="${esc((r.planifiee && AT.f.heures[r.key]) || '')}" title="Heure retenue (facultative)" ${isAdmin() && r.planifiee ? '' : 'disabled'} style="width:96px;"></td>
                    <td><span class="at-badge ${r.niveau}">${esc(r.statut)}</span></td></tr>`;
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
                                ? `<button type="button" class="at-icon-btn del" title="Supprimer ce rétroplanning" aria-label="Supprimer" onclick="AtelierPlanner.remove(${r.id})">${ico('trash', 'at-ico-sm')}</button>
                        <button type="button" class="at-icon-btn mail" title="Diffuser le calendrier par e-mail" aria-label="Diffuser par e-mail" onclick="AtelierPlanner.openMail(${r.id})">${ico('mail', 'at-ico-sm')}</button>`
                                : ''
                        }
                    </div></td></tr>`;
            })
            .join('')}</tbody></table></div>`;
    }

    function edit(id) {
        const r = AT.list.find(x => x.id === id);
        if (!r) return;
        chooseSamu(r.samu_name);
        document.getElementById('atCardSim').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    async function openMail(id) {
        const r = AT.list.find(x => x.id === id);
        if (!r) return;
        try {
            if (!users) {
                const all = await atApi('/users');
                users = (Array.isArray(all) ? all : all.users || []).filter(u => u.actif !== 0);
            }
        } catch (e) {
            return toast(e.message, true);
        }
        const bg = document.createElement('div');
        bg.className = 'at-modal-bg';
        bg.id = 'atMailModal';
        bg.innerHTML = `<div class="at-modal" role="dialog" aria-label="Diffuser le calendrier">
            <h3>${ico('mail')} Diffuser le calendrier — ${esc(r.samu_name)}</h3>
            <label>Destinataires (utilisateurs de l’application)</label>
            <input type="text" id="atMailFilter" placeholder="Filtrer par nom…" style="margin-bottom:6px;">
            <div class="at-users" id="atMailUsers">${users
                .filter(u => u.email)
                .map(
                    u =>
                        `<label data-n="${esc(`${u.prenom} ${u.nom}`.toLowerCase())}"><input type="checkbox" value="${u.id}"> ${esc(u.prenom)} ${esc((u.nom || '').toUpperCase())} <span class="aff-muted">${esc(u.email)}</span></label>`
                )
                .join('')}</div>
            <label>Autres adresses e-mail (une par ligne)</label>
            <textarea id="atMailExtra" rows="3" placeholder="prenom.nom@exemple.fr"></textarea>
            <div id="atMailExtraErr" style="color:#c62828;font-size:11px;margin-top:3px;"></div>
            <label>Objet</label>
            <input type="text" id="atMailSubject" value="${esc(`Rétroplanning des ateliers métier — ${r.samu_name}`)}">
            <label>Message (facultatif)</label>
            <textarea id="atMailMessage" rows="3"></textarea>
            <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-top:12px;"><input type="checkbox" id="atMailIcs" checked style="width:16px;height:16px;margin:0;"> Joindre le calendrier (.ics) : un événement par jalon</label>
            <div class="at-modal-actions"><button type="button" class="aff-btn" onclick="AtelierPlanner.closeMail()">Annuler</button><button type="button" class="aff-btn aff-btn-primary" id="atMailSend" onclick="AtelierPlanner.sendMail(${id})">${ico('mail', 'at-ico-sm')}Envoyer</button></div>
        </div>`;
        document.body.appendChild(bg);
        document.getElementById('atMailFilter').addEventListener('input', e => {
            const q = e.target.value.toLowerCase().trim();
            document
                .querySelectorAll('#atMailUsers label')
                .forEach(l => (l.style.display = !q || l.dataset.n.includes(q) ? 'flex' : 'none'));
        });
        const extra = document.getElementById('atMailExtra');
        extra.addEventListener('input', () => {
            const { invalid } = window.parseEmailLines ? parseEmailLines(extra.value) : { invalid: [] };
            document.getElementById('atMailExtraErr').textContent = invalid.length
                ? `Adresse(s) invalide(s) : ${invalid.join(' · ')}`
                : '';
        });
    }

    function closeMail() {
        const m = document.getElementById('atMailModal');
        if (m) m.remove();
    }

    async function sendMail(id) {
        const userIds = [...document.querySelectorAll('#atMailUsers input:checked')].map(i => Number(i.value));
        const parsed = window.parseEmailLines
            ? parseEmailLines(document.getElementById('atMailExtra').value)
            : { valid: [], invalid: [] };
        if (parsed.invalid.length) return toast(`Adresse(s) e-mail invalide(s) : ${parsed.invalid.join(', ')}`, true);
        if (!userIds.length && !parsed.valid.length) return toast('Choisissez au moins un destinataire.', true);
        const btn = document.getElementById('atMailSend');
        btn.disabled = true;
        sendStatus('Envoi en cours…');
        try {
            const r = await atApi(`/affectation/ateliers/${id}/send`, {
                method: 'POST',
                body: JSON.stringify({
                    userIds,
                    emails: parsed.valid,
                    subject: document.getElementById('atMailSubject').value,
                    message: document.getElementById('atMailMessage').value,
                    ics: document.getElementById('atMailIcs').checked
                })
            });
            closeMail();
            sendStatus(`Envoi terminé (${r.sent} destinataire${r.sent > 1 ? 's' : ''})`, true);
            const list = await atApi('/affectation/ateliers');
            AT.list = list.retroplannings || [];
            renderList();
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
    const sdOptRow = o =>
        `<div class="at-opt" data-id="${o.id || ''}"><input type="date" class="d" value="${esc(o.date || '')}"><input type="time" class="h" value="${esc(o.heure || '')}" title="Heure de début"> – <input type="time" class="f" value="${esc(o.heure_fin || '')}" title="Heure de fin (facultative)"><button type="button" class="aff-btn" style="padding:3px 8px;" onclick="this.parentNode.remove()" title="Retirer cette date">×</button></div>`;
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
        try {
            sd = (await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${key}`)).sondage;
        } catch (e) {
            return toast(e.message, true);
        }
        SD.key = key;
        SD.data = sd;
        SD.row = row;
        const ro = !isAdmin();
        const me = typeof currentUser !== 'undefined' && currentUser ? currentUser.id : null;
        const d = sd || {
            nom: `[SI-SAMU] ${AT.f.samu} - Sondage - ${row.jalon}`,
            organisateur_id: me,
            destinataires: [],
            cc_user_ids: [],
            message: '',
            options: [{ date: row.proposee || row.cible || '' }],
            reponses: [],
            statut: ''
        };
        const bg = document.createElement('div');
        bg.className = 'at-modal-bg';
        bg.id = 'atSondageModal';
        const closed = d.statut === 'termine';
        const dis = ro || closed ? 'disabled' : '';
        bg.innerHTML = `<div class="at-modal large" role="dialog" aria-label="Sondage">
            <h3>${ico('calendar')} Sondage — ${esc(row.jalon)} <span class="at-badge" style="margin-left:8px;">${esc(SD_LABEL[d.statut] || 'Nouveau')}</span></h3>
            <label>Nom du sondage</label>
            <input type="text" id="sdNom" value="${esc(d.nom)}" ${dis}>
            <label>Identité (organisateur)</label>
            <select id="sdOrg" style="width:100%;padding:8px;border:1px solid #cfd8e6;border-radius:8px;" ${dis}>
                <option value="">— Choisir —</option>${all.map(u => `<option value="${u.id}" ${u.id === d.organisateur_id ? 'selected' : ''}>${esc(sdOrgName(u))}</option>`).join('')}
            </select>
            <label>Dates et heures proposées <span class="aff-muted" style="font-weight:400;">(le calendrier s’ouvre autour de la date proposée : ${esc(frShort(row.proposee))})</span></label>
            <div id="sdOpts">${d.options.map(sdOptRow).join('')}</div>
            ${ro || closed ? '' : '<button type="button" class="aff-btn" onclick="AtelierPlanner.sondageAddDate()">+ Ajouter une date</button>'}
            <label>Destinataires du sondage (adresses e-mail, une par ligne)</label>
            <textarea id="sdDest" rows="3" placeholder="prenom.nom@exemple.fr" ${dis}>${esc((d.destinataires || []).join('\n'))}</textarea>
            <div id="sdDestErr" style="color:#c62828;font-size:11px;margin-top:3px;"></div>
            <label>En copie (utilisateurs de l’application)</label>
            <input type="text" id="sdCcFilter" placeholder="Filtrer par nom…" style="margin-bottom:6px;">
            <div class="at-users" id="sdCc">${all
                .filter(u => u.email)
                .map(
                    u =>
                        `<label data-n="${esc(sdOrgName(u).toLowerCase())}"><input type="checkbox" value="${u.id}" ${(d.cc_user_ids || []).includes(u.id) ? 'checked' : ''} ${dis}> ${esc(sdOrgName(u))} <span class="aff-muted">${esc(u.email)}</span></label>`
                )
                .join('')}</div>
            <label>Message (facultatif)</label>
            <textarea id="sdMsg" rows="2" ${dis}>${esc(d.message || '')}</textarea>
            <label>Adresse d’accès unique</label>
            <div class="at-url"><input type="text" id="sdUrl" readonly value="${esc(sd ? sd.url : 'Générée à l’enregistrement')}"><button type="button" class="aff-btn" ${sd ? '' : 'disabled'} onclick="AtelierPlanner.sondageCopy()">Copier</button><button type="button" class="aff-btn" ${sd ? '' : 'disabled'} onclick="AtelierPlanner.sondagePreview()" title="Ouvre la page publique du sondage dans un nouvel onglet">Prévisualiser</button></div>
            <div id="sdChoix">${sd ? sdChoix(d, ro || closed) : ''}</div>
            <div id="sdResults">${sdResults(d)}</div>
            <div class="at-modal-actions">
                ${sd && !ro ? '<button type="button" class="aff-btn" style="margin-right:auto;color:#b3261e;" onclick="AtelierPlanner.sondageDelete()">Supprimer</button>' : ''}
                <button type="button" class="aff-btn" onclick="AtelierPlanner.closeSondage()">Fermer</button>
                ${sd && !ro ? (closed ? '<button type="button" class="aff-btn aff-btn-primary" id="sdReopen" onclick="AtelierPlanner.sondageReopen()">Réouvrir</button>' : '<button type="button" class="aff-btn" id="sdClose" style="border-color:#455a64;color:#455a64;" onclick="AtelierPlanner.sondageClose()">Clôturer</button>') : ''}
                ${ro || closed ? '' : `<button type="button" class="aff-btn" id="sdSave" onclick="AtelierPlanner.sondageSave()">Enregistrer</button><button type="button" class="aff-btn aff-btn-primary" id="sdSend" onclick="AtelierPlanner.sondageSend()">${ico('mail', 'at-ico-sm')}${sd && sd.statut !== 'brouillon' ? 'Renvoyer le mail' : 'Envoyer le mail'}</button>`}
            </div>
        </div>`;
        document.body.appendChild(bg);
        if (ro || closed)
            bg.querySelectorAll('#sdOpts input, #sdOpts button, .at-modal > button').forEach(
                el => (el.disabled = true)
            );
        document.getElementById('sdCcFilter').addEventListener('input', e => {
            const q = e.target.value.toLowerCase().trim();
            document
                .querySelectorAll('#sdCc label')
                .forEach(l => (l.style.display = !q || l.dataset.n.includes(q) ? 'flex' : 'none'));
        });
    }

    const sdLabel = o => `${frDate(o.date)}${o.heure ? ` · ${o.heure}${o.heure_fin ? ' – ' + o.heure_fin : ''}` : ''}`;
    // Créneau retenu : une des dates proposées, avec le nombre de réponses favorables
    function sdChoix(d, locked) {
        if (!d.options.length) return '';
        return `<label>Créneau retenu${locked && !d.option_retenue_id ? ' <span class="aff-muted" style="font-weight:400;">(aucun)</span>' : ''}</label>${d.options
            .map(
                o =>
                    `<label style="display:flex;align-items:center;gap:8px;margin:0;padding:3px 0;font-weight:600;cursor:pointer;"><input type="radio" name="sdRet" value="${o.id}" ${d.option_retenue_id === o.id ? 'checked' : ''} ${locked ? 'disabled' : ''} style="width:16px;height:16px;margin:0;flex:0 0 16px;"> ${esc(sdLabel(o))} <span class="aff-muted" style="font-weight:400;">${d.reponses.filter(r => r.options.includes(o.id)).length} réponse(s)</span></label>`
            )
            .join('')}`;
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

    function sdResults(d) {
        if (!d.reponses || !d.reponses.length) return '';
        const opts = d.options;
        return `<label>Réponses (${d.reponses.length})</label><div style="overflow:auto;"><table class="at-res"><thead><tr><th class="nom">Nom</th>${opts.map(o => `<th>${esc(frShort(o.date))}${o.heure ? '<br>' + esc(o.heure) : ''}</th>`).join('')}</tr></thead><tbody>${d.reponses
            .map(
                r =>
                    `<tr><td class="nom">${esc(r.nom)}</td>${opts.map(o => (r.options.includes(o.id) ? '<td class="oui">✓</td>' : '<td>–</td>')).join('')}</tr>`
            )
            .join(
                ''
            )}<tr><td class="nom"><b>Total</b></td>${opts.map(o => `<td><b>${d.reponses.filter(r => r.options.includes(o.id)).length}</b></td>`).join('')}</tr></tbody></table></div>`;
    }

    function sondageForm() {
        const options = [...document.querySelectorAll('#sdOpts .at-opt')]
            .map(el => ({
                id: el.dataset.id ? Number(el.dataset.id) : undefined,
                date: el.querySelector('.d').value,
                heure: el.querySelector('.h').value || null,
                heure_fin: el.querySelector('.f').value || null
            }))
            .filter(o => o.date);
        const parsed = window.parseEmailLines
            ? parseEmailLines(document.getElementById('sdDest').value)
            : { valid: [], invalid: [] };
        document.getElementById('sdDestErr').textContent = parsed.invalid.length
            ? `Adresse(s) invalide(s) : ${parsed.invalid.join(' · ')}`
            : '';
        if (parsed.invalid.length) throw new Error(`Adresse(s) e-mail invalide(s) : ${parsed.invalid.join(', ')}`);
        return {
            nom: document.getElementById('sdNom').value,
            organisateur_id: Number(document.getElementById('sdOrg').value) || null,
            options,
            destinataires: parsed.valid,
            cc_user_ids: [...document.querySelectorAll('#sdCc input:checked')].map(i => Number(i.value)),
            message: document.getElementById('sdMsg').value
        };
    }

    async function sondageSave(thenSend) {
        const btns = ['sdSave', 'sdSend'].map(i => document.getElementById(i)).filter(Boolean);
        try {
            const body = sondageForm();
            btns.forEach(b => (b.disabled = true));
            const r = await atApi(`/affectation/ateliers/${AT.f.id}/sondages/${SD.key}`, {
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
                toast(`Sondage enregistré. Adresse : ${r.sondage.url}`);
            }
            closeSondage();
            await loadSondages();
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
    }

    window.AtelierPlanner = {
        show,
        save,
        reset,
        edit,
        remove,
        openMail,
        closeMail,
        sendMail,
        openSondage,
        closeSondage,
        sondageSave: () => sondageSave(false),
        sondageSend: () => sondageSave(true),
        sondageDelete,
        sondageClose,
        sondageReopen,
        sondageCopy,
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
