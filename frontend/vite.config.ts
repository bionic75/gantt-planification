// Interface Vue (îlots montés dans la page existante, voir docs/migration-vue.md)
// Build : dist/frontend (manifeste lu par le serveur, src/lib/frontend.js) ; tests de composants : Vitest
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const racine = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    root: racine,
    // Fichiers servis sous /vue/ par le serveur Express
    base: '/vue/',
    plugins: [vue()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    build: {
        outDir: fileURLToPath(new URL('../dist/frontend', import.meta.url)),
        emptyOutDir: true,
        manifest: true,
        rollupOptions: {
            input: { ilots: fileURLToPath(new URL('./src/ilots.ts', import.meta.url)) }
        }
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts']
    }
});
