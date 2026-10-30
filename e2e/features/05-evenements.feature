# language: fr
@evenements
Fonctionnalité: Événements et types d'événements
  Les événements, types et lieux créés par les scénarios sont supprimés en fin de scénario.

  Scénario: Création d'un événement avec type et lieu
    Étant donné qu'un type d'événement de test existe
    Et qu'une localisation SAMU de test géolocalisée existe
    Quand l'administrateur crée un événement de ce type sur cette localisation du "2031-05-12" au "2031-05-13" avec "Utilisateur" en participant
    Alors la réponse a le statut 200
    Et l'événement créé porte le type, l'icône et les couleurs du type d'événement
    Et l'événement créé est rattaché à la localisation
    Et l'événement créé a "Utilisateur" pour participant

  Plan du scénario: Libellé et date de début obligatoires (<cas>)
    Quand l'administrateur crée un événement <cas>
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Date de début et libellé requis"

    Exemples:
      | cas                    |
      | sans libellé           |
      | sans date de début     |

  Scénario: Période demi-journée
    Quand l'administrateur crée un événement d'un seul jour le "2031-05-14" sur la période "matin"
    Alors l'événement créé a la période "AM"
    Quand l'administrateur crée un événement du "2031-05-14" au "2031-05-16" sur la période "matin"
    Alors l'événement créé a la période "FULL"

  Scénario: « Créé le JJ/MM/AAAA HH:MM par [créateur] »
    Étant donné que "Utilisateur" a créé un événement de test aujourd'hui
    Quand l'administrateur consulte cet événement
    Alors l'événement indique son créateur "Utilisateur" et sa date de création
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Alors la mention « Créé le JJ/MM/AAAA HH:MM par » du créateur "Utilisateur" est affichée pour cet événement

  Scénario: Types d'événements : création, couleurs, icône
    Quand l'administrateur crée un type d'événement avec un libellé long, un libellé court, l'icône "flag" et les couleurs "#112233", "#ffffff", "#000000"
    Alors la réponse a le statut 200
    Et le type d'événement apparaît dans la liste des types
    Quand l'administrateur crée un événement de ce type le "2031-05-21"
    Alors l'événement créé est affiché avec les couleurs "#112233", "#ffffff", "#000000"
    Quand l'administrateur crée un type d'événement avec le même libellé long en majuscules
    Alors la réponse a le statut 400

  Scénario: Type « Autre » protégé
    Quand l'administrateur tente de modifier le type « Autre »
    Alors la réponse a le statut 403
    Quand l'administrateur tente de supprimer le type « Autre »
    Alors la réponse a le statut 403
    Quand l'administrateur crée un événement d'un type inexistant le "2031-05-22"
    Alors l'événement créé est du type « Autre »

  # Période propre à cette fonctionnalité : l'expert de test est aussi affecté à des visites métier par
  # 06-aide-affectation, exécutée en parallèle en CI (affectation refusée sur une période déjà prise)
  Scénario: Événement ↔ affectations (participants)
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-17" au "2031-03-19" pour 2 ressources existe
    Et que l'expert de test est affecté à la visite métier du déploiement
    Quand l'administrateur crée l'événement de la visite métier depuis le déploiement
    Alors l'événement créé a "Expert" pour participant
    Quand l'administrateur retire "Expert" des participants de l'événement
    Alors l'événement créé n'a plus de participant

  Scénario: Suppression d'un événement
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-17" au "2031-03-19" pour 2 ressources existe
    Et que l'expert de test est affecté à la visite métier du déploiement
    Et que l'administrateur a créé l'événement de la visite métier depuis le déploiement
    Quand l'administrateur supprime l'événement
    Alors la réponse a le statut 200
    Et l'événement n'existe plus
    Et l'activité visite métier du déploiement n'est plus reliée à un événement

  Scénario: Une modification d'événement est réservée aux administrateurs
    Étant donné que l'administrateur a créé un événement de test le "2031-05-23"
    Quand "Utilisateur" tente de supprimer cet événement
    Alors la réponse a le statut 403

  # Carte Leaflet : filtrage et animation contrôlés visuellement
  @manuel
  Scénario: Carte des événements : filtre « Type »
    Étant donné que des événements de plusieurs types existent
    Quand j'utilise le filtre « Type » de la carte
    Alors seuls les événements du type choisi sont affichés

  @manuel
  Scénario: Lecture chronologique sur la carte
    Quand je lance la lecture chronologique à différentes vitesses
    Alors les événements apparaissent chronologiquement

  Scénario: Carte des événements : seuls les lieux géolocalisés
    Étant donné qu'un type d'événement de test existe
    Et qu'une localisation SAMU de test géolocalisée existe
    Et que l'administrateur a créé un événement de ce type sur cette localisation le "2031-06-02"
    Quand "Utilisateur" consulte la carte des événements de juin 2031
    Alors l'événement créé figure sur la carte avec ses coordonnées et son type
