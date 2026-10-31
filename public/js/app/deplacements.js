// Application principale : deplacements
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ============== FONCTIONS POUR L'APPLICATION DÉPLACEMENTS ==============

function showDeplacementsApp() {
    if (window.hideAffectationApp) hideAffectationApp();
    console.log("🚗 Affichage de l'application Déplacements");

    // Sauvegarder l'application sélectionnée
    sessionStorage.setItem('selectedApp', 'deplacements');

    // Masquer le container principal de planification
    document.querySelector('.container').style.display = 'none';

    // Afficher le container déplacements
    document.getElementById('deplacementsContainer').style.display = 'block';

    // Mettre à jour les infos utilisateur
    updateDeplacementsUserDisplay();

    // Afficher les onglets selon le profil
    updateDeplacementsTabsVisibility();

    // Afficher le premier onglet et charger les données
    switchDeplacementsTab('planification');

    // Afficher le timer, les utilisateurs connectés et le bouton retour Planification
    document.getElementById('deplacementsTimerDisplay').style.display = 'block';
    document.getElementById('deplacementsOnlineUsersContainer').style.display = 'flex';
    document.getElementById('backToPlanificationBtn').style.display = 'none'; // retour par le menu Applications

    // Charger les paramètres puis démarrer le timer
    loadSettingsForDeplacements().then(() => {
        startInactivityTimer(inactivityTimeout);
    });

    // Démarrer le polling des utilisateurs connectés
    startDeplacementsOnlineUsersPolling();
}

async function loadSettingsForDeplacements() {
    try {
        const response = await fetch(`${API_URL}/settings`, { credentials: 'include' });
        if (response.ok) {
            const settings = await response.json();
            // Le timeout est en MINUTES dans les paramètres
            inactivityTimeout = settings.inactivity_timeout || 5;
            console.log('⚙️ Timeout inactivité déplacements:', inactivityTimeout, 'minutes');
        }
    } catch (error) {
        console.error('Erreur chargement settings:', error);
        inactivityTimeout = 5; // 5 minutes par défaut
    }
}

function updateDeplacementsUserDisplay() {
    if (!currentUser) return;

    // Nom de l'utilisateur
    const fullName = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.username;
    document.getElementById('deplacementsUserDisplayName').textContent = fullName;

    // Badge de profil
    const profileText =
        currentUser.activeProfile === 'admin'
            ? 'Administrateur'
            : currentUser.activeProfile === 'expert'
              ? 'Expert Métier'
              : 'Utilisateur';
    const badgeEl = document.getElementById('deplacementsUserDisplayRole');
    badgeEl.textContent = profileText;

    // Trigramme et photo
    const trigramme = currentUser.trigramme || '?';
    document.getElementById('deplacementsProfileTrigramme').textContent = trigramme;

    if (currentUser.profilePhoto) {
        document.getElementById('deplacementsProfilePhoto').src = currentUser.profilePhoto;
        document.getElementById('deplacementsProfilePhoto').style.display = 'block';
        document.getElementById('deplacementsProfileTrigramme').style.display = 'none';
    } else {
        document.getElementById('deplacementsProfilePhoto').style.display = 'none';
        document.getElementById('deplacementsProfileTrigramme').style.display = 'flex';
    }
}

function updateDeplacementsTabsVisibility() {
    if (!currentUser) return;

    const isAdmin = currentUser.activeProfile === 'admin';
    // Vérification robuste pour is_amoa_ced (peut être 1, true, "1", ou truthy)
    const isAmoaCed = currentUser.is_amoa_ced == 1 || currentUser.is_amoa_ced === true;

    console.log('🔍 Vérification onglets déplacements:', {
        isAdmin,
        isAmoaCed,
        is_amoa_ced_raw: currentUser.is_amoa_ced
    });

    // Onglet Reporting - pour Admin ET AMOA CED
    document.getElementById('deplacementsTabReporting').style.display = isAdmin || isAmoaCed ? 'inline-block' : 'none';

    // Onglet Administration - uniquement pour Admin
    document.getElementById('deplacementsTabAdmin').style.display = isAdmin ? 'inline-block' : 'none';
}

function switchToPlanificationApp() {
    console.log("📅 Retour à l'application Planification");

    // Arrêter le timer de déplacements
    stopInactivityTimer();

    // Arrêter le polling des utilisateurs connectés
    if (deplacementsOnlineUsersInterval) {
        clearInterval(deplacementsOnlineUsersInterval);
    }

    // Masquer l'application déplacements
    document.getElementById('deplacementsContainer').style.display = 'none';
    document.getElementById('deplacementsTimerDisplay').style.display = 'none';
    document.getElementById('deplacementsOnlineUsersContainer').style.display = 'none';

    // Afficher l'application planification
    document.querySelector('.container').style.display = 'block';

    // Mettre à jour l'application sélectionnée
    if (currentUser) {
        currentUser.selectedApp = 'planification';
    }

    // Réinitialiser le timer de l'app principale
    resetTimer();
}

function openDeplacementsSearchModal() {
    alert('Recherche - Fonctionnalité en cours de développement');
}

let deplacementsOnlineUsersInterval = null;

function startDeplacementsOnlineUsersPolling() {
    // Charger immédiatement
    updateDeplacementsOnlineUsers();

    // Arrêter l'intervalle existant s'il y en a un
    if (deplacementsOnlineUsersInterval) {
        clearInterval(deplacementsOnlineUsersInterval);
    }

    // Mettre à jour toutes les 30 secondes
    deplacementsOnlineUsersInterval = setInterval(updateDeplacementsOnlineUsers, 30000);
}

let deplacementsOnlineUsersTooltipVisible = false;

