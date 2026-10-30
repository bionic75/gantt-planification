// Application principale : admin-api
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ===== GESTION DES UTILISATEURS =====
// Accès aux applications : îlot Vue (frontend/src/ilots/admin/acces)

async function resetUserTotp(userId, userName) {
    if (
        !confirm(
            `Réinitialiser l'appairage TOTP de ${userName} ?\n\nL'utilisateur devra rescanner un nouveau QR code à sa prochaine connexion.`
        )
    )
        return;
    try {
        const res = await fetch(`${API_URL}/mfa/reset-totp/${userId}`, { method: 'POST', credentials: 'include' });
        if (res.ok) {
            alert(
                `✅ TOTP réinitialisé pour ${userName}.\nL'utilisateur devra configurer un nouvel appairage à sa prochaine connexion.`
            );
        } else {
            const d = await res.json();
            alert('Erreur : ' + (d.error || res.status));
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

async function deleteUser(id) {
    if (!confirm('Confirmer la suppression ?')) return;
    try {
        const response = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
        await loadUsers();
        showSyncStatus();
        logModification('Modification du planning');
    } catch (error) {
        console.error('Erreur:', error);
        alert(error.message);
    }
}

// Fonction pour afficher les détails d'un utilisateur
async function showUserDetails(userId) {
    try {
        // Trouver l'utilisateur dans le cache local
        const user = users.find(u => u.id === userId);
        if (!user) {
            throw new Error('Utilisateur non trouvé');
        }

        // Récupérer les logs de connexion de l'utilisateur
        let userLogs = [];
        try {
            const logsResponse = await fetch(
                `${API_URL}/reporting/connections?dateStart=2000-01-01&dateEnd=2099-12-31&userIds=${userId}`,
                { credentials: 'include' }
            );
            if (logsResponse.ok) {
                const logsData = await logsResponse.json();
                userLogs = logsData.rows || [];
            }
        } catch (e) {
            console.log('Erreur chargement logs:', e);
        }

        // Récupérer les logs d'action (modifications de planning)
        let actionLogs = [];
        try {
            console.log('🔍 Récupération logs actions pour userId:', userId);
            const actionResponse = await fetch(`${API_URL}/logs/actions?userId=${userId}`, { credentials: 'include' });
            console.log('📡 Réponse logs actions status:', actionResponse.status);
            if (actionResponse.ok) {
                const actionData = await actionResponse.json();
                actionLogs = actionData.logs || [];
                console.log('✅ Logs actions récupérés:', actionLogs.length, 'logs');
                console.log('📋 Détail logs:', actionLogs);
            } else {
                console.error('❌ Erreur HTTP logs actions:', actionResponse.status);
            }
        } catch (e) {
            console.error('❌ Erreur chargement logs actions:', e);
        }

        // Construire le contenu de la modal
        let content = `
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <h3 style="color: #2c3e50; margin-bottom: 10px; font-size: 16px;">Informations générales</h3>
                        <p><strong>Nom complet:</strong> ${user.prenom} ${user.nom}</p>
                        <p><strong>Login:</strong> ${user.username}</p>
                        <p><strong>Email:</strong> ${user.email || '-'}</p>
                        <p><strong>Téléphone:</strong> ${user.telephone || '-'}</p>
                        <p><strong>Rôles:</strong> ${[
                            user.is_admin === 1 ? 'Administrateur' : null,
                            user.is_expert === 1 ? 'Expert' : null,
                            user.is_user === 1 ? 'Utilisateur' : null
                        ]
                            .filter(Boolean)
                            .join(', ')}</p>
                        <p><strong>Statut:</strong> ${user.actif ? '✅ Actif' : '❌ Inactif'}</p>
                    </div>
                    
                    <div style="background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h3 style="color: #2c3e50; margin: 0; font-size: 16px;">📊 Dernières connexions (${Math.min(userLogs.length, 10)})</h3>
                            ${
                                userLogs.length > 0
                                    ? `
                                <button onclick="razLogs('connexions', ${userId})" style="padding: 5px 15px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;" onmouseover="this.style.backgroundColor='#c0392b'" onmouseout="this.style.backgroundColor='#e74c3c'">
                                    🗑️ RAZ
                                </button>
                            `
                                    : ''
                            }
                        </div>
                        ${
                            userLogs.length > 0
                                ? `
                            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                                <thead>
                                    <tr style="background-color: #d0e8f0;">
                                        <th style="padding: 8px; text-align: left; border: 1px solid #b0d8e8;">Date et heure</th>
                                        <th style="padding: 8px; text-align: left; border: 1px solid #b0d8e8;">Profil</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${userLogs
                                        .slice(0, 10)
                                        .map(log => {
                                            let loginDate = '—';
                                            const rawTime = log.derniere_connexion || log.login_time;
                                            if (rawTime) {
                                                let loginTime = rawTime;
                                                if (!loginTime.endsWith('Z') && !loginTime.includes('+'))
                                                    loginTime += 'Z';
                                                loginDate = new Date(loginTime).toLocaleString('fr-FR', {
                                                    timeZone: 'Europe/Paris',
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });
                                            }
                                            const profileLabel =
                                                log.profile === 'admin'
                                                    ? 'Administrateur'
                                                    : log.profile === 'expert'
                                                      ? 'Expert Métier'
                                                      : 'Utilisateur';
                                            const nbCo = log.nb_connexions ? ` (×${log.nb_connexions})` : '';
                                            return `
                                            <tr>
                                                <td style="padding: 8px; border: 1px solid #b0d8e8;">${loginDate}${nbCo}</td>
                                                <td style="padding: 8px; border: 1px solid #b0d8e8;">${profileLabel}</td>
                                            </tr>
                                        `;
                                        })
                                        .join('')}
                                </tbody>
                            </table>
                        `
                                : '<p style="color: #7f8c8d; font-style: italic;">Aucune connexion enregistrée</p>'
                        }
                    </div>
                `;

        // Section modifications de planning - pour EXPERT uniquement
        if (user.is_expert === 1 && user.resource_id && user.is_admin === 0 && user.is_user === 0) {
            console.log('👤 Expert (pur) détecté - resource_id:', user.resource_id);
            // Filtrer les logs pour ne garder que les modifications de planning de cet expert
            const planningLogs = actionLogs.filter(log => {
                if (log.action_type !== 'planning_modification') return false;
                if (!log.details) return false;
                try {
                    const details = JSON.parse(log.details);
                    return details.resourceId === user.resource_id;
                } catch (e) {
                    console.error('Erreur parsing details:', e, log.details);
                    return false;
                }
            });

            console.log('📝 Modifications planning expert:', planningLogs.length, 'logs trouvés');

            // Grouper par demi-journée et ne garder que la dernière modification
            const lastModsByHalfDay = {};
            planningLogs.forEach(log => {
                const details = JSON.parse(log.details);
                const key = `${details.date}_${details.period}`;
                if (!lastModsByHalfDay[key] || new Date(log.created_at) > new Date(lastModsByHalfDay[key].created_at)) {
                    lastModsByHalfDay[key] = { ...log, details };
                }
            });

            const sortedMods = Object.values(lastModsByHalfDay)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 10);

            console.log('✅ Modifications groupées:', sortedMods.length);

            content += `
                        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h3 style="color: #2e7d32; margin: 0; font-size: 16px;">📝 Dernières modifications de planning (${sortedMods.length})</h3>
                                ${
                                    sortedMods.length > 0
                                        ? `
                                    <button onclick="razLogs('planning', ${userId})" style="padding: 5px 15px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;" onmouseover="this.style.backgroundColor='#c0392b'" onmouseout="this.style.backgroundColor='#e74c3c'">
                                        🗑️ RAZ
                                    </button>
                                `
                                        : ''
                                }
                            </div>
                            ${
                                sortedMods.length > 0
                                    ? `
                                <div style="max-height: 400px; overflow-y: auto; border: 1px solid #a5d6a7; border-radius: 5px;">
                                    <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                                        <thead style="position: sticky; top: 0; background-color: #c8e6c9; z-index: 1;">
                                            <tr>
                                                <th style="padding: 8px; text-align: left; border: 1px solid #a5d6a7;">Détail</th>
                                                <th style="padding: 8px; text-align: left; border: 1px solid #a5d6a7; width: 150px;">Date de modification</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${sortedMods
                                                .map(mod => {
                                                    const d = mod.details;
                                                    const modDate = new Date(d.date);
                                                    const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][
                                                        modDate.getDay()
                                                    ];
                                                    const dateStr = modDate.toLocaleDateString('fr-FR');

                                                    // Fonction pour décoder les activités
                                                    function decodeActivity(rawValue) {
                                                        if (!rawValue || rawValue === '-') return '-';
                                                        const activityMap = {
                                                            1: '❓ Indisponible',
                                                            2: "⏳ En attente d'affectation",
                                                            3: '📞 SAMU (Déploiement)',
                                                            4: '📞 SAMU (Dev. usages)',
                                                            5: '📄 ANS (Déploiement)',
                                                            6: '👨‍🏫 ANS (Dev. usages)',
                                                            7: '☑️ Qualification',
                                                            8: '📖 Divers',
                                                            9: '📊 Analyse',
                                                            10: '🔧 MCO',
                                                            11: '📞 Astreinte',
                                                            12: '🎯 Missions ponctuelles',
                                                            13: '📝 Documentation'
                                                        };
                                                        return activityMap[rawValue] || rawValue;
                                                    }

                                                    let createdAt = mod.created_at;
                                                    if (!createdAt.endsWith('Z') && !createdAt.includes('+')) {
                                                        createdAt += 'Z';
                                                    }
                                                    const modifDateTime = new Date(createdAt);
                                                    const modifDateStr = modifDateTime.toLocaleDateString('fr-FR');
                                                    const modifTimeStr = modifDateTime.toLocaleTimeString('fr-FR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    });

                                                    return `
                                                    <tr style="background-color: white;">
                                                        <td style="padding: 8px; border: 1px solid #a5d6a7;">
                                                            <strong>${dayName} ${dateStr} ${d.period}</strong><br>
                                                            Affectation: ${decodeActivity(d.activity)}<br>
                                                            Localisation: ${d.activity === '1' ? '-' : d.location || '-'}
                                                        </td>
                                                        <td style="padding: 8px; border: 1px solid #a5d6a7; white-space: nowrap;">
                                                            ${modifDateStr}<br>
                                                            <span style="color: #666; font-size: 11px;">${modifTimeStr}</span>
                                                        </td>
                                                    </tr>
                                                `;
                                                })
                                                .join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `
                                    : '<p style="color: #7f8c8d; font-style: italic;">Aucune modification de planning</p>'
                            }
                        </div>
                    `;
        }

        // Section modifications de planning - pour ADMIN et USER (ou expert qui est aussi admin/user)
        else if (user.is_admin === 1 || user.is_user === 1) {
            console.log('👨‍💼 Admin/User détecté');
            console.log('   is_admin:', user.is_admin);
            console.log('   is_user:', user.is_user);
            console.log('   Total action logs reçus:', actionLogs.length);

            // Afficher tous les types d'actions
            const actionTypes = actionLogs.map(log => log.action_type);
            console.log("   Types d'actions:", actionTypes);

            // Filtrer les logs de modifications de planning
            const planningLogs = actionLogs.filter(log => {
                const isPlanning = log.action_type === 'planning_modification';
                const hasDetails = !!log.details;
                console.log(
                    `   Log ${log.id}: type=${log.action_type}, hasDetails=${hasDetails}, isPlanning=${isPlanning}`
                );
                return isPlanning && hasDetails;
            });

            console.log('📝 Modifications planning admin/user:', planningLogs.length, 'logs trouvés');

            if (planningLogs.length > 0) {
                console.log('   Premier log planning:', planningLogs[0]);
                console.log('   Détails du premier log:', planningLogs[0].details);
                try {
                    const parsed = JSON.parse(planningLogs[0].details);
                    console.log('   Détails parsés:', parsed);
                    console.log('   Champs présents:', Object.keys(parsed));
                } catch (e) {
                    console.error('   Erreur parsing:', e);
                }
            }

            // Grouper par demi-journée et ne garder que la dernière modification
            const lastModsByHalfDay = {};
            planningLogs.forEach(log => {
                try {
                    const details = JSON.parse(log.details);
                    const key = `${details.resourceId}_${details.date}_${details.period}`;
                    console.log(`   Groupage: key=${key}, date=${log.created_at}`);
                    if (
                        !lastModsByHalfDay[key] ||
                        new Date(log.created_at) > new Date(lastModsByHalfDay[key].created_at)
                    ) {
                        lastModsByHalfDay[key] = { ...log, details };
                    }
                } catch (e) {
                    console.error('   Erreur groupage log:', e, log);
                }
            });

            const sortedMods = Object.values(lastModsByHalfDay)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 10);

            console.log('✅ Modifications groupées:', sortedMods.length);
            if (sortedMods.length > 0) {
                console.log('   Première modif groupée:', sortedMods[0]);
            }

            content += `
                        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h3 style="color: #2e7d32; margin: 0; font-size: 16px;">📝 Dernières modifications de planning (${sortedMods.length})</h3>
                                ${
                                    sortedMods.length > 0
                                        ? `
                                    <button onclick="razLogs('planning', ${userId})" style="padding: 5px 15px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;" onmouseover="this.style.backgroundColor='#c0392b'" onmouseout="this.style.backgroundColor='#e74c3c'">
                                        🗑️ RAZ
                                    </button>
                                `
                                        : ''
                                }
                            </div>
                            ${
                                sortedMods.length > 0
                                    ? `
                                <div style="max-height: 400px; overflow-y: auto; border: 1px solid #a5d6a7; border-radius: 5px;">
                                    <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                                        <thead style="position: sticky; top: 0; background-color: #c8e6c9; z-index: 1;">
                                            <tr>
                                                <th style="padding: 8px; text-align: left; border: 1px solid #a5d6a7;">Détail</th>
                                                <th style="padding: 8px; text-align: left; border: 1px solid #a5d6a7; width: 150px;">Date de modification</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${sortedMods
                                                .map(mod => {
                                                    const d = mod.details;
                                                    const modDate = new Date(d.date);
                                                    const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][
                                                        modDate.getDay()
                                                    ];
                                                    const dateStr = modDate.toLocaleDateString('fr-FR');

                                                    // Trouver le nom de l'expert
                                                    const resource = resources.find(r => r.id === d.resourceId);
                                                    const expertName = resource
                                                        ? `${resource.prenom} ${resource.nom}`
                                                        : 'Expert inconnu';

                                                    // Fonction pour décoder les activités
                                                    function decodeActivity(rawValue) {
                                                        if (!rawValue || rawValue === '-') return '-';
                                                        const activityMap = {
                                                            1: '❓ Indisponible',
                                                            2: "⏳ En attente d'affectation",
                                                            3: '📞 SAMU (Déploiement)',
                                                            4: '📞 SAMU (Dev. usages)',
                                                            5: '📄 ANS (Déploiement)',
                                                            6: '👨‍🏫 ANS (Dev. usages)',
                                                            7: '☑️ Qualification',
                                                            8: '📖 Divers',
                                                            9: '📊 Analyse',
                                                            10: '🔧 MCO',
                                                            11: '📞 Astreinte',
                                                            12: '🎯 Missions ponctuelles',
                                                            13: '📝 Documentation'
                                                        };
                                                        return activityMap[rawValue] || rawValue;
                                                    }

                                                    let createdAt = mod.created_at;
                                                    if (!createdAt.endsWith('Z') && !createdAt.includes('+')) {
                                                        createdAt += 'Z';
                                                    }
                                                    const modifDateTime = new Date(createdAt);
                                                    const modifDateStr = modifDateTime.toLocaleDateString('fr-FR');
                                                    const modifTimeStr = modifDateTime.toLocaleTimeString('fr-FR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    });

                                                    return `
                                                    <tr style="background-color: white;">
                                                        <td style="padding: 8px; border: 1px solid #a5d6a7;">
                                                            <strong>${dayName} ${dateStr} ${d.period}</strong><br>
                                                            Expert: ${expertName}<br>
                                                            Affectation: ${decodeActivity(d.activity)}<br>
                                                            Localisation: ${d.activity === '1' ? '-' : d.location || '-'}
                                                        </td>
                                                        <td style="padding: 8px; border: 1px solid #a5d6a7; white-space: nowrap;">
                                                            ${modifDateStr}<br>
                                                            <span style="color: #666; font-size: 11px;">${modifTimeStr}</span>
                                                        </td>
                                                    </tr>
                                                `;
                                                })
                                                .join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `
                                    : '<p style="color: #7f8c8d; font-style: italic;">Aucune modification de planning</p>'
                            }
                        </div>
                    `;

            // Section demandes d'affectation envoyées - pour ADMIN et USER
            const emailLogs = actionLogs.filter(log => log.action_type === 'email_request' && log.details).slice(0, 10);

            content += `
                        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h3 style="color: #856404; margin: 0; font-size: 16px;">📧 Envoi de demandes d'affectation (${emailLogs.length})</h3>
                                ${
                                    emailLogs.length > 0
                                        ? `
                                    <button onclick="razLogs('emails', ${userId})" style="padding: 5px 15px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;" onmouseover="this.style.backgroundColor='#c0392b'" onmouseout="this.style.backgroundColor='#e74c3c'">
                                        🗑️ RAZ
                                    </button>
                                `
                                        : ''
                                }
                            </div>
                            ${
                                emailLogs.length > 0
                                    ? `
                                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background-color: #ffe5a0;">
                                            <th style="padding: 8px; text-align: left; border: 1px solid #ffd580;">Détail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${emailLogs
                                            .map(log => {
                                                const details = JSON.parse(log.details);
                                                const reqDate = new Date(details.date);
                                                const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][
                                                    reqDate.getDay()
                                                ];
                                                const dateStr = reqDate.toLocaleDateString('fr-FR');

                                                // Trouver le nom de l'expert
                                                const resource = resources.find(r => r.id === details.resourceId);
                                                const expertName = resource
                                                    ? `${resource.prenom} ${resource.nom}`
                                                    : 'Expert inconnu';

                                                return `
                                                <tr>
                                                    <td style="padding: 8px; border: 1px solid #ffd580;">
                                                        ${dayName} ${dateStr} - ${expertName}
                                                    </td>
                                                </tr>
                                            `;
                                            })
                                            .join('')}
                                    </tbody>
                                </table>
                            `
                                    : '<p style="color: #856404; font-style: italic;">Aucune demande envoyée</p>'
                            }
                        </div>
                    `;
        }

        // Stocker les données pour l'export CSV
        currentUserLogsData = {
            user: user,
            connectionLogs: userLogs,
            actionLogs: actionLogs
        };

        document.getElementById('userDetailsContent').innerHTML = content;
        document.getElementById('userDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Erreur chargement détails utilisateur:', error);
        alert("Erreur lors du chargement des détails de l'utilisateur: " + error.message);
    }
}

function closeUserDetailsModal() {
    document.getElementById('userDetailsModal').style.display = 'none';
}

// Fonction pour télécharger tous les logs d'un utilisateur en CSV
let currentUserLogsData = null; // Stockage temporaire des données

async function downloadUserLogs() {
    if (!currentUserLogsData) {
        alert('❌ Aucune donnée utilisateur chargée');
        return;
    }

    const { user, connectionLogs, actionLogs } = currentUserLogsData;

    // Créer le contenu CSV
    let csvContent = '\uFEFF'; // BOM UTF-8 pour Excel

    // En-tête du fichier
    csvContent += `Export des logs - ${user.prenom} ${user.nom} (${user.username})\n`;
    csvContent += `Date d'export: ${new Date().toLocaleString('fr-FR')}\n\n`;

    // === SECTION 1: LOGS DE CONNEXION ===
    csvContent += '=== LOGS DE CONNEXION ===\n';
    csvContent += 'Date/Heure;Type\n';

    if (connectionLogs && connectionLogs.length > 0) {
        connectionLogs.forEach(log => {
            csvContent += `${log.login_time};Connexion\n`;
        });
    } else {
        csvContent += 'Aucune connexion enregistrée\n';
    }

    csvContent += '\n';

    // === SECTION 2: MODIFICATIONS DE PLANNING ===
    csvContent += '=== MODIFICATIONS DE PLANNING ===\n';
    csvContent += 'Date;Période;Ressource;Disponibilité;Activité;Localisation;Date de modification\n';

    const planningLogs = actionLogs.filter(log => log.action_type === 'planning_modification');

    if (planningLogs.length > 0) {
        planningLogs.forEach(log => {
            try {
                const details = JSON.parse(log.details);
                const date = details.date || '-';
                const period = details.period || '-';
                const resourceId = details.resourceId || '-';
                const availability = details.availability || '-';
                const activity = details.activity || '-';
                // Si activité = "1" (Indisponible), forcer localisation à "-"
                const location = activity === '1' || activity === 'Indisponible' ? '-' : details.location || '-';
                const modifDate = new Date(log.created_at).toLocaleString('fr-FR');

                // Échapper les guillemets et virgules pour CSV
                const escapeCsv = str => {
                    if (typeof str !== 'string') return str;
                    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                        return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                };

                csvContent += `${escapeCsv(date)};${escapeCsv(period)};${resourceId};${escapeCsv(availability)};${escapeCsv(activity)};${escapeCsv(location)};${modifDate}\n`;
            } catch (e) {
                console.error('Erreur parsing log:', e, log);
            }
        });
    } else {
        csvContent += 'Aucune modification de planning\n';
    }

    csvContent += '\n';

    // === SECTION 3: DEMANDES D'AFFECTATION ===
    csvContent += "=== DEMANDES D'AFFECTATION ENVOYÉES ===\n";
    csvContent += "Expert;Période;Message;Date d'envoi\n";

    const emailLogs = actionLogs.filter(log => log.action_type === 'email_request');

    if (emailLogs.length > 0) {
        emailLogs.forEach(log => {
            try {
                const details = JSON.parse(log.details);
                const expertName = details.expertName || '-';
                const period = `Du ${details.startDate} (${details.startPeriod}) au ${details.endDate} (${details.endPeriod})`;
                const message = details.message || '-';
                const sentDate = new Date(log.created_at).toLocaleString('fr-FR');

                const escapeCsv = str => {
                    if (typeof str !== 'string') return str;
                    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                        return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                };

                csvContent += `${escapeCsv(expertName)};${escapeCsv(period)};${escapeCsv(message)};${sentDate}\n`;
            } catch (e) {
                console.error('Erreur parsing email log:', e, log);
            }
        });
    } else {
        csvContent += 'Aucune demande envoyée\n';
    }

    // Créer le blob et télécharger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const filename = `logs_${user.username}_${new Date().toISOString().split('T')[0]}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('✅ Export CSV généré:', filename);
}

// Fonction pour nettoyer les logs (RAZ)
async function razLogs(type, userId) {
    const messages = {
        connexions: 'Êtes-vous sûr de vouloir supprimer TOUTES les connexions de cet utilisateur ?',
        planning: 'Êtes-vous sûr de vouloir supprimer TOUTES les modifications de planning de cet utilisateur ?',
        emails: "Êtes-vous sûr de vouloir supprimer TOUTES les demandes d'affectation envoyées par cet utilisateur ?"
    };

    if (!confirm(messages[type] + '\n\n⚠️ Cette action est IRRÉVERSIBLE !')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/logs/raz`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ type, userId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la suppression');
        }

        const result = await response.json();
        alert(`✅ ${result.deleted} enregistrement(s) supprimé(s)`);

        // Recharger le modal
        await showUserDetails(userId);
    } catch (error) {
        console.error('Erreur RAZ logs:', error);
        alert('❌ Erreur lors de la suppression: ' + error.message);
    }
}
