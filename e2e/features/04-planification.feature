# language: fr
@planification
Fonctionnalité: Planification (grille des experts)
  Codes de la grille : disponibilité 1 = indisponible, 2 = disponible, 3 = congés ;
  affectation 2 = en attente d'affectation, 3 = déploiement, 5 à 8 = activités ANS.

  Scénario: Saisie d'une journée dans la planification
    Étant donné que la ressource de l'expert de test est connue
    Et que la demi-journée du "2031-03-12" matin de l'expert de test sera remise en état après le scénario
    Quand "Expert" enregistre pour lui-même le "2031-03-12" matin : disponibilité "2", affectation "5", SAMU "SAMU 75"
    Alors la planification de l'expert de test contient pour le "2031-03-12" matin la disponibilité "2" et l'affectation "5"
    Et "Administrateur" voit la même saisie dans la planification
    Et "Utilisateur" voit la même saisie dans la planification

  Scénario: Numéro de semaine ISO
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Planification"
    Et j'affiche le mois de "décembre 2026" dans la planification
    Alors les en-têtes de semaine sont "Sem. 49, Sem. 50, Sem. 51, Sem. 52, Sem. 53"
    Quand j'affiche le mois de "janvier 2027" dans la planification
    Alors les en-têtes de semaine sont "Sem. 53, Sem. 1, Sem. 2, Sem. 3, Sem. 4"

  Scénario: Lignes experts et congés masquables
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Planification"
    Et je masque la première ligne d'expert avec le bouton (−)
    Alors cette ligne d'expert n'est plus affichée
    Et le compteur indique "1 masqué"
    Quand je masque la ligne des congés scolaires et événements
    Alors le compteur indique "2 masqués"
    Quand je recharge la page
    Alors le compteur indique "2 masqués"
    Quand je rétablis la ligne d'expert depuis la liste des lignes masquées
    Alors cette ligne d'expert est de nouveau affichée
    Quand je rétablis l'affichage d'origine
    Alors aucune ligne n'est masquée

  Scénario: Conflit d'affectation sur deux SAMU
    Étant donné qu'un déploiement de test avec une visite métier du "2031-03-03" au "2031-03-05" pour 1 ressource existe
    Et qu'une ressource de test est déjà affectée au "SAMU 13" le "2031-03-04" matin
    Quand l'administrateur affecte cette ressource à la visite métier du déploiement
    Alors la réponse a le statut 409
    Et le message d'erreur contient "Déjà affecté(e) à un autre SAMU"
    Et la ressource n'est pas affectée au déploiement

  Scénario: Vue calendrier / grille et filtres
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Planification"
    Et je navigue de 2 mois en avant puis de 2 mois en arrière
    Alors la grille affiche le mois courant
    Et toutes les lignes d'expert ont le même nombre de cellules
    Et aucune erreur technique n'est survenue

  # Rendu d'impression (aperçu du navigateur) : vérification visuelle de la mise en page et de la taille des icônes
  @manuel
  Scénario: Impression du planning
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand je lance l'impression d'un mois
    Alors la mise en page est lisible, la semaine ISO exacte et les icônes de taille normale