async function updateDeplacementsOnlineUsers() {
    try {
        const response = await fetch(`${API_URL}/active-sessions`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            const onlineUsers = data.activeUsers || [];

            // Mettre à jour le compteur
            const countEl = document.getElementById('deplacementsOnlineUsersCount');
            countEl.textContent = `${onlineUsers.length} connecté(s)`;

            // Mettre à jour les avatars
            const avatarsEl = document.getElementById('deplacementsOnlineUsersAvatars');
            avatarsEl.innerHTML = '';

            const maxAvatars = 5;
            const usersToShow = onlineUsers.slice(0, maxAvatars);

            usersToShow.forEach((user, index) => {
                const avatar = document.createElement('div');
                avatar.style.cssText = `
                            width: 24px;
                            height: 24px;
                            border-radius: 50%;
                            background-color: #3498db;
                            color: white;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                            font-weight: bold;
                            margin-left: ${index > 0 ? '-8px' : '0'};
                            border: 2px solid white;
                            z-index: ${maxAvatars - index};
                            position: relative;
                        `;

                if (user.profilePhoto) {
                    avatar.innerHTML = `<img src="${user.profilePhoto}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                } else {
                    avatar.textContent = user.trigramme || user.prenom?.charAt(0) || '?';
                }
                avatar.title = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.username;

                avatarsEl.appendChild(avatar);
            });

            if (onlineUsers.length > maxAvatars) {
                const more = document.createElement('div');
                more.style.cssText = `
                            width: 24px;
                            height: 24px;
                            border-radius: 50%;
                            background-color: #95a5a6;
                            color: white;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 9px;
                            font-weight: bold;
                            margin-left: -8px;
                            border: 2px solid white;
                        `;
                more.textContent = `+${onlineUsers.length - maxAvatars}`;
                avatarsEl.appendChild(more);
            }

            // Mettre à jour la liste du tooltip
            updateDeplacementsOnlineUsersTooltipList(onlineUsers);
        }
    } catch (error) {
        console.error('Erreur chargement utilisateurs connectés:', error);
    }
}

function updateDeplacementsOnlineUsersTooltipList(users) {
    const listDiv = document.getElementById('deplacementsOnlineUsersTooltipList');
    if (!listDiv) return;

    if (users.length === 0) {
        listDiv.innerHTML =
            '<div style="color: #999; font-size: 11px; text-align: center; padding: 10px;">Aucun utilisateur connecté</div>';
        return;
    }

    let html = '';
    users.forEach(user => {
        const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.username;
        const profileLabel = user.profile === 'admin' ? 'Admin' : user.profile === 'expert' ? 'Expert' : 'Utilisateur';
        const badgeColor = user.profile === 'admin' ? '#e74c3c' : user.profile === 'expert' ? '#f39c12' : '#3498db';

        html += `
                    <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f0f0f0;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; overflow: hidden;">
                            ${
                                user.profilePhoto
                                    ? `<img src="${user.profilePhoto}" style="width: 100%; height: 100%; object-fit: cover;">`
                                    : user.trigramme || user.prenom?.charAt(0) || '?'
                            }
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 12px; color: #2c3e50; font-weight: 500;">${fullName}</div>
                            <span style="font-size: 9px; background-color: ${badgeColor}; color: white; padding: 1px 5px; border-radius: 3px;">${profileLabel}</span>
                        </div>
                    </div>
                `;
    });

    listDiv.innerHTML = html;
}

function toggleDeplacementsOnlineUsersTooltip(event) {
    event.stopPropagation();
    const tooltip = document.getElementById('deplacementsOnlineUsersTooltip');
    if (!tooltip) return;

    deplacementsOnlineUsersTooltipVisible = !deplacementsOnlineUsersTooltipVisible;
    tooltip.style.display = deplacementsOnlineUsersTooltipVisible ? 'block' : 'none';
}

// Fermer le tooltip déplacements en cliquant ailleurs
document.addEventListener('click', function (event) {
    const tooltip = document.getElementById('deplacementsOnlineUsersTooltip');
    const container = document.getElementById('deplacementsOnlineUsersContainer');

    if (tooltip && container && !container.contains(event.target) && !tooltip.contains(event.target)) {
        deplacementsOnlineUsersTooltipVisible = false;
        tooltip.style.display = 'none';
    }
});

async function logoutFromDeplacements(auto = false) {
    if (auto) {
        // Déconnexion automatique (timeout)
        stopInactivityTimer();
        if (deplacementsOnlineUsersInterval) {
            clearInterval(deplacementsOnlineUsersInterval);
        }
        await performLogout();
        document.getElementById('deplacementsContainer').style.display = 'none';
        document.getElementById('deplacementsTimerDisplay').style.display = 'none';
        document.getElementById('deplacementsOnlineUsersContainer').style.display = 'none';
        document.getElementById('deplacementsOnlineUsersTooltip').style.display = 'none';
        return;
    }

    // Afficher le modal de choix
    showDeplacementsLogoutModal();
}

function showDeplacementsLogoutModal() {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('deplacementsLogoutModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'deplacementsLogoutModal';
        modal.className = 'modal';
        modal.innerHTML = `
                    <div class="modal-content" style="max-width: 400px; text-align: center;">
                        <h3 style="margin-bottom: 20px; color: #2c3e50;">Que souhaitez-vous faire ?</h3>
                        <div style="display: flex; flex-direction: column; gap: 15px;">
                            <button onclick="goToPlanificationApp()" style="background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; padding: 15px 20px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <span style="font-size: 24px;">📅</span>
                                <span>Aller sur la Plateforme de planification</span>
                            </button>
                            <button onclick="confirmLogoutFromDeplacements()" style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 15px 20px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <span style="font-size: 24px;">🚪</span>
                                <span>Se déconnecter</span>
                            </button>
                            <button onclick="closeDeplacementsLogoutModal()" style="background-color: #95a5a6; color: white; padding: 12px 20px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
                                Annuler
                            </button>
                        </div>
                    </div>
                `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
}

function closeDeplacementsLogoutModal() {
    const modal = document.getElementById('deplacementsLogoutModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function goToPlanificationApp() {
    closeDeplacementsLogoutModal();

    // Sauvegarder l'application sélectionnée
    sessionStorage.setItem('selectedApp', 'planification');

    // Arrêter le timer de déplacements
    stopInactivityTimer();

    // Arrêter le polling des utilisateurs connectés de l'app déplacements
    if (deplacementsOnlineUsersInterval) {
        clearInterval(deplacementsOnlineUsersInterval);
    }

    // Masquer l'application déplacements
    document.getElementById('deplacementsContainer').style.display = 'none';
    document.getElementById('deplacementsTimerDisplay').style.display = 'none';
    document.getElementById('deplacementsOnlineUsersContainer').style.display = 'none';
    document.getElementById('deplacementsOnlineUsersTooltip').style.display = 'none';

    // Afficher l'application planification
    document.querySelector('.container').style.display = 'block';

    // Mettre à jour l'application sélectionnée
    if (currentUser) {
        currentUser.selectedApp = 'planification';
    }

    // Réinitialiser l'affichage de l'IHM principale
    updateTabsVisibility();
    updateUserDisplay();

    // Afficher le timer et les utilisateurs connectés de l'app principale
    document.getElementById('inactivityTimerDisplay').style.display = 'block';
    document.getElementById('onlineUsersContainer').style.display = 'flex';

    // Recharger les données pour s'assurer que tout est à jour
    await loadResources();
    await loadSchedule();
    await loadSettings();

    // Réinitialiser l'affichage du mois courant
    setCurrentMonth();

    // Mettre à jour le Gantt si on est sur l'onglet planification
    if (document.getElementById('planning').classList.contains('active')) {
        updateGantt();
    }

    // Afficher les ressources si on est sur l'onglet ressources
    if (document.getElementById('resources').classList.contains('active')) {
        displayResources();
    }

    // Démarrer le polling des utilisateurs connectés
    startOnlineUsersPolling();

    // Charger les notifications pour les experts
    if (currentUser.activeProfile === 'expert') {
        await loadNewAssignments();
    }

    console.log('📅 Retour à la Plateforme de planification effectué');
}

async function confirmLogoutFromDeplacements() {
    closeDeplacementsLogoutModal();

    // Nettoyer le sessionStorage
    sessionStorage.removeItem('selectedApp');

    // Arrêter le timer
    stopInactivityTimer();

    // Arrêter le polling des utilisateurs connectés
    if (deplacementsOnlineUsersInterval) {
        clearInterval(deplacementsOnlineUsersInterval);
    }

    await performLogout();

    // Masquer l'application déplacements
    document.getElementById('deplacementsContainer').style.display = 'none';
    document.getElementById('deplacementsTimerDisplay').style.display = 'none';
    document.getElementById('deplacementsOnlineUsersContainer').style.display = 'none';
    document.getElementById('deplacementsOnlineUsersTooltip').style.display = 'none';
}

// ============== FIN FONCTIONS APPLICATION DÉPLACEMENTS ==============

// ============== FONCTIONS GESTION BONS DE COMMANDE ET DÉPLACEMENTS ==============

let bonsCommandeList = [];
let listeSamu = [];

// Fonction utilitaire pour formater une date en français
function formatDateFr(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Charger les données au changement d'onglet
function switchDeplacementsTab(tabName) {
    // Désactiver tous les onglets
    document.querySelectorAll('#deplacementsContainer .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Masquer tous les contenus
    document.querySelectorAll('#deplacementsContainer .tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Activer l'onglet et le contenu sélectionnés
    if (tabName === 'planification') {
        document.getElementById('deplacementsTabPlanification').classList.add('active');
        document.querySelector('#deplacementsContainer #deplacementsPlanificationTab').classList.add('active');
        loadMesDeplacements();
        loadListeSamu();
        loadBonsCommandeForSelect();
        loadAmoaCedForSelect();
    } else if (tabName === 'reporting') {
        document.getElementById('deplacementsTabReporting').classList.add('active');
        document.querySelector('#deplacementsContainer #deplacementsReportingTab').classList.add('active');
        loadReportingDeplacements();
        loadAllDeplacements();
    } else if (tabName === 'admin') {
        document.getElementById('deplacementsTabAdmin').classList.add('active');
        document.querySelector('#deplacementsContainer #deplacementsAdminTab').classList.add('active');
        loadBonsCommande();
    }
}

// ===== BONS DE COMMANDE =====

async function loadBonsCommande() {
    console.log('📋 Chargement des bons de commande...');
    try {
        // Utiliser l'API reporting pour avoir les UO consommées
        const response = await fetch(`${API_URL}/reporting-deplacements`, { credentials: 'include' });
        console.log('📋 Réponse reporting-deplacements:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('📋 Bons de commande reçus:', data);
            bonsCommandeList = data;
            displayBonsCommande(data);
        } else {
            console.error('📋 Erreur HTTP:', response.status);
            const errorText = await response.text();
            console.error('📋 Détail erreur:', errorText);
        }
    } catch (error) {
        console.error('📋 Erreur chargement bons de commande:', error);
    }
}

function displayBonsCommande(bons) {
    console.log('📋 Affichage bons de commande:', bons?.length || 0);
    const tbody = document.getElementById('bonsCommandeBody');
    if (!tbody) {
        console.error('📋 Element bonsCommandeBody non trouvé!');
        return;
    }
    if (!bons || bons.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="9" style="text-align: center; color: #999;">Aucun bon de commande</td></tr>';
        return;
    }

    tbody.innerHTML = bons
        .map(bc => {
            const uoCommandees = bc.uo_commandees || bc.nb_uo || 0;
            const uoConsommees = bc.uo_consommees || 0;
            const diff = uoConsommees - uoCommandees;
            const isSurconsommation = uoConsommees > uoCommandees;

            // Déterminer le message d'observation
            let observation = '';
            if (bc.solde) {
                if (bc.regularisation_cible_bdc_id) {
                    // Surconsommation déjà régularisée
                    const cibleLabel = bc.regularisation_cible_intitule || `BDC #${bc.regularisation_cible_bdc_id}`;
                    observation = `<span style="color: #27ae60; font-weight: bold;">✅ Surconsommation régularisée sur le bon de commande ${cibleLabel}</span>`;
                } else if (isSurconsommation) {
                    // Surconsommation sur BDC soldé = régularisation à prévoir
                    observation = `<span style="color: #e74c3c; font-weight: bold;">⚠️ Régularisation à prévoir pour ${diff} UO sur le prochain bon de commande</span>`;
                } else if (uoConsommees < uoCommandees) {
                    // Sous-consommation sur BDC soldé = réfaction à prévoir
                    observation = `<span style="color: #2196F3; font-weight: bold;">ℹ️ Réfaction à prévoir pour ${Math.abs(diff)} UO</span>`;
                } else {
                    observation = '<span style="color: #27ae60;">✅ Équilibré</span>';
                }
            } else {
                // BDC non soldé - afficher juste le solde restant
                const soldeRestant = uoCommandees - uoConsommees;
                if (soldeRestant < 0) {
                    observation = `<span style="color: #e74c3c;">${soldeRestant} UO (surconsommation)</span>`;
                } else {
                    observation = `<span style="color: #27ae60;">${soldeRestant} UO disponibles</span>`;
                }
            }

            return `
                <tr style="${bc.solde ? 'background-color: #fff8e1;' : ''}">
                    <td>
                        <a href="#" onclick="openBdcDeplacementsModal(${bc.id}, '${bc.intitule.replace(/'/g, "\\'")}', '${bc.titulaire || ''}', ${bc.solde ? 1 : 0}, ${isSurconsommation ? 1 : 0}, ${diff}); return false;" 
                           style="color: #3498db; text-decoration: underline; cursor: pointer; font-weight: bold;">
                            ${bc.intitule}
                        </a>
                    </td>
                    <td style="text-transform: uppercase;">${bc.titulaire || '-'}</td>
                    <td>${formatDateFr(bc.date_debut)}</td>
                    <td>${formatDateFr(bc.date_fin)}</td>
                    <td style="text-align: center; font-weight: bold;">${uoConsommees}</td>
                    <td style="text-align: center; font-weight: bold;">${uoCommandees}</td>
                    <td style="text-align: center;">
                        <span style="background-color: ${bc.solde ? '#ff9800' : '#27ae60'}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px;">
                            ${bc.solde ? 'OUI' : 'NON'}
                        </span>
                    </td>
                    <td style="font-size: 12px;">${observation}</td>
                    <td>
                        <button onclick="editBonCommande(${bc.id})" style="background-color: #3498db; color: white; padding: 5px 10px; margin-right: 5px; font-size: 12px;">✏️ Modifier</button>
                        <button onclick="deleteBonCommande(${bc.id})" style="background-color: #e74c3c; color: white; padding: 5px 10px; font-size: 12px;">🗑️ Supprimer</button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

// Variables pour le modal des déplacements du BDC
let currentBdcDeplacementsList = [];
let currentBdcId = null;
let targetBdcId = null;
let uoSurconsommation = 0;

async function openBdcDeplacementsModal(bcId, bcIntitule, bcTitulaire, isSolde, isSurconsommation, uoEnTrop) {
    currentBdcId = bcId;
    uoSurconsommation = uoEnTrop;

    document.getElementById('bdcDeplacementsModalTitle').innerHTML = `
                📋 Déplacements du bon de commande<br>
                <span style="font-size: 16px; color: #3498db;">${bcIntitule} - ${bcTitulaire || 'N/A'}</span>
            `;

    const regularisationSection = document.getElementById('bdcRegularisationSection');

    if (isSolde && isSurconsommation) {
        regularisationSection.style.display = 'block';
        document.getElementById('bdcUoEnTrop').textContent = uoEnTrop;
        document.getElementById('bdcRegulUo').textContent = uoEnTrop;

        // Pré-remplir la date de début au 1er jour du mois prochain
        const today = new Date();
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        document.getElementById('bdcRegulDateDebut').value = nextMonth.toISOString().split('T')[0];

        // Pré-remplir le commentaire
        document.getElementById('bdcRegulCommentaire').value =
            `Régularisation du bon de commande ${bcIntitule} qui était en surconsommation`;

        // Charger les BDC disponibles (non soldés)
        await loadBdcCiblesForRegularisation(bcTitulaire, bcId);
    } else {
        regularisationSection.style.display = 'none';
    }

    await loadBdcDeplacements(bcId, false, 0);
    document.getElementById('bdcDeplacementsModal').classList.add('active');
}

async function creerLigneRegularisationTechnique() {
    const cibleBdcId = document.getElementById('bdcCibleRegularisation').value;
    const dateDebut = document.getElementById('bdcRegulDateDebut').value;
    const commentaire = document.getElementById('bdcRegulCommentaire').value.trim();

    if (!cibleBdcId) {
        alert('Veuillez sélectionner un bon de commande cible.');
        return;
    }
    if (!dateDebut) {
        alert('Veuillez renseigner une date de début.');
        return;
    }

    const nbUo = uoSurconsommation;
    const cibleText =
        document.getElementById('bdcCibleRegularisation').options[
            document.getElementById('bdcCibleRegularisation').selectedIndex
        ].text;

    if (
        !confirm(
            `Créer une ligne de régularisation technique de ${nbUo} UO sur le bon de commande :\n\n${cibleText}\n\nDate de début : ${dateDebut}\nCommentaire : ${commentaire}\n\nConfirmer ?`
        )
    )
        return;

    try {
        const res = await fetch(`${API_URL}/deplacements/regularisation-technique`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                source_bdc_id: currentBdcId,
                cible_bdc_id: parseInt(cibleBdcId),
                nb_uo: nbUo,
                date_debut: dateDebut,
                commentaire: commentaire || null
            })
        });
        const data = await res.json();
        if (!res.ok) {
            alert('Erreur : ' + (data.error || res.status));
            return;
        }

        alert(
            `✅ Ligne de régularisation créée avec succès !\n\nBDC source : ${data.source_intitule}\nBDC cible : ${data.cible_intitule}\nUO régularisées : ${data.nb_uo}\nPériode : ${data.date_debut} → ${data.date_fin}`
        );

        closeBdcDeplacementsModal();
        loadBonsCommande();
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

async function loadBdcCiblesForRegularisation(titulaire, excludeBcId) {
    const select = document.getElementById('bdcCibleRegularisation');
    select.innerHTML = '<option value="">-- Chargement... --</option>';
    try {
        const response = await fetch(`${API_URL}/reporting-deplacements`, { credentials: 'include' });
        if (response.ok) {
            const bons = await response.json();
            // Tous les BDC actifs non soldés (pas seulement même titulaire)
            const bonsCibles = bons.filter(bc => bc.id !== excludeBcId && !bc.solde && bc.actif !== 0);
            if (bonsCibles.length === 0) {
                select.innerHTML = '<option value="">-- Aucun BDC actif disponible --</option>';
            } else {
                select.innerHTML =
                    '<option value="">-- Sélectionner un BDC --</option>' +
                    bonsCibles
                        .map(bc => {
                            const solde = (bc.uo_commandees || 0) - (bc.uo_consommees || 0);
                            return `<option value="${bc.id}">${bc.intitule} (${solde} UO disponibles)</option>`;
                        })
                        .join('');
                if (bonsCibles.length === 1) select.value = bonsCibles[0].id;
            }
        }
    } catch (error) {
        select.innerHTML = '<option value="">-- Erreur de chargement --</option>';
    }
}

async function loadBdcDeplacements(bcId, showCheckboxes, uoEnTrop) {
    try {
        const response = await fetch(`${API_URL}/deplacements?bon_commande_id=${bcId}`, { credentials: 'include' });
        if (response.ok) {
            currentBdcDeplacementsList = await response.json();
            displayBdcDeplacements(currentBdcDeplacementsList);
        }
    } catch (error) {
        console.error('Erreur chargement déplacements BDC:', error);
    }
}

function displayBdcDeplacements(deplacements) {
    const tbody = document.getElementById('bdcDeplacementsBody');
    const thead = document.getElementById('bdcDeplacementsHead');

    thead.innerHTML = `<tr>
                <th>Utilisateur</th><th>SAMU</th><th>Ville</th>
                <th>Date début</th><th>Date fin</th><th>Nb UO</th>
            </tr>`;

    if (!deplacements || deplacements.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Aucun déplacement</td></tr>';
        return;
    }

    deplacements.sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut));

    tbody.innerHTML = deplacements
        .map(d => {
            const isRegul = !!d.regularisation_source_bdc_id;
            const rowStyle = isRegul ? 'background:#e8f5e9;font-style:italic;' : '';
            const tag = isRegul
                ? '<span style="background:#27ae60;color:white;border-radius:8px;padding:1px 6px;font-size:10px;margin-left:4px;">Régularisation</span>'
                : '';
            return `<tr style="${rowStyle}">
                    <td>${d.user_prenom || ''} ${d.user_nom || ''}${tag}</td>
                    <td>${d.samu || '-'}</td>
                    <td>${d.ville || '-'}</td>
                    <td>${formatDateFr(d.date_debut)}</td>
                    <td>${formatDateFr(d.date_fin)}</td>
                    <td style="text-align:center;font-weight:bold;">${d.nb_uo}</td>
                </tr>`;
        })
        .join('');
}

function closeBdcDeplacementsModal() {
    document.getElementById('bdcDeplacementsModal').classList.remove('active');
    currentBdcDeplacementsList = [];
    currentBdcId = null;
    targetBdcId = null;
    uoSurconsommation = 0;
}

async function addBonCommande() {
    const intitule = document.getElementById('bcIntitule').value.trim();
    const titulaire = document.getElementById('bcTitulaire').value.trim().toUpperCase();
    const date_debut = document.getElementById('bcDateDebut').value;
    const date_fin = document.getElementById('bcDateFin').value;
    const nb_uo = parseInt(document.getElementById('bcNbUO').value);

    if (!intitule || !titulaire || !date_debut || !date_fin || !nb_uo) {
        alert('Veuillez remplir tous les champs');
        return;
    }

    if (date_fin < date_debut) {
        alert('La date de fin doit être postérieure à la date de début');
        return;
    }

    // Contrôle d'unicité du numéro de CBDC
    const existingBC = bonsCommandeList.find(bc => bc.intitule.toLowerCase() === intitule.toLowerCase());
    if (existingBC) {
        alert('Ce numéro de CBDC existe déjà. Veuillez en saisir un autre.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/bons-commande`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ intitule, titulaire, date_debut, date_fin, nb_uo })
        });

        if (response.ok) {
            // Réinitialiser le formulaire
            document.getElementById('bcIntitule').value = '';
            document.getElementById('bcTitulaire').value = '';
            document.getElementById('bcDateDebut').value = '';
            document.getElementById('bcDateFin').value = '';
            document.getElementById('bcNbUO').value = '';

            loadBonsCommande();
            alert('Bon de commande créé avec succès');
        } else {
            const data = await response.json();
            alert(data.error || 'Erreur lors de la création');
        }
    } catch (error) {
        console.error('Erreur création bon de commande:', error);
        alert('Erreur lors de la création');
    }
}

