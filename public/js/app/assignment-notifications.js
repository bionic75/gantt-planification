// Application principale : assignment-notifications
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES NOTIFICATIONS D'AFFECTATION ==========

// Générer un ID de session unique pour cette connexion
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Tracker une nouvelle affectation
// Compare avec l'état initial de la session pour éviter les notifications pour des retours à l'état d'origine
function trackAssignment(resourceId, dateKey, period, activity, location) {
    // Trouver l'expert associé à cette ressource
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    // Trouver l'utilisateur expert correspondant à cette ressource
    const expert = users.find(u => u.resource_id === resourceId && u.is_expert);
    if (!expert) return;

    const newActivityInt = parseInt(activity);

    // Récupérer l'état initial COMPLET (disponibilité + activité) au début de la session
    const actKey = `${resourceId}_activity_${dateKey}_${period}`;
    const availKey = `${resourceId}_available_${dateKey}_${period}`;
    const locKey = `${resourceId}_localisation_${dateKey}_${period}`;

    const initialActivity = initialScheduleState[actKey] || '1';
    const initialActivityInt = parseInt(initialActivity);
    const initialAvailability = initialScheduleState[availKey] || '1';
    const initialAvailabilityInt = parseInt(initialAvailability);
    const initialLocation = initialScheduleState[locKey] || '-';

    // Récupérer la disponibilité actuelle
    const currentAvailability = scheduleData[availKey] || '1';
    const currentAvailabilityInt = parseInt(currentAvailability);

    console.log(`📊 trackAssignment: ${dateKey} ${period}`);
    console.log(`   Initial: Dispo=${initialAvailabilityInt}, Act=${initialActivityInt}, Loc=${initialLocation}`);
    console.log(`   Actuel:  Dispo=${currentAvailabilityInt}, Act=${newActivityInt}, Loc=${location || '-'}`);

    // L'état initial avait-il une vraie affectation (>= 3) ?
    const initialHadAssignment = initialActivityInt >= 3;
    // Le nouvel état a-t-il une vraie affectation (>= 3) ?
    const newHasAssignment = newActivityInt >= 3;

    // Comparer l'état COMPLET : si on revient exactement à l'état initial
    const isBackToInitialState =
        currentAvailabilityInt === initialAvailabilityInt && newActivityInt === initialActivityInt;

    // Labels d'activités
    const activityLabelsMap = {
        3: 'SAMU (Déploiement)',
        4: 'SAMU (Dev. usages)',
        5: 'ANS (Déploiement)',
        6: 'ANS (Dev. usages)',
        7: 'Qualification',
        8: 'Divers'
    };

    const activityLabelsMapEmoji = {
        3: '📞 SAMU (Déploiement)',
        4: '📞 SAMU (Dev. usages)',
        5: '📄 ANS (Déploiement)',
        6: '👨‍🏫 ANS (Dev. usages)',
        7: '☑️ Qualification',
        8: '📖 Divers'
    };

    // CAS 1: Retour à l'état initial exact → retirer de la liste
    if (isBackToInitialState) {
        if (pendingAssignments[resourceId]) {
            const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
                a => a.date === dateKey && a.period === period
            );

            if (existingIndex >= 0) {
                pendingAssignments[resourceId].assignments.splice(existingIndex, 1);
                console.log(`↩️ Retour à l'état initial complet: ${dateKey} ${period} - Affectation retirée`);

                if (pendingAssignments[resourceId].assignments.length === 0) {
                    delete pendingAssignments[resourceId];
                    console.log(`🗑️ Expert retiré de la liste: ${resource.prenom} ${resource.nom}`);
                }

                updatePendingEmailBadge();
            }
        }
        return;
    }

    // CAS 2: L'état initial avait une affectation ET on passe à pas d'affectation → SUPPRESSION
    if (initialHadAssignment && !newHasAssignment) {
        // C'est une SUPPRESSION : on doit tracker pour envoyer un email d'annulation
        if (!pendingAssignments[resourceId]) {
            pendingAssignments[resourceId] = {
                expertId: expert.id,
                expertEmail: expert.email,
                expertNom: expert.nom,
                expertPrenom: expert.prenom,
                resourceNom: resource.nom,
                resourcePrenom: resource.prenom,
                assignments: []
            };
        }

        // Retirer toute entrée précédente pour ce créneau
        const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
            a => a.date === dateKey && a.period === period
        );
        if (existingIndex >= 0) {
            pendingAssignments[resourceId].assignments.splice(existingIndex, 1);
        }

        // Ajouter l'entrée de suppression
        pendingAssignments[resourceId].assignments.push({
            date: dateKey,
            period: period,
            activity: activityLabelsMapEmoji[String(initialActivityInt)] || 'Affectation',
            activityCode: String(initialActivityInt),
            location: initialLocation || '-',
            actionType: 'deleted',
            oldActivity: activityLabelsMap[String(initialActivityInt)] || 'Affectation',
            oldActivityCode: String(initialActivityInt),
            oldLocation: initialLocation || '-'
        });

        console.log(`🗑️ Suppression trackée: ${dateKey} ${period} - ${activityLabelsMap[String(initialActivityInt)]}`);
        updatePendingEmailBadge();
        return;
    }

    // CAS 3: Le nouvel état n'est pas une vraie affectation (< 3) ET l'initial n'en avait pas non plus
    if (!newHasAssignment && !initialHadAssignment) {
        if (pendingAssignments[resourceId]) {
            const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
                a => a.date === dateKey && a.period === period
            );

            if (existingIndex >= 0) {
                pendingAssignments[resourceId].assignments.splice(existingIndex, 1);
                console.log(`🗑️ Affectation retirée (pas d'affectation): ${dateKey} ${period}`);

                if (pendingAssignments[resourceId].assignments.length === 0) {
                    delete pendingAssignments[resourceId];
                }

                updatePendingEmailBadge();
            }
        }
        return;
    }

    // CAS 4: C'est une vraie affectation (>= 3)
    // Déterminer si c'est nouveau ou modifié
    const actionType = initialHadAssignment ? 'modified' : 'new';

    if (!pendingAssignments[resourceId]) {
        pendingAssignments[resourceId] = {
            expertId: expert.id,
            expertEmail: expert.email,
            expertNom: expert.nom,
            expertPrenom: expert.prenom,
            resourceNom: resource.nom,
            resourcePrenom: resource.prenom,
            assignments: []
        };
    }

    // Vérifier si une affectation existe déjà pour cette demi-journée
    const existingIndex = pendingAssignments[resourceId].assignments.findIndex(
        a => a.date === dateKey && a.period === period
    );

    const newAssignment = {
        date: dateKey,
        period: period,
        activity: activityLabelsMapEmoji[activity] || activity,
        activityCode: activity,
        location: location || '-',
        actionType: actionType,
        // Infos de l'ancienne affectation (pour modifications)
        oldActivity: initialHadAssignment
            ? activityLabelsMap[String(initialActivityInt)] || String(initialActivityInt)
            : null,
        oldActivityCode: initialHadAssignment ? String(initialActivityInt) : null,
        oldLocation: initialHadAssignment ? initialLocation || '-' : null,
        isModification: initialHadAssignment
    };

    if (existingIndex >= 0) {
        pendingAssignments[resourceId].assignments[existingIndex] = newAssignment;
    } else {
        pendingAssignments[resourceId].assignments.push(newAssignment);
    }

    console.log(`➕ Affectation ajoutée: ${dateKey} ${period} - ${activityLabelsMapEmoji[activity]} (${actionType})`);

    // Mettre à jour le badge du bouton d'envoi d'email
    updatePendingEmailBadge();
}

