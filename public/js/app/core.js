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
let scheduleData = {};
let oldScheduleData = {}; // Pour comparer les changements
let users = [];
let currentEditId = null;
let currentLocalisationCell = null;
let sortDirection = {};
let currentUser = null;
let availableProfiles = [];
let loginStep = 'credentials';
let pendingAssignments = {}; // {resourceId: {expertId, assignments: [{date, period, activity, activityCode, location, actionType, oldActivity, oldActivityCode, oldLocation}]}}
let initialScheduleState = {}; // État initial du planning au chargement (pour comparer les changements)
let sessionId = null; // ID de session pour grouper les notifications
let isFirstPlanningLoad = true; // Flag pour le scroll initial vers aujourd'hui
let schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] }; // Périodes de congés scolaires
let specialDates = []; // Dates particulières (jours fériés, etc.)
let allAstreintesHno = []; // Toutes les astreintes/HNO pour affichage sur le planning

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

window.addEventListener('load', async () => {
    openPasswordResetFromUrl();
    await checkSession();
});

async function checkSession() {
    try {
        const response = await fetch(`${API_URL}/check-session`, { credentials: 'include' });

        // Si la réponse n'est pas OK (401, 403, etc.), on redirige vers login sans erreur
        if (!response.ok) {
            document.getElementById('loginPage').classList.add('active');
            document.querySelector('.container').style.display = 'none';
            sessionStorage.removeItem('selectedApp');
            return;
        }

        // Vérifier si la réponse est bien du JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            document.getElementById('loginPage').classList.add('active');
            document.querySelector('.container').style.display = 'none';
            sessionStorage.removeItem('selectedApp');
            return;
        }

        const data = await response.json();

        // Session ouverte mais mot de passe à changer (page rechargée) : changement, puis ouverture de l'application
        if (data.userId && data.mustChangePassword) {
            document.getElementById('loginPage').classList.add('active');
            document.querySelector('.container').style.display = 'none';
            showForcedPasswordChange(() => checkSession());
            return;
        }

        if (data.userId) {
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
            updateUserDisplay();
            updateAppSwitcher();
            updateProfileDisplay(); // Mettre à jour la photo de profil

            // Onglet CRA
            const craBtn = document.getElementById('craTabBtn');
            if (craBtn) {
                const showCra = TabAccess.showCra(currentUser);
                craBtn.style.display = showCra ? 'block' : 'none';
                document.getElementById('craTabLabel').textContent = 'CRA';
            }

            // Charger la config CRA pour les boutons visa
            fetch(`${API_URL}/settings`, { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (data.automation_4_config) {
                        try {
                            window._craConfig = JSON.parse(data.automation_4_config);
                        } catch (e) {}
                    }
                })
                .catch(() => {});

            // Badge CRA en attente
            loadCraPendingBadge();

            await loadResources();
            await loadSchedule();
            await loadUsers(); // Charger les users pour le Gantt
            await loadSchoolHolidays(); // Charger les congés scolaires
            await loadSpecialDates(); // Charger les dates particulières et événements personnalisés
            if (sessionFermee()) return;
            loadAppVersion();

            // Démarrer le suivi des utilisateurs connectés en temps réel
            startOnlineUsersPolling();
            // Restaurer les conversations de messagerie en cours
            setTimeout(_chatRestoreSessions, 400);

            setCurrentMonth();
        } else {
            document.getElementById('loginPage').classList.add('active');
            document.querySelector('.container').style.display = 'none';
            sessionStorage.removeItem('selectedApp');
        }
    } catch (error) {
        // En cas d'erreur, rediriger silencieusement vers login
        document.getElementById('loginPage').classList.add('active');
        document.querySelector('.container').style.display = 'none';
        sessionStorage.removeItem('selectedApp');
    }
}

function setLoginButtonLabel(text) {
    const lbl = document.querySelector('#loginButton .lp-btn-label');
    if (lbl) lbl.textContent = text;
    else document.getElementById('loginButton').textContent = text;
}

// Bouton de connexion : état « Connexion en cours… » animé pendant l'attente du serveur (latence réseau)
function setLoginBusy(on) {
    const btn = document.getElementById('loginButton');
    if (!btn) return;
    btn.classList.toggle('lp-busy', !!on);
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
}

async function handleLogin() {
    if (document.getElementById('loginButton').classList.contains('lp-busy')) return; // déjà en cours : évite un double envoi
    setLoginBusy(true);
    try {
        await handleLoginInner();
    } finally {
        setLoginBusy(false);
    }
}