function editBonCommande(id) {
    const bc = bonsCommandeList.find(b => b.id === id);
    if (!bc) return;

    document.getElementById('editBcId').value = bc.id;
    document.getElementById('editBcIntitule').value = bc.intitule;
    document.getElementById('editBcTitulaire').value = bc.titulaire || '';
    document.getElementById('editBcDateDebut').value = bc.date_debut;
    document.getElementById('editBcDateFin').value = bc.date_fin;
    document.getElementById('editBcNbUO').value = bc.uo_commandees || bc.nb_uo;
    document.getElementById('editBcSolde').checked = bc.solde === 1;

    document.getElementById('editBonCommandeModal').classList.add('active');
}

function closeEditBonCommandeModal() {
    document.getElementById('editBonCommandeModal').classList.remove('active');
}

async function saveBonCommande() {
    const id = document.getElementById('editBcId').value;
    const intitule = document.getElementById('editBcIntitule').value.trim();
    const titulaire = document.getElementById('editBcTitulaire').value.trim().toUpperCase();
    const date_debut = document.getElementById('editBcDateDebut').value;
    const date_fin = document.getElementById('editBcDateFin').value;
    const nb_uo = parseInt(document.getElementById('editBcNbUO').value);
    const solde = document.getElementById('editBcSolde').checked;

    if (!intitule || !titulaire || !date_debut || !date_fin || !nb_uo) {
        alert('Veuillez remplir tous les champs');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/bons-commande/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ intitule, titulaire, date_debut, date_fin, nb_uo, solde })
        });

        if (response.ok) {
            closeEditBonCommandeModal();
            loadBonsCommande();
            alert('Bon de commande modifié avec succès');
        } else {
            const data = await response.json();
            alert(data.error || 'Erreur lors de la modification');
        }
    } catch (error) {
        console.error('Erreur modification bon de commande:', error);
        alert('Erreur lors de la modification');
    }
}

