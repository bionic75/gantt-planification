// Application principale : locations
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== LOCALISATIONS ==========

let allLocations = [];
let locConflictData = [];
let locCsvParsedRows = {}; // CSV parsé côté client, clé = libelle_long

function toggleLocalisationForm() {
    const body = document.getElementById('localisationFormBody');
    const icon = document.getElementById('localisationFormIcon');
    if (!body || !icon) return;
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = '▼';
    } else {
        body.style.display = 'none';
        icon.textContent = '▶';
    }
}

function resetLocalisationForm() {
    document.getElementById('localisationEditId').value = '';
    document.getElementById('locLong').value = '';
    document.getElementById('locCourt').value = '';
    document.getElementById('locAdresse').value = '';
    document.getElementById('locLat').value = '';
    document.getElementById('locLng').value = '';
    document.getElementById('localisationFormTitle').textContent = 'Ajouter une localisation';
    const body = document.getElementById('localisationFormBody');
    const icon = document.getElementById('localisationFormIcon');
    if (body) body.style.display = 'none';
    if (icon) icon.textContent = '▶';
}

async function loadLocations() {
    try {
        const res = await fetch(`${API_URL}/locations`, { credentials: 'include' });
        if (res.status === 401) {
            // Déjà déconnecté (déconnexion pendant l'ouverture de l'application) : rien de plus à faire
            if (!currentUser) return;
            console.warn('Session expirée lors du chargement des localisations');
            await performLogout();
            return;
        }
        if (!res.ok) return;
        const data = await res.json();
        allLocations = data.locations || [];
        renderLocationsTable();
        populateLocationSelects();
    } catch (e) {
        console.error('Erreur chargement localisations:', e);
    }
}

function populateLocationSelects() {
    const selects = [document.getElementById('customEventLocationId'), document.getElementById('myEventLocationId')];
    selects.forEach(sel => {
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— Aucune localisation —</option>';
        allLocations.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = `${loc.libelle_court} – ${loc.libelle_long}`;
            sel.appendChild(opt);
        });
        if (current) sel.value = current;
    });

    // Peupler les selects SAMU depuis allLocations
    const samuOptions =
        '<option value="">-- Choisir un SAMU --</option>' +
        [...allLocations]
            .sort((a, b) => (a.libelle_court || '').localeCompare(b.libelle_court || ''))
            .map(l => `<option value="${l.libelle_court}">${l.libelle_court}</option>`)
            .join('');
    ['samu', 'editSamu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = samuOptions;
    });

    // Listener SAMU → ES auto-remplissage (ajout)
    const samuSel = document.getElementById('samu');
    if (samuSel && !samuSel._listenerSet) {
        samuSel._listenerSet = true;
        samuSel.addEventListener('change', function () {
            const selected = allLocations.find(l => l.libelle_court === this.value);
            const adresse = selected?.adresse || '';
            const es = adresse.includes(',') ? adresse.split(',')[0].trim() : adresse.trim();
            document.getElementById('esRattachement').value = es;
        });
    }
    // Listener SAMU → ES auto-remplissage (modification)
    const editSamuSel = document.getElementById('editSamu');
    if (editSamuSel && !editSamuSel._listenerSet) {
        editSamuSel._listenerSet = true;
        editSamuSel.addEventListener('change', function () {
            const selected = allLocations.find(l => l.libelle_court === this.value);
            const adresse = selected?.adresse || '';
            const es = adresse.includes(',') ? adresse.split(',')[0].trim() : adresse.trim();
            document.getElementById('editEsRattachement').value = es;
        });
    }
}

let locSortCol = 'libelle_long';
let locSortDir = 'asc';

function sortLocTable(col) {
    if (locSortCol === col) {
        locSortDir = locSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        locSortCol = col;
        locSortDir = 'asc';
    }
    renderLocationsTable();
}

