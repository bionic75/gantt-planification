// ═══════════════════════════════════════════════════════════════════════════
// SAMU-SAS TripAdVisor : bonnes adresses (hébergement, restaurant, bar) rattachées aux localisations des SAMU-SAS
// Chargé après le script principal (defer) : partage ses variables globales (API_URL, currentUser, uiIcon, UI_ICONS).
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(UI_ICONS, {
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    beer: '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2.5-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    tripPlus: '<path d="M12 5v14M5 12h14"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    mapPin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
});

const TRIP_CATS = {
    hebergement: { label: 'Hébergement', icon: 'bed', color: '#6a1b9a' },
    restaurant: { label: 'Restaurant', icon: 'utensils', color: '#e65100' },
    bar: { label: 'Bar', icon: 'beer', color: '#1565c0' }
};
const TRIP_FRANCE = [[41.2, -5.3], [51.2, 9.7]]; // France métropolitaine (Corse incluse)
const trip = { meta: null, pois: [], filters: { loc: '', cat: '', creator: '', q: '' }, map: null, layer: null, markers: {}, built: false, detail: {}, isAdmin: false, userId: null, formState: null, timer: null };
const tEsc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tFmt = d => { // horodatage SQLite (UTC) → JJ/MM/AAAA HH:MM, heure locale
    if (!d) return '';
    const x = new Date(String(d).replace(' ', 'T') + 'Z');
    if (isNaN(x)) return '';
    const z = n => String(n).padStart(2, '0');
    return `${z(x.getDate())}/${z(x.getMonth() + 1)}/${x.getFullYear()} ${z(x.getHours())}:${z(x.getMinutes())}`;
};
async function tApi(path, opts) {
    const r = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...(opts || {}) });
    let d = {};
    try { d = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
    return d;
}

