# language: fr
Fonctionnalité: Onglets de la Planification, adresses et changement d'application
  Ordre des onglets (glisser-déposer, mémorisé dans le navigateur pour l'utilisateur), pastille des CRA en cours,
  onglet ouvert à l'arrivée, adresse de chaque onglet et de chaque application (retour arrière du navigateur, ancien
  lien d'une notification, adresse inconnue, adresse demandée avant la connexion), application rouverte après un
  rechargement de la page. Compte de test jetable au profil RH pour l'onglet par défaut ; l'accès aux applications
  donné au compte « Utilisateur » est retiré en fin de scénario.

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
    Et j'ouvre l'adresse "/"
    Alors l'adresse de la page est "/ressources"
    Et le contenu de l'onglet "Ressources" est affiché

  Scénario: Adresse inconnue : onglet par défaut
    Étant donné qu'un compte de test n'a que le profil RH
    Et que je me connecte avec ce compte de test et le profil "RH"
    Quand l'onglet par défaut du compte de test devient "Ressources"
    Et j'ouvre l'adresse "/adresse-inconnue"
    Alors l'adresse de la page est "/ressources"
    Et le contenu de l'onglet "Ressources" est affiché

  Scénario: Adresse de chaque onglet, retour arrière du navigateur entre les onglets
    Étant donné que "Administrateur" ouvre l'application
    Quand j'ouvre l'onglet "Planification"
    Alors l'adresse de la page est "/planification"
    Quand j'ouvre l'onglet "Ressources"
    Alors l'adresse de la page est "/ressources"
    Quand je reviens à la page précédente du navigateur
    Alors l'adresse de la page est "/planification"
    Et le contenu de l'onglet "Planification" est affiché
    Quand je recharge la page
    Alors le contenu de l'onglet "Planification" est affiché

  Scénario: Ancien lien d'une notification vers l'onglet CRA redirigé vers son adresse
    Étant donné que "Administrateur" ouvre l'application à l'adresse "/?tab=cra"
    Alors l'adresse de la page est "/cra"
    Et le contenu de l'onglet "CRA" est affiché

  Scénario: Adresse demandée avant la connexion ouverte après la connexion
    Quand "Utilisateur" se connecte par la mire à l'adresse "/evenements"
    Alors l'adresse de la page est "/evenements"
    Et le contenu de l'onglet "Événements" est affiché

  Scénario: Application rouverte après un rechargement, puis retour à la Planification
    Étant donné que "Utilisateur" a accès à l'application « Analyse de fichiers »
    Et que "Utilisateur" ouvre l'application
    Quand j'ouvre l'application "Analyse de fichiers" depuis le menu Applications
    Alors l'application « Analyse de fichiers » est affichée
    Et l'adresse de la page est "/analyse"
    Quand je recharge la page
    Alors l'application « Analyse de fichiers » est affichée
    Quand j'ouvre l'application "Planification" depuis le menu Applications
    Alors la Planification est affichée