function renderLocationsTable() {
    const container = document.getElementById('localisationsTableContainer');
    if (!container) return;
    if (allLocations.length === 0) {
        container.innerHTML =
            '<p style="color:#999;font-size:12px;font-style:italic;">Aucune localisation enregistrée.</p>';
        return;
    }

    // Trier
    const sorted = [...allLocations].sort((a, b) => {
        let va = a[locSortCol],
            vb = b[locSortCol];
        if (va === null || va === undefined) va = '';
        if (vb === null || vb === undefined) vb = '';
        const cmp =
            typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
        return locSortDir === 'asc' ? cmp : -cmp;
    });

    const arrow = col => {
        if (locSortCol !== col) return '<span style="opacity:0.4;margin-left:4px;">▲▼</span>';
        return locSortDir === 'asc'
            ? '<span style="margin-left:4px;">▲</span>'
            : '<span style="margin-left:4px;">▼</span>';
    };
    const thStyle = 'padding:8px;text-align:left;cursor:pointer;user-select:none;white-space:nowrap;';
    const thStyleC = 'padding:8px;text-align:center;cursor:pointer;user-select:none;white-space:nowrap;';

    const count = allLocations.length;
    let html = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
                    <button onclick="deleteSelectedLocalisations()" id="locDeleteSelectedBtn"
                        style="background:#e53935;color:white;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;display:none;">
                        🗑️ Supprimer la sélection (<span id="locSelectedCount">0</span>)
                    </button>
                    <button onclick="deleteAllLocalisations()"
                        style="background:#b71c1c;color:white;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">
                        🗑️ Tout supprimer (${count})
                    </button>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:#3f51b5;color:white;">
                        <th style="padding:8px;width:30px;text-align:center;">
                            <input type="checkbox" id="locSelectAll" onchange="toggleSelectAllLoc(this)"
                                style="width:14px;height:14px;cursor:pointer;" title="Tout sélectionner">
                        </th>
                        <th style="${thStyle}" onclick="sortLocTable('libelle_long')">Libellé long${arrow('libelle_long')}</th>
                        <th style="${thStyle}" onclick="sortLocTable('libelle_court')">Libellé court${arrow('libelle_court')}</th>
                        <th style="${thStyle}" onclick="sortLocTable('adresse')">Adresse${arrow('adresse')}</th>
                        <th style="${thStyleC}" onclick="sortLocTable('latitude')">Lat.${arrow('latitude')}</th>
                        <th style="${thStyleC}" onclick="sortLocTable('longitude')">Lng.${arrow('longitude')}</th>
                        <th style="padding:8px;text-align:center;" class="no-sort">Actions</th>
                    </tr>
                </thead><tbody>`;

    sorted.forEach(loc => {
        html += `<tr style="border-bottom:1px solid #e8eaf6;" id="locRow_${loc.id}">
                    <td style="padding:7px;text-align:center;">
                        <input type="checkbox" class="locCheckbox" data-id="${loc.id}" onchange="updateLocSelectionCount()"
                            style="width:14px;height:14px;cursor:pointer;">
                    </td>
                    <td style="padding:7px;">${loc.libelle_long}</td>
                    <td style="padding:7px;">${loc.libelle_court}</td>
                    <td style="padding:7px;">${loc.adresse || '-'}</td>
                    <td style="padding:7px;text-align:center;">${loc.latitude != null ? loc.latitude : '-'}</td>
                    <td style="padding:7px;text-align:center;">${loc.longitude != null ? loc.longitude : '-'}</td>
                    <td style="padding:7px;text-align:center;">
                        <button onclick="editLocalisation(${loc.id})" style="background:#1e88e5;color:white;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;margin-right:4px;">✏️</button>
                        <button onclick="deleteLocalisation(${loc.id})" style="background:#e53935;color:white;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;">🗑️</button>
                    </td>
                </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    makeColResizable(container.querySelector('table'));
}

function toggleSelectAllLoc(checkbox) {
    document.querySelectorAll('.locCheckbox').forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateLocSelectionCount();
}