// ── Étoiles ────────────────────────────────────────────────────────────────
const STAR_PATH = '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9z"/>';
const tStarRow = (color, n, size) => Array.from({ length: n }, () => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="flex:none;" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round">${STAR_PATH}</svg>`).join('');
function tStars(avg, size) {
    size = size || 16;
    const w = avg == null ? 0 : Math.max(0, Math.min(100, avg / 5 * 100));
    return `<span style="position:relative;display:inline-flex;vertical-align:middle;" title="${avg == null ? 'Pas encore noté' : avg.toFixed(1).replace('.', ',') + ' / 5'}">
        <span style="display:inline-flex;">${tStarRow('#d5dbe5', 5, size)}</span>
        <span style="position:absolute;left:0;top:0;overflow:hidden;white-space:nowrap;width:${w}%;display:inline-flex;">${tStarRow('#f5a623', 5, size)}</span></span>`;
}
const tStarInput = (value, onclickFn, size) => `<span style="display:inline-flex;gap:2px;">${[1, 2, 3, 4, 5].map(i => `<button type="button" onclick="${onclickFn}(${i})" title="${i} / 5" style="border:none;background:none;padding:0;cursor:pointer;line-height:0;"><svg viewBox="0 0 24 24" width="${size || 22}" height="${size || 22}" fill="${i <= (value || 0) ? '#f5a623' : 'none'}" stroke="${i <= (value || 0) ? '#f5a623' : '#9aa7b8'}" stroke-width="1.5" stroke-linejoin="round">${STAR_PATH}</svg></button>`).join('')}</span>`;
const tChip = c => { const k = TRIP_CATS[c]; return k ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${k.color};color:#fff;">${uiIcon(k.icon, 12, 'margin:0;')}${k.label}</span>` : ''; };

// ── Mise en page de l'onglet ───────────────────────────────────────────────
function tripBuild() {
    const root = document.getElementById('tripRoot');
    if (!root || trip.built) return;
    trip.built = true;
    if (!document.getElementById('tripStyle')) {
        const st = document.createElement('style'); st.id = 'tripStyle';
        st.textContent = `
        #tripRoot .tr-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
        #tripRoot .tr-bar h2 { margin:0; display:flex; align-items:center; gap:10px; }
        #tripRoot .tr-filters { display:grid; grid-template-columns: 1.3fr 1.6fr 1.1fr 1.3fr auto; gap:10px; align-items:end; background:#fff; border:1px solid #e3e8f2; border-radius:12px; padding:12px; margin-bottom:12px; }
        #tripRoot .tr-filters label { font-size:11px; font-weight:700; color:#5a6b80; display:block; margin-bottom:3px; }
        #tripRoot .tr-filters select, #tripRoot .tr-filters input[type=search] { width:100%; padding:7px 9px; border:1px solid #cfd8e6; border-radius:8px; font-size:13px; box-sizing:border-box; }
        #tripRoot .tr-cats { display:flex; gap:6px; flex-wrap:wrap; }
        #tripRoot .tr-cat { display:inline-flex; align-items:center; gap:5px; padding:6px 10px; border:1px solid #cfd8e6; border-radius:18px; background:#fff; cursor:pointer; font-size:12px; font-weight:600; color:#4a5b70; }
        #tripRoot .tr-cat.on { color:#fff; border-color:transparent; }
        #tripRoot .tr-grid { display:grid; grid-template-columns: minmax(320px, 5fr) 6fr; gap:16px; align-items:start; }
        #tripRoot .tr-mapwrap { position:sticky; top:150px; z-index:1; }
        #tripRoot .tr-map { height:calc(100vh - 290px); min-height:420px; border-radius:12px; border:1px solid #dfe5ef; }
        #tripRoot .tr-list { display:flex; flex-direction:column; gap:12px; }
        #tripRoot .tr-card { background:#fff; border:1px solid #e3e8f2; border-left:5px solid #90a4ae; border-radius:12px; padding:12px 14px; transition:box-shadow .15s; }
        #tripRoot .tr-card.hl { box-shadow:0 0 0 3px rgba(29,112,183,.35); }
        #tripRoot .tr-card h3 { margin:6px 0 2px; font-size:16px; color:#1f2d3d; border:none; padding:0; }
        #tripRoot .tr-meta { font-size:12px; color:#6b7a8d; display:flex; flex-wrap:wrap; gap:4px 12px; align-items:center; }
        #tripRoot .tr-meta svg { vertical-align:-2px; }
        #tripRoot .tr-comment { margin:8px 0; padding:8px 10px; background:#f6f8fc; border-radius:8px; font-size:13px; color:#2c3e50; white-space:pre-wrap; }
        #tripRoot .tr-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid #cfd8e6; border-radius:8px; background:#fff; color:#2c3e50; font-size:12px; font-weight:600; cursor:pointer; }
        #tripRoot .tr-btn.pri { background:#1d70b7; border-color:#1d70b7; color:#fff; }
        #tripRoot .tr-btn.dgr { color:#b3261e; border-color:#e5b3b0; }
        #tripRoot .tr-rev { border-top:1px dashed #d8e0ec; margin-top:10px; padding-top:10px; }
        #tripRoot .tr-rv { padding:8px 0; border-top:1px solid #eef1f6; font-size:13px; }
        #tripRoot .tr-rv:first-child { border-top:none; }
        .tr-pin { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.4); }
        .tr-pin > svg { transform:rotate(45deg); }
        .tr-sas { position:absolute; left:0; top:0; transform:translate(-50%,-50%); display:flex; align-items:center; justify-content:center; height:24px; padding:0 9px; border-radius:12px; background:#1d70b7; color:#fff; font-size:11px; font-weight:800; letter-spacing:.2px; white-space:nowrap; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.45); }
        #tripModal { position:fixed; inset:0; background:rgba(20,30,45,.55); z-index:3000; display:none; align-items:flex-start; justify-content:center; overflow:auto; padding:30px 12px; }
        #tripModal.on { display:flex; }
        #tripModal .tr-box { background:#fff; width:min(760px,100%); border-radius:14px; padding:18px 20px; box-shadow:0 20px 50px rgba(0,0,0,.35); }
        #tripModal label.l { display:block; font-size:12px; font-weight:700; color:#4a5b70; margin:10px 0 4px; }
        #tripModal input[type=text], #tripModal select, #tripModal textarea { width:100%; padding:8px 10px; border:1px solid #cfd8e6; border-radius:8px; font-size:14px; box-sizing:border-box; }
        #tripModal .tr-sug { position:absolute; left:0; right:0; top:100%; z-index:10; background:#fff; border:1px solid #cfd8e6; border-radius:0 0 10px 10px; box-shadow:0 10px 24px rgba(0,0,0,.2); max-height:290px; overflow:auto; }
        #tripModal .tr-sug div { padding:8px 12px; cursor:pointer; font-size:13px; border-top:1px solid #f0f3f8; }
        #tripModal .tr-sug div:hover { background:#eaf2fb; }
        @media (max-width: 1000px) { #tripRoot .tr-grid { grid-template-columns: 1fr; } #tripRoot .tr-mapwrap { position:static; } #tripRoot .tr-map { height:340px; min-height:300px; } #tripRoot .tr-filters { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { #tripRoot .tr-filters { grid-template-columns: 1fr; } }`;
        document.head.appendChild(st);
    }
    root.innerHTML = `
        <div class="tr-bar"><h2>${uiIcon('mapPin', 26, 'margin:0;color:#e65100;')}SAMU-SAS TripAdVisor</h2>
            <button type="button" class="tr-btn pri" onclick="tripOpenForm()">${uiIcon('tripPlus', 15, 'margin:0;')}Ajouter un lieu</button></div>
        <p style="margin:-4px 0 12px;font-size:13px;color:#6b7a8d;">Les bonnes adresses (hébergements, restaurants, bars) partagées par les équipes autour de chaque SAMU-SAS : notez, commentez et ajoutez vos adresses.</p>
        <div class="tr-filters" id="trFilters"></div>
        <div id="trCount" style="font-size:12px;color:#6b7a8d;margin-bottom:8px;"></div>
        <div class="tr-grid"><div class="tr-mapwrap"><div id="trMap" class="tr-map"></div></div><div id="trList" class="tr-list"></div></div>
        <div id="tripModal"><div class="tr-box" id="tripBox"></div></div>`;
}
function tripRenderFilters() {
    const f = trip.filters, m = trip.meta;
    const box = document.getElementById('trFilters'); if (!box || !m) return;
    // Nombre de lieux par typologie pour le SAMU-SAS choisi (ou tous)
    const cnt = {}; Object.entries(m.counts || {}).forEach(([lid, byCat]) => { if (!f.loc || String(lid) === String(f.loc)) Object.entries(byCat).forEach(([c, n]) => { cnt[c] = (cnt[c] || 0) + n; }); });
    const total = Object.values(cnt).reduce((a, b) => a + b, 0);
    box.innerHTML = `
        <div><label for="trLoc">SAMU-SAS</label><select id="trLoc" onchange="tripSetFilter('loc', this.value)"><option value="">— Tous les SAMU-SAS —</option>${m.locations.map(l => `<option value="${l.id}" ${String(l.id) === String(f.loc) ? 'selected' : ''}>${tEsc(l.libelle_court)}${l.n_poi ? ' (' + l.n_poi + ')' : ''}</option>`).join('')}</select></div>
        <div><label>Typologie</label><div class="tr-cats"><span class="tr-cat ${!f.cat ? 'on' : ''}" style="${!f.cat ? 'background:#455a64;' : ''}" onclick="tripSetFilter('cat','')">Tout (${total})</span>${Object.entries(TRIP_CATS).map(([k, c]) => `<span class="tr-cat ${f.cat === k ? 'on' : ''}" style="${f.cat === k ? 'background:' + c.color + ';' : ''}" onclick="tripSetFilter('cat','${k}')">${uiIcon(c.icon, 14, 'margin:0;')}${c.label} (${cnt[k] || 0})</span>`).join('')}</div></div>
        <div><label for="trCreator">Créateur</label><select id="trCreator" onchange="tripSetFilter('creator', this.value)"><option value="">— Tous les créateurs —</option>${m.creators.map(c => `<option value="${c.id}" ${String(c.id) === String(f.creator) ? 'selected' : ''}>${tEsc(c.name)}</option>`).join('')}</select></div>
        <div><label for="trQ">Recherche</label><input type="search" id="trQ" value="${tEsc(f.q)}" placeholder="Nom, adresse, commentaire…" oninput="tripSearchInput(this.value)"></div>
        <div><button type="button" class="tr-btn" onclick="tripResetFilters()" title="Effacer les filtres">↺ Réinitialiser</button></div>`;
}
// Choisir un SAMU-SAS affiche tous ses lieux : les autres filtres (typologie, créateur, recherche) sont remis à zéro
function tripSetFilter(k, v) {
    if (k === 'loc') trip.filters = { loc: v, cat: '', creator: '', q: '' }; else trip.filters[k] = v;
    tripRenderFilters(); tripFetch();
}
function tripSearchInput(v) { trip.filters.q = v; clearTimeout(trip.timer); trip.timer = setTimeout(tripFetch, 300); }
function tripResetFilters() { trip.filters = { loc: '', cat: '', creator: '', q: '' }; tripRenderFilters(); tripFetch(); }

// ── Chargement ─────────────────────────────────────────────────────────────
async function tripLoad() {
    tripBuild();
    try {
        trip.meta = await tApi('/poi/meta');
        tripRenderFilters();
        await tripFetch();
    } catch (e) { const l = document.getElementById('trList'); if (l) l.innerHTML = `<p style="color:#b3261e;">${tEsc(e.message)}</p>`; }
}
async function tripFetch() {
    const f = trip.filters, p = new URLSearchParams();
    if (f.loc) p.set('location_id', f.loc);
    if (f.cat) p.set('category', f.cat);
    if (f.creator) p.set('creator', f.creator);
    if (f.q.trim()) p.set('q', f.q.trim());
    try {
        const d = await tApi('/poi?' + p.toString());
        trip.pois = d.pois; trip.isAdmin = d.isAdmin; trip.userId = d.userId;
        tripRenderList(); tripRenderMap();
        // les listes de filtre (compteurs, créateurs) suivent les ajouts / suppressions
        const m = await tApi('/poi/meta'); trip.meta = m; const a = document.activeElement; if (!(a && a.id === 'trQ')) tripRenderFilters();
    } catch (e) { document.getElementById('trList').innerHTML = `<p style="color:#b3261e;">${tEsc(e.message)}</p>`; }
}

// ── Liste ──────────────────────────────────────────────────────────────────
function tripCardHtml(p) {
    const c = TRIP_CATS[p.category] || { color: '#90a4ae' };
    const edited = p.updated_at && p.updated_at !== p.created_at ? ` · modifié le ${tFmt(p.updated_at)}` : '';
    return `<div class="tr-card" id="trCard_${p.id}" style="border-left-color:${c.color};">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start;">
            <div>${tChip(p.category)} <span class="tr-meta" style="display:inline-flex;margin-left:6px;">${uiIcon('building', 13, 'margin:0;')}${tEsc(p.loc_court)}${p.distance_km != null ? ` · à ${String(p.distance_km).replace('.', ',')} km` : ''}</span>
                <h3>${tEsc(p.name)}</h3></div>
            <div style="text-align:right;">${tStars(p.avg_rating, 18)}<div style="font-size:12px;color:#6b7a8d;">${p.avg_rating != null ? `<b>${p.avg_rating.toFixed(1).replace('.', ',')}</b> / 5 · ${p.n_ratings} note${p.n_ratings > 1 ? 's' : ''}` : 'Pas encore noté'}</div></div></div>
        <div class="tr-meta">${p.address ? `<span>${uiIcon('pin', 13, 'margin:0 3px 0 0;')}${tEsc(p.address)}</span>` : ''}${p.phone ? `<span>${uiIcon('phone', 13, 'margin:0 3px 0 0;')}${tEsc(p.phone)}</span>` : ''}${p.website ? `<a href="${tEsc(/^https?:\/\//i.test(p.website) ? p.website : 'https://' + p.website)}" target="_blank" rel="noopener">${uiIcon('globe', 13, 'margin:0 3px 0 0;')}Site web</a>` : ''}
            <button type="button" class="tr-btn" style="padding:2px 8px;" onclick="tripFocus(${p.id})" title="Voir sur la carte">${uiIcon('mapPin', 12, 'margin:0;')}Carte</button></div>
        ${p.comment ? `<div class="tr-comment">${tEsc(p.comment)}</div>` : ''}
        <div class="tr-meta" style="margin-top:4px;">${uiIcon('user', 13, 'margin:0 3px 0 0;')}Ajouté par <b>${tEsc(p.creator)}</b> le ${tFmt(p.created_at)}${edited}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">
            <button type="button" class="tr-btn" onclick="tripToggleReviews(${p.id})">${uiIcon('comment', 14, 'margin:0;')}Avis et notes (${p.n_comments} commentaire${p.n_comments > 1 ? 's' : ''})</button>
            ${p.can_edit ? `<button type="button" class="tr-btn" onclick="tripOpenForm(${p.id})">${uiIcon('pencil', 14, 'margin:0;')}Modifier</button><button type="button" class="tr-btn dgr" onclick="tripDelete(${p.id})">${uiIcon('trash', 14, 'margin:0;')}Supprimer</button>` : ''}</div>
        <div id="trRev_${p.id}" class="tr-rev" style="display:none;"></div></div>`;
}
function tripRenderList() {
    const box = document.getElementById('trList'); if (!box) return;
    const open = Object.keys(trip.detail).filter(k => trip.detail[k] && trip.detail[k].open).map(Number);
    document.getElementById('trCount').textContent = `${trip.pois.length} lieu${trip.pois.length > 1 ? 'x' : ''}`;
    box.innerHTML = trip.pois.length ? trip.pois.map(tripCardHtml).join('') : `<div style="padding:30px;text-align:center;color:#8a97a8;background:#fff;border:1px dashed #cfd8e6;border-radius:12px;">Aucun lieu pour ces critères.<br><button type="button" class="tr-btn pri" style="margin-top:10px;" onclick="tripOpenForm()">${uiIcon('tripPlus', 14, 'margin:0;')}Ajouter le premier</button></div>`;
    open.forEach(id => { if (document.getElementById('trRev_' + id)) tripToggleReviews(id, true); });
}

// ── Carte ──────────────────────────────────────────────────────────────────
function tripEnsureLeaflet() {
    return new Promise((resolve, reject) => {
        if (window.L) return resolve();
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = () => resolve(); s.onerror = () => reject(new Error('Carte indisponible'));
        document.head.appendChild(s);
    });
}
async function tripRenderMap() {
    try { await tripEnsureLeaflet(); } catch (e) { const m = document.getElementById('trMap'); if (m) m.innerHTML = '<p style="padding:20px;color:#8a97a8;">Carte indisponible (connexion aux fonds de carte impossible).</p>'; return; }
    const el = document.getElementById('trMap'); if (!el) return;
    if (!trip.map || trip.map._container !== el) {
        trip.map = L.map(el, { zoomControl: true }).fitBounds(TRIP_FRANCE);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(trip.map);
        trip.layer = L.layerGroup().addTo(trip.map);
    }
    trip.layer.clearLayers(); trip.markers = {};
    const pts = [];
    const sas = (trip.meta ? trip.meta.locations : []).filter(l => l.latitude != null && l.longitude != null && (!trip.filters.loc || String(l.id) === String(trip.filters.loc)));
    sas.forEach(l => {
        const mk = L.marker([l.latitude, l.longitude], { icon: L.divIcon({ className: '', html: `<div class="tr-sas">${tEsc(l.libelle_court)}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: 500 }).addTo(trip.layer);
        // Clic sur la vignette d'un SAMU-SAS : la carte se centre dessus et affiche tous ses lieux ; un second clic ouvre ses coordonnées
        mk.bindTooltip(tEsc(l.libelle_court) + (l.n_poi ? ` · ${l.n_poi} lieu${l.n_poi > 1 ? 'x' : ''}` : ' · aucun lieu'), { direction: 'top', offset: [0, -14] });
        mk.bindPopup(`<b>${tEsc(l.libelle_court)}</b><br><span style="color:#667;">${tEsc(l.libelle_long || '')}</span>${l.adresse ? '<br>' + tEsc(l.adresse) : ''}<br><a href="#" onclick="tripSetFilter('loc','');return false;">Afficher tous les SAMU-SAS</a>`);
        mk.on('click', e => {
            if (String(trip.filters.loc) === String(l.id)) return; // déjà sélectionné : le popup s'ouvre normalement
            mk.closePopup(); tripSetFilter('loc', String(l.id));
        });
        pts.push([l.latitude, l.longitude]);
    });
    trip.pois.forEach(p => {
        if (p.latitude == null) return;
        const c = TRIP_CATS[p.category] || { color: '#607d8b', icon: 'pin' };
        const mk = L.marker([p.latitude, p.longitude], { icon: L.divIcon({ className: '', html: `<div class="tr-pin" style="background:${c.color};">${uiIcon(c.icon, 15, 'margin:0;color:#fff;stroke:#fff;')}</div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }) }).addTo(trip.layer);
        mk.bindPopup(`<div style="min-width:190px;">${tChip(p.category)}<div style="font-size:15px;font-weight:700;margin:4px 0 2px;">${tEsc(p.name)}</div>${tStars(p.avg_rating, 14)} <span style="font-size:11px;color:#667;">${p.avg_rating != null ? p.avg_rating.toFixed(1).replace('.', ',') + ' (' + p.n_ratings + ')' : 'non noté'}</span>
            <div style="font-size:12px;color:#556;margin-top:3px;">${tEsc(p.address || '')}</div><div style="font-size:11px;color:#778;">${tEsc(p.loc_court)}${p.distance_km != null ? ' · ' + String(p.distance_km).replace('.', ',') + ' km' : ''}</div>
            <a href="#" onclick="tripScrollTo(${p.id});return false;" style="font-size:12px;">Voir la fiche</a></div>`);
        mk.on('click', () => tripScrollTo(p.id, true));
        trip.markers[p.id] = mk; pts.push([p.latitude, p.longitude]);
    });
    // Sans filtre : vue d'ensemble de la France métropolitaine ; avec un filtre : cadrage sur les points affichés
    const f = trip.filters, noFilter = !f.loc && !f.cat && !f.creator && !f.q.trim();
    setTimeout(() => {
        trip.map.invalidateSize();
        if (noFilter || !pts.length) trip.map.fitBounds(TRIP_FRANCE, { padding: [8, 8] });
        else if (pts.length === 1) trip.map.setView(pts[0], 14);
        else trip.map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    }, 80);
}
function tripFocus(id) {
    const mk = trip.markers[id], el = document.getElementById('trMap');
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 170), behavior: 'smooth' });
    if (mk && trip.map) { trip.map.setView(mk.getLatLng(), Math.max(trip.map.getZoom(), 15)); mk.openPopup(); }
}
function tripScrollTo(id, quiet) {
    const c = document.getElementById('trCard_' + id); if (!c) return;
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelectorAll('#trList .tr-card.hl').forEach(x => x.classList.remove('hl'));
    c.classList.add('hl'); setTimeout(() => c.classList.remove('hl'), 2500);
}

