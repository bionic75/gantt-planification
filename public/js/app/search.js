// Application principale : search
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== RECHERCHE AVANCÉE ==========

// Ouvrir la modal de recherche
// Recherche avancée : mêmes icônes stylisées que la légende du Gantt et que les cellules (en image de fond des options)
function decorateSearchOptions() {
    const api = window.UIIconsApi;
    if (!api) return;
    const paint = (opt, url) => {
        if (!url) return;
        opt.style.backgroundImage = url;
        opt.style.backgroundRepeat = 'no-repeat';
        opt.style.backgroundPosition = '4px center';
        opt.style.backgroundSize = '16px 16px';
        opt.style.paddingLeft = '26px';
        opt.style.minHeight = '22px';
    };
    // Disponibilités (1-3) et affectations (1-8) : icône et couleur repris de la légende du planning
    const sections = document.querySelectorAll('.legend-section');
    const fromLegend = (section, values, selectId) => {
        if (!section) return;
        const items = section.querySelectorAll('.legend-item');
        values.forEach((v, i) => {
            const item = items[i],
                svg = item && item.querySelector('svg'),
                dot = item && item.querySelector('.color-code');
            const opt = document.querySelector(`#${selectId} option[value="${v}"]`);
            const color = dot ? dot.style.backgroundColor : '#455a64';
            if (opt && svg) paint(opt, api.urlForSvg(svg.innerHTML, color));
            else if (opt)
                paint(
                    opt,
                    api.urlForName(
                        selectId === 'searchAvailability' ? (v === 1 ? 'ban' : 'check-circle') : 'ban',
                        color
                    )
                ); // pas d'icône dans la légende : icône générique
        });
    };
    fromLegend(sections[0], [1, 2, 3], 'searchAvailability');
    fromLegend(sections[1], [1, 2, 3, 4], 'searchActivity');
    fromLegend(sections[2], [5, 6, 7, 8], 'searchActivity');
    // Localisations : l'emoji de tête est remplacé par l'icône stylisée correspondante
    document.querySelectorAll('#searchLocation option').forEach(opt => {
        const m = /^(\p{Extended_Pictographic})️?\s*/u.exec(opt.value);
        if (!m) {
            paint(opt, api.urlForName('home', '#455a64'));
            return;
        } // sans emoji (ex. « Télétravail ») : icône maison
        const url = api.urlForEmoji(m[1], '#455a64');
        if (!url) return;
        const label = opt.value.slice(m[0].length).trim() || (m[1].codePointAt(0) === 0x1f3d6 ? 'Congés' : '');
        if (label) opt.textContent = label;
        paint(opt, url);
    });
}

function openSearchModal() {
    // Remplir la liste des experts actifs
    const expertsSelect = document.getElementById('searchExperts');
    expertsSelect.innerHTML = '';

    const activeResources = resources.filter(r => r.actif);
    activeResources.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));

    activeResources.forEach(r => {
        const option = document.createElement('option');
        option.value = r.id;
        option.textContent = `${r.nom} ${r.prenom}`;
        expertsSelect.appendChild(option);
    });

    // Remplir la liste des localisations
    const locSelect = document.getElementById('searchLocation');
    locSelect.innerHTML = '';

    const locations = new Set();
    Object.keys(scheduleData).forEach(key => {
        if (key.includes('_localisation_')) {
            const val = scheduleData[key];
            if (val && val !== '-') {
                locations.add(val);
            }
        }
    });

    Array.from(locations)
        .sort()
        .forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            option.textContent = loc;
            locSelect.appendChild(option);
        });

    decorateSearchOptions();

    // Définir les dates par défaut (mois en cours)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    document.getElementById('searchStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('searchEndDate').value = lastDay.toISOString().split('T')[0];

    document.getElementById('searchModal').style.display = 'block';
}

// Fermer la modal de recherche
function closeSearchModal() {
    document.getElementById('searchModal').style.display = 'none';
}

