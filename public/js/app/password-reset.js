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

        displayResources();
        updateResourceFilter();
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// === AFFECTATIONS SAMU (expert principal / secondaire) ===

let resourceSamuAssignments = {}; // { [resourceId]: { principal: [samu...], secondaire: [samu...] } }
let samuTagState = { add_principal: [], add_secondaire: [], edit_principal: [], edit_secondaire: [] };
const SAMU_TAG_PAIRS = {
    add_principal: 'add_secondaire',
    add_secondaire: 'add_principal',
    edit_principal: 'edit_secondaire',
    edit_secondaire: 'edit_principal'
};

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

function renderSamuTags(key) {
    const box = document.getElementById(`samuTags_${key}`);
    const input = document.getElementById(`samuInput_${key}`);
    if (!box || !input) return;
    box.querySelectorAll('.samu-tag').forEach(t => t.remove());
    const role = key.endsWith('_principal') ? 'principal' : 'secondaire';
    (samuTagState[key] || []).forEach(samu => {
        const tag = document.createElement('span');
        tag.className = `samu-tag ${role}`;
        tag.innerHTML = `<span>${samu}</span><span class="samu-tag-remove" onclick="removeSamuTag('${key}', '${samu.replace(/'/g, "\\'")}')" title="Retirer">&times;</span>`;
        box.insertBefore(tag, input);
    });
}

function addSamuTag(key, samu) {
    if (!samu) return;
    if (!samuTagState[key]) samuTagState[key] = [];
    if (samuTagState[key].includes(samu)) return;
    samuTagState[key].push(samu);
    // Retirer du champ opposé (un SAMU ne peut être que principal OU secondaire à la fois)
    const oppositeKey = SAMU_TAG_PAIRS[key];
    if (oppositeKey && samuTagState[oppositeKey]) {
        samuTagState[oppositeKey] = samuTagState[oppositeKey].filter(s => s !== samu);
        renderSamuTags(oppositeKey);
    }
    renderSamuTags(key);
    const input = document.getElementById(`samuInput_${key}`);
    if (input) {
        input.value = '';
        input.focus();
    }
    const dropdown = document.getElementById(`samuDropdown_${key}`);
    if (dropdown) dropdown.style.display = 'none';
}

function removeSamuTag(key, samu) {
    if (!samuTagState[key]) return;
    samuTagState[key] = samuTagState[key].filter(s => s !== samu);
    renderSamuTags(key);
}

function filterSamuOptions(key, query) {
    const dropdown = document.getElementById(`samuDropdown_${key}`);
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const oppositeKey = SAMU_TAG_PAIRS[key];
    const excluded = new Set([...(samuTagState[key] || []), ...(oppositeKey ? samuTagState[oppositeKey] || [] : [])]);
    const options = [...allLocations]
        .map(l => l.libelle_court)
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique
        .filter(samu => !excluded.has(samu))
        .filter(samu => !q || samu.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 10);

    if (options.length === 0) {
        dropdown.innerHTML = '<div class="samu-tag-dropdown-empty">Aucun SAMU disponible</div>';
        dropdown.style.display = 'block';
        return;
    }
    dropdown.innerHTML = options
        .map(
            samu =>
                `<div class="samu-tag-dropdown-item" onclick="addSamuTag('${key}', '${samu.replace(/'/g, "\\'")}')">${samu}</div>`
        )
        .join('');
    dropdown.style.display = 'block';
}

function handleSamuTagKeydown(key, e) {
    if (e.key === 'Backspace' && e.target.value === '' && (samuTagState[key] || []).length > 0) {
        samuTagState[key].pop();
        renderSamuTags(key);
    }
    if (e.key === 'Escape') {
        const dropdown = document.getElementById(`samuDropdown_${key}`);
        if (dropdown) dropdown.style.display = 'none';
    }
}

// Fermer les dropdowns SAMU si clic en dehors
document.addEventListener('click', function (e) {
    ['add_principal', 'add_secondaire', 'edit_principal', 'edit_secondaire'].forEach(key => {
        const box = document.getElementById(`samuTags_${key}`);
        const dropdown = document.getElementById(`samuDropdown_${key}`);
        if (dropdown && box && !box.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
});

async function saveSamuAssignmentsForResource(resourceId, principalArr, secondaireArr) {
    try {
        await fetch(`${API_URL}/resources/${resourceId}/samu-assignments`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ principal: principalArr || [], secondaire: secondaireArr || [] })
        });
        resourceSamuAssignments[resourceId] = { principal: principalArr || [], secondaire: secondaireArr || [] };
    } catch (e) {
        console.error('Erreur sauvegarde affectations SAMU:', e);
    }
}

