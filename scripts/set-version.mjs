// Version de l'application : commentaire <!-- vX.Y.Z --> de public/index.html (affichée dans l'application,
// synchronisée en base au démarrage) et paramètre ?v= des scripts et feuilles de style de la page (les navigateurs
// rechargent les fichiers modifiés au lieu de garder ceux de leur cache).
//
// Usage : npm run app:version -- 1.18.0   puis créer le tag v1.18.0 (déploiement)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage : npm run app:version -- X.Y.Z');
    process.exit(2);
}

const file = path.join(ROOT, 'public/index.html');
const html = fs.readFileSync(file, 'utf8');
const current = /<!--\s*v(\d+\.\d+\.\d+)\s*-->/.exec(html)?.[1];
let count = 0;
const updated = html
    .replace(/<!--\s*v\d+\.\d+\.\d+\s*-->/, `<!-- v${version} -->`)
    .replace(/(\.(?:js|css))\?v=[\d.]+/g, (m, ext) => {
        count++;
        return `${ext}?v=${version}`;
    });
fs.writeFileSync(file, updated);
console.log(`Version ${current} → ${version} (${count} fichiers référencés dans index.html)`);
console.log(`Ajouter l'entrée de la version dans public/aide.html (historique), puis : git tag v${version}`);
