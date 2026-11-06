// Application principale : particularites
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Fiche de la ressource, historique des taux de MAD et particularités : îlot Vue (frontend/src/ilots/ressources)
// Grille et saisie des demi-journées : îlot Vue (frontend/src/ilots/planification) ; restent le planning et les
// astreintes lus par les exports et impressions (lot 4.6), et le menu contextuel des astreintes (lot 4.5b)

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

// === Menu contextuel clic droit Gantt ===
let _ganttCtxMenuData = null;

function closeGanttContextMenu() {
    const menu = document.getElementById('ganttContextMenu');
    if (menu) menu.style.display = 'none';
    _ganttCtxMenuData = null;
}

// Listener unique sur document — survit aux re-rendus du gantt
document.addEventListener('contextmenu', function (e) {
    // Vérifier qu'on est bien dans #ganttWrapper
    if (!e.target.closest('#ganttWrapper')) return;

    const td = e.target.closest('td[data-date]');
    if (!td) return;
    const tr = td.closest('tr[data-resource-id]');
    if (!tr) return;

    const userId = tr.getAttribute('data-user-id');
    const resourceId = tr.getAttribute('data-resource-id');
    const resourceName = tr.getAttribute('data-resource-name') || '';

    // Vérification des droits
    const isAdmin = currentUser && currentUser.is_admin;
    const isOwnRow = currentUser && userId && String(currentUser.id) === String(userId);
    if (!isAdmin && !isOwnRow) return;

    if (!userId) {
        // Ressource sans compte utilisateur lié
        if (!isAdmin) return;
        // Admin voit le menu mais avec message d'avertissement
    }

    e.preventDefault();
    const dateAttr = td.getAttribute('data-date'); // format YYYY-M-D
    const parts = dateAttr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);

    const period = td.getAttribute('data-period') || 'AM';
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Astreintes déjà présentes sur cette cellule
    const cellAstreintes = getAstreintesForCell(parseInt(resourceId), dateStr, period);

    _ganttCtxMenuData = { userId, resourceId, resourceName, year, month, day, period, dateStr, cellAstreintes };

    // Construire les items du menu dynamiquement
    const itemsEl = document.getElementById('ganttContextMenuItems');
    const mkItem = (icon, text, color, fn, disabled) => {
        const d = document.createElement('div');
        d.style.cssText = `padding:9px 16px;display:flex;align-items:center;gap:8px;color:${disabled ? '#aaa' : color || '#222'};cursor:${disabled ? 'default' : 'pointer'};`;
        d.innerHTML = `<span>${icon}</span><span>${text}</span>`;
        if (!disabled) {
            d.onmouseover = () => (d.style.background = '#f5f5f5');
            d.onmouseout = () => (d.style.background = '');
            d.onclick = fn;
        }
        return d;
    };
    const mkSep = () => {
        const s = document.createElement('div');
        s.style.cssText = 'border-top:1px solid #eee;margin:3px 0;';
        return s;
    };

    // Afficher un état "chargement" pendant la vérification du verrou
    itemsEl.innerHTML = '<div style="padding:8px 16px;color:#888;font-size:12px;">⏳ Vérification…</div>';

    // Vérification async du verrou CRA
    fetch(`${API_URL}/astreintes-hno/lock-check?user_id=${userId}&mois=${month}&annee=${year}`, {
        credentials: 'include'
    })
        .then(r => r.json())
        .catch(() => ({ locked: false }))
        .then(lock => {
            // Re-vérifier que le menu est toujours ouvert pour ce même contexte
            if (!_ganttCtxMenuData || _ganttCtxMenuData.userId !== userId) return;
            itemsEl.innerHTML = '';
            if (lock.locked) {
                const statLabel =
                    { soumis: 'soumis', vise_n1: 'visé N1', vise_n2: 'visé N2', diffuse: 'diffusé/signé' }[
                        lock.statut
                    ] || lock.statut;
                itemsEl.appendChild(
                    mkItem('🔒', `CRA ${statLabel} — modifications verrouillées`, '#b71c1c', null, true)
                );
            } else {
                if (cellAstreintes.length === 0) {
                    itemsEl.appendChild(
                        mkItem('➕', 'Ajouter une astreinte / HNO', '#6a1b9a', () => ganttContextMenuAction('add'))
                    );
                } else {
                    cellAstreintes.forEach((a, i) => {
                        const label =
                            a.type === 'astreinte'
                                ? '🔔 Astreinte'
                                : a.type === 'activite_courante'
                                  ? '✅ Activité courante'
                                  : '⏰ HNO';
                        const short = (a.objet || '').substring(0, 22) + ((a.objet || '').length > 22 ? '…' : '');
                        if (i > 0) itemsEl.appendChild(mkSep());
                        itemsEl.appendChild(
                            mkItem('✏️', `Modifier — ${label} ${short}`, '#1565c0', () =>
                                ganttContextMenuAction('edit', a)
                            )
                        );
                        itemsEl.appendChild(
                            mkItem('🗑️', `Supprimer — ${label} ${short}`, '#c62828', () =>
                                ganttContextMenuAction('delete', a)
                            )
                        );
                    });
                    itemsEl.appendChild(mkSep());
                    itemsEl.appendChild(
                        mkItem('➕', 'Ajouter une astreinte / HNO', '#6a1b9a', () => ganttContextMenuAction('add'))
                    );
                }
            }
        });

    const menu = document.getElementById('ganttContextMenu');
    document.getElementById('ganttContextMenuHeader').textContent =
        `${resourceName} — ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} (${period})`;
    menu.style.display = 'block';
    const vw = window.innerWidth,
        vh = window.innerHeight;
    let x = e.clientX,
        y = e.clientY;
    const menuH = Math.min(cellAstreintes.length * 80 + 80, 300);
    if (x + 250 > vw) x = vw - 255;
    if (y + menuH > vh) y = vh - menuH - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    setTimeout(() => document.addEventListener('click', closeGanttContextMenu, { once: true }), 0);
});

