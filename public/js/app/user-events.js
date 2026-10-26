// Application principale : user-events
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES ÉVÉNEMENTS PERSONNALISÉS (POUR TOUS LES UTILISATEURS) ==========

let myEvents = [];
let isAdminViewingAllEvents = false;

// Ouvrir la modal de gestion des événements
function toggleNeedsResources() {
    const checked = document.getElementById('myEventNeedsResources').checked;
    document.getElementById('myEventResourcesPanel').style.display = checked ? 'block' : 'none';
}

function updateResourcesCounter() {
    const count = document.getElementById('myEventResourcesCount')?.value || '1';
    document.getElementById('myEventResourcesCountDisplay').textContent = count;
}

async function populateNotifyUsersSelect() {
    try {
        const res = await fetch(`${API_URL}/users`, { credentials: 'include' });
        const data = await res.json();
        const select = document.getElementById('myEventNotifyUsers');
        if (!select) return;
        select.innerHTML = (data.users || data || [])
            .filter(u => u.actif === 1 && u.email)
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
            .map(
                u =>
                    `<option value="${u.id}" data-email="${u.email}" data-nom="${u.nom}" data-prenom="${u.prenom}">${(u.nom || '').toUpperCase()} ${u.prenom || ''}</option>`
            )
            .join('');
    } catch (e) {
        console.error('Erreur chargement utilisateurs:', e);
    }
}

async function joinEventAsParticipant(eventId) {
    try {
        const res = await fetch(`${API_URL}/my-custom-events/${eventId}/join`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        if (data.planningUpdated) {
            const msg =
                `✅ Vous avez été inscrit(e) comme participant à "${data.eventLabel}".\n\n` +
                `⚡ Votre planning a été mis à jour automatiquement :\n` +
                `• Disponibilité : passée à "En attente" (code 2)\n` +
                `• Affectation : passée à "Divers" (code 8) par défaut\n\n` +
                `💡 Nous vous invitons à vérifier votre planning et à sélectionner un code d'affectation plus précis si nécessaire (ex: SAMU Déploiement, ANS Déploiement...).`;
            alert(msg);
            await loadSchedule();
            setTimeout(() => updateGantt(), 100);
        }
        await loadMyEvents();
    } catch (e) {
        alert("Erreur lors de l'inscription : " + e.message);
    }
}

async function editMyEventParticipantsOnly(eventId) {
    // Ouvre le formulaire d'édition mais désactive tout sauf les participants
    await editMyEvent(eventId);
    // Désactiver les champs non-participants
    [
        'myEventStartDate',
        'myEventEndDate',
        'myEventLabel',
        'myEventBgColor',
        'myEventTextColor',
        'myEventBorderColor',
        'myEventLocationId',
        'myEventNeedsResources',
        'myEventResourcesCount'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = true;
            el.style.opacity = '0.5';
        }
    });
    ['myEventPeriodFull', 'myEventPeriodAM', 'myEventPeriodPM'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = true;
        }
    });
    // Masquer les templates et couleurs
    document.getElementById('myEventActionBtn').textContent = '💾 Enregistrer les participants';
    // Afficher un bandeau info
    const formBody = document.getElementById('myEventFormBody');
    if (formBody) {
        const banner = document.createElement('div');
        banner.id = 'participantsOnlyBanner';
        banner.style.cssText =
            'background:#fff3e0;border:1px solid #ff9800;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#e65100;';
        banner.innerHTML =
            '👥 Mode lecture — vous pouvez uniquement modifier les <strong>participants</strong> de cet événement.';
        formBody.insertBefore(banner, formBody.firstChild);
    }
}
async function openMyEventsModal() {
    if (allLocations.length === 0) {
        await loadLocations();
    }
    populateLocationSelects();
    populateNotifyUsersSelect();
    await loadMyEvents();
}

// Conservé pour compatibilité — l'onglet Événements n'a plus de modale à fermer
function closeMyEventsModal() {
    resetMyEventForm();
}

// === PARTICIPANTS ÉVÉNEMENTS ===
let myEventSelectedParticipants = []; // [{id, nom, prenom, email}]
let myEventsCurrentUserId = null; // userId retourné par l'API

function getParticipantInitials(prenom, nom) {
    return ((prenom || '')[0] || '').toUpperCase() + ((nom || '')[0] || '').toUpperCase();
}

