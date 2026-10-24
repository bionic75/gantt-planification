// Application principale : assignment-request
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DEMANDE D'AFFECTATION ==========

let currentUserInfo = null;

function openRequestModal() {
    // Remplir le champ expéditeur (affiche le nom mais on enverra l'email)
    if (currentUserInfo) {
        console.log('👤 Infos utilisateur:', currentUserInfo);

        if (!currentUserInfo.email) {
            alert(
                "Erreur: Votre compte utilisateur n'a pas d'adresse email configurée. Veuillez contacter l'administrateur pour ajouter votre email."
            );
            return;
        }

        document.getElementById('requestFrom').value = `${currentUserInfo.prenom} ${currentUserInfo.nom}`;
        document.getElementById('requestSubject').value =
            `De la part de ${currentUserInfo.prenom} ${currentUserInfo.nom}: demande d'affectation`;

        // Message préformaté
        document.getElementById('requestMessage').value = `Bonjour,

j'aurais besoin que tu sois disponible pour une mission.

Pourrais-tu te rendre disponible pour les dates demandées ?

En te remerciant par avance,
${currentUserInfo.prenom} ${currentUserInfo.nom}`;
    } else {
        alert('Erreur: Informations utilisateur non disponibles');
        return;
    }

    // Charger la liste des experts
    loadExpertsForRequest();

    // Réinitialiser les destinataires (tag-input)
    requestSelectedExperts = [];
    renderRequestExpertTags();
    const expertsInput = document.getElementById('requestExpertsInput');
    if (expertsInput) expertsInput.value = '';

    // Dates par défaut : début = aujourd'hui, fin = même date que le début
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('requestStartDate').value = todayStr;
    document.getElementById('requestEndDate').value = todayStr;
    document.getElementById('requestStartPeriod').value = 'Matin';
    document.getElementById('requestEndPeriod').value = 'Après-midi';
    document.getElementById('dateError').style.display = 'none';

    document.getElementById('requestModal').style.display = 'block';
}

// Aligne automatiquement la date de fin sur la date de début choisie
function prefillRequestEndDate() {
    const startVal = document.getElementById('requestStartDate').value;
    if (startVal) {
        document.getElementById('requestEndDate').value = startVal;
    }
}

function closeRequestModal() {
    document.getElementById('requestModal').style.display = 'none';
}

// === DESTINATAIRES "Faire une demande" — tag-input autocomplete ===
let requestAllExperts = []; // experts actifs ET avec email
let requestSelectedExperts = []; // [{id, prenom, nom, trigramme, email}]

function loadExpertsForRequest() {
    fetch('/api/resources')
        .then(response => response.json())
        .then(data => {
            // Ne proposer que les experts actifs ET disposant d'une adresse email
            requestAllExperts = data.filter(r => r.actif === 1 && r.email && r.email.trim());
        })
        .catch(error => {
            console.error('Erreur chargement experts:', error);
            alert('Erreur lors du chargement des experts');
        });
}

function renderRequestExpertTags() {
    const box = document.getElementById('requestExpertsTags');
    const input = document.getElementById('requestExpertsInput');
    if (!box || !input) return;
    box.querySelectorAll('.samu-tag').forEach(t => t.remove());
    requestSelectedExperts.forEach(expert => {
        const tag = document.createElement('span');
        tag.className = 'samu-tag principal';
        tag.innerHTML = `<span>${expert.prenom} ${expert.nom} (${expert.trigramme})</span><span class="samu-tag-remove" onclick="removeRequestExpert(${expert.id})" title="Retirer">&times;</span>`;
        box.insertBefore(tag, input);
    });
}