// Mettre à jour le badge du bouton d'envoi d'email
function updatePendingEmailBadge() {
    const badge = document.getElementById('pendingEmailBadge');
    const btn = document.getElementById('sendEmailBtn');

    if (!badge || !btn) return;

    // Compter le nombre total d'affectations en attente par type
    let totalNew = 0,
        totalModified = 0,
        totalDeleted = 0;
    for (const data of Object.values(pendingAssignments)) {
        data.assignments.forEach(a => {
            if (a.actionType === 'deleted') totalDeleted++;
            else if (a.actionType === 'modified') totalModified++;
            else totalNew++;
        });
    }

    const totalAssignments = totalNew + totalModified + totalDeleted;

    if (totalAssignments > 0) {
        badge.textContent = totalAssignments;
        badge.style.display = 'flex';
        // Colorer le badge selon les types
        if (totalDeleted > 0 && totalNew === 0 && totalModified === 0) {
            badge.style.backgroundColor = '#D60B51'; // Rouge pour suppressions uniquement
        } else if (totalModified > 0 && totalNew === 0 && totalDeleted === 0) {
            badge.style.backgroundColor = '#ff9800'; // Orange pour modifications uniquement
        } else {
            badge.style.backgroundColor = '#e74c3c'; // Rouge par défaut
        }
    } else {
        badge.style.display = 'none';
    }
}

