// Application principale : admin-users
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

// Fonction pour générer le trigramme à partir du nom et prénom
function generateTrigramme() {
    const nom = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();

    if (!nom || !prenom) return;

    // Retirer les accents et espaces
    const nomClean = removeAccents(nom).replace(/[\s\-]/g, '');
    const prenomClean = removeAccents(prenom).replace(/[\s\-]/g, '');

    // Prendre la 1ère lettre du prénom + 2 premières lettres du nom
    const trigramme = (prenomClean.charAt(0) + nomClean.substring(0, 2)).toUpperCase();

    document.getElementById('trigramme').value = trigramme;
}

// Gestion des utilisateurs : îlot Vue (frontend/src/ilots/admin/utilisateurs)

async function toggleAstreinteByResource(resourceId, hasAccess, type = 'hno') {
    try {
        const r = await fetch(`${API_URL}/resources/${resourceId}/astreinte`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ hasAccess, type })
        });
        if (!r.ok) throw new Error();
        await loadResources();
    } catch {
        alert('Erreur modification accès astreinte');
        await loadResources();
    }
}
