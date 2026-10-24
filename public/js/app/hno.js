// Application principale : hno
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ============== FONCTIONS POUR LES ASTREINTES/HNO ==============

// Liste statique des SAMU pour les astreintes
const ASTREINTES_SAMU_LIST = [
    'SAMU 01',
    'SAMU 02',
    'SAMU 03',
    'SAMU 04',
    'SAMU 05',
    'SAMU 06',
    'SAMU 07',
    'SAMU 08',
    'SAMU 09',
    'SAMU 10',
    'SAMU 11',
    'SAMU 12',
    'SAMU 13',
    'SAMU 14',
    'SAMU 15',
    'SAMU 16',
    'SAMU 17',
    'SAMU 18',
    'SAMU 19',
    'SAMU 21',
    'SAMU 22',
    'SAMU 23',
    'SAMU 24',
    'SAMU 25',
    'SAMU 26',
    'SAMU 27',
    'SAMU 28',
    'SAMU 29',
    'SAMU 30',
    'SAMU 31',
    'SAMU 32',
    'SAMU 33',
    'SAMU 34',
    'SAMU 35',
    'SAMU 36',
    'SAMU 37',
    'SAMU 38',
    'SAMU 40',
    'SAMU 41',
    'SAMU 42',
    'SAMU 43',
    'SAMU 44',
    'SAMU 45',
    'SAMU 46',
    'SAMU 47',
    'SAMU 48',
    'SAMU 49',
    'SAMU 50',
    'SAMU 51',
    'SAMU 52',
    'SAMU 53',
    'SAMU 54',
    'SAMU 55',
    'SAMU 56',
    'SAMU 57',
    'SAMU 59',
    'SAMU 60',
    'SAMU 61',
    'SAMU 62',
    'SAMU 63',
    'SAMU 64A',
    'SAMU 64B',
    'SAMU 65',
    'SAMU 66',
    'SAMU 67',
    'SAMU 68',
    'SAMU 69',
    'SAMU 71',
    'SAMU 72',
    'SAMU 73',
    'SAMU 74',
    'SAMU 75',
    'SAMU 76A',
    'SAMU 76B',
    'SAMU 77',
    'SAMU 78',
    'SAMU 79',
    'SAMU 80',
    'SAMU 81',
    'SAMU 82',
    'SAMU 83',
    'SAMU 84',
    'SAMU 85',
    'SAMU 86',
    'SAMU 87',
    'SAMU 88',
    'SAMU 89',
    'SAMU 91',
    'SAMU 92',
    'SAMU 93',
    'SAMU 94',
    'SAMU 95',
    'SAMU 971',
    'SAMU 972',
    'SAMU 973',
    'SAMU 974',
    'SAMU 976',
    'SAMU 2A',
    'SAMU 2B'
];

let astreintesData = [];
let expertsListForAstreintes = [];

async function openAstreintesModal() {
    const modal = document.getElementById('astreintesModal');
    modal.style.display = 'flex';

    // Adapter le titre selon le profil
    const title = document.getElementById('astreintesModalTitle');
    const expertSelectDiv = document.getElementById('astreintesExpertSelect');

    if (currentUser.activeProfile === 'admin') {
        title.textContent = 'Gérer les astreintes/HNO';
        expertSelectDiv.style.display = 'block';
        await loadExpertsForAstreintes();
    } else {
        title.textContent = 'Gérer mes astreintes/HNO';
        expertSelectDiv.style.display = 'none';
    }

    // Charger la liste des SAMU
    const samuSelect = document.getElementById('astreintesSamu');
    samuSelect.innerHTML =
        '<option value="">-- Sélectionner un SAMU --</option>' +
        ASTREINTES_SAMU_LIST.map(s => `<option value="${s}">${s}</option>`).join('');

    // Charger les astreintes
    await loadAstreintes();

    // Réinitialiser le formulaire
    resetAstreintesForm();
}

function closeAstreintesModal() {
    document.getElementById('astreintesModal').style.display = 'none';
}

async function loadExpertsForAstreintes() {
    try {
        const response = await fetch(`${API_URL}/experts-list`, { credentials: 'include' });
        if (response.ok) {
            expertsListForAstreintes = await response.json();
            const select = document.getElementById('astreintesExpert');
            select.innerHTML =
                '<option value="">-- Sélectionner un expert --</option>' +
                expertsListForAstreintes.map(e => `<option value="${e.id}">${e.nom} ${e.prenom}</option>`).join('');
        }
    } catch (error) {
        console.error('Erreur chargement experts:', error);
    }
}

