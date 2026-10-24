// analyse
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

// ═══════════════════════════════════════════════════════
// APPLICATION ANALYSE DE FICHIERS
// Tout le traitement est local (FileReader + SheetJS)
// ═══════════════════════════════════════════════════════

let _analyseData = [];
let _analyseHeaders = [];
let _analyseColTypes = {};
let _analyseColValues = {};
// Filtres : col -> null | scalar (enum/text/date) | { groups:[{tokens:[]},...] } (list)
let _analyseFilters = {};
let _analysePage = 1;
let _analysePageSize = 100;
let _analyseVisibleCols = [];
// Détection doublons
let _analyseDupCols = []; // colonnes sélectionnées pour la clé doublon
let _analyseDupKeys = new Set(); // clés qui apparaissent plus d'une fois

// ── Drag & drop état global pour les filtres list ─────
let _aDrag = null; // { col, gi, ti } token en cours de glisser

// ── Map col -> {builderEl, vals} pour refresh ciblé ──
const _aListMap = new Map();

// ── Compteur d'ID pour éviter les conflits de noms ───
let _aColSeq = 0;
const _aColId = new Map(); // col -> identifiant sûr

// ══════════════════════════════════════════════════════════════
//  IndexedDB — persistance locale du fichier Analyse
// ══════════════════════════════════════════════════════════════
const _analyseIDB = (() => {
    const DB = 'analyseLocalFile',
        STORE = 'files',
        KEY = 'last';
    const open = () =>
        new Promise((res, rej) => {
            const r = indexedDB.open(DB, 1);
            r.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
            r.onsuccess = e => res(e.target.result);
            r.onerror = e => rej(e.target.error);
        });
    return {
        save: async (name, buffer) => {
            const db = await open();
            return new Promise((res, rej) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put({ name, buffer, savedAt: Date.now() }, KEY);
                tx.oncomplete = res;
                tx.onerror = e => rej(e.target.error);
            });
        },
        load: async () => {
            const db = await open();
            return new Promise((res, rej) => {
                const r = db.transaction(STORE).objectStore(STORE).get(KEY);
                r.onsuccess = e => res(e.target.result || null);
                r.onerror = e => rej(e.target.error);
            });
        },
        del: async () => {
            const db = await open();
            return new Promise((res, rej) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(KEY);
                tx.oncomplete = res;
                tx.onerror = e => rej(e.target.error);
            });
        }
    };
})();

let _analyseSaveLocal = false;

async function analyseCheckSaved() {
    try {
        const rec = await _analyseIDB.load();
        const bar = document.getElementById('analyseSavedFileBar');
        if (rec) {
            document.getElementById('analyseSavedFileName').textContent = rec.name;
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    } catch (e) {}
}

async function analyseLoadSaved() {
    try {
        const rec = await _analyseIDB.load();
        if (!rec) return;
        document.getElementById('analyseLoadProgress').style.display = 'block';
        document.getElementById('analyseDropTarget').style.display = 'none';
        // Construire un File-like depuis le buffer sauvegardé
        const blob = new Blob([rec.buffer]);
        const file = new File([blob], rec.name);
        analyseHandleFile(file, rec.buffer);
    } catch (e) {
        alert('Impossible de charger le fichier sauvegardé : ' + e.message);
    }
}

async function analyseDeleteSaved() {
    await _analyseIDB.del();
    document.getElementById('analyseSavedFileBar').style.display = 'none';
    _analyseSaveLocal = false;
    const chk = document.getElementById('analyseSaveLocalChk');
    if (chk) chk.checked = false;
}

function analyseToggleSaveLocal(checked) {
    _analyseSaveLocal = checked;
}

// ── Toggle du panneau filtres ─────────────────────────────────
let _analyseFiltersVisible = true;
function toggleAnalyseFiltersPanel() {
    _analyseFiltersVisible = !_analyseFiltersVisible;
    const panel = document.getElementById('analyseFiltersPanel');
    const btn = document.getElementById('analyseFilterToggleBtn');
    panel.style.display = _analyseFiltersVisible ? 'grid' : 'none';
    if (btn) btn.textContent = _analyseFiltersVisible ? '▲' : '▼';
}

// ---- Bandeau de l'application Analyse (utilisateur, connectés, minuteur) ----
let _analyseTimerLoop = null,
    _analyseOnlineLoop = null;
function analyseUpdateUser() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    const full = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || currentUser.username;
    document.getElementById('analyseUserDisplayName').textContent = full;
    document.getElementById('analyseUserDisplayRole').textContent =
        currentUser.activeProfile === 'admin'
            ? 'Administrateur'
            : currentUser.activeProfile === 'expert'
              ? 'Expert Métier'
              : 'Utilisateur';
    const tri = document.getElementById('analyseProfileTrigramme'),
        photo = document.getElementById('analyseProfilePhoto');
    tri.textContent = currentUser.trigramme || '?';
    if (currentUser.profilePhoto) {
        photo.src = currentUser.profilePhoto;
        photo.style.display = 'block';
        tri.style.display = 'none';
    } else {
        photo.style.display = 'none';
        tri.style.display = 'flex';
    }
}
function analyseIsVisible() {
    const c = document.getElementById('analyseContainer');
    return !!c && c.style.display !== 'none';
}
function analyseStopLoops() {
    clearInterval(_analyseTimerLoop);
    clearInterval(_analyseOnlineLoop);
    _analyseTimerLoop = _analyseOnlineLoop = null;
}
function analyseRenderTimer() {
    if (!analyseIsVisible()) {
        analyseStopLoops();
        return;
    }
    const el = document.getElementById('analyseTimerText');
    if (!el || typeof inactivityTimeRemaining === 'undefined') return;
    const t = Math.max(0, inactivityTimeRemaining);
    el.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    document.getElementById('analyseTimerDisplay').style.color = t <= 60 ? '#e74c3c' : t <= 120 ? '#f39c12' : '#2c3e50';
}
async function analyseRefreshOnline() {
    if (!analyseIsVisible()) {
        analyseStopLoops();
        return;
    }
    try {
        const res = await fetch(`${API_URL}/active-sessions`, { credentials: 'include' });
        if (!res.ok) return;
        const users = (await res.json()).activeUsers || [];
        const max = 5,
            esc2 = t =>
                String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
        document.getElementById('analyseOnlineUsersAvatars').innerHTML = users
            .slice(0, max)
            .map((u, i) => {
                const bg = typeof getAvatarColor === 'function' ? getAvatarColor(u.profile) : '#3949ab';
                const ini = u.trigramme || (u.prenom || '').charAt(0) + (u.nom || '').charAt(0);
                const name = `${u.prenom || ''} ${u.nom || ''}`.trim() || u.username || '';
                const base = `width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:${bg};margin-left:${i ? -8 : 0}px;box-shadow:0 1px 3px rgba(0,0,0,.25);overflow:hidden;`;
                return u.profilePhoto
                    ? `<div title="${esc2(name)}" style="${base}"><img src="${u.profilePhoto}" alt="" style="width:100%;height:100%;object-fit:cover;"></div>`
                    : `<div title="${esc2(name)}" style="${base}display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">${esc2(ini)}</div>`;
            })
            .join('');
        document.getElementById('analyseOnlineUsersCount').textContent =
            users.length > max ? `+${users.length - max}` : '';
    } catch (e) {
        /* réseau indisponible : on garde l'affichage précédent */
    }
}
async function analyseLogout() {
    if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
    analyseStopLoops();
    document.getElementById('analyseContainer').style.display = 'none';
    await performLogout();
}

function showAnalyseApp() {
    if (window.hideAffectationApp) hideAffectationApp();
    document.querySelector('.container').style.display = 'none';
    document.getElementById('deplacementsContainer').style.display = 'none';
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('analyseContainer').style.display = 'block';
    document.getElementById('backToPlanificationBtn').style.display = 'none'; // le menu Applications suffit pour changer d'application
    document.getElementById('analyseOnlineUsersContainer').style.display = 'flex';
    document.getElementById('analyseTimerDisplay').style.display = 'flex';
    analyseUpdateUser();
    stopInactivityTimer();
    if (typeof onlineUsersInterval !== 'undefined' && onlineUsersInterval) {
        clearInterval(onlineUsersInterval);
        onlineUsersInterval = null;
    }
    analyseStopLoops();
    const startTimer = () => {
        try {
            startInactivityTimer(inactivityTimeout);
        } catch (e) {
            /* minuteur indisponible */
        }
    };
    (typeof loadSettingsForDeplacements === 'function' ? loadSettingsForDeplacements() : Promise.resolve()).then(
        startTimer
    );
    _analyseTimerLoop = setInterval(analyseRenderTimer, 1000);
    analyseRefreshOnline();
    _analyseOnlineLoop = setInterval(analyseRefreshOnline, 30000);
    updateAppSwitcher();
    if (window.GPTools) window.GPTools.position();
    analyseCheckSaved();
}

function analyseReset() {
    _analyseData = [];
    _analyseHeaders = [];
    _analyseColTypes = {};
    _analyseColValues = {};
    _analyseFilters = {};
    _analysePage = 1;
    _analyseVisibleCols = [];
    _aListMap.clear();
    _aColId.clear();
    _aColSeq = 0;
    _aDrag = null;
    _analyseDupCols = [];
    _analyseDupKeys = new Set();
    document.getElementById('analyseDupPanel').style.display = 'none';
    document.getElementById('analyseDupCount').textContent = '';
    _analyseTxtCtx = null;
    _analyseFileMeta = null;
    document.getElementById('analyseStructPanel').style.display = 'none';
    document.getElementById('analyseEncodingBanner').style.display = 'none';
    document.getElementById('analyseDropZone').style.display = 'flex';
    document.getElementById('analyseDropTarget').style.display = 'block';
    document.getElementById('analyseLoadProgress').style.display = 'none';
    document.getElementById('analyseWorkspace').style.display = 'none';
    document.getElementById('analyseFileName').textContent = '';
    document.getElementById('analyseStatsHeader').textContent = '';
    document.getElementById('analyseResetBtn').style.display = 'none';
    document.getElementById('analyseFileInput').value = '';
}

function analyseHandleDrop(event) {
    event.preventDefault();
    const dt = event.dataTransfer;
    const file = dt.files && dt.files[0];
    document.getElementById('analyseDropTarget').style.borderColor = '#90caf9';
    document.getElementById('analyseDropTarget').style.background = '#f3f8ff';
    if (file) analyseHandleFile(file);
}

// Détection et décodage automatique de l'encodage d'un CSV
function _analyseDecode(buffer) {
    const b = new Uint8Array(buffer);
    // BOM UTF-8 : EF BB BF
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)
        return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'UTF-8 (BOM)' };
    // BOM UTF-16 LE : FF FE
    if (b[0] === 0xff && b[1] === 0xfe)
        return { text: new TextDecoder('utf-16le').decode(buffer), encoding: 'UTF-16 LE' };
    // BOM UTF-16 BE : FE FF
    if (b[0] === 0xfe && b[1] === 0xff)
        return { text: new TextDecoder('utf-16be').decode(buffer), encoding: 'UTF-16 BE' };
    // Tentative UTF-8 strict (fatal=true lève une erreur si séquence invalide)
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        // Vérification secondaire : mojibake typique (ex. "Ã©" = é UTF-8 lu Latin-1, réencodé UTF-8)
        // Si le texte contient des séquences Ã + lettre accentuée, c'est probablement du Windows-1252
        if (/Ã[À-ÿ]/.test(text))
            return {
                text: new TextDecoder('windows-1252').decode(buffer),
                encoding: 'Windows-1252 (détecté via mojibake)'
            };
        return { text, encoding: 'UTF-8' };
    } catch (e) {
        // UTF-8 invalide → Windows-1252 (superset de Latin-1, couvre tous les accents français)
        return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'Windows-1252 / Latin-1' };
    }
}

// ── Fichiers texte (.txt/.tsv) : séparateur, colonnes, en-têtes ─────────────
let _analyseTxtCtx = null; // { name, encoding, table, delim, widths, buffer }
let _analyseFileMeta = null;

function _aSplitLine(line, d) {
    const out = [];
    let cur = '',
        q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
            if (c === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else q = false;
            } else cur += c;
        } else if (c === '"' && cur === '') q = true;
        else if (c === d) {
            out.push(cur);
            cur = '';
        } else cur += c;
    }
    out.push(cur);
    return out;
}
function _aDelimName(d) {
    return { '\t': 'tabulation', ';': 'point-virgule', '|': 'barre verticale', ',': 'virgule' }[d] || d;
}

