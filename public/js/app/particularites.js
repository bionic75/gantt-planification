// Application principale : particularites
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Fiche de la ressource, historique des taux de MAD et particularités : îlot Vue (frontend/src/ilots/ressources)
// Grille et saisie des demi-journées : îlot Vue (frontend/src/ilots/planification) ; restent le planning et les
// astreintes lus par les exports et impressions (lot 4.6) ; menu d'une demi-journée et saisie des astreintes : îlot
// Vue (frontend/src/ilots/planification, saisie de l'îlot CRA)

async function loadSchedule() {
    try {
        const response = await fetch(`${API_URL}/schedule`, { credentials: 'include' });
        if (response.status === 401) {
            console.warn('Session expirée lors du chargement du planning');
            await performLogout();
            return;
        }
        if (!response.ok) throw new Error('Erreur chargement planification');
        scheduleData = await response.json();
        // Charger les astreintes/HNO pour affichage sur le planning
        await loadAllAstreintesForPlanning();
    } catch (error) {
        console.error('Erreur:', error);
    }
}

async function loadAllAstreintesForPlanning() {
    try {
        const response = await fetch(`${API_URL}/all-astreintes-planning`, { credentials: 'include' });
        if (response.ok) {
            allAstreintesHno = await response.json();
            console.log('🕐 Astreintes/HNO chargées pour le planning:', allAstreintesHno.length);
        }
    } catch (error) {
        console.error('Erreur chargement astreintes pour planning:', error);
    }
}

// Retourne TOUTES les astreintes/HNOs d'une ressource pour une cellule (dateKey + période)
function getAstreintesForCell(resourceId, dateKey, period) {
    if (!allAstreintesHno || allAstreintesHno.length === 0) return [];
    const results = [];
    for (const a of allAstreintesHno) {
        if (a.resource_id !== resourceId) continue;
        const dateDebutStr = (a.date_debut || '').substring(0, 10);
        const dateFinStr = (a.date_fin || '').substring(0, 10);
        if (dateKey < dateDebutStr || dateKey > dateFinStr) continue;

        const isFirstDay = dateKey === dateDebutStr;
        const isLastDay = dateKey === dateFinStr;
        const heures = a.heure_debut && a.heure_fin ? `${a.heure_debut}–${a.heure_fin}` : '';

        // Déterminer si l'entrée couvre cette demi-journée
        let covers = false;
        if (a.heure_debut && a.heure_fin) {
            const hD = parseInt(a.heure_debut.split(':')[0]);
            const hF = parseInt(a.heure_fin.split(':')[0]);
            if (!isFirstDay && !isLastDay) {
                covers = true; // jour intermédiaire → AM et PM couverts
            } else if (period === 'AM') {
                covers = isFirstDay ? hD < 12 : true;
                if (isLastDay) covers = covers && hF > 0;
            } else {
                // PM
                covers = isLastDay ? hF > 12 || (hF === 12 && (a.heure_fin.split(':')[1] || '0') > '0') : true;
                if (isFirstDay) covers = covers && hD < 24;
            }
        } else {
            covers = true; // pas d'heures → toutes les demi-journées
        }
        if (covers) {
            results.push({
                id: a.id,
                type: a.type,
                objet: a.objet,
                samu: a.tous_samu ? 'Tous SAMU' : a.samu || '',
                heures,
                date_debut: a.date_debut,
                date_fin: a.date_fin,
                heure_debut: a.heure_debut || '',
                heure_fin: a.heure_fin || ''
            });
        }
    }
    return results;
}

// Compat alias (utilisé par le code CRA)
function getAstreinteForCell(resourceId, dateKey, period) {
    const r = getAstreintesForCell(resourceId, dateKey, period);
    return r.length ? r[0] : null;
}
