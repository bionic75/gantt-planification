# language: fr
@affectation
Fonctionnalité: Aide à l'affectation opérationnelle (déploiements des SAMU)
  Chaque scénario crée sa propre localisation « SAMU 9xxx » et son déploiement, supprimés en fin de scénario
  avec les événements liés. Les dates sont placées en 2031 pour ne pas croiser la planification réelle.

  Scénario: Création d'un déploiement de SAMU
    Étant donné qu'une localisation SAMU de test existe
    Quand l'administrateur crée un déploiement pour cette localisation débutant le "2031-01-06" avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources
    Alors la réponse a le statut 200
    Et le déploiement apparaît dans le planning des déploiements
    Et l'historique du déploiement contient l'action "creation"

  Scénario: Nombre de ressources obligatoire pour les étapes à ressources
    Étant donné qu'une localisation SAMU de test existe
    Quand l'administrateur crée un déploiement pour cette localisation débutant le "2031-01-06" avec une visite métier du "2031-03-03" au "2031-03-05" sans nombre de ressources
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Visite métier : indiquez le nombre de ressources nécessaires (1 à 10)"

  Plan du scénario: Cohérence des dates d'un déploiement (<cas>)
    Étant donné qu'une localisation SAMU de test existe
    Quand l'administrateur crée un déploiement incohérent : <cas>
    Alors la réponse a le statut 400
    Et le message d'erreur contient "<message>"

    Exemples:
      | cas                                          | message                                   |
      | une visite métier qui finit avant de commencer | la date de fin précède la date de début |
      | une mise en service avant le début du projet  | ne peut pas précéder le début du projet  |
      | sans date de début de projet                  | La date de début du projet est obligatoire |

  Scénario: Étape « Formation des formateurs relais » supprimée
    Quand l'administrateur consulte la liste des étapes d'un déploiement
    Alors l'étape "Formation utilisateurs" existe
    Et aucune étape ne mentionne "formateurs relais"

  Scénario: Affectation d'une ressource : 2-Disponible → 3-Déploiement
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Et qu'une ressource de test est « 2 - Disponible » du "2031-03-03" au "2031-03-05"
    Quand l'administrateur affecte cette ressource à la visite métier du déploiement
    Et l'administrateur reporte l'affectation de la visite métier dans la planification
    Alors la planification de la ressource est « 3 - Déploiement » du "2031-03-03" au "2031-03-05" sur le SAMU du déploiement

  Scénario: Ressources déjà affectées à un autre SAMU grisées
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 1 ressource existe
    Et qu'une ressource de test est déjà affectée au "SAMU 13" le "2031-03-04" matin
    Quand l'administrateur consulte la disponibilité des ressources pour la visite métier
    Alors la ressource est signalée affectée à "SAMU 13" sur la période
    Quand l'administrateur affecte cette ressource à la visite métier du déploiement
    Alors la réponse a le statut 409

  Scénario: Désaffectation : remise en situation de la planification
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Et que l'expert de test est affecté à la visite métier du déploiement
    Et que l'affectation de la visite métier est reportée dans la planification avec création de l'événement
    Quand l'administrateur désaffecte l'expert de test de la visite métier
    Alors la planification de l'expert de test est « 2 - Disponible / 2 - En attente d'affectation » sans localisation du "2031-03-03" au "2031-03-05"
    Et l'expert de test n'est plus participant de l'événement de la visite métier

  Scénario: Suppression d'un déploiement relié à des événements
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Et que l'administrateur a créé l'événement de la visite métier depuis le déploiement
    Et que l'administrateur a créé l'événement de la mise en service le "2031-04-01" depuis le déploiement
    Quand l'administrateur supprime le déploiement sans préciser le sort des événements
    Alors la réponse a le statut 409
    Et la validation demandée indique 2 événements liés
    Quand l'administrateur supprime le déploiement en conservant les événements
    Alors la réponse a le statut 200
    Et le déploiement n'existe plus
    Et les 2 événements liés existent toujours

  Scénario: Historique d'un déploiement
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Quand l'administrateur modifie la mise en service du déploiement au "2031-04-15"
    Et l'administrateur modifie la mise en service du déploiement au "2031-04-22"
    Alors l'historique du déploiement liste "modification, modification, creation", la plus récente d'abord
    Et chaque entrée de l'historique indique qui et quand

  Scénario: Ouverture de l'application d'aide à l'affectation
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'application "Aide à l'affectation opérationnelle" depuis le menu Applications
    Alors l'application d'aide à l'affectation est affichée
    Et aucune erreur technique n'est survenue

  # Interactions de l'écran de planning des déploiements (retrait / rétablissement de ligne, tri, redimensionnement,
  # exports PDF et PowerPoint WYSIWYG) : vérification visuelle
  @manuel
  Scénario: Retrait et rétablissement d'une ligne SAMU
    Quand je clique sur (−) d'une ligne puis sur « Rétablir »
    Alors la ligne est masquée puis rétablie sans modification des données

  @manuel
  Scénario: Tri du planning (SAMU, chef, mise en service, mise en production)
    Quand je trie par chaque critère, dans les deux sens
    Alors l'ordre est correct avec un tri naturel des numéros (47 avant 56)

  @manuel
  Scénario: Colonne SAMU redimensionnable
    Quand je glisse la poignée de la colonne SAMU
    Alors la largeur est modifiée et conservée

  @manuel
  Scénario: Impression / export PDF et PowerPoint
    Quand j'exporte en PDF puis en PowerPoint en A4/A3, portrait/paysage
    Alors le fichier est fidèle à l'écran et nommé selon le modèle de nom

  Scénario: Onglet « Événements » : types et SAMU retenus
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Et que l'administrateur a créé l'événement de la visite métier depuis le déploiement
    Et que l'administrateur a créé un événement de type « Autre » sur la localisation du déploiement le "2031-03-10"
    Et que l'administrateur a créé un événement de type « Visite métier » sur une localisation hors planning le "2031-03-11"
    Quand l'administrateur consulte l'onglet Événements de l'aide à l'affectation
    Alors l'événement de la visite métier est listé
    Et l'événement de type « Autre » n'est pas listé
    Et l'événement hors planning n'est pas listé
    Et la liste ne contient que des événements des 7 types d'activité

  Scénario: Onglet « Événements » : comparaison avec le planning
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Et que l'administrateur a créé l'événement de la visite métier depuis le déploiement
    Quand l'administrateur consulte l'onglet Événements de l'aide à l'affectation
    Alors l'événement de la visite métier indique l'activité prévue du "2031-03-03" au "2031-03-05"
    Quand l'administrateur décale la visite métier du déploiement au "2031-03-17" - "2031-03-19"
    Et l'administrateur consulte l'onglet Événements de l'aide à l'affectation
    Alors l'événement de la visite métier indique l'activité prévue du "2031-03-17" au "2031-03-19"

  @manuel
  Scénario: Onglet « Événements » : tri et filtres
    Quand je trie chaque colonne et filtre par SAMU, type et recherche
    Alors le tri est correct, les filtres cumulables et le compteur à jour

  Scénario: Création d'événement proposée depuis une activité
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources existe
    Et que l'expert de test est affecté à la visite métier du déploiement
    Quand l'administrateur crée l'événement de la visite métier depuis le déploiement
    Alors l'événement créé est sur la localisation du déploiement, du type « Visite métier », du "2031-03-03" au "2031-03-05"
    Et l'événement créé a "Expert" pour participant
    Et la visite métier du déploiement est reliée à l'événement créé

  # Anomalie connue : après décalage de l'activité puis suppression du déploiement, les anciens jours restent en
  # « 3 - Déploiement » dans la planification
  @anomalie-connue @fail
  Scénario: Scénario complet d'un déploiement
    Étant donné qu'une localisation SAMU de test existe
    Et que deux ressources de test sont « 2 - Disponible » du "2031-03-03" au "2031-03-05"
    Quand l'administrateur crée un déploiement pour cette localisation débutant le "2031-01-06" avec une visite métier du "2031-03-03" au "2031-03-05" pour 2 ressources
    Et l'administrateur affecte les deux ressources à la visite métier du déploiement
    Et l'administrateur reporte l'affectation de la visite métier dans la planification avec création de l'événement
    Alors les deux ressources sont « 3 - Déploiement » du "2031-03-03" au "2031-03-05" sur le SAMU du déploiement
    Quand l'administrateur décale la visite métier du déploiement au "2031-03-10" - "2031-03-12"
    Alors l'historique du déploiement contient l'action "modification"
    Quand l'administrateur désaffecte la première ressource de la visite métier
    Alors la première ressource n'est plus affectée à la visite métier
    Quand l'administrateur supprime le déploiement avec ses événements
    Alors la réponse a le statut 200
    Et le déploiement n'existe plus
    Et aucune des deux ressources ne reste en « 3 - Déploiement » sur la période

  Scénario: Le jeton Asana n'est jamais affiché
    Quand l'administrateur consulte la configuration Asana
    Alors la réponse indique seulement si un jeton est enregistré, sans le jeton

  Scénario: Import CSV Asana sans doublon
    Étant donné qu'une localisation SAMU-SAS de test existe pour l'import CSV
    Et qu'un export CSV d'un projet Asana pour ce SAMU est disponible
    Quand l'administrateur importe le fichier CSV
    Alors l'aperçu propose les dates du projet avant import
    Et le déploiement est créé à partir du CSV, marqué « repris d'Asana »
    Quand l'administrateur importe une deuxième fois le même fichier CSV
    Alors l'aperçu indique « identique » pour les dates déjà reprises
    Et aucun doublon de déploiement n'est créé

  @asana
  Scénario: Filtre sur l'équipe « SAMU - Bandeau de communication »
    Quand l'administrateur charge la liste des projets Asana
    Alors seuls les projets de l'équipe « SAMU - Bandeau de communication » sont proposés

  @asana
  Scénario: Rafraîchissement : fenêtre des changements
    Étant donné qu'un déploiement repris d'Asana existe
    Quand l'administrateur rafraîchit tous les déploiements depuis Asana
    Alors chaque SAMU est listé avec ses dates avant / après, « déjà à jour » ou son erreur

  @asana
  Scénario: Origine de chaque donnée (Asana / modifiée)
    Étant donné qu'un déploiement repris d'Asana existe
    Quand l'administrateur ouvre les tâches du projet Asana de ce déploiement
    Alors chaque rubrique indique sa règle de reprise, sa valeur Asana et sa valeur actuelle

  @manuel @asana
  Scénario: Plusieurs projets Asana pour un même SAMU
    Étant donné que le SAMU 56 a les projets « SF4 » et « OTN IP »
    Quand je rafraîchis le SAMU
    Alors le sélecteur de projet est proposé et le projet choisi mémorisé

  @manuel @asana
  Scénario: Règles de reprise des dates
    Étant donné un projet Asana type avec jalons et tâches 2.9, 5.1, 5.9
    Quand je récupère le projet
    Alors les dates sont conformes aux règles de la colonne « Selon la règle »

  @manuel @asana
  Scénario: Remplacement manuel d'une tâche (override)
    Quand je choisis une autre tâche pour une rubrique et applique le remplacement
    Alors le remplacement persiste aux rafraîchissements suivants

  @manuel @asana
  Scénario: Logo Asana sur la ligne du SAMU
    Alors le logo Asana est affiché uniquement pour les déploiements repris d'Asana

  @manuel @asana
  Scénario: Import en masse avec filtre mot-clé
    Quand je filtre par mot-clé, coche plusieurs projets et importe
    Alors seuls les projets cochés sont traités
