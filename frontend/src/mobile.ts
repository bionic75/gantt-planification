// Point d'entrée de l'application mobile (public/mobile.html, balises injectées par le serveur, src/lib/frontend.js)
import { createApp } from 'vue';
import ApplicationMobile from '@/mobile/ApplicationMobile.vue';
import '@/mobile/mobile.css';

const racine = document.getElementById('mobile');
if (racine) createApp(ApplicationMobile).mount(racine);
