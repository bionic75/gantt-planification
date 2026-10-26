// Application principale : tab-access
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ---- Accès aux onglets par profil (paramétré dans Administration > Accès aux onglets) ----
const TabAccess = {
    TABS: [
        ['resources', 'Ressources'],
        ['evenements', 'Événements'],
        ['planning', 'Planification'],
        ['cra', 'CRA'],
        ['reporting', 'Reporting'],
        ['admin', 'Administration'],
        ['astreintesGestion', 'Astreintes'],
        ['tripadvisor', 'SAMU-SAS TripAdVisor']
    ],
    PROFILES: [
        ['admin', 'Administrateur'],
        ['user', 'Utilisateur'],
        ['rh', 'RH'],
        ['expert', 'Expert métier']
    ],
    // Valeurs par défaut identiques au comportement historique (utilisées si le serveur ne répond pas)
    DEFAULTS: {
        admin: {
            resources: true,
            evenements: true,
            planning: true,
            cra: true,
            reporting: true,
            admin: true,
            astreintesGestion: true,
            tripadvisor: true
        },
        user: {
            resources: false,
            evenements: true,
            planning: true,
            cra: false,
            reporting: false,
            admin: false,
            astreintesGestion: true,
            tripadvisor: true
        },
        rh: {
            resources: true,
            evenements: false,
            planning: false,
            cra: true,
            reporting: false,
            admin: false,
            astreintesGestion: true,
            tripadvisor: true
        },
        expert: {
            resources: false,
            evenements: true,
            planning: true,
            cra: true,
            reporting: false,
            admin: false,
            astreintesGestion: true,
            tripadvisor: true
        }
    },
    cfg: null,
    async load() {
        try {
            const r = await fetch(`${API_URL}/tab-access`, { credentials: 'include' });
            if (r.ok) {
                const d = await r.json();
                TabAccess.cfg = d.config;
                TabAccess.serverDefaults = d.defaults;
            }
        } catch (e) {
            /* valeurs par défaut */
        }
    },
    can(profile, tab) {
        const c = TabAccess.cfg || TabAccess.DEFAULTS;
        return !!(c[profile] || TabAccess.DEFAULTS.user || {})[tab];
    },
    available(profile) {
        return TabAccess.TABS.map(t => t[0]).filter(k => TabAccess.can(profile, k));
    },
    // L'onglet CRA reste réservé aux experts volontaires aux astreintes (attribut de l'utilisateur)
    showCra(u) {
        if (!u || !TabAccess.can(u.activeProfile, 'cra')) return false;
        return u.activeProfile !== 'expert' || !!(u.astreinte_volontaire || u.is_admin || u.is_rh);
    },
    // --- écran d'administration ---
    async adminLoad() {
        await TabAccess.load();
        TabAccess.adminRender(TabAccess.cfg || TabAccess.DEFAULTS);
    },
    adminRender(cfg) {
        const head = TabAccess.PROFILES.map(p => `<th style="padding:6px 10px;text-align:center;">${p[1]}</th>`).join(
            ''
        );
        const rows = TabAccess.TABS.map(
            t =>
                `<tr><td style="padding:6px 10px;font-weight:600;">${t[1]}</td>${TabAccess.PROFILES.map(p => {
                    const locked = p[0] === 'admin' && t[0] === 'admin';
                    const on = locked || !!(cfg[p[0]] || {})[t[0]];
                    return `<td style="text-align:center;padding:6px 10px;"><input type="checkbox" data-ta="${p[0]}|${t[0]}" ${on ? 'checked' : ''} ${locked ? "disabled title=\"L'administrateur garde toujours l'accès à l'Administration\"" : ''} style="width:auto;display:inline-block;margin:0;cursor:pointer;"></td>`;
                }).join('')}</tr>`
        ).join('');
        document.getElementById('tabAccessTable').innerHTML =
            `<thead><tr style="background:#e8eaf6;"><th style="padding:6px 10px;text-align:left;">Onglet</th>${head}</tr></thead><tbody>${rows}</tbody>`;
    },
    adminCollect() {
        const cfg = {};
        document.querySelectorAll('#tabAccessTable input[data-ta]').forEach(i => {
            const [p, t] = i.dataset.ta.split('|');
            (cfg[p] = cfg[p] || {})[t] = i.checked;
        });
        return cfg;
    },
    adminReset() {
        TabAccess.adminRender(TabAccess.serverDefaults || TabAccess.DEFAULTS);
        const m = document.getElementById('tabAccessMsg');
        m.style.color = '#e65100';
        m.textContent = 'Valeurs par défaut rétablies : pensez à enregistrer.';
    },
    async adminSave() {
        const m = document.getElementById('tabAccessMsg');
        try {
            const r = await fetch(`${API_URL}/tab-access`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ config: TabAccess.adminCollect() })
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Erreur');
            TabAccess.cfg = d.config;
            m.style.color = '#2e7d32';
            m.textContent =
                'Enregistré. Les utilisateurs verront les changements à leur prochaine connexion ou changement de profil.';
            updateTabsVisibility();
        } catch (e) {
            m.style.color = '#c62828';
            m.textContent = e.message;
        }
    }
};

