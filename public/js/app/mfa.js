// Application principale : mfa
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== FONCTIONS MFA ==========

// Toggle affichage configuration MFA
function toggleMfaConfig() {
    const enabled = document.getElementById('mfaEnabled').checked;
    document.getElementById('mfaConfig').style.display = enabled ? 'block' : 'none';
    saveMfaConfig();
}

// Charger la configuration MFA
async function loadMfaConfig() {
    try {
        const response = await fetch(`${API_URL}/mfa/config`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.config) {
                document.getElementById('mfaEnabled').checked = data.config.enabled || false;
                document.getElementById('mfaConfig').style.display = data.config.enabled ? 'block' : 'none';

                // Méthode
                const methodRadios = document.querySelectorAll('input[name="mfaMethod"]');
                methodRadios.forEach(radio => {
                    radio.checked = radio.value === (data.config.method || 'email');
                });

                // Fréquence
                document.getElementById('mfaFrequency').value = data.config.frequency || 'daily';

                // Profils
                document.getElementById('mfaProfileAdmin').checked = data.config.profileAdmin !== false;
                document.getElementById('mfaProfileExpert').checked = data.config.profileExpert || false;
                document.getElementById('mfaProfileUser').checked = data.config.profileUser || false;

                // Validité du code
                document.getElementById('mfaCodeValidity').value = data.config.codeValidity || '10';
            }
        }
    } catch (error) {
        console.error('Erreur chargement config MFA:', error);
    }
}

