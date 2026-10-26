// Application principale : astreintes HO (heures ouvrées)
// Planning mensuel du lundi au vendredi, chaque jour divisé en matin et après-midi ; plusieurs experts par demi-journée.
// Les modifications sont préparées à l'écran puis enregistrées avec le bouton « Enregistrer » (fenêtre de confirmation).

const HO = {
    month: null, // « AAAA-MM »
    data: null, // réponse de GET /api/astreintes-ho
    pending: new Map(), // « date|période|ressource » -> 'add' | 'remove' (modification non enregistrée)
    popover: null,
    saving: false
};

const HO_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
const HO_DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
const HO_PERIODS = [
    ['AM', 'Matin'],
    ['PM', 'Après-midi']
];
const HO_MONTHS = [
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

const hoEsc = v =>
    String(v == null ? '' : v).replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const hoKey = (date, period, rid) => `${date}|${period}|${rid}`;
const hoFr = date => date.split('-').reverse().join('/');
const hoMondayOf = date => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay() || 7));
    return d.toISOString().slice(0, 10);
};
const hoIsoWeek = date => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};

function hoToast(message, error = false) {
    const el = document.createElement('div');
    el.className = `ho-toast${error ? ' err' : ''}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), error ? 7000 : 5000);
}

// ---- Ouverture de l'onglet et rubriques ----
function astreintesTabOpen() {
    const isAdmin = currentUser && currentUser.activeProfile === 'admin';
    // La rubrique HNO (génération du planning, volontaires) est réservée aux administrateurs
    document.getElementById('astreinteSubTabHno').style.display = isAdmin ? 'inline-block' : 'none';
    if (!isAdmin) astreinteSwitchRubrique('ho');
    else if (document.getElementById('astreintesHnoPanel').style.display !== 'none') initAstreintesTab();
    if (!HO.month) HO.month = hoCurrentMonth();
    hoLoad();
}

function astreinteSwitchRubrique(which) {
    const ho = which === 'ho';
    document.getElementById('astreintesHoPanel').style.display = ho ? 'block' : 'none';
    document.getElementById('astreintesHnoPanel').style.display = ho ? 'none' : 'block';
    document.getElementById('astreinteSubTabHo').classList.toggle('active', ho);
    document.getElementById('astreinteSubTabHno').classList.toggle('active', !ho);
    hoClosePopover();
    if (!ho) initAstreintesTab();
}

const hoCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ---- Chargement ----
async function hoLoad() {
    const grid = document.getElementById('hoGrid');
    try {
        const r = await fetch(`${API_URL}/astreintes-ho?month=${HO.month}`, { credentials: 'include' });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur serveur');
        HO.data = data;
        hoRender();
    } catch (e) {
        grid.innerHTML = `<p style="color:#b71c1c;">Planning indisponible : ${hoEsc(e.message)}</p>`;
    }
}

function hoNavigate(delta) {
    if (
        HO.pending.size &&
        !confirm('Des modifications ne sont pas enregistrées. Changer de mois les annule. Continuer ?')
    )
        return;
    HO.pending.clear();
    const [y, m] = HO.month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    HO.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    hoLoad();
}

function hoGoToday() {
    if (HO.month === hoCurrentMonth()) return;
    if (
        HO.pending.size &&
        !confirm('Des modifications ne sont pas enregistrées. Changer de mois les annule. Continuer ?')
    )
        return;
    HO.pending.clear();
    HO.month = hoCurrentMonth();
    hoLoad();
}

// ---- État effectif (serveur + modifications en attente) ----
function hoExpertName(rid) {
    const d = HO.data;
    const e = (d.experts || []).find(x => x.resource_id === rid) || (d.names || []).find(x => x.id === rid);
    return e
        ? { prenom: e.prenom, nom: e.nom, trigramme: e.trigramme }
        : { prenom: '?', nom: `#${rid}`, trigramme: '?' };
}

function hoServerHas(date, period, rid) {
    return HO.data.slots.some(s => s.date === date && s.period === period && s.resource_id === rid);
}

/** Experts inscrits sur la demi-journée, avec leur état (enregistré / à ajouter / à retirer) */
function hoCell(date, period) {
    const items = [];
    for (const s of HO.data.slots) {
        if (s.date !== date || s.period !== period) continue;
        items.push({
            rid: s.resource_id,
            state: HO.pending.get(hoKey(date, period, s.resource_id)) === 'remove' ? 'del' : 'saved'
        });
    }
    for (const [k, action] of HO.pending) {
        const [d, p, rid] = k.split('|');
        if (d === date && p === period && action === 'add') items.push({ rid: Number(rid), state: 'add' });
    }
    return items;
}

