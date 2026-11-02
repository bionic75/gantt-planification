// Application principale : particularites
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Fiche de la ressource, historique des taux de MAD et particularités : îlot Vue (frontend/src/ilots/ressources)

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
        // Sauvegarder une copie pour détecter les changements
        oldScheduleData = JSON.parse(JSON.stringify(scheduleData));

        // Sauvegarder l'état initial des affectations pour la session
        // Cela permet de comparer les changements et d'éviter les notifications pour des retours à l'état initial
        initialScheduleState = JSON.parse(JSON.stringify(scheduleData));
        console.log('📋 État initial du planning sauvegardé pour la session');

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

// Génère le HTML de la pastille astreinte/HNO
function getAstreinteBadgeHtml(astreintes) {
    if (!astreintes || (Array.isArray(astreintes) && astreintes.length === 0)) return '';
    // Compat : accepte objet unique ou tableau
    const list = Array.isArray(astreintes) ? astreintes : [astreintes];
    if (list.length === 0) return '';
    const hasAstr = list.some(a => a.type === 'astreinte');
    const hasHno = list.some(a => a.type === 'hno');
    const hasAct = list.some(a => a.type === 'activite_courante');
    const typeIcon = a =>
        a.type === 'astreinte' ? '🔔 Astreinte' : a.type === 'activite_courante' ? '✅ Activité courante' : '⏰ HNO';
    const tooltip = list
        .map(a => `${typeIcon(a)}${a.heures ? ' ' + a.heures : ''}: ${a.objet || ''}${a.samu ? ' | ' + a.samu : ''}`)
        .join('\n')
        .replace(/"/g, '&quot;');
    const kinds = [hasAstr && 'ASTR', hasHno && 'HNO'].filter(Boolean);
    if (kinds.length > 1) {
        return `<span class="astreinte-badge" style="white-space:pre;line-height:1.3;padding:1px 3px;" title="${tooltip}">${kinds.join('\n')}</span>`;
    }
    if (!hasAstr && !hasHno) return '';
    const label = hasAstr ? 'ASTR' : 'HNO';
    return `<span class="astreinte-badge" title="${tooltip}">${label}</span>`;
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

// Flag pour savoir si un envoi d'email est en cours (pour protéger saveSchedule)
let emailSendingInProgress = false;
let saveSchedulePending = false;

async function saveSchedule(retryCount = 0) {
    // Si un envoi d'email est en cours, différer la sauvegarde
    if (emailSendingInProgress && retryCount === 0) {
        if (!saveSchedulePending) {
            saveSchedulePending = true;
            console.log('⏳ Sauvegarde différée (envoi emails en cours)...');
            // Réessayer dans 3 secondes
            setTimeout(() => {
                saveSchedulePending = false;
                saveSchedule(0);
            }, 3000);
        }
        return;
    }

    try {
        const response = await fetch(`${API_URL}/schedule/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(scheduleData)
        });
        if (!response.ok) {
            if (retryCount < 3) {
                const delay = (retryCount + 1) * 2000;
                console.log(
                    `⏳ Sauvegarde échouée (${response.status}), retry dans ${delay / 1000}s... (${retryCount + 1}/3)`
                );
                setTimeout(() => saveSchedule(retryCount + 1), delay);
                return;
            }
            throw new Error('Erreur sauvegarde');
        }

        oldScheduleData = JSON.parse(JSON.stringify(scheduleData));
        showSyncStatus();
        logModification('Modification du planning');
    } catch (error) {
        if (retryCount < 3) {
            const delay = (retryCount + 1) * 2000;
            console.log(`⏳ Erreur réseau sauvegarde, retry dans ${delay / 1000}s... (${retryCount + 1}/3)`);
            setTimeout(() => saveSchedule(retryCount + 1), delay);
        } else {
            console.error('Erreur:', error);
        }
    }
}

function setCurrentMonth() {
    const now = new Date();
    document.getElementById('monthSelect').value = now.getMonth();
    document.getElementById('yearSelect').value = now.getFullYear();
}

function countWorkDays(year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    let workDays = 0;
    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month, day);
        if (date.getDay() !== 0 && date.getDay() !== 6) workDays++;
    }
    return workDays;
}

function countMadVolanteConsumedDays(resourceId, dateDebut, dateFin) {
    // Consumed when disponibilité='2' (vert) AND affectation not in ['1','2'] (affectation réelle)
    let consumed = 0;
    const start = dateDebut ? new Date(dateDebut) : null;
    const end = dateFin ? new Date(dateFin) : null;
    for (const key of Object.keys(scheduleData)) {
        const m = key.match(/^(\d+)_activity_(\d{4}-\d{2}-\d{2})_(AM|PM)$/);
        if (!m) continue;
        if (parseInt(m[1]) !== resourceId) continue;
        const d = new Date(m[2]);
        if (start && d < start) continue;
        if (end && d > end) continue;
        const actValue = scheduleData[key];
        if (!actValue || actValue === '1' || actValue === '2') continue;
        const availKey = `${resourceId}_available_${m[2]}_${m[3]}`;
        if (scheduleData[availKey] === '2') consumed += 0.5;
    }
    return consumed;
}

function countDaysForResource(resourceId, year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= lastDay; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // Compter les demi-journées
        ['AM', 'PM'].forEach(period => {
            const key = `${resourceId}_available_${dateKey}_${period}`;
            if (scheduleData[key] === '2') count += 0.5;
        });
        // Compatibilité avec l'ancien format (sans AM/PM)
        const oldKey = `${resourceId}_available_${dateKey}`;
        if (scheduleData[oldKey] === '2' && !scheduleData[`${resourceId}_available_${dateKey}_AM`]) {
            count++;
        }
    }
    return count;
}

function calculateExpectedWorkDays(resourceId, year, month) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return 0;

    // Déterminer la plage de dates effective pour ce mois
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Si on a un historique MAD chargé pour cette ressource, l'utiliser
    // Sinon, calculer avec l'ancien système
    const madHistory = window.resourceMadHistoryCache ? window.resourceMadHistoryCache[resourceId] : null;
    const particularites = window.resourceParticularitesCache ? window.resourceParticularitesCache[resourceId] : null;

    // Si pas de cache MAD, utiliser l'ancien système
    if (!madHistory || madHistory.length === 0) {
        return calculateExpectedWorkDaysLegacy(resource, year, month);
    }

    // Nouveau calcul jour par jour avec l'historique MAD
    let totalDays = 0;
    const currentDate = new Date(year, month, 1);

    while (currentDate.getMonth() === month && currentDate.getFullYear() === year) {
        // Exclure les week-ends
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
            const dateStr = currentDate.toISOString().split('T')[0];

            // Trouver le taux applicable pour cette date
            let tauxJour = 0;

            // D'abord vérifier les particularités
            if (particularites && particularites.length > 0) {
                const partMatch = particularites.find(p => p.date_debut <= dateStr && p.date_fin >= dateStr);
                if (partMatch) {
                    tauxJour = partMatch.taux;
                }
            }

            // Si pas de particularité, chercher dans l'historique MAD
            if (
                tauxJour === 0 ||
                !particularites ||
                particularites.length === 0 ||
                !particularites.find(p => p.date_debut <= dateStr && p.date_fin >= dateStr)
            ) {
                const madMatch = madHistory.find(
                    m => m.date_debut <= dateStr && (!m.date_fin || m.date_fin >= dateStr)
                );
                if (madMatch) {
                    // Vérifier si une particularité s'applique
                    const partOverride = particularites
                        ? particularites.find(p => p.date_debut <= dateStr && p.date_fin >= dateStr)
                        : null;
                    tauxJour = partOverride ? partOverride.taux : madMatch.taux;
                }
            }

            // Ajouter la fraction de jour
            totalDays += tauxJour / 100;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return totalDays.toFixed(1);
}

// Ancienne fonction de calcul (fallback)
function calculateExpectedWorkDaysLegacy(resource, year, month) {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Date de début de MAD
    let startDate = firstDayOfMonth;
    if (resource.date_debut) {
        const madStartDate = new Date(resource.date_debut);
        if (madStartDate > firstDayOfMonth) {
            startDate = madStartDate;
        }
    }

    // Date de fin de MAD
    let endDate = lastDayOfMonth;
    if (resource.date_fin) {
        const madEndDate = new Date(resource.date_fin);
        if (madEndDate < lastDayOfMonth) {
            endDate = madEndDate;
        }
    }

    // Si la période de MAD ne touche pas ce mois, retourner 0
    if (startDate > lastDayOfMonth || endDate < firstDayOfMonth) {
        return 0;
    }

    // Compter les jours ouvrés dans la période effective
    let workDays = 0;
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        if (currentDate.getMonth() === month && currentDate.getFullYear() === year) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                workDays++;
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Appliquer le taux de MAD
    const result = ((workDays * resource.taux) / 100).toFixed(1);
    return result;
}

// Fonction pour charger le cache MAD pour toutes les ressources
async function loadAllMadHistoryCache() {
    window.resourceMadHistoryCache = {};
    window.resourceParticularitesCache = {};

    for (const resource of resources) {
        try {
            // Charger l'historique MAD
            const histResponse = await fetch(`${API_URL}/resources/${resource.id}/mad-history`, {
                credentials: 'include'
            });
            if (histResponse.ok) {
                window.resourceMadHistoryCache[resource.id] = await histResponse.json();

                // Charger les particularités pour chaque période MAD
                window.resourceParticularitesCache[resource.id] = [];
                for (const mad of window.resourceMadHistoryCache[resource.id]) {
                    const partResponse = await fetch(
                        `${API_URL}/resources/${resource.id}/mad-history/${mad.id}/particularites`,
                        { credentials: 'include' }
                    );
                    if (partResponse.ok) {
                        const parts = await partResponse.json();
                        window.resourceParticularitesCache[resource.id].push(...parts);
                    }
                }
            }
        } catch (e) {
            console.error(`Erreur chargement MAD pour ressource ${resource.id}:`, e);
        }
    }
}

// Fonction pour obtenir le taux MAD effectif pour une ressource et une date
function getEffectiveMadRate(resourceId, dateStr) {
    const madHistory = window.resourceMadHistoryCache ? window.resourceMadHistoryCache[resourceId] : null;
    const particularites = window.resourceParticularitesCache ? window.resourceParticularitesCache[resourceId] : null;

    // Vérifier les particularités d'abord
    if (particularites && particularites.length > 0) {
        const partMatch = particularites.find(p => p.date_debut <= dateStr && p.date_fin >= dateStr);
        if (partMatch) {
            return { taux: partMatch.taux, source: 'particularite', motif: partMatch.motif };
        }
    }

    // Sinon chercher dans l'historique MAD
    if (madHistory && madHistory.length > 0) {
        const madMatch = madHistory.find(m => m.date_debut <= dateStr && (!m.date_fin || m.date_fin >= dateStr));
        if (madMatch) {
            return { taux: madMatch.taux, source: 'history' };
        }
    }

    // Par défaut, utiliser le taux de la ressource
    const resource = resources.find(r => r.id === resourceId);
    return { taux: resource ? resource.taux : 0, source: 'resource' };
}

function toggleAvailability(resourceId, dateKey, period = '') {
    // Vérifier les droits : seuls Admin et Expert peuvent modifier la disponibilité
    if (currentUser && currentUser.activeProfile === 'user') {
        alert("Vous n'avez pas les droits pour modifier la disponibilité. Seuls Admin et Expert peuvent le faire.");
        return;
    }

    // Vérifier les droits pour Expert Métier : uniquement sa propre ligne
    if (currentUser && currentUser.activeProfile === 'expert') {
        if (parseInt(resourceId) !== currentUser.resourceId) {
            return; // Bloquer silencieusement la modification des autres lignes
        }
    }

    const resource = resources.find(r => r.id === resourceId);
    const [year, month, day] = dateKey.split('-').map(Number);
    const checkDate = new Date(year, month, day);

    if (!isDateAccessible(resource, checkDate)) {
        alert('Cette date est hors de la période de MAD de cette ressource');
        return;
    }

    const key = period ? `${resourceId}_available_${dateKey}_${period}` : `${resourceId}_available_${dateKey}`;
    const actKey = period ? `${resourceId}_activity_${dateKey}_${period}` : `${resourceId}_activity_${dateKey}`;
    const locKey = period ? `${resourceId}_localisation_${dateKey}_${period}` : `${resourceId}_localisation_${dateKey}`;

    const currentValue = scheduleData[key] || '1';
    let newActivityValue = '1';

    // Bloquer si MAD volante et quota atteint (uniquement au moment de passer en disponible)
    if (currentValue === '1' && resource && resource.is_mad_volante && resource.jours_max_mad) {
        const consumed = countMadVolanteConsumedDays(resourceId, resource.date_debut, resource.date_fin_mad);
        if (consumed >= resource.jours_max_mad) {
            alert(
                `Quota MAD volante atteint : ${resource.jours_max_mad} jour(s) maximum déjà consommés sur la période du contrat.`
            );
            return;
        }
    }

    // Cycle pour Expert : 1 -> 2 -> 3 -> 1 (Indisponible -> Disponible -> Congés -> Indisponible)
    // Cycle pour Admin : 1 -> 2 -> 1 (pas d'accès aux Congés qui sont réservés aux experts)
    if (currentUser && currentUser.activeProfile === 'expert') {
        // Expert : cycle 1 -> 2 -> 3 -> 1
        if (currentValue === '1') {
            scheduleData[key] = '2';
            scheduleData[actKey] = '2';
            newActivityValue = '2';
        } else if (currentValue === '2') {
            scheduleData[key] = '3'; // Congés
            scheduleData[actKey] = '1'; // Pas d'affectation possible
            scheduleData[locKey] = '🏖️'; // Icône plage
            newActivityValue = '1';
        } else {
            // Retour à Indisponible
            scheduleData[key] = '1';
            scheduleData[actKey] = '1';
            delete scheduleData[locKey];
            newActivityValue = '1';
        }
    } else {
        // Admin : cycle 1 -> 2 -> 1 (ne peut pas toucher aux Congés posés par expert)
        if (currentValue === '3') {
            alert("Cette période est en Congés (posée par l'expert). Seul l'expert peut modifier ce statut.");
            return;
        }
        if (currentValue === '1') {
            scheduleData[key] = '2';
            scheduleData[actKey] = '2';
            newActivityValue = '2';
        } else {
            scheduleData[key] = '1';
            scheduleData[actKey] = '1';
            delete scheduleData[locKey];
            newActivityValue = '1';
        }
    }

    // Tracker le changement pour les notifications (tous les profils)
    if (currentUser) {
        const location = scheduleData[locKey] || '-';
        trackAssignment(resourceId, dateKey, period, newActivityValue, location);
    }

    saveSchedule();
    updateGantt();
}

// Set pour tracker les cellules déjà modifiées dans la session (pour éviter de réafficher le pop-up)
const modifiedCellsInSession = new Set();

function cycleActivity(resourceId, dateKey, availability, period = '') {
    // Vérifier les droits pour Expert Métier
    if (currentUser && currentUser.activeProfile === 'expert') {
        if (parseInt(resourceId) !== currentUser.resourceId) {
            return; // Bloquer la modification
        }
    }

    // Bloquer si la disponibilité est à 1 (Indisponible)
    if (availability === '1') {
        alert("La ressource est indisponible ce jour. Vous devez d'abord mettre la disponibilité à 2.");
        return;
    }

    // Bloquer si la disponibilité est à 3 (Congés)
    if (availability === '3') {
        alert('La ressource est en congés ce jour. Aucune affectation possible.');
        return;
    }

    const resource = resources.find(r => r.id === resourceId);
    const [year, month, day] = dateKey.split('-').map(Number);
    const checkDate = new Date(year, month, day);

    if (!isDateAccessible(resource, checkDate)) {
        alert('Cette date est hors de la période de MAD de cette ressource');
        return;
    }

    const key = period ? `${resourceId}_activity_${dateKey}_${period}` : `${resourceId}_activity_${dateKey}`;
    const locKey = period ? `${resourceId}_localisation_${dateKey}_${period}` : `${resourceId}_localisation_${dateKey}`;
    const authorKey = period ? `${resourceId}_author_${dateKey}_${period}` : `${resourceId}_author_${dateKey}`;
    const cellKey = `${resourceId}_${dateKey}_${period}`; // Clé unique pour cette cellule

    const currentValue = parseInt(scheduleData[key] || '2'); // Par défaut "En attente d'affectation"
    const currentAuthor = scheduleData[authorKey] || '';
    const currentLocation = scheduleData[locKey] || '';

    console.log(
        `🔍 cycleActivity: cellKey=${cellKey}, currentValue=${currentValue}, authorKey=${authorKey}, currentAuthor=${currentAuthor}`
    );

    // Pour admin et user : demander confirmation si une affectation existe (valeur 3 à 8)
    if (currentUser && (currentUser.activeProfile === 'admin' || currentUser.activeProfile === 'user')) {
        // Ne demander confirmation que si l'affectation actuelle est >= 3 (vraie affectation)
        if (currentValue >= 3 && currentValue <= 8) {
            console.log(`⚠️ Affectation existante détectée: ${currentValue}`);

            // Vérifier si cette cellule a déjà été modifiée dans cette session
            if (modifiedCellsInSession.has(cellKey)) {
                console.log(`✅ Cellule déjà modifiée dans cette session, pas de pop-up`);
                // Déjà modifié dans cette session, pas besoin de confirmation
                executeActivityChange(resourceId, dateKey, period);
                return;
            }

            // Vérifier si c'est l'utilisateur connecté qui a posé l'affectation
            const currentUserFullName = `${currentUser.prenom}.${currentUser.nom}`;
            const isOwnAssignment = currentAuthor === currentUserFullName;

            console.log(`📋 Affichage de la modal de confirmation`);
            // Afficher la modal de confirmation
            showAssignmentConfirmModal(
                resourceId,
                dateKey,
                period,
                resource,
                currentValue,
                currentLocation,
                currentAuthor,
                isOwnAssignment
            );
            return; // La modification sera effectuée dans le callback de la modal
        } else {
            console.log(`✅ Pas d'affectation existante (currentValue=${currentValue}), modification directe`);
        }
    }

    // Exécuter directement la modification (pas d'affectation existante ou profil expert)
    executeActivityChange(resourceId, dateKey, period);
}

// Fonction pour exécuter le changement d'activité
function executeActivityChange(resourceId, dateKey, period) {
    const key = period ? `${resourceId}_activity_${dateKey}_${period}` : `${resourceId}_activity_${dateKey}`;
    const locKey = period ? `${resourceId}_localisation_${dateKey}_${period}` : `${resourceId}_localisation_${dateKey}`;
    const authorKey = period ? `${resourceId}_author_${dateKey}_${period}` : `${resourceId}_author_${dateKey}`;
    const cellKey = `${resourceId}_${dateKey}_${period}`;

    const currentValue = parseInt(scheduleData[key] || '2');
    let nextValue = currentValue + 1;
    if (nextValue > 8) nextValue = 2; // Cycle 2-8 (pas de retour à 1 car disponibilité = 2)

    // Bloquer si MAD volante et quota atteint lors du passage vers une affectation réelle (>= 3)
    if (nextValue >= 3 && currentValue < 3) {
        const resource = resources.find(r => r.id === resourceId);
        if (resource && resource.is_mad_volante && resource.jours_max_mad) {
            const consumed = countMadVolanteConsumedDays(resourceId, resource.date_debut, resource.date_fin_mad);
            if (consumed >= resource.jours_max_mad) {
                alert(
                    `Quota MAD volante atteint : ${resource.jours_max_mad} jour(s) maximum déjà consommés sur la période du contrat.`
                );
                return;
            }
        }
    }

    // Ajouter cette cellule au Set des cellules modifiées dans la session
    // (pour éviter le pop-up lors des modifications suivantes)
    if (
        currentUser &&
        (currentUser.activeProfile === 'admin' ||
            currentUser.activeProfile === 'user' ||
            currentUser.activeProfile === 'expert')
    ) {
        modifiedCellsInSession.add(cellKey);
        console.log(`📝 Cellule ajoutée au Set: ${cellKey}`);
    }

    // Gestion de la localisation selon les règles :
    if (currentValue === 2 || nextValue === 2) {
        delete scheduleData[locKey];
        console.log("🗑️ Localisation réinitialisée (passage de/vers En attente d'affectation)");
    }

    // Tracker l'affectation AVANT de modifier scheduleData
    if (currentUser) {
        const location = scheduleData[locKey] || '-';
        trackAssignment(resourceId, dateKey, period, String(nextValue), location);
    }

    // Maintenant on modifie scheduleData
    scheduleData[key] = String(nextValue);

    // Stocker l'auteur de la modification
    if (currentUser) {
        scheduleData[authorKey] = `${currentUser.prenom}.${currentUser.nom}`;
    }

    saveSchedule();
    updateGantt();
}

// Afficher la modal de confirmation pour modification d'affectation
function showAssignmentConfirmModal(
    resourceId,
    dateKey,
    period,
    resource,
    currentValue,
    currentLocation,
    currentAuthor,
    isOwnAssignment
) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dateFormatted = dateObj.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const periodLabel = period === 'AM' ? 'Matin' : 'Après-midi';

    const activityLabels = {
        3: '📞 SAMU (Déploiement)',
        4: '📞 SAMU (Dev. usages)',
        5: '📄 ANS (Déploiement)',
        6: '👨‍🏫 ANS (Dev. usages)',
        7: '☑️ Qualification',
        8: '📖 Divers'
    };
    const currentActivityLabel = activityLabels[currentValue] || 'Affectation';

    // Construire le contenu de la modal
    let warningMessage = '';
    let authorDisplay = currentAuthor ? currentAuthor.replace('.', ' ') : 'Non défini';

    if (!isOwnAssignment) {
        warningMessage = `
                    <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin-bottom: 15px;">
                        <strong style="color: #856404;">⚠️ Cette affectation a été posée par quelqu'un d'autre.</strong><br>
                        <span style="color: #856404;">Veuillez contacter <strong>${authorDisplay}</strong> avant toute modification.</span>
                    </div>
                `;
    }

    const modalHtml = `
                <div id="assignmentConfirmModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                    <div style="background: white; border-radius: 10px; padding: 25px; max-width: 500px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                        <h3 style="margin-top: 0; color: #e67e22; border-bottom: 2px solid #e67e22; padding-bottom: 10px;">
                            ⚠️ Modification d'une affectation
                        </h3>
                        
                        ${warningMessage}
                        
                        <div style="background-color: #f8f9fa; border-radius: 5px; padding: 15px; margin-bottom: 20px;">
                            <p style="margin: 5px 0;"><strong>📅 Date :</strong> ${dateFormatted} (${periodLabel})</p>
                            <p style="margin: 5px 0;"><strong>👤 Expert :</strong> ${resource.prenom} ${resource.nom}</p>
                            <p style="margin: 5px 0;"><strong>📋 Affectation :</strong> ${currentActivityLabel}</p>
                            ${currentLocation ? `<p style="margin: 5px 0;"><strong>📍 Localisation :</strong> ${currentLocation}</p>` : ''}
                            <p style="margin: 5px 0;"><strong>✍️ Posée par :</strong> ${authorDisplay}</p>
                        </div>
                        
                        <div style="display: flex; justify-content: flex-end; gap: 10px;">
                            <button onclick="closeAssignmentConfirmModal()" style="padding: 10px 20px; background-color: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                                Abandonner
                            </button>
                            <button onclick="confirmAssignmentChange(${resourceId}, '${dateKey}', '${period}')" style="padding: 10px 20px; background-color: #e67e22; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                                Je veux quand même poursuivre
                            </button>
                        </div>
                    </div>
                </div>
            `;

    // Supprimer une modal existante si présente
    const existingModal = document.getElementById('assignmentConfirmModal');
    if (existingModal) existingModal.remove();

    // Ajouter la modal au DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Fermer la modal de confirmation
function closeAssignmentConfirmModal() {
    const modal = document.getElementById('assignmentConfirmModal');
    if (modal) modal.remove();
}

// Confirmer le changement d'affectation
function confirmAssignmentChange(resourceId, dateKey, period) {
    closeAssignmentConfirmModal();
    executeActivityChange(resourceId, dateKey, period);
}

function openLocalisationModal(resourceId, dateKey, availability, activityValue, period = '') {
    // Vérifier les droits pour Expert Métier : uniquement sa propre ligne
    if (currentUser && currentUser.activeProfile === 'expert') {
        if (parseInt(resourceId) !== currentUser.resourceId) {
            return; // Bloquer silencieusement l'ouverture de la modal pour les autres lignes
        }
    }

    const resource = resources.find(r => r.id === resourceId);
    const [year, month, day] = dateKey.split('-').map(Number);
    const checkDate = new Date(year, month, day);

    if (!isDateAccessible(resource, checkDate)) {
        alert('Cette date est hors de la période de MAD de cette ressource');
        return;
    }

    // Bloquer si la disponibilité est "Congés"
    if (availability === '3') {
        alert('La ressource est en congés ce jour. Aucune modification de localisation possible.');
        return;
    }

    // Si la disponibilité n'est pas "Disponible pour l'ANS"
    if (availability !== '2') {
        alert('Vous devez d\'abord indiquer "Disponible pour l\'ANS" (choix 2) dans la ligne Disponibilité');
        return;
    }

    // Si l'activité est "Indisponible" (1), ne pas permettre de définir une localisation
    if (activityValue === '1') {
        alert('Vous ne pouvez pas définir une localisation pour une activité "Indisponible"');
        return;
    }

    currentLocalisationCell = { resourceId, dateKey, period };

    // Déterminer si on est en mode "disponibilité" ou "affectation"
    const isAvailabilityMode = activityValue === '2'; // 2 = En attente d'affectation
    const container = document.getElementById('localisationOptionsContainer');
    const title = document.getElementById('localisationModalTitle');

    // Vider le conteneur
    container.innerHTML = '';

    const periodLabel = period ? ` (${period})` : '';

    if (isAvailabilityMode) {
        // Mode disponibilité : afficher les 3 options de localisation pour experts
        title.textContent = `Où êtes-vous disponible ?${periodLabel}`;

        const availabilityOptions = [
            { icon: 'home', label: 'Je suis en télétravail', value: '🏠 Télétravail', color: '#3498db' },
            { icon: 'tower', label: 'Je suis à PSC', value: '🗼 PSC', color: '#9b59b6' },
            { icon: 'car', label: 'Je peux me déplacer', value: '🚗 Déplacement', color: '#16a085' }
        ];

        availabilityOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.innerHTML = uiIcon(opt.icon, 22) + opt.label;
            btn.style.backgroundColor = opt.color;
            btn.style.padding = '15px';
            btn.onclick = () => setLocalisation(opt.value);
            container.appendChild(btn);
        });
    } else {
        // Mode affectation : afficher les options de localisation pour les activités
        title.textContent = `Choisir la localisation de l'activité${periodLabel}`;

        // Vérifier si on est sur une affectation SAMU (3 ou 4)
        const isSamuActivity = activityValue === '3' || activityValue === '4';

        const activityOptions = [
            { icon: 'home', label: 'Télétravail', value: '🏠 Télétravail', color: '#3498db' },
            { icon: 'tower', label: 'PSC', value: '🗼 PSC', color: '#9b59b6' },
            { icon: 'mic', label: 'Autres (Congrès, CFARM, EHESP...)', value: '🎤 Autres', color: '#16a085' }
        ];

        // Ajouter l'option SAMU seulement si c'est une affectation SAMU
        if (isSamuActivity) {
            activityOptions.splice(1, 0, {
                icon: 'siren',
                label: 'SAMU (cliquer pour sélectionner)',
                value: 'SAMU_SELECT',
                color: '#e67e22'
            });
        }

        activityOptions.forEach(opt => {
            const btn = document.createElement('button');
            btn.innerHTML = uiIcon(opt.icon, 22) + opt.label;
            btn.style.backgroundColor = opt.color;
            btn.style.padding = '15px';
            if (opt.value === 'SAMU_SELECT') {
                btn.onclick = () => openSamuSelectionFromLocalisation();
            } else {
                btn.onclick = () => setLocalisation(opt.value);
            }
            container.appendChild(btn);
        });
    }

    document.getElementById('localisationModal').classList.add('active');
}