// Détection du séparateur : celui qui donne un nombre de champs (≥2) le plus constant
function _aDetectDelim(lines) {
    const sample = lines.slice(0, 200);
    let best = null;
    for (const d of ['\t', ';', '|', ',']) {
        const counts = sample.map(l => _aSplitLine(l, d).length);
        const freq = new Map();
        counts.forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
        let mode = 0,
            mf = 0;
        freq.forEach((f, c) => {
            if (f > mf || (f === mf && c > mode)) {
                mode = c;
                mf = f;
            }
        });
        let ratio = mf / sample.length;
        // lignes de titre au-dessus : on mesure la régularité à partir de la 1re ligne au bon nombre de champs
        const idx = counts.indexOf(mode);
        if (ratio < 0.8 && mode >= 2 && idx > 0 && idx <= 12) {
            const suf = counts.slice(idx);
            if (suf.length >= 3) ratio = suf.filter(c => c === mode).length / suf.length;
        }
        if (mode >= 2 && ratio >= 0.8) {
            const score = ratio * 100 + Math.min(mode, 30);
            if (!best || score > best.score) best = { d, n: mode, score };
        }
    }
    return best ? best.d : null;
}

// Colonnes à largeur fixe : positions où (presque) toutes les lignes ont un espace
function _aDetectWidths(lines) {
    const sample = lines.slice(0, 200);
    const w = Math.max(...sample.map(l => l.length));
    if (w < 10 || sample.length < 3) return null;
    const blank = new Array(w).fill(0);
    sample.forEach(l => {
        for (let i = 0; i < w; i++) if (i >= l.length || l[i] === ' ') blank[i]++;
    });
    const isGap = i => blank[i] >= sample.length * 0.97;
    const starts = [];
    let inCol = false;
    for (let i = 0; i < w; i++) {
        if (!isGap(i) && !inCol) {
            starts.push(i);
            inCol = true;
        } else if (isGap(i)) inCol = false;
    }
    return starts.length >= 2 ? starts : null;
}

function _aParseText(text) {
    const lines = text
        .replace(/^﻿/, '')
        .split(/\r\n|\n|\r/)
        .filter(l => l.trim() !== '');
    if (!lines.length) throw new Error('Le fichier est vide');
    const delim = _aDetectDelim(lines);
    let table,
        widths = null;
    if (delim) table = lines.map(l => _aSplitLine(l, delim));
    else {
        widths = _aDetectWidths(lines);
        if (widths) table = lines.map(l => widths.map((st, i) => l.slice(st, widths[i + 1] ?? l.length).trim()));
        else table = lines.map(l => [l.trim()]);
    }
    return { table, delim, widths };
}

// Groupe de type d'une valeur (pour comparer la 1re ligne au reste de la colonne)
function _aGroup(v) {
    v = (v || '').toString().trim();
    if (v === '') return 'empty';
    for (const [k, , f] of _A_KINDS)
        if (f(v)) return k === 'int' || k === 'dec' ? 'num' : k === 'datetime' ? 'date' : k;
    return 'text';
}
// La 1re ligne est-elle un en-tête ? Comparaison de son type à celui du reste de chaque colonne.
// strict=true (txt) : en-tête seulement si indices positifs ; strict=false (xlsx/csv) : en-tête sauf indice contraire.
function _aDetectHeader(table, strict) {
    if (table.length < 2) return !strict;
    const n = Math.max(...table.slice(0, 50).map(r => r.length));
    const rest = table.slice(1, 501);
    let evidence = 0,
        against = 0,
        typed = 0;
    const first = [];
    for (let c = 0; c < n; c++) {
        const f = (table[0][c] ?? '').toString().trim();
        first.push(f);
        const groups = rest.map(r => _aGroup(r[c])).filter(g => g !== 'empty');
        if (!groups.length) continue;
        const cnt = {};
        groups.forEach(g => (cnt[g] = (cnt[g] || 0) + 1));
        const [dom, dn] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
        if (dom === 'text' || dn / groups.length < 0.9) continue;
        typed++;
        const fg = _aGroup(f);
        if (fg === dom) against++;
        else if (fg === 'text') evidence++;
    }
    if (!strict) return !(against > 0 && evidence === 0);
    if (against > 0) return false;
    if (evidence > 0) return true;
    // Fichier tout texte : valeurs de la 1re ligne renseignées, uniques, courtes, absentes du reste de leur colonne
    if (first.some(v => v === '' || v.length > 60)) return false;
    if (new Set(first.map(v => v.toLowerCase())).size !== first.length) return false;
    return first.every((v, c) => !rest.some(r => (r[c] ?? '').toString().trim().toLowerCase() === v.toLowerCase()));
}

// headerRow : n° (1 = 1re ligne) de la ligne d'intitulés, 0 = aucune ; dataStart : index de la 1re ligne de données
function _aTableToRows(table, headerRow, dataStart) {
    const n = table.reduce((m, r) => (r.length > m ? r.length : m), 0);
    const hasHeader = headerRow > 0;
    let headers;
    if (hasHeader) headers = (table[headerRow - 1] || []).map((v, i) => (v || '').trim() || 'Colonne ' + (i + 1));
    else headers = Array.from({ length: n }, (_, i) => 'Colonne ' + (i + 1));
    while (headers.length < n) headers.push('Colonne ' + (headers.length + 1));
    const seen = {};
    headers = headers.map(h => {
        seen[h] = (seen[h] || 0) + 1;
        return seen[h] > 1 ? h + ' (' + seen[h] + ')' : h;
    });
    return table.slice(dataStart).map(r => {
        const o = {};
        headers.forEach((h, i) => {
            o[h] = (r[i] ?? '').toString().trim();
        });
        return o;
    });
}

// Repère la ligne d'intitulés : les lignes de titre / vides au-dessus (moins de cellules remplies) sont ignorées
function _aAutoHeader(table, strict) {
    const filled = table.map(r => r.filter(v => (v ?? '').toString().trim() !== '').length);
    const body = filled
        .slice(0, 200)
        .filter(n => n > 0)
        .sort((a, b) => a - b);
    const typical = body.length ? body[Math.floor(body.length / 2)] : 1;
    let start = 0;
    const lim = Math.min(table.length - 1, 12);
    for (let i = 0; i <= lim; i++) {
        if (filled[i] >= Math.max(2, typical * 0.7) || (typical < 2 && filled[i] >= 1)) {
            start = i;
            break;
        }
    }
    const header = _aDetectHeader(table.slice(start), strict);
    return header
        ? { headerRow: start + 1, dataStart: start + 1, skipped: start }
        : { headerRow: 0, dataStart: start, skipped: start };
}

function analyseSetHeaderRow(val) {
    if (!_analyseTxtCtx) return;
    const c = _analyseTxtCtx;
    let k = Math.max(0, Math.min(parseInt(val, 10) || 0, Math.min(c.table.length - 1, 50)));
    const rows = _aTableToRows(c.table, k, k > 0 ? k : 0);
    _analyseIngest(
        rows,
        c.name,
        c.encoding,
        Object.assign({}, c.meta, { hasHeader: k > 0, headerRow: k, skipped: k > 0 ? k - 1 : 0, headerAuto: false })
    );
}

function analyseHandleFile(file, preloadedBuffer) {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isText = name.endsWith('.txt') || name.endsWith('.tsv');
    if (!isText && !name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        alert('Format non supporté. Utilisez .xlsx, .xls, .csv ou .txt');
        return;
    }
    document.getElementById('analyseLoadProgress').style.display = 'block';
    document.getElementById('analyseDropTarget').style.display = 'none';

    const processBuffer = buffer => {
        try {
            let rows,
                detectedEncoding = null,
                table,
                meta = { kind: name.endsWith('.csv') ? 'csv' : 'excel' };
            if (isText) {
                const { text, encoding } = _analyseDecode(buffer);
                detectedEncoding = encoding;
                const parsed = _aParseText(text);
                table = parsed.table;
                meta = { kind: 'txt', delim: parsed.delim, widths: parsed.widths };
            } else {
                let workbook;
                if (name.endsWith('.csv')) {
                    const { text, encoding } = _analyseDecode(buffer);
                    detectedEncoding = encoding;
                    workbook = XLSX.read(text, { type: 'string', raw: false });
                } else {
                    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
                }
                // Prendre la 1ère feuille non vide
                let sheet = null;
                for (const sn of workbook.SheetNames) {
                    const s = workbook.Sheets[sn];
                    const ref = s['!ref'];
                    if (ref) {
                        const range = XLSX.utils.decode_range(ref);
                        if (range.e.r > 0) {
                            sheet = s;
                            break;
                        }
                    }
                }
                if (!sheet) throw new Error('Aucune feuille de données trouvée');
                table = XLSX.utils
                    .sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'DD/MM/YYYY HH:mm' })
                    .map(r => r.map(v => (v ?? '').toString()))
                    .filter(r => r.some(v => v.trim() !== ''));
            }
            if (!table.length) throw new Error('Le fichier ne contient pas de données');
            const ah = _aAutoHeader(table, isText);
            meta.hasHeader = ah.headerRow > 0;
            meta.headerRow = ah.headerRow;
            meta.skipped = ah.skipped;
            meta.headerAuto = true;
            _analyseTxtCtx = { name: file.name, encoding: detectedEncoding, table, meta };
            rows = _aTableToRows(table, ah.headerRow, ah.dataStart);
            if (rows.length === 0) throw new Error('Le fichier ne contient pas de données');
            _analyseIngest(rows, file.name, detectedEncoding, meta);

            // Sauvegarder dans IndexedDB si demandé
            if (_analyseSaveLocal) {
                _analyseIDB.save(file.name, buffer).catch(() => {});
                analyseCheckSaved();
            }
        } catch (err) {
            alert('Erreur lors du chargement : ' + err.message);
            document.getElementById('analyseLoadProgress').style.display = 'none';
            document.getElementById('analyseDropTarget').style.display = 'block';
        }
    };

    if (preloadedBuffer) {
        processBuffer(preloadedBuffer);
    } else {
        const reader = new FileReader();
        reader.onload = e => processBuffer(e.target.result);
        reader.readAsArrayBuffer(file);
    }
}

