// Application principale : planning-tools
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== MISE EN ÉVIDENCE DU JOUR ACTUEL ==========

function highlightToday() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');

    // Sélectionner le mois et l'année actuels
    if (yearSelect && monthSelect) {
        yearSelect.value = currentYear;
        monthSelect.value = currentMonth;

        // Régénérer le planning avec le mois actuel
        updateGantt();
    }

    // Attendre que le Gantt soit généré, puis mettre en évidence aujourd'hui
    setTimeout(() => {
        // Mettre en évidence les cellules du jour actuel
        const allCells = document.querySelectorAll('.gantt-cell');
        allCells.forEach(cell => {
            const cellDate = cell.getAttribute('data-date');
            if (cellDate) {
                const [year, month, day] = cellDate.split('-').map(Number);
                if (year === currentYear && month === currentMonth + 1 && day === currentDay) {
                    cell.style.backgroundColor = '#fff9c4';
                    // Supprimé: cell.style.border = '3px solid #000';
                    cell.style.boxShadow = '0 0 10px rgba(251, 192, 45, 0.5)';
                }
            }
        });

        // Mettre en évidence les en-têtes de colonne pour aujourd'hui
        const headers = document.querySelectorAll('.day-header');
        headers.forEach(header => {
            const headerText = header.textContent.trim();
            // Extraire le numéro du jour (ex: "Lun 5" -> 5)
            const dayMatch = headerText.match(/\d+/);
            if (dayMatch && parseInt(dayMatch[0]) === currentDay) {
                header.style.backgroundColor = '#fbc02d';
                header.style.fontWeight = 'bold';
                // Supprimé: header.style.border = '3px solid #000';
            }
        });
    }, 500);
}

// ========== NETTOYAGE BASE DE DONNÉES ==========

