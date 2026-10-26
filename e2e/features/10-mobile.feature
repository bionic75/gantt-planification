# language: fr
@mobile
Fonctionnalité: Application mobile (/mobile.html)
  Navigateur mobile émulé (Pixel 7). La position GPS est simulée.

  Scénario: Connexion mobile avec MFA
    Quand je me connecte sur la page mobile avec le profil "Expert"
    Alors le planning personnel mobile est affiché
    Et la mire mobile reprend celle du bureau

  # Anomalie connue : le profil Utilisateur accède au planning mobile
  @anomalie-connue @fail
  Scénario: Accès mobile réservé aux experts
    Quand je me connecte sur la page mobile avec le profil "Utilisateur"
    Alors l'écran mobile « Accès réservé » est affiché
    Et aucune donnée de planning n'est affichée sur mobile

  Scénario: Vues planning (jour / semaine / mois) et tiroir
    Étant donné que "Expert" ouvre l'application mobile
    Alors les vues "Jour, Semaine, Mois" sont proposées
    Quand je choisis la vue mobile "Mois"
    Et je passe à la période suivante puis reviens à la période précédente
    Alors le libellé de période correspond au mois courant
    Quand je choisis la vue mobile "Semaine"
    Alors le libellé de période change de format
    Quand je choisis la vue mobile "Jour"
    Alors le libellé de période indique le numéro de semaine
    Et aucune erreur technique n'est survenue

  Scénario: Mode sombre mobile
    Étant donné que "Expert" ouvre l'application mobile
    Quand je bascule le mode sombre mobile
    Alors l'application mobile est en mode sombre
    Quand je recharge la page
    Alors l'application mobile est en mode sombre
    Quand je bascule le mode sombre mobile
    Alors l'application mobile est en mode clair

  Scénario: Carte « Autour de moi » : autorisation de localisation
    Étant donné qu'un SAMU-SAS de test géolocalisé existe
    Et que "Utilisateur" a ajouté un lieu de test
    Et que "Expert" ouvre l'application mobile avec la position du SAMU-SAS de test
    Quand je touche l'icône épingle
    Alors la carte « Autour de moi » est affichée
    Et ma position est affichée avec le cercle du périmètre
    Et le message de décompte indique le nombre de lieux dans le rayon

  Scénario: Localisation refusée
    Étant donné que "Expert" ouvre l'application mobile sans autoriser la localisation
    Quand je touche l'icône épingle
    Alors la carte « Autour de moi » est affichée
    Et le message indique que la position est refusée, sans bloquer la carte

  Scénario: SAMU-SAS et lieux toujours visibles et en grand
    Étant donné qu'un SAMU-SAS de test géolocalisé existe
    Et que "Utilisateur" a ajouté un lieu de test
    Et que "Expert" ouvre l'application mobile avec la position du SAMU-SAS de test
    Quand je touche l'icône épingle
    Alors la pastille du SAMU-SAS de test est affichée sur la carte
    Et le lieu de test est affiché par un rond de 46 px avec son nom

  Scénario: Périmètre 10 / 25 / 50 / 100 km / France
    Étant donné qu'un SAMU-SAS de test géolocalisé existe
    Et que "Utilisateur" a ajouté un lieu de test
    Et que "Expert" ouvre l'application mobile avec la position du SAMU-SAS de test
    Quand je touche l'icône épingle
    Alors pour chaque périmètre proposé, le décompte des lieux est mis à jour

  Scénario: Lieu créé récemment visible à la réouverture
    Étant donné qu'un SAMU-SAS de test géolocalisé existe
    Et que "Expert" ouvre l'application mobile avec la position du SAMU-SAS de test
    Quand je touche l'icône épingle
    Et je ferme la carte « Autour de moi »
    Et que "Utilisateur" a ajouté un lieu de test
    Et je touche l'icône épingle
    Alors le lieu de test est affiché par un rond de 46 px avec son nom

  Scénario: Fiche d'un lieu
    Étant donné qu'un SAMU-SAS de test géolocalisé existe
    Et que "Utilisateur" a ajouté un lieu de test
    Et que "Expert" ouvre l'application mobile avec la position du SAMU-SAS de test
    Quand je touche l'icône épingle
    Et je touche le lieu de test sur la carte
    Alors la fiche du lieu indique son nom, sa typologie, son SAMU-SAS, son adresse, son créateur, la distance et un lien « Itinéraire »