// Sauvegarder la configuration MFA
async function saveMfaConfig() {
    const methodRadio = document.querySelector('input[name="mfaMethod"]:checked');

    const config = {
        enabled: document.getElementById('mfaEnabled').checked,
        method: methodRadio ? methodRadio.value : 'email',
        frequency: document.getElementById('mfaFrequency').value,
        profileAdmin: document.getElementById('mfaProfileAdmin').checked,
        profileExpert: document.getElementById('mfaProfileExpert').checked,
        profileUser: document.getElementById('mfaProfileUser').checked,
        codeValidity: parseInt(document.getElementById('mfaCodeValidity').value)
    };

    try {
        const response = await fetch(`${API_URL}/mfa/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ config })
        });

        if (response.ok) {
            console.log('✅ Configuration MFA sauvegardée');
        }
    } catch (error) {
        console.error('Erreur sauvegarde config MFA:', error);
    }
}

// Réinitialiser le MFA de tous les utilisateurs
async function resetAllUsersMfa() {
    if (
        !confirm(
            '⚠️ Êtes-vous sûr de vouloir réinitialiser le MFA de tous les utilisateurs ?\n\nTous les utilisateurs devront reconfigurer leur authentification TOTP.'
        )
    ) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/mfa/reset-all`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            alert('✅ MFA réinitialisé pour tous les utilisateurs');
        } else {
            const data = await response.json();
            alert('❌ Erreur: ' + (data.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur reset MFA:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Initier MFA par email
async function initiateMfaEmail(userId, profile, app) {
    try {
        const response = await fetch(`${API_URL}/mfa/send-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId })
        });

        if (response.ok) {
            document.getElementById('mfaPendingUserId').value = userId;
            document.getElementById('mfaPendingProfile').value = profile;
            document.getElementById('mfaPendingApp').value = app;

            document.getElementById('mfaCodeIcon').textContent = '📧';
            document.getElementById('mfaCodeMessage').textContent =
                'Un code de vérification a été envoyé à votre adresse email.';
            document.getElementById('mfaCodeInput').value = '';
            document.getElementById('mfaCodeError').style.display = 'none';
            document.getElementById('mfaResendButton').style.display = 'block';

            document.getElementById('mfaCodeModal').classList.add('active');
            document.getElementById('mfaCodeInput').focus();
        } else {
            const data = await response.json();
            const msg = data.error || 'Erreur envoi du code';
            // Si SMTP indisponible, proposer de basculer sur TOTP
            if (msg.includes('SMTP') || msg.includes('timeout') || msg.includes('Configuration')) {
                showLoginError(`❌ ${msg}`);
            } else {
                showLoginError(msg);
            }
        }
    } catch (error) {
        console.error('Erreur MFA email:', error);
        showLoginError(
            "Erreur réseau lors de l'envoi du code. Vérifiez la configuration SMTP ou utilisez le code TOTP."
        );
    }
}

// Afficher la vérification TOTP
function showMfaTotpVerification(userId, profile, app) {
    document.getElementById('mfaPendingUserId').value = userId;
    document.getElementById('mfaPendingProfile').value = profile;
    document.getElementById('mfaPendingApp').value = app;

    document.getElementById('mfaCodeIcon').textContent = '📱';
    document.getElementById('mfaCodeMessage').textContent =
        "Entrez le code affiché dans votre application d'authentification.";
    document.getElementById('mfaCodeInput').value = '';
    document.getElementById('mfaCodeError').style.display = 'none';
    document.getElementById('mfaResendButton').style.display = 'none';

    document.getElementById('mfaCodeModal').classList.add('active');
    document.getElementById('mfaCodeInput').focus();
}

// Vérifier le code MFA
async function verifyMfaCode() {
    const code = document.getElementById('mfaCodeInput').value.trim();
    const userId = document.getElementById('mfaPendingUserId').value;
    const profile = document.getElementById('mfaPendingProfile').value;
    const app = document.getElementById('mfaPendingApp').value;

    if (code.length !== 6) {
        document.getElementById('mfaCodeError').textContent = 'Le code doit contenir 6 chiffres';
        document.getElementById('mfaCodeError').style.display = 'block';
        return;
    }

    document.getElementById('mfaVerifyButton').disabled = true;
    document.getElementById('mfaVerifyButton').textContent = 'Vérification...';

    try {
        const response = await fetch(`${API_URL}/mfa/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId, code, profile })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            await completeFinalLogin(data.user, app);
        } else {
            document.getElementById('mfaCodeError').textContent = data.error || 'Code invalide';
            document.getElementById('mfaCodeError').style.display = 'block';
            document.getElementById('mfaCodeInput').value = '';
            document.getElementById('mfaCodeInput').focus();
        }
    } catch (error) {
        console.error('Erreur vérification MFA:', error);
        document.getElementById('mfaCodeError').textContent = 'Erreur de vérification';
        document.getElementById('mfaCodeError').style.display = 'block';
    } finally {
        document.getElementById('mfaVerifyButton').disabled = false;
        document.getElementById('mfaVerifyButton').textContent = '✓ Vérifier';
    }
}

// Renvoyer le code MFA par email
async function resendMfaCode() {
    const userId = document.getElementById('mfaPendingUserId').value;

    document.getElementById('mfaResendButton').disabled = true;
    document.getElementById('mfaResendButton').textContent = 'Envoi en cours...';

    try {
        const response = await fetch(`${API_URL}/mfa/send-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId })
        });

        if (response.ok) {
            document.getElementById('mfaResendButton').textContent = '✓ Code envoyé !';
            setTimeout(() => {
                document.getElementById('mfaResendButton').textContent = '📧 Renvoyer le code';
                document.getElementById('mfaResendButton').disabled = false;
            }, 3000);
        } else {
            document.getElementById('mfaResendButton').textContent = '❌ Erreur';
            setTimeout(() => {
                document.getElementById('mfaResendButton').textContent = '📧 Renvoyer le code';
                document.getElementById('mfaResendButton').disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Erreur renvoi code:', error);
        document.getElementById('mfaResendButton').textContent = '📧 Renvoyer le code';
        document.getElementById('mfaResendButton').disabled = false;
    }
}

// Annuler le login MFA
function cancelMfaLogin() {
    document.getElementById('mfaCodeModal').classList.remove('active');
    document.getElementById('mfaTotpSetupModal').classList.remove('active');
    document.getElementById('mfaMethodChoiceModal').classList.remove('active');

    // Réinitialiser le formulaire de login
    document.getElementById('loginPassword').value = '';
    document.getElementById('profileSelectGroup').style.display = 'none';
    setLoginButtonLabel('Continuer');
    loginStep = 'credentials';
}

// Choisir la méthode MFA
async function chooseMfaMethod(method) {
    const userId = document.getElementById('mfaMethodPendingUserId').value;
    const profile = document.getElementById('mfaMethodPendingProfile').value;
    const app = document.getElementById('mfaMethodPendingApp').value;

    document.getElementById('mfaMethodChoiceModal').classList.remove('active');

    if (method === 'email') {
        await initiateMfaEmail(userId, profile, app);
    } else if (method === 'totp') {
        // Vérifier si TOTP est déjà configuré
        try {
            const response = await fetch(`${API_URL}/mfa/totp-status/${userId}`, { credentials: 'include' });
            const data = await response.json();

            if (data.configured) {
                showMfaTotpVerification(userId, profile, app);
            } else {
                await setupTotpForUser(userId, profile, app);
            }
        } catch (error) {
            console.error('Erreur TOTP status:', error);
            showLoginError('Erreur de vérification TOTP');
        }
    }
}

// Configurer TOTP pour un utilisateur
async function setupTotpForUser(userId, profile, app) {
    try {
        const response = await fetch(`${API_URL}/mfa/totp-setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('mfaTotpPendingSecret').value = data.secret;
            document.getElementById('mfaTotpPendingUserId').value = userId;
            document.getElementById('mfaPendingProfile').value = profile;
            document.getElementById('mfaPendingApp').value = app;

            // Afficher le QR code
            document.getElementById('mfaTotpQrCode').innerHTML =
                `<img src="${data.qrCode}" alt="QR Code" style="width: 200px; height: 200px;">`;
            document.getElementById('mfaTotpSecret').textContent = data.secret;
            document.getElementById('mfaTotpConfirmCode').value = '';
            document.getElementById('mfaTotpSetupError').style.display = 'none';

            document.getElementById('mfaTotpSetupModal').classList.add('active');
        } else {
            showLoginError(data.error || 'Erreur configuration TOTP');
        }
    } catch (error) {
        console.error('Erreur setup TOTP:', error);
        showLoginError('Erreur configuration TOTP');
    }
}

// Confirmer la configuration TOTP
async function confirmTotpSetup() {
    const code = document.getElementById('mfaTotpConfirmCode').value.trim();
    const secret = document.getElementById('mfaTotpPendingSecret').value;
    const userId = document.getElementById('mfaTotpPendingUserId').value;
    const profile = document.getElementById('mfaPendingProfile').value;
    const app = document.getElementById('mfaPendingApp').value;

    if (code.length !== 6) {
        document.getElementById('mfaTotpSetupError').textContent = 'Le code doit contenir 6 chiffres';
        document.getElementById('mfaTotpSetupError').style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/mfa/totp-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId, secret, code, profile })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            await completeFinalLogin(data.user, app);
        } else {
            document.getElementById('mfaTotpSetupError').textContent = data.error || 'Code invalide';
            document.getElementById('mfaTotpSetupError').style.display = 'block';
            document.getElementById('mfaTotpConfirmCode').value = '';
        }
    } catch (error) {
        console.error('Erreur confirm TOTP:', error);
        document.getElementById('mfaTotpSetupError').textContent = 'Erreur de vérification';
        document.getElementById('mfaTotpSetupError').style.display = 'block';
    }
}