// Réinitialiser le formulaire de recherche
function resetSearchForm() {
    document.getElementById('searchExperts').selectedIndex = -1;
    document.getElementById('searchAvailability').selectedIndex = -1;
    document.getElementById('searchActivity').selectedIndex = -1;
    document.getElementById('searchLocation').selectedIndex = -1;

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById('searchStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('searchEndDate').value = lastDay.toISOString().split('T')[0];

    document.getElementById('searchResultsContent').innerHTML =
        '<p style="color: #999; text-align: center;">Sélectionnez vos critères et cliquez sur "Rechercher"</p>';
    document.getElementById('searchSlotRanking').style.display = 'none';
}

// Exécuter la recherche
function executeSearch() {
    const selectedExperts = Array.from(document.getElementById('searchExperts').selectedOptions).map(o =>
        parseInt(o.value)
    );
    const startDate = document.getElementById('searchStartDate').value;
    const endDate = document.getElementById('searchEndDate').value;
    const selectedAvailability = Array.from(document.getElementById('searchAvailability').selectedOptions).map(
        o => o.value
    );
    const selectedActivity = Array.from(document.getElementById('searchActivity').selectedOptions).map(o => o.value);
    const selectedLocation = Array.from(document.getElementById('searchLocation').selectedOptions).map(o => o.value);

    if (!startDate || !endDate) {
        alert('Veuillez sélectionner un intervalle de dates');
        return;
    }

    // Filtrer les ressources à rechercher
    const resourcesToSearch =
        selectedExperts.length > 0
            ? resources.filter(r => selectedExperts.includes(r.id) && r.actif)
            : resources.filter(r => r.actif);

    // Générer toutes les dates de l'intervalle
    const dates = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    while (currentDate <= end) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Rechercher les correspondances
    const results = [];

    resourcesToSearch.forEach(resource => {
        const matches = [];

        dates.forEach(dateStr => {
            ['AM', 'PM'].forEach(period => {
                const availKey = `${resource.id}_available_${dateStr}_${period}`;
                const actKey = `${resource.id}_activity_${dateStr}_${period}`;
                const locKey = `${resource.id}_localisation_${dateStr}_${period}`;

                const avail = scheduleData[availKey] || '1';
                const act = scheduleData[actKey] || '1';
                const loc = scheduleData[locKey] || '-';

                // Vérifier les critères
                let matchAvail = selectedAvailability.length === 0 || selectedAvailability.includes(avail);
                let matchAct = selectedActivity.length === 0 || selectedActivity.includes(act);
                let matchLoc = selectedLocation.length === 0 || selectedLocation.includes(loc);

                if (matchAvail && matchAct && matchLoc) {
                    matches.push({
                        date: dateStr,
                        period: period,
                        availability: avail,
                        activity: act,
                        location: loc
                    });
                }
            });
        });

        if (matches.length > 0) {
            results.push({
                resource: resource,
                matches: matches
            });
        }
    });

    // Afficher les résultats
    displaySearchResults(results);
}

// Afficher les résultats de recherche
function displaySearchResults(results) {
    const container = document.getElementById('searchResultsContent');
    const slotRankingSection = document.getElementById('searchSlotRanking');
    const slotRankingContent = document.getElementById('searchSlotRankingContent');

    if (results.length === 0) {
        container.innerHTML =
            '<p style="color: #e74c3c; text-align: center;">Aucun résultat trouvé pour ces critères</p>';
        slotRankingSection.style.display = 'none';
        return;
    }

    const availLabels = { 1: 'Indisponible', 2: 'Disponible', 3: 'Congés' };
    const actLabels = {
        1: 'Indisponible',
        2: 'En attente',
        3: 'SAMU Dépl.',
        4: 'SAMU Dev.',
        5: 'ANS Dépl.',
        6: 'ANS Dev.',
        7: 'Qualif.',
        8: 'Divers'
    };

    // === Section 1: Résultats par expert ===
    let html = `<p style="color: #27ae60; font-weight: bold; margin-bottom: 10px;">${results.length} expert(s) trouvé(s)</p>`;
    html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
    html += '<thead><tr style="background: #3498db; color: white;">';
    html += '<th style="padding: 8px; text-align: left;">Expert</th>';
    html += '<th style="padding: 8px; text-align: center;">Nb demi-journées</th>';
    html += '<th style="padding: 8px; text-align: left;">Détails</th>';
    html += '</tr></thead><tbody>';

    results.forEach(result => {
        const resource = result.resource;
        const matches = result.matches;

        // Regrouper par date
        const byDate = {};
        matches.forEach(m => {
            if (!byDate[m.date]) byDate[m.date] = [];
            byDate[m.date].push(m);
        });

        // Générer le détail (max 5 dates affichées)
        const dateKeys = Object.keys(byDate).slice(0, 5);
        let detailHtml = dateKeys
            .map(d => {
                const dateObj = new Date(d);
                const dateStr = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
                const periods = byDate[d].map(m => `${m.period}`).join('/');
                return `${dateStr} (${periods})`;
            })
            .join(', ');

        if (Object.keys(byDate).length > 5) {
            detailHtml += `, ... (+${Object.keys(byDate).length - 5})`;
        }

        html += '<tr style="border-bottom: 1px solid #ddd;">';
        html += `<td style="padding: 8px; font-weight: bold;">${resource.nom} ${resource.prenom}</td>`;
        html += `<td style="padding: 8px; text-align: center;">${matches.length}</td>`;
        html += `<td style="padding: 8px;">${detailHtml}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // === Section 2: Classement des créneaux par nombre d'experts ===
    // Comptabiliser les experts par créneau (date + période)
    const slotCounts = {};

    results.forEach(result => {
        result.matches.forEach(match => {
            const slotKey = `${match.date}_${match.period}`;
            if (!slotCounts[slotKey]) {
                slotCounts[slotKey] = {
                    date: match.date,
                    period: match.period,
                    experts: []
                };
            }
            slotCounts[slotKey].experts.push(result.resource);
        });
    });

    // Convertir en tableau et trier par nombre d'experts (décroissant)
    const sortedSlots = Object.values(slotCounts).sort((a, b) => b.experts.length - a.experts.length);

    if (sortedSlots.length > 0) {
        slotRankingSection.style.display = 'block';

        let slotHtml = `<p style="color: #27ae60; font-weight: bold; margin-bottom: 10px;">${sortedSlots.length} créneau(x) trouvé(s)</p>`;
        slotHtml += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
        slotHtml += '<thead><tr style="background: #27ae60; color: white;">';
        slotHtml += '<th style="padding: 8px; text-align: center; width: 50px;">Rang</th>';
        slotHtml += '<th style="padding: 8px; text-align: left;">Date</th>';
        slotHtml += '<th style="padding: 8px; text-align: center;">Période</th>';
        slotHtml += '<th style="padding: 8px; text-align: center;">Nb experts</th>';
        slotHtml += '<th style="padding: 8px; text-align: left;">Experts disponibles</th>';
        slotHtml += '</tr></thead><tbody>';

        // Afficher les 20 premiers créneaux max
        const maxSlots = Math.min(sortedSlots.length, 20);
        for (let i = 0; i < maxSlots; i++) {
            const slot = sortedSlots[i];
            const dateObj = new Date(slot.date);
            const jourSemaine = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
            const dateStr = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const periodLabel = slot.period === 'AM' ? 'Matin' : 'Après-midi';
            const expertNames = slot.experts
                .map(e => e.trigramme || `${e.prenom.charAt(0)}${e.nom.substring(0, 2).toUpperCase()}`)
                .join(', ');

            // Couleur de rang
            let rankColor = '#666';
            if (i === 0)
                rankColor = '#f1c40f'; // Or
            else if (i === 1)
                rankColor = '#95a5a6'; // Argent
            else if (i === 2) rankColor = '#cd7f32'; // Bronze

            // Couleur de fond alternée
            const bgColor = i % 2 === 0 ? '#f9f9f9' : 'white';

            slotHtml += `<tr style="border-bottom: 1px solid #ddd; background-color: ${bgColor};">`;
            slotHtml += `<td style="padding: 8px; text-align: center; font-weight: bold; color: ${rankColor};">${i + 1}</td>`;
            slotHtml += `<td style="padding: 8px;"><strong>${jourSemaine}</strong> ${dateStr}</td>`;
            slotHtml += `<td style="padding: 8px; text-align: center;"><span style="background: ${slot.period === 'AM' ? '#3498db' : '#e67e22'}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${periodLabel}</span></td>`;
            slotHtml += `<td style="padding: 8px; text-align: center; font-weight: bold; font-size: 14px;">${slot.experts.length}</td>`;
            slotHtml += `<td style="padding: 8px; font-size: 10px;">${expertNames}</td>`;
            slotHtml += '</tr>';
        }

        slotHtml += '</tbody></table>';

        if (sortedSlots.length > 20) {
            slotHtml += `<p style="color: #999; font-size: 11px; margin-top: 10px; text-align: center;">... et ${sortedSlots.length - 20} autres créneaux</p>`;
        }

        slotRankingContent.innerHTML = slotHtml;
    } else {
        slotRankingSection.style.display = 'none';
    }
}

// ========== FIN RECHERCHE AVANCÉE ==========

// ========== FIN GESTION DES FICHIERS ICS ==========

// Supprimer les congés scolaires (ancienne fonction - gardée pour compatibilité)
async function clearSchoolHolidays() {
    if (!confirm('Voulez-vous vraiment supprimer tous les congés scolaires ?')) {
        return;
    }

    schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] };
    await saveSchoolHolidays();

    document.getElementById('schoolHolidaysStatus').innerHTML =
        '<span style="color: #4CAF50;">✅ Congés scolaires supprimés</span>';
    document.getElementById('schoolHolidaysInfo').innerHTML = '<em>Aucun congé scolaire chargé</em>';

    updateGantt();
}

