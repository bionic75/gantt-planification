# language: fr
@analyse
Fonctionnalité: Analyse de fichiers
  Application « Analyse de fichiers » (menu Applications) : le fichier est lu dans le navigateur, sans envoi au serveur.
  Chargement (.xlsx, .csv, .txt ; encodage, séparateur, largeur fixe, ligne d'intitulés), structure des colonnes et
  renommage, filtres (listes ET / OU et exclusions, texte avec jokers, dates, oui / non), colonnes affichées, doublons,
  pagination, export CSV, fichier conservé dans le navigateur. Données : fichiers produits par les étapes (CSV de 251
  lignes en Windows-1252, fichiers texte) et classeur e2e/fixtures/analyse/classeur.xlsx. Le compte Utilisateur reçoit
  l'accès à l'application le temps du scénario.

  Contexte:
    Étant donné que "Utilisateur" a accès à l'application « Analyse de fichiers »
    # Inactivité activée par une réponse simulée (paramétrage global inchangé) : minuteur de l'en-tête
    Et que l'inactivité de "Utilisateur" est paramétrée à 15 minutes (réponse simulée)
    Et que j'ouvre l'Analyse de fichiers en tant que "Utilisateur"

  Scénario: En-tête de l'application et déconnexion annulée
    Alors l'en-tête de l'Analyse présente le nom de "Utilisateur" et le profil "Utilisateur"
    Et le minuteur de l'Analyse décompte
    Quand je demande la déconnexion de l'Analyse et j'annule
    Alors l'Analyse de fichiers est toujours affichée

  Scénario: Format non supporté
    Quand je charge le fichier "notes.pdf" dans l'Analyse
    Alors une alerte affiche "Format non supporté. Utilisez .xlsx, .xls, .csv ou .txt"

  Scénario: CSV en Windows-1252 : encodage détecté, accents corrigés, compteurs
    Quand je charge le CSV de test dans l'Analyse
    Alors le fichier chargé est "personnes-e2e.csv" avec l'encodage "Windows-1252 / Latin-1"
    Et le bandeau d'encodage annonce "les accents ont été corrigés automatiquement"
    Et l'Analyse compte 251 résultats sur 251 lignes
    Et le tableau présente les colonnes "Identifiant, Nom, Prénom, Service, Compétences, Date d'entrée, Actif"
    Et le tableau présente la valeur "LEFÈVRE"

  Scénario: Classeur Excel : première feuille de données, intitulés sous une ligne de titre
    Quand je charge le classeur de test dans l'Analyse
    Alors le fichier chargé est "classeur.xlsx" sans encodage annoncé
    Et l'Analyse compte 5 résultats sur 5 lignes
    Et le tableau présente les colonnes "Code, Libellé, Date, Montant"
    Et la ligne "Clé USB" du tableau présente la date "15/03/2031"
    Et la ligne "Souris" du tableau présente la date "30/06/2031 14:45"
    Quand j'ouvre la structure du fichier
    Alors la structure indique les intitulés en ligne 2, détectés, 1 ligne au-dessus ignorée

  Scénario: Fichier texte : séparateur détecté, lignes de titre ignorées, intitulés choisis
    Quand je charge le fichier texte à lignes de titre dans l'Analyse
    Et j'ouvre la structure du fichier
    Alors la structure annonce "séparateur : point-virgule"
    Et la structure indique les intitulés en ligne 3, détectés, 2 lignes au-dessus ignorées
    Et l'Analyse compte 10 résultats sur 10 lignes
    Quand je choisis la ligne d'intitulés 0
    Alors le tableau présente les colonnes "Colonne 1, Colonne 2, Colonne 3"
    Et l'Analyse compte 13 résultats sur 13 lignes

  Scénario: Fichier texte à largeur fixe
    Quand je charge le fichier texte à largeur fixe dans l'Analyse
    Et j'ouvre la structure du fichier
    Alors la structure annonce "colonnes à largeur fixe (positions 1, 8, 20)"
    Et le tableau présente les colonnes "Code, Equipe, Ville"
    Et l'Analyse compte 4 résultats sur 4 lignes

  Scénario: Structure : type, rôle proposé et renommage des colonnes
    Quand je charge le CSV de test dans l'Analyse
    Et j'ouvre la structure du fichier
    Alors la structure présente la colonne "Nom" de type "Catégorie (10 valeurs)", rôle "haute"
    Et la structure présente la colonne "Date d'entrée" de type "Date"
    Quand je renomme la colonne "Service" en "Direction" et j'applique les noms
    Alors le tableau présente les colonnes "Identifiant, Nom, Prénom, Direction, Compétences, Date d'entrée, Actif"

  Scénario: Filtre d'une liste : valeurs d'un groupe, groupes ET / OU
    Quand je charge le CSV de test dans l'Analyse
    Et j'inclus les valeurs "SQL, Python" de la colonne "Compétences"
    Alors l'Analyse compte les lignes dont "Compétences" contient "SQL" ou "Python"
    Et les filtres actifs sont "1 filtre(s)"
    Quand j'ajoute un groupe ET à la colonne "Compétences" et j'y glisse "Python"
    Alors l'Analyse compte les lignes dont "Compétences" contient "SQL" et "Python"
    Quand je bascule l'opérateur entre les groupes de la colonne "Compétences"
    Alors l'Analyse compte les lignes dont "Compétences" contient "SQL" ou "Python"
    Quand j'efface tous les filtres
    Alors l'Analyse compte 251 résultats sur 251 lignes
    Et les filtres actifs sont "Aucun"

  Scénario: Filtre d'une liste : exclusion
    Quand je charge le CSV de test dans l'Analyse
    Et j'exclus la valeur "Excel" de la colonne "Compétences"
    Alors l'Analyse compte les lignes dont "Compétences" ne contient pas "Excel"

  Scénario: Filtres texte avec jokers, date et oui / non
    Quand je charge le CSV de test dans l'Analyse
    Et je recherche "id-00*5" dans la colonne "Identifiant"
    Alors l'Analyse compte 10 résultats sur 251 lignes
    Quand j'efface tous les filtres
    Et je filtre la colonne "Date d'entrée" avant le "2031-01-31"
    Alors l'Analyse compte les lignes entrées en janvier 2031
    Quand j'efface tous les filtres
    Et je choisis "Non" dans la colonne "Actif"
    Alors l'Analyse compte les lignes dont "Actif" vaut "Non"

  Scénario: Colonnes affichées, doublons et pagination
    Quand je charge le CSV de test dans l'Analyse
    Et je masque la colonne "Service"
    Alors le tableau présente les colonnes "Identifiant, Nom, Prénom, Compétences, Date d'entrée, Actif"
    Quand je cherche les doublons sur la colonne "Identifiant"
    Alors les doublons annoncent "2 ligne(s) en doublon"
    Et la page affichée est 1 sur 3
    Quand je passe à la page suivante
    Alors la page affichée est 2 sur 3
    Quand je vais à la page 3
    Alors la page affichée est 3 sur 3
    Et la ligne en doublon "ID-0001" est mise en évidence
    Quand j'affiche 500 lignes par page
    Alors la page affichée est 1 sur 1

  Scénario: Export CSV des lignes filtrées et des colonnes affichées
    Quand je charge le CSV de test dans l'Analyse
    Et je choisis "Non" dans la colonne "Actif"
    Et je masque la colonne "Compétences"
    Alors l'export CSV de l'Analyse contient les lignes dont "Actif" vaut "Non", sans la colonne "Compétences"

  Scénario: Fichier conservé dans le navigateur
    Quand je coche « Conserver ce fichier localement »
    Et je charge le CSV de test dans l'Analyse
    Et je charge un nouveau fichier
    Alors le fichier sauvegardé proposé est "personnes-e2e.csv"
    Quand je charge le fichier sauvegardé
    Alors le fichier chargé est "personnes-e2e.csv" avec l'encodage "Windows-1252 / Latin-1"
    Et l'Analyse compte 251 résultats sur 251 lignes
    Quand je charge un nouveau fichier
    Et je supprime le fichier sauvegardé
    Alors aucun fichier sauvegardé n'est proposé