async function handleLoginInner() {
    const errorDiv = document.getElementById('loginError');
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';

    console.log('🔍 handleLogin appelé, loginStep =', loginStep);

    // Vérifier la cohérence de l'état du formulaire
    const profileSelectVisible = document.getElementById('profileSelectGroup').style.display !== 'none';
    const hasProfile = document.getElementById('loginProfile').value;

    console.log('🔍 profileSelectVisible =', profileSelectVisible, ', hasProfile =', hasProfile);

    // Si loginStep est 'profile' mais que le sélecteur n'est pas visible, réinitialiser
    if (loginStep === 'profile' && !profileSelectVisible && !hasProfile) {
        console.log('⚠️ État incohérent détecté, réinitialisation du formulaire');
        loginStep = 'credentials';
        setLoginButtonLabel('Continuer');
    }

    if (loginStep === 'credentials') {
        console.log('📝 Appel de loadUserProfiles()');
        await loadUserProfiles();
    } else {
        console.log('🔐 Appel de loginWithProfile()');
        await loginWithProfile();
    }
}

async function loadUserProfiles() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    console.log('📝 loadUserProfiles - username:', username, ', password length:', password ? password.length : 0);

    if (!username || !password) {
        showLoginError('Veuillez remplir les identifiants');
        return;
    }

    // Première étape : identifiant et mot de passe vérifiés par le serveur, sans profil. Il connecte
    // directement un compte à profil unique et ne renvoie les profils d'un compte qu'après vérification.
    await loginWithProfile(true);
}

/** Choix du profil (compte à plusieurs profils), proposé après vérification du mot de passe */
function showProfileChoice(profiles) {
    availableProfiles = profiles;
    const label = p =>
        p === 'admin'
            ? 'Administrateur'
            : p === 'expert'
              ? 'Expert Métier'
              : p === 'rh'
                ? 'Ressources Humaines'
                : 'Utilisateur';
    const profileSelect = document.getElementById('loginProfile');
    profileSelect.innerHTML = '<option value="">-- Choisir un profil --</option>';
    profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = label(profile);
        profileSelect.appendChild(option);
    });
    document.getElementById('profileSelectGroup').style.display = 'block';
    setLoginButtonLabel('Se connecter');
    loginStep = 'profile';
}

async function loginWithProfile(withoutProfile = false) {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const profile = withoutProfile ? '' : document.getElementById('loginProfile').value;
    const selectedApp = 'planification';

    console.log(
        '🔐 loginWithProfile - username:',
        username,
        ', profile:',
        profile || '(choisi par le serveur)',
        ', app:',
        selectedApp
    );

    if (!withoutProfile && !profile) {
        showLoginError('Veuillez sélectionner un profil');
        return;
    }

    try {
        console.log('📡 Appel API /login...');
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            body: JSON.stringify(withoutProfile ? { username, password } : { username, password, profile })
        });

        console.log('📡 Réponse /login - status:', response.status);
        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            const rawText = await response.text().catch(() => '(vide)');
            console.error('❌ Échec parsing JSON login - status:', response.status, '- body:', rawText);
            showLoginError(`Erreur serveur (${response.status}) — consultez la console`);
            return;
        }

        if (response.ok) {
            // Compte à plusieurs profils : choix du profil, puis nouvelle connexion avec ce profil
            if (data.profileRequired) {
                showProfileChoice(data.profiles);
                return;
            }
            // Vérifier si MFA est requis
            if (data.mfaRequired) {
                console.log('🔐 MFA requis, méthode:', data.mfaMethod);

                // Stocker les infos pour la suite (profil unique : choisi par le serveur)
                const pendingUserId = data.pendingUserId;
                const pendingProfile = profile || data.profile;
                const pendingApp = selectedApp;

                if (data.mfaMethod === 'choice') {
                    // L'utilisateur peut choisir sa méthode
                    document.getElementById('mfaMethodPendingUserId').value = pendingUserId;
                    document.getElementById('mfaMethodPendingProfile').value = pendingProfile;
                    document.getElementById('mfaMethodPendingApp').value = pendingApp;

                    // Configurer le bouton TOTP selon si déjà configuré
                    if (data.totpConfigured) {
                        document.getElementById('mfaTotpBtnTitle').textContent = "Application d'authentification";
                        document.getElementById('mfaTotpBtnSubtitle').textContent =
                            'Utilisez votre application configurée';
                    } else {
                        document.getElementById('mfaTotpBtnTitle').textContent = 'Configurer une application';
                        document.getElementById('mfaTotpBtnSubtitle').textContent =
                            'Première utilisation : configuration requise';
                    }

                    document.getElementById('mfaMethodChoiceModal').classList.add('active');
                } else if (data.mfaMethod === 'email') {
                    // MFA par email
                    await initiateMfaEmail(pendingUserId, pendingProfile, pendingApp);
                } else if (data.mfaMethod === 'totp') {
                    // MFA par TOTP
                    if (data.totpConfigured) {
                        // TOTP déjà configuré, demander le code
                        showMfaTotpVerification(pendingUserId, pendingProfile, pendingApp);
                    } else {
                        // TOTP pas encore configuré, afficher le QR code
                        await setupTotpForUser(pendingUserId, pendingProfile, pendingApp);
                    }
                }
                return;
            }

            // Pas de MFA, continuer normalement
            await completeFinalLogin(data.user, selectedApp);
        } else {
            showLoginError(data.error || 'Erreur de connexion');
        }
    } catch (error) {
        console.error('Erreur login:', error);
        showLoginError('Erreur de connexion — ' + (error.message || 'vérifiez la console'));
    }
}

