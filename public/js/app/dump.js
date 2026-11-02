// Application principale : dump
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Dump complet et restauration : îlot Vue (frontend/src/ilots/admin/parametrages)

function showSyncStatus() {
    // Bandeau de l'onglet Ressources (îlot Vue, frontend/src/ilots/ressources) : absent tant que l'onglet n'est pas ouvert
    const status = document.getElementById('syncStatus');
    if (!status) return;
    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}
