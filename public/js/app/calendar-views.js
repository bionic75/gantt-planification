// Application principale : calendar-views
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== NOTIFICATIONS NOUVELLES AFFECTATIONS v12.0 ==========

async function loadNewAssignments() {
    console.log('🔔 Vérification des notifications...');
    try {
        const response = await fetch(`${API_URL}/notifications/count`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            console.log('📊 Notifications:', data.count);

            const badge = document.getElementById('notificationBadge');
            const count = document.getElementById('notificationCount');

            if (data.count > 0) {
                console.log('✅ Badge affiché avec count:', data.count);
                badge.style.display = 'flex';
                count.textContent = data.count;
            } else {
                console.log('⚪ Badge caché, pas de notifications');
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Erreur chargement notifications:', error);
    }
}

async function openNewAssignmentsModal() {
    try {
        const response = await fetch(`${API_URL}/notifications/list`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            console.log('🔍 Notifications reçues:', data);

            // Marquer les notifications comme lues dès l'ouverture de la modal
            await markNotificationsAsRead();

            const content = document.getElementById('newAssignmentsContent');

            if (data.notifications.length === 0) {
                content.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Aucune nouvelle affectation</p>';
            } else {
                let html = '<table style="width: 100%; border-collapse: collapse;">';
                html += `<thead>
                            <tr style="background-color: #34495e; color: white;">
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Date</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Période</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Affectation</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Localisation</th>
                                <th style="padding: 10px; border: 1px solid #bdc3c7;">Auteur</th>
                            </tr>
                        </thead><tbody>`;

                data.notifications.forEach(notif => {
                    // Parser la date correctement (format YYYY-MM-DD)
                    const [year, month, day] = notif.date.split('-').map(Number);
                    const notifDate = new Date(year, month - 1, day);

                    // Afficher la localisation si disponible
                    const localisationDisplay = notif.localisation || '-';

                    html += `<tr style="background-color: white;">
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notifDate.toLocaleDateString('fr-FR')}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notif.period}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notif.activity_name || 'Non défini'}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${localisationDisplay}</td>
                                <td style="padding: 8px; border: 1px solid #bdc3c7;">${notif.requester_name || 'Système'}</td>
                            </tr>`;
                });

                html += '</tbody></table>';
                content.innerHTML = html;
            }

            document.getElementById('newAssignmentsModal').classList.add('active');

            // Marquer les notifications comme lues
            await markNotificationsAsRead();
        }
    } catch (error) {
        console.error('Erreur ouverture modal notifications:', error);
    }
}

async function markNotificationsAsRead() {
    try {
        const response = await fetch(`${API_URL}/notifications/mark-read`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            console.log('✅ Notifications marquées comme lues');
        }
    } catch (error) {
        console.error('Erreur marquage notifications:', error);
    }
}

function closeNewAssignmentsModal() {
    document.getElementById('newAssignmentsModal').classList.remove('active');
    // Recharger le badge pour refléter qu'il n'y a plus de notifications
    loadNewAssignments();
}

// ========== VUE CALENDRIER MENSUEL ==========

// Variables pour la navigation du calendrier mensuel
let calendarViewYear = null;
let calendarViewMonth = null;

function openMonthlyCalendarView(customYear, customMonth) {
    // Utiliser les paramètres si fournis, sinon les valeurs des sélecteurs
    const year = customYear !== undefined ? customYear : parseInt(document.getElementById('yearSelect').value);
    const month = customMonth !== undefined ? customMonth : parseInt(document.getElementById('monthSelect').value);

    // Stocker pour la navigation
    calendarViewYear = year;
    calendarViewMonth = month;

    renderMonthlyCalendarView(year, month);
}

function renderMonthlyCalendarView(year, month) {
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

    const modal = document.getElementById('monthlyCalendarModal');
    const content = document.getElementById('monthlyCalendarContent');

    // Générer le calendrier
    const calendarHTML = generateMonthlyCalendarView(year, month);

    content.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: center; align-items: center; gap: 20px;">
                        <button onclick="navigateCalendarView(-1)" style="padding: 10px 20px; background-color: #1D70B7; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;" title="Mois précédent">
                            ◀ 
                        </button>
                        <h2 style="margin: 0; color: #2c3e50; min-width: 200px;">${monthNames[month]} ${year}</h2>
                        <button onclick="navigateCalendarView(1)" style="padding: 10px 20px; background-color: #1D70B7; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;" title="Mois suivant">
                             ▶
                        </button>
                    </div>
                    <p style="color: #7f8c8d; font-size: 13px; margin-top: 10px;">Vue d'ensemble des disponibilités par demi-journée</p>
                </div>
                ${calendarHTML}
            `;

    modal.classList.add('active');
}

function navigateCalendarView(direction) {
    // direction: -1 pour mois précédent, +1 pour mois suivant
    calendarViewMonth += direction;

    // Gérer le changement d'année
    if (calendarViewMonth < 0) {
        calendarViewMonth = 11;
        calendarViewYear--;
    } else if (calendarViewMonth > 11) {
        calendarViewMonth = 0;
        calendarViewYear++;
    }

    renderMonthlyCalendarView(calendarViewYear, calendarViewMonth);
}

function generateMonthlyCalendarView(year, month) {
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; // semaine ISO : le lundi ouvre la ligne
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = lundi

    // Filtrer les ressources actives et disponibles
    const filterSelect = document.getElementById('resourceFilter');
    const selectedOptions = Array.from(filterSelect.selectedOptions).map(opt => opt.value);
    let filteredResources = resources.filter(r => r.actif);

    if (!selectedOptions.includes('') && selectedOptions.length > 0) {
        const selectedIds = selectedOptions.map(id => parseInt(id));
        filteredResources = filteredResources.filter(r => selectedIds.includes(r.id));
    }

    // Générer des couleurs distinctes pour chaque expert
    const expertColors = {};
    const baseColors = [
        '#e74c3c',
        '#3498db',
        '#2ecc71',
        '#f39c12',
        '#9b59b6',
        '#1abc9c',
        '#e67e22',
        '#34495e',
        '#16a085',
        '#27ae60',
        '#2980b9',
        '#8e44ad',
        '#c0392b',
        '#d35400',
        '#7f8c8d'
    ];
    filteredResources.forEach((resource, index) => {
        expertColors[resource.id] = baseColors[index % baseColors.length];
    });

    // Table avec colonnes de largeur fixe égale (100% / 7 = ~14.28%)
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">';

    // En-tête des jours de la semaine avec largeur fixe
    html += '<thead><tr>';
    html += `<th style="width: 6%; padding: 10px; background-color: #2c3e50; color: white; border: 1px solid #bdc3c7; font-weight: bold; font-size: 10px;">Sem.</th>`;
    dayNames.forEach((day, index) => {
        const isWeekend = index === 5 || index === 6;
        html += `<th style="width: 13.43%; padding: 10px; background-color: ${isWeekend ? '#ffc107' : '#1D70B7'}; color: ${isWeekend ? '#333' : 'white'}; border: 1px solid #bdc3c7; font-weight: bold;">${day}</th>`;
    });
    html += '</tr></thead><tbody>';

    let day = 1;
    const totalDays = startDayOfWeek + lastDay;
    const numWeeks = Math.ceil(totalDays / 7);

    for (let week = 0; week < numWeeks; week++) {
        html += '<tr>';

        // Cellule numéro de semaine (ISO 8601), calculée sur la date réelle de début de ligne
        const rowFirstDate = new Date(year, month, 1 - startDayOfWeek + week * 7);
        const rowWeekNum = getISOWeekNumber(rowFirstDate);
        html += `<td style="width: 6%; padding: 5px; border: 1px solid #bdc3c7; background-color: #ecf0f1; text-align: center; vertical-align: middle; font-weight: bold; color: #2c3e50; font-size: 12px;">${rowWeekNum}</td>`;

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            if ((week === 0 && dayOfWeek < startDayOfWeek) || day > lastDay) {
                html +=
                    '<td style="width: 13.43%; padding: 10px; border: 1px solid #bdc3c7; background-color: #f5f5f5; min-height: 100px; vertical-align: top;"></td>';
            } else {
                // CORRECTION : Format correct YYYY-MM-DD avec padding et month+1
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
                const date = new Date(year, month, day);

                // Vérifier si c'est le jour actuel
                const today = new Date();
                const isToday =
                    date.getDate() === today.getDate() &&
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();

                // Récupérer les événements pour cette date
                const allSpecialDates = getAllSpecialDateInfo(dateKey);

                // Vérifier les congés scolaires
                const inZoneA = isDateInHoliday(dateKey, 'zoneA');
                const inZoneB = isDateInHoliday(dateKey, 'zoneB');
                const inZoneC = isDateInHoliday(dateKey, 'zoneC');

                // Collecter les experts disponibles pour AM et PM
                const amExperts = [];
                const pmExperts = [];

                filteredResources.forEach(resource => {
                    const checkDate = new Date(year, month, day);
                    const isAccessible = isDateAccessible(resource, checkDate);

                    if (isAccessible) {
                        // Vérifier AM
                        const amAvailKey = `${resource.id}_available_${dateKey}_AM`;
                        const amAvailValue = scheduleData[amAvailKey] || '1';
                        if (amAvailValue === '2') {
                            amExperts.push({
                                trigramme: resource.trigramme,
                                color: expertColors[resource.id]
                            });
                        }

                        // Vérifier PM
                        const pmAvailKey = `${resource.id}_available_${dateKey}_PM`;
                        const pmAvailValue = scheduleData[pmAvailKey] || '1';
                        if (pmAvailValue === '2') {
                            pmExperts.push({
                                trigramme: resource.trigramme,
                                color: expertColors[resource.id]
                            });
                        }
                    }
                });

                // Construire le HTML des événements
                let eventsHTML = '';

                // Barres de congés scolaires
                if (inZoneA || inZoneB || inZoneC) {
                    eventsHTML += '<div style="display: flex; gap: 2px; margin-bottom: 4px;">';
                    if (inZoneA)
                        eventsHTML +=
                            '<div style="flex: 1; height: 3px; background-color: #e91e63;" title="Zone A"></div>';
                    if (inZoneB)
                        eventsHTML +=
                            '<div style="flex: 1; height: 3px; background-color: #2196f3;" title="Zone B"></div>';
                    if (inZoneC)
                        eventsHTML +=
                            '<div style="flex: 1; height: 3px; background-color: #ff9800;" title="Zone C"></div>';
                    eventsHTML += '</div>';
                }

                // Cartouches événements — affichés dans la zone correspondant à leur period
                if (allSpecialDates.length > 0) {
                    // Séparer AM, PM, FULL
                    const amEvents = allSpecialDates.filter(sd => sd.config && sd.period === 'AM');
                    const pmEvents = allSpecialDates.filter(sd => sd.config && sd.period === 'PM');
                    const fullEvents = allSpecialDates.filter(sd => sd.config && (!sd.period || sd.period === 'FULL'));

                    const renderBadges = (list, suffix = '') =>
                        list
                            .map(sd => {
                                const cfg = sd.config;
                                const eventLabel = cfg.shown || cfg.label || sd.summary || 'JF';
                                const locCourt = cfg.locationLibelleCourt
                                    ? cfg.locationLibelleCourt
                                    : cfg.eventId
                                      ? 'NON DÉFINI'
                                      : null; // custom event sans localisation
                                const lbl = locCourt ? `${locCourt} | ${eventLabel}` : eventLabel;
                                return `<span title="${evtTip(cfg, locCourt, lbl)}${suffix}" style="font-size: 7px; padding: 1px 3px; border-radius: 3px; font-weight: bold; background-color: ${cfg.bgColor || '#ffeb3b'}; color: ${cfg.textColor || '#000'}; border: 1px solid ${cfg.borderColor || '#fbc02d'};">${cfg.typeIcon ? uiIcon(cfg.typeIcon, 8, 'margin-right:2px;') : ''}${lbl}</span>`;
                            })
                            .join('');

                    if (fullEvents.length > 0) {
                        eventsHTML += `<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 4px;">${renderBadges(fullEvents)}</div>`;
                    }
                    if (amEvents.length > 0) {
                        eventsHTML += `<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 2px;">${renderBadges(amEvents, ' (matin)')}</div>`;
                    }
                    if (pmEvents.length > 0) {
                        eventsHTML += `<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 4px;">${renderBadges(pmEvents, ' (après-midi)')}</div>`;
                    }
                }

                html += `<td style="width: 13.43%; padding: 5px; border: 1px solid #bdc3c7; ${isWeekend ? 'background-color: #fff8e1;' : isToday ? 'background-color: #d4edda;' : ''} vertical-align: top; min-height: 100px;">
                            <div style="font-weight: bold; text-align: center; margin-bottom: 4px; padding: 4px; background-color: ${isToday ? '#28a745' : '#34495e'}; color: white; border-radius: 3px; font-size: 13px;">${day}</div>
                            
                            ${eventsHTML}
                            
                            <div style="margin-bottom: 5px;">
                                <div style="font-size: 10px; font-weight: bold; color: #2c3e50; margin-bottom: 3px;">☀️ Matin:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                                    ${
                                        amExperts.length > 0
                                            ? amExperts
                                                  .map(
                                                      expert =>
                                                          `<span style="font-size: 9px; padding: 2px 5px; background-color: ${expert.color}; color: white; border-radius: 3px; font-weight: bold;">${expert.trigramme}</span>`
                                                  )
                                                  .join('')
                                            : '<span style="font-size: 9px; color: #95a5a6; font-style: italic;">Aucun</span>'
                                    }
                                </div>
                            </div>
                            
                            <div>
                                <div style="font-size: 10px; font-weight: bold; color: #2c3e50; margin-bottom: 3px;">🌙 A-midi:</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                                    ${
                                        pmExperts.length > 0
                                            ? pmExperts
                                                  .map(
                                                      expert =>
                                                          `<span style="font-size: 9px; padding: 2px 5px; background-color: ${expert.color}; color: white; border-radius: 3px; font-weight: bold;">${expert.trigramme}</span>`
                                                  )
                                                  .join('')
                                            : '<span style="font-size: 9px; color: #95a5a6; font-style: italic;">Aucun</span>'
                                    }
                                </div>
                            </div>
                        </td>`;

                day++;
            }
        }

        html += '</tr>';
    }

    html += '</tbody></table>';

    // Ajouter la légende des couleurs
    html += '<div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">';
    html += '<div style="font-weight: bold; margin-bottom: 10px; color: #2c3e50;">Légende des experts:</div>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    filteredResources.forEach(resource => {
        html += `<div style="display: flex; align-items: center; gap: 5px;">
                    <span style="width: 20px; height: 20px; background-color: ${expertColors[resource.id]}; border-radius: 3px; display: inline-block;"></span>
                    <span style="font-size: 12px;">${resource.trigramme} - ${resource.nom} ${resource.prenom}</span>
                </div>`;
    });
    html += '</div></div>';

    return html;
}

