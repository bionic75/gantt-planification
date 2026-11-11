# language: fr
Fonctionnalité: Clôture de la migration : politique de sécurité du contenu, décor de la page, aide en ligne
  Scripts et feuilles de style servis par l'application seulement (aucun script ni style en ligne ; toute violation
  fait aussi échouer les autres scénarios, e2e/support/fixtures.js), décor de la page repris en modules (mode
  d'affichage, thèmes, mise en page, icônes), aide en ligne servie avec son point d'entrée. Le mode d'affichage choisi
  n'est mémorisé que dans le navigateur du scénario.

  Plan du scénario: Page ouverte sans violation de la politique de sécurité du contenu
    Étant donné que la page "<adresse>" est ouverte par "<profil>" en relevant les violations de la politique de sécurité
    Alors la page ne signale aucune violation de la politique de sécurité

    Exemples:
      | adresse         | profil         |
      | /               | personne       |
      | /planification  | Administrateur |
      | /administration | Administrateur |
      | /cra            | Administrateur |
      | /ressources     | Administrateur |
      | /evenements     | Administrateur |
      | /reporting      | Administrateur |
      | /astreintes     | Administrateur |
      | /samu-sas       | Administrateur |
      | /affectation    | Administrateur |
      | /deplacements   | Administrateur |
      | /analyse        | Administrateur |
      | /aide.html      | personne       |
      | /mobile.html    | personne       |

  Scénario: Mode sombre gardé après un rechargement, appliqué avant l'affichage
    Étant donné que "Utilisateur" ouvre l'application
    Quand je passe en mode sombre par la barre d'outils
    Et je recharge la page
    Alors le mode sombre est appliqué dès le chargement de la page
    Quand je passe en mode clair par la barre d'outils
    Alors le mode sombre n'est pas appliqué

  Scénario: Aide en ligne : icônes et bouton « Retour à l'application »
    Étant donné que "Utilisateur" ouvre l'application
    Quand je clique sur le bouton d'aide en ligne de l'en-tête
    Alors l'aide en ligne s'ouvre dans une nouvelle fenêtre
    Et les émojis de l'aide en ligne sont remplacés par des icônes
    Quand je clique sur « Retour à l'application » dans l'aide en ligne
    Alors la fenêtre de l'aide en ligne est fermée
