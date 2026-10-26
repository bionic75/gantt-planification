# language: fr
@non-regression
Fonctionnalité: Non-régression des onglets et applications
  Chaque écran se charge sans erreur JavaScript, sans violation de la politique de sécurité du contenu (CSP)
  et sans réponse 5xx de l'application.

  Plan du scénario: Ouverture de chaque onglet (<profil>)
    Étant donné que je suis connecté en tant que "<profil>"
    Quand j'ouvre successivement chaque onglet visible
    Alors au moins les onglets "<onglets>" ont été ouverts
    Et aucune erreur technique n'est survenue

    Exemples:
      | profil         | onglets                                                  |
      | Administrateur | Ressources, Événements, Planification, Reporting, Administration |
      | Expert         | Planification                                            |
      | Utilisateur    | Planification                                            |
      | RH             | Ressources                                               |

  Scénario: Ouverture de chaque application du menu Applications
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre successivement chaque application du menu Applications
    Alors aucune erreur technique n'est survenue

  Scénario: Page mobile
    Étant donné que "Expert" ouvre l'application mobile
    Alors le planning personnel mobile est affiché
    Et aucune erreur technique n'est survenue

  Scénario: Page d'aide
    Quand j'ouvre l'aide en ligne
    Alors aucune erreur technique n'est survenue