async function deleteBonCommande(id) {
    // Trouver le BC pour afficher son nom
    const bc = bonsCommandeList.find(b => b.id === id);
    const bcName = bc ? bc.intitule : 'ce bon de commande';

    if (
        !confirm(
            `⚠️ Êtes-vous sûr de vouloir supprimer "${bcName}" ?\n\nSi des déplacements sont associés à ce bon de commande, ils seront marqués comme "À affecter".`
        )
    ) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/bons-commande/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            const result = await response.json();
            loadBonsCommande();
            loadMesDeplacements(); // Rafraîchir aussi la liste des déplacements

            if (result.deplacements_desaffectes > 0) {
                alert(
                    `✅ Bon de commande supprimé.\n\n${result.deplacements_desaffectes} déplacement(s) ont été désaffectés et sont maintenant marqués "À affecter".`
                );
            } else {
                alert('Bon de commande supprimé');
            }
        } else {
            const data = await response.json();
            alert(data.error || 'Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur suppression bon de commande:', error);
        alert('Erreur lors de la suppression');
    }
}

// ===== DÉPLACEMENTS =====

// Liste statique des SAMU (identique à l'application principale)
const SAMU_LIST = [
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

function loadListeSamu() {
    listeSamu = SAMU_LIST;
    const select = document.getElementById('deplacementSamu');
    select.innerHTML =
        '<option value="">-- Sélectionner un SAMU --</option>' +
        listeSamu.map(s => `<option value="${s}">${s}</option>`).join('');
}

// Charger la liste des AMOA CED pour la liste déroulante
// Variable globale pour stocker les utilisateurs AMOA CED
let amoaCedUsers = [];

async function loadAmoaCedForSelect() {
    const select = document.getElementById('deplacementAmoaCed');
    const fixedDiv = document.getElementById('deplacementAmoaCedFixed');
    const fixedName = document.getElementById('deplacementAmoaCedFixedName');
    const fixedId = document.getElementById('deplacementAmoaCedFixedId');

    if (!select || !fixedDiv) return;

    const isAdmin = currentUser && currentUser.activeProfile === 'admin';

    if (isAdmin) {
        // Mode administrateur : afficher la liste déroulante
        select.style.display = 'block';
        fixedDiv.style.display = 'none';

        try {
            const response = await fetch(`${API_URL}/users/amoa-ced`, { credentials: 'include' });
            if (response.ok) {
                amoaCedUsers = await response.json();

                if (amoaCedUsers.length === 0) {
                    select.innerHTML = '<option value="">-- Aucun AMOA CED disponible --</option>';
                } else {
                    select.innerHTML =
                        '<option value="">-- Sélectionner un AMOA CED --</option>' +
                        amoaCedUsers
                            .map(
                                u =>
                                    `<option value="${u.id}">${u.nom.toUpperCase()} ${u.prenom}${u.trigramme ? ' (' + u.trigramme + ')' : ''}</option>`
                            )
                            .join('');
                }
            }
        } catch (error) {
            console.error('Erreur chargement AMOA CED:', error);
        }
    } else {
        // Mode utilisateur : afficher le nom fixe de l'utilisateur connecté
        select.style.display = 'none';
        fixedDiv.style.display = 'block';

        if (currentUser) {
            const displayName =
                `${currentUser.nom ? currentUser.nom.toUpperCase() : ''} ${currentUser.prenom || ''}${currentUser.trigramme ? ' (' + currentUser.trigramme + ')' : ''}`.trim();
            fixedName.textContent = displayName || currentUser.username;
            fixedId.value = currentUser.id;
        }
    }
}

async function loadBonsCommandeForSelect() {
    try {
        const response = await fetch(`${API_URL}/bons-commande`, { credentials: 'include' });
        if (response.ok) {
            bonsCommandeList = await response.json();
            // Remplir la liste déroulante des bons de commande non soldés
            const select = document.getElementById('deplacementBonCommande');
            const availableBCs = bonsCommandeList.filter(bc => bc.solde !== 1);
            select.innerHTML =
                '<option value="">-- Sélectionner un bon de commande --</option>' +
                availableBCs
                    .map(bc => `<option value="${bc.id}">${bc.intitule} - ${bc.titulaire || 'N/A'}</option>`)
                    .join('');
        }
    } catch (error) {
        console.error('Erreur chargement bons de commande:', error);
    }
}

function updateDeplacementBonCommande() {
    const dateDebut = document.getElementById('deplacementDateDebut').value;
    const dateFin = document.getElementById('deplacementDateFin').value;

    if (!dateDebut || !dateFin) {
        document.getElementById('deplacementNbUO').value = '0';
        hideDeplacementSurconsommationWarning();
        return;
    }

    // Calculer le nombre d'UO
    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    const diffTime = Math.abs(end - start);
    const nbUO = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    document.getElementById('deplacementNbUO').value = nbUO;

    // Pré-sélectionner le bon de commande correspondant aux dates (non soldé)
    const select = document.getElementById('deplacementBonCommande');
    const bc = bonsCommandeList.find(b => b.solde !== 1 && b.date_debut <= dateDebut && b.date_fin >= dateFin);

    if (bc) {
        select.value = bc.id;
    }

    // Vérifier la surconsommation
    checkDeplacementSurconsommation();
}

// Vérifier si le déplacement va causer une surconsommation
async function checkDeplacementSurconsommation() {
    const bcSelect = document.getElementById('deplacementBonCommande');
    const nbUOInput = document.getElementById('deplacementNbUO');

    if (!bcSelect || !nbUOInput) {
        console.error('Elements formulaire non trouvés');
        return;
    }

    const bcId = bcSelect.value;
    const nbUO = parseInt(nbUOInput.value) || 0;

    console.log('🔍 checkDeplacementSurconsommation - BC ID:', bcId, ', UO demandées:', nbUO);

    // Masquer l'avertissement si pas de BC ou pas d'UO
    if (!bcId || nbUO === 0) {
        hideDeplacementSurconsommationWarning();
        return;
    }

    // Trouver le BC dans la liste locale pour avoir l'intitulé
    const bcLocal = bonsCommandeList.find(b => b.id === parseInt(bcId));
    console.log('🔍 BC local trouvé:', bcLocal);

    if (!bcLocal) {
        hideDeplacementSurconsommationWarning();
        return;
    }

    try {
        // Récupérer les stats du bon de commande via l'API reporting
        const response = await fetch(`${API_URL}/reporting-deplacements`, { credentials: 'include' });
        console.log('🔍 Response reporting:', response.status);

        if (response.ok) {
            const bons = await response.json();
            console.log('🔍 Bons reçus:', bons);

            const bcStats = bons.find(b => b.id === parseInt(bcId));
            console.log('🔍 BC stats trouvé:', bcStats);

            if (bcStats) {
                const uoCommandees = bcStats.uo_commandees || 0;
                const uoConsommees = bcStats.uo_consommees || 0;
                const soldeActuel = uoCommandees - uoConsommees;

                console.log(
                    '🔍 Calcul: commandées=',
                    uoCommandees,
                    ', consommées=',
                    uoConsommees,
                    ', solde=',
                    soldeActuel,
                    ', demandées=',
                    nbUO
                );

                // Si le solde actuel moins les nouvelles UO est négatif = surconsommation
                if (soldeActuel - nbUO < 0) {
                    console.log('⚠️ SURCONSOMMATION DÉTECTÉE !');
                    showDeplacementSurconsommationWarning(bcLocal.intitule, soldeActuel, nbUO);
                } else {
                    console.log('✅ Pas de surconsommation');
                    hideDeplacementSurconsommationWarning();
                }
            } else {
                console.log('❌ BC non trouvé dans les stats');
                hideDeplacementSurconsommationWarning();
            }
        } else {
            console.error('❌ Erreur API:', response.status);
        }
    } catch (error) {
        console.error('❌ Erreur vérification surconsommation:', error);
        hideDeplacementSurconsommationWarning();
    }
}

function showDeplacementSurconsommationWarning(bcIntitule, soldeActuel, nbUO) {
    const warningDiv = document.getElementById('deplacementSurconsommationWarning');
    const messageSpan = document.getElementById('deplacementSurconsommationMessage');

    console.log('🔴 Affichage warning - div:', warningDiv, ', span:', messageSpan);

    if (warningDiv && messageSpan) {
        messageSpan.innerHTML = `Le solde du bon de commande <strong>"${bcIntitule}"</strong> sera dépassé (${soldeActuel} UO disponibles, ${nbUO} UO demandées).<br>Merci de penser à régulariser sur le prochain bon de commande.`;
        warningDiv.style.display = 'block';
        console.log('🔴 Warning affiché !');
    } else {
        console.error('❌ Elements warning non trouvés !');
    }
}

function hideDeplacementSurconsommationWarning() {
    const warningDiv = document.getElementById('deplacementSurconsommationWarning');
    if (warningDiv) {
        warningDiv.style.display = 'none';
    }
}

function updateDeplacementBonCommandeSelection() {
    // Fonction appelée quand on change manuellement le bon de commande
    checkDeplacementSurconsommation();
}

async function loadMesDeplacements() {
    try {
        const response = await fetch(`${API_URL}/mes-deplacements`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            displayMesDeplacements(data);
        }
    } catch (error) {
        console.error('Erreur chargement mes déplacements:', error);
    }
}

function displayMesDeplacements(deplacements) {
    const tbody = document.getElementById('mesDeplacementsBody');
    const thead = document.getElementById('mesDeplacementsHead');
    const title = document.getElementById('mesDeplacementsTitle');
    const isAdmin = currentUser && currentUser.activeProfile === 'admin';

    // Adapter le titre selon le profil
    if (title) {
        title.textContent = isAdmin ? 'Liste de tous les déplacements' : 'Liste de mes déplacements';
    }

    // Adapter les headers selon le profil
    // Ordre: Date début - Date fin - Nb UO - SAMU - Ville - AMOA CED - Bon de commande - Créé par (admin) - Créé le (admin) - Commentaire - Actions
    if (thead) {
        thead.innerHTML = `
                    <tr>
                        <th class="sortable" onclick="sortDeplacementsTable(0, 'date')">Date début</th>
                        <th class="sortable" onclick="sortDeplacementsTable(1, 'date')">Date fin</th>
                        <th class="sortable" onclick="sortDeplacementsTable(2, 'number')">Nb UO</th>
                        <th class="sortable" onclick="sortDeplacementsTable(3, 'text')">SAMU</th>
                        <th class="sortable" onclick="sortDeplacementsTable(4, 'text')">Ville</th>
                        <th class="sortable" onclick="sortDeplacementsTable(5, 'text')">AMOA CED</th>
                        <th class="sortable" onclick="sortDeplacementsTable(6, 'text')">Bon de commande</th>
                        ${isAdmin ? '<th class="sortable" onclick="sortDeplacementsTable(7, \'text\')">Créé par</th><th class="sortable" onclick="sortDeplacementsTable(8, \'date\')">Créé le</th>' : ''}
                        <th>Commentaire</th>
                        <th>Actions</th>
                    </tr>
                `;
    }

    const colSpan = isAdmin ? 11 : 9;

    if (!deplacements || deplacements.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: #999;">Aucun déplacement enregistré</td></tr>`;
        return;
    }

    // Calculer les UO cumulées par BDC pour identifier les dépassements
    // On trie par date de création pour identifier quel déplacement fait dépasser
    const depassePlafond = {};

    try {
        const deplacementsSorted = [...deplacements].sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateA - dateB;
        });
        const uoCumuleeParBdc = {};

        deplacementsSorted.forEach(d => {
            if (d.bon_commande_id) {
                const bcId = d.bon_commande_id;
                // Utiliser les données du BC directement depuis le déplacement (jointure SQL)
                const uoCommandees = d.bc_uo_commandees || d.bc_nb_uo || 0;

                if (!uoCumuleeParBdc[bcId]) {
                    uoCumuleeParBdc[bcId] = 0;
                }

                uoCumuleeParBdc[bcId] += d.nb_uo || 0;

                // Si ce déplacement fait dépasser le plafond
                if (uoCommandees > 0 && uoCumuleeParBdc[bcId] > uoCommandees) {
                    depassePlafond[d.id] = true;
                }
            }
        });
    } catch (error) {
        console.error('Erreur calcul dépassements:', error);
    }

    tbody.innerHTML = deplacements
        .map(d => {
            // Trouver le nom de l'AMOA CED (dans les utilisateurs)
            const amoaCed = (amoaCedUsers || []).find(u => u.id === d.amoa_ced_id);
            const amoaCedName = amoaCed
                ? `${amoaCed.nom.toUpperCase()} ${amoaCed.prenom}`
                : d.amoa_ced_nom
                  ? `${d.amoa_ced_nom.toUpperCase()} ${d.amoa_ced_prenom || ''}`
                  : '-';

            // Nom du créateur (pour admin)
            const creatorName = d.creator_nom ? `${d.creator_nom.toUpperCase()} ${d.creator_prenom || ''}` : '-';

            // Date de création formatée
            let createdAt = '-';
            if (d.created_at) {
                try {
                    const datePart = d.created_at.includes('T')
                        ? d.created_at.split('T')[0]
                        : d.created_at.split(' ')[0];
                    createdAt = formatDateFr(datePart);
                } catch (e) {
                    createdAt = '-';
                }
            }

            // Vérifier si le déplacement n'a pas de BC affecté
            const hasNoBC = !d.bon_commande_id || !d.bon_commande_intitule;

            // Vérifier si ce déplacement dépasse le plafond
            const isDepassement = depassePlafond[d.id] === true;

            // Style de ligne si à régulariser OU si pas de BC affecté OU si dépassement
            const needsAttention = d.a_regulariser || hasNoBC || isDepassement;
            const rowStyle = needsAttention ? 'background-color: #ffebee; border-left: 4px solid #e74c3c;' : '';

            // Badge à afficher
            let badge = '';
            if (d.a_regulariser) {
                badge = `<span style="display: inline-block; background-color: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; margin-left: 5px;">⚠️ À RÉGULARISER</span>`;
            }

            // Affichage du bon de commande
            let bcDisplay;
            if (hasNoBC) {
                bcDisplay = `<span style="color: #e74c3c; font-weight: bold;">⚠️ À affecter</span>`;
            } else {
                bcDisplay = `${d.bon_commande_intitule}${d.bon_commande_titulaire ? ' - ' + d.bon_commande_titulaire : ''}${badge}`;
            }

            // Affichage du commentaire
            // Si dépassement et pas déjà de commentaire sur le dépassement, ajouter automatiquement
            let commentaireText = d.commentaire || '';
            if (isDepassement && !commentaireText.includes('Dépasse le plafond')) {
                const depassementMsg = '⚠️ Dépasse le plafond de la commande';
                commentaireText = commentaireText ? `${depassementMsg} | ${commentaireText}` : depassementMsg;
            }

            const commentaireDisplay = commentaireText
                ? `<span title="${commentaireText.replace(/"/g, '&quot;')}" style="${isDepassement ? 'color: #e74c3c; font-weight: bold;' : ''}">${commentaireText.length > 30 ? commentaireText.substring(0, 30) + '...' : commentaireText}</span>`
                : '<span style="color: #999;">-</span>';

            return `
                <tr style="${rowStyle}">
                    <td>${formatDateFr(d.date_debut)}</td>
                    <td>${formatDateFr(d.date_fin)}</td>
                    <td>${d.nb_uo}</td>
                    <td>${d.samu}</td>
                    <td>${d.ville}</td>
                    <td>${amoaCedName}</td>
                    <td>${bcDisplay}</td>
                    ${isAdmin ? `<td style="font-size: 11px;">${creatorName}</td><td style="font-size: 11px;">${createdAt}</td>` : ''}
                    <td style="font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${commentaireDisplay}</td>
                    <td>
                        <button onclick="editDeplacement(${d.id})" style="background-color: ${needsAttention ? '#e74c3c' : '#3498db'}; color: white; padding: 5px 10px; font-size: 12px; margin-right: 5px;">${hasNoBC ? '📋 Affecter' : d.a_regulariser ? '🔄 Régulariser' : '✏️ Modifier'}</button>
                        <button onclick="deleteDeplacement(${d.id})" style="background-color: #e74c3c; color: white; padding: 5px 10px; font-size: 12px;">🗑️ Supprimer</button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

// Variable pour stocker les déplacements
let mesDeplacementsList = [];

async function addDeplacement() {
    // Récupérer l'ID AMOA CED selon le profil (select pour admin, input hidden pour utilisateur)
    const isAdmin = currentUser && currentUser.activeProfile === 'admin';
    const amoa_ced_id = isAdmin
        ? document.getElementById('deplacementAmoaCed').value
        : document.getElementById('deplacementAmoaCedFixedId').value;

    const date_debut = document.getElementById('deplacementDateDebut').value;
    const date_fin = document.getElementById('deplacementDateFin').value;
    const samu = document.getElementById('deplacementSamu').value;
    const ville = document.getElementById('deplacementVille').value.trim().toUpperCase();
    const bon_commande_id = document.getElementById('deplacementBonCommande').value;
    const commentaire = document.getElementById('deplacementCommentaire').value.trim();

    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }

    if (!bon_commande_id) {
        alert('Veuillez sélectionner un bon de commande');
        return;
    }

    if (date_fin < date_debut) {
        alert('La date de fin doit être postérieure ou égale à la date de début');
        return;
    }

    // Vérifier que les dates sont dans la période du bon de commande
    const bonCommande = bonsCommandeList.find(bc => bc.id === parseInt(bon_commande_id));
    if (bonCommande) {
        if (date_debut < bonCommande.date_debut || date_fin > bonCommande.date_fin) {
            alert(
                `⚠️ Les dates du déplacement sont en dehors de la période du bon de commande sélectionné.\n\nBon de commande : ${bonCommande.intitule}\nPériode valide : du ${formatDateFr(bonCommande.date_debut)} au ${formatDateFr(bonCommande.date_fin)}\n\nVeuillez corriger les dates ou choisir un autre bon de commande.`
            );
            return;
        }
    }

    try {
        const response = await fetch(`${API_URL}/deplacements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                amoa_ced_id: parseInt(amoa_ced_id),
                date_debut,
                date_fin,
                samu,
                ville,
                bon_commande_id: parseInt(bon_commande_id),
                commentaire
            })
        });

        if (response.ok) {
            const result = await response.json();

            // Réinitialiser le formulaire (seulement le select pour les admins)
            if (isAdmin) {
                document.getElementById('deplacementAmoaCed').value = '';
            }
            document.getElementById('deplacementDateDebut').value = '';
            document.getElementById('deplacementDateFin').value = '';
            document.getElementById('deplacementSamu').value = '';
            document.getElementById('deplacementVille').value = '';
            document.getElementById('deplacementBonCommande').value = '';
            document.getElementById('deplacementNbUO').value = '0';
            document.getElementById('deplacementCommentaire').value = '';

            // Masquer l'avertissement de surconsommation
            hideDeplacementSurconsommationWarning();

            loadMesDeplacements();

            // Message différent si surconsommation
            if (result.a_regulariser) {
                alert(
                    '⚠️ ATTENTION - Déplacement créé sur un bon de commande en SURCONSOMMATION !\n\n' +
                        'Ce déplacement est marqué "À RÉGULARISER".\n\n' +
                        "Vous devrez le transférer vers un autre bon de commande disposant d'UO disponibles.\n\n" +
                        'Pour régulariser : cliquez sur le bouton "🔄 Régulariser" dans la liste des déplacements.'
                );
            } else {
                alert('Déplacement ajouté avec succès');
            }
        } else {
            const data = await response.json();
            alert(data.error || "Erreur lors de l'ajout");
        }
    } catch (error) {
        console.error('Erreur ajout déplacement:', error);
        alert("Erreur lors de l'ajout");
    }
}

