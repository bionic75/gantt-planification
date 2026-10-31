// Application principale : locations
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== LOCALISATIONS ==========
// Liste partagée par le planning, le CRA et les listes déroulantes de l'ancien code ; l'administration des
// localisations est un îlot Vue (frontend/src/ilots/admin/localisations), qui signale ses modifications (gp:localisations-modifiees)

let allLocations = [];

async function loadLocations() {
    try {
        const res = await fetch(`${API_URL}/locations`, { credentials: 'include' });
        if (res.status === 401) {
            // Déjà déconnecté (déconnexion pendant l'ouverture de l'application) : rien de plus à faire
            if (!currentUser) return;
            console.warn('Session expirée lors du chargement des localisations');
            await performLogout();
            return;
        }
        if (!res.ok) return;
        const data = await res.json();
        allLocations = data.locations || [];
        populateLocationSelects();
    } catch (e) {
        console.error('Erreur chargement localisations:', e);
    }
}

function populateLocationSelects() {
    // Peupler les selects SAMU depuis allLocations
    const samuOptions =
        '<option value="">-- Choisir un SAMU --</option>' +
        [...allLocations]
            .sort((a, b) => (a.libelle_court || '').localeCompare(b.libelle_court || ''))
            .map(l => `<option value="${l.libelle_court}">${l.libelle_court}</option>`)
            .join('');
    ['samu', 'editSamu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = samuOptions;
    });

    // Listener SAMU → ES auto-remplissage (ajout)
    const samuSel = document.getElementById('samu');
    if (samuSel && !samuSel._listenerSet) {
        samuSel._listenerSet = true;
        samuSel.addEventListener('change', function () {
            const selected = allLocations.find(l => l.libelle_court === this.value);
            const adresse = selected?.adresse || '';
            const es = adresse.includes(',') ? adresse.split(',')[0].trim() : adresse.trim();
            document.getElementById('esRattachement').value = es;
        });
    }
    // Listener SAMU → ES auto-remplissage (modification)
    const editSamuSel = document.getElementById('editSamu');
    if (editSamuSel && !editSamuSel._listenerSet) {
        editSamuSel._listenerSet = true;
        editSamuSel.addEventListener('change', function () {
            const selected = allLocations.find(l => l.libelle_court === this.value);
            const adresse = selected?.adresse || '';
            const es = adresse.includes(',') ? adresse.split(',')[0].trim() : adresse.trim();
            document.getElementById('editEsRattachement').value = es;
        });
    }
}

// ========== FIN LOCALISATIONS ==========