function buildSamuAssignmentsBadgesHtml(resourceId, role) {
    const assign = resourceSamuAssignments[resourceId];
    if (!assign) return '<span style="color:#bbb;font-size:11px;">-</span>';
    const list = role === 'secondaire' ? assign.secondaire : assign.principal;
    if (!list || !list.length) return '<span style="color:#bbb;font-size:11px;">-</span>';
    const color = role === 'secondaire' ? '#78909c' : '#1565c0';
    const icon = role === 'secondaire' ? '🅢' : '🅿️';
    const perRow = 3;
    let html = '<div style="display:flex;flex-direction:column;gap:2px;">';
    for (let i = 0; i < list.length; i += perRow) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
        list.slice(i, i + perRow).forEach(samu => {
            html += `<span style="background:${color};color:white;font-size:9px;padding:1px 6px;border-radius:8px;">${icon} ${samu}</span>`;
        });
        html += '</div>';
    }
    html += '</div>';
    return html;
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

function getResourceStatus(resource) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Utiliser l'historique MAD si disponible
    const madHistory = window.resourceMadHistoryCache ? window.resourceMadHistoryCache[resource.id] : null;

    let dateDebut = resource.date_debut;
    let dateFin = resource.date_fin;

    if (madHistory && madHistory.length > 0) {
        // Trier par date de début
        const sorted = [...madHistory].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
        // La première date de début de l'historique
        dateDebut = sorted[0].date_debut;
        // La dernière date de fin (null = en cours)
        const lastPeriod = sorted[sorted.length - 1];
        dateFin = lastPeriod.date_fin;
    }

    if (!dateDebut) {
        return { text: 'Non démarré', class: 'pending' };
    }

    const dateDebutObj = new Date(dateDebut);
    dateDebutObj.setHours(0, 0, 0, 0);

    if (today < dateDebutObj) {
        return { text: 'À venir', class: 'pending' };
    }

    if (dateFin) {
        const dateFinObj = new Date(dateFin);
        dateFinObj.setHours(0, 0, 0, 0);

        if (today > dateFinObj) {
            return { text: 'Terminé', class: 'inactive' };
        }
    }

    return { text: 'En cours', class: 'active' };
}

// Obtenir les dates de début et fin MAD depuis l'historique
function getResourceMadDates(resourceId) {
    const madHistory = window.resourceMadHistoryCache ? window.resourceMadHistoryCache[resourceId] : null;
    const resource = resources.find(r => r.id === resourceId);

    let dateDebut = resource ? resource.date_debut : null;
    let dateFin = resource ? resource.date_fin : null;

    if (madHistory && madHistory.length > 0) {
        const sorted = [...madHistory].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
        dateDebut = sorted[0].date_debut;
        const lastPeriod = sorted[sorted.length - 1];
        dateFin = lastPeriod.date_fin;
    }

    return { dateDebut, dateFin };
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

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
}

// Calcule le numéro de semaine ISO 8601 pour une date donnée
function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function toggleAddAstreinteDate() {
    const checked = document.getElementById('addAstreinteVolontaire').checked;
    document.getElementById('addAstreinteDateBlock').style.display = checked ? 'block' : 'none';
    if (!checked) document.getElementById('addAstreinteDate').value = '';
}

function toggleMadVolanteFields(prefix) {
    const checked = document.getElementById(`${prefix}MadVolante`).checked;
    if (prefix === 'add') {
        document.getElementById('addTauxGroup').style.display = checked ? 'none' : '';
        document.getElementById('addDateFinMadGroup').style.display = checked ? '' : 'none';
        document.getElementById('addJoursMaxGroup').style.display = checked ? '' : 'none';
        if (!checked) {
            document.getElementById('dateFinMad').value = '';
            document.getElementById('joursMaxMad').value = '';
        } else {
            document.getElementById('taux').value = '';
        }
    } else {
        const fieldsDiv = document.getElementById('editMadVolanteFields');
        fieldsDiv.style.display = checked ? 'grid' : 'none';
    }
}