// Identifiants déjà utilisés sur ce poste (le mot de passe n'est jamais mémorisé ici)
const KNOWN_LOGINS_KEY = 'gp_known_logins';
function knownLogins() {
    try {
        const a = JSON.parse(localStorage.getItem(KNOWN_LOGINS_KEY) || '[]');
        return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : [];
    } catch (e) {
        return [];
    }
}
function saveKnownLogins(list) {
    try {
        localStorage.setItem(KNOWN_LOGINS_KEY, JSON.stringify(list.slice(0, 8)));
    } catch (e) {
        /* stockage indisponible */
    }
}
function rememberLogin(u) {
    u = (u || '').trim();
    if (!u) return;
    saveKnownLogins([u, ...knownLogins().filter(x => x.toLowerCase() !== u.toLowerCase())]);
}
// Gestionnaire de mots de passe du navigateur (Credential Management) : au clic sur un champ vide,
// le navigateur propose ses comptes enregistrés ; identifiant et mot de passe sont remplis depuis son coffre sécurisé.
let _credBusy = false;
async function loginCredPick() {
    const inp = document.getElementById('loginUsername');
    if (!window.PasswordCredential || _credBusy || !inp || inp.value) return;
    _credBusy = true;
    try {
        const cred = await navigator.credentials.get({ password: true, mediation: 'required' });
        if (cred) {
            inp.value = cred.id;
            document.getElementById('loginPassword').value = cred.password;
            loginSuggestHide();
            document.getElementById('loginPassword').focus();
        }
    } catch (e) {
        /* refusé ou non supporté */
    } finally {
        _credBusy = false;
    }
}
function loginSuggestShow() {
    if (window.PasswordCredential) return; // le coffre du navigateur prend le relais
    const box = document.getElementById('loginSuggest'),
        inp = document.getElementById('loginUsername');
    if (!box || !inp) return;
    const q = inp.value.trim().toLowerCase();
    const list = knownLogins().filter(x => !q || x.toLowerCase().includes(q));
    if (!list.length || (q && list.length === 1 && list[0].toLowerCase() === q)) {
        box.style.display = 'none';
        return;
    }
    const esc = v =>
        String(v).replace(
            /[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    box.innerHTML =
        '<div class="lp-suggest-t">Identifiants utilisés sur ce poste</div>' +
        list
            .map(
                x =>
                    `<div class="lp-suggest-i" onmousedown="event.preventDefault();loginSuggestPick(decodeURIComponent('${encodeURIComponent(x)}'))"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>${esc(x)}</span><button type="button" title="Oublier cet identifiant" onmousedown="event.preventDefault();event.stopPropagation();loginSuggestForget(decodeURIComponent('${encodeURIComponent(x)}'))">×</button></div>`
            )
            .join('');
    box.style.display = 'block';
}
function loginSuggestHide() {
    const b = document.getElementById('loginSuggest');
    if (b) b.style.display = 'none';
}
function loginSuggestPick(u) {
    document.getElementById('loginUsername').value = u;
    loginSuggestHide();
    const pw = document.getElementById('loginPassword');
    if (pw) pw.focus();
}
function loginSuggestForget(u) {
    saveKnownLogins(knownLogins().filter(x => x !== u));
    loginSuggestShow();
}

// Fin de session côté serveur (redémarrage, expiration…) : retour propre sur la mire de connexion
// Remise à zéro de l'interface pour la mire de connexion : applications fermées, minuteurs et bandeaux flottants masqués
function resetUiForLogin() {
    // Interface Vue (îlots, frontend/src/liaison.ts) : démontage des îlots et oubli de la session
    window.dispatchEvent(new CustomEvent('gp:session-terminee'));
    try {
        if (typeof _chatCloseAll === 'function') _chatCloseAll();
    } catch (e) {
        /* ignoré */
    }
    try {
        closeAllModals();
    } catch (e) {
        /* ignoré */
    }
    try {
        if (window.hideAffectationApp) hideAffectationApp();
    } catch (e) {
        /* ignoré */
    }
    try {
        if (typeof analyseStopLoops === 'function') analyseStopLoops();
    } catch (e) {
        /* ignoré */
    }
    try {
        stopInactivityTimer();
    } catch (e) {
        /* ignoré */
    }
    try {
        if (notificationCheckInterval) {
            clearInterval(notificationCheckInterval);
            notificationCheckInterval = null;
        }
    } catch (e) {
        /* ignoré */
    }
    try {
        if (onlineUsersInterval) {
            clearInterval(onlineUsersInterval);
            onlineUsersInterval = null;
        }
    } catch (e) {
        /* ignoré */
    }
    try {
        if (deplacementsOnlineUsersInterval) {
            clearInterval(deplacementsOnlineUsersInterval);
            deplacementsOnlineUsersInterval = null;
        }
    } catch (e) {
        /* ignoré */
    }
    [
        'analyseContainer',
        'deplacementsContainer',
        'affectationContainer',
        'deplacementsTimerDisplay',
        'deplacementsOnlineUsersContainer',
        'deplacementsOnlineUsersTooltip',
        'analyseTimerDisplay',
        'analyseOnlineUsersContainer',
        'inactivityTimerDisplay',
        'backToPlanificationBtn',
        'appSwitcher',
        'appSwitcherDropdown',
        'onlineUsersContainer',
        'onlineUsersTooltip',
        'adminTab',
        'userInfo'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const main = document.querySelector('.container');
    if (main) main.style.display = 'none';
    try {
        sessionStorage.removeItem('selectedApp');
    } catch (e) {
        /* ignoré */
    }
    currentUser = null;
    pendingAssignments = {};
    availableProfiles = [];
    loginStep = 'credentials';
    document.getElementById('loginPage').classList.add('active');
    ['loginUsername', 'loginPassword', 'loginProfile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('profileSelectGroup').style.display = 'none';
    setLoginButtonLabel('Continuer');
    window.scrollTo(0, 0);
}
// Fin de session côté serveur (redémarrage, expiration…) : retour propre sur la mire de connexion
let _sessionEnding = false;
function forceSessionEnd(message) {
    if (_sessionEnding) return;
    _sessionEnding = true;
    resetUiForLogin();
    showLoginError(message || 'Votre session a expiré. Veuillez vous reconnecter.');
    try {
        loadVersion();
    } catch (e) {
        /* ignoré */
    }
    setTimeout(() => {
        _sessionEnding = false;
    }, 1500);
}

let _credFilled = false;
async function tryFillCredentials() {
    if (_credFilled || !window.PasswordCredential) return;
    _credFilled = true; // Bloquer dès le lancement pour éviter les réouvertures
    try {
        const cred = await navigator.credentials.get({ password: true, mediation: 'optional' });
        if (cred) {
            document.getElementById('loginUsername').value = cred.id;
            document.getElementById('loginPassword').value = cred.password;
        }
    } catch (e) {
        /* silencieux si refusé ou non supporté */
    }
}

// Finaliser le login après validation MFA ou sans MFA
async function completeFinalLogin(user, selectedApp) {
    // Proposer à Chrome d'enregistrer les identifiants (Credential Management API)
    if (window.PasswordCredential) {
        try {
            const cred = new PasswordCredential({
                id: document.getElementById('loginUsername').value.trim(),
                password: document.getElementById('loginPassword').value,
                name: user.prenom + ' ' + user.nom
            });
            navigator.credentials.store(cred);
        } catch (e) {
            /* silencieux */
        }
    }
    rememberLogin(document.getElementById('loginUsername').value);
    currentUser = user;
    currentUser.id = user.userId || user.id; // alias pour compatibilité
    currentUser.selectedApp = selectedApp;
    console.log('👤 Current user après login:', currentUser);
    console.log('📛 Trigramme:', currentUser.trigramme);
    console.log('📷 Photo:', currentUser.profilePhoto ? 'Oui' : 'Non');
    console.log('📱 Application choisie:', selectedApp);

    // Fermer toutes les modales MFA
    document.getElementById('mfaCodeModal').classList.remove('active');
    document.getElementById('mfaTotpSetupModal').classList.remove('active');
    document.getElementById('mfaMethodChoiceModal').classList.remove('active');

    // Mot de passe donné par un administrateur : à remplacer avant d'entrer dans l'application
    if (user.mustChangePassword) {
        showForcedPasswordChange(newPassword => {
            document.getElementById('loginPassword').value = newPassword; // identifiants proposés au navigateur
            completeFinalLogin({ ...user, mustChangePassword: false }, selectedApp);
        });
        return;
    }

    // Si l'utilisateur a choisi la plateforme de déplacements
    if (selectedApp === 'deplacements') {
        console.log('🚗 Redirection vers la Plateforme de suivi des déplacements');
        document.getElementById('loginPage').classList.remove('active');

        // Afficher l'application déplacements
        showDeplacementsApp();
        return;
    }

    // Sinon, continuer avec la plateforme de planification standard
    // Purger les anciennes données en mémoire pour éviter les problèmes de cache
    scheduleData = {};
    resources = [];
    users = [];
    schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] };
    modifiedCellsInSession.clear(); // Réinitialiser les cellules modifiées

    sessionId = generateSessionId(); // Générer un ID de session unique

    document.getElementById('loginPage').classList.remove('active');
    document.querySelector('.container').style.display = 'block';

    // Déconnexion pendant les chargements ci-dessous : la suite de l'ouverture est abandonnée
    const sessionFermee = () => currentUser !== user;

    await TabAccess.load();
    if (sessionFermee()) return;
    updateTabsVisibility();
    updateUserDisplay();
    updateAppSwitcher();

    // Afficher l'onglet CRA selon le profil
    const craBtn = document.getElementById('craTabBtn');
    if (craBtn) {
        const showCra = TabAccess.showCra(currentUser);
        craBtn.style.display = showCra ? 'block' : 'none';
        const lbl = document.getElementById('craTabLabel');
        if (lbl) lbl.textContent = 'CRA';
    }

    await loadResources();
    await loadSchedule();
    await loadSettings(); // Charger les paramètres d'inactivité
    await loadUsers(); // Charger les utilisateurs pour les notifications
    await loadSchoolHolidays(); // Charger les congés scolaires pour tous les profils
    await loadSpecialDates(); // Charger les dates particulières pour tous les profils
    await loadLocations(); // Charger les localisations
    if (sessionFermee()) return;

    // Vérifier popup nouveautés version
    checkHelpVersionPopup();

    // Badge CRA en attente (admin)
    loadCraPendingBadge();

    // Charger la config CRA pour tous les profils (nécessaire pour les boutons visa)
    fetch(`${API_URL}/settings`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (data.automation_4_config) {
                try {
                    window._craConfig = JSON.parse(data.automation_4_config);
                } catch (e) {}
            }
        })
        .catch(() => {});

    // Démarrer le suivi des utilisateurs connectés en temps réel
    startOnlineUsersPolling();

    // Charger les nouvelles affectations uniquement pour les experts
    console.log('🔍 CurrentUser:', currentUser);
    console.log('🔍 ActiveProfile:', currentUser.activeProfile);
    console.log('🔍 Est expert?', currentUser.activeProfile === 'expert');

    if (currentUser.activeProfile === 'expert') {
        console.log('✅ Profil expert détecté, chargement des notifications...');
        await loadNewAssignments();
        if (sessionFermee()) return;
    } else {
        console.log('⏭️ Pas un expert, pas de notifications');
    }

    setCurrentMonth();

    // Si expert, forcer l'affichage de sa ressource
    if (currentUser.activeProfile === 'expert') {
        updateGantt();
    }

    // Restaurer l'ordre des onglets + activer le drag & drop
    restoreTabOrder();
    initTabDragDrop();

    // Afficher l'onglet par défaut selon la préférence de l'utilisateur
    const defaultTab = currentUser.defaultTab || 'planning'; // Planification par défaut
    const availableTabs = getAvailableTabsForProfile(currentUser.activeProfile);

    // Vérifier que l'onglet par défaut est accessible pour ce profil
    if (availableTabs.includes(defaultTab)) {
        switchTab(defaultTab, null);
    } else {
        // Si l'onglet n'est pas accessible, afficher Planification
        switchTab('planning', null);
    }

    // Deep link CRA depuis email
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'cra') {
        switchTab('cra', null);
        const craId = urlParams.get('cra_id');
        if (craId) setTimeout(() => openCraDetail(parseInt(craId)), 500);
    }

    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginProfile').value = '';
    document.getElementById('profileSelectGroup').style.display = 'none';
    setLoginButtonLabel('Continuer');
    loginStep = 'credentials';
}

