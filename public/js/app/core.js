// Application principale : core
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

const API_URL = '/api';

// Intercepteur global : détecte les sessions terminées par force-logout
(function () {
    let _checkingSession = false;
    const _origFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await _origFetch.apply(this, args);
        // Un refus 403 peut aussi venir d'une session perdue : on vérifie auprès du serveur (au plus une fois / 5 s)
        if (response.status === 403 && typeof currentUser !== 'undefined' && currentUser && !_checkingSession) {
            const u403 = String((args[0] && args[0].url) || args[0] || '');
            if (!/\/(login|logout|check-session|version|mfa|forgot|reset)/.test(u403)) {
                _checkingSession = true;
                _origFetch('/api/check-session', { credentials: 'include' })
                    .then(r => {
                        if (r.status === 401 || r.status === 403)
                            forceSessionEnd(
                                'Votre session a expiré (déconnexion ou redémarrage du serveur). Veuillez vous reconnecter.'
                            );
                    })
                    .catch(() => {})
                    .finally(() =>
                        setTimeout(() => {
                            _checkingSession = false;
                        }, 5000)
                    );
            }
        }
        if (response.status === 401) {
            // Session perdue (ex. redémarrage du serveur) pendant qu'un utilisateur est connecté
            try {
                const u = String((args[0] && args[0].url) || args[0] || '');
                if (
                    typeof currentUser !== 'undefined' &&
                    currentUser &&
                    !/\/(login|logout|check-session|version|mfa|forgot|reset)/.test(u)
                ) {
                    const d = await response
                        .clone()
                        .json()
                        .catch(() => ({}));
                    if (d.error === 'Non authentifié')
                        forceSessionEnd(
                            'Votre session a expiré (déconnexion ou redémarrage du serveur). Veuillez vous reconnecter.'
                        );
                }
            } catch (e) {
                /* ignoré */
            }
            const clone = response.clone();
            try {
                const data = await clone.json();
                if (data.error === 'SESSION_TERMINATED') {
                    forceSessionEnd('Votre session a été fermée par un administrateur. Veuillez vous reconnecter.');
                }
            } catch (e) {
                /* réponse non-JSON, on ignore */
            }
        }
        return response;
    };
})();

let resources = [];
let users = [];
let sortDirection = {};
let currentUser = null;
let schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] }; // Périodes de congés scolaires
let specialDates = []; // Dates particulières (jours fériés, etc.)
// Planning, astreintes / HNO de la grille, exports et impressions : îlot Vue (frontend/src/ilots/planification)

const availabilityLabels = {
    1: 'Indisponible',
    2: "Disponible pour l'ANS",
    3: '🏖️ Congés'
};

const activityLabels = {
    1: '❓ Indisponible',
    2: "⏳ En attente d'affectation",
    3: '📞 SAMU (Déploiement)',
    4: '📞 SAMU (Dev. usages)',
    5: '📄 ANS (Déploiement)',
    6: '👨‍🏫 ANS (Dev. usages)',
    7: '☑️ Qualification',
    8: '📖 Divers'
};

function getUserProfiles(user) {
    const profiles = [];
    if (user.is_admin) profiles.push('Admin');
    if (user.is_expert) profiles.push('Expert');
    if (user.is_user) profiles.push('User');
    return profiles.join(', ') || 'Aucun';
}

// Ressources de la planification ; session expirée : déconnexion (déplacé de password-reset.js, lot 6.1, tel quel)
async function loadResources() {
    try {
        const response = await fetch(`${API_URL}/resources`, { credentials: 'include' });
        if (response.status === 401) {
            console.warn('Session expirée lors du chargement des ressources');
            await performLogout();
            return;
        }
        if (!response.ok) throw new Error('Erreur chargement ressources');
        resources = await response.json();

        // Onglet Ressources : îlot Vue (frontend/src/ilots/ressources), qui relit ses données
        window.dispatchEvent(new CustomEvent('gp:ressources-rechargees'));
    } catch (error) {
        console.error('Erreur:', error);
    }
}
// Mire de connexion, double authentification, mots de passe oublié, imposé ou réinitialisé, session vérifiée au
// chargement de la page : îlot Vue (frontend/src/connexion/MireBureau.vue)
// Session ouverte par la mire, ou reprise au chargement de la page : ouverture de l'application
window.addEventListener('gp:session-ouverte', e => {
    const { utilisateur, reprise } = e.detail;
    if (reprise) reprendreSession(utilisateur);
    else completeFinalLogin(utilisateur, 'planification');
});
// Aucune session au chargement de la page (ou mot de passe à changer) : application masquée derrière la mire
window.addEventListener('gp:session-absente', () => {
    document.getElementById('loginPage').classList.add('active');
    document.querySelector('.container').style.display = 'none';
    sessionStorage.removeItem('selectedApp');
});