function initGanttContextMenu() {
    /* listener désormais sur document — pas besoin d'init par rendu */
}

async function ganttContextMenuAction(action, entry) {
    const data = _ganttCtxMenuData ? { ..._ganttCtxMenuData } : null;
    closeGanttContextMenu();
    if (!data) return;
    if (action === 'add') {
        await openGanttAstreinteModal(data);
    } else if (action === 'edit') {
        await openGanttAstreinteModal(data, entry);
    } else if (action === 'delete') {
        await deleteGanttAstreinte(entry, data);
    }
}

async function deleteGanttAstreinte(entry, data) {
    const label =
        entry.type === 'astreinte' ? 'Astreinte' : entry.type === 'activite_courante' ? 'Activité courante' : 'HNO';
    if (
        !confirm(
            `Supprimer cette ${label} ?\n${entry.objet || ''} | ${entry.samu || ''}\n${entry.date_debut} → ${entry.date_fin}`
        )
    )
        return;
    try {
        const res = await fetch(`${API_URL}/astreintes-hno/${entry.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || res.status);
        }
        await loadAllAstreintesForPlanning();
        updateGantt();
    } catch (e) {
        alert('Erreur suppression : ' + e.message);
    }
}

// ===== SAISIE DES ASTREINTES / HNO DEPUIS LE GANTT =====
// Copie réduite de l'ancienne saisie du CRA, propre au menu contextuel du Gantt (le CRA a sa saisie : îlot Vue
// frontend/src/ilots/cra), en attendant la migration de la planification (phase 4 de docs/migration-vue.md)
let _ganttAstreinteCtx = null; // contexte sauvegardé pour la sauvegarde directe
let _ganttAstreinteLines = [];
let _ganttAstreinteEditIdx = null; // index de la ligne en cours d'édition

async function openGanttAstreinteModal(data, editEntry) {
    const snap = { ...data };
    if (!snap.userId) {
        alert("Cette ressource n'a pas de compte utilisateur associé.");
        return;
    }
    try {
        // Charger les astreintes existantes directement (sans CRA)
        const res = await fetch(
            `${API_URL}/astreintes-hno/direct?user_id=${snap.userId}&mois=${snap.month}&annee=${snap.year}`,
            { credentials: 'include' }
        );
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert('Erreur chargement astreintes : ' + (err.error || res.status));
            return;
        }
        const lignes = await res.json();

        _ganttAstreinteCtx = snap;
        _ganttAstreinteLines = lignes.map(l => ({
            id: l.id,
            type: l.type,
            date_debut: l.date_debut,
            date_fin: l.date_fin,
            heure_debut: l.heure_debut || '',
            heure_fin: l.heure_fin || '',
            samu: l.samu || '',
            objet: l.objet || ''
        }));
        _ganttAstreinteEditIdx = null;

        // Titre
        const moisNom = new Date(snap.year, snap.month - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        document.getElementById('ganttAstreinteModalTitle').textContent = `${snap.resourceName} — ${moisNom}`;

        // Bornes du mois pour les champs date
        const pad = n => String(n).padStart(2, '0');
        const lastDay = new Date(snap.year, snap.month, 0).getDate();
        const minDate = `${snap.year}-${pad(snap.month)}-01`;
        const maxDate = `${snap.year}-${pad(snap.month)}-${pad(lastDay)}`;
        document.getElementById('ganttAstreinteDateDebut').min = minDate;
        document.getElementById('ganttAstreinteDateDebut').max = maxDate;
        document.getElementById('ganttAstreinteDateFin').min = minDate;
        document.getElementById('ganttAstreinteDateFin').max = maxDate;

        if (!allLocations || allLocations.length === 0) await loadLocations();
        // Peupler le select SAMU
        const samuSel = document.getElementById('ganttAstreinteSamu');
        samuSel.innerHTML = '<option value="">-- Sélectionner un SAMU --</option>';
        (allLocations || []).forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.libelle_court || loc.libelle_long || '';
            opt.textContent = loc.libelle_court ? `${loc.libelle_court} — ${loc.libelle_long || ''}` : loc.libelle_long;
            samuSel.appendChild(opt);
        });

        ganttAstreinteResetForm();
        renderGanttAstreinteList();

        const hDebut = document.getElementById('ganttAstreinteHeureDebut');
        const hFin = document.getElementById('ganttAstreinteHeureFin');

        if (editEntry) {
            // Mode édition : pré-remplir avec l'entrée existante
            const idx = _ganttAstreinteLines.findIndex(l => l.id === editEntry.id);
            if (idx >= 0) {
                ganttAstreinteEditLigne(idx);
            } else {
                // Entrée pas encore dans la liste locale (vient d'allAstreintesHno) → l'ajouter temporairement
                document.getElementById('ganttAstreinteType').value = editEntry.type;
                document.getElementById('ganttAstreinteDateDebut').value = (editEntry.date_debut || '').substring(
                    0,
                    10
                );
                document.getElementById('ganttAstreinteDateFin').value = (editEntry.date_fin || '').substring(0, 10);
                hDebut.value = editEntry.heure_debut || '';
                hFin.value = editEntry.heure_fin || '';
                document.getElementById('ganttAstreinteSamu').value = editEntry.samu || '';
                document.getElementById('ganttAstreinteObjet').value = editEntry.objet || '';
                _ganttAstreinteEditIdx = null;
            }
            // Contraintes horaires selon période cliquée
            if (snap.period === 'AM') {
                hDebut.min = '00:00';
                hDebut.max = '11:59';
                hFin.min = '00:00';
                hFin.max = '11:59';
            } else {
                hDebut.min = '12:00';
                hDebut.max = '23:59';
                hFin.min = '12:00';
                hFin.max = '23:59';
            }
        } else {
            // Mode ajout : pré-remplir la date et les heures selon AM/PM
            document.getElementById('ganttAstreinteDateDebut').value = snap.dateStr;
            document.getElementById('ganttAstreinteDateFin').value = snap.dateStr;
            if (snap.period === 'AM') {
                hDebut.min = '00:00';
                hDebut.max = '11:59';
                hFin.min = '00:00';
                hFin.max = '11:59';
                hDebut.value = '00:00';
                hFin.value = '11:59';
            } else {
                hDebut.min = '12:00';
                hDebut.max = '23:59';
                hFin.min = '12:00';
                hFin.max = '23:59';
                hDebut.value = '12:00';
                hFin.value = '23:59';
            }
        }

        document.getElementById('ganttAstreinteModal').classList.add('active');
    } catch (e) {
        alert('Erreur : ' + e.message);
    }
}

function closeGanttAstreinteModal() {
    document.getElementById('ganttAstreinteModal').classList.remove('active');
    _ganttAstreinteCtx = null;
    _ganttAstreinteLines = [];
    _ganttAstreinteEditIdx = null;
}

function ganttAstreinteResetForm() {
    document.getElementById('ganttAstreinteType').selectedIndex = 0;
    document.getElementById('ganttAstreinteSamu').selectedIndex = 0;
    document.getElementById('ganttAstreinteDateDebut').value = '';
    document.getElementById('ganttAstreinteDateFin').value = '';
    document.getElementById('ganttAstreinteHeureDebut').value = '';
    document.getElementById('ganttAstreinteHeureFin').value = '';
    document.getElementById('ganttAstreinteObjet').value = '';
    _ganttAstreinteEditIdx = null;
    const btn = document.getElementById('ganttAstreinteAddBtn');
    if (btn) {
        btn.textContent = '➕ Ajouter';
        btn.style.background = '#6a1b9a';
    }
}

function ganttAstreinteEditLigne(idx) {
    const l = _ganttAstreinteLines[idx];
    if (!l) return;
    _ganttAstreinteEditIdx = idx;
    document.getElementById('ganttAstreinteType').value = l.type;
    document.getElementById('ganttAstreinteDateDebut').value = l.date_debut;
    document.getElementById('ganttAstreinteDateFin').value = l.date_fin;
    document.getElementById('ganttAstreinteHeureDebut').value = l.heure_debut;
    document.getElementById('ganttAstreinteHeureFin').value = l.heure_fin;
    document.getElementById('ganttAstreinteSamu').value = l.samu;
    document.getElementById('ganttAstreinteObjet').value = l.objet;
    const btn = document.getElementById('ganttAstreinteAddBtn');
    if (btn) {
        btn.textContent = '💾 Modifier';
        btn.style.background = '#e65100';
    }
    document.getElementById('ganttAstreinteType').focus();
}

// Vérifie les chevauchements date+heure pour le même type (retourne l'entrée en conflit ou null)
function findGanttAstreinteConflict(newLigne, skipIdx) {
    const newStart = newLigne.date_debut + 'T' + (newLigne.heure_debut || '00:00');
    const newEnd = newLigne.date_fin + 'T' + (newLigne.heure_fin || '23:59');
    for (let i = 0; i < _ganttAstreinteLines.length; i++) {
        if (i === skipIdx) continue;
        const l = _ganttAstreinteLines[i];
        if (l.type !== newLigne.type) continue; // seul le même type génère un conflit
        const lStart = l.date_debut + 'T' + (l.heure_debut || '00:00');
        const lEnd = l.date_fin + 'T' + (l.heure_fin || '23:59');
        if (newStart < lEnd && newEnd > lStart) return l;
    }
    return null;
}

function ganttAstreinteAjouter() {
    const type = document.getElementById('ganttAstreinteType').value;
    const dateDebut = document.getElementById('ganttAstreinteDateDebut').value;
    const dateFin = document.getElementById('ganttAstreinteDateFin').value;
    const heureDebut = document.getElementById('ganttAstreinteHeureDebut').value;
    const heureFin = document.getElementById('ganttAstreinteHeureFin').value;
    const samu = document.getElementById('ganttAstreinteSamu').value;
    const objet = document.getElementById('ganttAstreinteObjet').value.trim();

    if (!dateDebut || !dateFin || !heureDebut || !heureFin || !samu || !objet) {
        alert('Veuillez remplir tous les champs obligatoires (*)');
        return;
    }
    if (dateFin < dateDebut) {
        alert('La date de fin doit être ≥ à la date de début');
        return;
    }
    if (heureFin <= heureDebut && dateDebut === dateFin) {
        alert("L'heure de fin doit être > à l'heure de début");
        return;
    }

    const ligne = {
        type,
        date_debut: dateDebut,
        date_fin: dateFin,
        heure_debut: heureDebut,
        heure_fin: heureFin,
        samu,
        objet
    };
    const skipIdx = _ganttAstreinteEditIdx !== null ? _ganttAstreinteEditIdx : -1;
    const conflict = findGanttAstreinteConflict(ligne, skipIdx);
    if (conflict) {
        const typeLabel =
            type === 'astreinte' ? 'Astreinte' : type === 'activite_courante' ? 'Activité courante' : 'HNO';
        const conflictDates =
            conflict.date_debut === conflict.date_fin
                ? formatDateFRClient(conflict.date_debut)
                : `${formatDateFRClient(conflict.date_debut)} → ${formatDateFRClient(conflict.date_fin)}`;
        const msg = `⚠️ Conflit détecté\n\nUn(e) ${typeLabel} existe déjà sur cette période :\n📅 ${conflictDates}  ⏰ ${conflict.heure_debut}–${conflict.heure_fin}\n📝 ${conflict.objet}\n\nModifiez les dates/heures ou supprimez l'entrée existante.`;
        alert(msg);
        return;
    }

    if (_ganttAstreinteEditIdx !== null) {
        ligne.id = _ganttAstreinteLines[_ganttAstreinteEditIdx].id;
        _ganttAstreinteLines[_ganttAstreinteEditIdx] = ligne;
    } else {
        _ganttAstreinteLines.push(ligne);
    }
    renderGanttAstreinteList();
    ganttAstreinteResetForm();
}

function ganttAstreinteSupprimer(idx) {
    if (!confirm('Supprimer cette ligne ?')) return;
    _ganttAstreinteLines.splice(idx, 1);
    renderGanttAstreinteList();
    if (_ganttAstreinteEditIdx === idx) ganttAstreinteResetForm();
}

function renderGanttAstreinteList() {
    const container = document.getElementById('ganttAstreinteList');
    if (!_ganttAstreinteLines.length) {
        container.innerHTML =
            '<p style="color:#999;text-align:center;font-size:13px;padding:20px 0;">Aucune ligne saisie</p>';
        return;
    }
    container.innerHTML = _ganttAstreinteLines
        .map(
            (l, i) => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${i % 2 ? '#f9f4ff' : 'white'};border:1px solid #e1bee7;border-radius:6px;margin-bottom:6px;font-size:12px;">
                    <span style="padding:2px 8px;border-radius:4px;background:${l.type === 'astreinte' ? '#ff980022' : l.type === 'activite_courante' ? '#2e7d3222' : '#2196f322'};color:${l.type === 'astreinte' ? '#e65100' : l.type === 'activite_courante' ? '#2e7d32' : '#1565c0'};font-weight:bold;white-space:nowrap;">${l.type === 'astreinte' ? '🔔 Astreinte' : l.type === 'activite_courante' ? '✅ Activité courante' : '🌙 HNO'}</span>
                    <span style="white-space:nowrap;">${formatDateFRClient(l.date_debut)}${l.date_fin !== l.date_debut ? ' → ' + formatDateFRClient(l.date_fin) : ''}</span>
                    <span style="white-space:nowrap;color:#666;">${l.heure_debut} → ${l.heure_fin}</span>
                    <span style="white-space:nowrap;color:#6a1b9a;font-weight:bold;">${l.samu}</span>
                    <span style="flex:1;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.objet}</span>
                    <button onclick="ganttAstreinteEditLigne(${i})" title="Modifier" style="background:#ff9800;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">✏️</button>
                    <button onclick="ganttAstreinteSupprimer(${i})" title="Supprimer" style="background:#e53935;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">🗑️</button>
                </div>`
        )
        .join('');
}

async function ganttAstreinteTerminer() {
    const ctx = _ganttAstreinteCtx;
    if (!ctx) return;
    try {
        // Sauvegarde directe sans CRA
        const res = await fetch(`${API_URL}/astreintes-hno/direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                user_id: ctx.userId,
                mois: ctx.month,
                annee: ctx.year,
                lignes: _ganttAstreinteLines
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        closeGanttAstreinteModal();
        await loadAllAstreintesForPlanning();
        updateGantt();
    } catch (e) {
        alert("Erreur lors de l'enregistrement : " + e.message);
    }
}
// ===== /SAISIE DES ASTREINTES / HNO DEPUIS LE GANTT =====