async function addResource() {
    const nom = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();
    const trigramme = document.getElementById('trigramme').value.trim().toUpperCase();
    const madVolante = document.getElementById('addMadVolante').checked;
    const taux = document.getElementById('taux').value;
    const dateFinMad = document.getElementById('dateFinMad').value;
    const joursMaxMad = document.getElementById('joursMaxMad').value;
    const samu = document.getElementById('samu').value.trim();
    const dateDebut = document.getElementById('dateDebut').value;
    const esRattachement = document.getElementById('esRattachement').value.trim();
    const fonction = document.getElementById('fonction').value.trim();
    const astreinteVolontaire = document.getElementById('addAstreinteVolontaire').checked;
    const astreinteHo = document.getElementById('addAstreinteHo').checked;
    const astreinteApd = document.getElementById('addAstreinteApd').checked;
    const astreinteDate = document.getElementById('addAstreinteDate').value;

    if (!nom || !prenom || !trigramme || !samu || !dateDebut) {
        alert('Remplissez tous les champs obligatoires (*)');
        return;
    }
    if (!madVolante && !taux) {
        alert('Remplissez le taux de MAD');
        return;
    }
    if (madVolante && (!dateFinMad || !joursMaxMad)) {
        alert('Remplissez la date de fin et les jours max pour une MAD volante');
        return;
    }
    if (astreinteVolontaire && !astreinteDate) {
        alert("Veuillez saisir la date de démarrage du régime d'astreintes");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/resources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                nom,
                prenom,
                trigramme,
                email: null,
                telephone: null,
                taux: madVolante ? 0 : parseFloat(taux),
                samu,
                actif: 1,
                date_debut: dateDebut,
                date_fin: null,
                es_rattachement: esRattachement || null,
                fonction: fonction || null,
                astreinte_volontaire: astreinteVolontaire ? 1 : 0,
                astreinte_ho: astreinteHo ? 1 : 0,
                astreinte_apd: astreinteApd ? 1 : 0,
                astreinte_date_activation: astreinteDate || null,
                is_mad_volante: madVolante ? 1 : 0,
                date_fin_mad: dateFinMad || null,
                jours_max_mad: joursMaxMad ? parseInt(joursMaxMad) : null
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur ajout ressource');
        }

        const newResourceData = await response.json();

        // Enregistrer les affectations SAMU (expert principal / secondaire) saisies dans le formulaire
        if (newResourceData && newResourceData.id) {
            await saveSamuAssignmentsForResource(
                newResourceData.id,
                samuTagState.add_principal,
                samuTagState.add_secondaire
            );
        }

        showSyncStatus();
        logModification('Modification du planning');
        await loadResources();
        ['nom', 'prenom', 'trigramme', 'taux', 'samu', 'dateDebut', 'esRattachement', 'fonction'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        // Réinitialiser les tags SAMU du formulaire d'ajout
        samuTagState.add_principal = [];
        samuTagState.add_secondaire = [];
        renderSamuTags('add_principal');
        renderSamuTags('add_secondaire');
        // Réinitialiser le bloc astreinte
        document.getElementById('addAstreinteVolontaire').checked = false;
        document.getElementById('addAstreinteHo').checked = false;
        document.getElementById('addAstreinteApd').checked = false;
        document.getElementById('addAstreinteDate').value = '';
        document.getElementById('addAstreinteDateBlock').style.display = 'none';
        updateGantt();
    } catch (error) {
        console.error('Erreur:', error);
        alert("Erreur lors de l'ajout de la ressource: " + error.message);
    }
}

// Trois cases par ressource : astreintes HO (heures ouvrées), HNO (heures non ouvrées) et accompagnement post démarrage
const ASTREINTE_TYPES = [
    { type: 'ho', field: 'astreinte_ho', label: 'HO', tip: 'Astreintes HO : jours de la semaine, heures ouvrées' },
    { type: 'hno', field: 'astreinte_volontaire', label: 'HNO', tip: 'Astreintes HNO : jours et heures non ouvrés' },
    {
        type: 'apd',
        field: 'astreinte_apd',
        label: 'APD',
        tip: "Astreintes « Accompagnement post démarrage » : jours et heures non ouvrés, dans le cadre d'un déploiement"
    }
];