function addRequestExpert(id) {
    if (requestSelectedExperts.some(e => e.id === id)) return;
    const expert = requestAllExperts.find(e => e.id === id);
    if (!expert) return;
    requestSelectedExperts.push(expert);
    renderRequestExpertTags();
    const input = document.getElementById('requestExpertsInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    const dropdown = document.getElementById('requestExpertsDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function removeRequestExpert(id) {
    requestSelectedExperts = requestSelectedExperts.filter(e => e.id !== id);
    renderRequestExpertTags();
}

function filterRequestExperts(query) {
    const dropdown = document.getElementById('requestExpertsDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const selectedIds = new Set(requestSelectedExperts.map(e => e.id));
    const options = requestAllExperts
        .filter(e => !selectedIds.has(e.id))
        .filter(e => !q || `${e.prenom} ${e.nom} ${e.trigramme}`.toLowerCase().includes(q))
        .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`))
        .slice(0, 10);

    if (options.length === 0) {
        dropdown.innerHTML = '<div class="samu-tag-dropdown-empty">Aucun expert disponible</div>';
        dropdown.style.display = 'block';
        return;
    }
    dropdown.innerHTML = options
        .map(
            e =>
                `<div class="samu-tag-dropdown-item" onclick="addRequestExpert(${e.id})">${e.prenom} ${e.nom} (${e.trigramme}) — <span style="color:#27ae60;">${e.email}</span></div>`
        )
        .join('');
    dropdown.style.display = 'block';
}

function handleRequestExpertsKeydown(e) {
    if (e.key === 'Backspace' && e.target.value === '' && requestSelectedExperts.length > 0) {
        requestSelectedExperts.pop();
        renderRequestExpertTags();
    }
    if (e.key === 'Escape') {
        const dropdown = document.getElementById('requestExpertsDropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
}

// Fermer le dropdown destinataires si clic en dehors
document.addEventListener('click', function (e) {
    const box = document.getElementById('requestExpertsTags');
    const dropdown = document.getElementById('requestExpertsDropdown');
    if (dropdown && box && !box.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function validateDates() {
    const startDate = document.getElementById('requestStartDate').value;
    const endDate = document.getElementById('requestEndDate').value;
    const dateError = document.getElementById('dateError');

    if (startDate && endDate) {
        if (new Date(endDate) < new Date(startDate)) {
            dateError.textContent = 'La date de fin doit être postérieure ou égale à la date de début';
            dateError.style.display = 'block';
            return false;
        } else {
            dateError.style.display = 'none';
            return true;
        }
    }
    return true;
}

// Variables pour le mode debug (conservées pour compatibilité)
let debugStartTime = null;
let debugTimerInterval = null;

function submitRequestForm(event) {
    event.preventDefault();

    if (!validateDates()) return;

    if (requestSelectedExperts.length === 0) {
        alert('Veuillez sélectionner au moins un expert.');
        return;
    }

    const selectedExperts = requestSelectedExperts.map(e => e.id);

    const requestData = {
        fromName: document.getElementById('requestFrom').value,
        fromEmail: currentUserInfo.email,
        expertIds: selectedExperts,
        subject: document.getElementById('requestSubject').value,
        startDate: document.getElementById('requestStartDate').value,
        startPeriod: document.getElementById('requestStartPeriod').value,
        endDate: document.getElementById('requestEndDate').value,
        endPeriod: document.getElementById('requestEndPeriod').value,
        message: document.getElementById('requestMessage').value
    };

    fetch('/api/request-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeRequestModal();
                showConfirmationModal(data.emails);
            } else {
                alert("Erreur lors de l'envoi de la demande:\n\n" + (data.error || 'Erreur inconnue'));
            }
        })
        .catch(error => {
            alert("Erreur lors de l'envoi de la demande: " + error.message);
        });
}

function showConfirmationModal(emails) {
    const emailList = document.getElementById('confirmationEmailList');
    emailList.innerHTML = '';

    emails.forEach(email => {
        const li = document.createElement('li');
        li.textContent = email;
        li.style.marginBottom = '5px';
        emailList.appendChild(li);
    });

    document.getElementById('confirmationModal').style.display = 'block';
}

function closeConfirmationModal() {
    document.getElementById('confirmationModal').style.display = 'none';
}
