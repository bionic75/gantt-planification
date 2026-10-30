// Application principale : settings
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Écran « Paramétrages divers » de l'Administration : îlot Vue (frontend/src/ilots/admin/parametrages). Restent ici
// l'affichage de la version, le compteur d'inactivité, le favicon et la fenêtre des nouveautés, communs à toute
// l'application (déclenchés par l'îlot : gp:version-modifiee, gp:inactivite-modifiee, gp:favicon-modifie).

// ========== GESTION DE LA VERSION ==========

async function loadAppVersion() {
    try {
        const response = await fetch(`${API_URL}/system/version`);
        if (response.ok) {
            const data = await response.json();
            const versionElement = document.getElementById('appVersion');
            if (versionElement) {
                versionElement.textContent = data.version || '1.0.0';
            }
        }
    } catch (error) {
        console.error('Erreur chargement version:', error);
    }
}

// ========== CHARGEMENT VERSION (PUBLIC) ==========

async function loadVersion() {
    try {
        const response = await fetch(`${API_URL}/version`);
        if (response.ok) {
            const data = await response.json();
            // Mettre à jour tous les éléments avec id="appVersion" (il peut y en avoir plusieurs)
            const appVersionDisplays = document.querySelectorAll('#appVersion, .app-version');
            appVersionDisplays.forEach(el => {
                if (data.version) {
                    el.textContent = data.version;
                }
            });
            console.log('✅ Version chargée (public):', data.version);
            return data.version;
        }
    } catch (error) {
        console.error('Erreur chargement version:', error);
    }
    return null;
}

// Charger la version immédiatement (pour la mire de login)
(async function () {
    await loadVersion();
})();

// ========== CHARGEMENT PARAMÈTRES (AUTHENTIFIÉ) ==========

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/settings`, {
            credentials: 'include'
        });

        if (response.ok) {
            const settings = await response.json();

            // Mettre à jour le span d'affichage de la version (visible par tous)
            const appVersionDisplay = document.getElementById('appVersion');
            if (appVersionDisplay && settings.app_version) {
                appVersionDisplay.textContent = settings.app_version;
            }

            // Appliquer le favicon actuel
            if (settings.favicon) {
                applyFavicon(settings.favicon);
            }

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

function openHelp(anchor) {
    const url = anchor ? `/aide.html#${anchor}` : '/aide.html';
    window.open(url, '_blank', 'width=1200,height=800');
}

async function checkHelpVersionPopup() {
    try {
        const res = await fetch(`${API_URL}/settings`, { credentials: 'include' });
        const settings = await res.json();
        const pubEnabled = settings.help_publication_enabled === 'true';
        const pubVersion = settings.help_publication_version || '';
        const pubTimestamp = settings.help_publication_timestamp || pubVersion;

        if (!pubEnabled || !pubVersion) return;

        // La clé inclut le timestamp → chaque nouvelle publication force le réaffichage
        const seenKey = `help_seen_${currentUser.id}_${pubTimestamp}`;
        if (localStorage.getItem(seenKey)) return;
        localStorage.setItem(seenKey, 'true');

        document.getElementById('helpVersionModalTitle').textContent = pubVersion;

        // Charger aide.html et extraire UNIQUEMENT le bloc de la version publiée
        try {
            const helpRes = await fetch('/aide.html');
            const html = await helpRes.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Chercher le bloc de version par son texte (strong dans .card)
            let versionBlock = null;
            const cards = doc.querySelectorAll('#section-notes-version .card, #section-notes-version [class*="card"]');
            for (const card of cards) {
                const strong = card.querySelector('strong');
                if (strong && strong.textContent.trim() === pubVersion) {
                    versionBlock = card;
                    break;
                }
            }

            if (versionBlock) {
                document.getElementById('helpVersionModalContent').innerHTML = versionBlock.outerHTML;
            } else {
                // Fallback : toute la section notes de version
                const section = doc.getElementById('section-notes-version');
                document.getElementById('helpVersionModalContent').innerHTML = section
                    ? section.outerHTML
                    : `<p>Consultez la page d'aide pour les détails de la version ${pubVersion}.</p>`;
            }
        } catch (e) {
            document.getElementById('helpVersionModalContent').innerHTML =
                `<p>Consultez la page d'aide pour les détails de la version ${pubVersion}.</p>`;
        }

        document.getElementById('helpVersionModal').classList.add('active');
    } catch (e) {
        console.warn('Impossible de vérifier la popup aide:', e);
    }
}

function closeHelpVersionModal() {
    document.getElementById('helpVersionModal').classList.remove('active');
}

function applyFavicon(faviconName) {
    // Récupérer ou créer le lien favicon
    let faviconLink = document.querySelector('link[rel="icon"]');

    if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        faviconLink.type = 'image/svg+xml';
        document.head.appendChild(faviconLink);
    }

    // Mettre à jour le href avec le bon chemin
    faviconLink.href = `/img/favicon-${faviconName}.svg?t=${Date.now()}`;

    console.log(`✅ Favicon appliqué: ${faviconName}, href: ${faviconLink.href}`);
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

    await saveAssignmentLogs();
    await performLogout();
}
