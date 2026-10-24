// Application principale : automation-backup
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== AUTOMATISATION N°2 : SAUVEGARDE PLANNINGS ==========

// Initialiser les options de l'automatisation 2
function initAutomation2Options() {
    // Remplir les jours du mois (1-31)
    const monthDaySelect = document.getElementById('automation2MonthDay');
    if (monthDaySelect && monthDaySelect.options.length === 0) {
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            monthDaySelect.appendChild(option);
        }
    }

    // Remplir les destinataires individuels
    populateAutomation2Recipients();

    // Remplir la liste des experts
    populateAutomation2ExpertsList();
}

// Remplir la liste des destinataires pour l'automatisation 2
function populateAutomation2Recipients() {
    const select = document.getElementById('automation2Recipients');
    if (!select) return;

    select.innerHTML = '';

    users.forEach(user => {
        if (user.email) {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.prenom} ${user.nom} (${user.email})`;
            select.appendChild(option);
        }
    });
}

// Remplir la liste des experts pour l'automatisation 2
function populateAutomation2ExpertsList() {
    const select = document.getElementById('automation2ExpertsList');
    if (!select) return;

    select.innerHTML = '';

    // Récupérer les ressources (experts)
    resources.forEach(resource => {
        const option = document.createElement('option');
        option.value = resource.id;
        option.textContent = `${resource.prenom} ${resource.nom}${resource.actif ? '' : ' (inactif)'}`;
        if (!resource.actif) {
            option.style.color = '#999';
        }
        select.appendChild(option);
    });
}

// Remplir la liste des mois disponibles pour l'automatisation 2
async function populateAutomation2MonthsList() {
    const select = document.getElementById('automation2Months');
    if (!select) return;

    try {
        const response = await fetch(`${API_URL}/automation/available-months`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            select.innerHTML = '';

            if (data.months && data.months.length > 0) {
                data.months.forEach(month => {
                    const option = document.createElement('option');
                    option.value = month.value; // "2025-01"
                    option.textContent = month.label; // "Janvier 2025"
                    select.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Aucune donnée disponible';
                option.disabled = true;
                select.appendChild(option);
            }
        }
    } catch (error) {
        console.error('Erreur chargement mois disponibles:', error);
    }
}

// Toggle pour "Tous les experts"
function toggleAutomation2AllExperts() {
    const allChecked = document.getElementById('automation2AllExperts').checked;
    const select = document.getElementById('automation2ExpertsList');
    select.disabled = allChecked;

    if (allChecked) {
        // Désélectionner tous les éléments
        Array.from(select.options).forEach(opt => (opt.selected = false));
    }

    saveAutomation2Config();
}

// Toggle pour "Toutes les données" (mois)
function toggleAutomation2AllMonths() {
    const allChecked = document.getElementById('automation2AllMonths').checked;
    const select = document.getElementById('automation2Months');
    select.disabled = allChecked;

    if (allChecked) {
        // Désélectionner tous les éléments
        Array.from(select.options).forEach(opt => (opt.selected = false));
    }

    saveAutomation2Config();
}

// Mettre à jour les options de fréquence
function updateAutomation2FrequencyOptions() {
    const frequency = document.getElementById('automation2Frequency').value;
    document.getElementById('automation2WeeklyOptions').style.display = frequency === 'weekly' ? 'block' : 'none';
    document.getElementById('automation2MonthlyOptions').style.display = frequency === 'monthly' ? 'block' : 'none';
}

// Charger la configuration de l'automatisation 2
async function loadAutomation2Config() {
    // D'abord charger les mois disponibles
    await populateAutomation2MonthsList();

    try {
        const response = await fetch(`${API_URL}/automation/config/2`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.config) {
                const c = data.config;
                document.getElementById('automation2Enabled').checked = c.enabled || false;
                document.getElementById('automation2GroupAdmin').checked = c.groupAdmin || false;
                document.getElementById('automation2GroupUser').checked = c.groupUser || false;
                document.getElementById('automation2GroupExpert').checked = c.groupExpert || false;
                document.getElementById('automation2Frequency').value = c.frequency || 'daily';
                document.getElementById('automation2WeekDay').value = c.weekDay || '1';
                document.getElementById('automation2MonthDay').value = c.monthDay || '1';
                document.getElementById('automation2Hour').value = c.hour || '8';
                document.getElementById('automation2Format').value = c.format || 'csv';

                // Gérer la sélection des experts
                const allExperts = c.allExperts !== false; // Par défaut true
                document.getElementById('automation2AllExperts').checked = allExperts;
                document.getElementById('automation2ExpertsList').disabled = allExperts;

                // Sélectionner les experts individuels si pas "tous"
                if (!allExperts && c.expertsList && Array.isArray(c.expertsList)) {
                    const expertsSelect = document.getElementById('automation2ExpertsList');
                    Array.from(expertsSelect.options).forEach(opt => {
                        opt.selected = c.expertsList.includes(parseInt(opt.value));
                    });
                }

                // Gérer "Toutes les données" (mois) - Par défaut true maintenant
                const allMonths = c.allMonths !== false; // Par défaut true
                document.getElementById('automation2AllMonths').checked = allMonths;
                document.getElementById('automation2Months').disabled = allMonths;

                // Sélectionner les mois si pas "tous"
                if (!allMonths && c.selectedMonths && Array.isArray(c.selectedMonths)) {
                    const monthsSelect = document.getElementById('automation2Months');
                    Array.from(monthsSelect.options).forEach(opt => {
                        opt.selected = c.selectedMonths.includes(opt.value);
                    });
                }

                // Exclure lignes vides
                document.getElementById('automation2ExcludeEmpty').checked = c.excludeEmpty !== false; // Par défaut true

                // Sélectionner les destinataires individuels
                const recipientsSelect = document.getElementById('automation2Recipients');
                if (c.recipients && Array.isArray(c.recipients)) {
                    Array.from(recipientsSelect.options).forEach(opt => {
                        opt.selected = c.recipients.includes(parseInt(opt.value));
                    });
                }

                updateAutomation2FrequencyOptions();
            }
        }
    } catch (error) {
        console.error('Erreur chargement config automation 2:', error);
    }
}

// Sauvegarder la configuration de l'automatisation 2
async function saveAutomation2Config() {
    const monthsSelect = document.getElementById('automation2Months');
    const recipientsSelect = document.getElementById('automation2Recipients');

    const config = {
        enabled: document.getElementById('automation2Enabled').checked,
        groupAdmin: document.getElementById('automation2GroupAdmin').checked,
        groupUser: document.getElementById('automation2GroupUser').checked,
        groupExpert: document.getElementById('automation2GroupExpert').checked,
        recipients: Array.from(recipientsSelect.selectedOptions).map(opt => parseInt(opt.value)),
        frequency: document.getElementById('automation2Frequency').value,
        weekDay: document.getElementById('automation2WeekDay').value,
        monthDay: document.getElementById('automation2MonthDay').value,
        hour: document.getElementById('automation2Hour').value,
        allMonths: document.getElementById('automation2AllMonths').checked,
        selectedMonths: Array.from(monthsSelect.selectedOptions).map(opt => opt.value), // "2025-01" format
        allExperts: document.getElementById('automation2AllExperts').checked,
        expertsList: Array.from(document.getElementById('automation2ExpertsList').selectedOptions).map(opt =>
            parseInt(opt.value)
        ),
        excludeEmpty: document.getElementById('automation2ExcludeEmpty').checked,
        format: document.getElementById('automation2Format').value
    };

    try {
        const response = await fetch(`${API_URL}/automation/config/2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ config })
        });

        if (response.ok) {
            console.log('✅ Configuration automatisation 2 sauvegardée');
        }
    } catch (error) {
        console.error('Erreur sauvegarde config automation 2:', error);
    }
}

