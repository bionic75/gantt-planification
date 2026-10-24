// Application principale : automations
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES AUTOMATISATIONS ==========

// Charger la configuration de l'automatisation n°1
async function loadAutomation1Config() {
    try {
        const response = await fetch(`${API_URL}/automation/config/1`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.config) {
                document.getElementById('automation1Enabled').checked = data.config.enabled || false;
                document.getElementById('automation1Days').value = data.config.days || '5';
                document.getElementById('automation1CopyUser').value = data.config.copyUserId || '';
            }
        }
    } catch (error) {
        console.error('Erreur chargement config automation 1:', error);
    }
}

// Sauvegarder la configuration de l'automatisation n°1
async function saveAutomation1Config() {
    const config = {
        enabled: document.getElementById('automation1Enabled').checked,
        days: parseInt(document.getElementById('automation1Days').value),
        copyUserId: document.getElementById('automation1CopyUser').value || null
    };

    try {
        const response = await fetch(`${API_URL}/automation/config/1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ config })
        });

        if (response.ok) {
            console.log('✅ Configuration automatisation 1 sauvegardée');
        }
    } catch (error) {
        console.error('Erreur sauvegarde config automation 1:', error);
    }
}

// Remplir la liste des utilisateurs pour la copie
function populateAutomation1CopyUsers() {
    const select = document.getElementById('automation1CopyUser');
    if (!select) return;

    // Garder l'option par défaut
    select.innerHTML = '<option value="">-- Aucun --</option>';

    // Ajouter tous les utilisateurs
    users.forEach(user => {
        if (user.email) {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.prenom} ${user.nom} (${user.email})`;
            select.appendChild(option);
        }
    });
}

// Variable pour suivre quelle automatisation est affichée dans la modal des logs
let currentAutomationLogsId = 1;

