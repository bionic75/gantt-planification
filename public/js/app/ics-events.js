// Application principale : ics-events
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES FICHIERS ICS ==========

// Variables globales pour les dates particulières
let specialDatesFiles = [];
let pendingSpecialDatesFile = null;

// Charger les fichiers de congés scolaires avec historique
async function loadSchoolHolidaysFiles() {
    try {
        const response = await fetch(`${API_URL}/ics-files/school-holidays`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            renderSchoolHolidaysFilesList(data.files || []);
        }
    } catch (error) {
        console.error('Erreur chargement fichiers congés scolaires:', error);
    }
}

// Afficher la liste des fichiers de congés scolaires
function renderSchoolHolidaysFilesList(files) {
    const container = document.getElementById('schoolHolidaysFilesList');
    if (!container) return;

    if (files.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 12px; font-style: italic;">Aucun fichier importé</p>';
        return;
    }

    let html = '<div style="border: 1px solid #a5d6a7; border-radius: 4px; overflow: hidden;">';
    html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
    html += '<thead><tr style="background: #c8e6c9;">';
    html += '<th style="padding: 8px; text-align: left; border: none;">Fichier</th>';
    html += '<th style="padding: 8px; text-align: center; border: none;">Importé le</th>';
    html += '<th style="padding: 8px; text-align: center; border: none;">Périodes</th>';
    html += '<th style="padding: 8px; text-align: center; border: none;">Actions</th>';
    html += '</tr></thead><tbody>';

    files.forEach(file => {
        const importDate = new Date(file.imported_at).toLocaleDateString('fr-FR');
        html += `<tr style="border-top: 1px solid #a5d6a7;">`;
        html += `<td style="padding: 8px;">${file.filename}</td>`;
        html += `<td style="padding: 8px; text-align: center;">${importDate}</td>`;
        html += `<td style="padding: 8px; text-align: center;">${file.periods_count || 0}</td>`;
        html += `<td style="padding: 8px; text-align: center;">`;
        html += `<button onclick="deleteSchoolHolidaysFile(${file.id})" style="background: #e53935; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">🗑️</button>`;
        html += `</td></tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Uploader un fichier de congés scolaires avec historique
async function uploadSchoolHolidaysWithHistory() {
    const fileInput = document.getElementById('schoolHolidaysFile');
    const statusDiv = document.getElementById('schoolHolidaysStatus');

    if (!fileInput.files || fileInput.files.length === 0) {
        statusDiv.innerHTML = '<span style="color: #e53935;">❌ Veuillez sélectionner un fichier .ics</span>';
        return;
    }

    const file = fileInput.files[0];
    statusDiv.innerHTML = '<span style="color: #1565c0;">⏳ Importation en cours...</span>';

    try {
        const content = await file.text();
        const events = parseICSFile(content);

        // Parser les zones
        const zoneAEvents = events.filter(e => e.summary && e.summary.toLowerCase().includes('zone a'));
        const zoneBEvents = events.filter(e => e.summary && e.summary.toLowerCase().includes('zone b'));
        const zoneCEvents = events.filter(e => e.summary && e.summary.toLowerCase().includes('zone c'));

        const periodsCount = zoneAEvents.length + zoneBEvents.length + zoneCEvents.length;

        if (periodsCount === 0) {
            statusDiv.innerHTML =
                '<span style="color: #e53935;">❌ Aucune période de vacances trouvée dans le fichier</span>';
            return;
        }

        // Envoyer au serveur
        const response = await fetch(`${API_URL}/ics-files/school-holidays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                filename: file.name,
                content: content,
                zoneA: zoneAEvents,
                zoneB: zoneBEvents,
                zoneC: zoneCEvents
            })
        });

        if (response.ok) {
            statusDiv.innerHTML = `<span style="color: #4CAF50;">✅ ${periodsCount} période(s) importée(s) depuis ${file.name}</span>`;
            fileInput.value = '';
            loadSchoolHolidaysFiles();
            await reloadAllSchoolHolidays();
            updateGantt();
        } else {
            const err = await response.json();
            statusDiv.innerHTML = `<span style="color: #e53935;">❌ Erreur: ${err.error}</span>`;
        }
    } catch (error) {
        console.error('Erreur upload:', error);
        statusDiv.innerHTML = `<span style="color: #e53935;">❌ Erreur: ${error.message}</span>`;
    }
}

