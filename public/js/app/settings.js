// Application principale : settings
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Écran « Paramétrages divers » de l'Administration : îlot Vue (frontend/src/ilots/admin/parametrages). Restent ici
// le compteur d'inactivité (gp:version-modifiee, gp:inactivite-modifiee). Favicon, nouveautés de l'aide, bandeau de
// mise en production : îlots Vue (frontend/src/ilots/entete).

// Version affichée sur la mire de connexion : îlot Vue (frontend/src/connexion/MireConnexion.vue)

// ========== CHARGEMENT PARAMÈTRES (AUTHENTIFIÉ) ==========

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/settings`, {
            credentials: 'include'
        });

        if (response.ok) {
            const settings = await response.json();

            // Démarrer le compteur d'inactivité si activé (pour tous les utilisateurs)
            if (settings.inactivity_enabled === 'true') {
                const timeout = parseInt(settings.inactivity_timeout) || 15;
                console.log(`Démarrage du timer d'inactivité: ${timeout} minutes`);
                startInactivityTimer(timeout);
            } else {
                console.log("Timer d'inactivité désactivé dans les paramètres");
            }
        }
    } catch (error) {
        console.error('Erreur chargement settings:', error);
    }
}

// Variables globales pour le timer d'inactivité
let inactivityTimer = null;
let inactivityCountdownInterval = null;
let inactivityTimeout = 15; // minutes par défaut
let inactivityTimeRemaining = 0; // secondes restantes
let lastActivityTime = Date.now();

function startInactivityTimer(timeoutMinutes) {
    stopInactivityTimer(); // Arrêter le timer existant

    inactivityTimeout = timeoutMinutes;
    inactivityTimeRemaining = timeoutMinutes * 60; // Convertir en secondes
    lastActivityTime = Date.now();

    console.log(`Timer d'inactivité démarré: ${timeoutMinutes} minutes`);

    // Afficher le timer
    const timerDisplay = document.getElementById('inactivityTimerDisplay');
    if (timerDisplay) {
        timerDisplay.style.display = 'flex';
        updateTimerDisplay();
    }

    // Mettre à jour l'affichage chaque seconde
    inactivityCountdownInterval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - lastActivityTime) / 1000);
        inactivityTimeRemaining = timeoutMinutes * 60 - elapsedSeconds;

        if (inactivityTimeRemaining <= 0) {
            console.log("⏰ Timer d'inactivité terminé! Affichage de la popup...");
            clearInterval(inactivityCountdownInterval);
            inactivityCountdownInterval = null;
            showInactivityModal();
        } else {
            updateTimerDisplay();

            // Changer la couleur si moins de 1 minute restante
            if (timerDisplay) {
                if (inactivityTimeRemaining <= 60) {
                    timerDisplay.style.color = '#e74c3c';
                    timerDisplay.style.fontWeight = 'bold';
                } else if (inactivityTimeRemaining <= 120) {
                    timerDisplay.style.color = '#f39c12';
                } else {
                    timerDisplay.style.color = '#2c3e50';
                }
            }
        }
    }, 1000);

    // Réinitialiser le timer UNIQUEMENT sur clic de souris
    const resetTimer = () => {
        lastActivityTime = Date.now();
        inactivityTimeRemaining = timeoutMinutes * 60;

        // Réinitialiser la couleur
        const timerDisplay = document.getElementById('inactivityTimerDisplay');
        if (timerDisplay) {
            timerDisplay.style.color = '#2c3e50';
            timerDisplay.style.fontWeight = 'bold';
        }
    };

    // Surveiller uniquement les clics de souris (mousedown) et les touches clavier
    document.addEventListener('mousedown', resetTimer, true);
    document.addEventListener('keypress', resetTimer, true);
}

/** Secondes restantes avant la déconnexion pour inactivité (minuteur des applications en îlot, frontend/src/liaison.ts) */
function inactiviteRestante() {
    return inactivityTimeRemaining;
}

function updateTimerDisplay() {
    const minutes = Math.floor(inactivityTimeRemaining / 60);
    const seconds = inactivityTimeRemaining % 60;

    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');

    const minutesEl = document.getElementById('timerMinutes');
    const secondsEl = document.getElementById('timerSeconds');

    if (minutesEl) minutesEl.textContent = minutesStr;
    if (secondsEl) secondsEl.textContent = secondsStr;
}

function stopInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    if (inactivityCountdownInterval) {
        clearInterval(inactivityCountdownInterval);
        inactivityCountdownInterval = null;
    }

    // Cacher le timer
    const timerDisplay = document.getElementById('inactivityTimerDisplay');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }

    console.log("Timer d'inactivité arrêté");
}

let _inactivityCountdownTimer = null;
let _inactivityDisconnecting = false;

async function showInactivityModal() {
    console.log('🔔 showInactivityModal appelé');

    if (_inactivityDisconnecting) return;

    // Suspendre le timer principal (déjà arrêté via clearInterval, mais on s'assure)
    if (inactivityCountdownInterval) {
        clearInterval(inactivityCountdownInterval);
        inactivityCountdownInterval = null;
    }

    // Mettre à jour le message
    const minutesEl = document.getElementById('inactivityModalMinutes');
    if (minutesEl) minutesEl.textContent = inactivityTimeout;

    // Afficher la modale
    const modal = document.getElementById('inactivityModal');
    if (modal) modal.classList.add('active');

    // Lancer le countdown de 15 secondes
    let remaining = 15;
    const countdownEl = document.getElementById('inactivityCountdown');
    if (countdownEl) countdownEl.textContent = remaining;

    _inactivityCountdownTimer = setInterval(async () => {
        remaining--;
        if (countdownEl) countdownEl.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(_inactivityCountdownTimer);
            _inactivityCountdownTimer = null;
            await disconnectNow();
        }
    }, 1000);
}

function hideInactivityModal() {
    if (_inactivityCountdownTimer) {
        clearInterval(_inactivityCountdownTimer);
        _inactivityCountdownTimer = null;
    }
    const modal = document.getElementById('inactivityModal');
    if (modal) modal.classList.remove('active');
}

function stayConnected() {
    hideInactivityModal();
    _inactivityDisconnecting = false;
    console.log('🔄 Utilisateur souhaite rester connecté — relance du timer');
    startInactivityTimer(inactivityTimeout);
}

async function disconnectNow() {
    if (_inactivityDisconnecting) return;
    _inactivityDisconnecting = true;

    hideInactivityModal();
    stopInactivityTimer();
    console.log('👋 Déconnexion automatique par inactivité');

    // Affectations en attente d'invitation journalisées par l'en-tête (îlot Vue frontend/src/ilots/entete)
    await new Promise(fin => window.dispatchEvent(new CustomEvent('gp:journal-invitations', { detail: { fin } })));
    await performLogout();
}
