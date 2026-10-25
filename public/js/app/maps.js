// Application principale : maps
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== CARTE ÉVÉNEMENTS/DÉPLACEMENTS ==========

let eventsMap = null;
let eventsMapMarkers = [];
let mapSelectedParticipants = []; // [{id, nom, prenom}]

function initEventsMap() {
    if (eventsMap) return;

    // Date de début par défaut : 1er janvier de l'année en cours
    const startEl = document.getElementById('mapStartDate');
    if (startEl && !startEl.value) {
        startEl.value = `${new Date().getFullYear()}-01-01`;
    }

    if (!window.L) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        script.onload = () => {
            _createMap();
            loadEventsMap();
        };
        document.head.appendChild(script);
    } else {
        _createMap();
        loadEventsMap();
    }
}

function _createMap() {
    eventsMap = L.map('eventsMapContainer', { zoomControl: true }).setView([46.6, 2.3], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(eventsMap);
    populateMapLocationFilter();
}

function populateMapLocationFilter() {
    const sel = document.getElementById('mapLocationFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Toutes les localisations —</option>';
    allLocations
        .filter(l => l.latitude && l.longitude)
        .forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.libelle_court} – ${l.libelle_long}`;
            sel.appendChild(opt);
        });
}

// ── Tag-input participants pour la carte ──
function renderMapParticipantTags() {
    const container = document.getElementById('mapParticipantsContainer');
    const input = document.getElementById('mapParticipantInput');
    if (!container || !input) return;
    // Supprimer les tags existants
    container.querySelectorAll('.map-participant-tag').forEach(t => t.remove());
    mapSelectedParticipants.forEach((p, i) => {
        const tag = document.createElement('span');
        tag.className = 'map-participant-tag';
        tag.style.cssText =
            'background:#3f51b5;color:white;border-radius:10px;padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:4px;white-space:nowrap;';
        tag.innerHTML = `${p.prenom} ${(p.nom || '').toUpperCase()} <span onclick="removeMapParticipant(${i})" style="cursor:pointer;font-size:14px;line-height:1;">&times;</span>`;
        container.insertBefore(tag, input);
    });
}

function removeMapParticipant(i) {
    mapSelectedParticipants.splice(i, 1);
    renderMapParticipantTags();
}

function addMapParticipant(user) {
    if (mapSelectedParticipants.find(p => p.id === user.id)) return;
    mapSelectedParticipants.push(user);
    renderMapParticipantTags();
    document.getElementById('mapParticipantInput').value = '';
    document.getElementById('mapParticipantDropdown').style.display = 'none';
}

function filterMapParticipants(query) {
    const dropdown = document.getElementById('mapParticipantDropdown');
    if (!dropdown) return;
    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    const q = query.toLowerCase();
    const matched = users
        .filter(u => {
            const full = `${u.prenom || ''} ${u.nom || ''} ${u.email || ''}`.toLowerCase();
            return full.includes(q) && !mapSelectedParticipants.find(p => p.id === u.id);
        })
        .slice(0, 8);
    if (matched.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = matched
        .map(u => {
            const name = `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim() || u.username;
            return `<div onclick='addMapParticipant(${JSON.stringify({ id: u.id, nom: u.nom || '', prenom: u.prenom || '' })})' style="padding:8px 12px;cursor:pointer;font-size:12px;" onmouseover="this.style.background='#f5f5f5'" onmouseleave="this.style.background='white'">${name}</div>`;
        })
        .join('');
    dropdown.style.display = 'block';
}

function handleMapParticipantKeydown(e) {
    if (e.key === 'Backspace' && e.target.value === '' && mapSelectedParticipants.length > 0) {
        mapSelectedParticipants.pop();
        renderMapParticipantTags();
    }
    if (e.key === 'Escape') document.getElementById('mapParticipantDropdown').style.display = 'none';
}