// Obtenir la liste des onglets accessibles selon le profil
function getAvailableTabsForProfile(profile) {
    return TabAccess.available(profile);
}

// ========== CHANGEMENT DE MOT DE PASSE OBLIGATOIRE ==========
// Mot de passe donné par un administrateur (compte initial, compte créé ou réinitialisé) : le serveur refuse toute
// autre action tant qu'il n'est pas remplacé (erreur PASSWORD_CHANGE_REQUIRED).

let _forcedPasswordDone = null;

function showForcedPasswordChange(onDone) {
    _forcedPasswordDone = onDone;
    for (const id of ['forcedNewPassword', 'forcedConfirmPassword']) document.getElementById(id).value = '';
    document.getElementById('forcedPasswordError').style.display = 'none';
    document.getElementById('forcedPasswordModal').classList.add('active');
    document.getElementById('forcedNewPassword').focus();
}

async function submitForcedPasswordChange() {
    const newPassword = document.getElementById('forcedNewPassword').value;
    const confirmPassword = document.getElementById('forcedConfirmPassword').value;
    const errorDiv = document.getElementById('forcedPasswordError');
    const fail = message => {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    };
    if (!newPassword) return fail('Saisissez un nouveau mot de passe');
    if (newPassword !== confirmPassword) return fail('Les deux mots de passe ne correspondent pas');
    const button = document.getElementById('forcedPasswordButton');
    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/profile/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ newPassword })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return fail(data.error || 'Impossible de changer le mot de passe');
        document.getElementById('forcedPasswordModal').classList.remove('active');
        const done = _forcedPasswordDone;
        _forcedPasswordDone = null;
        if (done) done(newPassword);
    } catch (error) {
        fail('Erreur de connexion — ' + (error.message || 'réessayez'));
    } finally {
        button.disabled = false;
    }
}