function updateTabsVisibility() {
    const profile = currentUser.activeProfile;
    const can = k => TabAccess.can(profile, k);
    const setTab = (el, k) => {
        if (el) el.style.display = can(k) ? 'block' : 'none';
    };
    setTab(document.querySelector('.tab-btn[onclick*="resources"]'), 'resources');
    setTab(document.getElementById('evenementsTabBtn'), 'evenements');
    setTab(document.querySelector('.tab-btn[onclick*="planning"]'), 'planning');
    setTab(document.getElementById('reportingTab'), 'reporting');
    setTab(document.getElementById('adminTab'), 'admin');
    setTab(document.getElementById('astreintesGestionTab'), 'astreintesGestion');
    setTab(document.getElementById('tripadvisorTabBtn'), 'tripadvisor');
    const craBtn = document.getElementById('craTabBtn');
    if (craBtn) craBtn.style.display = TabAccess.showCra(currentUser) ? 'block' : 'none';
    const astreintesBtn = document.getElementById('astreintesBtn');
    const astreintesBtnText = document.getElementById('astreintesBtnText');
    // Saisie des astreintes/HNO (CRA) : administrateurs et experts ; les autres profils consultent seulement le planning HO
    if (astreintesBtn)
        astreintesBtn.style.display =
            can('astreintesGestion') && (profile === 'admin' || profile === 'expert') ? 'inline-block' : 'none';
    if (astreintesBtnText)
        astreintesBtnText.textContent = profile === 'expert' ? 'Gérer mes astreintes/HNO' : 'Gérer les astreintes/HNO';

    if (profile === 'admin') {
        // Charger les experts pour le reporting, les fichiers ICS, etc.
        loadReportingExperts();
        loadSchoolHolidaysFiles();
        loadSpecialDatesFiles();
        loadCustomEvents();
        populateLocationSelects();
    } else if (profile === 'rh') {
        const addResSection = document.getElementById('addResourceFormSection');
        if (addResSection) addResSection.style.display = 'none';
        // Masquer loupe et enveloppe
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.style.display = 'none';
        const sendEmailBtn = document.getElementById('sendEmailBtn');
        if (sendEmailBtn) sendEmailBtn.style.display = 'none';
    }
    if (profile !== 'admin') {
        // Onglet d'ouverture : Ressources pour RH, Planification sinon ; à défaut le premier onglet accessible
        const avail = TabAccess.available(profile);
        const prefer = profile === 'rh' ? 'resources' : 'planning';
        switchTab(avail.includes(prefer) ? prefer : avail[0] || 'planning', null);
    }
}

async function logout() {
    console.log('🚪 Début de la déconnexion');
    if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
    await saveAssignmentLogs();
    await performLogout();
}

// Retour vers Planification depuis l'app Déplacements ou Analyse
function backToPlanification() {
    const wasAffectation =
        !!(window.AffectationApp && AffectationApp.isVisible()) ||
        (typeof analyseIsVisible === 'function' && analyseIsVisible());
    if (window.hideAffectationApp) hideAffectationApp();
    sessionStorage.setItem('selectedApp', 'planification');
    document.getElementById('deplacementsContainer').style.display = 'none';
    document.getElementById('deplacementsTimerDisplay').style.display = 'none';
    document.getElementById('deplacementsOnlineUsersContainer').style.display = 'none';
    document.getElementById('backToPlanificationBtn').style.display = 'none';
    document.getElementById('analyseContainer').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    updateTabsVisibility();
    updateUserDisplay();
    updateAppSwitcher();
    // Forcer le re-rendu de l'onglet actif (sinon contenu vide au retour)
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) switchTab(activeTab.id, null);
    // Retour depuis l'aide à l'affectation : on relance le minuteur et les connectés de l'application principale
    if (wasAffectation) {
        try {
            startInactivityTimer(inactivityTimeout);
        } catch (e) {
            /* minuteur indisponible */
        }
        if (!onlineUsersInterval) startOnlineUsersPolling();
    }
}

// Basculer vers une application depuis le sélecteur
function switchToApp(appKey) {
    document.getElementById('appSwitcherDropdown').style.display = 'none';
    if (appKey === 'planification') {
        backToPlanification();
        return;
    }
    if (appKey === 'deplacements') {
        stopInactivityTimer();
        if (onlineUsersInterval) {
            clearInterval(onlineUsersInterval);
            onlineUsersInterval = null;
        }
        document.querySelector('.container').style.display = 'none';
        document.getElementById('analyseContainer').style.display = 'none';
        showDeplacementsApp();
    } else if (appKey === 'analyse') {
        if (window.hideAffectationApp) hideAffectationApp();
        document.querySelector('.container').style.display = 'none';
        document.getElementById('deplacementsContainer').style.display = 'none';
        sessionStorage.setItem('selectedApp', 'analyse');
        showAnalyseApp();
    } else if (appKey === 'affectation') {
        showAffectationApp();
    }
}

