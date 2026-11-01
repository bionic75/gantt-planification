// Demandes d'ouverture adressées par un îlot à un autre (l'îlot visé peut ne pas être encore monté) : indicateur partagé,
// consommé par l'îlot concerné à son affichage
import { ref } from 'vue';

/** L'accueil demande le dépliage de la rubrique « Ajouter / Modifier un événement » de l'onglet Événements */
export const demandeNouvelEvenement = ref(false);

/** L'accueil demande l'ouverture de la fenêtre « Ajouter un lieu » de l'onglet SAMU-SAS TripAdVisor */
export const demandeAjoutLieu = ref(false);