/** Session reprise au chargement de la page (rechargement, nouvel onglet) : application ouverte là où elle était */
async function reprendreSession(data) {
    try {
        currentUser = data;
        currentUser.id = data.userId; // alias pour compatibilité
        console.log('✅ Session restaurée:', currentUser);
        console.log('📷 Photo dans session:', currentUser.profilePhoto ? 'OUI' : 'NON');

        // Récupérer l'application sélectionnée depuis sessionStorage
        const savedApp = sessionStorage.getItem('selectedApp');
        console.log('📱 Application sauvegardée:', savedApp);

        // Si l'utilisateur était sur l'application déplacements et qu'il a le droit AMOA_CED
        if (savedApp === 'deplacements' && (currentUser.availableApps || []).includes('deplacements')) {
            console.log('🚗 Restauration vers la Plateforme de suivi des déplacements');
            document.getElementById('loginPage').classList.remove('active');
            currentUser.selectedApp = 'deplacements';
            showDeplacementsApp();
            return;
        }
        if (savedApp === 'affectation' && (currentUser.availableApps || []).includes('affectation')) {
            currentUser.selectedApp = 'affectation';
            showAffectationApp();
            return;
        }
        if (savedApp === 'analyse' && (currentUser.availableApps || []).includes('analyse')) {
            console.log('📊 Restauration vers Analyse de fichiers');
            document.getElementById('loginPage').classList.remove('active');
            currentUser.selectedApp = 'analyse';
            showAnalyseApp();
            return;
        }

        // Sinon, afficher l'application de planification
        currentUser.selectedApp = 'planification';
        document.getElementById('loginPage').classList.remove('active');
        document.querySelector('.container').style.display = 'block';

        // Déconnexion pendant les chargements ci-dessous : la suite de la reprise est abandonnée
        const utilisateur = currentUser;
        const sessionFermee = () => currentUser !== utilisateur;

        await TabAccess.load();
        if (sessionFermee()) return;
        updateTabsVisibility();
        // En-tête (utilisateur, profil, boutons) et menu Applications : îlots Vue du cadre (frontend/src/ilots/entete)

        // Onglet CRA
        const craBtn = document.getElementById('craTabBtn');
        if (craBtn) {
            const showCra = TabAccess.showCra(currentUser);
            craBtn.style.display = showCra ? 'block' : 'none';
            document.getElementById('craTabLabel').textContent = 'CRA';
        }

        // Badge CRA en attente
        loadCraPendingBadge();

        await loadResources();
        await loadUsers(); // Charger les users pour le Gantt
        await loadSchoolHolidays(); // Charger les congés scolaires
        await loadSpecialDates(); // Charger les dates particulières et événements personnalisés
        if (sessionFermee()) return;

        // Connectés, conversations restaurées, inactivité : îlot Vue du cadre (frontend/src/ilots/connectes)

        openLandingTab();
    } catch (error) {
        // En cas d'erreur, retour silencieux sur la mire
        console.error('Reprise de la session :', error);
        document.getElementById('loginPage').classList.add('active');
        document.querySelector('.container').style.display = 'none';
        sessionStorage.removeItem('selectedApp');
    }
}

// Remise à zéro de l'interface pour la mire de connexion : applications fermées, minuteurs et bandeaux flottants masqués,
// mire (îlot Vue) vidée et message éventuel affiché
function resetUiForLogin(message) {
    // Interface Vue (îlots, frontend/src/liaison.ts) : démontage des îlots et oubli de la session
    window.dispatchEvent(new CustomEvent('gp:session-terminee'));
    try {
        closeAllModals();
    } catch (e) {
        /* ignoré */
    }
    try {
        hideAffectationApp();
    } catch (e) {
        /* ignoré */
    }
    // Connectés, conversations, minuteur d'inactivité : îlots Vue, démontés en fin de session
    ['analyseContainer', 'deplacementsContainer', 'affectationContainer', 'backToPlanificationBtn', 'adminTab'].forEach(
        id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    );
    const main = document.querySelector('.container');
    if (main) main.style.display = 'none';
    try {
        sessionStorage.removeItem('selectedApp');
    } catch (e) {
        /* ignoré */
    }
    currentUser = null;
    document.getElementById('loginPage').classList.add('active');
    window.dispatchEvent(new CustomEvent('gp:mire-affichee', { detail: { message } }));
    window.scrollTo(0, 0);
}
// Fin de session côté serveur (redémarrage, expiration…) : retour propre sur la mire de connexion
let _sessionEnding = false;
function forceSessionEnd(message) {
    if (_sessionEnding) return;
    _sessionEnding = true;
    resetUiForLogin(message || 'Votre session a expiré. Veuillez vous reconnecter.');
    setTimeout(() => {
        _sessionEnding = false;
    }, 1500);
}