function updateLocSelectionCount() {
    const checked = document.querySelectorAll('.locCheckbox:checked');
    const btn = document.getElementById('locDeleteSelectedBtn');
    const countEl = document.getElementById('locSelectedCount');
    const selectAll = document.getElementById('locSelectAll');
    const total = document.querySelectorAll('.locCheckbox').length;
    if (countEl) countEl.textContent = checked.length;
    if (btn) btn.style.display = checked.length > 0 ? 'inline-block' : 'none';
    if (selectAll) selectAll.indeterminate = checked.length > 0 && checked.length < total;
    if (selectAll && checked.length === total && total > 0) selectAll.checked = true;
}

async function saveLocalisation() {
    const id = document.getElementById('localisationEditId').value;
    const libelle_long = document.getElementById('locLong').value.trim().toUpperCase();
    const libelle_court = document.getElementById('locCourt').value.trim().toUpperCase();
    const adresse = document.getElementById('locAdresse').value.trim().toUpperCase();
    const latitude = document.getElementById('locLat').value;
    const longitude = document.getElementById('locLng').value;

    if (!libelle_long || !libelle_court) {
        alert('Le libellé long et le libellé court sont obligatoires.');
        return;
    }

    const body = {
        libelle_long,
        libelle_court,
        adresse: adresse || null,
        latitude: latitude || null,
        longitude: longitude || null
    };
    const url = id ? `${API_URL}/locations/${id}` : `${API_URL}/locations`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) {
            alert('Erreur : ' + (data.error || res.status));
            return;
        }
        resetLocalisationForm();
        await loadLocations();
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

function editLocalisation(id) {
    const loc = allLocations.find(l => l.id === id);
    if (!loc) return;
    document.getElementById('localisationEditId').value = loc.id;
    document.getElementById('locLong').value = loc.libelle_long;
    document.getElementById('locCourt').value = loc.libelle_court;
    document.getElementById('locAdresse').value = loc.adresse || '';
    document.getElementById('locLat').value = loc.latitude != null ? loc.latitude : '';
    document.getElementById('locLng').value = loc.longitude != null ? loc.longitude : '';
    document.getElementById('localisationFormTitle').textContent = 'Modifier la localisation';
    const body = document.getElementById('localisationFormBody');
    const icon = document.getElementById('localisationFormIcon');
    if (body) body.style.display = 'block';
    if (icon) icon.textContent = '▼';
    document.getElementById('locLong').scrollIntoView({ behavior: 'smooth' });
}

async function deleteLocalisation(id) {
    await checkAndDeleteLocalisations([id]);
}

async function deleteSelectedLocalisations() {
    const checked = [...document.querySelectorAll('.locCheckbox:checked')];
    if (checked.length === 0) return;
    const ids = checked.map(cb => parseInt(cb.dataset.id));
    await checkAndDeleteLocalisations(ids);
}

async function deleteAllLocalisations() {
    if (allLocations.length === 0) return;
    const ids = allLocations.map(l => l.id);
    await checkAndDeleteLocalisations(ids);
}

// Vérifie l'usage de chaque ID, affiche le warning si besoin, puis supprime
async function checkAndDeleteLocalisations(ids) {
    // Vérifier l'usage de chaque localisation
    const usageResults = [];
    for (const id of ids) {
        try {
            const res = await fetch(`${API_URL}/locations/${id}/usage`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const loc = allLocations.find(l => l.id === id);
                usageResults.push({ id, name: loc?.libelle_long || `#${id}`, count: data.count, events: data.events });
            }
        } catch (e) {
            console.error('Erreur vérification usage localisation', id, e);
        }
    }

    const inUse = usageResults.filter(r => r.count > 0);
    const notInUse = usageResults.filter(r => r.count === 0);

    // Construire le message de confirmation
    let confirmMsg = '';
    const totalLabel = ids.length === 1 ? `1 localisation` : `${ids.length} localisations`;

    if (inUse.length === 0) {
        // Aucune localisation utilisée → confirmation simple
        const names = usageResults.map(r => `• ${r.name}`).join('\n');
        confirmMsg = `Supprimer ${totalLabel} ?\n\n${names}`;
        if (!confirm(confirmMsg)) return;
    } else {
        // Au moins une localisation est utilisée → warning détaillé
        let warningText = `⚠️ ATTENTION — ${inUse.length} localisation(s) sur ${ids.length} sont utilisées par des événements :\n\n`;
        inUse.forEach(r => {
            warningText += `• ${r.name} → ${r.count} événement(s)\n`;
            r.events.slice(0, 3).forEach(ev => {
                warningText += `   - "${ev.label}" (${ev.start_date}${ev.end_date !== ev.start_date ? ' → ' + ev.end_date : ''})\n`;
            });
            if (r.events.length > 3) warningText += `   ... et ${r.events.length - 3} autre(s)\n`;
        });
        if (notInUse.length > 0) {
            warningText += `\n${notInUse.length} localisation(s) non utilisée(s) seront aussi supprimées.\n`;
        }
        warningText += `\nSi vous confirmez, les événements concernés afficheront "NON DÉFINI" à la place de la localisation.\n\nConfirmer la suppression ?`;
        if (!confirm(warningText)) return;
    }

    await bulkDeleteLocalisations(ids);
}