async function deleteDeplacement(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce déplacement ?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/deplacements/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            loadMesDeplacements();
            alert('Déplacement supprimé');
        } else {
            const data = await response.json();
            alert(data.error || 'Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur suppression déplacement:', error);
        alert('Erreur lors de la suppression');
    }
}

// Ouvrir la modal d'édition de déplacement
async function editDeplacement(id) {
    try {
        const response = await fetch(`${API_URL}/deplacements/${id}`, { credentials: 'include' });
        if (response.ok) {
            const deplacement = await response.json();

            document.getElementById('editDeplacementId').value = deplacement.id;
            document.getElementById('editDeplacementAmoaCed').value = deplacement.amoa_ced_id || '';
            document.getElementById('editDeplacementDateDebut').value = deplacement.date_debut;
            document.getElementById('editDeplacementDateFin').value = deplacement.date_fin;
            document.getElementById('editDeplacementSamu').value = deplacement.samu;
            document.getElementById('editDeplacementVille').value = deplacement.ville;
            document.getElementById('editDeplacementBonCommande').value = deplacement.bon_commande_id || '';
            document.getElementById('editDeplacementCommentaire').value = deplacement.commentaire || '';

            // Remplir les listes déroulantes
            await loadEditDeplacementSelects();

            // Re-sélectionner les valeurs
            document.getElementById('editDeplacementAmoaCed').value = deplacement.amoa_ced_id || '';
            document.getElementById('editDeplacementSamu').value = deplacement.samu;
            document.getElementById('editDeplacementBonCommande').value = deplacement.bon_commande_id || '';

            document.getElementById('editDeplacementModal').classList.add('active');
        }
    } catch (error) {
        console.error('Erreur chargement déplacement:', error);
        alert('Erreur lors du chargement du déplacement');
    }
}