// Ouvrir la modal d'envoi d'email
function openSendEmailModal() {
    const expertCount = Object.keys(pendingAssignments).length;

    if (expertCount === 0) {
        alert("Aucune modification d'affectation à envoyer.");
        return;
    }

    // Construire le contenu de la modal
    let html = '';
    let totalNew = 0,
        totalModified = 0,
        totalDeleted = 0;

    for (const [resourceId, data] of Object.entries(pendingAssignments)) {
        const assignmentCount = data.assignments.length;
        const newCount = data.assignments.filter(a => a.actionType === 'new' || !a.actionType).length;
        const modCount = data.assignments.filter(a => a.actionType === 'modified').length;
        const delCount = data.assignments.filter(a => a.actionType === 'deleted').length;
        totalNew += newCount;
        totalModified += modCount;
        totalDeleted += delCount;

        html += `<div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #27ae60;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">`;
        html += `<div>`;
        html += `<strong style="font-size: 14px; color: #2c3e50;">${data.expertPrenom} ${data.expertNom}</strong>`;
        html += `<br><span style="font-size: 12px; color: #7f8c8d;">${data.expertEmail || "Pas d'email"}</span>`;
        html += `<br><span style="font-size: 11px;">`;
        if (newCount > 0) html += `<span style="color: #27ae60;">📅 ${newCount} nouvelle(s)</span> `;
        if (modCount > 0) html += `<span style="color: #ff9800;">🔄 ${modCount} modification(s)</span> `;
        if (delCount > 0) html += `<span style="color: #D60B51;">❌ ${delCount} suppression(s)</span>`;
        html += `</span>`;
        html += `</div>`;
        html += `<label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">`;
        html += `<input type="checkbox" id="sendTo_${resourceId}" checked style="width: 18px; height: 18px;">`;
        html += `<span style="font-size: 12px;">Notifier</span>`;
        html += `</label>`;
        html += `</div>`;

        html += `<table style="width: 100%; font-size: 11px; border-collapse: collapse;">`;
        html += `<thead><tr style="background: #ecf0f1;">`;
        html += `<th style="padding: 5px; text-align: center; width: 30px;">Type</th>`;
        html += `<th style="padding: 5px; text-align: left;">Date</th>`;
        html += `<th style="padding: 5px; text-align: center;">Période</th>`;
        html += `<th style="padding: 5px; text-align: left;">Affectation</th>`;
        html += `<th style="padding: 5px; text-align: left;">Localisation</th>`;
        html += `</tr></thead><tbody>`;

        // Trier les affectations par date
        const sortedAssignments = [...data.assignments].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.period === 'AM' ? -1 : 1;
        });

        sortedAssignments.forEach(assignment => {
            const dateObj = new Date(assignment.date);
            const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
            const periodStr = assignment.period === 'AM' ? 'Matin' : 'Après-midi';

            let typeIcon = '📅';
            let rowBg = 'white';
            if (assignment.actionType === 'modified') {
                typeIcon = '🔄';
                rowBg = '#fff8e1';
            }
            if (assignment.actionType === 'deleted') {
                typeIcon = '❌';
                rowBg = '#fde8e8';
            }

            html += `<tr style="border-bottom: 1px solid #ddd; background: ${rowBg};">`;
            html += `<td style="padding: 5px; text-align: center;" title="${assignment.actionType === 'deleted' ? 'Suppression' : assignment.actionType === 'modified' ? 'Modification' : 'Nouvelle'}">${typeIcon}</td>`;
            html += `<td style="padding: 5px;">${dateStr}</td>`;
            html += `<td style="padding: 5px; text-align: center;">${periodStr}</td>`;
            html += `<td style="padding: 5px;">${assignment.activity}`;
            if (assignment.actionType === 'modified' && assignment.oldActivity) {
                html += `<br><span style="font-size: 10px; color: #999; text-decoration: line-through;">Ancien: ${assignment.oldActivity}</span>`;
            }
            html += `</td>`;
            html += `<td style="padding: 5px;">${assignment.location || '-'}`;
            if (
                assignment.actionType === 'modified' &&
                assignment.oldLocation &&
                assignment.oldLocation !== assignment.location
            ) {
                html += `<br><span style="font-size: 10px; color: #999; text-decoration: line-through;">${assignment.oldLocation}</span>`;
            }
            html += `</td>`;
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        html += `</div>`;
    }

    // Résumé
    let summaryParts = [];
    if (totalNew > 0) summaryParts.push(`${totalNew} nouvelle(s)`);
    if (totalModified > 0) summaryParts.push(`${totalModified} modification(s)`);
    if (totalDeleted > 0) summaryParts.push(`${totalDeleted} suppression(s)`);

    // Afficher la modal
    document.getElementById('sendEmailModalContent').innerHTML = html;
    document.getElementById('sendEmailModalSummary').textContent =
        `${expertCount} expert(s) - ${summaryParts.join(', ')}`;
    document.getElementById('sendEmailModalContainer').style.display = 'block';
}