function printMonthlyCalendar() {
    // Créer une fenêtre d'impression dédiée au calendrier mensuel
    const printWindow = window.open('', '_blank');

    // Récupérer le contenu du calendrier
    const calendarContent = document.getElementById('monthlyCalendarContent').innerHTML;
    const modalTitle = document.querySelector('#monthlyCalendarModal h3').textContent;

    // Récupérer les flèches de navigation et le titre du mois
    const navSection = document.querySelector('#monthlyCalendarModal .modal-content > div:first-of-type');
    let headerHTML = '';
    if (navSection) {
        // Extraire juste le titre du mois (sans les boutons)
        const monthTitle = navSection.querySelector('span')?.textContent || '';
        headerHTML = `<h2 style="text-align: center; color: #1565c0; margin-bottom: 10px;">${monthTitle}</h2>`;
    }

    printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${modalTitle}</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            margin: 20px;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        h3 {
                            color: #1565c0;
                            border-left: 4px solid #1565c0;
                            padding-left: 10px;
                            margin-bottom: 20px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            table-layout: fixed;
                        }
                        th, td {
                            border: 1px solid #bdc3c7;
                            padding: 5px;
                            vertical-align: top;
                        }
                        @media print {
                            body {
                                margin: 10px;
                            }
                            @page {
                                size: landscape;
                                margin: 10mm;
                            }
                        }
                    </style>
                </head>
                <body>
                    <h3>| ${modalTitle}</h3>
                    ${headerHTML}
                    ${calendarContent}
                </body>
                </html>
            `);

    printWindow.document.close();

    // Attendre que le contenu soit chargé avant d'imprimer
    printWindow.onload = function () {
        printWindow.print();
        // Fermer la fenêtre après l'impression (optionnel)
        // printWindow.close();
    };

    // Fallback si onload ne se déclenche pas
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

function closeMonthlyCalendarModal() {
    const modal = document.getElementById('monthlyCalendarModal');
    modal.classList.remove('active');
}

// ========== CALENDRIER DE VISUALISATION DES ÉVÉNEMENTS ==========

let eventsCalendarYear = new Date().getFullYear();
let eventsCalendarMonth = new Date().getMonth();

function openEventsCalendarModal() {
    // Initialiser au mois courant
    eventsCalendarYear = new Date().getFullYear();
    eventsCalendarMonth = new Date().getMonth();

    updateEventsCalendar();

    document.getElementById('eventsCalendarModal').classList.add('active');
}

function closeEventsCalendarModal() {
    document.getElementById('eventsCalendarModal').classList.remove('active');
}

function eventsCalendarPrevMonth() {
    eventsCalendarMonth--;
    if (eventsCalendarMonth < 0) {
        eventsCalendarMonth = 11;
        eventsCalendarYear--;
    }
    updateEventsCalendar();
}

function eventsCalendarNextMonth() {
    eventsCalendarMonth++;
    if (eventsCalendarMonth > 11) {
        eventsCalendarMonth = 0;
        eventsCalendarYear++;
    }
    updateEventsCalendar();
}

function updateEventsCalendar() {
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

    document.getElementById('eventsCalendarTitle').textContent =
        `${monthNames[eventsCalendarMonth]} ${eventsCalendarYear}`;

    const calendarHTML = generateEventsCalendarView(eventsCalendarYear, eventsCalendarMonth);
    document.getElementById('eventsCalendarContent').innerHTML = calendarHTML;
}

function generateEventsCalendarView(year, month) {
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; // semaine ISO : le lundi ouvre la ligne
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = lundi

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">';

    // En-tête : colonne semaine + 7 jours
    html += '<thead><tr>';
    html += `<th style="width: 38px; padding: 10px 4px; background-color: #546e7a; color: white; border: 1px solid #bdc3c7; font-weight: bold; font-size: 10px; text-align: center;">Sem.</th>`;
    dayNames.forEach((day, index) => {
        const isWeekend = index === 5 || index === 6;
        html += `<th style="padding: 10px; background-color: ${isWeekend ? '#ffc107' : '#00bcd4'}; color: ${isWeekend ? '#333' : 'white'}; border: 1px solid #bdc3c7; font-weight: bold;">${day}</th>`;
    });
    html += '</tr></thead><tbody>';

    let day = 1;
    const totalDays = startDayOfWeek + lastDay;
    const numWeeks = Math.ceil(totalDays / 7);

    for (let week = 0; week < numWeeks; week++) {
        // Calculer le numéro de semaine ISO pour cette ligne
        const firstDayOfWeekRow =
            week === 0 ? new Date(year, month, 1) : new Date(year, month, week * 7 - startDayOfWeek + 1);
        const weekNum = getISOWeekNumber(firstDayOfWeekRow);
        html += `<tr><td style="width: 38px; padding: 4px 2px; border: 1px solid #bdc3c7; background-color: #eceff1; color: #546e7a; font-weight: bold; font-size: 11px; text-align: center; vertical-align: middle;">${weekNum}</td>`;

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            if ((week === 0 && dayOfWeek < startDayOfWeek) || day > lastDay) {
                html +=
                    '<td style="padding: 10px; border: 1px solid #bdc3c7; background-color: #f5f5f5; min-height: 100px; vertical-align: top;"></td>';
            } else {
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
                const date = new Date(year, month, day);

                // Vérifier si c'est le jour actuel
                const today = new Date();
                const isToday =
                    date.getDate() === today.getDate() &&
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();

                // Récupérer les événements pour cette date
                const allSpecialDates = getAllSpecialDateInfo(dateKey);

                // Vérifier les congés scolaires
                const inZoneA = isDateInHoliday(dateKey, 'zoneA');
                const inZoneB = isDateInHoliday(dateKey, 'zoneB');
                const inZoneC = isDateInHoliday(dateKey, 'zoneC');

                // Construire le HTML des événements
                let eventsHTML = '';
                let hasContent = false;

                // Barres de congés scolaires
                if (inZoneA || inZoneB || inZoneC) {
                    hasContent = true;
                    eventsHTML += '<div style="display: flex; gap: 2px; margin-bottom: 6px;">';
                    if (inZoneA)
                        eventsHTML +=
                            '<div style="flex: 1; height: 4px; background-color: #e91e63; border-radius: 2px;" title="Zone A"></div>';
                    if (inZoneB)
                        eventsHTML +=
                            '<div style="flex: 1; height: 4px; background-color: #2196f3; border-radius: 2px;" title="Zone B"></div>';
                    if (inZoneC)
                        eventsHTML +=
                            '<div style="flex: 1; height: 4px; background-color: #ff9800; border-radius: 2px;" title="Zone C"></div>';
                    eventsHTML += '</div>';
                }

                // Événements personnalisés (avec label period si demi-journée)
                if (allSpecialDates.length > 0) {
                    hasContent = true;
                    eventsHTML += '<div style="display: flex; flex-direction: column; gap: 3px;">';
                    for (const sd of allSpecialDates) {
                        if (!sd.config) continue;
                        const cfg = sd.config;
                        const eventLabel = cfg.shown || cfg.label || sd.summary || 'Événement';
                        const locCourt = cfg.locationLibelleCourt
                            ? cfg.locationLibelleCourt
                            : cfg.eventId
                              ? 'NON DÉFINI'
                              : null; // custom event sans localisation
                        const displayLabel = locCourt ? `${locCourt} | ${eventLabel}` : eventLabel;
                        const evtPeriod = sd.period || 'FULL';
                        const periodSuffix = evtPeriod === 'AM' ? ' ☀️' : evtPeriod === 'PM' ? ' 🌙' : '';
                        const participantsTooltip =
                            cfg.participants && cfg.participants.length > 0
                                ? `\n👥 ${cfg.participants.join(', ')}`
                                : '';
                        eventsHTML += `<div title="${evtTip(cfg, locCourt, displayLabel)}${participantsTooltip}" style="font-size: 9px; padding: 3px 5px; border-radius: 4px; font-weight: bold; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; background-color: ${cfg.bgColor || '#ffeb3b'}; color: ${cfg.textColor || '#000'}; border: 1px solid ${cfg.borderColor || '#fbc02d'};">${cfg.typeIcon ? uiIcon(cfg.typeIcon, 11, 'margin-right:3px;') : ''}${displayLabel}${periodSuffix}</div>`;
                    }
                    eventsHTML += '</div>';
                }

                // Couleur de fond
                let bgColor = '';
                if (isToday) bgColor = 'background-color: #e0f7fa;';
                else if (isWeekend) bgColor = 'background-color: #fff8e1;';
                else if (hasContent) bgColor = 'background-color: #fafafa;';

                html += `<td style="padding: 8px; border: 1px solid #bdc3c7; ${bgColor} vertical-align: top; min-height: 90px;">
                            <div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: ${isToday ? '#00bcd4' : '#333'};">${day}</div>
                            ${eventsHTML}
                        </td>`;
                day++;
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function printEventsCalendar() {
    const content = document.getElementById('eventsCalendarContent').innerHTML;
    const title = document.getElementById('eventsCalendarTitle').textContent;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Calendrier des événements - ${title}</title>
                    <style>
                        @page { size: landscape; margin: 1cm; }
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { text-align: center; color: #00bcd4; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #bdc3c7; padding: 8px; }
                        th { background-color: #00bcd4 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        td { vertical-align: top; min-height: 80px; }
                        div { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    </style>
                </head>
                <body>
                    <h1>📆 Calendrier des congés et événements - ${title}</h1>
                    ${content}
                </body>
                </html>
            `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}
