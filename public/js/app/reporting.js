// Application principale : reporting
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== REPORTING ==========

// Initialiser les dates par défaut du reporting (mois courant à mois+3)
function initReportingDates() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Période de début: mois et année en cours
    document.getElementById('reportingStartMonth').value = currentMonth;
    document.getElementById('reportingStartYear').value = currentYear;

    // Période de fin: mois+3
    const endDate = new Date(currentYear, currentMonth + 3, 1);
    document.getElementById('reportingEndMonth').value = endDate.getMonth();
    document.getElementById('reportingEndYear').value = endDate.getFullYear();
}

// Charger les experts dans la liste déroulante du reporting
async function loadReportingExperts() {
    try {
        // Initialiser les dates par défaut
        initReportingDates();
        initHnoReportingDates();

        const response = await fetch(`${API_URL}/resources`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            const select = document.getElementById('reportingExperts');
            const hnoSelect = document.getElementById('hnoReportingExperts');
            const fonctionSelect = document.getElementById('reportingFonctionFilter');
            select.innerHTML = '';
            if (hnoSelect) hnoSelect.innerHTML = '';

            // Filtrer les experts actifs et trier par nom
            const activeExperts = data
                .filter(r => r.actif)
                .sort((a, b) => {
                    const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
                    const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
                    return nameA.localeCompare(nameB);
                });

            // Stocker les experts pour le filtrage par fonction
            window.reportingExpertsData = activeExperts;

            // Remplir le filtre par fonction
            if (fonctionSelect) {
                fonctionSelect.innerHTML = '';
                const fonctions = new Set();
                activeExperts.forEach(expert => {
                    if (expert.fonction) fonctions.add(expert.fonction);
                });
                [...fonctions].sort().forEach(f => {
                    const option = document.createElement('option');
                    option.value = f;
                    option.textContent = f;
                    fonctionSelect.appendChild(option);
                });
            }

            activeExperts.forEach(expert => {
                const option = document.createElement('option');
                option.value = expert.id;
                option.textContent = `${expert.prenom} ${expert.nom}`;
                option.dataset.fonction = expert.fonction || '';
                option.selected = true; // Tous sélectionnés par défaut
                select.appendChild(option);

                // Ajouter aussi à la liste HNO
                if (hnoSelect) {
                    const hnoOption = document.createElement('option');
                    hnoOption.value = expert.id;
                    hnoOption.textContent = `${expert.prenom} ${expert.nom}`;
                    hnoOption.selected = true;
                    hnoSelect.appendChild(hnoOption);
                }
            });
        }
    } catch (error) {
        console.error('Erreur chargement experts reporting:', error);
    }
    // Initialiser le suivi des connexions
    initConnexionsReporting();
}

// ========== SUIVI DES CONNEXIONS (REPORTING) ==========