// Fermer la modal d'envoi d'email
function closeSendEmailModal() {
    document.getElementById('sendEmailModalContainer').style.display = 'none';
}

// Confirmer et envoyer les emails
async function confirmSendEmails() {
    const assignmentsToSend = [];

    for (const [resourceId, data] of Object.entries(pendingAssignments)) {
        const checkbox = document.getElementById(`sendTo_${resourceId}`);
        if (checkbox && checkbox.checked) {
            assignmentsToSend.push({
                resourceId: parseInt(resourceId),
                email: data.expertEmail,
                expertNom: data.expertNom || data.resourceNom,
                expertPrenom: data.expertPrenom || data.resourcePrenom,
                assignments: data.assignments.map(a => ({
                    date: a.date,
                    period: a.period,
                    activity: a.activity,
                    activityCode: a.activityCode,
                    location: a.location,
                    actionType: a.actionType || 'new',
                    oldActivity: a.oldActivity || null,
                    oldActivityCode: a.oldActivityCode || null,
                    oldLocation: a.oldLocation || null
                }))
            });
        }
    }

    if (assignmentsToSend.length === 0) {
        alert('Aucun expert sélectionné pour la notification.');
        return;
    }

    closeSendEmailModal();

    const totalItems = assignmentsToSend.reduce((sum, a) => sum + a.assignments.length, 0);
    const senderName = currentUser ? `${currentUser.prenom} ${currentUser.nom}` : 'Système';
    const senderEmail = currentUser ? currentUser.email : null;

    try {
        const response = await fetch(`${API_URL}/send-assignment-emails`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ assignments: assignmentsToSend, senderName, senderEmail, sessionId })
        });

        if (response.status === 502 || response.status === 504) {
            assignmentsToSend.forEach(sent => {
                delete pendingAssignments[sent.resourceId];
            });
            updatePendingEmailBadge();
            return;
        }

        const data = await response.json();
        if (data.success) {
            assignmentsToSend.forEach(sent => {
                delete pendingAssignments[sent.resourceId];
            });
            updatePendingEmailBadge();
            if (data.batchId) {
                startBatchPolling(data.batchId, data.enqueued || totalItems, assignmentsToSend);
            }
        }
    } catch (error) {
        console.error('❌ Erreur réseau:', error);
        assignmentsToSend.forEach(sent => {
            delete pendingAssignments[sent.resourceId];
        });
        updatePendingEmailBadge();
    }
}

// Polling du batch d'envoi → toast de confirmation quand terminé
let batchPollingInterval = null;

