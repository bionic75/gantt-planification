// Application principale : realtime
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== GESTION DES UTILISATEURS CONNECTÉS EN TEMPS RÉEL ==========

let onlineUsersInterval = null;
let onlineUsersTooltipVisible = false;

// Charger et afficher les utilisateurs connectés
async function loadOnlineUsers() {
    try {
        const response = await fetch(`${API_URL}/active-sessions`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            renderOnlineUsers(data.activeUsers || []);
        }
    } catch (error) {
        console.error('Erreur chargement utilisateurs connectés:', error);
    }
}

// Afficher les avatars des utilisateurs connectés
function renderOnlineUsers(users) {
    const container = document.getElementById('onlineUsersContainer');
    const avatarsDiv = document.getElementById('onlineUsersAvatars');
    const countSpan = document.getElementById('onlineUsersCount');

    if (!container || !avatarsDiv) return;

    // Filtrer l'utilisateur courant si besoin (optionnel - on peut le garder)
    const filteredUsers = users.filter(u => u.userId !== currentUser?.id);

    if (users.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    // Afficher max 5 avatars, le reste en compteur
    const maxVisible = 5;
    const visibleUsers = users.slice(0, maxVisible);
    const extraCount = users.length - maxVisible;

    let html = '';
    visibleUsers.forEach((user, index) => {
        const bgColor = getAvatarColor(user.profile);
        const initials = user.trigramme || (user.prenom?.charAt(0) || '') + (user.nom?.charAt(0) || '');
        const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.username;

        // Effet d'empilement
        const marginLeft = index > 0 ? '-8px' : '0';

        if (user.profilePhoto) {
            html += `<div style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; background-color: ${bgColor}; margin-left: ${marginLeft}; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="${fullName}">
                        <img src="${user.profilePhoto}" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>`;
        } else {
            html += `<div style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; background-color: ${bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; margin-left: ${marginLeft}; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="${fullName}">
                        ${initials}
                    </div>`;
        }
    });

    avatarsDiv.innerHTML = html;

    // Afficher le compteur si plus de 5 utilisateurs
    if (extraCount > 0) {
        countSpan.textContent = `+${extraCount}`;
        countSpan.style.display = 'inline';
    } else {
        countSpan.style.display = 'none';
    }

    // Mettre à jour le tooltip
    renderOnlineUsersTooltip(users);
}

const PROFILE_META = {
    admin: { label: 'Admin', color: '#e74c3c', icon: 'crown' },
    user: { label: 'Utilisateur', color: '#3498db', icon: 'user' },
    expert: { label: 'Expert', color: '#27ae60', icon: 'briefcase' },
    rh: { label: 'RH', color: '#8e44ad', icon: 'users' }
};
function profileBadgeHtml(profile, onDark) {
    const meta = PROFILE_META[profile];
    if (!meta) return '';
    const bg = onDark ? 'rgba(255,255,255,0.18)' : meta.color + '1f';
    const fg = onDark ? '#fff' : meta.color;
    const bd = onDark ? 'rgba(255,255,255,0.4)' : meta.color + '66';
    return `<span title="Profil : ${meta.label}" style="display:inline-flex;align-items:center;gap:3px;background:${bg};color:${fg};border:1px solid ${bd};border-radius:10px;padding:1px 7px 1px 5px;font-size:10px;font-weight:bold;white-space:nowrap;flex-shrink:0;">${uiIcon(meta.icon, 11, 'margin:0;vertical-align:middle;')}${meta.label}</span>`;
}
window._onlineUsersByUserId = {};

// Obtenir la couleur selon le profil
function getAvatarColor(profile) {
    switch (profile) {
        case 'admin':
            return '#e74c3c';
        case 'user':
            return '#3498db';
        case 'expert':
            return '#27ae60';
        case 'rh':
            return '#8e44ad';
        default:
            return '#7f8c8d';
    }
}

// Afficher le tooltip avec la liste complète
function renderOnlineUsersTooltip(users) {
    const listDiv = document.getElementById('onlineUsersTooltipList');
    if (!listDiv) return;

    if (users.length === 0) {
        listDiv.innerHTML = '<p style="color: #999; font-size: 11px;">Aucun utilisateur connecté</p>';
        return;
    }

    window._onlineUsersByUserId = Object.fromEntries(users.map(u => [u.userId, u]));
    Object.keys(_chatPanels).forEach(uid => {
        const slot = document.getElementById(`pcpProf_${uid}`);
        const u = window._onlineUsersByUserId[uid];
        if (slot && u) slot.innerHTML = profileBadgeHtml(u.profile, true);
    });

    let html = '';
    users.forEach(user => {
        const bgColor = getAvatarColor(user.profile);
        const initials = user.trigramme || (user.prenom?.charAt(0) || '') + (user.nom?.charAt(0) || '');
        const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.username;

        html += `<div style="display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">`;

        if (user.profilePhoto) {
            html += `<div style="width: 30px; height: 30px; border-radius: 50%; border: 2px solid ${bgColor}; overflow: hidden; flex-shrink: 0;">
                        <img src="${user.profilePhoto}" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>`;
        } else {
            html += `<div style="width: 30px; height: 30px; border-radius: 50%; background-color: ${bgColor}; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold; flex-shrink: 0;">
                        ${initials}
                    </div>`;
        }

        html += `<div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; font-weight: 500; color: #2c3e50; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fullName}</div>
                    <div style="margin-top:2px;">${profileBadgeHtml(user.profile, false)}</div>
                </div>`;

        // Bouton message — masqué pour soi-même
        if (currentUser && user.userId !== currentUser.id) {
            const photoArg = user.profilePhoto ? `'${user.profilePhoto}'` : 'null';
            html += `<button onclick="openSendPushMessage(${user.userId}, '${fullName.replace(/'/g, "\\'")}', ${photoArg})"
                        title="Envoyer un message à ${fullName.replace(/'/g, "\\'")}"
                        style="flex-shrink:0;min-width:36px;min-height:36px;width:36px;height:36px;background:#3f51b5;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;box-shadow:0 2px 6px rgba(63,81,181,.35);line-height:1;padding:0;color:white;" onmouseover="this.style.background='#283593'" onmouseout="this.style.background='#3f51b5'">${uiIcon('mail', 18, 'margin:0;vertical-align:middle;')}</button>`;
        }

        html += `</div>`;
    });

    listDiv.innerHTML = html;
}

// Liste des utilisateurs connectés + bouton de discussion depuis n'importe quelle application (Aide à l'affectation, Analyse, Déplacements) :
// la même infobulle est réutilisée, ancrée sous la pastille cliquée, avec la liste fraîchement chargée.
async function toggleOnlineUsersTooltipFrom(anchor, event) {
    event.stopPropagation();
    const tooltip = document.getElementById('onlineUsersTooltip');
    if (!tooltip || !anchor) return;
    if (tooltip.parentElement !== document.body) document.body.appendChild(tooltip); // hors du conteneur principal, masqué dans les autres applications
    const same = tooltip.dataset.anchor === anchor.id;
    if (onlineUsersTooltipVisible && same) {
        tooltip.style.display = 'none';
        onlineUsersTooltipVisible = false;
        return;
    }
    try {
        const r = await fetch(`${API_URL}/active-sessions`, { credentials: 'include' });
        if (r.ok) renderOnlineUsersTooltip((await r.json()).activeUsers || []);
    } catch (e) {
        /* on affiche la dernière liste connue */
    }
    const rect = anchor.getBoundingClientRect();
    tooltip.dataset.anchor = anchor.id;
    tooltip.style.top = rect.bottom + 6 + 'px';
    tooltip.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
    tooltip.style.zIndex = 100001;
    tooltip.style.display = 'block';
    onlineUsersTooltipVisible = true;
}

// Toggle du tooltip
function toggleOnlineUsersTooltip(event) {
    event.stopPropagation();
    const tooltip = document.getElementById('onlineUsersTooltip');
    if (!tooltip) return;

    onlineUsersTooltipVisible = !onlineUsersTooltipVisible;
    tooltip.style.display = onlineUsersTooltipVisible ? 'block' : 'none';
}

// Fermer les suggestions de géocodage en cliquant ailleurs
document.addEventListener('click', function (e) {
    ['locGeoSuggest', 'newLocGeoSuggest'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.contains(e.target) && e.target.id !== 'locAdresse' && e.target.id !== 'newLocAdresse') {
            el.style.display = 'none';
        }
    });
});

