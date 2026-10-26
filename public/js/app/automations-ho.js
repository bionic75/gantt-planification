// Application principale : automatisations n°5 (construction du planning d'astreinte HO S+1) et n°6 (communication)
// Configuration enregistrée par /api/automation/config/5 et /6 ; envoi immédiat par /api/astreintes-ho/automation/:n/send

const AUTO_HO_DAYS = [
    [1, 'lundi'],
    [2, 'mardi'],
    [3, 'mercredi'],
    [4, 'jeudi'],
    [5, 'vendredi'],
    [6, 'samedi'],
    [0, 'dimanche']
];

const autoHoEl = id => document.getElementById(id);
const autoHoEsc = v =>
    String(v == null ? '' : v).replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

async function autoHoJson(path, opts) {
    const r = await fetch(`${API_URL}${path}`, { credentials: 'include', ...(opts || {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
    return data;
}

async function loadAutomationHoConfigs() {
    try {
        const [info, c5, c6, users] = await Promise.all([
            autoHoJson('/astreintes-ho/info'),
            autoHoJson('/automation/config/5'),
            autoHoJson('/automation/config/6'),
            autoHoJson('/users')
        ]);
        const cfg5 = c5.config || {};
        const cfg6 = c6.config || {};
        const hourOptions = Array.from(
            { length: 24 },
            (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`
        ).join('');
        autoHoEl('automation5Hour').innerHTML = hourOptions;
        autoHoEl('automation6Hour').innerHTML = hourOptions;
        autoHoEl('automation5WeekDay').innerHTML = AUTO_HO_DAYS.map(
            ([v, l]) => `<option value="${v}">${l}</option>`
        ).join('');
        autoHoEl('automation6WeekDays').innerHTML = AUTO_HO_DAYS.map(
            ([v, l]) =>
                `<label style="cursor:pointer;"><input type="checkbox" class="automation6Day" value="${v}" onchange="saveAutomationHo(6)"> ${l}</label>`
        ).join('');

        // n°5 : experts HO ayant un compte
        const experts = (info.experts || []).filter(e => e.user_id);
        autoHoEl('automation5Recipients').innerHTML = experts
            .map(
                e =>
                    `<option value="${e.user_id}">${autoHoEsc(e.prenom)} ${autoHoEsc(e.nom)}${e.email ? '' : ' (sans e-mail)'}</option>`
            )
            .join('');
        // n°6 : tous les utilisateurs actifs
        const list = (users.users || users || []).filter(u => u.actif !== 0);
        autoHoEl('automation6Recipients').innerHTML = list
            .map(u => `<option value="${u.id}">${autoHoEsc(u.prenom)} ${autoHoEsc(u.nom)}</option>`)
            .join('');

        const fields = (info.fields || []).map(f => `<code>${autoHoEsc(f[0])}</code> ${autoHoEsc(f[1])}`).join(' · ');
        autoHoEl('automation5Fields').innerHTML = `Champs disponibles : ${fields}`;
        autoHoEl('automation6Fields').innerHTML = `Champs disponibles : ${fields}`;

        // n°5
        autoHoEl('automation5Enabled').checked = !!cfg5.enabled;
        autoHoEl('automation5WeekDay').value = cfg5.weekDay != null ? cfg5.weekDay : 4;
        autoHoEl('automation5Hour').value = cfg5.hour != null ? cfg5.hour : 9;
        autoHoEl('automation5AllExperts').checked = cfg5.allExperts !== false;
        autoHoSelect('automation5Recipients', cfg5.recipients);
        autoHoEl('automation5Subject').value = cfg5.subject || info.templates[5].subject;
        autoHoEl('automation5Body').value = cfg5.body || info.templates[5].body;
        // n°6
        autoHoEl('automation6Enabled').checked = !!cfg6.enabled;
        const days = Array.isArray(cfg6.weekDays) ? cfg6.weekDays.map(Number) : [1];
        document.querySelectorAll('.automation6Day').forEach(cb => (cb.checked = days.includes(Number(cb.value))));
        autoHoEl('automation6Hour').value = cfg6.hour != null ? cfg6.hour : 8;
        autoHoEl('automation6Week').value = cfg6.week === 'next' ? 'next' : 'current';
        autoHoEl('automation6GroupAdmin').checked = !!cfg6.groupAdmin;
        autoHoEl('automation6GroupUser').checked = !!cfg6.groupUser;
        autoHoEl('automation6GroupExpert').checked = !!cfg6.groupExpert;
        autoHoSelect('automation6Recipients', cfg6.recipients);
        autoHoEl('automation6Subject').value = cfg6.subject || info.templates[6].subject;
        autoHoEl('automation6Body').value = cfg6.body || info.templates[6].body;
    } catch (e) {
        console.error('Erreur chargement des automatisations HO :', e);
    }
}

function autoHoSelect(id, values) {
    const wanted = new Set((values || []).map(String));
    [...autoHoEl(id).options].forEach(o => (o.selected = wanted.has(o.value)));
}

const autoHoSelected = id => [...autoHoEl(id).selectedOptions].map(o => Number(o.value));

function autoHoConfig(n) {
    const base = {
        enabled: autoHoEl(`automation${n}Enabled`).checked,
        hour: parseInt(autoHoEl(`automation${n}Hour`).value),
        subject: autoHoEl(`automation${n}Subject`).value.trim(),
        body: autoHoEl(`automation${n}Body`).value
    };
    if (n === 5) {
        return {
            ...base,
            weekDay: parseInt(autoHoEl('automation5WeekDay').value),
            allExperts: autoHoEl('automation5AllExperts').checked,
            recipients: autoHoSelected('automation5Recipients')
        };
    }
    return {
        ...base,
        weekDays: [...document.querySelectorAll('.automation6Day:checked')].map(cb => Number(cb.value)),
        week: autoHoEl('automation6Week').value,
        groupAdmin: autoHoEl('automation6GroupAdmin').checked,
        groupUser: autoHoEl('automation6GroupUser').checked,
        groupExpert: autoHoEl('automation6GroupExpert').checked,
        recipients: autoHoSelected('automation6Recipients')
    };
}

async function saveAutomationHo(n) {
    const msg = autoHoEl(`automation${n}Msg`);
    try {
        await autoHoJson(`/automation/config/${n}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: autoHoConfig(n) })
        });
        msg.style.color = '#2e7d32';
        msg.textContent = '✔ Configuration enregistrée';
    } catch (e) {
        msg.style.color = '#c62828';
        msg.textContent = `Erreur : ${e.message}`;
    }
}

async function testAutomationHo(n) {
    const msg = autoHoEl(`automation${n}Msg`);
    msg.style.color = '#555';
    msg.textContent = 'Envoi en cours…';
    try {
        await saveAutomationHo(n);
        const r = await autoHoJson(`/astreintes-ho/automation/${n}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        msg.style.color = r.sent ? '#2e7d32' : '#b26a00';
        msg.textContent = r.sent
            ? `✔ Mail envoyé à ${r.recipients} destinataire(s) — ${r.week}`
            : `Aucun envoi : ${r.reason}`;
    } catch (e) {
        msg.style.color = '#c62828';
        msg.textContent = `Erreur : ${e.message}`;
    }
}
