// Application principale : conges-scolaires
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES CONGÉS SCOLAIRES ==========

// Parser un fichier ICS et extraire les événements de congés scolaires
function parseICSFile(icsContent) {
    const events = [];
    const lines = icsContent.split(/\r?\n/);

    let currentEvent = null;
    let inEvent = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Gérer les lignes pliées (continuées par un espace)
        while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
            i++;
            line += lines[i].substring(1);
        }

        if (line.startsWith('BEGIN:VEVENT')) {
            inEvent = true;
            currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent && currentEvent.start) {
                // Si pas de end, utiliser start
                if (!currentEvent.end) {
                    currentEvent.end = currentEvent.start;
                }
                // Si pas de summary, mettre un placeholder
                if (!currentEvent.summary) {
                    currentEvent.summary = 'Événement';
                }
                events.push(currentEvent);
            }
            inEvent = false;
            currentEvent = null;
        } else if (inEvent) {
            if (line.startsWith('SUMMARY:') || line.startsWith('SUMMARY;')) {
                const colonIndex = line.indexOf(':');
                currentEvent.summary = line.substring(colonIndex + 1).trim();
            } else if (line.startsWith('DTSTART')) {
                const colonIndex = line.indexOf(':');
                const dateStr = line.substring(colonIndex + 1).trim();
                currentEvent.start = parseICSDate(dateStr);
                currentEvent.dtstart = currentEvent.start; // Compatibilité
            } else if (line.startsWith('DTEND')) {
                const colonIndex = line.indexOf(':');
                const dateStr = line.substring(colonIndex + 1).trim();
                currentEvent.end = parseICSDate(dateStr);
                currentEvent.dtend = currentEvent.end; // Compatibilité
            }
        }
    }

    console.log(`📅 parseICSFile: ${events.length} événements parsés`);
    return events;
}

// Parser une date ICS (format YYYYMMDD ou YYYYMMDDTHHmmss)
function parseICSDate(dateStr) {
    // Nettoyer la date
    dateStr = dateStr.replace('Z', '');

    if (dateStr.length >= 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return `${year}-${month}-${day}`;
    }
    return null;
}

// Déterminer les zones à partir du nom de l'événement
// Retourne un tableau des zones concernées
function getZonesFromSummary(summary) {
    const summaryLower = summary.toLowerCase();
    const zones = [];

    // Format "Zones A/B/C" ou "Zones A/B" ou "Zones B/C" etc.
    if (summaryLower.includes('zones')) {
        // Extraire la partie après "zones"
        const match = summaryLower.match(/zones?\s*([abc/]+)/i);
        if (match) {
            const zonesPart = match[1].toUpperCase();
            if (zonesPart.includes('A')) zones.push('zoneA');
            if (zonesPart.includes('B')) zones.push('zoneB');
            if (zonesPart.includes('C')) zones.push('zoneC');
        }
    }

    // Si pas de "zones", chercher "zone A", "zone B", "zone C" individuellement
    if (zones.length === 0) {
        if (summaryLower.includes('zone a') || summaryLower.includes('zone-a') || summaryLower.includes('zonea')) {
            zones.push('zoneA');
        }
        if (summaryLower.includes('zone b') || summaryLower.includes('zone-b') || summaryLower.includes('zoneb')) {
            zones.push('zoneB');
        }
        if (summaryLower.includes('zone c') || summaryLower.includes('zone-c') || summaryLower.includes('zonec')) {
            zones.push('zoneC');
        }
    }

    // Dernier recours : chercher "- A", "- B", "- C"
    if (zones.length === 0) {
        if (summaryLower.includes('- a') || summaryLower.endsWith(' a')) zones.push('zoneA');
        if (summaryLower.includes('- b') || summaryLower.endsWith(' b')) zones.push('zoneB');
        if (summaryLower.includes('- c') || summaryLower.endsWith(' c')) zones.push('zoneC');
    }

    return zones;
}

// Uploader et parser le fichier ICS des congés scolaires
async function uploadSchoolHolidays() {
    const fileInput = document.getElementById('schoolHolidaysFile');
    const statusDiv = document.getElementById('schoolHolidaysStatus');
    const infoDiv = document.getElementById('schoolHolidaysInfo');

    if (!fileInput.files || fileInput.files.length === 0) {
        statusDiv.innerHTML = '<span style="color: #e74c3c;">❌ Veuillez sélectionner un fichier .ics</span>';
        return;
    }

    const file = fileInput.files[0];

    if (!file.name.toLowerCase().endsWith('.ics')) {
        statusDiv.innerHTML = '<span style="color: #e74c3c;">❌ Le fichier doit être au format .ics</span>';
        return;
    }

    statusDiv.innerHTML = '<span style="color: #2196f3;">⏳ Lecture du fichier...</span>';

    try {
        const content = await file.text();

        // Vérifier que c'est un fichier ICS valide
        if (!content.includes('BEGIN:VCALENDAR') || !content.includes('END:VCALENDAR')) {
            statusDiv.innerHTML = '<span style="color: #e74c3c;">❌ Fichier ICS invalide ou corrompu</span>';
            return;
        }

        // Parser les événements
        const events = parseICSFile(content);

        if (events.length === 0) {
            statusDiv.innerHTML = '<span style="color: #f39c12;">⚠️ Aucun événement trouvé dans le fichier</span>';
            return;
        }

        // Réinitialiser les congés
        schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] };

        let zoneACounts = 0,
            zoneBCounts = 0,
            zoneCCounts = 0,
            unknownCounts = 0;

        // Classer les événements par zone (un événement peut appartenir à plusieurs zones)
        events.forEach(event => {
            const zones = getZonesFromSummary(event.summary);

            if (zones.length > 0) {
                zones.forEach(zone => {
                    schoolHolidays[zone].push({
                        name: event.summary,
                        start: event.dtstart,
                        end: event.dtend
                    });

                    if (zone === 'zoneA') zoneACounts++;
                    else if (zone === 'zoneB') zoneBCounts++;
                    else if (zone === 'zoneC') zoneCCounts++;
                });
            } else {
                unknownCounts++;
                console.log('Zone non détectée pour:', event.summary);
            }
        });

        // Sauvegarder dans le localStorage et sur le serveur
        await saveSchoolHolidays();

        statusDiv.innerHTML = '<span style="color: #4CAF50;">✅ Congés scolaires importés avec succès</span>';
        infoDiv.innerHTML = `
                    <strong>Résumé de l'import :</strong><br>
                    📅 Zone A : ${zoneACounts} période(s)<br>
                    📅 Zone B : ${zoneBCounts} période(s)<br>
                    📅 Zone C : ${zoneCCounts} période(s)
                    ${unknownCounts > 0 ? `<br>⚠️ ${unknownCounts} événement(s) ignoré(s) (zone non détectée)` : ''}
                `;

        // Rafraîchir le planning
        updateGantt();
    } catch (error) {
        console.error('Erreur lecture fichier ICS:', error);
        statusDiv.innerHTML = `<span style="color: #e74c3c;">❌ Erreur : ${error.message}</span>`;
    }
}

