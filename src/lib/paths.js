// @ts-check
// Chemins du projet, indépendants du répertoire courant
import path from 'path';
import { fileURLToPath } from 'url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
