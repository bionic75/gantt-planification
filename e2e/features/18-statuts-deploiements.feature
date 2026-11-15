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

  Scénario: Un déploiement passe « En service » avec sa date de mise en service
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Et qu'un déploiement de test a une visite métier du "2031-05-12" au "2031-05-13"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Et j'ouvre la section "Paramétrage des déploiements"
    Et je passe le déploiement de test « En service » le "2031-06-15"
    Alors le déploiement de test est « En service » depuis le "2031-06-15" sur la carte

  Scénario: Un expert ne voit pas le paramétrage des déploiements
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "Événements"
    Alors la rubrique de paramétrage des déploiements n'est pas affichée