async function loadEditDeplacementSelects() {
    // Charger les AMOA CED si pas encore fait
    if (amoaCedUsers.length === 0) {
        try {
            const response = await fetch(`${API_URL}/users/amoa-ced`, { credentials: 'include' });
            if (response.ok) {
                amoaCedUsers = await response.json();
            }
        } catch (error) {
            console.error('Erreur chargement AMOA CED:', error);
        }
    }

    // AMOA CED
    const amoaCedSelect = document.getElementById('editDeplacementAmoaCed');
    amoaCedSelect.innerHTML =
        '<option value="">-- Sélectionner --</option>' +
        amoaCedUsers.map(u => `<option value="${u.id}">${u.nom.toUpperCase()} ${u.prenom}</option>`).join('');

    // SAMU
    const samuSelect = document.getElementById('editDeplacementSamu');
    samuSelect.innerHTML =
        '<option value="">-- Sélectionner --</option>' +
        SAMU_LIST.map(s => `<option value="${s}">${s}</option>`).join('');

    // Bons de commande
    // Pour les admins: afficher tous les BDC (soldés avec badge)
    // Pour les utilisateurs: afficher uniquement les BDC non soldés + le BC actuel s'il est soldé
    const isAdmin = currentUser && currentUser.activeProfile === 'admin';
    const bcSelect = document.getElementById('editDeplacementBonCommande');
    const currentBcId = parseInt(document.getElementById('editDeplacementBonCommande').value) || null;

    let availableBCs;
    if (isAdmin) {
        // Admin voit tous les BDC
        availableBCs = bonsCommandeList;
    } else {
        // Utilisateur ne voit que les BDC non soldés + le BC actuel (même soldé)
        availableBCs = bonsCommandeList.filter(bc => bc.solde !== 1 || bc.id === currentBcId);
    }

    bcSelect.innerHTML =
        '<option value="">-- Sélectionner --</option>' +
        availableBCs
            .map(bc => {
                const soldeBadge = bc.solde === 1 ? ' [SOLDÉ]' : '';
                return `<option value="${bc.id}">${bc.intitule} - ${bc.titulaire || 'N/A'}${soldeBadge}</option>`;
            })
            .join('');
}

function closeEditDeplacementModal() {
    document.getElementById('editDeplacementModal').classList.remove('active');
}

async function saveDeplacement() {
    const id = document.getElementById('editDeplacementId').value;
    const amoa_ced_id = document.getElementById('editDeplacementAmoaCed').value;
    const date_debut = document.getElementById('editDeplacementDateDebut').value;
    const date_fin = document.getElementById('editDeplacementDateFin').value;
    const samu = document.getElementById('editDeplacementSamu').value;
    const ville = document.getElementById('editDeplacementVille').value.trim().toUpperCase();
    const bon_commande_id = document.getElementById('editDeplacementBonCommande').value;
    const commentaire = document.getElementById('editDeplacementCommentaire').value.trim();

    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville || !bon_commande_id) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }

    if (date_fin < date_debut) {
        alert('La date de fin doit être postérieure ou égale à la date de début');
        return;
    }

    // Vérifier que les dates sont dans la période du bon de commande
    const bonCommande = bonsCommandeList.find(bc => bc.id === parseInt(bon_commande_id));
    if (bonCommande) {
        if (date_debut < bonCommande.date_debut || date_fin > bonCommande.date_fin) {
            alert(
                `⚠️ Les dates du déplacement sont en dehors de la période du bon de commande sélectionné.\n\nBon de commande : ${bonCommande.intitule}\nPériode valide : du ${formatDateFr(bonCommande.date_debut)} au ${formatDateFr(bonCommande.date_fin)}\n\nVeuillez corriger les dates ou choisir un autre bon de commande.`
            );
            return;
        }
    }

    try {
        const response = await fetch(`${API_URL}/deplacements/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                amoa_ced_id: parseInt(amoa_ced_id),
                date_debut,
                date_fin,
                samu,
                ville,
                bon_commande_id: parseInt(bon_commande_id),
                commentaire
            })
        });

        if (response.ok) {
            closeEditDeplacementModal();
            loadMesDeplacements();
            alert('Déplacement modifié avec succès');
        } else {
            const data = await response.json();
            alert(data.error || 'Erreur lors de la modification');
        }
    } catch (error) {
        console.error('Erreur modification déplacement:', error);
        alert('Erreur lors de la modification');
    }
}

// ===== REPORTING =====

async function loadReportingDeplacements() {
    try {
        const response = await fetch(`${API_URL}/reporting-deplacements`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            displayReportingBonsCommande(data);
        }
    } catch (error) {
        console.error('Erreur chargement reporting:', error);
    }
}

function displayReportingBonsCommande(bons) {
    const tbody = document.getElementById('reportingBonsCommandeBody');
    if (!bons || bons.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="7" style="text-align: center; color: #999;">Aucun bon de commande</td></tr>';
        return;
    }

    // Remplir aussi la liste déroulante des filtres
    const filterBdc = document.getElementById('filterReportingBdc');
    if (filterBdc) {
        filterBdc.innerHTML =
            '<option value="">-- Tous les BDC --</option>' +
            bons.map(bc => `<option value="${bc.id}">${bc.intitule} - ${bc.titulaire || 'N/A'}</option>`).join('');
    }

    tbody.innerHTML = bons
        .map(bc => {
            const solde = bc.uo_commandees - bc.uo_consommees;
            const tauxConsommation = bc.uo_commandees > 0 ? Math.round((bc.uo_consommees / bc.uo_commandees) * 100) : 0;
            const soldeColor = solde < 0 ? '#e74c3c' : solde < bc.uo_commandees * 0.2 ? '#f39c12' : '#27ae60';
            const barColor = tauxConsommation > 100 ? '#e74c3c' : tauxConsommation > 80 ? '#f39c12' : '#27ae60';

            // Concaténer N° BDC et titulaire
            const bdcDisplay = `${bc.intitule}${bc.titulaire ? ' - ' + bc.titulaire : ''}`;

            // Badge Soldé
            const soldeBadge = bc.solde
                ? '<span style="background-color: #ff9800; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px;">OUI</span>'
                : '<span style="background-color: #27ae60; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px;">NON</span>';

            return `
                    <tr style="${bc.solde ? 'background-color: #fff8e1;' : ''}">
                        <td style="text-align: center;">${soldeBadge}</td>
                        <td>${bdcDisplay}</td>
                        <td>${formatDateFr(bc.date_debut)} - ${formatDateFr(bc.date_fin)}</td>
                        <td style="text-align: center; font-weight: bold;">${bc.uo_commandees}</td>
                        <td style="text-align: center; font-weight: bold;">${bc.uo_consommees}</td>
                        <td style="text-align: center; font-weight: bold; color: ${soldeColor};">${solde}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="flex: 1; background-color: #ecf0f1; border-radius: 10px; height: 20px; overflow: hidden;">
                                    <div style="width: ${Math.min(tauxConsommation, 100)}%; height: 100%; background-color: ${barColor}; transition: width 0.3s;"></div>
                                </div>
                                <span style="font-weight: bold; min-width: 45px;">${tauxConsommation}%</span>
                            </div>
                        </td>
                    </tr>
                `;
        })
        .join('');
}

// Variable pour stocker tous les déplacements (pour le filtrage)
let allReportingDeplacements = [];

async function loadAllDeplacements() {
    try {
        const response = await fetch(`${API_URL}/deplacements`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            allReportingDeplacements = data;

            // Remplir la liste des SAMU pour le filtre
            populateReportingSamuFilter(data);

            // Remplir la liste des AMOA CED pour le filtre
            populateReportingAmoaCedFilter(data);

            displayAllDeplacements(data);
        }
    } catch (error) {
        console.error('Erreur chargement tous déplacements:', error);
    }
}

function populateReportingSamuFilter(deplacements) {
    const samuSet = new Set();
    deplacements.forEach(d => {
        if (d.samu) samuSet.add(d.samu);
    });

    const filterSamu = document.getElementById('filterReportingSamu');
    if (filterSamu) {
        const samuList = Array.from(samuSet).sort();
        filterSamu.innerHTML =
            '<option value="">-- Tous les SAMU --</option>' +
            samuList.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

function populateReportingAmoaCedFilter(deplacements) {
    const filterAmoaCed = document.getElementById('filterReportingAmoaCed');
    if (!filterAmoaCed) return;

    // Utiliser la liste amoaCedUsers si disponible (contient tous les AMOA CED avec leurs noms)
    if (amoaCedUsers && amoaCedUsers.length > 0) {
        // Collecter les IDs des AMOA CED présents dans les déplacements
        const amoaCedIdsInDeplacements = new Set();
        deplacements.forEach(d => {
            if (d.amoa_ced_id) amoaCedIdsInDeplacements.add(d.amoa_ced_id);
        });

        // Filtrer amoaCedUsers pour ne garder que ceux présents dans les déplacements
        const filteredAmoaCed = amoaCedUsers.filter(u => amoaCedIdsInDeplacements.has(u.id));

        // Trier par nom
        filteredAmoaCed.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));

        filterAmoaCed.innerHTML =
            '<option value="">-- Tous les AMOA CED --</option>' +
            filteredAmoaCed
                .map(
                    u =>
                        `<option value="${u.id}">${u.nom.toUpperCase()} ${u.prenom}${u.societe ? ' (' + u.societe + ')' : ''}</option>`
                )
                .join('');
    } else {
        // Fallback: utiliser les données des déplacements
        const amoaCedMap = new Map();
        deplacements.forEach(d => {
            if (d.amoa_ced_id) {
                const name = d.amoa_ced_nom
                    ? `${d.amoa_ced_nom.toUpperCase()} ${d.amoa_ced_prenom || ''}`.trim()
                    : `AMOA CED #${d.amoa_ced_id}`;
                amoaCedMap.set(d.amoa_ced_id, name);
            }
        });

        const amoaCedList = Array.from(amoaCedMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
        filterAmoaCed.innerHTML =
            '<option value="">-- Tous les AMOA CED --</option>' +
            amoaCedList.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
    }
}

