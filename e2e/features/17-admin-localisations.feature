# language: fr
@administration
Fonctionnalité: Administration › Localisations (écran)
  Les localisations créées par les scénarios (formulaire, import CSV) sont supprimées en fin de scénario. Les données
  de test sont créées avant l'ouverture de l'application : la liste des localisations est chargée à la connexion.

  Scénario: Création depuis le formulaire, libellés en majuscules
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'ouvre le formulaire de localisation
    Et je saisis la localisation "e2e lieu ihm", "zihm", "1 rue du test, paris" aux coordonnées "48.85", "2.35"
    Et j'enregistre la localisation
    Alors le formulaire de localisation est replié
    Et la liste des localisations présente "E2E LIEU IHM" avec "ZIHM", "1 RUE DU TEST, PARIS", "48.85" et "2.35"

  Scénario: Libellés obligatoires
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'ouvre le formulaire de localisation
    Et j'enregistre la localisation
    Alors une alerte affiche "Le libellé long et le libellé court sont obligatoires."

  Scénario: Modification depuis la liste
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'ouvre la liste des localisations
    Et je modifie la localisation de test depuis la liste
    Alors le formulaire « Modifier la localisation » présente la localisation de test
    Quand je change son libellé court en "zmod" et l'enregistre
    Alors la liste des localisations présente la localisation de test avec le libellé court "ZMOD"

  Scénario: Tri de la liste
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'ouvre la liste des localisations
    Et je trie la liste des localisations par "Libellé court"
    Alors la liste des localisations est triée par libellé court dans l'ordre croissant
    Quand je trie la liste des localisations par "Libellé court"
    Alors la liste des localisations est triée par libellé court dans l'ordre décroissant

  Scénario: Suppression d'une localisation utilisée : usages signalés
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Et que l'administrateur a créé un événement sur la localisation de test le "2031-06-11"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'ouvre la liste des localisations
    Et je supprime la localisation de test depuis la liste et je confirme
    Alors la confirmation signalait "ATTENTION" et "1 événement(s)"
    Et la localisation de test n'est plus dans la liste
    Et l'import des localisations affiche "1 localisation(s) supprimée(s)"

  Scénario: Suppression de la sélection
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Et qu'une seconde localisation SAMU de test existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'ouvre la liste des localisations
    Et je sélectionne les deux localisations de test
    Alors le bouton « Supprimer la sélection (2) » est proposé
    Quand je supprime la sélection et je confirme
    Alors la confirmation signalait "Supprimer 2 localisations ?"
    Et les deux localisations de test ne sont plus dans la liste

  Scénario: Import CSV : nouvelle localisation et conflit résolu en écrasant
    Étant donné qu'une localisation SAMU de test géolocalisée existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre la section « Localisation » de l'administration
    Et j'importe un fichier CSV modifiant la localisation de test et ajoutant une nouvelle localisation
    Alors l'import des localisations affiche "1 ajouté(s) | 1 avec données différentes"
    Et les conflits d'import présentent la localisation de test avec des données différentes
    Quand je choisis d'écraser avec le CSV et j'applique les choix
    Alors l'import des localisations affiche "1 localisation(s) mise(s) à jour"
    Et la localisation de test a les données du fichier CSV
    Et la nouvelle localisation du fichier CSV existe
