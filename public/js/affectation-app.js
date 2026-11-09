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
        .aff-card-title { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: #0f4c5c; }
        .aff-ico { width: 22px; height: 22px; fill: none; stroke: #0f766e; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
        .aff-ico-sm { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
        .aff-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border: 1px solid #cfd8e6; border-radius: 9px; background: #fff; color: #33475b; font-size: 13px; font-weight: 600; cursor: pointer; }
        .aff-btn:hover { background: #f1f5fa; }
        .aff-btn-primary { background: linear-gradient(135deg, #14b8a6, #0f766e); border-color: transparent; color: #fff; }
        .aff-btn-primary:hover { filter: brightness(1.08); background: linear-gradient(135deg, #14b8a6, #0f766e); }
        .aff-muted { color: #7a8799; font-size: 13px; }
        .aff-error { color: #c62828; font-size: 13px; font-weight: 600; margin-right: auto; }
        .aff-icon-btn { width: 32px; height: 32px; border: none; border-radius: 8px; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .aff-icon-btn:hover { filter: brightness(1.12); }
        .aff-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
        .aff-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid #e6ebf3; position: sticky; top: 0; background: #fff; z-index: 3; }
        .aff-x { border: none; background: transparent; cursor: pointer; color: #7a8799; padding: 6px; border-radius: 8px; display: inline-flex; }
        .aff-x:hover { background: #eef1f6; }
        .aff-modal-body { padding: 18px 22px; }
        .aff-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid #e6ebf3; position: sticky; bottom: 0; background: #fff; z-index: 3; }
        .aff-field label.lbl { display: block; font-size: 12px; font-weight: 700; color: #4a5b70; margin-bottom: 5px; }
        .aff-field input, .aff-field select { width: 100%; padding: 9px 10px; border: 1px solid #cfd8e6; border-radius: 8px; font-size: 14px; background: #fff; }
        .aff-field input:focus, .aff-field select:focus { outline: none; border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15,118,110,.15); }
        #affectationContainer input[type=date]::-webkit-calendar-picker-indicator { opacity: 0; position: absolute; right: 0; width: 34px; height: 100%; cursor: pointer; }
        .aff-modal-foot .aff-error { flex: 1; text-align: left; font-size: 12px; line-height: 1.5; max-height: 90px; overflow: auto; }
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

    <!-- Onglet « Administration » : îlot Vue (frontend/src/ilots/affectation/administration) -->
    <div id="affectationAdminTab" class="tab-content aff-panel"></div>

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

    // ================= Asana (rubrique « Connexion Asana », fenêtres) : l'administration des déploiements est un
    // îlot Vue (frontend/src/ilots/affectation/administration), prévenu par « gp:deploiements-modifies »
    // Étapes (libellés des activités dans les messages des tâches Asana) : lues à l'ouverture des tâches
    const state = { config: null };

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
    const stageDef = key => (state.config && state.config.stages.find(x => x.key === key)) || { key, label: key };

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

    // ---- Tâches du projet Asana d'un déploiement : consultation des échéances et remplacement de la donnée reprise ----
    const asanaT = { id: null, data: null, ov: {} };
    // Logo Asana : déploiement repris d'Asana (à côté du nom du SAMU) ; origine de chaque donnée dans la fenêtre des tâches
    const asanaLogo = (title, size) =>
        `<img src="/img/asana-logo.png" alt="Asana" title="${esc(title || "Projet repris d'Asana")}" style="width:${size || 14}px;height:${size || 14}px;vertical-align:-2px;margin-left:5px;object-fit:contain;">`;
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
    // Événements du SAMU correspondant à chaque activité (fenêtre des tâches Asana)
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
        evOpenState(k, open) {
            if (open) evOpen.add(k);
            else evOpen.delete(k);
        }
    };

    // Grille et administration des déploiements (îlots Vue) prévenues des modifications faites par Asana
    const notifierPlanning = () => window.dispatchEvent(new CustomEvent('gp:deploiements-modifies'));

    const planApi = {
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
                if (!r.unchanged && (r.updated || r.created)) notifierPlanning();
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
                if (r.updated.length) notifierPlanning();
                showAsanaConflicts(r.conflicts);
            } catch (e) {
                toast(esc(e.message), true);
            } finally {
                btn.classList.remove('aff-busy');
                btn.lastChild.textContent = old;
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
                if (!state.config) state.config = await api('/affectation/config');
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
            // Onglet « Planning des déploiements » : îlot Vue, monté (ou relu) à l'ouverture de l'onglet
            // Onglet « Événements » : îlot Vue (frontend/src/ilots/affectation), monté à l'ouverture de l'onglet
            // Onglet « Administration » : îlot Vue (frontend/src/ilots/affectation/administration), idem
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
    window.AffectationApp = AffectationApp;
    window.showAffectationApp = () => AffectationApp.show();
    window.hideAffectationApp = () => AffectationApp.hide();
    // Script différé (defer) : la page est analysée, le conteneur est créé avant le point d'entrée des îlots Vue (module
    // placé après), qui y trouve l'onglet « Événements » à monter
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
