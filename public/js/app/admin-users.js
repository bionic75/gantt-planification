// Application principale : admin-users
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

// Fonction pour générer le trigramme à partir du nom et prénom
function generateTrigramme() {
    const nom = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();

    if (!nom || !prenom) return;

    // Retirer les accents et espaces
    const nomClean = removeAccents(nom).replace(/[\s\-]/g, '');
    const prenomClean = removeAccents(prenom).replace(/[\s\-]/g, '');

    // Prendre la 1ère lettre du prénom + 2 premières lettres du nom
    const trigramme = (prenomClean.charAt(0) + nomClean.substring(0, 2)).toUpperCase();

    document.getElementById('trigramme').value = trigramme;
}

async function addUser() {
    const username = document.getElementById('adminUserUsername').value.trim();
    const password = document.getElementById('adminUserPassword').value;
    const nom = document.getElementById('adminUserNom').value.trim();
    const prenom = document.getElementById('adminUserPrenom').value.trim();
    const email = document.getElementById('adminUserEmail').value.trim();
    const telephone = document.getElementById('adminUserTelephone').value.trim();
    const is_admin = document.getElementById('adminProfileAdmin').checked;
    const is_expert = document.getElementById('adminProfileExpert').checked;
    const is_user = document.getElementById('adminProfileUser').checked;
    const is_rh = document.getElementById('adminProfileRh').checked;
    const resource_id = document.getElementById('adminUserResource').value || null;

    if (!username || !password || !nom || !prenom || !email) {
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

    // Demander confirmation pour l'envoi de l'email
    const sendEmail = confirm(
        `Voulez-vous envoyer le mot de passe par email à ${email} ?\n\nMot de passe : ${password}`
    );

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                username,
                password,
                nom,
                prenom,
                email,
                telephone,
                is_admin,
                is_expert,
                is_user,
                is_rh,
                resource_id,
                sendEmail
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }

        const result = await response.json();

        if (sendEmail && result.emailSent) {
            alert('✅ Utilisateur créé avec succès et mot de passe envoyé par email !');
        } else if (sendEmail && !result.emailSent) {
            alert(
                "⚠️ Utilisateur créé mais l'email n'a pas pu être envoyé. Veuillez communiquer le mot de passe manuellement."
            );
        } else {
            alert('✅ Utilisateur créé avec succès !');
        }

        document.getElementById('adminUserUsername').value = '';
        document.getElementById('adminUserPassword').value = '';
        document.getElementById('adminUserNom').value = '';
        document.getElementById('adminUserPrenom').value = '';
        document.getElementById('adminUserEmail').value = '';
        document.getElementById('adminUserTelephone').value = '';
        document.getElementById('adminProfileAdmin').checked = false;
        document.getElementById('adminProfileExpert').checked = false;
        document.getElementById('adminProfileUser').checked = false;
        document.getElementById('adminProfileRh').checked = false;
        document.getElementById('adminUserResource').value = '';
        document.getElementById('expertResourceGroup').style.display = 'none';

        await loadUsers();
        await loadResources();
        showSyncStatus();
        logModification('Modification du planning');
    } catch (error) {
        console.error('Erreur:', error);
        alert(error.message);
    }
}