function hoCanEdit(date, rid) {
    const me = HO.data.me;
    if (!me.canEdit) return false;
    if (me.isAdmin) return true;
    return rid === me.resourceId && hoMondayOf(date) >= me.currentWeek;
}

// ---- Affichage ----
function hoRender() {
    const d = HO.data;
    const [y, m] = HO.month.split('-').map(Number);
    document.getElementById('hoMonthLabel').textContent = `${HO_MONTHS[m - 1]} ${y}`;
    const me = d.me;

    document.getElementById('hoRights').innerHTML = me.isAdmin
        ? '🛡️ <strong>Administrateur</strong> : cliquez sur une demi-journée pour inscrire ou retirer des experts. Toutes les semaines sont modifiables, y compris les semaines passées.'
        : me.canEdit
          ? "✋ <strong>Expert HO</strong> : cliquez sur une demi-journée pour vous inscrire ou vous retirer. Vous ne pouvez modifier que vos propres inscriptions, jusqu'à la semaine en cours."
          : '👁️ <strong>Consultation seule</strong> : seuls les experts déclarés pour les astreintes HO et les administrateurs peuvent modifier ce planning.';

    document.getElementById('hoLegend').innerHTML = [
        ['ho-empty', 'Demi-journée vide (à pourvoir)'],
        ['ho-one', '1 expert'],
        ['ho-multi', '2 experts ou plus'],
        ['ho-pending', 'Modification non enregistrée'],
        ['ho-one ho-past', 'Semaine passée'],
        ['ho-legend-current', 'Semaine en cours']
    ]
        .map(
            ([cls, label]) =>
                `<span style="display:inline-flex;align-items:center;gap:6px;">${cls === 'ho-legend-current' ? `<span class="${cls}"></span>` : `<span class="ho-half ${cls}" style="min-height:0;width:22px;height:16px;padding:0;margin:0;display:inline-block;"></span>`}${label}</span>`
        )
        .join('');

    const today = me.today;
    let html = '<table class="ho-grid"><thead><tr><th class="ho-week">Sem.</th>';
    html += HO_DAYS.map(n => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
    for (const w of d.weeks) {
        const past = w.monday < me.currentWeek;
        const current = w.monday === me.currentWeek;
        html += `<tr${current ? ' class="ho-current-week"' : ''}><th class="ho-week${current ? ' ho-week-current' : ''}" title="Semaine ${hoIsoWeek(w.monday)}${current ? ' (semaine en cours)' : ''}">S${hoIsoWeek(w.monday)}${current ? '<small>en cours</small>' : ''}</th>`;
        for (const date of w.days) {
            const inMonth = date.slice(0, 7) === HO.month;
            html += `<td class="ho-day"><div class="ho-dayhead" style="text-align:center;font-size:11px;font-weight:700;margin-bottom:3px;${date === today ? 'color:#1d70b7;' : 'color:#546e7a;'}">${hoFr(date).slice(0, 5)}${date === today ? ' • aujourd’hui' : ''}</div>`;
            for (const [period, label] of HO_PERIODS) {
                const items = hoCell(date, period);
                const present = items.filter(i => i.state !== 'del');
                const cls = [
                    'ho-half',
                    present.length === 0 ? 'ho-empty' : present.length === 1 ? 'ho-one' : 'ho-multi'
                ];
                if (past) cls.push('ho-past');
                if (!inMonth) cls.push('ho-out');
                if (items.some(i => i.state !== 'saved')) cls.push('ho-pending');
                const editable = me.canEdit && (me.isAdmin || hoMondayOf(date) >= me.currentWeek);
                if (editable) cls.push('ho-editable');
                const chips = items
                    .map(i => {
                        const n = hoExpertName(i.rid);
                        const c = ['ho-chip'];
                        if (i.rid === me.resourceId) c.push('ho-me');
                        if (i.state === 'add') c.push('ho-add');
                        if (i.state === 'del') c.push('ho-del');
                        return `<span class="${c.join(' ')}" title="${hoEsc(`${n.prenom} ${n.nom}`)}">${hoEsc(n.trigramme)}</span>`;
                    })
                    .join('');
                const title = `${HO_DAY_NAMES[w.days.indexOf(date)]} ${hoFr(date)} — ${label.toLowerCase()}${
                    present.length
                        ? ' : ' +
                          present
                              .map(i => {
                                  const n = hoExpertName(i.rid);
                                  return `${n.prenom} ${n.nom}`;
                              })
                              .join(', ')
                        : ' : personne'
                }`;
                html += `<div class="${cls.join(' ')}" ${editable ? `onclick="hoCellClick(event, '${date}', '${period}')"` : ''} title="${hoEsc(title)}"><span class="ho-pl">${period === 'AM' ? 'AM' : 'PM'}</span>${chips || 'vide'}</div>`;
            }
            html += '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('hoGrid').innerHTML = html;

    const n = HO.pending.size;
    document.getElementById('hoSaveBtn').style.display = n ? 'inline-block' : 'none';
    document.getElementById('hoCancelBtn').style.display = n ? 'inline-block' : 'none';
    document.getElementById('hoPendingCount').textContent = n ? `(${n})` : '';
}

// ---- Modifications ----
function hoToggle(date, period, rid) {
    if (!hoCanEdit(date, rid)) {
        hoToast(
            HO.data.me.isAdmin || rid === HO.data.me.resourceId
                ? 'Les semaines passées ne sont plus modifiables.'
                : 'Vous ne pouvez modifier que vos propres inscriptions.',
            true
        );
        return;
    }
    const key = hoKey(date, period, rid);
    const saved = hoServerHas(date, period, rid);
    const pending = HO.pending.get(key);
    if (pending)
        HO.pending.delete(key); // retour à l'état enregistré
    else HO.pending.set(key, saved ? 'remove' : 'add');
}

function hoCellClick(event, date, period) {
    event.stopPropagation();
    const me = HO.data.me;
    if (!me.canEdit) return;
    if (!me.isAdmin) {
        hoToggle(date, period, me.resourceId);
        hoRender();
        return;
    }
    hoOpenPopover(event.currentTarget, date, period);
}

/** Administrateur : choix des experts inscrits sur la demi-journée */
function hoOpenPopover(anchor, date, period) {
    hoClosePopover();
    const experts = HO.data.experts;
    const pop = document.createElement('div');
    pop.className = 'ho-popover';
    pop.addEventListener('click', e => e.stopPropagation());
    const here = new Set(
        hoCell(date, period)
            .filter(i => i.state !== 'del')
            .map(i => i.rid)
    );
    pop.innerHTML =
        `<div style="font-weight:700;margin-bottom:6px;">${HO_DAY_NAMES[HO.data.weeks.flatMap(w => w.days).indexOf(date) % 5]} ${hoFr(date)} — ${period === 'AM' ? 'matin' : 'après-midi'}</div>` +
        (experts.length
            ? experts
                  .map(
                      e =>
                          `<label class="ho-check"><input type="checkbox" data-rid="${e.resource_id}" ${here.has(e.resource_id) ? 'checked' : ''}><span>${hoEsc(e.prenom)} ${hoEsc(e.nom.toUpperCase())}</span><span class="ho-tri">${hoEsc(e.trigramme)}</span></label>`
                  )
                  .join('')
            : '<p style="color:#b26a00;font-size:12px;margin:4px 0;">Aucun expert déclaré pour les astreintes HO (onglet Ressources).</p>');
    pop.addEventListener('change', e => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) || !input.dataset.rid) return;
        const rid = Number(input.dataset.rid);
        const wantPresent = input.checked;
        const isPresent = hoCell(date, period).some(i => i.rid === rid && i.state !== 'del');
        if (wantPresent !== isPresent) hoToggle(date, period, rid);
        hoRender();
        // le rendu remplace la grille : on garde la fenêtre ouverte sur la même cellule
        const cell = [...document.querySelectorAll('#hoGrid .ho-editable')].find(
            c => c.getAttribute('onclick') === `hoCellClick(event, '${date}', '${period}')`
        );
        if (cell) hoPlacePopover(pop, cell);
    });
    document.body.appendChild(pop);
    hoPlacePopover(pop, anchor);
    HO.popover = pop;
    setTimeout(() => document.addEventListener('click', hoClosePopover, { once: true }), 0);
}

