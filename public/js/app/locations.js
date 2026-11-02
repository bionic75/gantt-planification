// Application principale : locations
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// ========== LOCALISATIONS ==========
// Liste partagée par le planning et le CRA (listes SAMU des ressources : îlot Vue frontend/src/ilots/ressources) ;
// l'administration des localisations est un îlot Vue (frontend/src/ilots/admin/localisations), qui signale ses
// modifications (gp:localisations-modifiees)

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
    } catch (e) {
        console.error('Erreur chargement localisations:', e);
    }
}

// ========== FIN LOCALISATIONS ==========
