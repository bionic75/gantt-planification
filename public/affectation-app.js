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
        .aff-stage .dates .pr { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .aff-stage .dates input { padding: 6px 6px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; width: 132px; }
        .aff-stage .dates input.aff-days { width: 78px; text-align: center; }
        .aff-stage .dates .pr .aff-wk { width: 160px; }
        .aff-stage .dates select.aff-need { padding: 7px 8px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; width: 112px; }
        .aff-section-title { margin: 20px 0 4px; font-size: 13px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: .5px; }
        .aff-legendbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid #dfe5ef; border-radius: 12px; background: #fff; }
        .aff-legendbar .t { font-size: 12px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: .5px; margin-right: 4px; }
        .aff-legendbar button.chip { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border: 1px solid #cfd8e6; border-radius: 999px; background: #fff; color: #2c3e50; font-size: 12px; font-weight: 600; cursor: pointer; }
        .aff-legendbar button.chip i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
        .aff-legendbar button.chip i.dot { border-radius: 50%; }
        .aff-legendbar button.chip.off { opacity: .45; text-decoration: line-through; background: #f3f5f9; }
        .aff-legendbar button.chip.off i { filter: grayscale(1); }
        .aff-legendbar .sep { width: 1px; height: 20px; background: #dfe5ef; margin: 0 4px; }
        .aff-plan-bar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
        .aff-plan-ctrl { display: flex; align-items: center; gap: 12px; }
        .aff-seg { display: inline-flex; border: 1px solid #cfd8e6; border-radius: 9px; overflow: hidden; background: #fff; }
        .aff-seg button { border: none; background: transparent; padding: 8px 16px; font-size: 13px; font-weight: 600; color: #4a5b70; cursor: pointer; }
        .aff-seg button + button { border-left: 1px solid #cfd8e6; }
        .aff-seg button.on { background: #0f766e; color: #fff; }
        .aff-plan { overflow: auto; max-height: calc(100vh - 230px); border: 1px solid #dfe5ef; border-radius: 12px; background: #fff; }
        #affectationContainer table.aff-plan-table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: max-content; font-size: 12px; border-radius: 0; overflow: visible; }
        #affectationContainer table.aff-plan-table th, #affectationContainer table.aff-plan-table td { cursor: default; padding: 0; }
        #affectationContainer table.aff-plan-table th::after { content: none; }
        #affectationContainer table.aff-plan-table thead th:hover { background: inherit; }
        #affectationContainer table.aff-plan-table tbody tr:hover { background: transparent; }
        #affectationContainer table.aff-plan-table tbody tr th.sam, #affectationContainer table.aff-plan-table tbody tr:hover th.sam { background: #fff !important; }
        #affectationContainer table.aff-plan-table tbody tr:nth-child(even) th.sam, #affectationContainer table.aff-plan-table tbody tr:nth-child(even):hover th.sam { background: #f4f7fb !important; }
        .aff-plan-table thead th { height: 36px; text-align: center; font-weight: 700; color: #fff; border-right: 1px solid rgba(255,255,255,.25); border-bottom: 1px solid rgba(255,255,255,.2); position: sticky; z-index: 3; white-space: nowrap; background: #34495e; }
        .aff-plan-table thead tr:nth-child(1) th { background: #263238; top: 0; font-size: 20px; letter-spacing: .5px; }
        .aff-plan-table thead tr:nth-child(2) th { background: #1D70B7; top: 28px; font-size: 17px; }
        .aff-plan-table thead tr:nth-child(3) th { background: #3d6fa8; top: 56px; font-size: 15px; }
        .aff-plan-table thead tr:nth-child(4) th { background: #4a78b0; top: 84px; font-weight: 700; font-size: 14px; }
        .aff-plan-table thead tr:nth-child(5) th { background: #5a86ba; top: 112px; font-weight: 600; font-size: 12px; }
        .aff-plan-table thead th.we { background: #f0b429 !important; color: #3a2d00; }
        .aff-plan-table thead th.today { background: #2e9d62 !important; color: #fff; }
        .aff-plan-table th.corner { left: 0; z-index: 6; min-width: 280px; max-width: 280px; background: #1D70B7 !important; text-align: left; padding-left: 28px; font-size: 22px; }
        .aff-plan-table tbody th.sam { position: sticky; left: 0; z-index: 2; background: #fff; text-align: left; padding: 6px 12px 6px 28px; min-width: 280px; max-width: 280px; border-right: 2px solid #cfd8e6; border-bottom: 1px solid #eef1f6; color: #1f2d3d; }
        .aff-plan-table tbody th.sam .n { font-weight: 800; font-size: 19px; line-height: 1.2; }
        .aff-plan-table tbody th.sam .c { font-weight: 500; font-size: 14px; color: #6b7a8d; margin-top: 2px; }
        .aff-plan-table tbody tr:nth-child(even) th.sam { background: #f4f7fb; }
        .aff-plan-table tbody td { height: 96px; padding: 0; position: relative; border-right: 1px solid #eef1f6; border-bottom: 1px solid #eef1f6; }
        .aff-pc { display: flex; flex-direction: column; height: 96px; gap: 3px; padding: 5px 0; box-sizing: border-box; }
        .aff-pc .ph, .aff-pc .st { display: flex; flex-direction: column; gap: 1px; }
        .aff-pc .ph { flex: 0 0 auto; gap: 2px; }
        .aff-pc .ph .b { flex: 0 0 10px; min-height: 10px; } .aff-pc .st { flex: 1; min-height: 0; }
        .aff-pc .b { flex: 1; min-height: 14px; max-height: 40px; box-sizing: border-box; font-size: 10px; line-height: 12px; color: #fff; font-weight: 700; white-space: nowrap; overflow: visible; text-shadow: 0 0 2px rgba(0,0,0,.45); padding-left: 3px; }
        .aff-pc .b.hd { border-top-left-radius: 5px; border-bottom-left-radius: 5px; }
        .aff-pc .b.tl { border-top-right-radius: 5px; border-bottom-right-radius: 5px; }
        .aff-pc .b.go { cursor: pointer; } .aff-pc .b.go:hover { filter: brightness(1.15); outline: 2px solid rgba(15,118,110,.7); outline-offset: -1px; }
        .aff-pc .b.ok { box-shadow: inset 0 -2px 0 rgba(255,255,255,.85); }
        .aff-pc .b.gel { background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 3px, transparent 3px 6px); }
        .aff-mk { position: absolute; top: 1px; right: 1px; width: 0; height: 0; z-index: 1; }
        .aff-mk i { position: absolute; top: 0; right: 0; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
        .aff-assign-list { max-height: 300px; overflow: auto; border: 1px solid #dfe5ef; border-radius: 10px; margin-top: 8px; }
        .aff-assign-list label { display: flex; align-items: center; gap: 10px; padding: 7px 12px; cursor: pointer; border-bottom: 1px solid #eef1f6; font-size: 13px; }
        .aff-assign-list label:nth-child(even) { background: #f6f9fc; }
        .aff-assign-list label input { width: auto; display: inline-block; margin: 0; }
        .aff-assign-list label.off { opacity: .45; cursor: not-allowed; }
        .aff-plan-table tbody td.we { background: #fff8e6; }
        .aff-plan-table tbody td.today { background: rgba(46,157,98,.12); box-shadow: inset 2px 0 0 #2e9d62; }
        .aff-plan-table tbody tr:nth-child(even) td:not(.we):not(.today) { background: #f9fbfd; }
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
        <div id="affLegendBar" class="aff-legendbar"></div>
        <div class="aff-plan-bar">
            <h2 style="margin:0;">Planning des déploiements</h2>
            <div class="aff-plan-ctrl">
                <span class="aff-muted" style="font-weight:700;">Trier par</span>
                <div class="aff-seg aff-sort" role="group" aria-label="Tri">
                    <button type="button" data-s="samu" onclick="AffectationApp.planSort('samu')">SAMU</button>
                    <button type="button" data-s="chef" onclick="AffectationApp.planSort('chef')">Chef de projet</button>
                    <button type="button" data-s="mes" onclick="AffectationApp.planSort('mes')">Mise en service</button>
                </div>
                <div class="aff-seg" role="group" aria-label="Échelle de temps">
                    <button type="button" data-z="day" class="on" onclick="AffectationApp.planZoom('day')" title="Afficher à la maille jour">Jour</button>
                    <button type="button" data-z="week" onclick="AffectationApp.planZoom('week')" title="Afficher à la maille semaine">Semaine</button>
                    <button type="button" data-z="month" onclick="AffectationApp.planZoom('month')" title="Afficher à la maille mois">Mois</button>
                </div>
                <button type="button" class="aff-btn" onclick="AffectationApp.planToday()" title="Se placer sur la date du jour">${svg('planning', 'aff-ico-sm')}Aujourd'hui</button>
            </div>
        </div>
        <div id="affPlan" class="aff-plan"><p class="aff-muted" style="padding:18px;">Chargement…</p></div>
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

    <div class="modal" id="affAssignModal">
        <div class="modal-content" style="max-width:520px; width:94%; max-height:90vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span id="affAssignTitle" class="aff-card-title"></span>
                <button type="button" class="aff-x" onclick="AffectationApp.closeAssign()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div class="aff-modal-body">
                <div id="affAssignInfo" class="aff-muted"></div>
                <input id="affAssignFilter" type="text" placeholder="Filtrer les ressources…" oninput="AffectationApp.assignFilter()" style="margin-top:10px;padding:8px 10px;border:1px solid #cfd8e6;border-radius:8px;">
                <div id="affAssignList" class="aff-assign-list"></div>
            </div>
            <div class="aff-modal-foot">
                <span id="affAssignError" class="aff-error"></span>
                <button type="button" class="aff-btn" onclick="AffectationApp.closeAssign()">Annuler</button>
                <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.saveAssign()">${svg('save', 'aff-ico-sm')}Enregistrer</button>
            </div>
        </div>
    </div>

    <button id="affectationBackBtn" onclick="backToPlanification()" style="display:none;position:fixed;top:10px;right:340px;z-index:1001;background:#fff;border:none;color:#2c3e50;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);white-space:nowrap;">
        <svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;stroke:#3949ab;"><path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/></svg>Planification
    </button>
    <div class="aff-pill" id="affectationOnlineUsersContainer" style="display:none;">
        <span style="font-size:12px;color:#27ae60;">●</span>
        <div id="affectationOnlineUsersAvatars" style="display:flex;align-items:center;"></div>
        <span id="affectationOnlineUsersCount" style="font-size:11px;color:#666;margin-left:4px;"></span>
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
            const users = data.activeUsers || [];
            const max = 5;
            document.getElementById('affectationOnlineUsersAvatars').innerHTML = users.slice(0, max).map((u, i) => {
                const bg = typeof getAvatarColor === 'function' ? getAvatarColor(u.profile) : '#3949ab';
                const ini = u.trigramme || ((u.prenom || '').charAt(0) + (u.nom || '').charAt(0));
                const name = `${u.prenom || ''} ${u.nom || ''}`.trim() || u.username || '';
                const base = `width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:${bg};margin-left:${i ? -8 : 0}px;box-shadow:0 1px 3px rgba(0,0,0,.25);overflow:hidden;`;
                return u.profilePhoto
                    ? `<div title="${esc(name)}" style="${base}"><img src="${u.profilePhoto}" alt="" style="width:100%;height:100%;object-fit:cover;"></div>`
                    : `<div title="${esc(name)}" style="${base}display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">${esc(ini)}</div>`;
            }).join('');
            const extra = users.length - max;
            const cnt = document.getElementById('affectationOnlineUsersCount');
            cnt.textContent = extra > 0 ? `+${extra}` : '';
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

    // Durée inclusive en jours calendaires (début et fin comptés)
    function daysBetween(a, b) {
        if (!a || !b || b < a) return '';
        return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;
    }
    function addDaysIso(iso, n) {
        return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    }
    function periodInputs(inp) {
        const q = f => document.querySelector(`#affModalBody input[data-pk="${inp.dataset.pk || inp.dataset.dk}"][data-pi="${inp.dataset.pi || inp.dataset.di}"][data-pf="${f}"]`);
        const days = document.querySelector(`#affModalBody input[data-dk="${inp.dataset.pk || inp.dataset.dk}"][data-di="${inp.dataset.pi || inp.dataset.di}"]`);
        return { start: q('start'), end: q('end'), days };
    }

    const weekValue = iso => { if (!iso) return ''; const w = isoWeek(iso); return `${w.year}-W${String(w.week).padStart(2, '0')}`; };
    function periodRows(key, list) {
        const def = stageDef(key);
        const rows = (list && list.length ? list : [{ start: '', end: '' }]).map((x, i) => `
            <div class="pr">
                ${def.resources ? `<input type="week" class="aff-wk" data-wk="${key}" data-wi="${i}" value="${weekValue(x.start)}" title="Choisir une semaine (SXX année) : la période commence le lundi de cette semaine" aria-label="Semaine de début ${esc(def.label)}" onchange="AffectationApp.weekChanged(this)">` : ''}
                <input type="date" data-pk="${key}" data-pi="${i}" data-pf="start" value="${esc(x.start)}" aria-label="Début ${esc(def.label)}" onchange="AffectationApp.startChanged(this)">
                <span class="aff-muted">→</span>
                <input type="date" data-pk="${key}" data-pi="${i}" data-pf="end" value="${esc(x.end)}" aria-label="Fin ${esc(def.label)}" onchange="AffectationApp.endChanged(this)">
                <input type="number" min="1" step="1" class="aff-days" data-dk="${key}" data-di="${i}" value="${daysBetween(x.start, x.end) || ''}" placeholder="jours" title="Nombre de jours (calendaires, début et fin inclus) : la date de fin se calcule automatiquement" aria-label="Nombre de jours ${esc(def.label)}" oninput="AffectationApp.daysChanged(this)">
                ${def.resources ? `<select class="aff-need" data-nk="${key}" data-ni="${i}" title="Nombre de ressources nécessaires" aria-label="Ressources nécessaires ${esc(def.label)}">${['<option value="">Ressources…</option>'].concat(Array.from({ length: 10 }, (_, n) => `<option value="${n + 1}" ${Number(x.needed) === n + 1 ? 'selected' : ''}>${n + 1} ressource${n ? 's' : ''}</option>`)).join('')}</select>` : ''}
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
        document.querySelectorAll('#affModalBody select[data-nk]').forEach(sel => {
            const k = sel.dataset.nk, i = Number(sel.dataset.ni);
            if (periods[k] && periods[k][i] && sel.value) periods[k][i].needed = Number(sel.value);
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
                if (stageDef(k).resources && !x.needed) return `${lbl} : indiquez le nombre de ressources nécessaires.`;
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
            // La borne haute d'une période ne peut pas précéder sa borne basse
            document.querySelectorAll('#affModalBody input[data-pf="start"]').forEach(st => { if (st.value) adminApi.startChanged(st, true); });
        },
        // Borne basse choisie : la borne haute se recalcule (nombre de jours) ou se cale sur ce jour, et le calendrier s'y ouvre
        startChanged(startInput, keepEnd) {
            const wkInput = startInput.closest('.pr') && startInput.closest('.pr').querySelector('input[data-wk]');
            if (wkInput) wkInput.value = weekValue(startInput.value);
            const { end, days } = periodInputs(startInput);
            if (!end) return;
            if (startInput.value) {
                end.min = startInput.value;
                if (keepEnd) return;
                const n = days ? Number(days.value) : 0;
                if (n > 0) {
                    end.value = addDaysIso(startInput.value, n - 1);
                    end.dataset.auto = '';
                } else if (!end.value || end.dataset.auto === '1' || end.value < startInput.value) {
                    end.value = startInput.value;
                    end.dataset.auto = '1';
                    if (days) days.value = 1;
                } else if (days) {
                    days.value = daysBetween(startInput.value, end.value);
                }
            } else if (!keepEnd) {
                const d = document.getElementById('affDebut').value;
                if (d) end.min = d; else end.removeAttribute('min');
                if (end.dataset.auto === '1') { end.value = ''; end.dataset.auto = ''; if (days) days.value = ''; }
            }
        },
        weekChanged(wk) {
            const m = /^(\d{4})-W(\d{2})$/.exec(wk.value);
            const row = wk.closest('.pr');
            const start = row && row.querySelector('input[data-pf="start"]');
            if (!start) return;
            if (!m) { start.value = ''; adminApi.startChanged(start); return; }
            // Lundi de la semaine ISO : le 4 janvier est toujours en semaine 1
            const jan4 = `${m[1]}-01-04`;
            start.value = addDaysIso(mondayOf(jan4), (Number(m[2]) - 1) * 7);
            adminApi.startChanged(start);
        },
        endChanged(endInput) {
            endInput.dataset.auto = '';
            const { start, days } = periodInputs(endInput);
            if (days) days.value = start && start.value ? daysBetween(start.value, endInput.value) : '';
        },
        daysChanged(daysInput) {
            const { start, end } = periodInputs(daysInput);
            const n = Math.floor(Number(daysInput.value));
            if (start && end && start.value && n > 0) {
                end.value = addDaysIso(start.value, n - 1);
                end.dataset.auto = '';
            }
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
                plan.projects = state.projects; renderPlanning();
            } catch (e) { errEl.textContent = e.message; }
        },
        async deleteProject(id) {
            const p = state.projects.find(x => x.id === id);
            if (!p || !confirm(`Supprimer le déploiement « ${p.samu_name} » ?`)) return;
            try { await api(`/affectation/projects/${id}`, { method: 'DELETE' }); await loadAdmin(); plan.projects = state.projects; renderPlanning(); }
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


    // ================= Planning des déploiements (grille calendaire) =================
    const plan = { sort: { key: 'samu', dir: 1 }, zoom: 'day', projects: [], loaded: false };
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const WDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const utcMs = iso => Date.parse(iso + 'T00:00:00Z');
    const isoMs = ms => new Date(ms).toISOString().slice(0, 10);
    const addD = (iso, n) => isoMs(utcMs(iso) + n * 86400000);
    const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);

    function isoWeek(iso) {
        const d = new Date(utcMs(iso));
        const dayNum = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
        const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
        return { week, year: d.getUTCFullYear() };
    }
    const mondayOf = iso => addD(iso, -((new Date(utcMs(iso)).getUTCDay() + 6) % 7));

    function group(list, keyFn, labelFn) {
        const out = [];
        list.forEach(item => {
            const k = keyFn(item);
            if (out.length && out[out.length - 1].key === k) out[out.length - 1].n++;
            else out.push({ key: k, label: labelFn ? labelFn(item) : k, n: 1, first: item });
        });
        return out;
    }

    function planRange() {
        let min = null, max = null;
        plan.projects.forEach(p => {
            const dates = [p.date_debut, p.date_mise_en_service, p.date_mise_en_production];
            Object.values(p.periods || {}).forEach(l => l.forEach(x => dates.push(x.start, x.end)));
            dates.filter(Boolean).forEach(d => { if (!min || d < min) min = d; if (!max || d > max) max = d; });
        });
        const t = todayIso();
        if (!min) { min = t.slice(0, 8) + '01'; max = addD(min, 90); }
        return { min: addD(min, -3), max: addD(max, 7) };
    }

    let hiddenKeys = new Set();
    try { hiddenKeys = new Set(JSON.parse(localStorage.getItem('affHiddenStages') || '[]')); } catch (e) { /* stockage indisponible */ }
    function renderLegend2() {
        const bar = document.getElementById('affLegendBar');
        if (!bar || !plan.config) return;
        const chip = (k, dot) => `<button type="button" class="chip ${hiddenKeys.has(k) ? 'off' : ''}" onclick="AffectationApp.toggleStage('${k}')" title="${hiddenKeys.has(k) ? 'Afficher' : 'Masquer'} : ${esc(planDef(k).label)}"><i class="${dot ? 'dot' : ''}" style="background:${planColor(k)}"></i>${esc(planDef(k).label)}</button>`;
        bar.innerHTML = `<span class="t">Légende</span>${PHASES.map(k => chip(k)).join('')}<span class="sep"></span>${['mise_en_service', 'mise_en_production'].map(k => chip(k, true)).join('')}<span class="sep"></span>${STEPS.map(k => chip(k)).join('')}`
            + `<span class="aff-muted" style="margin-left:auto;font-size:11px;">Cliquer sur une rubrique pour l'afficher / la masquer</span>`;
    }
    const PHASES = ['cadrage', 'deploiement', 'gel'];
    const STEPS = ['visite_metier', 'test_prerequis', 'vft', 'formation_relais', 'formation_utilisateurs', 'accompagnement'];
    const planColor = k => (plan.colors && plan.colors[k]) || '#888888';
    const planDef = k => (plan.config && plan.config.stages.find(x => x.key === k)) || { label: k };
    const frd = iso => iso.split('-').reverse().join('/');

    // Contenu d'une cellule : phases (bandeau haut), étapes (bandes du bas, cliquables en vue jour/semaine), jalons
    function cellContent(p, c) {
        const clickable = true;
        const bar = (k, x, i, isStep) => {
            if (hiddenKeys.has(k) || !(x.start <= c.to && x.end >= c.from)) return '';
            const head = x.start >= c.from && x.start <= c.to, tail = x.end >= c.from && x.end <= c.to;
            const def = planDef(k);
            const got = ((p.assignments || {})[k] || []).length;
            const needed = x.needed || 0;
            const tip = `${def.label} : ${frd(x.start)} → ${frd(x.end)}` + (isStep && needed ? ` — ${got}/${needed} ressource(s) affectée(s)` : '') + (isStep && needed ? ' (cliquer pour voir / affecter)' : '');
            const go = isStep && clickable && needed;
            // Position proportionnelle dans la colonne (vue semaine / mois) : une journée reste une petite barre
            const span = (utcMs(c.to) - utcMs(c.from)) / 86400000 + 1;
            const o1 = (utcMs(x.start < c.from ? c.from : x.start) - utcMs(c.from)) / 86400000;
            const o2 = (utcMs(x.end > c.to ? c.to : x.end) - utcMs(c.from)) / 86400000 + 1;
            const pos = span > 1 ? `margin-left:${(o1 / span * 100).toFixed(2)}%;width:max(${((o2 - o1) / span * 100).toFixed(2)}%,24px);flex:0 0 auto;` : '';
            const label = head && isStep && needed ? `${got}/${needed}` : '';
            return `<div class="b ${head ? 'hd' : ''} ${tail ? 'tl' : ''} ${go ? 'go' : ''} ${isStep && needed && got >= needed ? 'ok' : ''} ${k === 'gel' ? 'gel' : ''}" style="background:${planColor(k)};${pos}" title="${esc(tip)}" ${go ? `onclick="AffectationApp.openAssign(${p.id},'${k}')"` : ''}>${label}</div>`;
        };
        // Une voie fixe par période du projet : une barre garde la même hauteur d'une colonne à l'autre
        const lanes = (keys, isStep) => keys.map(k => hiddenKeys.has(k) ? '' : ((p.periods || {})[k] || []).map((x, i) => bar(k, x, i, isStep) || '<div class="b" style="visibility:hidden"></div>').join('')).join('');
        let ph = lanes(PHASES, false), st = lanes(STEPS, true);
        if (!/class="b [^"]*"|class="b "/.test(ph.replace(/<div class="b" style="visibility:hidden"><\/div>/g, ''))) ph = '';
        if (!/class="b [^"]*"/.test(st.replace(/<div class="b" style="visibility:hidden"><\/div>/g, ''))) st = '';
        let mk = '';
        [['mise_en_service', p.date_mise_en_service], ['mise_en_production', p.date_mise_en_production]].forEach(([k, d]) => {
            if (d && !hiddenKeys.has(k) && d >= c.from && d <= c.to) mk += `<span class="aff-mk" title="${esc(planDef(k).label)} : ${frd(d)}"><i style="background:${planColor(k)}"></i></span>`;
        });
        if (p.date_debut >= c.from && p.date_debut <= c.to) mk += `<span class="aff-mk" style="top:auto;bottom:1px;" title="Début du projet : ${frd(p.date_debut)}"><i style="width:10px;height:10px;background:#263238"></i></span>`;
        return (ph || st || mk) ? `${mk}<div class="aff-pc"><div class="ph">${ph}</div><div class="st">${st}</div></div>` : '';
    }

    function renderPlanning() {
        const box = document.getElementById('affPlan');
        if (!box) return;
        renderLegend2();
        const { min, max } = planRange();
        const t = todayIso();
        const days = [];
        for (let ms = utcMs(min); ms <= utcMs(max); ms += 86400000) days.push(isoMs(ms));

        let cols, head = '';
        const th = (cls, n, txt, extra) => `<th class="${cls || ''}" colspan="${n}" ${extra || ''}>${txt}</th>`;
        const corner = rows => `<th class="corner" rowspan="${rows}">SAMU</th>`;

        if (plan.zoom === 'day') {
            cols = days.map(d => ({ key: d, from: d, to: d, we: [0, 6].includes(new Date(utcMs(d)).getUTCDay()), today: d === t, w: 30 }));
            head += `<tr>${corner(5)}${group(days, d => d.slice(0, 4)).map(g => th('', g.n, g.label)).join('')}</tr>`;
            head += `<tr>${group(days, d => d.slice(0, 7), d => cap(MONTHS[+d.slice(5, 7) - 1])).map(g => th('', g.n, g.label)).join('')}</tr>`;
            head += `<tr>${group(days, d => { const w = isoWeek(d); return `${w.year}-${w.week}`; }, d => 'S' + isoWeek(d).week).map(g => th('', g.n, g.label)).join('')}</tr>`;
            head += `<tr>${days.map(d => `<th class="${[0, 6].includes(new Date(utcMs(d)).getUTCDay()) ? 'we' : ''} ${d === t ? 'today' : ''}" ${d === t ? 'data-today="1"' : ''} style="min-width:30px;">${+d.slice(8)}</th>`).join('')}</tr>`;
            head += `<tr>${days.map(d => `<th class="${[0, 6].includes(new Date(utcMs(d)).getUTCDay()) ? 'we' : ''} ${d === t ? 'today' : ''}">${WDAY[new Date(utcMs(d)).getUTCDay()]}</th>`).join('')}</tr>`;
        } else if (plan.zoom === 'week') {
            const mondays = [];
            for (let m = mondayOf(min); m <= max; m = addD(m, 7)) mondays.push(m);
            const thisMon = mondayOf(t);
            cols = mondays.map(m => ({ key: m, from: m, to: addD(m, 6), we: false, today: m === thisMon, w: 64 }));
            head += `<tr>${corner(4)}${group(mondays, m => m.slice(0, 4)).map(g => th('', g.n, g.label)).join('')}</tr>`;
            head += `<tr>${group(mondays, m => m.slice(0, 7), m => cap(MONTHS[+m.slice(5, 7) - 1])).map(g => th('', g.n, g.label)).join('')}</tr>`;
            head += `<tr>${mondays.map(m => `<th class="${m === thisMon ? 'today' : ''}" ${m === thisMon ? 'data-today="1"' : ''} style="min-width:64px;">S${isoWeek(m).week}</th>`).join('')}</tr>`;
            head += `<tr>${mondays.map(m => `<th class="${m === thisMon ? 'today' : ''}" style="font-size:11px;font-weight:500;">${m.slice(8)}/${m.slice(5, 7)}</th>`).join('')}</tr>`;
        } else {
            const months = [];
            for (let m = min.slice(0, 7); m <= max.slice(0, 7);) {
                months.push(m);
                const y = +m.slice(0, 4), mo = +m.slice(5, 7);
                m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
            }
            cols = months.map(m => {
                const y = +m.slice(0, 4), mo = +m.slice(5, 7);
                return { key: m, from: m + '-01', to: addD(mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`, -1), we: false, today: m === t.slice(0, 7), w: 100 };
            });
            head += `<tr>${corner(2)}${group(months, m => m.slice(0, 4)).map(g => th('', g.n, g.label)).join('')}</tr>`;
            head += `<tr>${months.map(m => `<th class="${m === t.slice(0, 7) ? 'today' : ''}" ${m === t.slice(0, 7) ? 'data-today="1"' : ''} style="min-width:100px;">${cap(MONTHS[+m.slice(5, 7) - 1])}</th>`).join('')}</tr>`;
        }

        // En-têtes à plusieurs niveaux : top collant propre à chaque ligne de l'en-tête
        const rowsCount = plan.zoom === 'day' ? 5 : plan.zoom === 'week' ? 4 : 2;
        let body;
        if (!plan.projects.length) {
            body = `<tr><td colspan="${cols.length + 1}" style="height:70px;text-align:center;color:#7a8799;">Aucun déploiement : créez-en dans l'onglet Administration.</td></tr>`;
        } else {
            const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true });
            const keyOf = { samu: p => p.samu_name, chef: p => p.chef_projet_nom, mes: p => p.date_mise_en_service };
            const k = keyOf[plan.sort.key];
            const ordered = [...plan.projects].sort((a, b) => {
                const va = k(a), vb = k(b);
                if (!va && vb) return 1; // valeurs vides toujours en bas
                if (va && !vb) return -1;
                return (cmp(va, vb) * plan.sort.dir) || cmp(a.samu_name, b.samu_name);
            });
            body = ordered.map(p => `<tr data-id="${p.id}">
                <th class="sam"><div class="n">${esc(p.samu_name)}</div><div class="c">${esc(p.chef_projet_nom || 'Chef de projet non défini')}</div></th>
                ${cols.map(c => `<td class="${c.we ? 'we' : ''} ${c.today ? 'today' : ''}" data-k="${c.key}">${cellContent(p, c)}</td>`).join('')}
            </tr>`).join('');
        }
        box.innerHTML = `<table class="aff-plan-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
        // Hauteurs de lignes d'en-tête : tops dynamiques si le nombre de lignes change
        const topStep = 36;
        box.querySelectorAll('thead tr').forEach((tr, i) => tr.querySelectorAll('th:not(.corner)').forEach(c => { c.style.top = (i * topStep) + 'px'; }));
        const corner_ = box.querySelector('th.corner'); if (corner_) corner_.style.top = '0px';
        document.querySelectorAll('.aff-seg button[data-z]').forEach(b => b.classList.toggle('on', b.dataset.z === plan.zoom));
        document.querySelectorAll('.aff-sort button').forEach(b => {
            const on = b.dataset.s === plan.sort.key;
            b.classList.toggle('on', on);
            b.dataset.arrow = on ? (plan.sort.dir > 0 ? ' ▲' : ' ▼') : '';
            b.textContent = ({ samu: 'SAMU', chef: 'Chef de projet', mes: 'Mise en service' })[b.dataset.s] + b.dataset.arrow;
        });
    }

    async function loadPlanning() {
        const box = document.getElementById('affPlan');
        try {
            const [cfg, proj] = await Promise.all([api('/affectation/config'), api('/affectation/projects')]);
            plan.projects = proj.projects; plan.colors = cfg.colors; plan.config = cfg; plan.loaded = true;
            renderPlanning();
            AffectationApp.planToday();
        } catch (e) {
            if (box) box.innerHTML = `<p class="aff-error" style="padding:18px;">Chargement impossible : ${esc(e.message)}</p>`;
        }
    }

    const asg = { project: null, stage: null, selected: new Set(), needed: 0 };
    function assignList() {
        const q = norm(document.getElementById('affAssignFilter').value);
        const list = (plan.resources || []).filter(r => !q || norm(`${r.nom} ${r.prenom} ${r.trigramme || ''}`).includes(q));
        const full = asg.selected.size >= asg.needed;
        document.getElementById('affAssignList').innerHTML = list.length ? list.map(r => {
            const on = asg.selected.has(r.id);
            return `<label class="${!on && full ? 'off' : ''}"><input type="checkbox" value="${r.id}" ${on ? 'checked' : ''} ${!on && full ? 'disabled' : ''} onchange="AffectationApp.assignToggle(this)"><span><b>${esc((r.nom || '').toUpperCase())}</b> ${esc(r.prenom || '')}${r.fonction ? ` <span class="aff-muted">— ${esc(r.fonction)}</span>` : ''}</span></label>`;
        }).join('') : '<div style="padding:14px;" class="aff-muted">Aucune ressource</div>';
        document.getElementById('affAssignInfo').innerHTML = `${esc(asg.info)}<br><b>${asg.selected.size} / ${asg.needed}</b> ressource(s) affectée(s)`;
    }

    const planApi = {
        planSort(key) {
            plan.sort = plan.sort.key === key ? { key, dir: -plan.sort.dir } : { key, dir: 1 };
            const box = document.getElementById('affPlan'), left = box.scrollLeft;
            renderPlanning();
            box.scrollLeft = left;
        },
        toggleStage(k) {
            if (hiddenKeys.has(k)) hiddenKeys.delete(k); else hiddenKeys.add(k);
            try { localStorage.setItem('affHiddenStages', JSON.stringify([...hiddenKeys])); } catch (e) { /* stockage indisponible */ }
            const box = document.getElementById('affPlan'), left = box.scrollLeft;
            renderPlanning();
            box.scrollLeft = left;
        },
        async openAssign(projectId, stageKey) {
            const p = plan.projects.find(x => x.id === projectId);
            const x = p && ((p.periods || {})[stageKey] || [])[0];
            if (!x || !x.needed) return;
            try {
                if (!plan.resources) plan.resources = (await api('/affectation/resources')).resources;
            } catch (e) { alert(e.message); return; }
            asg.project = p; asg.stage = stageKey; asg.needed = x.needed;
            asg.selected = new Set((p.assignments || {})[stageKey] || []);
            asg.info = `${p.samu_name} — ${planDef(stageKey).label} (${frd(x.start)} → ${frd(x.end)})`;
            document.getElementById('affAssignTitle').textContent = 'Affecter des ressources';
            document.getElementById('affAssignError').textContent = '';
            document.getElementById('affAssignFilter').value = '';
            assignList();
            document.getElementById('affAssignModal').classList.add('active');
        },
        assignToggle(cb) {
            const id = Number(cb.value);
            if (cb.checked) asg.selected.add(id); else asg.selected.delete(id);
            assignList();
        },
        assignFilter: assignList,
        closeAssign() { document.getElementById('affAssignModal').classList.remove('active'); },
        async saveAssign() {
            try {
                const r = await api(`/affectation/projects/${asg.project.id}/assignments/${asg.stage}`, { method: 'PUT', body: JSON.stringify({ resource_ids: [...asg.selected] }) });
                asg.project.assignments = asg.project.assignments || {};
                asg.project.assignments[asg.stage] = r.resource_ids;
                AffectationApp.closeAssign();
                renderPlanning();
            } catch (e) { document.getElementById('affAssignError').textContent = e.message; }
        },
        planZoom(z) { plan.zoom = z; renderPlanning(); AffectationApp.planToday(); },
        planToday() {
            const box = document.getElementById('affPlan');
            const cell = box && box.querySelector('thead th[data-today]');
            if (!cell) return;
            box.scrollLeft = Math.max(0, cell.offsetLeft - box.clientWidth / 2 + cell.offsetWidth / 2);
        },
        loadPlanning
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
            if (!isAdmin) loadPlanning();
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
    Object.assign(AffectationApp, adminApi, planApi);
    document.addEventListener('mousedown', e => {
        const box = document.getElementById('affSug');
        if (box && box.style.display === 'block' && !e.target.closest('.aff-field')) box.style.display = 'none';
    });
    window.AffectationApp = AffectationApp;
    window.showAffectationApp = () => AffectationApp.show();
    window.hideAffectationApp = () => AffectationApp.hide();
    document.addEventListener('DOMContentLoaded', mount);
})();
