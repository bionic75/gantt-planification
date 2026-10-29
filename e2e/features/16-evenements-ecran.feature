# language: fr
@evenements
Fonctionnalité: Onglet Événements : formulaire, liste, exports
  Événements de test en mai 2031 (année repliée par défaut dans la liste) ; événements, types, localisations et
  planification de l'expert créés par les scénarios sont supprimés ou remis à zéro en fin de scénario.

  Scénario: Création d'un événement depuis le formulaire
    Étant donné qu'un type d'événement de test existe
    Et qu'une localisation SAMU de test géolocalisée existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Ajouter / Modifier un événement"
    Et je saisis un événement du type de test du "2031-05-12" au "2031-05-13" sur la localisation de test
    Et j'ajoute le participant interne "Expert" et l'invité externe "invite.e2e@exemple.fr"
    Alors la prévisualisation reprend les dates, le type, le libellé, la localisation et le participant "Expert"
    Quand j'ajoute l'événement et le planning est rechargé
    Alors le formulaire de l'événement est replié
    Et l'événement saisi est affiché en mai 2031 avec la localisation de test et le participant "Expert"
    Et l'événement saisi est enregistré avec le type, la localisation, la période "FULL" et les participants

  Scénario: Demi-journée : choix proposé pour un seul jour
    Étant donné qu'un type d'événement de test existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Ajouter / Modifier un événement"
    Et je saisis un événement du type de test du "2031-05-14" au "2031-05-16"
    Alors le choix de la demi-journée n'est pas proposé
    Quand je saisis un événement du type de test du "2031-05-14" au "2031-05-14"
    Et je choisis la demi-journée "Matin"
    Et j'ajoute l'événement et le planning est rechargé
    Alors l'événement saisi est enregistré avec la période "AM"

  Scénario: Champs obligatoires du formulaire
    Étant donné qu'un type d'événement de test existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Ajouter / Modifier un événement"
    Et j'ajoute l'événement
    Alors une alerte affiche "Veuillez choisir un type d'événement"
    Quand je choisis le type de test
    Et j'ajoute l'événement
    Alors une alerte affiche "Veuillez sélectionner une date de début"
    Quand je saisis la date de début "2031-05-15"
    Et j'ajoute l'événement
    Alors une alerte affiche "Veuillez saisir un libellé"

  Scénario: Modification puis suppression par l'administrateur
    Étant donné que l'administrateur a créé un événement de test le "2031-05-23"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'affiche l'événement de test en mai 2031
    Et je modifie l'événement de test depuis la liste
    Alors le formulaire présente l'événement de test et le choix de son créateur
    Quand je renomme l'événement en "RENOMMÉ IHM E2E" et l'enregistre
    Alors l'événement de test s'appelle "RENOMMÉ IHM E2E"
    Quand j'affiche l'événement de test en mai 2031
    Et je supprime l'événement de test depuis la liste et je confirme
    Alors l'événement de test n'est plus affiché
    Et l'événement n'existe plus

  Scénario: Actions proposées selon le profil
    Étant donné que l'administrateur a créé un événement de test le "2031-05-23"
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'affiche l'événement de test en mai 2031
    Alors l'événement de test propose la modification mais pas la suppression
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'affiche l'événement de test en mai 2031
    Alors l'événement de test propose « Participer »

  Scénario: Un expert se déclare participant
    Étant donné que l'administrateur a créé un événement de test le "2031-05-27"
    Et que la planification de l'expert de mai 2031 sera remise à zéro
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'affiche l'événement de test en mai 2031
    Et je me déclare participant à l'événement de test
    Alors une alerte affiche "Vous avez été inscrit(e) comme participant"
    Et l'événement créé a "Expert" pour participant

  Scénario: Tri des années et filtres de la liste
    Étant donné que l'administrateur a créé un événement de test le "2030-05-06"
    Et que l'administrateur a créé un événement de test le "2031-05-06" avec "Expert" en participant
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Alors la liste présente l'année 2031 avant l'année 2030
    Quand je change le tri des années
    Alors la liste présente l'année 2030 avant l'année 2031
    Quand je filtre la liste sur le participant "Expert" et la période du "2030-01-01" au "2031-12-31"
    Et j'affiche l'événement de test en mai 2031
    Alors seul l'événement de test avec participant est affiché parmi les événements de test

  Scénario: Exports CSV et HTML de la liste filtrée
    Étant donné que l'administrateur a créé un événement de test le "2031-05-06"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et je filtre la liste sur la période du "2031-05-06" au "2031-05-06"
    Alors l'export CSV de la liste donne le fichier "evenements" avec l'événement de test
    Et l'export HTML de la liste donne le fichier "evenements" avec l'événement de test

  Scénario: Localisation créée depuis le formulaire
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Ajouter / Modifier un événement"
    Et je crée une localisation de test depuis le formulaire de l'événement
    Alors la localisation de test est choisie dans le formulaire de l'événement

  Scénario: Carte des événements
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la carte des événements
    Alors la carte des événements est affichée
