// Application mobile
// Extrait de mobile.html : script classique, portée globale partagée avec les autres scripts de la page

'use strict';

const ACTIVITIES = {
    1: { label: 'Indisponible', color: '#95a5a6' },
    2: { label: 'En attente', color: '#9b59b6' },
    3: { label: 'SAMU Déploiement', color: '#e67e22' },
    4: { label: 'SAMU Dev. usages', color: '#d35400' },
    5: { label: 'ANS Déploiement', color: '#3498db' },
    6: { label: 'ANS Dev. usages', color: '#2980b9' },
    7: { label: 'Qualification', color: '#e74c3c' },
    8: { label: 'Divers', color: '#16a085' }
};
const ACT_EMOJIS = { 1: '❓', 2: '⏳', 3: '📞', 4: '📞', 5: '🚀', 6: '🖥', 7: '☑️', 8: '📖' }; // mêmes pictogrammes que la légende du planning
const EVT_ICON_PATHS = {
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    briefcase:
        '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
    lifebuoy:
        '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.2 4.2M14.9 14.9l4.2 4.2M14.9 9.1l4.2-4.2M4.9 19.1l4.2-4.2"/>',
    clipboardCheck:
        '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    listChecks: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
    presentation:
        '<path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M12 16v5M8 21h8"/><path d="m7 12 3-3 2 2 4-4"/>'
};
// Icône de chaque modèle d'événement (identique à celle du bureau), choisie d'après le début du libellé
const EVT_TEMPLATES = [
    ['reunion de lancement strategique', 'rocket'],
    ['visite post mes', 'eye'],
    ['verif prerequis', 'listChecks'],
    ['visite metier', 'briefcase'],
    ['visite terrain', 'pin'],
    ['mise en service', 'power'],
    ['accomp', 'lifebuoy'],
    ['visite ob', 'building'],
    ['vft sur site', 'clipboardCheck'],
    ['formation', 'graduation'],
    ['congres', 'presentation']
];
function evtIconSvg(label) {
    const norm = t => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, '').trim();
    const l = norm(label);
    const hit = EVT_TEMPLATES.find(([k]) => l === k || l.startsWith(k + ' ') || l.startsWith(k));
    const p = (hit && EVT_ICON_PATHS[hit[1]]) || EVT_ICON_PATHS.pin;
    return `<svg class="evt-ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}
const esc = t =>
    String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ---- MODE SOMBRE (préférence partagée avec l'application : gp_color_mode) ---- */
const MOON_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
function isDarkMode() {
    return document.documentElement.classList.contains('dark-mode');
}
function refreshColorBtn() {
    const b = document.getElementById('colorModeBtn');
    if (!b) return;
    b.innerHTML = isDarkMode() ? SUN_SVG : MOON_SVG;
    b.title = isDarkMode() ? 'Passer en mode clair' : 'Passer en mode sombre';
}
function toggleColorMode() {
    const dark = !isDarkMode();
    document.documentElement.classList.toggle('dark-mode', dark);
    try {
        localStorage.setItem('gp_color_mode', dark ? 'dark' : 'light');
    } catch (e) {}
    refreshColorBtn();
}

const MONTHS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];
const DAYS_ABR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

let state = {
    user: null,
    resources: [],
    schedule: {},
    events: [],
    selectedResourceId: null,
    view: 'week',
    cursor: new Date(),
    availableViews: []
};

/* ---- DEVICE ---- */
function detectCapabilities() {
    const w = window.innerWidth;
    const views = ['day', 'week', 'month']; // toujours les 3 vues disponibles
    state.availableViews = views;
    // Vue par défaut selon largeur (portrait iPhone ~390px, paysage ~844px)
    state.view = window.innerWidth >= 600 ? 'month' : 'week';
}

// Réévaluer la vue par défaut si orientation change (ne pas écraser la vue en cours)
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        renderToolbar();
    }, 150); // laisser le temps au navigateur de recalculer
});

/* ---- DATE UTILS ---- */
function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseYMD(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function isToday(d) {
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}
function weekMonday(d) {
    const r = new Date(d);
    const dow = r.getDay() === 0 ? 6 : r.getDay() - 1;
    r.setDate(r.getDate() - dow);
    return r;
}
function fmtDateShort(s) {
    if (!s) return '';
    const d = parseYMD(s);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getWeekNum(d) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yr = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return Math.ceil(((dt - yr) / 86400000 + 1) / 7);
}

/* ---- SCHEDULE HELPERS ---- */
function getPlanningCode(resourceId, dateStr, period) {
    // dateStr : "YYYY-MM-DD", period : "AM" | "PM"
    const dateKey = `${dateStr}_${period}`;
    const availKey = `${resourceId}_available_${dateKey}`;
    const actKey = `${resourceId}_activity_${dateKey}`;
    const locKey = `${resourceId}_localisation_${dateKey}`;

    const availValue = state.schedule[availKey] || '1';
    const actValue = state.schedule[actKey] || '1';
    const locValue = state.schedule[locKey] || '-';

    if (availValue === '3') {
        return { code: 'conge', label: '🏖️ Congés', color: '#bdc3c7', loc: '-' };
    }

    const labels = {
        1: '❓ Indisponible',
        2: '⏳ En attente',
        3: '📞 SAMU Déploiement',
        4: '📞 SAMU Dev. usages',
        5: '🚀 ANS Déploiement',
        6: '🖥 ANS Dev. usages',
        7: '☑️ Qualification',
        8: '📖 Divers'
    };
    const colors = {
        1: '#95a5a6',
        2: '#9b59b6',
        3: '#e67e22',
        4: '#d35400',
        5: '#3498db',
        6: '#2980b9',
        7: '#e74c3c',
        8: '#16a085'
    };

    return { code: actValue, label: labels[actValue] || '?', color: colors[actValue] || '#7f8c8d', loc: locValue };
}
// Alias utilisés dans les vues
function getAct(rid, ds, period) {
    const r = getPlanningCode(rid, ds, period);
    return r && r.code !== 'conge' ? r.code : null;
}
function isConge(rid, ds) {
    // Vérifier AM ou PM — congé si l'un ou l'autre est marqué
    const rAM = state.schedule[`${rid}_available_${ds}_AM`];
    const rPM = state.schedule[`${rid}_available_${ds}_PM`];
    return rAM === '3' || rPM === '3';
}

/* ---- USER HEADER ---- */
function updateUserHeader(user) {
    if (!user) return;
    const initials = ((user.prenom || '')[0] || '').toUpperCase() + ((user.nom || '')[0] || '').toUpperCase();
    document.getElementById('userInitials').textContent = initials || '?';
    document.getElementById('userNameEl').textContent = `${user.nom || ''} ${user.prenom || ''}`.trim();
    const roleMap = { admin: 'Administrateur', expert: 'Expert Métier', consumer: 'Utilisateur' };
    document.getElementById('userRoleBadge').textContent = roleMap[user.activeProfile] || user.activeProfile || '';
}

/* ---- DOM HELPER ---- */
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
}

/* ---- FETCH ---- */
async function api(path, opts = {}) {
    return fetch(path, { credentials: 'include', ...opts });
}

/* ---- MFA STATE ---- */
let _mfa = { pendingUserId: null, pendingProfile: null, method: null };

function showMfaStep(data) {
    _mfa.pendingUserId = data.pendingUserId;
    _mfa.pendingProfile = data.pendingProfile;
    _mfa.method = data.mfaMethod;

    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('mfaForm').classList.remove('hidden');
    document.getElementById('mfaError').textContent = '';

    const instrEl = document.getElementById('mfaInstructions');
    const choiceEl = document.getElementById('mfaMethodChoice');
    const sendEl = document.getElementById('mfaSendEmailBlock');
    const codeEl = document.getElementById('mfaCodeBlock');

    choiceEl.style.display = 'none';
    sendEl.style.display = 'none';
    codeEl.style.display = 'none';

    if (data.mfaMethod === 'choice') {
        instrEl.textContent = 'Choisissez votre méthode de vérification :';
        choiceEl.style.display = 'flex';
        choiceEl.style.flexDirection = 'column';
    } else if (data.mfaMethod === 'email') {
        instrEl.textContent = 'Un code de vérification va être envoyé à votre adresse email.';
        sendEl.style.display = 'block';
    } else if (data.mfaMethod === 'totp') {
        instrEl.textContent = 'Saisissez le code à 6 chiffres affiché dans votre application Authenticator.';
        codeEl.style.display = 'block';
        document.getElementById('mfaCodeInput').focus();
    }
}

function mfaSelectMethod(method) {
    _mfa.method = method;
    const instrEl = document.getElementById('mfaInstructions');
    document.getElementById('mfaMethodChoice').style.display = 'none';
    document.getElementById('mfaError').textContent = '';

    if (method === 'email') {
        instrEl.textContent = 'Un code de vérification va être envoyé à votre adresse email.';
        document.getElementById('mfaSendEmailBlock').style.display = 'block';
    } else {
        instrEl.textContent = 'Saisissez le code à 6 chiffres affiché dans votre application Authenticator.';
        document.getElementById('mfaCodeBlock').style.display = 'block';
        document.getElementById('mfaCodeInput').focus();
    }
}

async function mfaSendEmail() {
    const btn = document.getElementById('mfaSendBtn');
    const btnLbl = btn.querySelector('span');
    btn.disabled = true;
    btnLbl.textContent = 'Envoi en cours…';
    document.getElementById('mfaError').textContent = '';
    try {
        const r = await api('/api/mfa/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: _mfa.pendingUserId })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur envoi');
        document.getElementById('mfaSendEmailBlock').style.display = 'none';
        document.getElementById('mfaCodeBlock').style.display = 'block';
        document.getElementById('mfaInstructions').textContent =
            'Code envoyé ! Saisissez-le ci-dessous (valable 10 minutes).';
        document.getElementById('mfaCodeInput').focus();
    } catch (e) {
        document.getElementById('mfaError').textContent = e.message;
    } finally {
        btn.disabled = false;
        btnLbl.textContent = 'Envoyer le code par email';
    }
}

async function mfaVerify() {
    const code = document.getElementById('mfaCodeInput').value.trim();
    const errEl = document.getElementById('mfaError');
    errEl.textContent = '';
    if (!code) {
        errEl.textContent = 'Veuillez saisir le code.';
        return;
    }
    const vbtn = document.getElementById('mfaVerifyBtn');
    vbtn.classList.add('lp-busy');
    vbtn.disabled = true;
    try {
        const r = await api('/api/mfa/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: _mfa.pendingUserId, code, profile: _mfa.pendingProfile })
        });
        const data = await r.json();
        if (!r.ok) {
            errEl.textContent = data.error || 'Code invalide';
            return;
        }
        // Login complet
        if (data.success && data.user) {
            sessionStorage.setItem('ans_mob_user', JSON.stringify(data.user));
            state.user = data.user;
            state.selectedResourceId = data.user.resourceId || null;
            const ok = await loadData();
            if (ok) showPlanning();
        }
    } catch (e) {
        errEl.textContent = 'Erreur réseau. Réessayez.';
    } finally {
        vbtn.classList.remove('lp-busy');
        vbtn.disabled = false;
    }
}

function mfaBack() {
    _mfa = { pendingUserId: null, pendingProfile: null, method: null };
    document.getElementById('mfaForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('mfaCodeInput').value = '';
    document.getElementById('mfaError').textContent = '';
    document.getElementById('loginError').textContent = '';
}
async function doLogin(username, password) {
    try {
        const r = await api('/api/mobile-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await r.json();
        if (r.status === 401) return { error: 'Identifiants invalides.' };
        if (r.status === 403) return { error: 'Aucun profil valide pour ce compte.' };
        if (r.ok && data.mfaRequired) return data;
        if (r.ok && data.success && data.user) {
            sessionStorage.setItem('ans_mob_user', JSON.stringify(data.user));
            return data.user;
        }
        return { error: data.error || 'Erreur de connexion.' };
    } catch (e) {
        console.error('[LOGIN] Erreur réseau:', e);
        return { error: 'Erreur réseau.' };
    }
}

async function doLogout() {
    sessionStorage.removeItem('ans_mob_user');
    await api('/api/logout', { method: 'POST' });
    location.reload();
}

/* ---- DATA ---- */
async function loadData() {
    showLoading('Chargement…');

    // 1. Charger resources et schedule en parallèle
    const [rR, sR] = await Promise.all([api('/api/resources'), api('/api/schedule')]);
    if (rR.status === 401 || sR.status === 401) {
        sessionStorage.removeItem('ans_mob_user');
        showLogin();
        return false;
    }
    state.resources = (await rR.json()).filter(r => r.actif);
    console.log(
        '[DEBUG] resources chargées:',
        state.resources.map(r => `id=${r.id} ${r.prenom} ${r.nom}`)
    );
    console.log('[DEBUG] selectedResourceId avant résolution:', state.selectedResourceId);
    state.schedule = await sR.json();

    // 2. Résoudre le resourceId maintenant qu'on a la liste des ressources
    if (!state.selectedResourceId && state.resources.length) {
        state.selectedResourceId = state.resources[0].id;
    }

    // 3. Charger les événements avec le bon resourceId
    await reloadEventsForResource(state.selectedResourceId);
    console.log('[EVENTS] state.events après chargement:', state.events.length, state.events.slice(0, 3));
    return true;
}

async function reloadEventsForResource(resourceId) {
    try {
        const r = await api('/api/mobile-events');
        const ev = r.ok ? await r.json() : { events: [] };
        state.events = ev.events || [];
        console.log('[EVENTS] Nombre événements chargés:', state.events.length);
    } catch (e) {
        console.error('[EVENTS] Erreur:', e);
        state.events = [];
    }
}

/* ---- SCREENS ---- */
function hideAll() {
    ['loadingScreen', 'loginScreen', 'accessDeniedScreen', 'planningScreen'].forEach(id =>
        document.getElementById(id).classList.add('hidden')
    );
    document.getElementById('header').classList.add('hidden');
    document.getElementById('toolbar').classList.add('hidden');
}
function showLoading(txt) {
    hideAll();
    document.getElementById('loadingText').textContent = txt || 'Chargement…';
    document.getElementById('loadingScreen').classList.remove('hidden');
}
function showLogin() {
    hideAll();
    document.getElementById('loginScreen').classList.remove('hidden');
}
function showAccessDenied() {
    hideAll();
    document.getElementById('accessDeniedScreen').classList.remove('hidden');
    document.getElementById('header').classList.remove('hidden');
    updateUserHeader(state.user);
}
function showPlanning() {
    hideAll();
    document.getElementById('header').classList.remove('hidden');
    document.getElementById('toolbar').classList.remove('hidden');
    document.getElementById('planningScreen').classList.remove('hidden');
    updateUserHeader(state.user);
    buildExpertSelect();
    renderToolbar();
    renderView();
}

/* ---- TOOLBAR ---- */
function renderToolbar() {
    const tabs = document.getElementById('viewTabs');
    tabs.innerHTML = '';
    const LABELS = { day: 'Jour', week: 'Semaine', month: 'Mois' };
    state.availableViews.forEach(v => {
        const btn = el('button', 'view-tab' + (v === state.view ? ' active' : ''), LABELS[v]);
        btn.onclick = () => {
            state.view = v;
            renderToolbar();
            renderView();
        };
        tabs.appendChild(btn);
    });
    document.getElementById('periodLabel').textContent = getPeriodLabel();
}

function getPeriodLabel() {
    const c = state.cursor;
    if (state.view === 'day')
        return (
            c.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) +
            ` (Sem ${getWeekNum(c)})`
        );
    if (state.view === 'week') {
        const mon = weekMonday(c),
            fri = addDays(mon, 4);
        return `Sem ${getWeekNum(mon)} — ${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0, 3)} › ${fri.getDate()} ${MONTHS[fri.getMonth()].slice(0, 3)}`;
    }
    return `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
}

