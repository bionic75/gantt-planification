# language: fr
Fonctionnalité: Onglets de la Planification et changement d'application
  Ordre des onglets (glisser-déposer, mémorisé dans le navigateur pour l'utilisateur), pastille des CRA en cours,
  onglet ouvert à l'arrivée, application rouverte après un rechargement de la page. Compte de test jetable au profil RH
  pour l'onglet par défaut ; l'accès aux applications donné au compte « Utilisateur » est retiré en fin de scénario.

  Scénario: Ordre des onglets changé par glisser-déposer, gardé après un rechargement
    Étant donné que "Administrateur" ouvre l'application
    Quand je fais glisser l'onglet "Reporting" sur l'onglet "Ressources"
    Alors l'onglet "Reporting" précède l'onglet "Ressources"
    Quand je recharge la page
    Alors l'onglet "Reporting" précède l'onglet "Ressources"

  Scénario: Pastille des CRA en cours de traitement
    Étant donné que "Administrateur" ouvre l'application
    Alors la pastille de l'onglet CRA présente le nombre de CRA en cours de "Administrateur"

  Scénario: Onglet par défaut ouvert à l'arrivée dans l'application
    Étant donné qu'un compte de test n'a que le profil RH
    Et que je me connecte avec ce compte de test et le profil "RH"
    Quand l'onglet par défaut du compte de test devient "Ressources"
    Et je recharge la page
    Alors le contenu de l'onglet "Ressources" est affiché

  Scénario: Application rouverte après un rechargement, puis retour à la Planification
    Étant donné que "Utilisateur" a accès à l'application « Analyse de fichiers »
    Et que "Utilisateur" ouvre l'application
    Quand j'ouvre l'application "Analyse de fichiers" depuis le menu Applications
    Alors l'application « Analyse de fichiers » est affichée
    Quand je recharge la page
    Alors l'application « Analyse de fichiers » est affichée
    Quand j'ouvre l'application "Planification" depuis le menu Applications
    Alors la Planification est affichée