// Intègre un tableau de lignes (objets) : types de colonnes, filtres, affichage
function _analyseIngest(rows, fileName, detectedEncoding, meta) {
    _analyseHeaders = Object.keys(rows[0]);
    _analyseData = rows;
    _analyseFilters = {};
    _analysePage = 1;
    _analyseFileMeta = Object.assign({ fileName, encoding: detectedEncoding }, meta || {});
    _aListMap.clear();
    _aColId.clear();
    _aColSeq = 0;
    _analyseDupCols = [];
    _analyseDupKeys = new Set();
    document.getElementById('analyseDupPanel').style.display = 'none';
    document.getElementById('analyseDupCount').textContent = '';

    // Détecter le type de chaque colonne
    _analyseColTypes = {};
    _analyseColValues = {};
    for (const col of _analyseHeaders) {
        // Échantillon plus large pour la détection (jusqu'à 2000 lignes)
        const samples = rows.slice(0, Math.min(2000, rows.length)).map(r => (r[col] || '').toString().trim());
        const nonEmpty = samples.filter(v => v !== '');
        // ── Détecter date EN PRIORITÉ (avant liste et enum) ──────────────
        const dateRe = /^\d{2}\/\d{2}\/\d{4}/;
        const isDate = nonEmpty.length > 0 && nonEmpty.every(v => dateRe.test(v));
        if (isDate) {
            _analyseColTypes[col] = 'date';
            _analyseColValues[col] = [];
        } else {
            // Détecter liste (séparateur ';')
            const listCount = nonEmpty.filter(v => /\s*;\s*/.test(v)).length;
            if (listCount / Math.max(nonEmpty.length, 1) > 0.1) {
                _analyseColTypes[col] = 'list';
                const tokens = new Set();
                rows.forEach(r => {
                    const v = (r[col] || '').toString();
                    v.split(/\s*;\s*/).forEach(t => {
                        const tt = t.trim();
                        if (tt) tokens.add(tt);
                    });
                });
                _analyseColValues[col] = [...tokens].sort((a, b) => a.localeCompare(b, 'fr'));
            } else {
                const allVals = rows.map(r => (r[col] || '').toString().trim());
                const unique = [...new Set(allVals)].filter(v => v !== '');
                if (unique.length <= 200 && unique.length > 0) {
                    _analyseColTypes[col] = 'enum';
                    _analyseColValues[col] = unique.sort((a, b) => a.localeCompare(b, 'fr'));
                } else {
                    _analyseColTypes[col] = 'text';
                    _analyseColValues[col] = unique.sort((a, b) => a.localeCompare(b, 'fr'));
                }
            }
        }
    }

    _analyseVisibleCols = [..._analyseHeaders];

    document.getElementById('analyseFileName').textContent =
        '📄 ' + fileName + (detectedEncoding ? ` — encodage : ${detectedEncoding}` : '');
    document.getElementById('analyseResetBtn').style.display = 'inline-block';
    document.getElementById('analyseDropZone').style.display = 'none';
    document.getElementById('analyseWorkspace').style.display = 'block';

    // Bannière encodage pour CSV / TXT
    const encBanner = document.getElementById('analyseEncodingBanner');
    if (detectedEncoding) {
        const isWin = detectedEncoding.includes('Windows') || detectedEncoding.includes('Latin');
        encBanner.style.display = 'flex';
        encBanner.style.background = isWin ? '#fff8e1' : '#e8f5e9';
        encBanner.style.borderColor = isWin ? '#ffca28' : '#66bb6a';
        encBanner.innerHTML = `<span style="font-size:13px;">${isWin ? '⚠️' : '✅'} Encodage détecté : <strong>${detectedEncoding}</strong>${isWin ? ' — les accents ont été corrigés automatiquement' : ''}</span>`;
    } else {
        encBanner.style.display = 'none';
    }

    analyseRenderFilters();
    analyseRenderColumnCheckboxes();
    analyseApplyFilters();
    analyseRenderStruct();
    document.getElementById('analyseLoadProgress').style.display = 'none';
}

