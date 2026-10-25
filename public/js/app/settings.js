// Application principale : settings
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ==================== NOUVELLES FONCTIONS ====================

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
            const adminVersionInput = document.getElementById('adminVersion');
            if (adminVersionInput) {
                adminVersionInput.value = data.version || '1.0.0';
            }
        }
    } catch (error) {
        console.error('Erreur chargement version:', error);
    }
}

// ========== GESTION DES PARAMÈTRES DIVERS ==========

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
    console.log('🔄 loadSettings() appelé');
    try {
        const response = await fetch(`${API_URL}/settings`, {
            credentials: 'include'
        });

        console.log('📥 GET /api/settings - Status:', response.status);

        if (response.ok) {
            const settings = await response.json();
            console.log('📥 Settings reçus:', settings);

            // Charger la version de l'application (uniquement si l'élément existe - admin)
            const appVersionInput = document.getElementById('appVersionInput');
            console.log('🔍 Element appVersionInput:', appVersionInput);

            if (appVersionInput && settings.app_version) {
                console.log('✅ Chargement version dans input:', settings.app_version);
                appVersionInput.value = settings.app_version;
            } else {
                console.log('⚠️ Pas de chargement version:', {
                    inputExists: !!appVersionInput,
                    hasVersion: !!settings.app_version
                });
            }

            // Mettre à jour le span d'affichage de la version (visible par tous)
            const appVersionDisplay = document.getElementById('appVersion');
            if (appVersionDisplay && settings.app_version) {
                console.log('✅ Mise à jour affichage version:', settings.app_version);
                appVersionDisplay.textContent = settings.app_version;
            }

            // Charger les paramètres d'inactivité (uniquement si les éléments existent - admin)
            const inactivityEnabledEl = document.getElementById('inactivityEnabled');
            const inactivityTimeoutEl = document.getElementById('inactivityTimeout');

            if (inactivityEnabledEl && settings.inactivity_enabled) {
                inactivityEnabledEl.checked = settings.inactivity_enabled === 'true';
                toggleInactivityTimeout();
            }

            if (inactivityTimeoutEl && settings.inactivity_timeout) {
                inactivityTimeoutEl.value = settings.inactivity_timeout;
            }

            // Charger le favicon sélectionné
            const faviconSelect = document.getElementById('faviconSelect');
            if (faviconSelect && settings.favicon) {
                faviconSelect.value = settings.favicon;
                renderFaviconPicker();
            }

            // Appliquer le favicon actuel
            if (settings.favicon) {
                applyFavicon(settings.favicon);
            }

            // Aide en ligne — version label et publication
            const vLabel = document.getElementById('currentVersionLabel');
            if (vLabel && settings.app_version) vLabel.textContent = settings.app_version;
            const helpPub = document.getElementById('helpPublicationEnabled');
            if (helpPub) helpPub.checked = settings.help_publication_enabled === 'true';
            loadHelpFileInfo();

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

async function saveHelpPublication() {
    const enabled = document.getElementById('helpPublicationEnabled').checked;
    try {
        const vRes = await fetch(`${API_URL}/settings`, { credentials: 'include' });
        const vData = await vRes.json();
        const version = vData.app_version || '';

        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: 'help_publication_enabled', value: enabled ? 'true' : 'false' })
        });
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: 'help_publication_version', value: version })
        });
        // Stocker un timestamp unique de publication → force la réaffichage pour tous les utilisateurs
        const pubTimestamp = Date.now().toString();
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: 'help_publication_timestamp', value: pubTimestamp })
        });

        alert(
            enabled
                ? `Publication activée pour la version ${version}.\nLa popup s'affichera à la prochaine connexion de chaque utilisateur.`
                : 'Publication désactivée.'
        );
    } catch (e) {
        alert('Erreur sauvegarde');
    }
}

