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
