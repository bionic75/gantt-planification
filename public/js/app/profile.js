// Application principale : profile
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== PHOTO DE PROFIL ==========

let selectedPhotoData = null;

function openProfilePhotoModal() {
    if (window.Themes) Themes.syncProfileUI();
    if (window.ColorMode) ColorMode.sync();
    const modal = document.getElementById('profilePhotoModal');
    const previewTrigramme = document.getElementById('previewTrigramme');
    const previewPhoto = document.getElementById('previewPhoto');

    // Afficher le trigramme actuel dans la preview
    if (currentUser && currentUser.trigramme) {
        previewTrigramme.textContent = currentUser.trigramme;
    }

    // Afficher la photo actuelle si elle existe
    if (currentUser && currentUser.profilePhoto) {
        previewPhoto.src = currentUser.profilePhoto;
        previewPhoto.style.display = 'block';
        previewTrigramme.style.display = 'none';
    } else {
        previewPhoto.style.display = 'none';
        previewTrigramme.style.display = 'block';
    }

    // Remplir la liste des onglets disponibles selon le profil
    populateDefaultTabSelect();

    // Charger la section SAMU si expert
    loadProfileSamuSection();

    modal.style.display = 'block';
}

// Remplir le select des onglets disponibles
function populateDefaultTabSelect() {
    const select = document.getElementById('defaultTabSelect');
    if (!select || !currentUser) return;

    const tabLabels = {
        resources: 'Ressources',
        evenements: 'Événements',
        planning: 'Planification',
        cra: 'CRA',
        reporting: 'Reporting',
        admin: 'Administration',
        astreintesGestion: 'Astreintes'
    };

    const availableTabs = getAvailableTabsForProfile(currentUser.activeProfile);
    const currentDefault = currentUser.defaultTab || 'planning';

    select.innerHTML = '';
    availableTabs.forEach(tab => {
        const option = document.createElement('option');
        option.value = tab;
        option.textContent = tabLabels[tab] || tab;
        if (tab === currentDefault) option.selected = true;
        select.appendChild(option);
    });
    renderDefaultTabPicker(select, tabLabels);
}

// Liste déroulante avec les mêmes icônes que la barre d'onglets
function renderDefaultTabPicker(select, labels) {
    select.style.display = 'none';
    let picker = document.getElementById('defaultTabPicker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'defaultTabPicker';
        picker.style.cssText = 'position:relative;';
        select.insertAdjacentElement('afterend', picker);
        document.addEventListener('click', e => {
            if (!picker.contains(e.target)) picker.querySelector('.tp-list').style.display = 'none';
        });
    }
    const iconOf = tab => {
        const svg = document.querySelector(`#mainTabsContainer [data-tab="${tab}"] svg.tab-ico`);
        return svg
            ? svg.outerHTML.replace(
                  'class="tab-ico"',
                  'class="tab-ico" style="width:18px;height:18px;margin-right:10px;vertical-align:middle;"'
              )
            : '';
    };
    const render = () => {
        const cur = select.value;
        picker.innerHTML = `
                    <button type="button" class="tp-btn" style="width:100%;display:flex;align-items:center;gap:0;padding:10px;border:1px solid #bdc3c7;border-radius:5px;background:#fff;color:#2c3e50;font-size:14px;cursor:pointer;text-align:left;">
                        <span style="display:flex;align-items:center;flex:1;">${iconOf(cur)}${labels[cur] || cur}</span>
                        <span style="font-size:10px;color:#7f8c8d;">▼</span>
                    </button>
                    <div class="tp-list" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #bdc3c7;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);z-index:10;overflow:hidden;">
                        ${[...select.options].map(o => `<div role="option" data-tab="${o.value}" style="display:flex;align-items:center;padding:10px 12px;cursor:pointer;font-size:14px;color:#2c3e50;${o.value === cur ? 'background:#e8eaf6;font-weight:bold;' : ''}" onmouseenter="this.style.background='#f0f4ff'" onmouseleave="this.style.background='${o.value === cur ? '#e8eaf6' : ''}'">${iconOf(o.value)}${labels[o.value] || o.value}</div>`).join('')}
                    </div>`;
        picker.querySelector('.tp-btn').onclick = e => {
            e.stopPropagation();
            const l = picker.querySelector('.tp-list');
            l.style.display = l.style.display === 'none' ? 'block' : 'none';
        };
        picker.querySelectorAll('[role="option"]').forEach(
            el =>
                (el.onclick = () => {
                    select.value = el.dataset.tab;
                    select.dispatchEvent(new Event('change'));
                    render();
                })
        );
    };
    render();
}

