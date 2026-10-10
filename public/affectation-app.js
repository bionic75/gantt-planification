// Application « Aide à l'affectation opérationnelle » — onglets : Planning des déploiements, Administration
(function () {
    'use strict';

    const KEY = 'affectation';
    const ICON = {
        planning: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h5M11 18h5"/>',
        admin: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        target: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
        rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
        palette: '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>',
        pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
        trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'
    };
    const svg = (name, cls, style) => `<svg class="${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" ${style ? `style="${style}"` : ''}>${ICON[name]}</svg>`;

    let visible = false;
    let timerLoop = null;
    let onlineTimer = null;

    const css = `
        #affectationContainer .aff-panel { padding: 24px 28px; }
        #affectationContainer .aff-empty {
            max-width: 720px; margin: 40px auto; padding: 44px 32px; text-align: center;
            background: #fff; border: 1px dashed #b8c4d6; border-radius: 16px;
        }
        #affectationContainer .aff-empty .aff-badge {
            width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 20px;
            background: linear-gradient(135deg, #14b8a6, #0f766e); display: flex; align-items: center; justify-content: center;
            box-shadow: 0 10px 24px rgba(15, 118, 110, .35);
        }
        #affectationContainer .aff-empty .aff-badge svg { width: 40px; height: 40px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        #affectationContainer .aff-empty h2 { margin: 0 0 8px; border: none; padding: 0; color: #0f766e; font-size: 22px; }
        #affectationContainer .aff-empty p { margin: 0; color: #5d6f84; font-size: 14px; line-height: 1.6; }
        #affectationContainer .aff-pill {
            position: fixed; top: 10px; background: #fff; height: 32px; box-sizing: border-box; padding: 0 12px; border-radius: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,.2); z-index: 1001; display: flex; align-items: center; font-size: 13px; color: #2c3e50;
        }
        #affectationTimerDisplay { right: 10px; font-weight: bold; }
        #affectationOnlineUsersContainer { right: 120px; gap: 6px; font-size: 11px; color: #666; }
    `;


    const css2 = `
        #affectationContainer .aff-card { background: #fff; border: 1px solid #dfe5ef; border-radius: 14px; margin: 18px 0; padding: 16px 20px 18px; box-shadow: 0 2px 8px rgba(30,60,110,.06); }
        #affectationContainer .aff-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
        .aff-card-title { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: #0f4c5c; }
        .aff-ico { width: 22px; height: 22px; fill: none; stroke: #0f766e; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
        .aff-ico-sm { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
        .aff-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border: 1px solid #cfd8e6; border-radius: 9px; background: #fff; color: #33475b; font-size: 13px; font-weight: 600; cursor: pointer; }
        .aff-btn:hover { background: #f1f5fa; }
        .aff-btn-primary { background: linear-gradient(135deg, #14b8a6, #0f766e); border-color: transparent; color: #fff; }
        .aff-btn-primary:hover { filter: brightness(1.08); background: linear-gradient(135deg, #14b8a6, #0f766e); }
        .aff-muted { color: #7a8799; font-size: 13px; }
        .aff-error { color: #c62828; font-size: 13px; font-weight: 600; margin-right: auto; }
        .aff-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; color: #4a5b70; margin-bottom: 12px; }
        .aff-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -2px; }
        .aff-proj { display: grid; grid-template-columns: 230px 1fr auto; gap: 16px; align-items: center; padding: 12px 8px; border-top: 1px solid #eef1f6; }
        .aff-proj:first-child { border-top: none; }
        .aff-proj-name { font-weight: 700; color: #1f2d3d; font-size: 14px; }
        .aff-proj-sub { font-size: 12px; color: #6b7a8d; margin-top: 3px; display: flex; align-items: center; gap: 5px; }
        .aff-proj-sub svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; }
        .aff-tl { position: relative; height: 30px; background: #f3f6fb; border-radius: 8px; overflow: hidden; }
        .aff-tl-seg { position: absolute; top: 5px; height: 20px; border-radius: 5px; opacity: .92; }
        .aff-tl-seg:hover { opacity: 1; outline: 2px solid rgba(0,0,0,.25); }
        .aff-tl-mark { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1px; }
        .aff-tl-scale { display: flex; justify-content: space-between; font-size: 10.5px; color: #8a99ad; margin-top: 3px; }
        .aff-row-actions { display: flex; gap: 6px; }
        .aff-icon-btn { width: 32px; height: 32px; border: none; border-radius: 8px; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .aff-icon-btn:hover { filter: brightness(1.12); }
        .aff-colors { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px 18px; }
        .aff-color-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #e6ebf3; border-radius: 10px; }
        .aff-color-row input[type="color"] { width: 38px; height: 30px; padding: 0; border: 1px solid #cfd8e6; border-radius: 6px; background: #fff; cursor: pointer; }
        .aff-color-row .lbl { flex: 1; font-size: 13px; color: #2c3e50; }
        .aff-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
        .aff-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid #e6ebf3; position: sticky; top: 0; background: #fff; z-index: 3; }
        .aff-x { border: none; background: transparent; cursor: pointer; color: #7a8799; padding: 6px; border-radius: 8px; display: inline-flex; }
        .aff-x:hover { background: #eef1f6; }
        .aff-modal-body { padding: 18px 22px; }
        .aff-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid #e6ebf3; position: sticky; bottom: 0; background: #fff; z-index: 3; }
        .aff-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px 18px; }
        .aff-field label.lbl { display: block; font-size: 12px; font-weight: 700; color: #4a5b70; margin-bottom: 5px; }
        .aff-field input, .aff-field select { width: 100%; padding: 9px 10px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 14px; background: #fff; }
        .aff-field input:focus, .aff-field select:focus { outline: none; border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15,118,110,.15); }
        .aff-sug { position: absolute; left: 0; right: 0; top: calc(100% + 2px); z-index: 20; background: #fff; border: 1px solid #cfd8e6; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,.15); max-height: 320px; overflow-y: scroll; overscroll-behavior: contain; display: none; }
        .aff-sug .cnt { position: sticky; top: 0; background: #f3f6fb; color: #6b7a8d; font-size: 11px; padding: 5px 12px; border-bottom: 1px solid #e6ebf3; cursor: default; }
        .aff-sug div { padding: 8px 12px; font-size: 13px; cursor: pointer; }
        .aff-sug div:not(.cnt):hover, .aff-sug div.on { background: #e8f5f3; }
        .aff-stage { display: grid; grid-template-columns: 200px 1fr auto; gap: 8px 12px; align-items: center; padding: 8px 0; border-top: 1px solid #f0f3f8; }
        .aff-stage .name { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #2c3e50; }
        .aff-stage .name i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
        .aff-stage .dates { display: flex; flex-direction: column; gap: 6px; }
        .aff-stage .dates .pr { display: flex; align-items: center; gap: 8px; }
        .aff-stage .dates input { padding: 7px 8px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; width: 150px; }
        .aff-section-title { margin: 20px 0 4px; font-size: 13px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: .5px; }
        @media (max-width: 760px) { .aff-proj { grid-template-columns: 1fr; } .aff-stage { grid-template-columns: 1fr; } }
    `;

    const html = `
    <div class="fixed-header">
        <div class="user-info" id="affectationUserInfo">
            <div style="position: relative; display: flex; align-items: center;">
                <div id="affectationProfileCircle" onclick="openProfilePhotoModal()" style="width:50px;height:50px;border-radius:50%;border:3px solid #1D70B7;background-color:#7f8c8d;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;" title="Mon profil">
                    <span id="affectationProfileTrigramme" style="color:white;font-weight:bold;font-size:16px;">?</span>
                    <img id="affectationProfilePhoto" style="width:100%;height:100%;object-fit:cover;display:none;" alt="">
                </div>
            </div>
            <span class="user-info-name" id="affectationUserDisplayName" style="margin-left:15px;"></span>
            <span class="user-info-role" id="affectationUserDisplayRole"></span>
        </div>
        <div class="tabs" id="affectationTabs">
            <button class="tab-btn active" id="affectationTabPlanning" onclick="AffectationApp.tab('planning')">${svg('planning', 'tab-ico')}Planning des déploiements</button>
            <button class="tab-btn" id="affectationTabAdmin" onclick="AffectationApp.tab('admin')" style="display:none;">${svg('admin', 'tab-ico')}Administration</button>
            <button onclick="AffectationApp.search()" title="Recherche" style="padding:8px 15px;background-color:#3498db;color:white;border:none;cursor:pointer;font-size:18px;border-radius:4px;margin-right:10px;">
                <span style="display:inline-flex;">${svg('search', 'app-ico', 'width:22px;height:22px;stroke:white;')}</span>
            </button>
            <button class="logout-icon" onclick="AffectationApp.logout()" title="Déconnexion"></button>
        </div>
    </div>
    <div class="header-spacer"></div>

    <div id="affectationPlanningTab" class="tab-content active aff-panel">
        <h2>Planning des déploiements</h2>
        <div class="aff-empty">
            <div class="aff-badge">${svg('target')}</div>
            <h2>Aide à l'affectation opérationnelle</h2>
            <p>Cet espace accueillera le planning des déploiements et les outils d'aide à l'affectation des experts.<br>
               L'application est créée : les fonctionnalités arrivent prochainement.</p>
        </div>
    </div>

    <div id="affectationAdminTab" class="tab-content aff-panel">
        <h2>Administration</h2>

        <section class="aff-card">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('rocket', 'aff-ico')}Déploiements de SAMU</span>
                <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.editProject(null)">${svg('plus', 'aff-ico-sm')}Nouveau déploiement</button>
            </header>
            <div id="affLegend" class="aff-legend"></div>
            <div id="affProjects"><p class="aff-muted">Chargement…</p></div>
        </section>

        <section class="aff-card">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('palette', 'aff-ico')}Couleurs des étapes</span>
                <span class="aff-muted" style="font-size:12px;">S'appliquent à tous les projets</span>
            </header>
            <div id="affColors" class="aff-colors"></div>
            <div class="aff-actions">
                <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.saveColors()">${svg('save', 'aff-ico-sm')}Enregistrer les couleurs</button>
                <button type="button" class="aff-btn" onclick="AffectationApp.resetColors()">${svg('reset', 'aff-ico-sm')}Couleurs par défaut</button>
                <span id="affColorsMsg" class="aff-muted"></span>
            </div>
        </section>
    </div>

    <div class="modal" id="affProjectModal">
        <div class="modal-content" style="max-width:880px; width:94%; max-height:92vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span id="affModalTitle" class="aff-card-title"></span>
                <button type="button" class="aff-x" onclick="AffectationApp.closeProject()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div id="affModalBody" class="aff-modal-body"></div>
            <div class="aff-modal-foot">
                <span id="affModalError" class="aff-error"></span>
                <button type="button" class="aff-btn" onclick="AffectationApp.closeProject()">Annuler</button>
                <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.saveProject()">${svg('save', 'aff-ico-sm')}Enregistrer</button>
            </div>
        </div>
    </div>

    <button id="affectationBackBtn" onclick="backToPlanification()" style="display:none;position:fixed;top:10px;right:340px;z-index:1001;background:#fff;border:none;color:#2c3e50;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);white-space:nowrap;">
        <svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;stroke:#3949ab;"><path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/></svg>Planification
    </button>
    <div class="aff-pill" id="affectationOnlineUsersContainer" style="display:none;">
        <span style="font-size:12px;color:#27ae60;">●</span>
        <span id="affectationOnlineUsersCount">0 connecté(s)</span>
    </div>
    <div class="aff-pill" id="affectationTimerDisplay" style="display:none;">
        <svg viewBox="0 0 24 24" aria-hidden="true" style="width:15px;height:15px;margin-right:6px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>
        <span id="affectationTimerText">--:--</span>
    </div>`;

    function mount() {
        if (document.getElementById('affectationContainer')) return;
        const style = document.createElement('style');
        style.textContent = css + css2;
        document.head.appendChild(style);
        const box = document.createElement('div');
        box.id = 'affectationContainer';
        box.className = 'container';
        box.style.display = 'none';
        box.innerHTML = html;
        document.body.appendChild(box);
    }

    function updateUser() {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        const full = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.username;
        document.getElementById('affectationUserDisplayName').textContent = full;
        document.getElementById('affectationUserDisplayRole').textContent =
            currentUser.activeProfile === 'admin' ? 'Administrateur' : currentUser.activeProfile === 'expert' ? 'Expert Métier' : 'Utilisateur';
        const tri = document.getElementById('affectationProfileTrigramme');
        const photo = document.getElementById('affectationProfilePhoto');
        tri.textContent = currentUser.trigramme || '?';
        if (currentUser.profilePhoto) { photo.src = currentUser.profilePhoto; photo.style.display = 'block'; tri.style.display = 'none'; }
        else { photo.style.display = 'none'; tri.style.display = 'flex'; }
        document.getElementById('affectationTabAdmin').style.display = currentUser.activeProfile === 'admin' ? 'inline-block' : 'none';
    }

    function renderTimerText() {
        const el = document.getElementById('affectationTimerText');
        if (!el || typeof inactivityTimeRemaining === 'undefined') return;
        const t = Math.max(0, inactivityTimeRemaining);
        el.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        const pill = document.getElementById('affectationTimerDisplay');
        pill.style.color = t <= 60 ? '#e74c3c' : t <= 120 ? '#f39c12' : '#2c3e50';
    }

    async function refreshOnline() {
        try {
            const res = await fetch(`${API_URL}/active-sessions`, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            const n = (data.activeUsers || []).length;
            document.getElementById('affectationOnlineUsersCount').textContent = `${n} connecté(s)`;
        } catch (e) { /* réseau indisponible : on garde la valeur précédente */ }
    }

    function stopLoops() {
        clearInterval(timerLoop); timerLoop = null;
        clearInterval(onlineTimer); onlineTimer = null;
    }


    // ================= Déploiements de SAMU (administration) =================
    const state = { config: null, colors: {}, projects: [], users: [], locations: [], form: null, loaded: false };

    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const fmt = iso => iso ? iso.split('-').reverse().join('/') : '';
    const stageDef = key => state.config.stages.find(x => x.key === key);
    const color = key => state.colors[key] || '#888888';

    async function api(path, opts) {
        const res = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...(opts || {}) });
        let data = {};
        try { data = await res.json(); } catch (e) { /* réponse vide */ }
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        return data;
    }

    async function loadAdmin() {
        try {
            const [cfg, proj, users, locs] = await Promise.all([
                api('/affectation/config'), api('/affectation/projects'), api('/affectation/users'), api('/locations')
            ]);
            state.config = cfg; state.colors = { ...cfg.colors };
            state.projects = proj.projects; state.users = users.users; state.locations = locs.locations || [];
            state.loaded = true;
            renderLegend(); renderProjects(); renderColors();
        } catch (e) {
            document.getElementById('affProjects').innerHTML = `<p class="aff-error">Chargement impossible : ${esc(e.message)}</p>`;
        }
    }

    function renderLegend() {
        document.getElementById('affLegend').innerHTML = state.config.stages
            .map(st => `<span><i style="background:${color(st.key)}"></i>${esc(st.label)}</span>`).join('');
    }

    function projectBounds(p) {
        const dates = [p.date_debut, p.date_mise_en_service, p.date_mise_en_production];
        Object.values(p.periods || {}).forEach(list => list.forEach(x => { dates.push(x.start, x.end); }));
        const ok = dates.filter(Boolean).sort();
        return { min: ok[0], max: ok[ok.length - 1] };
    }

    function timeline(p) {
        const { min, max } = projectBounds(p);
        const t0 = Date.parse(min), span = Math.max(1, Date.parse(max) - t0);
        const pos = d => ((Date.parse(d) - t0) / span) * 100;
        let h = '<div class="aff-tl">';
        state.config.stages.filter(st => st.kind !== 'date').forEach(st => {
            (p.periods[st.key] || []).forEach(x => {
                const left = pos(x.start), width = Math.max(1.2, pos(x.end) - left);
                h += `<span class="aff-tl-seg" style="left:${left}%;width:${width}%;background:${color(st.key)}" title="${esc(st.label)} : ${fmt(x.start)} → ${fmt(x.end)}"></span>`;
            });
        });
        [['mise_en_service', p.date_mise_en_service], ['mise_en_production', p.date_mise_en_production]].forEach(([k, d]) => {
            if (d) h += `<span class="aff-tl-mark" style="left:${pos(d)}%;background:${color(k)}" title="${esc(stageDef(k).label)} : ${fmt(d)}"></span>`;
        });
        return h + `</div><div class="aff-tl-scale"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>`;
    }

    function renderProjects() {
        const box = document.getElementById('affProjects');
        if (!state.projects.length) {
            box.innerHTML = '<p class="aff-muted">Aucun déploiement pour le moment. Cliquez sur « Nouveau déploiement » pour commencer.</p>';
            return;
        }
        box.innerHTML = state.projects.map(p => `
            <div class="aff-proj">
                <div>
                    <div class="aff-proj-name">${esc(p.samu_name)}</div>
                    <div class="aff-proj-sub">${svg('user')}${esc(p.chef_projet_nom || 'Chef de projet non défini')}</div>
                    <div class="aff-proj-sub">${svg('flag')}Début : ${fmt(p.date_debut)}</div>
                </div>
                <div>${timeline(p)}</div>
                <div class="aff-row-actions">
                    <button type="button" class="aff-icon-btn" style="background:#3498db" title="Modifier les dates" onclick="AffectationApp.editProject(${p.id})">${svg('pencil', 'aff-ico-sm')}</button>
                    <button type="button" class="aff-icon-btn" style="background:#D60B51" title="Supprimer ce déploiement" onclick="AffectationApp.deleteProject(${p.id})">${svg('trash', 'aff-ico-sm')}</button>
                </div>
            </div>`).join('');
    }

    // ---- couleurs ----
    function renderColors() {
        document.getElementById('affColors').innerHTML = state.config.stages.map(st => `
            <label class="aff-color-row">
                <input type="color" data-key="${st.key}" value="${color(st.key)}" oninput="AffectationApp.previewColor('${st.key}', this.value)">
                <span class="lbl">${esc(st.label)}</span>
                <span class="aff-tl-scale" style="margin:0;">${st.kind === 'date' ? 'date' : 'période'}</span>
            </label>`).join('');
    }

    // ---- formulaire ----
    function emptyForm() {
        return { id: null, samu_name: '', location_id: null, chef_projet_id: null, date_debut: '', date_mise_en_service: '', date_mise_en_production: '', periods: {} };
    }

    function periodRows(key, list) {
        const def = stageDef(key);
        const rows = (list && list.length ? list : [{ start: '', end: '' }]).map((x, i) => `
            <div class="pr">
                <input type="date" data-pk="${key}" data-pi="${i}" data-pf="start" value="${esc(x.start)}" aria-label="Début ${esc(def.label)}">
                <span class="aff-muted">→</span>
                <input type="date" data-pk="${key}" data-pi="${i}" data-pf="end" value="${esc(x.end)}" aria-label="Fin ${esc(def.label)}">
                <button type="button" class="aff-x" title="Effacer cette période" onclick="AffectationApp.clearPeriod('${key}', ${i})">${svg('x', 'aff-ico-sm')}</button>
            </div>`).join('');
        const add = def.kind === 'periods' ? `<button type="button" class="aff-btn" style="align-self:flex-start;padding:5px 10px;" onclick="AffectationApp.addPeriod('${key}')">${svg('plus', 'aff-ico-sm')}Ajouter une période</button>` : '';
        return `<div class="dates">${rows}${add}</div>`;
    }

    function stageRow(key, f) {
        const def = stageDef(key);
        const head = `<div class="name"><i style="background:${color(key)}"></i>${esc(def.label)}${def.kind === 'periods' ? ' <span class="aff-muted">(optionnel)</span>' : ''}</div>`;
        if (def.kind === 'date') {
            return `<div class="aff-stage">${head}<div class="dates"><div class="pr"><input type="date" data-df="${key}" value="${esc(f['date_' + key] || '')}" aria-label="${esc(def.label)}"></div></div><span></span></div>`;
        }
        return `<div class="aff-stage">${head}${periodRows(key, f.periods[key])}<span></span></div>`;
    }

    function renderForm() {
        const f = state.form;
        const chefOpts = ['<option value="">— Choisir —</option>']
            .concat(state.users.map(u => `<option value="${u.id}" ${Number(f.chef_projet_id) === u.id ? 'selected' : ''}>${esc(u.nom.toUpperCase())} ${esc(u.prenom)}</option>`)).join('');
        const g = ['cadrage', 'deploiement', 'gel'], h = ['visite_metier', 'test_prerequis', 'vft', 'formation_relais', 'formation_utilisateurs', 'accompagnement'];
        document.getElementById('affModalBody').innerHTML = `
            <div class="aff-form-grid">
                <div class="aff-field" style="position:relative;">
                    <label class="lbl" for="affSamu">Nom du SAMU *</label>
                    <input id="affSamu" type="text" autocomplete="off" placeholder="Tapez pour rechercher une entité…" value="${esc(f.samu_name)}" oninput="AffectationApp.suggest(this.value)" onfocus="AffectationApp.suggest(this.value)" onkeydown="AffectationApp.suggestKey(event)">
                    <div class="aff-sug" id="affSug"></div>
                </div>
                <div class="aff-field">
                    <label class="lbl" for="affChef">Chef de projet</label>
                    <select id="affChef">${chefOpts}</select>
                </div>
                <div class="aff-field">
                    <label class="lbl" for="affDebut">Date de début du projet *</label>
                    <input id="affDebut" type="date" value="${esc(f.date_debut)}" onchange="AffectationApp.syncMin()">
                </div>
            </div>
            <p class="aff-muted" style="margin:10px 0 0;">Toutes les autres dates doivent être postérieures ou égales à la date de début du projet.</p>
            <div class="aff-section-title">Phases du projet</div>
            ${g.map(k => stageRow(k, f)).join('')}
            ${['mise_en_service', 'mise_en_production'].map(k => stageRow(k, f)).join('')}
            <div class="aff-section-title">Étapes de mise en œuvre</div>
            ${h.map(k => stageRow(k, f)).join('')}`;
        AffectationApp.syncMin();
    }

    function collectForm() {
        const f = state.form;
        f.samu_name = document.getElementById('affSamu').value.trim();
        const exact = state.locations.find(l => norm(l.libelle_court) === norm(f.samu_name));
        f.location_id = exact ? exact.id : null;
        f.chef_projet_id = document.getElementById('affChef').value ? Number(document.getElementById('affChef').value) : null;
        f.date_debut = document.getElementById('affDebut').value;
        const periods = {};
        document.querySelectorAll('#affModalBody input[data-pk]').forEach(inp => {
            const k = inp.dataset.pk, i = Number(inp.dataset.pi);
            (periods[k] = periods[k] || [])[i] = (periods[k][i] || { start: '', end: '' });
            periods[k][i][inp.dataset.pf] = inp.value;
        });
        Object.keys(periods).forEach(k => { periods[k] = periods[k].filter(x => x && (x.start || x.end)); if (!periods[k].length) delete periods[k]; });
        f.periods = periods;
        document.querySelectorAll('#affModalBody input[data-df]').forEach(inp => { f['date_' + inp.dataset.df] = inp.value; });
        return f;
    }

    function validateForm(f) {
        if (!f.samu_name) return 'Le nom du SAMU est obligatoire.';
        if (!f.date_debut) return 'La date de début du projet est obligatoire.';
        for (const k of ['mise_en_service', 'mise_en_production']) {
            const d = f['date_' + k];
            if (d && d < f.date_debut) return `${stageDef(k).label} : la date ne peut pas précéder le début du projet.`;
        }
        for (const [k, list] of Object.entries(f.periods)) {
            for (const x of list) {
                const lbl = stageDef(k).label;
                if (!x.start || !x.end) return `${lbl} : renseignez la date de début et la date de fin.`;
                if (x.end < x.start) return `${lbl} : la date de fin précède la date de début.`;
                if (x.start < f.date_debut) return `${lbl} : la période ne peut pas commencer avant le début du projet.`;
            }
        }
        return null;
    }

    const adminApi = {
        editProject(id) {
            if (!state.loaded) { loadAdmin().then(() => adminApi.editProject(id)); return; }
            const p = id ? state.projects.find(x => x.id === id) : null;
            state.form = p ? JSON.parse(JSON.stringify({ ...p, date_mise_en_service: p.date_mise_en_service || '', date_mise_en_production: p.date_mise_en_production || '' })) : emptyForm();
            document.getElementById('affModalTitle').textContent = p ? `Modifier : ${p.samu_name}` : 'Nouveau déploiement de SAMU';
            document.getElementById('affModalError').textContent = '';
            renderForm();
            document.getElementById('affProjectModal').classList.add('active');
        },
        closeProject() { document.getElementById('affProjectModal').classList.remove('active'); },
        syncMin() {
            const d = document.getElementById('affDebut').value;
            document.querySelectorAll('#affModalBody input[data-pk], #affModalBody input[data-df]').forEach(inp => { if (d) inp.min = d; else inp.removeAttribute('min'); });
        },
        suggest(value) {
            const box = document.getElementById('affSug');
            const q = norm(value);
            const list = state.locations.filter(l => !q || norm(l.libelle_court).includes(q) || norm(l.libelle_long).includes(q));
            state.sugList = list;
            state.sugIdx = -1;
            if (!list.length) { box.innerHTML = '<div class="cnt">Aucune entité correspondante</div>'; box.style.display = 'block'; return; }
            box.innerHTML = `<div class="cnt">${list.length} entité${list.length > 1 ? 's' : ''} — ↑ ↓ pour parcourir, Entrée pour choisir</div>`
                + list.map((l, i) => `<div data-i="${i}">${esc(l.libelle_long)}</div>`).join('');
            box.style.display = 'block';
            box.querySelectorAll('div[data-i]').forEach(el => el.onmousedown = ev => {
                ev.preventDefault();
                adminApi.pickEntity(Number(el.dataset.i));
            });
        },
        pickEntity(i) {
            const loc = (state.sugList || [])[i];
            if (!loc) return;
            document.getElementById('affSamu').value = loc.libelle_court;
            state.form.location_id = loc.id;
            document.getElementById('affSug').style.display = 'none';
        },
        suggestKey(e) {
            const box = document.getElementById('affSug');
            if (box.style.display !== 'block' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { adminApi.suggest(e.target.value); }
            const items = box.querySelectorAll('div[data-i]');
            if (!items.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                state.sugIdx = (state.sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items.forEach((el, i) => el.classList.toggle('on', i === state.sugIdx));
                items[state.sugIdx].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter' && state.sugIdx >= 0) {
                e.preventDefault();
                adminApi.pickEntity(state.sugIdx);
            } else if (e.key === 'Escape') {
                box.style.display = 'none';
            }
        },
        addPeriod(key) {
            collectForm();
            (state.form.periods[key] = state.form.periods[key] || []).push({ start: '', end: '' });
            renderForm();
        },
        clearPeriod(key, i) {
            collectForm();
            const list = state.form.periods[key] || [];
            list.splice(i, 1);
            if (!list.length) delete state.form.periods[key];
            renderForm();
        },
        async saveProject() {
            const f = collectForm();
            const err = validateForm(f);
            const errEl = document.getElementById('affModalError');
            errEl.textContent = err || '';
            if (err) return;
            try {
                const body = JSON.stringify({
                    samu_name: f.samu_name, location_id: f.location_id, chef_projet_id: f.chef_projet_id, date_debut: f.date_debut,
                    date_mise_en_service: f.date_mise_en_service || null, date_mise_en_production: f.date_mise_en_production || null, periods: f.periods
                });
                await api(f.id ? `/affectation/projects/${f.id}` : '/affectation/projects', { method: f.id ? 'PUT' : 'POST', body });
                adminApi.closeProject();
                await loadAdmin();
            } catch (e) { errEl.textContent = e.message; }
        },
        async deleteProject(id) {
            const p = state.projects.find(x => x.id === id);
            if (!p || !confirm(`Supprimer le déploiement « ${p.samu_name} » ?`)) return;
            try { await api(`/affectation/projects/${id}`, { method: 'DELETE' }); await loadAdmin(); }
            catch (e) { alert(e.message); }
        },
        previewColor(key, value) { state.colors[key] = value; renderLegend(); renderProjects(); },
        async saveColors() {
            const msg = document.getElementById('affColorsMsg');
            try {
                const data = await api('/affectation/colors', { method: 'PUT', body: JSON.stringify(state.colors) });
                state.colors = { ...data.colors };
                renderLegend(); renderProjects(); renderColors();
                msg.style.color = '#2e7d32'; msg.textContent = 'Couleurs enregistrées.';
            } catch (e) { msg.style.color = '#c62828'; msg.textContent = e.message; }
        },
        resetColors() {
            state.config.stages.forEach(st => { state.colors[st.key] = st.defaultColor; });
            renderLegend(); renderProjects(); renderColors();
            const msg = document.getElementById('affColorsMsg');
            msg.style.color = '#7a8799'; msg.textContent = 'Couleurs par défaut rétablies : pensez à enregistrer.';
        },
        loadAdmin
    };

    const AffectationApp = {
        show() {
            mount();
            // Les autres applications laissent la place
            document.querySelector('.container').style.display = 'none';
            ['deplacementsContainer', 'analyseContainer'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
            document.getElementById('loginPage').classList.remove('active');
            stopInactivityTimer();
            if (typeof onlineUsersInterval !== 'undefined' && onlineUsersInterval) { clearInterval(onlineUsersInterval); onlineUsersInterval = null; }

            sessionStorage.setItem('selectedApp', KEY);
            if (typeof currentUser !== 'undefined' && currentUser) currentUser.selectedApp = KEY;
            document.getElementById('affectationContainer').style.display = 'block';
            document.getElementById('affectationBackBtn').style.display = 'block';
            document.getElementById('affectationOnlineUsersContainer').style.display = 'flex';
            document.getElementById('affectationTimerDisplay').style.display = 'flex';
            visible = true;
            updateUser();
            AffectationApp.tab('planning');
            if (typeof updateAppSwitcher === 'function') updateAppSwitcher();

            stopLoops();
            const startTimer = () => { try { startInactivityTimer(inactivityTimeout); } catch (e) { /* minuteur indisponible */ } };
            (typeof loadSettingsForDeplacements === 'function' ? loadSettingsForDeplacements() : Promise.resolve()).then(startTimer);
            timerLoop = setInterval(renderTimerText, 1000);
            refreshOnline();
            onlineTimer = setInterval(refreshOnline, 30000);
            if (window.GPTools) window.GPTools.position();
        },
        hide() {
            if (!visible) return;
            visible = false;
            stopLoops();
            stopInactivityTimer();
            const box = document.getElementById('affectationContainer');
            if (box) box.style.display = 'none';
            ['affectationBackBtn', 'affectationOnlineUsersContainer', 'affectationTimerDisplay'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        },
        tab(name) {
            const isAdmin = name === 'admin';
            document.getElementById('affectationTabPlanning').classList.toggle('active', !isAdmin);
            document.getElementById('affectationTabAdmin').classList.toggle('active', isAdmin);
            document.getElementById('affectationPlanningTab').classList.toggle('active', !isAdmin);
            document.getElementById('affectationAdminTab').classList.toggle('active', isAdmin);
            if (isAdmin && !state.loaded) loadAdmin();
        },
        search() { alert('Recherche - Fonctionnalité en cours de développement'); },
        async logout() {
            if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
            AffectationApp.hide();
            document.getElementById('affectationBackBtn').style.display = 'none';
            await performLogout();
        },
        isVisible: () => visible
    };
    Object.assign(AffectationApp, adminApi);
    document.addEventListener('mousedown', e => {
        const box = document.getElementById('affSug');
        if (box && box.style.display === 'block' && !e.target.closest('.aff-field')) box.style.display = 'none';
    });
    window.AffectationApp = AffectationApp;
    window.showAffectationApp = () => AffectationApp.show();
    window.hideAffectationApp = () => AffectationApp.hide();
    document.addEventListener('DOMContentLoaded', mount);
})();
