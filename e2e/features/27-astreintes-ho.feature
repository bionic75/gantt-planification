# language: fr
@astreintes
Fonctionnalité: Astreintes HO (écran)
  Rubrique « Gestion des astreintes HO » de l'onglet Astreintes : droits selon le profil, navigation, inscription des
  experts sur les demi-journées, désignation de l'astreinte HO ANS, enregistrement. Les scénarios n'écrivent que sur
  mars 2031 (jamais la semaine en cours : aucun e-mail de mise à jour) ; les droits donnés aux comptes de test (expert
  HO, utilisateur « Astreinte HO ANS ») et les inscriptions créées sont remis en état en fin de scénario.

  Scénario: Administrateur : droits, légende, navigation
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Alors la rubrique HO présente les droits "Administrateur" et la légende
    Et la rubrique HNO est proposée
    Quand j'affiche le mois de "mars 2031" dans les astreintes HO
    Alors la grille HO présente les semaines S10 à S14
    Quand je reviens au mois courant dans les astreintes HO
    Alors la grille HO présente le mois courant

  Scénario: Administrateur : inscription d'un expert, annulation, enregistrement puis retrait
    Étant donné que la ressource de l'expert de test participe aux astreintes HO
    Et que le planning HO de mars 2031 sera remis en état après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'affiche le mois de "mars 2031" dans les astreintes HO
    Et j'inscris l'expert de test le "mardi 04/03/2031" matin
    Alors la demi-journée du "mardi 04/03/2031" matin présente l'expert de test, non enregistré
    Et 1 modification HO est à enregistrer
    Quand j'annule les modifications HO
    Alors la demi-journée du "mardi 04/03/2031" matin est vide
    Et aucune modification HO n'est à enregistrer
    Quand j'inscris l'expert de test le "mardi 04/03/2031" matin
    Et j'ouvre l'enregistrement du planning HO
    Alors la fenêtre d'enregistrement liste l'ajout de l'expert de test le "mardi 04/03/2031" matin
    Quand je confirme l'enregistrement du planning HO
    Alors le message "Planning HO enregistré (1 modification)." est affiché
    Et l'expert de test est inscrit le "2031-03-04" matin
    Quand je retire l'expert de test le "mardi 04/03/2031" matin
    Et j'ouvre l'enregistrement du planning HO
    Et je confirme l'enregistrement du planning HO
    Alors l'expert de test n'est plus inscrit le "2031-03-04" matin

  Scénario: Changement de mois avec des modifications non enregistrées
    Étant donné que la ressource de l'expert de test participe aux astreintes HO
    Et que le planning HO de mars 2031 sera remis en état après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'affiche le mois de "mars 2031" dans les astreintes HO
    Et j'inscris l'expert de test le "mardi 04/03/2031" matin
    Et je passe au mois suivant dans les astreintes HO et je refuse la confirmation
    Alors le mois affiché dans les astreintes HO est "Mars 2031"
    Et 1 modification HO est à enregistrer
    Quand je passe au mois suivant dans les astreintes HO et je confirme
    Alors le mois affiché dans les astreintes HO est "Avril 2031"
    Et aucune modification HO n'est à enregistrer
    Et l'expert de test n'est pas inscrit le "2031-03-04" matin

  Scénario: Expert HO : inscription et retrait d'un clic, semaines passées non modifiables
    Étant donné que la ressource de l'expert de test participe aux astreintes HO
    Et que le planning HO de mars 2031 sera remis en état après le scénario
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "Astreintes"
    Alors la rubrique HO présente les droits "Expert HO"
    Et la rubrique HNO n'est pas proposée
    Quand j'affiche le mois de "mars 2031" dans les astreintes HO
    Et je clique sur la demi-journée du "mercredi 05/03/2031" après-midi
    Alors la demi-journée du "mercredi 05/03/2031" après-midi présente l'expert de test, non enregistré
    Quand j'ouvre l'enregistrement du planning HO
    Et je confirme l'enregistrement du planning HO
    Alors l'expert de test est inscrit le "2031-03-05" après-midi
    Quand je clique sur la demi-journée du "mercredi 05/03/2031" après-midi
    Et j'ouvre l'enregistrement du planning HO
    Et je confirme l'enregistrement du planning HO
    Alors l'expert de test n'est plus inscrit le "2031-03-05" après-midi
    Quand je reviens au mois courant dans les astreintes HO
    Et je passe au mois précédent dans les astreintes HO
    Et je clique sur la première demi-journée affichée
    Alors aucune modification HO n'est à enregistrer

  Scénario: Utilisateur sans droit : consultation seule
    Étant donné que je suis connecté en tant que "Utilisateur"
    Quand j'ouvre l'onglet "Astreintes"
    Alors la rubrique HO présente les droits "Consultation seule"
    Quand j'affiche le mois de "mars 2031" dans les astreintes HO
    Et je clique sur la demi-journée du "mardi 04/03/2031" matin
    Alors aucune modification HO n'est à enregistrer

  Scénario: Astreinte HO ANS : deux utilisateurs désignés le même jour, puis retrait de l'un
    Étant donné que le compte "Utilisateur" de test est déclaré « Astreinte HO ANS »
    Et que le compte "Expert" de test est déclaré « Astreinte HO ANS »
    Et que le planning HO de mars 2031 sera remis en état après le scénario
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'affiche le mois de "mars 2031" dans les astreintes HO
    Et je coche les comptes "Utilisateur" et "Expert" de test en astreinte HO ANS le "jeudi 06/03/2031"
    Alors l'astreinte HO ANS du "06/03/2031" présente les comptes "Utilisateur" et "Expert" de test, non enregistrée
    Quand j'ouvre l'enregistrement du planning HO
    Alors la fenêtre d'enregistrement liste 2 ajouts HO ANS le "jeudi 06/03/2031"
    Quand je confirme l'enregistrement du planning HO
    Alors les comptes "Utilisateur" et "Expert" de test sont désignés en astreinte HO ANS le "2031-03-06"
    Quand je décoche le compte "Expert" de test en astreinte HO ANS le "jeudi 06/03/2031"
    Et j'ouvre l'enregistrement du planning HO
    Alors la fenêtre d'enregistrement liste le retrait HO ANS du compte "Expert" de test le "jeudi 06/03/2031"
    Quand je confirme l'enregistrement du planning HO
    Alors seul le compte "Utilisateur" de test est désigné en astreinte HO ANS le "2031-03-06"

  Scénario: Astreinte HO ANS : un utilisateur s'ajoute d'un clic sans retirer les autres, puis se retire
    Étant donné que le compte "Utilisateur" de test est déclaré « Astreinte HO ANS »
    Et que le compte "Expert" de test est déclaré « Astreinte HO ANS »
    Et que le planning HO de mars 2031 sera remis en état après le scénario
    Et que le compte "Expert" de test est déjà désigné en astreinte HO ANS le "2031-03-07"
    Et que je suis connecté en tant que "Utilisateur"
    Quand j'ouvre l'onglet "Astreintes"
    Alors la rubrique HO présente les droits "les autres utilisateurs désignés sont conservés"
    Quand j'affiche le mois de "mars 2031" dans les astreintes HO
    Et je clique sur l'astreinte HO ANS du "vendredi 07/03/2031"
    Alors l'astreinte HO ANS du "07/03/2031" présente les comptes "Expert" et "Utilisateur" de test, non enregistrée
    Quand j'ouvre l'enregistrement du planning HO
    Et je confirme l'enregistrement du planning HO
    Alors les comptes "Expert" et "Utilisateur" de test sont désignés en astreinte HO ANS le "2031-03-07"
    Quand je clique sur l'astreinte HO ANS du "vendredi 07/03/2031"
    Et j'ouvre l'enregistrement du planning HO
    Et je confirme l'enregistrement du planning HO
    Alors seul le compte "Expert" de test est désigné en astreinte HO ANS le "2031-03-07"