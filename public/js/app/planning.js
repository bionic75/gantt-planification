// Application principale : planning
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

function closeLocalisationModal() {
    document.getElementById('localisationModal').classList.remove('active');
    currentLocalisationCell = null;
}

// Experts masqués dans le planning (mémorisés dans le navigateur)
const ganttHidden = new Set(
    (() => {
        try {
            return JSON.parse(localStorage.getItem('gp_gantt_hidden') || '[]');
        } catch (e) {
            return [];
        }
    })()
);
function saveGanttHidden() {
    try {
        localStorage.setItem('gp_gantt_hidden', JSON.stringify([...ganttHidden]));
    } catch (e) {
        /* stockage indisponible */
    }
}
function applyGanttHidden() {
    document.querySelectorAll('#ganttBody tr[data-hide-id]').forEach(tr => {
        tr.classList.toggle('gantt-row-hidden', ganttHidden.has(Number(tr.dataset.hideId)));
    });
    updateHiddenGanttBadge();
}
function hideGanttRow(resourceId) {
    ganttHidden.add(Number(resourceId));
    saveGanttHidden();
    applyGanttHidden();
}
function showGanttRow(resourceId) {
    ganttHidden.delete(Number(resourceId));
    saveGanttHidden();
    applyGanttHidden();
    renderHiddenGanttPopover();
}
function showAllGanttRows() {
    ganttHidden.clear();
    saveGanttHidden();
    applyGanttHidden();
    const pop = document.getElementById('ganttHiddenPop');
    if (pop) pop.style.display = 'none';
}
function updateHiddenGanttBadge() {
    const wrap = document.getElementById('ganttHiddenWrap');
    if (!wrap) return;
    const present = new Set(
        [...document.querySelectorAll('#ganttBody tr[data-hide-id]')].map(tr => Number(tr.dataset.hideId))
    );
    const n = [...ganttHidden].filter(id => present.has(id)).length;
    wrap.style.display = n > 0 ? 'block' : 'none';
    const cnt = document.getElementById('ganttHiddenCount');
    if (cnt) cnt.textContent = `${n} masqué${n > 1 ? 's' : ''}`;
    if (n === 0) {
        const pop = document.getElementById('ganttHiddenPop');
        if (pop) pop.style.display = 'none';
    }
}
function renderHiddenGanttPopover() {
    const pop = document.getElementById('ganttHiddenPop');
    if (!pop) return;
    const rows = [...document.querySelectorAll('#ganttBody tr[data-hide-id]')].filter(tr =>
        ganttHidden.has(Number(tr.dataset.hideId))
    );
    pop.innerHTML =
        `<div class="ghp-title">Lignes masquées du planning</div>` +
        rows
            .map(
                tr =>
                    `<div class="ghp-row"><span>${tr.dataset.hideName}</span><button type="button" class="ghp-show" onclick="showGanttRow(${tr.dataset.hideId})">Afficher</button></div>`
            )
            .join('') +
        `<button type="button" class="ghp-all" onclick="showAllGanttRows()">Rétablir l'affichage d'origine</button>`;
}
function toggleHiddenGanttPopover(event) {
    if (event) event.stopPropagation();
    const pop = document.getElementById('ganttHiddenPop');
    if (!pop) return;
    const open = pop.style.display === 'block';
    if (!open) renderHiddenGanttPopover();
    pop.style.display = open ? 'none' : 'block';
}
document.addEventListener('click', e => {
    const wrap = document.getElementById('ganttHiddenWrap');
    const pop = document.getElementById('ganttHiddenPop');
    if (pop && wrap && !wrap.contains(e.target)) pop.style.display = 'none';
});

