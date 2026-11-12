// Version de l'application : commentaire <!-- vX.Y.Z --> de frontend/pages/index.html (affichée dans l'application,
// synchronisée en base au démarrage). Scripts et feuilles de style : fichiers à empreinte de l'interface Vue, rechargés
// par les navigateurs dès qu'ils changent (plus de paramètre ?v=, lot 6.5).
//
// Usage : npm run app:version -- 1.18.0   puis créer le tag v1.18.0 (déploiement)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Racine du projet (backend/scripts → ../..)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage : npm run app:version -- X.Y.Z');
    process.exit(2);
}

const file = path.join(ROOT, 'frontend/pages/index.html');
const html = fs.readFileSync(file, 'utf8');
const current = /<!--\s*v(\d+\.\d+\.\d+)\s*-->/.exec(html)?.[1];
fs.writeFileSync(file, html.replace(/<!--\s*v\d+\.\d+\.\d+\s*-->/, `<!-- v${version} -->`));
console.log(`Version ${current} → ${version}`);
console.log(`Ajouter l'entrée de la version dans frontend/pages/aide.html (historique), puis : git tag v${version}`);