// ── Avis, notes et commentaires ────────────────────────────────────────────
async function tripToggleReviews(id, forceOpen) {
    const box = document.getElementById('trRev_' + id); if (!box) return;
    const st = trip.detail[id] = trip.detail[id] || {};
    if (!forceOpen && box.style.display !== 'none') { box.style.display = 'none'; st.open = false; return; }
    st.open = true; box.style.display = 'block';
    try { st.data = await tApi(`/poi/${id}`); } catch (e) { box.innerHTML = `<p style="color:#b3261e;">${tEsc(e.message)}</p>`; return; }
    tripRenderReviews(id);
}
function tripRenderReviews(id) {
    const box = document.getElementById('trRev_' + id), d = trip.detail[id] && trip.detail[id].data; if (!box || !d) return;
    const mine = d.ratings.find(r => r.user_id === trip.userId);
    const st = trip.detail[id];
    box.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;"><b style="font-size:13px;">Ma note</b> ${tStarInput(mine ? mine.rating : 0, `tripRate.bind(null,${id})`, 24)}
            ${mine ? `<a href="#" onclick="tripUnrate(${id});return false;" style="font-size:12px;color:#b3261e;">retirer ma note</a>` : '<span style="font-size:12px;color:#8a97a8;">Cliquez sur une étoile pour noter ce lieu</span>'}</div>
        ${d.ratings.length ? `<div style="font-size:12px;color:#6b7a8d;margin-bottom:10px;">Notes : ${d.ratings.map(r => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;" title="Le ${tFmt(r.updated_at)}">${tStars(r.rating, 11)} ${tEsc(r.author)}${r.can_edit && r.user_id !== trip.userId && trip.isAdmin ? ` <a href="#" onclick="tripUnrate(${id},${r.user_id});return false;" title="Supprimer cette note" style="color:#b3261e;">×</a>` : ''}</span>`).join('')}</div>` : ''}
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;">Commentaires (${d.comments.length})</div>
        ${d.comments.length ? d.comments.map(c => `<div class="tr-rv" id="trC_${c.id}"><div style="font-size:12px;color:#6b7a8d;display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><b style="color:#2c3e50;">${tEsc(c.author)}</b> le ${tFmt(c.created_at)}${c.updated_at !== c.created_at ? ' · modifié le ' + tFmt(c.updated_at) : ''}
            ${c.can_edit ? `<span style="margin-left:auto;display:inline-flex;gap:6px;"><a href="#" onclick="tripEditComment(${id},${c.id});return false;">Modifier</a><a href="#" style="color:#b3261e;" onclick="tripDeleteComment(${id},${c.id});return false;">Supprimer</a></span>` : ''}</div>
            <div style="white-space:pre-wrap;margin-top:3px;">${tEsc(c.text)}</div></div>`).join('') : '<div style="font-size:12px;color:#8a97a8;">Aucun commentaire pour le moment.</div>'}
        <div style="margin-top:8px;"><textarea id="trNew_${id}" rows="2" maxlength="2000" placeholder="Ajouter un commentaire…" style="width:100%;padding:8px 10px;border:1px solid #cfd8e6;border-radius:8px;font-size:13px;box-sizing:border-box;">${tEsc(st.draft || '')}</textarea>
            <div style="text-align:right;margin-top:4px;"><button type="button" class="tr-btn pri" onclick="tripAddComment(${id})">${uiIcon('comment', 14, 'margin:0;')}Publier</button></div></div>`;
    const ta = document.getElementById('trNew_' + id); if (ta) ta.addEventListener('input', () => { st.draft = ta.value; });
}
async function tripRefreshOne(id) {
    try {
        await tripFetch();
    } catch (e) { /* ignoré */ }
}
async function tripRate(id, n) { try { await tApi(`/poi/${id}/rating`, { method: 'PUT', body: JSON.stringify({ rating: n }) }); await tripFetch(); } catch (e) { alert(e.message); } }
async function tripUnrate(id, userId) { try { await tApi(`/poi/${id}/rating${userId ? '?user_id=' + userId : ''}`, { method: 'DELETE' }); await tripFetch(); } catch (e) { alert(e.message); } }
async function tripAddComment(id) {
    const ta = document.getElementById('trNew_' + id); const text = ta ? ta.value.trim() : '';
    if (!text) { alert('Saisissez un commentaire.'); return; }
    try { await tApi(`/poi/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }); trip.detail[id].draft = ''; await tripFetch(); } catch (e) { alert(e.message); }
}
function tripEditComment(id, cid) {
    const c = trip.detail[id].data.comments.find(x => x.id === cid); const row = document.getElementById('trC_' + cid); if (!c || !row) return;
    row.innerHTML = `<textarea id="trEd_${cid}" rows="3" maxlength="2000" style="width:100%;padding:8px 10px;border:1px solid #1d70b7;border-radius:8px;font-size:13px;box-sizing:border-box;">${tEsc(c.text)}</textarea>
        <div style="text-align:right;margin-top:4px;display:flex;gap:6px;justify-content:flex-end;"><button type="button" class="tr-btn" onclick="tripRenderReviews(${id})">Annuler</button><button type="button" class="tr-btn pri" onclick="tripSaveComment(${id},${cid})">Enregistrer</button></div>`;
}
async function tripSaveComment(id, cid) {
    const text = (document.getElementById('trEd_' + cid) || {}).value || '';
    try { await tApi(`/poi/comments/${cid}`, { method: 'PUT', body: JSON.stringify({ text }) }); await tripFetch(); } catch (e) { alert(e.message); }
}
async function tripDeleteComment(id, cid) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    try { await tApi(`/poi/comments/${cid}`, { method: 'DELETE' }); await tripFetch(); } catch (e) { alert(e.message); }
}
async function tripDelete(id) {
    const p = trip.pois.find(x => x.id === id); if (!p) return;
    if (!confirm(`Supprimer « ${p.name} » ainsi que ses commentaires et ses notes ?`)) return;
    try { await tApi(`/poi/${id}`, { method: 'DELETE' }); delete trip.detail[id]; await tripFetch(); } catch (e) { alert(e.message); }
}

// ── Formulaire d'ajout / modification (avec complétion par la base de référence) ──
function tripOpenForm(id) {
    const p = id ? trip.pois.find(x => x.id === id) : null;
    const loc = p ? p.location_id : (trip.filters.loc ? Number(trip.filters.loc) : '');
    trip.formState = { id: p ? p.id : null, category: p ? p.category : (trip.filters.cat || ''), latitude: p ? p.latitude : null, longitude: p ? p.longitude : null, osm_ref: p ? p.osm_ref : '', rating: 0, website: p ? p.website || '' : '', phone: p ? p.phone || '' : '' };
    const m = trip.meta || { locations: [] };
    document.getElementById('tripBox').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;border:none;padding:0;">${p ? 'Modifier le lieu' : 'Ajouter un lieu'}</h3><button type="button" class="tr-btn" onclick="tripCloseForm()">✕</button></div>
        <label class="l" for="tfLoc">SAMU-SAS de rattachement *</label>
        <select id="tfLoc" onchange="tripFormLocChanged()"><option value="">— Choisir —</option>${m.locations.map(l => `<option value="${l.id}" ${Number(loc) === l.id ? 'selected' : ''}>${tEsc(l.libelle_court)}${l.latitude == null ? ' (non géolocalisé)' : ''}</option>`).join('')}</select>
        <label class="l">Typologie *</label>
        <div class="tr-cats" id="tfCats" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
        <label class="l" for="tfName">Nom du lieu * <span style="font-weight:400;color:#8a97a8;">— tapez le nom : les lieux connus (OpenStreetMap) autour du SAMU-SAS sont proposés</span></label>
        <div style="position:relative;"><input type="text" id="tfName" maxlength="120" autocomplete="off" value="${tEsc(p ? p.name : '')}" oninput="tripFormNameInput()" placeholder="Ex : Hôtel Ibis, Brasserie du Port…"><div id="tfSug" class="tr-sug" style="display:none;"></div></div>
        <div id="tfSugMsg" style="font-size:11px;color:#8a97a8;margin-top:3px;"></div>
        <label class="l" for="tfAddr">Adresse</label>
        <input type="text" id="tfAddr" maxlength="250" value="${tEsc(p ? p.address || '' : '')}" oninput="tripFormAddrInput()" placeholder="Remplie automatiquement ; modifiable">
        <div id="tfGeo" style="font-size:12px;margin-top:3px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><label class="l" for="tfPhone">Téléphone</label><input type="text" id="tfPhone" maxlength="40" value="${tEsc(p ? p.phone || '' : '')}"></div>
            <div><label class="l" for="tfWeb">Site web</label><input type="text" id="tfWeb" maxlength="250" value="${tEsc(p ? p.website || '' : '')}"></div></div>
        <label class="l" for="tfComment">Mon commentaire (pourquoi cette adresse ?)</label>
        <textarea id="tfComment" rows="3" maxlength="2000" placeholder="Prix, ambiance, accès, conseils…">${tEsc(p ? p.comment || '' : '')}</textarea>
        ${p ? '' : `<label class="l">Ma note</label><div id="tfRate">${tStarInput(0, 'tripFormRate', 26)}</div>`}
        <div id="tfErr" style="color:#b3261e;font-size:13px;margin-top:8px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;"><button type="button" class="tr-btn" onclick="tripCloseForm()">Annuler</button><button type="button" class="tr-btn pri" onclick="tripSave()">${uiIcon('check', 14, 'margin:0;')}Enregistrer</button></div>`;
    tripFormCats(); tripFormGeo();
    document.getElementById('tripModal').classList.add('on');
}
function tripCloseForm() { document.getElementById('tripModal').classList.remove('on'); trip.formState = null; }
function tripFormCats() {
    const s = trip.formState; const box = document.getElementById('tfCats'); if (!box) return;
    box.innerHTML = Object.entries(TRIP_CATS).map(([k, c]) => `<span class="tr-cat ${s.category === k ? 'on' : ''}" style="${s.category === k ? 'background:' + c.color + ';' : ''}padding:8px 14px;" onclick="trip.formState.category='${k}';tripFormCats();">${uiIcon(c.icon, 16, 'margin:0;')}${c.label}</span>`).join('');
}
function tripFormGeo() {
    const s = trip.formState, g = document.getElementById('tfGeo'); if (!g) return;
    g.innerHTML = s.latitude != null ? `<span style="color:#1b7f3b;">✔ Position repérée (${Number(s.latitude).toFixed(5)}, ${Number(s.longitude).toFixed(5)})</span>` : '<span style="color:#8a97a8;">La position sera calculée à partir de l\'adresse à l\'enregistrement.</span>';
}
function tripFormRate(n) { trip.formState.rating = n; document.getElementById('tfRate').innerHTML = tStarInput(n, 'tripFormRate', 26); }
function tripFormLocChanged() { tripFormNameInput(true); }
function tripFormAddrInput() { const s = trip.formState; s.latitude = null; s.longitude = null; s.osm_ref = ''; tripFormGeo(); }
let tripSugTimer = null, tripSugSeq = 0;
function tripFormNameInput(force) {
    clearTimeout(tripSugTimer);
    const q = (document.getElementById('tfName') || {}).value || '';
    const box = document.getElementById('tfSug'), msg = document.getElementById('tfSugMsg');
    if (q.trim().length < 3) { box.style.display = 'none'; msg.textContent = ''; return; }
    tripSugTimer = setTimeout(async () => {
        const seq = ++tripSugSeq, loc = (document.getElementById('tfLoc') || {}).value || '';
        msg.textContent = 'Recherche dans la base de référence…';
        try {
            const d = await tApi(`/poi/places?q=${encodeURIComponent(q.trim())}${loc ? '&location_id=' + loc : ''}`);
            if (seq !== tripSugSeq) return;
            trip.sugs = d.places;
            box.innerHTML = d.places.map((x, i) => `<div onclick="tripPickPlace(${i})"><b>${tEsc(x.name)}</b>${x.category ? ' ' + tChip(x.category) : ''}<br><span style="font-size:12px;color:#6b7a8d;">${tEsc(x.address || '')}${x.distance_km != null ? ' · ' + String(x.distance_km).replace('.', ',') + ' km du SAMU-SAS' : ''}</span></div>`).join('');
            box.style.display = d.places.length ? 'block' : 'none';
            msg.textContent = d.places.length ? 'Choisissez une suggestion pour compléter l\'adresse et la position (source : OpenStreetMap), ou continuez la saisie manuelle.' : 'Aucune suggestion : saisissez l\'adresse manuellement.';
        } catch (e) { if (seq === tripSugSeq) { msg.textContent = 'Base de référence indisponible : saisie manuelle possible.'; box.style.display = 'none'; } }
    }, force ? 50 : 500);
}
function tripPickPlace(i) {
    const x = (trip.sugs || [])[i], s = trip.formState; if (!x) return;
    document.getElementById('tfName').value = x.name;
    document.getElementById('tfAddr').value = x.address || '';
    if (x.phone) document.getElementById('tfPhone').value = x.phone;
    if (x.website) document.getElementById('tfWeb').value = x.website;
    s.latitude = x.latitude; s.longitude = x.longitude; s.osm_ref = x.osm_ref || '';
    if (x.category) s.category = x.category;
    document.getElementById('tfSug').style.display = 'none'; document.getElementById('tfSugMsg').textContent = 'Informations complétées depuis OpenStreetMap : vérifiez-les avant d\'enregistrer.';
    tripFormCats(); tripFormGeo();
}
async function tripSave() {
    const s = trip.formState, err = document.getElementById('tfErr'); err.textContent = '';
    const g = id => (document.getElementById(id) || {}).value || '';
    const body = { location_id: Number(g('tfLoc')), category: s.category, name: g('tfName').trim(), address: g('tfAddr').trim(), latitude: s.latitude, longitude: s.longitude, osm_ref: s.osm_ref, phone: g('tfPhone').trim(), website: g('tfWeb').trim(), comment: g('tfComment').trim(), rating: s.rating || undefined };
    try {
        await tApi(s.id ? `/poi/${s.id}` : '/poi', { method: s.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        tripCloseForm(); await tripFetch();
    } catch (e) { err.textContent = e.message; }
}
document.addEventListener('click', e => { const b = document.getElementById('tfSug'); if (b && !(e.target.closest && e.target.closest('#tfName, #tfSug'))) b.style.display = 'none'; });
