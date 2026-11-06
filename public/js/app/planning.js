// Application principale : planning
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

// Grille de la planification : îlot Vue (frontend/src/ilots/planification). Rafraîchissement demandé par l'ancien
// code (photo de profil, menu contextuel des astreintes, retour à la planification, réveil)
function updateGantt() {
    window.dispatchEvent(new CustomEvent('gp:grille-a-rafraichir'));
}

// Feuille de style dédiée aux colonnes masquées
(function () {
    const s = document.createElement('style');
    s.id = 'col-hide-styles';
    document.head.appendChild(s);
})();

let _colTblSeq = 0;
function addColContextMenu(table) {
    if (table._colCtxMenu) return;
    table._colCtxMenu = true;
    if (!table.dataset.coltblId) table.dataset.coltblId = 'coltbl-' + ++_colTblSeq;
    const tblId = table.dataset.coltblId;
    const styleSheet = document.getElementById('col-hide-styles').sheet;
    const lsKey = 'col-hide:' + tblId;
    const saved = JSON.parse(localStorage.getItem(lsKey) || '[]');
    const hiddenCols = new Set(saved); // 1-based nth-child indices

    const saveState = () => localStorage.setItem(lsKey, JSON.stringify([...hiddenCols]));

    const applyHideRules = () => {
        // Supprimer toutes les règles de ce tableau
        for (let i = styleSheet.cssRules.length - 1; i >= 0; i--) {
            if (styleSheet.cssRules[i].selectorText?.includes(tblId)) styleSheet.deleteRule(i);
        }
        hiddenCols.forEach(nth => {
            styleSheet.insertRule(
                `[data-coltbl-id="${tblId}"] td:nth-child(${nth}),` +
                    `[data-coltbl-id="${tblId}"] th:nth-child(${nth}) { display:none !important; }`,
                styleSheet.cssRules.length
            );
        });
    };

    const removeMenu = () => document.querySelector('.col-ctx-menu')?.remove();

    const ths = Array.from(table.querySelectorAll('thead tr:first-child th'));
    ths.forEach((th, idx) => {
        const nth = idx + 1; // nth-child est 1-based
        th.addEventListener('contextmenu', e => {
            e.preventDefault();
            removeMenu();
            const menu = document.createElement('div');
            menu.className = 'col-ctx-menu';
            menu.style.cssText =
                'position:fixed;z-index:10000;background:white;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.2);padding:4px 0;min-width:220px;font-size:13px;';
            // Positionner sans déborder
            const mw = 220,
                mh = 200;
            menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 8) + 'px';
            menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 8) + 'px';

            const item = (text, color, fn) => {
                const d = document.createElement('div');
                d.textContent = text;
                d.style.cssText = `padding:8px 14px;cursor:pointer;color:${color || '#222'};`;
                d.onmouseenter = () => (d.style.background = '#f0f4ff');
                d.onmouseleave = () => (d.style.background = '');
                d.onclick = fn;
                return d;
            };
            const sep = () => {
                const d = document.createElement('div');
                d.style.cssText = 'border-top:1px solid #eee;margin:3px 0;';
                return d;
            };

            const label = (
                th.querySelector('.cra-th-label')?.textContent ||
                th.textContent
                    .replace(/[▲▼↑↓]/g, '')
                    .replace('col-resize-handle', '')
                    .trim()
            )
                .split('\n')[0]
                .trim();

            // Masquer la colonne courante (sauf si déjà masquée)
            if (!hiddenCols.has(nth)) {
                menu.appendChild(
                    item(`👁 Masquer "${label}"`, '#c62828', () => {
                        hiddenCols.add(nth);
                        applyHideRules();
                        saveState();
                        removeMenu();
                    })
                );
            }

            // Colonnes masquées à réafficher
            if (hiddenCols.size > 0) {
                menu.appendChild(sep());
                const hdr = document.createElement('div');
                hdr.textContent = 'Colonnes masquées :';
                hdr.style.cssText =
                    'padding:3px 14px;font-size:11px;color:#888;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;';
                menu.appendChild(hdr);
                hiddenCols.forEach(hNth => {
                    const hTh = ths[hNth - 1];
                    const hLabel = (
                        hTh.querySelector('.cra-th-label')?.textContent || hTh.textContent.replace(/[▲▼↑↓]/g, '').trim()
                    )
                        .split('\n')[0]
                        .trim();
                    menu.appendChild(
                        item(`↩ Afficher "${hLabel}"`, '#1d70b7', () => {
                            hiddenCols.delete(hNth);
                            applyHideRules();
                            saveState();
                            removeMenu();
                        })
                    );
                });
            }

            if (!menu.children.length) {
                removeMenu();
                return;
            }
            document.body.appendChild(menu);
            setTimeout(() => document.addEventListener('click', removeMenu, { once: true }), 0);
        });
    });

    // Restaurer l'état sauvegardé
    if (hiddenCols.size > 0) applyHideRules();
}