async function initConnexionsReporting() {
    // Initialiser mois/année courant
    const now = new Date();
    const monthSel = document.getElementById('connexionsMonth');
    const yearSel = document.getElementById('connexionsYear');
    if (monthSel) monthSel.value = String(now.getMonth() + 1).padStart(2, '0');
    if (yearSel) yearSel.value = String(now.getFullYear());

    // Peupler le select utilisateurs depuis /api/users
    const userSel = document.getElementById('connexionsUserSelect');
    if (!userSel) return;
    try {
        const res = await fetch(`${API_URL}/users`, { credentials: 'include' });
        if (!res.ok) return;
        const users = await res.json();
        userSel.innerHTML = '';
        users
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
            .forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.prenom} ${u.nom} (${u.username})`;
                opt.selected = true;
                userSel.appendChild(opt);
            });
    } catch (e) {
        console.error('Erreur init connexions reporting:', e);
    }
}

function toggleConnexionsPeriodMode(mode) {
    const monthBlock = document.getElementById('connexionsMonthBlock');
    const intervalBlock = document.getElementById('connexionsIntervalBlock');
    if (!monthBlock || !intervalBlock) return;
    if (mode === 'month') {
        monthBlock.style.display = 'block';
        intervalBlock.style.display = 'none';
    } else {
        monthBlock.style.display = 'none';
        intervalBlock.style.display = 'block';
    }
}

async function generateConnexionsReport() {
    const mode = document.querySelector('input[name="connexionsPeriodMode"]:checked')?.value || 'month';

    let dateStart, dateEnd;
    if (mode === 'month') {
        const month = document.getElementById('connexionsMonth')?.value;
        const year = document.getElementById('connexionsYear')?.value;
        if (!month || !year) return;
        dateStart = `${year}-${month}-01`;
        // Dernier jour du mois
        const _lastDay = new Date(Number(year), Number(month), 0);
        dateEnd = `${_lastDay.getFullYear()}-${String(_lastDay.getMonth() + 1).padStart(2, '0')}-${String(_lastDay.getDate()).padStart(2, '0')}`;
    } else {
        dateStart = document.getElementById('connexionsStart')?.value;
        dateEnd = document.getElementById('connexionsEnd')?.value;
        if (!dateStart || !dateEnd) {
            alert('Veuillez renseigner les deux dates.');
            return;
        }
    }

    const userSel = document.getElementById('connexionsUserSelect');
    const userIds = userSel
        ? Array.from(userSel.selectedOptions)
              .map(o => o.value)
              .join(',')
        : '';

    const params = new URLSearchParams({ dateStart, dateEnd });
    if (userIds) params.set('userIds', userIds);

    try {
        const res = await fetch(`${API_URL}/reporting/connections?${params}`, { credentials: 'include' });
        if (!res.ok) {
            console.error('Erreur reporting connexions', res.status);
            return;
        }
        const data = await res.json();
        const rows = data.rows || [];

        const totalEl = document.getElementById('connexionsTotalCount');
        const tbody = document.getElementById('connexionsReportBody');
        const result = document.getElementById('connexionsReportResult');

        const total = rows.reduce((s, r) => s + (r.nb_connexions || 0), 0);
        if (totalEl) totalEl.textContent = total;
        if (result) result.style.display = 'block';

        if (!tbody) return;
        tbody.innerHTML = '';

        if (rows.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Aucune connexion sur cette période</td></tr>';
            return;
        }

        const profileLabel = p =>
            p === 'admin' ? 'Administrateur' : p === 'expert' ? 'Expert Métier' : p === 'rh' ? 'RH' : 'Utilisateur';
        const fmtDate = raw => {
            if (!raw) return '—';
            let t = raw;
            if (!t.endsWith('Z') && !t.includes('+')) t += 'Z';
            return new Date(t).toLocaleString('fr-FR', {
                timeZone: 'Europe/Paris',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        // Une seule ligne par utilisateur (le serveur renvoie une ligne par profil utilisé)
        const byUser = new Map();
        rows.forEach(r => {
            const key = (r.username || '').toLowerCase();
            if (!byUser.has(key)) byUser.set(key, { ...r, total: 0, profiles: [], last: null });
            const u = byUser.get(key);
            u.total += r.nb_connexions || 0;
            u.profiles.push({ profile: r.profile, nb: r.nb_connexions || 0 });
            if (!u.last || (r.derniere_connexion && r.derniere_connexion > u.last)) u.last = r.derniere_connexion;
        });

        window._connUsers = [...byUser.values()];
        window._connRender = () => {
            const st = window._connSort || (window._connSort = { k: 'total', dir: -1 });
            const key = {
                nom: u => `${u.prenom || ''} ${u.nom || ''}`.trim(),
                login: u => u.username || '',
                profil: u =>
                    u.profiles
                        .map(p => profileLabel(p.profile))
                        .sort()
                        .join(' '),
                total: u => u.total,
                last: u => u.last || ''
            }[st.k];
            tbody.innerHTML = '';
            [...window._connUsers]
                .sort((a, b) => {
                    const x = key(a),
                        y = key(b);
                    return (
                        (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { numeric: true })) *
                            st.dir || b.total - a.total
                    );
                })
                .forEach(u => {
                    const multi = u.profiles.length > 1;
                    const profilesHtml = u.profiles
                        .sort((a, b) => b.nb - a.nb)
                        .map(
                            p =>
                                `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">${profileBadgeHtml(p.profile, false) || profileLabel(p.profile)}${multi ? `<span style="font-size:11px;color:#777;">×${p.nb}</span>` : ''}</span>`
                        )
                        .join('');
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${u.prenom || ''} ${u.nom || ''}</td>
                        <td>${u.username}</td>
                        <td>${profilesHtml}</td>
                        <td style="text-align:center;font-weight:bold;">${u.total}</td>
                        <td>${fmtDate(u.last)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            document.querySelectorAll('#connexionsReportResult thead th[data-ck]').forEach(th => {
                const on = th.dataset.ck === st.k;
                th.dataset.dir = on ? (st.dir > 0 ? 'asc' : 'desc') : '';
            });
        };
        window._connRender();
    } catch (e) {
        console.error('Erreur génération rapport connexions:', e);
    }
}

