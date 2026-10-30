// Application principale : dump
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ===== DUMP COMPLET / RESTAURATION =====
let _dumpToken = null;

function _fmtBytes(n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' o';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' Ko';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' Mo';
    return (n / 1073741824).toFixed(2) + ' Go';
}

async function adminCreateDump() {
    const btn = document.getElementById('dumpCreateBtn');
    const st = document.getElementById('dumpCreateStatus');
    btn.disabled = true;
    st.textContent = '⏳ Génération en cours…';
    try {
        const res = await fetch(`${API_URL}/admin/dump`, { credentials: 'include' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erreur ${res.status}`);
        }
        const filename = res.headers.get('X-Dump-Filename') || 'gantt-dump.gpdump';
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        st.textContent = `✅ ${filename} (${_fmtBytes(blob.size)})`;
    } catch (e) {
        st.textContent = '❌ ' + e.message;
    } finally {
        btn.disabled = false;
    }
}

function adminInspectDump() {
    const file = document.getElementById('dumpFileInput').files[0];
    const out = document.getElementById('dumpInspectResult');
    if (!file) {
        out.innerHTML = '<span style="color:#c62828;font-size:12px;">Sélectionnez d\'abord un fichier .gpdump.</span>';
        return;
    }
    out.innerHTML = '';
    _dumpToken = null;
    const prog = document.getElementById('dumpUploadProgress');
    const bar = document.getElementById('dumpUploadBar');
    const label = document.getElementById('dumpUploadLabel');
    prog.style.display = 'block';
    bar.style.width = '0';
    label.textContent = 'Envoi…';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/admin/dump/inspect`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Dump-Filename', encodeURIComponent(file.name));
    xhr.upload.onprogress = ev => {
        if (!ev.lengthComputable) return;
        bar.style.width = (ev.loaded / ev.total) * 100 + '%';
        label.textContent = `Envoi ${_fmtBytes(ev.loaded)} / ${_fmtBytes(ev.total)}`;
    };
    xhr.upload.onload = () => {
        label.textContent = 'Analyse du dump…';
    };
    xhr.onload = () => {
        prog.style.display = 'none';
        let data = {};
        try {
            data = JSON.parse(xhr.responseText);
        } catch (e) {
            /* ignore */
        }
        if (xhr.status !== 200) {
            out.innerHTML = `<div style="color:#c62828;font-size:13px;">❌ ${escapeHtml(data.error || 'Erreur ' + xhr.status)}</div>`;
            return;
        }
        _dumpToken = data.token;
        renderDumpInspect(data);
    };
    xhr.onerror = () => {
        prog.style.display = 'none';
        out.innerHTML = '<div style="color:#c62828;font-size:13px;">❌ Erreur réseau pendant l\'envoi.</div>';
    };
    xhr.send(file);
}

function renderDumpInspect(d) {
    const m = d.manifest;
    const cur = d.current;
    const e = escapeHtml;
    const fmtDate = iso => new Date(iso).toLocaleString('fr-FR');
    const verColor = d.versionRelation === 0 ? '#2e7d32' : d.versionRelation === 1 ? '#c62828' : '#e65100';
    const wColors = { danger: ['#ffebee', '#c62828'], warn: ['#fff3e0', '#e65100'], info: ['#e3f2fd', '#1565c0'] };
    const warnHtml = (d.warnings || [])
        .map(w => {
            const [bg, fg] = wColors[w.level] || wColors.info;
            return `<div style="background:${bg};color:${fg};border-left:4px solid ${fg};padding:7px 10px;margin-bottom:6px;font-size:12px;border-radius:3px;">${e(w.text)}</div>`;
        })
        .join('');

    const names = [...new Set([...Object.keys(m.tables || {}), ...Object.keys(cur.tables || {})])].sort();
    const rows = names
        .map(t => {
            const a = m.tables?.[t],
                b = cur.tables?.[t];
            const note =
                a === undefined
                    ? 'absente du dump (sera vidée)'
                    : b === undefined
                      ? 'inconnue localement (ignorée)'
                      : '';
            const diff = a !== undefined && b !== undefined && a !== b;
            return `<tr style="${diff || note ? 'background:#fffde7;' : ''}"><td style="padding:3px 8px;">${e(t)}</td><td style="padding:3px 8px;text-align:right;">${a ?? '—'}</td><td style="padding:3px 8px;text-align:right;">${b ?? '—'}</td><td style="padding:3px 8px;color:#e65100;">${e(note)}</td></tr>`;
        })
        .join('');

    const sd = d.schemaDiff || {};
    const colNotes = [
        ...Object.entries(sd.columnsIgnored || {}).map(([t, c]) => `${t} : colonnes ignorées (${c.join(', ')})`),
        ...Object.entries(sd.columnsDefaulted || {}).map(
            ([t, c]) => `${t} : colonnes à valeur par défaut (${c.join(', ')})`
        )
    ];

    document.getElementById('dumpInspectResult').innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px;font-size:12px;">
                    <div style="background:#f5f5f5;padding:8px 10px;border-radius:4px;"><div style="color:#777;">Fichier</div><strong>${e(d.filename)}</strong><div>${_fmtBytes(d.fileSize)} (base : ${_fmtBytes(m.db.size)})</div></div>
                    <div style="background:#f5f5f5;padding:8px 10px;border-radius:4px;"><div style="color:#777;">Date de sauvegarde</div><strong>${e(fmtDate(m.createdAt))}</strong><div>par ${e(m.createdBy?.nom || '—')}</div></div>
                    <div style="background:#f5f5f5;padding:8px 10px;border-radius:4px;border-left:4px solid ${verColor};"><div style="color:#777;">Version du site</div>dump <strong>${e(m.appVersion || '?')}</strong> → serveur <strong>${e(cur.appVersion || '?')}</strong></div>
                    <div style="background:#f5f5f5;padding:8px 10px;border-radius:4px;"><div style="color:#777;">Origine</div><strong>${e(m.source?.host || m.source?.hostname || '—')}</strong><div>${m.totalRows} lignes · ${Object.keys(m.tables || {}).length} tables · ${(m.files || []).length} PDF</div></div>
                </div>
                ${warnHtml}
                <details style="margin:10px 0;"><summary style="cursor:pointer;font-size:12px;color:#3949ab;">Détail par table (dump ↔ serveur actuel)</summary>
                    <table style="font-size:12px;border-collapse:collapse;margin-top:6px;"><thead><tr style="background:#e8eaf6;"><th style="padding:3px 8px;text-align:left;">Table</th><th style="padding:3px 8px;">Dump</th><th style="padding:3px 8px;">Actuel</th><th></th></tr></thead><tbody>${rows}</tbody></table>
                    ${colNotes.length ? `<div style="font-size:11px;color:#e65100;margin-top:6px;">${colNotes.map(e).join('<br>')}</div>` : ''}
                </details>
                <div style="margin:12px 0;font-size:12px;">
                    <label style="display:block;margin-bottom:4px;"><input type="checkbox" id="dumpOptEmails" checked style="width:auto;display:inline-block;margin:0 6px 0 0;vertical-align:middle;"> Neutraliser les emails sortants (vider la file d'attente et désactiver le SMTP importé) — <strong>recommandé</strong></label>
                    <label style="display:block;"><input type="checkbox" id="dumpOptPdfs" checked style="width:auto;display:inline-block;margin:0 6px 0 0;vertical-align:middle;"> Restaurer aussi les PDF des CRA (${(m.files || []).length})</label>
                </div>
                <div style="font-size:12px;margin-bottom:6px;">Pour confirmer, saisissez le nom de ce serveur : <code style="background:#eee;padding:1px 6px;border-radius:3px;">${e(cur.hostname)}</code></div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input type="text" id="dumpConfirmInput" autocomplete="off" placeholder="${e(cur.hostname)}" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;width:220px;" data-expected="${e(cur.hostname).replace(/"/g, '&quot;')}" oninput="dumpConfirmChanged(this)">
                    <button id="dumpRestoreBtn" disabled onclick="adminRestoreDump()" style="background:#c62828;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:not-allowed;opacity:.45;font-weight:bold;font-size:13px;">♻️ Restaurer ce dump</button>
                    <button onclick="adminCancelDump()" style="background:#9e9e9e;color:white;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Annuler</button>
                </div>
                <div id="dumpRestoreStatus" style="margin-top:10px;font-size:12px;"></div>`;
}

function dumpConfirmChanged(input) {
    const btn = document.getElementById('dumpRestoreBtn');
    const ok = input.value === input.dataset.expected;
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '.45';
    btn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

async function adminCancelDump() {
    if (_dumpToken)
        fetch(`${API_URL}/admin/dump/upload/${_dumpToken}`, { method: 'DELETE', credentials: 'include' }).catch(
            () => {}
        );
    _dumpToken = null;
    document.getElementById('dumpInspectResult').innerHTML = '';
    document.getElementById('dumpFileInput').value = '';
}

async function adminRestoreDump() {
    if (!_dumpToken) return;
    if (
        !confirm(
            'Dernière confirmation : la base de CE serveur va être entièrement remplacée par le contenu du dump.\n\nUne sauvegarde de sécurité est créée avant, et vous serez déconnecté ensuite.\n\nContinuer ?'
        )
    )
        return;
    const btn = document.getElementById('dumpRestoreBtn');
    const st = document.getElementById('dumpRestoreStatus');
    btn.disabled = true;
    st.innerHTML = '⏳ Restauration en cours… ne fermez pas cette page.';
    try {
        const res = await fetch(`${API_URL}/admin/dump/restore`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: _dumpToken,
                confirmation: document.getElementById('dumpConfirmInput').value,
                options: {
                    neutralizeEmails: document.getElementById('dumpOptEmails').checked,
                    restorePdfs: document.getElementById('dumpOptPdfs').checked
                }
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        _dumpToken = null;
        alert(
            `✅ Restauration terminée en ${(data.durationMs / 1000).toFixed(1)} s\n\n${data.rows} lignes dans ${data.tables} tables, ${data.pdfs} PDF.\nSauvegarde de sécurité : ${data.safetyBackup}\n\nIl est recommandé de redémarrer le serveur, puis de vous reconnecter avec un compte du dump.`
        );
        window.location.reload();
    } catch (e) {
        st.innerHTML = `<span style="color:#c62828;">❌ ${escapeHtml(e.message)}</span>`;
        btn.disabled = false;
    }
}

function showSyncStatus() {
    const status = document.getElementById('syncStatus');
    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}