// Fermer le tooltip en cliquant ailleurs
document.addEventListener('click', function (event) {
    const tooltip = document.getElementById('onlineUsersTooltip');
    const container = document.getElementById('onlineUsersContainer');

    if (tooltip && container && !container.contains(event.target) && !tooltip.contains(event.target)) {
        onlineUsersTooltipVisible = false;
        tooltip.style.display = 'none';
    }
});

// ── Auto-check GRIST selon libellé ──────────────────────────────────────
const GRIST_AUTO_LABELS = ['MISE EN SERVICE', 'VISITE TERRAIN', 'CONGRES', 'VISITE METIER'];
function autoCheckGristByLabel(label, cbId) {
    const cb = document.getElementById(cbId);
    if (!cb) return;
    const match = GRIST_AUTO_LABELS.some(l => label.trim().toUpperCase() === l);
    if (match) cb.checked = true;
}

// ── Géocodage adresse → lat/lng (Nominatim) ─────────────────────────────
let _geocodeTimers = {};
function scheduleGeocode(adresseId, latId, lngId, suggestId) {
    clearTimeout(_geocodeTimers[adresseId]);
    _geocodeTimers[adresseId] = setTimeout(() => runGeocode(adresseId, latId, lngId, suggestId), 800);
}

async function runGeocode(adresseId, latId, lngId, suggestId) {
    const addr = (document.getElementById(adresseId)?.value || '').trim();
    const suggestDiv = document.getElementById(suggestId);
    if (!suggestDiv) return;
    if (addr.length < 5) {
        suggestDiv.style.display = 'none';
        return;
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=5&addressdetails=0`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
        const results = await res.json();
        if (!results.length) {
            suggestDiv.style.display = 'none';
            return;
        }
        suggestDiv.innerHTML = results
            .map(
                (r, i) =>
                    `<div data-lat="${r.lat}" data-lng="${r.lon}" data-i="${i}"
                        onclick="_applyGeoSuggest(this,'${adresseId}','${latId}','${lngId}','${suggestId}')"
                        style="padding:7px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid #e8eaf6;color:#283593;"
                        onmouseover="this.style.background='#e8eaf6'" onmouseout="this.style.background=''">${r.display_name}</div>`
            )
            .join('');
        suggestDiv.style.display = 'block';
    } catch (e) {
        suggestDiv.style.display = 'none';
    }
}

function _applyGeoSuggest(el, adresseId, latId, lngId, suggestId) {
    const lat = parseFloat(el.dataset.lat);
    const lng = parseFloat(el.dataset.lng);
    const addrEl = document.getElementById(adresseId);
    const label = el.textContent.trim().toUpperCase();
    if (addrEl) addrEl.value = label;
    const latEl = document.getElementById(latId);
    const lngEl = document.getElementById(lngId);
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
    document.getElementById(suggestId).style.display = 'none';
}

// ── Modale vérification carte avec pin draggable ─────────────────────────
let _verifyMap = null,
    _verifyMarker = null,
    _verifyLatId = null,
    _verifyLngId = null;

function openVerifyMapModal(latId, lngId) {
    _verifyLatId = latId;
    _verifyLngId = lngId;
    const lat = parseFloat(document.getElementById(latId)?.value) || 46.6;
    const lng = parseFloat(document.getElementById(lngId)?.value) || 2.3;
    const modal = document.getElementById('verifyMapModal');
    modal.style.display = 'flex';

    const initMap = () => {
        if (_verifyMap) {
            _verifyMap.remove();
            _verifyMap = null;
        }
        _verifyMap = L.map('verifyMapContainer').setView([lat, lng], lat === 46.6 ? 5 : 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(_verifyMap);
        _verifyMarker = L.marker([lat, lng], { draggable: true }).addTo(_verifyMap);
        _updateVerifyCoords(lat, lng);
        _verifyMarker.on('dragend', function () {
            const pos = _verifyMarker.getLatLng();
            _updateVerifyCoords(pos.lat, pos.lng);
        });
        _verifyMarker.on('drag', function () {
            const pos = _verifyMarker.getLatLng();
            _updateVerifyCoords(pos.lat, pos.lng);
        });
        // clic sur la carte déplace aussi le marker
        _verifyMap.on('click', function (e) {
            _verifyMarker.setLatLng(e.latlng);
            _updateVerifyCoords(e.latlng.lat, e.latlng.lng);
        });
        setTimeout(() => _verifyMap.invalidateSize(), 100);
    };

    if (window.L) {
        initMap();
    } else {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = initMap;
        document.head.appendChild(s);
    }
}

function _updateVerifyCoords(lat, lng) {
    const el = document.getElementById('verifyMapCoords');
    if (el) el.textContent = `Lat : ${lat.toFixed(6)}  Lng : ${lng.toFixed(6)}`;
}

function confirmVerifyMap() {
    if (!_verifyMarker) return;
    const pos = _verifyMarker.getLatLng();
    const latEl = document.getElementById(_verifyLatId);
    const lngEl = document.getElementById(_verifyLngId);
    if (latEl) latEl.value = pos.lat.toFixed(6);
    if (lngEl) lngEl.value = pos.lng.toFixed(6);
    closeVerifyMapModal();
}

function closeVerifyMapModal() {
    document.getElementById('verifyMapModal').style.display = 'none';
    if (_verifyMap) {
        _verifyMap.remove();
        _verifyMap = null;
        _verifyMarker = null;
    }
}

// ── Modale création localisation depuis formulaire événement ─────────────
function openNewLocationModal(targetSelectId) {
    document.getElementById('newLocTargetSelect').value = targetSelectId;
    document.getElementById('newLocLong').value = '';
    document.getElementById('newLocCourt').value = '';
    document.getElementById('newLocAdresse').value = '';
    document.getElementById('newLocLat').value = '';
    document.getElementById('newLocLng').value = '';
    document.getElementById('newLocGeoSuggest').style.display = 'none';
    document.getElementById('newLocationModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newLocLong').focus(), 50);
}

function closeNewLocationModal() {
    document.getElementById('newLocationModal').style.display = 'none';
}

async function saveNewLocation() {
    const libelle_long = document.getElementById('newLocLong').value.trim().toUpperCase();
    const libelle_court = document.getElementById('newLocCourt').value.trim().toUpperCase();
    const adresse = document.getElementById('newLocAdresse').value.trim().toUpperCase();
    const latitude = document.getElementById('newLocLat').value;
    const longitude = document.getElementById('newLocLng').value;
    const targetSelectId = document.getElementById('newLocTargetSelect').value;

    if (!libelle_long || !libelle_court) {
        alert('Le libellé long et le libellé court sont obligatoires.');
        return;
    }
    try {
        const res = await fetch(`${API_URL}/locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                libelle_long,
                libelle_court,
                adresse: adresse || null,
                latitude: latitude || null,
                longitude: longitude || null
            })
        });
        const data = await res.json();
        if (!res.ok) {
            alert('Erreur : ' + (data.error || res.status));
            return;
        }
        closeNewLocationModal();
        // Recharger les localisations et sélectionner la nouvelle
        await loadLocations();
        const newId = data.id;
        if (newId && targetSelectId) {
            const sel = document.getElementById(targetSelectId);
            if (sel) sel.value = newId;
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

// ── Messages push ────────────────────────────────────────────────────────

let _pushSSE = null;

function initPushSSE() {
    if (_pushSSE) _pushSSE.close();
    _pushSSE = new EventSource(`${API_URL}/sse`, { withCredentials: true });
    _pushSSE.addEventListener('push-message', e => {
        try {
            const msg = JSON.parse(e.data);
            showPushMessageReceived(msg);
        } catch (_) {}
    });
    _pushSSE.onerror = () => {
        // Reconnexion automatique gérée par le navigateur
    };
}

// ── Panneaux de conversation push (multi-utilisateurs) ──────────────────
// Chaque conversation avec un utilisateur = 1 panneau indépendant.
// Les panneaux s'empilent de droite à gauche.

const CHAT_W = 300; // largeur d'un panneau en px
const CHAT_GAP = 10; // espace entre panneaux
const CHAT_BOT = 24; // distance du bas de l'écran
const CHAT_R0 = 24; // distance du bord droit pour le 1er panneau

let _chatPanels = {}; // { [userId]: { name, photo, el, minimized, unread } }

// ── Persistance sessionStorage ───────────────────────────────────────────
const _CHAT_HIST_KEY = uid => `pcp_hist_${uid}`;
const _CHAT_META_KEY = 'pcp_open_panels';

function _chatSaveMsg(userId, entry) {
    try {
        const key = _CHAT_HIST_KEY(userId);
        const hist = JSON.parse(sessionStorage.getItem(key) || '[]');
        hist.push(entry);
        // Conserver max 200 messages par conversation
        if (hist.length > 200) hist.splice(0, hist.length - 200);
        sessionStorage.setItem(key, JSON.stringify(hist));
    } catch (e) {}
}

function _chatSaveMeta() {
    try {
        const meta = Object.values(_chatPanels).map(p => ({
            userId: p.userId,
            name: p.name,
            photo: p.photo,
            minimized: p.minimized
        }));
        sessionStorage.setItem(_CHAT_META_KEY, JSON.stringify(meta));
    } catch (e) {}
}

function _chatRestoreSessions() {
    try {
        const meta = JSON.parse(sessionStorage.getItem(_CHAT_META_KEY) || '[]');
        meta.forEach(m => {
            const p = _getOrCreateChatPanel(m.userId, m.name, m.photo);
            // Rejouer l'historique
            const hist = JSON.parse(sessionStorage.getItem(_CHAT_HIST_KEY(m.userId)) || '[]');
            hist.forEach(h => _chatAddBubble(m.userId, h.text, h.senderName, h.senderPhoto, h.time, h.isOwn, true));
            if (m.minimized) _chatToggleMin(m.userId);
        });
    } catch (e) {}
}

function _chatPanelRight(idx) {
    return CHAT_R0 + idx * (CHAT_W + CHAT_GAP);
}

function _rebuildChatPositions() {
    Object.values(_chatPanels).forEach((p, i) => {
        if (p.el) p.el.style.right = _chatPanelRight(i) + 'px';
    });
}

function _chatAvatar(name, photo, sz, border) {
    const b = border ? `border:2px solid ${border};` : '';
    if (photo)
        return `<img src="${photo}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;flex-shrink:0;${b}">`;
    const bg = border ? 'rgba(255,255,255,0.25)' : '#9fa8da';
    const col = border ? 'white' : 'white';
    return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:${col};display:flex;align-items:center;justify-content:center;font-size:${Math.round(sz * 0.45)}px;font-weight:bold;flex-shrink:0;${b}">${(name || '?')[0].toUpperCase()}</div>`;
}

function _getOrCreateChatPanel(userId, name, photo, profile) {
    if (_chatPanels[userId]) return _chatPanels[userId];

    const idx = Object.keys(_chatPanels).length;
    const entry = { userId, name, photo, minimized: false, unread: 0, el: null };
    _chatPanels[userId] = entry;

    const el = document.createElement('div');
    el.id = `pcp_${userId}`;
    el.style.cssText = [
        'position:fixed',
        `bottom:${CHAT_BOT}px`,
        `right:${_chatPanelRight(idx)}px`,
        `width:${CHAT_W}px`,
        'z-index:99999',
        'background:white',
        'border-radius:12px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.28)',
        'display:flex',
        'flex-direction:column',
        'animation:slideInRight .22s ease',
        'font-family:inherit'
    ].join(';');

    el.innerHTML = `
                <div id="pcpHead_${userId}" onclick="_chatToggleMin(${userId})"
                    style="background:#3f51b5;border-radius:12px 12px 0 0;padding:9px 12px;
                           display:flex;align-items:center;gap:8px;cursor:pointer;flex-shrink:0;user-select:none;">
                    ${_chatAvatar(name, photo, 26, 'rgba(255,255,255,0.5)')}
                    <span style="color:white;font-size:12px;font-weight:bold;flex:1;
                                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
                    <span id="pcpProf_${userId}" style="display:inline-flex;">${profileBadgeHtml(profile || (window._onlineUsersByUserId[userId] || {}).profile, true)}</span>
                    <span id="pcpBadge_${userId}" style="display:none;background:#e53935;color:white;
                          border-radius:10px;padding:1px 7px;font-size:10px;font-weight:bold;"></span>
                    <span id="pcpMinIco_${userId}" style="color:rgba(255,255,255,.8);line-height:1;display:inline-flex;"
                          title="Réduire">${uiIcon('minus', 16, 'margin:0;')}</span>
                    <span onclick="event.stopPropagation();_closeChatPanel(${userId})"
                          style="cursor:pointer;color:rgba(255,255,255,.8);line-height:1;margin-left:2px;display:inline-flex;"
                          title="Fermer">${uiIcon('x', 16, 'margin:0;')}</span>
                </div>
                <div id="pcpBody_${userId}" style="display:flex;flex-direction:column;max-height:420px;">
                    <div id="pcpMsgs_${userId}"
                         style="flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;
                                gap:8px;min-height:60px;max-height:290px;"></div>
                    <div style="padding:8px 10px;border-top:1px solid #e8eaf6;flex-shrink:0;">
                        <div style="display:flex;gap:6px;align-items:flex-end;">
                            <textarea id="pcpTxt_${userId}" placeholder="Votre message… (Ctrl+↵)"
                                maxlength="500" rows="2"
                                style="flex:1;border:1px solid #c5cae9;border-radius:6px;padding:6px 8px;
                                       font-size:12px;resize:none;box-sizing:border-box;font-family:inherit;"
                                onkeydown="if(event.key==='Enter'&&event.ctrlKey){_chatSend(${userId});event.preventDefault();}"></textarea>
                            <button onclick="_chatSend(${userId})" title="Envoyer (Ctrl+↵)"
                                style="background:#3f51b5;color:white;border:none;border-radius:6px;
                                       padding:8px 10px;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;">${uiIcon('plane', 16, 'margin:0;stroke:white;fill:none;')}</button>
                        </div>
                    </div>
                </div>`;

    document.body.appendChild(el);
    entry.el = el;
    _chatSaveMeta();
    return entry;
}

function _chatAddBubble(userId, text, senderName, senderPhoto, time, isOwn, noSave) {
    if (!noSave) _chatSaveMsg(userId, { text, senderName, senderPhoto, time, isOwn });
    const box = document.getElementById(`pcpMsgs_${userId}`);
    if (!box) return;
    const t = time ? new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bbl = document.createElement('div');

    if (isOwn) {
        bbl.style.cssText = 'display:flex;justify-content:flex-end;';
        bbl.innerHTML = `
                    <div style="max-width:82%;">
                        <div style="text-align:right;font-size:10px;color:#ccc;margin-bottom:2px;">${t}</div>
                        <div style="background:#3f51b5;color:white;border-radius:10px 3px 10px 10px;
                                    padding:7px 10px;font-size:12px;line-height:1.5;word-break:break-word;">${safe}</div>
                    </div>`;
    } else {
        bbl.style.cssText = 'display:flex;gap:6px;align-items:flex-start;';
        bbl.innerHTML = `
                    ${_chatAvatar(senderName, senderPhoto, 24, null)}
                    <div style="max-width:82%;">
                        <div style="font-size:10px;color:#ccc;margin-bottom:2px;">${t}</div>
                        <div style="background:#f0f2ff;color:#2c3e50;border-radius:3px 10px 10px 10px;
                                    padding:7px 10px;font-size:12px;line-height:1.5;word-break:break-word;">${safe}</div>
                    </div>`;
    }
    box.appendChild(bbl);
    box.scrollTop = box.scrollHeight;
}

function _chatToggleMin(userId) {
    const p = _chatPanels[userId];
    if (!p) return;
    p.minimized = !p.minimized;
    const body = document.getElementById(`pcpBody_${userId}`);
    const ico = document.getElementById(`pcpMinIco_${userId}`);
    const badge = document.getElementById(`pcpBadge_${userId}`);
    const head = document.getElementById(`pcpHead_${userId}`);
    if (p.minimized) {
        if (body) body.style.display = 'none';
        if (ico) ico.innerHTML = uiIcon('chevronUp', 16, 'margin:0;');
        if (p.el) p.el.style.borderRadius = '12px';
        if (head) head.style.borderRadius = '12px';
    } else {
        if (body) body.style.display = '';
        if (ico) ico.innerHTML = uiIcon('minus', 16, 'margin:0;');
        if (p.el) p.el.style.borderRadius = '12px';
        if (head) head.style.borderRadius = '12px 12px 0 0';
        if (badge) {
            badge.textContent = '';
            badge.style.display = 'none';
        }
        p.unread = 0;
        const box = document.getElementById(`pcpMsgs_${userId}`);
        if (box) box.scrollTop = box.scrollHeight;
    }
    _chatSaveMeta();
}

function _closeChatPanel(userId) {
    const p = _chatPanels[userId];
    if (!p) return;
    p.el?.remove();
    delete _chatPanels[userId];
    try {
        sessionStorage.removeItem(_CHAT_HIST_KEY(userId));
    } catch (e) {}
    _rebuildChatPositions();
    _chatSaveMeta();
}

function _chatCloseAll() {
    Object.keys(_chatPanels).forEach(uid => {
        _chatPanels[uid]?.el?.remove();
        try {
            sessionStorage.removeItem(_CHAT_HIST_KEY(uid));
        } catch (e) {}
    });
    _chatPanels = {};
    try {
        sessionStorage.removeItem(_CHAT_META_KEY);
    } catch (e) {}
}

// Message REÇU via SSE
function showPushMessageReceived(msg) {
    playNotifSound();
    const p = _getOrCreateChatPanel(msg.fromUserId, msg.fromName, msg.fromPhoto, msg.fromProfile);
    _chatAddBubble(msg.fromUserId, msg.message, msg.fromName, msg.fromPhoto, msg.sentAt, false);
    if (p.minimized) {
        // Badge + ré-ouverture
        p.unread++;
        const badge = document.getElementById(`pcpBadge_${msg.fromUserId}`);
        if (badge) {
            badge.textContent = p.unread;
            badge.style.display = 'inline';
        }
    }
}

// Envoi depuis le panneau
async function _chatSend(toUserId) {
    const p = _chatPanels[toUserId];
    if (!p) return;
    const ta = document.getElementById(`pcpTxt_${toUserId}`);
    const message = ta?.value?.trim();
    if (!message) return;
    try {
        const res = await fetch(`${API_URL}/push-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ toUserId, message })
        });
        if (res.ok) {
            ta.value = '';
            // Ajouter notre propre bulle à droite
            _chatAddBubble(toUserId, message, null, null, new Date().toISOString(), true);
        } else {
            const err = await res.json();
            alert('Erreur : ' + (err.error || 'Envoi impossible'));
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

// ── Son de notification push ─────────────────────────────────────────────
function playNotifSound() {
    try {
        if (localStorage.getItem('notifSoundEnabled') === 'false') return;
        const customData = localStorage.getItem('notifSoundData');
        if (customData) {
            const audio = new Audio(customData);
            audio.volume = 0.7;
            audio.play().catch(() => {});
        } else {
            _playDefaultBeep();
        }
    } catch (e) {}
}

function _playDefaultBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        // Deux tons courts façon messagerie
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        setTimeout(() => ctx.close(), 700);
    } catch (e) {}
}

// Réglage du son (Administration › Paramétrages divers) : îlot Vue (frontend/src/ilots/admin/parametrages)

function openSendPushMessage(toUserId, toName, toPhoto) {
    // Fermer le tooltip utilisateurs
    document.getElementById('onlineUsersTooltip').style.display = 'none';
    onlineUsersTooltipVisible = false;
    // Ouvrir (ou mettre le focus sur) le panneau de conversation
    _getOrCreateChatPanel(toUserId, toName, toPhoto);
    const p = _chatPanels[toUserId];
    if (p?.minimized) _chatToggleMin(toUserId);
    setTimeout(() => document.getElementById(`pcpTxt_${toUserId}`)?.focus(), 60);
}

// Démarrer la mise à jour périodique des utilisateurs connectés
function startOnlineUsersPolling() {
    loadOnlineUsers();
    onlineUsersInterval = setInterval(loadOnlineUsers, 30000); // Toutes les 30 secondes
    initPushSSE(); // Connexion SSE pour les messages push
}

// Arrêter la mise à jour périodique
function stopOnlineUsersPolling() {
    if (onlineUsersInterval) {
        clearInterval(onlineUsersInterval);
        onlineUsersInterval = null;
    }
    if (_pushSSE) {
        _pushSSE.close();
        _pushSSE = null;
    }
}

// ========== DÉTECTION DE RÉVEIL ET RECONNEXION AUTOMATIQUE ==========

let lastActivityTimestamp = Date.now();
const WAKE_THRESHOLD = 60000; // 1 minute - si plus de 1 min s'est écoulée entre 2 intervalles, c'est un réveil

// Détecte si l'ordinateur a été en veille et recharge les données
function setupWakeDetection() {
    // Méthode 1: Détection via visibilitychange (quand l'onglet redevient visible)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            const now = Date.now();
            const elapsed = now - lastActivityTimestamp;

            // Si plus de 1 minute s'est écoulée, c'est probablement un réveil
            if (elapsed > WAKE_THRESHOLD) {
                console.log(
                    `🔄 Réveil détecté (${Math.round(elapsed / 1000 / 60)} min d'inactivité) - Rechargement des données...`
                );
                handleWakeUp();
            }
            lastActivityTimestamp = now;
        }
    });

    // Méthode 2: Heartbeat - vérifie régulièrement si le temps s'est écoulé normalement
    setInterval(function () {
        const now = Date.now();
        const elapsed = now - lastActivityTimestamp;

        // Si plus de 2x l'intervalle normal (60s au lieu de 30s), c'est un réveil
        if (elapsed > WAKE_THRESHOLD * 2) {
            console.log(
                `🔄 Réveil détecté via heartbeat (${Math.round(elapsed / 1000 / 60)} min d'inactivité) - Rechargement des données...`
            );
            handleWakeUp();
        }
        lastActivityTimestamp = now;
    }, 30000); // Toutes les 30 secondes

    // Méthode 3: Focus sur la fenêtre
    window.addEventListener('focus', function () {
        const now = Date.now();
        const elapsed = now - lastActivityTimestamp;

        if (elapsed > WAKE_THRESHOLD) {
            console.log(`🔄 Focus détecté après ${Math.round(elapsed / 1000 / 60)} min - Rechargement des données...`);
            handleWakeUp();
        }
        lastActivityTimestamp = now;
    });
}