async function displayUsers() {
    const tbody = document.getElementById('usersList');
    tbody.innerHTML = '';

    // Mettre à jour le compteur actifs / total
    const countEl = document.getElementById('usersListCount');
    if (countEl) {
        const total = users.length;
        const actifs = users.filter(u => u.actif).length;
        countEl.textContent = `(${actifs} actif${actifs > 1 ? 's' : ''} / ${total} au total)`;
    }

    // Trier les utilisateurs par ordre alphabétique (nom, puis prénom)
    const sortedUsers = [...users].sort((a, b) => {
        const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
        const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
        return nameA.localeCompare(nameB);
    });

    sortedUsers.forEach(u => {
        // Construire la liste des rôles
        const roles = [];
        if (u.is_admin === 1) roles.push('Admin');
        if (u.is_expert === 1) roles.push('Expert');
        if (u.is_user === 1) roles.push('Utilisateur');

        const roleText = roles.join(', ');

        // Trigramme : pour expert, utiliser celui de la ressource ; sinon générer
        let trigramme = u.trigramme || '';
        if (!trigramme && u.prenom && u.nom) {
            trigramme = (u.prenom.charAt(0) + u.nom.substring(0, 2)).toUpperCase();
        }

        // Badges colorés par profil
        const profileBadges = [];
        if (u.is_admin === 1)
            profileBadges.push(
                `<span style="background-color:#e74c3c;color:white;padding:2px 7px;border-radius:3px;font-size:11px;white-space:nowrap;">Admin</span>`
            );
        if (u.is_expert === 1)
            profileBadges.push(
                `<span style="background-color:#f39c12;color:white;padding:2px 7px;border-radius:3px;font-size:11px;white-space:nowrap;">Expert Métier</span>`
            );
        if (u.is_user === 1)
            profileBadges.push(
                `<span style="background-color:#3498db;color:white;padding:2px 7px;border-radius:3px;font-size:11px;white-space:nowrap;">Utilisateur</span>`
            );
        if (u.is_rh === 1)
            profileBadges.push(
                `<span style="background-color:#8e44ad;color:white;padding:2px 7px;border-radius:3px;font-size:11px;white-space:nowrap;">RH</span>`
            );
        const profileBadgesHtml = profileBadges.length
            ? profileBadges.join(' ')
            : '<span style="color:#bdc3c7;font-size:11px;">—</span>';

        // Formater la dernière connexion
        let lastLoginDisplay = '-';
        if (u.last_login) {
            const lastLogin = new Date(u.last_login);
            const day = String(lastLogin.getDate()).padStart(2, '0');
            const month = String(lastLogin.getMonth() + 1).padStart(2, '0');
            const year = lastLogin.getFullYear();
            const hours = String(lastLogin.getHours()).padStart(2, '0');
            const minutes = String(lastLogin.getMinutes()).padStart(2, '0');
            const seconds = String(lastLogin.getSeconds()).padStart(2, '0');
            lastLoginDisplay = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }

        const row = tbody.insertRow();
        row.innerHTML = `
                    <td class="ell" title="${u.nom}" style="cursor: pointer; color: #1D70B7; font-weight: bold;" onclick="showUserDetails(${u.id})">${u.nom}</td>
                    <td class="ell" title="${u.prenom}">${u.prenom}</td><td class="ell" style="font-weight: bold; letter-spacing: 1px;">${trigramme}</td><td class="ell" title="${u.username}">${u.username}</td><td class="ell" title="${u.email}">${u.email}</td><td class="ell">${u.telephone || '-'}</td>
                    <td><div style="display:flex;flex-wrap:wrap;gap:3px;">${profileBadgesHtml}</div></td>
                    <td style="text-align: center;"><input type="checkbox" ${u.has_reporting_access === 1 || u.is_admin === 1 ? 'checked' : ''} ${u.is_admin === 1 ? 'disabled title="Les admins ont toujours accès"' : ''} onchange="toggleReportingAccess(${u.id}, this.checked)" style="width: 18px; height: 18px; cursor: ${u.is_admin === 1 ? 'not-allowed' : 'pointer'};"></td>
                    <td style="text-align: center;">${(() => {
                        const canHaveRh = u.is_admin === 1 || u.is_user === 1 || u.is_rh === 1;
                        return canHaveRh
                            ? `<input type="checkbox" ${u.is_rh === 1 ? 'checked' : ''} onchange="toggleRhAccess(${u.id}, this.checked)" style="width:18px;height:18px;cursor:pointer;" title="Validation RH">`
                            : `<input type="checkbox" disabled title="Réservé aux profils Admin, Utilisateur et RH" style="width:18px;height:18px;cursor:not-allowed;opacity:0.4;">`;
                    })()}</td>
                    <td><label class="toggle-switch"><input type="checkbox" ${u.actif ? 'checked' : ''} onchange="toggleUserActive(${u.id})"><span class="slider"></span></label></td>
                    <td style="font-size: 11px; white-space: nowrap;">${lastLoginDisplay}</td>
                    <td><div class="icon-actions">
                        <button type="button" class="icon-btn" style="background-color:#3498db;" onclick="openEditUserModal(${u.id})" title="Modifier l'utilisateur" aria-label="Modifier l'utilisateur">${uiIcon('pencil', 16, 'margin:0;vertical-align:middle;')}</button>
                        <button type="button" class="icon-btn" style="background-color:#f39c12;" onclick="openResetPasswordModal(${u.id})" title="Réinitialiser le mot de passe" aria-label="Réinitialiser le mot de passe">${uiIcon('key', 16, 'margin:0;vertical-align:middle;')}</button>
                        <button type="button" class="icon-btn" style="background-color:#9c27b0;" onclick="resetUserTotp(${u.id}, '${u.prenom} ${u.nom}')" title="Réinitialiser l\'appairage TOTP (changement de téléphone)" aria-label="Réinitialiser l\'appairage TOTP (changement de téléphone)">${uiIcon('smartphone', 16, 'margin:0;vertical-align:middle;')}</button>
                        <button type="button" class="icon-btn" style="background-color:#e65100;" onclick="forceLogoutUser(${u.id}, '${u.prenom} ${u.nom}')" title="Déconnecter immédiatement cet utilisateur" aria-label="Déconnecter immédiatement cet utilisateur">${uiIcon('logout', 16, 'margin:0;vertical-align:middle;')}</button>
                        <button type="button" class="icon-btn" style="background-color:#D60B51;" onclick="deleteUser(${u.id})" title="Supprimer l\'utilisateur" aria-label="Supprimer l\'utilisateur">${uiIcon('trash', 16, 'margin:0;vertical-align:middle;')}</button>
                    </div></td>
                `;
    });
    makeColResizable(document.getElementById('usersTable'));
}

