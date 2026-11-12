// Point d'entrée de l'aide en ligne (public/aide.html, ou aide personnalisée enregistrée dans l'administration ;
// balises injectées par le serveur, backend/src/lib/frontend.js) : feuille de style, émojis remplacés par les icônes, bouton
// « Retour à l'application » (sans attribut onclick, interdit par la politique de sécurité du contenu).
import '@/styles/aide.css';
import { installerIconesEmojis } from '@/decor/icones-emojis';

document.querySelectorAll('.back-btn').forEach(b => b.addEventListener('click', () => window.close()));
installerIconesEmojis();