// Actions à effectuer au réveil
async function handleWakeUp() {
    try {
        // 1. Vérifier que la session est toujours valide
        const sessionResponse = await fetch(`${API_URL}/check-session`, { credentials: 'include' });

        if (!sessionResponse.ok) {
            console.log('❌ Session expirée après réveil - déconnexion propre');
            _chatCloseAll();
            stopInactivityTimer();
            if (notificationCheckInterval) {
                clearInterval(notificationCheckInterval);
                notificationCheckInterval = null;
            }
            if (onlineUsersInterval) {
                clearInterval(onlineUsersInterval);
                onlineUsersInterval = null;
            }
            currentUser = null;
            pendingAssignments = {};
            document.getElementById('loginPage').classList.add('active');
            document.querySelector('.container').style.display = 'none';
            document.getElementById('userInfo').style.display = 'none';
            loginStep = 'credentials';
            availableProfiles = [];
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginProfile').value = '';
            document.getElementById('profileSelectGroup').style.display = 'none';
            setLoginButtonLabel('Continuer');
            document.getElementById('loginError').style.display = 'none';
            return;
        }

        // 2. Session toujours valide : resynchroniser le timer d'inactivité
        if (currentUser && inactivityTimeout && lastActivityTime) {
            const elapsedSeconds = Math.floor((Date.now() - lastActivityTime) / 1000);
            inactivityTimeRemaining = inactivityTimeout * 60 - elapsedSeconds;
            if (inactivityTimeRemaining <= 0) {
                showInactivityModal();
            } else {
                updateTimerDisplay();
            }
        }

        // 3. Recharger les utilisateurs connectés
        console.log('👥 Rechargement des utilisateurs connectés...');
        await loadOnlineUsers();

        // 4. Redémarrer le polling si nécessaire
        if (!onlineUsersInterval) {
            startOnlineUsersPolling();
        }

        // 5. Recharger les données du planning si on est sur l'onglet Planification
        const planningTab = document.getElementById('planning');
        if (planningTab && planningTab.style.display !== 'none') {
            console.log('📅 Rechargement du planning...');
            await loadSchedule();
            updateGantt();
        }

        // 6. Recharger les astreintes/HNO
        if (typeof loadAllAstreintesHno === 'function') {
            console.log('🕐 Rechargement des astreintes/HNO...');
            await loadAllAstreintesHno();
        }

        console.log('✅ Rechargement terminé après réveil');
    } catch (error) {
        console.error('❌ Erreur lors du rechargement après réveil:', error);
    }
}

// Initialiser la détection de réveil au chargement
document.addEventListener('DOMContentLoaded', setupWakeDetection);