function displayAllDeplacements(deplacements) {
    const tbody = document.getElementById('reportingDeplacementsBody');
    const countDiv = document.getElementById('reportingDeplacementsCount');

    if (!deplacements || deplacements.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" style="text-align: center; color: #999;">Aucun déplacement enregistré</td></tr>';
        if (countDiv) countDiv.textContent = '0 déplacement(s)';
        return;
    }

    tbody.innerHTML = deplacements
        .map(d => {
            // Concaténer N° BDC et titulaire
            const bdcDisplay = d.bon_commande_intitule
                ? `${d.bon_commande_intitule}${d.bon_commande_titulaire ? ' - ' + d.bon_commande_titulaire : ''}`
                : '<span style="color: #e74c3c; font-weight: bold;">⚠️ À affecter</span>';

            // Créé par (user qui a créé le déplacement)
            const creePar = d.user_nom ? `${d.user_nom.toUpperCase()} ${d.user_prenom || ''}`.trim() : '-';

            // AMOA CED - utiliser amoaCedUsers pour avoir le nom complet
            let amoaCedDisplay = '-';
            if (d.amoa_ced_id) {
                const amoaCed = (amoaCedUsers || []).find(u => u.id === d.amoa_ced_id);
                if (amoaCed) {
                    amoaCedDisplay = `${amoaCed.nom.toUpperCase()} ${amoaCed.prenom}${amoaCed.societe ? ' (' + amoaCed.societe + ')' : ''}`;
                } else if (d.amoa_ced_nom) {
                    amoaCedDisplay = `${d.amoa_ced_nom.toUpperCase()} ${d.amoa_ced_prenom || ''}`.trim();
                } else {
                    amoaCedDisplay = `AMOA CED #${d.amoa_ced_id}`;
                }
            }

            return `
                <tr>
                    <td>${bdcDisplay}</td>
                    <td>${formatDateFr(d.date_debut)}</td>
                    <td>${formatDateFr(d.date_fin)}</td>
                    <td>${creePar}</td>
                    <td>${amoaCedDisplay}</td>
                    <td>${d.samu}</td>
                    <td>${d.ville}</td>
                    <td style="text-align: center; font-weight: bold;">${d.nb_uo}</td>
                </tr>
            `;
        })
        .join('');

    if (countDiv) {
        const totalUO = deplacements.reduce((sum, d) => sum + (d.nb_uo || 0), 0);
        countDiv.textContent = `${deplacements.length} déplacement(s) - Total: ${totalUO} UO`;
    }
}

function filterReportingDeplacements() {
    const bdcFilter = document.getElementById('filterReportingBdc').value;
    const dateDebutFilter = document.getElementById('filterReportingDateDebut').value;
    const dateFinFilter = document.getElementById('filterReportingDateFin').value;
    const samuFilter = document.getElementById('filterReportingSamu').value;
    const amoaCedFilter = document.getElementById('filterReportingAmoaCed').value;

    let filtered = [...allReportingDeplacements];

    // Filtre par BDC
    if (bdcFilter) {
        filtered = filtered.filter(d => d.bon_commande_id === parseInt(bdcFilter));
    }

    // Filtre par date début (déplacements commençant à partir de cette date)
    if (dateDebutFilter) {
        filtered = filtered.filter(d => d.date_debut >= dateDebutFilter);
    }

    // Filtre par date fin (déplacements se terminant avant cette date)
    if (dateFinFilter) {
        filtered = filtered.filter(d => d.date_fin <= dateFinFilter);
    }

    // Filtre par SAMU
    if (samuFilter) {
        filtered = filtered.filter(d => d.samu === samuFilter);
    }

    // Filtre par AMOA CED
    if (amoaCedFilter) {
        filtered = filtered.filter(d => d.amoa_ced_id === parseInt(amoaCedFilter));
    }

    displayAllDeplacements(filtered);
}

function resetReportingFilters() {
    document.getElementById('filterReportingBdc').value = '';
    document.getElementById('filterReportingDateDebut').value = '';
    document.getElementById('filterReportingDateFin').value = '';
    document.getElementById('filterReportingSamu').value = '';
    document.getElementById('filterReportingAmoaCed').value = '';

    displayAllDeplacements(allReportingDeplacements);
}

function exportReportingCSV() {
    // Récupérer les déplacements actuellement affichés (filtrés)
    const bdcFilter = document.getElementById('filterReportingBdc').value;
    const dateDebutFilter = document.getElementById('filterReportingDateDebut').value;
    const dateFinFilter = document.getElementById('filterReportingDateFin').value;
    const samuFilter = document.getElementById('filterReportingSamu').value;
    const amoaCedFilter = document.getElementById('filterReportingAmoaCed').value;

    let dataToExport = [...allReportingDeplacements];

    if (bdcFilter) {
        dataToExport = dataToExport.filter(d => d.bon_commande_id === parseInt(bdcFilter));
    }
    if (dateDebutFilter) {
        dataToExport = dataToExport.filter(d => d.date_debut >= dateDebutFilter);
    }
    if (dateFinFilter) {
        dataToExport = dataToExport.filter(d => d.date_fin <= dateFinFilter);
    }
    if (samuFilter) {
        dataToExport = dataToExport.filter(d => d.samu === samuFilter);
    }
    if (amoaCedFilter) {
        dataToExport = dataToExport.filter(d => d.amoa_ced_id === parseInt(amoaCedFilter));
    }

    if (dataToExport.length === 0) {
        alert('Aucune donnée à exporter');
        return;
    }

    // Créer le contenu CSV
    const headers = [
        'N° de BDC',
        'Titulaire',
        'Date début',
        'Date fin',
        'Créé par',
        'AMOA CED',
        'SAMU',
        'Ville',
        'Nb UO'
    ];
    const rows = dataToExport.map(d => {
        // Créé par
        const creePar = d.user_nom ? `${d.user_nom.toUpperCase()} ${d.user_prenom || ''}`.trim() : '';

        // AMOA CED
        let amoaCedDisplay = '';
        if (d.amoa_ced_id) {
            const amoaCed = (amoaCedUsers || []).find(u => u.id === d.amoa_ced_id);
            if (amoaCed) {
                amoaCedDisplay = `${amoaCed.nom.toUpperCase()} ${amoaCed.prenom}${amoaCed.societe ? ' (' + amoaCed.societe + ')' : ''}`;
            } else if (d.amoa_ced_nom) {
                amoaCedDisplay = `${d.amoa_ced_nom.toUpperCase()} ${d.amoa_ced_prenom || ''}`.trim();
            }
        }

        return [
            d.bon_commande_intitule || 'À affecter',
            d.bon_commande_titulaire || '',
            d.date_debut,
            d.date_fin,
            creePar,
            amoaCedDisplay,
            d.samu,
            d.ville,
            d.nb_uo
        ];
    });

    // Ajouter BOM pour UTF-8 et créer le CSV
    const BOM = '\uFEFF';
    const csvContent = BOM + headers.join(';') + '\n' + rows.map(r => r.join(';')).join('\n');

    // Créer et télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `export_deplacements_${today}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Export CSV: ${dataToExport.length} ligne(s)`);
}