// ── Analyse de structure : type, remplissage, valeurs distinctes… ───────────
function _aEsc(v) {
    return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
function _aParseDateVal(v) {
    let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
}
function _aFmtDate(d) {
    return d
        ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()
        : '';
}
const _A_KINDS = [
    ['email', 'E-mail', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
    ['url', 'URL', v => /^(https?:\/\/|www\.)\S+$/i.test(v)],
    ['datetime', 'Date/heure', v => /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})[ T]\d{1,2}:\d{2}/.test(v)],
    ['date', 'Date', v => /^(\d{2}[\/.-]\d{2}[\/.-]\d{4}|\d{4}-\d{2}-\d{2})$/.test(v)],
    ['time', 'Heure', v => /^\d{1,2}:\d{2}(:\d{2})?$/.test(v)],
    ['bool', 'Booléen', v => /^(oui|non|true|false|vrai|faux|yes|no|o|n|x)$/i.test(v)],
    ['int', 'Entier', v => /^[+-]?\d+$/.test(v) && !/^[+-]?0\d+$/.test(v)],
    ['dec', 'Décimal', v => /^[+-]?\d+[.,]\d+$/.test(v)],
    ['phone', 'Téléphone', v => /^\+?[\d\s.()-]{8,20}$/.test(v) && (v.match(/\d/g) || []).length >= 8],
    ['code', 'Code (chiffres, 0 initial)', v => /^0\d+$/.test(v)]
];
function _aColProfile(col) {
    const vals = _analyseData.map(r => (r[col] ?? '').toString().trim());
    const ne = vals.filter(v => v !== '');
    const counts = new Map();
    ne.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const prof = { total: vals.length, filled: ne.length, empty: vals.length - ne.length, distinct: counts.size };
    prof.top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    let mn = Infinity,
        mx = 0;
    for (const v of ne) {
        if (v.length < mn) mn = v.length;
        if (v.length > mx) mx = v.length;
    }
    prof.minLen = ne.length ? mn : 0;
    prof.maxLen = mx;
    // type dominant (≥ 95 % des valeurs renseignées)
    let kind = 'text',
        label = 'Texte',
        hits = 0;
    if (ne.length) {
        const sample = ne.length > 20000 ? ne.filter((_, i) => i % Math.ceil(ne.length / 20000) === 0) : ne;
        for (const [k, l, f] of _A_KINDS) {
            const n = sample.filter(f).length;
            if (n / sample.length >= 0.95) {
                kind = k;
                label = l;
                hits = n;
                break;
            }
        }
        // int + dec mélangés → décimal
        if (kind === 'text' && sample.every(v => /^[+-]?\d+([.,]\d+)?$/.test(v))) {
            kind = 'dec';
            label = 'Décimal';
        }
        if (kind === 'text' && ne.length >= 10 && counts.size <= Math.max(2, Math.min(30, ne.length * 0.05))) {
            kind = 'cat';
            label = 'Catégorie (' + counts.size + ' valeurs)';
        }
        if (kind === 'text' && sample.filter(v => /\s*;\s*/.test(v)).length / sample.length > 0.1) {
            kind = 'list';
            label = 'Liste (séparateur « ; »)';
        }
    } else {
        label = 'Vide';
        kind = 'empty';
    }
    prof.kind = kind;
    prof.label = label;
    if (kind === 'int' || kind === 'dec') {
        const nums = ne.map(v => parseFloat(v.replace(',', '.'))).filter(n => !isNaN(n));
        if (nums.length) {
            let a = Infinity,
                b = -Infinity,
                t = 0;
            for (const x of nums) {
                if (x < a) a = x;
                if (x > b) b = x;
                t += x;
            }
            prof.min = a;
            prof.max = b;
            prof.avg = t / nums.length;
        }
    }
    if (kind === 'date' || kind === 'datetime') {
        const ds = ne
            .map(_aParseDateVal)
            .filter(Boolean)
            .map(d => d.getTime());
        if (ds.length) {
            let a = Infinity,
                b = -Infinity;
            for (const x of ds) {
                if (x < a) a = x;
                if (x > b) b = x;
            }
            prof.dmin = new Date(a);
            prof.dmax = new Date(b);
        }
    }
    prof.unique = ne.length > 0 && counts.size === ne.length && prof.empty === 0;
    return prof;
}
// ── Mapping proposé : rôle de chaque colonne d'après l'entête ou le contenu ──
const _A_ROLES = [
    ['Nom complet', /\b(nom complet|nom prenom|nom et prenom|full ?name|identite)\b/, ['text']],
    ['Prénom', /\b(prenom|first ?name|given name)\b/, ['text']],
    ['Nom', /^(nom|nom de famille|name|last ?name|surname|patronyme)$/, ['text']],
    ['E-mail', /\b(e ?mail|courriel|mel|mail)\b/, ['email']],
    ['Téléphone', /\b(tel|telephone|mobile|portable|gsm|fax|phone)\b/, ['phone', 'code', 'num']],
    ['Date', /\b(date|jour|naissance|debut|fin|creation|modification|echeance)\b/, ['date']],
    [
        'Service / Direction',
        /\b(service|direction|departement|entite|organisation|societe|structure|etablissement|site)\b/,
        null
    ],
    ['Fonction', /\b(fonction|poste|titre|metier|emploi|grade)\b/, null],
    ['Profil / Rôle', /\b(profil|role|droit|habilitation|groupe)\b/, null],
    ['Statut', /\b(statut|etat|status|actif|active)\b/, null],
    ['Login', /\b(login|username|user|utilisateur|compte)\b/, null],
    ['Adresse', /\b(adresse|rue|voie)\b/, ['text']],
    ['Code postal', /\b(cp|code postal|zip)\b/, ['num', 'code']],
    ['Ville', /\b(ville|commune|localite)\b/, ['text']],
    ['Montant', /\b(montant|prix|cout|total|tarif|salaire)\b/, ['num']],
    ['Commentaire', /\b(commentaire|remarque|observation|note|description|libelle)\b/, null],
    ['Identifiant', /\b(id|identifiant|matricule|uid|ref|reference|numero|num|code)\b/, null]
];
function _aNorm(v) {
    return (v || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function _aProposeRole(col, p, hasHeader) {
    const generated = /^Colonne \d+$/.test(col);
    const grp = p.kind === 'int' || p.kind === 'dec' ? 'num' : p.kind === 'datetime' ? 'date' : p.kind;
    if (hasHeader && !generated) {
        const n = _aNorm(col);
        for (const [label, re, kinds] of _A_ROLES) {
            if (re.test(n)) {
                const ok =
                    !kinds ||
                    p.kind === 'empty' ||
                    kinds.includes(grp) ||
                    (kinds.includes('text') && ['cat', 'list', 'text'].includes(grp));
                return {
                    label,
                    source: 'entête',
                    conf: ok ? 'haute' : 'faible',
                    warn: ok ? '' : 'le contenu ressemble plutôt à : ' + p.label.toLowerCase()
                };
            }
        }
        return { label: col, source: 'entête', conf: 'moyenne', warn: '' };
    }
    const vals = _analyseData
        .slice(0, 2000)
        .map(r => (r[col] ?? '').toString().trim())
        .filter(v => v !== '');
    const frac = f => (vals.length ? vals.filter(f).length / vals.length : 0);
    const by = {
        email: 'E-mail',
        phone: 'Téléphone',
        date: 'Date',
        datetime: 'Date',
        time: 'Heure',
        url: 'Lien (URL)',
        bool: 'Indicateur (oui/non)',
        code: 'Code',
        list: 'Liste'
    };
    if (by[p.kind]) return { label: by[p.kind], source: 'contenu', conf: 'haute', warn: '' };
    if (p.kind === 'int' && p.unique && p.maxLen >= 4)
        return { label: 'Identifiant', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.kind === 'int' || p.kind === 'dec') return { label: 'Nombre', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.kind === 'cat') return { label: 'Catégorie', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.kind === 'empty') return { label: 'Vide', source: 'contenu', conf: 'faible', warn: '' };
    if (
        p.distinct / Math.max(p.filled, 1) >= 0.5 &&
        frac(v => /[A-ZÀ-Ý]/.test(v) && v === v.toUpperCase() && v.length <= 30) >= 0.8
    )
        return { label: 'Nom', source: 'contenu', conf: 'moyenne', warn: '' };
    if (p.distinct / Math.max(p.filled, 1) >= 0.5 && frac(v => /^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(v)) >= 0.8)
        return { label: 'Prénom', source: 'contenu', conf: 'faible', warn: '' };
    if (p.unique && /^[\w.-]+$/.test(vals[0] || ''))
        return { label: 'Identifiant', source: 'contenu', conf: 'faible', warn: '' };
    return { label: p.maxLen > 60 ? 'Commentaire' : 'Libellé', source: 'contenu', conf: 'faible', warn: '' };
}
function analyseApplyMapping() {
    const inputs = [...document.querySelectorAll('#analyseStructPanel input[data-mapcol]')];
    const map = new Map(),
        used = new Set();
    for (const inp of inputs) {
        let nm = inp.value.trim() || inp.dataset.mapcol;
        let cand = nm,
            k = 2;
        while (used.has(cand)) cand = nm + ' (' + k++ + ')';
        used.add(cand);
        map.set(inp.dataset.mapcol, cand);
    }
    const rows = _analyseData.map(r => {
        const o = {};
        for (const [old, nw] of map) o[nw] = r[old];
        return o;
    });
    const m = _analyseFileMeta || {};
    _analyseIngest(rows, m.fileName, m.encoding, Object.assign({}, m, { mapped: true }));
    document.getElementById('analyseStructPanel').style.display = 'block';
}
function analyseAdoptName(btn) {
    const inp = btn.parentElement.querySelector('input[data-mapcol]');
    if (inp) inp.value = btn.dataset.label;
}

function analyseRenderStruct() {
    const box = document.getElementById('analyseStructPanel');
    if (!box || !_analyseData.length) return;
    const m = _analyseFileMeta || {};
    const nf = n => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    let info = `<strong>${nf(_analyseData.length)}</strong> lignes × <strong>${_analyseHeaders.length}</strong> colonnes`;
    if (m.kind === 'txt') {
        const sep = m.delim
            ? 'séparateur : <strong>' + _aEsc(_aDelimName(m.delim)) + '</strong>'
            : m.widths
              ? 'colonnes à <strong>largeur fixe</strong> (positions ' + m.widths.map(x => x + 1).join(', ') + ')'
              : '<strong>aucun séparateur détecté</strong> (une colonne par ligne)';
        info += ' — fichier texte, ' + sep;
    }
    if (m.encoding) info += ' — encodage <strong>' + _aEsc(m.encoding) + '</strong>';
    let head = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;"><span style="font-size:13px;color:#004d40;">${info}</span>`;
    if (_analyseTxtCtx) {
        const hr = m.headerRow || 0;
        head += `<label style="margin-left:auto;font-size:12px;color:#004d40;display:flex;align-items:center;gap:6px;">Intitulés des colonnes en ligne n°
            <input type="number" min="0" max="50" value="${hr}" onchange="analyseSetHeaderRow(this.value)" title="0 = pas d'intitulés ; les lignes au-dessus sont ignorées" style="width:56px;padding:2px 5px;border:1px solid #80cbc4;border-radius:4px;font-size:12px;text-align:center;">
            <span style="color:#546e7a;">${m.headerAuto ? '(détecté automatiquement' : '(choisi'}${hr ? (m.skipped ? ' — ' + m.skipped + ' ligne' + (m.skipped > 1 ? 's' : '') + ' au-dessus ignorée' + (m.skipped > 1 ? 's' : '') : '') : ' — aucun intitulé'}) · 0 = aucun</span></label>`;
    }
    head += '</div>';
    const used = new Set();
    const confCol = { haute: '#2e7d32', moyenne: '#f9a825', faible: '#e53935' };
    const rowsHtml = _analyseHeaders
        .map((col, i) => {
            const p = _aColProfile(col);
            const role = _aProposeRole(col, p, !!m.hasHeader);
            // nom retenu : l'entête existant est conservé ; sans entête, le rôle proposé (dédoublonné)
            let def = m.hasHeader && !/^Colonne \d+$/.test(col) ? col : role.label;
            let cand = def,
                k = 2;
            while (used.has(cand)) cand = def + ' (' + k++ + ')';
            used.add(cand);
            const pct = p.total ? Math.round((p.filled / p.total) * 100) : 0;
            let range = '';
            if (p.min !== undefined) range = `min ${nf(p.min)} · max ${nf(p.max)} · moy. ${nf(p.avg)}`;
            else if (p.dmin) range = `du ${_aFmtDate(p.dmin)} au ${_aFmtDate(p.dmax)}`;
            else if (p.filled) range = `longueur ${p.minLen}${p.maxLen !== p.minLen ? '–' + p.maxLen : ''}`;
            const top = p.top
                .map(
                    ([v, n]) =>
                        `<span title="${n} fois" style="background:#fff;border:1px solid #b2dfdb;border-radius:10px;padding:0 6px;margin-right:3px;white-space:nowrap;">${_aEsc(v.length > 24 ? v.slice(0, 24) + '…' : v)} <span style="color:#00897b;">×${nf(n)}</span></span>`
                )
                .join('');
            const flags = p.unique
                ? ' <span title="Toutes les valeurs sont renseignées et distinctes : clé potentielle" style="color:#f9a825;">🔑</span>'
                : '';
            const adopt =
                cand !== role.label && role.label !== col
                    ? ` <button type="button" data-label="${_aEsc(role.label)}" onclick="analyseAdoptName(this)" title="Adopter ce nom" style="border:1px solid #80cbc4;background:#fff;color:#00695c;border-radius:10px;font-size:11px;cursor:pointer;padding:0 7px;">→ ${_aEsc(role.label)}</button>`
                    : '';
            const mapCell = `<input data-mapcol="${_aEsc(col)}" value="${_aEsc(cand)}" style="width:150px;padding:2px 5px;border:1px solid #80cbc4;border-radius:4px;font-size:12px;"> <span title="Rôle proposé d'après ${role.source}" style="color:${confCol[role.conf]};font-size:11px;">● ${role.conf}</span>${adopt}${role.warn ? `<div style="color:#e65100;font-size:11px;">⚠ ${_aEsc(role.warn)}</div>` : ''}`;
            return `<tr style="border-top:1px solid #b2dfdb;"><td style="padding:4px 8px;color:#607d8b;">${i + 1}</td><td style="padding:4px 8px;font-weight:600;">${_aEsc(col)}${flags}</td><td style="padding:4px 8px;white-space:nowrap;">${mapCell}</td><td style="padding:4px 8px;">${_aEsc(p.label)}</td>
            <td style="padding:4px 8px;white-space:nowrap;"><span style="display:inline-block;width:60px;height:7px;background:#cfd8dc;border-radius:4px;vertical-align:middle;"><span style="display:block;width:${pct}%;height:100%;background:${pct === 100 ? '#43a047' : pct > 50 ? '#fbc02d' : '#e53935'};border-radius:4px;"></span></span> ${pct}% <span style="color:#90a4ae;">(${nf(p.empty)} vides)</span></td>
            <td style="padding:4px 8px;text-align:right;">${nf(p.distinct)}</td><td style="padding:4px 8px;">${_aEsc(range)}</td><td style="padding:4px 8px;">${top}</td></tr>`;
        })
        .join('');
    box.innerHTML =
        head +
        `<div style="overflow-x:auto;max-height:420px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;background:#f1f8f7;">
        <thead style="position:sticky;top:0;background:#00897b;color:#fff;"><tr><th style="padding:5px 8px;text-align:left;">#</th><th style="padding:5px 8px;text-align:left;">Colonne</th><th style="padding:5px 8px;text-align:left;">Mapping proposé</th><th style="padding:5px 8px;text-align:left;">Type détecté</th><th style="padding:5px 8px;text-align:left;">Remplissage</th><th style="padding:5px 8px;text-align:right;">Distinctes</th><th style="padding:5px 8px;text-align:left;">Plage / longueur</th><th style="padding:5px 8px;text-align:left;">Valeurs les plus fréquentes</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table></div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><button type="button" onclick="analyseApplyMapping()" style="background:#00897b;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:12px;">✔ Appliquer les noms de colonnes</button><span style="font-size:11px;color:#546e7a;">Modifiez un nom ou cliquez sur « → … » pour adopter le rôle proposé. ● confiance : haute / moyenne / faible.</span></div>`;
}
function toggleAnalyseStruct() {
    const box = document.getElementById('analyseStructPanel');
    const show = box.style.display === 'none';
    if (show) analyseRenderStruct();
    box.style.display = show ? 'block' : 'none';
}

// ── Helpers ID sûr pour les colonnes ─────────────────────────────────────────
function _aId(col) {
    if (!_aColId.has(col)) _aColId.set(col, 'ac' + _aColSeq++);
    return _aColId.get(col);
}
function _aColById(id) {
    for (const [c, i] of _aColId) if (i === id) return c;
    return null;
}

// ── Accès au filtre list avec initialisation ──────────────────────────────────
function _aGetListFilter(col) {
    if (!_analyseFilters[col] || !Array.isArray(_analyseFilters[col].groups)) {
        _analyseFilters[col] = { groups: [{ tokens: [] }], ops: [], excluded: [] };
    }
    if (!_analyseFilters[col].ops) _analyseFilters[col].ops = [];
    if (!_analyseFilters[col].excluded) _analyseFilters[col].excluded = [];
    return _analyseFilters[col];
}

// Basculer l'opérateur (ET↔OU) entre deux groupes
function _aToggleOp(colId, opIdx) {
    const col = _aColById(colId);
    if (!col) return;
    const f = _aGetListFilter(col);
    f.ops[opIdx] = f.ops[opIdx] === 'OR' ? 'AND' : 'OR';
    _aRefreshBuilder(col);
    analyseApplyFilters();
}
function _aListActive(col) {
    const f = _analyseFilters[col];
    return f && Array.isArray(f.groups) && f.groups.some(g => g.tokens.length > 0);
}

// ── Render panneau de filtres ─────────────────────────────────────────────────
function analyseRenderFilters() {
    _aListMap.clear();
    _aColId.clear();
    _aColSeq = 0;

    const panel = document.getElementById('analyseFiltersPanel');
    panel.innerHTML = '';

    for (const col of _analyseHeaders) {
        const type = _analyseColTypes[col];
        const vals = _analyseColValues[col] || [];
        const div = document.createElement('div');

        const isBool = type === 'enum' && vals.length <= 2;
        if (isBool) {
            // Colonne booléenne (OUI/NON, VRAI/FAUX, 0/1…) → boutons radio simples
            div.style.cssText = 'background:#f8f9ff; border:1px solid #e0e4ff; border-radius:8px; padding:8px 10px;';
            const lbl = document.createElement('div');
            lbl.style.cssText =
                'font-size:10px; color:#5c6bc0; font-weight:bold; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            lbl.title = col;
            lbl.textContent = col;
            div.appendChild(lbl);
            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;';
            const curVal = _analyseFilters[col] && !_analyseFilters[col].groups ? _analyseFilters[col] : null;
            const makeOpt = (v, label) => {
                const btn = document.createElement('button');
                btn.textContent = label || v;
                const active = curVal === v;
                btn.style.cssText = `padding:3px 12px; border-radius:12px; border:1px solid #9fa8da; font-size:12px; cursor:pointer; background:${active ? '#3f51b5' : 'white'}; color:${active ? 'white' : '#3f51b5'};`;
                btn.onclick = () => {
                    if (_analyseFilters[col] === v) {
                        delete _analyseFilters[col];
                    } else {
                        _analyseFilters[col] = v;
                    }
                    _analysePage = 1;
                    analyseApplyFilters();
                    analyseRenderFilters();
                };
                return btn;
            };
            const allBtn = document.createElement('button');
            allBtn.textContent = 'Tous';
            const noneActive = !curVal;
            allBtn.style.cssText = `padding:3px 12px; border-radius:12px; border:1px solid #bbb; font-size:12px; cursor:pointer; background:${noneActive ? '#5c6bc0' : '#eee'}; color:${noneActive ? 'white' : '#666'};`;
            allBtn.onclick = () => {
                delete _analyseFilters[col];
                _analysePage = 1;
                analyseApplyFilters();
                analyseRenderFilters();
            };
            btnWrap.appendChild(allBtn);
            vals.forEach(v => btnWrap.appendChild(makeOpt(v)));
            div.appendChild(btnWrap);
        } else if (type === 'list' || type === 'enum') {
            // Widget large (2 colonnes) pour list ET enum
            div.style.cssText =
                'background:#f0f2ff; border:1px solid #c5cae9; border-radius:10px; padding:10px 12px; grid-column: span 2;';
            _buildListWidget(div, col, vals);
        } else {
            div.style.cssText = 'background:#f8f9ff; border:1px solid #e0e4ff; border-radius:8px; padding:8px 10px;';

            const lbl = document.createElement('div');
            lbl.style.cssText =
                'font-size:10px; color:#5c6bc0; font-weight:bold; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            lbl.title = col;
            lbl.textContent = col;
            div.appendChild(lbl);

            if (type === 'date') {
                // Filtre date : modes = exact | before | after | between
                const df = _analyseFilters[col] && typeof _analyseFilters[col] === 'object' ? _analyseFilters[col] : {};
                const mode = df.mode || 'after';
                const dateWrap = document.createElement('div');
                dateWrap.style.cssText = 'display:flex; flex-direction:column; gap:5px;';

                // Sélecteur de mode
                const modeWrap = document.createElement('div');
                modeWrap.style.cssText = 'display:flex; gap:4px; flex-wrap:wrap;';
                const modes = [
                    ['after', 'Après le'],
                    ['before', 'Avant le'],
                    ['between', 'Entre'],
                    ['exact', 'Égal']
                ];
                modes.forEach(([m, lbl]) => {
                    const b = document.createElement('button');
                    b.textContent = lbl;
                    const isActive = mode === m;
                    b.style.cssText = `padding:2px 8px; border-radius:10px; border:1px solid #9fa8da; font-size:11px; cursor:pointer; background:${isActive ? '#3f51b5' : 'white'}; color:${isActive ? 'white' : '#3f51b5'}; white-space:nowrap;`;
                    b.onclick = () => {
                        const cur =
                            _analyseFilters[col] && typeof _analyseFilters[col] === 'object'
                                ? _analyseFilters[col]
                                : {};
                        _analyseFilters[col] = { ...cur, mode: m };
                        _analysePage = 1;
                        analyseApplyFilters();
                        analyseRenderFilters();
                    };
                    modeWrap.appendChild(b);
                });
                dateWrap.appendChild(modeWrap);

                const mkDateInp = (val, placeholder, onChange) => {
                    const i = document.createElement('input');
                    i.type = 'date';
                    i.value = val || '';
                    i.placeholder = placeholder;
                    i.style.cssText =
                        'width:100%; padding:3px 5px; border:1px solid #c5cae9; border-radius:4px; font-size:12px; box-sizing:border-box;';
                    i.addEventListener('input', () => onChange(i.value || null));
                    return i;
                };

                if (mode === 'between') {
                    dateWrap.appendChild(
                        mkDateInp(df.from, 'Du…', v => {
                            const cur =
                                _analyseFilters[col] && typeof _analyseFilters[col] === 'object'
                                    ? _analyseFilters[col]
                                    : { mode: 'between' };
                            _analyseFilters[col] = { ...cur, from: v };
                            _analysePage = 1;
                            analyseApplyFilters();
                        })
                    );
                    dateWrap.appendChild(
                        mkDateInp(df.to, 'Au…', v => {
                            const cur =
                                _analyseFilters[col] && typeof _analyseFilters[col] === 'object'
                                    ? _analyseFilters[col]
                                    : { mode: 'between' };
                            _analyseFilters[col] = { ...cur, to: v };
                            _analysePage = 1;
                            analyseApplyFilters();
                        })
                    );
                } else {
                    dateWrap.appendChild(
                        mkDateInp(
                            df.date,
                            mode === 'after' ? 'À partir du…' : mode === 'before' ? "Jusqu'au…" : 'Date exacte',
                            v => {
                                const cur =
                                    _analyseFilters[col] && typeof _analyseFilters[col] === 'object'
                                        ? _analyseFilters[col]
                                        : { mode };
                                _analyseFilters[col] = { ...cur, date: v };
                                _analysePage = 1;
                                analyseApplyFilters();
                            }
                        )
                    );
                }
                div.appendChild(dateWrap);
            } else {
                // Champ texte avec suggestions (startsWith) + bouton ✕ pour effacer
                const outerWrap = document.createElement('div');
                outerWrap.style.cssText = 'position:relative;';
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex; align-items:center; gap:4px;';
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.placeholder = 'Recherche libre…';
                inp.style.cssText =
                    'flex:1; padding:4px 6px; border:1px solid #c5cae9; border-radius:4px; font-size:12px; box-sizing:border-box; min-width:0;';
                if (_analyseFilters[col]) inp.value = _analyseFilters[col];
                const clearBtn = document.createElement('button');
                clearBtn.textContent = '×';
                clearBtn.title = 'Effacer';
                clearBtn.style.cssText =
                    'display:none; flex-shrink:0; background:none; border:none; color:#999; font-size:16px; cursor:pointer; padding:0 2px; line-height:1;';
                clearBtn.onmousedown = e => {
                    e.preventDefault();
                    inp.value = '';
                    _analyseFilters[col] = null;
                    clearBtn.style.display = 'none';
                    _analysePage = 1;
                    analyseApplyFilters();
                };
                if (_analyseFilters[col]) clearBtn.style.display = 'inline';

                const sugBox = document.createElement('div');
                sugBox.style.cssText =
                    'display:none; position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #c5cae9; border-top:none; border-radius:0 0 6px 6px; max-height:200px; overflow-y:auto; z-index:200; box-shadow:0 4px 12px rgba(0,0,0,0.1); font-size:12px; margin-top:2px;';

                const colVals = vals; // valeurs uniques pré-triées
                const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

                const showSug = q => {
                    sugBox.innerHTML = '';
                    if (!q || !colVals.length) {
                        sugBox.style.display = 'none';
                        return;
                    }
                    const qn = norm(q);
                    const matches = colVals.filter(v => norm(v).startsWith(qn)).slice(0, 50);
                    if (!matches.length) {
                        sugBox.style.display = 'none';
                        return;
                    }
                    matches.forEach(v => {
                        const row = document.createElement('div');
                        row.textContent = v;
                        row.style.cssText =
                            'padding:4px 8px; cursor:pointer; border-bottom:1px solid #f0f0f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
                        row.onmouseenter = () => (row.style.background = '#e8eaf6');
                        row.onmouseleave = () => (row.style.background = '');
                        row.onmousedown = e => {
                            e.preventDefault();
                            inp.value = v;
                            _analyseFilters[col] = v;
                            _analysePage = 1;
                            analyseApplyFilters();
                            sugBox.style.display = 'none';
                        };
                        sugBox.appendChild(row);
                    });
                    sugBox.style.display = 'block';
                };

                inp.addEventListener('input', () => {
                    _analyseFilters[col] = inp.value || null;
                    clearBtn.style.display = inp.value ? 'inline' : 'none';
                    _analysePage = 1;
                    analyseApplyFilters();
                    showSug(inp.value);
                });
                inp.addEventListener('focus', () => showSug(inp.value));
                inp.addEventListener('blur', e => {
                    if (e.relatedTarget && sugBox.contains(e.relatedTarget)) return;
                    setTimeout(() => {
                        sugBox.style.display = 'none';
                    }, 150);
                });
                inp.addEventListener('keydown', e => {
                    if (e.key === 'Escape') sugBox.style.display = 'none';
                });

                wrap.appendChild(inp);
                wrap.appendChild(clearBtn);
                outerWrap.appendChild(wrap);
                outerWrap.appendChild(sugBox);
                div.appendChild(outerWrap);
            }
        }
        panel.appendChild(div);
    }
}

// ── Widget query-builder drag & drop pour colonnes list ───────────────────────
function _buildListWidget(parentDiv, col, vals) {
    const id = _aId(col);
    _aListMap.set(col, { builderEl: null, vals });

    // Titre
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px;';
    hdr.innerHTML = `<span style="font-size:10px; color:#3f51b5; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${col}">${col}</span>
        <span style="font-size:10px; background:#7986cb; color:white; padding:1px 7px; border-radius:10px; white-space:nowrap;">multi-valeurs · ET/OU</span>`;
    parentDiv.appendChild(hdr);

    // ── Recherche inclusion avec multi-sélection ──────────────────────────────
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'position:relative; margin-bottom:10px;';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Rechercher des valeurs à inclure dans le filtre…';
    inp.style.cssText =
        'width:100%; padding:5px 10px; border:1.5px solid #9fa8da; border-radius:6px; font-size:12px; box-sizing:border-box; outline:none;';

    const sugBox = document.createElement('div');
    sugBox.style.cssText =
        'display:none; position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #9fa8da; border-top:none; border-radius:0 0 8px 8px; max-height:320px; overflow-y:auto; z-index:200; box-shadow:0 6px 16px rgba(0,0,0,0.12);';
    // Empêcher le blur de l'input quand on clique dans le dropdown

    // Sélection en cours dans le dropdown (Set temporaire)
    let _pendingSel = new Set();

    const refreshSuggestions = q => {
        // NE PAS reset _pendingSel ici — conserver la sélection entre frappes
        const f = _aGetListFilter(col);
        const used = new Set(f.groups.flatMap(g => g.tokens));
        const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const qn = norm(q || '');
        const matches = (qn ? vals.filter(v => norm(v).includes(qn)) : vals).filter(
            v => !used.has(v) && !(f.excluded || []).includes(v)
        );
        if (!matches.length) {
            sugBox.innerHTML =
                '<div style="padding:8px 12px; color:#999; font-size:12px; font-style:italic;">Aucune valeur disponible</div>';
            sugBox.style.display = 'block';
            return;
        }
        sugBox.innerHTML = '';

        // Barre "Tout cocher / Ajouter sélection"
        const selBar = document.createElement('div');
        selBar.style.cssText =
            'display:flex; align-items:center; gap:6px; padding:5px 10px; background:#f0f2ff; border-bottom:1px solid #c5cae9; position:sticky; top:0; z-index:1; box-sizing:border-box;';
        const chkAll = document.createElement('input');
        chkAll.type = 'checkbox';
        chkAll.title = 'Tout cocher / décocher';
        chkAll.style.cssText = 'cursor:pointer; flex-shrink:0; width:14px; height:14px;';
        const lblAll = document.createElement('span');
        lblAll.style.cssText = 'font-size:11px; color:#3f51b5; cursor:pointer; flex:1; white-space:nowrap;';
        lblAll.textContent = 'Tout sélectionner';
        const btnAdd = document.createElement('button');
        btnAdd.textContent = 'Ajouter';
        btnAdd.style.cssText =
            'background:#3f51b5; color:white; border:none; padding:3px 8px; border-radius:10px; font-size:11px; cursor:pointer; display:none; white-space:nowrap; flex-shrink:0;';
        btnAdd.onmousedown = e => {
            e.preventDefault();
            _pendingSel.forEach(v => _aListAddToken(col, v, 0));
            _pendingSel = new Set();
            inp.value = '';
            sugBox.style.display = 'none';
            _aRefreshBuilder(col);
            analyseApplyFilters();
        };
        chkAll.onchange = () => {
            const items = sugBox.querySelectorAll('.sug-item input[type=checkbox]');
            items.forEach(cb => {
                cb.checked = chkAll.checked;
                const v = cb.dataset.val;
                chkAll.checked ? _pendingSel.add(v) : _pendingSel.delete(v);
            });
            lblAll.textContent = chkAll.checked ? 'Tout désélectionner' : 'Tout sélectionner';
            btnAdd.style.display = _pendingSel.size > 0 ? 'inline-block' : 'none';
            btnAdd.textContent = `Ajouter (${_pendingSel.size})`;
        };
        lblAll.onmousedown = e => {
            e.preventDefault();
            chkAll.click();
        };
        selBar.appendChild(chkAll);
        selBar.appendChild(lblAll);
        selBar.appendChild(btnAdd);
        sugBox.appendChild(selBar);
        // Mettre à jour btnAdd et chkAll après reconstruction (valeurs déjà dans _pendingSel)
        // (sera recalculé après que toShow soit défini — mis à jour plus bas)

        const SHOW_MAX = 500;
        const toShow = matches.slice(0, SHOW_MAX);
        // Nettoyer _pendingSel des valeurs qui ne sont plus dans la liste visible
        for (const v of [..._pendingSel]) {
            if (!toShow.includes(v)) _pendingSel.delete(v);
        }
        // Mettre à jour btnAdd et chkAll selon _pendingSel
        btnAdd.style.display = _pendingSel.size > 0 ? 'inline-block' : 'none';
        btnAdd.textContent = `Ajouter (${_pendingSel.size})`;
        chkAll.checked = _pendingSel.size > 0 && _pendingSel.size === toShow.length;
        toShow.forEach(v => {
            const item = document.createElement('div');
            item.className = 'sug-item';
            item.style.cssText =
                'display:flex; align-items:center; gap:8px; padding:6px 10px; font-size:12px; cursor:pointer; border-bottom:1px solid #f0f0f0; box-sizing:border-box;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.val = v;
            cb.checked = _pendingSel.has(v); // restaurer l'état coché
            cb.style.cssText = 'cursor:pointer; flex-shrink:0; width:14px; height:14px;';
            const lbl = document.createElement('span');
            lbl.textContent = v;
            lbl.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            item.appendChild(cb);
            item.appendChild(lbl);
            item.onmouseenter = () => (item.style.background = '#e8eaf6');
            item.onmouseleave = () => (item.style.background = '');
            cb.onchange = () => {
                cb.checked ? _pendingSel.add(v) : _pendingSel.delete(v);
                btnAdd.style.display = _pendingSel.size > 0 ? 'inline-block' : 'none';
                btnAdd.textContent = `Ajouter (${_pendingSel.size})`;
                chkAll.checked = _pendingSel.size === toShow.length;
            };
            // Clic sur la ligne = ajouter immédiatement (comportement rapide)
            item.onmousedown = e => {
                if (e.target === cb) return;
                e.preventDefault(); // Garde le focus sur inp
                // Clic sur le label = toggle la checkbox (multi-sélection)
                cb.checked = !cb.checked;
                cb.checked ? _pendingSel.add(v) : _pendingSel.delete(v);
                btnAdd.style.display = _pendingSel.size > 0 ? 'inline-block' : 'none';
                btnAdd.textContent = `Ajouter (${_pendingSel.size})`;
                chkAll.checked = _pendingSel.size === toShow.length;
            };
            sugBox.appendChild(item);
        });
        if (matches.length > SHOW_MAX) {
            const more = document.createElement('div');
            more.style.cssText =
                'padding:6px 12px; font-size:11px; color:#9fa8da; font-style:italic; background:#f8f9ff;';
            more.textContent = `… et ${(matches.length - SHOW_MAX).toLocaleString('fr-FR')} autres — affinez la recherche`;
            sugBox.appendChild(more);
        }
        const counter = document.createElement('div');
        counter.style.cssText =
            'padding:4px 12px; font-size:10px; color:#bbb; background:#fafafa; border-top:1px solid #eee; text-align:right;';
        counter.textContent = `${matches.length.toLocaleString('fr-FR')} valeur(s) disponible(s)`;
        sugBox.appendChild(counter);
        sugBox.style.display = 'block';
    };

    inp.addEventListener('focus', () => refreshSuggestions(inp.value));
    inp.addEventListener('input', () => refreshSuggestions(inp.value));
    inp.addEventListener('keydown', e => {
        if (e.key === 'Escape') sugBox.style.display = 'none';
    });
    inp.addEventListener('blur', e => {
        if (e.relatedTarget && sugBox.contains(e.relatedTarget)) return;
        setTimeout(() => {
            sugBox.style.display = 'none';
            _pendingSel = new Set();
        }, 150);
    });

    searchWrap.appendChild(inp);
    searchWrap.appendChild(sugBox);
    parentDiv.appendChild(searchWrap);

    // Zone query builder inclusion
    const builder = document.createElement('div');
    builder.id = 'listBuilder_' + id;
    parentDiv.appendChild(builder);

    // ── Séparateur section Exclure ────────────────────────────────────────────
    const exclSep = document.createElement('div');
    exclSep.style.cssText = 'display:flex; align-items:center; gap:8px; margin:10px 0 6px;';
    exclSep.innerHTML = `<div style="flex:1; height:1px; background:#ffcdd2;"></div>
        <span style="font-size:10px; color:#c62828; font-weight:bold; letter-spacing:0.5px; white-space:nowrap;">⊘ EXCLURE</span>
        <div style="flex:1; height:1px; background:#ffcdd2;"></div>`;
    parentDiv.appendChild(exclSep);

    // Recherche exclusion
    const exclWrap = document.createElement('div');
    exclWrap.style.cssText = 'position:relative; margin-bottom:6px;';
    const exclInp = document.createElement('input');
    exclInp.type = 'text';
    exclInp.placeholder = 'Rechercher des valeurs à exclure…';
    exclInp.style.cssText =
        'width:100%; padding:5px 10px; border:1.5px solid #ef9a9a; border-radius:6px; font-size:12px; box-sizing:border-box; outline:none;';
    const exclBox = document.createElement('div');
    exclBox.style.cssText =
        'display:none; position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #ef9a9a; border-top:none; border-radius:0 0 8px 8px; max-height:240px; overflow-y:auto; z-index:200; box-shadow:0 6px 16px rgba(0,0,0,0.12);';

    let _pendingExcl = new Set();

    const refreshExclSuggestions = q => {
        _pendingExcl = new Set();
        const f = _aGetListFilter(col);
        const alreadyExcl = new Set(f.excluded || []);
        const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const qn = norm(q || '');
        const matches = (qn ? vals.filter(v => norm(v).includes(qn)) : vals).filter(v => !alreadyExcl.has(v));
        if (!matches.length) {
            exclBox.innerHTML =
                '<div style="padding:8px 12px; color:#999; font-size:12px; font-style:italic;">Aucune valeur disponible</div>';
            exclBox.style.display = 'block';
            return;
        }
        exclBox.innerHTML = '';
        // Barre sélection
        const bar = document.createElement('div');
        bar.style.cssText =
            'display:flex; align-items:center; gap:6px; padding:5px 10px; background:#ffebee; border-bottom:1px solid #ef9a9a; position:sticky; top:0; z-index:1; box-sizing:border-box;';
        const chkA = document.createElement('input');
        chkA.type = 'checkbox';
        chkA.style.cssText = 'cursor:pointer; flex-shrink:0; width:14px; height:14px;';
        const lblA = document.createElement('span');
        lblA.style.cssText = 'font-size:11px; color:#c62828; cursor:pointer; flex:1; white-space:nowrap;';
        lblA.textContent = 'Tout sélectionner';
        const btnE = document.createElement('button');
        btnE.textContent = 'Exclure la sélection';
        btnE.style.cssText =
            'background:#c62828; color:white; border:none; padding:3px 8px; border-radius:10px; font-size:11px; cursor:pointer; display:none; white-space:nowrap; flex-shrink:0;';
        btnE.onmousedown = e => {
            e.preventDefault();
            const f2 = _aGetListFilter(col);
            if (!f2.excluded) f2.excluded = [];
            _pendingExcl.forEach(v => {
                if (!f2.excluded.includes(v)) f2.excluded.push(v);
            });
            _pendingExcl = new Set();
            exclInp.value = '';
            exclBox.style.display = 'none';
            _aRefreshBuilder(col);
            analyseApplyFilters();
        };
        chkA.onchange = () => {
            const items = exclBox.querySelectorAll('.excl-item input[type=checkbox]');
            items.forEach(cb => {
                cb.checked = chkA.checked;
                chkA.checked ? _pendingExcl.add(cb.dataset.val) : _pendingExcl.delete(cb.dataset.val);
            });
            lblA.textContent = chkA.checked ? 'Tout désélectionner' : 'Tout sélectionner';
            btnE.style.display = _pendingExcl.size > 0 ? 'inline-block' : 'none';
            btnE.textContent = `Exclure (${_pendingExcl.size})`;
        };
        lblA.onmousedown = e => {
            e.preventDefault();
            chkA.click();
        };
        bar.appendChild(chkA);
        bar.appendChild(lblA);
        bar.appendChild(btnE);
        exclBox.appendChild(bar);
        matches.slice(0, 500).forEach(v => {
            const item = document.createElement('div');
            item.className = 'excl-item';
            item.style.cssText =
                'display:flex; align-items:center; gap:8px; padding:6px 10px; font-size:12px; cursor:pointer; border-bottom:1px solid #f0f0f0; box-sizing:border-box;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.val = v;
            cb.style.cssText = 'cursor:pointer; flex-shrink:0; width:14px; height:14px;';
            const lbl = document.createElement('span');
            lbl.textContent = v;
            lbl.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            item.appendChild(cb);
            item.appendChild(lbl);
            item.onmouseenter = () => (item.style.background = '#ffebee');
            item.onmouseleave = () => (item.style.background = '');
            cb.onchange = () => {
                cb.checked ? _pendingExcl.add(v) : _pendingExcl.delete(v);
                btnE.style.display = _pendingExcl.size > 0 ? 'inline-block' : 'none';
                btnE.textContent = `Exclure (${_pendingExcl.size})`;
                chkA.checked = _pendingExcl.size === Math.min(matches.length, 500);
            };
            item.onmousedown = e => {
                if (e.target === cb) return;
                e.preventDefault();
                const f2 = _aGetListFilter(col);
                if (!f2.excluded) f2.excluded = [];
                if (!f2.excluded.includes(v)) f2.excluded.push(v);
                exclInp.value = '';
                exclBox.style.display = 'none';
                _aRefreshBuilder(col);
                analyseApplyFilters();
            };
            exclBox.appendChild(item);
        });
        exclBox.style.display = 'block';
    };

    exclInp.addEventListener('focus', () => refreshExclSuggestions(exclInp.value));
    exclInp.addEventListener('input', () => refreshExclSuggestions(exclInp.value));
    exclInp.addEventListener('keydown', e => {
        if (e.key === 'Escape') exclBox.style.display = 'none';
    });
    exclInp.addEventListener('blur', e => {
        if (e.relatedTarget && exclBox.contains(e.relatedTarget)) return;
        setTimeout(() => {
            exclBox.style.display = 'none';
            _pendingExcl = new Set();
        }, 150);
    });
    exclWrap.appendChild(exclInp);
    exclWrap.appendChild(exclBox);
    parentDiv.appendChild(exclWrap);

    // Zone chips exclusion
    const exclChips = document.createElement('div');
    exclChips.id = 'exclChips_' + id;
    parentDiv.appendChild(exclChips);

    _aListMap.set(col, { builderEl: builder, exclChipsEl: exclChips, vals });
    _aRefreshBuilder(col);
}

// Re-rend uniquement la zone builder d'une colonne list
function _aRefreshBuilder(col) {
    const info = _aListMap.get(col);
    if (!info || !info.builderEl) return;
    const el = info.builderEl;
    el.innerHTML = '';

    const f = _aGetListFilter(col);
    const id = _aId(col);
    const hasTokens = f.groups.some(g => g.tokens.length > 0);

    if (!hasTokens && f.groups.length <= 1) {
        el.innerHTML =
            '<div style="font-size:11px; color:#9fa8da; padding:4px 2px; font-style:italic;">Aucun filtre actif — recherchez une valeur ci-dessus ou glissez-déposez entre groupes</div>';
        analyseUpdateActiveCount();
        return;
    }

    f.groups.forEach((group, gi) => {
        // ── Séparateur ET/OU togglable entre groupes ──────────────────────
        if (gi > 0) {
            const op = f.ops[gi - 1] || 'AND';
            const isAnd = op === 'AND';
            const sep = document.createElement('div');
            sep.style.cssText = 'display:flex; align-items:center; gap:6px; margin:6px 0;';

            const line1 = document.createElement('div');
            line1.style.cssText = 'flex:1; height:1px; background:#c5cae9;';

            // Toggle ET / OU
            const toggle = document.createElement('div');
            toggle.style.cssText =
                'display:flex; border-radius:16px; overflow:hidden; border:2px solid ' +
                (isAnd ? '#283593' : '#6a1b9a') +
                '; cursor:pointer; user-select:none; flex-shrink:0;';
            toggle.title = 'Cliquer pour basculer entre ET et OU';

            const btnAnd = document.createElement('span');
            btnAnd.textContent = 'ET';
            btnAnd.style.cssText = `padding:3px 14px; font-size:11px; font-weight:bold; letter-spacing:1px; background:${isAnd ? '#283593' : 'white'}; color:${isAnd ? 'white' : '#283593'}; transition:background 0.15s;`;

            const btnOr = document.createElement('span');
            btnOr.textContent = 'OU';
            btnOr.style.cssText = `padding:3px 14px; font-size:11px; font-weight:bold; letter-spacing:1px; background:${!isAnd ? '#6a1b9a' : 'white'}; color:${!isAnd ? 'white' : '#6a1b9a'}; transition:background 0.15s;`;

            toggle.appendChild(btnAnd);
            toggle.appendChild(btnOr);
            toggle.onclick = () => _aToggleOp(id, gi - 1);

            const line2 = document.createElement('div');
            line2.style.cssText = 'flex:1; height:1px; background:#c5cae9;';

            sep.appendChild(line1);
            sep.appendChild(toggle);
            sep.appendChild(line2);
            el.appendChild(sep);
        }

        // ── En-tête du groupe : numéro + bouton suppression ───────────────
        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:4px;';
        const groupLabel = document.createElement('span');
        groupLabel.style.cssText = 'font-size:10px; color:#7986cb; font-weight:bold;';
        groupLabel.textContent = `Groupe ${gi + 1}`;
        groupHeader.appendChild(groupLabel);

        // Bouton supprimer ce groupe (toujours visible)
        const delGroup = document.createElement('button');
        delGroup.textContent = '🗑 Supprimer ce groupe';
        delGroup.style.cssText =
            'background:none; border:none; color:#e53935; font-size:10px; cursor:pointer; padding:0 4px; opacity:0.7;';
        delGroup.onmouseenter = () => (delGroup.style.opacity = '1');
        delGroup.onmouseleave = () => (delGroup.style.opacity = '0.7');
        delGroup.onclick = () => _aListRemoveGroup(col, gi);
        groupHeader.appendChild(delGroup);
        el.appendChild(groupHeader);

        // ── Boîte de groupe (zone de drop) ───────────────────────────────
        const groupBox = document.createElement('div');
        const bgGroup = group.tokens.length ? '#e8eaf6' : '#f5f5ff';
        const bdGroup = group.tokens.length ? '#9fa8da' : '#c5cae9';
        groupBox.style.cssText = `display:flex; flex-wrap:wrap; align-items:center; gap:4px; min-height:38px; padding:6px 8px; background:${bgGroup}; border:2px dashed ${bdGroup}; border-radius:8px; transition:border-color 0.15s, background 0.15s; margin-bottom:2px;`;

        groupBox.addEventListener('dragover', e => {
            e.preventDefault();
            if (_aDrag && (_aDrag.col !== col || _aDrag.gi !== gi)) {
                groupBox.style.background = '#c5cae9';
                groupBox.style.borderColor = '#3f51b5';
            }
        });
        groupBox.addEventListener('dragleave', () => {
            groupBox.style.background = bgGroup;
            groupBox.style.borderColor = bdGroup;
        });
        groupBox.addEventListener('drop', e => {
            e.preventDefault();
            groupBox.style.background = bgGroup;
            groupBox.style.borderColor = bdGroup;
            if (!_aDrag || _aDrag.col !== col) return;
            const { gi: fromGi, ti: fromTi } = _aDrag;
            if (fromGi === gi) return;
            const token = f.groups[fromGi].tokens.splice(fromTi, 1)[0];
            f.groups[gi].tokens.push(token);
            _aCleanGroups(col);
            _aRefreshBuilder(col);
            analyseApplyFilters();
            _aDrag = null;
        });

        // ── Chips dans le groupe ──────────────────────────────────────────
        group.tokens.forEach((token, ti) => {
            // Séparateur OU
            if (ti > 0) {
                const orSep = document.createElement('span');
                orSep.style.cssText =
                    'font-size:10px; color:#7986cb; font-weight:bold; padding:0 2px; user-select:none;';
                orSep.textContent = 'OU';
                groupBox.appendChild(orSep);
            }

            // Drop zone avant ce chip
            const dropBefore = document.createElement('div');
            dropBefore.style.cssText =
                'width:4px; min-height:24px; border-radius:2px; transition:width 0.15s, background 0.15s;';
            dropBefore.addEventListener('dragover', e => {
                e.preventDefault();
                e.stopPropagation();
                dropBefore.style.width = '3px';
                dropBefore.style.background = '#3f51b5';
            });
            dropBefore.addEventListener('dragleave', () => {
                dropBefore.style.width = '4px';
                dropBefore.style.background = '';
            });
            dropBefore.addEventListener('drop', e => {
                e.preventDefault();
                e.stopPropagation();
                dropBefore.style.width = '4px';
                dropBefore.style.background = '';
                if (!_aDrag || _aDrag.col !== col) return;
                _aMoveToken(col, _aDrag.gi, _aDrag.ti, gi, ti);
                _aDrag = null;
            });
            groupBox.appendChild(dropBefore);

            // Chip
            const chip = document.createElement('div');
            chip.draggable = true;
            chip.style.cssText =
                'display:flex; align-items:center; gap:5px; background:#3f51b5; color:white; padding:4px 10px; border-radius:14px; font-size:11px; cursor:grab; user-select:none; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:opacity 0.15s;';
            chip.title = token + '\n(cliquer × pour supprimer, glisser pour déplacer)';

            const lbl = document.createElement('span');
            lbl.textContent = token.length > 30 ? token.substring(0, 28) + '…' : token;
            chip.appendChild(lbl);

            const rm = document.createElement('span');
            rm.textContent = '×';
            rm.style.cssText =
                'cursor:pointer; font-size:15px; line-height:1; opacity:0.7; padding:0 2px; border-left:1px solid rgba(255,255,255,0.3); margin-left:3px;';
            rm.title = 'Supprimer "' + token + '"';
            rm.onmouseenter = () => {
                rm.style.opacity = '1';
                rm.style.background = 'rgba(255,255,255,0.2)';
                rm.style.borderRadius = '50%';
            };
            rm.onmouseleave = () => {
                rm.style.opacity = '0.7';
                rm.style.background = '';
                rm.style.borderRadius = '';
            };
            rm.onclick = e => {
                e.stopPropagation();
                _aListRemoveToken(col, gi, ti);
            };
            chip.appendChild(rm);

            chip.addEventListener('dragstart', e => {
                _aDrag = { col, gi, ti };
                chip.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', token);
            });
            chip.addEventListener('dragend', () => {
                chip.style.opacity = '1';
                _aDrag = null;
            });
            groupBox.appendChild(chip);
        });

        // Drop zone après le dernier chip
        const dropAfter = document.createElement('div');
        dropAfter.style.cssText =
            'width:4px; min-height:24px; border-radius:2px; transition:width 0.15s, background 0.15s; flex:1; min-width:4px;';
        dropAfter.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            dropAfter.style.background = '#3f51b5';
            dropAfter.style.minWidth = '20px';
        });
        dropAfter.addEventListener('dragleave', () => {
            dropAfter.style.background = '';
            dropAfter.style.minWidth = '4px';
        });
        dropAfter.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            dropAfter.style.background = '';
            dropAfter.style.minWidth = '4px';
            if (!_aDrag || _aDrag.col !== col) return;
            _aMoveToken(col, _aDrag.gi, _aDrag.ti, gi, group.tokens.length);
            _aDrag = null;
        });
        groupBox.appendChild(dropAfter);

        if (group.tokens.length === 0) {
            const hint = document.createElement('span');
            hint.style.cssText = 'font-size:11px; color:#bbb; font-style:italic; pointer-events:none;';
            hint.textContent = 'Glissez des valeurs ici ou recherchez ci-dessus';
            groupBox.appendChild(hint);
        }

        el.appendChild(groupBox);
    });

    // ── Boutons d'action globaux ──────────────────────────────────────────
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center;';

    const addGroup = document.createElement('div');
    addGroup.style.cssText = 'display:flex; border-radius:16px; overflow:hidden; border:1.5px solid #3f51b5;';
    addGroup.innerHTML = `<button onclick="_aListAddGroup('${id}','AND')" style="background:white; border:none; color:#283593; padding:4px 12px; cursor:pointer; font-size:11px; font-weight:bold;" title="Ajouter un groupe lié par ET">＋ groupe ET</button><button onclick="_aListAddGroup('${id}','OR')" style="background:white; border:none; color:#6a1b9a; padding:4px 12px; cursor:pointer; font-size:11px; font-weight:bold; border-left:1px solid #c5cae9;" title="Ajouter un groupe lié par OU">＋ groupe OU</button>`;
    actions.appendChild(addGroup);

    const clearAll = document.createElement('button');
    clearAll.textContent = '✕ Effacer tout';
    clearAll.style.cssText =
        'background:none; border:1.5px solid #e53935; color:#e53935; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:11px; margin-left:auto;';
    clearAll.onclick = () => _aListClear(id);
    actions.appendChild(clearAll);

    el.appendChild(actions);

    // ── Chips d'exclusion ─────────────────────────────────────────────────
    const info2 = _aListMap.get(col);
    if (info2 && info2.exclChipsEl) {
        const ec = info2.exclChipsEl;
        ec.innerHTML = '';
        const excl = f.excluded || [];
        if (excl.length > 0) {
            const exclRow = document.createElement('div');
            exclRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin-top:6px;';
            const lbl = document.createElement('span');
            lbl.style.cssText = 'font-size:10px; color:#c62828; font-weight:bold; white-space:nowrap;';
            lbl.textContent = '⊘ Exclus :';
            exclRow.appendChild(lbl);
            excl.forEach((v, ei) => {
                const chip = document.createElement('div');
                chip.style.cssText =
                    'display:flex; align-items:center; gap:4px; background:#ffebee; color:#c62828; border:1px solid #ef9a9a; padding:3px 8px; border-radius:12px; font-size:11px; white-space:nowrap;';
                const t = document.createElement('span');
                t.textContent = v.length > 30 ? v.substring(0, 28) + '…' : v;
                t.title = v;
                const rm = document.createElement('span');
                rm.textContent = '×';
                rm.style.cssText = 'cursor:pointer; font-size:14px; opacity:0.7; padding:0 2px;';
                rm.onmouseenter = () => (rm.style.opacity = '1');
                rm.onmouseleave = () => (rm.style.opacity = '0.7');
                rm.onclick = () => {
                    f.excluded.splice(ei, 1);
                    if (f.excluded.length === 0 && f.groups.every(g => g.tokens.length === 0))
                        delete _analyseFilters[col];
                    _aRefreshBuilder(col);
                    analyseApplyFilters();
                };
                chip.appendChild(t);
                chip.appendChild(rm);
                exclRow.appendChild(chip);
            });
            ec.appendChild(exclRow);
        }
    }

    analyseUpdateActiveCount();
}

