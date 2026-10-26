// Validation de la syntaxe des adresses e-mail (même règle que src/lib/email.js côté serveur)
(function () {
    const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
    const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

    function isEmail(value) {
        if (typeof value !== 'string') return false;
        const s = value.trim();
        if (!s || s.length > 254) return false;
        const at = s.lastIndexOf('@');
        if (at < 1 || s.indexOf('@') !== at) return false;
        const local = s.slice(0, at);
        const labels = s.slice(at + 1).split('.');
        if (local.length > 64 || !LOCAL.test(local)) return false;
        if (labels.length < 2 || !labels.every(l => LABEL.test(l))) return false;
        return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
    }

    // Une adresse par ligne : renvoie les adresses valides (sans doublon) et les lignes invalides
    function parseEmailLines(text) {
        const valid = [];
        const invalid = [];
        String(text == null ? '' : text)
            .split(/\r?\n/)
            .forEach(raw => {
                const line = raw.trim();
                if (!line) return;
                if (!isEmail(line)) invalid.push(line);
                else if (!valid.some(v => v.toLowerCase() === line.toLowerCase())) valid.push(line);
            });
        return { valid, invalid };
    }

    // Contrôle en direct d'une zone « une adresse par ligne » : bordure rouge et message sous le champ
    function bindEmailListField(textarea) {
        if (!textarea || textarea.dataset.emailBound) return;
        textarea.dataset.emailBound = '1';
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:11px;color:#c62828;margin-top:4px;display:none;';
        textarea.insertAdjacentElement('afterend', msg);
        const check = () => {
            const { invalid } = parseEmailLines(textarea.value);
            textarea.style.borderColor = invalid.length ? '#c62828' : '';
            msg.style.display = invalid.length ? 'block' : 'none';
            msg.textContent = invalid.length ? `Adresse(s) e-mail invalide(s) : ${invalid.join(' · ')}` : '';
            return !invalid.length;
        };
        textarea.addEventListener('input', check);
        textarea.addEventListener('blur', check);
        textarea.checkEmails = check;
    }

    window.isEmail = isEmail;
    window.parseEmailLines = parseEmailLines;
    window.bindEmailListField = bindEmailListField;
})();
