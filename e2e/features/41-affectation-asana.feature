# language: fr
@affectation
Fonctionnalité: Aide à l'affectation : Asana
  Connexion Asana (projets du périmètre, filtre, analyse, appariement, import en masse), import d'un export CSV,
  rafraîchissements, changements constatés, conflits à trancher et tâches du projet Asana d'un déploiement.
  Ni le poste local ni la CI n'ont de données Asana : les réponses des routes Asana (/api/affectation/asana/*,
  …/asana-refresh, …/asana-conflicts, …/asana-tasks, …/asana-overrides) sont simulées dans le navigateur, sans
  écriture en base. L'import CSV, lui, passe par le serveur : le déploiement créé est supprimé en fin de scénario.

  Scénario: Connexion non configurée
    Étant donné que la connexion Asana simulée n'est pas configurée
    Quand j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Alors la rubrique « Connexion Asana » indique "La connexion Asana n'est pas encore configurée"

  Scénario: Projets du périmètre : filtre, analyse sans écriture, appariement
    Étant donné qu'Asana simulé propose 3 projets de déploiement
    Quand j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Alors la rubrique « Connexion Asana » indique "espace de travail Espace E2E · équipe Équipe E2E"
    Et 3 projets Asana sont listés
    Quand je filtre les projets Asana sur "nice"
    Alors le compteur des projets Asana indique "1 / 3"
    Quand j'efface le filtre des projets Asana
    Et j'analyse tous les projets Asana
    Alors le projet "Lyon" indique "2 à mettre à jour"
    Et le projet "Nice" indique "⚠ 1 conflit"
    Et le projet "Brest" indique "ignoré"
    Et Asana a été interrogé 2 fois en aperçu, sans import
    Quand j'apparie le projet "Nice" au déploiement "SAMU 9001"
    Alors l'appariement demandé relie le projet "Nice" au déploiement 990001
    Et la liste des projets Asana est relue

  Scénario: Import en masse : changements constatés et conflits remis à plus tard
    Étant donné qu'Asana simulé propose 3 projets de déploiement
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je coche les projets Asana "Lyon" et "Nice"
    Alors le bouton d'import indique "Importer la sélection (2)"
    Quand j'importe la sélection et je confirme
    Alors la fenêtre des conflits présente "Visite métier" pour "SAMU 9002"
    Quand je remets les conflits à plus tard
    Alors la fenêtre des changements s'intitule "Import Asana — changements constatés"
    Et la fenêtre des changements présente "SAMU 9001" créé avec "Cadrage" de "—" à "03/02/2031 → 14/02/2031"
    Quand je ferme la fenêtre des changements
    Alors le compte rendu de l'import indique "Terminé : 1 créé(s), 1 mis à jour, 0 déjà à jour."
    Et Asana a reçu 2 imports automatiques

  Scénario: Import d'un export CSV d'Asana (serveur réel)
    Étant donné qu'une localisation SAMU-SAS de test existe pour l'import CSV
    Et qu'un export CSV d'un projet Asana pour ce SAMU est disponible
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand j'ouvre « Importer depuis Asana »
    Et je charge l'export CSV dans la fenêtre d'import
    Alors l'aperçu annonce la création du déploiement du SAMU de test
    Et l'aperçu propose la rubrique "Visite métier" en "Nouveau", cochée
    Quand j'applique la sélection de l'import
    Alors une alerte affiche "Déploiement créé"
    Quand je ferme le message
    Alors le déploiement importé est repris d'Asana, avec sa mise en service au "2031-04-08"

  Scénario: Rafraîchissement d'un déploiement : changements, puis conflit tranché
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'Asana simulé modifie la visite métier du déploiement de test et signale un conflit sur la mise en service
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je rafraîchis le déploiement de test depuis Asana
    Alors la fenêtre des conflits présente "Mise en service" pour le SAMU de test
    Quand je reprends la valeur d'Asana pour "Mise en service" et je valide mes choix
    Alors l'arbitrage envoyé reprend Asana pour « mise_en_service »
    Et une annonce indique "Conflits tranchés : 1 reprise(s) depuis Asana, 0 valeur(s) conservée(s) dans l'application."
    Et la fenêtre des changements s'intitule "Changements issus d'Asana — {samu}"
    Et la fenêtre des changements présente "Visite métier" de "03/03/2031 → 05/03/2031" à "10/03/2031 → 12/03/2031"

  Scénario: Rafraîchissement depuis la grille d'un déploiement déjà à jour
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'Asana simulé n'a rien de nouveau pour le déploiement de test
    Et que j'ouvre le planning des déploiements en tant que "Administrateur"
    Et que j'affiche la période du "2031-03-01" au "2031-03-14"
    Quand je rafraîchis depuis Asana la ligne du SAMU de test dans la grille
    Alors une annonce indique "{samu} : déjà à jour avec Asana ([E2E] Projet de test)."

  Scénario: Tout rafraîchir : déploiements à jour, sans projet et en erreur
    Étant donné qu'Asana simulé rafraîchit tous les déploiements
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je rafraîchis tous les déploiements depuis Asana
    Alors la fenêtre des changements s'intitule "Rafraîchissement depuis Asana — changements constatés"
    Et la fenêtre des changements présente "SAMU 9001" mis à jour avec "Cadrage" de "—" à "03/02/2031 → 14/02/2031"
    Et la fenêtre des changements liste "Déjà à jour : SAMU 9002"
    Et la fenêtre des changements liste "Sans projet Asana correspondant : SAMU 9004"
    Et la fenêtre des changements liste "Erreurs : SAMU 9005 — Projet Asana illisible"
    Quand je ferme la fenêtre des changements
    Alors le bouton « Tout rafraîchir depuis Asana » est de nouveau disponible

  Scénario: Tâches du projet Asana : origine des valeurs, remplacement, retour à la règle, application
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'Asana simulé fournit les tâches du projet du déploiement de test
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand j'ouvre les tâches du projet Asana du déploiement de test
    Alors la rubrique "Début du projet" est indiquée « Asana (origine) »
    Et la rubrique "Visite métier" est indiquée « ✎ modifiée dans l'outil »
    Et la tâche "Tâche sans date" ne peut pas être choisie
    Et l'événement associé à "Visite métier" propose « Nouveau »
    Et la liste de toutes les tâches compte 4 tâches
    Quand je remplace le début et la fin de "Visite métier" par la tâche "5.2"
    Alors la rubrique "Visite métier" est marquée « remplacé », avec "10/03/2031 → 12/03/2031" après remplacement
    Quand je remets toutes les rubriques sur la règle
    Alors la rubrique "Visite métier" n'est plus marquée « remplacé »
    Quand je remplace le début et la fin de "Visite métier" par la tâche "5.2"
    Et j'applique les remplacements
    Alors les remplacements envoyés reprennent la tâche "5.2" pour le début et la fin de « visite_metier »
    Et la fenêtre des changements s'intitule "Remplacements appliqués — {samu}"

  Scénario: Tâches du projet Asana : choix du projet parmi ceux du même SAMU
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'Asana simulé fournit les tâches du projet du déploiement de test
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand j'ouvre les tâches du projet Asana du déploiement de test
    Et je choisis le projet Asana "[E2E] Ancien projet" pour ce déploiement
    Alors l'appariement demandé relie le projet "Ancien projet" au déploiement de test
    Et les tâches du projet Asana sont relues
