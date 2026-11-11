// Interface Vue : page principale, page d'un sondage, application mobile (voir docs/migration-vue.md)
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
    // Développement : dépendances des îlots (chargés à la demande) préparées au démarrage, sans rechargement de la
    // page à leur première utilisation
    optimizeDeps: {
        include: ['vue', 'pinia', 'leaflet']
    },
    build: {
        outDir: fileURLToPath(new URL('../dist/frontend', import.meta.url)),
        emptyOutDir: true,
        manifest: true,
        rollupOptions: {
            input: {
                principal: fileURLToPath(new URL('./src/principal.ts', import.meta.url)),
                // Feuilles de style globales de la page principale, injectées avant celles des composants
                globales: fileURLToPath(new URL('./src/styles/globales.css', import.meta.url)),
                // Page publique d'un sondage de date (public/sondage.html)
                sondage: fileURLToPath(new URL('./src/sondage.ts', import.meta.url)),
                // Application mobile (public/mobile.html)
                mobile: fileURLToPath(new URL('./src/mobile.ts', import.meta.url)),
                // Aide en ligne (public/aide.html, aide personnalisée)
                aide: fileURLToPath(new URL('./src/aide.ts', import.meta.url))
            }
        }
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts']
    }
});