// ── Opérations sur les filtres list ──────────────────────────────────────────
function _aListAddToken(col, token, groupIdx) {
    const f = _aGetListFilter(col);
    while (f.groups.length <= groupIdx) {
        f.groups.push({ tokens: [] });
        f.ops.push('AND');
    }
    if (!f.groups[groupIdx].tokens.includes(token)) f.groups[groupIdx].tokens.push(token);
}

function _aListRemoveToken(col, gi, ti) {
    const f = _analyseFilters[col];
    if (!f) return;
    f.groups[gi].tokens.splice(ti, 1);
    _aCleanGroups(col);
    _aRefreshBuilder(col);
    analyseApplyFilters();
}

function _aListRemoveGroup(col, gi) {
    const f = _analyseFilters[col];
    if (!f || f.groups.length <= 1) {
        _aListClear(_aId(col));
        return;
    }
    f.groups.splice(gi, 1);
    // Retirer l'opérateur associé (ops[gi-1] relie le groupe précédent à celui-ci)
    if (f.ops.length >= gi && gi > 0) f.ops.splice(gi - 1, 1);
    else if (f.ops.length > 0) f.ops.splice(0, 1);
    _aCleanGroups(col);
    _aRefreshBuilder(col);
    analyseApplyFilters();
}

function _aListAddGroup(colId, op) {
    const col = _aColById(colId);
    if (!col) return;
    const f = _aGetListFilter(col);
    f.groups.push({ tokens: [] });
    f.ops.push(op || 'AND');
    _aRefreshBuilder(col);
}