async function loadAstreintes() {
    try {
        const isAdmin = currentUser.activeProfile === 'admin';
        const url = isAdmin ? `${API_URL}/astreintes` : `${API_URL}/mes-astreintes`;
        const response = await fetch(url, { credentials: 'include' });

        if (response.ok) {
            astreintesData = await response.json();
            displayAstreintesTree();
        }
    } catch (error) {
        console.error('Erreur chargement astreintes:', error);
    }
}

function displayAstreintesTree() {
    const container = document.getElementById('astreintesTreeView');

    if (astreintesData.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">Aucune astreinte/HNO enregistrée</p>';
        return;
    }

    const isAdmin = currentUser.activeProfile === 'admin';
    let html = '';

    if (isAdmin) {
        // Arborescence : Expert > Année > Mois
        const byExpert = {};
        astreintesData.forEach(a => {
            const expertName = `${a.user_nom} ${a.user_prenom}`;
            if (!byExpert[expertName]) byExpert[expertName] = {};

            const date = new Date(a.date_debut);
            const year = date.getFullYear();
            const month = date.getMonth();

            if (!byExpert[expertName][year]) byExpert[expertName][year] = {};
            if (!byExpert[expertName][year][month]) byExpert[expertName][year][month] = [];
            byExpert[expertName][year][month].push(a);
        });

        html = buildAdminTree(byExpert);
    } else {
        // Arborescence : Année > Mois
        const byYear = {};
        astreintesData.forEach(a => {
            const date = new Date(a.date_debut);
            const year = date.getFullYear();
            const month = date.getMonth();

            if (!byYear[year]) byYear[year] = {};
            if (!byYear[year][month]) byYear[year][month] = [];
            byYear[year][month].push(a);
        });

        html = buildExpertTree(byYear);
    }

    container.innerHTML = html;
}

function buildAdminTree(byExpert) {
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
    let html = '';

    Object.keys(byExpert)
        .sort()
        .forEach(expertName => {
            html += `<div style="margin-bottom: 10px;">
                    <div onclick="toggleTreeNode(this)" style="cursor: pointer; padding: 8px; background: #e1bee7; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        <span class="tree-arrow">▶</span> 👤 ${expertName}
                    </div>
                    <div class="tree-content" style="display: none; margin-left: 20px; margin-top: 5px;">`;

            Object.keys(byExpert[expertName])
                .sort((a, b) => b - a)
                .forEach(year => {
                    html += `<div style="margin-bottom: 5px;">
                        <div onclick="toggleTreeNode(this)" style="cursor: pointer; padding: 6px; background: #ce93d8; border-radius: 4px; display: flex; align-items: center; gap: 5px;">
                            <span class="tree-arrow">▶</span> 📅 ${year}
                        </div>
                        <div class="tree-content" style="display: none; margin-left: 20px; margin-top: 5px;">`;

                    Object.keys(byExpert[expertName][year])
                        .sort((a, b) => b - a)
                        .forEach(month => {
                            html += `<div style="margin-bottom: 5px;">
                            <div onclick="toggleTreeNode(this)" style="cursor: pointer; padding: 5px; background: #f3e5f5; border-radius: 4px; display: flex; align-items: center; gap: 5px;">
                                <span class="tree-arrow">▶</span> ${monthNames[month]}
                            </div>
                            <div class="tree-content" style="display: none; margin-left: 20px; margin-top: 5px;">`;

                            byExpert[expertName][year][month].forEach(a => {
                                html += buildAstreinteItem(a);
                            });

                            html += `</div></div>`;
                        });

                    html += `</div></div>`;
                });

            html += `</div></div>`;
        });

    return html;
}

function buildExpertTree(byYear) {
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
    let html = '';

    Object.keys(byYear)
        .sort((a, b) => b - a)
        .forEach(year => {
            html += `<div style="margin-bottom: 10px;">
                    <div onclick="toggleTreeNode(this)" style="cursor: pointer; padding: 8px; background: #e1bee7; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        <span class="tree-arrow">▶</span> 📅 ${year}
                    </div>
                    <div class="tree-content" style="display: none; margin-left: 20px; margin-top: 5px;">`;

            Object.keys(byYear[year])
                .sort((a, b) => b - a)
                .forEach(month => {
                    html += `<div style="margin-bottom: 5px;">
                        <div onclick="toggleTreeNode(this)" style="cursor: pointer; padding: 6px; background: #ce93d8; border-radius: 4px; display: flex; align-items: center; gap: 5px;">
                            <span class="tree-arrow">▶</span> ${monthNames[month]}
                        </div>
                        <div class="tree-content" style="display: none; margin-left: 20px; margin-top: 5px;">`;

                    byYear[year][month].forEach(a => {
                        html += buildAstreinteItem(a);
                    });

                    html += `</div></div>`;
                });

            html += `</div></div>`;
        });

    return html;
}