// Ouverture de l'application après la connexion par la mire (double authentification et mot de passe imposé traités)
async function completeFinalLogin(user, selectedApp) {
    currentUser = user;
    currentUser.id = user.userId || user.id; // alias pour compatibilité
    currentUser.selectedApp = selectedApp;
    console.log('👤 Current user après login:', currentUser);
    console.log('📛 Trigramme:', currentUser.trigramme);
    console.log('📷 Photo:', currentUser.profilePhoto ? 'Oui' : 'Non');
    console.log('📱 Application choisie:', selectedApp);

    // Plateforme de planification
    // Purger les anciennes données en mémoire pour éviter les problèmes de cache
    resources = [];
    users = [];
    schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] };

    document.getElementById('loginPage').classList.remove('active');
    document.querySelector('.container').style.display = 'block';

    // Déconnexion pendant les chargements ci-dessous : la suite de l'ouverture est abandonnée
    const sessionFermee = () => currentUser !== user;

    await TabAccess.load();
    if (sessionFermee()) return;
    updateTabsVisibility();
    // En-tête (utilisateur, profil, nouvelles affectations, boutons) et menu Applications : îlots Vue du cadre

    // Afficher l'onglet CRA selon le profil
    const craBtn = document.getElementById('craTabBtn');
    if (craBtn) {
        const showCra = TabAccess.showCra(currentUser);
        craBtn.style.display = showCra ? 'block' : 'none';
        const lbl = document.getElementById('craTabLabel');
        if (lbl) lbl.textContent = 'CRA';
    }

    await loadResources();
    await loadUsers(); // Charger les utilisateurs pour les notifications
    await loadSchoolHolidays(); // Charger les congés scolaires pour tous les profils
    await loadSpecialDates(); // Charger les dates particulières pour tous les profils
    await loadLocations(); // Charger les localisations
    if (sessionFermee()) return;

    // Nouveautés de la version : îlot Vue (frontend/src/ilots/entete/CadreSession.vue)

    // Badge CRA en attente (admin)
    loadCraPendingBadge();

    // Restaurer l'ordre des onglets + activer le drag & drop
    restoreTabOrder();
    initTabDragDrop();

    // Afficher l'onglet par défaut selon la préférence de l'utilisateur
    openLandingTab();

    // Deep link CRA depuis email : CRA ouvert par l'îlot du circuit (frontend/src/ilots/cra), à son montage ou aussitôt
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'cra') {
        switchTab('cra', null);
        const craId = urlParams.get('cra_id');
        if (craId)
            setTimeout(() => {
                window.craDemande = parseInt(craId);
                window.dispatchEvent(new CustomEvent('gp:cra-demande'));
            }, 500);
    }
}

// Obtenir la liste des onglets accessibles selon le profil
// Onglet d'ouverture : celui choisi dans le profil s'il est accessible, sinon l'Accueil (accessible à tous les profils)
function openLandingTab() {
    const preferred = currentUser.defaultTab || 'accueil';
    const accessible =
        preferred === 'accueil' || getAvailableTabsForProfile(currentUser.activeProfile).includes(preferred);
    switchTab(accessible ? preferred : 'accueil', null);
}

function getAvailableTabsForProfile(profile) {
    return TabAccess.available(profile);
}

// Fenêtres d'impression (planning, CRA, reporting…) : sans la feuille de style de l'application, les icônes SVG
// prendraient toute la place
(function () {
    const nativeOpen = window.open;
    const css =
        '<style>svg.ui-emo,svg.app-ico{width:1.15em;height:1.15em;vertical-align:middle;margin:0 .15em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}</style>';
    window.open = function (url) {
        const w = nativeOpen.apply(window, arguments);
        if (w && !url) {
            try {
                const d = w.document,
                    write = d.write.bind(d);
                d.write = html => write(String(html).replace(/<head>/i, '<head>' + css));
            } catch (e) {
                /* fenêtre inaccessible */
            }
        }
        return w;
    };
})();

// Fenêtres Vue (frontend/src/ilots/fenetres.ts) ouvertes par les boutons des en-têtes : calendrier mensuel,
// calendrier des congés et événements, recherche avancée
function ouvrirFenetreVue(fenetre) {
    window.dispatchEvent(new CustomEvent('gp:fenetre-demandee', { detail: { fenetre } }));
}
// Affectations en attente d'invitation (enveloppe, journal à la déconnexion) et nouvelles affectations de l'expert :
// îlots Vue de l'en-tête (frontend/src/ilots/entete)

