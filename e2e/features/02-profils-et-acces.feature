# language: fr
@acces
Fonctionnalité: Profils et accès aux onglets
  Les onglets visibles dépendent du profil (Administration › Configuration de l'accès aux onglets).
  Les routes d'administration sont refusées aux autres profils. La configuration modifiée par un scénario
  est rétablie à la fin du scénario.

  # Onglet CRA du profil RH : utilisé par aucune autre fonctionnalité, qui peut s'exécuter en parallèle pendant que
  # l'onglet est masqué (configuration globale)
  Scénario: Configuration de l'accès aux onglets par profil
    Étant donné que la configuration de l'accès aux onglets sera rétablie après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Configuration de l'accès aux onglets"
    Et je décoche l'onglet "CRA" pour le profil "RH"
    Et j'enregistre la configuration de l'accès aux onglets
    Alors le message de l'accès aux onglets contient "Enregistré"
    Quand "RH" ouvre l'application
    Alors l'onglet "CRA" n'est pas affiché

  # La configuration des onglets ne règle que l'affichage : le serveur ne filtre pas les API selon cette
  # configuration (filtrage prévu dans une phase ultérieure). Le refus vérifié ici est celui d'une route réservée
  # aux administrateurs.
  Scénario: Onglet masqué, route d'administration toujours refusée
    Étant donné que la configuration de l'accès aux onglets sera rétablie après le scénario
    Et que l'onglet "CRA" est décoché pour le profil "RH"
    Quand "RH" ouvre l'application
    Alors l'onglet "CRA" n'est pas affiché
    Quand "RH" appelle "GET /api/custom-events"
    Alors la réponse a le statut 403

  Plan du scénario: Onglet « SAMU-SAS TripAdVisor » accessible à tous (<profil>)
    Étant donné que la configuration de l'accès aux onglets est celle par défaut pour l'onglet "SAMU-SAS TripAdVisor"
    Quand "<profil>" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Alors le contenu de l'onglet "SAMU-SAS TripAdVisor" est affiché

    Exemples:
      | profil         |
      | Administrateur |
      | Utilisateur    |
      | RH             |
      | Expert         |

  Scénario: Menu Applications commun
    Étant donné que je suis connecté en tant que "Administrateur"
    Alors le menu Applications est affiché
    Et pour chaque application proposée, le menu Applications reste disponible et propose le retour à la Planification

  Plan du scénario: Routes d'administration refusées aux non-administrateurs (<profil>)
    Quand "<profil>" appelle les routes réservées suivantes :
      | méthode | route                     |
      | POST    | /api/affectation/projects |
      | GET     | /api/cra/admin/list       |
      | GET     | /api/reporting/connections?dateStart=2026-01-01&dateEnd=2026-01-31 |
      | GET     | /api/users                |
      | PUT     | /api/tab-access           |
    Alors chaque route répond 403 sans renvoyer de données

    Exemples:
      | profil      |
      | Utilisateur |
      | Expert      |

  Scénario: Périmètre du profil RH
    Étant donné que je suis connecté en tant que "RH"
    Alors l'onglet "CRA" est affiché
    Et l'onglet "Administration" n'est pas affiché
    Quand "RH" appelle "GET /api/cra/admin/list"
    Alors la réponse a le statut 200
    Quand "RH" appelle "GET /api/cra/admin/archives"
    Alors la réponse a le statut 200
    Quand "RH" appelle "POST /api/cra/0/archive"
    Alors la réponse a le statut 403
    Quand "RH" appelle "GET /api/users"
    Alors la réponse a le statut 403
    Quand j'ouvre l'onglet "CRA"
    Alors aucun bouton « Archiver » ou « Désarchiver » n'est proposé