function hoPlacePopover(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${window.scrollY + r.bottom + 4}px`;
    pop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 240))}px`;
}

function hoClosePopover() {
    if (HO.popover) HO.popover.remove();
    HO.popover = null;
}

function hoCancelPending() {
    HO.pending.clear();
    hoClosePopover();
    hoRender();
}

// ---- Enregistrement ----
function hoPendingChanges() {
    return [...HO.pending].map(([k, action]) => {
        const [date, period, rid] = k.split('|');
        return { date, period, resource_id: Number(rid), action };
    });
}

function hoOpenSaveDialog() {
    const changes = hoPendingChanges().sort(
        (a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period) || a.resource_id - b.resource_id
    );
    if (!changes.length) return;
    const me = HO.data.me;
    const touchesCurrent = changes.some(c => hoMondayOf(c.date) === me.currentWeek);
    const mail = HO.data.updateMail || { enabled: false, recipients: 0 };
    const dayName = date => HO_DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
    const rows = changes
        .map(c => {
            const n = hoExpertName(c.resource_id);
            const add = c.action === 'add';
            return `<tr><td style="padding:4px 8px;">${dayName(c.date)} ${hoFr(c.date)}</td><td style="padding:4px 8px;">${c.period === 'AM' ? 'matin' : 'après-midi'}</td><td style="padding:4px 8px;">${hoEsc(n.prenom)} ${hoEsc(n.nom.toUpperCase())}</td><td style="padding:4px 8px;font-weight:700;color:${add ? '#1b5e20' : '#b71c1c'};">${add ? '➕ ajout' : '➖ retrait'}</td></tr>`;
        })
        .join('');
    let banner = '';
    if (touchesCurrent) {
        banner = mail.enabled
            ? `<div style="background:#fff3e0;border-left:4px solid #ef6c00;padding:10px 12px;border-radius:4px;margin-bottom:12px;font-size:13px;">📧 <strong>La semaine en cours est modifiée</strong> : un e-mail de mise à jour (« MAJ ») sera envoyé ${mail.recipients ? `à <strong>${mail.recipients} destinataire${mail.recipients > 1 ? 's' : ''}</strong>` : 'aux destinataires de l’automatisation n°6 (aucun destinataire configuré pour l’instant)'}.</div>`
            : '<div style="background:#eceff1;border-left:4px solid #78909c;padding:10px 12px;border-radius:4px;margin-bottom:12px;font-size:13px;">La semaine en cours est modifiée. Aucun e-mail de mise à jour ne sera envoyé : l’automatisation n°6 (communication du planning) est désactivée.</div>';
    }
    document.getElementById('hoSaveBody').innerHTML =
        `${banner}<p style="margin:0 0 8px;font-size:13px;"><strong>${changes.length}</strong> modification${changes.length > 1 ? 's' : ''} à enregistrer :</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#607d8b;font-size:11px;"><th style="padding:4px 8px;">Jour</th><th style="padding:4px 8px;">Demi-journée</th><th style="padding:4px 8px;">Expert</th><th style="padding:4px 8px;">Modification</th></tr></thead><tbody>${rows}</tbody></table>
        <div id="hoSaveError" style="color:#b71c1c;font-size:13px;margin-top:10px;"></div>`;
    document.getElementById('hoConfirmBtn').disabled = false;
    document.getElementById('hoSaveModal').classList.add('active');
}

function hoCloseSaveDialog() {
    document.getElementById('hoSaveModal').classList.remove('active');
}

async function hoConfirmSave() {
    if (HO.saving) return;
    HO.saving = true;
    const btn = document.getElementById('hoConfirmBtn');
    btn.disabled = true;
    try {
        const r = await fetch(`${API_URL}/astreintes-ho/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ changes: hoPendingChanges() })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur serveur');
        HO.pending.clear();
        hoCloseSaveDialog();
        let msg = `Planning HO enregistré (${data.applied.length} modification${data.applied.length > 1 ? 's' : ''}).`;
        if (data.mail && data.mail.sent)
            msg += ` E-mail de mise à jour envoyé à ${data.mail.recipients} destinataire${data.mail.recipients > 1 ? 's' : ''}.`;
        hoToast(msg);
        await hoLoad();
    } catch (e) {
        document.getElementById('hoSaveError').textContent = e.message;
        btn.disabled = false;
    } finally {
        HO.saving = false;
    }
}

window.addEventListener('beforeunload', e => {
    if (HO.pending.size) {
        e.preventDefault();
        e.returnValue = '';
    }
});
