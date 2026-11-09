# language: fr
@affectation
Fonctionnalité: Aide à l'affectation : onglet « Planning des déploiements »
  Grille calendaire des déploiements (échelle, période affichée, tri, SAMU affichés, lignes retirées, légende),
  affectation des ressources aux étapes (journées par expert, report dans la planification réservé à l'administrateur)
  et impression / export (aperçu, PDF, PowerPoint). Données : une localisation SAMU de test, un déploiement de test
  (visite métier du 03/03/2031 au 05/03/2031, 2 ressources par jour) et une ressource de test disponible, supprimés en
  fin de scénario. Le report dans la planification n'est jamais validé (« Plus tard »).

  Contexte:
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'une ressource de test est « 2 - Disponible » du "2031-03-03" au "2031-03-05"

  Scénario: Grille : période affichée, ligne du SAMU de test, échelles semaine et mois
    Étant donné que j'ouvre le planning des déploiements en tant que "Administrateur"
    Quand j'affiche la période du "2031-03-01" au "2031-03-14"
    Alors la grille présente la ligne du SAMU de test et son chef de projet
    Et la visite métier du SAMU de test occupe 3 colonnes, la première indiquant "0/2"
    Quand je choisis l'échelle « Semaine »
    Alors l'en-tête de la grille présente "S10"
    Quand je choisis l'échelle « Mois »
    Alors l'en-tête de la grille présente "Mars"

  Scénario: Tri par SAMU, dans un sens puis dans l'autre
    Étant donné que j'ouvre le planning des déploiements en tant que "Administrateur"
    Quand je trie le planning par « SAMU »
    Alors le bouton de tri « SAMU » indique "▼"
    Quand je trie le planning par « SAMU »
    Alors le bouton de tri « SAMU » indique "▲"

  Scénario: SAMU affichés et lignes retirées
    Étant donné que j'ouvre le planning des déploiements en tant que "Administrateur"
    Et que j'affiche la période du "2031-03-01" au "2031-03-14"
    Quand je décoche le SAMU de test dans « SAMU affichés »
    Alors la grille ne présente plus la ligne du SAMU de test
    Quand je recoche le SAMU de test dans « SAMU affichés »
    Alors la grille présente la ligne du SAMU de test et son chef de projet
    Quand je retire la ligne du SAMU de test
    Alors la grille ne présente plus la ligne du SAMU de test
    Quand je rétablis la ligne du SAMU de test depuis « Lignes retirées »
    Alors la grille présente la ligne du SAMU de test et son chef de projet

  Scénario: Légende : masquer puis réafficher une étape
    Étant donné que j'ouvre le planning des déploiements en tant que "Administrateur"
    Et que j'affiche la période du "2031-03-01" au "2031-03-14"
    Quand je masque l'étape « Visite métier » dans la légende
    Alors la visite métier du SAMU de test n'est plus affichée
    Quand j'affiche l'étape « Visite métier » dans la légende
    Alors la visite métier du SAMU de test occupe 3 colonnes, la première indiquant "0/2"

  Scénario: Affectation d'une ressource de test un jour de la visite métier (administrateur)
    Étant donné que j'ouvre le planning des déploiements en tant que "Administrateur"
    Et que j'affiche la période du "2031-03-01" au "2031-03-14"
    Quand j'ouvre l'affectation de la visite métier du SAMU de test
    Alors la fenêtre d'affectation propose « Synchroniser »
    Quand je coche le "2031-03-03" pour la ressource de test et j'enregistre
    Alors le report dans la planification est proposé et je le remets à plus tard
    Et la ressource de test intervient le "2031-03-03" sur la visite métier du déploiement
    Et la visite métier du SAMU de test indique "1/2 ressource(s) par jour"

  Scénario: Affectation par un utilisateur : ni synchronisation ni désaffectation proposées
    Étant donné que "Utilisateur" a accès à l'application « Aide à l'affectation opérationnelle »
    Et que j'ouvre le planning des déploiements en tant que "Utilisateur"
    Et que j'affiche la période du "2031-03-01" au "2031-03-14"
    Quand j'ouvre l'affectation de la visite métier du SAMU de test
    Alors la fenêtre d'affectation ne propose pas « Synchroniser »
    Quand je coche le "2031-03-03" pour la ressource de test et j'enregistre
    Alors la fenêtre d'affectation est fermée sans report proposé
    Et la ressource de test intervient le "2031-03-03" sur la visite métier du déploiement

  Scénario: Impression : aperçu des pages et export PDF
    Étant donné que j'ouvre le planning des déploiements en tant que "Administrateur"
    Quand j'ouvre l'impression du planning
    Et je saisis le titre "Planning E2E" et la période du "2031-03-01" au "2031-03-14"
    Alors l'aperçu annonce au moins 1 page
    Et l'aperçu présente le titre "Planning E2E" et le SAMU de test
    Quand j'exporte le planning en PDF
    Alors un fichier PDF est téléchargé
