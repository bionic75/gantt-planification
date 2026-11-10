# language: fr
Fonctionnalité: En-tête de la Planification : utilisateur et profil, changement de profil, boutons, déconnexion
  Comptes de test jetables, supprimés en fin de scénario : profils RH et Utilisateur (le profil RH n'est jamais soumis
  à la double authentification). La déconnexion est faite sur une session ouverte pour le scénario. Menu Applications,
  enveloppe des invitations et pastille des nouvelles affectations : 02-profils-et-acces et 30-planification-saisie.

  Scénario: Compte à deux profils : profil affiché, puis changement de profil
    Étant donné qu'un compte de test a les profils RH et Utilisateur
    Quand je me connecte avec ce compte de test et le profil "RH"
    Alors l'en-tête présente le compte de test avec le profil "RH"
    Et l'enveloppe des invitations n'est pas proposée
    Quand j'ouvre la liste des profils de l'en-tête
    Alors la liste des profils propose "RH", profil actif, et "Utilisateur"
    Quand je choisis le profil "Utilisateur" dans l'en-tête
    Alors la session du compte de test a le profil "Utilisateur"
    Et l'en-tête présente le compte de test avec le profil "Utilisateur"
    Et l'enveloppe des invitations est proposée

  Scénario: Compte au seul profil RH : libellé du profil
    Étant donné qu'un compte de test n'a que le profil RH
    Quand je me connecte avec ce compte de test et le profil "RH"
    Alors l'en-tête présente le compte de test avec le profil "RH"
    Et l'en-tête ne propose pas de changement de profil

  Scénario: Boutons de l'en-tête : aide en ligne et accueil
    Étant donné que "Utilisateur" ouvre l'application
    Quand je clique sur le bouton d'aide en ligne de l'en-tête
    Alors l'aide en ligne s'ouvre dans une nouvelle fenêtre
    Quand je clique sur le bouton Accueil de l'en-tête
    Alors l'accueil de la Planification est affiché

  Scénario: Déconnexion annulée, puis confirmée
    Étant donné qu'un compte de test n'a que le profil RH
    Et que je me connecte avec ce compte de test et le profil "RH"
    Quand je clique sur l'icône de déconnexion et annule
    Alors l'application reste ouverte
    Quand je clique sur l'icône de déconnexion et confirme
    Alors la mire de connexion est affichée