// Vérifier si une date est dans une période de congés pour une zone
function isDateInHoliday(dateStr, zone) {
    const holidays = schoolHolidays[zone] || [];

    for (const holiday of holidays) {
        if (dateStr >= holiday.start && dateStr < holiday.end) {
            return true;
        }
    }
    return false;
}

// ========== FIN GESTION DES CONGÉS SCOLAIRES ==========

function showPasswordConfirmModal(password, emailSent) {
    document.getElementById('passwordConfirmValue').textContent = password;
    document.getElementById('passwordConfirmEmailMsg').textContent = emailSent
        ? "📧 Un email a également été envoyé à l'utilisateur."
        : '⚠️ Aucun email envoyé — communiquez ce mot de passe manuellement.';
    document.getElementById('passwordConfirmModal').classList.add('active');
}

function copyConfirmedPassword() {
    const val = document.getElementById('passwordConfirmValue')?.textContent;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
        const btn = document.getElementById('copyConfirmBtn');
        if (btn) {
            btn.textContent = '✅ Copié !';
            setTimeout(() => {
                btn.textContent = '📋 Copier';
            }, 2000);
        }
    });
}

function openResetPasswordModal(id) {
    currentResetUserId = id;
    document.getElementById('resetPasswordModal').classList.add('active');
}