function toggleAppSwitcherDropdown() {
    const dd = document.getElementById('appSwitcherDropdown');
    updateAppSwitcher(); // la liste dépend de l'application affichée
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        setTimeout(
            () =>
                document.addEventListener(
                    'click',
                    () => {
                        dd.style.display = 'none';
                    },
                    { once: true }
                ),
            0
        );
    }
}

const UI_ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    tower: '<path d="M12 2v3"/><path d="M9.5 22 12 5l2.5 17"/><path d="M8 22h8"/><path d="M10.2 15h3.6"/><path d="M11 10h2"/>',
    car: '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="14" r=".7"/><circle cx="16.5" cy="14" r=".7"/><path d="M6 17v2M18 17v2"/>',
    siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M4 21h16v-3H4z"/><path d="M12 3v1.5M4.6 6.6l1 1M19.4 6.6l-1 1M2.5 12H4M20 12h1.5"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="8" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
    calendar:
        '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    hourglass: '<path d="M6 2h12v4l-6 6 6 6v4H6v-4l6-6-6-6z"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    presentation:
        '<path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M12 16v5M8 21h8"/><path d="m7 12 3-3 2 2 4-4"/>',
    checksq: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    database:
        '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    flask: '<path d="M9 3h6M10 3v6.2L4.5 19a1.6 1.6 0 0 0 1.4 2.4h12.2a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3"/><path d="M7.5 15h9"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    smartphone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    refresh:
        '<path d="M21 12a9 9 0 0 0-15.5-6.2L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.2L21 16"/><path d="M21 21v-5h-5"/>',
    crown: '<path d="M2 18 4 7l5 5 3-7 3 7 5-5 2 11z"/><path d="M2 21h20"/>',
    briefcase:
        '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>',
    key: '<path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    plane: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
    clipboardCheck:
        '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    lifebuoy:
        '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.2 4.2M14.9 14.9l4.2 4.2M14.9 9.1l4.2-4.2M4.9 19.1l4.2-4.2"/>',
    listChecks: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    palette:
        '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>',
    clipboard:
        '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15"/>',
    minus: '<path d="M5 12h14"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>'
};
function uiIcon(name, size, style) {
    return `<svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:${size || 18}px;height:${size || 18}px;stroke:currentColor;vertical-align:-${Math.round((size || 18) * 0.2)}px;margin-right:8px;${style || ''}">${UI_ICONS[name] || ''}</svg>`;
}

const APP_ICON_DEFS = {
    planification: {
        bg: '#e3f2fd',
        fg: '#1d70b7',
        body: '<path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/>'
    },
    affectation: {
        bg: '#e0f2f1',
        fg: '#00796b',
        body: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'
    },
    analyse: {
        bg: '#e8eaf6',
        fg: '#3949ab',
        body: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>'
    },
    deplacements: {
        bg: '#fff3e0',
        fg: '#e65100',
        body: '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7.5" cy="14" r=".7"/><circle cx="16.5" cy="14" r=".7"/><path d="M6 17v2M18 17v2"/>'
    }
};
function appIconTile(key, size) {
    const d = APP_ICON_DEFS[key] || {
        bg: '#eceff1',
        fg: '#546e7a',
        body: '<rect x="4" y="4" width="16" height="16" rx="3"/>'
    };
    const ic = Math.round(size * 0.58);
    return `<span style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:${d.bg};"><svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:${ic}px;height:${ic}px;stroke:${d.fg};">${d.body}</svg></span>`;
}

function updateAppSwitcher() {
    const available = (currentUser && currentUser.availableApps) || [];
    const switcher = document.getElementById('appSwitcher');
    // Le menu est commun à toutes les applications : on le sort du conteneur principal pour qu'il reste visible partout
    if (switcher.parentElement !== document.body) document.body.appendChild(switcher);
    const shown = id => {
        const e = document.getElementById(id);
        return !!e && e.style.display !== 'none' && e.style.display !== '';
    };
    const current = shown('analyseContainer')
        ? 'analyse'
        : shown('deplacementsContainer')
          ? 'deplacements'
          : window.AffectationApp && AffectationApp.isVisible()
            ? 'affectation'
            : 'planification';
    // Depuis une autre application, le menu propose aussi le retour à la Planification (plus de bouton retour dédié)
    const apps = available.filter(k => k !== current);
    if (current !== 'planification') apps.unshift('planification');
    const dd = document.getElementById('appSwitcherDropdown');
    if (available.length === 0) {
        switcher.style.display = 'none';
        return;
    }
    switcher.style.display = 'block';
    const APP_LABELS = {
        planification: { label: 'Planification' },
        deplacements: { label: 'Suivi des déplacements' },
        analyse: { label: 'Analyse de fichiers' },
        affectation: { label: "Aide à l'affectation opérationnelle" }
    };
    dd.innerHTML = apps
        .map(key => {
            const def = APP_LABELS[key] || { label: key };
            return `<div onclick="switchToApp('${key}')" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;font-size:13px;color:#222;" onmouseenter="this.style.background='#f0f4ff'" onmouseleave="this.style.background=''">
                    ${appIconTile(key, 34)}<span>${def.label}</span>
                </div>`;
        })
        .join('');
}