function astreinteCellsHtml(r) {
    const editable = currentUser && currentUser.activeProfile !== 'rh';
    return ASTREINTE_TYPES.map(t => {
        const checked = r[t.field] ? 'checked' : '';
        return editable
            ? `<td style="text-align:center;"><input type="checkbox" ${checked} onchange="toggleAstreinteByResource(${r.id}, this.checked, '${t.type}')" style="width:18px;height:18px;cursor:pointer;" title="${t.tip}"></td>`
            : `<td style="text-align:center;"><input type="checkbox" ${checked} disabled style="width:18px;height:18px;opacity:0.5;cursor:not-allowed;" title="${t.tip}"></td>`;
    }).join('');
}

function displayResources() {
    const tbody = document.getElementById('resourcesList');
    tbody.innerHTML = '';

    // Trier les ressources par ordre alphabétique (nom, puis prénom)
    const sortedResources = [...resources].sort((a, b) => {
        const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
        const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
        return nameA.localeCompare(nameB);
    });

    sortedResources.forEach(r => {
        const status = getResourceStatus(r);
        // Obtenir les dates depuis l'historique MAD
        const madDates = getResourceMadDates(r.id);
        const row = tbody.insertRow();
        const noAccount =
            (r.astreinte_volontaire || r.astreinte_ho) &&
            !r.user_id &&
            currentUser &&
            currentUser.activeProfile !== 'rh';
        const noAccountTip =
            "Astreinte (HO ou HNO) sans compte utilisateur lié : cette ressource ne pourra pas se connecter pour modifier le planning HO et n'apparaîtra pas dans la liste de sélection des CRA.";
        row.innerHTML = `
                    <td${noAccount ? ` title="${noAccountTip}"` : ''}>${r.nom}${noAccount ? `<span style="color:#f9a825;margin-left:6px;cursor:help;">⚠️</span>` : ''}</td>
                    <td>${r.prenom}</td>
                    <td>${r.trigramme}</td>
                    <td>${r.is_mad_volante ? `<span style="background:#f3e5f5;color:#6a1b9a;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:bold;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;stroke:#7b1fa2;fill:#e1bee7;vertical-align:-2px;"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg> MAD volante</span>` : `${r.taux}%`}</td>
                    <td>${r.samu}</td>
                    <td>${buildSamuAssignmentsBadgesHtml(r.id, 'principal')}</td>
                    <td>${buildSamuAssignmentsBadgesHtml(r.id, 'secondaire')}</td>
                    <td>${r.es_rattachement || '-'}</td>
                    <td>${r.fonction || '-'}</td>
                    <td>${formatDate(madDates.dateDebut || r.date_debut)}</td>
                    <td>${formatDate(madDates.dateFin || r.date_fin)}</td>
                    <td><span class="date-badge ${status.class}">${status.text}</span></td>
                    ${astreinteCellsHtml(r)}
                    ${
                        currentUser && currentUser.activeProfile !== 'rh'
                            ? `<td><label class="toggle-switch"><input type="checkbox" ${r.actif ? 'checked' : ''} onchange="toggleActive(${r.id})"><span class="slider"></span></label></td>`
                            : `<td style="text-align:center;"><span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:bold;background:${r.actif ? '#e8f5e9' : '#ffebee'};color:${r.actif ? '#2e7d32' : '#c62828'};">${r.actif ? 'Actif' : 'Inactif'}</span></td>`
                    }
                    <td>
                        ${
                            currentUser && currentUser.activeProfile === 'rh'
                                ? `<div class="icon-actions"><button type="button" class="icon-btn" style="background-color:#f39c12;" onclick="openViewModalRh(${r.id})" title="Voir la ressource" aria-label="Voir la ressource">${uiIcon('eye', 16, 'margin:0;vertical-align:middle;')}</button></div>`
                                : `<div class="icon-actions"><button type="button" class="icon-btn" style="background-color:#f39c12;" onclick="openEditModal(${r.id})" title="Modifier la ressource" aria-label="Modifier la ressource">${uiIcon('pencil', 16, 'margin:0;vertical-align:middle;')}</button><button type="button" class="icon-btn" style="background-color:#D60B51;" onclick="deleteResource(${r.id})" title="Supprimer la ressource" aria-label="Supprimer la ressource">${uiIcon('trash', 16, 'margin:0;vertical-align:middle;')}</button></div>`
                        }
                    </td>
                `;
    });
    makeColResizable(document.getElementById('resourcesTable'));
}

// Variable pour stocker l'historique MAD de la ressource en cours d'édition
let currentResourceMadHistory = [];

async function openEditModal(id) {
    // Si resources est vide (ex: après rechargement de page), recharger d'abord
    if (!resources || resources.length === 0) {
        await loadResources();
    }
    // Si allLocations est vide, recharger (nécessaire pour le dropdown SAMU et l'autocomplétion)
    if (!allLocations || allLocations.length === 0) {
        await loadLocations();
    }
    const resource = resources.find(r => r.id === id);
    if (!resource) {
        console.error('[openEditModal] Ressource introuvable pour id=', id, ', resources=', resources.length);
        return;
    }
    currentEditId = id;
    // Réinitialiser la modale en mode édition
    document.getElementById('editModal').querySelector('h3').textContent = 'Modifier la ressource';
    const btnGroup = document.getElementById('editModal').querySelector('.modal-button-group');
    btnGroup.innerHTML = `<button onclick="closeEditModal()" style="background-color:#95a5a6;">Annuler</button><button onclick="saveResourceEdit()">Enregistrer</button>`;
    const inputs = document
        .getElementById('editModal')
        .querySelectorAll('input:not([type=hidden]):not([readonly]), textarea, select');
    inputs.forEach(el => {
        el.disabled = false;
        el.style.background = '';
        el.style.cursor = '';
    });
    const addMadBtn = document.getElementById('editModal').querySelector('button[onclick="openAddMadModal()"]');
    if (addMadBtn) addMadBtn.style.display = '';
    document.getElementById('editResourceId').value = id;
    document.getElementById('editNom').value = resource.nom;
    document.getElementById('editPrenom').value = resource.prenom;
    document.getElementById('editTrigramme').value = resource.trigramme || '';
    document.getElementById('editSamu').value = resource.samu;
    document.getElementById('editEsRattachement').value = resource.es_rattachement || '';
    document.getElementById('editFonction').value = resource.fonction || '';
    document.getElementById('editContactsRh').value = resource.contacts_rh || '';
    if (window.bindEmailListField) {
        bindEmailListField(document.getElementById('editContactsRh'));
        document.getElementById('editContactsRh').checkEmails();
    }
    // Pré-remplir MAD volante
    const madVolanteChk = document.getElementById('editMadVolante');
    madVolanteChk.checked = !!resource.is_mad_volante;
    document.getElementById('editDateDebutMad').value = resource.date_debut || '';
    document.getElementById('editResourceId').dataset.dateFin = resource.date_fin || '';
    document.getElementById('editDateFinMad').value = resource.date_fin_mad || '';
    document.getElementById('editJoursMaxMad').value = resource.jours_max_mad || '';
    document.getElementById('editMadVolanteFields').style.display = resource.is_mad_volante ? 'grid' : 'none';

    // Pré-remplir astreinte
    const astrChk = document.getElementById('editAstreinteVolontaire');
    astrChk.checked = !!resource.astreinte_volontaire;
    document.getElementById('editAstreinteHo').checked = !!resource.astreinte_ho;
    document.getElementById('editAstreinteApd').checked = !!resource.astreinte_apd;
    document.getElementById('editAstreinteDate').value = resource.astreinte_date_activation || '';
    document.getElementById('editAstreinteDateBlock').style.display = resource.astreinte_volontaire ? 'block' : 'none';

    // Pré-remplir les affectations SAMU (expert principal / secondaire)
    const assign = resourceSamuAssignments[id] || { principal: [], secondaire: [] };
    samuTagState.edit_principal = [...assign.principal];
    samuTagState.edit_secondaire = [...assign.secondaire];
    renderSamuTags('edit_principal');
    renderSamuTags('edit_secondaire');

    // Ouvrir la modale AVANT le chargement async de l'historique MAD
    document.getElementById('editModal').classList.add('active');

    // Charger l'historique MAD (après ouverture pour ne pas bloquer)
    await loadMadHistory(id);
}

async function openViewModalRh(id) {
    await openEditModal(id);
    const modal = document.getElementById('editModal');
    modal.querySelector('h3').textContent = 'Détail de la ressource';
    // Désactiver tous les champs de saisie
    modal.querySelectorAll('input:not([type=hidden]), textarea, select').forEach(el => {
        el.disabled = true;
        el.style.background = '#f5f5f5';
        el.style.cursor = 'not-allowed';
    });
    // Masquer les tags SAMU interactifs
    modal
        .querySelectorAll('.samu-tag-box .samu-tag-input, .samu-tag-dropdown')
        .forEach(el => (el.style.display = 'none'));
    modal.querySelectorAll('.samu-tag span[onclick]').forEach(el => (el.style.display = 'none'));
    // Remplacer le bloc astreintes par un affichage lecture seule
    const resource = resources.find(r => r.id === id);
    const astrBlock = modal.querySelector('#editAstreintesBlock');
    if (resource) {
        const dateStr = resource.astreinte_date_activation
            ? new Date(resource.astreinte_date_activation).toLocaleDateString('fr-FR')
            : '—';
        const since = resource.astreinte_date_activation
            ? (() => {
                  const d = new Date(resource.astreinte_date_activation);
                  const now = new Date();
                  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
                  return months > 0 ? ` (depuis ${months} mois)` : '';
              })()
            : '';
        const line = (on, label, extra = '') =>
            on
                ? `<div style="margin:4px 0;"><span style="font-weight:bold;color:#2e7d32;">✔ ${label}</span>${extra}</div>`
                : `<div style="margin:4px 0;color:#999;">✖ ${label} : non</div>`;
        astrBlock.innerHTML = `<div style="padding:10px;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;">
                         <div style="font-weight:bold;color:#e65100;margin-bottom:4px;">🔔 Astreintes</div>
                         ${line(resource.astreinte_ho, 'Astreintes HO')}
                         ${line(resource.astreinte_volontaire, 'Astreintes HNO', `<span style="font-size:12px;color:#555;"> — régime actif depuis le <strong>${dateStr}</strong>${since}</span>`)}
                         ${line(resource.astreinte_apd, 'Astreintes « Accompagnement post démarrage »')}
                       </div>`;
    }
    // Masquer le bouton "Ajouter un taux de MAD"
    const addMadBtn = modal.querySelector('button[onclick="openAddMadModal()"]');
    if (addMadBtn) addMadBtn.style.display = 'none';
    // Masquer les boutons d'action dans l'historique MAD
    modal
        .querySelectorAll('#madHistoryContainer button, #madHistoryContainer td:last-child')
        .forEach(el => (el.style.display = 'none'));
    // Boutons de pied de modale : uniquement Fermer
    modal.querySelector('.modal-button-group').innerHTML =
        `<button onclick="closeEditModal()" style="background:#95a5a6;">Fermer</button>`;
}

async function loadMadHistory(resourceId) {
    const container = document.getElementById('madHistoryContainer');
    container.innerHTML = '<p style="color: #666; font-size: 12px;">Chargement...</p>';

    try {
        const response = await fetch(`${API_URL}/resources/${resourceId}/mad-history`, { credentials: 'include' });
        if (response.ok) {
            currentResourceMadHistory = await response.json();

            // Si pas d'historique, créer une entrée par défaut basée sur la ressource
            if (currentResourceMadHistory.length === 0) {
                const resource = resources.find(r => r.id === resourceId);
                if (resource) {
                    // Créer automatiquement une entrée initiale
                    await fetch(`${API_URL}/resources/${resourceId}/mad-history`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            taux: resource.taux,
                            date_debut: resource.date_debut || new Date().toISOString().split('T')[0],
                            date_fin: null
                        })
                    });
                    // Recharger
                    const resp2 = await fetch(`${API_URL}/resources/${resourceId}/mad-history`, {
                        credentials: 'include'
                    });
                    if (resp2.ok) {
                        currentResourceMadHistory = await resp2.json();
                    }
                }
            }

            renderMadHistory();
        } else {
            container.innerHTML = '<p style="color: #e74c3c; font-size: 12px;">Erreur de chargement</p>';
        }
    } catch (error) {
        console.error('Erreur chargement historique MAD:', error);
        container.innerHTML = '<p style="color: #e74c3c; font-size: 12px;">Erreur de chargement</p>';
    }
}

function renderMadHistory() {
    const container = document.getElementById('madHistoryContainer');

    if (currentResourceMadHistory.length === 0) {
        container.innerHTML =
            '<p style="color: #666; font-size: 12px; font-style: italic;">Aucun historique de taux MAD</p>';
        return;
    }

    // Trier par date de début
    const sorted = [...currentResourceMadHistory].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
    const showDelete = sorted.length > 1;

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
    html += `<thead>
                <tr style="background: #1565c0; color: white;">
                    <th style="padding: 8px; text-align: left;">Date début</th>
                    <th style="padding: 8px; text-align: left;">Date fin</th>
                    <th style="padding: 8px; text-align: center;">Taux</th>
                    <th style="padding: 8px; text-align: center;">Actions</th>
                </tr>
            </thead><tbody>`;

    sorted.forEach((mad, index) => {
        const isLast = index === sorted.length - 1;
        const dateDebutStr = mad.date_debut ? new Date(mad.date_debut).toLocaleDateString('fr-FR') : '-';
        const dateFinStr = mad.date_fin
            ? new Date(mad.date_fin).toLocaleDateString('fr-FR')
            : '<em style="color:#999;">En cours</em>';

        html += `<tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 8px;">${dateDebutStr}</td>
                    <td style="padding: 8px;">${dateFinStr}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: ${mad.taux === 0 ? '#e74c3c' : '#2e7d32'};">${mad.taux}%</td>
                    <td style="padding: 8px; text-align: center;">
                        <button onclick="openParticularitesModal(${mad.id})" style="background: #9c27b0; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="Gérer les particularités">📅</button>
                        <button onclick="openEditMadModal(${mad.id})" style="background: #1e88e5; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; margin-right: 3px;" title="Modifier">✏️</button>
                        ${showDelete ? `<button onclick="deleteMadHistory(${mad.id})" style="background: #e53935; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px;" title="Supprimer">🗑️</button>` : ''}
                    </td>
                </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function openAddMadModal() {
    document.getElementById('madHistoryModalTitle').textContent = 'Ajouter un taux de MAD';
    document.getElementById('madHistoryId').value = '';
    document.getElementById('madDateDebut').value = '';
    document.getElementById('madDateFin').value = '';
    document.getElementById('madTaux').value = '';
    document.getElementById('madHistoryModal').classList.add('active');
}

function openEditMadModal(historyId) {
    const mad = currentResourceMadHistory.find(m => m.id === historyId);
    if (!mad) return;

    document.getElementById('madHistoryModalTitle').textContent = 'Modifier le taux de MAD';
    document.getElementById('madHistoryId').value = historyId;
    document.getElementById('madDateDebut').value = mad.date_debut || '';
    document.getElementById('madDateFin').value = mad.date_fin || '';
    document.getElementById('madTaux').value = mad.taux;
    document.getElementById('madHistoryModal').classList.add('active');
}

function closeMadHistoryModal() {
    document.getElementById('madHistoryModal').classList.remove('active');
}

async function saveMadHistory() {
    const historyId = document.getElementById('madHistoryId').value;
    const dateDebut = document.getElementById('madDateDebut').value;
    const dateFin = document.getElementById('madDateFin').value;
    const taux = document.getElementById('madTaux').value;
    const resourceId = currentEditId;

    if (!dateDebut || taux === '') {
        alert('Veuillez remplir la date de début et le taux');
        return;
    }

    if (dateFin && dateDebut > dateFin) {
        alert('La date de fin doit être postérieure à la date de début');
        return;
    }

    try {
        let response;
        if (historyId) {
            // Modification
            response = await fetch(`${API_URL}/resources/${resourceId}/mad-history/${historyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ taux: parseFloat(taux), date_debut: dateDebut, date_fin: dateFin || null })
            });
        } else {
            // Ajout
            response = await fetch(`${API_URL}/resources/${resourceId}/mad-history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ taux: parseFloat(taux), date_debut: dateDebut, date_fin: dateFin || null })
            });
        }

        if (response.ok) {
            closeMadHistoryModal();
            await loadMadHistory(resourceId);
            await loadResources(); // Recharger pour mettre à jour le taux actuel
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur sauvegarde MAD:', error);
        alert('Erreur: ' + error.message);
    }
}

async function deleteMadHistory(historyId) {
    if (!confirm('Confirmer la suppression de cette période de MAD ?')) return;

    try {
        const response = await fetch(`${API_URL}/resources/${currentEditId}/mad-history/${historyId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            await loadMadHistory(currentEditId);
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur suppression MAD:', error);
        alert('Erreur: ' + error.message);
    }
}
