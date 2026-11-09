# language: fr
@carte-evenements
Fonctionnalité: Carte des événements (suivi géographique)
  Fenêtre plein écran ouverte depuis l'onglet Événements : filtres (dates, localisation, participants, type),
  pastilles des événements regroupées par lieu, pastilles des experts, compteur, lecture chronologique.
  Données : une localisation de test géolocalisée et trois événements de septembre 2031 sur cette localisation
  (deux d'un type de test, l'un avec l'expert de test en participant, l'autre avec un invité externe), supprimés en fin
  de scénario. La localisation de test est choisie dans le filtre : les événements des autres scénarios n'interfèrent pas.

  Contexte:
    Étant donné que trois événements de test de septembre 2031 existent sur une localisation de test géolocalisée
    Et que je suis connecté en tant que "Administrateur"
    Et que j'ouvre l'onglet "Événements"
    Et que j'ouvre la carte des événements
    Et que j'affiche sur la carte les événements de la localisation de test en septembre 2031

  Scénario: Ouverture et compteur
    Alors la carte indique "3 événement(s)"
    Et la carte présente un lieu portant "3" événements

  Scénario: Date de début proposée par défaut et réinitialisation des filtres
    Quand je réinitialise les filtres de la carte
    Alors la date de début de la carte est le 1er janvier de l'année en cours
    Et la date de fin de la carte est vide
    Et toutes les localisations sont choisies sur la carte

  Scénario: Info-bulle d'un lieu : événements, dates, type et participants
    Quand j'ouvre l'info-bulle du lieu de test sur la carte
    Alors l'info-bulle présente la localisation de test et "3 événement(s)"
    Et l'info-bulle présente l'événement de l'expert du "02/09/2031" avec l'expert de test en participant
    Et l'info-bulle présente le type de test

  Scénario: Filtre « Type »
    Quand je choisis le type de test sur la carte
    Alors la carte indique "2 événement(s)"

  Scénario: Filtre « Participants » : un utilisateur
    Quand je choisis l'expert de test dans les participants de la carte
    Alors la carte indique "1 événement(s)"

  Scénario: Filtre « Participants » : un invité externe
    Quand je choisis l'invité externe de test dans les participants de la carte
    Alors la carte indique "1 événement(s)"

  Scénario: Pastilles des experts masquées puis affichées
    Quand je bascule l'affichage des experts sur la carte
    Alors le bouton des experts de la carte indique "Experts : OFF"
    Et la carte indique "3 événement(s)"
    Quand je bascule l'affichage des experts sur la carte
    Alors le bouton des experts de la carte indique "Experts : ON"

  Scénario: Lecture chronologique complète, puis arrêt
    Quand je choisis la durée de défilement "Très rapide (6 s)"
    Et je lance la lecture chronologique
    Alors la lecture chronologique se termine au "30/09/2031" avec "3 / 3 événement(s)"
    Quand j'arrête la lecture chronologique
    Alors la lecture chronologique est réinitialisée

  Scénario: Position choisie au curseur
    Quand je place le curseur de la lecture chronologique au début
    Alors la lecture chronologique affiche le "01/09/2031" avec "0 / 3 événement(s)"
    Quand je place le curseur de la lecture chronologique à la fin
    Alors la lecture chronologique affiche le "30/09/2031" avec "3 / 3 événement(s)"

  Scénario: Lecture sans événement à lire
    Quand j'affiche sur la carte une localisation de test sans événement, sans date
    Et je lance la lecture chronologique
    Alors une alerte affiche "Aucun événement à lire"

  Scénario: Fermeture de la carte
    Quand je ferme la carte des événements
    Alors la carte des événements est fermée
