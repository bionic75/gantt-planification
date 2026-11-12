// Tests du serveur (npm test, depuis la racine du projet) : fichiers de backend/tests
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    test: {
        include: ['tests/**/*.test.js'],
        // Base modèle migrée une seule fois, copiée pour chaque serveur de test
        globalSetup: ['tests/global-setup.js'],
        // Chaque fichier démarre son propre serveur (port et base temporaires)
        testTimeout: 20000,
        hookTimeout: 60000
    }
});