function buildAstreinteItem(a) {
    const typeLabel =
        a.type === 'astreinte' ? '🔔 Astreinte' : a.type === 'activite_courante' ? '✅ Activité courante' : '⏰ HNO';
    const typeColor = a.type === 'astreinte' ? '#ff9800' : a.type === 'activite_courante' ? '#2e7d32' : '#2196f3';
    const dateDebut = formatDateFr(a.date_debut);
    const dateFin = formatDateFr(a.date_fin);
    const periode = dateDebut === dateFin ? dateDebut : `${dateDebut} - ${dateFin}`;
    // Afficher les heures pour astreintes ET HNO
    const heures = a.heure_debut && a.heure_fin ? ` (${a.heure_debut} - ${a.heure_fin})` : '';
    const samuInfo = a.tous_samu ? 'Tous les SAMU' : a.samu;

    return `<div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 5px; border-left: 3px solid ${typeColor};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span style="background: ${typeColor}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${typeLabel}</span>
                        <div style="margin-top: 5px; font-weight: bold;">${a.objet}</div>
                        <div style="font-size: 12px; color: #666; margin-top: 3px;">
                            📅 ${periode}${heures}<br>
                            🏥 ${samuInfo}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="editAstreinte(${a.id})" style="background: #3498db; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">✏️</button>
                        <button onclick="deleteAstreinte(${a.id})" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">🗑️</button>
                    </div>
                </div>
            </div>`;
}

function toggleTreeNode(element) {
    const content = element.nextElementSibling;
    const arrow = element.querySelector('.tree-arrow');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
}

function toggleHnoFields() {
    // Les champs heures sont maintenant toujours visibles (astreintes et HNO)
    // Cette fonction est conservée pour compatibilité mais ne fait plus rien
}

function toggleSamuSelect() {
    const tousSamu = document.getElementById('astreintesTousSamu').checked;
    const samuSelect = document.getElementById('astreintesSamu');
    samuSelect.disabled = tousSamu;
    if (tousSamu) {
        samuSelect.value = '';
    }
}

function syncAstreintesDateFin() {
    const dateDebut = document.getElementById('astreintesDateDebut').value;
    const dateFin = document.getElementById('astreintesDateFin');
    if (dateDebut && !dateFin.value) {
        dateFin.value = dateDebut;
    }
}

function toggleAstreinteForm() {
    const body = document.getElementById('astreinteFormBody');
    const icon = document.getElementById('astreinteFormIcon');
    if (!body || !icon) return;
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = '▼';
    } else {
        body.style.display = 'none';
        icon.textContent = '▶';
    }
}

function resetAstreintesForm() {
    document.getElementById('astreintesEditId').value = '';
    document.getElementById('astreintesType').value = 'astreinte';
    document.getElementById('astreintesDateDebut').value = '';
    document.getElementById('astreintesDateFin').value = '';
    document.getElementById('astreintesHeureDebut').value = '';
    document.getElementById('astreintesHeureFin').value = '';
    document.getElementById('astreintesSamu').value = '';
    document.getElementById('astreintesSamu').disabled = false;
    document.getElementById('astreintesTousSamu').checked = false;
    document.getElementById('astreintesObjet').value = '';

    if (currentUser.activeProfile === 'admin') {
        document.getElementById('astreintesExpert').value = '';
    }

    document.getElementById('astreintesFormTitle').textContent = 'Ajouter une astreinte/HNO';
    toggleHnoFields();

    // Replier le formulaire après réinitialisation
    const body = document.getElementById('astreinteFormBody');
    const icon = document.getElementById('astreinteFormIcon');
    if (body) body.style.display = 'none';
    if (icon) icon.textContent = '▶';
}

