// HTML venu de l'administration (aide en ligne personnalisée) inséré dans la page : filtré par DOMPurify (scripts,
// attributs d'événements « on… », liens javascript: retirés). Défense en profondeur : la politique de sécurité du
// contenu bloque déjà tout script en ligne.
import DOMPurify from 'dompurify';

export const htmlSur = (html: string): string => DOMPurify.sanitize(html);