function updateGantt() {
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
    const filterSelect = document.getElementById('resourceFilter');
    const selectedOptions = Array.from(filterSelect.selectedOptions).map(opt => opt.value);
    const fonctionFilterSelect = document.getElementById('fonctionFilter');
    const selectedFonctions = fonctionFilterSelect
        ? Array.from(fonctionFilterSelect.selectedOptions).map(opt => opt.value)
        : [];
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Mettre à jour l'affichage du mois et de l'année
    const displayDiv = document.getElementById('currentMonthDisplay');
    if (displayDiv) {
        displayDiv.textContent = `${monthNames[month]} ${year}`;
    }

    // Définir les attributs pour le titre d'impression
    document.getElementById('planning').setAttribute('data-month', monthNames[month]);
    document.getElementById('planning').setAttribute('data-year', year);

    let filteredResources = resources.filter(r => r.actif);

    // Si "Toutes les ressources" n'est pas sélectionné et qu'il y a des sélections
    if (!selectedOptions.includes('') && selectedOptions.length > 0) {
        const selectedIds = selectedOptions.map(id => parseInt(id));
        filteredResources = filteredResources.filter(r => selectedIds.includes(r.id));
    }

    // Appliquer le filtre par fonction(s) - sélection multiple
    if (selectedFonctions.length > 0) {
        filteredResources = filteredResources.filter(r => selectedFonctions.includes(r.fonction));
    }

    let dailyDispo = Array(lastDay * 2).fill(0); // x2 pour AM/PM
    let dailyAffect = Array(lastDay * 2).fill(0); // x2 pour AM/PM

    let html = '<table class="gantt-table"><thead>';

    // ====== Ligne N° de semaine (nouvelle) ======
    html += '<tr>';
    html += `<th class="resource-header" style="z-index: 50; cursor: pointer;" rowspan="3" onclick="sortGanttResources()">Ressource</th>`;
    html += `<th class="resource-label" style="z-index: 49; vertical-align: middle; padding: 4px;" rowspan="3">
                <div style="display: flex; flex-direction: column; height: 60px; justify-content: space-between;">
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center;">Disponibilité</div>
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center;">Affectation</div>
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center;">Localisation</div>
                </div>
            </th>`;
    {
        let wDay = 1;
        let wIndex = 0;
        while (wDay <= lastDay) {
            const wDate = new Date(year, month, wDay);
            const wn = getISOWeekNumber(wDate);
            let wCount = 0;
            while (wDay <= lastDay && getISOWeekNumber(new Date(year, month, wDay)) === wn) {
                wCount++;
                wDay++;
            }
            const wBg = wIndex % 2 === 0 ? '#2c3e50' : '#3d566e';
            html += `<th class="week-number-header" colspan="${wCount * 2}" style="background-color: ${wBg}; color: white; font-size: 15px; font-weight: bold; padding: 6px 0; letter-spacing: 0.6px; z-index: 19;">Sem. ${wn}</th>`;
            wIndex++;
        }
    }
    html += '</tr>';

    html += '<tr>';

    // En-têtes avec AM/PM pour chaque jour
    const today = new Date();
    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month, day);
        const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()];
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday =
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();

        let headerClass = 'day-header';

        if (isToday) {
            // Jour actuel : utiliser la classe 'today'
            headerClass += ' today';
        } else if (isWeekend) {
            headerClass += ' weekend';
        }

        // Afficher 2 colonnes par jour : AM et PM
        html += `<th class="${headerClass} day-name-header" colspan="2" style="text-align: center; font-size: 14px; line-height: 1.25;">${dayName}<br><span class="gd-num" style="font-size: 18px; font-weight: 800;">${day}</span></th>`;
    }
    html += '</tr>';

    // Sous-en-tête AM/PM
    html += '<tr>';
    // Plus besoin des cellules vides pour les 2 premières colonnes car rowspan="3"
    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month, day);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday =
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();

        let headerClass = 'day-header';

        if (isToday) {
            headerClass += ' today';
        } else if (isWeekend) {
            headerClass += ' weekend';
        }

        html += `<th class="${headerClass}" style="font-size: 10px; padding: 4px;">AM</th>`;
        html += `<th class="${headerClass} day-separator" style="font-size: 10px; padding: 4px;">PM</th>`;
    }
    html += '</tr></thead><tbody id="ganttBody">';

    // ========== LIGNE CONGÉS SCOLAIRES, JOURS FÉRIÉS, ÉVÉNEMENTS ==========
    const hasHolidays =
        schoolHolidays.zoneA?.length > 0 || schoolHolidays.zoneB?.length > 0 || schoolHolidays.zoneC?.length > 0;
    const hasSpecialDates = specialDates && specialDates.length > 0;

    console.log('📅 updateGantt - hasHolidays:', hasHolidays, 'hasSpecialDates:', hasSpecialDates);

    // Afficher la ligne si on a des congés OU des dates particulières
    if (hasHolidays || hasSpecialDates) {
        html += `<tr class="school-holidays-row${ganttHidden.has(-1) ? ' gantt-row-hidden' : ''}" data-hide-id="-1" data-hide-name="Congés scolaires, jours fériés, événements" style="background-color: #f5f5f5;">
                    <td class="resource-header" style="background-color: #9EA158; vertical-align: top; padding-top: 8px;">
                        <button type="button" class="gantt-hide-btn" onclick="hideGanttRow(-1)" title="Masquer cette ligne du planning" aria-label="Masquer cette ligne du planning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <svg viewBox="0 0 24 24" aria-hidden="true" style="width:28px;height:28px;min-width:28px;flex-shrink:0;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;margin-left:14px;"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
                            <div style="color: white;">
                                <strong style="font-size: 11px;">Congés scolaires, jours fériés, événements particuliers, ...</strong>
                            </div>
                        </div>
                    </td>
                    <td class="resource-label" style="background-color: #9EA158; vertical-align: top; text-align: center; font-size: 9px; padding-top: 8px;">
                        <div style="display: flex; flex-direction: column; gap: 1px; align-items: center;">`;

        // Légende zones scolaires si présentes
        if (hasHolidays) {
            html += `
                            <div style="display: flex; align-items: center; gap: 2px;">
                                <span style="display: inline-block; width: 10px; height: 3px; background-color: #e91e63; border-radius: 1px; cursor: help;" title="Zone A : Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers"></span>
                                <span style="color: white; cursor: help;" title="Zone A : Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers">A</span>
                                <span style="display: inline-block; width: 10px; height: 3px; background-color: #2196f3; border-radius: 1px; margin-left: 3px; cursor: help;" title="Zone B : Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg"></span>
                                <span style="color: white; cursor: help;" title="Zone B : Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg">B</span>
                                <span style="display: inline-block; width: 10px; height: 3px; background-color: #ff9800; border-radius: 1px; margin-left: 3px; cursor: help;" title="Zone C : Créteil, Montpellier, Paris, Toulouse, Versailles"></span>
                                <span style="color: white; cursor: help;" title="Zone C : Créteil, Montpellier, Paris, Toulouse, Versailles">C</span>
                            </div>`;
        }

        html += `
                        </div>
                    </td>`;

        // Cellules pour chaque demi-journée
        // buildHalfDayContent est déclarée ici (hors boucle) pour éviter la redéclaration à chaque itération
        const buildHalfDayContent = (halfPeriod, specialDates, inZoneA, inZoneB, inZoneC) => {
            let content =
                '<div style="display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; height: 100%; gap: 1px; padding-top: 2px;">';
            let hasContent = false;
            if (inZoneA || inZoneB || inZoneC) {
                hasContent = true;
                if (inZoneA)
                    content +=
                        '<div style="width: 100%; height: 4px; background-color: #e91e63; cursor: help;" title="Zone A"></div>';
                if (inZoneB)
                    content +=
                        '<div style="width: 100%; height: 4px; background-color: #2196f3; cursor: help;" title="Zone B"></div>';
                if (inZoneC)
                    content +=
                        '<div style="width: 100%; height: 4px; background-color: #ff9800; cursor: help;" title="Zone C"></div>';
            }
            if (specialDates.length > 0) {
                for (const sd of specialDates) {
                    if (!sd.config) continue;
                    const evtPeriod = sd.period || 'FULL';
                    if (evtPeriod !== 'FULL' && evtPeriod !== halfPeriod) continue;
                    hasContent = true;
                    const cfg = sd.config;
                    const eventLabel = cfg.shown || cfg.label || sd.summary || 'JF';
                    const locCourt = cfg.locationLibelleCourt
                        ? cfg.locationLibelleCourt
                        : cfg.eventId
                          ? 'NON DÉFINI'
                          : null; // custom event sans localisation
                    const displayLabel = locCourt ? `${locCourt} | ${eventLabel}` : eventLabel;
                    const participantsInfo =
                        cfg.participants && cfg.participants.length > 0 ? ` | 👥 ${cfg.participants.join(', ')}` : '';
                    content += `<span title="${evtTip(cfg, locCourt, displayLabel)}${participantsInfo}" style="display: inline-block; padding: 1px 3px; border-radius: 6px; font-size: 8px; font-weight: bold; cursor: help; align-self: center; background-color: ${cfg.bgColor || '#ffeb3b'}; color: ${cfg.textColor || '#000'}; border: 1px solid ${cfg.borderColor || '#fbc02d'}; margin-bottom: 1px;">${cfg.typeIcon ? uiIcon(cfg.typeIcon, 9, 'margin-right:2px;') : ''}${displayLabel}</span>`;
                }
            }
            content += '</div>';
            return hasContent ? content : '';
        };

        for (let day = 1; day <= lastDay; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const date = new Date(year, month, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            // Vérifier les congés scolaires
            const inZoneA = isDateInHoliday(dateStr, 'zoneA');
            const inZoneB = isDateInHoliday(dateStr, 'zoneB');
            const inZoneC = isDateInHoliday(dateStr, 'zoneC');

            // Vérifier les dates particulières - récupérer TOUS les événements
            const allSpecialDates = getAllSpecialDateInfo(dateStr);

            const cellContentAM = buildHalfDayContent('AM', allSpecialDates, inZoneA, inZoneB, inZoneC);
            const cellContentPM = buildHalfDayContent('PM', allSpecialDates, inZoneA, inZoneB, inZoneC);

            const bgColor = isWeekend ? '#e8e8e8' : '#f5f5f5';

            // AM
            html += `<td style="background-color: ${bgColor}; padding: 0; min-height: 30px; vertical-align: top;">${cellContentAM}</td>`;
            // PM
            html += `<td class="day-separator" style="background-color: ${bgColor}; padding: 0; min-height: 30px; vertical-align: top;">${cellContentPM}</td>`;
        }

        html += '</tr>';
    }
    // ========== FIN LIGNE CONGÉS/ÉVÉNEMENTS ==========

    filteredResources.forEach(resource => {
        const dispoCount = countDaysForResource(resource.id, year, month);
        const expectedDays = calculateExpectedWorkDays(resource.id, year, month);
        const isMadVolante = !!resource.is_mad_volante;
        const madJoursMax = resource.jours_max_mad || 0;
        const madConsumed = isMadVolante
            ? countMadVolanteConsumedDays(resource.id, resource.date_debut, resource.date_fin_mad)
            : 0;
        const madRemaining = Math.max(0, madJoursMax - madConsumed);

        // Trouver l'utilisateur correspondant à cette ressource pour récupérer la photo
        const user = users.find(u => u.resource_id === resource.id);
        const profilePhoto = user?.profile_photo || null;
        const trigramme = resource.trigramme || '?';

        // Construire le tooltip avec fonction, ES de rattachement et affectations SAMU
        const tooltipParts = [];
        tooltipParts.push(`${resource.prenom} ${resource.nom.toUpperCase()}`);
        if (resource.fonction) tooltipParts.push(`Fonction: ${resource.fonction}`);
        if (resource.es_rattachement) tooltipParts.push(`ES: ${resource.es_rattachement}`);
        const samuAssign = resourceSamuAssignments[resource.id];
        if (samuAssign && samuAssign.principal && samuAssign.principal.length) {
            tooltipParts.push(`🅿️ Principal: ${samuAssign.principal.join(', ')}`);
        }
        if (samuAssign && samuAssign.secondaire && samuAssign.secondaire.length) {
            tooltipParts.push(`🅢 Secondaire: ${samuAssign.secondaire.join(', ')}`);
        }
        const photoTooltip = tooltipParts.join('\n');

        html += `<tr data-hide-id="${resource.id}" data-hide-name="${resource.nom} ${resource.prenom}" data-resource-name="${resource.nom} ${resource.prenom}" data-resource-id="${resource.id}" data-user-id="${resource.user_id || ''}"${ganttHidden.has(resource.id) ? ' class="gantt-row-hidden"' : ''}>
                    <td class="resource-header">
                        <button type="button" class="gantt-hide-btn" onclick="hideGanttRow(${resource.id})" title="Masquer cet expert du planning" aria-label="Masquer cet expert du planning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                <!-- Photo de profil ou trigramme -->
                                <div style="position:relative;width: 40px; height: 40px; flex-shrink: 0;">
                                    <div style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid ${isMadVolante ? '#9c27b0' : '#1D70B7'}; background-color: #7f8c8d; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: help;" title="${photoTooltip.replace(/"/g, '&quot;')}">
                                        ${
                                            profilePhoto
                                                ? `<img src="${profilePhoto}" style="width: 100%; height: 100%; object-fit: cover;" />`
                                                : `<span style="color: white; font-weight: bold; font-size: 14px;">${trigramme}</span>`
                                        }
                                    </div>
                                    ${isMadVolante ? `<span style="position:absolute;bottom:-5px;right:-6px;line-height:1;" title="MAD volante"><svg class="app-ico" viewBox="0 0 24 24" aria-hidden="true" style="width:13px;height:13px;stroke:#7b1fa2;fill:#e1bee7;vertical-align:-2px;vertical-align:top;background:white;border-radius:50%;padding:1px;"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg></span>` : ''}
                                </div>
                                <!-- Informations -->
                                <div style="text-align: left;">
                                    <strong>${resource.nom.toUpperCase()} ${resource.prenom}</strong><br>
                                    <small>${resource.trigramme}</small><br>
                                    ${
                                        isMadVolante
                                            ? `<small style="font-size:10px;color:${madRemaining <= madJoursMax * 0.2 ? '#e53935' : madRemaining <= madJoursMax * 0.5 ? '#fb8c00' : '#6a1b9a'};">${madRemaining} j restants / ${madJoursMax} j max</small>`
                                            : `<small style="font-size: 10px; color: #bdc3c7;">Jours: ${dispoCount}/${expectedDays}</small>`
                                    }
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 10px;">
                                <button onclick="printResourceCalendar(${resource.id})" 
                                        style="padding: 4px 8px; font-size: 10px; background-color: #3498db; border: none; border-radius: 3px; cursor: pointer;" 
                                        title="Imprimer le calendrier">
                                    ${uiIcon('print', 15, 'stroke:white;margin-right:0;vertical-align:middle;')}
                                </button>
                                <button onclick="sendResourceCalendarByEmail(${resource.id})" 
                                        style="padding: 4px 8px; font-size: 10px; background-color: #27ae60; border: none; border-radius: 3px; cursor: pointer;" 
                                        title="Envoyer par email">
                                    ${uiIcon('mail', 15, 'stroke:white;margin-right:0;vertical-align:middle;')}
                                </button>
                            </div>
                        </div>
                    </td>
                    <td class="resource-label" style="vertical-align: middle; padding: 4px;">
                        <div style="display: flex; flex-direction: column; height: 90px; justify-content: space-between;">
                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; min-height: 28px;">Disponibilité</div>
                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; min-height: 28px;">Affectation</div>
                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; min-height: 28px;">Localisation</div>
                        </div>
                    </td>`;

        // Boucle sur les jours avec AM et PM
        for (let day = 1; day <= lastDay; day++) {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const date = new Date(year, month, day);

            // Vérifier si c'est le jour actuel (à faire AVANT isWeekend)
            const today = new Date();
            const isToday =
                date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();

            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const checkDate = new Date(year, month, day);
            const isAccessible = isDateAccessible(resource, checkDate);

            // Gérer AM et PM séparément
            ['AM', 'PM'].forEach((period, periodIndex) => {
                const availKey = `${resource.id}_available_${dateKey}_${period}`;
                const availValue = scheduleData[availKey] || '1';
                // Couleurs : 1=gris (indispo), 2=vert (dispo), 3=bleu ciel (congés)
                const availBg = availValue === '1' ? '#95a5a6' : availValue === '3' ? '#00bcd4' : '#27ae60';

                const actKey = `${resource.id}_activity_${dateKey}_${period}`;
                const actValue = scheduleData[actKey] || '1';
                let actBg = '#95a5a6';
                if (availValue === '1' || availValue === '3') {
                    // Indisponible ou Congés : pas d'affectation visible
                    actBg = availValue === '3' ? '#00bcd4' : '#95a5a6';
                } else {
                    const colorMap = {
                        1: '#95a5a6',
                        2: '#9b59b6',
                        3: '#e67e22',
                        4: '#d35400',
                        5: '#3498db',
                        6: '#2980b9',
                        7: '#e74c3c',
                        8: '#16a085'
                    };
                    actBg = colorMap[actValue] || '#95a5a6';
                }

                const locKey = `${resource.id}_localisation_${dateKey}_${period}`;
                const locValue = scheduleData[locKey] || '-';
                const authorKey = `${resource.id}_author_${dateKey}_${period}`;
                const authorValue = scheduleData[authorKey] || '';

                // Afficher la localisation pour:
                // - En attente d'affectation (2)
                // - SAMU Déploiement (3)
                // - SAMU Dev. usages (4)
                // - ANS Déploiement (5)
                // - ANS Dev. usages (6)
                // - Qualification (7)
                // - Divers (8)
                // - Congés (availValue === '3') : afficher 🏖️
                let locDisplay = '-';
                if (availValue === '3') {
                    // Congés : afficher l'icône plage
                    locDisplay = uiIcon('umbrella', 13, 'margin-right:0;');
                } else if (availValue === '2' && actValue !== '1') {
                    const locIc = (name, color, txt) =>
                        `${uiIcon(name, 12, `stroke:${color};margin-right:3px;vertical-align:-2px;`)}${txt}`;
                    const locDisplayMap = {
                        '🏠 Télétravail': locIc('home', '#3498db', 'TT'),
                        '🗼 PSC': locIc('tower', '#9b59b6', 'PSC'),
                        '🚗 Déplacement': locIc('car', '#16a085', 'Dép'),
                        '📞 Télétravail': locIc('home', '#3498db', 'TT'),
                        '🚨 SAMU': locIc('siren', '#e53935', 'SAMU'),
                        '🎤 Autres': locIc('mic', '#16a085', 'Aut')
                    };

                    // Gérer les SAMU avec numéro (format "🚨 SAMU XX")
                    if (locValue.startsWith('🚨 SAMU')) {
                        const samuMatch = locValue.match(/SAMU (\w+)/);
                        if (samuMatch) {
                            locDisplay = locIc('siren', '#e53935', samuMatch[1]);
                        } else {
                            locDisplay = locIc('siren', '#e53935', 'SAMU');
                        }
                    } else {
                        locDisplay =
                            locDisplayMap[locValue] || locValue.substring(0, 8) + (locValue.length > 8 ? '...' : '');
                    }
                }

                // Vérifier si c'est le jour actuel
                const today = new Date();
                const isToday =
                    date.getDate() === today.getDate() &&
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();

                // Le jour actuel a la priorité sur le week-end
                let cellClass = 'gantt-cell';
                if (isToday) {
                    // Jour actuel : ajouter la classe today
                    cellClass += ' today';
                } else if (isWeekend) {
                    cellClass += ' weekend-cell';
                }

                if (!isAccessible) {
                    cellClass += ' disabled';
                }
                // Ajouter la classe day-separator sur les cellules PM pour avoir une bordure épaisse APRÈS chaque jour
                if (period === 'PM') {
                    cellClass += ' day-separator';
                }

                // Calculer les totaux par demi-journée
                if (availValue === '2' && isAccessible) {
                    dailyDispo[(day - 1) * 2 + periodIndex]++;
                }
                if (actValue !== '1' && actValue !== '2' && availValue === '2' && isAccessible) {
                    dailyAffect[(day - 1) * 2 + periodIndex]++;
                }

                const availTooltip = isAccessible ? availabilityLabels[availValue] : 'Hors période MAD';
                // Ajouter l'auteur au tooltip de l'activité si disponible
                let actTooltip = isAccessible ? activityLabels[actValue] : 'Hors période MAD';
                if (authorValue && actValue !== '1' && actValue !== '2') {
                    actTooltip += ` - Affecté par: ${authorValue}`;
                }
                const rowDisabledClass = isAccessible ? '' : ' disabled';

                // Ajouter la classe pour différencier AM (bordure fine) et PM (bordure épaisse)
                const borderClass = period === 'AM' ? 'half-day-separator' : 'day-separator';

                // Affichage spécial pour les congés
                const actDisplayValue = availValue === '3' ? uiIcon('umbrella', 13, 'margin-right:0;') : actValue;
                const actDisplayTooltip = availValue === '3' ? '🏖️ Congés - Aucune affectation possible' : actTooltip;

                // Vérifier s'il y a une astreinte/HNO pour cette cellule
                const astreinteInfo = getAstreintesForCell(resource.id, dateKey, period);
                const astreinteBadge = getAstreinteBadgeHtml(astreinteInfo);

                html += `<td class="${cellClass} ${borderClass}" data-date="${year}-${month + 1}-${day}" data-period="${period}" style="min-width: 50px; max-width: 50px; width: 50px; position: relative;">
                            ${astreinteBadge}
                            <div class="gantt-cell-content">
                                <div class="gantt-cell-row${rowDisabledClass}" style="background-color: ${isAccessible ? availBg : '#d0d0d0'}; color: white; font-size: 11px; min-height: 20px;" onclick="${isAccessible ? `toggleAvailability(${resource.id}, '${dateKey}', '${period}')` : 'return false;'}" title="${availTooltip} (${period})">${availValue === '3' ? uiIcon('umbrella', 13, 'margin-right:0;') : availValue}</div>
                                <div class="gantt-cell-row${rowDisabledClass}" style="background-color: ${isAccessible ? actBg : '#d0d0d0'}; color: white; font-size: 11px; min-height: 20px;" onclick="${isAccessible ? `cycleActivity(${resource.id}, '${dateKey}', '${availValue}', '${period}')` : 'return false;'}" title="${actDisplayTooltip} (${period})">${actDisplayValue}</div>
                                <div class="gantt-cell-row${rowDisabledClass}" style="background-color: ${isAccessible ? (availValue === '3' ? '#e0f7fa' : '#f0f0f0') : '#d0d0d0'}; color: #333; font-size: 8px; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: 20px;" onclick="${isAccessible && availValue !== '3' ? `openLocalisationModal(${resource.id}, '${dateKey}', '${availValue}', '${actValue}', '${period}')` : 'return false;'}" title="${availValue === '3' ? '🏖️ Congés' : isAccessible ? (locDisplay !== '-' ? 'Localisation ' + period + ': ' + locValue + ' (cliquez pour modifier)' : 'Cliquez pour définir la localisation ' + period) : 'Hors période MAD'}">${locDisplay}</div>
                            </div>
                        </td>`;
            });
        }
        html += '</tr>';
    });

    const totalDispoMonth = dailyDispo.reduce((a, b) => a + b, 0);
    const totalAffectMonth = dailyAffect.reduce((a, b) => a + b, 0);

    html += `<tr class="total-row">
                <td class="total-label">TOTAL</td>
                <td class="total-sublabel">Dispo: ${(totalDispoMonth / 2).toFixed(1)}j<br>Affect: ${(totalAffectMonth / 2).toFixed(1)}j</td>`;

    // Totaux par demi-journée
    for (let day = 0; day < lastDay; day++) {
        const date = new Date(year, month, day + 1);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday =
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();

        let cellClass = 'total-cell';

        if (isToday) {
            cellClass += ' today';
        } else if (isWeekend) {
            cellClass += ' weekend';
        }

        // Somme AM + PM pour afficher en jours
        const dayDispo = (dailyDispo[day * 2] + dailyDispo[day * 2 + 1]) / 2;
        const dayAffect = (dailyAffect[day * 2] + dailyAffect[day * 2 + 1]) / 2;
        // AM - bordure épaisse pour séparer les jours
        html += `<td class="${cellClass} day-separator" colspan="2" style="font-size: 9px; padding: 3px;">D:${dayDispo.toFixed(1)}<br>A:${dayAffect.toFixed(1)}</td>`;
    }
    html += '</tr></tbody></table>';

    document.getElementById('ganttWrapper').innerHTML = html;
    updateHiddenGanttBadge();
    initGanttContextMenu();

    // Scroll automatique vers le jour actuel UNIQUEMENT au premier chargement
    if (isFirstPlanningLoad) {
        setTimeout(() => {
            const todayCell = document.querySelector('.gantt-cell.today');
            if (todayCell) {
                const wrapper = document.getElementById('ganttWrapper');
                if (wrapper) {
                    // Calculer la position pour centrer la cellule
                    const cellLeft = todayCell.offsetLeft;
                    const wrapperWidth = wrapper.clientWidth;
                    const cellWidth = todayCell.offsetWidth;
                    const scrollLeft = cellLeft - wrapperWidth / 2 + cellWidth / 2;

                    wrapper.scrollTo({
                        left: Math.max(0, scrollLeft),
                        behavior: 'smooth'
                    });
                }
            }
            isFirstPlanningLoad = false; // Désactiver le scroll automatique pour les prochains chargements
        }, 100); // Petit délai pour que le DOM soit bien rendu
    }
}

