// Application principale : conges-scolaires
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Congés scolaires et dates particulières affichés sur la planification ; leur administration (import des fichiers
// .ics) est un îlot Vue (frontend/src/ilots/admin/jours-speciaux), qui signale ses modifications (core.js)
// ========== GESTION DES CONGÉS SCOLAIRES ==========

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