function openSamuSelectionFromLocalisation() {
    // Fermer le modal de localisation temporairement
    document.getElementById('localisationModal').classList.remove('active');
    // Ouvrir le modal de sélection SAMU
    document.getElementById('samuModal').classList.add('active');
}

function closeSamuModal() {
    document.getElementById('samuModal').classList.remove('active');
    // Réouvrir le modal de localisation si on annule
    if (currentLocalisationCell) {
        document.getElementById('localisationModal').classList.add('active');
    }
}

function saveSamuSelection() {
    const samuSelect = document.getElementById('samuSelect');
    const selectedSamu = samuSelect.value;

    if (!selectedSamu) {
        alert('Veuillez sélectionner un SAMU');
        return;
    }

    // Enregistrer la localisation avec le SAMU sélectionné
    setLocalisation(`🚨 ${selectedSamu}`);
    document.getElementById('samuModal').classList.remove('active');
}

function setLocalisation(localisation) {
    if (!currentLocalisationCell) return;
    const { resourceId, dateKey, period } = currentLocalisationCell;

    // Vérifier les droits pour Expert Métier : uniquement sa propre ligne
    if (currentUser && currentUser.activeProfile === 'expert') {
        if (parseInt(resourceId) !== currentUser.resourceId) {
            console.warn('Expert ne peut modifier que sa propre ligne');
            closeLocalisationModal();
            return;
        }
    }

    const key = period ? `${resourceId}_localisation_${dateKey}_${period}` : `${resourceId}_localisation_${dateKey}`;
    scheduleData[key] = localisation;

    // ========== MISE À JOUR DE PENDINGASSIGNMENTS ==========
    // Si c'est une affectation (activity >= 3), mettre à jour pendingAssignments
    const activityKey = period ? `${resourceId}_activity_${dateKey}_${period}` : `${resourceId}_activity_${dateKey}`;
    const currentActivity = scheduleData[activityKey];

    // Si l'activité est une affectation (3-13)
    if (currentActivity && parseInt(currentActivity) >= 3) {
        // Appeler trackAssignment pour mettre à jour les données (tous les profils)
        if (currentUser) {
            trackAssignment(resourceId, dateKey, period, currentActivity, localisation);
        }
    }
    // ========== FIN MISE À JOUR ==========

    saveSchedule();
    closeLocalisationModal();
    updateGantt();
}
