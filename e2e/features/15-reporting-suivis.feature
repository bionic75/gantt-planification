# language: fr
@reporting
Fonctionnalité: Reporting : disponibilités, HNO / astreintes, événements
  Chaque scénario crée ses ressources (experts) ou ses événements avant d'ouvrir l'application : les listes du
  reporting sont chargées à l'ouverture.

  # ---------- Suivi des disponibilités / des affectations ----------

  Scénario: Disponibilités : rapport d'un expert, totaux identiques à l'API
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je choisis seulement la ressource "Alpha" pour le rapport des disponibilités
    Et je génère le rapport des disponibilités
    Alors le rapport des disponibilités contient la ressource "Alpha", la ligne TOTAL et 4 mois
    Et le total du rapport des disponibilités est celui de l'API

  Scénario: Disponibilités : tri par expert
    Étant donné qu'une ressource de reporting "Alpha" existe
    Et qu'une ressource de reporting "Bravo" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je choisis seulement les ressources "Alpha" et "Bravo" pour le rapport des disponibilités
    Et je génère le rapport des disponibilités
    Et je trie le rapport des disponibilités par expert
    Alors le rapport des disponibilités liste "Alpha" avant "Bravo"
    Quand je trie le rapport des disponibilités par expert
    Alors le rapport des disponibilités liste "Bravo" avant "Alpha"

  Scénario: Disponibilités : filtre par fonction
    Étant donné qu'une ressource de reporting "Alpha" de fonction "Coordinateur" existe
    Et qu'une ressource de reporting "Bravo" de fonction "Formateur" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je filtre les experts du rapport sur la fonction "Coordinateur"
    Alors la liste des experts du rapport propose "Alpha", sélectionnée, et pas "Bravo"

  Scénario: Disponibilités : contrôles avant génération
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je ne choisis aucun expert pour le rapport des disponibilités
    Et je génère le rapport des disponibilités
    Alors une alerte affiche "Veuillez sélectionner au moins un expert"

  Scénario: Disponibilités : période inversée
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je choisis seulement la ressource "Alpha" pour le rapport des disponibilités
    Et je choisis une période de fin antérieure au début pour le rapport des disponibilités
    Et je génère le rapport des disponibilités
    Alors une alerte affiche "La date de début doit être antérieure à la date de fin"

  Scénario: Disponibilités : export CSV et impression
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je choisis seulement la ressource "Alpha" pour le rapport des disponibilités
    Et je génère le rapport des disponibilités
    Alors l'export CSV du rapport des disponibilités donne le fichier "reporting_disponibilites" avec la ressource "Alpha"
    Et l'impression du rapport des disponibilités ouvre la fenêtre "Reporting Disponibilités/Affectations" avec la ressource "Alpha"

  Scénario: Disponibilités : diagnostic des données d'un expert
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des disponibilités / Suivi des affectations"
    Et je choisis seulement la ressource "Alpha" pour le rapport des disponibilités
    Et je lance le diagnostic des données
    Alors le diagnostic de la ressource "Alpha" est affiché

  # ---------- Suivi des HNO / Astreintes ----------

  Scénario: HNO / Astreintes : rapport de l'année, totaux identiques à l'API
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des HNO / Astreintes"
    Et je choisis seulement la ressource "Alpha" pour le rapport HNO / Astreintes
    Et je génère le rapport HNO / Astreintes
    Alors le rapport HNO / Astreintes contient la ressource "Alpha", la ligne TOTAL et 12 mois en colonnes "HNO" et "ASTR"
    Et le total du rapport HNO / Astreintes est celui de l'API

  Scénario: HNO / Astreintes : un seul type de données
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des HNO / Astreintes"
    Et je choisis seulement la ressource "Alpha" pour le rapport HNO / Astreintes
    Et je décoche "Astreintes" pour le rapport HNO / Astreintes
    Et je génère le rapport HNO / Astreintes
    Alors le rapport HNO / Astreintes n'a que des colonnes "HNO"
    Quand je décoche "HNO" pour le rapport HNO / Astreintes
    Et je génère le rapport HNO / Astreintes
    Alors une alerte affiche "Veuillez sélectionner au moins un type de données (HNO ou Astreintes)"

  Scénario: HNO / Astreintes : export CSV
    Étant donné qu'une ressource de reporting "Alpha" existe
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des HNO / Astreintes"
    Et je choisis seulement la ressource "Alpha" pour le rapport HNO / Astreintes
    Et je génère le rapport HNO / Astreintes
    Alors l'export CSV du rapport HNO / Astreintes donne le fichier "reporting_hno_astreintes" avec la ressource "Alpha"

  # ---------- Suivi des événements ----------

  Scénario: Événements : recherche par libellé, export CSV
    Étant donné qu'un événement de reporting existe avec le participant "Expert"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des événements"
    Et je recherche les événements par le libellé de l'événement de reporting
    Alors le suivi des événements affiche "1 événement(s) trouvé(s)" et l'événement de reporting
    Et l'export CSV du suivi des événements donne le fichier "suivi_evenements" avec l'événement de reporting

  Scénario: Événements : participants requis, puis réinitialisation
    Étant donné qu'un événement de reporting existe avec le participant "Expert"
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "Reporting"
    Et j'ouvre la section "Suivi des événements"
    Et j'ajoute le participant "Expert" au suivi des événements
    Et je recherche les événements par le libellé de l'événement de reporting
    Alors le suivi des événements affiche "1 événement(s) trouvé(s)" et l'événement de reporting
    Quand j'ajoute le participant "Utilisateur" au suivi des événements
    Et je génère le suivi des événements
    Alors le suivi des événements affiche "Aucun événement trouvé pour ces critères."
    Quand je réinitialise le suivi des événements
    Alors les critères du suivi des événements sont vides