// Ouvrir l'historique des envois de l'automatisation 2
async function openAutomation2Logs() {
    currentAutomationLogsId = 2;
    const modal = document.getElementById('automationLogsModal');
    const content = document.getElementById('automationLogsContent');

    content.innerHTML = '<p style="text-align: center; color: #666;">Chargement...</p>';
    modal.style.display = 'block';

    // Modifier le titre
    modal.querySelector('h2').textContent = '📋 Historique des sauvegardes de planning';

    try {
        const response = await fetch(`${API_URL}/automation/logs/2`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();

            if (data.logs && data.logs.length > 0) {
                let html = `
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background-color: #ff9800; color: white;">
                                        <th style="padding: 10px; text-align: left;">Date d'envoi</th>
                                        <th style="padding: 10px; text-align: left;">Destinataires</th>
                                        <th style="padding: 10px; text-align: left;">Fichier</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                data.logs.forEach(log => {
                    const date = new Date(log.sent_at);
                    const formattedDate = date.toLocaleString('fr-FR');

                    // Parser les destinataires si disponibles
                    let recipientsDisplay = log.recipients_count ? `${log.recipients_count} destinataire(s)` : '-';
                    if (log.recipients_list) {
                        try {
                            const recipientsList = JSON.parse(log.recipients_list);
                            if (recipientsList.length > 0) {
                                recipientsDisplay = `<details style="cursor: pointer;">
                                            <summary style="color: #1565c0;">${recipientsList.length} destinataire(s)</summary>
                                            <ul style="margin: 5px 0; padding-left: 20px; font-size: 11px;">
                                                ${recipientsList.map(r => `<li>${r}</li>`).join('')}
                                            </ul>
                                        </details>`;
                            }
                        } catch (e) {}
                    }

                    // Lien de téléchargement du fichier
                    const fileLink = log.file_id
                        ? `<a href="#" onclick="downloadAutomation2File(${log.id}); return false;" style="color: #1565c0; text-decoration: underline;">${log.filename || 'Télécharger'}</a>`
                        : log.filename || '-';

                    html += `
                                <tr style="border-bottom: 1px solid #ddd;">
                                    <td style="padding: 10px;">${formattedDate}</td>
                                    <td style="padding: 10px;">${recipientsDisplay}</td>
                                    <td style="padding: 10px; font-size: 11px;">${fileLink}</td>
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

// Télécharger un fichier de sauvegarde depuis l'historique
async function downloadAutomation2File(logId) {
    try {
        const response = await fetch(`${API_URL}/automation/download/2/${logId}`, {
            credentials: 'include'
        });

        if (response.ok) {
            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'Expert_Planning_Sauvegarde.csv';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) filename = match[1];
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            alert('Fichier non disponible');
        }
    } catch (error) {
        console.error('Erreur téléchargement:', error);
        alert('Erreur lors du téléchargement');
    }
}

// Tester l'automatisation 2
async function testAutomation2() {
    const resultDiv = document.getElementById('automation2TestResult');
    resultDiv.innerHTML = '<span style="color: #2196f3;">🔍 Préparation du récapitulatif...</span>';

    try {
        // Récupérer la configuration actuelle
        const monthsSelect = document.getElementById('automation2Months');
        const recipientsSelect = document.getElementById('automation2Recipients');
        const expertsListSelect = document.getElementById('automation2ExpertsList');

        const allMonths = document.getElementById('automation2AllMonths').checked;
        const allExperts = document.getElementById('automation2AllExperts').checked;

        const config = {
            groupAdmin: document.getElementById('automation2GroupAdmin').checked,
            groupUser: document.getElementById('automation2GroupUser').checked,
            groupExpert: document.getElementById('automation2GroupExpert').checked,
            recipients: Array.from(recipientsSelect.selectedOptions).map(opt => parseInt(opt.value)),
            allMonths: allMonths,
            selectedMonths: Array.from(monthsSelect.selectedOptions).map(opt => opt.value),
            allExperts: allExperts,
            expertsList: Array.from(expertsListSelect.selectedOptions).map(opt => parseInt(opt.value)),
            excludeEmpty: document.getElementById('automation2ExcludeEmpty').checked,
            format: document.getElementById('automation2Format').value
        };

        console.log('📧 Config automation 2:', config);

        // Vérifier qu'il y a des destinataires
        const hasRecipients =
            config.groupAdmin || config.groupUser || config.groupExpert || config.recipients.length > 0;
        if (!hasRecipients) {
            resultDiv.innerHTML =
                '<span style="color: #e74c3c;">❌ Veuillez sélectionner au moins un destinataire</span>';
            return;
        }

        // Vérifier qu'il y a des mois sélectionnés (sauf si "toutes les données")
        if (!allMonths && config.selectedMonths.length === 0) {
            resultDiv.innerHTML =
                '<span style="color: #e74c3c;">❌ Veuillez sélectionner au moins un mois ou cocher "Toutes les données"</span>';
            return;
        }

        // Vérifier qu'il y a des experts sélectionnés
        if (!allExperts && config.expertsList.length === 0) {
            resultDiv.innerHTML =
                '<span style="color: #e74c3c;">❌ Veuillez sélectionner au moins un expert ou cocher "Tous les experts"</span>';
            return;
        }

        // Appeler l'API de prévisualisation
        const response = await fetch(`${API_URL}/automation/preview/2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(config)
        });

        if (response.ok) {
            const data = await response.json();
            openAutomation2PreviewModal(data, config);
            resultDiv.innerHTML = '';
        } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erreur serveur (${response.status})`);
        }
    } catch (error) {
        console.error('Erreur test automation 2:', error);
        resultDiv.innerHTML = `<span style="color: #e74c3c;">❌ ${error.message || 'Erreur lors du test'}</span>`;
    }
}

// Ouvrir la modal de prévisualisation de l'automatisation 2
function openAutomation2PreviewModal(data, config) {
    const modal = document.getElementById('automation2PreviewModal');
    const content = document.getElementById('automation2PreviewContent');

    // Afficher le label pour les mois
    let monthsLabel = '';
    if (config.allMonths) {
        monthsLabel = data.monthsLabel || 'Toutes les données';
    } else if (config.selectedMonths && config.selectedMonths.length > 0) {
        // selectedMonths contient des valeurs comme "2025-01"
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
        monthsLabel = config.selectedMonths
            .map(monthStr => {
                const [year, month] = monthStr.split('-');
                return `${monthNames[parseInt(month) - 1]} ${year}`;
            })
            .join(', ');
    } else {
        monthsLabel = data.monthsLabel || 'Aucun mois';
    }

    // Afficher le label pour les experts
    const expertsLabel = config.allExperts ? 'Tous les experts' : 'Sélection personnalisée';

    // Afficher le nombre de personnes et d'emails
    const emailsInfo =
        data.emailsCount !== data.recipientsCount
            ? ` <span style="color: #666; font-size: 11px;">(${data.emailsCount} email(s) unique(s))</span>`
            : '';

    // Option lignes vides
    const excludeEmptyLabel = config.excludeEmpty ? 'Oui' : 'Non';

    let html = `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #e65100; margin: 0 0 15px 0;">📋 Récapitulatif de l'envoi</h4>
                    
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff3e0; font-weight: bold; width: 150px;">Destinataires</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${data.recipientsCount} personne(s)${emailsInfo}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff3e0; font-weight: bold;">Données incluses</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${monthsLabel}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff3e0; font-weight: bold;">Experts</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${data.expertsCount} expert(s) (${expertsLabel})</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff3e0; font-weight: bold;">Exclure lignes vides</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${excludeEmptyLabel}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff3e0; font-weight: bold;">Format</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${config.format.toUpperCase()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff3e0; font-weight: bold;">Nom du fichier</td>
                            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 11px;">${data.filename}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <h5 style="color: #555; margin: 0 0 10px 0;">📬 Liste des destinataires :</h5>
                    <div style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 10px; font-size: 12px;">
                        ${data.recipientsList.map(r => `<div style="padding: 3px 0;">• ${r}</div>`).join('')}
                    </div>
                </div>
            `;

    content.innerHTML = html;

    // Stocker la config pour l'envoi
    window.automation2TestConfig = config;

    modal.style.display = 'block';
}

function closeAutomation2PreviewModal() {
    document.getElementById('automation2PreviewModal').style.display = 'none';
}

// Confirmer et envoyer la sauvegarde de test
async function confirmAutomation2Send() {
    const modal = document.getElementById('automation2PreviewModal');
    const content = document.getElementById('automation2PreviewContent');

    content.innerHTML = '<p style="text-align: center; color: #2196f3;">📧 Envoi en cours...</p>';

    try {
        const response = await fetch(`${API_URL}/automation/send/2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(window.automation2TestConfig)
        });

        if (response.ok) {
            const result = await response.json();
            const emailsInfo =
                result.emailsSent !== result.sent
                    ? `<p style="color: #666; font-size: 12px;">(${result.emailsSent} adresse(s) email unique(s))</p>`
                    : '';
            content.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <span style="font-size: 48px;">✅</span>
                            <p style="color: #4CAF50; font-weight: bold; margin-top: 15px;">
                                Email envoyé avec succès à ${result.sent} personne(s)
                            </p>
                            ${emailsInfo}
                            ${result.failed > 0 ? `<p style="color: #f39c12;">${result.failed} échec(s)</p>` : ''}
                        </div>
                    `;
            document.getElementById('automation2PreviewActions').style.display = 'none';
        } else {
            throw new Error('Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur envoi automation 2:', error);
        content.innerHTML = '<p style="color: #e74c3c; text-align: center;">❌ Erreur lors de l\'envoi</p>';
    }
}

// Diagnostic des mois - pour comprendre pourquoi certains mois apparaissent
async function diagnoseMoisData() {
    try {
        const response = await fetch(`${API_URL}/automation/diagnose-months`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();

            let html = '<h3>🔍 Diagnostic des mois avec données</h3>';
            html +=
                '<p style="font-size: 12px; color: #666;">Ce diagnostic montre les données brutes trouvées dans la base pour chaque mois.</p>';

            if (data.months && data.months.length > 0) {
                html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">';
                html += '<thead><tr style="background: #f5f5f5;">';
                html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Mois</th>';
                html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Lignes totales</th>';
                html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Dispo ≠ 1</th>';
                html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Activ ≠ 1</th>';
                html += '<th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Exemples de données</th>';
                html += '</tr></thead><tbody>';

                data.months.forEach(m => {
                    const hasRealData = m.availableNot1 > 0 || m.activityNot1 > 0;
                    const rowStyle = hasRealData ? '' : 'background: #ffebee;';
                    html += `<tr style="${rowStyle}">`;
                    html += `<td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${m.label} <span style="color:#999; font-size:10px;">(${m.raw})</span></td>`;
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${m.totalRows}</td>`;
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${m.availableNot1}</td>`;
                    html += `<td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${m.activityNot1}</td>`;
                    html += `<td style="padding: 8px; border: 1px solid #ddd; font-size: 10px;">${m.samples || '-'}</td>`;
                    html += '</tr>';
                });

                html += '</tbody></table>';

                html +=
                    '<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border-radius: 4px; font-size: 11px;">';
                html += '<strong>Légende :</strong><br>';
                html +=
                    '• <strong>Dispo ≠ 1</strong> : Nombre de lignes où disponibilité n\'est pas "Indisponible"<br>';
                html += '• <strong>Activ ≠ 1</strong> : Nombre de lignes où activité n\'est pas "Indisponible"<br>';
                html +=
                    '• Les lignes en <span style="background: #ffebee; padding: 2px 4px;">rouge</span> ne devraient pas apparaître dans la liste';
                html += '</div>';

                if (data.orphanData && data.orphanData.length > 0) {
                    html += '<h4 style="margin-top: 20px; color: #e65100;">⚠️ Données orphelines détectées</h4>';
                    html += '<p style="font-size: 11px;">Ces données ont un format de date incorrect :</p>';
                    html +=
                        '<pre style="background: #f5f5f5; padding: 10px; font-size: 10px; overflow-x: auto; max-height: 200px;">';
                    html += JSON.stringify(data.orphanData, null, 2);
                    html += '</pre>';
                }
            } else {
                html += '<p>Aucune donnée trouvée.</p>';
            }

            // Afficher dans une modal
            const modal = document.getElementById('automationLogsModal');
            const content = document.getElementById('automationLogsContent');
            modal.querySelector('h2').textContent = '🔍 Diagnostic des données';
            content.innerHTML = html;
            modal.style.display = 'block';
        } else {
            alert('Erreur lors du diagnostic');
        }
    } catch (error) {
        console.error('Erreur diagnostic:', error);
        alert('Erreur: ' + error.message);
    }
}

// Nettoyer les données invalides (mois 0, formats incorrects)
async function cleanupInvalidDates() {
    // D'abord, afficher la prévisualisation
    try {
        const response = await fetch(`${API_URL}/automation/cleanup-dates-preview`, {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            const err = await response.json();
            alert('Erreur: ' + (err.error || 'Erreur inconnue'));
            return;
        }

        const data = await response.json();

        // Afficher la prévisualisation dans une modal
        let html = '<h3>🔍 Prévisualisation du nettoyage</h3>';
        html +=
            '<p style="font-size: 12px; color: #666; margin-bottom: 15px;">Voici ce qui sera modifié. <strong>Aucune modification n\'a encore été faite.</strong></p>';

        // Section 1: Suppressions
        html += '<div style="background: #ffebee; padding: 10px; border-radius: 4px; margin-bottom: 15px;">';
        html += `<h4 style="color: #c62828; margin: 0 0 10px 0;">🗑️ Suppressions prévues : ${data.toDelete.length} lignes</h4>`;
        if (data.toDelete.length > 0) {
            html +=
                '<p style="font-size: 11px; margin-bottom: 5px;">Données avec mois invalide (mois=0) qui seront supprimées :</p>';
            html +=
                '<div style="max-height: 150px; overflow-y: auto; background: white; padding: 8px; border-radius: 4px; font-size: 10px; font-family: monospace;">';
            data.toDelete.slice(0, 50).forEach(item => {
                html += `<div>${item.date_key} | ${item.type}=${item.value} | expert=${item.resource_id}</div>`;
            });
            if (data.toDelete.length > 50) {
                html += `<div style="color: #999;">... et ${data.toDelete.length - 50} autres lignes</div>`;
            }
            html += '</div>';
        } else {
            html += '<p style="font-size: 11px; color: #666;">Aucune donnée à supprimer.</p>';
        }
        html += '</div>';

        // Section 2: Normalisations
        html += '<div style="background: #fff3e0; padding: 10px; border-radius: 4px; margin-bottom: 15px;">';
        html += `<h4 style="color: #e65100; margin: 0 0 10px 0;">✏️ Normalisations prévues : ${data.toNormalize.length} dates</h4>`;
        if (data.toNormalize.length > 0) {
            html +=
                '<p style="font-size: 11px; margin-bottom: 5px;">Dates qui seront renommées (format YYYY-M-D → YYYY-MM-DD_AM) :</p>';
            html += '<table style="width: 100%; font-size: 10px; border-collapse: collapse; background: white;">';
            html +=
                '<thead><tr style="background: #f5f5f5;"><th style="padding: 4px; border: 1px solid #ddd;">Ancien</th><th style="padding: 4px; border: 1px solid #ddd;">Nouveau</th><th style="padding: 4px; border: 1px solid #ddd;">Lignes</th><th style="padding: 4px; border: 1px solid #ddd;">Conflit?</th></tr></thead><tbody>';
            data.toNormalize.slice(0, 30).forEach(item => {
                const conflictStyle = item.hasConflict ? 'background: #ffcdd2;' : '';
                const conflictText = item.hasConflict ? '⚠️ OUI - sera supprimé' : '✅ Non';
                html += `<tr style="${conflictStyle}"><td style="padding: 4px; border: 1px solid #ddd;">${item.oldKey}</td><td style="padding: 4px; border: 1px solid #ddd;">${item.newKey}</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">${item.rowCount}</td><td style="padding: 4px; border: 1px solid #ddd;">${conflictText}</td></tr>`;
            });
            if (data.toNormalize.length > 30) {
                html += `<tr><td colspan="4" style="padding: 4px; border: 1px solid #ddd; color: #999;">... et ${data.toNormalize.length - 30} autres dates</td></tr>`;
            }
            html += '</tbody></table>';

            if (data.conflictCount > 0) {
                html += `<p style="font-size: 11px; color: #c62828; margin-top: 10px;">⚠️ <strong>${data.conflictCount} dates en conflit</strong> seront supprimées car elles existent déjà au nouveau format.</p>`;
            }
        } else {
            html += '<p style="font-size: 11px; color: #666;">Aucune date à normaliser.</p>';
        }
        html += '</div>';

        // Section 3: Résumé
        html += '<div style="background: #e3f2fd; padding: 10px; border-radius: 4px; margin-bottom: 15px;">';
        html += '<h4 style="color: #1565c0; margin: 0 0 10px 0;">📊 Résumé</h4>';
        html += `<ul style="font-size: 12px; margin: 0; padding-left: 20px;">`;
        html += `<li><strong>${data.toDelete.length}</strong> lignes seront supprimées (données corrompues)</li>`;
        html += `<li><strong>${data.toNormalize.length - data.conflictCount}</strong> dates seront renommées</li>`;
        html += `<li><strong>${data.conflictCount}</strong> dates en doublon seront supprimées</li>`;
        html += `</ul>`;
        html += '</div>';

        // Boutons d'action
        html += '<div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">';
        html +=
            '<button onclick="executeCleanup()" style="background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">✅ Confirmer et exécuter</button>';
        html +=
            '<button onclick="document.getElementById(\'automationLogsModal\').style.display=\'none\'" style="background: #9e9e9e; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">Annuler</button>';
        html += '</div>';

        // Afficher dans la modal
        const modal = document.getElementById('automationLogsModal');
        const content = document.getElementById('automationLogsContent');
        modal.querySelector('h2').textContent = '🧹 Nettoyage des données';
        content.innerHTML = html;
        modal.style.display = 'block';
    } catch (error) {
        console.error('Erreur prévisualisation nettoyage:', error);
        alert('Erreur: ' + error.message);
    }
}

// Exécuter le nettoyage après confirmation
async function executeCleanup() {
    if (
        !confirm(
            '⚠️ ATTENTION ⚠️\n\nVous êtes sur le point de modifier la base de données.\n\nCette action est IRRÉVERSIBLE.\n\nÊtes-vous absolument sûr de vouloir continuer ?'
        )
    ) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/automation/cleanup-dates-execute`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();

            let message = '✅ Nettoyage terminé avec succès !\n\n';
            message += `• Lignes supprimées : ${data.deleted}\n`;
            message += `• Dates normalisées : ${data.normalized}\n`;
            message += `• Doublons supprimés : ${data.duplicatesRemoved}\n`;

            alert(message);

            // Fermer la modal et recharger la liste des mois
            document.getElementById('automationLogsModal').style.display = 'none';
            await populateAutomation2MonthsList();
        } else {
            const err = await response.json();
            alert('Erreur: ' + (err.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur exécution nettoyage:', error);
        alert('Erreur: ' + error.message);
    }
}

// ========== FIN AUTOMATISATION N°2 ==========