// Sauvegarder les congés scolaires sur le serveur
async function saveSchoolHolidays() {
    try {
        const response = await fetch(`${API_URL}/school-holidays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ holidays: schoolHolidays })
        });

        if (!response.ok) {
            console.error('Erreur sauvegarde congés scolaires');
        }
    } catch (error) {
        console.error('Erreur sauvegarde congés:', error);
    }
}

// Charger les congés scolaires depuis le serveur
async function loadSchoolHolidays() {
    try {
        const response = await fetch(`${API_URL}/school-holidays`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.holidays) {
                schoolHolidays = data.holidays;
                console.log('📅 Congés scolaires chargés:', schoolHolidays);
                console.log('📅 Zone A:', schoolHolidays.zoneA?.length, 'périodes');
                console.log('📅 Zone B:', schoolHolidays.zoneB?.length, 'périodes');
                console.log('📅 Zone C:', schoolHolidays.zoneC?.length, 'périodes');

                // Mettre à jour l'info dans l'admin
                updateSchoolHolidaysInfo();

                // Rafraîchir le Gantt si déjà affiché
                if (document.getElementById('ganttBody')) {
                    updateGantt();
                }
            }
        }
    } catch (error) {
        console.error('Erreur chargement congés:', error);
    }
}

// Mettre à jour l'affichage des infos congés dans l'admin
function updateSchoolHolidaysInfo() {
    const infoDiv = document.getElementById('schoolHolidaysInfo');
    if (!infoDiv) return;

    const totalA = schoolHolidays.zoneA?.length || 0;
    const totalB = schoolHolidays.zoneB?.length || 0;
    const totalC = schoolHolidays.zoneC?.length || 0;

    if (totalA + totalB + totalC > 0) {
        infoDiv.innerHTML = `
                    <strong>Congés actuellement chargés :</strong><br>
                    📅 Zone A : ${totalA} période(s)<br>
                    📅 Zone B : ${totalB} période(s)<br>
                    📅 Zone C : ${totalC} période(s)
                `;
    } else {
        infoDiv.innerHTML = '<em>Aucun congé scolaire chargé</em>';
    }
}

// Charger les dates particulières depuis le serveur
async function loadSpecialDates() {
    try {
        const response = await fetch(`${API_URL}/ics-files/special-dates/all`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            specialDates = data.dates || [];
            console.log('📅 Dates particulières chargées:', specialDates.length);

            // Debug: afficher les événements personnalisés (ceux qui ont config.label)
            const customEventsLoaded = specialDates.filter(sd => sd.config && sd.config.label);
            console.log('📅 Événements personnalisés dans specialDates:', customEventsLoaded.length);
            if (customEventsLoaded.length > 0) {
                console.log('📅 Exemple événement:', JSON.stringify(customEventsLoaded[0]));
            }

            // Rafraîchir le Gantt si déjà affiché
            if (document.getElementById('ganttBody')) {
                updateGantt();
            }
        }
    } catch (error) {
        console.error('Erreur chargement dates particulières:', error);
    }
}

// Vérifier si une date est une date particulière - retourne TOUS les événements pour cette date
function getSpecialDateInfo(dateStr) {
    // dateStr au format "YYYY-MM-DD"
    const matches = [];
    for (const sd of specialDates) {
        const start = sd.date;
        const end = sd.endDate || sd.date;
        if (dateStr >= start && dateStr <= end) {
            matches.push(sd);
        }
    }
    // Retourne le premier pour la compatibilité, mais on utilisera getAllSpecialDateInfo pour l'affichage
    return matches.length > 0 ? matches[0] : null;
}

// Récupérer TOUS les événements pour une date donnée
function getAllSpecialDateInfo(dateStr) {
    const matches = [];
    for (const sd of specialDates) {
        const start = sd.date;
        const end = sd.endDate || sd.date;
        if (dateStr >= start && dateStr <= end) {
            matches.push(sd);
        }
    }
    return matches;
}
