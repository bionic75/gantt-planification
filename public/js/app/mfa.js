// Application principale : nom et profil de l'utilisateur dans l'en-tête, changement de profil (migrés au lot 6.2)
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Double authentification de la connexion : îlot Vue (frontend/src/connexion/EtapeDoubleAuthentification.vue)
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

// Sélecteur de profil de l'en-tête (comptes multi-profils) : liste ouverte ou fermée, changement de profil
function toggleProfileDropdown() {
    const dd = document.getElementById('profileDropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        setTimeout(
            () =>
                document.addEventListener('click', function h(e) {
                    if (!document.getElementById('profileSwitcher').contains(e.target)) {
                        dd.style.display = 'none';
                        document.removeEventListener('click', h);
                    }
                }),
            50
        );
    }
}

async function switchToProfile(profile) {
    if (profile === currentUser.activeProfile) {
        document.getElementById('profileDropdown').style.display = 'none';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/switch-profile`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile })
        });
        const data = await res.json();
        if (!data.success) {
            alert('Erreur : ' + (data.error || 'Impossible de changer de profil'));
            return;
        }
        currentUser.activeProfile = profile;
        document.getElementById('profileDropdown').style.display = 'none';
        // Recharger la page pour garantir une interface cohérente avec le nouveau profil
        location.reload();
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}
