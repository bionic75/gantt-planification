# language: fr
@affectation
Fonctionnalité: Aide à l'affectation : onglet « Administration »
  Déploiements de SAMU (création par le formulaire, contrôles, modification, liens avec les événements, historique,
  suppression), couleurs des étapes, nom des fichiers d'export, correspondance des activités et rubriques repliables.
  Données : une localisation SAMU de test, des déploiements et événements de test, supprimés en fin de scénario. Les
  couleurs et le nom des fichiers d'export, communs à tous, sont rétablis en fin de scénario ; ni la correspondance des
  activités ni le modèle PowerPoint ne sont modifiés.

  Contexte:
    Étant donné qu'une localisation SAMU de test existe

  Scénario: Création d'un déploiement par le formulaire (entité proposée, calendrier, nombre de jours)
    Étant donné que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand j'ouvre le formulaire « Nouveau déploiement »
    Et je choisis le SAMU de test parmi les entités proposées, au clavier
    Et je saisis le début du projet "2034-01-09"
    Et je choisis dans le calendrier la semaine 10 de mars 2034 pour le début de la visite métier
    Alors la visite métier commence le "2034-03-06" en semaine "2034-W10" et finit le "2034-03-06"
    Quand je saisis 3 jours et 2 ressources pour la visite métier
    Alors la visite métier finit le "2034-03-08"
    Quand j'enregistre le déploiement
    Alors le déploiement du SAMU de test est listé avec "Début : 09/01/2034"
    Et le déploiement enregistré est rattaché à la localisation, avec une visite métier du "2034-03-06" au "2034-03-08" pour 2 ressources

  Scénario: Contrôles du formulaire : rien n'est enregistré tant qu'il reste des oublis
    Étant donné que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand j'ouvre le formulaire « Nouveau déploiement »
    Et je choisis le SAMU de test parmi les entités proposées, au clavier
    Et je saisis une visite métier du "2034-03-08" au "2034-03-06"
    Et j'enregistre le déploiement
    Alors le formulaire signale "Date de début du projet : à renseigner."
    Et le formulaire signale "Visite métier : la date de fin précède la date de début."
    Et le formulaire signale "Visite métier : nombre de ressources nécessaires à renseigner."
    Et aucun déploiement n'est enregistré pour le SAMU de test

  Scénario: Modification d'un déploiement et historique
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je modifie le déploiement du SAMU de test
    Et je saisis la mise en service "2031-04-15" et j'enregistre le déploiement
    Alors le déploiement enregistré a sa mise en service au "2031-04-15"
    Quand j'ouvre l'historique du déploiement du SAMU de test
    Alors l'historique présente "Modification" puis "Création du déploiement"
    Et l'historique indique "Mise en service" de "01/04/2031" à "15/04/2031"

  Scénario: Événement relié depuis le formulaire, puis suppression du déploiement seul
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'un événement « Visite métier » de test "A" a lieu du "2031-03-03" au "2031-03-05"
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je modifie le déploiement du SAMU de test
    Et je relie l'événement "A" à la visite métier
    Alors le formulaire indique « ✔ mêmes dates que l'activité » pour la visite métier
    Et la visite métier du déploiement est reliée à l'événement "A"
    Quand je ferme le formulaire du déploiement
    Et je supprime le déploiement du SAMU de test
    Alors la suppression présente l'événement "A" lié au déploiement
    Quand je choisis « Supprimer le déploiement seulement »
    Alors le déploiement du SAMU de test n'est plus listé
    Et l'événement "A" existe toujours

  Scénario: Suppression d'un déploiement sans événement, après une première annulation
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je renonce à supprimer le déploiement du SAMU de test
    Alors le déploiement du SAMU de test est listé avec "Début : 06/01/2031"
    Quand je supprime le déploiement du SAMU de test
    Alors le déploiement du SAMU de test n'est plus listé

  Scénario: Couleur et motif d'une étape, enregistrés puis rétablis
    Étant donné que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je choisis la couleur "#123456" et le motif « Pois » pour l'étape « Visite métier »
    Alors l'aperçu de l'étape « Visite métier » est en "rgb(18, 52, 86)" avec un motif
    Quand j'enregistre les couleurs
    Alors le message des couleurs indique "Couleurs et motifs enregistrés."
    Et la couleur "#123456" et le motif "dots" de l'étape « visite_metier » sont enregistrés
    Quand je rétablis les couleurs par défaut
    Alors le message des couleurs indique "Couleurs et motifs par défaut rétablis : pensez à enregistrer."
    Et l'aperçu de l'étape « Visite métier » n'a plus de motif

  Scénario: Nom des fichiers d'export : exemple, enregistrement, retour au nom par défaut
    Étant donné que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Quand je saisis le modèle de nom "E2E_{AAAA}_{TITRE}"
    Alors l'exemple de nom est "E2E_{année}_Planning_des_deploiements_des_SAMU.pptx"
    Quand j'enregistre le modèle de nom
    Alors le message du modèle indique "Nom de fichier enregistré."
    Et le modèle de nom enregistré est "E2E_{AAAA}_{TITRE}"
    Quand je rétablis le nom par défaut
    Alors le modèle de nom enregistré est celui par défaut

  Scénario: Correspondance des activités et rubriques repliables
    Étant donné que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Alors la correspondance présente l'activité « Visite métier » avec son type d'événement et son aperçu
    Quand je replie la rubrique « Paramétrer la couleur des étapes »
    Alors la rubrique « Paramétrer la couleur des étapes » est repliée
    Quand je rouvre l'administration de l'aide à l'affectation
    Alors la rubrique « Paramétrer la couleur des étapes » est repliée
    Quand je déplie la rubrique « Paramétrer la couleur des étapes »
    Alors la rubrique « Paramétrer la couleur des étapes » est dépliée

  Scénario: Asana : rubrique « Connexion Asana » et fenêtre d'import (lecture seule)
    Étant donné que j'ouvre l'administration de l'aide à l'affectation en tant que "Administrateur"
    Alors la rubrique « Connexion Asana » présente l'état de la connexion
    Quand j'ouvre « Importer depuis Asana »
    Alors la fenêtre d'import d'un export CSV d'Asana est proposée
    Quand je ferme la fenêtre d'import Asana
    Alors la fenêtre d'import d'un export CSV d'Asana est fermée