async function cancelForcedPasswordChange() {
    await fetch(`${API_URL}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    location.reload();
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
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

// Interface Vue (îlots, frontend/src/liaison.ts) : données modifiées par un îlot, rechargées pour le reste de la page
window.addEventListener('gp:evenements-modifies', async () => {
    await loadSpecialDates();
    setTimeout(() => updateGantt(), 100);
});
window.addEventListener('gp:planning-modifie', async () => {
    await loadSchedule();
    setTimeout(() => updateGantt(), 100);
});
window.addEventListener('gp:localisations-modifiees', () => loadLocations());
// Accès aux applications de la session relus (l'administrateur a pu modifier les siens) : menu Applications
window.addEventListener('gp:applications-modifiees', async () => {
    try {
        const r = await fetch(`${API_URL}/check-session`, { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        if (data && data.availableApps) {
            currentUser.availableApps = data.availableApps;
            updateAppSwitcher();
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
// Paramétrages divers enregistrés par l'îlot de l'Administration : affichage de la version, compteur
// d'inactivité de la session, favicon
window.addEventListener('gp:version-modifiee', () => loadSettings());
window.addEventListener('gp:inactivite-modifiee', e => {
    if (e.detail.active) startInactivityTimer(e.detail.minutes);
    else stopInactivityTimer();
});
window.addEventListener('gp:favicon-modifie', e => applyFavicon(e.detail.favicon));
// Accès aux onglets enregistrés : barre d'onglets mise à jour
window.addEventListener('gp:onglets-modifies', e => {
    TabAccess.cfg = e.detail.config;
    updateTabsVisibility();
});
