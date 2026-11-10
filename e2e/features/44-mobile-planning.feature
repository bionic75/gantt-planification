# language: fr
@mobile
Fonctionnalité: Application mobile : planning d'un expert, tiroir d'une demi-journée, déconnexion
  Navigateur mobile émulé (Pixel 7, vue Semaine par défaut). Données : une ressource de test (planning de la semaine
  courante : lundi matin « ANS Déploiement », mardi en congé) et un événement de test le lundi, supprimés en fin de
  scénario. La déconnexion est faite sur une session ouverte pour le scénario (jamais sur la session enregistrée du
  profil, partagée par les autres fonctionnalités).

  Scénario: Identifiants requis, puis refusés
    Quand j'ouvre la page mobile sans être connecté
    Et je valide la connexion mobile sans identifiants
    Alors la mire mobile signale "Identifiants requis."
    Quand je me connecte sur la page mobile avec un identifiant inconnu
    Alors la mire mobile signale "Identifiants invalides."

  Scénario: Planning d'une ressource choisie, tiroir d'une demi-journée
    Étant donné qu'une ressource de test est en « ANS Déploiement » lundi matin et en congé mardi de la semaine courante
    Et qu'un événement de test a lieu lundi de la semaine courante
    Et que "Expert" ouvre l'application mobile
    Quand je choisis la ressource de test dans la liste des experts
    Alors la semaine présente lundi matin "ANS Déploiement" et mardi "Congé"
    Et les événements de la semaine présentent l'événement de test
    Quand je touche la demi-journée de lundi matin
    Alors le tiroir présente "Matin", "ANS Déploiement" et l'événement de test
    Quand je ferme le tiroir
    Alors le tiroir est fermé

  Scénario: Vue Mois puis Jour d'une ressource choisie
    Étant donné qu'une ressource de test est en « ANS Déploiement » lundi matin et en congé mardi de la semaine courante
    Et que "Expert" ouvre l'application mobile
    Quand je choisis la ressource de test dans la liste des experts
    Et je choisis la vue mobile "Mois"
    Et je touche le jour de mardi dans le mois
    Alors la vue Jour présente le congé de mardi

  Scénario: Déconnexion
    Quand je me connecte sur la page mobile avec le profil "Expert"
    Alors le planning personnel mobile est affiché
    Quand je me déconnecte de l'application mobile
    Alors la mire mobile est affichée