// ============== FONCTIONS DE TRI POUR LES TABLES DÉPLACEMENTS ==============

let deplacementsSortColumn = null;
let deplacementsSortAsc = true;
let reportingDeplacementsSortColumn = null;
let reportingDeplacementsSortAsc = true;
let bonsCommandeSortColumn = null;
let bonsCommandeSortAsc = true;

// Fonction générique de tri de table
function sortTableGeneric(tableId, columnIndex, dataType, sortStateVar, sortAscVar) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const thead = table.querySelector('thead');
    if (!tbody || !thead) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Inverser le sens si même colonne
    if (window[sortStateVar] === columnIndex) {
        window[sortAscVar] = !window[sortAscVar];
    } else {
        window[sortStateVar] = columnIndex;
        window[sortAscVar] = true;
    }

    const asc = window[sortAscVar];

    // Mettre à jour les classes CSS des en-têtes
    thead.querySelectorAll('th.sortable').forEach((th, idx) => {
        th.classList.remove('asc', 'desc');
        if (idx === columnIndex) {
            th.classList.add(asc ? 'asc' : 'desc');
        }
    });

    // Trier les lignes
    rows.sort((a, b) => {
        const cellA = a.cells[columnIndex];
        const cellB = b.cells[columnIndex];
        if (!cellA || !cellB) return 0;

        let valA = cellA.textContent.trim();
        let valB = cellB.textContent.trim();

        // Gérer les valeurs vides
        if (valA === '-' || valA === '') valA = asc ? 'zzzzz' : '';
        if (valB === '-' || valB === '') valB = asc ? 'zzzzz' : '';

        let comparison = 0;

        if (dataType === 'date') {
            // Parser les dates au format DD/MM/YYYY
            const parseDate = str => {
                if (!str || str === 'zzzzz') return asc ? new Date(9999, 11, 31) : new Date(0);
                const parts = str.split('/');
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
                return new Date(str);
            };
            const dateA = parseDate(valA);
            const dateB = parseDate(valB);
            comparison = dateA - dateB;
        } else if (dataType === 'number') {
            const numA = parseFloat(valA.replace(/[^0-9.-]/g, '')) || 0;
            const numB = parseFloat(valB.replace(/[^0-9.-]/g, '')) || 0;
            comparison = numA - numB;
        } else {
            comparison = valA.localeCompare(valB, 'fr', { sensitivity: 'base' });
        }

        return asc ? comparison : -comparison;
    });

    // Réinsérer les lignes triées
    rows.forEach(row => tbody.appendChild(row));
}

// Tri table déplacements (onglet Planification)
function sortDeplacementsTable(columnIndex, dataType) {
    sortTableGeneric('mesDeplacementsTable', columnIndex, dataType, 'deplacementsSortColumn', 'deplacementsSortAsc');
}

// Tri table reporting déplacements
function sortReportingDeplacementsTable(columnIndex, dataType) {
    sortTableGeneric(
        'reportingDeplacementsTable',
        columnIndex,
        dataType,
        'reportingDeplacementsSortColumn',
        'reportingDeplacementsSortAsc'
    );
}

// Tri table bons de commande (admin)
function sortBonsCommandeTable(columnIndex, dataType) {
    sortTableGeneric('bonsCommandeTable', columnIndex, dataType, 'bonsCommandeSortColumn', 'bonsCommandeSortAsc');
}

// ============== FIN FONCTIONS GESTION BONS DE COMMANDE ET DÉPLACEMENTS ==============

// Fonction pour sauvegarder les logs des affectations sans envoyer d'email
async function saveAssignmentLogs() {
    const expertCount = Object.keys(pendingAssignments).length;

    if (expertCount === 0) {
        console.log('⏭️ Aucune affectation en attente');
        return;
    }

    console.log(`📝 Enregistrement des logs pour ${expertCount} expert(s)`);

    // Créer les logs pour toutes les modifications
    const allModifications = [];

    for (const [resourceId, data] of Object.entries(pendingAssignments)) {
        data.assignments.forEach(assignment => {
            allModifications.push({
                resourceId: parseInt(resourceId),
                resourceName: `${data.expertPrenom} ${data.expertNom}`,
                date: assignment.date,
                period: assignment.period === 'AM' ? 'Matin' : 'Après-midi',
                activity: assignment.activity,
                location: assignment.location || '-',
                emailSent: false
            });
        });
    }

    if (allModifications.length > 0) {
        try {
            const logResponse = await fetch(`${API_URL}/logs/save-planning-modifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ modifications: allModifications })
            });

            if (logResponse.ok) {
                console.log('✅ Logs enregistrés');
            } else {
                console.error('❌ Erreur enregistrement logs:', logResponse.status);
            }
        } catch (error) {
            console.error('❌ Erreur appel API logs:', error);
        }
    }

    // Ne PAS réinitialiser pendingAssignments ici car l'utilisateur peut vouloir envoyer les emails avant
}

// Fermer tous les modals/popups ouverts
function closeAllModals() {
    // Fermer tous les éléments avec la classe 'modal' qui sont actifs
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });

    // Fermer tous les éléments qui utilisent display:block/flex (modales sans classe .modal)
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.style.display === 'block' || modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    // Fermer toutes les modales connues par ID (y compris celles sans classe .modal)
    const modalIds = [
        'editModal',
        'localisationModal',
        'samuModal',
        'localisationConfirmModal',
        'deplacementsModal',
        'logoutConfirmModal',
        'myEventsModal',
        'astreintesModal',
        'requestModal',
        'monthlyCalendarModal',
        'diagnosticModal',
        'localisationsManagementModal',
        // Modales sans classe .modal
        'sendEmailModalContainer',
        'confirmationModal',
        'notificationsModal',
        'searchModal',
        'deplacementsLogoutModal',
        'mfaModal',
        'totpSetupModal',
        'totpVerifyModal',
        'debugLogsModal'
    ];

    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
    });

    // Fermer tous les toasts flottants
    ['batchDoneToast', 'emailProgressToast'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    console.log('🔒 Tous les modals fermés');
}

// Fonction séparée pour effectuer la déconnexion
async function performLogout() {
    // Fermer tous les panneaux de chat et effacer leur historique
    _chatCloseAll();
    // Fermer tous les modals/popups ouverts
    closeAllModals();

    // Afficher un indicateur de déconnexion en cours
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'logout-loading';
    loadingIndicator.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: white;
                font-size: 18px;
                font-weight: bold;
            `;

    const spinnerDiv = document.createElement('div');
    spinnerDiv.style.cssText = `
                border: 8px solid #f3f3f3;
                border-top: 8px solid #3498db;
                border-radius: 50%;
                width: 60px;
                height: 60px;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
            `;

    const messageDiv = document.createElement('div');
    messageDiv.textContent = 'Déconnexion en cours...';

    loadingIndicator.appendChild(spinnerDiv);
    loadingIndicator.appendChild(messageDiv);
    document.body.appendChild(loadingIndicator);

    try {
        const response = await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Erreur serveur lors de la déconnexion');
        }

        // Stopper tous les timers et pollings
        stopInactivityTimer();
        if (notificationCheckInterval) {
            clearInterval(notificationCheckInterval);
            notificationCheckInterval = null;
        }
        if (onlineUsersInterval) {
            clearInterval(onlineUsersInterval);
            onlineUsersInterval = null;
        }

        currentUser = null;
        pendingAssignments = {};
        availableProfiles = [];
        loginStep = 'credentials';

        console.log('✅ Déconnexion réussie');

        // Rediriger vers la page de login (toutes les applications et bandeaux flottants sont fermés)
        resetUiForLogin();

        // Réinitialiser complètement le formulaire de login
        _credFilled = false;
        const unField = document.getElementById('loginUsername');
        unField.value = '';
        // Déclencher la popup d'identifiants une fois la mire affichée

        document.getElementById('loginPassword').value = '';
        document.getElementById('loginProfile').value = '';
        document.getElementById('profileSelectGroup').style.display = 'none';
        setLoginButtonLabel('Continuer');
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('loginError').textContent = '';

        // Masquer le timer d'inactivité sur la mire de login
        const timerDisplay = document.getElementById('inactivityTimerDisplay');
        if (timerDisplay) timerDisplay.style.display = 'none';

        // Rafraîchir le numéro de version affiché sur la mire de login
        loadVersion();
    } catch (error) {
        console.error('Erreur logout:', error);
        alert('Erreur lors de la déconnexion. Veuillez réessayer.');
    } finally {
        // Retirer l'indicateur de chargement
        const indicator = document.getElementById('logout-loading');
        if (indicator) {
            indicator.remove();
        }
    }
}

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