document.addEventListener('click', function (e) {
    const container = document.getElementById('mapParticipantsContainer');
    const dropdown = document.getElementById('mapParticipantDropdown');
    if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

async function loadEventsMap() {
    if (!eventsMap) {
        initEventsMap();
        return;
    }

    const startDate = document.getElementById('mapStartDate').value;
    const endDate = document.getElementById('mapEndDate').value;
    const locFilter = document.getElementById('mapLocationFilter').value;

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
        const res = await fetch(`${API_URL}/reporting/events-map?${params}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        let events = data.events || [];

        // Filtre localisation
        if (locFilter) events = events.filter(e => e.location_id == locFilter);

        // Filtre participants (client-side)
        if (mapSelectedParticipants.length > 0) {
            events = events.filter(ev => {
                const partIds = ev.participants_ids || [];
                const partNames = (ev.participants || []).map(n => n.toLowerCase());
                return mapSelectedParticipants.every(sel => {
                    const selName = `${sel.prenom || ''} ${(sel.nom || '').toUpperCase()}`.trim().toLowerCase();
                    return partNames.some(n => n.includes(selName) || selName.includes(n));
                });
            });
        }

        renderMapMarkers(events);
    } catch (e) {
        console.error('Erreur chargement carte événements:', e);
    }
}

function renderMapMarkers(events) {
    eventsMapMarkers.forEach(m => eventsMap.removeLayer(m));
    eventsMapMarkers = [];

    const countEl = document.getElementById('mapEventCount');
    if (countEl)
        countEl.textContent =
            events.length > 0
                ? `${events.length} événement(s) affiché(s)`
                : 'Aucun événement géolocalisé sur cette période.';

    if (events.length === 0) {
        document.getElementById('eventsMapLegend').style.display = 'none';
        return;
    }

    // Grouper par localisation
    const byLoc = {};
    events.forEach(e => {
        const key = `${e.location_id}`;
        if (!byLoc[key])
            byLoc[key] = {
                lat: e.latitude,
                lng: e.longitude,
                libelle: e.libelle_court,
                adresse: e.adresse,
                events: []
            };
        byLoc[key].events.push(e);
    });

    const bounds = [];

    Object.values(byLoc).forEach(loc => {
        const count = loc.events.length;
        const icon = L.divIcon({
            className: '',
            html: `<div style="background:#3f51b5;color:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;">${count}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18]
        });

        let popupHtml = `<div style="max-height:300px;overflow-y:auto;">
                    <div style="font-weight:bold;color:#283593;font-size:13px;margin-bottom:6px;border-bottom:1px solid #e0e0e0;padding-bottom:4px;">📍 ${loc.libelle}</div>
                    ${loc.adresse ? `<div style="color:#555;font-size:11px;margin-bottom:8px;">${loc.adresse}</div>` : ''}
                    <div style="font-size:11px;color:#3f51b5;font-weight:bold;margin-bottom:6px;">${count} événement(s)</div>`;

        loc.events.forEach(ev => {
            const dateRange =
                ev.end_date && ev.end_date !== ev.start_date
                    ? `${formatDateFRClient(ev.start_date)} → ${formatDateFRClient(ev.end_date)}`
                    : formatDateFRClient(ev.start_date);
            const period = ev.period === 'AM' ? ' ☀️ Matin' : ev.period === 'PM' ? ' 🌙 Après-midi' : '';
            const parts =
                ev.participants && ev.participants.length > 0
                    ? `<div style="color:#777;margin-top:2px;">👥 ${ev.participants.join(', ')}</div>`
                    : '';
            const creator = ev.creator_prenom
                ? `<div style="color:#999;font-size:10px;">${ev.creator_prenom} ${(ev.creator_nom || '').toUpperCase()}</div>`
                : '';
            popupHtml += `<div style="border:1px solid #e8eaf6;border-radius:5px;padding:7px;margin-bottom:6px;background:#fafafa;">
                        <div style="font-weight:bold;color:#1565c0;">${evtIconFor(ev, 13)}${evtEsc(evtShown(ev))}${period}</div>${evtHasType(ev) && ev.label && ev.label !== evtShown(ev) ? `<div style="font-size:11px;color:#555;">${evtEsc(ev.label)}</div>` : ''}
                        <div style="color:#555;margin-top:2px;">📅 ${dateRange}</div>
                        ${parts}${creator}
                    </div>`;
        });
        popupHtml += '</div>';

        const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(eventsMap).bindPopup(popupHtml, { maxWidth: 300 });

        eventsMapMarkers.push(marker);
        bounds.push([loc.lat, loc.lng]);
    });

    if (bounds.length > 0) eventsMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });

    const legend = document.getElementById('eventsMapLegend');
    const legendItems = document.getElementById('eventsMapLegendItems');
    if (legend && legendItems) {
        legendItems.innerHTML = Object.values(byLoc)
            .map(
                loc =>
                    `<span style="background:#e8eaf6;border:1px solid #9fa8da;border-radius:12px;padding:2px 10px;white-space:nowrap;"><strong>${loc.libelle}</strong> — ${loc.events.length} evt</span>`
            )
            .join('');
        legend.style.display = 'block';
    }
}