function closeResetPasswordModal() {
    document.getElementById('resetPasswordModal').classList.remove('active');
    currentResetUserId = null;
    document.getElementById('adminResetPassword').value = '';
}

async function saveNewPassword() {
    const newPassword = document.getElementById('adminResetPassword').value;
    const sendEmail = document.getElementById('sendPasswordEmail').checked;

    if (!newPassword || newPassword.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/${currentResetUserId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ newPassword, sendEmail })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur réinitialisation');
        }

        closeResetPasswordModal();
        showPasswordConfirmModal(newPassword, sendEmail && data.emailSent);
        showSyncStatus();
        logModification('Modification du planning');
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la réinitialisation : ' + error.message);
    }
}

function generateAndFillPassword() {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + symbols;

    let password = '';
    // S'assurer qu'on a au moins un de chaque type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Remplir le reste aléatoirement
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mélanger le mot de passe
    password = password
        .split('')
        .sort(() => Math.random() - 0.5)
        .join('');

    // Afficher dans le champ de la modale de reset
    document.getElementById('adminResetPassword').value = password;
}

async function openEditUserModal(id) {
    currentEditUserId = id;
    const user = users.find(u => u.id === id);
    if (!user) return;

    console.log('📝 Ouverture modal édition utilisateur:', {
        id: user.id,
        username: user.username,
        resource_id: user.resource_id,
        is_expert: user.is_expert
    });

    // Remplir les champs du formulaire (sauf resource_id qu'on fera après)
    document.getElementById('editUserUsername').value = user.username;
    document.getElementById('editUserNom').value = user.nom;
    document.getElementById('editUserPrenom').value = user.prenom;
    document.getElementById('editUserEmail').value = user.email;

    // Trigramme : utiliser celui de la ressource pour les experts, sinon celui du user ou générer
    let trigramme = user.trigramme || '';
    if (!trigramme && user.prenom && user.nom) {
        trigramme = (user.prenom.charAt(0) + user.nom.substring(0, 2)).toUpperCase();
    }
    document.getElementById('editUserTrigramme').value = trigramme;

    document.getElementById('editUserIsAdmin').checked = user.is_admin === 1;
    document.getElementById('editUserIsExpert').checked = user.is_expert === 1;
    document.getElementById('editUserIsUser').checked = user.is_user === 1;
    document.getElementById('editProfileRh').checked = user.is_rh === 1;
    document.getElementById('editUserActif').checked = user.actif === 1;

    // Charger les ressources dans le select EN PREMIER
    await loadResourcesForUserEdit();

    // PUIS set la valeur du select
    document.getElementById('editUserResourceId').value = user.resource_id || '';

    console.log('✅ Select resource_id après chargement:', document.getElementById('editUserResourceId').value);

    // Afficher la modal
    document.getElementById('editUserModal').classList.add('active');
}