function sortGanttResources() {
    const tbody = document.getElementById('ganttBody');
    if (!tbody) return;
    const totalRow = tbody.querySelector('.total-row');
    const holidayRow = tbody.querySelector('.school-holidays-row');
    const rows = Array.from(tbody.querySelectorAll('tr:not(.total-row):not(.school-holidays-row)'));
    const isAscending = !sortDirection['gantt_resources'];
    sortDirection['gantt_resources'] = isAscending;
    rows.sort((a, b) => {
        const aName = a.getAttribute('data-resource-name') || '';
        const bName = b.getAttribute('data-resource-name') || '';
        return isAscending ? aName.localeCompare(bName) : bName.localeCompare(aName);
    });
    tbody.innerHTML = '';
    if (holidayRow) tbody.appendChild(holidayRow);
    rows.forEach(row => tbody.appendChild(row));
    if (totalRow) tbody.appendChild(totalRow);
}

// Feuille de style dédiée aux colonnes masquées
(function () {
    const s = document.createElement('style');
    s.id = 'col-hide-styles';
    document.head.appendChild(s);
})();

let _colTblSeq = 0;
function addColContextMenu(table) {
    if (table._colCtxMenu) return;
    table._colCtxMenu = true;
    if (!table.dataset.coltblId) table.dataset.coltblId = 'coltbl-' + ++_colTblSeq;
    const tblId = table.dataset.coltblId;
    const styleSheet = document.getElementById('col-hide-styles').sheet;
    const lsKey = 'col-hide:' + tblId;
    const saved = JSON.parse(localStorage.getItem(lsKey) || '[]');
    const hiddenCols = new Set(saved); // 1-based nth-child indices

    const saveState = () => localStorage.setItem(lsKey, JSON.stringify([...hiddenCols]));

    const applyHideRules = () => {
        // Supprimer toutes les règles de ce tableau
        for (let i = styleSheet.cssRules.length - 1; i >= 0; i--) {
            if (styleSheet.cssRules[i].selectorText?.includes(tblId)) styleSheet.deleteRule(i);
        }
        hiddenCols.forEach(nth => {
            styleSheet.insertRule(
                `[data-coltbl-id="${tblId}"] td:nth-child(${nth}),` +
                    `[data-coltbl-id="${tblId}"] th:nth-child(${nth}) { display:none !important; }`,
                styleSheet.cssRules.length
            );
        });
    };

    const removeMenu = () => document.querySelector('.col-ctx-menu')?.remove();

    const ths = Array.from(table.querySelectorAll('thead tr:first-child th'));
    ths.forEach((th, idx) => {
        const nth = idx + 1; // nth-child est 1-based
        th.addEventListener('contextmenu', e => {
            e.preventDefault();
            removeMenu();
            const menu = document.createElement('div');
            menu.className = 'col-ctx-menu';
            menu.style.cssText =
                'position:fixed;z-index:10000;background:white;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.2);padding:4px 0;min-width:220px;font-size:13px;';
            // Positionner sans déborder
            const mw = 220,
                mh = 200;
            menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 8) + 'px';
            menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 8) + 'px';

            const item = (text, color, fn) => {
                const d = document.createElement('div');
                d.textContent = text;
                d.style.cssText = `padding:8px 14px;cursor:pointer;color:${color || '#222'};`;
                d.onmouseenter = () => (d.style.background = '#f0f4ff');
                d.onmouseleave = () => (d.style.background = '');
                d.onclick = fn;
                return d;
            };
            const sep = () => {
                const d = document.createElement('div');
                d.style.cssText = 'border-top:1px solid #eee;margin:3px 0;';
                return d;
            };

            const label = (
                th.querySelector('.cra-th-label')?.textContent ||
                th.textContent
                    .replace(/[▲▼↑↓]/g, '')
                    .replace('col-resize-handle', '')
                    .trim()
            )
                .split('\n')[0]
                .trim();

            // Masquer la colonne courante (sauf si déjà masquée)
            if (!hiddenCols.has(nth)) {
                menu.appendChild(
                    item(`👁 Masquer "${label}"`, '#c62828', () => {
                        hiddenCols.add(nth);
                        applyHideRules();
                        saveState();
                        removeMenu();
                    })
                );
            }

            // Colonnes masquées à réafficher
            if (hiddenCols.size > 0) {
                menu.appendChild(sep());
                const hdr = document.createElement('div');
                hdr.textContent = 'Colonnes masquées :';
                hdr.style.cssText =
                    'padding:3px 14px;font-size:11px;color:#888;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;';
                menu.appendChild(hdr);
                hiddenCols.forEach(hNth => {
                    const hTh = ths[hNth - 1];
                    const hLabel = (
                        hTh.querySelector('.cra-th-label')?.textContent || hTh.textContent.replace(/[▲▼↑↓]/g, '').trim()
                    )
                        .split('\n')[0]
                        .trim();
                    menu.appendChild(
                        item(`↩ Afficher "${hLabel}"`, '#1d70b7', () => {
                            hiddenCols.delete(hNth);
                            applyHideRules();
                            saveState();
                            removeMenu();
                        })
                    );
                });
            }

            if (!menu.children.length) {
                removeMenu();
                return;
            }
            document.body.appendChild(menu);
            setTimeout(() => document.addEventListener('click', removeMenu, { once: true }), 0);
        });
    });

    // Restaurer l'état sauvegardé
    if (hiddenCols.size > 0) applyHideRules();
}

