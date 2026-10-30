// Application principale : dump
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page
// Dump complet et restauration : îlot Vue (frontend/src/ilots/admin/parametrages)

function showSyncStatus() {
    const status = document.getElementById('syncStatus');
    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}