// Annuler la configuration TOTP
function cancelTotpSetup() {
    document.getElementById('mfaTotpSetupModal').classList.remove('active');
    cancelMfaLogin();
}

// ========== FIN FONCTIONS MFA ==========

function updateUserDisplay() {
    if (!currentUser) {
        document.getElementById('userInfo').style.display = 'none';
        return;
    }

    // Vérifier que les données essentielles existent
    if (!currentUser.nom || !currentUser.prenom || !currentUser.activeProfile) {
        document.getElementById('userInfo').style.display = 'none';
        return;
    }

    console.log('👤 Current user:', currentUser);

    const userName = `${currentUser.nom.toUpperCase()} ${currentUser.prenom}`;
    const roleMap = {
        admin: 'Administrateur',
        expert: 'Expert Métier',
        user: 'Utilisateur'
    };
    const roleName = roleMap[currentUser.activeProfile] || currentUser.activeProfile;

    document.getElementById('userDisplayName').textContent = userName;
    document.getElementById('userDisplayRole').textContent = roleName;
    document.getElementById('userInfo').style.display = 'flex';

    // Sélecteur de profil multi-profil
    const profileLabels = { admin: 'Administrateur', expert: 'Expert Métier', user: 'Utilisateur', rh: 'RH' };
    const profileColors = { admin: '#c0392b', expert: '#e67e22', user: '#2980b9', rh: '#8e44ad' };
    const availProfiles = [];
    if (currentUser.is_admin) availProfiles.push('admin');
    if (currentUser.is_expert) availProfiles.push('expert');
    if (currentUser.is_rh) availProfiles.push('rh');
    if (currentUser.is_user) availProfiles.push('user');
    const switcher = document.getElementById('profileSwitcher');
    const switcherLabel = document.getElementById('profileSwitcherLabel');
    if (availProfiles.length > 1 && switcher) {
        switcherLabel.textContent = profileLabels[currentUser.activeProfile] || currentUser.activeProfile;
        document.getElementById('userDisplayRole').style.display = 'none';
        switcher.style.display = 'inline-flex';
        const dropdown = document.getElementById('profileDropdown');
        dropdown.innerHTML = availProfiles
            .map(p => {
                const isActive = p === currentUser.activeProfile;
                return `<div onclick="switchToProfile('${p}')" style="padding:10px 16px;font-size:13px;color:#222;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee;background:${isActive ? '#f0f4ff' : 'white'};transition:background .15s;" onmouseover="this.style.background='#e8eeff'" onmouseout="this.style.background='${isActive ? '#f0f4ff' : 'white'}'">
                        <span style="width:10px;height:10px;border-radius:50%;background:${profileColors[p]};display:inline-block;flex-shrink:0;box-shadow:0 0 0 2px ${isActive ? profileColors[p] + '44' : 'transparent'};"></span>
                        <span style="flex:1;font-weight:${isActive ? '600' : '400'};">${profileLabels[p] || p}</span>
                        ${isActive ? '<span style="color:#27ae60;font-size:14px;font-weight:bold;">✓</span>' : ''}
                    </div>`;
            })
            .join('');
    } else if (switcher) {
        switcher.style.display = 'none';
        document.getElementById('userDisplayRole').style.display = '';
    }

    // Stocker les infos utilisateur pour la modal de demande
    currentUserInfo = {
        prenom: currentUser.prenom,
        nom: currentUser.nom.toUpperCase(),
        email: currentUser.email,
        profile: currentUser.activeProfile
    };

    console.log('✅ Current user info stocké:', currentUserInfo);

    // Afficher le bouton "Faire une demande" pour admin et user
    const requestBtn = document.getElementById('requestBtn');
    if (currentUser.activeProfile === 'admin' || currentUser.activeProfile === 'user') {
        requestBtn.style.display = 'inline-block';
    } else {
        requestBtn.style.display = 'none';
    }

    // Afficher le bouton d'envoi d'email (masqué pour le profil RH)
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    sendEmailBtn.style.display = currentUser.activeProfile === 'rh' ? 'none' : 'inline-block';
    if (currentUser.activeProfile !== 'rh') updatePendingEmailBadge();

    // Démarrer la vérification des notifications pour les experts
    if (currentUser.activeProfile === 'expert') {
        // Pour les experts : utiliser le système de notifications d'affectations
        loadNewAssignments(); // Vérification immédiate

        // Vérifier toutes les 30 secondes
        if (notificationCheckInterval) {
            clearInterval(notificationCheckInterval);
        }
        notificationCheckInterval = setInterval(loadNewAssignments, 30000);
    }

    // Mettre à jour l'affichage de la photo de profil
    updateProfileDisplay();
}
