# language: fr
@authentification
Fonctionnalité: Connexion, session et double authentification
  Chaque profil dispose d'un compte de test. Les codes de double authentification (OTP) sont envoyés à une
  boîte e-mail partagée : les connexions qui en demandent un sont faites une à une (verrou), dans l'ordre
  chronologique, et le code lu est le plus récent arrivé après la demande.

  Plan du scénario: Connexion avec identifiants valides (<profil>)
    Étant donné que la mire de connexion est ouverte
    Quand je me connecte avec les identifiants du profil "<profil>"
    Alors l'application est ouverte avec le profil "<profil>"
    Et le bandeau affiche le nom de l'utilisateur et le profil "<libellé>"

    Exemples:
      | profil         | libellé        |
      | Administrateur | Administrateur |
      | Expert         | Expert Métier  |
      | Utilisateur    | Utilisateur    |
      | RH             | rh             |

  Scénario: Mot de passe erroné
    Étant donné que la mire de connexion est ouverte
    Quand je me connecte avec l'identifiant du profil "Utilisateur" et le mot de passe "Mauvais-mot-de-passe-1!"
    Alors la mire affiche l'erreur "Identifiants incorrects"
    Et aucune session n'est ouverte
    Quand je me connecte avec l'identifiant "inconnu.e2e.testsansurgences" et le mot de passe "Mauvais-mot-de-passe-1!"
    Alors la mire affiche l'erreur "Identifiants incorrects"
    Et aucune session n'est ouverte

  Plan du scénario: Champs obligatoires de la mire : <champ> vide
    Étant donné que la mire de connexion est ouverte
    Quand je valide la mire en laissant le champ "<champ>" vide
    Alors la mire affiche l'erreur "Veuillez remplir les identifiants"
    Et aucune session n'est ouverte

    Exemples:
      | champ        |
      | Identifiant  |
      | Mot de passe |

  Scénario: Champs obligatoires de la mire : contrôle côté serveur
    Quand une connexion est demandée à l'API sans mot de passe
    Alors la réponse a le statut 400
    Quand une connexion est demandée à l'API sans identifiant
    Alors la réponse a le statut 400

  Scénario: Identifiant vide à l'ouverture de la mire
    Étant donné que le navigateur a déjà mémorisé l'identifiant du profil "Utilisateur"
    Quand j'ouvre la mire de connexion
    Alors le champ "Identifiant" est vide
    Quand je clique dans le champ "Identifiant"
    Alors le champ "Identifiant" n'est pas pré-rempli par l'application

  Scénario: Mot de passe jamais stocké en clair dans le navigateur
    Étant donné que la mire de connexion est ouverte
    Quand je me connecte avec les identifiants du profil "Utilisateur"
    Alors l'application est ouverte avec le profil "Utilisateur"
    Et le mot de passe n'apparaît ni dans le localStorage, ni dans le sessionStorage, ni dans les cookies
    Et le cookie de session est HttpOnly

  Scénario: Session perdue : retour propre sur la mire
    Étant donné que je me suis connecté par la mire avec le profil "Utilisateur"
    Quand la session est supprimée côté serveur
    Et j'effectue une action dans l'application
    Alors l'application a reçu une réponse 401 et non 403
    Et la mire de connexion est affichée, sans écran blanc ni boucle d'erreurs
    Et les applications ouvertes sont fermées

  Scénario: Déconnexion
    Étant donné que je me suis connecté par la mire avec le profil "Utilisateur"
    Quand je clique sur l'icône de déconnexion et confirme
    Alors la mire de connexion est affichée
    Et aucune session n'est ouverte
    Quand j'utilise le bouton Précédent du navigateur
    Alors la mire de connexion est affichée
    Et aucune session n'est ouverte

  @mfa
  Scénario: MFA par e-mail
    Étant donné que la double authentification par e-mail est demandée au profil "Administrateur"
    Et que la mire de connexion est ouverte
    Quand je me connecte avec le profil "Administrateur" en saisissant d'abord un code erroné
    Alors le code erroné a été refusé avec le message "Code invalide ou expiré"
    Et l'application est ouverte avec le profil "Administrateur"

  @mfa @totp
  Scénario: MFA par application TOTP
    Étant donné que le profil "Administrateur" dispose d'une application TOTP configurée
    Et que la mire de connexion est ouverte
    Quand je me connecte avec le profil "Administrateur" en validant par code TOTP
    Alors l'application est ouverte avec le profil "Administrateur"

  @lent @exclusif
  Scénario: Bandeau et minuteur d'inactivité
    Étant donné que le délai d'inactivité est fixé à 1 minute
    Et que je me suis connecté par la mire avec le profil "Utilisateur"
    Alors le minuteur d'inactivité est affiché
    Quand j'effectue une action avant l'échéance
    Alors le minuteur d'inactivité est remis à zéro
    Quand je reste inactif jusqu'à l'échéance
    Alors un avertissement d'inactivité est affiché
    Et la mire de connexion est affichée

  Scénario: Mot de passe à changer à la première connexion
    Étant donné qu'un administrateur a créé un compte "Utilisateur" avec un mot de passe initial
    Et que la mire de connexion est ouverte
    Quand je me connecte avec ce nouveau compte et son mot de passe initial
    Alors le changement de mot de passe est imposé avant tout accès
    Et l'API refuse l'accès aux données tant que le mot de passe n'est pas changé
    Quand je choisis un nouveau mot de passe personnel
    Alors l'application est ouverte pour ce nouveau compte
    Et l'ancien mot de passe de ce compte n'est plus accepté

  @migration
  Plan du scénario: Mot de passe déjà haché relu après migration (<profil>)
    Quand le compte du profil "<profil>" s'authentifie auprès de l'API
    Alors le mot de passe est accepté

    Exemples:
      | profil         |
      | Administrateur |
      | Expert         |
      | Utilisateur    |
      | RH             |

  Scénario: Utilisateurs connectés (bandeau)
    Étant donné que "Utilisateur" est connecté à l'application
    Et que "Administrateur" est connecté à l'application
    Quand "Administrateur" ouvre la liste des utilisateurs connectés
    Alors la liste des utilisateurs connectés contient "Utilisateur"
    Quand "Administrateur" clique sur le bouton de message de "Utilisateur"
    Alors une fenêtre de messagerie vers "Utilisateur" est ouverte