// Filtrer les experts du reporting par fonction
function filterReportingExpertsByFonction() {
    const fonctionSelect = document.getElementById('reportingFonctionFilter');
    const expertsSelect = document.getElementById('reportingExperts');

    if (!fonctionSelect || !expertsSelect || !window.reportingExpertsData) return;

    const selectedFonctions = Array.from(fonctionSelect.selectedOptions).map(opt => opt.value);

    // Sauvegarder les experts actuellement sélectionnés
    const previouslySelected = Array.from(expertsSelect.selectedOptions).map(opt => opt.value);

    // Reconstruire la liste des experts
    expertsSelect.innerHTML = '';

    const filteredExperts =
        selectedFonctions.length > 0
            ? window.reportingExpertsData.filter(expert => selectedFonctions.includes(expert.fonction))
            : window.reportingExpertsData;

    filteredExperts.forEach(expert => {
        const option = document.createElement('option');
        option.value = expert.id;
        option.textContent = `${expert.prenom} ${expert.nom}`;
        option.dataset.fonction = expert.fonction || '';
        // Sélectionner si pas de filtre fonction actif ou si était déjà sélectionné
        option.selected = selectedFonctions.length > 0 || previouslySelected.includes(String(expert.id));
        expertsSelect.appendChild(option);
    });
}

// Initialiser les dates pour le reporting HNO
function initHnoReportingDates() {
    const now = new Date();
    const startMonth = document.getElementById('hnoReportingStartMonth');
    const startYear = document.getElementById('hnoReportingStartYear');
    const endMonth = document.getElementById('hnoReportingEndMonth');
    const endYear = document.getElementById('hnoReportingEndYear');

    if (startMonth && startYear && endMonth && endYear) {
        // Par défaut : année en cours, de janvier à décembre
        startMonth.value = '0';
        startYear.value = now.getFullYear().toString();
        endMonth.value = '11';
        endYear.value = now.getFullYear().toString();
    }
}