function _aListClear(colId) {
    const col = _aColById(colId);
    if (!col) return;
    delete _analyseFilters[col];
    _aRefreshBuilder(col);
    analyseApplyFilters();
}

function _aCleanGroups(col) {
    const f = _analyseFilters[col];
    if (!f) return;
    // Supprimer les groupes vides tout en maintenant ops en cohérence
    const newGroups = [];
    const newOps = [];
    f.groups.forEach((g, i) => {
        if (g.tokens.length > 0) {
            if (newGroups.length > 0) newOps.push(f.ops[i - 1] || 'AND');
            newGroups.push(g);
        }
    });
    if (newGroups.length === 0) {
        delete _analyseFilters[col];
        return;
    }
    f.groups = newGroups;
    f.ops = newOps;
}

function _aMoveToken(col, fromGi, fromTi, toGi, toTi) {
    const f = _aGetListFilter(col);
    const token = f.groups[fromGi].tokens.splice(fromTi, 1)[0];
    while (f.groups.length <= toGi) {
        f.groups.push({ tokens: [] });
        f.ops.push('AND');
    }
    let insertAt = fromGi === toGi && fromTi < toTi ? toTi - 1 : toTi;
    insertAt = Math.max(0, Math.min(insertAt, f.groups[toGi].tokens.length));
    f.groups[toGi].tokens.splice(insertAt, 0, token);
    _aCleanGroups(col);
    _aRefreshBuilder(col);
    analyseApplyFilters();
}

