# language: fr
Fonctionnalité: En-tête de la Planification : utilisateur et profil, changement de profil, boutons, déconnexion, fenêtre « Mon profil », nouveautés, bandeau de mise en production
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

  Scénario: Mon profil : mode d'affichage, onglet par défaut, mot de passe
    Étant donné qu'un compte de test n'a que le profil RH
    Et que je me connecte avec ce compte de test et le profil "RH"
    Quand j'ouvre la fenêtre de mon profil
    Et je choisis le mode d'affichage "Sombre"
    Alors l'application est affichée en mode sombre
    Quand je choisis le mode d'affichage "Clair"
    Alors l'application est affichée en mode clair
    Quand je choisis le premier onglet proposé après l'Accueil comme onglet par défaut
    Alors un message confirme l'onglet par défaut choisi
    Et la connexion du compte de test indique l'onglet par défaut choisi
    Quand je choisis l'Accueil comme onglet par défaut
    Alors un message confirme l'onglet par défaut choisi
    Et la connexion du compte de test indique l'onglet par défaut choisi
    Quand je saisis le nouveau mot de passe "court" dans mon profil
    Alors mon profil signale "8 caractères minimum, 1 caractère spécial requis"
    Quand je saisis le nouveau mot de passe "Profil-E2E-2026!" et sa confirmation dans mon profil
    Alors mon profil signale "Les mots de passe correspondent"
    Quand je change le mot de passe de mon profil et confirme
    Alors le nouveau mot de passe du compte de test est accepté

  Scénario: Mon profil : photo
    Étant donné qu'un compte de test n'a que le profil RH
    Et que je me connecte avec ce compte de test et le profil "RH"
    Quand j'ouvre la fenêtre de mon profil
    Et je choisis une image de test comme photo de profil
    Alors l'aperçu de mon profil présente la photo choisie
    Quand j'enregistre la photo de mon profil
    Alors la photo du compte de test est enregistrée et affichée dans l'en-tête

  Scénario: Mon profil : SAMU de l'expert
    Étant donné que les SAMU de l'expert de test seront rétablis après le scénario
    Et que "Expert" ouvre l'application
    Quand j'ouvre la fenêtre de mon profil
    Et j'ajoute "SAMU 2A" aux SAMU dont je suis expert principal
    Et j'enregistre mes SAMU
    Alors les SAMU de l'expert de test comprennent "SAMU 2A" en principal

  Scénario: Nouveautés de l'aide et favicon à la connexion (paramètres simulés)
    Étant donné qu'un compte de test n'a que le profil RH
    Et que la publication de l'aide "v9.9.9-e2e" et le favicon "grille" seront lus à la connexion (réponse simulée)
    Quand je me connecte avec ce compte de test et le profil "RH"
    Alors la fenêtre des nouveautés présente la version "v9.9.9-e2e"
    Et le favicon de la page est "grille"
    Quand je ferme la fenêtre des nouveautés
    Alors la fenêtre des nouveautés est fermée

  Scénario: Bandeau de mise en production (version simulée)
    Étant donné que la version de l'application est simulée
    Quand j'ouvre la mire de connexion
    Et la version "v-e2e-1" est relue
    Alors aucun bandeau de mise en production n'est affiché
    Quand la version "v-e2e-2" est relue
    Alors le bandeau annonce la nouvelle version "v-e2e-2"
    Quand je masque le bandeau de mise en production
    Alors aucun bandeau de mise en production n'est affiché
    Quand le serveur ne répond plus pendant 3 relectures
    Alors le bandeau annonce une mise en production en cours