// Sauvegarder l'onglet par défaut
async function saveDefaultTab() {
    const select = document.getElementById('defaultTabSelect');
    if (!select || !currentUser) return;

    const newDefaultTab = select.value;

    try {
        const response = await fetch(`${API_URL}/users/${currentUser.id}/default-tab`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ defaultTab: newDefaultTab })
        });

        if (response.ok) {
            currentUser.defaultTab = newDefaultTab;

            // Notification toast
            const tabLabels = {
                resources: 'Ressources',
                evenements: 'Événements',
                planning: 'Planification',
                cra: 'CRA',
                reporting: 'Reporting',
                admin: 'Administration',
                astreintesGestion: 'Astreintes'
            };

            const toast = document.createElement('div');
            toast.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: #27ae60;
                        color: white;
                        padding: 15px 25px;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        z-index: 20000;
                        font-size: 14px;
                    `;
            toast.innerHTML = `✅ Onglet par défaut : <strong>${tabLabels[newDefaultTab]}</strong>`;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        } else {
            alert('Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

function closeProfilePhotoModal() {
    document.getElementById('profilePhotoModal').style.display = 'none';
    selectedPhotoData = null;
    document.getElementById('uploadPhotoBtn').style.display = 'none';

    // Réinitialiser les champs de mot de passe
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('passwordStrength').textContent = '';
    document.getElementById('passwordMatch').textContent = '';
}

// ===== PROFIL EXPERT — SAMU =====
const _profileSamuSelected = { principal: [], secondaire: [] };

async function loadProfileSamuSection() {
    const section = document.getElementById('profileSamuSection');
    if (!currentUser || currentUser.activeProfile !== 'expert' || !currentUser.resourceId) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    // Réinitialiser
    _profileSamuSelected.principal = [];
    _profileSamuSelected.secondaire = [];
    renderProfileSamuTags('principal');
    renderProfileSamuTags('secondaire');
    document.getElementById('profileSamuSaveMsg').style.display = 'none';

    try {
        const r = await fetch(`${API_URL}/resources/${currentUser.resourceId}/samu-assignments`, {
            credentials: 'include'
        });
        if (!r.ok) return;
        const rows = await r.json();
        rows.forEach(row => {
            if (row.role === 'principal') _profileSamuSelected.principal.push(row.samu);
            else _profileSamuSelected.secondaire.push(row.samu);
        });
        renderProfileSamuTags('principal');
        renderProfileSamuTags('secondaire');
    } catch (e) {
        console.error('Erreur chargement SAMU profil:', e);
    }
}

function renderProfileSamuTags(role) {
    const box = document.getElementById(`profileSamuTags_${role}`);
    const input = document.getElementById(`profileSamuInput_${role}`);
    // Supprimer les anciens tags (pas l'input)
    Array.from(box.children).forEach(c => {
        if (c !== input) c.remove();
    });
    _profileSamuSelected[role].forEach(samu => {
        const tag = document.createElement('span');
        tag.className = `samu-tag ${role}`;
        tag.innerHTML = `${samu}<span class="samu-tag-remove" onclick="removeProfileSamuTag('${role}','${samu}')">&times;</span>`;
        box.insertBefore(tag, input);
    });
}

function removeProfileSamuTag(role, samu) {
    _profileSamuSelected[role] = _profileSamuSelected[role].filter(s => s !== samu);
    renderProfileSamuTags(role);
}

function filterProfileSamuDropdown(role) {
    const input = document.getElementById(`profileSamuInput_${role}`);
    const dropdown = document.getElementById(`profileSamuDropdown_${role}`);
    const q = input.value.trim().toLowerCase();
    const SAMU_LIST_ALL = [
        'SAMU 01',
        'SAMU 02',
        'SAMU 03',
        'SAMU 04',
        'SAMU 05',
        'SAMU 06',
        'SAMU 07',
        'SAMU 08',
        'SAMU 09',
        'SAMU 10',
        'SAMU 11',
        'SAMU 12',
        'SAMU 13',
        'SAMU 14',
        'SAMU 15',
        'SAMU 16',
        'SAMU 17',
        'SAMU 18',
        'SAMU 19',
        'SAMU 21',
        'SAMU 22',
        'SAMU 23',
        'SAMU 24',
        'SAMU 25',
        'SAMU 26',
        'SAMU 27',
        'SAMU 28',
        'SAMU 29',
        'SAMU 30',
        'SAMU 31',
        'SAMU 32',
        'SAMU 33',
        'SAMU 34',
        'SAMU 35',
        'SAMU 36',
        'SAMU 37',
        'SAMU 38',
        'SAMU 40',
        'SAMU 41',
        'SAMU 42',
        'SAMU 43',
        'SAMU 44',
        'SAMU 45',
        'SAMU 46',
        'SAMU 47',
        'SAMU 48',
        'SAMU 49',
        'SAMU 50',
        'SAMU 51',
        'SAMU 52',
        'SAMU 53',
        'SAMU 54',
        'SAMU 55',
        'SAMU 56',
        'SAMU 57',
        'SAMU 59',
        'SAMU 60',
        'SAMU 61',
        'SAMU 62',
        'SAMU 63',
        'SAMU 64A',
        'SAMU 64B',
        'SAMU 65',
        'SAMU 66',
        'SAMU 67',
        'SAMU 68',
        'SAMU 69',
        'SAMU 71',
        'SAMU 72',
        'SAMU 73',
        'SAMU 74',
        'SAMU 75',
        'SAMU 76A',
        'SAMU 76B',
        'SAMU 77',
        'SAMU 78',
        'SAMU 79',
        'SAMU 80',
        'SAMU 81',
        'SAMU 82',
        'SAMU 83',
        'SAMU 84',
        'SAMU 85',
        'SAMU 86',
        'SAMU 87',
        'SAMU 88',
        'SAMU 89',
        'SAMU 91',
        'SAMU 92',
        'SAMU 93',
        'SAMU 94',
        'SAMU 95',
        'SAMU 971',
        'SAMU 972',
        'SAMU 973',
        'SAMU 974',
        'SAMU 976',
        'SAMU 2A',
        'SAMU 2B'
    ];
    const filtered = SAMU_LIST_ALL.filter(s => s.toLowerCase().includes(q) && !_profileSamuSelected[role].includes(s));
    if (!filtered.length) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = filtered
        .slice(0, 20)
        .map(s => `<div class="samu-tag-dropdown-item" onmousedown="addProfileSamuTag('${role}','${s}')">${s}</div>`)
        .join('');
    dropdown.style.display = 'block';
}

function addProfileSamuTag(role, samu) {
    if (!_profileSamuSelected[role].includes(samu)) {
        _profileSamuSelected[role].push(samu);
        renderProfileSamuTags(role);
    }
    document.getElementById(`profileSamuInput_${role}`).value = '';
    document.getElementById(`profileSamuDropdown_${role}`).style.display = 'none';
}

function handleProfileSamuKeydown(e, role) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = document.getElementById(`profileSamuInput_${role}`).value.trim();
        if (val) addProfileSamuTag(role, val);
    } else if (e.key === 'Escape') {
        document.getElementById(`profileSamuDropdown_${role}`).style.display = 'none';
    }
}

async function saveProfileSamuAssignments() {
    try {
        const r = await fetch(`${API_URL}/me/samu-assignments`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                principal: _profileSamuSelected.principal,
                secondaire: _profileSamuSelected.secondaire
            })
        });
        if (!r.ok) {
            const d = await r.json();
            alert('Erreur: ' + (d.error || 'inconnue'));
            return;
        }
        const msg = document.getElementById('profileSamuSaveMsg');
        msg.style.display = 'block';
        setTimeout(() => {
            msg.style.display = 'none';
        }, 3000);
    } catch (e) {
        alert('Erreur réseau: ' + e.message);
    }
}
// ===== /PROFIL EXPERT — SAMU =====

function handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Vérifier que c'est une image
    if (!file.type.startsWith('image/')) {
        alert('Veuillez sélectionner une image');
        return;
    }

    // Vérifier la taille (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert("L'image est trop grande (max 2MB)");
        return;
    }

    // Lire et afficher l'image
    const reader = new FileReader();
    reader.onload = function (e) {
        selectedPhotoData = e.target.result;

        // Afficher dans la preview
        const previewPhoto = document.getElementById('previewPhoto');
        const previewTrigramme = document.getElementById('previewTrigramme');

        previewPhoto.src = selectedPhotoData;
        previewPhoto.style.display = 'block';
        previewTrigramme.style.display = 'none';

        // Afficher le bouton de validation
        document.getElementById('uploadPhotoBtn').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

function uploadPhoto() {
    if (!selectedPhotoData) {
        alert('Aucune photo sélectionnée');
        return;
    }

    console.log('📤 Upload photo - Taille:', selectedPhotoData.length, 'caractères');

    fetch('/api/profile/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ photo: selectedPhotoData })
    })
        .then(response => response.json())
        .then(data => {
            console.log('📥 Réponse upload:', data);
            if (data.success) {
                // Mettre à jour la photo dans le header
                const profilePhoto = document.getElementById('profilePhoto');
                const profileTrigramme = document.getElementById('profileTrigramme');

                profilePhoto.src = selectedPhotoData;
                profilePhoto.style.display = 'block';
                profileTrigramme.style.display = 'none';

                // Mettre à jour currentUser
                currentUser.profilePhoto = selectedPhotoData;
                console.log('✅ currentUser.profilePhoto mis à jour');

                // Recharger les users pour mettre à jour le Gantt
                console.log('🔄 Rechargement des users...');
                loadUsers().then(() => {
                    console.log('✅ Users rechargés, mise à jour du Gantt...');
                    updateGantt(); // Rafraîchir le Gantt pour afficher la nouvelle photo
                    console.log('✅ Gantt mis à jour');
                });

                closeProfilePhotoModal();
                alert('Photo mise à jour avec succès !');
            } else {
                alert("Erreur lors de l'upload: " + (data.error || 'Erreur inconnue'));
            }
        })
        .catch(error => {
            console.error('Erreur upload photo:', error);
            alert("Erreur lors de l'upload de la photo");
        });
}

// Validation du mot de passe en temps réel

function validatePasswordStrength() {
    const password = document.getElementById('newPassword').value;
    const strengthEl = document.getElementById('passwordStrength');

    if (!password) {
        strengthEl.textContent = '';
        strengthEl.style.color = '#7f8c8d';
        return false;
    }

    const hasMinLength = password.length >= 8;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/]/.test(password);

    if (hasMinLength && hasSpecialChar) {
        strengthEl.textContent = '✓ Mot de passe valide';
        strengthEl.style.color = '#27ae60';
        return true;
    } else {
        const errors = [];
        if (!hasMinLength) errors.push('8 caractères minimum');
        if (!hasSpecialChar) errors.push('1 caractère spécial requis');
        strengthEl.textContent = '✗ ' + errors.join(', ');
        strengthEl.style.color = '#e74c3c';
        return false;
    }
}

function checkPasswordMatch() {
    const password = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    const matchEl = document.getElementById('passwordMatch');

    if (!confirm) {
        matchEl.textContent = '';
        return false;
    }

    if (password === confirm) {
        matchEl.textContent = '✓ Les mots de passe correspondent';
        matchEl.style.color = '#27ae60';
        return true;
    } else {
        matchEl.textContent = '✗ Les mots de passe ne correspondent pas';
        matchEl.style.color = '#e74c3c';
        return false;
    }
}

async function changePassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    console.log('🔐 changePassword appelé');
    console.log('Nouveau mot de passe:', newPassword ? `${newPassword.length} caractères` : 'vide');
    console.log('Confirmation:', confirmPassword ? `${confirmPassword.length} caractères` : 'vide');

    // Validation
    if (!newPassword || !confirmPassword) {
        console.log('❌ Champs vides détectés');
        alert('Veuillez remplir tous les champs');
        return;
    }

    console.log('✅ Champs remplis, validation de la force...');
    if (!validatePasswordStrength()) {
        console.log('❌ Mot de passe pas assez fort');
        alert('Le mot de passe doit contenir au moins 8 caractères et 1 caractère spécial');
        return;
    }

    console.log('✅ Force validée, vérification correspondance...');
    if (!checkPasswordMatch()) {
        console.log('❌ Mots de passe ne correspondent pas');
        alert('Les mots de passe ne correspondent pas');
        return;
    }

    console.log('✅ Tout validé, demande de confirmation...');
    if (!confirm('Êtes-vous sûr de vouloir changer votre mot de passe ?')) {
        console.log("❌ Annulé par l'utilisateur");
        return;
    }

    console.log('📡 Envoi de la requête au serveur...');
    try {
        const response = await fetch('/api/profile/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ newPassword })
        });

        const data = await response.json();
        console.log('📥 Réponse serveur:', data);

        if (response.ok && data.success) {
            alert('✅ Mot de passe changé avec succès !');
            // Réinitialiser les champs
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            document.getElementById('passwordStrength').textContent = '';
            document.getElementById('passwordMatch').textContent = '';
        } else {
            alert('Erreur : ' + (data.error || 'Impossible de changer le mot de passe'));
        }
    } catch (error) {
        console.error('Erreur changement mot de passe:', error);
        alert('Erreur lors du changement de mot de passe');
    }
}

function updateProfileDisplay() {
    console.log('🔄 updateProfileDisplay appelé');

    if (!currentUser) {
        console.log('❌ Pas de currentUser');
        return;
    }

    console.log('👤 currentUser:', currentUser);
    console.log('📛 Trigramme:', currentUser.trigramme);
    console.log('📷 Photo:', currentUser.profilePhoto);

    const profileCircle = document.getElementById('profileCircle');
    const profileTrigramme = document.getElementById('profileTrigramme');
    const profilePhoto = document.getElementById('profilePhoto');

    if (!profileCircle || !profileTrigramme || !profilePhoto) {
        console.error('❌ Éléments DOM non trouvés');
        return;
    }

    if (currentUser.profilePhoto) {
        // Afficher la photo
        console.log('✅ Affichage de la photo');
        profilePhoto.src = currentUser.profilePhoto;
        profilePhoto.style.display = 'block';
        profileTrigramme.style.display = 'none';
    } else if (currentUser.trigramme) {
        // Afficher le trigramme
        console.log('✅ Affichage du trigramme:', currentUser.trigramme);
        profileTrigramme.textContent = currentUser.trigramme;
        profileTrigramme.style.display = 'inline-block';
        profilePhoto.style.display = 'none';
    } else {
        // Fallback : afficher les initiales Prénom + Nom
        const initiales = (currentUser.prenom?.charAt(0) || '') + (currentUser.nom?.charAt(0) || '');
        console.log('⚠️ Pas de trigramme, utilisation des initiales:', initiales);
        profileTrigramme.textContent = initiales || '??';
        profileTrigramme.style.display = 'inline-block';
        profilePhoto.style.display = 'none';
    }
}
