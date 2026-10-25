// Application principale : cra
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== AUTOMATISATION N°3: NOTIFICATIONS TEAMS ==========

// Toggle affichage de la configuration Teams
function toggleAutomation3Config() {
    const enabled = document.getElementById('automation3Enabled').checked;
    const configDiv = document.getElementById('automation3Config');
    configDiv.style.display = enabled ? 'block' : 'none';
    saveAutomation3Config();
}

// Charger la configuration de l'automatisation n°3
// ========== AUTOMATION 4 — CRA ==========

async function loadAutomation4Config() {
    populateAutomation4TestExpert();
    try {
        const res = await fetch(`${API_URL}/settings`, { credentials: 'include' });
        const data = await res.json();
        const config = data.automation_4_config ? JSON.parse(data.automation_4_config) : {};
        window._craConfig = config;

        document.getElementById('automation4Enabled').checked = config.enabled || false;

        const daySelect = document.getElementById('automation4Day');
        daySelect.innerHTML = Array.from(
            { length: 28 },
            (_, i) => `<option value="${i + 1}" ${config.day === i + 1 ? 'selected' : ''}>${i + 1}</option>`
        ).join('');

        const usersRes = await fetch(`${API_URL}/users`, { credentials: 'include' });
        const usersData = await usersRes.json();
        const rhUsers = (usersData.users || usersData || []).filter(u => u.is_rh === 1 && u.actif === 1);

        const rhOptions =
            '<option value="">-- Choisir --</option>' +
            rhUsers
                .map(
                    u =>
                        `<option value="${u.id}" data-email="${u.email}" data-nom="${u.nom}" data-prenom="${u.prenom}">${(u.nom || '').toUpperCase()} ${u.prenom || ''}</option>`
                )
                .join('');

        document.getElementById('automation4AdminN1').innerHTML = rhOptions;
        document.getElementById('automation4AdminN2').innerHTML = rhOptions;
        if (config.admin_n1_id) document.getElementById('automation4AdminN1').value = config.admin_n1_id;
        if (config.admin_n2_id) document.getElementById('automation4AdminN2').value = config.admin_n2_id;

        // DRH ANS : multi-select parmi les profils RH
        const drhSel = document.getElementById('automation4DrhAns');
        drhSel.innerHTML = rhUsers
            .map(
                u =>
                    `<option value="${u.id}" data-email="${u.email}" data-nom="${u.nom}" data-prenom="${u.prenom}">${(u.nom || '').toUpperCase()} ${u.prenom || ''}</option>`
            )
            .join('');
        const savedDrhIds = config.drh_ans_ids || [];
        Array.from(drhSel.options).forEach(opt => {
            opt.selected = savedDrhIds.includes(parseInt(opt.value));
        });

        await loadAutomation4ExpertsList(config);
    } catch (e) {
        console.error('Erreur chargement config automation4:', e);
    }
}

async function loadAutomation4ExpertsList(config = {}) {
    try {
        const res = await fetch(`${API_URL}/cra/experts-astreinte`, { credentials: 'include' });
        const experts = await res.json();
        const container = document.getElementById('automation4ExpertsList');
        if (!experts.length) {
            container.innerHTML =
                '<p style="padding:15px;color:#999;font-size:12px;">Aucun expert avec astreinte activée.</p>';
            return;
        }
        container.innerHTML = experts
            .map(expert => {
                return `<div style="padding:10px 15px;border-bottom:1px solid #f3e5f5;display:flex;align-items:center;gap:10px;">
                        <strong style="font-size:13px;min-width:180px;">${(expert.nom || '').toUpperCase()} ${expert.prenom || ''}</strong>
                        <span style="font-size:11px;color:#666;">${expert.samu || ''} — ${expert.es_rattachement || ''}</span>
                        <span style="font-size:11px;color:#9c27b0;margin-left:auto;">📧 Contacts RH définis dans la fiche ressource</span>
                    </div>`;
            })
            .join('');
    } catch (e) {
        console.error('Erreur chargement experts astreinte:', e);
    }
}

async function saveAutomation4Config() {
    const n1Select = document.getElementById('automation4AdminN1');
    const n2Select = document.getElementById('automation4AdminN2');
    const drhSel = document.getElementById('automation4DrhAns');
    const n1Option = n1Select.options[n1Select.selectedIndex];
    const n2Option = n2Select.options[n2Select.selectedIndex];
    const drhAnsIds = drhSel ? Array.from(drhSel.selectedOptions).map(o => parseInt(o.value)) : [];
    const drhAnsInfos = drhSel
        ? Array.from(drhSel.selectedOptions).map(o => ({
              id: parseInt(o.value),
              email: o.dataset.email || '',
              nom: `${o.dataset.prenom || ''} ${o.dataset.nom || ''}`.trim()
          }))
        : [];
    const config = {
        enabled: document.getElementById('automation4Enabled').checked,
        day: parseInt(document.getElementById('automation4Day').value) || 1,
        admin_n1_id: n1Select.value || null,
        admin_n1_email: n1Option?.dataset?.email || '',
        admin_n1_nom: n1Option ? `${n1Option.dataset?.prenom || ''} ${n1Option.dataset?.nom || ''}` : '',
        admin_n2_id: n2Select.value || null,
        admin_n2_email: n2Option?.dataset?.email || '',
        admin_n2_nom: n2Option ? `${n2Option.dataset?.prenom || ''} ${n2Option.dataset?.nom || ''}` : '',
        drh_ans_ids: drhAnsIds,
        drh_ans_infos: drhAnsInfos
    };
    window._craConfig = config;
    try {
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: 'automation_4_config', value: JSON.stringify(config) })
        });
    } catch (e) {
        console.error('Erreur sauvegarde config automation4:', e);
    }
}

async function populateAutomation4TestExpert() {
    const sel = document.getElementById('automation4TestExpert');
    if (!sel || sel.options.length > 1) return;
    try {
        const res = await fetch(`${API_URL}/cra/experts-astreinte`, { credentials: 'include' });
        const experts = await res.json();
        experts.forEach(exp => {
            if (!exp.user_id) return;
            const opt = document.createElement('option');
            opt.value = exp.user_id;
            opt.textContent = `${exp.prenom} ${exp.nom}`;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error('Erreur chargement experts test CRA:', e);
    }
}

async function testAutomation4() {
    const resultDiv = document.getElementById('automation4TestResult');
    resultDiv.textContent = '⏳ Test en cours...';
    const expertId = document.getElementById('automation4TestExpert')?.value || '';
    try {
        const res = await fetch(`${API_URL}/automation/cra/trigger`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: expertId || null })
        });
        const data = await res.json();
        const logs = data.logs || [];
        const hasError = logs.some(l => l.includes('❌') || l.includes('⚠️'));

        resultDiv.innerHTML = data.success
            ? `✅ ${data.sent} email(s) mis en queue — <button onclick="showCraTestLogs()" style="background:none;border:none;color:#6a1b9a;cursor:pointer;text-decoration:underline;font-size:12px;">📋 Voir les logs détaillés</button>`
            : `❌ Erreur — <button onclick="showCraTestLogs()" style="background:none;border:none;color:#e53935;cursor:pointer;text-decoration:underline;font-size:12px;">📋 Voir les logs</button>`;

        window._lastCraTestLogs = logs;
    } catch (e) {
        resultDiv.textContent = '❌ Erreur réseau : ' + e.message;
    }
}

function showCraTestLogs() {
    const logs = window._lastCraTestLogs || [];
    // Créer modale si inexistante
    let modal = document.getElementById('craTestLogsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'craTestLogsModal';
        modal.className = 'modal';
        modal.style.zIndex = '10010';
        modal.innerHTML = `
                    <div class="modal-content" style="max-width:700px;max-height:80vh;overflow-y:auto;padding:0;">
                        <div style="position:sticky;top:0;background:#2c3e50;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">
                            <strong>📋 Logs — Test Automation CRA</strong>
                            <button onclick="document.getElementById('craTestLogsModal').classList.remove('active')" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;">✕</button>
                        </div>
                        <div id="craTestLogsBody" style="padding:16px;font-family:monospace;font-size:12px;line-height:1.8;background:#1e1e2e;color:#cdd6f4;"></div>
                        <div style="padding:12px 20px;border-top:1px solid #eee;text-align:right;">
                            <button onclick="document.getElementById('craTestLogsModal').classList.remove('active')" style="background:#6a1b9a;color:white;padding:8px 18px;border:none;border-radius:4px;cursor:pointer;">Fermer</button>
                        </div>
                    </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('craTestLogsBody').innerHTML = logs
        .map(l => {
            let color = '#cdd6f4';
            if (l.includes('✅')) color = '#a6e3a1';
            else if (l.includes('❌') || l.includes('⚠️')) color = '#f38ba8';
            else if (l.includes('───')) color = '#89b4fa';
            else if (l.startsWith('  •') || l.startsWith('  ')) color = '#cba6f7';
            return `<div style="color:${color};padding:1px 0;">${l.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
        })
        .join('');
    modal.classList.add('active');
}

// ========== ONGLET MON CRA ==========