function makeColResizable(table) {
    if (!table || table._colResizable) return;
    table._colResizable = true;
    table.style.tableLayout = 'fixed';
    const ths = Array.from(table.querySelectorAll('thead tr:first-child th'));
    // Fixer les largeurs naturelles courantes
    ths.forEach(th => {
        if (th.offsetWidth > 0) th.style.width = th.offsetWidth + 'px';
        th.style.position = 'relative';
    });
    // Ajouter les poignées de resize (sauf la dernière colonne)
    ths.slice(0, -1).forEach((th, idx) => {
        if (th.querySelector('.col-resize-handle')) return;
        const handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        handle.style.cssText =
            'position:absolute;right:0;top:0;width:6px;height:100%;cursor:col-resize;z-index:2;background:transparent;';
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startW = th.offsetWidth;
            const nextTh = ths[idx + 1];
            const startNextW = nextTh ? nextTh.offsetWidth : 0;
            const onMove = mv => {
                const delta = mv.clientX - startX;
                const newW = Math.max(40, startW + delta);
                const actualDelta = newW - startW;
                if (nextTh) {
                    const newNextW = startNextW - actualDelta;
                    if (newNextW < 40) return;
                    nextTh.style.width = newNextW + 'px';
                }
                th.style.width = newW + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        th.appendChild(handle);
    });
    // Menu clic droit pour masquer/afficher les colonnes
    addColContextMenu(table);
}

function sortTable(tableId, columnIndex) {
    const table = document.getElementById(tableId + 'Table');
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    const isAscending = !sortDirection[columnIndex];
    sortDirection[columnIndex] = isAscending;
    // Converts dd/MM/yyyy HH:mm:ss to sortable string yyyy/MM/dd HH:mm:ss
    function toSortable(val) {
        const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)/);
        return m ? m[3] + '/' + m[2] + '/' + m[1] + m[4] : val;
    }
    rows.sort((a, b) => {
        let aVal = a.cells[columnIndex].textContent.toLowerCase().trim();
        let bVal = b.cells[columnIndex].textContent.toLowerCase().trim();
        aVal = toSortable(aVal);
        bVal = toSortable(bVal);
        if (!isNaN(aVal) && !isNaN(bVal)) {
            aVal = parseFloat(aVal);
            bVal = parseFloat(bVal);
            return isAscending ? aVal - bVal : bVal - aVal;
        }
        return isAscending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    rows.forEach(row => tbody.appendChild(row));
}

function exportResourcesToExcel() {
    window.location.href = `${API_URL}/export/resources`;
}

// Ouvrir la modal de téléchargement
function openDownloadModal() {
    const select = document.getElementById('downloadMonthSelect');
    select.innerHTML = '';

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Générer les options : 12 mois dans le passé + mois courant + 3 mois dans le futur
    const options = [];

    // 12 mois dans le passé
    for (let i = 12; i >= 1; i--) {
        const date = new Date(currentYear, currentMonth - i, 1);
        options.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });
    }

    // Mois courant
    options.push({
        year: currentYear,
        month: currentMonth,
        label: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        current: true
    });

    // 3 mois dans le futur
    for (let i = 1; i <= 3; i++) {
        const date = new Date(currentYear, currentMonth + i, 1);
        options.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });
    }

    // Créer les options du select
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = `${opt.year}-${String(opt.month + 1).padStart(2, '0')}`;
        option.textContent = opt.label.charAt(0).toUpperCase() + opt.label.slice(1);
        if (opt.current) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    document.getElementById('downloadPlanningModal').style.display = 'block';
}

