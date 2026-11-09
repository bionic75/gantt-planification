// Application principale : password-reset
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ----- Nouveau mot de passe depuis le lien reçu par email -----
let passwordResetToken = null;

function showNewPasswordMessage(text, ok) {
    const messageDiv = document.getElementById('newPasswordMessage');
    messageDiv.style.display = 'block';
    messageDiv.style.backgroundColor = ok ? '#d4edda' : '#f8d7da';
    messageDiv.style.color = ok ? '#155724' : '#721c24';
    messageDiv.textContent = text;
}

// Au chargement : le jeton est retiré de l'URL (historique, en-tête Referer) puis vérifié
async function openPasswordResetFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (!token) return;
    params.delete('reset_token');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);

    passwordResetToken = token;
    document.getElementById('newPasswordModal').classList.add('active');
    document.getElementById('newPasswordMessage').style.display = 'none';
    try {
        const response = await fetch(`${API_URL}/reset-password/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Lien invalide');
        document.getElementById('newPasswordRule').textContent = `Règle : ${data.passwordRule}.`;
        document.getElementById('newPasswordForm').style.display = 'block';
        document.getElementById('newPasswordButton').style.display = '';
    } catch (error) {
        passwordResetToken = null;
        document.getElementById('newPasswordForm').style.display = 'none';
        document.getElementById('newPasswordButton').style.display = 'none';
        showNewPasswordMessage('❌ ' + error.message, false);
    }
}

async function submitNewPassword() {
    const newPassword = document.getElementById('newPasswordValue').value;
    const confirmation = document.getElementById('newPasswordConfirm').value;
    if (!passwordResetToken) return;
    if (newPassword !== confirmation) {
        showNewPasswordMessage('❌ Les deux mots de passe ne correspondent pas', false);
        return;
    }

    const button = document.getElementById('newPasswordButton');
    button.disabled = true;
    try {
        const response = await fetch(`${API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: passwordResetToken, newPassword })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erreur lors de la modification');
        passwordResetToken = null;
        document.getElementById('newPasswordForm').style.display = 'none';
        button.style.display = 'none';
        showNewPasswordMessage('✅ ' + data.message, true);
    } catch (error) {
        showNewPasswordMessage('❌ ' + error.message, false);
    } finally {
        button.disabled = false;
    }
}

function closeNewPasswordModal() {
    passwordResetToken = null;
    document.getElementById('newPasswordModal').classList.remove('active');
    document.getElementById('newPasswordValue').value = '';
    document.getElementById('newPasswordConfirm').value = '';
}

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

// Grille de la planification (filtres, période de MAD des ressources, affectations SAMU) : îlot Vue
// (frontend/src/ilots/planification)

// Calcule le numéro de semaine ISO 8601 pour une date donnée
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ----- Mot de passe oublié (mire de connexion) : déplacé de deplacements.js (lot 5.2b), tel quel -----
// Variables pour gérer la temporisation du mot de passe oublié
let resetPasswordTimer = null;
let resetPasswordRemainingSeconds = 0;

function showForgotPassword() {
    document.getElementById('forgotPasswordModal').classList.add('active');
    document.getElementById('forgotUsername').value = document.getElementById('loginUsername').value;
    document.getElementById('forgotPasswordMessage').style.display = 'none';
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.remove('active');
    document.getElementById('forgotUsername').value = '';
    document.getElementById('forgotPasswordMessage').style.display = 'none';
    if (resetPasswordTimer) {
        clearInterval(resetPasswordTimer);
        resetPasswordTimer = null;
    }
    document.getElementById('forgotPasswordButton').disabled = false;
    document.getElementById('forgotPasswordButton').textContent = 'Envoyer';
}

async function requestPasswordReset() {
    const username = document.getElementById('forgotUsername').value;
    const messageDiv = document.getElementById('forgotPasswordMessage');
    const button = document.getElementById('forgotPasswordButton');

    if (!username) {
        messageDiv.style.display = 'block';
        messageDiv.style.backgroundColor = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.textContent = 'Veuillez entrer votre identifiant';
        return;
    }

    button.disabled = true;
    button.textContent = 'Envoi en cours...';

    try {
        const response = await fetch(`${API_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username })
        });

        // Vérifier si la réponse est en JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error("La réponse du serveur n'est pas au format JSON");
        }

        const data = await response.json();

        if (response.status === 429) {
            // Temporisation active
            messageDiv.style.display = 'block';
            messageDiv.style.backgroundColor = '#fff3cd';
            messageDiv.style.color = '#856404';
            messageDiv.textContent = data.error;

            // Démarrer le compte à rebours
            startResetPasswordTimer(data.remainingSeconds);
        } else if (data.success) {
            // Réponse identique que le compte existe ou non : le lien arrive par email
            messageDiv.style.display = 'block';
            messageDiv.style.backgroundColor = '#d4edda';
            messageDiv.style.color = '#155724';
            messageDiv.textContent = '✅ ' + data.message;

            // Une nouvelle demande pour le même compte n'est prise en compte qu'après 60 secondes
            startResetPasswordTimer(60);
        } else {
            messageDiv.style.display = 'block';
            messageDiv.style.backgroundColor = '#f8d7da';
            messageDiv.style.color = '#721c24';
            messageDiv.textContent = '❌ ' + (data.error || 'Erreur lors de la réinitialisation');
            button.disabled = false;
            button.textContent = 'Envoyer';
        }
    } catch (error) {
        console.error('Erreur:', error);
        messageDiv.style.display = 'block';
        messageDiv.style.backgroundColor = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.textContent = '❌ Erreur de connexion au serveur';
        button.disabled = false;
        button.textContent = 'Envoyer';
    }
}

function startResetPasswordTimer(seconds) {
    resetPasswordRemainingSeconds = seconds;
    const button = document.getElementById('forgotPasswordButton');

    // Nettoyer le timer précédent si existant
    if (resetPasswordTimer) {
        clearInterval(resetPasswordTimer);
    }

    // Mettre à jour l'affichage immédiatement
    button.textContent = `Réessayer dans ${resetPasswordRemainingSeconds}s`;
    button.disabled = true;

    // Démarrer le compte à rebours
    resetPasswordTimer = setInterval(() => {
        resetPasswordRemainingSeconds--;

        if (resetPasswordRemainingSeconds <= 0) {
            clearInterval(resetPasswordTimer);
            resetPasswordTimer = null;
            button.disabled = false;
            button.textContent = 'Envoyer';
        } else {
            button.textContent = `Réessayer dans ${resetPasswordRemainingSeconds}s`;
        }
    }, 1000);
}
