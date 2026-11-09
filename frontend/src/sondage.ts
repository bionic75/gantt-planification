// Point d'entrée de la page publique d'un sondage de date (public/sondage.html, balises injectées par le serveur,
// src/lib/frontend.js)
import { createApp } from 'vue';
import PageSondage from '@/sondage/PageSondage.vue';

const app = document.getElementById('app');
if (app) createApp(PageSondage).mount(app);
