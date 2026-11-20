# language: fr
@carte-evenements
Fonctionnalité: Carte des événements (suivi géographique)
  Fenêtre plein écran ouverte depuis l'onglet Événements : filtres (dates, localisation, participants, type),
  pastilles des événements regroupées par lieu, pastilles des experts, compteur, lecture chronologique des mises en service,
  fonds de carte, légende cliquable, carte de France seule, export GIF.
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

  Scénario: Lecture des mises en service, puis arrêt
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand je choisis la durée de défilement "Très rapide (6 s)"
    Et je lance la lecture chronologique
    Alors la lecture chronologique se termine à partir du "20/09/2031" avec toutes les mises en service
    Quand j'arrête la lecture chronologique
    Alors la lecture chronologique est réinitialisée

  Scénario: Position choisie au curseur
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand je place le curseur de la lecture chronologique à la fin
    Alors la lecture chronologique affiche une date à partir du "20/09/2031" avec toutes les mises en service
    Quand je place le curseur de la lecture chronologique au début
    Alors la lecture chronologique affiche une date avec un compteur de mises en service

  Scénario: Export de l'animation en GIF
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand je demande le GIF de l'animation
    Alors un fichier "cartographie-mises-en-service.gif" est téléchargé

  Scénario: Fonds de carte : satellite, administratif, puis plan
    Quand je choisis le fond de carte "Satellite"
    Alors la carte affiche des images de fond de "data.geopf.fr"
    Quand je choisis le fond de carte "Administratif (départements, régions)"
    Alors la carte n'affiche plus d'image de fond
    Et la carte trace les limites des départements et des régions
    Quand je choisis le fond de carte "Plan"
    Alors la carte affiche des images de fond de "tile.openstreetmap.org"

  Scénario: Légende : un clic masque puis réaffiche un statut
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand j'affiche sur la carte les événements de la localisation de test en septembre 2031
    Alors la légende de la carte présente le statut "En service" affiché
    Quand je clique sur le statut "En service" de la légende
    Alors la légende de la carte présente le statut "En service" masqué
    Quand je clique sur le statut "En service" de la légende
    Alors la légende de la carte présente le statut "En service" affiché

  Scénario: Lecture sans les périodes creuses
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand je coche « Sans les périodes creuses » sur la carte
    Et je choisis la durée de défilement "Très rapide (6 s)"
    Et je lance la lecture chronologique
    Alors la lecture chronologique se termine à partir du "20/09/2031" avec toutes les mises en service

  Scénario: Titre du GIF
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand je saisis le titre "Déploiement SAMU-SAS" pour le GIF
    Et je demande le GIF de l'animation
    Alors un fichier "cartographie-mises-en-service.gif" est téléchargé

  Scénario: Légende : noms des départements et des SAMU sur la carte
    Étant donné que le SAMU de test est en service depuis le "2031-09-20"
    Quand j'affiche sur la carte les événements de la localisation de test en septembre 2031
    Et je coche « Noms des départements » dans la légende
    Alors la carte écrit le nom du département "Paris"
    Quand je coche « Noms des SAMU » dans la légende
    Alors la carte écrit le nom du SAMU de test

  Scénario: Carte de France seule
    Quand je bascule la carte de France seule
    Alors le bouton de la carte de France seule indique "France seule : ON"
    Et la carte n'affiche plus d'image de fond
    Et le choix du fond de carte est désactivé
    Quand je bascule la carte de France seule
    Alors le bouton de la carte de France seule indique "France seule : OFF"

  Scénario: Boutons de la barre de la carte à la même hauteur
    Alors les boutons de la barre de la carte ont tous la même hauteur

  Scénario: Fermeture de la carte
    Quand je ferme la carte des événements
    Alors la carte des événements est fermée