// Supprimer un fichier de congés scolaires
async function deleteSchoolHolidaysFile(fileId) {
    if (!confirm('Voulez-vous vraiment supprimer ce fichier de congés scolaires ?')) return;

    try {
        const response = await fetch(`${API_URL}/ics-files/school-holidays/${fileId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            loadSchoolHolidaysFiles();
            await reloadAllSchoolHolidays();
            updateGantt();
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erreur: ' + error.message);
    }
}

// Recharger tous les congés scolaires depuis tous les fichiers
async function reloadAllSchoolHolidays() {
    try {
        const response = await fetch(`${API_URL}/ics-files/school-holidays/all-periods`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            schoolHolidays = data.periods || { zoneA: [], zoneB: [], zoneC: [] };
        }
    } catch (error) {
        console.error('Erreur rechargement congés:', error);
    }
}

// ========== DATES PARTICULIERES ==========

// Charger les fichiers de dates particulières
async function loadSpecialDatesFiles() {
    try {
        const response = await fetch(`${API_URL}/ics-files/special-dates`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            specialDatesFiles = data.files || [];
            renderSpecialDatesFilesList(specialDatesFiles);
        }
    } catch (error) {
        console.error('Erreur chargement fichiers dates particulières:', error);
    }
}

// Afficher la liste des fichiers de dates particulières
function renderSpecialDatesFilesList(files) {
    const container = document.getElementById('specialDatesFilesList');
    if (!container) return;

    if (files.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 12px; font-style: italic;">Aucun fichier importé</p>';
        return;
    }

    let html = '<div style="border: 1px solid #ffcc80; border-radius: 4px; overflow: hidden;">';
    html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
    html += '<thead><tr style="background: #ffe0b2;">';
    html += '<th style="padding: 8px; text-align: left; border: none;">Fichier</th>';
    html += '<th style="padding: 8px; text-align: center; border: none;">Apparence</th>';
    html += '<th style="padding: 8px; text-align: center; border: none;">Dates</th>';
    html += '<th style="padding: 8px; text-align: center; border: none;">Actions</th>';
    html += '</tr></thead><tbody>';

    files.forEach(file => {
        const config = file.config || {};
        html += `<tr style="border-top: 1px solid #ffcc80;">`;
        html += `<td style="padding: 8px;">${file.filename}</td>`;
        html += `<td style="padding: 8px; text-align: center;">`;
        html += `<span style="display: inline-block; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; background-color: ${config.bgColor || '#ffeb3b'}; color: ${config.textColor || '#000'}; border: 2px solid ${config.borderColor || '#fbc02d'};">${config.label || 'JF'}</span>`;
        html += `</td>`;
        html += `<td style="padding: 8px; text-align: center;">${file.dates_count || 0}</td>`;
        html += `<td style="padding: 8px; text-align: center;">`;
        html += `<button onclick="openEditSpecialDatesModal(${file.id})" style="background: #1e88e5; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; margin-right: 5px;">✏️</button>`;
        html += `<button onclick="deleteSpecialDatesFile(${file.id})" style="background: #e53935; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">🗑️</button>`;
        html += `</td></tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Ouvrir la modal de configuration pour un nouveau fichier
function openSpecialDatesConfigModal() {
    const fileInput = document.getElementById('specialDatesFile');
    const statusDiv = document.getElementById('specialDatesStatus');

    if (!fileInput.files || fileInput.files.length === 0) {
        statusDiv.innerHTML = '<span style="color: #e53935;">❌ Veuillez sélectionner un fichier .ics</span>';
        return;
    }

    pendingSpecialDatesFile = fileInput.files[0];
    document.getElementById('specialDatesFileName').textContent = pendingSpecialDatesFile.name;
    document.getElementById('specialDatesLabel').value = 'JF';
    document.getElementById('specialDatesBgColor').value = '#ffeb3b';
    document.getElementById('specialDatesTextColor').value = '#000000';
    document.getElementById('specialDatesBorderColor').value = '#fbc02d';
    updateSpecialDatesPreview();

    document.getElementById('specialDatesConfigModal').style.display = 'block';
}

// Fermer la modal de configuration
function closeSpecialDatesConfigModal() {
    document.getElementById('specialDatesConfigModal').style.display = 'none';
    pendingSpecialDatesFile = null;
}

// Appliquer un préset de couleurs
function applySpecialDatesPreset(bgColor, textColor, borderColor) {
    document.getElementById('specialDatesBgColor').value = bgColor;
    document.getElementById('specialDatesTextColor').value = textColor;
    document.getElementById('specialDatesBorderColor').value = borderColor;
    updateSpecialDatesPreview();
}

// Mettre à jour la prévisualisation
function updateSpecialDatesPreview() {
    const label = document.getElementById('specialDatesLabel').value || 'JF';
    const bgColor = document.getElementById('specialDatesBgColor').value;
    const textColor = document.getElementById('specialDatesTextColor').value;
    const borderColor = document.getElementById('specialDatesBorderColor').value;

    const preview = document.getElementById('specialDatesPreview');
    preview.textContent = label;
    preview.style.backgroundColor = bgColor;
    preview.style.color = textColor;
    preview.style.borderColor = borderColor;
}

// Confirmer l'upload du fichier de dates particulières
async function confirmSpecialDatesUpload() {
    if (!pendingSpecialDatesFile) return;

    const label = document.getElementById('specialDatesLabel').value || 'JF';
    const bgColor = document.getElementById('specialDatesBgColor').value;
    const textColor = document.getElementById('specialDatesTextColor').value;
    const borderColor = document.getElementById('specialDatesBorderColor').value;

    try {
        const content = await pendingSpecialDatesFile.text();
        const events = parseICSFile(content);

        if (events.length === 0) {
            alert('Aucun événement trouvé dans le fichier');
            return;
        }

        const response = await fetch(`${API_URL}/ics-files/special-dates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                filename: pendingSpecialDatesFile.name,
                content: content,
                events: events,
                config: { label, bgColor, textColor, borderColor }
            })
        });

        if (response.ok) {
            document.getElementById('specialDatesStatus').innerHTML =
                `<span style="color: #4CAF50;">✅ ${events.length} date(s) importée(s)</span>`;
            document.getElementById('specialDatesFile').value = '';
            closeSpecialDatesConfigModal();
            loadSpecialDatesFiles();
            await loadSpecialDates(); // Recharger pour le Gantt
            updateGantt();
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur upload:', error);
        alert('Erreur: ' + error.message);
    }
}

// Ouvrir la modal d'édition d'un fichier existant
function openEditSpecialDatesModal(fileId) {
    const file = specialDatesFiles.find(f => f.id === fileId);
    if (!file) return;

    const config = file.config || {};
    document.getElementById('editSpecialDatesId').value = fileId;
    document.getElementById('editSpecialDatesLabel').value = config.label || 'JF';
    document.getElementById('editSpecialDatesBgColor').value = config.bgColor || '#ffeb3b';
    document.getElementById('editSpecialDatesTextColor').value = config.textColor || '#000000';
    document.getElementById('editSpecialDatesBorderColor').value = config.borderColor || '#fbc02d';
    updateEditSpecialDatesPreview();

    document.getElementById('editSpecialDatesModal').style.display = 'block';
}

// Fermer la modal d'édition
function closeEditSpecialDatesModal() {
    document.getElementById('editSpecialDatesModal').style.display = 'none';
}

// Mettre à jour la prévisualisation d'édition
function updateEditSpecialDatesPreview() {
    const label = document.getElementById('editSpecialDatesLabel').value || 'JF';
    const bgColor = document.getElementById('editSpecialDatesBgColor').value;
    const textColor = document.getElementById('editSpecialDatesTextColor').value;
    const borderColor = document.getElementById('editSpecialDatesBorderColor').value;

    const preview = document.getElementById('editSpecialDatesPreview');
    preview.textContent = label;
    preview.style.backgroundColor = bgColor;
    preview.style.color = textColor;
    preview.style.border = `2px solid ${borderColor}`;
}

// Sauvegarder les modifications d'un fichier
async function saveEditSpecialDates() {
    const fileId = document.getElementById('editSpecialDatesId').value;
    const label = document.getElementById('editSpecialDatesLabel').value || 'JF';
    const bgColor = document.getElementById('editSpecialDatesBgColor').value;
    const textColor = document.getElementById('editSpecialDatesTextColor').value;
    const borderColor = document.getElementById('editSpecialDatesBorderColor').value;

    try {
        const response = await fetch(`${API_URL}/ics-files/special-dates/${fileId}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ config: { label, bgColor, textColor, borderColor } })
        });

        if (response.ok) {
            closeEditSpecialDatesModal();
            loadSpecialDatesFiles();
            await loadSpecialDates(); // Recharger pour le Gantt
            updateGantt();
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        alert('Erreur: ' + error.message);
    }
}

// Supprimer un fichier de dates particulières
async function deleteSpecialDatesFile(fileId) {
    if (!confirm('Voulez-vous vraiment supprimer ce fichier de dates particulières ?')) return;

    try {
        const response = await fetch(`${API_URL}/ics-files/special-dates/${fileId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            loadSpecialDatesFiles();
            await loadSpecialDates(); // Recharger pour le Gantt
            updateGantt();
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erreur: ' + error.message);
    }
}

// Ajouter les event listeners pour la prévisualisation en temps réel
document.addEventListener('DOMContentLoaded', function () {
    // Prévisualisation nouvelle config
    ['specialDatesLabel', 'specialDatesBgColor', 'specialDatesTextColor', 'specialDatesBorderColor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateSpecialDatesPreview);
    });
    // Prévisualisation édition
    [
        'editSpecialDatesLabel',
        'editSpecialDatesBgColor',
        'editSpecialDatesTextColor',
        'editSpecialDatesBorderColor'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateEditSpecialDatesPreview);
    });
    // Prévisualisation événements personnalisés
    ['customEventLabel', 'customEventBgColor', 'customEventTextColor', 'customEventBorderColor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCustomEventPreview);
    });
});

// ========== ÉVÉNEMENTS PERSONNALISÉS ==========

let customEvents = [];
let customEventsSortYear = 'desc'; // 'asc' ou 'desc'

// Charger les événements personnalisés
async function loadCustomEvents() {
    try {
        const response = await fetch(`${API_URL}/custom-events`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            customEvents = data.events || [];
            renderCustomEventsTable();
        }
    } catch (error) {
        console.error('Erreur chargement événements personnalisés:', error);
    }
}

// Mettre à jour la prévisualisation
function updateCustomEventPreview() {
    const label = document.getElementById('customEventLabel').value || 'LIBELLÉ';
    const bgColor = document.getElementById('customEventBgColor').value;
    const textColor = document.getElementById('customEventTextColor').value;
    const borderColor = document.getElementById('customEventBorderColor').value;

    const preview = document.getElementById('customEventPreview');
    if (preview) {
        preview.textContent = label;
        preview.style.backgroundColor = bgColor;
        preview.style.color = textColor;
        preview.style.borderColor = borderColor;
    }
}

// Templates prédéfinis pour les événements admin
const eventTemplates = {
    formation: { bg: '#ffea00', text: '#0008ff', border: '#000000', label: 'FORMATION' },
    mes: { bg: '#ffea00', text: '#d20906', border: '#000000', label: 'MISE EN SERVICE' },
    apd: { bg: '#ffea00', text: '#c2059a', border: '#000000', label: 'ACCOMP. POST DÉM.' },
    visite: { bg: '#0011ff', text: '#ffffff', border: '#000000', label: 'VISITE TERRAIN' },
    congres: { bg: '#dff0d8', text: '#427645', border: '#000000', label: 'CONGRÈS' },
    visiteMetier: { bg: '#7b1fa2', text: '#ffffff', border: '#4a0072', label: 'VISITE METIER' },
    vftSite: { bg: '#2e7d32', text: '#ffffff', border: '#1b5e20', label: 'VFT SUR SITE' },
    verifPrereq: { bg: '#546e7a', text: '#ffffff', border: '#263238', label: 'VERIF PREREQUIS' },
    visiteOb: { bg: '#e65100', text: '#ffffff', border: '#bf360c', label: 'VISITE OB' },
    visitePostMes: { bg: '#0277bd', text: '#ffffff', border: '#01579b', label: 'VISITE POST MES' },
    reunionLancement: { bg: '#1565c0', text: '#ffffff', border: '#0d47a1', label: 'RÉUNION DE LANCEMENT STRATÉGIQUE' },
    libre: { bg: '#ffeb3b', text: '#000000', border: '#000000', label: '' }
};

const EVENT_TPL_ICONS = {
    formation: 'graduation',
    mes: 'power',
    apd: 'lifebuoy',
    visite: 'pin',
    congres: 'presentation',
    visiteMetier: 'briefcase',
    vftSite: 'clipboardCheck',
    verifPrereq: 'listChecks',
    visiteOb: 'building',
    visitePostMes: 'eye',
    reunionLancement: 'rocket',
    libre: 'palette'
};
function eventIconHtml(label, size, style) {
    const norm = t =>
        (t || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    const l = norm(label);
    const key = Object.keys(eventTemplates)
        .filter(k => eventTemplates[k].label)
        .sort((a, b) => eventTemplates[b].label.length - eventTemplates[a].label.length)
        .find(k => {
            const t = norm(eventTemplates[k].label);
            return l === t || l.startsWith(t + ' ');
        });
    return key ? uiIcon(EVENT_TPL_ICONS[key], size || 13, 'margin-right:5px;' + (style || '')) : '';
}

// Appliquer un template prédéfini (Administration)
function applyCustomEventTemplate(templateName) {
    const template = eventTemplates[templateName];
    if (!template) return;

    document.getElementById('customEventBgColor').value = template.bg;
    document.getElementById('customEventTextColor').value = template.text;
    document.getElementById('customEventBorderColor').value = template.border;

    if (template.label) {
        document.getElementById('customEventLabel').value = template.label;
        autoCheckGristByLabel(template.label, 'customEventGrist');
    }

    updateCustomEventPreview();
}

// Pré-remplir la date de fin avec la date de début
function prefillCustomEventEndDate() {
    const startDate = document.getElementById('customEventStartDate').value;
    const endDateInput = document.getElementById('customEventEndDate');
    if (startDate && (!endDateInput.value || endDateInput.value < startDate)) {
        endDateInput.value = startDate;
    }
}

// Afficher/masquer le sélecteur de demi-journée (formulaire admin)
function updateCustomEventPeriodVisibility() {
    const startDate = document.getElementById('customEventStartDate').value;
    const endDate = document.getElementById('customEventEndDate').value;
    const section = document.getElementById('customEventPeriodSection');
    const isSameDay = startDate && (!endDate || endDate === startDate);
    section.style.display = isSameDay ? 'block' : 'none';
    if (!isSameDay) document.getElementById('customEventPeriodFull').checked = true;
}

// ========== GESTION PARTICIPANTS ADMIN (copie exacte de la pop-up Planification) ==========
let adminEventSelectedParticipants = []; // [{id, nom, prenom, email, external?}]

function getAdminEventParticipantInitials(prenom, nom) {
    return ((prenom || '')[0] || '').toUpperCase() + ((nom || '')[0] || '').toUpperCase();
}

function getAdminEventParticipantColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const colors = [
        '#e91e63',
        '#9c27b0',
        '#673ab7',
        '#3f51b5',
        '#2196f3',
        '#009688',
        '#4caf50',
        '#ff9800',
        '#795548',
        '#607d8b'
    ];
    return colors[Math.abs(hash) % colors.length];
}

function renderAdminEventParticipantTags() {
    const container = document.getElementById('adminEventParticipantsContainer');
    const input = document.getElementById('adminEventParticipantInput');
    if (!container || !input) return;
    container.querySelectorAll('.participant-tag').forEach(t => t.remove());
    adminEventSelectedParticipants.forEach((p, idx) => {
        const tag = document.createElement('span');
        tag.className = 'participant-tag';
        const displayName = `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || p.email || '?';
        const initials = p.external ? '✉' : getAdminEventParticipantInitials(p.prenom, p.nom);
        const color = p.external ? '#78909c' : getAdminEventParticipantColor(displayName);
        const bg = p.external ? '#eceff1' : '#f0f0f0';
        const border = p.external ? '#b0bec5' : '#ddd';
        const title = p.external ? (p.email ? `Invité externe — ${p.email}` : 'Invité externe') : '';
        tag.innerHTML = `<span title="${title}" style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:1px solid ${border};border-radius:15px;padding:2px 8px 2px 2px;font-size:11px;white-space:nowrap;">
                    <span style="width:20px;height:20px;border-radius:50%;background:${color};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:${p.external ? '10px' : '9px'};font-weight:bold;">${initials}</span>
                    <span style="color:#333;">${displayName}</span>
                    <span onclick="removeAdminEventParticipant(${idx})" style="cursor:pointer;color:#999;font-size:14px;line-height:1;margin-left:2px;" title="Retirer">&times;</span>
                </span>`;
        container.insertBefore(tag, input);
    });
}

function removeAdminEventParticipant(idx) {
    adminEventSelectedParticipants.splice(idx, 1);
    renderAdminEventParticipantTags();
}

function addAdminEventParticipant(user) {
    if (!user.external && adminEventSelectedParticipants.some(p => !p.external && p.id === user.id)) return;
    adminEventSelectedParticipants.push(user);
    renderAdminEventParticipantTags();
    const input = document.getElementById('adminEventParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('adminEventParticipantDropdown').style.display = 'none';
}

function addAdminEventExternalParticipant(rawInput) {
    const q = (rawInput || '').trim();
    if (!q) return;
    // Détecter si c'est un email
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
    const entry = isEmail
        ? { external: true, nom: '', prenom: '', email: q }
        : { external: true, nom: q, prenom: '', email: '' };
    adminEventSelectedParticipants.push(entry);
    renderAdminEventParticipantTags();
    const input = document.getElementById('adminEventParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('adminEventParticipantDropdown').style.display = 'none';
}

function filterAdminEventParticipants(query) {
    const dropdown = document.getElementById('adminEventParticipantDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const selectedIds = new Set(adminEventSelectedParticipants.filter(p => !p.external).map(p => p.id));
    const filtered = users
        .filter(u => {
            if (selectedIds.has(u.id)) return false;
            if (!q) return true;
            const fullName = `${u.prenom || ''} ${u.nom || ''}`.toLowerCase();
            const email = (u.email || '').toLowerCase();
            return fullName.includes(q) || email.includes(q);
        })
        .slice(0, 8);

    let html = filtered
        .map(u => {
            const displayName = `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim() || u.username;
            const email = u.email || '';
            const initials = getAdminEventParticipantInitials(u.prenom, u.nom);
            const color = getAdminEventParticipantColor(displayName);
            const isExpert = u.is_expert
                ? '<span style="background:#ffe0b2;color:#e65100;padding:1px 6px;border-radius:8px;font-size:9px;margin-left:6px;">Expert</span>'
                : '';
            return `<div onclick='addAdminEventParticipant(${JSON.stringify({ id: u.id, nom: u.nom || '', prenom: u.prenom || '', email: u.email || '' })})'
                    style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background 0.15s;"
                    onmouseenter="this.style.background='#f5f5f5'" onmouseleave="this.style.background='white'">
                    <span style="width:32px;height:32px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;flex-shrink:0;">${initials}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:500;color:#333;">${displayName}${isExpert}</div>
                        ${email ? `<div style="font-size:11px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${email}</div>` : ''}
                    </div>
                </div>`;
        })
        .join('');

    if (q) {
        const safeQ = q.replace(/'/g, "\\'");
        html += `<div onclick="addAdminEventExternalParticipant('${safeQ}')"
                    style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-top:1px dashed #e0e0e0;background:#f9f9f9;transition:background 0.15s;"
                    onmouseenter="this.style.background='#eceff1'" onmouseleave="this.style.background='#f9f9f9'">
                    <span style="width:32px;height:32px;border-radius:50%;background:#78909c;color:white;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">✉</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:12px;font-weight:500;color:#546e7a;">➕ Ajouter comme invité externe</div>
                        <div style="font-size:11px;color:#78909c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q}</div>
                    </div>
                </div>`;
    }

    if (!html) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function handleAdminEventParticipantKeydown(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
        addAdminEventExternalParticipant(e.target.value);
        e.preventDefault();
        return;
    }
    if (e.key === 'Backspace' && e.target.value === '' && adminEventSelectedParticipants.length > 0) {
        adminEventSelectedParticipants.pop();
        renderAdminEventParticipantTags();
    }
    if (e.key === 'Escape') {
        document.getElementById('adminEventParticipantDropdown').style.display = 'none';
    }
}

// Fermer le dropdown Admin participants si on clique en dehors
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('adminEventParticipantDropdown');
    const container = document.getElementById('adminEventParticipantsContainer');
    if (dropdown && container && !container.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Ajouter un événement personnalisé
async function addCustomEvent() {
    const startDate = document.getElementById('customEventStartDate').value;
    const endDate = document.getElementById('customEventEndDate').value;
    const label = document.getElementById('customEventLabel').value.trim();
    const bgColor = document.getElementById('customEventBgColor').value;
    const textColor = document.getElementById('customEventTextColor').value;
    const borderColor = document.getElementById('customEventBorderColor').value;
    const location_id = document.getElementById('customEventLocationId')?.value || null;

    if (!startDate) {
        alert('Veuillez sélectionner une date de début');
        return;
    }
    if (!label) {
        alert('Veuillez saisir un libellé');
        return;
    }

    const finalEndDate = endDate || startDate;
    const isSameDay = finalEndDate === startDate;
    const period = isSameDay
        ? document.querySelector('input[name="customEventPeriod"]:checked')?.value || 'FULL'
        : 'FULL';
    const grist = document.getElementById('customEventGrist')?.checked || false;

    try {
        const response = await fetch(`${API_URL}/my-custom-events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                startDate,
                endDate: finalEndDate,
                label,
                config: { bgColor, textColor, borderColor },
                participants: adminEventSelectedParticipants.filter(p => !p.external).map(p => p.id),
                external_participants: adminEventSelectedParticipants
                    .filter(p => p.external)
                    .map(p => ({ nom: p.nom, prenom: p.prenom, email: p.email })),
                period,
                location_id: location_id || null,
                grist
            })
        });

        if (response.ok) {
            document.getElementById('customEventStartDate').value = '';
            document.getElementById('customEventEndDate').value = '';
            document.getElementById('customEventLabel').value = '';
            document.getElementById('customEventPeriodFull').checked = true;
            document.getElementById('customEventPeriodSection').style.display = 'none';
            if (document.getElementById('customEventGrist'))
                document.getElementById('customEventGrist').checked = false;
            const locSel = document.getElementById('customEventLocationId');
            if (locSel) locSel.value = '';
            adminEventSelectedParticipants = [];
            renderAdminEventParticipantTags();
            await loadCustomEvents();
            await loadSpecialDates();
            updateGantt();
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur ajout événement:', error);
        alert('Erreur: ' + error.message);
    }
}

// Toggle tri par année pour événements admin
// Variable pour mémoriser l'état des arbres dépliés
let customEventsExpandedNodes = new Set();

function toggleCustomEventsSortYear() {
    // Sauvegarder l'état des nœuds dépliés avant le tri
    saveCustomEventsExpandedState();
    customEventsSortYear = customEventsSortYear === 'desc' ? 'asc' : 'desc';
    renderCustomEventsTable();
    // Restaurer l'état des nœuds après le rendu
    restoreCustomEventsExpandedState();
}

function saveCustomEventsExpandedState() {
    customEventsExpandedNodes.clear();
    const container = document.getElementById('customEventsTableContainer');
    if (!container) return;

    const treeContents = container.querySelectorAll('.tree-content');
    treeContents.forEach((content, idx) => {
        if (content.style.display !== 'none') {
            // Sauvegarder le texte du parent pour identifier le nœud
            const parent = content.previousElementSibling;
            if (parent) {
                const nodeId = parent.textContent
                    .replace(/[▶▼]/g, '')
                    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
                    .trim();
                customEventsExpandedNodes.add(nodeId);
            }
        }
    });
}

function restoreCustomEventsExpandedState() {
    const container = document.getElementById('customEventsTableContainer');
    if (!container) return;

    const treeHeaders = container.querySelectorAll('[onclick*="toggleCustomEventsTreeNode"]');
    treeHeaders.forEach(header => {
        const nodeId = header.textContent
            .replace(/[▶▼]/g, '')
            .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
            .trim();
        if (customEventsExpandedNodes.has(nodeId)) {
            const content = header.nextElementSibling;
            const arrow = header.querySelector('.tree-arrow');
            if (content && arrow) {
                content.style.display = 'block';
                arrow.textContent = '▼';
            }
        }
    });
}

// Toggle pour l'arborescence des événements admin
function toggleCustomEventsTreeNode(element) {
    const content = element.nextElementSibling;
    const arrow = element.querySelector('.tree-arrow');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
}

// Construire un item d'événement admin
function buildCustomEventItem(event) {
    const config = event.config ? (typeof event.config === 'string' ? JSON.parse(event.config) : event.config) : {};
    const startDate = new Date(event.start_date);
    const endDate = new Date(event.end_date);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const startStr = startDate.toLocaleDateString('fr-FR');
    const endStr = endDate.toLocaleDateString('fr-FR');
    const dateDisplay = startStr === endStr ? startStr : `${startStr} - ${endStr}`;

    // Nom du créateur
    const creatorFullName =
        ((event.creator_prenom || '') + ' ' + (event.creator_nom || '').toUpperCase()).trim() || 'Système';

    // Capitaliser le label (première lettre de chaque mot en majuscule, préserver les acronymes)
    const capitalizeLabel = label => {
        if (!label) return '';
        return label
            .split(' ')
            .map(word => {
                if (word === word.toUpperCase() && word.length > 1) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    };
    const displayLabel = capitalizeLabel(event.label);
    // Préfixe localisation
    const locAdmin = event.location_id
        ? allLocations.find(l => l.id === event.location_id)?.libelle_court || 'NON DÉFINI'
        : null;
    const displayFull = locAdmin ? `${locAdmin} | ${displayLabel}` : displayLabel;

    // Fonction pour obtenir les initiales
    const getInitials = (prenom, nom) => {
        return ((prenom || '')[0] || '').toUpperCase() + ((nom || '')[0] || '').toUpperCase();
    };

    // Fonction pour obtenir une couleur basée sur le nom
    const getColor = name => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const colors = [
            '#e91e63',
            '#9c27b0',
            '#673ab7',
            '#3f51b5',
            '#2196f3',
            '#009688',
            '#4caf50',
            '#ff9800',
            '#795548',
            '#607d8b'
        ];
        return colors[Math.abs(hash) % colors.length];
    };

    // Participants
    let participantsHtml = '';
    const allParticipants = [
        ...(event.participants || []).map(p => ({ external: false, nom: p.nom, prenom: p.prenom, email: p.email })),
        ...(event.external_participants || []).map(p => ({
            external: true,
            nom: p.nom,
            prenom: p.prenom,
            email: p.email
        }))
    ];
    if (allParticipants.length > 0) {
        const chips = allParticipants
            .map(p => {
                const name = p.external
                    ? p.email || `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || '?'
                    : `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
                const initials = p.external ? '✉' : getInitials(p.prenom, p.nom);
                const color = p.external ? '#78909c' : getColor(name);
                const bg = p.external ? '#eceff1' : '#f0f0f0';
                const border = p.external ? '#b0bec5' : '#e0e0e0';
                const titleStr = p.external
                    ? `Invité externe : ${name}`
                    : `${name}${p.email ? ' (' + p.email + ')' : ''}`;
                return `<span title="${titleStr}" style="display:inline-flex;align-items:center;gap:3px;background:${bg};border:1px solid ${border};border-radius:12px;padding:1px 7px 1px 1px;font-size:10px;">
                        <span style="width:16px;height:16px;border-radius:50%;background:${color};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:${p.external ? '9px' : '8px'};font-weight:bold;">${initials}</span>
                        ${name}
                    </span>`;
            })
            .join(' ');
        participantsHtml = `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px;align-items:center;">
                    <span style="font-size:10px;color:#888;">${uiIcon('users', 14, 'margin-right:2px;')}</span> ${chips}
                </div>`;
    }

    return `<div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 6px; border-left: 4px solid ${config.borderColor || '#fbc02d'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                            <span style="display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; 
                                background-color: ${config.bgColor || '#ffeb3b'}; 
                                color: ${config.textColor || '#000'}; 
                                border: 2px solid ${config.borderColor || '#fbc02d'};">${eventIconHtml(event.label)}${displayFull}</span>
                            <span style="font-size: 10px; color: #666;">${uiIcon('user', 13, 'margin-right:4px;')}${creatorFullName}</span>
                        </div>
                        <div style="font-size: 11px; color: #666;">
                            ${uiIcon('calendar', 14, 'margin-right:5px;')}${dateDisplay} <span style="color: #999;">(${diffDays} jour${diffDays > 1 ? 's' : ''})</span>
                        </div>
                        ${participantsHtml}
                        <div style="margin-top:4px;display:flex;align-items:center;gap:5px;width:fit-content;">
                            <input type="checkbox" ${event.grist ? 'checked' : ''} disabled style="margin:0;cursor:default;opacity:0.5;">
                            <span style="font-size:10px;color:#aaa;font-weight:bold;">GRIST</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" class="icon-btn" onclick="window.editCustomEvent(${event.id})" style="background:#1e88e5;" title="Modifier l'événement" aria-label="Modifier l'événement">${uiIcon('pencil', 16, 'margin:0;vertical-align:middle;')}</button>
                        <button type="button" class="icon-btn" onclick="window.deleteCustomEvent(${event.id})" style="background:#e53935;" title="Supprimer l'événement" aria-label="Supprimer l'événement">${uiIcon('trash', 16, 'margin:0;vertical-align:middle;')}</button>
                    </div>
                </div>
            </div>`;
}

// Afficher les événements personnalisés sous forme d'arborescence Année > Mois
function renderCustomEventsTable() {
    const container = document.getElementById('customEventsTableContainer');
    if (!container) return;

    if (customEvents.length === 0) {
        container.innerHTML =
            '<p style="color: #999; font-size: 12px; font-style: italic;">Aucun événement personnalisé</p>';
        return;
    }

    const monthNames = [
        'Janvier',
        'Février',
        'Mars',
        'Avril',
        'Mai',
        'Juin',
        'Juillet',
        'Août',
        'Septembre',
        'Octobre',
        'Novembre',
        'Décembre'
    ];
    const currentYear = new Date().getFullYear();

    // Organiser par année > mois
    const byYear = {};
    customEvents.forEach(event => {
        const startDate = new Date(event.start_date);
        const year = startDate.getFullYear();
        const month = startDate.getMonth();

        if (!byYear[year]) byYear[year] = {};
        if (!byYear[year][month]) byYear[year][month] = [];
        byYear[year][month].push(event);
    });

    // Trier les années
    const sortedYears = Object.keys(byYear).sort((a, b) => {
        return customEventsSortYear === 'desc' ? b - a : a - b;
    });

    // Bouton de tri
    let html = `<div style="display: flex; gap: 10px; margin-bottom: 15px; padding: 10px; background: #e3f2fd; border-radius: 8px;">
                <span style="font-size: 12px; color: #1565c0; display: flex; align-items: center;">Trier par :</span>
                <button onclick="toggleCustomEventsSortYear()" style="background: #1565c0; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    Année ${customEventsSortYear === 'desc' ? '▼ (récent → ancien)' : '▲ (ancien → récent)'}
                </button>
            </div>`;

    html += '<div>';

    sortedYears.forEach(year => {
        // Trier les mois selon le tri de l'année
        const sortedMonths = Object.keys(byYear[year]).sort((a, b) => {
            return customEventsSortYear === 'desc' ? b - a : a - b;
        });

        // L'année en cours est ouverte par défaut
        const isCurrentYear = parseInt(year) === currentYear;
        const yearDisplay = isCurrentYear ? 'block' : 'none';
        const yearArrow = isCurrentYear ? '▼' : '▶';

        html += `<div style="margin-bottom: 10px;">
                    <div onclick="toggleCustomEventsTreeNode(this)" style="cursor: pointer; padding: 10px; background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%); border-radius: 6px; font-weight: bold; color: white; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <span class="tree-arrow">${yearArrow}</span> 📅 ${year}
                        <span style="font-size: 11px; font-weight: normal; margin-left: auto; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px;">
                            ${Object.values(byYear[year]).flat().length} événement(s)
                        </span>
                    </div>
                    <div class="tree-content" style="display: ${yearDisplay}; margin-left: 15px; margin-top: 8px;">`;

        sortedMonths.forEach(month => {
            const monthEvents = byYear[year][month];

            // Les mois restent repliés par défaut (même pour l'année en cours)
            html += `<div style="margin-bottom: 8px;">
                        <div onclick="toggleCustomEventsTreeNode(this)" style="cursor: pointer; padding: 8px 12px; background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%); border-radius: 5px; display: flex; align-items: center; gap: 8px; color: white;">
                            <span class="tree-arrow">▶</span> ${monthNames[month]}
                            <span style="font-size: 10px; margin-left: auto; background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px;">
                                ${monthEvents.length} événement(s)
                            </span>
                        </div>
                        <div class="tree-content" style="display: none; margin-left: 15px; margin-top: 5px;">`;

            // Trier les événements par date de début
            monthEvents.sort((a, b) => {
                const diff = new Date(a.start_date) - new Date(b.start_date);
                return customEventsSortYear === 'desc' ? -diff : diff;
            });

            monthEvents.forEach(event => {
                html += buildCustomEventItem(event);
            });

            html += `</div></div>`;
        });

        html += `</div></div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Supprimer un événement personnalisé
window.deleteCustomEvent = async function (eventId) {
    if (!confirm('Voulez-vous vraiment supprimer cet événement ?')) return;

    try {
        const response = await fetch(`${API_URL}/custom-events/${eventId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            await loadCustomEvents();
            await loadSpecialDates();
            updateGantt();
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erreur: ' + error.message);
    }
};

// Éditer un événement personnalisé
window.editCustomEvent = async function (eventId) {
    console.log('🔧 editCustomEvent appelé avec ID:', eventId);
    if (allLocations.length === 0) {
        await loadLocations();
    }
    const event = customEvents.find(e => e.id === eventId);
    if (!event) {
        console.error('Événement non trouvé:', eventId);
        return;
    }

    const config = event.config ? (typeof event.config === 'string' ? JSON.parse(event.config) : event.config) : {};

    document.getElementById('editCustomEventId').value = eventId;
    document.getElementById('editCustomEventStartDate').value = event.start_date;
    document.getElementById('editCustomEventEndDate').value = event.end_date;
    document.getElementById('editCustomEventLabel').value = event.label;
    document.getElementById('editCustomEventBgColor').value = config.bgColor || '#ffeb3b';
    document.getElementById('editCustomEventTextColor').value = config.textColor || '#000000';
    document.getElementById('editCustomEventBorderColor').value = config.borderColor || '#fbc02d';
    updateEditCustomEventPreview();

    // Pré-remplir la période
    const evtPeriod = event.period || 'FULL';
    const isSameDay = event.start_date === event.end_date;
    if (isSameDay) {
        document.getElementById('editCustomEventPeriodSection').style.display = 'block';
        const radio = document.querySelector(`input[name="editCustomEventPeriod"][value="${evtPeriod}"]`);
        if (radio) radio.checked = true;
    } else {
        document.getElementById('editCustomEventPeriodSection').style.display = 'none';
        document.getElementById('editCustomEventPeriodFull').checked = true;
    }

    // Charger les participants existants
    editEventSelectedParticipants = [
        ...(event.participants || []).map(p => ({ id: p.user_id, nom: p.nom, prenom: p.prenom, email: p.email })),
        ...(event.external_participants || []).map(p => ({
            external: true,
            nom: p.nom,
            prenom: p.prenom,
            email: p.email
        }))
    ];
    renderEditEventParticipantTags();

    // Gestion du champ créateur (uniquement pour les admins)
    const creatorSection = document.getElementById('editCustomEventCreatorSection');
    const creatorSelect = document.getElementById('editCustomEventCreator');

    if (currentUser && currentUser.activeProfile === 'admin') {
        creatorSection.style.display = 'block';

        // Remplir la liste des utilisateurs (utiliser users, pas resources)
        creatorSelect.innerHTML = '<option value="">-- Sélectionner un créateur --</option>';

        // Ajouter tous les utilisateurs (triés par nom)
        const allUsers = [...users].sort((a, b) => {
            const nameA = `${a.nom || ''} ${a.prenom || ''}`.toLowerCase();
            const nameB = `${b.nom || ''} ${b.prenom || ''}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });

        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id; // ID utilisateur (pas ID ressource)
            option.textContent = `${user.nom || ''} ${user.prenom || ''}`.trim() || user.username;
            if (user.id === event.created_by) {
                option.selected = true;
            }
            creatorSelect.appendChild(option);
        });
    } else {
        creatorSection.style.display = 'none';
    }

    // Pré-remplir la localisation dans la modale d'édition
    const editLocSel = document.getElementById('editCustomEventLocationId');
    if (editLocSel) {
        editLocSel.innerHTML = '<option value="">— Aucune localisation —</option>';
        allLocations.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = `${loc.libelle_court} – ${loc.libelle_long}`;
            if (loc.id === event.location_id) opt.selected = true;
            editLocSel.appendChild(opt);
        });
    }

    // Pré-remplir GRIST
    const editGristCb = document.getElementById('editCustomEventGrist');
    if (editGristCb) editGristCb.checked = !!event.grist;

    document.getElementById('editCustomEventModal').style.display = 'block';
};

// Fermer la modal d'édition
function closeEditCustomEventModal() {
    document.getElementById('editCustomEventModal').style.display = 'none';
    editEventSelectedParticipants = [];
}

// Afficher/masquer le sélecteur demi-journée dans la modale de modification
function updateEditCustomEventPeriodVisibility() {
    const startDate = document.getElementById('editCustomEventStartDate').value;
    const endDate = document.getElementById('editCustomEventEndDate').value;
    const section = document.getElementById('editCustomEventPeriodSection');
    const isSameDay = startDate && (!endDate || endDate === startDate);
    section.style.display = isSameDay ? 'block' : 'none';
    if (!isSameDay) document.getElementById('editCustomEventPeriodFull').checked = true;
}

// Prévisualisation édition événement
function updateEditCustomEventPreview() {
    const label = document.getElementById('editCustomEventLabel').value || 'FÉRIÉ';
    const bgColor = document.getElementById('editCustomEventBgColor').value;
    const textColor = document.getElementById('editCustomEventTextColor').value;
    const borderColor = document.getElementById('editCustomEventBorderColor').value;

    const preview = document.getElementById('editCustomEventPreview');
    if (preview) {
        preview.textContent = label;
        preview.style.backgroundColor = bgColor;
        preview.style.color = textColor;
        preview.style.border = `2px solid ${borderColor}`;
    }
}

// ========== GESTION PARTICIPANTS MODAL ÉDITION ==========
let editEventSelectedParticipants = [];

function getEditEventParticipantInitials(prenom, nom) {
    return ((prenom || '')[0] || '').toUpperCase() + ((nom || '')[0] || '').toUpperCase();
}

function getEditEventParticipantColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const colors = [
        '#e91e63',
        '#9c27b0',
        '#673ab7',
        '#3f51b5',
        '#2196f3',
        '#009688',
        '#4caf50',
        '#ff9800',
        '#795548',
        '#607d8b'
    ];
    return colors[Math.abs(hash) % colors.length];
}

function renderEditEventParticipantTags() {
    const container = document.getElementById('editEventParticipantsContainer');
    const input = document.getElementById('editEventParticipantInput');
    if (!container || !input) return;
    container.querySelectorAll('.participant-tag').forEach(t => t.remove());
    editEventSelectedParticipants.forEach((p, idx) => {
        const tag = document.createElement('span');
        tag.className = 'participant-tag';
        const displayName = `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || p.email || '?';
        const initials = p.external ? '✉' : getEditEventParticipantInitials(p.prenom, p.nom);
        const color = p.external ? '#78909c' : getEditEventParticipantColor(displayName);
        const bg = p.external ? '#eceff1' : '#f0f0f0';
        const border = p.external ? '#b0bec5' : '#ddd';
        const title = p.external ? (p.email ? `Invité externe — ${p.email}` : 'Invité externe') : '';
        tag.innerHTML = `<span title="${title}" style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:1px solid ${border};border-radius:15px;padding:2px 8px 2px 2px;font-size:11px;white-space:nowrap;">
                    <span style="width:20px;height:20px;border-radius:50%;background:${color};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:${p.external ? '10px' : '9px'};font-weight:bold;">${initials}</span>
                    <span style="color:#333;">${displayName}</span>
                    <span onclick="removeEditEventParticipant(${idx})" style="cursor:pointer;color:#999;font-size:14px;line-height:1;margin-left:2px;" title="Retirer">&times;</span>
                </span>`;
        container.insertBefore(tag, input);
    });
}

function removeEditEventParticipant(idx) {
    editEventSelectedParticipants.splice(idx, 1);
    renderEditEventParticipantTags();
}

function addEditEventParticipant(user) {
    if (!user.external && editEventSelectedParticipants.some(p => !p.external && p.id === user.id)) return;
    editEventSelectedParticipants.push(user);
    renderEditEventParticipantTags();
    const input = document.getElementById('editEventParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('editEventParticipantDropdown').style.display = 'none';
}

function addEditEventExternalParticipant(rawInput) {
    const q = (rawInput || '').trim();
    if (!q) return;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
    const entry = isEmail
        ? { external: true, nom: '', prenom: '', email: q }
        : { external: true, nom: q, prenom: '', email: '' };
    editEventSelectedParticipants.push(entry);
    renderEditEventParticipantTags();
    const input = document.getElementById('editEventParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('editEventParticipantDropdown').style.display = 'none';
}

function filterEditEventParticipants(query) {
    const dropdown = document.getElementById('editEventParticipantDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const selectedIds = new Set(editEventSelectedParticipants.filter(p => !p.external).map(p => p.id));
    const filtered = users
        .filter(u => {
            if (selectedIds.has(u.id)) return false;
            if (!q) return true;
            const fullName = `${u.prenom || ''} ${u.nom || ''}`.toLowerCase();
            const email = (u.email || '').toLowerCase();
            return fullName.includes(q) || email.includes(q);
        })
        .slice(0, 8);

    let html = filtered
        .map(u => {
            const displayName = `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim() || u.username;
            const email = u.email || '';
            const initials = getEditEventParticipantInitials(u.prenom, u.nom);
            const color = getEditEventParticipantColor(displayName);
            const isExpert = u.is_expert
                ? '<span style="background:#ffe0b2;color:#e65100;padding:1px 6px;border-radius:8px;font-size:9px;margin-left:6px;">Expert</span>'
                : '';
            return `<div onclick='addEditEventParticipant(${JSON.stringify({ id: u.id, nom: u.nom || '', prenom: u.prenom || '', email: u.email || '' })})'
                    style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background 0.15s;"
                    onmouseenter="this.style.background='#f5f5f5'" onmouseleave="this.style.background='white'">
                    <span style="width:32px;height:32px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;flex-shrink:0;">${initials}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:500;color:#333;">${displayName}${isExpert}</div>
                        ${email ? `<div style="font-size:11px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${email}</div>` : ''}
                    </div>
                </div>`;
        })
        .join('');

    if (q) {
        const safeQ = q.replace(/'/g, "\\'");
        html += `<div onclick="addEditEventExternalParticipant('${safeQ}')"
                    style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-top:1px dashed #e0e0e0;background:#f9f9f9;transition:background 0.15s;"
                    onmouseenter="this.style.background='#eceff1'" onmouseleave="this.style.background='#f9f9f9'">
                    <span style="width:32px;height:32px;border-radius:50%;background:#78909c;color:white;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">✉</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:12px;font-weight:500;color:#546e7a;">➕ Ajouter comme invité externe</div>
                        <div style="font-size:11px;color:#78909c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q}</div>
                    </div>
                </div>`;
    }

    if (!html) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function handleEditEventParticipantKeydown(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
        addEditEventExternalParticipant(e.target.value);
        e.preventDefault();
        return;
    }
    if (e.key === 'Backspace' && e.target.value === '' && editEventSelectedParticipants.length > 0) {
        editEventSelectedParticipants.pop();
        renderEditEventParticipantTags();
    }
    if (e.key === 'Escape') {
        document.getElementById('editEventParticipantDropdown').style.display = 'none';
    }
}

// Fermer le dropdown édition si on clique en dehors
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('editEventParticipantDropdown');
    const container = document.getElementById('editEventParticipantsContainer');
    if (dropdown && container && !container.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Sauvegarder les modifications d'un événement
async function saveEditCustomEvent() {
    const eventId = document.getElementById('editCustomEventId').value;
    const startDate = document.getElementById('editCustomEventStartDate').value;
    const endDate = document.getElementById('editCustomEventEndDate').value;
    const label = document.getElementById('editCustomEventLabel').value.trim();
    const bgColor = document.getElementById('editCustomEventBgColor').value;
    const textColor = document.getElementById('editCustomEventTextColor').value;
    const borderColor = document.getElementById('editCustomEventBorderColor').value;
    const location_id = document.getElementById('editCustomEventLocationId')?.value || null;
    const grist = document.getElementById('editCustomEventGrist')?.checked || false;

    if (!startDate || !label) {
        alert('Veuillez remplir tous les champs obligatoires');
        return;
    }

    const finalEndDate = endDate || startDate;
    const isSameDay = finalEndDate === startDate;
    const period = isSameDay
        ? document.querySelector('input[name="editCustomEventPeriod"]:checked')?.value || 'FULL'
        : 'FULL';

    const data = {
        startDate,
        endDate: finalEndDate,
        label,
        config: { bgColor, textColor, borderColor },
        participants: editEventSelectedParticipants.filter(p => !p.external).map(p => p.id),
        external_participants: editEventSelectedParticipants
            .filter(p => p.external)
            .map(p => ({ nom: p.nom, prenom: p.prenom, email: p.email })),
        period,
        location_id: location_id || null,
        grist
    };

    if (currentUser && currentUser.activeProfile === 'admin') {
        const creatorSelect = document.getElementById('editCustomEventCreator');
        if (creatorSelect && creatorSelect.value) {
            data.createdBy = parseInt(creatorSelect.value);
        }
    }

    try {
        const response = await fetch(`${API_URL}/custom-events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeEditCustomEventModal();
            await loadCustomEvents();
            await loadSpecialDates();
            updateGantt();
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
        alert('Erreur: ' + error.message);
    }
}

// ========== FIN ÉVÉNEMENTS PERSONNALISÉS ==========
