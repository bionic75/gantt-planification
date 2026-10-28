# language: fr
@reporting
Fonctionnalité: Reporting des connexions
  Les connexions des comptes de test (mise en place de la campagne) alimentent le rapport du mois courant.

  Contexte:
    Étant donné que je suis connecté en tant que "Administrateur"
    Et que j'ouvre l'onglet "Reporting"
    Et que j'ouvre la section "Suivi des connexions utilisateurs"

  Scénario: Rapport de connexions : une ligne par utilisateur
    Quand je génère le rapport des connexions du mois courant
    Alors le rapport contient une seule ligne par utilisateur
    Et le compte "Administrateur" figure dans le rapport avec son badge de profil
    Et le total affiché est la somme des connexions des lignes
    Et le profil « system » n'apparaît pas dans le rapport

  Plan du scénario: Rapport de connexions : tri par la colonne « <colonne> »
    Quand je génère le rapport des connexions du mois courant
    Et je trie le rapport par la colonne "<colonne>"
    Alors le rapport est trié par "<colonne>" dans un sens
    Quand je trie le rapport par la colonne "<colonne>"
    Alors le rapport est trié par "<colonne>" dans l'autre sens
    Quand je génère le rapport des connexions du mois courant
    Alors le rapport est toujours trié par "<colonne>"

    Exemples:
      | colonne            |
      | Utilisateur        |
      | Login              |
      | Profil             |
      | Nb connexions      |
      | Dernière connexion |

  Scénario: Période personnalisée
    Quand je choisis l'intervalle libre avec seulement la date de début renseignée
    Et je lance la génération du rapport des connexions
    Alors une alerte affiche "Veuillez renseigner les deux dates."
    Quand je choisis l'intervalle libre du premier jour du mois courant à aujourd'hui
    Et je lance la génération du rapport des connexions
    Alors le compte "Administrateur" figure dans le rapport
    Et le rapport par l'API sur cette période, bornes incluses, donne les mêmes totaux

  Scénario: Période sans connexion
    Quand je choisis l'intervalle libre du "2020-01-01" au "2020-01-31"
    Et je lance la génération du rapport des connexions
    Alors le rapport des connexions affiche "Aucune connexion sur cette période" et un total de 0

  Scénario: Période personnalisée : contrôle côté serveur
    Quand "Administrateur" appelle "GET /api/reporting/connections?dateStart=2026-01-01"
    Alors la réponse a le statut 400

  Scénario: Filtre par utilisateurs
    Quand je sélectionne les utilisateurs "Administrateur" et "Expert"
    Et je génère le rapport des connexions du mois courant
    Alors le rapport ne contient que les comptes "Administrateur" et "Expert"