function getParticipantColor(name) {
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

function renderMyEventParticipantTags() {
    const container = document.getElementById('myEventParticipantsContainer');
    const input = document.getElementById('myEventParticipantInput');
    if (!container || !input) return;
    container.querySelectorAll('.participant-tag').forEach(t => t.remove());
    myEventSelectedParticipants.forEach((p, idx) => {
        const tag = document.createElement('span');
        tag.className = 'participant-tag';
        const displayName = `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || p.email || '?';
        const initials = p.external ? '✉' : getParticipantInitials(p.prenom, p.nom);
        const color = p.external ? '#78909c' : getParticipantColor(displayName);
        const bg = p.external ? '#eceff1' : '#f0f0f0';
        const border = p.external ? '#b0bec5' : '#ddd';
        const title = p.external ? (p.email ? `Invité externe — ${p.email}` : 'Invité externe') : '';
        tag.innerHTML = `<span title="${title}" style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:1px solid ${border};border-radius:15px;padding:2px 8px 2px 2px;font-size:11px;white-space:nowrap;">
                    <span style="width:20px;height:20px;border-radius:50%;background:${color};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:${p.external ? '10px' : '9px'};font-weight:bold;">${initials}</span>
                    <span style="color:#333;">${displayName}</span>
                    <span onclick="removeMyEventParticipant(${idx})" style="cursor:pointer;color:#999;font-size:14px;line-height:1;margin-left:2px;" title="Retirer">&times;</span>
                </span>`;
        container.insertBefore(tag, input);
    });
}

function removeMyEventParticipant(idx) {
    myEventSelectedParticipants.splice(idx, 1);
    renderMyEventParticipantTags();
    const cntEl = document.getElementById('myEventParticipantCount');
    if (cntEl) cntEl.textContent = myEventSelectedParticipants.length;
}

function addMyEventParticipant(user) {
    if (!user.external && myEventSelectedParticipants.some(p => !p.external && p.id === user.id)) return;
    myEventSelectedParticipants.push(user);
    renderMyEventParticipantTags();
    const input = document.getElementById('myEventParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('myEventParticipantDropdown').style.display = 'none';
    const cntEl = document.getElementById('myEventParticipantCount');
    if (cntEl) cntEl.textContent = myEventSelectedParticipants.length;
}

function addMyEventExternalParticipant(rawInput) {
    const q = (rawInput || '').trim();
    if (!q) return;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
    const entry = isEmail
        ? { external: true, nom: '', prenom: '', email: q }
        : { external: true, nom: q, prenom: '', email: '' };
    myEventSelectedParticipants.push(entry);
    renderMyEventParticipantTags();
    const input = document.getElementById('myEventParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('myEventParticipantDropdown').style.display = 'none';
    const cntEl = document.getElementById('myEventParticipantCount');
    if (cntEl) cntEl.textContent = myEventSelectedParticipants.length;
}

function filterMyEventParticipants(query) {
    const dropdown = document.getElementById('myEventParticipantDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const selectedIds = new Set(myEventSelectedParticipants.filter(p => !p.external).map(p => p.id));
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
            const initials = getParticipantInitials(u.prenom, u.nom);
            const color = getParticipantColor(displayName);
            const isExpert = u.is_expert
                ? '<span style="background:#ffe0b2;color:#e65100;padding:1px 6px;border-radius:8px;font-size:9px;margin-left:6px;">Expert</span>'
                : '';
            return `<div onclick='addMyEventParticipant(${JSON.stringify({ id: u.id, nom: u.nom || '', prenom: u.prenom || '', email: u.email || '' })})'
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
        html += `<div onclick="addMyEventExternalParticipant('${safeQ}')"
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

function handleParticipantKeydown(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
        addMyEventExternalParticipant(e.target.value);
        e.preventDefault();
        return;
    }
    if (e.key === 'Backspace' && e.target.value === '' && myEventSelectedParticipants.length > 0) {
        myEventSelectedParticipants.pop();
        renderMyEventParticipantTags();
    }
    if (e.key === 'Escape') {
        document.getElementById('myEventParticipantDropdown').style.display = 'none';
    }
}

// Fermer le dropdown participants si on clique en dehors
document.addEventListener('click', function (e) {
    const container = document.getElementById('myEventParticipantsContainer');
    const dropdown = document.getElementById('myEventParticipantDropdown');
    if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Réinitialiser le formulaire
function resetMyEventForm() {
    // Nettoyer le mode "participants seulement"
    const banner = document.getElementById('participantsOnlyBanner');
    if (banner) banner.remove();
    [
        'myEventStartDate',
        'myEventEndDate',
        'myEventLabel',
        'myEventBgColor',
        'myEventTextColor',
        'myEventBorderColor',
        'myEventLocationId',
        'myEventNeedsResources',
        'myEventResourcesCount'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            el.style.opacity = '';
        }
    });
    ['myEventPeriodFull', 'myEventPeriodAM', 'myEventPeriodPM'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });

    document.getElementById('myEventStartDate').value = '';
    document.getElementById('myEventEndDate').value = '';
    document.getElementById('myEventLabel').value = '';
    document.getElementById('myEventBgColor').value = '#ffeb3b';
    document.getElementById('myEventTextColor').value = '#000000';
    document.getElementById('myEventBorderColor').value = '#fbc02d';
    if (typeof evtFillTypeSelect === 'function') evtFillTypeSelect('');
    updateMyEventPreview();

    // Reset période
    document.getElementById('myEventPeriodFull').checked = true;
    document.getElementById('myEventPeriodSection').style.display = 'none';

    // Reset localisation
    const locSel = document.getElementById('myEventLocationId');
    if (locSel) locSel.value = '';

    // Reset participants
    myEventSelectedParticipants = [];
    renderMyEventParticipantTags();
    const participantInput = document.getElementById('myEventParticipantInput');
    if (participantInput) participantInput.value = '';

    // Reset champs "Besoin de ressources"
    const needsRes = document.getElementById('myEventNeedsResources');
    if (needsRes) needsRes.checked = false;
    const resPanel = document.getElementById('myEventResourcesPanel');
    if (resPanel) resPanel.style.display = 'none';
    const resCount = document.getElementById('myEventResourcesCount');
    if (resCount) resCount.value = '1';
    const cntEl = document.getElementById('myEventParticipantCount');
    if (cntEl) cntEl.textContent = '0';
    const cntDisp = document.getElementById('myEventResourcesCountDisplay');
    if (cntDisp) cntDisp.textContent = '1';
    const notifySelect = document.getElementById('myEventNotifyUsers');
    if (notifySelect) Array.from(notifySelect.options).forEach(o => (o.selected = false));

    const creatorSection = document.getElementById('myEventCreatorSection');
    if (creatorSection) creatorSection.style.display = 'none';

    // Remettre le bouton en "Ajouter" et replier le formulaire
    const addBtn = document.getElementById('myEventActionBtn');
    if (addBtn) {
        addBtn.textContent = '➕ Ajouter';
        addBtn.onclick = addMyEvent;
    }
    editingMyEventId = null;
    const formBody = document.getElementById('myEventFormBody');
    const formIcon = document.getElementById('myEventFormIcon');
    if (formBody) {
        formBody.style.display = 'none';
    }
    if (formIcon) {
        formIcon.textContent = '▶';
    }
}

// Afficher/masquer le sélecteur de demi-journée selon les dates
function updateMyEventPeriodVisibility() {
    const startDate = document.getElementById('myEventStartDate').value;
    const endDate = document.getElementById('myEventEndDate').value;
    const section = document.getElementById('myEventPeriodSection');
    const isSameDay = startDate && (!endDate || endDate === startDate);
    section.style.display = isSameDay ? 'block' : 'none';
    if (!isSameDay) document.getElementById('myEventPeriodFull').checked = true;
}

// Pré-remplir la date de fin
function prefillMyEventEndDate() {
    const startDate = document.getElementById('myEventStartDate').value;
    const endDateInput = document.getElementById('myEventEndDate');
    if (startDate && (!endDateInput.value || endDateInput.value < startDate)) {
        endDateInput.value = startDate;
    }
}

// Mettre à jour la prévisualisation
function updateMyEventPreview() {
    const label = document.getElementById('myEventLabel').value || 'LIBELLÉ';
    const bgColor = document.getElementById('myEventBgColor').value;
    const textColor = document.getElementById('myEventTextColor').value;
    const borderColor = document.getElementById('myEventBorderColor').value;

    const preview = document.getElementById('myEventPreview');
    if (preview) {
        preview.textContent = label;
        preview.style.backgroundColor = bgColor;
        preview.style.color = textColor;
        preview.style.borderColor = borderColor;
    }
}

// Appliquer un template prédéfini (Mes événements - Planification)
function applyMyEventTemplate(templateName) {
    const template = eventTemplates[templateName];
    if (!template) return;

    document.getElementById('myEventBgColor').value = template.bg;
    document.getElementById('myEventTextColor').value = template.text;
    document.getElementById('myEventBorderColor').value = template.border;

    // Toujours écraser le libellé avec celui du template (sauf "Libre" qui laisse le champ libre)
    if (template.label) {
        document.getElementById('myEventLabel').value = template.label;
        autoCheckGristByLabel(template.label, 'myEventGrist');
    }

    updateMyEventPreview();
}

// Charger les événements personnalisés
async function loadMyEvents() {
    try {
        const response = await fetch(`${API_URL}/my-custom-events`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            myEvents = data.events || [];
            isAdminViewingAllEvents = data.isAdmin || false;
            // Stocker l'userId retourné par l'API pour les contrôles d'accès
            myEventsCurrentUserId = data.userId || null;

            const titleEl = document.getElementById('myEventsModalTitle');
            if (titleEl) {
                titleEl.textContent = 'Événements';
            }

            renderMyEventsTable();
        }
    } catch (error) {
        console.error('Erreur chargement mes événements:', error);
    }
}

// Trier les événements
let myEventsSortYear = 'desc'; // 'asc' ou 'desc'
let _myEventsEditOpenNode = null; // { year, month } à garder ouvert après édition
let myEventsExpandedNodes = new Set(); // Pour mémoriser l'état des arbres dépliés

function toggleMyEventsSortYear() {
    // Sauvegarder l'état des nœuds dépliés avant le tri
    saveMyEventsExpandedState();
    myEventsSortYear = myEventsSortYear === 'desc' ? 'asc' : 'desc';
    renderMyEventsTable();
    // Restaurer l'état des nœuds après le rendu
    restoreMyEventsExpandedState();
}

function saveMyEventsExpandedState() {
    myEventsExpandedNodes.clear();
    const container = document.getElementById('myEventsTableContainer');
    if (!container) return;

    const treeContents = container.querySelectorAll('.tree-content');
    treeContents.forEach(content => {
        if (content.style.display !== 'none') {
            const parent = content.previousElementSibling;
            if (parent) {
                const nodeId = parent.textContent
                    .replace(/[▶▼]/g, '')
                    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
                    .trim();
                myEventsExpandedNodes.add(nodeId);
            }
        }
    });
}

function restoreMyEventsExpandedState() {
    const container = document.getElementById('myEventsTableContainer');
    if (!container) return;

    const treeHeaders = container.querySelectorAll('[onclick*="toggleMyEventsTreeNode"]');
    treeHeaders.forEach(header => {
        const nodeId = header.textContent
            .replace(/[▶▼]/g, '')
            .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
            .trim();
        if (myEventsExpandedNodes.has(nodeId)) {
            const content = header.nextElementSibling;
            const arrow = header.querySelector('.tree-arrow');
            if (content && arrow) {
                content.style.display = 'block';
                arrow.textContent = '▼';
            }
        }
    });
}

function exportMyEventsCSV() {
    const filtered = _getFilteredMyEvents();
    if (!filtered.length) {
        alert('Aucun événement à exporter.');
        return;
    }
    const headers = [
        'Type',
        'Libellé',
        'Date début',
        'Date fin',
        'Localisation',
        'Participants internes',
        'Participants externes',
        'Description'
    ];
    const rows = filtered.map(ev => {
        const internal = (ev.participants || []).map(p => `${p.prenom || ''} ${p.nom || ''}`.trim()).join('; ');
        const external = (ev.external_participants || [])
            .map(p => p.email || `${p.prenom || ''} ${p.nom || ''}`.trim())
            .join('; ');
        return [
            ev.type_long || '',
            ev.label || '',
            ev.start_date || '',
            ev.end_date || '',
            ev.location || '',
            internal,
            external,
            (ev.description || '').replace(/\n/g, ' ')
        ]
            .map(v => `"${String(v).replace(/"/g, '""')}"`)
            .join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `evenements_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

function exportMyEventsHTML() {
    const filtered = _getFilteredMyEvents();
    if (!filtered.length) {
        alert('Aucun événement à exporter.');
        return;
    }
    const rows = filtered
        .map(ev => {
            const internal = (ev.participants || [])
                .map(p => `${p.prenom || ''} ${p.nom || ''}`.trim())
                .filter(Boolean)
                .join(', ');
            const external = (ev.external_participants || [])
                .map(p => p.email || `${p.prenom || ''} ${p.nom || ''}`.trim())
                .filter(Boolean)
                .join(', ');
            let cfg = {};
            try {
                cfg = typeof ev.config === 'string' ? JSON.parse(ev.config || '{}') : ev.config || {};
            } catch (e) {
                cfg = {};
            }
            const badge = evtHasType(ev)
                ? `<span style="background:${cfg.bgColor || '#607d8b'};color:${cfg.textColor || '#fff'};padding:2px 8px;border-radius:4px;font-size:11px;">${evtEsc(evtShown(ev))}</span>`
                : '';
            return `<tr><td>${badge}${evtHasType(ev) ? ' ' + evtEsc(ev.type_long) : ''}</td><td>${evtEsc(ev.label || '')}</td><td>${ev.start_date || ''}</td><td>${ev.end_date || ''}</td><td>${ev.location || ''}</td><td>${internal}</td><td>${external}</td><td>${(ev.description || '').replace(/\n/g, '<br>')}</td></tr>`;
        })
        .join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Événements exportés</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}table{border-collapse:collapse;width:100%;}th{background:#1565c0;color:#fff;padding:8px;text-align:left;}td{border:1px solid #ddd;padding:6px;}tr:nth-child(even){background:#f5f5f5;}</style></head><body><h2>Événements — export du ${new Date().toLocaleDateString('fr-FR')}</h2><table><thead><tr><th>Type</th><th>Libellé</th><th>Date début</th><th>Date fin</th><th>Localisation</th><th>Participants internes</th><th>Participants externes</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `evenements_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
}

// Un événement correspond au libellé choisi dans le filtre (modèle d'événement) si son libellé est celui du modèle
// ou commence par lui (« CONGRES AFARM » pour « CONGRÈS »), ou si son type est celui du modèle (code du type)
function evMatchesTemplateLabel(ev, tplLabel) {
    const n = s =>
        (s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    const t = n(tplLabel);
    if (!t) return true;
    const l = n(ev.label);
    if (l === t || l.startsWith(t + ' ')) return true;
    const code = Object.keys(eventTemplates).find(k => n(eventTemplates[k].label) === t);
    const type = ev.type_id != null && typeof evtTypeById === 'function' ? evtTypeById(ev.type_id) : null;
    return !!(code && type && type.code === code);
}

function _getFilteredMyEvents() {
    const labelFilter = document.getElementById('myEventsLabelFilter')?.value || '';
    const locFilter = document.getElementById('myEventsLocFilter')?.value || '';
    const partFilterVal = document.getElementById('myEventsParticipantFilter')?.value.trim().toLowerCase() || '';
    const dateDebutFilter = document.getElementById('myEventsDateDebut')?.value || '';
    const dateFinFilter = document.getElementById('myEventsDateFin')?.value || '';
    const templateLabelsForFilter = Object.values(eventTemplates)
        .map(t => t.label)
        .filter(Boolean);
    return (myEvents || []).filter(ev => {
        if (labelFilter) {
            if (labelFilter === '__AUTRES__') {
                if (templateLabelsForFilter.some(tl => evMatchesTemplateLabel(ev, tl))) return false;
            } else if (!evMatchesTemplateLabel(ev, labelFilter)) return false;
        }
        if (locFilter && ev.location !== locFilter) return false;
        if (dateDebutFilter && ev.start_date < dateDebutFilter) return false;
        if (dateFinFilter && ev.end_date > dateFinFilter) return false;
        if (partFilterVal) {
            const normStr = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const q = normStr(partFilterVal);
            const inInternal = (ev.participants || []).some(p =>
                normStr(`${p.prenom || ''} ${p.nom || ''}`).includes(q)
            );
            const inExternal = (ev.external_participants || []).some(p =>
                normStr(p.email || `${p.prenom || ''} ${p.nom || ''}`).includes(q)
            );
            if (!inInternal && !inExternal) return false;
        }
        return true;
    });
}

// Afficher les événements sous forme d'arborescence Année > Mois
function renderMyEventsTable() {
    const container = document.getElementById('myEventsTableContainer');
    if (!container) return;

    if (myEvents.length === 0) {
        container.innerHTML =
            '<p style="color: #999; font-size: 12px; font-style: italic; text-align: center; padding: 20px;">Aucun événement personnalisé</p>';
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
    const _now = new Date();
    const currentYear = _now.getFullYear();
    const currentMonth = _now.getMonth();

    // Appliquer les filtres libellé, localisation, participant et dates
    const locFilterVal = (document.getElementById('myEventsLocFilter')?.value || '').toString();
    const partFilterVal = (document.getElementById('myEventsParticipantFilter')?.value || '').toLowerCase().trim();
    const _labelFilterVal = document.getElementById('myEventsLabelFilter')?.value || '';
    const dateDebutFilter = document.getElementById('myEventsDateDebut')?.value || '';
    const dateFinFilter = document.getElementById('myEventsDateFin')?.value || '';
    const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const templateLabelsForFilter = Object.values(eventTemplates)
        .map(t => t.label)
        .filter(Boolean);
    const filteredEvents = myEvents.filter(ev => {
        if (_labelFilterVal) {
            if (_labelFilterVal === '__AUTRES__') {
                if (templateLabelsForFilter.some(tl => evMatchesTemplateLabel(ev, tl))) return false;
            } else if (!evMatchesTemplateLabel(ev, _labelFilterVal)) return false;
        }
        if (locFilterVal && (ev.location_id || '').toString() !== locFilterVal) return false;
        if (partFilterVal) {
            const nq = normalize(partFilterVal);
            const internalMatch = (ev.participants || []).some(p =>
                normalize(`${p.prenom || ''} ${p.nom || ''}`).includes(nq)
            );
            const externalMatch = (ev.external_participants || []).some(
                p => normalize(`${p.prenom || ''} ${p.nom || ''}`).includes(nq) || normalize(p.email || '').includes(nq)
            );
            if (!internalMatch && !externalMatch) return false;
        }
        if (dateDebutFilter && ev.start_date < dateDebutFilter) return false;
        if (dateFinFilter && ev.end_date > dateFinFilter) return false;
        return true;
    });

    // Organiser par année > mois
    const byYear = {};
    filteredEvents.forEach(event => {
        const startDate = new Date(event.start_date);
        const year = startDate.getFullYear();
        const month = startDate.getMonth();

        if (!byYear[year]) byYear[year] = {};
        if (!byYear[year][month]) byYear[year][month] = [];
        byYear[year][month].push(event);
    });

    // Trier les années
    const sortedYears = Object.keys(byYear).sort((a, b) => {
        return myEventsSortYear === 'desc' ? b - a : a - b;
    });

    // Barre de tri et filtres — conserver les valeurs sélectionnées après re-render
    const locOptions = (allLocations || [])
        .map(
            l =>
                `<option value="${l.id}"${locFilterVal === l.id.toString() ? ' selected' : ''}>${l.libelle_court || l.libelle_long}</option>`
        )
        .join('');
    const labelFilterVal = document.getElementById('myEventsLabelFilter')?.value || '';
    // Liste fixe des templates (ordre d'affichage des boutons), + AUTRES
    const templateLabels = Object.values(eventTemplates)
        .map(t => t.label)
        .filter(Boolean);
    const templateLabelOptions =
        templateLabels
            .map(l => `<option value="${l}"${labelFilterVal === l ? ' selected' : ''}>${l}</option>`)
            .join('') +
        `<option value="__AUTRES__"${labelFilterVal === '__AUTRES__' ? ' selected' : ''}>— AUTRES —</option>`;
    let html = `<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 8px; align-items: flex-end;">
                <span style="font-size: 12px; color: #666; display: flex; align-items: center;">Trier / Filtrer par :</span>
                <button onclick="toggleMyEventsSortYear()" style="background: #ff9800; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    Année ${myEventsSortYear === 'desc' ? '▼ (récent → ancien)' : '▲ (ancien → récent)'}
                </button>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <label style="font-size:10px;color:#888;">Libellé</label>
                    <select id="myEventsLabelFilter" onchange="renderMyEventsTable()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;min-width:160px;">
                        <option value=""${!labelFilterVal ? ' selected' : ''}>— Tous —</option>
                        ${templateLabelOptions}
                    </select>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <label style="font-size:10px;color:#888;">Localisation</label>
                    <select id="myEventsLocFilter" onchange="renderMyEventsTable()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;min-width:160px;">
                        <option value=""${!locFilterVal ? ' selected' : ''}>— Toutes —</option>
                        ${locOptions}
                    </select>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <label style="font-size:10px;color:#888;">Participant</label>
                    <input type="text" id="myEventsParticipantFilter" list="myEventsParticipantList" placeholder="Nom ou prénom…" value="${partFilterVal.replace(/"/g, '&quot;')}" oninput="renderMyEventsTable()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;min-width:180px;">
                    <datalist id="myEventsParticipantList">
                        ${(users || [])
                            .map(u => {
                                const label = `${u.prenom || ''} ${u.nom || ''}`.trim();
                                return label ? `<option value="${label}">` : '';
                            })
                            .join('')}
                        ${[...new Set(myEvents.flatMap(ev => (ev.external_participants || []).map(p => (p.email || `${p.prenom || ''} ${p.nom || ''}`.trim()).trim()).filter(Boolean)))].map(name => `<option value="${name}">`).join('')}
                    </datalist>
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <label style="font-size:10px;color:#888;">Date début</label>
                    <input type="date" id="myEventsDateDebut" value="${dateDebutFilter}" onchange="renderMyEventsTable()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;">
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <label style="font-size:10px;color:#888;">Date fin</label>
                    <input type="date" id="myEventsDateFin" value="${dateFinFilter}" onchange="renderMyEventsTable()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px;">
                </div>
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <label style="font-size:10px;color:transparent;">_</label>
                    <div style="display:flex;gap:5px;">
                        <button onclick="exportMyEventsCSV()" title="Exporter les résultats filtrés en CSV" style="padding:4px 10px;background:#2e7d32;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">⬇ CSV</button>
                        <button onclick="exportMyEventsHTML()" title="Exporter les résultats filtrés en HTML" style="padding:4px 10px;background:#1565c0;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">⬇ HTML</button>
                    </div>
                </div>
            </div>`;

    html += '<div>';

    sortedYears.forEach(year => {
        // Trier les mois selon le tri de l'année (si année desc, mois desc aussi)
        const sortedMonths = Object.keys(byYear[year]).sort((a, b) => {
            return myEventsSortYear === 'desc' ? b - a : a - b;
        });

        // L'année en cours est ouverte par défaut
        const isCurrentYear = parseInt(year) === currentYear;
        const yearDisplay = isCurrentYear ? 'block' : 'none';
        const yearArrow = isCurrentYear ? '▼' : '▶';

        html += `<div style="margin-bottom: 10px;">
                    <div onclick="toggleMyEventsTreeNode(this)" style="cursor: pointer; padding: 10px; background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); border-radius: 6px; font-weight: bold; color: white; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <span class="tree-arrow">${yearArrow}</span> 📅 ${year}
                        <span style="font-size: 11px; font-weight: normal; margin-left: auto; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px;">
                            ${Object.values(byYear[year]).flat().length} événement(s)
                        </span>
                    </div>
                    <div class="tree-content" style="display: ${yearDisplay}; margin-left: 15px; margin-top: 8px;">`;

        sortedMonths.forEach(month => {
            const monthEvents = byYear[year][month];

            // Garder le mois ouvert si c'est celui qui vient d'être édité, ou si c'est le mois courant
            const isEditOpen =
                _myEventsEditOpenNode &&
                _myEventsEditOpenNode.year === parseInt(year) &&
                _myEventsEditOpenNode.month === parseInt(month);
            const isCurrentMonth = isCurrentYear && parseInt(month) === currentMonth;
            const monthDisplay = isEditOpen || isCurrentMonth ? 'block' : 'none';
            const monthArrow = isEditOpen || isCurrentMonth ? '▼' : '▶';
            const monthBg = isCurrentMonth
                ? 'linear-gradient(135deg, #f57c00 0%, #e65100 100%)'
                : 'linear-gradient(135deg, #ffb74d 0%, #ffa726 100%)';
            const monthColor = isCurrentMonth ? 'white' : '#333';

            html += `<div style="margin-bottom: 8px;">
                        <div onclick="toggleMyEventsTreeNode(this)" style="cursor: pointer; padding: 8px 12px; background: ${monthBg}; border-radius: 5px; display: flex; align-items: center; gap: 8px; color: ${monthColor}; ${isCurrentMonth ? 'box-shadow: 0 2px 6px rgba(230,81,0,0.4);' : ''}">
                            <span class="tree-arrow">${monthArrow}</span> ${monthNames[month]}
                            <span style="font-size: 10px; margin-left: auto; background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 8px;">
                                ${monthEvents.length} événement(s)
                            </span>
                        </div>
                        <div class="tree-content" style="display: ${monthDisplay}; margin-left: 15px; margin-top: 5px;">`;

            // Trier les événements par date de début
            monthEvents.sort((a, b) => {
                const diff = new Date(a.start_date) - new Date(b.start_date);
                return myEventsSortYear === 'desc' ? -diff : diff;
            });

            monthEvents.forEach(event => {
                html += buildMyEventItem(event);
            });

            html += `</div></div>`;
        });

        html += `</div></div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Construire un item d'événement
function buildMyEventItem(event) {
    const config = event.config ? (typeof event.config === 'string' ? JSON.parse(event.config) : event.config) : {};
    const startDate = new Date(event.start_date);
    const endDate = new Date(event.end_date);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const startStr = startDate.toLocaleDateString('fr-FR');
    const endStr = endDate.toLocaleDateString('fr-FR');
    const dateDisplay = startStr === endStr ? startStr : `${startStr} - ${endStr}`;

    // Nom du créateur (toujours visible)
    const creatorFullName =
        ((event.creator_prenom || '') + ' ' + (event.creator_nom || '').toUpperCase()).trim() || 'Système';
    // « Créé le JJ/MM/AAAA HH:MM par [créateur] » (date de création enregistrée en UTC, affichée à l'heure locale)
    let createdTxt = '';
    if (event.created_at) {
        const cd = new Date(String(event.created_at).replace(' ', 'T') + 'Z');
        if (!isNaN(cd)) {
            const z = n => String(n).padStart(2, '0');
            createdTxt = `Créé le ${z(cd.getDate())}/${z(cd.getMonth() + 1)}/${cd.getFullYear()} ${z(cd.getHours())}:${z(cd.getMinutes())} par `;
        }
    }
    if (!createdTxt) createdTxt = 'Créé par ';
    const creatorInfo =
        event.creator_prenom || event.creator_nom
            ? `<span title="${createdTxt}${creatorFullName}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#777;">${createdTxt}<span style="width:20px;height:20px;border-radius:50%;background:${getParticipantColor(creatorFullName)};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;">${getParticipantInitials(event.creator_prenom, event.creator_nom)}</span>${creatorFullName}</span>`
            : `<span style="font-size: 10px; color: #888;">${uiIcon('user', 13, 'margin-right:4px;')}${createdTxt}${creatorFullName}</span>`;

    // Participants
    let participantsHtml = '';
    const allParts = [
        ...(event.participants || []).map(p => ({ external: false, nom: p.nom, prenom: p.prenom, email: p.email })),
        ...(event.external_participants || []).map(p => ({
            external: true,
            nom: p.nom,
            prenom: p.prenom,
            email: p.email
        }))
    ];
    if (allParts.length > 0) {
        const chips = allParts
            .map(p => {
                const name = p.external
                    ? p.email || `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || '?'
                    : `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
                const initials = p.external ? '✉' : getParticipantInitials(p.prenom, p.nom);
                const color = p.external ? '#78909c' : getParticipantColor(name);
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

    // Préfixe localisation
    const locMy = event.location_id
        ? allLocations.find(l => l.id === event.location_id)?.libelle_court || 'NON DÉFINI'
        : null;
    const myEventShown = evtShown(event);
    const myEventDisplayLabel = locMy ? `${locMy} | ${myEventShown}` : myEventShown;

    return `<div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 6px; border-left: 4px solid ${config.borderColor || '#fbc02d'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                            <span style="display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; 
                                background-color: ${config.bgColor || '#ffeb3b'}; 
                                color: ${config.textColor || '#000'}; 
                                border: 2px solid ${config.borderColor || '#fbc02d'};">${evtHasType(event) ? evtIconFor(event) : eventIconHtml(event.label)}${myEventDisplayLabel}</span>
                            ${evtHasType(event) && event.label && event.label !== myEventShown ? `<span style="font-size:12px;color:#444;" title="Type : ${evtEsc(event.type_long)}">${evtEsc(event.label)}</span>` : ''}
                            ${creatorInfo}
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
                    <div style="display: flex; gap: 5px; flex-wrap: wrap; align-items: center;">
                        ${
                            currentUser &&
                            currentUser.activeProfile === 'expert' &&
                            event.participants &&
                            !event.participants.some(p => p.id === currentUser.id)
                                ? `<button onclick="joinEventAsParticipant(${event.id})" style="background: #27ae60; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Me déclarer participant">${uiIcon('hand', 14, 'margin-right:5px;')}Participer</button>`
                                : ''
                        }
                        <button type="button" class="icon-btn" onclick="editMyEvent(${event.id})" style="background:#ff9800;" title="Modifier l'événement" aria-label="Modifier l'événement">${uiIcon('pencil', 16, 'margin:0;vertical-align:middle;')}</button>
                        ${currentUser && currentUser.activeProfile === 'admin' ? `<button type="button" class="icon-btn" onclick="deleteMyEvent(${event.id})" style="background:#e53935;" title="Supprimer l'événement" aria-label="Supprimer l'événement">${uiIcon('trash', 16, 'margin:0;vertical-align:middle;')}</button>` : ''}
                    </div>
                </div>
            </div>`;
}

// Toggle pour l'arborescence des événements
function toggleMyEventsTreeNode(element) {
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

// Ajouter un événement
async function addMyEvent() {
    const startDate = document.getElementById('myEventStartDate').value;
    const endDate = document.getElementById('myEventEndDate').value;
    const label = document.getElementById('myEventLabel').value.trim();
    const bgColor = document.getElementById('myEventBgColor').value;
    const textColor = document.getElementById('myEventTextColor').value;
    const borderColor = document.getElementById('myEventBorderColor').value;
    const location_id = document.getElementById('myEventLocationId')?.value || null;

    const type_id = document.getElementById('myEventTypeId')?.value || '';
    if (!type_id) {
        alert("Veuillez choisir un type d'événement");
        return;
    }
    if (!startDate) {
        alert('Veuillez sélectionner une date de début');
        return;
    }
    if (!label) {
        alert('Veuillez saisir un libellé');
        return;
    }

    const finalEndDate = endDate || startDate;
    // Récupérer la période seulement si même jour
    const isSameDay = finalEndDate === startDate;
    const period = isSameDay ? document.querySelector('input[name="myEventPeriod"]:checked')?.value || 'FULL' : 'FULL';

    const needs_resources = document.getElementById('myEventNeedsResources')?.checked || false;
    const resources_count = parseInt(document.getElementById('myEventResourcesCount')?.value || '1');
    const notifySelect = document.getElementById('myEventNotifyUsers');
    const notify_user_ids = notifySelect ? Array.from(notifySelect.selectedOptions).map(o => parseInt(o.value)) : [];
    const grist = document.getElementById('myEventGrist')?.checked || false;

    try {
        const response = await fetch(`${API_URL}/my-custom-events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                startDate,
                endDate: finalEndDate,
                label,
                type_id: Number(type_id),
                config: { bgColor, textColor, borderColor },
                participants: myEventSelectedParticipants.filter(p => !p.external).map(p => p.id),
                external_participants: myEventSelectedParticipants
                    .filter(p => p.external)
                    .map(p => ({ nom: p.nom, prenom: p.prenom, email: p.email })),
                period,
                location_id: location_id || null,
                needs_resources,
                resources_count,
                notify_user_ids,
                grist
            })
        });

        if (response.ok) {
            resetMyEventForm();
            await loadMyEvents();
            await loadSpecialDates();
            setTimeout(() => {
                updateGantt();
            }, 100);
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur ajout événement:', error);
        alert('Erreur: ' + error.message);
    }
}

// Variable pour stocker l'ID de l'événement en cours d'édition
let editingMyEventId = null;

// Éditer un événement
async function editMyEvent(eventId) {
    const event = myEvents.find(e => e.id === eventId);
    if (!event) return;

    const config = event.config ? (typeof event.config === 'string' ? JSON.parse(event.config) : event.config) : {};

    document.getElementById('myEventStartDate').value = event.start_date;
    document.getElementById('myEventEndDate').value = event.end_date;
    document.getElementById('myEventLabel').value = event.label;
    document.getElementById('myEventBgColor').value = config.bgColor || '#ffeb3b';
    document.getElementById('myEventTextColor').value = config.textColor || '#000000';
    document.getElementById('myEventBorderColor').value = config.borderColor || '#fbc02d';
    if (typeof evtFillTypeSelect === 'function') evtFillTypeSelect(event.type_id || '');
    updateMyEventPreview();

    // Pré-remplir la période
    const period = event.period || 'FULL';
    const isSameDay = event.start_date === event.end_date;
    if (isSameDay) {
        document.getElementById('myEventPeriodSection').style.display = 'block';
        const radio = document.querySelector(`input[name="myEventPeriod"][value="${period}"]`);
        if (radio) radio.checked = true;
    } else {
        document.getElementById('myEventPeriodSection').style.display = 'none';
        document.getElementById('myEventPeriodFull').checked = true;
    }

    // Pré-remplir la localisation
    const locSel = document.getElementById('myEventLocationId');
    if (locSel) locSel.value = event.location_id || '';

    // Pré-remplir GRIST
    const gristCb = document.getElementById('myEventGrist');
    if (gristCb) gristCb.checked = !!event.grist;

    // Charger les participants existants
    myEventSelectedParticipants = [
        ...(event.participants || []).map(p => ({ id: p.user_id, nom: p.nom, prenom: p.prenom, email: p.email })),
        ...(event.external_participants || []).map(p => ({
            external: true,
            nom: p.nom,
            prenom: p.prenom,
            email: p.email
        }))
    ];
    renderMyEventParticipantTags();

    editingMyEventId = eventId;

    // Mémoriser l'année/mois pour garder l'accordéon ouvert après sauvegarde
    const _editDate = new Date(event.start_date);
    _myEventsEditOpenNode = { year: _editDate.getFullYear(), month: _editDate.getMonth() };

    // Gestion du sélecteur de créateur (uniquement pour les admins)
    const creatorSection = document.getElementById('myEventCreatorSection');
    const creatorSelect = document.getElementById('myEventCreator');

    if (currentUser && currentUser.activeProfile === 'admin') {
        creatorSection.style.display = 'block';
        creatorSelect.innerHTML = '<option value="">-- Sélectionner un créateur --</option>';
        const allUsers = [...users].sort((a, b) => {
            const nameA = `${a.nom || ''} ${a.prenom || ''}`.toLowerCase();
            const nameB = `${b.nom || ''} ${b.prenom || ''}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });
        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.nom || ''} ${user.prenom || ''}`.trim() || user.username;
            if (user.id === event.created_by) option.selected = true;
            creatorSelect.appendChild(option);
        });
    } else {
        creatorSection.style.display = 'none';
    }

    const addBtn = document.getElementById('myEventActionBtn');
    if (addBtn) {
        addBtn.textContent = '💾 Modifier';
        addBtn.onclick = saveMyEventEdit;
    }
    // Déplier le formulaire si replié
    const formBody = document.getElementById('myEventFormBody');
    const formIcon = document.getElementById('myEventFormIcon');
    if (formBody && formBody.style.display === 'none') {
        formBody.style.display = 'block';
        if (formIcon) formIcon.textContent = '▼';
    }
    // Scroll vers le formulaire
    formBody?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Sauvegarder la modification
async function saveMyEventEdit() {
    if (!editingMyEventId) return;

    const startDate = document.getElementById('myEventStartDate').value;
    const endDate = document.getElementById('myEventEndDate').value;
    const label = document.getElementById('myEventLabel').value.trim();
    const bgColor = document.getElementById('myEventBgColor').value;
    const textColor = document.getElementById('myEventTextColor').value;
    const borderColor = document.getElementById('myEventBorderColor').value;
    const location_id = document.getElementById('myEventLocationId')?.value || null;
    const grist = document.getElementById('myEventGrist')?.checked || false;

    if (!startDate || !label) {
        alert('Date de début et libellé requis');
        return;
    }

    const finalEndDate = endDate || startDate;
    const isSameDay = finalEndDate === startDate;
    const period = isSameDay ? document.querySelector('input[name="myEventPeriod"]:checked')?.value || 'FULL' : 'FULL';

    const data = {
        startDate,
        endDate: finalEndDate,
        label,
        type_id: document.getElementById('myEventTypeId')?.value
            ? Number(document.getElementById('myEventTypeId').value)
            : undefined,
        config: { bgColor, textColor, borderColor },
        participants: myEventSelectedParticipants.filter(p => !p.external).map(p => p.id),
        external_participants: myEventSelectedParticipants
            .filter(p => p.external)
            .map(p => ({ nom: p.nom, prenom: p.prenom, email: p.email })),
        period,
        location_id: location_id || null,
        grist
    };

    // Si admin, inclure le créateur sélectionné
    let useAdminRoute = false;
    if (currentUser && currentUser.activeProfile === 'admin') {
        const creatorSelect = document.getElementById('myEventCreator');
        if (creatorSelect && creatorSelect.value) {
            data.createdBy = parseInt(creatorSelect.value);
            useAdminRoute = true; // Utiliser la route admin pour changer le créateur
        }
    }

    try {
        // Utiliser la route admin si on change le créateur, sinon la route my-custom-events
        const endpoint = useAdminRoute
            ? `${API_URL}/custom-events/${editingMyEventId}`
            : `${API_URL}/my-custom-events/${editingMyEventId}`;

        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (response.ok) {
            editingMyEventId = null;

            // Remettre le bouton "Ajouter"
            const addBtn = document.getElementById('myEventActionBtn');
            if (addBtn) {
                addBtn.textContent = '➕ Ajouter';
                addBtn.onclick = addMyEvent;
            }

            // Cacher le sélecteur de créateur
            document.getElementById('myEventCreatorSection').style.display = 'none';

            resetMyEventForm();
            await loadMyEvents();
            await loadSpecialDates();
            setTimeout(() => {
                updateGantt();
                console.log('📅 Gantt mis à jour après modification événement');
            }, 100);
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur modification événement:', error);
        alert('Erreur: ' + error.message);
    }
}

// Supprimer un événement
async function deleteMyEvent(eventId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) return;

    try {
        const response = await fetch(`${API_URL}/my-custom-events/${eventId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            await loadMyEvents();
            await loadSpecialDates();
            setTimeout(() => {
                updateGantt();
                console.log('📅 Gantt mis à jour après suppression événement');
            }, 100);
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur suppression événement:', error);
        alert('Erreur: ' + error.message);
    }
}
