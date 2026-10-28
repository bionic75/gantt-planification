// Application principale : tabs
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== DRAG & DROP DES ONGLETS ==========
let _tabDragSrc = null;

function initTabDragDrop() {
    const container = document.getElementById('mainTabsContainer');
    if (!container) return;
    let _tabDragOver = null;

    // Dragstart / dragend sur chaque bouton
    container.querySelectorAll('button.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('dragstart', e => {
            _tabDragSrc = btn;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', btn.dataset.tab);
            // setTimeout pour capturer le ghost avant d'appliquer l'opacité
            setTimeout(() => btn.classList.add('tab-dragging'), 0);
        });
        btn.addEventListener('dragend', () => {
            btn.classList.remove('tab-dragging');
            container.querySelectorAll('.tab-drag-over').forEach(el => el.classList.remove('tab-drag-over'));
            _tabDragSrc = null;
            _tabDragOver = null;
        });
    });

    // dragover : mémoriser la cible courante (e.target dans drop peut pointer le conteneur)
    container.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('button.tab-btn[data-tab]');
        container.querySelectorAll('.tab-drag-over').forEach(el => el.classList.remove('tab-drag-over'));
        if (target && target !== _tabDragSrc && target.style.display !== 'none') {
            target.classList.add('tab-drag-over');
            _tabDragOver = target;
        } else {
            _tabDragOver = null;
        }
    });

    // drop : utiliser _tabDragOver au lieu de e.target
    container.addEventListener('drop', e => {
        e.preventDefault();
        const target = _tabDragOver;
        if (!_tabDragSrc || !target || _tabDragSrc === target) return;
        const buttons = [...container.querySelectorAll('button.tab-btn[data-tab]')];
        const srcIdx = buttons.indexOf(_tabDragSrc);
        const tgtIdx = buttons.indexOf(target);
        if (srcIdx < tgtIdx) {
            container.insertBefore(_tabDragSrc, target.nextElementSibling);
        } else {
            container.insertBefore(_tabDragSrc, target);
        }
        saveTabOrder();
    });
}

function saveTabOrder() {
    const container = document.getElementById('mainTabsContainer');
    if (!container || !currentUser) return;
    const order = [...container.querySelectorAll('button.tab-btn[data-tab]')].map(b => b.dataset.tab);
    localStorage.setItem(`tabOrder_${currentUser.id}`, JSON.stringify(order));
}

function restoreTabOrder() {
    const container = document.getElementById('mainTabsContainer');
    if (!container || !currentUser) return;
    const saved = localStorage.getItem(`tabOrder_${currentUser.id}`);
    if (!saved) return;
    let order;
    try {
        order = JSON.parse(saved);
    } catch {
        return;
    }
    // Récupérer le bouton help (non-draggable, reste en dernière position)
    const helpBtn = document.getElementById('helpBtn');
    order.forEach(tabName => {
        const btn = container.querySelector(`button.tab-btn[data-tab="${tabName}"]`);
        if (btn) container.insertBefore(btn, helpBtn || null);
    });
}
// ========== /DRAG & DROP DES ONGLETS ==========

function switchTab(tabName, event) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    // Activer le bouton correspondant
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Appel programmatique : trouver et activer le bon bouton
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${tabName}'`)) {
                btn.classList.add('active');
            }
        });
    }

    // Arrêter le rafraîchissement automatique si on quitte l'onglet admin
    if (activeSessionsRefreshInterval) {
        clearInterval(activeSessionsRefreshInterval);
        activeSessionsRefreshInterval = null;
    }

    if (tabName === 'admin') {
        loadUsers();
        loadEmailConfig();
        loadAppVersion(); // NOUVEAU

        // Rafraîchir les statuts de connexion toutes les 30 secondes
        activeSessionsRefreshInterval = setInterval(() => {
            displayUsers();
        }, 30000);
    }

    if (tabName === 'planning') {
        // Appliquer le filtre automatique pour les experts
        if (currentUser && currentUser.activeProfile === 'expert' && currentUser.resourceId) {
            updateResourceFilter();
            updateGantt();
        }
        highlightToday(); // NOUVEAU
    }

    if (tabName === 'astreintesGestion') {
        astreintesTabOpen();
    }

    if (tabName === 'cra') {
        loadCraList();
        loadCraPendingBadge();
    }

    if (tabName === 'evenements') {
        openMyEventsModal();
    }
}

async function loadEmailConfig() {
    try {
        const response = await fetch(`${API_URL}/email-config`, { credentials: 'include' });
        if (!response.ok) {
            console.warn('Config email non accessible (nécessite admin)');
            return;
        }
        const config = await response.json();
        document.getElementById('smtpHost').value = config.host || 'smtp.office365.com';
        document.getElementById('smtpPort').value = config.port || 587;
        document.getElementById('smtpUser').value = config.user || '';
        // Le mot de passe n'est jamais renvoyé par le serveur : champ vide = mot de passe enregistré conservé
        const passwordField = document.getElementById('smtpPassword');
        passwordField.value = '';
        passwordField.dataset.passwordSet = config.passwordSet ? '1' : '';
        passwordField.placeholder = config.passwordSet
            ? 'Mot de passe enregistré (laisser vide pour le conserver)'
            : 'Mot de passe email';
    } catch (error) {
        console.error('Erreur chargement config email:', error);
    }
}

document.addEventListener('click', function (event) {
    const editModal = document.getElementById('editModal');
    const locModal = document.getElementById('localisationModal');
    const resetModal = document.getElementById('resetPasswordModal');
    const editUserModal = document.getElementById('editUserModal');
    const forgotModal = document.getElementById('forgotPasswordModal');
    if (event.target === editModal) closeEditModal();
    if (event.target === locModal) closeLocalisationModal();
    if (event.target === resetModal) closeResetPasswordModal();
    if (event.target === editUserModal) closeEditUserModal();
    if (event.target === forgotModal) closeForgotPasswordModal();
});

// Fonction pour mettre automatiquement les noms en majuscules
function autoUppercaseNom(event) {
    event.target.value = event.target.value.toUpperCase();
}

// Appliquer la mise en majuscule automatique à tous les champs "Nom"
document.addEventListener('DOMContentLoaded', function () {
    const nomFields = [
        'nom', // Ressources
        'editNom', // Édition ressource
        'adminUserNom', // Création utilisateur
        'editUserNom' // Édition utilisateur
    ];

    nomFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            // Déclencher la mise en majuscule pendant la saisie
            field.addEventListener('input', autoUppercaseNom);
            // Également lors de la perte de focus (au cas où)
            field.addEventListener('blur', autoUppercaseNom);
        }
    });
});