async function loadResourcesForUserEdit() {
    try {
        const response = await fetch(`${API_URL}/resources`, { credentials: 'include' });
        if (!response.ok) throw new Error('Erreur chargement ressources');
        const resourcesList = await response.json();

        const select = document.getElementById('editUserResourceId');
        select.innerHTML = '<option value="">-- Aucune ressource --</option>';
        resourcesList.forEach(r => {
            const option = document.createElement('option');
            option.value = r.id;
            option.textContent = `${r.prenom} ${r.nom} (${r.trigramme})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erreur:', error);
    }
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('active');
    currentEditUserId = null;
}

async function saveUserChanges() {
    const username = document.getElementById('editUserUsername').value.trim();
    const nom = document.getElementById('editUserNom').value.trim();
    const prenom = document.getElementById('editUserPrenom').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const trigramme = document.getElementById('editUserTrigramme').value.trim().toUpperCase();
    const resource_id = document.getElementById('editUserResourceId').value || null;
    const is_admin = document.getElementById('editUserIsAdmin').checked ? 1 : 0;
    const is_expert = document.getElementById('editUserIsExpert').checked ? 1 : 0;
    const is_user = document.getElementById('editUserIsUser').checked ? 1 : 0;
    const is_rh = document.getElementById('editProfileRh').checked ? 1 : 0;
    const actif = document.getElementById('editUserActif').checked ? 1 : 0;

    console.log('💾 Sauvegarde utilisateur:', {
        username,
        trigramme,
        resource_id,
        is_expert,
        selectValue: document.getElementById('editUserResourceId').value
    });

    if (!username || !nom || !prenom || !email) {
        alert('Veuillez remplir tous les champs requis');
        return;
    }

    if (!is_admin && !is_expert && !is_user && !is_rh) {
        alert('Veuillez sélectionner au moins un profil');
        return;
    }

    if (is_expert && !resource_id) {
        alert('Veuillez sélectionner une ressource pour le profil Expert Métier');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/${currentEditUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                username,
                nom,
                prenom,
                email,
                trigramme,
                resource_id,
                is_admin,
                is_expert,
                is_user,
                is_rh,
                actif
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }

        alert('✅ Utilisateur modifié avec succès !');
        closeEditUserModal();
        await loadUsers();
        showSyncStatus();
        logModification('Modification du planning');
    } catch (error) {
        console.error('Erreur:', error);
        alert(error.message);
    }
}