function startBatchPolling(batchId, totalEmails, assignmentsToSend) {
    if (batchPollingInterval) clearInterval(batchPollingInterval);

    const expertNames = [
        ...new Set(assignmentsToSend.map(a => `${a.expertPrenom || ''} ${a.expertNom || ''}`.trim()).filter(Boolean))
    ];

    const poll = async () => {
        try {
            const response = await fetch(`${API_URL}/email-queue/status/${batchId}`, { credentials: 'include' });
            if (!response.ok) return;
            const data = await response.json();

            if (data.isComplete) {
                clearInterval(batchPollingInterval);
                batchPollingInterval = null;
                showBatchDoneToast(data.sent || 0, data.failed || 0, totalEmails, expertNames);
            }
        } catch (e) {
            console.error('Erreur polling batch:', e);
        }
    };

    // Premier poll après 15s, puis toutes les 10s
    setTimeout(() => {
        poll();
        batchPollingInterval = setInterval(poll, 10000);
    }, 15000);
}

function showBatchDoneToast(sent, failed, total, expertNames) {
    // Supprimer un éventuel toast précédent
    const existing = document.getElementById('batchDoneToast');
    if (existing) existing.remove();

    const isSuccess = failed === 0;
    const color = isSuccess ? '#27ae60' : '#e67e22';
    const icon = isSuccess ? '✅' : '⚠️';
    const title = isSuccess
        ? `Invitations envoyées (${sent}/${total})`
        : `Invitations partiellement envoyées (${sent}/${total})`;
    const detail = expertNames.length > 0 ? expertNames.join(', ') : `${total} email(s)`;

    const toast = document.createElement('div');
    toast.id = 'batchDoneToast';
    toast.style.cssText = `
                position: fixed; bottom: 24px; right: 24px;
                min-width: 320px; max-width: 420px;
                background: white; border-radius: 10px;
                box-shadow: 0 6px 24px rgba(0,0,0,0.18);
                border-left: 5px solid ${color};
                z-index: 10050; overflow: hidden;
                animation: slideInRight 0.3s ease;
            `;
    toast.innerHTML = `
                <style>
                    @keyframes slideInRight {
                        from { transform: translateX(120%); opacity: 0; }
                        to   { transform: translateX(0);    opacity: 1; }
                    }
                </style>
                <div style="padding: 16px 18px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                <span style="font-size:20px;">${icon}</span>
                                <strong style="font-size:14px; color:#2c3e50;">${title}</strong>
                            </div>
                            <div style="font-size:12px; color:#7f8c8d;">${detail}</div>
                            ${failed > 0 ? `<div style="font-size:12px; color:#e74c3c; margin-top:4px;">⚠️ ${failed} envoi(s) échoué(s) — voir logs serveur</div>` : ''}
                        </div>
                        <button onclick="document.getElementById('batchDoneToast').remove()"
                            style="background:none; border:none; font-size:18px; cursor:pointer; color:#bbb; padding:0; flex-shrink:0;">✕</button>
                    </div>
                </div>
            `;
    document.body.appendChild(toast);

    // Disparaît automatiquement après 12s
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 12000);
}

// Toast non-bloquant avec barre de progression temps réel
let emailPollingInterval = null;