function buildExpertSelect() {
    const row = document.getElementById('expertRow');
    row.classList.remove('hidden');
    const sel = document.getElementById('expertSelect');
    sel.innerHTML = '';
    state.resources.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.prenom} ${r.nom}`;
        if (r.id === state.selectedResourceId) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = () => {
        state.selectedResourceId = Number(sel.value);
        renderView();
    };
}

/* ---- NAVIGATION ---- */
function navigate(dir) {
    if (state.view === 'day') state.cursor = addDays(state.cursor, dir);
    else if (state.view === 'week') state.cursor = addDays(state.cursor, dir * 7);
    else state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + dir, 1);
    renderToolbar();
    renderView();
}

/* ---- RENDER ---- */
function renderView() {
    const c = document.getElementById('planningScreen');
    c.innerHTML = '';
    const rid = state.selectedResourceId;
    if (!rid) {
        c.appendChild(el('div', 'no-data', 'Aucun expert sélectionné'));
        return;
    }
    // [DEBUG] — à supprimer une fois validé
    const currentDateStr = toYMD(state.cursor);
    const testKey = `${rid}_activity_${currentDateStr}_AM`;
    console.log('[DEBUG] clé testée:', testKey);
    console.log('[DEBUG] valeur trouvée:', state.schedule[testKey]);
    console.log('[DEBUG] 5 premières clés scheduleData:', Object.keys(state.schedule).slice(0, 5));
    // [/DEBUG]
    if (state.view === 'day') renderDay(c, rid);
    else if (state.view === 'week') renderWeek(c, rid);
    else renderMonth(c, rid);
}

/* ---- VUE JOUR ---- */
function renderDay(container, rid) {
    const d = state.cursor,
        ds = toYMD(d),
        cg = isConge(rid, ds);

    const title = el('div', 'day-title');
    title.textContent = d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    container.appendChild(title);

    if (cg) {
        const cb = el('div', 'conge-banner', '🏖️ Journée de congé');
        container.appendChild(cb);
    }

    const row = el('div', 'day-periods');
    ['AM', 'PM'].forEach(period => {
        const code = getAct(rid, ds, period),
            act = ACTIVITIES[code];
        const card = el('div', 'period-card');
        card.appendChild(el('div', 'period-label-tag', period === 'AM' ? '☀️ Matin' : '🌙 Après-midi'));
        const badge = el('div', 'act-badge' + (act ? '' : ' empty'));
        if (act) {
            badge.style.background = act.color;
            badge.textContent = (ACT_EMOJIS[code] || '') + ' ' + act.label;
        } else if (cg) {
            badge.style.background = '#bdc3c7';
            badge.style.color = '#fff';
            badge.textContent = '🏖️ Congé';
        } else {
            badge.textContent = '— Libre —';
        }
        card.appendChild(badge);
        row.appendChild(card);
    });
    container.appendChild(row);

    const dayEvts = getDayEvents(ds);
    if (dayEvts.length) appendEventsSection(container, dayEvts, 'Événements du jour');
}

/* ---- VUE SEMAINE ---- */
function renderWeek(container, rid) {
    const mon = weekMonday(state.cursor);
    const days = Array.from({ length: 5 }, (_, i) => addDays(mon, i));

    const grid = el('div', 'week-grid');

    // En-têtes colonnes
    days.forEach(d => {
        const h = el('div', 'week-col-header' + (isToday(d) ? ' today' : ''));
        h.appendChild(el('div', 'wday', DAYS_ABR[d.getDay() - 1]));
        h.appendChild(el('div', 'wnum', String(d.getDate())));
        grid.appendChild(h);
    });

    // Lignes AM puis PM
    ['AM', 'PM'].forEach((period, pi) => {
        const lbl = el('div', 'week-period-lbl', period === 'AM' ? '☀️ Matin' : '🌙 Après-midi');
        grid.appendChild(lbl);

        if (pi === 1) {
            grid.appendChild(el('div', 'week-section-gap'));
        }

        days.forEach(d => {
            const ds = toYMD(d);
            const code = getAct(rid, ds, period),
                act = ACTIVITIES[code],
                cg = isConge(rid, ds);
            const cell = el('div', 'week-cell');

            if (act) {
                const dot = el('div', 'week-dot');
                dot.style.background = act.color;
                cell.appendChild(dot);
                const lbl2 = el('div', 'week-cell-lbl', act.label);
                cell.appendChild(lbl2);
            } else if (cg) {
                const dot = el('div', 'week-dot');
                dot.style.background = '#bdc3c7';
                cell.appendChild(dot);
                cell.appendChild(el('div', 'week-cell-lbl', 'Congé'));
            } else {
                cell.appendChild(el('div', 'week-empty-dot'));
            }

            cell.onclick = () => showDrawer(rid, ds, period);
            grid.appendChild(cell);
        });
    });

    container.appendChild(grid);

    // Événements semaine
    const minDs = toYMD(mon),
        maxDs = toYMD(addDays(mon, 4));
    const wEvts = state.events.filter(e => e.end_date >= minDs && e.start_date <= maxDs);
    if (wEvts.length) appendEventsSection(container, wEvts, 'Événements de la semaine');
}

/* ---- VUE MOIS ---- */
function renderMonth(container, rid) {
    const y = state.cursor.getFullYear(),
        m = state.cursor.getMonth();
    const lastDay = new Date(y, m + 1, 0);
    const startDow = new Date(y, m, 1).getDay() === 0 ? 6 : new Date(y, m, 1).getDay() - 1;

    const title = el('div', 'month-title');
    title.textContent = `${MONTHS[m]} ${y}`;
    container.appendChild(title);

    const grid = el('div', 'month-grid');
    grid.appendChild(el('div', 'month-hdr-cell month-week-hdr', ''));
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(h => {
        const c = el('div', 'month-hdr-cell', h);
        grid.appendChild(c);
    });

    const totalCells = startDow + lastDay.getDate();
    const numRows = Math.ceil(totalCells / 7);

    for (let row = 0; row < numRows; row++) {
        // Cellule numéro de semaine (ISO 8601, calculée sur la date réelle du début de ligne)
        const rowFirstDate = new Date(y, m, 1 - startDow + row * 7);
        const wn = getWeekNum(rowFirstDate);
        grid.appendChild(el('div', 'month-week-num', String(wn)));

        for (let col = 0; col < 7; col++) {
            const idx = row * 7 + col;
            const day = idx - startDow + 1;
            if (day < 1 || day > lastDay.getDate()) {
                grid.appendChild(el('div', 'month-cell empty'));
                continue;
            }
            const d = new Date(y, m, day),
                ds = toYMD(d);
            const cg = isConge(rid, ds),
                actAM = getAct(rid, ds, 'AM'),
                actPM = getAct(rid, ds, 'PM');
            const cell = el('div', 'month-cell' + (isToday(d) ? ' today' : '') + (cg ? ' conge' : ''));

            const num = el('div', 'month-day-num', String(day));
            cell.appendChild(num);

            const dots = el('div', 'month-dots-row');
            if (actAM) {
                const dot = el('div', 'mdot');
                dot.style.background = ACTIVITIES[actAM].color;
                dots.appendChild(dot);
            }
            if (actPM) {
                const dot = el('div', 'mdot');
                dot.style.background = ACTIVITIES[actPM].color;
                dots.appendChild(dot);
            }
            if (cg && !actAM && !actPM) {
                const dot = el('div', 'mdot');
                dot.style.background = '#bdc3c7';
                dots.appendChild(dot);
            }
            cell.appendChild(dots);

            cell.onclick = () => {
                state.cursor = d;
                state.view = 'day';
                renderToolbar();
                renderView();
            };
            grid.appendChild(cell);
        }
    }

    container.appendChild(grid);

    // Événements du mois
    const minDs = `${y}-${String(m + 1).padStart(2, '0')}-01`,
        maxDs = toYMD(lastDay);
    const mEvts = state.events.filter(e => e.end_date >= minDs && e.start_date <= maxDs);
    if (mEvts.length) appendEventsSection(container, mEvts, 'Événements du mois');
}

/* ---- DRAWER ---- */
function showDrawer(rid, ds, period) {
    const code = getAct(rid, ds, period),
        act = ACTIVITIES[code],
        cg = isConge(rid, ds);
    const d = parseYMD(ds);
    document.getElementById('drawerTitle').textContent =
        d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) +
        ' — ' +
        (period === 'AM' ? 'Matin' : 'Après-midi');

    const body = document.getElementById('drawerBody');
    body.innerHTML = '';

    if (act) {
        const badge = el('div', 'act-badge');
        badge.style.background = act.color;
        badge.style.marginBottom = '12px';
        badge.textContent = (ACT_EMOJIS[code] || '') + ' ' + act.label;
        body.appendChild(badge);
    } else if (cg) {
        body.appendChild(el('div', 'conge-banner', '🏖️ Journée de congé'));
    } else {
        body.appendChild(el('div', 'no-data', 'Aucune activité planifiée'));
    }

    getDayEvents(ds).forEach(evt => {
        const card = document.createElement('div');
        card.style.cssText =
            'border-left:3px solid #1D70B7;padding:8px 10px;border-radius:0 6px 6px 0;background:#f5f5f5;margin-bottom:6px;';
        card.innerHTML = `<div style="font-weight:bold;font-size:13px;color:#2c3e50;">${evtIconSvg(evt.label)}${esc(evt.label)}</div>
      ${evt.location_libelle_court ? `<div style="font-size:11px;color:#1D70B7;font-weight:bold;margin-top:2px;">📍 ${evt.location_libelle_court}</div>` : ''}`;
        body.appendChild(card);
    });

    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerOverlay').classList.add('visible');
}

function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('visible');
}

/* ---- EVENTS ---- */
function getDayEvents(ds) {
    const result = state.events.filter(e => e.start_date <= ds && e.end_date >= ds);
    console.log('[EVENTS] getDayEvents pour', ds, '→', result.length, 'événements sur', state.events.length, 'total');
    return result;
}

function appendEventsSection(container, events, title) {
    if (!events || !events.length) return;
    const sec = el('div', 'events-section');
    sec.appendChild(el('div', 'events-title', title));
    events.forEach(evt => sec.appendChild(buildEventCard(evt)));
    container.appendChild(sec);
}

function buildEventCard(evt) {
    const card = el('div', 'event-card');
    {
        const typed = !!(evt.type_long && !evt.type_other),
            shown = typed ? evt.type_short || evt.type_long : evt.label;
        const ico =
            typed && evt.type_code && EVT_ICON_PATHS[evt.type_code]
                ? `<svg class="evt-ico" viewBox="0 0 24 24" aria-hidden="true">${EVT_ICON_PATHS[evt.type_code]}</svg>`
                : evtIconSvg(evt.label);
        const lbl = el('div', 'event-label');
        lbl.innerHTML =
            ico +
            esc(shown) +
            (typed && evt.label && evt.label !== shown
                ? ` <span style="font-weight:normal;font-size:12px;color:#7f8c8d;">— ${esc(evt.label)}</span>`
                : '');
        card.appendChild(lbl);
    }
    let ds = fmtDateShort(evt.start_date);
    if (evt.end_date && evt.end_date !== evt.start_date) ds += ' → ' + fmtDateShort(evt.end_date);
    if (evt.period && evt.period !== 'FULL') ds += ' (' + (evt.period === 'AM' ? 'Matin' : 'Après-midi') + ')';
    card.appendChild(el('div', 'event-dates', ds));
    if (evt.location_libelle_court) card.appendChild(el('div', 'event-loc', '📍 ' + evt.location_libelle_court));
    if (evt.participants && evt.participants.length) {
        const row = el('div', 'event-participants');
        evt.participants.slice(0, 8).forEach(p => {
            const av = el('div', 'p-avatar');
            av.title = `${p.prenom} ${p.nom}`;
            av.textContent = ((p.prenom || '')[0] || '').toUpperCase() + ((p.nom || '')[0] || '').toUpperCase();
            row.appendChild(av);
        });
        if (evt.participants.length > 8) {
            const more = el('div', 'p-avatar');
            more.style.background = '#6F6F6E';
            more.textContent = `+${evt.participants.length - 8}`;
            row.appendChild(more);
        }
        card.appendChild(row);
    }
    return card;
}

/* ---- INIT ---- */
async function init() {
    detectCapabilities();
    showLoading('Vérification de la session…');

    let user = null;
    try {
        user = JSON.parse(sessionStorage.getItem('ans_mob_user') || 'null');
    } catch (e) {}

    if (!user) {
        const test = await api('/api/resources');
        if (test.status === 401) {
            showLogin();
            return;
        }
        showLogin();
        return;
    }

    state.user = user;
    state.selectedResourceId = user.resourceId || null;

    const ok = await loadData();
    if (!ok) return;
    showPlanning();
}

/* ---- BINDINGS ---- */
document.getElementById('logoutBtn').onclick = doLogout;
document.getElementById('prevBtn').onclick = () => navigate(-1);
document.getElementById('nextBtn').onclick = () => navigate(1);
document.getElementById('drawerOverlay').onclick = closeDrawer;

document.getElementById('loginBtn').onclick = async () => {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    if (!username || !password) {
        errEl.textContent = 'Identifiants requis.';
        return;
    }
    const btn = document.getElementById('loginBtn');
    if (btn.classList.contains('lp-busy')) return; // évite un double envoi
    btn.classList.add('lp-busy');
    btn.disabled = true;
    let result;
    try {
        result = await doLogin(username, password);
    } finally {
        btn.classList.remove('lp-busy');
        btn.disabled = false;
    }
    if (!result) {
        errEl.textContent = 'Erreur de connexion.';
        return;
    }
    if (result.error) {
        errEl.textContent = result.error;
        return;
    }
    if (result.mfaRequired) {
        showMfaStep(result);
        return;
    }
    // Login direct réussi : l'animation reste affichée le temps du chargement des données
    btn.classList.add('lp-busy');
    btn.disabled = true;
    try {
        state.user = result;
        state.selectedResourceId = result.resourceId || null;
        const ok = await loadData();
        if (!ok) return;
        showPlanning();
    } finally {
        btn.classList.remove('lp-busy');
        btn.disabled = false;
    }
};

// Afficher / masquer le mot de passe
document.getElementById('loginEye').onclick = function () {
    const i = document.getElementById('loginPass');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    this.classList.toggle('on', show);
};
document.getElementById('colorModeBtn').onclick = toggleColorMode;
refreshColorBtn();
// Version de la plateforme affichée sur la mire de connexion
fetch('/api/version', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => {
        if (d && d.version) document.getElementById('appVersion').textContent = d.version;
    })
    .catch(() => {});

document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('mfaCodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') mfaVerify();
});

/* ---- CARTE « AUTOUR DE MOI » : lieux (TripAdVisor) à proximité du téléphone ---- */
const NEAR = { sas: [], acc: 0, map: null, layer: null, me: null, pos: null, pois: null, ring: null };
const NEAR_CATS = {
    hebergement: {
        label: 'Hébergement',
        color: '#6a1b9a',
        svg: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>'
    },
    restaurant: {
        label: 'Restaurant',
        color: '#e65100',
        svg: '<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7M6 7h4M17 21V3c-2 1-3.5 4-3.5 8h3.5"/>'
    },
    bar: { label: 'Bar', color: '#1565c0', svg: '<path d="M5 4h14l-7 8zM12 12v8M8 20h8"/>' }
};
const nEsc = t =>
    String(t == null ? '' : t).replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
function nearKm(a, b, c, d) {
    const r = Math.PI / 180,
        x = (c - a) * r,
        y = (d - b) * r,
        h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}
function nearLoadLeaflet() {
    return new Promise((ok, ko) => {
        if (window.L) return ok();
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = () => ok();
        s.onerror = () => ko(new Error('Carte indisponible'));
        document.head.appendChild(s);
    });
}
async function openNear() {
    document.getElementById('nearScreen').classList.remove('hidden');
    const info = document.getElementById('nearInfo');
    try {
        await nearLoadLeaflet();
    } catch (e) {
        info.textContent = 'Carte indisponible (réseau).';
        return;
    }
    if (!NEAR.map) {
        NEAR.map = L.map('nearMap', { zoomControl: false }).fitBounds([
            [41.2, -5.3],
            [51.2, 9.7]
        ]);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(NEAR.map);
        NEAR.layer = L.layerGroup().addTo(NEAR.map);
    }
    setTimeout(() => NEAR.map.invalidateSize(), 50);
    {
        // lieux rechargés à chaque ouverture (un lieu créé depuis peu doit apparaître)
        try {
            const r = await api('/api/poi');
            if (!r.ok) throw 0;
            NEAR.pois = (await r.json()).pois.filter(p => p.latitude != null && p.longitude != null);
            try {
                const m = await api('/api/poi/meta');
                NEAR.sas = m.ok
                    ? (await m.json()).locations.filter(l => l.latitude != null && l.longitude != null)
                    : [];
            } catch (e) {
                NEAR.sas = [];
            }
        } catch (e) {
            info.textContent = 'Impossible de charger les lieux.';
            return;
        }
    }
    nearRender();
    nearLocate();
}
function nearLocate() {
    const info = document.getElementById('nearInfo');
    if (!navigator.geolocation) {
        info.textContent = 'Géolocalisation non disponible : carte de France.';
        return nearRender();
    }
    info.textContent = "Localisation en cours… (autorisez l'accès à la position)";
    navigator.geolocation.getCurrentPosition(
        pos => {
            NEAR.pos = [pos.coords.latitude, pos.coords.longitude];
            NEAR.acc = pos.coords.accuracy;
            nearRender();
        },
        err => {
            NEAR.pos = null;
            nearRender();
            info.textContent =
                (err && err.code === 1
                    ? 'Position refusée — autorisez la localisation dans les réglages du navigateur. '
                    : 'Position introuvable. ') + document.getElementById('nearInfo').textContent;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
}
function nearRender() {
    if (!NEAR.map || !NEAR.pois) return;
    const FR = [
        [41.2, -5.3],
        [51.2, 9.7]
    ];
    const rad = Number(document.getElementById('nearRadius').value),
        info = document.getElementById('nearInfo');
    NEAR.layer.clearLayers();
    const dist = (la, lo) => (NEAR.pos ? nearKm(NEAR.pos[0], NEAR.pos[1], la, lo) : null);
    const all = NEAR.pois.map(p => ({ p, d: dist(p.latitude, p.longitude) })),
        sas = (NEAR.sas || []).map(l => ({ l, d: dist(l.latitude, l.longitude) }));
    const inRad = x => !NEAR.pos || rad === 0 || x.d <= rad;
    const list = all.filter(inRad).sort((a, b) => (a.d || 0) - (b.d || 0));
    // SAMU-SAS : toujours visibles, en grand, avec leur nom
    sas.forEach(({ l, d }) => {
        const ico = L.divIcon({
            className: '',
            html: `<div class="near-sas">SAMU-SAS ${nEsc(l.libelle_court)}${l.n_poi ? ` <span>${l.n_poi}</span>` : ''}</div>`,
            iconSize: [0, 0]
        });
        L.marker([l.latitude, l.longitude], { icon: ico, zIndexOffset: 500 })
            .addTo(NEAR.layer)
            .bindPopup(
                `<div class="near-pop"><b>SAMU-SAS ${nEsc(l.libelle_court)}</b><br>${nEsc(l.libelle_long || '')}<br>${nEsc(l.adresse || '')}${d != null ? '<br>' + d.toFixed(1) + ' km' : ''}<br>${l.n_poi} lieu${l.n_poi > 1 ? 'x' : ''} renseigné${l.n_poi > 1 ? 's' : ''}</div>`
            );
    });
    // lieux : tous affichés (le périmètre sert au cadrage et au décompte)
    all.forEach(({ p, d }) => {
        const c = NEAR_CATS[p.category] || NEAR_CATS.hebergement;
        const ico = L.divIcon({
            className: '',
            html: `<div class="near-pin" style="background:${c.color}"><svg viewBox="0 0 24 24">${c.svg}</svg></div><div class="near-lbl">${nEsc(p.name)}</div>`,
            iconSize: [46, 46],
            iconAnchor: [23, 23],
            popupAnchor: [0, -26]
        });
        const stars = p.avg_rating == null ? 'Pas encore noté' : `★ ${p.avg_rating}/5 (${p.n_ratings})`;
        L.marker([p.latitude, p.longitude], { icon: ico, zIndexOffset: 1000 })
            .addTo(NEAR.layer)
            .bindPopup(
                `<div class="near-pop"><b>${nEsc(p.name)}</b><br>${nEsc(c.label)} · SAMU-SAS ${nEsc(p.loc_court)}<br>${nEsc(p.address)}<br>${stars}${d != null ? ' · ' + d.toFixed(1) + ' km' : ''}` +
                    `${p.comment ? '<br><i>' + nEsc(p.comment) + '</i>' : ''}<br><small>par ${nEsc(p.creator)}</small><br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}" target="_blank" rel="noopener">Itinéraire</a></div>`
            );
    });
    if (NEAR.me) {
        NEAR.map.removeLayer(NEAR.me);
        NEAR.me = null;
    }
    if (NEAR.ring) {
        NEAR.map.removeLayer(NEAR.ring);
        NEAR.ring = null;
    }
    let bounds = null,
        txt;
    if (NEAR.pos) {
        NEAR.me = L.marker(NEAR.pos, {
            icon: L.divIcon({
                className: '',
                html: '<div class="near-me"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            }),
            zIndexOffset: -500
        }).addTo(NEAR.map);
        if (rad > 0)
            NEAR.ring = L.circle(NEAR.pos, {
                radius: rad * 1000,
                color: '#1D70B7',
                weight: 1,
                fillOpacity: 0.05
            }).addTo(NEAR.map);
        const pts = [NEAR.pos];
        const shown = [
            ...list.map(x => [x.p.latitude, x.p.longitude]),
            ...sas.filter(inRad).map(x => [x.l.latitude, x.l.longitude])
        ];
        if (shown.length) pts.push(...shown);
        else {
            // rien dans le périmètre : on cadre sur la position et l'élément le plus proche
            const near = [
                ...all.map(x => ({ d: x.d, ll: [x.p.latitude, x.p.longitude] })),
                ...sas.map(x => ({ d: x.d, ll: [x.l.latitude, x.l.longitude] }))
            ].sort((a, b) => a.d - b.d)[0];
            if (near) pts.push(near.ll);
        }
        bounds = L.latLngBounds(pts);
        const nearest = all.map(x => x.d).sort((a, b) => a - b)[0];
        txt =
            `${list.length} lieu${list.length > 1 ? 'x' : ''} ${rad > 0 ? 'dans un rayon de ' + rad + ' km' : 'en France'}` +
            (list.length
                ? ` — le plus proche à ${list[0].d.toFixed(1)} km`
                : nearest != null
                  ? ` — le plus proche est à ${nearest.toFixed(0)} km (affiché sur la carte)`
                  : '') +
            (NEAR.acc > 2000 ? ` · position approximative ±${Math.round(NEAR.acc / 1000)} km` : '');
    } else {
        txt = `${all.length} lieu${all.length > 1 ? 'x' : ''} en France (position inconnue).`;
    }
    info.textContent = txt;
    NEAR.map.invalidateSize();
    if (bounds) NEAR.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    else NEAR.map.fitBounds(FR);
}
document.getElementById('nearBtn').onclick = openNear;
document.getElementById('nearClose').onclick = () => document.getElementById('nearScreen').classList.add('hidden');
document.getElementById('nearLocate').onclick = nearLocate;
document.getElementById('nearRadius').onchange = () => nearRender();

init();
