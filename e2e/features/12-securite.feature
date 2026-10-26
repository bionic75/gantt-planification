# language: fr
@securite
Fonctionnalité: Sécurité

  Scénario: Requête sans session
    Quand un client sans session appelle les routes protégées suivantes :
      | méthode | route                         |
      | GET     | /api/resources                |
      | GET     | /api/schedule                 |
      | GET     | /api/users                    |
      | GET     | /api/cra/my-list              |
      | GET     | /api/poi                      |
      | GET     | /api/affectation/projects     |
      | POST    | /api/custom-events            |
      | GET     | /api/active-sessions          |
    Alors chaque route répond 401 sans renvoyer de données

  Scénario: Protection CSRF (origine différente)
    Étant donné que le paramètre de test "e2e_csrf" sera supprimé après le scénario
    Quand "Administrateur" enregistre le paramètre "e2e_csrf" à "malveillant" depuis l'origine "https://malveillant.example"
    Alors la réponse a le statut 403
    Et le message d'erreur contient "autre site"
    Quand "Administrateur" enregistre le paramètre "e2e_csrf" à "intersite" avec l'en-tête Sec-Fetch-Site "cross-site"
    Alors la réponse a le statut 403
    Quand "Administrateur" enregistre le paramètre "e2e_csrf" à "legitime" depuis l'origine de l'application
    Alors la réponse a le statut 200
    Et le paramètre "e2e_csrf" vaut "legitime"

  Scénario: Protection CSRF de la connexion
    Quand une connexion est demandée à l'API depuis l'origine "https://malveillant.example"
    Alors la réponse a le statut 403

  Plan du scénario: Injection SQL dans les recherches (<recherche>)
    Quand "<profil>" appelle "GET <route>" avec la saisie "' OR 1=1 --"
    Alors la réponse n'est pas une erreur serveur
    Et la réponse ne contient pas d'erreur SQL
    Et la réponse ne renvoie pas de résultat inattendu

    Exemples:
      | recherche    | profil         | route                                    |
      | lieux        | Utilisateur    | /api/poi?q={saisie}                      |
      | utilisateurs | Administrateur | /api/users/search?q={saisie}             |
      | CRA          | Administrateur | /api/cra/admin/list?user_id={saisie}     |
      | événements   | Administrateur | /api/custom-events/search?label={saisie} |

  Scénario: Cookie de session sécurisé
    Quand un client ouvre une session par l'API de connexion
    Alors le cookie de session est HttpOnly avec un attribut SameSite
    Et le cookie de session est Secure si l'application est servie en HTTPS

  Scénario: Mot de passe jamais renvoyé par l'API
    Quand "Administrateur" appelle "GET /api/users"
    Alors la réponse a le statut 200
    Et aucun utilisateur renvoyé ne contient de mot de passe, de hachage ni de secret TOTP

  # Lecture directe de la base de l'environnement
  @exploitation @manuel
  Scénario: Mot de passe haché en base
    Quand j'inspecte la table des utilisateurs
    Alors les mots de passe sont hachés (bcrypt) et aucun n'est en clair

  Scénario: Envoi volumineux interrompu
    Quand un client sans session interrompt l'envoi d'un fichier de 5 Mo
    Alors le serveur reste disponible

  Scénario: Taille des requêtes limitée sans session
    Quand un client sans session envoie une demande de connexion de 200 Ko
    Alors la réponse a le statut 413

  Scénario: Journal des actions
    Étant donné qu'une ressource standard existe
    Quand l'administrateur enregistre une affectation dans la planification de cette ressource
    Alors le journal des actions de l'administrateur contient une action de sauvegarde du planning
    Et le journal des actions ne contient aucun secret

  Scénario: En-têtes de sécurité
    Quand un client sans session ouvre la page d'accueil
    Alors les en-têtes de sécurité sont présents

  @exploitation
  Scénario: Node 22 corrigé (faille Brotli)
    Quand je consulte la version de Node.js de l'environnement
    Alors la version est 22.23.4 ou supérieure
