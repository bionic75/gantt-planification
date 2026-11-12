// @ts-check
// Chemins du projet, indépendants du répertoire courant
import path from 'path';
import { fileURLToPath } from 'url';

/** Dossier backend (src/, prisma/, scripts/) */
export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Racine du projet : public/, frontend/, dist/ */
export const PROJECT_ROOT = path.resolve(BACKEND_DIR, '..');
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