async function downloadCraPdf(craId) {
    try {
        // Récupérer les données du CRA
        const res = await fetch(`${API_URL}/cra/${craId}`, { credentials: 'include' });
        if (!res.ok) {
            alert('Erreur chargement CRA');
            return;
        }
        const cra = await res.json();

        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const moisCap = moisNom.charAt(0).toUpperCase() + moisNom.slice(1);
        const now = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const sigsMap = { 1: null, 2: null, 3: null };
        (cra.signatures || []).forEach(s => {
            sigsMap[s.rang] = s;
        });
        const sigBlock = (rang, label) => {
            const s = sigsMap[rang];
            if (!s)
                return `<div class="sig-box empty"><div class="sig-label">${label}</div><div class="sig-line"></div><div class="sig-pending">En attente</div></div>`;
            return `<div class="sig-box done"><div class="sig-label">${label}</div>
                        <div class="sig-name">${s.signer_name}</div>
                        <div class="sig-ok">✅ Signé électroniquement</div>
                        <div class="sig-date">${new Date(s.signed_at).toLocaleString('fr-FR')}</div>
                        <div class="sig-ip">IP : ${s.ip_address || 'N/A'}</div></div>`;
        };

        const lignesHtml = (cra.astreintes_hno || []).length
            ? (cra.astreintes_hno || [])
                  .map(
                      (a, i) => `<tr class="${i % 2 ? 'odd' : ''}">
                        <td class="type-${a.type}">${a.type === 'astreinte' ? '🔔 Astreinte' : a.type === 'activite_courante' ? '✅ Activité courante' : '🌙 HNO'}</td>
                        <td>${a.date_debut ? new Date(a.date_debut).toLocaleDateString('fr-FR') : ''}</td>
                        <td>${a.date_fin ? new Date(a.date_fin).toLocaleDateString('fr-FR') : ''}</td>
                        <td>${a.heure_debut || ''} ${a.heure_fin ? '→ ' + a.heure_fin : ''}</td>
                        <td>${a.samu || ''}</td>
                        <td>${a.objet || ''}</td>
                    </tr>`
                  )
                  .join('')
            : `<tr><td colspan="6" class="empty-row">Aucune activité enregistrée</td></tr>`;

        const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>CRA ${cra.expert_nom} - ${moisCap}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#2c3e50;padding:15mm;}
  @media print{body{padding:0;}@page{margin:15mm;}}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6a1b9a;padding-bottom:12px;margin-bottom:14px;}
  .header-logo{font-size:13px;font-weight:bold;color:#1D70B7;line-height:1.4;}
  .header-logo small{font-size:9px;color:#888;display:block;}
  .header-title{text-align:center;flex:1;padding:0 20px;}
  .header-title h1{font-size:16px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;letter-spacing:1px;}
  .header-title h2{font-size:12px;color:#2c3e50;margin-top:4px;}
  .header-meta{font-size:9px;color:#888;text-align:right;}
  .info-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10px;}
  .info-table td{padding:5px 8px;border:1px solid #d1b3e0;}
  .info-table tr{background:#f3e5f5;}
  .info-table td:first-child{font-weight:bold;width:100px;}
  .section-title{font-size:10px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;}
  table.activites{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;}
  table.activites th{background:#6a1b9a;color:white;padding:6px 8px;text-align:left;border:1px solid #4a0e7a;}
  table.activites td{padding:5px 8px;border:1px solid #ddd;}
  table.activites tr.odd td{background:#f9f4ff;}
  .type-astreinte{font-weight:bold;color:#e65100;}
  .type-hno{font-weight:bold;color:#1565c0;}
  .empty-row{text-align:center;color:#999;padding:12px;}
  .commentaire{background:#f3e5f5;border-left:4px solid #6a1b9a;padding:8px 12px;margin-bottom:14px;font-size:10px;}
  .sigs{display:flex;gap:10px;margin-top:12px;}
  .sig-box{flex:1;border:1px solid #b39ddb;border-radius:5px;padding:10px;text-align:center;}
  .sig-box.done{border:2px solid #6a1b9a;background:#faf5ff;}
  .sig-label{font-size:9px;color:#6a1b9a;text-transform:uppercase;font-weight:bold;margin-bottom:6px;letter-spacing:0.5px;}
  .sig-line{height:28px;border-bottom:1px dashed #ccc;margin-bottom:6px;}
  .sig-pending{font-size:9px;color:#bbb;}
  .sig-name{font-weight:bold;font-size:11px;color:#2c3e50;margin-bottom:3px;}
  .sig-ok{font-size:9px;color:#27ae60;font-weight:bold;}
  .sig-date{font-size:9px;color:#888;margin-top:2px;}
  .sig-ip{font-size:8px;color:#bbb;margin-top:1px;}
  .footer-note{font-size:8px;color:#aaa;margin-top:10px;font-style:italic;border-top:1px solid #eee;padding-top:6px;}
  .print-btn{position:fixed;top:10px;right:10px;background:#6a1b9a;color:white;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;z-index:999;}
  @media print{.print-btn{display:none;}}
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>

<div class="header">
  <div class="header-logo"><img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADgAOADASIAAhEBAxEB/8QAHQABAAIDAQEBAQAAAAAAAAAAAAcIBAUGAwIJAf/EAE4QAAEDBAADBAYDCwgHCQAAAAECAwQABQYRBxIhEzFBUQgUImFxgTJCkRUWIzU3UmJ0obGyMzZyc3WCkrMYOENEU4PCFyQnZHajwdHh/8QAHAEBAAEFAQEAAAAAAAAAAAAAAAYBAgMEBQcI/8QAOREAAgEDAgMEBggGAwAAAAAAAAECAwQRITEFEkEGUXGBExQiYZHBFTJCUqHR4fAHI2JysfE0NbL/2gAMAwEAAhEDEQA/ALl0pSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKbFKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFQz6TsW7NW623aHcJrcILMaSw28pLfMdlCikHXgoEn9GpmrTZvYmslxS42V3lBkskNqPchwdUK+SgDQFN2JMlh3tWJLzTgO+ZDhSftFd7hPFzKbA821PkrvMAdFMyVbcSP0XPpb9ytj4VwD7Tsd9xh9tTbzSihxCu9KgdEH4GvigLoYnkNryeytXa0P9qw50UlQ0ttQ70qHgR/+jYINbaqr8DcsdxrM2IzzurdclpjyEk9EqJ0hfuIJ0fcT5CrUUApSlAKUpQCqvekJxeu7+QS8Vxic7Bgw1lmXJYVyuPujopIUOqUpPTpokg9dVaGvzyvTi3b1PdcUVLXKdUonxJWdmqonXYXhtC7uqlWtHm5EsJ7ZedfLB8x7hcI8sTI8+WzJB2Hm31JXvz5gd7qyvo2cV7lkE44lk8j1qaGy5Clq0FvBI2pC9d6gOoPeQDvqNmsNdvwGUpHGHGikkEyyNjyLagf2UPQO0fDLe84fV54rMYtp9U0s/DvLw0pSqHgpBPHrizPtVyexXFn/VpLIAmzUgFSCRvs299AdEbV4b0NHqICl3C4S5C5EufLkvLO1OPPKWo/MndZeYKfVl97VKKi+blJ7TffzdqrdaqvQrGzpW9FKK1xq+8gF5d1biq5SenRdx3XD3ijlGJT2uadIuVr5h20KQ4Vjl8ezUeqD5aPL5irb2S5w7zaIt1gO9rFlNJdaV5gjxHgfMeBqh1Wv9GR9x3hTGQtwrS1LfQjf1Rz719pNcfj9nTjTVaKw84fvOvwK7qOo6MnlYyvcSdSlKipKBSlKAUpSgFKUoBSlKArB6QuPCy56ucyjljXZHrKdDoHB0cH26V/fqOKtLx9x37u4DIkst80u2H1trQ6lAH4RP8Ah2deaRVWqAfaPhVv+FuRDKMHt90Wvmk8nYyvMOo6KPz6K+ChVQKmH0Ysi9Uv03G316anI7ePvwdQPaHzT1/uUBYWlKUApUY8QeJjWEcULTabuQLJcYILjvL1jO9ooBw+adaCvLQI7iDJjS0OtpcbWlaFAKSpJ2CD3EGhtV7OtQpwqTXszWU+/XD80fVfnjeEqReJyFjSkyXQR5HnNfocarL6THCtUB+Tm+PR1KiuqLlzjoG+yUe95IH1T3q8j17t6qiX9heJ0bS7nRqvHpMJP3rOnnkgGu14E/lgxn9c/wChVcVXa8CfywYz+uf9CqM9R4t/wK/9kv8Ayy8dKUqh86lfuP3Cq4ybtIy3Goy5frGlTobSduBYAHaIH1tgDYHXY2N7OoEfBYeUy+Cy6g6UhwcqknyIPUVfyseTBhSVc0mHHeOtbcbCunzFd6z47UoU1TnHmS21x+ZwrzgcK1Rzpy5c76Z/IoUCCNg7FWq9F0EcK29j/fn/AN4ro8m4Z4RkDK0y7BEYeUOkiIgMug+e06389j3V7cL8SVhWNrsfrnrjSZTjrTpTyqKFaICh3bHd06Hv6dwv4jxWleW3Ik1LK+fUs4fwuraXPO3lYfyOqpSlR4kApSlAKUpQClKUApUN8V+MLtmub9ixhth2SwSiTLdHMltfilCfEjxJ6A9NGo8g8Yc+jSkvOXZmWgHZaeiN8ivd7ASR8jQFpXEIcbU24kKQoFKkkdCD4VTniBYF4xmFxsxB7Jl0qYJ+s0r2kH7CAfeDVmOF2dwc3tLjzbXqs+MQmVGKubl33KSfFJ0feCCPeeC9KHHu0iW7KGEEqZPqkogfUJJbJ9wVzD++KAgas2w3ORZb1Cu0TfbQ30vJG9c2jspPuI2D7jWFSgLuWmdHulri3KIvnjymUvNq80qGx++sqol9GfIRPxWRYHl7ftjnM3s9Syskj7Fcw+BTUtUBVn0yf58WX+zD/mqrK9Grit9zXWMLyOVqE4oItslxXRhR7mVE/UJ+ifA9O4jWL6ZP8+bL/Zh/zVVBpAI0eoqp7PwrhdDifZ+jQrLdPD6p5eqP0Yr5dQh1tTbiErQoFKkqGwQe8EVBHo2cV/us0zhuSSd3FpPLb5Lh6yUAfyaj+eB3H6w946zzVDyjifDa/Dbl0Ky1Wz6NdGv37iofpC8LVYbcjfbKyo2CW51SBv1Nwn6B/QP1T4d3lvmOBP5YMZ/XP+hVXaukCHdLdIt1wjNyYkhstvNODaVpPeDVZYnDiZgPpAY0GkuPWSXOJgyD1I9hRLaz4KH7R18wHQn3Bu03rnDq1ncv+YoSw/vLlf4r8V5lnLgSmBIUCQQ0o9DrwNV/4V8d/V4Me25sl50IQlKLk0grWRr/AGqR1J/STsnxHean+5/i6T/Ur/caoPH/AJBv+iP3V3+DWdG6hUjUXd4rc8S4zeVbWpTlTff4PYvZYMisN/jpfst3hT0H/gPBRHuI7wfca2lUDBIIUkkEHYIOiK2UHIL9BdQ7Cvl0jKR9HspbiR9gOjWxPs2/sVPijBDtDp7cPgy9VKrjww453GLMZtuaOJlQlkITcEoCXWSem3AOik+ZABHf18LGNONutIdaWlbawFJUk7Cge4g+Irh3dlVtJ8tRefRnbtL2ldx5qb8V1R9UpStQ2xSlKAUpSgFY9yeXHt0l9Gudtla078wCayKw73+JZ36u5/CaApKVrdUXXFqW4s8ylKOyonqSaV8o+gn4V9UBI/o5SXmeJrLLalBuRFeQ6B3EABQ/akVYvLLMxkGNXCyyCAiWwpsK19BXelXyUAflUJ+i9YnXrzccjcQQxHa9VZJHRTiiFK1/RAT/AI6sBQFHpkZ+HMfhymy2+w4pp1B+qpJ0R9oryqUPSNxpVpzIXphrliXVPMogdEvpACh7tjSveebyqL6A6/g/kX3tZ9AluOckSQr1WV5ciyACfclXKr4A1beqMEAgg9xq3PCDI/vmwOBNdc55bKfVpWz17RGhs/0hyq/vUBA/pk/z5sv9mH/NVUG1Ofpkg/fxZDrobadH/mqqDKqj3nsp/wBPQ8H/AJZ9NOOMuoeZcW262oKQtCilSVA7BBHcQfGr4cLLxLv3Duw3eeoKlyYSFPKA1zL1oq+ZG/nVDavFwI/JDjP6in95oyPfxDhF2lKeNVLGfc0/yO2rykxo8kNiQy272bgcRzp3yrHcoeRHnXrSqHk6eDHuX4tk/wBSv9xqg8f+Qb/oj91X9fbDzDjSjoLSUn5iqGXCC/a7hItkpJS/EdUw4CNHmQeU9PiKlHZtr+YvD5kY7RReab6a/I8KUpUoI2KtH6Lt/kXXAnrXKcLjlpkdi0T/AMFQ5kD5HmSPckVVyrI+iTb32cZvFzcSUtS5aG2t/WDaOpHzWR8q43Hoxdo2901j9+B1+CSkrtJdzz+/EmylKVCCaClKUApSlAKw73+JZ36u5/CazK+H2kPsrZdTzNuJKVDetgjRoCjSPoJ+Fdbw9wO+ZlNQIbKmLeFaenOJ/BoA7wn89XuHz1VjLbwzwO3upcj41DUpPd25U8B8lkiutabbabS20hKEJGkpSNADyAoDX4xZLfjtjjWe2NdnGjo0N/SWfFSj4knZNbKlKA1GYY7bspsD9nuaCWXdFK0/TaWO5aT4Ef8A2D0NVYz7Br7hsxSLgwXYRVpmc0k9kseGz9VX6J+Wx1q31fLrbbrSmnUJcbWNKSobBHkRQFG6lr0Z8i9QymTj769MXJvna2e55AJ0Pinm/wAIqXrhwzwSe8XX8ahpWTs9gVMj7EECs2w4RiVifTItdhhMPp+i6Uc7ifgpWyPtoCNvSqwefkVhhX+0R1yZdq50vMtja1sq0SQPEpKd68iqqoggjYII91foxXG3/hbgF9nLnXLGIbkhxXM440VMlZ81chHMfjVSd9nO2EeG2/q1xByitmt1nXGHjr7yluK2C65Pfo1kssZUiZIV0H1UJ8VqPgkeJ/8AnQq+OJ2ZjHsZttjjKK2oMZDCVEaKuVIHMfee+vLGMXx7GIyo1gs8O3Nr6r7FsBS/6Su9XzJrcUOZ2l7SS4zOMYR5YR2XVvvfyQpSlUIuKgnj/wAKZd0uDuW4zHVIlOACdDR9JzQ0HEDxVoAFPedAjrvc7UrZtLqpa1FUp/7Na6tad1T9HP8A0UDUClakKSUrQopUlQ0Ukd4I8D7q/lXeyTC8VyNwO3qwwZjw/wBqpvTn+MaV+2tTB4UcPYb3bM4xFUre9POOOp/wrUR+ypLHtHR5fag8+X7/AAI5Ls/WzpNY8ysPDrBL5m9ySxbWFtQkq1InLR+CaHiAfrK/RHz0OtXCxiywMdsMOy2xrs4sVsIQD3qPeVHzJJJJ8yazY0diLHRHjMtsMtjSG20hKUjyAHQV6Vw+IcSqXsllYitkdvh/DYWabzmT6ilKVzToilKUApSlAKUpQClRl6QuWPWDFmrbb5K2Ljcl6SttWlttJ0VKB8NnSfmfKujwvMId54etZRKcSgMRlKnBI/k1tp/CdPlsDyIoDqqVXq2SuInFe4TZsG8LsVnjr5UhDy20I6bCNo0XFa0SSdDfhsCuw4bWbiBYMmWxecni3Cwpa5it6SXlOE70Ecx5kEd52eXR8T1AEq0qvV4n5tfOLd5x2zZW/b223VraDslSGkpSE9BoHzrpFQM4xjBMquF5y0XF4RGzEWxKWtTCgo8x9oDWwR9lATDSoI4D8SJ8i9rx7JLi7KMw7hyH17KXNdWyfJQ7veNfWFe2IZpc4XEzNV3i6TZNrtcea83GW5tKezkICQkdwOjyj40BONKr3Y2eJPFR6Vdmr8uzWxtwttobeW2gHv5UhGivXTalHvPTyG5h23ihi1iyYXa+CRbItrecjyC+XHC5yEpLajpaSNdebp5A72AJrpVc8GicSsus67pBzsxWkPqZKJMxxKiQAd9Enp7VTth8S5QcZgRLvOTPnNtaekpUVBw7J3sgE9NUBtqUpQClKUApSlAKUpQClKUApSlAKUpQCiiEgqUQAOpJ8KV4z2o78F9mWAqO42pLoJ0Ckjr1+FAVhyLLLHkPFl29ZA1KmWGOVMsMMICy42kEI6EgAKUSs/HVevCW5h1WQ4M1IWIt9ivNwVPeyQ+EEI5hvQKk9/XvSB1qYMbybhHYG3GLHkWMQkPqCnA1ObHOQNDZKq3t0smI3R9rKJ0WDJXGaDrc/n6IQglQUFA60Op3QzVLetSxzwaz3pohvg9l9msVgvOF5U47aluuujtVNk8pUgIWhWgdKGtgka6/bxN/xzGpeTW+wYJMn3ZclQbW8+2AnmJH0dJSdJGypRGtfA1YaRZOHHEULuSG7belNKDbkqHIIUFADSVLbUCSAR0Pur+8N4fDiO9KRhDlqkSGgBIXHkdu6gHegpRJUAdHpvXT3UKOhUjzZi9N9NvHuINyO347L4w3uHk1zet1tQ6sdu0jmVzBKQka5Vd/XwrrYkXB7ZwxzOFiN/k3RbsRDr4eaKSgBWhr2EjxPnUjZdjXDiIp6+ZPBtMbt3fwkqW5yBaz4bJA30/ZXtj2M4A9ZJEmxW+2PW24NcjzsZfO28hJ7tg9QCD9lC30c+Tnw8bZ6ZIVg4a5euC8PI7UhSbra5D61Fvot1oLJOiOvMk+0PmO8itbw6i3DLrrlzQUHbhcLPIe6AJ7R3t2V68htQ186nrGsi4d2vHn1WK+WRi0Q1pLy2ZaS0ypwnXMrfTmO9V6Y/b8Cs8J3LbK1aokR1hRXcGVgNFrmBUebfKE7SPsoXyt6sPrRa1xs9+7xI34GcQrDYscXjeQvm2vxn3FNrdbVyqBOylWh7KgdjR14Vvso4k4xk2NZTY7VIfceRaH3G3VtFKHgEHm5d9enTvA3vpvVbHJ4HCTIYAye7ybK5FW72JuLc3skLc19ErQoBStDx33VvsYxbC2MeW3YbbBXbLkxpbjau1EhpQ8XCSVJIPnQtnRqQWZRa6bde4rnhNl4eXC0LfyvJZlsnh5SUsstcyS3oaVvs1ddlXj4VZnBHLS5h9rTY5a5luZjpYjvqSUlaW/Y2QQOu0nwFcnCx3hBOucu2Q4tgkToYWZMdt8KcaCDpRUkK2NHofKsCRxRwXGXbPj+Mv2eXAeWoLdZubTbEJJVsqWSSevMo6Hl7xQ2KNhc1pckKbb3292ev4d/QlWlaB7NcRZtLF3dyW0ot8hwtMylSkBpxY3tIVvRI0enur4tmd4Xc5rcG35XZZUp06bZamtqWs+QAOzQx+qV8OXI8LfRnRUrU3TJsetd1j2q5Xu3w58nl7CM9IShx3mVyp5Uk7O1Age+vvIsgsmOwhNvl0iW6OTypW+4E8x8kjvJ9woWKhVbilF+1tpv4d5s6Vy+NcQsKySb6lZcjgy5R+izzlC1fBKgCflW3v19s1giol3u6Q7bHW4G0OyXktpUsgnlBJ79AnXuoXTta9Op6OcGpdzTz8DY0rXTr9ZYNjTfJl1hsWtSELTLceSlopXrkIUemjsa891hS8zxOJbIlzlZHamYMwqEaQuUgNulJ0rlVvR0aFsberP6sW9cbPfu8TfUrmI/EPBJMhqNHzCxuvOrDbbaJzZUtROgAN9SSa6egq0KlF4qRa8VgUpShiFKUoBWLd/xVL/AKhf8JrKrGuwJtcoJBUSysAAbJ9k0Lo/WRVL0ceG+NZ9Zb2q/Jl9pFW02y4w+UFAUlRJ11BPQd4NZWDyrngucZhwzcmuS7a5b5nZBR6JWmOXUOAdySUdFAd515VrOEt64k4Bb58O0YDcZblwU2rmkW+R7BSkgeykDff51InCPhfkUy7XrM88KmLpdI77LLKiCtHbJ5VOKA6J0k8qU+AJ3rpVT1Ti9y6VS6ndVVKjJLkjzJvm0w0ltjXJkehoNYJeR5XU/wCS3Wk9Dv8AH+Y/CP8AxvVzeDZJnfBwXbGX8NenLkP87LmnOTtAkJ50lKSHEkBPQaPTv8pF9FTDL5j9ru18vsZ2G7dVNJZjvJ5XORHOStST1Tsr6A9em9dRQ0ONQVKjf15SXLWdPkw0+bDy9F3Gb6XP5KEf2mx+5dRp6PWZTMRu/wB6F/5mbbe2ESYC3DpLbjqAUEH81Y6e5QHmalX0prdcLpwxRGtkGVNf+6LKuyjsqcXoBezpIJ1XL5jw0kZNwIxqQxAdayKz2topaWgpccQEgrZIPXm6bSD4jXTmNEavCbm1+h4Wly1y1JyWesXhcsvjv7iI8LH/AIE55sf71a/801Nlm/1QV/2K/wDxrrgeFuBZHeOFWdWNy1zYE6SqG7ERMYUz2ym1KXyjnA79a34EjdYUbM85i8M3OFv3kT1SShcVMjsHe0CFLJKezCOp6kBW9a66NDucSgr+tKFCSbhWjJ6pezyRWdd9uh5yP9U6N/6jP7lVuOEPFpONcJL7apbyVXC2oKrQlZ32nanQTrxCFnmP6J14VsMswXIbJ6NVtsS7dJl3Vd1TLfixmy6prmCzy+zvehy7PdvffWkuPCOdcrzgKmYUiNHvNujougU0pCozjLae1KgdcpUgdN69oHxNEUVfhl5QqU7mScHVnJP+3D+Eo5X+DH9Fxa3cxyJx1anHFWGQpS1HZUS43sk+dcpwyk8MY8CV9/0G6ypClp9V9TUoBKOXrvS09d1KvCTHrrbOMWfOLsk+JAXHuLcRa4q0NLT6ynkShRGjtI6a7xXE8MJeS4ZBlsSeEsq/KkrQsLl29wKaAGtDbaunjQ2pXUa1W6lSeslSaUZqD2e0npp1N5xrbxxPAzEncRjy49ofuTzjDclRLgJDnNvZP1gfGuU4hjhMjDravDnJv3whbfrX8vyAch5ye0Gt82tcn7q7fi65keZcIrE9GwebaZDF3dT9zosNw9m2G1aXy8gIBKu/Wt1hZDg994eZnjmXYzj0m6wnWmnXoaYqniy7yJ7RBGiU76qSr6qvh1ojX4Zc06VGnGpUaqKVVqPOsSaeeWctU89Hs9T54ifdRfEXhT92ef7pmBa/We0+mXPWOvN+lvv9+6yLZaF8Y+O98Rf5kgWi0rcS2w2vlPZIc5EoT+bzEFSiOvf7tbbjDEuuRcX8Cvtrsl2dgluE46ownB2H/eiSlzp7BSO8HurF4g4plvDviJcsuxm0uXmx3cueuRm0KXpLh242sJ9pI5vaSsd3T51NW3uYyoU4U5qFaVOSjqlh8+qXc2ttjL47cH8bxvDl5TiaJNsk21xtbiBJWsLBWEhQKiVJWkkEEHwPTeiNbxbyKVlPo24neZxKpa7mGn16+mttD6Cr58u/nUbzpGeXGFdYkGDlKrLLdSpyI+HpSUcquZCStSd9D49Cem96qbsvwU3v0crNaMUbkyH7YUSwy4ypp15zSw8ORQ2FbcWoD3ADexQyVE7D1RXtbnkqmkn9mLjqpPL6+96LfBk8Vf8AVPgf2da/4majDiNv/R34ea7+3la/xrr1vOYZ1k3Dy38Mm8InpfYSxHW+GXOdxLOuUFJSAjqlO1FWuh7t10PGbCb9beEGD45Ft0y4zYSnTJENhbwbWpPMrqkHoFKIB8dUKcPprh86FGvJKTrSmtU/Z5Gs6ba95i4E7wKnZLY4VvtF/F4XJZ7Fa3V9mHgQQT+EPTmHlVoqrpi+c3xq52uN/wBh6YhS80164IS0qb6hJc32I1rv7x8asXVCJdplV9NBz5sYeOaoqnXo1t4ClKUIyKUpQCvOU72EZ17lKuzQVaHjobr0rGun4slf1K/3Gqoo9iE2/SJiuICkYhMV56lDp8fZrfzuMrETh/ByxzHJHLLnLhiKZICklKVK5irl8eXu1UR8GLrxGt0C5pwezRLk2txsyS8gHlUAeUDbie/r591dXx5k5JN4RY3IyqE1Du6rosyGWwAlOkOhOtKV9Xl8T31Ja1hbRuI0lFYbx9bL2zt0I1Sv7l0JVHJ5x91Y3S36kuYpnFuyTA3cqhMqAYadU/FUsc7bjaSSgn3jRB8iDXhwnzxnP7NLuTNsct4jSewKFuhzm9hKt7AH51QFBfuXC+4vRJhdeseSWbmCgeiudrooD85C1cp/RVvxFSH6IgKcLu6T3i5a/wDZbrVuuH06NCpVjqsrlfue68jatuIVatenSlo9eZe9bPzJMz/LLZhmOO3q5hxxIUG2mWwOd1w9yRvp4Ek+ABqNcV48In32FAvmMP2mLPWEMSg8Vp2o6BIKE7TvoVAnX7a63jnhz+Z4eiFDlsx5kWSJLAeVyodUEqSUE+GwonfmB8aiSJlN7sV1suOcU8Mts+AyEsxXpMRtbrDfRPMhY5kLAATsDroDrvvtsbahVoN45p66Zw0vctmVvrm4pV0k+WOnTKfi+hYHMr7GxnF7hfZY5mobJXycwHOruSgE+KlED5184TkEXKcWgX6GAluW0FKRvfZrHRaD8FAj5VEPpGXaVkGUWThxaCFuvvIdk68FqOkA+5KeZZ9xB8K8vR3u0rGszvfDi7r0pDy3IpJ6FxHRYG/BSOVY9ySfGsS4evU/S/b3x/Tt+vgZXxBq89F9jbP9W/6HVzeM1pt/ER3E7hbHY7bUoRlzi8ChJIBCinXQbIBO+nf4VtuLHEaPgH3M7a1O3Az+15ezdCOTk5PMHe+f9lQPl+MSst43ZbaILoTKAekMIUOji0IR7BPhsEjfnqtJluYSsjxTHbRcw4bjZFvx3FrB242Q2EFW/rjkUk769AfE10ocJoTlScdVhOS8VlP4nOlxavGNSMnh5fK/B4a+BOmb8a4+MZNNsruNS5AiqQO37cISvmQlfQcp/O13+FMU41MX5y5JGMy4yYNsfuBWqQCHA0AeQez3nff7q9vSZ/JG4P8Azcb+KvWxAf6M7iddPvckjX/KXWjGnbO1jP0erfLu/dr+hvSq3KuZQ59EubZfD9SP5/HO4TskgXCLEuUO1R06kQGS2r1heyerhQSB9HoAD39evSc8DyFOVYpCvyYTkISuf8AtXMU8q1I79Dv5d/Oq48HbvxRt2OS2cGsMS429c5SnnHkAlL3ZtgpG3U9OXkPd49/lZfFX7rJxu3SL7GRGujkdCpbKB7KHNe0B1PTfvNV4tQo0cQpxSw+jy/NfMt4TXq1synJvPesLyfyNnSlK4p2xSlKAUpSgFKUoBSlKAUpSgFeUxsvRHmUkArQpIJ7uo1XrSgK/2LgvxAsTa0WjO2YCXeUvCOp1AWR4nWvM1u8h4V5dfsDjWG65U1Nns3NUv1p9Tix2Ra5Agb69Ds+VTLSujLilxKSm2srXOF+Rzo8Lt4xcFnD6Zf5nCZvw9ZynhzCxuS+03PgsNCNKCNpQ6hASenfyqGwR7we8Cvjgpg0/A7HPt8+dGmLky+3StlKkgDkSnR34+zXfUrX9bq+idHPst5Nj1Sl6VVse0lg5HizhLGd4oq0rkeqyWnQ/FeKeZKXACNKHikhRB+O/CoysPBrMJ15ta82yGLMtdqCUx47TzjqlISQQ2CpKeVJ0AT1OhryInulX0b+tRpunB6eGqzvgx1rCjWqekktf892SEG+Bb97yO6XnM7+t5yY4XkC2+wUqJPQlxKvZSOUAAeHupJ4EuWe92y7YZkLrD8N0PE3EBe1JIKQOzSn2SNggjuNTfSsn0rdfe02xhYx4GP6Ktfu675y8/EjTHuHNxt3GG4Zw9cIqo0sOajpSrnTzJSB1I19WtFxP4Ju5Jlrl9slyiQEyQFSmXm1EKd8Vp13bGtjz2fGpopVkOIXEJqcZapY8jJPh9CcHBrRvPmcfxZxGVmWFLsMOWzFeU804HXUkp9g77h1r7tuKSovChWHLlMqkm1uwu3CTycy0KTza79e1XW0rCrioqap50Tz5mZ21NzdTGrWPIgSycHeIFjirjWjO24DK19otEdbraVL0BzEDx0APlUu4Ba7xZcVi26/XVV1uDanC7KUtSisKcUpI2rr0SQPlW+pWS4vqtwsVMfBIx29lSt3mGfixSlK1DbFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKA//Z" alt="ANS" style="height:60px;width:auto;"></div>
  <div class="header-title">
    <h1>Compte-Rendu d'Activité</h1>
    <h2>${cra.expert_nom || ''} — ${moisCap}</h2>
  </div>
  <div class="header-meta">Produit le ${now}</div>
</div>

<table class="info-table">
  <tr>
    <td>Expert</td><td>${cra.expert_nom || ''}</td>
    <td style="font-weight:bold;width:80px;">Période</td><td>${moisCap}</td>
  </tr>
  <tr>
    <td>Établissement</td><td>${cra.es_rattachement || '—'}</td>
    <td style="font-weight:bold;">SAMU</td><td>${cra.expert_samu || '—'}</td>
  </tr>
  <tr>
    <td style="font-weight:bold;">Statut</td>
    <td colspan="3" style="color:#6a1b9a;font-weight:bold;">${{ a_completer: 'À compléter', soumis: 'Soumis', vise_n1: 'Visé N1', vise_n2: 'Visé N2', diffuse: 'Diffusé' }[cra.statut] || cra.statut}</td>
  </tr>
</table>

<div class="section-title">📋 Activités Astreinte / HNO</div>
<table class="activites">
  <thead><tr>
    <th>Type</th><th>Date début</th><th>Date fin</th><th>Heures</th><th>SAMU</th><th>Objet</th>
  </tr></thead>
  <tbody>${lignesHtml}</tbody>
</table>

${cra.commentaire_expert ? `<div class="commentaire"><strong style="color:#6a1b9a;">Commentaire :</strong> ${cra.commentaire_expert}</div>` : ''}

<div style="border-top:2px solid #6a1b9a;padding-top:12px;">
  <div class="section-title">✍️ Signatures Électroniques</div>
  <div class="sigs">
    ${sigBlock(1, 'Expert')}
    ${sigBlock(2, 'Visa N+1')}
    ${sigBlock(3, 'Visa N+2')}
  </div>
  <div class="footer-note">Document généré électroniquement via la Plateforme de Planification ANS. Signatures horodatées et enregistrées en base de données avec adresse IP et navigateur du signataire.</div>
</div>
</body></html>`;

        const win = window.open('', '_blank');
        if (!win) {
            alert('Veuillez autoriser les popups pour télécharger le PDF');
            return;
        }
        win.document.write(html);
        win.document.close();
    } catch (e) {
        alert('Erreur : ' + e.message);
    }
}

async function loadCraPendingBadge() {
    const isAdmin = currentUser && (currentUser.is_admin || currentUser.activeProfile === 'admin');
    const isExpert = currentUser && (currentUser.astreinte_volontaire || currentUser.activeProfile === 'expert');
    if (!currentUser || (!isAdmin && !isExpert)) return;
    try {
        const res = await fetch(`${API_URL}/cra/my-list`, { credentials: 'include' });
        const data = await res.json();
        const badge = document.getElementById('craPendingBadge');
        if (!badge) return;
        // CRA "en cours de traitement" : non archivés et statut != diffuse
        const enCours = data.filter(c => !c.archived && c.statut !== 'diffuse').length;
        if (enCours > 0) {
            badge.textContent = enCours;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) {
        console.warn('Erreur badge CRA:', e);
    }
}

async function loadCraList() {
    const isAdmin = currentUser && currentUser.activeProfile === 'admin';
    // Mettre à jour le titre h2
    const h2 = document.querySelector('#cra h2');
    if (h2) h2.textContent = isAdmin ? "COMPTE-RENDU D'ACTIVITE" : 'CRA';

    const st = {
        a_completer: { label: 'À compléter', color: '#ff9800', icon: '✏️' },
        soumis: { label: 'Soumis — en attente visa N1', color: '#2196f3', icon: '📤' },
        vise_n1: { label: 'Visé N1 — en attente visa N2', color: '#9c27b0', icon: '✅' },
        vise_n2: { label: 'Visé N2 — prêt à diffuser', color: '#4caf50', icon: '✅' },
        diffuse: { label: 'Diffusé auprès de la RH', color: '#607d8b', icon: '📨' }
    };

    const makeCraCard = (cra, borderColor, extraButtons = '') => {
        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        let s = st[cra.statut] || { label: cra.statut, color: '#999', icon: '❓' };
        // Badge "Modifier" si déjà soumis une fois (refuse_at positionné lors du rappel ou du refus)
        if (cra.statut === 'a_completer' && cra.refuse_at) {
            s = { label: 'Modifier', color: '#ff9800', icon: '✏️' };
        }
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;background:white;border:1px solid ${borderColor};border-radius:8px;margin-bottom:10px;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow='none'">
                    <div style="flex:1;cursor:pointer;" onclick="openCraDetail(${cra.id})">
                        <strong style="font-size:14px;color:#2c3e50;">Compte-rendu d'activité de ${moisNom}${isAdmin && cra.expert_nom ? ` — ${cra.expert_nom}` : ''}</strong>
                        <div style="font-size:12px;color:#666;margin-top:3px;">${cra.vise_n1_nom ? `Viseur N1 : ${cra.vise_n1_nom}` : ''}${cra.vise_n2_nom ? ` | Viseur N2 : ${cra.vise_n2_nom}` : ''}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="padding:5px 12px;border-radius:12px;font-size:12px;font-weight:bold;background:${s.color}22;color:${s.color};white-space:nowrap;">${s.icon} ${s.label}</span>
                        ${extraButtons}
                    </div>
                </div>`;
    };

    const archiveBtn = craId =>
        isAdmin
            ? `<button onclick="event.stopPropagation();archiveCraExpert(${craId})" title="Archiver ce CRA" style="background:#546e7a;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🗄️ Archiver</button>`
            : '';

    const unarchiveBtn = craId =>
        isAdmin
            ? `<button onclick="event.stopPropagation();unarchiveCra(${craId})" title="Désarchiver ce CRA" style="background:#ff9800;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">↩️ Désarchiver</button>`
            : '';

    // Masquer toutes les sections
    ['craAdminSections', 'craExpertSections', 'craRhSections', 'craList'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const isRh = currentUser && currentUser.is_rh && !isAdmin;
    const isExpert = !isAdmin && !isRh;

    try {
        const res = await fetch(`${API_URL}/cra/my-list`, { credentials: 'include' });
        const data = await res.json();

        if (isAdmin) {
            // === ADMIN : 3 catégories ===
            document.getElementById('craAdminSections').style.display = 'block';
            await initCraLancer();

            // Un CRA doublement visé (en attente de diffusion) ne figure que dans le bloc « CRA en attente de diffusion » en bas de page
            const enCours = data.filter(c => !c.archived && c.statut !== 'diffuse' && c.statut !== 'vise_n2');

            document.getElementById('craAdminEnCours').innerHTML = enCours.length
                ? enCours.map(c => makeCraCard(c, '#ffb74d', archiveBtn(c.id))).join('')
                : `<p style="color:#999;text-align:center;padding:15px;">Aucun CRA en cours de traitement.</p>`;

            // Section "CRA signés" : tableau avec filtres, chargé via loadCraSignatures()
            await populateCraSignFilterExperts();
            populateCraYearFilter('craSignFilterAnnee');
            await loadCraSignatures();

            // Archives : recharger si panneau déjà ouvert
            const archBody = document.getElementById('craAdminArchivesBody');
            if (archBody && archBody.style.display !== 'none') {
                loadCraArchives();
            }
        } else if (isRh) {
            // === RH : CRA signés + archivés, lecture seule ===
            document.getElementById('craRhSections').style.display = 'block';
            await populateCraSignFilterExperts('craRhFilterExpert');
            await populateCraSignFilterExperts('craRhArchiveFilterExpert');
            populateCraYearFilter('craRhFilterAnnee');
            populateCraYearFilter('craRhArchiveFilterAnnee');
            await loadCraSignaturesRh();
        } else {
            // === EXPERT : 2 catégories ===
            document.getElementById('craExpertSections').style.display = 'block';

            const enCours = data.filter(c => !c.archived && c.statut !== 'diffuse');
            const signes = data.filter(c => !c.archived && c.statut === 'diffuse');

            document.getElementById('craListEnCours').innerHTML = enCours.length
                ? enCours.map(c => makeCraCard(c, '#ffb74d')).join('')
                : `<p style="color:#999;text-align:center;padding:15px;">Aucun CRA en cours.</p>`;

            document.getElementById('craListSignes').innerHTML = signes.length
                ? signes.map(c => makeCraCard(c, '#a5d6a7')).join('')
                : `<p style="color:#999;text-align:center;padding:15px;">Aucun CRA signé.</p>`;
        }
    } catch (e) {
        console.error('Erreur chargement CRA:', e);
    }
}

// Vue RH : « CRA signés » repliable (replié par défaut ; le tableau est déjà chargé)
function toggleRhSignesPanel() {
    const body = document.getElementById('craRhSignesBody'),
        icon = document.getElementById('craRhSignesIcon');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    icon.textContent = open ? '▼' : '▶';
}

function toggleCraAdminSection(which) {
    const ids = {
        enCours: ['craAdminEnCoursBody', 'craAdminEnCoursIcon'],
        signes: ['craAdminSignesBody', 'craAdminSignesIcon']
    };
    const [bodyId, iconId] = ids[which];
    const body = document.getElementById(bodyId);
    const icon = document.getElementById(iconId);
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    icon.textContent = open ? '▼' : '▶';
}

function toggleCraExpertSection(which) {
    const ids = {
        enCours: ['craExpertEnCoursBody', 'craExpertEnCoursIcon'],
        signes: ['craExpertSignesBody', 'craExpertSignesIcon']
    };
    const [bodyId, iconId] = ids[which];
    const body = document.getElementById(bodyId);
    const icon = document.getElementById(iconId);
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    icon.textContent = open ? '▼' : '▶';
}

function toggleCraAdminArchivesPanel() {
    const body = document.getElementById('craAdminArchivesBody');
    const icon = document.getElementById('craAdminArchivesIcon');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    icon.textContent = open ? '▼' : '▶';
    if (open) {
        populateCraSignFilterExperts('craArchiveFilterExpert');
        populateCraYearFilter('craArchiveFilterAnnee');
        loadCraArchives();
    }
}

function toggleCraDeletedPanel() {
    const body = document.getElementById('craDeletedBody');
    const icon = document.getElementById('craDeletedIcon');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    icon.textContent = open ? '▼' : '▶';
    if (open) loadCraDeleted();
    else {
        const pb = document.getElementById('purgeToutBtn');
        if (pb) pb.style.display = 'none';
    }
}

async function loadCraDeleted() {
    const container = document.getElementById('craDeletedTable');
    container.innerHTML = '<p style="color:#999;text-align:center;padding:15px;">⏳ Chargement...</p>';
    try {
        const res = await fetch(`${API_URL}/cra/admin/deleted`, { credentials: 'include' });
        const data = await res.json();
        const purgeBtn = document.getElementById('purgeToutBtn');
        if (!data.length) {
            container.innerHTML = '<p style="color:#999;text-align:center;padding:15px;">Aucun CRA supprimé.</p>';
            if (purgeBtn) purgeBtn.style.display = 'none';
            return;
        }
        if (purgeBtn) purgeBtn.style.display = 'inline-block';
        const stL = {
            a_completer: '✏️ À compléter',
            soumis: '📤 Soumis',
            vise_n1: '✅ Visé N1',
            vise_n2: '✅ Visé N2',
            diffuse: '📨 Diffusé'
        };
        const fmt = dt => (dt ? new Date(dt).toLocaleDateString('fr-FR') : '—');
        container.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr style="background:#880e4f;color:white;">
                        <th style="padding:8px;text-align:left;">Expert</th>
                        <th style="padding:8px;text-align:left;">Période</th>
                        <th style="padding:8px;text-align:left;">Statut avant suppression</th>
                        <th style="padding:8px;text-align:left;">Était archivé</th>
                        <th style="padding:8px;text-align:left;">Actions</th>
                    </tr></thead>
                    <tbody>${data
                        .map((c, i) => {
                            const moisNom = new Date(c.annee, c.mois - 1, 1).toLocaleDateString('fr-FR', {
                                month: 'long',
                                year: 'numeric'
                            });
                            const statutLabel = stL[c.pre_delete_statut] || c.pre_delete_statut || '—';
                            const wasArchived = c.pre_delete_archived ? 'Oui' : 'Non';
                            const restoreLabel = c.pre_delete_archived
                                ? '↩️ Vers Archives'
                                : c.pre_delete_statut === 'diffuse'
                                  ? '↩️ Vers Signés'
                                  : '↩️ Vers En cours';
                            return `<tr style="background:${i % 2 ? '#fce4ec' : 'white'};border-bottom:1px solid #f48fb1;">
                            <td style="padding:6px 8px;">${c.expert_nom || '—'}</td>
                            <td style="padding:6px 8px;">${moisNom}</td>
                            <td style="padding:6px 8px;">${statutLabel}</td>
                            <td style="padding:6px 8px;">${wasArchived}</td>
                            <td style="padding:6px 8px;white-space:nowrap;">
                                <button onclick="restoreDeletedCra(${c.id})" style="font-size:11px;padding:3px 8px;background:#388e3c;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:4px;">${restoreLabel}</button>
                                <button onclick="purgeCra(${c.id})" style="font-size:11px;padding:3px 8px;background:#b71c1c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Purger</button>
                            </td>
                        </tr>`;
                        })
                        .join('')}</tbody>
                </table>`;
        makeColResizable(container.querySelector('table'));
    } catch (e) {
        console.error('Erreur chargement CRA supprimés:', e);
    }
}

async function softDeleteCra(craId, mois, annee, btn) {
    // Le nom expert peut être passé via data-nom sur le bouton
    const expertNom = (btn || event?.target)?.dataset?.nom || '';
    const moisNom = new Date(annee, mois - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (
        !confirm(
            `Supprimer le CRA de ${expertNom} — ${moisNom} ?\n\nIl sera déplacé dans "CRA supprimés" et pourra être restauré ou purgé définitivement.`
        )
    )
        return;
    const res = await fetch(`${API_URL}/cra/${craId}/soft-delete`, { method: 'POST', credentials: 'include' });
    if (res.ok) {
        await loadCraArchives();
        const deletedBody = document.getElementById('craDeletedBody');
        if (deletedBody.style.display !== 'none') await loadCraDeleted();
    } else {
        const d = await res.json();
        alert('Erreur : ' + d.error);
    }
}

async function restoreDeletedCra(craId) {
    if (!confirm("Restaurer ce CRA dans sa section d'origine ?")) return;
    const res = await fetch(`${API_URL}/cra/${craId}/restore-deleted`, { method: 'POST', credentials: 'include' });
    if (res.ok) {
        await loadCraDeleted();
        await loadCraList();
    } else {
        const d = await res.json();
        alert('Erreur : ' + d.error);
    }
}

async function purgeCra(craId) {
    if (!confirm('⚠️ Purger définitivement ce CRA ?\n\nCette action est irréversible.')) return;
    const res = await fetch(`${API_URL}/cra/${craId}/purge`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
        await loadCraDeleted();
    } else {
        const d = await res.json();
        alert('Erreur : ' + d.error);
    }
}

async function purgeTousCraDeleted() {
    if (!confirm('⚠️ Purger TOUS les CRA supprimés ?\n\nCette action est irréversible.')) return;
    const res = await fetch(`${API_URL}/cra/admin/deleted`, { credentials: 'include' });
    const data = await res.json();
    for (const c of data) {
        await fetch(`${API_URL}/cra/${c.id}/purge`, { method: 'DELETE', credentials: 'include' });
    }
    await loadCraDeleted();
}

async function recallCra(craId) {
    if (
        !confirm(
            'Retirer votre soumission pour corriger ce CRA ?\n\nIl repassera en statut "À compléter" et vous pourrez le modifier avant de le soumettre à nouveau.'
        )
    )
        return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/recall`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            await loadCraList();
            // Rouvrir automatiquement le modal de saisie
            const cra = window._currentCraId === craId ? null : null; // forcer rechargement
            openCraDetail(craId);
        } else {
            alert(data.error || 'Erreur lors du rappel du CRA');
        }
    } catch (e) {
        alert('Erreur lors du rappel du CRA');
    }
}

async function adminCorrigerCra(craId) {
    if (
        !confirm(
            'Corriger ce CRA en tant qu\'administrateur ?\n\nToutes les validations obtenues seront réinitialisées (visas et signatures supprimés) et le CRA repassera au statut "À compléter".\n\nCette action est irréversible.'
        )
    )
        return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/admin-correction`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            await loadCraList();
            openCraDetail(craId);
        } else {
            alert(data.error || 'Erreur lors de la correction admin du CRA');
        }
    } catch (e) {
        alert('Erreur lors de la correction admin du CRA');
    }
}

async function archiveCraExpert(craId) {
    if (!confirm('Archiver ce CRA ?')) return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/archive`, { method: 'POST', credentials: 'include' });
        if ((await res.json()).success) await loadCraList();
    } catch (e) {
        alert('Erreur archivage CRA');
    }
}

async function unarchiveCra(craId) {
    if (!confirm("Désarchiver ce CRA ? Il retournera dans sa catégorie d'origine.")) return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/unarchive`, { method: 'POST', credentials: 'include' });
        if ((await res.json()).success) {
            await loadCraList();
            await loadCraArchives();
        }
    } catch (e) {
        alert('Erreur désarchivage CRA');
    }
}

async function openCraDetail(craId) {
    try {
        // Charger config CRA si pas encore disponible
        if (!window._craConfig || !window._craConfig.admin_n1_id) {
            try {
                const cfgRes = await fetch(`${API_URL}/settings`, { credentials: 'include' });
                const cfgData = await cfgRes.json();
                if (cfgData.automation_4_config) {
                    window._craConfig = JSON.parse(cfgData.automation_4_config);
                }
            } catch (e) {
                window._craConfig = {};
            }
        }

        const res = await fetch(`${API_URL}/cra/${craId}`, { credentials: 'include' });
        const cra = await res.json();
        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        document.getElementById('craDetailTitle').textContent =
            `CRA — ${moisNom.charAt(0).toUpperCase() + moisNom.slice(1)}`;
        document.getElementById('craCommentaire').value = cra.commentaire_expert || '';
        // L'expert peut toujours modifier son commentaire si statut a_completer
        document.getElementById('craCommentaire').disabled = cra.statut !== 'a_completer';

        // CRA modifié par un administrateur : l'expert doit le vérifier et le soumettre à nouveau
        const adminModPanel = document.getElementById('craAdminModPanel');
        if (cra.modifie_admin_at && cra.statut === 'a_completer') {
            const dt = new Date(cra.modifie_admin_at).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
            const who = cra.modifie_admin_nom || 'Un administrateur';
            document.getElementById('craAdminModText').textContent =
                typeof currentUser !== 'undefined' && currentUser && currentUser.id === cra.user_id
                    ? `${who} a modifié ce CRA le ${dt}. Vérifiez-le, corrigez si besoin, puis soumettez-le à nouveau : les validations précédentes ont été remises à zéro.`
                    : `Modifié par ${who} le ${dt}. L'expert doit le vérifier et le soumettre à nouveau avant toute validation.`;
            adminModPanel.style.display = 'block';
        } else {
            adminModPanel.style.display = 'none';
        }

        // Afficher le motif de refus précédent si présent
        const refusPanel = document.getElementById('craRefusPanel');
        if (cra.commentaire_refus && cra.statut === 'a_completer') {
            document.getElementById('craRefusCommentaire').textContent = cra.commentaire_refus;
            refusPanel.style.display = 'block';
        } else {
            refusPanel.style.display = 'none';
        }

        // Masquer la zone refus viseur par défaut
        document.getElementById('craRefusViseurPanel').style.display = 'none';
        const refusViseurInput = document.getElementById('craCommentaireRefus');
        if (refusViseurInput) refusViseurInput.value = '';
        window._currentCraId = cra.id;
        renderCraTimeline(cra);
        renderCraData(cra);
        renderCraActionButtons(cra);

        // Bouton PDF : fichier sauvegardé si disponible, sinon régénère (admin/RH) ou message (expert)
        const pdfBtn = document.getElementById('craPdfBtn');
        if (pdfBtn) {
            pdfBtn.style.display = 'inline-flex';
            if (cra.statut === 'diffuse' || cra.statut === 'vise_n2') {
                pdfBtn.onclick = () => openPdfWithFallback(cra.id, cra.pdf_filename || null);
            } else {
                pdfBtn.onclick = () => downloadCraPdf(cra.id);
            }
        }
        document.getElementById('craDetailPanel').style.display = 'block';
        document.getElementById('craDetailPanel').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        console.error('Erreur ouverture CRA:', e);
    }
}

function renderCraTimeline(cra) {
    const config = window._craConfig || {};
    const steps = [
        { label: 'Créé', done: true, at: cra.created_at },
        { label: "Soumis par l'expert", done: !!cra.submitted_at, at: cra.submitted_at },
        { label: `Visé par ${config.admin_n1_nom || 'Viseur N1'}`, done: !!cra.vise_n1_at, at: cra.vise_n1_at },
        { label: `Visé par ${config.admin_n2_nom || 'Viseur N2'}`, done: !!cra.vise_n2_at, at: cra.vise_n2_at },
        { label: 'Diffusé à la RH', done: !!cra.diffuse_at, at: cra.diffuse_at }
    ];
    const currentStep = steps.findIndex(s => !s.done);

    const timelineHtml = `
                <div style="display:flex;gap:0;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px;">
                    ${steps
                        .map((step, i) => {
                            const isCurrent = i === currentStep;
                            const bg = step.done ? '#6a1b9a' : isCurrent ? '#ff9800' : '#e0e0e0';
                            const txtColor = step.done ? '#6a1b9a' : isCurrent ? '#e65100' : '#999';
                            const fw = step.done || isCurrent ? 'bold' : 'normal';
                            return `
                        <div style="display:flex;align-items:flex-start;">
                            <div style="text-align:center;min-width:110px;">
                                <div style="width:32px;height:32px;border-radius:50%;background:${bg};color:white;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;font-size:14px;">${step.done ? '✓' : i + 1}</div>
                                <div style="font-size:10px;color:${txtColor};font-weight:${fw};line-height:1.3;">${step.label}${isCurrent ? ' ⏳' : ''}</div>
                                ${step.at ? `<div style="font-size:9px;color:#888;margin-top:2px;">${new Date(step.at).toLocaleDateString('fr-FR')}</div>` : ''}
                            </div>
                            ${i < steps.length - 1 ? `<div style="flex:1;height:2px;min-width:16px;background:${step.done ? '#6a1b9a' : '#e0e0e0'};margin:14px 3px 0;"></div>` : ''}
                        </div>`;
                        })
                        .join('')}
                </div>`;

    // Liste des viseurs horodatée
    const sigItems = [];
    if (cra.submitted_at)
        sigItems.push({ label: 'Expert', nom: cra.expert_nom || '—', at: cra.submitted_at, color: '#6a1b9a' });
    if (cra.vise_n1_at)
        sigItems.push({ label: 'Viseur N1', nom: cra.vise_n1_nom || '—', at: cra.vise_n1_at, color: '#4caf50' });
    if (cra.vise_n2_at)
        sigItems.push({ label: 'Viseur N2', nom: cra.vise_n2_nom || '—', at: cra.vise_n2_at, color: '#2196f3' });

    const fmt = dt => {
        const d = new Date(dt);
        return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR');
    };
    const sigsHtml = sigItems.length
        ? `
                <div style="background:white;border:1px solid #e1bee7;border-radius:6px;padding:10px 14px;margin-top:6px;font-size:12px;">
                    <div style="font-weight:bold;color:#6a1b9a;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;">✍️ Historique des signatures</div>
                    ${sigItems
                        .map(
                            v => `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid #f3e5f5;">
                        <span style="font-weight:bold;color:${v.color};min-width:75px;font-size:11px;">${v.label}</span>
                        <span style="color:#2c3e50;flex:1;font-weight:bold;">${v.nom}</span>
                        <span style="color:#888;font-size:11px;">le ${fmt(v.at)}</span>
                    </div>`
                        )
                        .join('')}
                </div>`
        : '';

    document.getElementById('craStatusTimeline').innerHTML = timelineHtml + sigsHtml;
}

function renderCraData(cra) {
    const lignes = cra.astreintes_hno || [];
    const container = document.getElementById('craDataSection');
    if (!lignes.length) {
        container.innerHTML =
            '<p style="color:#999;font-size:12px;font-style:italic;">Aucune activité astreinte/HNO enregistrée pour ce mois.</p>';
        return;
    }
    container.innerHTML = `<h4 style="color:#6a1b9a;margin:0 0 10px 0;font-size:13px;">📋 Activités enregistrées</h4>
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr style="background:#6a1b9a;color:white;">
                        <th style="padding:8px;text-align:left;">Type</th><th style="padding:8px;text-align:left;">Date début</th>
                        <th style="padding:8px;text-align:left;">Date fin</th><th style="padding:8px;text-align:left;">Heures</th>
                        <th style="padding:8px;text-align:left;">SAMU</th><th style="padding:8px;text-align:left;">Objet</th>
                    </tr></thead>
                    <tbody>${lignes
                        .map(
                            (l, i) => `
                        <tr style="background:${i % 2 ? '#f9f4ff' : 'white'};border-bottom:1px solid #e1bee7;">
                            <td style="padding:6px 8px;"><span style="padding:2px 6px;border-radius:4px;background:${l.type === 'astreinte' ? '#ff980022' : l.type === 'activite_courante' ? '#2e7d3222' : '#2196f322'};color:${l.type === 'astreinte' ? '#e65100' : l.type === 'activite_courante' ? '#2e7d32' : '#1565c0'};font-weight:bold;font-size:11px;">${l.type === 'astreinte' ? '🔔 Astreinte' : l.type === 'activite_courante' ? '✅ Activité courante' : '🌙 HNO'}</span></td>
                            <td style="padding:6px 8px;">${formatDateFRClient(l.date_debut)}</td>
                            <td style="padding:6px 8px;">${formatDateFRClient(l.date_fin)}</td>
                            <td style="padding:6px 8px;">${l.heure_debut || ''} ${l.heure_fin ? '→ ' + l.heure_fin : ''}</td>
                            <td style="padding:6px 8px;">${l.samu || ''}</td>
                            <td style="padding:6px 8px;">${l.objet || ''}</td>
                        </tr>`
                        )
                        .join('')}
                    </tbody>
                </table>`;
}

function formatDateFRClient(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR');
}

function renderCraActionButtons(cra) {
    const container = document.getElementById('craActionButtons');
    const isAdmin = currentUser && (currentUser.is_admin || currentUser.activeProfile === 'admin');
    const isOwner = currentUser && String(cra.user_id) === String(currentUser.id);
    const config = window._craConfig || {};
    const isN1 = isAdmin && String(currentUser.id) === String(config.admin_n1_id);
    const isN2 = isAdmin && String(currentUser.id) === String(config.admin_n2_id);
    const isAnyAdmin = isAdmin && !config.admin_n1_id && !config.admin_n2_id;
    console.log('[CRA] renderCraActionButtons:', {
        userId: currentUser.id,
        activeProfile: currentUser.activeProfile,
        isAdmin,
        isN1,
        isN2,
        isAnyAdmin,
        admin_n1_id: config.admin_n1_id,
        admin_n2_id: config.admin_n2_id,
        statut: cra.statut
    });

    let buttons = '';
    if (cra.statut === 'a_completer' && (isOwner || isAdmin)) {
        const dejaEnvoye = !!cra.refuse_at;
        const lblCompleter =
            isAdmin && !isOwner
                ? '✏️ Modifier ce CRA (admin)'
                : dejaEnvoye
                  ? '✏️ Corriger/Compléter mon CRA'
                  : '✏️ Compléter mon CRA';
        buttons += `<button onclick="openCraSaisieModal(${cra.id}, ${cra.mois}, ${cra.annee})" style="background-color:#ff9800;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">${lblCompleter}</button>
                            ${
                                isAdmin && !isOwner
                                    ? `<button onclick="returnCraToExpert(${cra.id})" title="L'administrateur ne soumet pas à la place de l'expert : le CRA lui est renvoyé pour vérification et soumission" style="background-color:#1565c0;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">📨 Renvoyer à l'expert pour vérification</button>`
                                    : `<button onclick="submitCra(${cra.id})" style="background-color:#6a1b9a;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">📤 Valider et soumettre</button>`
                            }`;
    }
    // Bouton admin-correction : admin peut remettre à zéro si statut = soumis ou vise_n1
    if (isAdmin && cra.statut !== 'a_completer' && cra.statut !== 'vise_n2' && cra.statut !== 'diffuse') {
        buttons += `<button onclick="adminCorrigerCra(${cra.id})" style="background-color:#e65100;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">🔧 Corriger ce CRA (admin)</button>`;
    }
    if (cra.statut === 'soumis' && isOwner && !isAdmin)
        buttons += `<button onclick="recallCra(${cra.id})" style="background-color:#ff9800;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">✏️ Corriger/Compléter mon CRA</button>`;
    if (cra.statut === 'soumis' && (isN1 || isAnyAdmin)) {
        buttons += `<button onclick="visaCra(${cra.id},'n1')" style="background-color:#4caf50;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">✅ Viser (niveau 1)</button>`;
        buttons += `<button onclick="toggleRefusPanel('n1',${cra.id})" style="background-color:#f39c12;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">❌ Refuser</button>`;
    }
    if (cra.statut === 'vise_n1' && (isN2 || isAnyAdmin)) {
        buttons += `<button onclick="visaCra(${cra.id},'n2')" style="background-color:#2196f3;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">✅ Viser (niveau 2)</button>`;
        buttons += `<button onclick="toggleRefusPanel('n2',${cra.id})" style="background-color:#f39c12;color:white;padding:10px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;">❌ Refuser</button>`;
    }
    // La diffusion est automatique au visa N2 — pas de bouton manuel

    // Bouton "Rien à déclarer" : expert propriétaire, statut a_completer uniquement
    const rienBtn = document.getElementById('craRienADeclarerBtn');
    if (rienBtn) rienBtn.style.display = cra.statut === 'a_completer' && isOwner && !isAdmin ? 'inline-block' : 'none';

    // Injecter les boutons d'action AVANT le bouton PDF (ne pas écraser le container entier)
    let actionSpan = document.getElementById('craActionSpan');
    if (!actionSpan) {
        actionSpan = document.createElement('span');
        actionSpan.id = 'craActionSpan';
        actionSpan.style.display = 'contents';
        container.insertBefore(actionSpan, container.firstChild);
    }
    actionSpan.innerHTML =
        buttons ||
        '<span style="color:#999;font-size:12px;font-style:italic;">Aucune action disponible pour ce statut.</span>';
}

// ===== MODALE SAISIE CRA =====
let _craSaisieId = null;
let _craSaisieMois = null;
let _craSaisieAnnee = null;
let _craSaisieLines = [];
let _craSaisieEditIdx = null; // index de la ligne en cours d'édition
let _craCollected = []; // propositions issues de la planification (MAD volante)
let _craDeleted = []; // lignes issues de la planification supprimées pendant la saisie

async function openCraSaisieModal(craId, mois, annee) {
    _craSaisieId = craId;
    _craSaisieMois = mois;
    _craSaisieAnnee = annee;
    _craSaisieLines = [];
    _craSaisieEditIdx = null;
    _craCollected = [];
    _craDeleted = [];
    document.getElementById('craSaisieCollectBtn').style.display = 'none';
    document.getElementById('craSaisieCollectMsg').textContent = '';

    const moisNom = new Date(parseInt(annee), parseInt(mois) - 1, 1).toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
    });
    document.getElementById('craSaisieModalTitle').textContent = moisNom.charAt(0).toUpperCase() + moisNom.slice(1);

    const pad = n => String(n).padStart(2, '0');
    const lastDay = new Date(parseInt(annee), parseInt(mois), 0).getDate();
    const minDate = `${annee}-${pad(mois)}-01`;
    const maxDate = `${annee}-${pad(mois)}-${pad(lastDay)}`;
    document.getElementById('craSaisieDateDebut').min = minDate;
    document.getElementById('craSaisieDateDebut').max = maxDate;
    document.getElementById('craSaisieDateFin').min = minDate;
    document.getElementById('craSaisieDateFin').max = maxDate;

    // allLocations peut être vide si l'onglet Ressources n'a jamais été ouvert
    if (!allLocations || allLocations.length === 0) {
        await loadLocations();
    }
    // Peupler le select SAMU depuis allLocations
    const samuSel = document.getElementById('craSaisieSamu');
    samuSel.innerHTML = '<option value="">-- Sélectionner un SAMU --</option>';
    (allLocations || []).forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc.libelle_court || loc.libelle_long || '';
        opt.textContent = loc.libelle_court ? `${loc.libelle_court} — ${loc.libelle_long || ''}` : loc.libelle_long;
        samuSel.appendChild(opt);
    });

    // Charger les lignes existantes depuis la BDD pour ce mois
    try {
        const res = await fetch(`${API_URL}/cra/${craId}`, { credentials: 'include' });
        const cra = await res.json();
        _craSaisieLines = (cra.astreintes_hno || []).map(l => ({
            id: l.id,
            type: l.type,
            date_debut: l.date_debut,
            date_fin: l.date_fin,
            heure_debut: l.heure_debut || '',
            heure_fin: l.heure_fin || '',
            samu: l.samu || '',
            objet: l.objet || ''
        }));
    } catch (e) {
        _craSaisieLines = [];
    }

    craSaisieResetForm();
    renderCraSaisieList();
    document.getElementById('craSaisieModal').classList.add('active');

    // MAD volante : proposition de collecte depuis la planification
    try {
        const r = await fetch(`${API_URL}/cra/${craId}/collect`, { credentials: 'include' });
        const d = r.ok ? await r.json() : null;
        if (d && d.allowed) {
            _craCollected = d.lines || [];
            const b = document.getElementById('craSaisieCollectBtn');
            b.style.display = 'inline-block';
            b.textContent = `📥 Collecter depuis la planification (${_craCollected.length})`;
        }
    } catch (e) {
        /* collecte indisponible : saisie manuelle uniquement */
    }
}

// Ajoute les lignes de la planification (activités courantes, astreintes) sans doublon ni chevauchement
function craSaisieCollecter() {
    const snap = l => ({
        date_debut: l.date_debut,
        date_fin: l.date_fin,
        heure_debut: l.heure_debut,
        heure_fin: l.heure_fin,
        samu: l.samu,
        objet: l.objet
    });
    const overlaps = (a, b) =>
        a.type === b.type &&
        a.date_debut + 'T' + (a.heure_debut || '00:00') < b.date_fin + 'T' + (b.heure_fin || '23:59') &&
        a.date_fin + 'T' + (a.heure_fin || '23:59') > b.date_debut + 'T' + (b.heure_debut || '00:00');
    let added = 0,
        dup = 0,
        replaced = 0,
        kept = 0;
    const differing = []; // [{ existing, proposed }]
    _craCollected.forEach(l => {
        const same = _craSaisieLines.find(
            x =>
                x.type === l.type &&
                x.date_debut === l.date_debut &&
                x.date_fin === l.date_fin &&
                x.heure_debut === l.heure_debut &&
                x.heure_fin === l.heure_fin &&
                (x.samu || '') === (l.samu || '') &&
                (x.objet || '') === (l.objet || '')
        );
        if (same) {
            if (!same.origin) {
                same.origin = l.origin;
                same.orig = snap(same);
            }
            dup++;
            return;
        } // ligne déjà saisie : on la rattache à la planification
        const clash = _craSaisieLines.filter(x => overlaps(x, l));
        if (clash.length) {
            differing.push({ existing: clash, proposed: l });
            return;
        }
        _craSaisieLines.push({ ...l, orig: snap(l) });
        added++;
    });
    // Lignes déjà saisies qui diffèrent de la planification : l'utilisateur choisit
    if (differing.length) {
        const f = l =>
            `${formatDateFRClient(l.date_debut)}${l.date_fin !== l.date_debut ? ' → ' + formatDateFRClient(l.date_fin) : ''} ${l.heure_debut}-${l.heure_fin} ${l.samu || '(pas de SAMU)'} — ${l.objet}`;
        const detail = differing
            .map(d => `• Saisi : ${d.existing.map(f).join(' / ')}\n  Planification : ${f(d.proposed)}`)
            .join('\n');
        if (
            confirm(
                `${differing.length} ligne(s) déjà saisie(s) ne correspondent pas à la planification :\n\n${detail}\n\nLes remplacer par les données de la planification ?\n(OK = remplacer, Annuler = conserver ce que vous avez saisi)`
            )
        ) {
            differing.forEach(d => {
                d.existing.forEach(e => {
                    const ix = _craSaisieLines.indexOf(e);
                    if (ix >= 0) _craSaisieLines.splice(ix, 1);
                });
                // remplacement par la planification : rien à reporter en retour
                if (!_craSaisieLines.some(x => overlaps(x, d.proposed))) {
                    _craSaisieLines.push({ ...d.proposed, orig: snap(d.proposed) });
                    replaced++;
                }
            });
        } else kept = differing.length;
    }
    _craSaisieLines.sort((a, b) =>
        (a.date_debut + (a.heure_debut || '')).localeCompare(b.date_debut + (b.heure_debut || ''))
    );
    renderCraSaisieList();
    document.getElementById('craSaisieCollectMsg').textContent =
        `${added} ligne(s) ajoutée(s)` +
        (replaced ? `, ${replaced} remplacée(s)` : '') +
        (dup ? `, ${dup} déjà conforme(s)` : '') +
        (kept ? `, ${kept} différente(s) conservée(s)` : '') +
        '. Vérifiez et corrigez si besoin.';
}

function closeCraSaisieModal() {
    document.getElementById('craSaisieModal').classList.remove('active');
    _craSaisieId = null;
    _craSaisieLines = [];
    _craSaisieEditIdx = null;
}

function craSaisieResetForm() {
    document.getElementById('craSaisieType').selectedIndex = 0;
    document.getElementById('craSaisieSamu').selectedIndex = 0;
    document.getElementById('craSaisieDateDebut').value = '';
    document.getElementById('craSaisieDateFin').value = '';
    document.getElementById('craSaisieHeureDebut').value = '';
    document.getElementById('craSaisieHeureFin').value = '';
    document.getElementById('craSaisieObjet').value = '';
    _craSaisieEditIdx = null;
    const btn = document.getElementById('craSaisieAddBtn');
    if (btn) {
        btn.textContent = '➕ Ajouter';
        btn.style.background = '#6a1b9a';
    }
}

function craSaisieEditLigne(idx) {
    const l = _craSaisieLines[idx];
    if (!l) return;
    _craSaisieEditIdx = idx;
    document.getElementById('craSaisieType').value = l.type;
    document.getElementById('craSaisieDateDebut').value = l.date_debut;
    document.getElementById('craSaisieDateFin').value = l.date_fin;
    document.getElementById('craSaisieHeureDebut').value = l.heure_debut;
    document.getElementById('craSaisieHeureFin').value = l.heure_fin;
    document.getElementById('craSaisieSamu').value = l.samu;
    document.getElementById('craSaisieObjet').value = l.objet;
    const btn = document.getElementById('craSaisieAddBtn');
    if (btn) {
        btn.textContent = '💾 Modifier';
        btn.style.background = '#e65100';
    }
    document.getElementById('craSaisieType').focus();
}

// Vérifie les chevauchements date+heure pour le même type (retourne l'entrée en conflit ou null)
function findAstreinteConflict(newLigne, skipIdx) {
    const newStart = newLigne.date_debut + 'T' + (newLigne.heure_debut || '00:00');
    const newEnd = newLigne.date_fin + 'T' + (newLigne.heure_fin || '23:59');
    for (let i = 0; i < _craSaisieLines.length; i++) {
        if (i === skipIdx) continue;
        const l = _craSaisieLines[i];
        if (l.type !== newLigne.type) continue; // seul le même type génère un conflit
        const lStart = l.date_debut + 'T' + (l.heure_debut || '00:00');
        const lEnd = l.date_fin + 'T' + (l.heure_fin || '23:59');
        if (newStart < lEnd && newEnd > lStart) return l;
    }
    return null;
}

function craSaisieAjouter() {
    const type = document.getElementById('craSaisieType').value;
    const dateDebut = document.getElementById('craSaisieDateDebut').value;
    const dateFin = document.getElementById('craSaisieDateFin').value;
    const heureDebut = document.getElementById('craSaisieHeureDebut').value;
    const heureFin = document.getElementById('craSaisieHeureFin').value;
    const samu = document.getElementById('craSaisieSamu').value;
    const objet = document.getElementById('craSaisieObjet').value.trim();

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
    const skipIdx = _craSaisieEditIdx !== null ? _craSaisieEditIdx : -1;
    const conflict = findAstreinteConflict(ligne, skipIdx);
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

    if (_craSaisieEditIdx !== null) {
        ligne.id = _craSaisieLines[_craSaisieEditIdx].id;
        if (_craSaisieLines[_craSaisieEditIdx].origin) {
            ligne.origin = _craSaisieLines[_craSaisieEditIdx].origin;
            ligne.orig = _craSaisieLines[_craSaisieEditIdx].orig;
        }
        _craSaisieLines[_craSaisieEditIdx] = ligne;
    } else {
        _craSaisieLines.push(ligne);
    }
    renderCraSaisieList();
    craSaisieResetForm();
}

function craSaisieSupprimer(idx) {
    if (!confirm('Supprimer cette ligne ?')) return;
    if (_craSaisieLines[idx] && _craSaisieLines[idx].origin) _craDeleted.push(_craSaisieLines[idx].origin);
    _craSaisieLines.splice(idx, 1);
    renderCraSaisieList();
    if (_craSaisieEditIdx === idx) craSaisieResetForm();
}

function renderCraSaisieList() {
    const container = document.getElementById('craSaisieList');
    if (!_craSaisieLines.length) {
        container.innerHTML =
            '<p style="color:#999;text-align:center;font-size:13px;padding:20px 0;">Aucune ligne saisie</p>';
        return;
    }
    container.innerHTML = _craSaisieLines
        .map(
            (l, i) => `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${i % 2 ? '#f9f4ff' : 'white'};border:1px solid #e1bee7;border-radius:6px;margin-bottom:6px;font-size:12px;">
                    <span style="padding:2px 8px;border-radius:4px;background:${l.type === 'astreinte' ? '#ff980022' : l.type === 'activite_courante' ? '#2e7d3222' : '#2196f322'};color:${l.type === 'astreinte' ? '#e65100' : l.type === 'activite_courante' ? '#2e7d32' : '#1565c0'};font-weight:bold;white-space:nowrap;">${l.type === 'astreinte' ? '🔔 Astreinte' : l.type === 'activite_courante' ? '✅ Activité courante' : '🌙 HNO'}</span>
                    <span style="white-space:nowrap;">${formatDateFRClient(l.date_debut)}${l.date_fin !== l.date_debut ? ' → ' + formatDateFRClient(l.date_fin) : ''}</span>
                    <span style="white-space:nowrap;color:#666;">${l.heure_debut} → ${l.heure_fin}</span>
                    <span style="white-space:nowrap;color:#6a1b9a;font-weight:bold;">${l.samu}</span>
                    <span style="flex:1;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.objet}</span>
                    <button onclick="craSaisieEditLigne(${i})" title="Modifier" style="background:#ff9800;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">✏️</button>
                    <button onclick="craSaisieSupprimer(${i})" title="Supprimer" style="background:#e53935;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">🗑️</button>
                </div>`
        )
        .join('');
}

let _craSaisieFromGantt = false; // true si la modale a été ouverte depuis le gantt

async function craSaisieTerminer() {
    try {
        let res;
        if (_craSaisieFromGantt && _ganttAstreinteCtx) {
            // Sauvegarde directe sans CRA
            const ctx = _ganttAstreinteCtx;
            res = await fetch(`${API_URL}/astreintes-hno/direct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ user_id: ctx.userId, mois: ctx.month, annee: ctx.year, lignes: _craSaisieLines })
            });
        } else {
            res = await fetch(`${API_URL}/cra/${_craSaisieId}/astreintes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ lignes: _craSaisieLines })
            });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        await craProposerReport();
        const fromGantt = _craSaisieFromGantt;
        const savedCraId = _craSaisieId;
        closeCraSaisieModal();
        _craSaisieFromGantt = false;
        _ganttAstreinteCtx = null;
        if (fromGantt) {
            await loadAllAstreintesForPlanning();
            updateGantt();
        } else {
            await openCraDetail(savedCraId);
        }
    } catch (e) {
        alert("Erreur lors de l'enregistrement : " + e.message);
    }
}

// Corrections de lignes issues de la planification : proposer de les reporter dans la planification
async function craProposerReport() {
    if (_craSaisieFromGantt || !_craSaisieId) return;
    const keys = ['date_debut', 'date_fin', 'heure_debut', 'heure_fin'];
    const corrections = [];
    _craSaisieLines.forEach(l => {
        if (l.origin && l.orig && keys.some(k => l[k] !== l.orig[k]))
            corrections.push({
                origin: l.origin,
                line: {
                    date_debut: l.date_debut,
                    date_fin: l.date_fin,
                    heure_debut: l.heure_debut,
                    heure_fin: l.heure_fin
                }
            });
    });
    _craDeleted.forEach(o => corrections.push({ origin: o, line: null }));
    if (!corrections.length) return;
    const nbSupp = _craDeleted.length;
    if (
        !confirm(
            `Vous avez corrigé ${corrections.length - nbSupp} ligne(s)` +
                (nbSupp ? ` et supprimé ${nbSupp} ligne(s)` : '') +
                ` issues de la planification.\n\nReporter ces corrections dans la page de planification (activités, créneaux d'astreinte) ?`
        )
    )
        return;
    try {
        const r = await fetch(`${API_URL}/cra/${_craSaisieId}/propagate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ corrections })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Erreur');
        alert(
            `Planification mise à jour : ${d.activity} activité(s), ${d.astreinte} astreinte(s).` +
                (d.skipped && d.skipped.length ? `\n\nNon reporté :\n- ${d.skipped.join('\n- ')}` : '')
        );
    } catch (e) {
        alert('Report dans la planification impossible : ' + e.message);
    }
}

function toggleRefusPanel(niveau, craId) {
    const panel = document.getElementById('craRefusViseurPanel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        panel.dataset.niveau = niveau;
        panel.dataset.craId = craId;
        document.getElementById('craCommentaireRefus').focus();
        // Mettre à jour le bouton de confirmation
        let confirmBtn = document.getElementById('craRefusConfirmBtn');
        if (!confirmBtn) {
            confirmBtn = document.createElement('button');
            confirmBtn.id = 'craRefusConfirmBtn';
            confirmBtn.style.cssText =
                'background:#e53935;color:white;padding:9px 20px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;margin-top:8px;';
            confirmBtn.textContent = "📨 Confirmer le refus et notifier l'expert";
            confirmBtn.onclick = () => refuserCra(panel.dataset.niveau, parseInt(panel.dataset.craId));
            panel.appendChild(confirmBtn);
        }
    }
}

async function refuserCra(niveau, craId) {
    const commentaire = document.getElementById('craCommentaireRefus').value.trim();
    if (!commentaire) {
        alert('Le motif de refus est obligatoire.');
        return;
    }
    if (!confirm(`Confirmer le refus de ce CRA ? Un email sera envoyé à l'expert avec votre commentaire.`)) return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/refuser/${niveau}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ commentaire })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        alert("✅ CRA refusé — l'expert a été notifié par email.");
        document.getElementById('craRefusViseurPanel').style.display = 'none';
        await loadCraList();
        closeCraDetail();
        loadCraPendingBadge();
    } catch (e) {
        alert('Erreur : ' + e.message);
    }
}

// Admin : renvoie le CRA (initialisé ou modifié) à l'expert, qui le vérifie et le soumet lui-même
async function returnCraToExpert(craId) {
    if (
        !confirm(
            "Renvoyer ce CRA à l'expert pour vérification ?\n\nIl recevra un email et devra le soumettre lui-même : l'administrateur ne soumet pas à sa place."
        )
    )
        return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/return-to-expert`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        alert(
            data.mailed
                ? "CRA renvoyé à l'expert : un email lui a été envoyé."
                : "CRA renvoyé à l'expert (aucun email envoyé : adresse absente)."
        );
        await loadCraList();
        await openCraDetail(craId);
    } catch (e) {
        alert('Erreur : ' + e.message);
    }
}

async function submitCra(craId) {
    const commentaire = document.getElementById('craCommentaire').value;
    if (!confirm('Confirmer la soumission de votre CRA ? Il sera transmis au viseur de niveau 1.')) return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ commentaire })
        });
        const data = await res.json();
        if (data.success) {
            await loadCraList();
            await openCraDetail(craId);
        } else alert('Erreur : ' + data.error);
    } catch (e) {
        alert('Erreur réseau');
    }
}

async function visaCra(craId, niveau) {
    if (!confirm(`Confirmer le visa de ${niveau === 'n1' ? 'niveau 1' : 'niveau 2'} pour ce CRA ?`)) return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/visa/${niveau}`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            await loadCraList();
            await openCraDetail(craId);
            loadCraPendingBadge(); // Rafraîchir la pastille
        } else alert('Erreur : ' + data.error);
    } catch (e) {
        alert('Erreur réseau');
    }
}

async function resendCraEmail() {
    const craId = _craViewerCurrentId;
    if (!craId) return;
    if (!confirm("Renvoyer l'email avec le CRA en pièce jointe à tous les destinataires précédents ?")) return;
    const btn = document.getElementById('resendCraEmailBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Envoi...';
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/diffusion-resend-all`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            alert(`✅ Email renvoyé à ${data.sent} destinataire(s).`);
        } else {
            alert('Erreur : ' + (data.error || 'inconnue'));
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "📧 Renvoyer l'email";
    }
}

async function resendCraDiffusion(craId, logId) {
    if (!confirm('Renvoyer cet email de diffusion ?')) return;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/diffusion-resend/${logId}`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ Email remis en file d'envoi.");
        } else {
            alert('Erreur : ' + (data.error || 'inconnue'));
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

async function showDiffusionStatus(craId, btn) {
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/diffusion-log`, { credentials: 'include' });
        const logData = await res.json();
        if (!logData || logData.length === 0) {
            alert('Aucune information de diffusion.');
            return;
        }
        const fmtDt = dt => (dt ? new Date(dt).toLocaleString('fr-FR') : '—');
        const rows = logData
            .map(r => {
                const st = r.email_status;
                const icon =
                    st === 'sent'
                        ? '✅ Envoyé'
                        : st === 'failed'
                          ? '❌ Échec'
                          : st === 'pending'
                            ? '⏳ En attente'
                            : '❓ Inconnu';
                const err = r.error_message ? `<br><small style="color:#c62828;">${r.error_message}</small>` : '';
                const resend =
                    (st === 'failed' || st === 'pending') && currentUser.activeProfile !== 'rh'
                        ? `<button onclick="resendCraDiffusion(${craId},${r.id});this.closest('.status-popup').remove();" style="font-size:10px;padding:2px 6px;background:#c62828;color:white;border:none;border-radius:3px;cursor:pointer;">Renvoyer</button>`
                        : '';
                return `<tr><td style="padding:5px 8px;">${r.recipient_name || '—'}</td><td style="padding:5px 8px;">${r.recipient_email}</td><td style="padding:5px 8px;">${fmtDt(r.sent_at)}</td><td style="padding:5px 8px;">${icon}${err} ${resend}</td></tr>`;
            })
            .join('');
        const popup = document.createElement('div');
        popup.className = 'status-popup';
        popup.style.cssText =
            'position:fixed;z-index:9999;background:white;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.2);padding:16px;min-width:520px;max-width:700px;';
        const rect = btn.getBoundingClientRect();
        popup.style.top = Math.min(rect.bottom + 4, window.innerHeight - 300) + 'px';
        popup.style.left = Math.max(rect.left - 200, 10) + 'px';
        popup.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong style="color:#1a237e;">📨 Statut de diffusion</strong><button onclick="this.closest('.status-popup').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;">✕</button></div><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#1a237e;color:white;"><th style="padding:6px 8px;text-align:left;">Destinataire</th><th style="padding:6px 8px;text-align:left;">Email</th><th style="padding:6px 8px;text-align:left;">Date envoi</th><th style="padding:6px 8px;text-align:left;">Statut</th></tr></thead><tbody>${rows}</tbody></table>`;
        document.querySelectorAll('.status-popup').forEach(p => p.remove());
        document.body.appendChild(popup);
        setTimeout(() =>
            document.addEventListener(
                'click',
                function h(e) {
                    if (!popup.contains(e.target) && e.target !== btn) {
                        popup.remove();
                        document.removeEventListener('click', h);
                    }
                },
                100
            )
        );
    } catch (e) {
        alert('Erreur chargement statut : ' + e.message);
    }
}

// ===== DIFFUSION CRA — NOUVELLE LOGIQUE =====
let _diffuserCraId = null;
let _diffuserPdfFilename = null;
let _diffuserAllUsers = [];

async function openDiffuserModal(craId) {
    _diffuserCraId = craId;
    _diffuserPdfFilename = null;
    // Reset UI
    ['expert', 'rh_es', 'drh_ans'].forEach(s => {
        const cfg = _sectionConfig(s);
        const container = document.getElementById(cfg.container);
        const input = document.getElementById(cfg.input);
        if (container) container.innerHTML = '';
        if (input) input.value = '';
    });
    document.getElementById('diffuserPdfStatus').innerHTML =
        'Cliquez sur "Générer le PDF" pour préparer la pièce jointe.';
    document.getElementById('diffuserPdfStatus').style.color = '#666';
    document.getElementById('diffuserBtnGenPdf').disabled = false;
    document.getElementById('diffuserBtnGenPdf').textContent = '📄 Générer le PDF';
    const btn = document.getElementById('diffuserBtnEnvoyer');
    btn.disabled = true;
    btn.style.background = '#bdbdbd';
    btn.style.cursor = 'not-allowed';

    // Charger la liste des utilisateurs pour autocomplétion
    try {
        const res = await fetch(`${API_URL}/users`, { credentials: 'include' });
        _diffuserAllUsers = (await res.json()) || [];
    } catch (e) {
        _diffuserAllUsers = [];
    }

    // Charger les destinataires pré-remplis
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/diffusion-recipients`, { credentials: 'include' });
        const data = await res.json();
        const cra = await (await fetch(`${API_URL}/cra/${craId}`, { credentials: 'include' })).json();
        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        document.getElementById('craDiffuserTitle').textContent =
            `📤 Diffuser le CRA — ${cra.expert_nom || ''} — ${moisNom.charAt(0).toUpperCase() + moisNom.slice(1)}`;
        (data.expert || []).forEach(r => addDiffuserChipData('expert', r.email, r.nom));
        (data.rh_es || []).forEach(r => addDiffuserChipData('rh_es', r.email, r.nom));
        (data.drh_ans || []).forEach(r => addDiffuserChipData('drh_ans', r.email, r.nom));
    } catch (e) {
        console.error('Erreur chargement destinataires:', e);
    }

    document.getElementById('craDiffuserModal').classList.add('active');
}

function _sectionConfig(section) {
    return {
        expert: {
            container: 'diffuserChipsExpert',
            input: 'diffuserInputExpert',
            dropdown: 'diffuserDropdownExpert',
            color: '#6a1b9a'
        },
        rh_es: {
            container: 'diffuserChipsRhEs',
            input: 'diffuserInputRhEs',
            dropdown: 'diffuserDropdownRhEs',
            color: '#2e7d32'
        },
        drh_ans: {
            container: 'diffuserChipsDrhAns',
            input: 'diffuserInputDrhAns',
            dropdown: 'diffuserDropdownDrhAns',
            color: '#1a237e'
        }
    }[section];
}

function addDiffuserChipData(section, email, nom) {
    const cfg = _sectionConfig(section);
    if (!cfg || !email) return;
    const container = document.getElementById(cfg.container);
    // Éviter doublons
    if ([...container.querySelectorAll('[data-email]')].some(c => c.dataset.email === email)) return;
    const chip = document.createElement('span');
    chip.dataset.email = email;
    chip.dataset.nom = nom || '';
    chip.style.cssText = `display:inline-flex;align-items:center;gap:4px;background:${cfg.color}18;border:1px solid ${cfg.color}55;border-radius:14px;padding:2px 8px 2px 10px;font-size:11px;color:${cfg.color};`;
    chip.innerHTML = `<span title="${email}">${nom ? nom + ' &lt;' + email + '&gt;' : email}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:${cfg.color};font-size:13px;line-height:1;padding:0 0 0 2px;" title="Supprimer">×</button>`;
    container.appendChild(chip);
}

function addDiffuserChip(section) {
    const cfg = _sectionConfig(section);
    const input = document.getElementById(cfg.input);
    const val = input.value.trim();
    if (!val || !val.includes('@')) {
        input.style.border = '1px solid #e53935';
        setTimeout(() => (input.style.border = '1px solid #ccc'), 1500);
        return;
    }
    addDiffuserChipData(section, val, '');
    input.value = '';
    document.getElementById(cfg.dropdown).style.display = 'none';
}

function diffuserInputKeydown(e, section) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addDiffuserChip(section);
    }
}

function filterDiffuserSuggestions(section, query) {
    const cfg = _sectionConfig(section);
    const dropdown = document.getElementById(cfg.dropdown);
    if (!query || query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    const q = query.toLowerCase();
    const matches = _diffuserAllUsers
        .filter(
            u =>
                u.email &&
                (u.email.toLowerCase().includes(q) ||
                    (u.nom || '').toLowerCase().includes(q) ||
                    (u.prenom || '').toLowerCase().includes(q))
        )
        .slice(0, 8);
    if (!matches.length) {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = matches
        .map(
            u =>
                `<div onclick="addDiffuserChipData('${section}','${u.email}','${(u.prenom || '') + ' ' + (u.nom || '')}');document.getElementById('${cfg.input}').value='';document.getElementById('${cfg.dropdown}').style.display='none';" style="padding:7px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f0f0f0;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''"><strong>${u.prenom || ''} ${u.nom || ''}</strong> <span style="color:#999;">${u.email}</span></div>`
        )
        .join('');
    dropdown.style.display = 'block';
}

function getDiffuserRecipients() {
    const get = containerId =>
        [...document.getElementById(containerId).querySelectorAll('[data-email]')].map(c => ({
            email: c.dataset.email,
            nom: c.dataset.nom
        }));
    return { expert: get('diffuserChipsExpert'), rh_es: get('diffuserChipsRhEs'), drh_ans: get('diffuserChipsDrhAns') };
}

async function generateCraPdfForDiffusion() {
    const btn = document.getElementById('diffuserBtnGenPdf');
    const status = document.getElementById('diffuserPdfStatus');
    btn.disabled = true;
    btn.textContent = '⏳ Génération en cours...';
    status.innerHTML = '⏳ Génération du PDF en cours, veuillez patienter (30-60s)...';
    status.style.color = '#e65100';
    try {
        const res = await fetch(`${API_URL}/cra/${_diffuserCraId}/prepare-pdf`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            _diffuserPdfFilename = data.pdfFilename;
            status.innerHTML = `✅ PDF prêt : <a href="${API_URL}/cra/pdf-saved/${encodeURIComponent(data.pdfFilename)}" target="_blank" style="color:#1565c0;font-weight:bold;">📄 ${data.pdfFilename}</a>`;
            status.style.color = '#2e7d32';
            btn.textContent = '🔄 Regénérer le PDF';
            btn.disabled = false;
            const envBtn = document.getElementById('diffuserBtnEnvoyer');
            envBtn.disabled = false;
            envBtn.style.background = '#1565c0';
            envBtn.style.cursor = 'pointer';
        } else {
            status.innerHTML = `❌ Erreur : ${data.error}`;
            status.style.color = '#c62828';
            btn.textContent = '📄 Réessayer';
            btn.disabled = false;
        }
    } catch (e) {
        status.innerHTML = `❌ Erreur réseau : ${e.message}`;
        status.style.color = '#c62828';
        btn.textContent = '📄 Réessayer';
        btn.disabled = false;
    }
}

async function sendCraDiffusion() {
    if (!_diffuserPdfFilename) {
        alert("Veuillez d'abord générer le PDF.");
        return;
    }
    const recipients = getDiffuserRecipients();
    const totalRh = recipients.rh_es.length + recipients.drh_ans.length;
    if (totalRh === 0) {
        alert('Veuillez ajouter au moins un destinataire RH ES ou DRH ANS.');
        return;
    }
    const btn = document.getElementById('diffuserBtnEnvoyer');
    btn.disabled = true;
    btn.textContent = '⏳ Envoi en cours...';
    try {
        const res = await fetch(`${API_URL}/cra/${_diffuserCraId}/diffuser`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipients, pdfFilename: _diffuserPdfFilename })
        });
        const data = await res.json();
        if (data.success) {
            alert(`✅ CRA diffusé — ${data.sent} email(s) envoyé(s).`);
            document.getElementById('craDiffuserModal').classList.remove('active');
            await loadCraSignatures();
        } else {
            alert('Erreur : ' + data.error);
            btn.disabled = false;
            btn.textContent = '📧 Envoyer';
        }
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
        btn.disabled = false;
        btn.textContent = '📧 Envoyer';
    }
}

function closeCraDetail() {
    document.getElementById('craDetailPanel').style.display = 'none';
}

function toggleProfileDropdown() {
    const dd = document.getElementById('profileDropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        setTimeout(
            () =>
                document.addEventListener('click', function h(e) {
                    if (!document.getElementById('profileSwitcher').contains(e.target)) {
                        dd.style.display = 'none';
                        document.removeEventListener('click', h);
                    }
                }),
            50
        );
    }
}

async function switchToProfile(profile) {
    if (profile === currentUser.activeProfile) {
        document.getElementById('profileDropdown').style.display = 'none';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/switch-profile`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile })
        });
        const data = await res.json();
        if (!data.success) {
            alert('Erreur : ' + (data.error || 'Impossible de changer de profil'));
            return;
        }
        currentUser.activeProfile = profile;
        document.getElementById('profileDropdown').style.display = 'none';
        // Recharger la page pour garantir une interface cohérente avec le nouveau profil
        location.reload();
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

async function openPdfWithFallback(craId, pdfFilename) {
    // Vérifier si le fichier existe (seulement si on a un nom)
    if (pdfFilename) {
        const check = await fetch(`${API_URL}/cra/pdf-saved/${encodeURIComponent(pdfFilename)}`, {
            method: 'HEAD',
            credentials: 'include'
        });
        if (check.ok) {
            window.open(`${API_URL}/cra/pdf-saved/${encodeURIComponent(pdfFilename)}`, '_blank');
            return;
        }
    }
    // Fichier absent : les experts ne peuvent pas régénérer
    if (currentUser.activeProfile === 'expert') {
        alert("Le fichier PDF de ce CRA n'est pas encore disponible. Contactez un administrateur pour le générer.");
        return;
    }
    // Fichier absent ou jamais créé : afficher popup et régénérer (admin/RH)
    const overlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:white;border-radius:10px;padding:32px 40px;text-align:center;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.3);">
                <div style="font-size:36px;margin-bottom:14px;">⏳</div>
                <div style="font-weight:bold;font-size:15px;color:#333;margin-bottom:10px;">Création du PDF en cours</div>
                <div style="font-size:13px;color:#666;line-height:1.5;">Le fichier PDF n'existe pas sur le serveur et est en cours de création.<br>Veuillez patienter (30-60 secondes)…</div>
                <div style="margin-top:18px;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;">
                    <div style="height:100%;background:#6a1b9a;animation:pdfProgress 40s linear forwards;" id="_pdfProgressBar"></div>
                </div>
            </div>
            <style>@keyframes pdfProgress{from{width:0%}to{width:95%}}</style>`;
    document.body.appendChild(overlay);
    try {
        const res = await fetch(`${API_URL}/cra/${craId}/prepare-pdf`, { method: 'POST', credentials: 'include' });
        const data = await res.json();
        document.body.removeChild(overlay);
        if (data.success) {
            // Rebinder le bouton avec le nouveau nom pour éviter les régénérations successives
            const pdfBtn = document.querySelector('#craViewerModal button[onclick^="downloadCraPdf"]');
            if (pdfBtn) pdfBtn.onclick = () => openPdfWithFallback(craId, data.pdfFilename);
            window.open(`${API_URL}/cra/pdf-saved/${encodeURIComponent(data.pdfFilename)}`, '_blank');
        } else {
            alert('Erreur lors de la génération du PDF : ' + (data.error || 'Erreur inconnue'));
        }
    } catch (e) {
        document.body.removeChild(overlay);
        alert('Erreur réseau lors de la génération du PDF : ' + e.message);
    }
}

let _craViewerCurrentId = null;

async function openCraModal(craId) {
    _craViewerCurrentId = craId;
    try {
        const res = await fetch(`${API_URL}/cra/${craId}`, { credentials: 'include' });
        const cra = await res.json();
        const moisNom = new Date(parseInt(cra.annee), parseInt(cra.mois) - 1, 1).toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric'
        });
        const moisCap = moisNom.charAt(0).toUpperCase() + moisNom.slice(1);

        document.getElementById('craViewerTitle').textContent = `CRA — ${cra.expert_nom || ''} — ${moisCap}`;

        // Signatures
        const sigsMap = { 1: null, 2: null, 3: null };
        (cra.signatures || []).forEach(s => {
            sigsMap[s.rang] = s;
        });
        const fmt = dt => new Date(dt).toLocaleString('fr-FR');
        const sigRow = (rang, label, color) => {
            const s = sigsMap[rang];
            if (!s)
                return `<tr><td style="padding:6px 10px;font-weight:bold;color:${color};">${label}</td><td style="padding:6px 10px;" colspan="2" style="color:#bbb;">En attente</td></tr>`;
            return `<tr style="background:#faf5ff;"><td style="padding:6px 10px;font-weight:bold;color:${color};">${label}</td><td style="padding:6px 10px;">${s.signer_name}</td><td style="padding:6px 10px;font-size:11px;color:#888;">${fmt(s.signed_at)}<br><span style="color:#bbb;">IP: ${s.ip_address || 'N/A'}</span></td></tr>`;
        };

        // Astreintes
        const lignes = cra.astreintes_hno || [];
        const lignesHtml = lignes.length
            ? lignes
                  .map(
                      (l, i) => `
                    <tr style="background:${i % 2 ? '#f9f4ff' : 'white'};">
                        <td style="padding:6px 8px;"><span style="font-weight:bold;color:${l.type === 'astreinte' ? '#e65100' : l.type === 'activite_courante' ? '#2e7d32' : '#1565c0'};">${l.type === 'astreinte' ? '🔔 Astreinte' : l.type === 'activite_courante' ? '✅ Activité courante' : '🌙 HNO'}</span></td>
                        <td style="padding:6px 8px;">${l.date_debut ? new Date(l.date_debut).toLocaleDateString('fr-FR') : ''}</td>
                        <td style="padding:6px 8px;">${l.date_fin ? new Date(l.date_fin).toLocaleDateString('fr-FR') : ''}</td>
                        <td style="padding:6px 8px;">${l.heure_debut || ''} ${l.heure_fin ? '→ ' + l.heure_fin : ''}</td>
                        <td style="padding:6px 8px;">${l.samu || ''}</td>
                        <td style="padding:6px 8px;">${l.objet || ''}</td>
                    </tr>`
                  )
                  .join('')
            : `<tr><td colspan="6" style="padding:12px;text-align:center;color:#999;">Aucune activité enregistrée</td></tr>`;

        document.getElementById('craViewerBody').innerHTML = `
                    <!-- Infos expert -->
                    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px;">
                        <tr style="background:#f3e5f5;">
                            <td style="padding:6px 10px;font-weight:bold;width:130px;border:1px solid #d1b3e0;">Expert</td>
                            <td style="padding:6px 10px;border:1px solid #d1b3e0;">${cra.expert_nom || ''}</td>
                            <td style="padding:6px 10px;font-weight:bold;width:100px;border:1px solid #d1b3e0;">Période</td>
                            <td style="padding:6px 10px;border:1px solid #d1b3e0;">${moisCap}</td>
                        </tr>
                        <tr style="background:#f3e5f5;">
                            <td style="padding:6px 10px;font-weight:bold;border:1px solid #d1b3e0;">Établissement</td>
                            <td style="padding:6px 10px;border:1px solid #d1b3e0;">${cra.es_rattachement || '—'}</td>
                            <td style="padding:6px 10px;font-weight:bold;border:1px solid #d1b3e0;">SAMU</td>
                            <td style="padding:6px 10px;border:1px solid #d1b3e0;">${cra.expert_samu || '—'}</td>
                        </tr>
                    </table>

                    <!-- Astreintes/HNO -->
                    <div style="font-size:11px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px;">📋 Activités Astreinte / HNO</div>
                    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
                        <thead><tr style="background:#6a1b9a;color:white;">
                            <th style="padding:7px 8px;text-align:left;">Type</th>
                            <th style="padding:7px 8px;text-align:left;">Date début</th>
                            <th style="padding:7px 8px;text-align:left;">Date fin</th>
                            <th style="padding:7px 8px;text-align:left;">Heures</th>
                            <th style="padding:7px 8px;text-align:left;">SAMU</th>
                            <th style="padding:7px 8px;text-align:left;">Objet</th>
                        </tr></thead>
                        <tbody>${lignesHtml}</tbody>
                    </table>

                    ${cra.commentaire_expert ? `<div style="background:#f3e5f5;border-left:4px solid #6a1b9a;padding:10px 14px;margin-bottom:14px;font-size:12px;border-radius:0 6px 6px 0;"><strong style="color:#6a1b9a;">Commentaire :</strong> ${cra.commentaire_expert}</div>` : ''}

                    <!-- Signatures -->
                    <div style="font-size:11px;font-weight:bold;color:#6a1b9a;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px;">✍️ Signatures électroniques</div>
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead><tr style="background:#f3e5f5;">
                            <th style="padding:6px 10px;text-align:left;width:130px;border:1px solid #d1b3e0;">Rôle</th>
                            <th style="padding:6px 10px;text-align:left;border:1px solid #d1b3e0;">Signataire</th>
                            <th style="padding:6px 10px;text-align:left;border:1px solid #d1b3e0;">Date / IP</th>
                        </tr></thead>
                        <tbody>
                            ${sigRow(1, 'Expert', '#6a1b9a')}
                            ${sigRow(2, 'Viseur N1', '#4caf50')}
                            ${sigRow(3, 'Viseur N2', '#2196f3')}
                        </tbody>
                    </table>
                    <div id="craDiffusionLogSection"></div>`;

        document.getElementById('craViewerModal').classList.add('active');
        // Bouton PDF : ouvre le fichier sauvegardé si disponible, sinon régénère avec popup
        const pdfBtn = document.querySelector('#craViewerModal button[onclick^="downloadCraPdf"]');
        if (pdfBtn) {
            if (cra.statut === 'diffuse' || cra.statut === 'vise_n2') {
                pdfBtn.onclick = () => openPdfWithFallback(craId, cra.pdf_filename || null);
            } else {
                pdfBtn.onclick = () => downloadCraPdf(craId);
            }
        }
        // Bouton "Renvoyer l'email" : admin uniquement, CRA diffusé uniquement
        const resendBtn = document.getElementById('resendCraEmailBtn');
        if (resendBtn) {
            resendBtn.style.display =
                currentUser.activeProfile === 'admin' && cra.statut === 'diffuse' ? 'inline-block' : 'none';
        }

        // Charger le log de diffusion
        try {
            const logRes = await fetch(`${API_URL}/cra/${craId}/diffusion-log`, { credentials: 'include' });
            const logData = await logRes.json();
            const logContainer = document.getElementById('craDiffusionLogSection');
            if (logData && logData.length > 0) {
                const fmtDt = dt => new Date(dt).toLocaleString('fr-FR');
                const typeLabel = t => (t === 'drh_ans' ? 'DRH ANS' : t === 'expert' ? 'Expert' : 'DRH ES');
                const typeColor = t => (t === 'drh_ans' ? '#1a237e' : t === 'expert' ? '#e65100' : '#2e7d32');
                logContainer.innerHTML = `
                            <div style="font-size:11px;font-weight:bold;color:#1a237e;text-transform:uppercase;margin:16px 0 8px;letter-spacing:0.5px;">📨 Diffusion du CRA validé et signé</div>
                            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                                <thead><tr style="background:#1a237e;color:white;">
                                    <th style="padding:7px 10px;text-align:left;">Destinataire</th>
                                    <th style="padding:7px 10px;text-align:left;">Email</th>
                                    <th style="padding:7px 10px;text-align:left;">Type</th>
                                    <th style="padding:7px 10px;text-align:left;">Date d'envoi</th><th style="padding:7px 10px;text-align:left;">Statut</th>
                                </tr></thead>
                                <tbody>
                                    ${logData
                                        .map((r, i) => {
                                            const emailSt = r.email_status;
                                            const stIcon =
                                                emailSt === 'sent'
                                                    ? '<span title="Email envoyé" style="color:#2e7d32;font-size:14px;">✅</span>'
                                                    : emailSt === 'failed'
                                                      ? '<span title="Échec : ' +
                                                        r.error_message +
                                                        '" style="color:#c62828;font-size:14px;">❌</span>'
                                                      : emailSt === 'pending'
                                                        ? '<span title="En attente" style="color:#e65100;font-size:14px;">⏳</span>'
                                                        : '<span title="Statut inconnu" style="color:#999;">❓</span>';
                                            const resendBtn =
                                                (emailSt === 'failed' || emailSt === 'pending') &&
                                                currentUser.activeProfile !== 'rh'
                                                    ? `<button onclick="resendCraDiffusion(${craId}, ${r.id})" style="font-size:10px;padding:2px 6px;background:#c62828;color:white;border:none;border-radius:3px;cursor:pointer;margin-left:6px;">Renvoyer</button>`
                                                    : '';
                                            return `<tr style="background:${i % 2 ? '#e8eaf6' : 'white'};">
                                        <td style="padding:6px 10px;">${r.recipient_name || '—'}</td>
                                        <td style="padding:6px 10px;">${r.recipient_email}</td>
                                        <td style="padding:6px 10px;"><span style="color:${typeColor(r.recipient_type)};font-weight:bold;">${typeLabel(r.recipient_type)}</span></td>
                                        <td style="padding:6px 10px;color:#555;">${fmtDt(r.sent_at)}</td>
                                        <td style="padding:6px 10px;">${stIcon}${resendBtn}</td>
                                    </tr>`;
                                        })
                                        .join('')}
                                </tbody>
                            </table>`;
            }
        } catch (e) {
            /* log non critique */
        }
    } catch (e) {
        alert('Erreur chargement CRA : ' + e.message);
    }
}

// ===== ONGLET CRA : Signatures, Archives, Rien à déclarer =====

function toggleCraArchivesPanel() {
    toggleCraAdminArchivesPanel();
}

async function populateCraSignFilterExperts(selectId = 'craSignFilterExpert') {
    try {
        const res = await fetch(`${API_URL}/cra/all-experts`, { credentials: 'include' });
        if (!res.ok) return;
        const experts = await res.json();
        const sel = document.getElementById(selectId);
        sel.innerHTML =
            '<option value="">Tous les experts</option>' +
            experts
                .map(e => `<option value="${e.user_id}">${(e.nom || '').toUpperCase()} ${e.prenom || ''}</option>`)
                .join('');
    } catch (e) {
        console.error('Erreur chargement experts CRA:', e);
    }
}

function populateCraYearFilter(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const cur = new Date().getFullYear();
    sel.innerHTML = '<option value="">Toutes</option>';
    for (let y = cur; y >= cur - 5; y--) {
        sel.innerHTML += `<option value="${y}">${y}</option>`;
    }
}

function renderCraSignaturesTable(data, container, isArchive = false, readOnly = false) {
    if (!data.length) {
        container.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">Aucun CRA trouvé.</p>';
        return;
    }
    const stL = {
        a_completer: '✏️ À compléter',
        soumis: '📤 Soumis',
        vise_n1: '✅ Visé N1',
        vise_n2: '✅ Visé N2',
        diffuse: '📨 Diffusé'
    };
    const fmt = dt => (dt ? new Date(dt).toLocaleDateString('fr-FR') : '—');
    const hdrColor = isArchive ? '#546e7a' : '#6a1b9a';
    const thStyle = `padding:8px;text-align:left;cursor:pointer;user-select:none;`;
    const thNoSort = `padding:8px;text-align:left;`;
    const buildRows = rows =>
        rows
            .map((c, i) => {
                const moisNom = new Date(c.annee, c.mois - 1, 1).toLocaleDateString('fr-FR', {
                    month: 'long',
                    year: 'numeric'
                });
                return `<tr style="background:${i % 2 ? (isArchive ? '#f5f7f7' : '#f9f4ff') : 'white'};border-bottom:1px solid ${isArchive ? '#cfd8dc' : '#e1bee7'};">
                    <td style="padding:6px 8px;">${c.expert_nom || '—'}</td>
                    <td style="padding:6px 8px;" data-sort="${c.annee * 100 + c.mois}">${moisNom}</td>
                    <td style="padding:6px 8px;">${stL[c.statut] || c.statut}</td>
                    <td style="padding:6px 8px;" data-sort="${c.submitted_at || ''}">${fmt(c.submitted_at)}</td>
                    <td style="padding:6px 8px;" data-sort="${c.vise_n1_at || ''}">${c.vise_n1_nom ? fmt(c.vise_n1_at) + '<br><small>' + c.vise_n1_nom + '</small>' : '—'}</td>
                    <td style="padding:6px 8px;" data-sort="${c.vise_n2_at || ''}">${c.vise_n2_nom ? fmt(c.vise_n2_at) + '<br><small>' + c.vise_n2_nom + '</small>' : '—'}</td>
                    <td style="padding:6px 8px;" id="diffuse-cell-${c.id}" data-sort="${c.diffuse_at || ''}">${c.statut === 'vise_n2' ? `<button onclick="openDiffuserModal(${c.id})" style="font-size:11px;padding:3px 10px;background:#e65100;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">📤 A diffuser</button>` : fmt(c.diffuse_at) + `<br><button onclick="showDiffusionStatus(${c.id}, this)" style="font-size:10px;padding:2px 6px;background:#1a237e;color:white;border:none;border-radius:3px;cursor:pointer;margin-top:3px;">📧 Statut</button>`}</td>
                    <td style="padding:6px 8px;text-align:center;" data-sort="${c.nb_lignes || 0}" title="Lignes renseignées dans le CRA (astreintes, HNO, activités)">${c.nb_lignes || 0}</td>
                    <td style="padding:6px 8px;white-space:nowrap;">
                        <button onclick="openCraModal(${c.id})" style="font-size:11px;padding:3px 8px;background:#6a1b9a;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:4px;height:26px;box-sizing:border-box;">Voir</button>
                        ${!readOnly ? (isArchive ? `<button onclick="unarchiveCra(${c.id})" style="font-size:11px;padding:3px 8px;background:#ff9800;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:4px;">↩️ Désarchiver</button><button onclick="softDeleteCra(${c.id}, ${c.mois}, ${c.annee})" data-nom="${(c.expert_nom || '').replace(/"/g, '&quot;')}" style="font-size:11px;padding:3px 8px;background:#b71c1c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Supprimer</button>` : `<button onclick="confirmArchiveCra(${c.id},'${(c.expert_nom || '').replace(/'/g, "\\'")}')" style="font-size:11px;padding:3px 8px;background:#546e7a;color:white;border:none;border-radius:4px;cursor:pointer;height:26px;box-sizing:border-box;">🗄️ Archiver</button>`) : ''}
                    </td>
                </tr>`;
            })
            .join('');
    const cols = ['Expert', 'Période', 'Statut', 'Soumis le', 'Visé N1', 'Visé N2', 'Diffusé', 'Lignes'];
    const thsHtml =
        cols.map(label => `<th class="sortable" style="${thStyle}">${label}</th>`).join('') +
        `<th class="no-sort" style="${thNoSort}">Actions</th>`;
    container.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead><tr style="background:${hdrColor};color:white;">${thsHtml}</tr></thead>
                <tbody>${buildRows(data)}</tbody>
            </table>`;
    const table = container.querySelector('table');
    const tbody = table.querySelector('tbody');
    const ths = Array.from(table.querySelectorAll('thead th'));
    // Tri client-side
    const sortState = { col: -1, asc: true };
    ths.forEach((th, idx) => {
        if (!th.classList.contains('sortable')) return;
        th.addEventListener('click', () => {
            const asc = sortState.col === idx ? !sortState.asc : true;
            sortState.col = idx;
            sortState.asc = asc;
            ths.forEach(h => {
                h.classList.remove('asc', 'desc');
            });
            th.classList.add(asc ? 'asc' : 'desc');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.sort((a, b) => {
                const cellA = a.querySelectorAll('td')[idx];
                const cellB = b.querySelectorAll('td')[idx];
                const va = (cellA?.dataset.sort ?? cellA?.textContent ?? '').trim();
                const vb = (cellB?.dataset.sort ?? cellB?.textContent ?? '').trim();
                return asc
                    ? va.localeCompare(vb, 'fr', { numeric: true })
                    : vb.localeCompare(va, 'fr', { numeric: true });
            });
            rows.forEach(r => tbody.appendChild(r));
            Array.from(tbody.querySelectorAll('tr')).forEach((r, i) => {
                r.style.background = i % 2 ? (isArchive ? '#f5f7f7' : '#f9f4ff') : 'white';
            });
        });
    });
    // Redimensionnement des colonnes (partagé avec makeColResizable,
    // mais ths déjà positionnés — on attache juste les handles manuellement
    // pour éviter que makeColResizable écrase les largeurs déjà fixées)
    ths.slice(0, -1).forEach((th, idx) => {
        if (th.querySelector('.col-resize-handle')) return;
        const handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        handle.style.cssText =
            'position:absolute;right:0;top:0;width:6px;height:100%;cursor:col-resize;z-index:2;background:transparent;';
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startW = th.offsetWidth;
            const nextTh = ths[idx + 1];
            const startNextW = nextTh ? nextTh.offsetWidth : 0;
            const onMove = mv => {
                const delta = mv.clientX - startX;
                const newW = Math.max(40, startW + delta);
                const actualDelta = newW - startW;
                if (nextTh) {
                    const newNextW = startNextW - actualDelta;
                    if (newNextW < 40) return;
                    nextTh.style.width = newNextW + 'px';
                }
                th.style.width = newW + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        th.appendChild(handle);
    });
    // Menu clic droit masquer/afficher colonnes
    addColContextMenu(table);
}

async function loadCraSignaturesRh() {
    const expert = document.getElementById('craRhFilterExpert')?.value || '';
    const mois = document.getElementById('craRhFilterMois')?.value || '';
    const annee = document.getElementById('craRhFilterAnnee')?.value || '';
    const params = new URLSearchParams({ statut: 'diffuse' });
    if (expert) params.set('user_id', expert);
    if (mois) params.set('mois', mois);
    if (annee) params.set('annee', annee);
    try {
        const res = await fetch(`${API_URL}/cra/admin/list?${params}`, { credentials: 'include' });
        const data = await res.json();
        renderCraSignaturesTable(data, document.getElementById('craRhSignesTable'), false, true);
    } catch (e) {
        console.error('Erreur chargement CRA signés RH:', e);
    }
}

async function loadCraArchivesRh() {
    const expert = document.getElementById('craRhArchiveFilterExpert')?.value || '';
    const mois = document.getElementById('craRhArchiveFilterMois')?.value || '';
    const annee = document.getElementById('craRhArchiveFilterAnnee')?.value || '';
    const params = new URLSearchParams();
    if (expert) params.set('user_id', expert);
    if (mois) params.set('mois', mois);
    if (annee) params.set('annee', annee);
    try {
        const res = await fetch(`${API_URL}/cra/admin/archives?${params}`, { credentials: 'include' });
        const data = await res.json();
        renderCraSignaturesTable(data, document.getElementById('craRhArchivesTable'), true, true);
    } catch (e) {
        console.error('Erreur chargement archives CRA RH:', e);
    }
}

function toggleRhArchivesPanel() {
    const body = document.getElementById('craRhArchivesBody');
    const icon = document.getElementById('craRhArchivesIcon');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    icon.textContent = open ? '▼' : '▶';
    if (open && !document.getElementById('craRhArchivesTable').innerHTML) loadCraArchivesRh();
}

async function initCraLancer() {
    // Remplir la liste des experts (tous)
    const expertSel = document.getElementById('craLancerExpert');
    if (!expertSel) return;
    try {
        const r = await fetch(`${API_URL}/cra/all-experts-full`, { credentials: 'include' });
        const experts = await r.json();
        expertSel.innerHTML = '<option value="">— Choisir un expert —</option>';
        experts.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.user_id;
            opt.textContent = `${e.nom} ${e.prenom}`;
            expertSel.appendChild(opt);
        });
    } catch (e) {
        console.warn('Erreur chargement experts CRA lancer:', e);
    }

    // Remplir mois/année : 12 mois passés + mois courant
    const periodSel = document.getElementById('craLancerMoisAnnee');
    if (!periodSel) return;
    periodSel.innerHTML = '<option value="">— Choisir une période —</option>';
    const now = new Date();
    for (let i = 12; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = `${m}:${y}`;
        opt.textContent = label.charAt(0).toUpperCase() + label.slice(1);
        if (i === 0) opt.selected = true;
        periodSel.appendChild(opt);
    }
}

async function lancerCra() {
    const userId = document.getElementById('craLancerExpert')?.value;
    const period = document.getElementById('craLancerMoisAnnee')?.value;
    if (!userId || !period) {
        alert('Veuillez sélectionner un expert et une période.');
        return;
    }
    const [mois, annee] = period.split(':');
    const btn = document.querySelector('[onclick="lancerCra()"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Lancement...';
    }
    try {
        const r = await fetch(`${API_URL}/cra/launch`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: parseInt(userId), mois: parseInt(mois), annee: parseInt(annee) })
        });
        const data = await r.json();
        if (!r.ok) {
            alert(`⚠️ Impossible de lancer le CRA :\n${data.error}`);
        } else {
            document.getElementById('craLancerExpert').value = '';
            document.getElementById('craLancerMoisAnnee').value = '';
            await loadCraList();
        }
    } catch (e) {
        alert('Erreur réseau lors du lancement du CRA.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '▶ Lancer le CRA';
        }
    }
}

async function loadCraSignatures() {
    const expert = document.getElementById('craSignFilterExpert')?.value || '';
    const mois = document.getElementById('craSignFilterMois')?.value || '';
    const annee = document.getElementById('craSignFilterAnnee')?.value || '';
    // « CRA signés » = CRA diffusés uniquement : un CRA en cours de traitement ou en attente de diffusion n'y figure pas
    const params = new URLSearchParams({ statut: 'diffuse' });
    if (expert) params.set('user_id', expert);
    if (mois) params.set('mois', mois);
    if (annee) params.set('annee', annee);
    try {
        const res = await fetch(`${API_URL}/cra/admin/list?${params}`, { credentials: 'include' });
        const data = await res.json();
        renderCraSignaturesTable(data, document.getElementById('craSignaturesTable'));
    } catch (e) {
        console.error('Erreur chargement CRA signés:', e);
    }
    loadCraToDiffuse();
}

// CRA doublement visés en attente de diffusion : bloc en bas de page avec un bouton « CRA à diffuser » (ouvre la fenêtre de diffusion)
async function loadCraToDiffuse() {
    const box = document.getElementById('craToDiffuseBox');
    if (!box) return;
    try {
        const res = await fetch(`${API_URL}/cra/admin/list?statut=vise_n2`, { credentials: 'include' });
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) {
            box.style.display = 'none';
            return;
        }
        const fmt = dt => (dt ? new Date(dt).toLocaleDateString('fr-FR') : '—');
        document.getElementById('craToDiffuseCount').textContent = `(${data.length})`;
        document.getElementById('craToDiffuseList').innerHTML = data
            .map(c => {
                const moisNom = new Date(c.annee, c.mois - 1, 1).toLocaleDateString('fr-FR', {
                    month: 'long',
                    year: 'numeric'
                });
                return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 10px;background:#fff;border:1px solid #ffe0b2;border-radius:6px;margin-bottom:6px;font-size:13px;">
                        <b style="min-width:180px;">${c.expert_nom || '—'}</b>
                        <span style="min-width:120px;">${moisNom}</span>
                        <span style="color:#555;flex:1;">Visé N1 : ${c.vise_n1_nom || '—'} (${fmt(c.vise_n1_at)}) · Visé N2 : ${c.vise_n2_nom || '—'} (${fmt(c.vise_n2_at)})</span>
                        <button onclick="openCraModal(${c.id})" style="font-size:12px;padding:5px 12px;background:#6a1b9a;color:white;border:none;border-radius:4px;cursor:pointer;">Voir</button>
                        <button onclick="openDiffuserModal(${c.id})" style="font-size:13px;padding:6px 16px;background:#e65100;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">📤 CRA à diffuser</button>
                    </div>`;
            })
            .join('');
        box.style.display = 'block';
    } catch (e) {
        console.error('Erreur chargement CRA à diffuser:', e);
    }
}

async function loadCraArchives() {
    const expert = document.getElementById('craArchiveFilterExpert').value;
    const mois = document.getElementById('craArchiveFilterMois').value;
    const annee = document.getElementById('craArchiveFilterAnnee').value;
    const params = new URLSearchParams();
    if (expert) params.set('user_id', expert);
    if (mois) params.set('mois', mois);
    if (annee) params.set('annee', annee);
    try {
        const res = await fetch(`${API_URL}/cra/admin/archives?${params}`, { credentials: 'include' });
        const data = await res.json();
        renderCraSignaturesTable(data, document.getElementById('craArchivesTable'), true);
    } catch (e) {
        console.error('Erreur chargement archives CRA:', e);
    }
}

function confirmArchiveCra(craId, expertNom) {
    if (
        !confirm(
            `Archiver le CRA de ${expertNom} ?\n\nLe CRA sera déplacé dans la section "Archives CRA" et retiré de la vue principale.`
        )
    )
        return;
    fetch(`${API_URL}/cra/${craId}/archive`, { method: 'POST', credentials: 'include' })
        .then(r => r.json())
        .then(() => loadCraSignatures())
        .catch(e => alert('Erreur archivage : ' + e.message));
}

async function submitRienADeclarer() {
    const craId = window._currentCraId;
    if (!craId) return;
    if (!confirm("Confirmer que vous n'avez ni astreinte ni HNO à déclarer pour ce mois ?")) return;
    try {
        const r = await fetch(`${API_URL}/cra/${craId}/rien-a-declarer`, { method: 'POST', credentials: 'include' });
        if (!r.ok) {
            const d = await r.json();
            alert('Erreur : ' + (d.error || 'inconnue'));
            return;
        }
        loadCraList && loadCraList();
        closeCraDetail && closeCraDetail();
    } catch (e) {
        alert('Erreur réseau : ' + e.message);
    }
}

// ===== /ONGLET CRA =====

// Icônes identiques à celles de la barre d'onglets / des demandes
const AUTOMATION3_ICONS = {
    affectation:
        '<path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/>',
    demande: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    astreinte: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    evenement:
        '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'
};
function renderAutomation3Picker() {
    const sel = document.getElementById('automation3Notifications');
    const box = document.getElementById('automation3NotifList');
    if (!sel || !box) return;
    box.innerHTML = [...sel.options]
        .map(
            o => `
                <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid ${o.selected ? '#3949ab' : '#d5dae6'};background:${o.selected ? '#eef0fb' : '#fff'};border-radius:8px;cursor:pointer;font-size:13px;color:#2c3e50;transition:all .15s;">
                    <input type="checkbox" data-value="${o.value}" ${o.selected ? 'checked' : ''} style="width:16px;height:16px;margin:0;flex-shrink:0;">
                    <svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;flex-shrink:0;fill:none;stroke:${o.selected ? '#3949ab' : '#7a8799'};stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;">${AUTOMATION3_ICONS[o.value] || ''}</svg>
                    <span style="font-weight:${o.selected ? '600' : '400'};">${o.textContent}</span>
                </label>`
        )
        .join('');
    box.querySelectorAll('input[type="checkbox"]').forEach(
        cb =>
            (cb.onchange = () => {
                const opt = [...sel.options].find(o => o.value === cb.dataset.value);
                if (opt) opt.selected = cb.checked;
                renderAutomation3Picker();
                saveAutomation3Config();
            })
    );
}
document.addEventListener('DOMContentLoaded', renderAutomation3Picker);

async function loadAutomation3Config() {
    try {
        const response = await fetch(`${API_URL}/automation/config/3`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.config) {
                document.getElementById('automation3Enabled').checked = data.config.enabled || false;
                document.getElementById('automation3TeamsEmail').value =
                    data.config.teamsEmail || '0a7041bd.esante.gouv.fr@fr.teams.ms';

                // Sélectionner les types de notifications
                const select = document.getElementById('automation3Notifications');
                const notifications = data.config.notifications || [];
                Array.from(select.options).forEach(option => {
                    option.selected = notifications.includes(option.value);
                });
                renderAutomation3Picker();

                // Afficher/masquer la config
                document.getElementById('automation3Config').style.display = data.config.enabled ? 'block' : 'none';
            }
        }
    } catch (error) {
        console.error('Erreur chargement config automation 3:', error);
    }
}

// Sauvegarder la configuration de l'automatisation n°3
async function saveAutomation3Config() {
    const select = document.getElementById('automation3Notifications');
    const notifications = Array.from(select.selectedOptions).map(opt => opt.value);

    const config = {
        enabled: document.getElementById('automation3Enabled').checked,
        teamsEmail: document.getElementById('automation3TeamsEmail').value,
        notifications: notifications
    };

    try {
        const response = await fetch(`${API_URL}/automation/config/3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ config })
        });

        if (response.ok) {
            console.log('✅ Configuration automatisation 3 sauvegardée');
        }
    } catch (error) {
        console.error('Erreur sauvegarde config automation 3:', error);
    }
}

// Tester l'envoi de notification Teams
async function testTeamsNotification() {
    const resultDiv = document.getElementById('automation3TestResult');
    const teamsEmail = document.getElementById('automation3TeamsEmail').value;

    if (!teamsEmail) {
        resultDiv.innerHTML =
            '<span style="color: #e74c3c;">❌ Veuillez renseigner l\'adresse email du canal Teams</span>';
        return;
    }

    resultDiv.innerHTML = '<span style="color: #2196f3;">📤 Envoi du message de test...</span>';

    try {
        const response = await fetch(`${API_URL}/teams/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ teamsEmail })
        });

        if (response.ok) {
            resultDiv.innerHTML =
                '<span style="color: #4CAF50;">✅ Message de test envoyé avec succès ! Vérifiez votre canal Teams.</span>';
        } else {
            const err = await response.json();
            resultDiv.innerHTML = `<span style="color: #e74c3c;">❌ Erreur: ${err.error || 'Erreur inconnue'}</span>`;
        }
    } catch (error) {
        console.error('Erreur test Teams:', error);
        resultDiv.innerHTML = `<span style="color: #e74c3c;">❌ Erreur: ${error.message}</span>`;
    }
}

// Ouvrir la modal d'historique des envois Teams
function openAutomation3Logs() {
    currentAutomationLogsId = 3;
    const modal = document.getElementById('automationLogsModal');
    const content = document.getElementById('automationLogsContent');

    modal.querySelector('h2').textContent = '📋 Historique des notifications Teams';
    content.innerHTML = '<p style="text-align: center; color: #666;">Chargement...</p>';
    modal.style.display = 'block';

    fetch(`${API_URL}/automation/logs/3`, { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.logs && data.logs.length > 0) {
                let html = `
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background-color: #ff9800; color: white;">
                                        <th style="padding: 10px; text-align: left;">Date d'envoi</th>
                                        <th style="padding: 10px; text-align: left;">Type</th>
                                        <th style="padding: 10px; text-align: left;">Détails</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                data.logs.forEach(log => {
                    const date = new Date(log.sent_at);
                    const formattedDate = date.toLocaleString('fr-FR');

                    // Déterminer le type
                    let typeLabel = log.target_month || 'Notification';
                    const typeIcons = {
                        affectation: '📅 Affectation',
                        demande: '✉️ Demande',
                        astreinte: '🔔 Astreinte/HNO',
                        evenement: '📆 Événement'
                    };
                    if (typeIcons[typeLabel]) typeLabel = typeIcons[typeLabel];

                    // Détails
                    let details = log.expert_name || '-';
                    if (log.expert_email) details += ` (${log.expert_email})`;

                    html += `
                                <tr style="border-bottom: 1px solid #ddd;">
                                    <td style="padding: 10px;">${formattedDate}</td>
                                    <td style="padding: 10px;">${typeLabel}</td>
                                    <td style="padding: 10px;">${details}</td>
                                </tr>
                            `;
                });

                html += '</tbody></table>';
                content.innerHTML = html;
            } else {
                content.innerHTML =
                    '<p style="text-align: center; color: #666;">Aucune notification Teams enregistrée</p>';
            }
        })
        .catch(error => {
            console.error('Erreur chargement logs Teams:', error);
            content.innerHTML = '<p style="color: #e74c3c;">Erreur lors du chargement</p>';
        });
}

// Envoyer une notification Teams (appelée depuis d'autres parties du code)
async function sendTeamsNotification(type, data) {
    try {
        // Vérifier si l'automatisation est activée
        const configResponse = await fetch(`${API_URL}/automation/config/3`, { credentials: 'include' });
        if (!configResponse.ok) return;

        const configData = await configResponse.json();
        if (!configData.config || !configData.config.enabled) return;
        if (!configData.config.notifications || !configData.config.notifications.includes(type)) return;

        // Envoyer la notification
        await fetch(`${API_URL}/teams/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ type, data })
        });
    } catch (error) {
        console.error('Erreur envoi notification Teams:', error);
    }
}

// ========== FIN GESTION DES AUTOMATISATIONS ==========
