# language: fr
@affectation
Fonctionnalité: Aide à l'affectation : profil « Utilisateur »
  Ce que l'application propose à un compte non administrateur autorisé sur l'application, onglet par onglet. Les
  scénarios sont réunis dans cette fonctionnalité (jouée par un seul processus) : l'accès de « Utilisateur » à
  l'application, donné puis retiré en fin de scénario, ne doit pas être retiré pendant qu'une autre fonctionnalité
  jouée en parallèle s'en sert. Données de test (localisation, déploiement, événements, ressource) supprimées en fin
  de scénario.

  Contexte:
    Étant donné que "Utilisateur" a accès à l'application « Aide à l'affectation opérationnelle »

  Scénario: Événements : ni suppression ni recherche des doublons
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'un événement « Visite métier » de test "A" a lieu du "2031-03-03" au "2031-03-05"
    Et qu'un événement « Visite métier » de test "B" a lieu le "2031-03-10"
    Et que j'ouvre les événements de l'aide à l'affectation en tant que "Utilisateur"
    Quand je filtre les événements sur le SAMU de test
    Alors la liste des événements compte "2 événements"
    Et aucun bouton de suppression ni de recherche des doublons n'est proposé

  Scénario: Planning : affectation sans synchronisation ni désaffectation
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'une ressource de test est « 2 - Disponible » du "2031-03-03" au "2031-03-05"
    Et que j'ouvre le planning des déploiements en tant que "Utilisateur"
    Et que j'affiche la période du "2031-03-01" au "2031-03-14"
    Quand j'ouvre l'affectation de la visite métier du SAMU de test
    Alors la fenêtre d'affectation ne propose pas « Synchroniser »
    Quand je coche le "2031-03-03" pour la ressource de test et j'enregistre
    Alors la fenêtre d'affectation est fermée sans report proposé
    Et la ressource de test intervient le "2031-03-03" sur la visite métier du déploiement

  Scénario: Administration : onglet réservé à l'administrateur
    Quand j'ouvre le planning des déploiements en tant que "Utilisateur"
    Alors l'onglet « Administration » de l'aide à l'affectation n'est pas proposé

  Scénario: Ateliers métier : simulation en lecture seule
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05" et sa mise en production le "2032-09-15"
    Et que j'ouvre les ateliers métier en tant que "Utilisateur"
    Quand je choisis le SAMU de test dans la simulation
    Et je choisis la zone "A" et 3 ateliers
    Alors le rétroplanning simulé présente la visite métier, 3 ateliers et la mise en production
    Et l'enregistrement est réservé aux administrateurs