function formatDateFRClient(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function resetMapFilters() {
    document.getElementById('mapStartDate').value = `${new Date().getFullYear()}-01-01`;
    document.getElementById('mapEndDate').value = '';
    document.getElementById('mapLocationFilter').value = '';
    mapSelectedParticipants = [];
    renderMapParticipantTags();
    if (eventsMap) loadEventsMap();
}

// ========== FIN CARTE ÉVÉNEMENTS/DÉPLACEMENTS ==========

// ========== MODALE CARTE (depuis Planification → Gérer mes événements) ==========

let eventModalMap = null;
let eventModalMapMarkers = [];
let modalMapSelectedParticipants = [];

function openEventMapModal() {
    const modal = document.getElementById('eventMapModal');
    if (!modal) return;
    modal.style.display = 'block';

    // Date de début par défaut : 1er janvier de l'année en cours
    const startEl = document.getElementById('modalMapStartDate');
    if (startEl && !startEl.value) startEl.value = `${new Date().getFullYear()}-01-01`;

    // Peupler le filtre localisations
    const sel = document.getElementById('modalMapLocationFilter');
    if (sel) {
        sel.innerHTML = '<option value="">— Toutes les localisations —</option>';
        allLocations
            .filter(l => l.latitude && l.longitude)
            .forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = `${l.libelle_court} – ${l.libelle_long}`;
                sel.appendChild(opt);
            });
    }

    // Initialiser la carte Leaflet
    if (!window.L) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        script.onload = () => {
            _createModalMap();
            loadModalEventsMap();
        };
        document.head.appendChild(script);
    } else {
        if (!eventModalMap) _createModalMap();
        else eventModalMap.invalidateSize();
        loadModalEventsMap();
    }
}

function _createModalMap() {
    eventModalMap = L.map('eventMapModalContainer', { zoomControl: true }).setView([46.6, 2.3], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(eventModalMap);
}

function closeEventMapModal() {
    if (window.MapTimelapse) MapTimelapse.reset();
    document.getElementById('eventMapModal').style.display = 'none';
}

let _expertsMapData = null;
let _showExpertMarkers = true;

function toggleExpertsMapLayer() {
    _showExpertMarkers = !_showExpertMarkers;
    const btn = document.getElementById('toggleExpertsMapBtn');
    if (btn) {
        btn.textContent = `👤 Experts : ${_showExpertMarkers ? 'ON' : 'OFF'}`;
        btn.style.background = _showExpertMarkers ? '#6a1b9a' : '#90a4ae';
    }
    if (eventModalMap && eventModalMapMarkers.length > 0) {
        // Re-render sans recharger les données
        renderModalMapMarkers(
            window.MapTimelapse ? MapTimelapse.visibleEvents(_lastMapEvents || []) : _lastMapEvents || [],
            _showExpertMarkers ? _expertsMapData || [] : [],
            { noFit: true }
        );
    }
}

let _lastMapEvents = [];

async function loadModalEventsMap() {
    if (!eventModalMap) return;
    if (window.MapTimelapse) MapTimelapse.reset();

    const startDate = document.getElementById('modalMapStartDate').value;
    const endDate = document.getElementById('modalMapEndDate').value;
    const locFilter = document.getElementById('modalMapLocationFilter').value;

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
        // Toujours recharger les experts à chaque ouverture de la modale
        const [evRes, expRes] = await Promise.all([
            fetch(`${API_URL}/reporting/events-map?${params}`, { credentials: 'include' }),
            fetch(`${API_URL}/resources/experts-map`, { credentials: 'include' })
        ]);
        if (!evRes.ok) return;
        if (expRes.ok) {
            const rawExperts = await expRes.json();
            // Matching : samu de la ressource (ex: "SAMU-SAS 07") = libelle_court de la localisation
            const norm = s => (s || '').toUpperCase().trim();
            _expertsMapData = rawExperts
                .map(exp => {
                    const samuNorm = norm(exp.samu);
                    const loc = (allLocations || []).find(
                        l => l.latitude && l.longitude && norm(l.libelle_court) === samuNorm
                    );
                    if (loc)
                        return {
                            ...exp,
                            latitude: loc.latitude,
                            longitude: loc.longitude,
                            libelle_court: loc.libelle_court,
                            adresse: loc.adresse
                        };
                    return null;
                })
                .filter(Boolean);
        }

        let events = (await evRes.json()).events || [];
        if (locFilter) events = events.filter(e => e.location_id == locFilter);

        // Filtre par type d'événement (libellé long du type ; « Sans type » pour les événements non repris)
        const labelSel = document.getElementById('modalMapLabelFilter');
        if (labelSel) {
            const typeOf = e => e.type_long || 'Sans type';
            const currentLabelVal = labelSel.value;
            const uniqueTypes = [...new Set(events.map(typeOf))].sort((a, b) => a.localeCompare(b, 'fr'));
            labelSel.innerHTML =
                '<option value="">— Tous les types —</option>' +
                uniqueTypes
                    .map(
                        l =>
                            `<option value="${evtEsc(l)}"${l === currentLabelVal ? ' selected' : ''}>${evtEsc(l)}</option>`
                    )
                    .join('');
            const labelFilter = labelSel.value;
            if (labelFilter) events = events.filter(e => typeOf(e) === labelFilter);
        }

        if (modalMapSelectedParticipants.length > 0) {
            const normStr = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            events = events.filter(ev => {
                return modalMapSelectedParticipants.every(sel => {
                    const selName = normStr(`${sel.prenom || ''} ${sel.nom || ''}`);
                    const inInternal = (ev.participants || []).some(
                        p =>
                            normStr(`${p.prenom || ''} ${p.nom || ''}`).includes(selName) ||
                            normStr(p.nom || '').includes(selName)
                    );
                    const inExternal = (ev.external_participants || []).some(
                        p =>
                            normStr(`${p.prenom || ''} ${p.nom || ''}`).includes(selName) ||
                            normStr(p.email || '').includes(selName)
                    );
                    return inInternal || inExternal;
                });
            });
        }

        _lastMapEvents = events;
        renderModalMapMarkers(events, _showExpertMarkers ? _expertsMapData || [] : []);
        setTimeout(() => eventModalMap.invalidateSize(), 50);
    } catch (e) {
        console.error('Erreur chargement carte modale:', e);
    }
}