// Interface Vue (îlots, frontend/src/liaison.ts) : données modifiées par un îlot, rechargées pour le reste de la page
window.addEventListener('gp:evenements-modifies', async () => {
    await loadSpecialDates();
});
window.addEventListener('gp:localisations-modifiees', () => loadLocations());
// Accès aux applications de la session relus (l'administrateur a pu modifier les siens) ; menu Applications : îlot Vue
window.addEventListener('gp:applications-modifiees', async () => {
    try {
        const r = await fetch(`${API_URL}/check-session`, { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        if (data && data.availableApps) {
            currentUser.availableApps = data.availableApps;
        }
    } catch {
        /* menu inchangé */
    }
});
// Comptes modifiés par l'îlot de gestion des utilisateurs : utilisateurs et ressources rechargés
window.addEventListener('gp:utilisateurs-modifies', async () => {
    await loadUsers();
    await loadResources();
    showSyncStatus();
});
// Paramétrages divers enregistrés par l'îlot de l'Administration (inactivité, favicon) : îlots Vue du cadre
// Fichiers .ics importés ou supprimés par l'îlot des jours spéciaux : congés et dates de la planification rechargés
window.addEventListener('gp:conges-modifies', async () => {
    await reloadAllSchoolHolidays();
});
window.addEventListener('gp:dates-particulieres-modifiees', () => loadSpecialDates());
// Ressources modifiées dans l'onglet Ressources (îlot Vue) : ressources rechargées (puis gp:ressources-rechargees)
window.addEventListener('gp:ressources-modifiees', () => loadResources());
// CRA traités par l'îlot de l'onglet CRA : pastille de l'onglet
window.addEventListener('gp:cra-modifies', () => loadCraPendingBadge());
// Accès aux onglets enregistrés : barre d'onglets mise à jour
window.addEventListener('gp:onglets-modifies', e => {
    TabAccess.cfg = e.detail.config;
    updateTabsVisibility();
});

// Déplacé de deplacements.js (lot 5.2b), tel quel
// Fermer tous les modals/popups ouverts
function closeAllModals() {
    // Fermer tous les éléments avec la classe 'modal' qui sont actifs
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });

    // Fermer tous les éléments qui utilisent display:block/flex (modales sans classe .modal)
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.style.display === 'block' || modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    // Fermer toutes les modales connues par ID (y compris celles sans classe .modal)
    const modalIds = [
        'localisationModal',
        'samuModal',
        'localisationConfirmModal',
        'deplacementsModal',
        'logoutConfirmModal',
        'myEventsModal',
        'diagnosticModal',
        'localisationsManagementModal',
        // Modales sans classe .modal
        'deplacementsLogoutModal',
        'mfaModal',
        'totpSetupModal',
        'totpVerifyModal',
        'debugLogsModal'
    ];

    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
    });

    console.log('🔒 Tous les modals fermés');
}

// Fonction séparée pour effectuer la déconnexion
async function performLogout() {
    // Conversations fermées et effacées : îlot Vue, démonté en fin de session
    // Fermer tous les modals/popups ouverts
    closeAllModals();

    // Afficher un indicateur de déconnexion en cours
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'logout-loading';
    loadingIndicator.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: white;
                font-size: 18px;
                font-weight: bold;
            `;

    const spinnerDiv = document.createElement('div');
    spinnerDiv.style.cssText = `
                border: 8px solid #f3f3f3;
                border-top: 8px solid #3498db;
                border-radius: 50%;
                width: 60px;
                height: 60px;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
            `;

    const messageDiv = document.createElement('div');
    messageDiv.textContent = 'Déconnexion en cours...';

    loadingIndicator.appendChild(spinnerDiv);
    loadingIndicator.appendChild(messageDiv);
    document.body.appendChild(loadingIndicator);

    try {
        const response = await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Erreur serveur lors de la déconnexion');
        }

        currentUser = null;

        console.log('✅ Déconnexion réussie');

        // Rediriger vers la page de login (toutes les applications et bandeaux flottants sont fermés, mire vidée et version
        // relue)
        resetUiForLogin();
    } catch (error) {
        console.error('Erreur logout:', error);
        alert('Erreur lors de la déconnexion. Veuillez réessayer.');
    } finally {
        // Retirer l'indicateur de chargement
        const indicator = document.getElementById('logout-loading');
        if (indicator) {
            indicator.remove();
        }
    }
}