async function uploadHelpFile() {
    const file = document.getElementById('helpFileInput').files[0];
    if (!file) return alert('Sélectionnez un fichier HTML');
    const status = document.getElementById('helpUploadStatus');
    status.textContent = 'Upload en cours...';
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const res = await fetch(`${API_URL}/help/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content: e.target.result })
            });
            const data = await res.json();
            if (data.success) {
                status.style.color = 'green';
                status.textContent = "✅ Page d'aide mise à jour avec succès";
                loadHelpFileInfo();
            } else {
                throw new Error(data.error);
            }
        } catch (e) {
            status.style.color = 'red';
            status.textContent = '❌ Erreur : ' + e.message;
        }
    };
    reader.readAsText(file);
}

async function loadHelpFileInfo() {
    try {
        const res = await fetch(`${API_URL}/help/info`, { credentials: 'include' });
        const data = await res.json();
        const el = document.getElementById('helpCurrentFile');
        if (!el) return;
        if (data.exists) {
            const d = new Date(data.updatedAt);
            el.innerHTML = `📄 Page d'aide active — mise à jour le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR')} — <button onclick="deleteHelpFile()" style="background:none;border:none;color:#c0392b;cursor:pointer;text-decoration:underline;font-size:12px;padding:0;">🗑️ Supprimer (revenir à la page par défaut)</button>`;
        } else {
            el.textContent = "Page d'aide par défaut (aucun fichier uploadé)";
        }
    } catch (e) {
        const el = document.getElementById('helpCurrentFile');
        if (el) el.textContent = 'Impossible de vérifier le fichier';
    }
}

async function deleteHelpFile() {
    if (!confirm("Supprimer la page d'aide uploadée et revenir à la page par défaut ?")) return;
    try {
        await fetch(`${API_URL}/help/upload`, { method: 'DELETE', credentials: 'include' });
        loadHelpFileInfo();
    } catch (e) {
        alert('Erreur suppression');
    }
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

function toggleInactivityTimeout() {
    const enabled = document.getElementById('inactivityEnabled');
    const timeoutGroup = document.getElementById('inactivityTimeoutGroup');

    // Vérifier que les éléments existent avant de les manipuler
    if (!enabled || !timeoutGroup) {
        return;
    }

    if (enabled.checked) {
        timeoutGroup.style.display = 'block';
    } else {
        timeoutGroup.style.display = 'none';
    }
}

const FAVICON_CHOICES = [
    { id: 'calendrier', label: 'Calendrier', hint: 'Planning par jour' },
    { id: 'gantt', label: 'Gantt', hint: 'Barres de planification' },
    { id: 'grille', label: 'Grille', hint: 'Affectations par case' },
    { id: 'timeline', label: 'Timeline', hint: 'Expert dans le temps' }
];
function renderFaviconPicker() {
    const sel = document.getElementById('faviconSelect');
    const box = document.getElementById('faviconPicker');
    if (!sel || !box) return;
    const cur = sel.value || 'calendrier';
    box.innerHTML = FAVICON_CHOICES.map(
        c => `
                <div onclick="pickFavicon('${c.id}')" role="radio" aria-checked="${c.id === cur}" tabindex="0"
                     onkeydown="if(event.key==='Enter'||event.key===' '){pickFavicon('${c.id}');event.preventDefault();}"
                     style="width:120px;padding:12px 8px 10px;border:2px solid ${c.id === cur ? '#3949ab' : '#d5dae6'};border-radius:12px;background:${c.id === cur ? '#eef0fb' : '#fff'};text-align:center;cursor:pointer;position:relative;transition:all .15s;">
                    ${c.id === cur ? `<span style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#3949ab;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style="fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;"><path d="m5 12 5 5L20 7"/></svg></span>` : ''}
                    <img src="/img/favicon-${c.id}.svg" alt="" width="52" height="52" style="display:block;margin:0 auto 8px;border-radius:12px;box-shadow:0 3px 10px rgba(0,0,0,.18);">
                    <div style="font-size:13px;font-weight:bold;color:#2c3e50;">${c.label}</div>
                    <div style="font-size:10.5px;color:#7a8799;margin-top:2px;">${c.hint}</div>
                </div>`
    ).join('');
    const mock = document.getElementById('faviconTabMock');
    if (mock)
        mock.innerHTML = `<img src="/img/favicon-${cur}.svg" alt="" width="16" height="16" style="border-radius:4px;"> Plateforme de Planification`;
}
function pickFavicon(id) {
    const sel = document.getElementById('faviconSelect');
    if (!sel) return;
    sel.value = id;
    renderFaviconPicker();
}
document.addEventListener('DOMContentLoaded', renderFaviconPicker);

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

function previewFavicon() {
    const faviconName = document.getElementById('faviconSelect').value;
    // Ne pas appliquer directement, juste un aperçu visuel si nécessaire
    console.log(`📋 Favicon sélectionné: ${faviconName} (sauvegardez pour appliquer)`);
}

async function saveSettings() {
    const enabled = document.getElementById('inactivityEnabled').checked;
    const timeout = document.getElementById('inactivityTimeout').value;
    const favicon = document.getElementById('faviconSelect').value;

    try {
        // Sauvegarder l'activation
        await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'inactivity_enabled',
                value: enabled.toString()
            })
        });

        // Sauvegarder le timeout
        await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'inactivity_timeout',
                value: timeout
            })
        });

        // Sauvegarder le favicon
        await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'favicon',
                value: favicon
            })
        });

        // Appliquer le nouveau favicon
        applyFavicon(favicon);

        alert('✅ Paramètres sauvegardés');

        // Redémarrer le timer si activé
        if (enabled) {
            startInactivityTimer(parseInt(timeout));
        } else {
            stopInactivityTimer();
        }
    } catch (error) {
        console.error('Erreur sauvegarde settings:', error);
        alert('Erreur lors de la sauvegarde');
    }
}

// Nouvelles fonctions de sauvegarde individuelles
async function saveAppVersion() {
    const input = document.getElementById('appVersionInput');
    console.log('🔍 Element appVersionInput:', input);
    console.log('🔍 Value:', input ? input.value : 'ELEMENT NOT FOUND');

    const version = input ? input.value : null;
    if (!version) {
        alert('⚠️ Veuillez saisir une version');
        return;
    }

    console.log('📤 Envoi requête PUT /api/settings avec:', { key: 'app_version', value: version });

    try {
        const response = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'app_version',
                value: version
            })
        });

        console.log('📥 Response status:', response.status);
        console.log('📥 Response ok:', response.ok);

        const data = await response.json();
        console.log('📥 Response data:', data);

        if (data.success) {
            alert('✅ Version sauvegardée');
            console.log('🔄 Appel loadSettings()...');
            loadSettings(); // Recharger pour mettre à jour l'affichage
        } else {
            alert('❌ Erreur lors de la sauvegarde');
            console.error('❌ Erreur:', data);
        }
    } catch (error) {
        console.error('❌ Exception:', error);
        alert('❌ Erreur lors de la sauvegarde');
    }
}

async function saveInactivityConfig() {
    const enabled = document.getElementById('inactivityEnabled').checked;
    const timeout = document.getElementById('inactivityTimeout').value;

    try {
        const response1 = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'inactivity_enabled',
                value: enabled.toString()
            })
        });

        const response2 = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'inactivity_timeout',
                value: timeout
            })
        });

        const data1 = await response1.json();
        const data2 = await response2.json();

        if (data1.success && data2.success) {
            alert("✅ Configuration d'inactivité sauvegardée");

            if (enabled) {
                startInactivityTimer(parseInt(timeout));
            } else {
                stopInactivityTimer();
            }
        } else {
            alert('❌ Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur sauvegarde inactivité:', error);
        alert('❌ Erreur lors de la sauvegarde');
    }
}

async function saveFavicon() {
    const favicon = document.getElementById('faviconSelect').value;

    try {
        await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                key: 'favicon',
                value: favicon
            })
        });

        applyFavicon(favicon);
        alert('✅ Favicon sauvegardé');
    } catch (error) {
        console.error('Erreur sauvegarde favicon:', error);
        alert('❌ Erreur lors de la sauvegarde');
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
