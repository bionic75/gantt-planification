# language: fr
@deplacements
Fonctionnalité: Suivi des déplacements : cadre, reporting et administration
  Cadre de l'application « Suivi des déplacements » (menu Applications) : en-tête (nom, profil, minuteur), onglets selon
  le profil, recherche, fenêtre de déconnexion ; onglet Reporting (synthèse des bons de commande, liste filtrable,
  export CSV) ; onglet Administration (bons de commande, déplacements d'un bon, régularisation technique). Données :
  bons de commande et déplacements de test de l'année 2033 (la fonctionnalité 35, exécutée en parallèle, utilise 2031),
  supprimés en fin de scénario. Scénarios ignorés si le
  compte de test n'a pas accès à l'application.

  Contexte:
    Étant donné qu'un bon de commande de test de 10 UO couvre l'année 2033

  Scénario: Administrateur : en-tête et onglets de l'application
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Alors l'en-tête des déplacements présente le nom de "Administrateur" et le profil "Administrateur"
    Et les onglets des déplacements sont "Planification des déplacements, Reporting, Administration"

  Scénario: Utilisateur : pas d'onglet Administration
    Étant donné que "Utilisateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Utilisateur"
    Alors les onglets des déplacements sont "Planification des déplacements, Reporting"

  Scénario: Le minuteur d'inactivité décompte
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Alors le minuteur des déplacements décompte

  Scénario: Recherche : fonctionnalité en cours de développement
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je lance la recherche des déplacements
    Alors une alerte affiche "Recherche - Fonctionnalité en cours de développement"

  Scénario: Fenêtre de déconnexion : annuler, puis aller sur la Plateforme de planification
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je clique sur la déconnexion des déplacements
    Alors la fenêtre de déconnexion propose "Aller sur la Plateforme de planification", "Se déconnecter" et "Annuler"
    Quand je choisis "Annuler" dans la fenêtre de déconnexion
    Alors l'application des déplacements est toujours affichée
    Quand je clique sur la déconnexion des déplacements
    Et je choisis "Aller sur la Plateforme de planification" dans la fenêtre de déconnexion
    Alors la Plateforme de planification est affichée

  Scénario: Reporting : synthèse du bon de commande de test
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ouvre l'onglet "Reporting" des déplacements
    Alors la synthèse présente le bon de commande de test : "10" UO commandées, "3" consommées, solde "7", "30%"

  Scénario: Reporting : filtre par bon de commande et export CSV
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et qu'un déplacement de test sans bon de commande existe
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ouvre l'onglet "Reporting" des déplacements
    Et je filtre le reporting sur le bon de commande de test
    Alors le reporting compte "1 déplacement(s) - Total: 3 UO"
    Et l'export CSV du reporting contient le déplacement de test
    Quand je réinitialise les filtres du reporting
    Alors le filtre du bon de commande est vide et la liste présente aussi le déplacement sans bon de commande

  Scénario: Administration : création, doublon, modification et suppression d'un bon de commande
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ouvre l'onglet "Administration" des déplacements
    Et je crée un bon de commande de test depuis l'écran
    Alors une alerte affiche "Bon de commande créé avec succès"
    Et la liste des bons de commande présente le bon créé, titulaire "E2E TITULAIRE"
    Quand je ferme le message
    Et je crée à nouveau le même bon de commande
    Alors une alerte affiche "Ce numéro de CBDC existe déjà"
    Quand je ferme le message
    Et je change le titulaire du bon créé en "autre titulaire"
    Alors une alerte affiche "Bon de commande modifié avec succès"
    Et la liste des bons de commande présente le bon créé, titulaire "AUTRE TITULAIRE"
    Quand je ferme le message
    Et je supprime le bon créé et je confirme
    Alors une alerte affiche "Bon de commande supprimé"
    Et la liste des bons de commande ne présente plus le bon créé

  Scénario: Administration : création refusée si un champ manque
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ouvre l'onglet "Administration" des déplacements
    Et j'ajoute le bon de commande sans le remplir
    Alors une alerte affiche "Veuillez remplir tous les champs"

  Scénario: Administration : déplacements d'un bon de commande
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ouvre l'onglet "Administration" des déplacements
    Alors l'observation du bon de commande de test indique "7 UO disponibles"
    Quand j'ouvre les déplacements du bon de commande de test
    Alors la fenêtre liste le déplacement de test avec "3" UO
    Et la fenêtre ne propose pas de régularisation

  Scénario: Administration : régularisation technique d'un bon soldé en surconsommation
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que le bon de commande de test, soldé, a consommé 12 UO
    Et qu'un second bon de commande de test couvre l'année de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ouvre l'onglet "Administration" des déplacements
    Alors l'observation du bon de commande de test indique "Régularisation à prévoir pour 2 UO"
    Quand j'ouvre les déplacements du bon de commande de test
    Et je régularise les 2 UO sur le second bon de commande de test et je confirme
    Alors une alerte affiche "Ligne de régularisation créée avec succès"
    Et l'observation du bon de commande de test indique "Surconsommation régularisée sur le bon de commande"
