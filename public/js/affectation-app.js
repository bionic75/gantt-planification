// Application « Aide à l'affectation opérationnelle » — onglets : Planning des déploiements, Administration
(function () {
    'use strict';

    const KEY = 'affectation';
    const ICON = {
        print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
        planning:
            '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h5M11 18h5"/>',
        admin: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        target: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
        rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
        asanatasks:
            '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
        asanasync:
            '<path d="M20 11a8 8 0 0 0-14-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 16"/><path d="M20 20v-4h-4"/><circle cx="12" cy="9.4" r="1.35" fill="currentColor" stroke="none"/><circle cx="9.9" cy="13.1" r="1.35" fill="currentColor" stroke="none"/><circle cx="14.1" cy="13.1" r="1.35" fill="currentColor" stroke="none"/>',
        palette:
            '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>',
        pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
        trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'
    };
    const svg = (name, cls, style) =>
        `<svg class="${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" ${style ? `style="${style}"` : ''}>${ICON[name]}</svg>`;

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
        .aff-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 20000; background: #263238; color: #fff; padding: 10px 18px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.3); font-size: 13px; max-width: 80vw; }
        .aff-toast.err { background: #b3261e; }
        #affAsanaChgBody th, #affAsanaConfBody th { background: transparent !important; color: #6b7a8d !important; font-weight: 700; } #affAsanaChgBody th::after, #affAsanaConfBody th::after { content: none !important; } #affAsanaChgBody table, #affAsanaConfBody table { background: #fff; }
        .aff-tpl { margin-bottom: 4px; } .aff-tpl-n { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .aff-tpl-l { margin: 4px 0 6px 18px; padding: 0; font-size: 13px; color: #4a5b70; } .aff-tpl-l li { margin: 2px 0; }
        .aff-hist-item { border: 1px solid #e6ebf3; border-left: 4px solid #6b7a8d; border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; background: #fff; }
        .aff-hist-item .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 6px; }
        .aff-hist-item .who { font-weight: 700; color: #1f2d3d; }
        .aff-hist-item .when { color: #6b7a8d; font-size: 12px; margin-left: auto; }
        .aff-hist-item ul { margin: 4px 0 0; padding-left: 18px; font-size: 13px; }
        .aff-hist-item li { line-height: 1.7; }
        .aff-hist-item .from { color: #b3261e; text-decoration: line-through; } .aff-hist-item .to { color: #167a45; font-weight: 600; }
        .aff-hist-tag { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; color: #fff; }
        .aff-card-head.aff-fold { cursor: pointer; user-select: none; }
        .aff-fold-chev { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; margin-right: 4px; transition: transform .15s; color: #0f4c5c; }
        .aff-card.folded .aff-fold-chev { transform: rotate(-90deg); }
        .aff-card.folded > .aff-card-body { display: none; }
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
        .aff-color-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #e6ebf3; border-radius: 10px; background: #fff; }
        .aff-color-row .lbl { flex: 1; font-weight: 600; color: #2c3e50; font-size: 13px; }
        .aff-pat-prev { width: 44px; height: 22px; border-radius: 5px; border: 1px solid rgba(0,0,0,.15); flex-shrink: 0; }
        .aff-pat-sel { padding: 4px 6px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 12px; max-width: 150px; }
        .aff-colors { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 10px 18px; }
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
        .aff-stage { display: grid; grid-template-columns: 230px 1fr auto; gap: 8px 12px; align-items: center; padding: 8px 0; border-top: 1px solid #f0f3f8; }
        .aff-stage .name { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #2c3e50; }
        .aff-stage .name i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
        .aff-stage .dates { display: flex; flex-direction: column; gap: 6px; }
        .aff-stage .dates .pr { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
        .aff-stage .dates input { padding: 6px 6px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; width: 142px; }
        .aff-stage .dates input.aff-days { width: 78px; text-align: center; }
        .aff-stage .dates .pr .aff-wk { width: 160px; }
        .aff-stage .dates .pr.aff-evl { flex-wrap: wrap; gap: 6px 10px; font-size: 12px; border-left: 3px solid #d7dff0; padding-left: 8px; margin-top: 2px; }
        .aff-evl select { padding: 6px 8px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 12px; flex: 1; min-width: 280px; max-width: 560px; }
        .aff-evl .none { color: #b26a00; } .aff-evl .ok { color: #1b7f3b; } .aff-evl .warn { color: #b26a00; }
        .aff-stage .dates select.aff-need { padding: 7px 8px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; width: 112px; }
        #affProjectModal input[type=date]::-webkit-calendar-picker-indicator, #affectationContainer input[type=date]::-webkit-calendar-picker-indicator { opacity: 0; position: absolute; right: 0; width: 34px; height: 100%; cursor: pointer; }
        #affProjectModal input[type=date] { position: relative; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234a5b70' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M3 10h18M8 3v4M16 3v4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; background-size: 16px; }
        .aff-dp { position: fixed; z-index: 100000; width: 292px; background: #fff; border: 1px solid #cfd8e6; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.28); padding: 10px; font-size: 13px; color: #2c3e50; }
        .aff-dp .hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-weight: 800; }
        .aff-dp .hd button { border: none; background: #eef2f8; border-radius: 8px; width: 30px; height: 28px; cursor: pointer; font-size: 16px; color: #2c3e50; padding: 0; }
        .aff-dp table { border-collapse: separate; border-spacing: 2px; width: 100%; table-layout: fixed; font-size: 12px; }
        .aff-dp th { background: none !important; color: #7a8799 !important; font-weight: 700; cursor: default !important; padding: 2px 0 !important; text-align: center; }
        .aff-dp th::after { content: none !important; }
        .aff-dp td { padding: 0; text-align: center; }
        .aff-dp td.wk { color: #0f766e; font-weight: 800; background: #e6f4f1; border-radius: 6px; cursor: pointer; padding: 6px 0; }
        .aff-dp td.wk:hover { background: #cdebe5; }
        .aff-dp td.d button { width: 100%; padding: 6px 0; border: none; background: transparent; border-radius: 6px; cursor: pointer; font-size: 12px; color: #2c3e50; }
        .aff-dp td.d button:hover { background: #dfe9f8; }
        .aff-dp td.d.o button { color: #aab4c3; } .aff-dp td.d.we button { color: #b8860b; }
        .aff-dp td.d.sel button { background: #0f766e; color: #fff; font-weight: 800; } .aff-dp td.d.today button { outline: 2px solid #2e9d62; outline-offset: -2px; }
        .aff-dp td.d.dis button { opacity: .3; cursor: not-allowed; }
        .aff-dp .ft { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #7a8799; }
        .aff-dp .ft button { border: none; background: none; color: #0f766e; font-weight: 700; cursor: pointer; padding: 2px 4px; }
        .aff-bad { border-color: #e03b3b !important; background: #fff1f1 !important; box-shadow: 0 0 0 2px rgba(224,59,59,.2); }
        .aff-modal-foot .aff-error { flex: 1; text-align: left; font-size: 12px; line-height: 1.5; max-height: 90px; overflow: auto; }
        .aff-section-title { margin: 20px 0 4px; font-size: 13px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: .5px; }
        .aff-sync-sec { border: 1px solid #dfe5ef; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
        .aff-sync-sec h4 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .4px; color: #0f766e; display: flex; align-items: center; gap: 8px; }
        .aff-sync-sec h4 input, .aff-sync-row input[type=checkbox] { width: auto; display: inline-block; margin: 0; }
        .aff-sync-sec .aff-field { margin-top: 8px; }
        .aff-sync-sec .aff-field input[type=text], .aff-sync-sec .aff-field input[type=date] { padding: 7px 9px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 13px; }
        #affAsanaTable th { background: #e6f4f1 !important; color: #0f4c5c !important; cursor: default !important; } #affAsanaTable th::after { content: none !important; }
        #affAsanaResult th { background: #e6f4f1 !important; color: #0f4c5c !important; cursor: default !important; } #affAsanaResult th::after { content: none !important; }
        #affAsanaResult tr:nth-child(even) td { background: #f8fafc; }
        .aff-av { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
        .aff-av-b { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: #e9edf3; color: #4a5b70; }
        .aff-av-b.ok { background: #d7f2e3; color: #167a45; } .aff-av-b.mid { background: #ffeccc; color: #9a5b00; }
        .aff-av-b.ko { background: #fbd9d9; color: #b3261e; } .aff-av-b.here { background: #d9e8fb; color: #1d5fa8; }
        @media (max-width: 760px) { .aff-proj { grid-template-columns: 1fr; } .aff-stage { grid-template-columns: 1fr; } }
    `;

    const html = `
    <div class="fixed-header">
        <div class="user-info" id="affectationUserInfo">
            <span class="app-title-center">Aide à l'affectation opérationnelle</span>
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
            <button class="tab-btn" id="affectationTabEvents" onclick="AffectationApp.tab('events')">${svg('planning', 'tab-ico')}Événements</button>
            <button class="tab-btn" id="affectationTabAteliers" onclick="AffectationApp.tab('ateliers')">${svg('rocket', 'tab-ico')}Planification des ateliers métier</button>
            <button class="tab-btn" id="affectationTabAdmin" onclick="AffectationApp.tab('admin')" style="display:none;">${svg('admin', 'tab-ico')}Administration</button>
            <button type="button" onclick="goHome()" title="Accueil" aria-label="Accueil" style="padding:8px 15px;background-color:#16a085;color:white;border:none;cursor:pointer;font-size:18px;border-radius:4px;margin-right:5px;"><svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px;stroke:white;vertical-align:middle;"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/></svg></button>
            <button class="logout-icon" onclick="AffectationApp.logout()" title="Déconnexion"></button>
        </div>
    </div>
    <div class="header-spacer"></div>

    <!-- Onglet « Planning des déploiements » : îlot Vue (frontend/src/ilots/affectation/planning/OngletPlanningAffectation.vue) -->
    <div id="affectationPlanningTab" class="tab-content active aff-panel"></div>

    <!-- Onglet « Événements » : îlot Vue (frontend/src/ilots/affectation/OngletEvenementsAffectation.vue) -->
    <div id="affectationEventsTab" class="tab-content aff-panel"></div>

    <div id="affectationAteliersTab" class="tab-content aff-panel">
        <div id="atelierRoot"><p class="aff-muted">Chargement…</p></div>
    </div>

    <div id="affectationAdminTab" class="tab-content aff-panel">
        <h2>Administration</h2>

        <section class="aff-card" id="affCardDeploy">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('rocket', 'aff-ico')}Déploiements de SAMU</span>
                <span style="display:inline-flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="aff-btn" id="affRefreshAll" onclick="AffectationApp.asanaRefreshAll(this)" title="Relire dans Asana tous les déploiements qui ont un projet correspondant (rubriques nouvelles ou modifiées uniquement)">${svg('asanasync', 'aff-ico-sm')}Tout rafraîchir depuis Asana</button>
                    <button type="button" class="aff-btn" onclick="AffectationApp.asanaOpen()" title="Récupérer les dates d'un projet de déploiement depuis un export CSV d'Asana">${svg('save', 'aff-ico-sm')}Importer depuis Asana</button>
                    <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.editProject(null)">${svg('plus', 'aff-ico-sm')}Nouveau déploiement</button>
                </span>
            </header>
            <div id="affLegend" class="aff-legend"></div>
            <div id="affProjects"><p class="aff-muted">Chargement…</p></div>
        </section>

        <section class="aff-card" id="affAsanaCard">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('save', 'aff-ico')}Connexion Asana</span>
                <span class="aff-muted" style="font-size:12px;">Récupération des dates des projets de déploiement (lecture seule)</span>
            </header>
            <div id="affAsanaCfg"><p class="aff-muted">Chargement…</p></div>
            <div id="affAsanaProjects"></div>
        </section>

        <section class="aff-card" id="affCardStageTypes">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('asanasync', 'aff-ico')}Correspondance activités Asana ↔ types d'événements</span>
                <span class="aff-muted" style="font-size:12px;">Type des événements créés par la synchronisation vers la planification</span>
            </header>
            <p class="aff-muted" style="font-size:12px;margin:0 0 10px;">Chaque activité reprise d'Asana (étapes avec ressources) est reliée à un <b>type d'événement</b>. Lors de la synchronisation d'une étape vers la planification, l'événement créé reçoit ce type : icône, libellé court et couleurs du type (paramétrés dans l'application principale › Administration › Paramétrage des types d'événements).</p>
            <div id="affStageTypes"><p class="aff-muted">Chargement…</p></div>
        </section>

        <section class="aff-card" id="affCardTemplate">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('print', 'aff-ico')}Modèle PowerPoint d'export</span>
                <span class="aff-muted" style="font-size:12px;">Charte et nom des fichiers des exports PDF / PowerPoint du planning</span>
            </header>
            <div id="affTplBox"><p class="aff-muted">Chargement…</p></div>
            <p class="aff-muted" style="font-size:12px;margin:6px 0 10px;">Le modèle doit contenir une diapositive « Titre et contenu » (titre, sous-titre, pied de page). Le planning et sa légende sont insérés au centre, sans empiéter sur le titre ni sur le pied de page.</p>
            <div class="aff-fn">
                <label class="lbl" for="affFnPattern" style="font-weight:700;font-size:13px;">Nom des fichiers produits (PDF / PowerPoint)</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0;">
                    <input id="affFnPattern" type="text" maxlength="150" style="flex:1;min-width:320px;padding:7px 10px;border:1px solid #cfd8e6;border-radius:8px;" oninput="AffectationApp.fnPreview()" placeholder="SI-SAMU_Planning_Déploiement_{AAAAMMJJ}_{HHMM}">
                    <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.fnSave()">Enregistrer</button>
                    <button type="button" class="aff-btn" onclick="AffectationApp.fnReset()">Par défaut</button>
                </div>
                <div class="aff-muted" style="font-size:12px;">Exemple : <b id="affFnExample"></b> — jetons : <code>{AAAAMMJJ}</code> date · <code>{HHMM}</code> heure · <code>{AAAA}</code> <code>{MM}</code> <code>{JJ}</code> <code>{HH}</code> <code>{MN}</code> · <code>{DEBUT}</code> <code>{FIN}</code> période affichée · <code>{ECHELLE}</code> jour / semaine / mois… · <code>{TITRE}</code> titre saisi à l'export</div>
            </div>
            <div class="aff-actions" style="margin-top:12px;">
                <input type="file" id="affTplFile" accept=".pptx" style="display:none" onchange="AffectationApp.tplUpload(this)">
                <button type="button" class="aff-btn aff-btn-primary" onclick="document.getElementById('affTplFile').click()">${svg('plus', 'aff-ico-sm')}Importer un modèle (.pptx)</button>
                <button type="button" class="aff-btn" id="affTplRemove" style="display:none" onclick="AffectationApp.tplRemove()">Supprimer le modèle</button>
                <span id="affTplMsg" class="aff-muted"></span>
            </div>
        </section>

        <section class="aff-card" id="affCardColors">
            <header class="aff-card-head">
                <span class="aff-card-title">${svg('palette', 'aff-ico')}Paramétrer la couleur des étapes</span>
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
        <div class="modal-content" style="max-width:1180px; width:96%; max-height:92vh; overflow-y:auto; padding:0;">
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

    <div class="modal" id="affAsanaTasksModal">
        <div class="modal-content" style="max-width:1500px; width:98%; max-height:94vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span id="affAsanaTasksTitle" class="aff-card-title">${svg('asanatasks', 'aff-ico')}Tâches du projet Asana</span>
                <button type="button" class="aff-x" onclick="AffectationApp.asanaTasksClose()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div id="affAsanaTasksBody" class="aff-modal-body"><p class="aff-muted">Chargement…</p></div>
            <div class="aff-modal-foot">
                <span id="affAsanaTasksMsg" class="aff-error"></span>
                <button type="button" class="aff-btn" onclick="AffectationApp.asanaTasksReset()" title="Remet toutes les rubriques sur la règle automatique">Tout remettre à la règle</button>
                <button type="button" class="aff-btn" onclick="AffectationApp.asanaTasksClose()">Fermer</button>
                <button type="button" class="aff-btn aff-btn-primary" id="affAsanaTasksApply" onclick="AffectationApp.asanaTasksApply()">${svg('save', 'aff-ico-sm')}Appliquer les remplacements</button>
            </div>
        </div>
    </div>

    <div class="modal" id="affDelEvModal">
        <div class="modal-content" style="max-width:760px; width:96%; max-height:92vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span class="aff-card-title" style="color:#b3261e;">${svg('trash', 'aff-ico')}Événements liés à ce déploiement</span>
                <button type="button" class="aff-x" onclick="AffectationApp.delEvCancel()" aria-label="Annuler">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div id="affDelEvBody" class="aff-modal-body"></div>
            <div class="aff-modal-foot" style="flex-wrap:wrap;">
                <button type="button" class="aff-btn" onclick="AffectationApp.delEvCancel()">Annuler (ne rien supprimer)</button>
                <button type="button" class="aff-btn" onclick="AffectationApp.delEvGo('keep')" title="Le déploiement est supprimé, les événements restent dans l'application">Supprimer le déploiement seulement</button>
                <button type="button" class="aff-btn" style="background:#b3261e;color:#fff;border-color:#b3261e;" onclick="AffectationApp.delEvGo('delete')" title="Supprime aussi les événements ; les experts mobilisés sont remis Disponible / En attente d'affectation, localisation effacée">Supprimer le déploiement ET les événements</button>
            </div>
        </div>
    </div>

    <div class="modal" id="affAsanaChgModal">
        <div class="modal-content" style="max-width:820px; width:96%; max-height:92vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span id="affAsanaChgTitle" class="aff-card-title">${svg('asanasync', 'aff-ico')}Changements issus d'Asana</span>
                <button type="button" class="aff-x" onclick="AffectationApp.asanaChgClose()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div id="affAsanaChgBody" class="aff-modal-body"></div>
            <div class="aff-modal-foot"><button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.asanaChgClose()">Fermer</button></div>
        </div>
    </div>

    <div class="modal" id="affAsanaConfModal" style="z-index:10040;">
        <div class="modal-content" style="max-width:900px; width:96%; max-height:92vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span id="affAsanaConfTitle" class="aff-card-title">${svg('asanasync', 'aff-ico')}Conflits avec Asana : à vous de trancher</span>
                <button type="button" class="aff-x" onclick="AffectationApp.asanaConflictsClose()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div id="affAsanaConfBody" class="aff-modal-body"></div>
            <div class="aff-modal-foot">
                <span id="affAsanaConfMsg" class="aff-error"></span>
                <button type="button" class="aff-btn" onclick="AffectationApp.asanaConflictsClose()">Plus tard</button>
                <button type="button" class="aff-btn aff-btn-primary" id="affAsanaConfOk" onclick="AffectationApp.asanaConflictsApply()">${svg('save', 'aff-ico-sm')}Valider mes choix</button>
            </div>
        </div>
    </div>

    <div class="modal" id="affHistModal">
        <div class="modal-content" style="max-width:860px; width:96%; max-height:92vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span id="affHistTitle" class="aff-card-title">${svg('search', 'aff-ico')}Historique</span>
                <button type="button" class="aff-x" onclick="AffectationApp.historyClose()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div id="affHistBody" class="aff-modal-body"></div>
            <div class="aff-modal-foot"><button type="button" class="aff-btn" onclick="AffectationApp.historyClose()">Fermer</button></div>
        </div>
    </div>

    <div class="modal" id="affAsanaModal">
        <div class="modal-content" style="max-width:820px; width:96%; max-height:92vh; overflow-y:auto; padding:0;">
            <div class="aff-modal-head">
                <span class="aff-card-title">Importer depuis Asana</span>
                <button type="button" class="aff-x" onclick="AffectationApp.asanaClose()" aria-label="Fermer">${svg('x', 'aff-ico-sm')}</button>
            </div>
            <div class="aff-modal-body">
                <p class="aff-muted" style="margin:0 0 12px;">Dans Asana : ouvrez le projet de déploiement (ex. « [SAMU 25] SF4 - Déploiement »), menu du projet › <strong>Exporter</strong> › <strong>CSV</strong> (avec tous les champs personnalisés). Chargez ensuite le fichier ici : un aperçu s'affiche avant toute écriture.</p>
                <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
                    <div class="aff-field" id="affAsanaFileBox"><label class="lbl">Fichier CSV Asana</label><input id="affAsanaFile" type="file" accept=".csv,text/csv" onchange="AffectationApp.asanaAnalyze()"></div>

                </div>
                <div id="affAsanaResult"></div>
            </div>
            <div class="aff-modal-foot">
                <span id="affAsanaError" class="aff-error"></span>
                <button type="button" class="aff-btn" onclick="AffectationApp.asanaClose()">Fermer</button>
                <button type="button" class="aff-btn aff-btn-primary" id="affAsanaOk" onclick="AffectationApp.asanaApply()" style="display:none;">${svg('save', 'aff-ico-sm')}Appliquer la sélection</button>
            </div>
        </div>
    </div>

    <button id="affectationBackBtn" onclick="backToPlanification()" style="display:none;position:fixed;top:10px;right:340px;z-index:1001;background:#fff;border:none;color:#2c3e50;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);white-space:nowrap;">
        <svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;stroke:#3949ab;"><path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/></svg>Planification
    </button>
    <div class="aff-pill" id="affectationOnlineUsersContainer" onclick="toggleOnlineUsersTooltipFrom(this, event)" title="Utilisateurs connectés : cliquer pour discuter" style="display:none;cursor:pointer;">
        <span style="font-size:12px;color:#27ae60;">●</span>
        <div id="affectationOnlineUsersAvatars" style="display:flex;align-items:center;"></div>
        <span id="affectationOnlineUsersCount" style="font-size:11px;color:#666;margin-left:4px;"></span>
    </div>
    <div class="aff-pill" id="affectationTimerDisplay" style="display:none;">
        <svg viewBox="0 0 24 24" aria-hidden="true" style="width:15px;height:15px;margin-right:6px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>
        <span id="affectationTimerText">--:--</span>
    </div>`;

    // Rubriques de l'Administration repliables / dépliables (état mémorisé dans le navigateur)
    function setupFolds() {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem('affFolded') || '{}');
        } catch (e) {
            saved = {};
        }
        document.querySelectorAll('#affectationAdminTab > section.aff-card').forEach((sec, i) => {
            const head = sec.querySelector(':scope > .aff-card-head');
            if (!head || sec.querySelector(':scope > .aff-card-body')) return;
            const key = sec.id || 'card' + i;
            const body = document.createElement('div');
            body.className = 'aff-card-body';
            [...sec.children].filter(c => c !== head).forEach(c => body.appendChild(c));
            sec.appendChild(body);
            const chev = document.createElement('span');
            chev.className = 'aff-fold-chev';
            chev.innerHTML =
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
            head.classList.add('aff-fold');
            head.title = 'Replier / déplier cette rubrique';
            const title = head.querySelector('.aff-card-title');
            if (title) title.prepend(chev);
            if (saved[key]) sec.classList.add('folded');
            head.addEventListener('click', ev => {
                if (ev.target.closest('button, a, input, select')) return; // les boutons de l'en-tête gardent leur action
                sec.classList.toggle('folded');
                saved[key] = sec.classList.contains('folded');
                try {
                    localStorage.setItem('affFolded', JSON.stringify(saved));
                } catch (e) {
                    /* stockage indisponible */
                }
            });
        });
    }

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
        setupFolds();
    }

    function updateUser() {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        const full = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.username;
        document.getElementById('affectationUserDisplayName').textContent = full;
        document.getElementById('affectationUserDisplayRole').textContent =
            currentUser.activeProfile === 'admin'
                ? 'Administrateur'
                : currentUser.activeProfile === 'expert'
                  ? 'Expert Métier'
                  : 'Utilisateur';
        const tri = document.getElementById('affectationProfileTrigramme');
        const photo = document.getElementById('affectationProfilePhoto');
        tri.textContent = currentUser.trigramme || '?';
        if (currentUser.profilePhoto) {
            photo.src = currentUser.profilePhoto;
            photo.style.display = 'block';
            tri.style.display = 'none';
        } else {
            photo.style.display = 'none';
            tri.style.display = 'flex';
        }
        document.getElementById('affectationTabAdmin').style.display =
            currentUser.activeProfile === 'admin' ? 'inline-block' : 'none';
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
            document.getElementById('affectationOnlineUsersAvatars').innerHTML = users
                .slice(0, max)
                .map((u, i) => {
                    const bg = typeof getAvatarColor === 'function' ? getAvatarColor(u.profile) : '#3949ab';
                    const ini = u.trigramme || (u.prenom || '').charAt(0) + (u.nom || '').charAt(0);
                    const name = `${u.prenom || ''} ${u.nom || ''}`.trim() || u.username || '';
                    const base = `width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:${bg};margin-left:${i ? -8 : 0}px;box-shadow:0 1px 3px rgba(0,0,0,.25);overflow:hidden;`;
                    return u.profilePhoto
                        ? `<div title="${esc(name)}" style="${base}"><img src="${u.profilePhoto}" alt="" style="width:100%;height:100%;object-fit:cover;"></div>`
                        : `<div title="${esc(name)}" style="${base}display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">${esc(ini)}</div>`;
                })
                .join('');
            const extra = users.length - max;
            const cnt = document.getElementById('affectationOnlineUsersCount');
            cnt.textContent = extra > 0 ? `+${extra}` : '';
        } catch (e) {
            /* réseau indisponible : on garde la valeur précédente */
        }
    }

    function stopLoops() {
        clearInterval(timerLoop);
        timerLoop = null;
        clearInterval(onlineTimer);
        onlineTimer = null;
    }

    // ================= Déploiements de SAMU (administration) =================
    const state = {
        config: null,
        colors: {},
        patterns: {},
        projects: [],
        users: [],
        locations: [],
        form: null,
        loaded: false
    };

    const esc = t =>
        String(t == null ? '' : t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    const norm = t =>
        String(t || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    const fmt = iso => (iso ? iso.split('-').reverse().join('/') : '');
    const stageDef = key => state.config.stages.find(x => x.key === key);
    const color = key => state.colors[key] || '#888888';
    // ---- motifs (en plus de la couleur) ----
    const PATTERNS = [
        ['none', 'Uni'],
        ['diag', 'Rayures'],
        ['diag2', 'Rayures inversées'],
        ['chevron', 'Chevrons'],
        ['grid', 'Quadrillage'],
        ['dots', 'Pois'],
        ['cross', 'Croisillons'],
        ['hlines', 'Lignes horizontales'],
        ['vlines', 'Lignes verticales'],
        ['zigzag', 'Zigzag']
    ];
    const PATTERN_SVG = {
        diag: ['8', "<path d='M-2 2l4-4M0 8l8-8M6 10l4-4' stroke-width='2'/>"],
        diag2: ['8', "<path d='M10 2l-4-4M8 8l-8-8M2 10l-4-4' stroke-width='2'/>"],
        chevron: ['16 12', "<path d='M0 7L8 13L16 7M0 1L8 7L16 1M0 -5L8 1L16 -5' stroke-width='2' fill='none'/>"],
        grid: ['10', "<path d='M0 .5H10M.5 0V10' stroke-width='1.4'/>"],
        dots: ['8', "<circle cx='4' cy='4' r='1.6' stroke='none' fill='C'/>"],
        cross: ['8', "<path d='M0 0L8 8M8 0L0 8' stroke-width='1.4'/>"],
        hlines: ['6', "<path d='M0 3H6' stroke-width='2'/>"],
        vlines: ['6', "<path d='M3 0V6' stroke-width='2'/>"],
        zigzag: ['12 8', "<path d='M0 6L3 2L6 6L9 2L12 6' stroke-width='1.8' fill='none'/>"]
    };
    // Style de fond : couleur + motif discret, clair sur fond foncé et foncé sur fond clair
    function bgStyle(hex, pattern) {
        const base = `background-color:${hex};`;
        const def = PATTERN_SVG[pattern];
        if (!def) return base;
        const n = parseInt(String(hex).slice(1), 16);
        const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
        const c = lum > 0.62 ? 'rgba(0,0,0,.38)' : 'rgba(255,255,255,.62)';
        const [size, body] = def;
        const [w, h] = size.split(' ').concat(size.split(' ')).slice(0, 2);
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' fill='none' stroke='${c}'>${body.replace("fill='C'", `fill='${c}'`)}</svg>`;
        return `${base}background-image:url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}');background-size:${w}px ${h}px;`;
    }
    const pattern = key => state.patterns[key] || 'none';

    async function api(path, opts) {
        const res = await fetch(`${API_URL}${path}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            ...(opts || {})
        });
        let data = {};
        try {
            data = await res.json();
        } catch (e) {
            /* réponse vide */
        }
        if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { data });
        return data;
    }

    // Modèle PowerPoint d'export (titre, logo, pied de page) : état et administration
    const tpl = { meta: { exists: false } };
    const exportName = {
        pattern: 'SI-SAMU_Planning_Déploiement_{AAAAMMJJ}_{HHMM}',
        defaultPattern: 'SI-SAMU_Planning_Déploiement_{AAAAMMJJ}_{HHMM}'
    };
    // Nom de fichier d'après le modèle : jetons {AAAAMMJJ} {HHMM} {AAAA} {MM} {JJ} {HH} {MN} {DEBUT} {FIN} {ECHELLE} {TITRE}
    function exportFileName(pattern, o) {
        const d = new Date(),
            z = n => String(n).padStart(2, '0');
        const ymd = iso => String(iso || '').replace(/-/g, '');
        const slug = v =>
            String(v || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w]+/g, '_')
                .replace(/^_+|_+$/g, '');
        const map = {
            AAAAMMJJ: `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}`,
            HHMM: `${z(d.getHours())}${z(d.getMinutes())}`,
            AAAA: String(d.getFullYear()),
            MM: z(d.getMonth() + 1),
            JJ: z(d.getDate()),
            HH: z(d.getHours()),
            MN: z(d.getMinutes()),
            DEBUT: ymd(o && o.from),
            FIN: ymd(o && o.to),
            ECHELLE: (o && SCALE_LABEL[o.zoom]) || '',
            TITRE: slug(o && o.title)
        };
        const name = String(pattern || exportName.defaultPattern)
            .replace(/\{([A-Z]+)\}/g, (m, k) => (k in map ? map[k] : m))
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/\.+$/, '')
            .slice(0, 150);
        return name || 'planning-deploiements';
    }
    async function loadTpl(withPreview) {
        try {
            tpl.meta = await api('/affectation/template');
        } catch (e) {
            tpl.meta = { exists: false };
        }
        try {
            Object.assign(exportName, await api('/affectation/export-config'));
        } catch (e) {
            /* valeur par défaut */
        }
        if (!tpl.meta.exists) tpl.preview = null;
        else if (withPreview && (!tpl.preview || tpl.previewKey !== tpl.meta.uploadedAt)) {
            try {
                tpl.preview = await api('/affectation/template/preview');
                tpl.previewKey = tpl.meta.uploadedAt;
            } catch (e) {
                tpl.preview = null;
            }
        }
        renderTplCard();
    }
    function renderTplCard() {
        const box = document.getElementById('affTplBox');
        if (!box) return;
        const m = tpl.meta,
            i = m.info || {};
        const kb = n =>
            n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.round(n / 1024) + ' ko';
        box.innerHTML = m.exists
            ? `<div class="aff-tpl"><div class="aff-tpl-n">${svg('print', 'aff-ico-sm')}<b>${esc(m.name)}</b> <span class="aff-muted">(${kb(m.size)}) · importé le ${esc(frd(String(m.uploadedAt || '').slice(0, 10)))}${m.uploadedBy ? ' par ' + esc(m.uploadedBy) : ''}</span></div>
                <ul class="aff-tpl-l"><li>Diapositive utilisée : n° <b>${i.baseSlide}</b> sur ${i.slides} (disposition « ${esc(i.layout || '—')} »)</li>
                <li>Pages reprises : ${i.cover ? 'page de garde, ' : ''}diapositive de planning${i.end ? ', page de fin' : ''} (les pages de garde et de fin sont facultatives à l'export)</li>
                <li>Titre, logo, sous-titre et pied de page repris du modèle ; la date « JJ-MM-AAAA » du pied de page est remplacée par la date du jour</li>
                <li>Zone du planning et de la légende : <b>${i.zone ? i.zone.wMm + ' × ' + i.zone.hMm + ' mm' : '—'}</b>, centrée entre le titre et le pied de page</li></ul></div>`
            : '<p class="aff-muted" style="margin:0 0 6px;">Aucun modèle importé : les exports PDF / PowerPoint utilisent la mise en page standard.</p>';
        const rm = document.getElementById('affTplRemove');
        if (rm) rm.style.display = m.exists ? '' : 'none';
        const fp = document.getElementById('affFnPattern');
        if (fp && document.activeElement !== fp) fp.value = exportName.pattern;
        AffectationApp.fnPreview();
    }

    // ---- Correspondance activités Asana ↔ types d'événements ----
    const stageTypes = { data: null };
    async function loadStageTypes() {
        const box = document.getElementById('affStageTypes');
        if (!box) return;
        try {
            stageTypes.data = await api('/affectation/stage-event-types');
            renderStageTypes();
        } catch (e) {
            box.innerHTML = `<p class="aff-error">${esc(e.message)}</p>`;
        }
    }
    function renderStageTypes() {
        const d = stageTypes.data,
            box = document.getElementById('affStageTypes');
        if (!d || !box) return;
        const chip = t => (typeof evtChip === 'function' && t ? evtChip(t, true) : '');
        const acts = d.asanaActivities || [];
        const tpl = d.asanaTemplate;
        const tplActs = tpl ? tpl.tasks : [];
        const rules = d.asanaRules || {};
        const optsAsana = rule =>
            (tpl
                ? `<optgroup label="Projet type : ${esc(tpl.name)}">${tplActs.map(x => `<option value="${esc(x.value)}" ${rule === x.value ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>`
                : '') +
            `<optgroup label="Règles usuelles">${acts.map(x => `<option value="${esc(x.value)}" ${rule === x.value && !tplActs.some(y => y.value === rule) ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>`;
        box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;font-size:13px;"><b>Projet Asana type :</b> <span>${tpl ? `${esc(tpl.name)} · ${tplActs.length} tâche(s)` : '<span class="aff-muted">aucun (règles usuelles seulement)</span>'}</span>
            <button type="button" class="aff-btn" onclick="AffectationApp.tplChoose()">${tpl ? 'Changer' : 'Choisir'} le projet type…</button>${tpl ? '<button type="button" class="aff-btn" onclick="AffectationApp.tplLoad(\'\')">Retirer</button>' : ''}<span id="affTplPick"></span></div>
            <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="text-align:left;color:#6b7a8d;font-size:11px;"><th style="padding:6px 8px;">Activité de l'outil de planification</th><th style="padding:6px 8px;min-width:260px;">Activité Asana</th><th style="padding:6px 8px;min-width:260px;">Type d'événement</th><th style="padding:6px 8px;">Aperçu (planning / carte)</th></tr></thead><tbody>
            ${d.stages
                .map(st => {
                    const cur = d.types.find(t => t.id === d.mapping[st.key]);
                    const rule = rules[st.key] || '';
                    const known = acts.some(x => x.value === rule) || tplActs.some(x => x.value === rule);
                    return `<tr style="border-top:1px solid #eef1f6;"><td style="padding:8px;"><b>${esc(st.label)}</b></td>
                    <td style="padding:8px;"><select data-stage="${st.key}" onchange="AffectationApp.asanaRuleSet(this)" style="width:100%;padding:6px;"><option value="">Par défaut : ${esc(st.rule)}</option>${optsAsana(rule)}<option value="__custom" ${rule && !known ? 'selected' : ''}>Autre (code ou titre de tâche)…</option></select>
                    <input type="text" data-stage-custom="${st.key}" value="${rule && !known ? esc(rule.replace(/^title:/, '')) : ''}" placeholder="ex. 5.4 ou titre de la tâche" onchange="AffectationApp.asanaRuleSet(this)" style="width:100%;padding:6px;margin-top:4px;${rule && !known ? '' : 'display:none;'}"></td>
                    <td style="padding:8px;"><select data-stage="${st.key}" onchange="AffectationApp.stageTypeSet(this)" style="width:100%;padding:6px;">${d.types.map(t => `<option value="${t.id}" ${cur && cur.id === t.id ? 'selected' : ''}>${esc(t.label_long)}${t.label_short ? ' (' + esc(t.label_short) + ')' : ''}</option>`).join('')}</select></td>
                    <td style="padding:8px;" id="affStChip_${st.key}">${chip(cur)}</td></tr>`;
                })
                .join('')}</tbody></table></div>
            <div class="aff-actions" style="margin-top:10px;"><span id="affStageTypesMsg" class="aff-muted"></span></div>`;
    }

    // ---- Tâches du projet Asana d'un déploiement : consultation des échéances et remplacement de la donnée reprise ----
    const asanaT = { id: null, data: null, ov: {} };
    // Logo Asana : déploiement repris d'Asana (à côté du nom du SAMU) ; origine de chaque donnée dans la fenêtre des tâches
    const asanaLogo = (title, size) =>
        `<img src="/img/asana-logo.png" alt="Asana" title="${esc(title || "Projet repris d'Asana")}" style="width:${size || 14}px;height:${size || 14}px;vertical-align:-2px;margin-left:5px;object-fit:contain;">`;
    const asanaMark = p => (p && p.from_asana ? asanaLogo("Projet repris d'Asana") : '');
    function asanaOrigin(r) {
        const o = asanaT.ov[r.key] || {},
            effOf = gid => {
                const t = asanaT.data.tasks.find(x => x.gid === gid);
                return t && t.eff;
            };
        let exp;
        if (r.kind === 'date') {
            const e = effOf(o.task);
            exp = e ? e.end : (r.auto && r.auto.date) || null;
            const cur = (r.current && r.current.date) || null;
            return !cur && !exp ? null : cur === exp ? 'asana' : 'tool';
        }
        const es = effOf(o.start),
            ee = effOf(o.end),
            au = r.auto || {};
        const a = es ? es.start : au.start,
            b = ee ? ee.end : au.end,
            cu = r.current || {};
        if (!cu.start && !a && !b) return null;
        return (cu.start || null) === (a || b || null) && (cu.end || null) === (b || a || null) ? 'asana' : 'tool';
    }
    const asanaOriginHtml = r => {
        const k = asanaOrigin(r);
        return k === 'asana'
            ? `<div style="margin-top:4px;font-size:11px;color:#1b7f3b;white-space:normal;">${asanaLogo('Donnée Asana originelle', 13)} Asana (origine)</div>`
            : k === 'tool'
              ? `<div style="margin-top:4px;font-size:11px;color:#b26a00;white-space:normal;" title="Cette valeur diffère de celle d'Asana : elle a été modifiée dans l'outil de planification">✎ modifiée dans l'outil</div>`
              : '';
    };
    const aFr = d => (d ? d.split('-').reverse().join('/') : '');
    const aVal = v => (!v ? '—' : v.date ? aFr(v.date) : `${aFr(v.start)} → ${aFr(v.end)}`);
    const aEffTxt = e =>
        !e ? 'non datée' : e.start === e.end ? aFr(e.end) : `${aFr(e.start).slice(0, 5)} → ${aFr(e.end)}`;
    const aTaskLabel = t =>
        `${t.code ? t.code + ' ' : ''}${String(t.name)
            .replace(/^\s*\d+(\.\d+)*\.?\s+/, '')
            .slice(0, 64)} — ${aEffTxt(t.eff)}`;
    function asanaTaskOptions(sel) {
        return (
            '<option value="">— règle automatique —</option>' +
            asanaT.data.tasks
                .map(
                    t =>
                        `<option value="${t.gid}" ${t.eff ? '' : 'disabled'} ${sel === t.gid ? 'selected' : ''}>${esc(aTaskLabel(t))}</option>`
                )
                .join('')
        );
    }
    // Événement associé à chaque activité (liste des événements du SAMU et du type d'activité ; création proposée s'il n'y en a pas)
    function asanaRowDates(key) {
        const d = asanaT.data,
            r = d && d.rubriques.find(x => x.key === key);
        if (!r) return null;
        const eff = gid => {
            const t = d.tasks.find(x => x.gid === gid);
            return t && t.eff;
        };
        const o = asanaT.ov[key] || {};
        if (r.kind === 'date') {
            const e = eff(o.task);
            const v = e ? e.end : (r.current && r.current.date) || (r.auto && r.auto.date);
            return v ? { start: v, end: v } : null;
        }
        const es = eff(o.start),
            ee = eff(o.end),
            base = r.current || r.auto || {};
        let a = es ? es.start : base.start,
            b = ee ? ee.end : base.end;
        // Une seule tâche choisie : son intervalle complet est repris
        if (es && !ee && es.end > es.start) b = es.end;
        if (ee && !es && ee.end > ee.start) a = ee.start;
        const st = a || b,
            en = b || a;
        return st ? (st <= en ? { start: st, end: en } : { start: en, end: st }) : null;
    }
    function asanaEvCell(key) {
        if (!EVLINK_KEYS.includes(key)) return '<span class="aff-muted">—</span>';
        const c = asanaT.evc && asanaT.evc.candidates && asanaT.evc.candidates[key];
        if (!c)
            return `<span class="aff-muted">${asanaT.evc === undefined ? 'Recherche des événements…' : 'Événements indisponibles.'}</span>`;
        const none = !c.matching.length;
        const lk = [...c.matching, ...c.others].find(e => e.id === c.linked),
            d = asanaRowDates(key);
        const info = lk
            ? d && d.start === lk.start && d.end === lk.end
                ? '<div style="font-size:11px;color:#1b7f3b;">✔ mêmes dates que l\'activité</div>'
                : `<div style="font-size:11px;color:#b26a00;" title="Dates de l'événement : ${esc(evDates(lk))}">⚠ dates différentes de l'activité</div>`
            : '';
        if (c.multi) return evMultiHtml('asanaEv', key, c);
        return `<select data-ek="${key}" onchange="AffectationApp.asanaEvLink(this)" style="width:100%;padding:5px;" title="Événements de ce SAMU${c.typeLong ? ' (type « ' + esc(c.typeLong) + ' »)' : ''}">
                <option value="">— Aucun événement lié —</option>
                ${c.matching.length ? `<optgroup label="Correspondant au SAMU et au type « ${esc(c.typeLong || '')} »">${c.matching.map(e => evOpt(e, e.id === c.linked)).join('')}</optgroup>` : ''}
                ${c.others.length ? `<optgroup label="Autres événements de ce SAMU">${c.others.map(e => evOpt(e, e.id === c.linked)).join('')}</optgroup>` : ''}
            </select>${info}
            ${
                none
                    ? `<div style="margin-top:4px;font-size:11px;color:#b26a00;">Aucun événement « ${esc(c.typeLong || '')} » trouvé pour ce SAMU.</div><button type="button" class="aff-btn aff-btn-primary" style="padding:4px 10px;margin-top:4px;" onclick="AffectationApp.asanaEvCreate('${key}')" title="Crée l'événement dans l'outil (SAMU, type, dates de l'activité, ressources affectées en participants)">${svg('plus', 'aff-ico-sm')}Créer l'événement</button>`
                    : `<button type="button" class="aff-btn" style="padding:3px 9px;margin-top:4px;font-size:11px;" onclick="AffectationApp.asanaEvCreate('${key}')" title="Créer un nouvel événement pour cette activité">${svg('plus', 'aff-ico-sm')}Nouveau</button>`
            }`;
    }
    function renderAsanaTasks() {
        const d = asanaT.data,
            box = document.getElementById('affAsanaTasksBody');
        if (!d || !box) return;
        const eff = gid => {
            const t = d.tasks.find(x => x.gid === gid);
            return t && t.eff;
        };
        const afterTxt = r => {
            const o = asanaT.ov[r.key] || {};
            if (r.kind === 'date') {
                const e = eff(o.task);
                return e ? aFr(e.end) : '';
            }
            const es = eff(o.start),
                ee = eff(o.end);
            if (!es && !ee) return '';
            const cur = r.auto || r.current || {};
            let a = es ? es.start : cur.start,
                b = ee ? ee.end : cur.end;
            a = a || b;
            b = b || a;
            return a > b ? `${aFr(b)} → ${aFr(a)}` : `${aFr(a)} → ${aFr(b)}`;
        };
        box.innerHTML = `<p style="margin:0 0 10px;font-size:13px;color:#4a5b70;"><b>${esc(d.samu)}</b> · projet Asana : ${(d.candidates || []).length > 1 ? `<select onchange="AffectationApp.asanaTasksProject(this.value)" title="Plusieurs projets Asana portent ce numéro de SAMU : choisissez le bon" style="padding:4px 6px;border:2px solid #ff9800;border-radius:8px;max-width:340px;">${d.candidates.map(x => `<option value="${esc(x.gid)}" ${x.gid === d.gid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select> ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">ouvrir</a>` : ''}` : d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.asana)}</a>` : esc(d.asana)} · ${d.tasks.length} tâche(s).
            Pour chaque rubrique, la <b>règle automatique</b> choisit la tâche ; vous pouvez la <b>remplacer</b> par n'importe quelle autre tâche du projet (liste avec échéances). Le remplacement est mémorisé : il s'applique aussi aux prochains rafraîchissements.</p>
            <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="text-align:left;color:#6b7a8d;font-size:11px;"><th style="padding:6px 8px;">Rubrique (règle)</th><th style="padding:6px 8px;">Valeur actuelle</th><th style="padding:6px 8px;">Selon la règle</th><th style="padding:6px 8px;min-width:330px;">Remplacer par la tâche…</th><th style="padding:6px 8px;">Après remplacement</th><th style="padding:6px 8px;min-width:340px;">Événement associé (SAMU + type)</th></tr></thead><tbody>
            ${d.rubriques
                .map(r => {
                    const o = asanaT.ov[r.key] || {};
                    const picked = r.kind === 'date' ? !!o.task : !!(o.start || o.end);
                    const sels =
                        r.kind === 'date'
                            ? `<select data-k="${r.key}" data-f="task" onchange="AffectationApp.asanaTasksPick(this)" style="width:100%;padding:5px;">${asanaTaskOptions(o.task)}</select>`
                            : `<div style="display:grid;grid-template-columns:48px 1fr;gap:4px;align-items:center;"><span class="aff-muted" style="font-size:11px;">Début</span><select data-k="${r.key}" data-f="start" onchange="AffectationApp.asanaTasksPick(this)" style="width:100%;padding:5px;">${asanaTaskOptions(o.start)}</select><span class="aff-muted" style="font-size:11px;">Fin</span><select data-k="${r.key}" data-f="end" onchange="AffectationApp.asanaTasksPick(this)" style="width:100%;padding:5px;">${asanaTaskOptions(o.end)}</select></div>`;
                    return `<tr style="border-top:1px solid #eef1f6;${picked ? 'background:#fff8e1;' : ''}" id="aTRow_${r.key}">
                    <td style="padding:8px;vertical-align:top;"><b>${esc(r.label)}</b>${picked ? ' <span class="aff-av-b mid">remplacé</span>' : ''}<div class="aff-muted" style="font-size:11px;">${esc(r.rule)}</div></td>
                    <td style="padding:8px;vertical-align:top;"><span style="white-space:nowrap;">${esc(aVal(r.current))}</span>${asanaOriginHtml(r)}</td>
                    <td style="padding:8px;vertical-align:top;white-space:nowrap;">${esc(aVal(r.auto))}${r.sources.length ? `<div class="aff-muted" style="font-size:11px;white-space:normal;max-width:230px;">${r.sources.map(x => esc(String(x).slice(0, 60))).join(' · ')}</div>` : ''}</td>
                    <td style="padding:8px;vertical-align:top;">${sels}</td>
                    <td style="padding:8px;vertical-align:top;font-weight:700;color:#1b7f3b;white-space:nowrap;" id="aTAfter_${r.key}">${esc(afterTxt(r))}</td>
                    <td style="padding:8px;vertical-align:top;" id="aTEv_${r.key}">${asanaEvCell(r.key)}</td></tr>`;
                })
                .join('')}</tbody></table></div>
            <details style="margin-top:14px;"><summary style="cursor:pointer;font-weight:700;color:#4a5b70;">Toutes les tâches du projet Asana (${d.tasks.length})</summary>
            <div style="overflow:auto;max-height:340px;margin-top:8px;border:1px solid #eef1f6;border-radius:8px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="position:sticky;top:0;background:#f0f4fa;"><tr style="text-align:left;"><th style="padding:5px 8px;">N°</th><th style="padding:5px 8px;">Tâche</th><th style="padding:5px 8px;">Tâche parente</th><th style="padding:5px 8px;">Début</th><th style="padding:5px 8px;">Échéance</th></tr></thead><tbody>
            ${d.tasks.map(t => `<tr style="border-top:1px solid #f0f3f8;"><td style="padding:4px 8px;white-space:nowrap;">${esc(t.code || '')}</td><td style="padding:4px 8px;">${esc(t.name)}</td><td style="padding:4px 8px;color:#6b7a8d;">${esc(t.parent || '')}</td><td style="padding:4px 8px;white-space:nowrap;">${esc(aFr(t.start || (t.eff && t.eff.start) || ''))}</td><td style="padding:4px 8px;white-space:nowrap;font-weight:600;">${esc(aFr(t.due || (t.eff && t.eff.end) || '')) || '<span class="aff-muted">non datée</span>'}</td></tr>`).join('')}</tbody></table></div></details>`;
    }

    // Pop-up : changements constatés entre l'état précédent et les dates reprises d'Asana
    function showAsanaChanges(d) {
        const box = document.getElementById('affAsanaChgBody');
        if (!box) return;
        const items = d.items || [];
        const total = items.reduce((n, it) => n + (it.changes || []).length, 0);
        const sec = it => `<div style="border:1px solid #dfe5ef;border-radius:10px;margin-bottom:12px;overflow:hidden;">
            <div style="background:#f0f4fa;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><b style="font-size:14px;">${esc(it.samu)}</b>
                <span class="aff-av-b ${it.created ? 'ok' : 'mid'}">${it.created ? 'créé' : 'mis à jour'}</span>${it.asana ? `<span class="aff-muted" style="font-size:12px;">Projet Asana : ${esc(it.asana)}</span>` : ''}</div>
            ${
                (it.changes || []).length
                    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#6b7a8d;font-size:11px;"><th style="padding:6px 12px;width:32%;">Rubrique</th><th style="padding:6px 8px;">Avant</th><th style="width:24px;"></th><th style="padding:6px 8px;">Après</th></tr></thead><tbody>
                ${it.changes.map(c => `<tr style="border-top:1px solid #eef1f6;"><td style="padding:6px 12px;font-weight:600;">${esc(c.label)}</td><td style="padding:6px 8px;color:#8a97a8;${c.from && c.from !== '—' ? 'text-decoration:line-through;' : ''}">${esc(c.from || '—')}</td><td style="color:#8a97a8;">→</td><td style="padding:6px 8px;color:#1b7f3b;font-weight:700;">${esc(c.to || '—')}</td></tr>`).join('')}</tbody></table>`
                    : '<p class="aff-muted" style="margin:8px 12px;">Aucun détail de changement.</p>'
            }</div>`;
        const list = (label, arr, color) =>
            arr && arr.length
                ? `<p style="margin:6px 0;font-size:13px;color:${color || '#4a5b70'};"><b>${label}</b> : ${arr.map(esc).join(', ')}</p>`
                : '';
        box.innerHTML =
            `<p style="margin:0 0 12px;font-size:13px;color:#4a5b70;">${items.length ? `<b>${items.length}</b> déploiement(s) modifié(s), <b>${total}</b> changement(s) constaté(s) entre l'état précédent et les dates reprises d'Asana.` : 'Aucune modification : les déploiements sont déjà à jour.'} <span class="aff-muted">(Chaque modification est aussi inscrite dans l'historique du SAMU.)</span></p>` +
            items.map(sec).join('') +
            list('Déjà à jour', d.unchanged, '#2e7d32') +
            list('Sans projet Asana correspondant', d.noMatch, '#8a6d00') +
            ((d.errors || []).length
                ? `<p style="margin:6px 0;font-size:13px;color:#b3261e;"><b>Erreurs</b> : ${d.errors.map(e => esc(e.samu) + ' — ' + esc(e.error)).join(' · ')}</p>`
                : '');
        document.getElementById('affAsanaChgTitle').lastChild.textContent = d.title || "Changements issus d'Asana";
        document.getElementById('affAsanaChgModal').classList.add('active');
    }

    // Conflits Asana : une rubrique modifiée dans l'application ET dans Asana depuis la dernière reprise n'est jamais écrasée
    // sans accord ; l'utilisateur choisit, rubrique par rubrique, de conserver la valeur de l'application ou de reprendre
    // celle d'Asana
    const asanaConf = { list: [] };
    function showAsanaConflicts(list) {
        asanaConf.list = (list || []).filter(x => x && x.rows && x.rows.length);
        if (!asanaConf.list.length) return;
        const box = document.getElementById('affAsanaConfBody');
        const n = asanaConf.list.reduce((s, x) => s + x.rows.length, 0);
        box.innerHTML =
            `<p style="margin:0 0 12px;font-size:13px;color:#4a5b70;"><b>${n}</b> donnée(s) ont été modifiées <b>dans l'application</b> et ont aussi changé <b>dans Asana</b> : rien n'a été écrasé. Pour chacune, choisissez la valeur à conserver.</p>` +
            asanaConf.list
                .map(
                    (
                        d,
                        di
                    ) => `<div style="border:1px solid #dfe5ef;border-radius:10px;margin-bottom:12px;overflow:hidden;">
                <div style="background:#fff3e0;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><b style="font-size:14px;">${esc(d.samu)}</b>${d.asana ? `<span class="aff-muted" style="font-size:12px;">Projet Asana : ${esc(d.asana)}</span>` : ''}
                    <span style="margin-left:auto;font-size:12px;"><a href="#" onclick="AffectationApp.asanaConflictsAll(${di},'app');return false;">tout conserver (application)</a> · <a href="#" onclick="AffectationApp.asanaConflictsAll(${di},'asana');return false;">tout reprendre (Asana)</a></span></div>
                <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#6b7a8d;font-size:11px;"><th style="padding:6px 12px;width:24%;">Rubrique</th><th style="padding:6px 8px;">Dans l'application</th><th style="padding:6px 8px;">Dans Asana</th><th style="padding:6px 8px;">Votre choix</th></tr></thead><tbody>
                ${d.rows
                    .map(
                        r => `<tr style="border-top:1px solid #eef1f6;vertical-align:top;">
                    <td style="padding:6px 12px;font-weight:600;">${esc(r.label)}${r.previous ? `<div class="aff-muted" style="font-size:11px;font-weight:400;">Dernière reprise d'Asana : ${esc(r.previous)}</div>` : ''}</td>
                    <td style="padding:6px 8px;color:#b26a00;">✎ ${esc(r.app) || '—'}</td>
                    <td style="padding:6px 8px;color:#1b7f3b;">${esc(r.asana) || '—'}</td>
                    <td style="padding:6px 8px;white-space:nowrap;">
                        <label style="display:flex;align-items:center;gap:6px;margin:0 0 4px;font-weight:400;"><input type="radio" style="width:auto;margin:0;" name="aconf_${di}_${r.key}" data-ci="${di}" data-ck="${r.key}" value="app" checked> Conserver l'application</label>
                        <label style="display:flex;align-items:center;gap:6px;margin:0;font-weight:400;"><input type="radio" style="width:auto;margin:0;" name="aconf_${di}_${r.key}" data-ci="${di}" data-ck="${r.key}" value="asana"> Reprendre Asana</label></td></tr>`
                    )
                    .join('')}
                </tbody></table></div>`
                )
                .join('');
        document.getElementById('affAsanaConfMsg').textContent = '';
        document.getElementById('affAsanaConfOk').disabled = false;
        document.getElementById('affAsanaConfModal').classList.add('active');
    }

    async function loadAdmin() {
        setTimeout(loadTpl, 0);
        setTimeout(loadStageTypes, 0);
        setTimeout(() => AffectationApp.asanaLoadCfg && AffectationApp.asanaLoadCfg(), 0);
        try {
            const [cfg, proj, users, locs] = await Promise.all([
                api('/affectation/config'),
                api('/affectation/projects'),
                api('/affectation/users'),
                api('/locations')
            ]);
            state.config = cfg;
            state.colors = { ...cfg.colors };
            state.patterns = { ...(cfg.patterns || {}) };
            state.projects = proj.projects;
            state.users = users.users;
            state.locations = locs.locations || [];
            state.loaded = true;
            renderLegend();
            renderProjects();
            renderColors();
        } catch (e) {
            document.getElementById('affProjects').innerHTML =
                `<p class="aff-error">Chargement impossible : ${esc(e.message)}</p>`;
        }
    }

    function renderLegend() {
        document.getElementById('affLegend').innerHTML = state.config.stages
            .map(st => `<span><i style="${bgStyle(color(st.key), pattern(st.key))}"></i>${esc(st.label)}</span>`)
            .join('');
    }

    function projectBounds(p) {
        const dates = [p.date_debut, p.date_mise_en_service, p.date_mise_en_production];
        Object.values(p.periods || {}).forEach(list =>
            list.forEach(x => {
                dates.push(x.start, x.end);
            })
        );
        const ok = dates.filter(Boolean).sort();
        return { min: ok[0], max: ok[ok.length - 1] };
    }

    function timeline(p) {
        const { min, max } = projectBounds(p);
        const t0 = Date.parse(min),
            span = Math.max(1, Date.parse(max) - t0);
        const pos = d => ((Date.parse(d) - t0) / span) * 100;
        let h = '<div class="aff-tl">';
        state.config.stages
            .filter(st => st.kind !== 'date' && st.kind !== 'milestone')
            .forEach(st => {
                (p.periods[st.key] || []).forEach(x => {
                    const left = pos(x.start),
                        width = Math.max(1.2, pos(x.end) - left);
                    h += `<span class="aff-tl-seg" style="left:${left}%;width:${width}%;${bgStyle(color(st.key), pattern(st.key))}" title="${esc(st.label)} : ${fmt(x.start)} → ${fmt(x.end)}"></span>`;
                });
            });
        [
            ['mise_en_service', p.date_mise_en_service],
            ['mise_en_production', p.date_mise_en_production],
            ...MILESTONES.map(k => [k, p.periods && p.periods[k] && p.periods[k][0] ? p.periods[k][0].start : null])
        ].forEach(([k, d]) => {
            if (d)
                h += `<span class="aff-tl-mark" style="left:${pos(d)}%;${bgStyle(color(k), pattern(k))}" title="${esc(stageDef(k).label)} : ${fmt(d)}"></span>`;
        });
        return h + `</div><div class="aff-tl-scale"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>`;
    }

    function renderProjects() {
        const box = document.getElementById('affProjects');
        if (!state.projects.length) {
            box.innerHTML =
                '<p class="aff-muted">Aucun déploiement pour le moment. Cliquez sur « Nouveau déploiement » pour commencer.</p>';
            return;
        }
        box.innerHTML = state.projects
            .map(
                p => `
            <div class="aff-proj">
                <div>
                    <div class="aff-proj-name">${esc(p.samu_name)}${asanaMark(p)}</div>
                    <div class="aff-proj-sub">${svg('user')}${esc(p.chef_projet_nom || 'Chef de projet non défini')}</div>
                    <div class="aff-proj-sub">${svg('flag')}Début : ${fmt(p.date_debut)}</div>
                </div>
                <div>${timeline(p)}</div>
                <div class="aff-row-actions">
                    <button type="button" class="aff-icon-btn" style="background:#8e6cc9" title="Tâches du projet Asana : consulter les échéances et remplacer une donnée reprise" onclick="AffectationApp.asanaTasks(${p.id})">${svg('asanatasks', 'aff-ico-sm')}</button>
                    <button type="button" class="aff-icon-btn aff-asyn" style="background:#f06a6a" title="Rafraîchir depuis Asana : reprend les dates nouvelles ou modifiées du projet Asana de ce SAMU" onclick="AffectationApp.asanaRefresh(${p.id}, this)">${svg('asanasync', 'aff-ico-sm')}</button>
                    <button type="button" class="aff-icon-btn" style="background:#6b7a8d" title="Historique : qui a modifié quoi et quand" onclick="AffectationApp.showHistory(${p.id})">${svg('search', 'aff-ico-sm')}</button>
                    <button type="button" class="aff-icon-btn" style="background:#3498db" title="Modifier les dates" onclick="AffectationApp.editProject(${p.id})">${svg('pencil', 'aff-ico-sm')}</button>
                    <button type="button" class="aff-icon-btn" style="background:#D60B51" title="Supprimer ce déploiement" onclick="AffectationApp.deleteProject(${p.id})">${svg('trash', 'aff-ico-sm')}</button>
                </div>
            </div>`
            )
            .join('');
    }

    // ---- couleurs ----
    function renderColors() {
        document.getElementById('affColors').innerHTML = state.config.stages
            .map(
                st => `
            <div class="aff-color-row">
                <input type="color" data-key="${st.key}" value="${color(st.key)}" title="Couleur" oninput="AffectationApp.previewColor('${st.key}', this.value)">
                <span class="aff-pat-prev" id="affPatPrev_${st.key}" style="${bgStyle(color(st.key), pattern(st.key))}" title="Aperçu"></span>
                <span class="lbl">${esc(st.label)}</span>
                <select class="aff-pat-sel" title="Motif" onchange="AffectationApp.previewPattern('${st.key}', this.value)">${PATTERNS.map(p => `<option value="${p[0]}" ${pattern(st.key) === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>
                <span class="aff-tl-scale" style="margin:0;">${st.kind === 'date' || st.kind === 'milestone' ? 'jalon' : 'période'}</span>
            </div>`
            )
            .join('');
    }

    // ---- formulaire ----
    function emptyForm() {
        return {
            id: null,
            samu_name: '',
            location_id: null,
            chef_projet_id: null,
            date_debut: '',
            date_mise_en_service: '',
            date_mise_en_production: '',
            periods: {}
        };
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
        const q = f =>
            document.querySelector(
                `#affModalBody input[data-pk="${inp.dataset.pk || inp.dataset.dk}"][data-pi="${inp.dataset.pi || inp.dataset.di}"][data-pf="${f}"]`
            );
        const days = document.querySelector(
            `#affModalBody input[data-dk="${inp.dataset.pk || inp.dataset.dk}"][data-di="${inp.dataset.pi || inp.dataset.di}"]`
        );
        return { start: q('start'), end: q('end'), days };
    }

    const weekValue = iso => {
        if (!iso) return '';
        const w = isoWeek(iso);
        return `${w.year}-W${String(w.week).padStart(2, '0')}`;
    };
    // Jalons (une date, sans ressources expertes) : enregistrés dans les périodes sous la forme d'un jour
    const MILESTONES = ['reunion_lancement', 'visite_ob'];
    const EVLINK_KEYS = [
        'mise_en_service',
        'mise_en_production',
        'reunion_lancement',
        'visite_metier',
        'visite_ob',
        'test_prerequis',
        'vft',
        'formation_utilisateurs',
        'accompagnement'
    ];
    const evLinkRow = key =>
        EVLINK_KEYS.includes(key)
            ? `<div class="pr aff-evl" data-ek="${key}"><span class="aff-muted">${state.form && state.form.id ? 'Recherche des événements…' : 'Enregistrez le déploiement pour relier des événements.'}</span></div>`
            : '';
    function periodRows(key, list) {
        const def = stageDef(key);
        const rows = (list && list.length ? list : [{ start: '', end: '' }])
            .map(
                (x, i) => `
            <div class="pr">
                ${def.resources ? `<input type="week" class="aff-wk" data-wk="${key}" data-wi="${i}" value="${weekValue(x.start)}" title="Choisir une semaine (SXX année) : la période commence le lundi de cette semaine" aria-label="Semaine de début ${esc(def.label)}" onchange="AffectationApp.weekChanged(this)">` : ''}
                <input type="date" data-pk="${key}" data-pi="${i}" data-pf="start" value="${esc(x.start)}" aria-label="Début ${esc(def.label)}" onchange="AffectationApp.startChanged(this)">
                <span class="aff-muted">→</span>
                <input type="date" data-pk="${key}" data-pi="${i}" data-pf="end" value="${esc(x.end)}" aria-label="Fin ${esc(def.label)}" onchange="AffectationApp.endChanged(this)">
                <input type="number" min="1" step="1" class="aff-days" data-dk="${key}" data-di="${i}" value="${daysBetween(x.start, x.end) || ''}" placeholder="jours" title="Nombre de jours (calendaires, début et fin inclus) : la date de fin se calcule automatiquement" aria-label="Nombre de jours ${esc(def.label)}" oninput="AffectationApp.daysChanged(this)">
                ${def.resources ? `<select class="aff-need" data-nk="${key}" data-ni="${i}" title="Nombre de ressources nécessaires" aria-label="Ressources nécessaires ${esc(def.label)}">${['<option value="">Ressources…</option>'].concat(Array.from({ length: 10 }, (_, n) => `<option value="${n + 1}" ${Number(x.needed) === n + 1 ? 'selected' : ''}>${n + 1} ressource${n ? 's' : ''}</option>`)).join('')}</select>` : ''}
                <button type="button" class="aff-x" title="Effacer cette période" onclick="AffectationApp.clearPeriod('${key}', ${i})">${svg('x', 'aff-ico-sm')}</button>
            </div>`
            )
            .join('');
        const add =
            def.kind === 'periods'
                ? `<button type="button" class="aff-btn" style="align-self:flex-start;padding:5px 10px;" onclick="AffectationApp.addPeriod('${key}')">${svg('plus', 'aff-ico-sm')}Ajouter une période</button>`
                : '';
        return `<div class="dates">${rows}${add}${evLinkRow(key)}</div>`;
    }

    function stageRow(key, f) {
        const def = stageDef(key);
        const head = `<div class="name"><i style="${bgStyle(color(key), pattern(key))}"></i>${esc(def.label)}${def.kind === 'periods' ? ' <span class="aff-muted">(optionnel)</span>' : ''}</div>`;
        if (def.kind === 'date') {
            return `<div class="aff-stage">${head}<div class="dates"><div class="pr"><input type="date" data-df="${key}" value="${esc(f['date_' + key] || '')}" aria-label="${esc(def.label)}"></div>${evLinkRow(key)}</div><span></span></div>`;
        }
        if (def.kind === 'milestone') {
            const d = (f.periods[key] && f.periods[key][0] && f.periods[key][0].start) || '';
            return `<div class="aff-stage">${head}<div class="dates"><div class="pr"><input type="date" data-mk="${key}" value="${esc(d)}" aria-label="${esc(def.label)}"></div>${evLinkRow(key)}</div><span></span></div>`;
        }
        return `<div class="aff-stage">${head}${periodRows(key, f.periods[key])}<span></span></div>`;
    }

    function renderForm() {
        const f = state.form;
        const chefOpts = ['<option value="">— Choisir —</option>']
            .concat(
                state.users.map(
                    u =>
                        `<option value="${u.id}" ${Number(f.chef_projet_id) === u.id ? 'selected' : ''}>${esc(u.nom.toUpperCase())} ${esc(u.prenom)}</option>`
                )
            )
            .join('');
        // Étapes de mise en œuvre : la mise en service et la mise en production en font partie
        const g = ['cadrage', 'deploiement', 'gel'],
            h = [
                'mise_en_service',
                'mise_en_production',
                'reunion_lancement',
                'visite_metier',
                'visite_ob',
                'test_prerequis',
                'vft',
                'formation_utilisateurs',
                'accompagnement'
            ];
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
            <div class="aff-section-title">Étapes de mise en œuvre</div>
            ${h.map(k => stageRow(k, f)).join('')}`;
        AffectationApp.syncMin();
    }

    // Événements du SAMU correspondant à chaque activité (liste déroulante ; création proposée s'il n'y en a pas)
    const evFr = d => (d ? d.split('-').reverse().join('/') : '');
    const evDates = e => (e.start === e.end ? evFr(e.start) : `${evFr(e.start)} → ${evFr(e.end)}`);
    // Activité découpable en plusieurs parties : liste déroulante à choix multiple + ajout d'une partie (dates propres)
    const evOpen = new Set();
    function evSummary(c) {
        const lk = [...c.matching, ...c.others].filter(e => c.linkedIds.includes(e.id));
        return lk.length ? `${lk.length} partie(s) : ${lk.map(evDates).join(' ; ')}` : '— Aucun événement lié —';
    }
    function evMultiHtml(h, key, c) {
        const rows = [...c.matching.map(e => [e, true]), ...c.others.map(e => [e, false])]
            .map(
                ([e, m]) =>
                    `<label style="display:flex;gap:8px;align-items:flex-start;width:100%;margin:0;font-size:12px;font-weight:400;text-align:left;padding:3px 0;cursor:pointer;"><input type="checkbox" style="flex:none;width:auto;min-width:0;margin:2px 0 0;" data-eid="${e.id}" ${c.linkedIds.includes(e.id) ? 'checked' : ''} onchange="AffectationApp.${h}Toggle(this)"><span style="flex:1;min-width:0;font-weight:400;">${esc(evDates(e))} · ${esc(e.label)}${e.participants ? ' · ' + e.participants + ' part.' : ''}${m ? '' : ' · <i>autre type</i>'}</span></label>`
            )
            .join('');
        return `<div data-evbox="${key}">
            <details style="position:relative;" ${evOpen.has(h + key) ? 'open' : ''} ontoggle="AffectationApp.evOpenState('${h}${key}',this.open)">
                <summary style="list-style:none;cursor:pointer;border:1px solid #767676;border-radius:4px;padding:5px 24px 5px 8px;background:#fff;color:#1a2b3c;font-size:13px;position:relative;white-space:normal;">${esc(evSummary(c))}<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;">▼</span></summary>
                <div style="margin-top:4px;background:#fff;border:1px solid #cfd8e3;border-radius:6px;padding:8px;max-height:300px;overflow:auto;text-align:left;">
                    <div style="font-size:11px;color:#6b7a8d;margin-bottom:4px;">Cochez les parties de l'événement (jours de l'activité = jours des parties cochées dès deux parties)</div>
                    ${rows || '<span class="aff-muted" style="font-size:12px;">Aucun événement pour ce SAMU.</span>'}
                    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:6px;border-top:1px solid #e3e9f0;padding-top:6px;">
                        <input type="date" id="${h}PS_${key}" style="padding:3px;" title="Début de la partie"><span class="aff-muted">→</span>
                        <input type="date" id="${h}PE_${key}" style="padding:3px;" title="Fin de la partie (facultative)">
                        <button type="button" class="aff-btn aff-btn-primary" style="padding:3px 9px;font-size:11px;" onclick="AffectationApp.${h}PartAdd('${key}')" title="Crée une partie de l'événement (SAMU, type, dates saisies, ressources affectées en participants)">${svg('plus', 'aff-ico-sm')}Ajouter une partie</button>
                    </div>
                </div>
            </details>
        </div>`;
    }
    const evCheckedIds = cb =>
        [...cb.closest('[data-evbox]').querySelectorAll('input[data-eid]:checked')].map(i => Number(i.dataset.eid));
    function evPartDates(h, key) {
        const a = document.getElementById(`${h}PS_${key}`).value,
            b = document.getElementById(`${h}PE_${key}`).value;
        return { start: a, end: b || a };
    }
    const evOpt = (e, sel) =>
        `<option value="${e.id}" ${sel ? 'selected' : ''}>${esc(evDates(e))} · ${esc(e.label)}${e.participants ? ' · ' + e.participants + ' part.' : ''}${e.type ? ' · ' + esc(e.type) : ''}</option>`;
    function evRowDates(key) {
        const one = document.querySelector(
            `#affModalBody input[data-df="${key}"], #affModalBody input[data-mk="${key}"]`
        );
        if (one) return one.value ? { start: one.value, end: one.value } : null;
        const st = document.querySelector(`#affModalBody input[data-pk="${key}"][data-pi="0"][data-pf="start"]`),
            en = document.querySelector(`#affModalBody input[data-pk="${key}"][data-pi="0"][data-pf="end"]`);
        return st && st.value ? { start: st.value, end: en && en.value ? en.value : st.value } : null;
    }
    function renderEventLinks() {
        const box = state.evc && state.evc.candidates;
        document.querySelectorAll('#affModalBody .aff-evl').forEach(row => {
            const key = row.dataset.ek,
                c = box && box[key];
            if (!state.form || !state.form.id) return;
            if (!c) {
                row.innerHTML = '<span class="aff-muted">Événements indisponibles.</span>';
                return;
            }
            if (c.multi) {
                row.innerHTML = `<span class="aff-muted" style="white-space:nowrap;">${svg('calendar', 'aff-ico-sm')}Événement</span>${evMultiHtml('ev', key, c)}`;
                return;
            }
            const none = !c.matching.length;
            row.innerHTML = `<span class="aff-muted" style="white-space:nowrap;">${svg('calendar', 'aff-ico-sm')}Événement</span>
                <select data-ek="${key}" onchange="AffectationApp.evLink(this)" title="Événements de ce SAMU${c.typeLong ? ' (type « ' + esc(c.typeLong) + ' »)' : ''}">
                    <option value="">— Aucun événement lié —</option>
                    ${c.matching.length ? `<optgroup label="Correspondant au SAMU et au type « ${esc(c.typeLong || '')} »">${c.matching.map(e => evOpt(e, e.id === c.linked)).join('')}</optgroup>` : ''}
                    ${c.others.length ? `<optgroup label="Autres événements de ce SAMU">${c.others.map(e => evOpt(e, e.id === c.linked)).join('')}</optgroup>` : ''}
                </select>
                ${none ? `<span class="none">Aucun événement « ${esc(c.typeLong || '')} » trouvé pour ce SAMU.</span><button type="button" class="aff-btn aff-btn-primary" style="padding:4px 10px;" onclick="AffectationApp.evCreate('${key}')" title="Crée l'événement dans l'outil (SAMU, type, dates de l'activité, ressources affectées en participants)">${svg('plus', 'aff-ico-sm')}Créer l'événement</button>` : `<button type="button" class="aff-btn" style="padding:4px 10px;" onclick="AffectationApp.evCreate('${key}')" title="Créer un nouvel événement pour cette activité">${svg('plus', 'aff-ico-sm')}Nouveau</button>`}
                <span id="aEvInfo_${key}"></span>`;
            evInfo(key);
        });
    }
    function evInfo(key) {
        const c = state.evc && state.evc.candidates[key],
            el = document.getElementById('aEvInfo_' + key);
        if (!c || !el) return;
        const e = [...c.matching, ...c.others].find(x => x.id === c.linked),
            d = evRowDates(key);
        if (!e) {
            el.textContent = '';
            return;
        }
        const same = d && d.start === e.start && d.end === e.end;
        el.innerHTML = same
            ? '<span class="ok">✔ mêmes dates que l\'activité</span>'
            : `<span class="warn" title="Dates de l'événement : ${esc(evDates(e))}">⚠ dates différentes de l'activité</span>`;
    }
    async function loadEventCandidates(id) {
        state.evc = null;
        if (!id) return;
        try {
            state.evc = await api(`/affectation/projects/${id}/events-candidates`);
        } catch (e) {
            state.evc = null;
        }
        renderEventLinks();
    }

    function collectForm() {
        const f = state.form;
        f.samu_name = document.getElementById('affSamu').value.trim();
        const exact = state.locations.find(l => norm(l.libelle_court) === norm(f.samu_name));
        f.location_id = exact ? exact.id : null;
        f.chef_projet_id = document.getElementById('affChef').value
            ? Number(document.getElementById('affChef').value)
            : null;
        f.date_debut = document.getElementById('affDebut').value;
        const periods = {};
        document.querySelectorAll('#affModalBody input[data-pk]').forEach(inp => {
            const k = inp.dataset.pk,
                i = Number(inp.dataset.pi);
            (periods[k] = periods[k] || [])[i] = periods[k][i] || { start: '', end: '' };
            periods[k][i][inp.dataset.pf] = inp.value;
        });
        document.querySelectorAll('#affModalBody select[data-nk]').forEach(sel => {
            const k = sel.dataset.nk,
                i = Number(sel.dataset.ni);
            if (periods[k] && periods[k][i] && sel.value) periods[k][i].needed = Number(sel.value);
        });
        Object.keys(periods).forEach(k => {
            periods[k] = periods[k].filter(x => x && (x.start || x.end));
            if (!periods[k].length) delete periods[k];
        });
        // Jalons : une date, enregistrée comme une période d'un jour
        document.querySelectorAll('#affModalBody input[data-mk]').forEach(inp => {
            if (inp.value) periods[inp.dataset.mk] = [{ start: inp.value, end: inp.value }];
        });
        f.periods = periods;
        document.querySelectorAll('#affModalBody input[data-df]').forEach(inp => {
            f['date_' + inp.dataset.df] = inp.value;
        });
        return f;
    }

    // Contrôle du formulaire : liste précise des oublis (message + champ à corriger)
    function validateForm(f) {
        const errs = [];
        const add = (msg, sel) => errs.push({ msg, sel });
        if (!f.samu_name) add('Nom du SAMU : à renseigner.', '#affSamu');
        if (!f.date_debut) add('Date de début du projet : à renseigner.', '#affDebut');
        for (const k of ['mise_en_service', 'mise_en_production']) {
            const d = f['date_' + k];
            if (d && f.date_debut && d < f.date_debut)
                add(
                    `${stageDef(k).label} : la date (${d.split('-').reverse().join('/')}) précède le début du projet.`,
                    `input[data-df="${k}"]`
                );
        }
        for (const k of MILESTONES) {
            const d = f.periods[k] && f.periods[k][0] && f.periods[k][0].start;
            if (d && f.date_debut && d < f.date_debut)
                add(
                    `${stageDef(k).label} : la date (${d.split('-').reverse().join('/')}) précède le début du projet.`,
                    `input[data-mk="${k}"]`
                );
        }
        document.querySelectorAll('#affModalBody input[data-pf="start"]').forEach(st => {
            const k = st.dataset.pk,
                i = st.dataset.pi,
                def = stageDef(k),
                lbl = def.label;
            const q = f2 => `#affModalBody input[data-pk="${k}"][data-pi="${i}"][data-pf="${f2}"]`;
            const en = document.querySelector(q('end')),
                nd = document.querySelector(`#affModalBody select[data-nk="${k}"][data-ni="${i}"]`);
            if (!st.value && !en.value && !(nd && nd.value)) return; // ligne vide : étape non utilisée
            const n = list => (list.length > 1 ? ` (période ${Number(i) + 1})` : '');
            if (!st.value) add(`${lbl} : date de début à renseigner.`, q('start'));
            if (!en.value) add(`${lbl} : date de fin à renseigner.`, q('end'));
            if (st.value && en.value && en.value < st.value)
                add(`${lbl} : la date de fin précède la date de début.`, q('end'));
            if (st.value && f.date_debut && st.value < f.date_debut)
                add(`${lbl} : commence avant le début du projet.`, q('start'));
            if (def.resources && nd && !nd.value)
                add(
                    `${lbl} : nombre de ressources nécessaires à renseigner.`,
                    `#affModalBody select[data-nk="${k}"][data-ni="${i}"]`
                );
        });
        return errs;
    }

    // ---- Import depuis un export CSV d'Asana ----
    const asana = { csv: '', preview: null, src: { type: 'csv' } };
    const adminApi = {
        asanaOpen(src) {
            asana.csv = '';
            asana.preview = null;
            asana.src = src || { type: 'csv' };
            document.getElementById('affAsanaFile').value = '';
            document.getElementById('affAsanaFileBox').style.display = asana.src.type === 'csv' ? '' : 'none';
            document.getElementById('affAsanaResult').innerHTML =
                asana.src.type === 'api' ? '<p class="aff-muted">Lecture du projet Asana…</p>' : '';
            document.getElementById('affAsanaError').textContent = '';
            document.getElementById('affAsanaOk').style.display = 'none';
            document.getElementById('affAsanaModal').classList.add('active');
            if (asana.src.type === 'api') adminApi.asanaAnalyze();
        },
        // ---- Connexion directe à l'API Asana ----
        async asanaLoadCfg() {
            const box = document.getElementById('affAsanaCfg');
            if (!box) return;
            try {
                const c = (asana.cfg = await api('/affectation/asana/config'));
                if (!c.tokenSet || !c.workspaceGid) {
                    box.innerHTML = `<p class="aff-muted">La connexion Asana n'est pas encore configurée. Le jeton et l'espace de travail se saisissent dans l'application principale : <b>Administration › Gestion des API › Connexion Asana</b>.</p>`;
                    document.getElementById('affAsanaProjects').innerHTML = '';
                    return;
                }
                box.innerHTML = `<div style="font-size:13px;">Connexion : jeton enregistré · espace de travail <b>${esc(c.workspaceName)}</b> · équipe <b>${esc(c.teamName || 'toutes')}</b> <span class="aff-muted">(géré dans l'application principale › Administration › Gestion des API)</span></div>`;
                adminApi.asanaLoadProjects();
            } catch (e) {
                box.innerHTML = `<p class="aff-error">${esc(e.message)}</p>`;
            }
        },
        async asanaLoadProjects() {
            const box = document.getElementById('affAsanaProjects');
            box.innerHTML = '<p class="aff-muted" style="margin-top:12px;">Lecture des projets Asana…</p>';
            try {
                const d = (asana.projects = await api('/affectation/asana/projects'));
                box.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;flex-wrap:wrap;gap:8px;">
                        <b><span id="affAsanaCount"></span> projet(s) Asana dans le périmètre</b>
                        <span style="display:inline-flex;gap:8px;flex-wrap:wrap;"><button type="button" class="aff-btn" onclick="AffectationApp.asanaLoadProjects()">Actualiser la liste</button>
                        <button type="button" class="aff-btn" onclick="AffectationApp.asanaScanAll()" title="Compare chaque projet Asana (affichés) avec le déploiement correspondant, sans rien modifier">Tout analyser</button></span>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
                        <input id="affAsanaKw" type="search" placeholder="Filtrer par mot clé (ex. 25, SF4, Nice…)" oninput="AffectationApp.asanaFilter()" style="padding:7px 10px;border:1px solid #cfd8e6;border-radius:8px;min-width:240px;flex:1;max-width:380px;">
                        <button type="button" class="aff-btn aff-btn-primary" id="affAsanaBulkBtn" onclick="AffectationApp.asanaBulkImport()" disabled>Importer la sélection</button>
                    </div>
                    <div style="overflow-x:auto;"><table id="affAsanaTable" style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead><tr style="background:#e6f4f1;"><th style="padding:6px 8px;width:30px;"><input type="checkbox" id="affAsanaAll" title="Sélectionner / désélectionner les projets affichés" onchange="AffectationApp.asanaSelectAll(this.checked)" style="width:auto;display:inline-block;margin:0;"></th><th style="padding:6px 8px;text-align:left;">Projet Asana</th><th style="padding:6px 8px;text-align:left;">Déploiement apparié</th><th style="padding:6px 8px;text-align:left;">Écarts / résultat</th><th></th></tr></thead>
                        <tbody>${d.projects
                            .map(
                                p => `<tr data-gid="${esc(p.gid)}" data-name="${esc(norm(p.name))}" style="border-top:1px solid #eef1f6;">
                            <td style="padding:6px 8px;"><input type="checkbox" class="aff-asana-chk" ${p.ignored ? 'disabled' : ''} onchange="AffectationApp.asanaUpdateSel()" style="width:auto;display:inline-block;margin:0;"></td>
                            <td style="padding:6px 8px;"><b>${esc(p.name)}</b></td>
                            <td style="padding:6px 8px;"><select onchange="AffectationApp.asanaLink('${esc(p.gid)}', this.value)" style="padding:4px 6px;border:1px solid #cfd8e6;border-radius:8px;max-width:230px;">
                                <option value="0" ${!p.manual && !p.ignored ? 'selected' : ''}>${p.deployment && !p.manual ? 'Auto : ' + esc(p.deployment.samu_name) : 'Auto : aucun (sera créé)'}</option>
                                ${d.deployments.map(x => `<option value="${x.id}" ${p.manual && p.deployment && p.deployment.id === x.id ? 'selected' : ''}>${esc(x.samu_name)}</option>`).join('')}
                                <option value="-1" ${p.ignored ? 'selected' : ''}>— Ignorer ce projet —</option></select></td>
                            <td class="aff-asana-diff" style="padding:6px 8px;"><span class="aff-muted">—</span></td>
                            <td style="padding:6px 8px;text-align:right;"><button type="button" class="aff-btn" ${p.ignored ? 'disabled' : ''} onclick="AffectationApp.asanaOpen({type:'api',gid:'${esc(p.gid)}'})">Récupérer</button></td></tr>`
                            )
                            .join('')}</tbody>
                    </table></div>
                    <div id="affAsanaBulkMsg" style="margin-top:8px;font-size:13px;"></div>
                    <p class="aff-muted" style="font-size:12px;margin-top:8px;">Les données absentes d'Asana ne sont jamais effacées : complétez-les à la main dans le déploiement. L'import en masse applique, pour chaque projet coché, toutes les rubriques nouvelles ou modifiées.</p>`;
                if (asana.keep) {
                    const k = asana.keep;
                    asana.keep = null;
                    document.getElementById('affAsanaKw').value = k.kw;
                    document.querySelectorAll('#affAsanaTable tbody tr').forEach(tr => {
                        if (k.results[tr.dataset.gid])
                            tr.querySelector('.aff-asana-diff').innerHTML = k.results[tr.dataset.gid];
                    });
                    const m = document.getElementById('affAsanaBulkMsg');
                    m.style.color = k.color;
                    m.textContent = k.text;
                }
                adminApi.asanaFilter();
            } catch (e) {
                box.innerHTML = `<p class="aff-error" style="margin-top:12px;">${esc(e.message)}</p>`;
            }
        },
        // Filtre par mot clé (sans tenir compte des accents ni de la casse ; plusieurs mots = tous requis)
        asanaFilter() {
            const words = norm(document.getElementById('affAsanaKw').value).split(/\s+/).filter(Boolean);
            let shown = 0;
            document.querySelectorAll('#affAsanaTable tbody tr').forEach(tr => {
                const ok = words.every(w => tr.dataset.name.includes(w));
                tr.style.display = ok ? '' : 'none';
                if (ok) shown++;
            });
            document.getElementById('affAsanaCount').textContent = words.length
                ? `${shown} / ${asana.projects.projects.length}`
                : String(asana.projects.projects.length);
            adminApi.asanaUpdateSel();
        },
        asanaVisibleChecks() {
            return [...document.querySelectorAll('#affAsanaTable tbody tr')]
                .filter(tr => tr.style.display !== 'none')
                .map(tr => tr.querySelector('.aff-asana-chk'))
                .filter(c => c && !c.disabled);
        },
        asanaSelectAll(on) {
            adminApi.asanaVisibleChecks().forEach(c => {
                c.checked = on;
            });
            adminApi.asanaUpdateSel();
        },
        asanaUpdateSel() {
            const vis = adminApi.asanaVisibleChecks(),
                n = vis.filter(c => c.checked).length;
            const all = document.getElementById('affAsanaAll'),
                btn = document.getElementById('affAsanaBulkBtn');
            if (all) {
                all.checked = vis.length > 0 && n === vis.length;
                all.indeterminate = n > 0 && n < vis.length;
            }
            if (btn) {
                btn.disabled = n === 0;
                btn.textContent = n ? `Importer la sélection (${n})` : 'Importer la sélection';
            }
        },
        // Import en masse : pour chaque projet coché (et affiché), applique les rubriques nouvelles ou modifiées
        async asanaBulkImport() {
            const rows = adminApi
                .asanaVisibleChecks()
                .filter(c => c.checked)
                .map(c => c.closest('tr'));
            if (!rows.length) return;
            if (
                !confirm(
                    `Importer ${rows.length} projet(s) Asana ?\n\nPour chacun, les rubriques nouvelles ou modifiées seront appliquées au déploiement correspondant (créé s'il n'existe pas). Les données absentes d'Asana ne sont pas effacées.`
                )
            )
                return;
            const btn = document.getElementById('affAsanaBulkBtn'),
                msg = document.getElementById('affAsanaBulkMsg'),
                target = 'utilisateurs';
            btn.disabled = true;
            const out = { created: 0, updated: 0, unchanged: 0, errors: 0 };
            const conflicts = [];
            const popup = {
                title: 'Import Asana — changements constatés',
                items: [],
                unchanged: [],
                noMatch: [],
                errors: []
            };
            let i = 0;
            for (const tr of rows) {
                i++;
                msg.style.color = '#4a5b70';
                msg.textContent = `Import en cours : ${i} / ${rows.length}…`;
                const cell = tr.querySelector('.aff-asana-diff');
                cell.innerHTML = '<span class="aff-muted">import…</span>';
                try {
                    const r = await api('/affectation/asana/apply', {
                        method: 'POST',
                        body: JSON.stringify({ gid: tr.dataset.gid, formationTarget: target, apply: 'auto' })
                    });
                    if (r.conflicts && r.conflicts.length && r.id)
                        conflicts.push({ id: r.id, samu: r.samu_name, rows: r.conflicts });
                    if (r.unchanged) {
                        out.unchanged++;
                        popup.unchanged.push(r.samu_name || tr.dataset.gid);
                        cell.innerHTML = '<span class="aff-av-b na">déjà à jour</span>';
                    } else if (r.created) {
                        out.created++;
                        popup.items.push({ samu: r.samu_name, created: true, changes: r.changes || [] });
                        cell.innerHTML = '<span class="aff-av-b ok">créé</span>';
                    } else {
                        out.updated++;
                        popup.items.push({ samu: r.samu_name, created: false, changes: r.changes || [] });
                        cell.innerHTML = '<span class="aff-av-b mid">mis à jour</span>';
                    }
                    tr.querySelector('.aff-asana-chk').checked = false;
                } catch (e) {
                    out.errors++;
                    popup.errors.push({ samu: tr.dataset.gid, error: e.message });
                    cell.innerHTML = `<span class="aff-error" title="${esc(e.message)}">erreur : ${esc(e.message).slice(0, 60)}</span>`;
                }
            }
            showAsanaChanges(popup);
            showAsanaConflicts(conflicts);
            msg.style.color = out.errors ? '#c62828' : '#2e7d32';
            msg.textContent =
                `Terminé : ${out.created} créé(s), ${out.updated} mis à jour, ${out.unchanged} déjà à jour` +
                (out.errors ? `, ${out.errors} en erreur (survolez « erreur » pour le détail)` : '') +
                '.';
            // La liste se recharge (états d'appairage à jour) en conservant filtre, résultats par projet et compte rendu
            asana.keep = {
                kw: document.getElementById('affAsanaKw').value,
                color: msg.style.color,
                text: msg.textContent,
                results: Object.fromEntries(
                    rows.map(tr => [tr.dataset.gid, tr.querySelector('.aff-asana-diff').innerHTML])
                )
            };
            state.projects = (await api('/affectation/projects')).projects;
            renderProjects();
            notifierPlanning();
            adminApi.asanaLoadProjects();
        },
        async asanaLink(gid, value) {
            try {
                await api('/affectation/asana/links', {
                    method: 'PUT',
                    body: JSON.stringify({ gid, deploymentId: Number(value) })
                });
                adminApi.asanaLoadProjects();
            } catch (e) {
                alert(e.message);
            }
        },
        // Compare chaque projet à son déploiement (sans rien écrire) et indique le nombre d'écarts
        async asanaScanAll() {
            const rows = [...document.querySelectorAll('#affAsanaTable tbody tr')].filter(
                tr => tr.style.display !== 'none'
            );
            for (const tr of rows) {
                const cell = tr.querySelector('.aff-asana-diff'),
                    gid = tr.dataset.gid;
                if (tr.querySelector('select option[value="-1"]:checked')) {
                    cell.innerHTML = '<span class="aff-muted">ignoré</span>';
                    continue;
                }
                cell.innerHTML = '<span class="aff-muted">analyse…</span>';
                try {
                    const d = await api('/affectation/asana/preview', {
                        method: 'POST',
                        body: JSON.stringify({ gid, formationTarget: 'utilisateurs' })
                    });
                    const n = d.rows.filter(r => r.status === 'nouveau' || r.status === 'modifié').length;
                    const k = d.rows.filter(r => r.status === 'conflit').length;
                    cell.innerHTML =
                        (n
                            ? `<span class="aff-av-b mid">${n} à mettre à jour</span>`
                            : k
                              ? ''
                              : '<span class="aff-av-b na">à jour</span>') +
                        (k
                            ? ` <span class="aff-av-b ko" title="Modifiés dans l'application et dans Asana">⚠ ${k} conflit${k > 1 ? 's' : ''}</span>`
                            : '');
                } catch (e) {
                    cell.innerHTML = `<span class="aff-error" title="${esc(e.message)}">erreur</span>`;
                }
            }
        },
        asanaClose() {
            document.getElementById('affAsanaModal').classList.remove('active');
        },
        async asanaAnalyze() {
            const err = document.getElementById('affAsanaError');
            err.textContent = '';
            const target = 'utilisateurs';
            try {
                let d;
                if (asana.src.type === 'api') {
                    d = await api('/affectation/asana/preview', {
                        method: 'POST',
                        body: JSON.stringify({ gid: asana.src.gid, formationTarget: target })
                    });
                } else {
                    const file = document.getElementById('affAsanaFile').files[0];
                    if (file) asana.csv = await file.text();
                    if (!asana.csv) return;
                    d = await api('/affectation/import/asana-csv', {
                        method: 'POST',
                        body: JSON.stringify({ csv: asana.csv, formationTarget: target })
                    });
                }
                asana.preview = d;
                const badge = st =>
                    ({
                        nouveau: '<span class="aff-av-b ok">Nouveau</span>',
                        modifié: '<span class="aff-av-b mid">Modifié</span>',
                        local: '<span class="aff-av-b na" title="Valeur modifiée dans l\'application ; Asana n\'a pas changé depuis la dernière reprise : rien à reprendre">Modifié dans l\'outil</span>',
                        conflit:
                            '<span class="aff-av-b ko" title="Modifiée dans l\'application et dans Asana depuis la dernière reprise">⚠ Conflit</span>',
                        identique: '<span class="aff-av-b na">Identique</span>',
                        absent: '<span class="aff-av-b ko">Non importé</span>'
                    })[st];
                document.getElementById('affAsanaResult').innerHTML = `
                    <div class="aff-sync-sec" style="margin-bottom:12px;">
                        <b>${esc(d.samuName)}</b> — projet Asana « ${esc(d.projectName)} » (${d.taskCount} tâches lues)<br>
                        ${d.existing ? `<span class="aff-muted">Un déploiement existe déjà pour ce SAMU : il sera <b>mis à jour</b> (le chef de projet, les périodes de gel et le nombre de ressources sont conservés).</span>` : `<span class="aff-muted">Aucun déploiement pour ce SAMU : il sera <b>créé</b> (nombre de ressources à 1 par défaut, à ajuster ensuite).</span>`}
                        ${d.locationFound ? '' : '<br><span class="aff-error">Entité SAMU introuvable dans la liste des localisations : le déploiement sera créé sans entité liée.</span>'}
                    </div>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead><tr style="background:#e6f4f1;"><th style="padding:6px 8px;width:30px;"></th><th style="padding:6px 8px;text-align:left;">Rubrique</th><th style="padding:6px 8px;text-align:left;">Actuel</th><th style="padding:6px 8px;text-align:left;">Asana</th><th style="padding:6px 8px;text-align:left;">État</th></tr></thead>
                        <tbody>${d.rows
                            .map(
                                r => `<tr style="border-top:1px solid #eef1f6;">
                            <td style="padding:6px 8px;"><input type="checkbox" data-ak="${r.key}" ${r.status === 'nouveau' || r.status === 'modifié' ? 'checked' : ''} ${r.status === 'absent' || r.status === 'identique' || r.status === 'local' ? 'disabled' : ''} style="width:auto;display:inline-block;margin:0;"></td>
                            <td style="padding:6px 8px;font-weight:600;">${esc(r.label)}</td>
                            <td style="padding:6px 8px;">${esc(r.old) || '<span class="aff-muted">—</span>'}</td>
                            <td style="padding:6px 8px;">${esc(r.new) || '<span class="aff-muted">—</span>'}${r.reason ? `<div class="aff-muted" style="font-size:11px;">${esc(r.reason)}</div>` : ''}${r.status === 'conflit' ? `<div style="font-size:11px;color:#b3261e;">⚠ Modifiée dans l'application${r.previous ? ` (dernière reprise d'Asana : ${esc(r.previous)})` : ''} : cochez pour reprendre la valeur d'Asana ; sinon la valeur de l'application est conservée.</div>` : ''}</td>
                            <td style="padding:6px 8px;">${badge(r.status)}</td></tr>`
                            )
                            .join('')}</tbody>
                    </table>`;
                document.getElementById('affAsanaOk').style.display = d.rows.some(
                    r => r.status === 'nouveau' || r.status === 'modifié' || r.status === 'conflit'
                )
                    ? ''
                    : 'none';
            } catch (e) {
                document.getElementById('affAsanaResult').innerHTML = '';
                document.getElementById('affAsanaOk').style.display = 'none';
                err.textContent = e.message;
            }
        },
        async asanaApply() {
            const keys = [...document.querySelectorAll('#affAsanaResult input[data-ak]:checked')].map(
                i => i.dataset.ak
            );
            const err = document.getElementById('affAsanaError');
            err.textContent = '';
            if (!keys.length) {
                err.textContent = 'Sélectionnez au moins une rubrique.';
                return;
            }
            try {
                const target = 'utilisateurs';
                const r =
                    asana.src.type === 'api'
                        ? await api('/affectation/asana/apply', {
                              method: 'POST',
                              body: JSON.stringify({ gid: asana.src.gid, formationTarget: target, apply: keys })
                          })
                        : await api('/affectation/import/asana-csv/apply', {
                              method: 'POST',
                              body: JSON.stringify({ csv: asana.csv, formationTarget: target, apply: keys })
                          });
                adminApi.asanaClose();
                await loadAdmin();
                notifierPlanning();
                alert(
                    `${r.created ? 'Déploiement créé' : 'Déploiement mis à jour'} : ${r.samu_name}.` +
                        (r.debutAjuste
                            ? `\nLe début du projet a été ramené au ${r.date_debut.split('-').reverse().join('/')} pour rester antérieur aux autres dates.`
                            : '') +
                        (r.created ? '\nPensez à indiquer le nombre de ressources par étape (1 par défaut).' : '')
                );
            } catch (e) {
                err.textContent = e.message;
            }
        },
        editProject(id) {
            if (!state.loaded) {
                loadAdmin().then(() => adminApi.editProject(id));
                return;
            }
            const p = id ? state.projects.find(x => x.id === id) : null;
            state.form = p
                ? JSON.parse(
                      JSON.stringify({
                          ...p,
                          date_mise_en_service: p.date_mise_en_service || '',
                          date_mise_en_production: p.date_mise_en_production || ''
                      })
                  )
                : emptyForm();
            document.getElementById('affModalTitle').textContent = p
                ? `Modifier : ${p.samu_name}`
                : 'Nouveau déploiement de SAMU';
            document.getElementById('affModalError').textContent = '';
            renderForm();
            document.getElementById('affProjectModal').classList.add('active');
            loadEventCandidates(p ? p.id : null);
        },
        async evLink(sel) {
            const key = sel.dataset.ek,
                c = state.evc && state.evc.candidates[key];
            try {
                await api(`/affectation/projects/${state.form.id}/event-link`, {
                    method: 'PUT',
                    body: JSON.stringify({ key, eventId: sel.value ? Number(sel.value) : null })
                });
                if (c) c.linked = sel.value ? Number(sel.value) : null;
                evInfo(key);
            } catch (e) {
                document.getElementById('affModalError').textContent = e.message;
            }
        },
        evOpenState(k, open) {
            if (open) evOpen.add(k);
            else evOpen.delete(k);
        },
        async evToggle(cb) {
            const key = cb.closest('[data-evbox]').dataset.evbox,
                c = state.evc && state.evc.candidates[key],
                ids = evCheckedIds(cb);
            try {
                await api(`/affectation/projects/${state.form.id}/event-link`, {
                    method: 'PUT',
                    body: JSON.stringify({ key, eventIds: ids })
                });
                if (c) c.linkedIds = ids;
                if (c) cb.closest('details').querySelector('summary').firstChild.textContent = evSummary(c);
            } catch (e) {
                document.getElementById('affModalError').textContent = e.message;
            }
        },
        async evPartAdd(key) {
            const err = document.getElementById('affModalError');
            err.textContent = '';
            const d = evPartDates('ev', key);
            if (!d.start) {
                err.textContent = `${stageDef(key).label} : renseignez le début de la partie.`;
                return;
            }
            try {
                await api(`/affectation/projects/${state.form.id}/event-create`, {
                    method: 'POST',
                    body: JSON.stringify({ key, start: d.start, end: d.end })
                });
                await loadEventCandidates(state.form.id);
            } catch (e) {
                err.textContent = e.message;
            }
        },
        async evCreate(key) {
            const err = document.getElementById('affModalError');
            err.textContent = '';
            const d = evRowDates(key),
                def = stageDef(key),
                c = state.evc && state.evc.candidates[key];
            if (!d) {
                err.textContent = `${def.label} : renseignez d'abord la date (ou la période) avant de créer l'événement.`;
                return;
            }
            const txt = d.start === d.end ? `le ${evFr(d.start)}` : `du ${evFr(d.start)} au ${evFr(d.end)}`;
            if (
                !confirm(
                    `Créer l'événement « ${c && c.typeLong ? c.typeLong : def.label} » pour ${state.form.samu_name}, ${txt} ?\n\nLes ressources affectées à cette activité (si elles ont un compte) seront ajoutées en participants.`
                )
            )
                return;
            try {
                await api(`/affectation/projects/${state.form.id}/event-create`, {
                    method: 'POST',
                    body: JSON.stringify({ key, start: d.start, end: d.end })
                });
                await loadEventCandidates(state.form.id);
                const t = document.createElement('div');
                t.className = 'aff-toast';
                t.textContent = `Événement « ${def.label} » créé et relié.`;
                document.body.appendChild(t);
                setTimeout(() => t.remove(), 4000);
            } catch (e) {
                err.textContent = e.message;
            }
        },
        closeProject() {
            document.getElementById('affProjectModal').classList.remove('active');
        },
        syncMin() {
            const d = document.getElementById('affDebut').value;
            document
                .querySelectorAll(
                    '#affModalBody input[data-pk], #affModalBody input[data-df], #affModalBody input[data-mk]'
                )
                .forEach(inp => {
                    if (d) inp.min = d;
                    else inp.removeAttribute('min');
                });
            // La borne haute d'une période ne peut pas précéder sa borne basse
            document.querySelectorAll('#affModalBody input[data-pf="start"]').forEach(st => {
                if (st.value) adminApi.startChanged(st, true);
            });
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
                if (d) end.min = d;
                else end.removeAttribute('min');
                if (end.dataset.auto === '1') {
                    end.value = '';
                    end.dataset.auto = '';
                    if (days) days.value = '';
                }
            }
        },
        weekChanged(wk) {
            const m = /^(\d{4})-W(\d{2})$/.exec(wk.value);
            const row = wk.closest('.pr');
            const start = row && row.querySelector('input[data-pf="start"]');
            if (!start) return;
            if (!m) {
                start.value = '';
                adminApi.startChanged(start);
                return;
            }
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
            const list = state.locations.filter(
                l => !q || norm(l.libelle_court).includes(q) || norm(l.libelle_long).includes(q)
            );
            state.sugList = list;
            state.sugIdx = -1;
            if (!list.length) {
                box.innerHTML = '<div class="cnt">Aucune entité correspondante</div>';
                box.style.display = 'block';
                return;
            }
            box.innerHTML =
                `<div class="cnt">${list.length} entité${list.length > 1 ? 's' : ''} — ↑ ↓ pour parcourir, Entrée pour choisir</div>` +
                list.map((l, i) => `<div data-i="${i}">${esc(l.libelle_long)}</div>`).join('');
            box.style.display = 'block';
            box.querySelectorAll('div[data-i]').forEach(
                el =>
                    (el.onmousedown = ev => {
                        ev.preventDefault();
                        adminApi.pickEntity(Number(el.dataset.i));
                    })
            );
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
            if (box.style.display !== 'block' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                adminApi.suggest(e.target.value);
            }
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
            const errs = validateForm(f);
            const errEl = document.getElementById('affModalError');
            document.querySelectorAll('#affModalBody .aff-bad').forEach(e => e.classList.remove('aff-bad'));
            if (errs.length) {
                errEl.innerHTML = errs.map(e => `• ${esc(e.msg)}`).join('<br>');
                errs.forEach(e => {
                    const el = document.querySelector(e.sel);
                    if (el) el.classList.add('aff-bad');
                });
                const first = document.querySelector(errs[0].sel);
                if (first) {
                    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    first.focus({ preventScroll: true });
                }
                return;
            }
            errEl.textContent = '';
            try {
                const body = JSON.stringify({
                    samu_name: f.samu_name,
                    location_id: f.location_id,
                    chef_projet_id: f.chef_projet_id,
                    date_debut: f.date_debut,
                    date_mise_en_service: f.date_mise_en_service || null,
                    date_mise_en_production: f.date_mise_en_production || null,
                    periods: f.periods
                });
                await api(f.id ? `/affectation/projects/${f.id}` : '/affectation/projects', {
                    method: f.id ? 'PUT' : 'POST',
                    body
                });
                adminApi.closeProject();
                await loadAdmin();
                notifierPlanning();
            } catch (e) {
                errEl.textContent = e.message;
            }
        },
        async deleteProject(id, mode) {
            const p = state.projects.find(x => x.id === id);
            if (!p) return;
            if (!mode && !confirm(`Supprimer le déploiement « ${p.samu_name} » ?`)) return;
            try {
                const r = await api(`/affectation/projects/${id}${mode ? '?events=' + mode : ''}`, {
                    method: 'DELETE'
                });
                AffectationApp.delEvCancel();
                await loadAdmin();
                notifierPlanning();
                if (r.eventsRemoved) {
                    const t = document.createElement('div');
                    t.className = 'aff-toast';
                    t.textContent = `Déploiement supprimé avec ${r.eventsRemoved} événement(s) ; ${r.planningReset} demi-journée(s) de planification remises en « Disponible / En attente d'affectation ».`;
                    document.body.appendChild(t);
                    setTimeout(() => t.remove(), 7000);
                }
            } catch (e) {
                if (e.data && e.data.code === 'EVENTS_LINKED') {
                    adminApi.delEvOpen(id, p, e.data.events);
                    return;
                }
                alert(e.message);
            }
        },
        delEvOpen(id, p, events) {
            adminApi._delId = id;
            document.getElementById('affDelEvBody').innerHTML =
                `<p style="margin:0 0 10px;font-size:14px;"><b>${esc(p.samu_name)}</b> est relié à <b>${events.length}</b> événement(s). Que faire ?</p>
                <div style="border:1px solid #dfe5ef;border-radius:10px;max-height:260px;overflow:auto;margin-bottom:12px;">
                ${events.map(e => `<div style="padding:8px 12px;border-top:1px solid #eef1f6;font-size:13px;"><b>${esc(e.label)}</b> <span class="aff-muted">${esc(e.start.split('-').reverse().join('/'))}${e.end !== e.start ? ' → ' + esc(e.end.split('-').reverse().join('/')) : ''}</span>${e.participants.length ? `<div class="aff-muted" style="font-size:12px;">Participants : ${e.participants.map(esc).join(', ')}</div>` : ''}</div>`).join('')}</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#4a5b70;"><li><b>Supprimer le déploiement ET les événements</b> : les experts mobilisés sont remis, dans leur planification, en <b>« 2 - Disponible »</b> et <b>« 2 - En attente d'affectation »</b> et la <b>localisation est effacée</b> (uniquement sur les demi-journées posées par l'affectation pour ce SAMU).</li>
                <li><b>Supprimer le déploiement seulement</b> : les événements et la planification des experts restent inchangés.</li></ul>`;
            document.getElementById('affDelEvModal').classList.add('active');
        },
        delEvGo(mode) {
            adminApi.deleteProject(adminApi._delId, mode);
        },
        delEvCancel() {
            document.getElementById('affDelEvModal').classList.remove('active');
        },
        previewColor(key, value) {
            state.colors[key] = value;
            renderLegend();
            renderProjects();
            const pv = document.getElementById('affPatPrev_' + key);
            if (pv) pv.style.cssText = bgStyle(value, pattern(key));
        },
        previewPattern(key, value) {
            state.patterns[key] = value;
            renderLegend();
            renderProjects();
            const pv = document.getElementById('affPatPrev_' + key);
            if (pv) pv.style.cssText = bgStyle(color(key), value);
        },
        async saveColors() {
            const msg = document.getElementById('affColorsMsg');
            try {
                const data = await api('/affectation/colors', {
                    method: 'PUT',
                    body: JSON.stringify({ colors: state.colors, patterns: state.patterns })
                });
                state.colors = { ...data.colors };
                state.patterns = { ...data.patterns };
                renderLegend();
                renderProjects();
                renderColors();
                msg.style.color = '#2e7d32';
                msg.textContent = 'Couleurs et motifs enregistrés.';
            } catch (e) {
                msg.style.color = '#c62828';
                msg.textContent = e.message;
            }
        },
        resetColors() {
            state.config.stages.forEach(st => {
                state.colors[st.key] = st.defaultColor;
                state.patterns[st.key] = st.defaultPattern || 'none';
            });
            renderLegend();
            renderProjects();
            renderColors();
            const msg = document.getElementById('affColorsMsg');
            msg.style.color = '#7a8799';
            msg.textContent = 'Couleurs et motifs par défaut rétablis : pensez à enregistrer.';
        },
        loadAdmin
    };

    // ================= Planning des déploiements : îlot Vue (frontend/src/ilots/affectation/planning) =================
    // Dates utilisées par l'administration (calendrier des périodes, semaines)
    const MONTHS = [
        'janvier',
        'février',
        'mars',
        'avril',
        'mai',
        'juin',
        'juillet',
        'août',
        'septembre',
        'octobre',
        'novembre',
        'décembre'
    ];
    const utcMs = iso => Date.parse(iso + 'T00:00:00Z');
    const isoMs = ms => new Date(ms).toISOString().slice(0, 10);
    const addD = (iso, n) => isoMs(utcMs(iso) + n * 86400000);
    const todayIso = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
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
    const frd = iso => iso.split('-').reverse().join('/');
    // Grille des déploiements prévenue des modifications de l'administration (îlot Vue)
    const notifierPlanning = () => window.dispatchEvent(new CustomEvent('gp:deploiements-modifies'));

    // Impression / export du planning : îlot Vue (frontend/src/ilots/affectation/planning/impression.ts)
    const SCALE_LABEL = { day: 'jour', week: 'semaine', month: 'mois', quarter: 'trimestre', year: 'année' };

    // ---- Calendrier de saisie des dates avec numéros de semaine ----
    const DP = { el: null, input: null, y: 0, m: 0 };
    function dpClose() {
        if (DP.el) DP.el.style.display = 'none';
        DP.input = null;
    }
    function dpRender() {
        const inp = DP.input;
        const first = `${DP.y}-${String(DP.m + 1).padStart(2, '0')}-01`;
        let day = mondayOf(first);
        const t = todayIso(),
            min = inp.min || '',
            cur = inp.value;
        const isEnd = inp.dataset.pf === 'end';
        let rows = '';
        for (let w = 0; w < 6; w++) {
            const wk = isoWeek(day).week;
            let cells = `<td class="wk" data-pick="${isEnd ? addD(day, 4) : day}" title="Choisir la semaine ${wk} (${isEnd ? 'vendredi' : 'lundi'})">${wk}</td>`;
            for (let d = 0; d < 7; d++) {
                const iso = addD(day, d),
                    inM = +iso.slice(5, 7) === DP.m + 1;
                cells += `<td class="d ${inM ? '' : 'o'} ${d > 4 ? 'we' : ''} ${iso === t ? 'today' : ''} ${iso === cur ? 'sel' : ''} ${min && iso < min ? 'dis' : ''}"><button type="button" data-pick="${min && iso < min ? '' : iso}">${+iso.slice(8)}</button></td>`;
            }
            rows += `<tr>${cells}</tr>`;
            day = addD(day, 7);
            if (w >= 3 && +day.slice(5, 7) !== DP.m + 1 && +addD(day, -1).slice(5, 7) !== DP.m + 1) break;
        }
        DP.el.innerHTML = `<div class="hd"><button type="button" data-nav="-1" aria-label="Mois précédent">‹</button><span>${cap(MONTHS[DP.m])} ${DP.y}</span><button type="button" data-nav="1" aria-label="Mois suivant">›</button></div>
            <table><thead><tr><th title="Numéro de semaine">S</th>${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
            <div class="ft"><button type="button" data-pick="${t}">Aujourd'hui</button><span>Cliquer sur un n° de semaine pour la choisir</span></div>`;
    }
    function dpOpen(input) {
        if (!DP.el) {
            DP.el = document.createElement('div');
            DP.el.className = 'aff-dp';
            DP.el.addEventListener('mousedown', e => e.preventDefault());
            DP.el.addEventListener('click', e => {
                const nav = e.target.closest('[data-nav]'),
                    pick = e.target.closest('[data-pick]');
                if (nav) {
                    DP.m += Number(nav.dataset.nav);
                    if (DP.m < 0) {
                        DP.m = 11;
                        DP.y--;
                    }
                    if (DP.m > 11) {
                        DP.m = 0;
                        DP.y++;
                    }
                    dpRender();
                    return;
                }
                if (pick && pick.dataset.pick && DP.input) {
                    const inp = DP.input;
                    inp.value = inp.min && pick.dataset.pick < inp.min ? inp.min : pick.dataset.pick; // une semaine entamée avant le minimum se cale sur celui-ci
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    dpClose();
                }
            });
            document.body.appendChild(DP.el);
        }
        DP.input = input;
        // Le calendrier s'ouvre sur la date déjà choisie ; à défaut, sur la borne basse de la période
        const row = input.closest('.pr'),
            st = row && row.querySelector('input[data-pf="start"]');
        const base = input.value || (input.dataset.pf === 'end' && st && st.value) || input.min || todayIso();
        DP.y = +base.slice(0, 4);
        DP.m = +base.slice(5, 7) - 1;
        DP.el.style.display = 'block';
        dpRender();
        const r = input.getBoundingClientRect(),
            h = DP.el.offsetHeight,
            w = DP.el.offsetWidth;
        DP.el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
        DP.el.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    }
    const dpTarget = e => {
        const i = e.target;
        return i && i.matches && i.matches('input[type="date"]') && i.closest('#affProjectModal') ? i : null;
    };
    document.addEventListener(
        'mousedown',
        e => {
            const i = dpTarget(e);
            if (i) {
                e.preventDefault();
                dpOpen(i);
            } else if (DP.el && !DP.el.contains(e.target)) dpClose();
        },
        true
    );
    document.addEventListener(
        'click',
        e => {
            if (dpTarget(e)) e.preventDefault();
        },
        true
    );
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') dpClose();
        if (e.key === 'Enter' && dpTarget(e)) {
            e.preventDefault();
            dpOpen(e.target);
        }
    });

    const HIST_ACTIONS = {
        creation: ['Création du déploiement', '#2e7d32'],
        modification: ['Modification', '#1976d2'],
        suppression: ['Suppression', '#b3261e'],
        affectation: ['Affectation de ressources', '#7e57c2'],
        synchro: ['Report planification / événements', '#00897b'],
        import_asana_csv: ['Import Asana (fichier CSV)', '#e65100'],
        import_asana_api: ['Récupération Asana (API)', '#e65100']
    };
    const planApi = {
        async showHistory(projectId) {
            const body = document.getElementById('affHistBody');
            const p = (state.projects || []).find(x => x.id === projectId);
            document.getElementById('affHistTitle').innerHTML =
                `${svg('search', 'aff-ico')}Historique${p ? ' — ' + esc(p.samu_name) : ''}`;
            body.innerHTML = '<p class="aff-muted">Chargement…</p>';
            document.getElementById('affHistModal').classList.add('active');
            try {
                const d = await api(`/affectation/projects/${projectId}/history`);
                if (!d.history.length) {
                    body.innerHTML =
                        '<p class="aff-muted">Aucun événement enregistré pour ce déploiement (l\'historique démarre à la mise en service de cette fonction).</p>';
                    return;
                }
                const when = at => {
                    const dt = new Date(String(at).replace(' ', 'T') + 'Z');
                    return dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
                };
                body.innerHTML =
                    `<p class="aff-muted" style="margin:0 0 10px;">${d.history.length} événement(s), du plus récent au plus ancien.</p>` +
                    d.history
                        .map(h => {
                            const a = HIST_ACTIONS[h.action] || [h.action, '#6b7a8d'];
                            return `<div class="aff-hist-item" style="border-left-color:${a[1]};"><div class="top"><span class="aff-hist-tag" style="background:${a[1]};">${esc(a[0])}</span><span class="who">${esc(h.user)}</span><span class="when">${when(h.at)}</span></div>
                        ${h.note ? `<div class="aff-muted" style="font-size:12px;">${esc(h.note)}</div>` : ''}
                        ${h.changes.length ? `<ul>${h.changes.map(c => `<li><b>${esc(c.label)}</b> : <span class="from">${esc(c.from)}</span> → <span class="to">${esc(c.to)}</span></li>`).join('')}</ul>` : ''}</div>`;
                        })
                        .join('');
            } catch (e) {
                body.innerHTML = `<p class="aff-error">${esc(e.message)}</p>`;
            }
        },
        historyClose() {
            document.getElementById('affHistModal').classList.remove('active');
        },
        fnPreview() {
            const i = document.getElementById('affFnPattern'),
                e = document.getElementById('affFnExample');
            if (i && e)
                e.textContent =
                    exportFileName(i.value.trim() || exportName.defaultPattern, {
                        from: todayIso(),
                        to: todayIso(),
                        zoom: 'day',
                        title: 'Planning des déploiements des SAMU'
                    }) + '.pptx';
        },
        async fnSave() {
            const msg = document.getElementById('affTplMsg');
            try {
                Object.assign(
                    exportName,
                    await api('/affectation/export-config', {
                        method: 'PUT',
                        body: JSON.stringify({ pattern: document.getElementById('affFnPattern').value.trim() })
                    })
                );
                msg.style.color = '#1b7f3b';
                msg.textContent = 'Nom de fichier enregistré.';
                renderTplCard();
            } catch (e) {
                msg.style.color = '#b3261e';
                msg.textContent = e.message;
            }
        },
        async fnReset() {
            document.getElementById('affFnPattern').value = '';
            await AffectationApp.fnSave();
        },
        async tplUpload(input) {
            const f = input.files && input.files[0];
            input.value = '';
            const msg = document.getElementById('affTplMsg');
            if (!f) return;
            if (!/\.pptx$/i.test(f.name)) {
                msg.style.color = '#b3261e';
                msg.textContent = 'Choisissez un fichier PowerPoint (.pptx).';
                return;
            }
            msg.style.color = '';
            msg.textContent = 'Import et analyse du modèle…';
            try {
                const data = await new Promise((ok, ko) => {
                    const r = new FileReader();
                    r.onload = () => ok(r.result);
                    r.onerror = () => ko(new Error('Lecture du fichier impossible'));
                    r.readAsDataURL(f);
                });
                tpl.meta = await api('/affectation/template', {
                    method: 'PUT',
                    body: JSON.stringify({ name: f.name, data })
                });
                renderTplCard();
                msg.style.color = '#1b7f3b';
                msg.textContent = 'Modèle importé.';
            } catch (e) {
                msg.style.color = '#b3261e';
                msg.textContent = e.message;
            }
        },
        async tplRemove() {
            if (!confirm('Supprimer le modèle PowerPoint ? Les exports reviendront à la mise en page standard.'))
                return;
            try {
                tpl.meta = await api('/affectation/template', { method: 'DELETE' });
                renderTplCard();
                document.getElementById('affTplMsg').textContent = 'Modèle supprimé.';
            } catch (e) {
                document.getElementById('affTplMsg').textContent = e.message;
            }
        },
        async asanaRefresh(id, btn) {
            if (btn.classList.contains('aff-busy')) return;
            btn.classList.add('aff-busy');
            const toast = (msg, err) => {
                const t = document.createElement('div');
                t.className = 'aff-toast' + (err ? ' err' : '');
                t.textContent = msg;
                document.body.appendChild(t);
                setTimeout(() => t.remove(), err ? 7000 : 4500);
            };
            try {
                const r = await api(`/affectation/projects/${id}/asana-refresh`, { method: 'POST', body: '{}' });
                if (r.unchanged) toast(`${r.samu_name} : déjà à jour avec Asana (${r.asana}).`, false);
                else if (!r.updated && !r.created) {
                    /* seuls des conflits : rien n'a été modifié */
                } else
                    showAsanaChanges({
                        title: `Changements issus d'Asana — ${r.samu_name}`,
                        items: [{ samu: r.samu_name, created: r.created, asana: r.asana, changes: r.changes || [] }]
                    });
                if (r.conflicts && r.conflicts.length)
                    showAsanaConflicts([{ id, samu: r.samu_name, asana: r.asana, rows: r.conflicts }]);
                if (!r.unchanged && (r.updated || r.created)) {
                    notifierPlanning();
                    if (state.loaded) await loadAdmin();
                }
            } catch (e) {
                toast(e.message, true);
            } finally {
                btn.classList.remove('aff-busy');
            }
        },
        async asanaRefreshAll(btn) {
            if (btn.classList.contains('aff-busy')) return;
            btn.classList.add('aff-busy');
            const old = btn.lastChild.textContent;
            btn.lastChild.textContent = 'Rafraîchissement en cours…';
            const toast = (html, err) => {
                const t = document.createElement('div');
                t.className = 'aff-toast' + (err ? ' err' : '');
                t.style.maxWidth = '560px';
                t.style.textAlign = 'left';
                t.innerHTML = html;
                t.title = 'Cliquer pour fermer';
                t.onclick = () => t.remove();
                document.body.appendChild(t);
                setTimeout(() => t.remove(), err ? 12000 : 15000);
            };
            try {
                const r = await api('/affectation/asana/refresh-all', { method: 'POST', body: '{}' });
                showAsanaChanges({
                    title: 'Rafraîchissement depuis Asana — changements constatés',
                    items: r.updated.map(u => ({ samu: u.samu, created: false, asana: u.asana, changes: u.changes })),
                    unchanged: r.unchanged,
                    noMatch: r.noMatch,
                    errors: r.errors
                });
                if (r.updated.length) {
                    notifierPlanning();
                    await loadAdmin();
                }
                showAsanaConflicts(r.conflicts);
            } catch (e) {
                toast(esc(e.message), true);
            } finally {
                btn.classList.remove('aff-busy');
                btn.lastChild.textContent = old;
            }
        },
        async tplChoose() {
            const pick = document.getElementById('affTplPick');
            pick.textContent = 'Chargement des projets Asana…';
            try {
                const r = await api('/affectation/asana/template-projects');
                const cur = stageTypes.data.asanaTemplate && stageTypes.data.asanaTemplate.gid;
                pick.innerHTML = `<select id="affTplSel" style="padding:6px;max-width:360px;">${r.projects.map(p => `<option value="${esc(p.gid)}" ${p.gid === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select> <button type="button" class="aff-btn aff-btn-primary" onclick="AffectationApp.tplLoad(document.getElementById('affTplSel').value)">Charger les tâches</button>`;
            } catch (e) {
                pick.innerHTML = `<span class="aff-error">${esc(e.message)}</span>`;
            }
        },
        async tplLoad(gid) {
            const pick = document.getElementById('affTplPick');
            if (pick) pick.textContent = 'Lecture des tâches du projet…';
            try {
                const r = await api('/affectation/asana/template', { method: 'PUT', body: JSON.stringify({ gid }) });
                stageTypes.data.asanaTemplate = r.template;
                renderStageTypes();
            } catch (e) {
                if (pick) pick.innerHTML = `<span class="aff-error">${esc(e.message)}</span>`;
            }
        },
        async asanaRuleSet(el) {
            const d = stageTypes.data,
                key = el.dataset.stage || el.dataset.stageCustom;
            const custom = document.querySelector(`input[data-stage-custom="${key}"]`);
            const sel = document.querySelector(`select[data-stage="${key}"][onchange*="asanaRuleSet"]`);
            if (el === sel) custom.style.display = sel.value === '__custom' ? '' : 'none';
            const v = sel.value === '__custom' ? custom.value.trim() : sel.value;
            if (sel.value === '__custom' && !v) return;
            d.asanaRules = { ...(d.asanaRules || {}), [key]: v };
            if (!v) delete d.asanaRules[key];
            await AffectationApp.stageTypeSet(null);
        },
        async stageTypeSet(sel) {
            const d = stageTypes.data,
                msg = document.getElementById('affStageTypesMsg');
            if (sel) {
                d.mapping[sel.dataset.stage] = Number(sel.value);
                const t = d.types.find(x => x.id === Number(sel.value));
                const c = document.getElementById('affStChip_' + sel.dataset.stage);
                if (c && typeof evtChip === 'function') c.innerHTML = evtChip(t, true);
            }
            try {
                const r = await api('/affectation/stage-event-types', {
                    method: 'PUT',
                    body: JSON.stringify({ mapping: d.mapping, asanaRules: d.asanaRules || {} })
                });
                d.mapping = r.mapping;
                d.asanaRules = r.asanaRules;
                msg.style.color = '#1b7f3b';
                msg.textContent = 'Correspondance enregistrée.';
                setTimeout(() => {
                    if (msg.textContent === 'Correspondance enregistrée.') msg.textContent = '';
                }, 3000);
            } catch (e) {
                msg.style.color = '#b3261e';
                msg.textContent = e.message;
            }
        },
        async asanaTasks(id) {
            asanaT.id = id;
            asanaT.data = null;
            asanaT.ov = {};
            document.getElementById('affAsanaTasksBody').innerHTML =
                '<p class="aff-muted">Chargement des tâches depuis Asana…</p>';
            document.getElementById('affAsanaTasksMsg').textContent = '';
            document.getElementById('affAsanaTasksModal').classList.add('active');
            try {
                const d = await api(`/affectation/projects/${id}/asana-tasks`);
                asanaT.data = d;
                asanaT.evc = undefined;
                d.rubriques.forEach(r => {
                    if (r.override) asanaT.ov[r.key] = { ...r.override };
                });
                document.getElementById('affAsanaTasksTitle').lastChild.textContent =
                    `Tâches du projet Asana — ${d.samu}`;
                renderAsanaTasks();
                try {
                    asanaT.evc = await api(`/affectation/projects/${id}/events-candidates`);
                } catch (e) {
                    asanaT.evc = null;
                }
                renderAsanaTasks();
            } catch (e) {
                document.getElementById('affAsanaTasksBody').innerHTML = `<p class="aff-error">${esc(e.message)}</p>`;
            }
        },
        async asanaTasksProject(gid) {
            try {
                await api('/affectation/asana/links', {
                    method: 'PUT',
                    body: JSON.stringify({ gid, deploymentId: asanaT.id })
                });
                await AffectationApp.asanaTasks(asanaT.id);
            } catch (e) {
                document.getElementById('affAsanaTasksMsg').textContent = e.message;
            }
        },
        async asanaEvLink(sel) {
            const key = sel.dataset.ek,
                c = asanaT.evc && asanaT.evc.candidates[key];
            try {
                await api(`/affectation/projects/${asanaT.id}/event-link`, {
                    method: 'PUT',
                    body: JSON.stringify({ key, eventId: sel.value ? Number(sel.value) : null })
                });
                if (c) c.linked = sel.value ? Number(sel.value) : null;
                const td = document.getElementById('aTEv_' + key);
                if (td) td.innerHTML = asanaEvCell(key);
            } catch (e) {
                document.getElementById('affAsanaTasksMsg').textContent = e.message;
            }
        },
        async asanaEvToggle(cb) {
            const key = cb.closest('[data-evbox]').dataset.evbox,
                c = asanaT.evc && asanaT.evc.candidates[key],
                ids = evCheckedIds(cb);
            try {
                await api(`/affectation/projects/${asanaT.id}/event-link`, {
                    method: 'PUT',
                    body: JSON.stringify({ key, eventIds: ids })
                });
                if (c) c.linkedIds = ids;
                if (c) cb.closest('details').querySelector('summary').firstChild.textContent = evSummary(c);
            } catch (e) {
                document.getElementById('affAsanaTasksMsg').textContent = e.message;
            }
        },
        async asanaEvPartAdd(key) {
            const msg = document.getElementById('affAsanaTasksMsg');
            msg.style.color = '#b3261e';
            msg.textContent = '';
            const d = evPartDates('asanaEv', key);
            if (!d.start) {
                msg.textContent = `${stageDef(key).label} : renseignez le début de la partie.`;
                return;
            }
            try {
                await api(`/affectation/projects/${asanaT.id}/event-create`, {
                    method: 'POST',
                    body: JSON.stringify({ key, start: d.start, end: d.end })
                });
                asanaT.evc = await api(`/affectation/projects/${asanaT.id}/events-candidates`);
                renderAsanaTasks();
            } catch (e) {
                msg.textContent = e.message;
            }
        },
        async asanaEvCreate(key) {
            const msg = document.getElementById('affAsanaTasksMsg');
            msg.style.color = '#b3261e';
            msg.textContent = '';
            const d = asanaRowDates(key),
                def = stageDef(key),
                c = asanaT.evc && asanaT.evc.candidates[key];
            if (!d) {
                msg.textContent = `${def.label} : aucune date connue pour cette activité ; renseignez-la dans le déploiement ou choisissez une tâche à reprendre.`;
                return;
            }
            const txt = d.start === d.end ? `le ${aFr(d.start)}` : `du ${aFr(d.start)} au ${aFr(d.end)}`;
            if (
                !confirm(
                    `Créer l'événement « ${c && c.typeLong ? c.typeLong : def.label} » pour ${asanaT.data.samu}, ${txt} ?\n\nLes ressources affectées à cette activité (si elles ont un compte) seront ajoutées en participants.`
                )
            )
                return;
            try {
                await api(`/affectation/projects/${asanaT.id}/event-create`, {
                    method: 'POST',
                    body: JSON.stringify({ key, start: d.start, end: d.end })
                });
                asanaT.evc = await api(`/affectation/projects/${asanaT.id}/events-candidates`);
                renderAsanaTasks();
                msg.style.color = '#1b7f3b';
                msg.textContent = `Événement « ${def.label} » créé et relié.`;
            } catch (e) {
                msg.textContent = e.message;
            }
        },
        asanaTasksPick(sel) {
            const k = sel.dataset.k,
                f = sel.dataset.f;
            const o = (asanaT.ov[k] = asanaT.ov[k] || {});
            if (sel.value) o[f] = sel.value;
            else delete o[f];
            if (!Object.keys(o).length) delete asanaT.ov[k];
            renderAsanaTasks();
        },
        asanaTasksReset() {
            asanaT.ov = {};
            renderAsanaTasks();
        },
        asanaTasksClose() {
            document.getElementById('affAsanaTasksModal').classList.remove('active');
        },
        async asanaTasksApply() {
            const btn = document.getElementById('affAsanaTasksApply'),
                msg = document.getElementById('affAsanaTasksMsg');
            btn.disabled = true;
            msg.style.color = '#4a5b70';
            msg.textContent = 'Application…';
            try {
                const r = await api(`/affectation/projects/${asanaT.id}/asana-overrides`, {
                    method: 'PUT',
                    body: JSON.stringify({ overrides: asanaT.ov })
                });
                msg.textContent = '';
                AffectationApp.asanaTasksClose();
                if (r.unchanged) {
                    const t = document.createElement('div');
                    t.className = 'aff-toast';
                    t.textContent = `${r.samu_name} : remplacements enregistrés, aucune date à modifier.`;
                    document.body.appendChild(t);
                    setTimeout(() => t.remove(), 4500);
                } else {
                    showAsanaChanges({
                        title: `Remplacements appliqués — ${r.samu_name}`,
                        items: [{ samu: r.samu_name, created: false, asana: r.asana, changes: r.changes || [] }]
                    });
                    notifierPlanning();
                    await loadAdmin();
                }
            } catch (e) {
                msg.style.color = '#b3261e';
                msg.textContent = e.message;
            } finally {
                btn.disabled = false;
            }
        },
        asanaChgClose() {
            document.getElementById('affAsanaChgModal').classList.remove('active');
        },
        asanaConflictsClose() {
            document.getElementById('affAsanaConfModal').classList.remove('active');
        },
        asanaConflictsAll(di, choice) {
            document
                .querySelectorAll(`#affAsanaConfBody input[data-ci="${di}"][value="${choice}"]`)
                .forEach(i => (i.checked = true));
        },
        async asanaConflictsApply() {
            const msg = document.getElementById('affAsanaConfMsg'),
                ok = document.getElementById('affAsanaConfOk');
            ok.disabled = true;
            msg.textContent = '';
            let reprises = 0,
                gardees = 0;
            try {
                for (const [di, d] of asanaConf.list.entries()) {
                    const choices = {};
                    document
                        .querySelectorAll(`#affAsanaConfBody input[data-ci="${di}"]:checked`)
                        .forEach(i => (choices[i.dataset.ck] = i.value));
                    const r = await api(`/affectation/projects/${d.id}/asana-conflicts`, {
                        method: 'POST',
                        body: JSON.stringify({ choices })
                    });
                    reprises += r.applied;
                    gardees += r.kept;
                }
                AffectationApp.asanaConflictsClose();
                notifierPlanning();
                if (state.loaded) await loadAdmin();
                const t = document.createElement('div');
                t.className = 'aff-toast';
                t.textContent = `Conflits tranchés : ${reprises} reprise(s) depuis Asana, ${gardees} valeur(s) conservée(s) dans l'application.`;
                document.body.appendChild(t);
                setTimeout(() => t.remove(), 6000);
            } catch (e) {
                msg.textContent = e.message;
                ok.disabled = false;
            }
        }
    };

    const AffectationApp = {
        show() {
            mount();
            // Les autres applications laissent la place
            document.querySelector('.container').style.display = 'none';
            ['deplacementsContainer', 'analyseContainer'].forEach(id => {
                const e = document.getElementById(id);
                if (e) e.style.display = 'none';
            });
            document.getElementById('loginPage').classList.remove('active');
            stopInactivityTimer();
            if (typeof onlineUsersInterval !== 'undefined' && onlineUsersInterval) {
                clearInterval(onlineUsersInterval);
                onlineUsersInterval = null;
            }

            sessionStorage.setItem('selectedApp', KEY);
            if (typeof currentUser !== 'undefined' && currentUser) currentUser.selectedApp = KEY;
            document.getElementById('affectationContainer').style.display = 'block';
            document.getElementById('affectationBackBtn').style.display = 'none'; // retour par le menu Applications
            document.getElementById('affectationOnlineUsersContainer').style.display = 'flex';
            document.getElementById('affectationTimerDisplay').style.display = 'flex';
            visible = true;
            updateUser();
            AffectationApp.tab('planning');
            if (typeof updateAppSwitcher === 'function') updateAppSwitcher();

            stopLoops();
            const startTimer = () => {
                try {
                    startInactivityTimer(inactivityTimeout);
                } catch (e) {
                    /* minuteur indisponible */
                }
            };
            (typeof loadSettingsForDeplacements === 'function'
                ? loadSettingsForDeplacements()
                : Promise.resolve()
            ).then(startTimer);
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
            ['affectationBackBtn', 'affectationOnlineUsersContainer', 'affectationTimerDisplay'].forEach(id => {
                const e = document.getElementById(id);
                if (e) e.style.display = 'none';
            });
        },
        tab(name) {
            const on = {
                planning: name === 'planning',
                events: name === 'events',
                ateliers: name === 'ateliers',
                admin: name === 'admin'
            };
            [
                ['Planning', 'planning'],
                ['Events', 'events'],
                ['Ateliers', 'ateliers'],
                ['Admin', 'admin']
            ].forEach(([n, k]) => {
                document.getElementById('affectationTab' + n).classList.toggle('active', on[k]);
                document.getElementById('affectation' + n + 'Tab').classList.toggle('active', on[k]);
            });
            if (on.admin && !state.loaded) loadAdmin();
            // Onglet « Planning des déploiements » : îlot Vue, monté (ou relu) à l'ouverture de l'onglet
            // Onglet « Événements » : îlot Vue (frontend/src/ilots/affectation), monté à l'ouverture de l'onglet
            if (on.ateliers && window.AtelierPlanner) window.AtelierPlanner.show();
        },
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
    // Script différé (defer) : la page est analysée, le conteneur est créé avant le point d'entrée des îlots Vue (module
    // placé après), qui y trouve l'onglet « Événements » à monter
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
