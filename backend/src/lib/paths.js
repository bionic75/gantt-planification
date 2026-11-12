// @ts-check
// Chemins du projet, indépendants du répertoire courant
import path from 'path';
import { fileURLToPath } from 'url';

/** Dossier backend (src/, prisma/, scripts/) */
export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Racine du projet : frontend/, dist/ */
export const PROJECT_ROOT = path.resolve(BACKEND_DIR, '..');
/** Pages HTML servies par le serveur, avec le point d'entrée Vue de chacune (frontend/pages) */
export const PAGES_DIR = path.join(PROJECT_ROOT, 'frontend', 'pages');
/** Images servies sous /img (frontend/img) : favicons, icônes, logos (le logo ANS est aussi joint aux e-mails) */
export const IMG_DIR = path.join(PROJECT_ROOT, 'frontend', 'img');