async function cleanupOldFormatData() {
    if (
        !confirm(
            '⚠️ ATTENTION !\n\nCette action va supprimer toutes les anciennes données de planification au format journée (sans AM/PM).\n\nIl est fortement recommandé de faire un backup avant de continuer.\n\nVoulez-vous continuer ?'
        )
    ) {
        return;
    }

    if (!confirm('Êtes-vous vraiment sûr ? Cette action est IRRÉVERSIBLE.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/schedule/cleanup-old-format`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            alert(`✅ Nettoyage terminé !\n\n${data.deleted} entrée(s) supprimée(s)`);
            await loadSchedule();
            updateGantt();
        } else {
            alert('❌ Erreur: ' + (data.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur nettoyage:', error);
        alert('Erreur lors du nettoyage de la base de données');
    }
}

// ========== LOGS DE MODIFICATIONS ==========

async function logModification(description) {
    try {
        await fetch(`${API_URL}/logs/add-modification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ modification: description })
        });
    } catch (error) {
        console.error('Erreur log modification:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== IMPRESSION CALENDRIER RESSOURCE ==========

function printResourceCalendar(resourceId) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    const year = parseInt(document.getElementById('yearSelect').value);
    const month = parseInt(document.getElementById('monthSelect').value);
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

    const calendarHTML = generateResourceCalendarHTML(resourceId, year, month);

    const modal = document.getElementById('printCalendarModal');
    const content = document.getElementById('printCalendarContent');

    content.innerHTML = `
                <div id="calendarToPrint">
                    <div style="text-align: center; margin-bottom: 20px; page-break-after: avoid;">
                        <h2 style="margin: 0; color: #2c3e50;">Planning - ${resource.nom.toUpperCase()} ${resource.prenom}</h2>
                        <h3 style="margin: 5px 0; color: #7f8c8d;">${monthNames[month]} ${year}</h3>
                        <p style="margin: 5px 0; font-size: 13px; color: #95a5a6;">Trigramme: ${resource.trigramme}</p>
                    </div>
                    ${calendarHTML}
                </div>
            `;

    modal.classList.add('active');
}

function generateResourceCalendarHTML(resourceId, year, month) {
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
    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']; // semaine ISO : le lundi ouvre la ligne, donc un seul numéro de semaine par ligne

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = lundi

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">';

    html += '<thead><tr>';
    html += `<th style="width: 8%; padding: 10px; background-color: #2c3e50; color: white; border: 1px solid #bdc3c7; font-size: 10px;">Sem.</th>`;
    dayNames.forEach((day, index) => {
        const isWeekend = index === 5 || index === 6;
        html += `<th style="width: 13.14%; padding: 10px; background-color: ${isWeekend ? '#ffc107' : '#1D70B7'}; color: ${isWeekend ? '#333' : 'white'}; border: 1px solid #bdc3c7;">${day}</th>`;
    });
    html += '</tr></thead><tbody>';

    let day = 1;
    const totalDays = startDayOfWeek + lastDay;
    const numWeeks = Math.ceil(totalDays / 7);

    for (let week = 0; week < numWeeks; week++) {
        html += '<tr>';

        // Calculer le numéro de semaine ISO à partir du premier jour réel de cette ligne
        let weekRefDay = day;
        if (week === 0 && startDayOfWeek > 0) {
            // Première ligne partielle : se référer au 1er du mois
            weekRefDay = 1;
        }
        const weekRefDate = new Date(year, month, Math.min(weekRefDay, lastDay));
        const weekNum = getISOWeekNumber(weekRefDate);
        html += `<td style="width: 8%; padding: 5px; border: 1px solid #bdc3c7; background-color: #ecf0f1; text-align: center; vertical-align: middle; font-weight: bold; color: #2c3e50; font-size: 11px;">${weekNum}</td>`;

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            if ((week === 0 && dayOfWeek < startDayOfWeek) || day > lastDay) {
                html +=
                    '<td style="width: 13.14%; padding: 15px; border: 1px solid #bdc3c7; background-color: #f5f5f5;"></td>';
            } else {
                // CORRECTION : Format correct YYYY-MM-DD avec padding et month+1
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

                // Vérifier si c'est aujourd'hui
                const today = new Date();
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

                const amAvailKey = `${resourceId}_available_${dateKey}_AM`;
                const amActKey = `${resourceId}_activity_${dateKey}_AM`;
                const amLocKey = `${resourceId}_localisation_${dateKey}_AM`;

                const pmAvailKey = `${resourceId}_available_${dateKey}_PM`;
                const pmActKey = `${resourceId}_activity_${dateKey}_PM`;
                const pmLocKey = `${resourceId}_localisation_${dateKey}_PM`;

                const amAvail = scheduleData[amAvailKey] || '1';
                const amAct = scheduleData[amActKey] || '1';
                const amLoc = scheduleData[amLocKey] || '-';

                const pmAvail = scheduleData[pmAvailKey] || '1';
                const pmAct = scheduleData[pmActKey] || '1';
                const pmLoc = scheduleData[pmLocKey] || '-';

                const amStatus = getActivityLabel(amAvail, amAct, amLoc);
                const pmStatus = getActivityLabel(pmAvail, pmAct, pmLoc);

                // Vérifier ASTR/HNO pour AM et PM
                const amAstrHno = getAstrHnoForCell(resourceId, dateKey, 'AM');
                const pmAstrHno = getAstrHnoForCell(resourceId, dateKey, 'PM');

                html += `<td style="width: 13.14%; padding: 5px; border: 1px solid #bdc3c7; ${isWeekend ? 'background-color: #fff8e1;' : isToday ? 'background-color: #d4edda;' : ''} vertical-align: top;">
                            <div style="font-weight: bold; text-align: center; margin-bottom: 5px; padding: 3px; background-color: ${isToday ? '#28a745' : '#34495e'}; color: white; border-radius: 3px;">${day}</div>
                            <div style="position: relative; font-size: 10px; margin-bottom: 3px; padding: 5px; background-color: ${amStatus.color}; color: white; border-radius: 3px;">
                                <strong>AM:</strong> ${amStatus.label}${amAstrHno}
                            </div>
                            <div style="position: relative; font-size: 10px; padding: 5px; background-color: ${pmStatus.color}; color: white; border-radius: 3px;">
                                <strong>PM:</strong> ${pmStatus.label}${pmAstrHno}
                            </div>
                        </td>`;

                day++;
            }
        }

        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

// Fonction pour récupérer ASTR/HNO pour une cellule du calendrier individuel
function getAstrHnoForCell(resourceId, dateKey, period) {
    // Utiliser la fonction existante getAstreinteForCell
    const astreinte = getAstreinteForCell(resourceId, dateKey, period);

    if (!astreinte) return '';

    if (astreinte.type === 'activite_courante') return '';
    const label = astreinte.type === 'astreinte' ? 'ASTR' : 'HNO';
    const tooltip =
        astreinte.type === 'astreinte'
            ? `Astreinte: ${astreinte.objet || ''} - ${astreinte.samu || ''}`
            : `HNO: ${astreinte.objet || ''} - ${astreinte.heures || ''} - ${astreinte.samu || ''}`;

    // Pastille en position absolue en haut à droite (même style que planning global)
    return `<span title="${tooltip.replace(/"/g, '&quot;')}" style="position: absolute; top: 1px; right: 1px; background: #ffeb3b; color: #d32f2f; padding: 1px 3px; border-radius: 8px; font-size: 7px; font-weight: bold; border: 1px solid #333; box-shadow: 0 1px 2px rgba(0,0,0,0.3); cursor: help; line-height: 1; z-index: 1;">${label}</span>`;
}

function getActivityLabel(avail, act, loc) {
    if (avail === '1') {
        return { label: 'Indisponible', color: '#95a5a6' };
    }

    const colorMap = {
        1: { label: 'Indisponible', color: '#95a5a6' },
        2: { label: 'En attente', color: '#9b59b6' },
        3: { label: 'SAMU Dép.', color: '#e67e22' },
        4: { label: 'SAMU Dev.', color: '#d35400' },
        5: { label: 'ANS Dép.', color: '#3498db' },
        6: { label: 'ANS Dev.', color: '#2980b9' },
        7: { label: 'Qualification', color: '#e74c3c' },
        8: { label: 'Divers', color: '#16a085' }
    };

    const result = colorMap[act] || colorMap['2'];

    // Ajouter l'icône de localisation
    let locIcon = '';
    if (loc && loc !== '-') {
        const locIcons = {
            T: '🏠',
            TT: '🏠',
            PSC: '🚨',
            Aut: '✏️'
        };
        locIcon = locIcons[loc] || '';
        result.label += ` (${locIcon} ${loc})`;
    }

    return result;
}

function actualPrintCalendar() {
    // Créer une fenêtre d'impression dédiée au calendrier individuel
    const printWindow = window.open('', '_blank');

    // Récupérer le contenu du calendrier
    const calendarContent = document.getElementById('calendarToPrint').innerHTML;

    printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Planning individuel</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            margin: 20px;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        h2, h3 {
                            color: #2c3e50;
                            text-align: center;
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
                    ${calendarContent}
                </body>
                </html>
            `);

    printWindow.document.close();

    // Attendre que le contenu soit chargé avant d'imprimer
    printWindow.onload = function () {
        printWindow.print();
    };

    // Fallback si onload ne se déclenche pas
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

function closePrintModal() {
    const modal = document.getElementById('printCalendarModal');
    modal.classList.remove('active');
}

function printGanttPlanning() {
    window.print();
}

// ========== ENVOI CALENDRIER PAR EMAIL ==========

async function sendResourceCalendarByEmail(resourceId) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    try {
        // Récupérer l'email depuis la table users
        const response = await fetch(`${API_URL}/user/email-by-resource/${resourceId}`, {
            credentials: 'include'
        });
        const userData = await response.json();

        if (!userData.email) {
            alert(
                `❌ Aucun utilisateur avec email n'est associé à ${resource.nom} ${resource.prenom}.\n\nVeuillez d'abord créer un compte utilisateur (Expert Métier) pour cette ressource dans l'onglet "Utilisateurs".`
            );
            return;
        }

        const confirmSend = confirm(
            `Envoyer le calendrier par email à ${userData.email} ?\n\nRessource : ${resource.nom} ${resource.prenom}`
        );
        if (!confirmSend) return;

        const year = parseInt(document.getElementById('yearSelect').value);
        const month = parseInt(document.getElementById('monthSelect').value);
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

        const calendarHTML = generateResourceCalendarHTML(resourceId, year, month);

        const fullHTML = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>Planning ${resource.nom} ${resource.prenom} - ${monthNames[month]} ${year}</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h2 style="margin: 0; color: #2c3e50;">Planning - ${resource.nom.toUpperCase()} ${resource.prenom}</h2>
                            <h3 style="margin: 5px 0; color: #7f8c8d;">${monthNames[month]} ${year}</h3>
                            <p style="margin: 5px 0; font-size: 13px; color: #95a5a6;">Trigramme: ${resource.trigramme}</p>
                        </div>
                        ${calendarHTML}
                    </body>
                    </html>
                `;

        const sendResponse = await fetch(`${API_URL}/send-calendar-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                resourceId: resourceId,
                email: userData.email,
                html: fullHTML,
                subject: `Planning ${resource.nom} ${resource.prenom} - ${monthNames[month]} ${year}`
            })
        });

        const data = await sendResponse.json();

        if (data.success) {
            alert('✅ Calendrier envoyé par email avec succès !');
        } else {
            alert('❌ Erreur: ' + (data.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur envoi calendrier:', error);
        alert("❌ Erreur lors de l'envoi du calendrier par email");
    }
}

// Charger la version au démarrage de la page
loadAppVersion();