function analyseRenderColumnCheckboxes() {
    const container = document.getElementById('analyseColumnCheckboxes');
    container.innerHTML = _analyseHeaders
        .map(col => {
            const checked = _analyseVisibleCols.includes(col);
            return `<label style="display:flex; align-items:center; gap:4px; font-size:12px; background:${checked ? '#e8eaf6' : '#fff'}; padding:3px 8px; border-radius:12px; cursor:pointer; border:1px solid #c5cae9;">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="analyseToggleCol('${col.replace(/'/g, "\\'")}', this.checked)" style="cursor:pointer;">
            ${col}
        </label>`;
        })
        .join('');
}

function analyseToggleCol(col, visible) {
    if (visible) {
        if (!_analyseVisibleCols.includes(col)) _analyseVisibleCols.push(col);
    } else {
        _analyseVisibleCols = _analyseVisibleCols.filter(c => c !== col);
    }
    analyseRenderTable(_analyseCurrentFiltered || [], false);
    analyseRenderColumnCheckboxes();
}

function toggleAnalyseColumns() {
    const p = document.getElementById('analyseColumnsPanel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

let _analyseCurrentFiltered = [];

// ── Détection des doublons ────────────────────────────────────────────────────
function toggleAnalyseDups() {
    const panel = document.getElementById('analyseDupPanel');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) analyseBuildDupCheckboxes();
}

function analyseBuildDupCheckboxes() {
    const container = document.getElementById('analyseDupCheckboxes');
    container.innerHTML = '';
    _analyseHeaders.forEach(col => {
        const checked = _analyseDupCols.includes(col);
        const id = 'dupck_' + _aId(col);
        const label = document.createElement('label');
        label.style.cssText =
            'display:flex; align-items:center; gap:4px; background:' +
            (checked ? '#f48fb1' : '#fff') +
            '; border:1px solid #f48fb1; border-radius:12px; padding:3px 10px; cursor:pointer; font-size:11px; color:#880e4f; user-select:none; transition:background 0.1s;';
        label.innerHTML = `<input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="cursor:pointer;" onchange="analyseDupToggleCol('${col.replace(/'/g, "\\'")}',this.checked)"><span>${col}</span>`;
        container.appendChild(label);
    });
}

function analyseDupToggleCol(col, checked) {
    if (checked) {
        if (!_analyseDupCols.includes(col)) _analyseDupCols.push(col);
    } else {
        _analyseDupCols = _analyseDupCols.filter(c => c !== col);
    }
    analyseComputeDups();
    analyseRenderTable(_analyseCurrentFiltered, false);
    analyseBuildDupCheckboxes();
}

function analyseDupSelectAll(sel) {
    _analyseDupCols = sel ? [..._analyseHeaders] : [];
    analyseComputeDups();
    analyseRenderTable(_analyseCurrentFiltered, false);
    analyseBuildDupCheckboxes();
}

function analyseComputeDups() {
    _analyseDupKeys = new Set();
    if (_analyseDupCols.length === 0) {
        document.getElementById('analyseDupCount').textContent = '';
        return;
    }
    const counter = new Map();
    // Calculer sur tout _analyseData (pas seulement filtered) pour détecter tous les doublons
    _analyseData.forEach(row => {
        const key = _analyseDupCols.map(c => (row[c] || '').toString().trim()).join('\x00');
        counter.set(key, (counter.get(key) || 0) + 1);
    });
    counter.forEach((count, key) => {
        if (count > 1) _analyseDupKeys.add(key);
    });
    const dupRows = _analyseCurrentFiltered.filter(row => {
        const key = _analyseDupCols.map(c => (row[c] || '').toString().trim()).join('\x00');
        return _analyseDupKeys.has(key);
    }).length;
    document.getElementById('analyseDupCount').textContent =
        dupRows > 0 ? `${dupRows.toLocaleString('fr-FR')} ligne(s) en doublon` : 'Aucun doublon détecté';
}

function analyseApplyFilters() {
    const normStr = s =>
        (s || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

    const filtered = _analyseData.filter(row => {
        for (const col of _analyseHeaders) {
            const f = _analyseFilters[col];
            if (!f || f === null) continue;
            const val = (row[col] || '').toString();
            const type = _analyseColTypes[col];

            if (type === 'list') {
                if (!f.groups) continue;
                const rowToks = new Set(
                    val
                        .split(/\s*;\s*/)
                        .map(t => t.trim())
                        .filter(Boolean)
                );
                // Exclusion prioritaire
                if ((f.excluded || []).some(t => rowToks.has(t))) return false;
                const activeGroups = f.groups
                    .map((g, i) => ({ tokens: g.tokens, origIdx: i }))
                    .filter(g => g.tokens.length > 0);
                if (activeGroups.length === 0) continue;
                // \u00c9valuation gauche-droite selon ops[]
                // ops[i] est l'op\u00e9rateur entre groupes[i] et groupes[i+1] dans la liste d'origine
                // On recalcule sur les groupes actifs avec leurs op\u00e9rateurs
                let result = activeGroups[0].tokens.some(t => rowToks.has(t));
                for (let gi = 1; gi < activeGroups.length; gi++) {
                    const op = (f.ops && f.ops[activeGroups[gi].origIdx - 1]) || 'AND';
                    const gMatch = activeGroups[gi].tokens.some(t => rowToks.has(t));
                    result = op === 'OR' ? result || gMatch : result && gMatch;
                }
                if (!result) return false;
            } else if (type === 'enum') {
                if (!f.groups) {
                    if (val !== f) return false;
                    continue;
                }
                // Exclusion prioritaire
                if ((f.excluded || []).includes(val)) return false;
                const activeGroups = f.groups
                    .map((g, i) => ({ tokens: g.tokens, origIdx: i }))
                    .filter(g => g.tokens.length > 0);
                if (activeGroups.length === 0) continue;
                let result = activeGroups[0].tokens.some(t => val === t);
                for (let gi = 1; gi < activeGroups.length; gi++) {
                    const op = (f.ops && f.ops[activeGroups[gi].origIdx - 1]) || 'AND';
                    const gMatch = activeGroups[gi].tokens.some(t => val === t);
                    result = op === 'OR' ? result || gMatch : result && gMatch;
                }
                if (!result) return false;
            } else if (type === 'date' && f && typeof f === 'object' && f.mode) {
                // Filtre date avec mode : after / before / between / exact
                // Les dates du fichier sont au format DD/MM/YYYY HH:mm ou DD/MM/YYYY
                const parseRowDate = s => {
                    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                    return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : null;
                };
                const rowD = parseRowDate(val);
                if (!rowD) return false; // date invalide → exclure si filtre actif
                const toD = s => (s ? new Date(s) : null);
                const { mode, date, from, to } = f;
                if (mode === 'exact' && date) {
                    if (rowD.toISOString().slice(0, 10) !== date) return false;
                } else if (mode === 'after' && date) {
                    if (rowD < toD(date)) return false;
                } else if (mode === 'before' && date) {
                    if (rowD > toD(date)) return false;
                } else if (mode === 'between') {
                    if (from && rowD < toD(from)) return false;
                    if (to && rowD > toD(to)) return false;
                }
            } else {
                // Support des jokers * (n'importe quelle séquence) et ? (un caractère)
                const fStr = normStr(typeof f === 'string' ? f : '');
                let match;
                if (fStr.includes('*') || fStr.includes('?')) {
                    const reStr =
                        '^' +
                        fStr
                            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                            .replace(/\*/g, '.*')
                            .replace(/\?/g, '.') +
                        '$';
                    try {
                        match = new RegExp(reStr, 'i').test(normStr(val));
                    } catch (e) {
                        match = false;
                    }
                } else {
                    match = normStr(val).includes(fStr);
                }
                if (!match) return false;
            }
        }
        return true;
    });

    _analyseCurrentFiltered = filtered;

    const total = _analyseData.length;
    const shown = filtered.length;
    document.getElementById('analyseStatsHeader').textContent =
        `${shown.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} lignes`;
    document.getElementById('analyseResultCount').textContent =
        `${shown.toLocaleString('fr-FR')} résultat(s) sur ${total.toLocaleString('fr-FR')} lignes`;

    analyseUpdateActiveCount();
    if (_analyseDupCols.length > 0) analyseComputeDups();
    analyseRenderTable(filtered);
}

function analyseUpdateActiveCount() {
    let count = 0;
    for (const [col, f] of Object.entries(_analyseFilters)) {
        if (!f || f === null || f === '') continue;
        if (f.groups) {
            // list/enum filter: compter si au moins un token actif OU au moins une exclusion
            if (f.groups.some(g => g.tokens.length > 0) || (f.excluded && f.excluded.length > 0)) count++;
        } else {
            count++;
        }
    }
    const el = document.getElementById('analyseActiveFiltersCount');
    el.textContent = count > 0 ? `${count} filtre(s)` : 'Aucun';
    el.style.background = count > 0 ? '#3f51b5' : '#e8eaf6';
    el.style.color = count > 0 ? 'white' : '#3f51b5';
}

function analyseRenderTable(data, resetPage = true) {
    if (resetPage) _analysePage = 1;
    const pageSize = _analysePageSize;
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    if (_analysePage > totalPages) _analysePage = totalPages;

    document.getElementById('analysePage').textContent = _analysePage;
    document.getElementById('analysePageTotal').textContent = totalPages;

    const cols = _analyseVisibleCols.filter(c => _analyseHeaders.includes(c));
    const slice = data.slice((_analysePage - 1) * pageSize, _analysePage * pageSize);

    // Header
    const thead = document.getElementById('analyseTableHead');
    thead.innerHTML = `<tr>${cols.map(c => `<th style="padding:8px 10px; text-align:left; font-size:11px; font-weight:600; white-space:nowrap; min-width:80px; border-right:1px solid rgba(255,255,255,0.2);" title="${c}">${c}</th>`).join('')}</tr>`;

    // Body
    const tbody = document.getElementById('analyseTableBody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${cols.length}" style="padding:40px; text-align:center; color:#999; font-style:italic;">Aucun résultat</td></tr>`;
        return;
    }

    const rows = slice
        .map((row, i) => {
            const isDup =
                _analyseDupCols.length > 0 &&
                _analyseDupKeys.has(_analyseDupCols.map(c => (row[c] || '').toString().trim()).join('\x00'));
            const bg = isDup ? '#fce4ec' : i % 2 === 0 ? 'white' : '#f8f9ff';
            const hoverBg = isDup ? '#f8bbd0' : '#fffde7';
            const dupMark = isDup ? ' title="Ligne en doublon"' : '';
            const cells = cols
                .map(c => {
                    const v = (row[c] || '').toString();
                    const display = v.length > 120 ? v.substring(0, 120) + '…' : v;
                    return `<td style="padding:6px 10px; border-bottom:1px solid ${isDup ? '#f48fb1' : '#f0f0f0'}; border-right:1px solid #f0f0f0; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px;" title="${v.replace(/"/g, '&quot;')}">${display}</td>`;
                })
                .join('');
            return `<tr style="background:${bg};"${dupMark} onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='${bg}'">${cells}</tr>`;
        })
        .join('');
    tbody.innerHTML = rows;
}

function analyseGoPage(delta) {
    const total = Math.max(1, Math.ceil(_analyseCurrentFiltered.length / _analysePageSize));
    _analysePage = Math.max(1, Math.min(total, _analysePage + delta));
    analyseRenderTable(_analyseCurrentFiltered, false);
}

function analyseJumpPage(val) {
    const n = parseInt(val);
    if (!n || isNaN(n)) return;
    const total = Math.max(1, Math.ceil(_analyseCurrentFiltered.length / _analysePageSize));
    _analysePage = Math.max(1, Math.min(total, n));
    const ji = document.getElementById('analysePageJump');
    if (ji) ji.value = '';
    analyseRenderTable(_analyseCurrentFiltered, false);
}

function analyseSetPageSize(val) {
    _analysePageSize = parseInt(val);
    analyseRenderTable(_analyseCurrentFiltered);
}

function analyseClearAllFilters() {
    _analyseFilters = {};
    _analysePage = 1;
    // Rafraîchir les builders list et enum (même widget désormais)
    for (const col of _analyseHeaders) {
        if (_analyseColTypes[col] === 'list' || _analyseColTypes[col] === 'enum') _aRefreshBuilder(col);
    }
    // Re-render complet pour remettre les inputs text/date à zéro
    analyseRenderFilters();
    analyseApplyFilters();
}

function analyseExportCSV() {
    if (_analyseCurrentFiltered.length === 0) {
        alert('Aucune donnée à exporter');
        return;
    }
    const cols = _analyseVisibleCols.filter(c => _analyseHeaders.includes(c));
    const escape = v => '"' + (v || '').toString().replace(/"/g, '""') + '"';
    const lines = [cols.map(escape).join(';')];
    _analyseCurrentFiltered.forEach(row => {
        lines.push(cols.map(c => escape(row[c])).join(';'));
    });
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analyse_export_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}