async function bulkDeleteLocalisations(ids) {
    let deleted = 0;
    for (const id of ids) {
        try {
            const res = await fetch(`${API_URL}/locations/${id}`, { method: 'DELETE', credentials: 'include' });
            if (res.ok) deleted++;
        } catch (e) {
            console.error('Erreur suppression localisation', id, e);
        }
    }
    await loadLocations();
    // Recharger les dates spéciales pour mettre à jour l'affichage "NON DÉFINI"
    await loadSpecialDates();
    const status = document.getElementById('locImportStatus');
    if (status) status.textContent = `✅ ${deleted} localisation(s) supprimée(s).`;
}

async function importLocalisationsCSV() {
    const file = document.getElementById('locCsvFile').files[0];
    const status = document.getElementById('locImportStatus');
    if (!file) {
        status.textContent = '⚠️ Aucun fichier sélectionné.';
        return;
    }
    status.textContent = '⏳ Lecture du fichier…';

    let text = await file.text();
    text = text.replace(/^\uFEFF/, ''); // Supprimer BOM UTF-8
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
        status.textContent = '⚠️ Fichier vide ou sans données.';
        return;
    }

    // Détecter le séparateur : TAB en priorité, puis ; puis ,
    const firstLine = lines[0];
    const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

    const header = firstLine.split(sep).map(h => h.trim().toLowerCase());

    const idxLL = header.findIndex(
        h =>
            h === 'libelle_long' ||
            h === 'libellé_long' ||
            h === 'll' ||
            h.startsWith('libelle_l') ||
            h.startsWith('libellé_l')
    );
    const idxLC = header.findIndex(
        h =>
            h === 'libelle_court' ||
            h === 'libellé_court' ||
            h === 'lc' ||
            h.startsWith('libelle_c') ||
            h.startsWith('libellé_c')
    );
    const idxAd = header.findIndex(h => h === 'adresse' || h.startsWith('adress'));
    const idxLat = header.findIndex(h => h === 'latitude' || h === 'lat');
    const idxLng = header.findIndex(h => h === 'longitude' || h === 'long' || h === 'lng' || h === 'lon');

    if (idxLL < 0 || idxLC < 0) {
        status.innerHTML = `⚠️ Colonnes libelle_long et libelle_court introuvables.<br>
                    <small>Séparateur : <code>${sep === '\t' ? 'TAB' : sep}</code> | En-têtes : <code>${header.join(' | ')}</code></small>`;
        return;
    }
    if (idxLat < 0 || idxLng < 0) {
        status.innerHTML = `⚠️ Colonnes latitude/longitude introuvables.<br>
                    <small>Séparateur : <code>${sep === '\t' ? 'TAB' : sep}</code> | En-têtes : <code>${header.join(' | ')}</code></small>`;
        return;
    }

    const parseDec = v => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim().replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    };

    // ── Étape 1 : parser le CSV entièrement côté client ──
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep);
        const ll = (cols[idxLL] || '').trim().toUpperCase();
        const lc = (cols[idxLC] || '').trim().toUpperCase();
        if (!ll || !lc) continue;
        rows.push({
            libelle_long: ll,
            libelle_court: lc,
            adresse: idxAd >= 0 ? (cols[idxAd] || '').trim().toUpperCase() : '',
            latitude: parseDec(cols[idxLat]),
            longitude: parseDec(cols[idxLng])
        });
    }

    if (rows.length === 0) {
        status.textContent = '⚠️ Aucune ligne valide trouvée.';
        return;
    }

    // ── Étape 2 : détecter les conflits CLIENT-SIDE contre allLocations ──
    // Les données affichées dans la modale proviennent directement du CSV parsé,
    // sans aucun aller-retour serveur susceptible de les corrompre.
    locCsvParsedRows = {};
    rows.forEach(r => {
        locCsvParsedRows[r.libelle_long] = r;
    });

    const toInsert = [];
    const conflicts = [];

    rows.forEach(csvRow => {
        const existing = allLocations.find(l => l.libelle_long === csvRow.libelle_long);
        if (existing) {
            const identical =
                existing.libelle_court === csvRow.libelle_court &&
                (existing.adresse || '') === (csvRow.adresse || '') &&
                existing.latitude == csvRow.latitude &&
                existing.longitude == csvRow.longitude;
            // incoming = copie stricte des données CSV (source de vérité)
            conflicts.push({
                incoming: { ...csvRow },
                existing: { ...existing },
                identical
            });
        } else {
            toInsert.push(csvRow);
        }
    });

    // Aperçu des 3 premières lignes parsées
    const preview = rows
        .slice(0, 3)
        .map(
            r =>
                `<li><strong>${r.libelle_court}</strong> — lat: <code>${r.latitude ?? '⚠️ null'}</code>, lng: <code>${r.longitude ?? '⚠️ null'}</code></li>`
        )
        .join('');
    status.innerHTML = `⏳ Import de ${rows.length} ligne(s)… sep=<code>${sep === '\t' ? 'TAB' : sep}</code><br>
                <small>Aperçu :<ul style="margin:3px 0 0 15px;">${preview}</ul></small>`;

    // ── Étape 3 : insérer les nouvelles lignes (sans conflit) via le serveur ──
    let inserted = 0;
    if (toInsert.length > 0) {
        try {
            const res = await fetch(`${API_URL}/locations/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rows: toInsert })
            });
            const data = await res.json();
            if (res.ok) {
                inserted = data.inserted || 0;
                await loadLocations(); // Rafraîchir allLocations
            }
        } catch (e) {
            status.textContent = '❌ Erreur réseau : ' + e.message;
            return;
        }
    }

    // ── Étape 4 : afficher la modale de conflit si nécessaire ──
    if (conflicts.length > 0) {
        const diffCount = conflicts.filter(c => !c.identical).length;
        const sameCount = conflicts.length - diffCount;
        const parts = [];
        if (inserted > 0) parts.push(`${inserted} ajouté(s)`);
        if (diffCount > 0) parts.push(`${diffCount} avec données différentes`);
        if (sameCount > 0) parts.push(`${sameCount} déjà identiques en base`);
        status.textContent = `⚠️ ${parts.join(' | ')} — choisissez l'action pour chaque entrée existante.`;
        openLocConflictModal(conflicts);
    } else {
        status.textContent = `✅ ${inserted} localisation(s) importée(s) avec succès.`;
    }
}

function openLocConflictModal(conflicts) {
    locConflictData = conflicts.map(c => ({ ...c, action: 'keep' }));
    renderLocConflictList();
    document.getElementById('locConflictModal').style.display = 'block';
}

function closeLocConflictModal() {
    document.getElementById('locConflictModal').style.display = 'none';
    locConflictData = [];
}

function renderLocConflictList() {
    const container = document.getElementById('locConflictList');
    if (!container) return;
    let html = '';

    // Résumé rapide
    const identicalCount = locConflictData.filter(c => c.identical).length;
    const diffCount = locConflictData.length - identicalCount;
    if (identicalCount > 0) {
        html += `<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;padding:10px;margin-bottom:15px;font-size:12px;color:#1565c0;">
                    ℹ️ <strong>${identicalCount}</strong> entrée(s) avec des données identiques en base (marquées ✅).
                    ${diffCount > 0 ? `<strong>${diffCount}</strong> entrée(s) avec des données différentes (marquées ⚠️).` : ''}
                </div>`;
    }

    locConflictData.forEach((c, i) => {
        // Recalculer identical depuis la source CSV brute (locCsvParsedRows)
        const raw = locCsvParsedRows[c.incoming.libelle_long] || c.incoming;
        const isIdentical =
            c.existing.libelle_court === raw.libelle_court &&
            (c.existing.adresse || '') === (raw.adresse || '') &&
            c.existing.latitude == raw.latitude &&
            c.existing.longitude == raw.longitude;

        // Comparer chaque champ pour surligner les différences
        const diffLat = !isIdentical && c.existing.latitude != c.incoming.latitude;
        const diffLng = !isIdentical && c.existing.longitude != c.incoming.longitude;
        const diffAd = !isIdentical && (c.existing.adresse || '') !== (c.incoming.adresse || '');
        const diffLc = !isIdentical && c.existing.libelle_court !== c.incoming.libelle_court;

        const badge = isIdentical
            ? `<span style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:2px 8px;border-radius:10px;font-size:11px;">✅ Données identiques</span>`
            : `<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;padding:2px 8px;border-radius:10px;font-size:11px;">⚠️ Données différentes</span>`;

        const highlight = (val, isDiff) => (isDiff ? `<strong style="color:#e65100;">${val}</strong>` : val);

        html += `<div style="border:1px solid ${isIdentical ? '#c8e6c9' : '#ffcc80'};border-radius:8px;padding:15px;margin-bottom:15px;background:#fafafa;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <span style="font-weight:bold;color:#2c3e50;">${c.incoming.libelle_long}</span>
                        ${badge}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;font-size:12px;">
                        <div style="background:#fff3e0;padding:10px;border-radius:5px;">
                            <div style="font-weight:bold;color:#e65100;margin-bottom:5px;">Données en base</div>
                            <div>Court : ${c.existing.libelle_court}</div>
                            <div>Adresse : ${c.existing.adresse || '-'}</div>
                            <div>Lat : ${c.existing.latitude != null ? c.existing.latitude : '-'} / Lng : ${c.existing.longitude != null ? c.existing.longitude : '-'}</div>
                        </div>
                        <div style="background:#e8f5e9;padding:10px;border-radius:5px;">
                            <div style="font-weight:bold;color:#2e7d32;margin-bottom:5px;">Données du fichier CSV</div>
                            ${(() => {
                                const raw = locCsvParsedRows[c.incoming.libelle_long] || c.incoming;
                                const dLc = raw.libelle_court !== c.existing.libelle_court;
                                const dAd = (raw.adresse || '') !== (c.existing.adresse || '');
                                const dLat = raw.latitude != c.existing.latitude;
                                const dLng = raw.longitude != c.existing.longitude;
                                const hl = (v, d) => (d ? `<strong style="color:#e65100;">${v}</strong>` : v);
                                return `<div>Court : ${hl(raw.libelle_court, dLc)}</div>
                                        <div>Adresse : ${hl(raw.adresse || '-', dAd)}</div>
                                        <div>Lat : ${hl(raw.latitude != null ? raw.latitude : '-', dLat)} / Lng : ${hl(raw.longitude != null ? raw.longitude : '-', dLng)}</div>`;
                            })()}
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <label style="font-size:12px;font-weight:bold;color:#555;">Action :</label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;">
                            <input type="radio" name="locConflict_${i}" value="keep" ${c.action === 'keep' ? 'checked' : ''} onchange="locConflictData[${i}].action='keep'"> Conserver l'existant
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;">
                            <input type="radio" name="locConflict_${i}" value="overwrite" ${c.action === 'overwrite' ? 'checked' : ''} onchange="locConflictData[${i}].action='overwrite'"> Écraser avec le CSV
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;">
                            <input type="radio" name="locConflict_${i}" value="manual" ${c.action === 'manual' ? 'checked' : ''} onchange="locConflictData[${i}].action='manual'; showManualLocEdit(${i})"> Saisir manuellement
                        </label>
                    </div>
                    <div id="manualLocEdit_${i}" style="display:none;margin-top:10px;background:#e3f2fd;padding:10px;border-radius:5px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                            <div>
                                <label style="font-size:11px;display:block;margin-bottom:2px;">Libellé court *</label>
                                <input type="text" id="manualCourt_${i}" value="${c.existing.libelle_court}" style="width:100%;padding:5px;text-transform:uppercase;" oninput="this.value=this.value.toUpperCase();locConflictData[${i}].incoming.libelle_court=this.value">
                            </div>
                            <div>
                                <label style="font-size:11px;display:block;margin-bottom:2px;">Adresse</label>
                                <input type="text" id="manualAdresse_${i}" value="${c.existing.adresse || ''}" style="width:100%;padding:5px;text-transform:uppercase;" oninput="this.value=this.value.toUpperCase();locConflictData[${i}].incoming.adresse=this.value">
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <div>
                                <label style="font-size:11px;display:block;margin-bottom:2px;">Latitude</label>
                                <input type="number" id="manualLat_${i}" value="${c.incoming.latitude != null ? c.incoming.latitude : ''}" step="any" style="width:100%;padding:5px;" oninput="locConflictData[${i}].incoming.latitude=parseFloat(this.value)||null">
                            </div>
                            <div>
                                <label style="font-size:11px;display:block;margin-bottom:2px;">Longitude</label>
                                <input type="number" id="manualLng_${i}" value="${c.incoming.longitude != null ? c.incoming.longitude : ''}" step="any" style="width:100%;padding:5px;" oninput="locConflictData[${i}].incoming.longitude=parseFloat(this.value)||null">
                            </div>
                        </div>
                    </div>
                </div>`;
    });
    container.innerHTML = html;
}

function showManualLocEdit(i) {
    const div = document.getElementById(`manualLocEdit_${i}`);
    if (div) div.style.display = 'block';
}

function applyAllLocConflicts(action) {
    locConflictData.forEach((c, i) => {
        c.action = action;
        const radios = document.querySelectorAll(`input[name="locConflict_${i}"]`);
        radios.forEach(r => {
            r.checked = r.value === action;
        });
        const manualDiv = document.getElementById(`manualLocEdit_${i}`);
        if (manualDiv) manualDiv.style.display = 'none';
    });
}

async function resolveLocConflicts() {
    let updated = 0;
    let errors = 0;

    for (const c of locConflictData) {
        if (c.action === 'keep') continue;

        // Source de vérité : données CSV stockées côté client
        const csvRow = locCsvParsedRows[c.incoming.libelle_long];

        // Données à écrire selon l'action
        const payload =
            c.action === 'manual'
                ? {
                      libelle_long: c.incoming.libelle_long,
                      libelle_court: c.incoming.libelle_court,
                      adresse: c.incoming.adresse,
                      latitude: c.incoming.latitude,
                      longitude: c.incoming.longitude
                  }
                : {
                      // 'overwrite' → on prend STRICTEMENT les valeurs du CSV parsé
                      libelle_long: csvRow.libelle_long,
                      libelle_court: csvRow.libelle_court,
                      adresse: csvRow.adresse,
                      latitude: csvRow.latitude,
                      longitude: csvRow.longitude
                  };

        // Appel direct PUT /api/locations/:id (l'ID vient de l'entrée existante en base)
        try {
            const res = await fetch(`${API_URL}/locations/${c.existing.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (res.ok) updated++;
            else {
                errors++;
                console.error('Erreur PUT location', c.existing.id, await res.text());
            }
        } catch (e) {
            errors++;
            console.error('Erreur réseau PUT location:', e);
        }
    }

    closeLocConflictModal();
    await loadLocations();
    const status = document.getElementById('locImportStatus');
    if (status) {
        if (errors > 0) {
            status.textContent = `⚠️ ${updated} mise(s) à jour, ${errors} erreur(s).`;
        } else {
            status.textContent = `✅ ${updated} localisation(s) mise(s) à jour avec les données du CSV.`;
        }
    }
}

// ========== FIN LOCALISATIONS ==========