// Ouvrir la modal d'historique des envois pour l'automatisation 1
async function openAutomation1Logs() {
    currentAutomationLogsId = 1;
    const modal = document.getElementById('automationLogsModal');
    const content = document.getElementById('automationLogsContent');

    // Remettre le titre par défaut
    modal.querySelector('h2').textContent = '📋 Historique des envois de rappels';

    content.innerHTML = '<p style="text-align: center; color: #666;">Chargement...</p>';
    modal.style.display = 'block';

    try {
        const response = await fetch(`${API_URL}/automation/logs/1`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();

            if (data.logs && data.logs.length > 0) {
                let html = `
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background-color: #ff9800; color: white;">
                                        <th style="padding: 10px; text-align: left;">Date d'envoi</th>
                                        <th style="padding: 10px; text-align: left;">Expert</th>
                                        <th style="padding: 10px; text-align: left;">Email</th>
                                        <th style="padding: 10px; text-align: left;">Mois concerné</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                data.logs.forEach(log => {
                    const date = new Date(log.sent_at);
                    const formattedDate = date.toLocaleString('fr-FR');

                    html += `
                                <tr style="border-bottom: 1px solid #ddd;">
                                    <td style="padding: 10px;">${formattedDate}</td>
                                    <td style="padding: 10px;">${log.expert_name}</td>
                                    <td style="padding: 10px;">${log.expert_email}</td>
                                    <td style="padding: 10px;">${log.target_month}</td>
                                </tr>
                            `;
                });

                html += '</tbody></table>';
                content.innerHTML = html;
            } else {
                content.innerHTML = '<p style="text-align: center; color: #666;">Aucun envoi enregistré</p>';
            }
        }
    } catch (error) {
        console.error('Erreur chargement logs:', error);
        content.innerHTML = '<p style="color: #e74c3c;">Erreur lors du chargement</p>';
    }
}

function closeAutomationLogsModal() {
    document.getElementById('automationLogsModal').style.display = 'none';
}

// Vider l'historique des envois de l'automatisation courante
async function clearAutomationLogs() {
    const automationName = currentAutomationLogsId === 1 ? 'rappels de disponibilités' : 'sauvegardes de planning';
    if (!confirm(`Voulez-vous vraiment supprimer tout l'historique des ${automationName} ?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/automation/logs/${currentAutomationLogsId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            document.getElementById('automationLogsContent').innerHTML =
                '<p style="text-align: center; color: #4CAF50;">✅ Historique vidé avec succès</p>';
        }
    } catch (error) {
        console.error('Erreur suppression logs:', error);
        document.getElementById('automationLogsContent').innerHTML =
            '<p style="text-align: center; color: #e74c3c;">❌ Erreur lors de la suppression</p>';
    }
}

// Tester l'automatisation n°1
async function testAutomation1() {
    const resultDiv = document.getElementById('automation1TestResult');
    resultDiv.innerHTML = '<span style="color: #2196f3;">🔍 Recherche en cours...</span>';

    try {
        const response = await fetch(`${API_URL}/automation/test/1`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();

            if (data.expertsWithoutAvailability && data.expertsWithoutAvailability.length > 0) {
                // Ouvrir la modal avec les résultats
                openAutomationTestModal(data);
                resultDiv.innerHTML = `<span style="color: #f39c12;">⚠️ ${data.expertsWithoutAvailability.length} expert(s) sans disponibilités sur ${data.targetMonth}</span>`;
            } else {
                resultDiv.innerHTML = `<span style="color: #4CAF50;">✅ Tous les experts ont renseigné leurs disponibilités pour ${data.targetMonth}</span>`;
            }
        }
    } catch (error) {
        console.error('Erreur test automation 1:', error);
        resultDiv.innerHTML = '<span style="color: #e74c3c;">❌ Erreur lors du test</span>';
    }
}

// Variable pour stocker les experts détectés
let expertsToRemind = [];
let targetMonthForReminder = '';

// Ouvrir la modal de test avec les résultats
function openAutomationTestModal(data) {
    const modal = document.getElementById('automationTestModal');
    const content = document.getElementById('automationTestContent');
    const actions = document.getElementById('automationTestActions');

    expertsToRemind = data.expertsWithoutAvailability;
    targetMonthForReminder = data.targetMonth;

    let html = `
                <p style="margin-bottom: 15px;">
                    <strong>${data.expertsWithoutAvailability.length} expert(s)</strong> n'ont pas renseigné leurs disponibilités pour <strong>${data.targetMonth}</strong> :
                </p>
                <div style="max-height: 300px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #f5f5f5;">
                                <th style="padding: 10px; text-align: left; position: sticky; top: 0; background: #f5f5f5;">
                                    <label style="cursor: pointer;">
                                        <input type="checkbox" id="selectAllExperts" onchange="toggleAllExperts(this)" checked> Sélectionner
                                    </label>
                                </th>
                                <th style="padding: 10px; text-align: left; position: sticky; top: 0; background: #f5f5f5;">Expert</th>
                                <th style="padding: 10px; text-align: left; position: sticky; top: 0; background: #f5f5f5;">Email</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

    data.expertsWithoutAvailability.forEach((expert, index) => {
        html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px;">
                            <input type="checkbox" class="expertCheckbox" data-index="${index}" checked>
                        </td>
                        <td style="padding: 10px;">${expert.prenom} ${expert.nom}</td>
                        <td style="padding: 10px;">${expert.email}</td>
                    </tr>
                `;
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
    actions.style.display = 'block';
    modal.style.display = 'block';
}

function closeAutomationTestModal() {
    document.getElementById('automationTestModal').style.display = 'none';
    document.getElementById('automationTestActions').style.display = 'none';
}

// Sélectionner/Désélectionner tous les experts
function toggleAllExperts(checkbox) {
    const checkboxes = document.querySelectorAll('.expertCheckbox');
    checkboxes.forEach(cb => (cb.checked = checkbox.checked));
}

// Envoyer un rappel à tous les experts sélectionnés
async function sendReminderToAllExperts() {
    const checkboxes = document.querySelectorAll('.expertCheckbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    const selectedExperts = selectedIndices.map(i => expertsToRemind[i]);

    if (selectedExperts.length === 0) {
        alert('Veuillez sélectionner au moins un expert');
        return;
    }

    if (!confirm(`Envoyer un email de rappel à ${selectedExperts.length} expert(s) ?`)) {
        return;
    }

    const content = document.getElementById('automationTestContent');
    content.innerHTML = '<p style="text-align: center; color: #2196f3;">📧 Envoi des emails en cours...</p>';

    try {
        const response = await fetch(`${API_URL}/automation/send-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                experts: selectedExperts,
                targetMonth: targetMonthForReminder
            })
        });

        if (response.ok) {
            const result = await response.json();
            content.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <span style="font-size: 48px;">✅</span>
                            <p style="color: #4CAF50; font-weight: bold; margin-top: 15px;">
                                ${result.sent} email(s) envoyé(s) avec succès
                            </p>
                            ${result.failed > 0 ? `<p style="color: #f39c12;">${result.failed} échec(s)</p>` : ''}
                        </div>
                    `;
            document.getElementById('automationTestActions').style.display = 'none';
        } else {
            throw new Error('Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur envoi rappels:', error);
        content.innerHTML = '<p style="color: #e74c3c; text-align: center;">❌ Erreur lors de l\'envoi</p>';
    }
}
