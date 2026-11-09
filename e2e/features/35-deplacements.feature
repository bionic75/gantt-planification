# language: fr
@deplacements
Fonctionnalité: Suivi des déplacements : mes déplacements
  Onglet « Planification des déplacements » de l'application « Suivi des déplacements » (menu Applications) :
  formulaire d'ajout (AMOA CED, dates et nombre d'UO, SAMU, ville, bon de commande présélectionné, avertissement de
  dépassement), contrôles, liste (mise en évidence des déplacements à affecter ou en dépassement, tri), modification et
  suppression. Données : un bon de commande de test de 10 UO couvrant l'année 2031 et des déplacements de 2031 (ville
  unique), supprimés en fin de scénario. Scénarios ignorés si le compte de test n'a pas accès à l'application.

  Contexte:
    Étant donné qu'un bon de commande de test de 10 UO couvre l'année 2031

  Scénario: Administrateur : liste de tous les déplacements, colonnes du créateur
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Alors la liste est titrée "Liste de tous les déplacements"
    Et la liste présente les colonnes "Créé par" et "Créé le"
    Et la liste présente le déplacement de test avec "3" UO et le bon de commande de test
    Et l'AMOA CED se choisit dans une liste

  Scénario: Ajout d'un déplacement : UO calculées, bon de commande présélectionné, ville en majuscules
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je saisis un déplacement de test du "2031-03-02" au "2031-03-04"
    Alors le nombre d'UO proposé est "3"
    Et le bon de commande de test est présélectionné
    Quand j'ajoute le déplacement
    Alors une alerte affiche "Déplacement ajouté avec succès"
    Et la liste présente le déplacement de test avec "3" UO et le bon de commande de test
    Et le formulaire d'ajout est vidé

  Scénario: Ajout refusé : champs obligatoires, dates inversées, hors période du bon de commande
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand j'ajoute le déplacement
    Alors une alerte affiche "Veuillez remplir tous les champs obligatoires"
    Quand je ferme le message
    Et je saisis un déplacement de test du "2031-03-04" au "2031-03-02"
    Et je choisis le bon de commande de test
    Et j'ajoute le déplacement
    Alors une alerte affiche "La date de fin doit être postérieure ou égale à la date de début"
    Quand je ferme le message
    Et je saisis un déplacement de test du "2032-01-05" au "2032-01-06"
    Et je choisis le bon de commande de test
    Et j'ajoute le déplacement
    Alors une alerte affiche "en dehors de la période du bon de commande"
    Et aucun déplacement de test n'est enregistré

  Scénario: Avertissement de dépassement du solde du bon de commande
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je saisis un déplacement de test du "2031-03-02" au "2031-03-13"
    Alors l'avertissement indique "10 UO disponibles, 12 UO demandées"

  Scénario: Déplacements en dépassement et à affecter mis en évidence
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 8 UO existe sur le bon de commande de test
    Et qu'un second déplacement de test de 5 UO existe sur le bon de commande de test
    Et qu'un déplacement de test sans bon de commande existe
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Alors le second déplacement de test est mis en évidence avec "Dépasse le plafond de la commande"
    Et le déplacement de test sans bon de commande est mis en évidence, à affecter

  Scénario: Modification d'un déplacement
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je modifie la ville du déplacement de test
    Alors une alerte affiche "Déplacement modifié avec succès"
    Et la liste présente le déplacement de test avec sa nouvelle ville

  Scénario: Suppression d'un déplacement
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je supprime le déplacement de test et je confirme
    Alors une alerte affiche "Déplacement supprimé"
    Et la liste ne présente plus le déplacement de test

  Scénario: Tri de la liste par ville
    Étant donné que "Administrateur" a accès à l'application « Suivi des déplacements »
    Et qu'un déplacement de test de 3 UO existe sur le bon de commande de test
    Et que j'ouvre le suivi des déplacements en tant que "Administrateur"
    Quand je trie la liste par "Ville"
    Alors la colonne "Ville" de la liste est triée

  Scénario: Utilisateur : ses déplacements, AMOA CED fixé à son nom
    Étant donné que "Utilisateur" a accès à l'application « Suivi des déplacements »
    Et que j'ouvre le suivi des déplacements en tant que "Utilisateur"
    Alors la liste est titrée "Liste de mes déplacements"
    Et la liste ne présente pas la colonne "Créé par"
    Et l'AMOA CED est fixé au nom de "Utilisateur"