// Fermer la modal de téléchargement
function closeDownloadModal() {
    document.getElementById('downloadPlanningModal').style.display = 'none';
}

// Télécharger le planning au format CSV
function downloadPlanningCSV() {
    const selectedValue = document.getElementById('downloadMonthSelect').value;
    const [year, month] = selectedValue.split('-');

    // Générer l'horodatage au format AAAA-MM-JJ_HH-MM
    const now = new Date();
    const horodatage =
        now.getFullYear() +
        '-' +
        String(now.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(now.getDate()).padStart(2, '0') +
        '_' +
        String(now.getHours()).padStart(2, '0') +
        '-' +
        String(now.getMinutes()).padStart(2, '0');

    // Format du nom de fichier : Expert_Planning_AAAAMM_Sauvegarde_de_Horodatage
    const filename = `Expert_Planning_${year}${month}_Sauvegarde_de_${horodatage}.csv`;

    // Appeler l'API d'export avec le nom de fichier personnalisé
    fetch(
        `${API_URL}/export/gantt?year=${year}&month=${parseInt(month) - 1}&format=csv&filename=${encodeURIComponent(filename)}`,
        {
            credentials: 'include'
        }
    )
        .then(response => {
            if (!response.ok) throw new Error('Erreur lors du téléchargement');
            return response.blob();
        })
        .then(blob => {
            // Créer un lien de téléchargement
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Fermer la modal
            closeDownloadModal();
        })
        .catch(error => {
            console.error('Erreur téléchargement:', error);
            alert('Erreur lors du téléchargement du fichier');
        });
}

// Ancienne fonction conservée pour compatibilité
function exportGanttToExcel() {
    openDownloadModal();
}

async function loadUsers() {
    try {
        // Utiliser l'endpoint public pour les experts/users, admin endpoint pour les admins
        const endpoint = currentUser?.activeProfile === 'admin' ? '/users' : '/users/public';
        const response = await fetch(`${API_URL}${endpoint}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Erreur chargement utilisateurs');
        users = await response.json();
        console.log('👥 Users chargés:', users.length);
        console.log(
            '📷 Détails users:',
            users.map(u => ({
                id: u.id,
                nom: u.nom,
                username: u.username,
                resource_id: u.resource_id,
                resource_id_type: typeof u.resource_id,
                is_expert: u.is_expert,
                has_photo: !!u.profile_photo,
                photo_length: u.profile_photo?.length
            }))
        );
        if (currentUser?.activeProfile === 'admin') {
            await displayUsers();
            // Charger les configurations d'automatisation
            populateAutomation1CopyUsers();
            loadAutomation1Config();
            // Automatisation 2
            initAutomation2Options();
            loadAutomation2Config();
            // Automatisation 3 (Teams)
            loadAutomation3Config();
            // Automatisation 4 (CRA)
            loadAutomation4Config();
            // Automatisations 5 et 6 (astreintes HO)
            if (typeof loadAutomationHoConfigs === 'function') loadAutomationHoConfigs();
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

function generatePassword() {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + symbols;

    let password = '';
    // S'assurer qu'on a au moins un de chaque type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Remplir le reste aléatoirement
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mélanger le mot de passe
    password = password
        .split('')
        .sort(() => Math.random() - 0.5)
        .join('');

    // Afficher dans le champ
    document.getElementById('adminUserPassword').value = password;
    document.getElementById('adminUserPassword').type = 'text'; // Afficher en clair temporairement

    // Repasser en type password après 3 secondes
    setTimeout(() => {
        document.getElementById('adminUserPassword').type = 'password';
    }, 3000);
}

// Fonction pour retirer les accents
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Fonction pour capitaliser la première lettre
function capitalizeFirstLetter(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Fonction pour générer le login à partir du nom et prénom
function generateUsername() {
    const nom = document.getElementById('adminUserNom').value.trim();
    const prenom = document.getElementById('adminUserPrenom').value.trim();

    if (!nom || !prenom) return;

    // Retirer les accents, espaces et tirets, puis mettre en minuscule
    const nomClean = removeAccents(nom)
        .replace(/[\s\-]/g, '')
        .toLowerCase();
    const prenomClean = removeAccents(prenom)
        .replace(/[\s\-]/g, '')
        .toLowerCase();

    // Générer le login: prenom.nom
    const username = `${prenomClean}.${nomClean}`;

    document.getElementById('adminUserUsername').value = username;
}

// Fonction pour purger les cookies du site
function clearSiteCookies() {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    }
    console.log('🧹 Cookies du site purgés');
}

// Fonction pour réinitialiser toutes les données en mémoire
function clearMemoryData() {
    scheduleData = {};
    resources = [];
    users = [];
    schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] };
    currentUser = null;
    console.log('🧹 Données en mémoire réinitialisées');
}

// Event listeners pour automatiser la saisie
document.addEventListener('DOMContentLoaded', function () {
    // Purger les cookies et données au chargement de la page de connexion
    clearSiteCookies();
    clearMemoryData();

    // Charger la version dès le chargement (endpoint public, pas besoin d'auth)
    loadVersion();

    // Charger tous les paramètres si connecté (pour admin)
    loadSettings();

    // Charger les congés scolaires
    loadSchoolHolidays();

    // ========== AUTOMATISATION UTILISATEURS ==========

    // Capitaliser automatiquement le prénom
    const prenomInput = document.getElementById('adminUserPrenom');
    if (prenomInput) {
        prenomInput.addEventListener('blur', function () {
            this.value = capitalizeFirstLetter(this.value);
            generateUsername();
        });
    }

    // Régénérer le login quand le nom change
    const nomInput = document.getElementById('adminUserNom');
    if (nomInput) {
        nomInput.addEventListener('blur', function () {
            generateUsername();
        });
    }

    // ========== AUTOMATISATION RESSOURCES ==========

    // Capitaliser automatiquement le prénom de la ressource
    const resourcePrenomInput = document.getElementById('prenom');
    if (resourcePrenomInput) {
        resourcePrenomInput.addEventListener('blur', function () {
            this.value = capitalizeFirstLetter(this.value);
            generateTrigramme();
        });
    }

    // Régénérer le trigramme quand le nom change
    const resourceNomInput = document.getElementById('nom');
    if (resourceNomInput) {
        resourceNomInput.addEventListener('blur', function () {
            generateTrigramme();
        });
    }

    // Pré-remplir SAMU avec "SAMU " si vide
    const samuInput = document.getElementById('samu');
    if (samuInput) {
        samuInput.addEventListener('focus', function () {
            if (!this.value || this.value.trim() === '') {
                this.value = 'SAMU ';
            }
        });
    }
});
