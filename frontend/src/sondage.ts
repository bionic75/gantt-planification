// Point d'entrée de la page publique d'un sondage de date (public/sondage.html, balises injectées par le serveur,
// backend/src/lib/frontend.js)
import { createApp } from 'vue';
// Feuille de la page (ancien bloc <style>), avant celles du composant
import '@/sondage/sondage.css';
import PageSondage from '@/sondage/PageSondage.vue';

const app = document.getElementById('app');
if (app) createApp(PageSondage).mount(app);
