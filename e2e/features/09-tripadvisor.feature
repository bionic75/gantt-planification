# language: fr
@tripadvisor
Fonctionnalité: SAMU-SAS TripAdVisor (bonnes adresses autour des SAMU-SAS)
  « A » est le compte Utilisateur, « B » le compte Expert. Chaque scénario crée son propre SAMU-SAS de test
  (géolocalisé) ; les lieux, notes et commentaires sont supprimés en fin de scénario.

  Contexte:
    Étant donné qu'un SAMU-SAS de test géolocalisé existe

  Scénario: Ajout d'un lieu
    Quand "Utilisateur" ajoute un lieu "restaurant" nommé "Chez E2E" au "1 rue du Test, Paris" avec ses coordonnées
    Alors la réponse a le statut 200
    Et le lieu est géolocalisé et rattaché au SAMU-SAS de test
    Et le lieu indique son créateur "Utilisateur" et son horodatage
    Et le lieu apparaît dans la liste des lieux du SAMU-SAS
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Alors le lieu "Chez E2E" est affiché dans l'onglet

  Scénario: La typologie est toujours choisie par l'utilisateur
    Quand "Utilisateur" ajoute un lieu "bar" nommé "Le Zinc E2E" avec la référence OpenStreetMap d'un restaurant
    Alors le lieu a la typologie "bar"
    Quand "Utilisateur" ajoute un lieu sans typologie
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Choisissez une typologie"

  @internet
  Scénario: Autocomplétion par OpenStreetMap
    Quand "Utilisateur" recherche le lieu "Tour Eiffel" près du SAMU-SAS de test
    Alors des suggestions avec nom, adresse et coordonnées sont proposées

  Scénario: Recherche trop courte : aucune suggestion
    Quand "Utilisateur" recherche le lieu "ab" près du SAMU-SAS de test
    Alors aucune suggestion n'est proposée

  @internet
  Scénario: Adresse introuvable
    Quand "Utilisateur" ajoute un lieu "restaurant" nommé "Nulle Part E2E" à l'adresse "zzqx 99999 introuvablevillexyz" sans coordonnées
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Adresse introuvable"

  Scénario: Droits du créateur
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Quand "Expert" tente de modifier ce lieu
    Alors la réponse a le statut 403
    Quand "Expert" tente de supprimer ce lieu
    Alors la réponse a le statut 403
    Quand "Utilisateur" renomme ce lieu en "Renommé E2E"
    Alors la réponse a le statut 200
    Quand "Utilisateur" supprime ce lieu
    Alors la réponse a le statut 200
    Et le lieu n'existe plus

  Scénario: Droits de l'administrateur
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Et que "Expert" a noté ce lieu 4 et l'a commenté
    Quand "Administrateur" supprime le commentaire de "Expert"
    Alors la réponse a le statut 200
    Quand "Administrateur" supprime la note de "Expert"
    Alors la réponse a le statut 200
    Quand "Administrateur" renomme ce lieu en "Modifié par l'admin E2E"
    Alors la réponse a le statut 200
    Quand "Administrateur" supprime ce lieu
    Alors la réponse a le statut 200
    Et le lieu n'existe plus

  Scénario: Note de 1 à 5 : une par contributeur, moyenne
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Quand "Utilisateur" note ce lieu 5
    Et "Expert" note ce lieu 3
    Et "Utilisateur" note ce lieu 4
    Alors le lieu a une moyenne de 3.5 pour 2 notes
    Quand "Utilisateur" note ce lieu 6
    Alors la réponse a le statut 400
    Quand "Utilisateur" note ce lieu 0
    Alors la réponse a le statut 400

  Scénario: Commentaires : auteur ou administrateur
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Et que "Utilisateur" a commenté ce lieu "Accueil chaleureux"
    Et que "Expert" a commenté ce lieu "Un peu bruyant"
    Quand "Utilisateur" modifie son commentaire en "Accueil très chaleureux"
    Alors la réponse a le statut 200
    Quand "Utilisateur" tente de modifier le commentaire de "Expert"
    Alors la réponse a le statut 403
    Quand "Utilisateur" tente de supprimer le commentaire de "Expert"
    Alors la réponse a le statut 403
    Et chaque commentaire affiche ses dates de création et de modification
    Quand "Utilisateur" supprime son commentaire
    Alors la réponse a le statut 200

  Scénario: Filtres SAMU-SAS / créateur / typologie / recherche
    Étant donné que "Utilisateur" a ajouté un lieu "restaurant" nommé "Bistrot E2E"
    Et que "Expert" a ajouté un lieu "hebergement" nommé "Hôtel E2E"
    Alors le filtre SAMU-SAS donne "Bistrot E2E, Hôtel E2E"
    Et le filtre créateur "Utilisateur" donne "Bistrot E2E"
    Et le filtre typologie "hebergement" donne "Hôtel E2E"
    Et la recherche "bistrot" donne "Bistrot E2E"
    Et le filtre combiné créateur "Expert" et typologie "restaurant" ne donne aucun lieu
    Et les compteurs par typologie du SAMU-SAS indiquent 1 "restaurant" et 1 "hebergement"

  # Cadrage de la carte Leaflet : vérification visuelle
  @manuel
  Scénario: Carte centrée sur la France métropolitaine à l'ouverture
    Quand j'ouvre l'onglet sans filtre
    Alors la carte est cadrée sur la France métropolitaine, Corse incluse

  @manuel
  Scénario: Pastille SAMU-SAS cliquable
    Quand je clique sur la pastille « SAMU-SAS 56 »
    Alors la carte est centrée sur le SAMU-SAS et tous ses lieux sont affichés

  @internet
  Scénario: Trajet vers le SAMU-SAS : 3 modes
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Quand "Utilisateur" demande le trajet de ce lieu vers le SAMU-SAS
    Alors la réponse a le statut 200
    Et le trajet est calculé pour les modes "walk", "car" et "transit", avec durée et distance ou un message d'indisponibilité

  Scénario: Trajet : SAMU-SAS non géolocalisé
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Et que le SAMU-SAS de test perd sa géolocalisation
    Quand "Utilisateur" demande le trajet de ce lieu vers le SAMU-SAS
    Alors la réponse a le statut 400
    Et le message d'erreur contient "n'est pas géolocalisé"

  Scénario: Échappement des saisies (XSS)
    Étant donné que "Utilisateur" a ajouté un lieu "bar" nommé "<script>window.__xss=1</script>" commenté "<img src=x onerror=window.__xss=2><b>gras</b>"
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'affiche les lieux du SAMU-SAS de test
    Alors le texte "<script>window.__xss=1</script>" est affiché tel quel
    Et aucun script injecté n'a été exécuté

  # ---------- Écran (sans Internet : suggestions OpenStreetMap simulées dans le navigateur) ----------

  Scénario: Ajout d'un lieu depuis l'onglet, avec une suggestion et une note
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'ouvre la fenêtre d'ajout d'un lieu
    Et je rattache le lieu au SAMU-SAS de test avec la typologie "Restaurant"
    Et je saisis le nom "Brasserie IHM" et je choisis la suggestion "Brasserie IHM E2E"
    Alors la position du lieu est repérée
    Quand je donne la note 4 au lieu et je l'enregistre
    Alors la fenêtre du lieu est fermée
    Et la fiche du lieu "Brasserie IHM E2E" affiche "4,0 / 5 · 1 note"
    Et la fiche du lieu "Brasserie IHM E2E" affiche "Ajouté par"

  Scénario: Saisie incomplète : message d'erreur dans la fenêtre
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'ouvre la fenêtre d'ajout d'un lieu
    Et j'enregistre le lieu
    Alors la fenêtre du lieu affiche "Choisissez une typologie"

  Scénario: Boutons de modification selon les droits
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'affiche les lieux du SAMU-SAS de test
    Alors la fiche du lieu ne propose ni modification ni suppression
    Quand "Administrateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'affiche les lieux du SAMU-SAS de test
    Alors la fiche du lieu propose la modification et la suppression

  Scénario: Modification puis suppression d'un lieu par son créateur
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'affiche les lieux du SAMU-SAS de test
    Et je renomme le lieu en "Renommé IHM E2E" depuis sa fiche
    Alors la fiche du lieu affiche "Renommé IHM E2E"
    Quand je supprime le lieu depuis sa fiche et je confirme
    Alors la fiche du lieu n'est plus affichée
    Et le lieu n'existe plus

  Scénario: Note et commentaires depuis la fiche
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'affiche les lieux du SAMU-SAS de test
    Et j'ouvre les avis du lieu
    Et je note le lieu 4 depuis sa fiche
    Alors la fiche du lieu affiche "4,0 / 5 · 1 note"
    Quand je publie le commentaire "Calme et propre IHM"
    Alors la fiche du lieu affiche "Calme et propre IHM"
    Et la fiche du lieu affiche "Avis et notes (1 commentaire)"
    Quand je modifie mon commentaire en "Calme, propre et bien situé IHM"
    Alors la fiche du lieu affiche "Calme, propre et bien situé IHM"
    Et la fiche du lieu affiche "modifié le"
    Quand je supprime mon commentaire depuis la fiche et je confirme
    Alors la fiche du lieu affiche "Aucun commentaire pour le moment."
    Quand je retire ma note depuis la fiche
    Alors la fiche du lieu affiche "Pas encore noté"

  Scénario: Filtres de l'onglet
    Étant donné que "Utilisateur" a ajouté un lieu "restaurant" nommé "Bistrot IHM E2E"
    Et que "Expert" a ajouté un lieu "hebergement" nommé "Hôtel IHM E2E"
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et je choisis le SAMU-SAS de test dans les filtres
    Alors l'onglet affiche les lieux "Bistrot IHM E2E, Hôtel IHM E2E" et le compteur "2 lieux"
    Quand je filtre sur la typologie "Hébergement (1)"
    Alors l'onglet affiche les lieux "Hôtel IHM E2E" et le compteur "1 lieu"
    Quand je filtre sur la typologie "Tout (2)"
    Et je filtre sur le créateur "Expert"
    Alors l'onglet affiche les lieux "Hôtel IHM E2E" et le compteur "1 lieu"
    Quand je réinitialise les filtres
    Et je choisis le SAMU-SAS de test dans les filtres
    Et je recherche "bistrot"
    Alors l'onglet affiche les lieux "Bistrot IHM E2E" et le compteur "1 lieu"

  Scénario: Trajet depuis la fiche : SAMU-SAS non géolocalisé
    Étant donné que "Utilisateur" a ajouté un lieu de test
    Et que le SAMU-SAS de test perd sa géolocalisation
    Quand "Utilisateur" ouvre l'application
    Et j'ouvre l'onglet "SAMU-SAS TripAdVisor"
    Et j'affiche les lieux du SAMU-SAS de test
    Et je demande le trajet vers le SAMU-SAS depuis la fiche
    Alors la fiche du lieu affiche "n'est pas géolocalisé"

  Scénario: Scénario TripAdVisor complet
    Quand "Utilisateur" ajoute un lieu "hebergement" nommé "Hôtel complet E2E" au "2 rue du Test, Paris" avec ses coordonnées
    Et "Expert" note ce lieu 4
    Et "Expert" commente ce lieu "Très bien situé"
    Alors le lieu a une moyenne de 4 pour 1 note
    Et le filtre créateur "Utilisateur" donne "Hôtel complet E2E"
    Quand "Utilisateur" supprime ce lieu
    Alors la réponse a le statut 200
    Et le lieu n'existe plus
    Et les notes et commentaires du lieu ont été supprimés