// Générer le rapport HNO/Astreintes
async function generateHnoAstreintesReport() {
    const startMonth = parseInt(document.getElementById('hnoReportingStartMonth').value);
    const startYear = parseInt(document.getElementById('hnoReportingStartYear').value);
    const endMonth = parseInt(document.getElementById('hnoReportingEndMonth').value);
    const endYear = parseInt(document.getElementById('hnoReportingEndYear').value);
    const showHno = document.getElementById('hnoReportingShowHno').checked;
    const showAstreintes = document.getElementById('hnoReportingShowAstreintes').checked;

    const expertsSelect = document.getElementById('hnoReportingExperts');
    const selectedExperts = Array.from(expertsSelect.selectedOptions).map(opt => parseInt(opt.value));

    if (selectedExperts.length === 0) {
        alert('Veuillez sélectionner au moins un expert');
        return;
    }

    if (!showHno && !showAstreintes) {
        alert('Veuillez sélectionner au moins un type de données (HNO ou Astreintes)');
        return;
    }

    // Vérifier que la période est valide
    const startDate = new Date(startYear, startMonth, 1);
    const endDate = new Date(endYear, endMonth + 1, 0);

    if (startDate > endDate) {
        alert('La date de début doit être antérieure à la date de fin');
        return;
    }

    const resultsDiv = document.getElementById('hnoReportingResults');
    resultsDiv.innerHTML =
        '<p style="text-align: center; padding: 20px;"><span style="font-size: 24px;">⏳</span> Génération en cours...</p>';

    try {
        const response = await fetch(`${API_URL}/reporting/hno-astreintes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                startMonth,
                startYear,
                endMonth,
                endYear,
                expertIds: selectedExperts,
                showHno,
                showAstreintes
            })
        });

        if (response.ok) {
            const data = await response.json();
            renderHnoAstreintesReport(data, startMonth, startYear, endMonth, endYear, showHno, showAstreintes);
        } else {
            resultsDiv.innerHTML =
                '<p style="text-align: center; color: #e53935; padding: 20px;">Erreur lors de la génération du rapport</p>';
        }
    } catch (error) {
        console.error('Erreur génération rapport HNO:', error);
        resultsDiv.innerHTML =
            '<p style="text-align: center; color: #e53935; padding: 20px;">Erreur lors de la génération du rapport</p>';
    }
}

// Afficher le rapport HNO/Astreintes
function renderHnoAstreintesReport(data, startMonth, startYear, endMonth, endYear, showHno, showAstreintes) {
    const resultsDiv = document.getElementById('hnoReportingResults');
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    // Générer la liste des mois
    const months = [];
    let currentDate = new Date(startYear, startMonth, 1);
    const endDate = new Date(endYear, endMonth, 1);

    while (currentDate <= endDate) {
        months.push({
            month: currentDate.getMonth(),
            year: currentDate.getFullYear(),
            label: `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Nombre de colonnes par mois
    const colsPerMonth = (showHno ? 1 : 0) + (showAstreintes ? 1 : 0);

    // Construire le tableau
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';

    // En-tête niveau 1 : Mois
    html += '<thead><tr style="background: #9c27b0; color: white;">';
    html +=
        '<th rowspan="2" style="padding: 8px; border: 1px solid #7b1fa2; min-width: 150px; position: sticky; left: 0; background: #9c27b0; z-index: 1;">Expert</th>';
    months.forEach(m => {
        html += `<th colspan="${colsPerMonth}" style="padding: 8px; border: 1px solid #7b1fa2; text-align: center;">${m.label}</th>`;
    });
    html += `<th colspan="${colsPerMonth}" style="padding: 8px; border: 1px solid #7b1fa2; text-align: center; background: #7b1fa2;">Total</th>`;
    html += '</tr>';

    // En-tête niveau 2 : HNO / Astreintes
    html += '<tr style="background: #ba68c8; color: white;">';
    for (let i = 0; i <= months.length; i++) {
        if (showHno) {
            html +=
                '<th style="padding: 5px; border: 1px solid #9c27b0; text-align: center; font-size: 10px;">⏰ HNO</th>';
        }
        if (showAstreintes) {
            html +=
                '<th style="padding: 5px; border: 1px solid #9c27b0; text-align: center; font-size: 10px;">🔔 ASTR</th>';
        }
    }
    html += '</tr></thead>';

    // Corps du tableau
    html += '<tbody>';

    // Initialiser les totaux par colonne
    const columnTotals = {};
    months.forEach(m => {
        const key = `${m.year}-${m.month}`;
        columnTotals[key] = { hno: 0, astreintes: 0 };
    });
    columnTotals['total'] = { hno: 0, astreintes: 0 };

    // Lignes par expert
    data.experts.forEach((expert, idx) => {
        const bgColor = idx % 2 === 0 ? '#fce4ec' : '#fff';
        html += `<tr style="background: ${bgColor};">`;
        html += `<td style="padding: 8px; border: 1px solid #e1bee7; font-weight: bold; position: sticky; left: 0; background: ${bgColor}; z-index: 1;">${expert.prenom} ${expert.nom}</td>`;

        let expertTotalHno = 0;
        let expertTotalAstreintes = 0;

        months.forEach(m => {
            const key = `${m.year}-${m.month}`;
            const monthData = expert.monthlyData[key] || { hno: 0, astreintes: 0 };

            if (showHno) {
                html += `<td style="padding: 5px; border: 1px solid #e1bee7; text-align: center; ${monthData.hno > 0 ? 'font-weight: bold; color: #1565c0;' : 'color: #999;'}">${monthData.hno || '-'}</td>`;
                expertTotalHno += monthData.hno || 0;
                columnTotals[key].hno += monthData.hno || 0;
            }
            if (showAstreintes) {
                html += `<td style="padding: 5px; border: 1px solid #e1bee7; text-align: center; ${monthData.astreintes > 0 ? 'font-weight: bold; color: #ff9800;' : 'color: #999;'}">${monthData.astreintes || '-'}</td>`;
                expertTotalAstreintes += monthData.astreintes || 0;
                columnTotals[key].astreintes += monthData.astreintes || 0;
            }
        });

        // Total par expert
        if (showHno) {
            html += `<td style="padding: 5px; border: 1px solid #7b1fa2; text-align: center; font-weight: bold; background: #f3e5f5; color: #1565c0;">${expertTotalHno || '-'}</td>`;
            columnTotals['total'].hno += expertTotalHno;
        }
        if (showAstreintes) {
            html += `<td style="padding: 5px; border: 1px solid #7b1fa2; text-align: center; font-weight: bold; background: #f3e5f5; color: #ff9800;">${expertTotalAstreintes || '-'}</td>`;
            columnTotals['total'].astreintes += expertTotalAstreintes;
        }

        html += '</tr>';
    });

    // Ligne Total
    html += '<tr style="background: #9c27b0; color: white; font-weight: bold;">';
    html +=
        '<td style="padding: 8px; border: 1px solid #7b1fa2; position: sticky; left: 0; background: #9c27b0; z-index: 1;">TOTAL</td>';

    months.forEach(m => {
        const key = `${m.year}-${m.month}`;
        if (showHno) {
            html += `<td style="padding: 5px; border: 1px solid #7b1fa2; text-align: center;">${columnTotals[key].hno || '-'}</td>`;
        }
        if (showAstreintes) {
            html += `<td style="padding: 5px; border: 1px solid #7b1fa2; text-align: center;">${columnTotals[key].astreintes || '-'}</td>`;
        }
    });

    // Total général
    if (showHno) {
        html += `<td style="padding: 5px; border: 1px solid #4a148c; text-align: center; background: #7b1fa2;">${columnTotals['total'].hno || '-'}</td>`;
    }
    if (showAstreintes) {
        html += `<td style="padding: 5px; border: 1px solid #4a148c; text-align: center; background: #7b1fa2;">${columnTotals['total'].astreintes || '-'}</td>`;
    }

    html += '</tr></tbody></table>';

    resultsDiv.innerHTML = html;

    // Afficher les boutons d'export
    document.getElementById('hnoReportingExportButtons').style.display = 'flex';
}

// Export CSV pour le reporting HNO/Astreintes
function exportHnoReportingToCSV() {
    const table = document.querySelector('#hnoReportingResults table');
    if (!table) {
        alert("Veuillez d'abord générer un rapport");
        return;
    }

    let csv = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cols = row.querySelectorAll('th, td');
        const rowData = [];
        cols.forEach(col => {
            let text = col.innerText.replace(/"/g, '""');
            rowData.push(`"${text}"`);
        });
        csv.push(rowData.join(';'));
    });

    const csvContent = '\uFEFF' + csv.join('\n'); // BOM pour Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporting_hno_astreintes_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
}

// Impression du reporting HNO/Astreintes
function printHnoReporting() {
    const content = document.getElementById('hnoReportingResults').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
                <html>
                <head>
                    <title>Reporting HNO/Astreintes</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        table { width: 100%; border-collapse: collapse; font-size: 10px; }
                        th, td { border: 1px solid #ddd; padding: 5px; text-align: center; }
                        th { background-color: #9c27b0; color: white; }
                        @media print {
                            @page { size: A4 landscape; margin: 10mm; }
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <h2>Reporting HNO/Astreintes</h2>
                    <p>Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                    ${content}
                </body>
                </html>
            `);
    printWindow.document.close();
    printWindow.print();
}

// Export CSV pour le reporting disponibilités
function exportReportingToCSV() {
    const table = document.querySelector('#reportingResults table');
    if (!table) {
        alert("Veuillez d'abord générer un rapport");
        return;
    }

    let csv = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cols = row.querySelectorAll('th, td');
        const rowData = [];
        cols.forEach(col => {
            let text = col.innerText.replace(/"/g, '""');
            rowData.push(`"${text}"`);
        });
        csv.push(rowData.join(';'));
    });

    const csvContent = '\uFEFF' + csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporting_disponibilites_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
}

// Fenêtres d'impression : sans la feuille de style de l'application, les icônes SVG prendraient toute la place
(function () {
    const nativeOpen = window.open;
    const css =
        '<style>svg.ui-emo,svg.app-ico{width:1.15em;height:1.15em;vertical-align:middle;margin:0 .15em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}</style>';
    window.open = function (url) {
        const w = nativeOpen.apply(window, arguments);
        if (w && !url) {
            try {
                const d = w.document,
                    write = d.write.bind(d);
                d.write = html => write(String(html).replace(/<head>/i, '<head>' + css));
            } catch (e) {
                /* fenêtre inaccessible */
            }
        }
        return w;
    };
})();

// Impression du reporting disponibilités
function printReporting() {
    const content = document.getElementById('reportingResults').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
                <html>
                <head>
                    <title>Reporting Disponibilités/Affectations</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        table { width: 100%; border-collapse: collapse; font-size: 9px; }
                        th, td { border: 1px solid #ddd; padding: 4px; text-align: center; }
                        th { background-color: #4caf50; color: white; }
                        @media print {
                            @page { size: A4 landscape; margin: 10mm; }
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <h2>Reporting Disponibilités/Affectations</h2>
                    <p>Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                    ${content}
                </body>
                </html>
            `);
    printWindow.document.close();
    printWindow.print();
}

// Générer le rapport
async function generateReporting() {
    const startMonth = parseInt(document.getElementById('reportingStartMonth').value);
    const startYear = parseInt(document.getElementById('reportingStartYear').value);
    const endMonth = parseInt(document.getElementById('reportingEndMonth').value);
    const endYear = parseInt(document.getElementById('reportingEndYear').value);
    const includeLeave = document.getElementById('reportingIncludeLeave').checked;

    const expertsSelect = document.getElementById('reportingExperts');
    const selectedExperts = Array.from(expertsSelect.selectedOptions).map(opt => parseInt(opt.value));

    if (selectedExperts.length === 0) {
        alert('Veuillez sélectionner au moins un expert');
        return;
    }

    // Vérifier que la période est valide
    const startDate = new Date(startYear, startMonth, 1);
    const endDate = new Date(endYear, endMonth + 1, 0); // Dernier jour du mois de fin

    if (startDate > endDate) {
        alert('La date de début doit être antérieure à la date de fin');
        return;
    }

    const resultsDiv = document.getElementById('reportingResults');
    resultsDiv.innerHTML =
        '<p style="text-align: center; padding: 20px;"><span style="font-size: 24px;">⏳</span> Génération en cours...</p>';

    try {
        const response = await fetch(`${API_URL}/reporting/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                startMonth,
                startYear,
                endMonth,
                endYear,
                expertIds: selectedExperts,
                includeLeave
            })
        });

        if (response.ok) {
            const data = await response.json();
            displayReportingResults(data);
        } else {
            const err = await response.json();
            resultsDiv.innerHTML = `<p style="color: #e74c3c; text-align: center;">❌ Erreur: ${err.error || 'Erreur inconnue'}</p>`;
        }
    } catch (error) {
        console.error('Erreur génération reporting:', error);
        resultsDiv.innerHTML = `<p style="color: #e74c3c; text-align: center;">❌ Erreur: ${error.message}</p>`;
    }
}

// Afficher les résultats du reporting
function displayReportingResults(data) {
    const resultsDiv = document.getElementById('reportingResults');

    if (!data.experts || data.experts.length === 0) {
        resultsDiv.innerHTML = '<p style="text-align: center; color: #999;">Aucune donnée à afficher</p>';
        return;
    }

    // Stocker les données pour le tri
    window.reportingData = data;
    window.reportingSortColumn = null;
    window.reportingSortAsc = true;

    renderReportingTable(data);
}

// Fonction de tri du tableau reporting
function sortReportingTable(column) {
    if (!window.reportingData) return;

    // Toggle le sens du tri si même colonne
    if (window.reportingSortColumn === column) {
        window.reportingSortAsc = !window.reportingSortAsc;
    } else {
        window.reportingSortColumn = column;
        window.reportingSortAsc = true;
    }

    // Trier les experts
    window.reportingData.experts.sort((a, b) => {
        let valA, valB;

        if (column === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            return window.reportingSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        return 0; // Pas de tri pour les autres colonnes
    });

    renderReportingTable(window.reportingData);
}

// Rendu du tableau reporting
function renderReportingTable(data) {
    const resultsDiv = document.getElementById('reportingResults');
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
    const monthNamesShort = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    let html = '<table id="reportingTable" style="width: 100%; border-collapse: collapse; font-size: 12px;">';

    // En-tête avec les mois
    html += '<thead><tr style="background: #34495e; color: white;">';

    // Colonne Expert (triable)
    const expertSortIcon = window.reportingSortColumn === 'name' ? (window.reportingSortAsc ? ' ▲' : ' ▼') : ' ▲▼';
    html += `<th class="sortable" onclick="sortReportingTable('name')" style="padding: 10px; border: 1px solid #bdc3c7; text-align: left; min-width: 150px;">Expert${expertSortIcon}</th>`;

    // Colonne Taux MAD (non triable)
    html +=
        '<th style="padding: 10px; border: 1px solid #bdc3c7; text-align: center; min-width: 100px; background: #5d6d7e;">Taux MAD<br><span style="font-size: 10px; font-weight: normal;">Jours/mois</span></th>';

    // Colonnes mois (non triables)
    data.months.forEach(month => {
        html += `<th style="padding: 10px; border: 1px solid #bdc3c7; text-align: center; min-width: 100px;">`;
        html += `${monthNames[month.month]} ${month.year}`;
        html += `<br><span style="font-size: 9px; font-weight: normal;">Dispo | Affecté</span>`;
        html += `</th>`;
    });

    // Colonne Total (non triable)
    html +=
        '<th style="padding: 10px; border: 1px solid #bdc3c7; text-align: center; min-width: 100px; background: #2c3e50;">TOTAL<br><span style="font-size: 9px; font-weight: normal;">Dispo | Affecté</span></th>';
    html += '</tr></thead>';

    // Corps du tableau
    html += '<tbody>';

    // Totaux globaux par mois
    const globalTotalsByMonth = {};
    let globalTotalAvailable = 0;
    let globalTotalAssigned = 0;

    data.months.forEach(month => {
        const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
        globalTotalsByMonth[monthKey] = { available: 0, assigned: 0 };
    });

    data.experts.forEach(expert => {
        html += '<tr>';
        html += `<td style="padding: 10px; border: 1px solid #bdc3c7; font-weight: bold; background: #f8f9fa;">${expert.name}</td>`;

        // Colonne Taux MAD
        const avgWorkingDays = expert.avgWorkingDaysPerMonth || 22;
        const madDays = (expert.tauxMad / 100) * avgWorkingDays;
        html += `<td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; background: #eaecee;">`;
        html += `<div style="font-weight: bold; color: #2c3e50;">${expert.tauxMad}%</div>`;
        html += `<div style="font-size: 10px; color: #666;">~${madDays.toFixed(1)} j/mois</div>`;
        html += `</td>`;

        let totalAvailable = 0;
        let totalAssigned = 0;

        data.months.forEach(month => {
            const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
            const stats = expert.monthlyStats[monthKey] || { available: 0, assigned: 0, leave: 0, rate: 0 };

            totalAvailable += stats.available;
            totalAssigned += stats.assigned;

            // Accumuler pour les totaux globaux
            globalTotalsByMonth[monthKey].available += stats.available;
            globalTotalsByMonth[monthKey].assigned += stats.assigned;

            // Couleur selon le taux
            let bgColor = '#ffcdd2'; // Rouge < 50%
            let borderColor = '#ef9a9a';
            if (stats.rate >= 75) {
                bgColor = '#c8e6c9'; // Vert >= 75%
                borderColor = '#a5d6a7';
            } else if (stats.rate >= 50) {
                bgColor = '#ffe0b2'; // Orange 50-74%
                borderColor = '#ffcc80';
            }

            // Si pas de données disponibles, gris
            if (stats.available === 0) {
                bgColor = '#f5f5f5';
                borderColor = '#e0e0e0';
            }

            html += `<td style="padding: 8px; border: 1px solid ${borderColor}; text-align: center; background: ${bgColor};">`;
            html += `<div><span style="color: #1565c0;">${stats.available}</span> | <span style="color: #2e7d32; font-weight: bold;">${stats.assigned}</span></div>`;
            html += `<div style="font-size: 11px; font-weight: bold;">${stats.rate.toFixed(0)}%</div>`;
            if (stats.leave > 0) {
                html += `<div style="font-size: 10px; color: #9c27b0;">🏖️ -${stats.leave}j</div>`;
            }
            html += '</td>';
        });

        // Accumuler pour les totaux globaux
        globalTotalAvailable += totalAvailable;
        globalTotalAssigned += totalAssigned;

        // Colonne Total expert
        const totalRate = totalAvailable > 0 ? (totalAssigned / totalAvailable) * 100 : 0;
        let totalBgColor = '#ffcdd2';
        let totalBorderColor = '#ef9a9a';
        if (totalRate >= 75) {
            totalBgColor = '#c8e6c9';
            totalBorderColor = '#a5d6a7';
        } else if (totalRate >= 50) {
            totalBgColor = '#ffe0b2';
            totalBorderColor = '#ffcc80';
        }

        html += `<td style="padding: 8px; border: 1px solid ${totalBorderColor}; text-align: center; background: ${totalBgColor}; font-weight: bold;">`;
        html += `<div><span style="color: #1565c0;">${totalAvailable}</span> | <span style="color: #2e7d32;">${totalAssigned}</span></div>`;
        html += `<div style="font-size: 11px;">${totalRate.toFixed(0)}%</div>`;
        html += '</td>';

        html += '</tr>';
    });

    // Ligne de total global
    html += '<tr style="background: #2c3e50; color: white; font-weight: bold;">';
    html += '<td style="padding: 10px; border: 1px solid #bdc3c7;">TOTAL</td>';
    html += '<td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center;">-</td>';

    data.months.forEach(month => {
        const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
        const monthTotals = globalTotalsByMonth[monthKey];
        html += `<td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center;">`;
        html += `<span style="color: #85c1e9;">${monthTotals.available}</span> | <span style="color: #82e0aa;">${monthTotals.assigned}</span>`;
        html += '</td>';
    });

    // Total global
    html += `<td style="padding: 8px; border: 1px solid #bdc3c7; text-align: center; background: #1a252f;">`;
    html += `<span style="color: #85c1e9;">${globalTotalAvailable}</span> | <span style="color: #82e0aa;">${globalTotalAssigned}</span>`;
    html += '</td>';
    html += '</tr>';

    html += '</tbody></table>';

    // Légende détaillée
    html += '<div style="margin-top: 15px; font-size: 11px; color: #666;">';
    html +=
        '<strong>Format des cellules :</strong> <span style="color: #1565c0;">Disponible</span> | <span style="color: #2e7d32; font-weight: bold;">Affecté</span><br>';
    html += '• <strong>Disponible</strong> = jours où disponibilité = "Disponible"<br>';
    html += '• <strong>Affecté</strong> = jours où activité ≠ "Indisponible" et ≠ "En attente"<br>';
    html += '• <strong>Taux</strong> = Affecté / Disponible × 100';
    html += '</div>';

    resultsDiv.innerHTML = html;

    // Afficher les boutons d'export
    document.getElementById('reportingExportButtons').style.display = 'flex';
}

// ========== FIN REPORTING ==========

// Diagnostic des données de reporting
async function diagnoseReportingData() {
    const startMonth = parseInt(document.getElementById('reportingStartMonth').value);
    const startYear = parseInt(document.getElementById('reportingStartYear').value);

    const expertsSelect = document.getElementById('reportingExperts');
    const selectedExperts = Array.from(expertsSelect.selectedOptions);

    if (selectedExperts.length === 0) {
        alert('Veuillez sélectionner au moins un expert');
        return;
    }

    // Prendre le premier expert sélectionné
    const expertId = selectedExperts[0].value;
    const expertName = selectedExperts[0].textContent;

    try {
        const response = await fetch(`${API_URL}/reporting/diagnose/${expertId}/${startYear}/${startMonth + 1}`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();

            let html = `<h3>🔍 Diagnostic pour ${expertName}</h3>`;
            html += `<p><strong>Mois :</strong> ${startMonth + 1}/${startYear}</p>`;
            html += `<p><strong>Expert ID :</strong> ${data.expertId}</p>`;
            html += `<p><strong>Patterns SQL :</strong> ${data.patterns.join(' ou ')}</p>`;
            html += `<p><strong>Total lignes en base :</strong> ${data.totalRows}</p>`;

            html += '<h4>📊 Résumé calculé</h4>';
            html += '<table style="border-collapse: collapse; font-size: 12px;">';
            html += `<tr><td style="padding: 5px; border: 1px solid #ddd;">Demi-journées disponibles (available=2)</td><td style="padding: 5px; border: 1px solid #ddd; font-weight: bold;">${data.summary.availableSlots} → ${data.summary.availableDays} jours</td></tr>`;
            html += `<tr><td style="padding: 5px; border: 1px solid #ddd;">Demi-journées affectées (activity=3,4,5,6,7,8)</td><td style="padding: 5px; border: 1px solid #ddd; font-weight: bold;">${data.summary.assignedSlots} → ${data.summary.assignedDays} jours</td></tr>`;
            html += `<tr><td style="padding: 5px; border: 1px solid #ddd;">Demi-journées congés (available=3)</td><td style="padding: 5px; border: 1px solid #ddd; font-weight: bold;">${data.summary.leaveSlots} → ${data.summary.leaveDays} jours</td></tr>`;
            html += '</table>';

            html += '<h4>📋 Données brutes (100 premières lignes)</h4>';
            html +=
                '<div style="max-height: 300px; overflow-y: auto; background: #f5f5f5; padding: 10px; font-family: monospace; font-size: 10px;">';

            // Grouper par date_key pour plus de lisibilité
            const grouped = {};
            data.rawData.forEach(row => {
                if (!grouped[row.date_key]) grouped[row.date_key] = {};
                grouped[row.date_key][row.type] = row.value;
            });

            Object.keys(grouped)
                .sort()
                .forEach(dateKey => {
                    const d = grouped[dateKey];
                    const availClass =
                        d.available === '2'
                            ? 'color: green; font-weight: bold;'
                            : d.available === '3'
                              ? 'color: purple;'
                              : '';
                    const actClass = ['3', '4', '5', '6', '7', '8'].includes(d.activity)
                        ? 'color: blue; font-weight: bold;'
                        : '';
                    html += `<div><strong>${dateKey}</strong>: `;
                    html += `avail=<span style="${availClass}">${d.available || '-'}</span>, `;
                    html += `act=<span style="${actClass}">${d.activity || '-'}</span>, `;
                    html += `loc=${d.localisation || '-'}`;
                    html += '</div>';
                });

            html += '</div>';

            // Afficher dans la modal
            const modal = document.getElementById('automationLogsModal');
            const content = document.getElementById('automationLogsContent');
            modal.querySelector('h2').textContent = '🔍 Diagnostic Reporting';
            content.innerHTML = html;
            modal.style.display = 'block';
        } else {
            const err = await response.json();
            alert('Erreur: ' + (err.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur diagnostic:', error);
        alert('Erreur: ' + error.message);
    }
}