function editAstreinte(id) {
    const astreinte = astreintesData.find(a => a.id === id);
    if (!astreinte) return;

    document.getElementById('astreintesEditId').value = astreinte.id;
    document.getElementById('astreintesType').value = astreinte.type;
    document.getElementById('astreintesDateDebut').value = astreinte.date_debut;
    document.getElementById('astreintesDateFin').value = astreinte.date_fin;
    document.getElementById('astreintesHeureDebut').value = astreinte.heure_debut || '';
    document.getElementById('astreintesHeureFin').value = astreinte.heure_fin || '';
    document.getElementById('astreintesSamu').value = astreinte.samu || '';
    document.getElementById('astreintesTousSamu').checked = astreinte.tous_samu === 1;
    document.getElementById('astreintesObjet').value = astreinte.objet;

    if (currentUser.activeProfile === 'admin') {
        document.getElementById('astreintesExpert').value = astreinte.user_id;
    }

    document.getElementById('astreintesFormTitle').textContent = "Modifier l'astreinte/HNO";
    toggleHnoFields();
    toggleSamuSelect();

    // Déplier le formulaire pour l'édition
    const body = document.getElementById('astreinteFormBody');
    const icon = document.getElementById('astreinteFormIcon');
    if (body) body.style.display = 'block';
    if (icon) icon.textContent = '▼';

    // Scroll vers le formulaire
    document.getElementById('astreintesFormTitle').scrollIntoView({ behavior: 'smooth' });
}

async function saveAstreinte() {
    const editId = document.getElementById('astreintesEditId').value;
    const type = document.getElementById('astreintesType').value;
    const date_debut = document.getElementById('astreintesDateDebut').value;
    const date_fin = document.getElementById('astreintesDateFin').value;
    const heure_debut = document.getElementById('astreintesHeureDebut').value;
    const heure_fin = document.getElementById('astreintesHeureFin').value;
    const samu = document.getElementById('astreintesSamu').value;
    const tous_samu = document.getElementById('astreintesTousSamu').checked;
    const objet = document.getElementById('astreintesObjet').value.trim();

    // Validations
    if (!date_debut || !date_fin) {
        alert('Veuillez remplir les dates');
        return;
    }

    // Validation date d'adhésion astreinte
    if (currentUser && currentUser.activeProfile === 'expert' && currentUser.astreinte_date_activation) {
        if (date_debut < currentUser.astreinte_date_activation) {
            alert(
                `Vous ne pouvez pas saisir d'activité avant votre date d'adhésion au dispositif astreintes (${new Date(currentUser.astreinte_date_activation).toLocaleDateString('fr-FR')}).`
            );
            return;
        }
    }

    // Heures obligatoires pour astreintes et HNO
    if (!heure_debut || !heure_fin) {
        alert('Veuillez remplir les heures de début et de fin');
        return;
    }

    if (!tous_samu && !samu) {
        alert('Veuillez sélectionner un SAMU ou cocher "Tous les SAMU"');
        return;
    }

    if (!objet) {
        alert("Veuillez remplir l'objet");
        return;
    }

    const data = {
        type,
        date_debut,
        date_fin,
        heure_debut, // Toujours envoyer les heures
        heure_fin, // Toujours envoyer les heures
        samu: tous_samu ? null : samu,
        tous_samu,
        objet
    };

    // Ajouter l'expert si admin
    if (currentUser.activeProfile === 'admin') {
        const expertId = document.getElementById('astreintesExpert').value;
        if (!expertId && !editId) {
            alert('Veuillez sélectionner un expert');
            return;
        }
        data.user_id = parseInt(expertId);
    }

    try {
        const url = editId ? `${API_URL}/astreintes/${editId}` : `${API_URL}/astreintes`;
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (response.ok) {
            alert(editId ? 'Astreinte/HNO modifiée avec succès' : 'Astreinte/HNO créée avec succès');
            resetAstreintesForm();
            await loadAstreintes();
            // Recharger les astreintes pour le planning et rafraîchir
            await loadAllAstreintesForPlanning();
            updateGantt();
        } else {
            const result = await response.json();
            alert(result.error || "Erreur lors de l'enregistrement");
        }
    } catch (error) {
        console.error('Erreur sauvegarde astreinte:', error);
        alert("Erreur lors de l'enregistrement");
    }
}

async function deleteAstreinte(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette astreinte/HNO ?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/astreintes/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Astreinte/HNO supprimée avec succès');
            await loadAstreintes();
            // Recharger les astreintes pour le planning et rafraîchir
            await loadAllAstreintesForPlanning();
            updateGantt();
        } else {
            const result = await response.json();
            alert(result.error || 'Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur suppression astreinte:', error);
        alert('Erreur lors de la suppression');
    }
}
