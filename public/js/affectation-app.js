// Application « Aide à l'affectation opérationnelle » — onglets : Planning des déploiements, Administration
(function () {
    'use strict';

    const KEY = 'affectation';
    const ICON = {
        planning:
            '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h5M11 18h5"/>',
        admin: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
        rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'
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

    // Asana, administration, planning et événements : îlots Vue (frontend/src/ilots/affectation)
    const esc = t =>
        String(t == null ? '' : t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

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
    window.AffectationApp = AffectationApp;
    window.showAffectationApp = () => AffectationApp.show();
    window.hideAffectationApp = () => AffectationApp.hide();
    // Script différé (defer) : la page est analysée, le conteneur est créé avant le point d'entrée des îlots Vue (module
    // placé après), qui y trouve l'onglet « Événements » à monter
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
