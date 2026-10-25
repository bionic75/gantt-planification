import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        // Base modèle migrée une seule fois, copiée pour chaque serveur de test
        globalSetup: ['tests/global-setup.js'],
        // Chaque fichier démarre son propre serveur (port et base temporaires)
        testTimeout: 20000,
        hookTimeout: 60000
    }
});
