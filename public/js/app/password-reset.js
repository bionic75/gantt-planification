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

        // Charger le cache MAD avant d'afficher les ressources
        await loadAllMadHistoryCache();
        console.log('✅ Cache MAD chargé');

        // Charger les affectations SAMU (expert principal / secondaire)
        await loadResourceSamuAssignments();

        // Onglet Ressources : îlot Vue (frontend/src/ilots/ressources), qui relit ses données
        window.dispatchEvent(new CustomEvent('gp:ressources-rechargees'));
        updateResourceFilter();
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// === AFFECTATIONS SAMU (expert principal / secondaire) ===

// Lues par la planification (saisie : îlot Vue des ressources, frontend/src/ilots/ressources)
let resourceSamuAssignments = {}; // { [resourceId]: { principal: [samu...], secondaire: [samu...] } }

async function loadResourceSamuAssignments() {
    try {
        const response = await fetch(`${API_URL}/resource-samu-assignments`, { credentials: 'include' });
        if (!response.ok) return;
        const rows = await response.json();
        const map = {};
        rows.forEach(row => {
            if (!map[row.resource_id]) map[row.resource_id] = { principal: [], secondaire: [] };
            map[row.resource_id][row.role].push(row.samu);
        });
        resourceSamuAssignments = map;
    } catch (e) {
        console.error('Erreur chargement affectations SAMU:', e);
    }
}

function updateResourceFilter() {
    const filterSelect = document.getElementById('resourceFilter');
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Toutes les ressources</option>';

    const activeResources = resources
        .filter(r => r.actif)
        .sort((a, b) => {
            const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
            const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });

    activeResources.forEach(r => {
        const option = document.createElement('option');
        option.value = r.id;
        option.textContent = `${r.nom.toUpperCase()} ${r.prenom} (${r.trigramme})`;

        // Si expert métier, présélectionner automatiquement sa ressource
        if (
            currentUser &&
            currentUser.activeProfile === 'expert' &&
            currentUser.resourceId &&
            r.id === currentUser.resourceId
        ) {
            option.selected = true;
        }

        filterSelect.appendChild(option);
    });

    // Mettre à jour aussi le filtre par fonction
    updateFonctionFilter();
}

function updateFonctionFilter() {
    const filterSelect = document.getElementById('fonctionFilter');
    if (!filterSelect) return;

    // Sauvegarder les valeurs sélectionnées
    const selectedValues = Array.from(filterSelect.selectedOptions).map(opt => opt.value);
    filterSelect.innerHTML = '';

    // Récupérer toutes les fonctions uniques des ressources actives
    const fonctions = new Set();
    resources
        .filter(r => r.actif && r.fonction)
        .forEach(r => {
            fonctions.add(r.fonction);
        });

    // Trier et ajouter les options
    [...fonctions].sort().forEach(f => {
        const option = document.createElement('option');
        option.value = f;
        option.textContent = f;
        if (selectedValues.includes(f)) option.selected = true;
        filterSelect.appendChild(option);
    });
}

function isDateAccessible(resource, date) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const checkDateStr = checkDate.toISOString().split('T')[0];

    // Utiliser l'historique MAD si disponible
    const madHistory = window.resourceMadHistoryCache ? window.resourceMadHistoryCache[resource.id] : null;

    let dateDebut = resource.date_debut;
    let dateFin = resource.date_fin;

    if (madHistory && madHistory.length > 0) {
        const sorted = [...madHistory].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
        dateDebut = sorted[0].date_debut;
        const lastPeriod = sorted[sorted.length - 1];
        dateFin = lastPeriod.date_fin;
    }

    if (!dateDebut) {
        return false;
    }

    const dateDebutObj = new Date(dateDebut);
    dateDebutObj.setHours(0, 0, 0, 0);

    if (checkDate < dateDebutObj) {
        return false;
    }

    if (dateFin) {
        const dateFinObj = new Date(dateFin);
        dateFinObj.setHours(0, 0, 0, 0);

        if (checkDate > dateFinObj) {
            return false;
        }
    }

    return true;
}

// Calcule le numéro de semaine ISO 8601 pour une date donnée
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
