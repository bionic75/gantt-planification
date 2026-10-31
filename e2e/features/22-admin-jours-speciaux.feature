# language: fr
@administration
Fonctionnalité: Administration › Jours et événements spéciaux (écran)
  Import de fichiers .ics de congés scolaires et de dates particulières, apparence des dates particulières.
  Les fichiers importés portent des dates de 2031 (hors de l'affichage des autres scénarios) et un nom propre au
  scénario ; ils sont supprimés en fin de scénario.

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
