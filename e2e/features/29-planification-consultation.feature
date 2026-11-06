# language: fr
@consultation
Fonctionnalité: Fenêtres de consultation de la planification
  Vue calendrier mensuel et calendrier des congés et événements (en-tête de la planification), recherche avancée
  (en-tête de l'application) et impression des deux calendriers. Les données sont celles d'une ressource et d'un
  événement de test placés en septembre 2031, supprimés en fin de scénario ; les calendriers s'ouvrent sur le mois de
  la planification et y sont menés par leurs boutons ◀ ▶. L'impression est interceptée : le document envoyé à
  l'impression est vérifié, sans boîte de dialogue d'impression.

  Scénario: Calendrier mensuel : experts disponibles par demi-journée, semaines ISO, légende et navigation
    Étant donné qu'une ressource de test est disponible le "2031-09-01" matin et après-midi et le "2031-09-02" matin
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre la vue calendrier mensuel
    Alors le calendrier mensuel affiche le mois de la planification
    Quand j'affiche "Septembre 2031" dans le calendrier mensuel
    Alors les semaines du calendrier mensuel sont "36, 37, 38, 39, 40"
    Et la ressource de test figure le 1 du calendrier mensuel le matin et l'après-midi
    Et la ressource de test figure le 2 du calendrier mensuel le matin seulement
    Et la légende du calendrier mensuel présente la ressource de test
    Quand je passe au mois suivant dans le calendrier mensuel
    Alors le calendrier mensuel affiche "Octobre 2031"
    Quand je reviens de 2 mois en arrière dans le calendrier mensuel
    Alors le calendrier mensuel affiche "Août 2031"
    Quand je ferme le calendrier mensuel
    Alors le calendrier mensuel est fermé

  Scénario: Calendrier mensuel : seules les ressources du filtre de la planification
    Étant donné qu'une ressource de test est disponible le "2031-09-01" matin et après-midi et le "2031-09-02" matin
    Et que je suis connecté en tant que "Administrateur"
    Quand je filtre la planification sur la ressource de test
    Et j'ouvre la vue calendrier mensuel
    Alors la légende du calendrier mensuel ne présente que la ressource de test

  Scénario: Événement visible dans les deux calendriers
    Étant donné qu'un événement de test a lieu le "2031-09-10"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre la vue calendrier mensuel
    Et j'affiche "Septembre 2031" dans le calendrier mensuel
    Alors l'événement de test figure le 10 du calendrier mensuel
    Quand je ferme le calendrier mensuel
    Et j'ouvre le calendrier des congés et événements
    Alors le calendrier des événements affiche le mois courant
    Quand j'affiche "Septembre 2031" dans le calendrier des événements
    Alors l'événement de test figure le 10 du calendrier des événements
    Quand je ferme le calendrier des événements
    Alors le calendrier des événements est fermé

  Scénario: Calendrier des congés et événements : navigation
    Étant donné que je suis connecté en tant que "Utilisateur"
    Quand j'ouvre le calendrier des congés et événements
    Alors le calendrier des événements affiche le mois courant
    Et les semaines et les jours du calendrier des événements correspondent au mois affiché
    Quand je passe au mois suivant dans le calendrier des événements
    Alors le calendrier des événements affiche le mois suivant le mois courant
    Quand je reviens au mois précédent dans le calendrier des événements
    Alors le calendrier des événements affiche le mois courant

  Scénario: Recherche avancée : du premier au dernier jour du mois courant par défaut
    Étant donné que je suis connecté en tant que "Utilisateur"
    Quand j'ouvre la recherche avancée
    Alors la recherche propose du premier au dernier jour du mois courant

  Scénario: Recherche avancée : experts trouvés, classement des créneaux et réinitialisation
    Étant donné qu'une ressource de test est disponible le "2031-09-01" matin et après-midi et le "2031-09-02" matin
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre la recherche avancée
    Et je recherche les demi-journées "Disponible pour l'ANS" de la ressource de test du "2031-09-01" au "2031-09-30"
    Alors la recherche trouve la ressource de test avec 3 demi-journées : "01/09 (AM/PM), 02/09 (AM)"
    Et le classement présente 3 créneaux d'un expert, du "lun. 01/09/2031" matin au "mar. 02/09/2031" matin
    Quand je réinitialise la recherche
    Alors la recherche invite à choisir des critères
    Et la recherche propose du premier au dernier jour du mois courant
    Quand je lance la recherche sans date de début
    Alors une alerte affiche "Veuillez sélectionner un intervalle de dates"
    Quand je ferme la recherche avancée
    Alors la recherche avancée est fermée

  Scénario: Impression des deux calendriers
    Étant donné que je suis connecté en tant que "Administrateur"
    Et que les impressions sont interceptées
    Quand j'ouvre la vue calendrier mensuel
    Et j'affiche "Septembre 2031" dans le calendrier mensuel
    Et j'imprime le calendrier
    Alors le document imprimé a pour titre "Vue Calendrier Mensuel" et pour sous-titre "Septembre 2031", imprimé une seule fois
    Quand je ferme le calendrier mensuel
    Et j'ouvre le calendrier des congés et événements
    Et j'imprime le calendrier
    Alors le document imprimé a pour titre « Calendrier des événements - » suivi du mois courant

  @manuel
  Scénario: Rendu imprimé des calendriers
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'imprime la vue calendrier mensuel puis le calendrier des congés et événements
    Alors chaque document est en paysage, avec les couleurs des experts, des congés et des événements
