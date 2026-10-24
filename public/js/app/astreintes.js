// Application principale : astreintes
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES ASTREINTES (EXPERIMENTAL) ==========

let astreinteVolontaires = [];
let astreinteIndispos = [];
let astreintePlanning = [];

// Toggle sections astreinte
function toggleAstreinteSection(sectionId) {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(sectionId + 'Icon');
    if (section && icon) {
        if (section.style.display === 'none') {
            section.style.display = 'block';
            icon.textContent = '▼';
        } else {
            section.style.display = 'none';
            icon.textContent = '▶';
        }
    }
}

// Initialiser l'onglet astreintes
async function initAstreintesTab() {
    console.log('🔧 Initialisation onglet Astreintes');
    // S'assurer que les ressources sont chargées
    if (resources.length === 0) {
        await loadResources();
    }
    initDispoMoisSelector();
    initMoisSelectors();
    populateDispoExpertSelect();
    renderVolontairesList();
}

// Charger la liste des volontaires (pas besoin d'une route séparée, on utilise resources)
async function loadVolontaires() {
    // Les données de volontariat sont dans resources
    renderVolontairesList();
}

// Afficher la liste des volontaires
function renderVolontairesList() {
    const container = document.getElementById('volontairesListContainer');
    if (!container) return;

    // Filtrer les ressources actives
    const activeResources = resources
        .filter(r => r.actif)
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));

    if (activeResources.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">Aucune ressource active</p>';
        return;
    }

    let html = '<table style="width: 100%; border-collapse: collapse;">';
    html += `<thead>
                <tr style="background-color: #4caf50; color: white;">
                    <th style="padding: 10px; text-align: left;">Expert</th>
                    <th style="padding: 10px; text-align: center;">Fonction</th>
                    <th style="padding: 10px; text-align: center;">Taux MAD</th>
                    <th style="padding: 10px; text-align: center;">Volontaire</th>
                    <th style="padding: 10px; text-align: center;">Date activation</th>
                </tr>
            </thead><tbody>`;

    activeResources.forEach(r => {
        const isVolontaire = r.astreinte_volontaire === 1;
        const dateActivation = r.astreinte_date_activation
            ? new Date(r.astreinte_date_activation).toLocaleDateString('fr-FR')
            : '-';

        html += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px;">
                        <strong>${r.nom.toUpperCase()} ${r.prenom}</strong>
                        <br><small style="color: #666;">${r.trigramme}</small>
                    </td>
                    <td style="padding: 10px; text-align: center;">${r.fonction || '-'}</td>
                    <td style="padding: 10px; text-align: center;">${r.taux || '-'}%</td>
                    <td style="padding: 10px; text-align: center;">
                        <label class="toggle-switch">
                            <input type="checkbox" ${isVolontaire ? 'checked' : ''} 
                                   onchange="toggleVolontaire(${r.id}, this.checked)">
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td style="padding: 10px; text-align: center; font-size: 12px;">
                        ${isVolontaire ? dateActivation : '-'}
                    </td>
                </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Activer/désactiver un volontaire
async function toggleVolontaire(resourceId, isVolontaire) {
    try {
        const response = await fetch(`${API_URL}/astreinte/volontaire/${resourceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ volontaire: isVolontaire })
        });

        if (response.ok) {
            await loadResources(); // Recharger les ressources
            renderVolontairesList();
            populateIndispoExpertSelect();
        } else {
            alert('Erreur lors de la mise à jour');
        }
    } catch (error) {
        console.error('Erreur toggle volontaire:', error);
        alert('Erreur: ' + error.message);
    }
}

// Peupler le select des experts pour indispos
// Variable pour stocker les disponibilités en cours d'édition
let currentExpertDispos = {};

function populateDispoExpertSelect() {
    const select = document.getElementById('astreinteDispoExpert');
    if (!select) return;

    select.innerHTML = '<option value="">-- Sélectionner un expert --</option>';

    resources
        .filter(r => r.actif && r.astreinte_volontaire === 1)
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
        .forEach(r => {
            const option = document.createElement('option');
            option.value = r.id;
            option.textContent = `${r.nom.toUpperCase()} ${r.prenom} (${r.trigramme})`;
            select.appendChild(option);
        });
}

function initDispoMoisSelector() {
    const select = document.getElementById('astreinteDispoMois');
    if (!select) return;

    const today = new Date();
    select.innerHTML = '';

    // Proposer le mois en cours et les 3 suivants
    for (let i = 0; i <= 3; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const opt = document.createElement('option');
        opt.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        opt.textContent = d
            .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            .replace(/^./, c => c.toUpperCase());
        if (i === 1) opt.selected = true; // M+1 par défaut
        select.appendChild(opt);
    }
}

// Charger les disponibilités d'un expert pour un mois
async function loadExpertDisponibilites() {
    const expertId = document.getElementById('astreinteDispoExpert').value;
    const mois = document.getElementById('astreinteDispoMois').value;

    console.log('📅 loadExpertDisponibilites - expertId:', expertId, 'mois:', mois);

    const calendar = document.getElementById('astreinteDispoCalendar');
    const placeholder = document.getElementById('astreinteDispoPlaceholder');

    if (!expertId || !mois) {
        calendar.style.display = 'none';
        placeholder.style.display = 'block';
        currentExpertDispos = {}; // Réinitialiser
        return;
    }

    calendar.style.display = 'block';
    placeholder.style.display = 'none';

    const [year, month] = mois.split('-').map(Number);

    // Réinitialiser avant de charger
    currentExpertDispos = {};

    // Charger les disponibilités existantes depuis la base
    try {
        const response = await fetch(`${API_URL}/astreinte/dispos/${expertId}/${mois}`, { credentials: 'include' });
        console.log('📅 Response status:', response.status);
        if (response.ok) {
            const dispos = await response.json();
            console.log('📅 Disponibilités chargées:', dispos.length, dispos);
            // Convertir en objet { dateStr: true } pour les disponibilités
            dispos.forEach(d => {
                currentExpertDispos[d.date] = true; // true = disponible (vert)
            });
            console.log('📅 currentExpertDispos après chargement:', currentExpertDispos);
        } else {
            console.error('📅 Erreur response:', await response.text());
        }
    } catch (error) {
        console.error('Erreur chargement dispos:', error);
    }

    renderDispoCalendar(year, month);
}

// Afficher le calendrier des disponibilités
function renderDispoCalendar(year, month) {
    const container = document.getElementById('astreinteDispoCalendarContent');
    if (!container) return;

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    // Calculer les compteurs mensuels
    let totalHeures = 0;
    let samedisCount = 0;
    let dimanchesCount = 0;
    let joursCount = 0;

    Object.keys(currentExpertDispos)
        .filter(d => currentExpertDispos[d] === true)
        .forEach(dateStr => {
            const [y, m, day] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, day); // Mois 0-indexé, évite le décalage UTC
            const dayOfWeek = dateObj.getDay();
            joursCount++;
            if (dayOfWeek === 6) {
                // Samedi
                totalHeures += 24;
                samedisCount++;
            } else if (dayOfWeek === 0) {
                // Dimanche
                totalHeures += 24;
                dimanchesCount++;
            } else {
                // Lun-Ven
                totalHeures += 14;
            }
        });

    // Déterminer les couleurs des compteurs
    const heuresColor = totalHeures > 144 ? '#e74c3c' : totalHeures > 100 ? '#f39c12' : '#27ae60';
    const samedisColor = samedisCount > 1 ? '#e74c3c' : samedisCount === 1 ? '#27ae60' : '#666';
    const dimanchesColor = dimanchesCount > 1 ? '#e74c3c' : dimanchesCount === 1 ? '#27ae60' : '#666';

    let html = `<h4 style="color: #e65100; margin-bottom: 10px; text-transform: capitalize;">📅 ${monthName}</h4>`;

    // Compteurs mensuels
    html += `<div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                <div style="background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%); border: 2px solid ${heuresColor}; border-radius: 8px; padding: 10px 15px; min-width: 150px; text-align: center;">
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Heures d'astreinte</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${heuresColor};">${totalHeures}h <span style="font-size: 14px; font-weight: normal;">/ 144h</span></div>
                </div>
                <div style="background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%); border: 2px solid ${samedisColor}; border-radius: 8px; padding: 10px 15px; min-width: 100px; text-align: center;">
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Samedis</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${samedisColor};">${samedisCount} <span style="font-size: 14px; font-weight: normal;">/ 1 max</span></div>
                </div>
                <div style="background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%); border: 2px solid ${dimanchesColor}; border-radius: 8px; padding: 10px 15px; min-width: 100px; text-align: center;">
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Dimanches</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${dimanchesColor};">${dimanchesCount} <span style="font-size: 14px; font-weight: normal;">/ 1 max</span></div>
                </div>
            </div>`;

    // En-tête des jours de la semaine (sans tri)
    html += '<table style="width: 100%; border-collapse: collapse; table-layout: fixed;">';
    html += '<thead><tr>';
    ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(day => {
        html += `<th style="padding: 10px; background-color: #ff9800; color: white; text-align: center; font-size: 12px; cursor: default;">${day}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Premier jour du mois (0 = dimanche, on veut 0 = lundi)
    const firstDay = new Date(year, month - 1, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;

    let currentDay = 1;
    let weekCount = Math.ceil((daysInMonth + startOffset) / 7);

    for (let week = 0; week < weekCount; week++) {
        html += '<tr>';
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const cellIndex = week * 7 + dayOfWeek;

            if (cellIndex < startOffset || currentDay > daysInMonth) {
                html += '<td style="padding: 5px; background-color: #f5f5f5;"></td>';
            } else {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

                // Par défaut INDISPONIBLE (rouge), sauf si explicitement marqué disponible
                const isDisponible = currentExpertDispos[dateStr] === true;
                const bgColor = isDisponible ? '#27ae60' : '#e74c3c';
                const icon = isDisponible ? '✓' : '✗';

                const cellStyle = `background-color: ${bgColor}; color: white; cursor: pointer; text-align: center; padding: 12px 8px; border: 2px solid white; border-radius: 5px;`;
                const cellContent = `
                            <div onclick="toggleDispoDay('${dateStr}')" style="${cellStyle}">
                                <div style="font-weight: bold; font-size: 18px;">${currentDay}</div>
                                <div style="font-size: 22px;">${icon}</div>
                            </div>
                        `;

                html += `<td style="padding: 3px; vertical-align: top;">${cellContent}</td>`;
                currentDay++;
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table>';

    // Résumé avec alertes FPH
    const dispoCount = Object.values(currentExpertDispos).filter(v => v === true).length;
    const indispoCount = daysInMonth - dispoCount;

    // Calculer les alertes (réutilisation des variables totalHeures, samedisCount, dimanchesCount calculées plus haut)
    let alertes = [];

    // Alerte max 72h sur 15 jours (on vérifie sur le mois = ~2x15 jours)
    // Donc max ~144h par mois, ou ~72h pour les 15 premiers jours
    // Pour simplifier, on alerte si > 72h sur le mois (sera affiné)
    if (totalHeures > 144) {
        alertes.push(`⚠️ ${totalHeures}h d'astreinte déclarées ce mois (max 144h ≈ 2x72h pour 2 périodes de 15 jours)`);
    }

    // Alerte max 1 samedi par mois
    if (samedisCount > 1) {
        alertes.push(`⚠️ ${samedisCount} samedis déclarés (max 1 samedi/mois selon décret FPH)`);
    }

    // Alerte max 1 dimanche par mois
    if (dimanchesCount > 1) {
        alertes.push(`⚠️ ${dimanchesCount} dimanches déclarés (max 1 dimanche/mois selon décret FPH)`);
    }

    html += `<div style="margin-top: 15px; padding: 10px; background: #fff3e0; border-radius: 5px; font-size: 12px;">
                <strong>Résumé :</strong> <span style="color: #27ae60;">${dispoCount} créneaux disponibles (${totalHeures}h)</span> / <span style="color: #e74c3c;">${indispoCount} indisponibilités</span>
            </div>`;

    // Afficher les alertes si présentes
    if (alertes.length > 0) {
        html += `<div style="margin-top: 10px; padding: 10px; background: #ffebee; border: 1px solid #e74c3c; border-radius: 5px; font-size: 12px; color: #c62828;">
                    <strong>🚨 Alertes règles FPH (Décret n°2002-9) :</strong>
                    <ul style="margin: 5px 0 0 15px; padding: 0;">
                        ${alertes.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                </div>`;
    }

    container.innerHTML = html;
}

// Vérifier les contraintes FPH pour la saisie des disponibilités
function checkContraintesFPHSaisie(dateStr) {
    const warnings = [];
    const mois = document.getElementById('astreinteDispoMois').value;
    const [year, month] = mois.split('-').map(Number);

    // Compter les disponibilités du mois et calculer les heures
    const disposMois = Object.keys(currentExpertDispos).filter(d => {
        if (currentExpertDispos[d] !== true) return false;
        const [y, m] = d.split('-').map(Number);
        return y === year && m === month;
    });

    // Compter les samedis et dimanches déjà déclarés
    let samedisCount = 0;
    let dimanchesCount = 0;
    let totalHeures = 0;

    disposMois.forEach(d => {
        const [y, m, day] = d.split('-').map(Number);
        const dateObj = new Date(y, m - 1, day); // Mois 0-indexé, évite le décalage UTC
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 6) {
            samedisCount++;
            totalHeures += 24;
        } else if (dayOfWeek === 0) {
            dimanchesCount++;
            totalHeures += 24;
        } else {
            totalHeures += 14;
        }
    });

    // Vérifier le jour qu'on ajoute
    const [newY, newM, newD] = dateStr.split('-').map(Number);
    const newDateObj = new Date(newY, newM - 1, newD); // Mois 0-indexé
    const newDayOfWeek = newDateObj.getDay();

    // Règle : max 1 samedi par mois
    if (newDayOfWeek === 6 && samedisCount >= 1) {
        warnings.push(
            `⚠️ Vous avez déjà déclaré ${samedisCount} samedi ce mois.\nSelon le Décret n°2002-9, un agent ne peut participer au service d'astreinte que dans la limite d'1 samedi par mois.`
        );
    }

    // Règle : max 1 dimanche par mois
    if (newDayOfWeek === 0 && dimanchesCount >= 1) {
        warnings.push(
            `⚠️ Vous avez déjà déclaré ${dimanchesCount} dimanche ce mois.\nSelon le Décret n°2002-9, un agent ne peut participer au service d'astreinte que dans la limite d'1 dimanche par mois.`
        );
    }

    // Calculer les heures avec le nouveau créneau
    const newCreneauHeures = newDayOfWeek === 0 || newDayOfWeek === 6 ? 24 : 14;
    const newTotalHeures = totalHeures + newCreneauHeures;

    // Règle : max 72h sur 15 jours (donc ~144h max sur un mois)
    if (newTotalHeures > 144) {
        warnings.push(
            `⚠️ Vous atteignez ${newTotalHeures}h d'astreinte ce mois.\nSelon le Décret n°2002-9, la durée de l'astreinte ne peut excéder 72h pour 15 jours (soit ~144h/mois max).`
        );
    }

    return warnings;
}

// Basculer la disponibilité d'un jour
function toggleDispoDay(dateStr) {
    if (currentExpertDispos[dateStr] === true) {
        // Était disponible (vert), devient indisponible (rouge) - pas de vérification nécessaire
        delete currentExpertDispos[dateStr];
    } else {
        // Était indisponible (rouge), veut devenir disponible (vert) - vérifier les contraintes AVANT d'ajouter
        const warnings = checkContraintesFPHSaisie(dateStr);
        if (warnings.length > 0) {
            // Ne pas ajouter - rester en rouge
            alert('❌ Impossible de se déclarer disponible ce jour :\n\n' + warnings.join('\n\n'));
        } else {
            // Pas de warning, on peut ajouter
            currentExpertDispos[dateStr] = true;
        }
    }

    // Re-render le calendrier
    const mois = document.getElementById('astreinteDispoMois').value;
    const [year, month] = mois.split('-').map(Number);
    renderDispoCalendar(year, month);
}

// Réinitialiser les disponibilités du mois
function resetExpertDisponibilites() {
    const expertId = document.getElementById('astreinteDispoExpert').value;
    const mois = document.getElementById('astreinteDispoMois').value;

    if (!expertId || !mois) {
        alert('Veuillez sélectionner un expert et un mois');
        return;
    }

    const expert = resources.find(r => r.id === parseInt(expertId));
    const expertName = expert ? `${expert.nom.toUpperCase()} ${expert.prenom}` : 'cet expert';
    const [year, month] = mois.split('-').map(Number);
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    if (
        !confirm(
            `Voulez-vous réinitialiser toutes les disponibilités de ${expertName} pour ${monthName} ?\n\nTous les jours repasseront en rouge (indisponible).`
        )
    ) {
        return;
    }

    // Réinitialiser toutes les disponibilités du mois
    currentExpertDispos = {};

    // Re-render le calendrier
    renderDispoCalendar(year, month);
}

// Sauvegarder les disponibilités
async function saveExpertDisponibilites() {
    const expertId = document.getElementById('astreinteDispoExpert').value;
    const mois = document.getElementById('astreinteDispoMois').value;

    if (!expertId || !mois) {
        alert('Veuillez sélectionner un expert et un mois');
        return;
    }

    // Collecter les disponibilités (dates où currentExpertDispos[date] === true)
    const disponibilites = Object.keys(currentExpertDispos).filter(date => currentExpertDispos[date] === true);

    // Les contraintes sont déjà vérifiées à chaque clic, donc pas de double vérification nécessaire

    try {
        const response = await fetch(`${API_URL}/astreinte/dispos/${expertId}/${mois}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ disponibilites })
        });

        if (response.ok) {
            alert('✅ Disponibilités enregistrées avec succès !');
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur sauvegarde dispos:', error);
        alert('Erreur: ' + error.message);
    }
}

// Anciennes fonctions conservées pour compatibilité
async function loadAstreinteIndispos() {
    // Plus utilisé directement
}

function populateIndispoExpertSelect() {
    populateDispoExpertSelect();
}

// Initialiser les sélecteurs de mois
function initMoisSelectors() {
    const selectGen = document.getElementById('astreinteMoisGeneration');
    const selectAff = document.getElementById('astreinteMoisAffichage');

    if (!selectGen || !selectAff) return;

    const today = new Date();
    const months = [];

    // Proposer le mois en cours et les 3 suivants
    for (let i = 0; i <= 3; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        months.push({
            value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });
    }

    // Pour la génération, proposer M+1 par défaut
    selectGen.innerHTML = '';
    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label.charAt(0).toUpperCase() + m.label.slice(1);
        if (i === 1) opt.selected = true; // M+1
        selectGen.appendChild(opt);
    });

    // Pour l'affichage, proposer tous les mois
    selectAff.innerHTML = '';
    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label.charAt(0).toUpperCase() + m.label.slice(1);
        if (i === 0) opt.selected = true; // Mois en cours
        selectAff.appendChild(opt);
    });
}

// Générer le planning d'astreinte
async function generateAstreintePlanning() {
    const mois = document.getElementById('astreinteMoisGeneration').value;
    if (!mois) {
        alert('Veuillez sélectionner un mois');
        return;
    }

    const [year, month] = mois.split('-').map(Number);

    // Vérifier qu'il y a des volontaires
    const volontaires = resources.filter(r => r.actif && r.astreinte_volontaire === 1);
    if (volontaires.length === 0) {
        alert("Aucun volontaire inscrit au dispositif d'astreinte");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/astreinte/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ year, month })
        });

        if (response.ok) {
            const result = await response.json();
            astreintePlanning = result.planning;
            displayGeneratedPlanning(result);
        } else {
            const err = await response.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        console.error('Erreur génération planning:', error);
        alert('Erreur: ' + error.message);
    }
}

// Afficher le planning généré
// Variable pour stocker les disponibilités chargées pour le planning
let planningDisponibilites = [];

function displayGeneratedPlanning(result) {
    const container = document.getElementById('astreintePlanningResult');
    const tableContainer = document.getElementById('astreintePlanningTable');

    if (!container || !tableContainer) return;

    container.style.display = 'block';

    const planning = result.planning;
    const warnings = result.warnings || [];
    const stats = result.stats || {};
    planningDisponibilites = result.disponibilites || [];

    let html = '';

    // Afficher les avertissements
    if (warnings.length > 0) {
        html += '<div style="background: #ffebee; padding: 10px; border-radius: 5px; margin-bottom: 15px;">';
        html += '<strong style="color: #c62828;">⚠️ Avertissements :</strong><ul style="margin: 5px 0 0 20px;">';
        warnings.forEach(w => {
            html += `<li style="color: #c62828; font-size: 12px;">${w}</li>`;
        });
        html += '</ul></div>';
    }

    // Afficher les statistiques
    if (Object.keys(stats).length > 0) {
        html += '<div style="background: #e8f5e9; padding: 10px; border-radius: 5px; margin-bottom: 15px;">';
        html += '<strong style="color: #2e7d32;">📊 Répartition :</strong>';
        html += '<div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 10px;">';
        Object.entries(stats).forEach(([name, count]) => {
            html += `<span style="background: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">
                        ${name}: <strong>${count}</strong> astreinte(s)
                    </span>`;
        });
        html += '</div></div>';
    }

    // Tableau du planning
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += `<thead>
                <tr style="background-color: #1565c0; color: white;">
                    <th style="padding: 10px; text-align: left;">Date</th>
                    <th style="padding: 10px; text-align: center;">Jour</th>
                    <th style="padding: 10px; text-align: center;">Créneau</th>
                    <th style="padding: 10px; text-align: left;">Expert assigné</th>
                    <th style="padding: 10px; text-align: center;">Actions</th>
                </tr>
            </thead><tbody>`;

    planning.forEach(slot => {
        const [slotY, slotM, slotD] = slot.date.split('-').map(Number);
        const dateObj = new Date(slotY, slotM - 1, slotD); // Mois 0-indexé
        const dateStr = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const bgColor = isWeekend ? '#fff3e0' : 'white';
        const creneauLabel = slot.type_creneau === 'soir' ? '🌙 Soir (18h-08h)' : '☀️ Journée';

        const currentResource = resources.find(r => r.id === slot.resource_id);
        const expertName = currentResource
            ? `${currentResource.nom.toUpperCase()} ${currentResource.prenom} (${currentResource.trigramme})`
            : '<span style="color: #e74c3c;">⚠️ Non assigné</span>';

        // Filtrer pour n'afficher que les experts disponibles pour cette date
        // MAIS exclure l'expert actuellement assigné de la liste (il est déjà affiché dans "Expert assigné")
        const expertsDisponibles = getExpertsDisponiblesPourDate(slot.date).filter(r => r.id !== slot.resource_id);

        html += `<tr id="astreinte-row-${slot.id}" style="border-bottom: 1px solid #eee; background-color: ${bgColor};">
                    <td style="padding: 10px;">${dateStr}</td>
                    <td style="padding: 10px; text-align: center; text-transform: capitalize;">${dayName}</td>
                    <td style="padding: 10px; text-align: center;">${creneauLabel}</td>
                    <td id="expert-cell-${slot.id}" style="padding: 10px;">${expertName}</td>
                    <td style="padding: 10px; text-align: center;">
                        <select id="select-${slot.id}" onchange="changeAstreinteAssignment(${slot.id}, this.value, '${slot.date}', this)" style="padding: 4px;">
                            <option value="">-- Modifier --</option>
                            ${expertsDisponibles
                                .map(
                                    r =>
                                        `<option value="${r.id}">
                                    ${r.nom.toUpperCase()} ${r.prenom}
                                </option>`
                                )
                                .join('')}
                        </select>
                    </td>
                </tr>`;
    });

    html += '</tbody></table>';

    // Bouton de sauvegarde
    html += `<div style="margin-top: 15px; text-align: center;">
                <button onclick="saveAstreintePlanning()" style="background-color: #27ae60; color: white; padding: 10px 30px; font-size: 14px;">
                    💾 Sauvegarder le planning
                </button>
            </div>`;

    tableContainer.innerHTML = html;
}

// Obtenir les experts disponibles pour une date donnée
function getExpertsDisponiblesPourDate(date) {
    // Filtrer les ressources qui ont déclaré être disponibles pour cette date
    return resources
        .filter(r => {
            if (!r.actif || r.astreinte_volontaire !== 1) return false;

            // Vérifier si l'expert a une disponibilité déclarée pour cette date
            const dispo = planningDisponibilites.find(d => d.resource_id === r.id && d.date === date);
            return !!dispo;
        })
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
}

// Vérifier les contraintes FPH pour un expert (Décret n°2002-9 du 4 janvier 2002)
function checkContraintesFPHClient(expertId, date) {
    const errors = [];
    const [dateY, dateM, dateD] = date.split('-').map(Number);
    const dateObj = new Date(dateY, dateM - 1, dateD); // Mois 0-indexé
    const newDayOfWeek = dateObj.getDay();

    // Compter les samedis, dimanches et heures totales du mois pour cet expert
    let samedisCount = 0;
    let dimanchesCount = 0;
    let totalHeures = 0;

    astreintePlanning.forEach(slot => {
        if (slot.resource_id === parseInt(expertId)) {
            const [slotY, slotM, slotD] = slot.date.split('-').map(Number);
            const slotDate = new Date(slotY, slotM - 1, slotD); // Mois 0-indexé
            const dayOfWeek = slotDate.getDay();

            if (dayOfWeek === 6) {
                // Samedi
                samedisCount++;
                totalHeures += 24;
            } else if (dayOfWeek === 0) {
                // Dimanche
                dimanchesCount++;
                totalHeures += 24;
            } else {
                // Lun-Ven
                totalHeures += 14;
            }
        }
    });

    // Calculer les heures du nouveau créneau
    const newCreneauHeures = newDayOfWeek === 0 || newDayOfWeek === 6 ? 24 : 14;

    // Règle : max 1 samedi par mois
    if (newDayOfWeek === 6 && samedisCount >= 1) {
        errors.push(`Maximum d'1 samedi par mois atteint (${samedisCount} samedi déjà assigné)`);
    }

    // Règle : max 1 dimanche par mois
    if (newDayOfWeek === 0 && dimanchesCount >= 1) {
        errors.push(`Maximum d'1 dimanche par mois atteint (${dimanchesCount} dimanche déjà assigné)`);
    }

    // Règle : max 72h sur 15 jours (~144h/mois)
    if (totalHeures + newCreneauHeures > 144) {
        errors.push(`Maximum de 72h/15 jours dépassé (${totalHeures + newCreneauHeures}h ce mois, max ~144h)`);
    }

    return errors;
}

// Modifier une assignation
async function changeAstreinteAssignment(slotId, newResourceId, slotDate, selectElement) {
    if (!newResourceId) return;

    // Récupérer l'ancien expert assigné
    const slot = astreintePlanning.find(s => s.id === slotId);
    const oldResourceId = slot ? slot.resource_id : null;
    const oldResource = oldResourceId ? resources.find(r => r.id === oldResourceId) : null;

    // Récupérer le nouvel expert
    const newResource = resources.find(r => r.id === parseInt(newResourceId));

    console.log('changeAstreinteAssignment:', { slotId, oldResourceId, newResourceId, slotDate });

    // Vérifier les contraintes FPH
    const errors = checkContraintesFPHClient(newResourceId, slotDate);
    if (errors.length > 0) {
        alert("⚠️ Impossible d'assigner cet expert :\n\n" + errors.join('\n'));
        selectElement.value = '';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/astreinte/slot/${slotId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ resource_id: parseInt(newResourceId) })
        });

        if (response.ok) {
            // Mettre à jour le planning local
            if (slot) {
                slot.resource_id = parseInt(newResourceId);
            }

            // Mettre à jour la cellule "Expert assigné" avec le nouveau nom
            const expertCell = document.getElementById(`expert-cell-${slotId}`);
            if (expertCell && newResource) {
                expertCell.innerHTML = `${newResource.nom.toUpperCase()} ${newResource.prenom} (${newResource.trigramme})`;
            }

            // Reconstruire la liste déroulante
            const expertsDisponibles = getExpertsDisponiblesPourDate(slotDate).filter(
                r => r.id !== parseInt(newResourceId)
            ); // Exclure le nouvel assigné

            // Si l'ancien expert était disponible pour cette date, il doit revenir dans la liste
            let optionsHtml = '<option value="">-- Modifier --</option>';
            expertsDisponibles.forEach(r => {
                optionsHtml += `<option value="${r.id}">${r.nom.toUpperCase()} ${r.prenom}</option>`;
            });

            selectElement.innerHTML = optionsHtml;
            selectElement.value = ''; // Réinitialiser la sélection

            console.log('Assignation mise à jour avec succès');
        } else {
            const err = await response.json();
            console.error('Erreur serveur:', err);
            alert('Erreur: ' + err.error);
            selectElement.value = '';
        }
    } catch (error) {
        console.error('Erreur modification:', error);
        alert('Erreur réseau: ' + error.message);
        selectElement.value = '';
    }
}

// Sauvegarder le planning
async function saveAstreintePlanning() {
    alert('Planning sauvegardé avec succès !');
    // Le planning est déjà sauvegardé en base lors de la génération
    // Cette fonction pourrait envoyer des notifications aux experts
}

// Exporter le planning en CSV
function exportAstreintePlanning() {
    if (!astreintePlanning || astreintePlanning.length === 0) {
        alert("Aucun planning à exporter. Veuillez d'abord générer un planning.");
        return;
    }

    let csv = '\ufeff'; // BOM UTF-8
    csv += 'Date;Jour;Créneau;Expert;Trigramme\n';

    astreintePlanning.forEach(slot => {
        const dateObj = new Date(slot.date);
        const dateStr = dateObj.toLocaleDateString('fr-FR');
        const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
        const creneau = slot.type_creneau === 'soir' ? 'Soir (18h-08h)' : 'Journée complète';
        const resource = resources.find(r => r.id === slot.resource_id);
        const expertName = resource ? `${resource.nom.toUpperCase()} ${resource.prenom}` : 'Non assigné';
        const trigramme = resource ? resource.trigramme : '-';

        csv += `${dateStr};${dayName};${creneau};${expertName};${trigramme}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `planning_astreinte_${document.getElementById('astreinteMoisGeneration').value}.csv`;
    link.click();
}

// Charger le planning actuel
async function loadAstreintePlanningActuel() {
    const mois = document.getElementById('astreinteMoisAffichage').value;
    if (!mois) return;

    const container = document.getElementById('astreintePlanningActuelContainer');
    container.innerHTML = '<p style="color: #999; font-style: italic;">Chargement...</p>';

    try {
        const response = await fetch(`${API_URL}/astreinte/planning/${mois}`, { credentials: 'include' });
        if (response.ok) {
            const planning = await response.json();
            if (planning.length === 0) {
                container.innerHTML = '<p style="color: #999; font-style: italic;">Aucun planning pour ce mois</p>';
                return;
            }

            // Afficher le planning similaire à displayGeneratedPlanning
            let html = '<table style="width: 100%; border-collapse: collapse;">';
            html += `<thead>
                        <tr style="background-color: #9c27b0; color: white;">
                            <th style="padding: 10px; text-align: left;">Date</th>
                            <th style="padding: 10px; text-align: center;">Jour</th>
                            <th style="padding: 10px; text-align: center;">Créneau</th>
                            <th style="padding: 10px; text-align: left;">Expert assigné</th>
                        </tr>
                    </thead><tbody>`;

            planning.forEach(slot => {
                const dateObj = new Date(slot.date);
                const dateStr = dateObj.toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const bgColor = isWeekend ? '#f3e5f5' : 'white';
                const creneauLabel = slot.type_creneau === 'soir' ? '🌙 Soir (18h-08h)' : '☀️ Journée';

                const resource = resources.find(r => r.id === slot.resource_id);
                const expertName = resource
                    ? `${resource.nom.toUpperCase()} ${resource.prenom} (${resource.trigramme})`
                    : '<span style="color: #e74c3c;">⚠️ Non assigné</span>';

                html += `<tr style="border-bottom: 1px solid #eee; background-color: ${bgColor};">
                            <td style="padding: 10px;">${dateStr}</td>
                            <td style="padding: 10px; text-align: center; text-transform: capitalize;">${dayName}</td>
                            <td style="padding: 10px; text-align: center;">${creneauLabel}</td>
                            <td style="padding: 10px;">${expertName}</td>
                        </tr>`;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="color: #e74c3c;">Erreur lors du chargement</p>';
        }
    } catch (error) {
        console.error('Erreur chargement planning:', error);
        container.innerHTML = '<p style="color: #e74c3c;">Erreur: ' + error.message + '</p>';
    }
}

// ========== FIN GESTION DES ASTREINTES ==========