function renderModalMapMarkers(events, experts = [], opts = {}) {
    const popKeys = opts.pop || new Set();
    eventModalMapMarkers.forEach(m => eventModalMap.removeLayer(m));
    eventModalMapMarkers = [];

    // Pastilles experts par ES de rattachement
    const byES = {};
    experts.forEach(exp => {
        const key = `${exp.latitude}_${exp.longitude}`;
        if (!byES[key])
            byES[key] = {
                lat: exp.latitude,
                lng: exp.longitude,
                libelle: exp.libelle_court || exp.es_rattachement,
                adresse: exp.adresse,
                experts: []
            };
        byES[key].experts.push(exp);
    });
    Object.values(byES).forEach(loc => {
        const exps = loc.experts;
        exps.forEach((exp, i) => {
            // Décaler les experts : légèrement au sud + étalement horizontal pour éviter la superposition avec les pastilles d'événements
            const offsetLat = -0.025;
            const offsetLng = (i - (exps.length - 1) / 2) * 0.04;
            const initials = `${(exp.prenom || '')[0] || ''}${(exp.nom || '')[0] || ''}`.toUpperCase();
            const photoHtml = exp.profile_photo
                ? `<img src="${exp.profile_photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:#6a1b9a;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;">${initials}</div>`;
            const icon = L.divIcon({
                className: '',
                html: `<div style="position:relative;cursor:pointer;">
                            <div style="width:40px;height:40px;border-radius:50%;overflow:visible;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:3px solid #6a1b9a;background:white;">${photoHtml}</div>
                            <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);background:#6a1b9a;color:white;font-size:9px;font-weight:bold;padding:1px 4px;border-radius:3px;white-space:nowrap;">${exp.trigramme || initials}</div>
                        </div>`,
                iconSize: [40, 56],
                iconAnchor: [20, 20],
                popupAnchor: [0, -24]
            });
            const popupHtml = `<div style="min-width:160px;">
                        <div style="font-weight:bold;color:#6a1b9a;font-size:13px;margin-bottom:4px;">👤 ${exp.prenom} ${exp.nom}</div>
                        <div style="font-size:11px;color:#555;">🏥 ${exp.es_rattachement}</div>
                        ${exp.samu ? `<div style="font-size:11px;color:#555;">🚑 ${exp.samu}</div>` : ''}
                    </div>`;
            // zIndexOffset négatif : experts toujours sous les pastilles d'événements
            const marker = L.marker([exp.latitude + offsetLat, exp.longitude + offsetLng], { icon, zIndexOffset: -100 })
                .addTo(eventModalMap)
                .bindPopup(popupHtml, { maxWidth: 220 });
            eventModalMapMarkers.push(marker);
        });
    });

    const countEl = document.getElementById('modalMapEventCount');
    if (countEl)
        countEl.textContent = events.length > 0 ? `${events.length} événement(s)` : 'Aucun événement géolocalisé.';

    const legend = document.getElementById('modalMapLegend');
    const legendItems = document.getElementById('modalMapLegendItems');
    if (events.length === 0) {
        if (legend) legend.style.display = 'none';
        return;
    }

    const byLoc = {};
    events.forEach(e => {
        const key = `${e.location_id}`;
        if (!byLoc[key])
            byLoc[key] = {
                key,
                lat: e.latitude,
                lng: e.longitude,
                libelle: e.libelle_court,
                adresse: e.adresse,
                events: []
            };
        byLoc[key].events.push(e);
    });

    const bounds = [];
    Object.values(byLoc).forEach(loc => {
        const count = loc.events.length;
        const icon = L.divIcon({
            className: '',
            html: `<div style="${popKeys.has(loc.key) ? 'animation:gpPinPop .7s ease-out;' : ''}background:#3f51b5;color:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;">${count}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18]
        });

        let popupHtml = `<div style="max-height:280px;overflow-y:auto;">
                    <div style="font-weight:bold;color:#283593;font-size:13px;margin-bottom:6px;border-bottom:1px solid #e0e0e0;padding-bottom:4px;">📍 ${loc.libelle}</div>
                    ${loc.adresse ? `<div style="color:#555;font-size:11px;margin-bottom:8px;">${loc.adresse}</div>` : ''}
                    <div style="font-size:11px;color:#3f51b5;font-weight:bold;margin-bottom:6px;">${count} événement(s)</div>`;

        loc.events.forEach(ev => {
            const dateRange =
                ev.end_date && ev.end_date !== ev.start_date
                    ? `${formatDateFRClient(ev.start_date)} → ${formatDateFRClient(ev.end_date)}`
                    : formatDateFRClient(ev.start_date);
            const period = ev.period === 'AM' ? ' ☀️' : ev.period === 'PM' ? ' 🌙' : '';
            const parts =
                ev.participants && ev.participants.length > 0
                    ? `<div style="color:#777;margin-top:2px;font-size:10px;">👥 ${ev.participants.join(', ')}</div>`
                    : '';
            let evCfg = {};
            try {
                evCfg = ev.config ? (typeof ev.config === 'string' ? JSON.parse(ev.config) : ev.config) : {};
            } catch (e) {}
            const badgeBg = evCfg.bgColor || '#3f51b5';
            const badgeText = evCfg.textColor || '#ffffff';
            const badgeBorder = evCfg.borderColor || badgeBg;
            const badge = `<div style="flex-shrink:0;width:12px;border-radius:3px;background:${badgeBg};border:2px solid ${badgeBorder};align-self:stretch;"></div>`;
            popupHtml += `<div style="border:1px solid #e8eaf6;border-radius:5px;padding:7px;margin-bottom:6px;background:#fafafa;display:flex;gap:7px;align-items:flex-start;">
                        ${badge}
                        <div style="flex:1;">
                            <div style="font-weight:bold;color:${badgeBg === '#ffffff' || badgeBg === '#fff' ? '#333' : badgeBg};">${evtIconFor(ev, 13)}${evtEsc(evtShown(ev))}${period}</div>${evtHasType(ev) && ev.label && ev.label !== evtShown(ev) ? `<div style="font-size:11px;color:#555;">${evtEsc(ev.label)}</div>` : ''}
                            <div style="color:#555;margin-top:2px;font-size:11px;">📅 ${dateRange}</div>${parts}
                        </div>
                    </div>`;
        });
        popupHtml += '</div>';

        const marker = L.marker([loc.lat, loc.lng], { icon })
            .addTo(eventModalMap)
            .bindPopup(popupHtml, { maxWidth: 300 });
        eventModalMapMarkers.push(marker);
        bounds.push([loc.lat, loc.lng]);
    });

    if (bounds.length > 0 && !opts.noFit) eventModalMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });

    if (legend && legendItems) {
        legendItems.innerHTML = Object.values(byLoc)
            .map(
                loc =>
                    `<span style="background:#e8eaf6;border:1px solid #9fa8da;border-radius:12px;padding:2px 10px;white-space:nowrap;"><strong>${loc.libelle}</strong> — ${loc.events.length} evt</span>`
            )
            .join('');
        legend.style.display = 'block';
    }
}

function resetModalMapFilters() {
    document.getElementById('modalMapStartDate').value = `${new Date().getFullYear()}-01-01`;
    document.getElementById('modalMapEndDate').value = '';
    document.getElementById('modalMapLocationFilter').value = '';
    const lf = document.getElementById('modalMapLabelFilter');
    if (lf) lf.value = '';
    modalMapSelectedParticipants = [];
    renderModalMapParticipantTags();
    if (eventModalMap) loadModalEventsMap();
}

// Tag-input participants (modal carte)
function renderModalMapParticipantTags() {
    const container = document.getElementById('modalMapParticipantsContainer');
    const input = document.getElementById('modalMapParticipantInput');
    if (!container || !input) return;
    container.querySelectorAll('.modal-map-tag').forEach(t => t.remove());
    modalMapSelectedParticipants.forEach((p, i) => {
        const tag = document.createElement('span');
        tag.className = 'modal-map-tag';
        const label = p.external
            ? p.email || `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || '?'
            : `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
        const bg = p.external ? '#78909c' : '#3f51b5';
        tag.style.cssText = `background:${bg};color:white;border-radius:10px;padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:4px;white-space:nowrap;`;
        tag.innerHTML = `${p.external ? '✉ ' : ''}${label} <span onclick="removeModalMapParticipant(${i})" style="cursor:pointer;font-size:14px;line-height:1;">&times;</span>`;
        container.insertBefore(tag, input);
    });
}

function removeModalMapParticipant(i) {
    modalMapSelectedParticipants.splice(i, 1);
    renderModalMapParticipantTags();
}

function addModalMapParticipant(participant) {
    if (!participant.external && modalMapSelectedParticipants.find(p => !p.external && p.id === participant.id)) return;
    modalMapSelectedParticipants.push(participant);
    renderModalMapParticipantTags();
    document.getElementById('modalMapParticipantInput').value = '';
    document.getElementById('modalMapParticipantDropdown').style.display = 'none';
}

function filterModalMapParticipants(query) {
    const dropdown = document.getElementById('modalMapParticipantDropdown');
    if (!dropdown) return;
    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normStr = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Utilisateurs enregistrés
    const matchedUsers = users
        .filter(u => {
            const full = normStr(`${u.prenom || ''} ${u.nom || ''} ${u.email || ''}`);
            return full.includes(q) && !modalMapSelectedParticipants.find(p => !p.external && p.id === u.id);
        })
        .slice(0, 6);

    // Invités externes depuis les événements de la carte (dédupliqués)
    const extSeen = new Set();
    const matchedExternal = [];
    (_lastMapEvents || []).forEach(ev => {
        (ev.external_participants || []).forEach(p => {
            const label = p.email || `${p.prenom || ''} ${p.nom || ''}`.trim();
            if (!label || extSeen.has(label)) return;
            if (!normStr(label).includes(q) && !normStr(`${p.prenom || ''} ${p.nom || ''}`).includes(q)) return;
            if (
                modalMapSelectedParticipants.find(
                    s => s.external && (s.email === p.email || (s.nom === p.nom && s.prenom === p.prenom))
                )
            )
                return;
            extSeen.add(label);
            matchedExternal.push(p);
        });
    });

    let html = '';
    html += matchedUsers
        .map(u => {
            const name = `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim() || u.username;
            return `<div onclick='addModalMapParticipant(${JSON.stringify({ id: u.id, nom: u.nom || '', prenom: u.prenom || '' })})' style="padding:8px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px;" onmouseover="this.style.background='#f5f5f5'" onmouseleave="this.style.background='white'">
                    <span style="width:22px;height:22px;border-radius:50%;background:#3f51b5;color:white;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0;">${((u.prenom || '')[0] || '').toUpperCase()}${((u.nom || '')[0] || '').toUpperCase()}</span>
                    ${name}
                </div>`;
        })
        .join('');
    html += matchedExternal
        .slice(0, 4)
        .map(p => {
            const label = p.email || `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim() || '?';
            const payload = JSON.stringify({
                external: true,
                nom: p.nom || '',
                prenom: p.prenom || '',
                email: p.email || ''
            });
            return `<div onclick='addModalMapParticipant(${payload})' style="padding:8px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px;border-top:1px dashed #e0e0e0;" onmouseover="this.style.background='#eceff1'" onmouseleave="this.style.background='white'">
                    <span style="width:22px;height:22px;border-radius:50%;background:#78909c;color:white;display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">✉</span>
                    <span style="color:#546e7a;">${label}</span>
                </div>`;
        })
        .join('');

    if (!html) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function handleModalMapParticipantKeydown(e) {
    if (e.key === 'Backspace' && e.target.value === '' && modalMapSelectedParticipants.length > 0) {
        modalMapSelectedParticipants.pop();
        renderModalMapParticipantTags();
    }
    if (e.key === 'Escape') document.getElementById('modalMapParticipantDropdown').style.display = 'none';
}

document.addEventListener('click', function (e) {
    const c = document.getElementById('modalMapParticipantsContainer');
    const d = document.getElementById('modalMapParticipantDropdown');
    if (d && c && !c.contains(e.target) && !d.contains(e.target)) d.style.display = 'none';
});

// ========== FIN MODALE CARTE ==========

// ── Toggle sections Reporting ──────────────────────────────────────
function toggleReportingSection(bodyId, iconId) {
    const body = document.getElementById(bodyId);
    const icon = document.getElementById(iconId);
    if (!body || !icon) return;
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = '▼';
    } else {
        body.style.display = 'none';
        icon.textContent = '▶';
    }
}

// ── Toggle formulaire d'ajout dans myEventsModal ──────────────────
function toggleMyEventForm() {
    const body = document.getElementById('myEventFormBody');
    const icon = document.getElementById('myEventFormIcon');
    if (!body || !icon) return;
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = '▼';
    } else {
        body.style.display = 'none';
        icon.textContent = '▶';
        // Si on replie en mode modification, réinitialiser le bouton
        const addBtn = document.getElementById('myEventActionBtn');
        if (addBtn && addBtn.textContent.includes('Modifier')) {
            addBtn.textContent = '➕ Ajouter';
            addBtn.onclick = addMyEvent;
            editingMyEventId = null;
        }
    }
}

// ── Suivi des événements — participants tag-input ──────────────────
let eventsReportingSelectedParticipants = [];

function filterEventsReportingParticipants(query) {
    const dropdown = document.getElementById('eventsReportingParticipantDropdown');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();
    const selectedIds = new Set(eventsReportingSelectedParticipants.map(p => p.id));
    const filtered = users
        .filter(u => {
            if (selectedIds.has(u.id)) return false;
            if (!q) return true;
            const fullName = `${u.prenom || ''} ${u.nom || ''}`.toLowerCase();
            const email = (u.email || '').toLowerCase();
            return fullName.includes(q) || email.includes(q);
        })
        .slice(0, 8);
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = filtered
        .map(u => {
            const displayName = `${u.prenom || ''} ${(u.nom || '').toUpperCase()}`.trim() || u.username;
            const initials = ((u.prenom || '')[0] || '').toUpperCase() + ((u.nom || '')[0] || '').toUpperCase();
            const colors = ['#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#ff9800'];
            let h = 0;
            for (let i = 0; i < displayName.length; i++) h = displayName.charCodeAt(i) + ((h << 5) - h);
            const color = colors[Math.abs(h) % colors.length];
            return `<div onclick='addEventsReportingParticipant(${JSON.stringify({ id: u.id, nom: u.nom || '', prenom: u.prenom || '' })})' style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f5f5f5;" onmouseenter="this.style.background='#f5f5f5'" onmouseleave="this.style.background='white'">
                    <span style="width:28px;height:28px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;flex-shrink:0;">${initials}</span>
                    <span style="font-size:13px;">${displayName}</span>
                </div>`;
        })
        .join('');
    dropdown.style.display = 'block';
}

function addEventsReportingParticipant(user) {
    if (eventsReportingSelectedParticipants.some(p => p.id === user.id)) return;
    eventsReportingSelectedParticipants.push(user);
    renderEventsReportingParticipantTags();
    const input = document.getElementById('eventsReportingParticipantInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    document.getElementById('eventsReportingParticipantDropdown').style.display = 'none';
}

function removeEventsReportingParticipant(userId) {
    eventsReportingSelectedParticipants = eventsReportingSelectedParticipants.filter(p => p.id !== userId);
    renderEventsReportingParticipantTags();
}

function renderEventsReportingParticipantTags() {
    const container = document.getElementById('eventsReportingParticipantsContainer');
    const input = document.getElementById('eventsReportingParticipantInput');
    if (!container || !input) return;
    container.querySelectorAll('.participant-tag').forEach(t => t.remove());
    eventsReportingSelectedParticipants.forEach(p => {
        const tag = document.createElement('span');
        tag.className = 'participant-tag';
        const displayName = `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim();
        const initials = ((p.prenom || '')[0] || '').toUpperCase() + ((p.nom || '')[0] || '').toUpperCase();
        const colors = ['#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#ff9800'];
        let h = 0;
        for (let i = 0; i < displayName.length; i++) h = displayName.charCodeAt(i) + ((h << 5) - h);
        const color = colors[Math.abs(h) % colors.length];
        tag.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:#f0f0f0;border:1px solid #ddd;border-radius:15px;padding:2px 8px 2px 2px;font-size:11px;white-space:nowrap;">
                    <span style="width:20px;height:20px;border-radius:50%;background:${color};color:white;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;">${initials}</span>
                    <span style="color:#333;">${displayName}</span>
                    <span onclick="removeEventsReportingParticipant(${p.id})" style="cursor:pointer;color:#999;font-size:14px;line-height:1;margin-left:2px;" title="Retirer">&times;</span>
                </span>`;
        container.insertBefore(tag, input);
    });
}

function handleEventsReportingParticipantKeydown(e) {
    if (e.key === 'Backspace' && e.target.value === '' && eventsReportingSelectedParticipants.length > 0) {
        eventsReportingSelectedParticipants.pop();
        renderEventsReportingParticipantTags();
    }
    if (e.key === 'Escape') {
        document.getElementById('eventsReportingParticipantDropdown').style.display = 'none';
    }
}

document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('eventsReportingParticipantDropdown');
    const container = document.getElementById('eventsReportingParticipantsContainer');
    if (dropdown && container && !container.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// ── Suivi des événements — génération du rapport ───────────────────
async function generateEventsReporting() {
    const startDate = document.getElementById('eventsReportingStart').value;
    const endDate = document.getElementById('eventsReportingEnd').value;
    const label = document.getElementById('eventsReportingLabel').value;
    const participantIds = eventsReportingSelectedParticipants.map(p => p.id).join(',');

    const resultsDiv = document.getElementById('eventsReportingResults');
    resultsDiv.innerHTML = '<p style="text-align:center;color:#999;padding:30px;">⏳ Chargement...</p>';
    document.getElementById('eventsReportingExportButtons').style.display = 'none';

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (label.trim()) params.set('label', label.trim());
    if (participantIds) params.set('participantIds', participantIds);

    try {
        const response = await fetch(`${API_URL}/custom-events/search?${params.toString()}`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Erreur serveur');

        const events = data.events || [];
        if (events.length === 0) {
            resultsDiv.innerHTML =
                '<p style="text-align:center;color:#999;padding:40px;">Aucun événement trouvé pour ces critères.</p>';
            return;
        }

        // Construire le tableau
        let html = `<p style="font-size:12px;color:#555;margin-bottom:10px;"><strong>${events.length}</strong> événement(s) trouvé(s)</p>`;
        html += `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr style="background:#1976d2;color:white;">
                        <th style="padding:8px;text-align:left;border:1px solid #ccc;">Libellé</th>
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;">Date début</th>
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;">Date fin</th>
                        <th style="padding:8px;text-align:center;border:1px solid #ccc;">Période</th>
                        <th style="padding:8px;text-align:left;border:1px solid #ccc;">Créateur</th>
                        <th style="padding:8px;text-align:left;border:1px solid #ccc;">Participant(s)</th>
                    </tr></thead><tbody>`;

        const formatDate = d => {
            if (!d) return '-';
            const [y, m, j] = d.split('-');
            return `${j}/${m}/${y}`;
        };
        const periodLabel = p => (p === 'AM' ? '☀️ Matin' : p === 'PM' ? '🌙 Après-midi' : 'Journée entière');

        events.forEach((evt, i) => {
            const cfg = evt.config ? (typeof evt.config === 'string' ? JSON.parse(evt.config) : evt.config) : {};
            const badge = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;background:${cfg.bgColor || '#ffeb3b'};color:${cfg.textColor || '#000'};border:1px solid ${cfg.borderColor || '#ccc'};">${evt.label}</span>`;
            const creator =
                [evt.creator_prenom, (evt.creator_nom || '').toUpperCase()].filter(Boolean).join(' ') || '—';
            const parts =
                (evt.participants || [])
                    .map(p => `${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim())
                    .join(', ') || '—';
            const isSameDay = evt.start_date === evt.end_date;
            const periodCell = isSameDay ? periodLabel(evt.period) : '—';
            html += `<tr style="background:${i % 2 === 0 ? 'white' : '#f5f5f5'};border-bottom:1px solid #eee;">
                        <td style="padding:8px;border:1px solid #eee;">${badge}</td>
                        <td style="padding:8px;text-align:center;border:1px solid #eee;">${formatDate(evt.start_date)}</td>
                        <td style="padding:8px;text-align:center;border:1px solid #eee;">${formatDate(evt.end_date)}</td>
                        <td style="padding:8px;text-align:center;border:1px solid #eee;font-size:11px;color:#666;">${periodCell}</td>
                        <td style="padding:8px;border:1px solid #eee;">${creator}</td>
                        <td style="padding:8px;border:1px solid #eee;">${parts}</td>
                    </tr>`;
        });
        html += '</tbody></table>';
        resultsDiv.innerHTML = html;
        document.getElementById('eventsReportingExportButtons').style.display = 'flex';
    } catch (error) {
        console.error('Erreur suivi événements:', error);
        resultsDiv.innerHTML = `<p style="color:#e74c3c;text-align:center;padding:30px;">Erreur : ${error.message}</p>`;
    }
}

function resetEventsReportingFilters() {
    document.getElementById('eventsReportingStart').value = '';
    document.getElementById('eventsReportingEnd').value = '';
    document.getElementById('eventsReportingLabel').value = '';
    eventsReportingSelectedParticipants = [];
    renderEventsReportingParticipantTags();
    document.getElementById('eventsReportingResults').innerHTML =
        '<p style="text-align:center;color:#999;padding:40px;">Définissez vos critères et cliquez sur "Générer"</p>';
    document.getElementById('eventsReportingExportButtons').style.display = 'none';
}

function exportEventsReportingToCSV() {
    const table = document.querySelector('#eventsReportingResults table');
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const csv = rows
        .map(row =>
            Array.from(row.querySelectorAll('th, td'))
                .map(cell => {
                    const text = cell.innerText.replace(/"/g, '""').replace(/\n/g, ' ').trim();
                    return `"${text}"`;
                })
                .join(';')
        )
        .join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `suivi_evenements_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function togglePlanningSection(sectionId) {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(sectionId + 'Icon');

    if (!section || !icon) return;

    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.textContent = '▼';
        // Afficher les contrôles de l'en-tête Planification
        if (sectionId === 'ganttDisplaySection') {
            const ctrl = document.getElementById('ganttHeaderControls');
            const btns = document.getElementById('ganttHeaderButtons');
            if (ctrl) ctrl.style.display = 'flex';
            if (btns) btns.style.display = 'flex';
        }
    } else {
        section.style.display = 'none';
        icon.textContent = '▶';
        // Masquer les contrôles de l'en-tête Planification
        if (sectionId === 'ganttDisplaySection') {
            const ctrl = document.getElementById('ganttHeaderControls');
            const btns = document.getElementById('ganttHeaderButtons');
            if (ctrl) ctrl.style.display = 'none';
            if (btns) btns.style.display = 'none';
        }
    }
}