function showEmailProgressToast(totalEmails) {
    // Supprimer un toast existant
    const existing = document.getElementById('emailProgressToast');
    if (existing) existing.remove();
    if (emailPollingInterval) clearInterval(emailPollingInterval);

    const toast = document.createElement('div');
    toast.id = 'emailProgressToast';
    toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 380px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.15);
                z-index: 10001;
                overflow: hidden;
                border: 1px solid #e0e0e0;
                transition: opacity 0.3s ease;
            `;

    toast.innerHTML = `
                <div style="padding: 16px 18px 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span id="emailToastIcon" style="font-size: 20px;">📤</span>
                            <strong id="emailToastTitle" style="font-size: 14px; color: #333;">Envoi des invitations...</strong>
                        </div>
                        <button onclick="closeEmailProgressToast()" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #999; padding: 0 4px;">✕</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-bottom: 6px;">
                        <span id="emailToastStatus">Envoi en cours de ${totalEmails} invitation(s)...</span>
                        <span id="emailToastPercent"></span>
                    </div>
                    <div style="height: 6px; background: #e8e8e8; border-radius: 3px; overflow: hidden;">
                        <div id="emailToastBar" style="height: 100%; width: 30%; background: linear-gradient(90deg, #4CAF50, #66BB6A); border-radius: 3px; transition: width 0.4s ease; animation: progressPulse 1.5s ease-in-out infinite;"></div>
                    </div>
                    <div id="emailToastDetails" style="margin-top: 8px; font-size: 11px; color: #999;"></div>
                </div>
                <style>
                    @keyframes progressPulse {
                        0%, 100% { opacity: 1; width: 30%; }
                        50% { opacity: 0.7; width: 60%; }
                    }
                </style>
            `;

    document.body.appendChild(toast);
}

// Mettre à jour le toast en succès
function updateEmailToastSuccess(sent, failed, optimistic = false) {
    const icon = document.getElementById('emailToastIcon');
    const title = document.getElementById('emailToastTitle');
    const status = document.getElementById('emailToastStatus');
    const bar = document.getElementById('emailToastBar');
    const details = document.getElementById('emailToastDetails');

    if (!icon) return;

    bar.style.animation = 'none';
    bar.style.width = '100%';

    if (optimistic) {
        // Le serveur n'a pas confirmé mais a probablement reçu la requête
        icon.textContent = '📨';
        title.textContent = "Invitations en cours d'envoi";
        title.style.color = '#2196f3';
        bar.style.background = 'linear-gradient(90deg, #2196f3, #42a5f5)';
        status.textContent = `${sent} invitation(s) prises en charge par le serveur`;
        if (details)
            details.innerHTML = '<span style="color: #666;">Vérifiez votre boîte mail dans quelques minutes</span>';
    } else if (failed === 0) {
        icon.textContent = '✅';
        title.textContent = 'Invitations envoyées !';
        title.style.color = '#27ae60';
        bar.style.background = 'linear-gradient(90deg, #27ae60, #2ecc71)';
        status.textContent = `${sent} invitation(s) envoyée(s) avec succès`;
    } else if (sent > 0) {
        icon.textContent = '⚠️';
        title.textContent = `${sent} envoyé(s), ${failed} échec(s)`;
        title.style.color = '#e67e22';
        bar.style.background = 'linear-gradient(90deg, #e67e22, #f39c12)';
        status.textContent = '';
    } else {
        icon.textContent = '❌';
        title.textContent = "Échec de l'envoi";
        title.style.color = '#e74c3c';
        bar.style.background = '#e74c3c';
        status.textContent = '';
    }

    // Auto-fermeture après 8 secondes
    setTimeout(
        () => {
            const toast = document.getElementById('emailProgressToast');
            if (toast) {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }
        },
        optimistic ? 12000 : 8000
    );
}

// Afficher une erreur dans le toast
function updateEmailToastError(message) {
    const icon = document.getElementById('emailToastIcon');
    const title = document.getElementById('emailToastTitle');
    const status = document.getElementById('emailToastStatus');
    const bar = document.getElementById('emailToastBar');
    const details = document.getElementById('emailToastDetails');

    if (!icon) return;

    icon.textContent = '❌';
    title.textContent = "Erreur d'envoi";
    title.style.color = '#e74c3c';
    if (bar) {
        bar.style.animation = 'none';
        bar.style.width = '100%';
        bar.style.background = '#e74c3c';
    }
    if (status) status.textContent = '';
    if (details) details.innerHTML = `<span style="color: #e74c3c;">${message}</span>`;
}

async function pollEmailStatus(batchId, totalEmails) {
    try {
        const response = await fetch(`${API_URL}/email-queue/status/${batchId}`, { credentials: 'include' });
        if (!response.ok) return;

        const data = await response.json();

        const bar = document.getElementById('emailToastBar');
        const status = document.getElementById('emailToastStatus');
        const percent = document.getElementById('emailToastPercent');
        const icon = document.getElementById('emailToastIcon');
        const title = document.getElementById('emailToastTitle');
        const details = document.getElementById('emailToastDetails');

        if (!bar) return; // Toast fermé

        // Si la queue n'est pas encore alimentée, utiliser l'estimation du client
        const displayTotal = data.total > 0 ? data.total : totalEmails;
        const progress = displayTotal > 0 ? Math.round((data.sent / displayTotal) * 100) : 0;

        bar.style.width = `${progress}%`;
        status.textContent =
            data.total > 0 ? `${data.sent} / ${data.total} envoyé(s)` : `Préparation des invitations...`;
        percent.textContent = data.total > 0 ? `${progress}%` : '';

        if (data.failed > 0) {
            details.innerHTML = `<span style="color: #e74c3c;">⚠️ ${data.failed} échec(s)</span>`;
        }

        // Ne considérer comme terminé QUE si on a des emails en queue
        if (data.isComplete && data.total > 0) {
            clearInterval(emailPollingInterval);
            emailPollingInterval = null;

            if (data.failed === 0) {
                icon.textContent = '✅';
                title.textContent = 'Invitations envoyées !';
                title.style.color = '#27ae60';
                bar.style.background = 'linear-gradient(90deg, #27ae60, #2ecc71)';
            } else if (data.sent > 0) {
                icon.textContent = '⚠️';
                title.textContent = `${data.sent} envoyé(s), ${data.failed} échec(s)`;
                title.style.color = '#e67e22';
                bar.style.background = 'linear-gradient(90deg, #e67e22, #f39c12)';
                // Afficher le détail des échecs
                if (data.failures && data.failures.length > 0) {
                    const failList = data.failures
                        .map(f => `${f.recipient_name}: ${f.error_message || 'Erreur'}`)
                        .join('<br>');
                    details.innerHTML = `<div style="color: #e74c3c; margin-top: 4px;">${failList}</div>`;
                }
            } else {
                icon.textContent = '❌';
                title.textContent = "Échec de l'envoi";
                title.style.color = '#e74c3c';
                bar.style.background = '#e74c3c';
            }

            // Auto-fermeture après 8 secondes si tout OK
            if (data.failed === 0) {
                setTimeout(() => {
                    const toast = document.getElementById('emailProgressToast');
                    if (toast) {
                        toast.style.opacity = '0';
                        setTimeout(() => toast.remove(), 300);
                    }
                }, 8000);
            }
        }
    } catch (error) {
        console.error('Erreur polling email status:', error);
    }
}

function closeEmailProgressToast() {
    if (emailPollingInterval) {
        clearInterval(emailPollingInterval);
        emailPollingInterval = null;
    }
    const toast = document.getElementById('emailProgressToast');
    if (toast) {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }
}

// Fonctions legacy conservées pour compatibilité
function showEmailWaitingOverlay(count) {
    /* Remplacé par toast */
}
function hideEmailWaitingOverlay() {
    /* Remplacé par toast */
}

// Sélectionner/Désélectionner tous les experts
function toggleAllExperts() {
    const selectAll = document.getElementById('selectAllExperts').checked;
    for (const resourceId of Object.keys(pendingAssignments)) {
        const checkbox = document.getElementById(`sendTo_${resourceId}`);
        if (checkbox) checkbox.checked = selectAll;
    }
}

// ========== GESTION DES LOGS DE CONNEXION ==========

function closeLogDetailsModal() {
    const modal = document.getElementById('logDetailsModal');
    if (modal) modal.classList.remove('active');
}

// ========== ENVOI DE BACKUP PAR EMAIL ==========

// ========== GESTION DES SECTIONS REPLIABLES ==========

function toggleAdminSection(sectionId) {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(sectionId + 'Icon');

    if (!section || !icon) return;

    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.textContent = '▼';
        if (sectionId === 'localisationAdminSection') loadLocations();
    } else {
        section.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Pliage/dépliage des sous-catégories à l'intérieur d'une section d'administration
function toggleAdminSubSection(subId) {
    const sub = document.getElementById(subId);
    const icon = document.getElementById(subId + 'SubIcon');
    if (!sub) return;
    const isHidden = sub.style.display === 'none';
    sub.style.display = isHidden ? 'block' : 'none';
    if (icon) icon.textContent = isHidden ? '▼' : '▶';
}