function makeColResizable(table) {
    if (!table || table._colResizable) return;
    table._colResizable = true;
    table.style.tableLayout = 'fixed';
    const ths = Array.from(table.querySelectorAll('thead tr:first-child th'));
    // Fixer les largeurs naturelles courantes
    ths.forEach(th => {
        if (th.offsetWidth > 0) th.style.width = th.offsetWidth + 'px';
        th.style.position = 'relative';
    });
    // Ajouter les poignées de resize (sauf la dernière colonne)
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
    // Menu clic droit pour masquer/afficher les colonnes
    addColContextMenu(table);
}

// Ouvrir la modal de téléchargement
function openDownloadModal() {
    const select = document.getElementById('downloadMonthSelect');
    select.innerHTML = '';

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Générer les options : 12 mois dans le passé + mois courant + 3 mois dans le futur
    const options = [];

    // 12 mois dans le passé
    for (let i = 12; i >= 1; i--) {
        const date = new Date(currentYear, currentMonth - i, 1);
        options.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });
    }

    // Mois courant
    options.push({
        year: currentYear,
        month: currentMonth,
        label: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        current: true
    });

    // 3 mois dans le futur
    for (let i = 1; i <= 3; i++) {
        const date = new Date(currentYear, currentMonth + i, 1);
        options.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });
    }

    // Créer les options du select
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = `${opt.year}-${String(opt.month + 1).padStart(2, '0')}`;
        option.textContent = opt.label.charAt(0).toUpperCase() + opt.label.slice(1);
        if (opt.current) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    document.getElementById('downloadPlanningModal').style.display = 'block';
}

// Fermer la modal de téléchargement
function closeDownloadModal() {
    document.getElementById('downloadPlanningModal').style.display = 'none';
}

// Télécharger le planning au format CSV
function downloadPlanningCSV() {
    const selectedValue = document.getElementById('downloadMonthSelect').value;
    const [year, month] = selectedValue.split('-');

    // Générer l'horodatage au format AAAA-MM-JJ_HH-MM
    const now = new Date();
    const horodatage =
        now.getFullYear() +
        '-' +
        String(now.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(now.getDate()).padStart(2, '0') +
        '_' +
        String(now.getHours()).padStart(2, '0') +
        '-' +
        String(now.getMinutes()).padStart(2, '0');

    // Format du nom de fichier : Expert_Planning_AAAAMM_Sauvegarde_de_Horodatage
    const filename = `Expert_Planning_${year}${month}_Sauvegarde_de_${horodatage}.csv`;

    // Appeler l'API d'export avec le nom de fichier personnalisé
    fetch(
        `${API_URL}/export/gantt?year=${year}&month=${parseInt(month) - 1}&format=csv&filename=${encodeURIComponent(filename)}`,
        {
            credentials: 'include'
        }
    )
        .then(response => {
            if (!response.ok) throw new Error('Erreur lors du téléchargement');
            return response.blob();
        })
        .then(blob => {
            // Créer un lien de téléchargement
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Fermer la modal
            closeDownloadModal();
        })
        .catch(error => {
            console.error('Erreur téléchargement:', error);
            alert('Erreur lors du téléchargement du fichier');
        });
}

// Ancienne fonction conservée pour compatibilité
function exportGanttToExcel() {
    openDownloadModal();
}

async function loadUsers() {
    try {
        // Utiliser l'endpoint public pour les experts/users, admin endpoint pour les admins
        const endpoint = currentUser?.activeProfile === 'admin' ? '/users' : '/users/public';
        const response = await fetch(`${API_URL}${endpoint}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Erreur chargement utilisateurs');
        users = await response.json();
        console.log('👥 Users chargés:', users.length);
        console.log(
            '📷 Détails users:',
            users.map(u => ({
                id: u.id,
                nom: u.nom,
                username: u.username,
                resource_id: u.resource_id,
                resource_id_type: typeof u.resource_id,
                is_expert: u.is_expert,
                has_photo: !!u.profile_photo,
                photo_length: u.profile_photo?.length
            }))
        );
        // Administrateur : liste des comptes et automatisations dans les îlots Vue (frontend/src/ilots/admin)
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// Fonction pour purger les cookies du site
function clearSiteCookies() {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    }
    console.log('🧹 Cookies du site purgés');
}

// Fonction pour réinitialiser toutes les données en mémoire
function clearMemoryData() {
    scheduleData = {};
    resources = [];
    users = [];
    schoolHolidays = { zoneA: [], zoneB: [], zoneC: [] };
    currentUser = null;
    console.log('🧹 Données en mémoire réinitialisées');
}

// Event listeners pour automatiser la saisie
document.addEventListener('DOMContentLoaded', function () {
    // Purger les cookies et données au chargement de la page de connexion
    clearSiteCookies();
    clearMemoryData();

    // Charger la version dès le chargement (endpoint public, pas besoin d'auth)
    loadVersion();

    // Charger tous les paramètres si connecté (pour admin)
    loadSettings();

    // Charger les congés scolaires
    loadSchoolHolidays();
});
