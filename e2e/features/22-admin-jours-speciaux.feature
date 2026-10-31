# language: fr
@administration
Fonctionnalité: Administration › Jours et événements spéciaux (écran)
  Import de fichiers .ics de congés scolaires et de dates particulières, apparence des dates particulières,
  paramétrage des types d'événements et reprise des données des événements.
  Les fichiers importés portent des dates de 2031 (hors de l'affichage des autres scénarios) et un nom propre au
  scénario ; ils sont supprimés en fin de scénario, comme les types et événements de test.
  La reprise ne modifie que l'événement de test : « Suggérer les types » (événements sans type, onglet « À traiter »)
  n'est pas exercé, l'enregistrement modifierait tous les événements sans type de la base ; un événement créé par
  l'API a toujours un type (« Autre(s) » à défaut), la reprise est donc vérifiée dans l'onglet « Traité ».

  Contexte:
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Administration des jours ou événements spéciaux"

  # ---------- Congés scolaires ----------

  Scénario: Congés scolaires : import d'un fichier .ics puis suppression
    Quand j'ouvre la sous-section "Injection des périodes de congés scolaires"
    Et j'importe un fichier de congés scolaires de test pour les zones A, B et C
    Alors l'import des congés scolaires indique "3 période(s) importée(s)"
    Et la liste des fichiers de congés scolaires présente le fichier de test avec 3 périodes
    Et les périodes du fichier de test sont prises en compte par la planification
    Quand je supprime le fichier de congés scolaires de test et je confirme
    Alors la liste des fichiers de congés scolaires ne présente plus le fichier de test

  Scénario: Congés scolaires : fichier absent ou sans période refusé
    Quand j'ouvre la sous-section "Injection des périodes de congés scolaires"
    Et j'importe les congés scolaires sans choisir de fichier
    Alors l'import des congés scolaires indique "Veuillez sélectionner un fichier .ics"
    Quand j'importe un fichier de congés scolaires sans période de vacances
    Alors l'import des congés scolaires indique "Aucune période de vacances trouvée dans le fichier"

  # ---------- Dates particulières ----------

  Scénario: Dates particulières : import configuré, modification de l'apparence puis suppression
    Quand j'ouvre la sous-section "Injection de dates particulières (jours fériés, ...)"
    Et je choisis un fichier de dates particulières de test et je l'importe en le configurant
    Alors la configuration présente le nom du fichier de test
    Quand je saisis le libellé "E2E" et j'applique le préréglage "Rouge"
    Alors l'aperçu de la configuration affiche "E2E"
    Quand j'importe avec cette configuration
    Alors l'import des dates particulières indique "2 date(s) importée(s)"
    Et le fichier de dates particulières de test est enregistré avec le libellé "E2E" et les couleurs du préréglage "Rouge"
    Et la liste des fichiers de dates particulières présente le fichier de test avec 2 dates
    Quand je modifie l'apparence du fichier de dates particulières de test avec le libellé "E2F"
    Alors le fichier de dates particulières de test est enregistré avec le libellé "E2F"
    Quand je supprime le fichier de dates particulières de test et je confirme
    Alors la liste des fichiers de dates particulières ne présente plus le fichier de test

  Scénario: Dates particulières : fichier absent refusé
    Quand j'ouvre la sous-section "Injection de dates particulières (jours fériés, ...)"
    Et j'importe des dates particulières sans choisir de fichier
    Alors l'import des dates particulières indique "Veuillez sélectionner un fichier .ics"

  # ---------- Types d'événements ----------

  Scénario: Types d'événements : ajout avec icône et gabarit, modifications puis suppression
    Quand j'ouvre la sous-section "Paramétrage des types d'événements"
    Et je saisis un type d'événement de test avec le libellé court "E2E", l'icône "Jalon" et le gabarit "Violet · texte blanc"
    Alors l'aperçu du type d'événement affiche "E2E"
    Quand j'ajoute le type d'événement
    Alors le type d'événement de test est enregistré avec le libellé court "E2E", l'icône "flag" et les couleurs "#7b1fa2", "#ffffff", "#4a0072"
    Et la liste des types présente le type d'événement de test
    Quand je modifie directement le libellé court du type d'événement de test en "E2F"
    Alors le type d'événement de test est enregistré avec le libellé court "E2F"
    Quand je modifie le type d'événement de test avec les couleurs personnalisées "#123456", "#ffff00", "#654321"
    Alors le type d'événement de test est enregistré avec les couleurs "#123456", "#ffff00", "#654321"
    Quand je supprime le type d'événement de test et je confirme
    Alors la liste des types ne présente plus le type d'événement de test

  Scénario: Types d'événements : libellé long obligatoire, type « Autre(s) » verrouillé
    Quand j'ouvre la sous-section "Paramétrage des types d'événements"
    Et j'ajoute le type d'événement
    Alors le paramétrage des types indique "Le libellé long est obligatoire."
    Et le type « Autre(s) » n'est ni modifiable ni supprimable

  # ---------- Reprise des données ----------

  Scénario: Reprise des données : type et libellé d'un événement modifiés puis enregistrés
    Étant donné qu'un type d'événement de test existe
    Et l'administrateur a créé un événement de test le "2031-07-08"
    Quand j'ouvre la sous-section "Reprise des données des événements (type et libellé)"
    Et j'affiche les événements traités de la reprise et je recherche l'événement de test
    Alors la reprise présente l'événement de test seul, du type « Autre(s) »
    Quand je change le libellé de l'événement de test dans la reprise
    Alors le bouton d'enregistrement de la reprise indique "Enregistrer (1)"
    Quand je recharge la reprise
    Alors le bouton d'enregistrement de la reprise indique "Enregistrer (0)"
    Quand j'affecte le type de test et un nouveau libellé à l'événement de test dans la reprise
    Et j'enregistre la reprise
    Alors la reprise indique "1 événement(s) mis à jour."
    Et l'événement de test est enregistré avec le type de test et son nouveau libellé
