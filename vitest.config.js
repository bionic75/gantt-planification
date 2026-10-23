import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        // Chaque fichier démarre son propre serveur (port et base temporaires)
        testTimeout: 20000,
        hookTimeout: 60000
    }
});
