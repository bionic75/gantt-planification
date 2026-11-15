# language: fr
@evenements
Fonctionnalité: Événements / Cartographie : paramétrage des statuts de déploiement
  Les statuts et déploiements de test créés par les scénarios sont supprimés en fin de scénario.

  Scénario: L'administrateur ajoute un statut coloré
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Paramétrage des déploiements"
    Et j'ajoute le statut de déploiement de test
    Alors le statut de déploiement de test est listé

  Scénario: Un SAMU ajouté à la liste passe « En service » avec sa date de mise en service
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Paramétrage des déploiements"
    Et j'ajoute le SAMU de test à la liste des déploiements
    Et je passe le SAMU de test « En service » le "2031-06-15"
    Alors le SAMU de test est « En service » depuis le "2031-06-15"

  Scénario: La carte colore le département d'un SAMU en service et masque ses calques
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Et que le SAMU de test a le statut « En service » depuis le "2031-06-15"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la carte des événements
    Alors la carte colore 1 département
    Quand je masque le calque « Départements » de la carte
    Alors la carte colore 0 département
    Quand j'affiche le calque « Départements » de la carte
    Alors la carte colore 1 département

  Scénario: Un expert ne voit pas le paramétrage des déploiements
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Alors la rubrique de paramétrage des déploiements n'est pas affichée