async function forceLogoutUser(id, nom) {
    if (!confirm(`Forcer la déconnexion de ${nom} ?`)) return;
    try {
        const res = await fetch(`${API_URL}/users/${id}/force-logout`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            alert(data.wasConnected ? `✅ ${nom} a été déconnecté(e).` : `ℹ️ ${nom} n'était pas connecté(e).`);
        } else {
            alert('Erreur : ' + (data.error || 'inconnue'));
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

async function toggleUserActive(id) {
    try {
        const response = await fetch(`${API_URL}/users/${id}/toggle`, { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error('Erreur toggle');
        await loadUsers();
        showSyncStatus();
        logModification('Modification du planning');
    } catch (error) {
        console.error('Erreur:', error);
    }
}

async function toggleReportingAccess(id, hasAccess) {
    try {
        const response = await fetch(`${API_URL}/users/${id}/reporting-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ hasAccess })
        });
        if (!response.ok) throw new Error('Erreur modification accès reporting');
        await loadUsers();
        showSyncStatus();
    } catch (error) {
        console.error('Erreur:', error);
        alert("Erreur lors de la modification de l'accès au reporting");
        await loadUsers();
    }
}

async function toggleRhAccess(id, hasAccess) {
    try {
        const r = await fetch(`${API_URL}/users/${id}/rh-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ hasAccess })
        });
        if (!r.ok) throw new Error();
        await loadUsers();
    } catch {
        alert('Erreur modification accès RH');
        await loadUsers();
    }
}

async function toggleAstreinteAccess(userId, hasAccess) {
    try {
        const r = await fetch(`${API_URL}/users/${userId}/astreinte-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ hasAccess })
        });
        if (!r.ok) throw new Error();
        await loadUsers();
    } catch {
        alert('Erreur modification accès astreinte');
        await loadUsers();
    }
}

async function toggleAstreinteByResource(resourceId, hasAccess) {
    try {
        const r = await fetch(`${API_URL}/resources/${resourceId}/astreinte`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ hasAccess })
        });
        if (!r.ok) throw new Error();
        await loadResources();
    } catch {
        alert('Erreur modification accès astreinte');
        await loadResources();
    }
}
