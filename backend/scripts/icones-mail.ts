// Génère les icônes PNG des e-mails (backend/assets/mail) à partir des tracés du site (frontend/src/composants/icones.ts
// et icones-application.ts).
// Les clients de messagerie n'affichent pas le SVG intégré : les icônes sont jointes en PNG (image « cid »).
// Usage : node backend/scripts/icones-mail.ts (CHROME_PATH=chemin d'un Chrome installé si Puppeteer n'a pas son navigateur)
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Icônes des composants, puis icônes de l'ancien code (calendrier, mallette…)
const source = ['icones.ts', 'icones-application.ts']
    .map(f => readFileSync(join(racine, 'frontend/src/composants', f), 'utf8'))
    .join('\n');
const sortie = join(racine, 'backend/assets/mail');
mkdirSync(sortie, { recursive: true });

/** Tracés d'une icône du site */
function traces(nom: any) {
    const m = new RegExp(`\\n    ${nom}:\\s*('(?:[^'\\\\]|\\\\.)*')`).exec(source);
    if (!m) throw new Error(`Icône inconnue : ${nom}`);
    return m[1].slice(1, -1);
}

const BLEU = '#1d70b7';
const ROSE = '#b0285a';
const svgIcone = (nom: any, couleur: any, fond: any, taille: any) => {
    const pad = Math.round(taille * (fond ? 0.26 : 0.06));
    const rond = fond ? `<circle cx="${taille / 2}" cy="${taille / 2}" r="${taille / 2}" fill="${fond}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">${rond}<svg x="${pad}" y="${pad}" width="${taille - 2 * pad}" height="${taille - 2 * pad}" viewBox="0 0 24 24" fill="none" stroke="${couleur}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${traces(nom)}</svg></svg>`;
};

/** [fichier, icône, couleur, fond (disque) ou null, taille en pixels] */
const ICONES: [string, string, string, string | null, number][] = [
    // Grande icône du titre : blanc sur disque bleu
    ['cadenas-grand', 'cadenas', '#fff', BLEU, 128],
    ['cle-grand', 'cle', '#fff', BLEU, 128],
    // Petites icônes des lignes d'information : bleu sans fond
    ['horloge', 'horloge', BLEU, null, 40],
    ['bouclier', 'bouclier', BLEU, null, 40],
    // Événements et affectations : calendrier, mallette, modification (flèche circulaire), annulation (rose)
    ['calendrier-grand', 'calendar', '#fff', BLEU, 128],
    ['mallette-grand', 'briefcase', '#fff', BLEU, 128],
    ['modifie-grand', 'refresh', '#fff', BLEU, 128],
    ['annule-grand', 'x', '#fff', ROSE, 128],
    ['calendrier', 'calendar', BLEU, null, 40],
    ['evenement', 'clipboard', BLEU, null, 40],
    ['lieu', 'pin', BLEU, null, 40],
    ['utilisateur', 'user', BLEU, null, 40],
    ['mallette', 'briefcase', BLEU, null, 40]
];

const navigateur = await puppeteer.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
try {
    const page = await navigateur.newPage();
    for (const [fichier, nom, couleur, fond, taille] of ICONES) {
        await page.setViewport({ width: taille, height: taille });
        await page.setContent(
            `<body style="margin:0;background:transparent">${svgIcone(nom, couleur, fond, taille)}</body>`
        );
        await page.screenshot({ path: join(sortie, `${fichier}.png`), omitBackground: true });
        console.log(`✅ ${fichier}.png`);
    }
} finally {
    await navigateur.close();
}
