# language: fr
@menu-grille
Fonctionnalité: Menu contextuel de la grille : astreintes / HNO d'une demi-journée
  Clic droit sur une demi-journée de la grille : ajout, modification, suppression des astreintes / HNO de l'expert
  (saisie du mois, « Terminer » enregistre le mois). Lignes de l'expert de test sur le mois M+4, supprimées en fin de
  scénario. Les astreintes créées par l'API déclenchent la notification Teams des astreintes : ces scénarios sont
  ignorés si elle vise un canal réel.

  Contexte:
    Étant donné que les notifications Teams des astreintes ne partent vers aucun canal réel

  Scénario: Administrateur : ajout d'une astreinte depuis une matinée, contrôles, enregistrement du mois
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+4 dans la planification
    Et j'ouvre le menu de la matinée du premier lundi du mois de l'expert de test
    Alors le menu de la demi-journée est titré pour l'expert de test, le premier lundi du mois, "AM"
    Et le menu propose seulement "Ajouter une astreinte / HNO"
    Quand je choisis "Ajouter une astreinte / HNO" dans le menu
    Alors la saisie des astreintes de l'expert de test est ouverte pour le mois M+4
    Et la saisie propose le premier lundi du mois de "00:00" à "11:59"
    Quand j'ajoute la ligne de la saisie
    Alors une alerte affiche "Veuillez remplir tous les champs obligatoires (*)"
    Quand je ferme le message
    Et je saisis une astreinte de test sur le premier SAMU proposé
    Et j'ajoute la ligne de la saisie
    Alors la liste de la saisie présente l'astreinte de test
    Quand je termine la saisie des astreintes
    Alors la saisie des astreintes est fermée
    Et l'astreinte de test est enregistrée pour l'expert de test le premier lundi du mois de "00:00" à "11:59"
    Et la matinée du premier lundi du mois de l'expert de test porte la pastille "ASTR"

  Scénario: Administrateur : après-midi proposé de 12:00 à 23:59
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+4 dans la planification
    Et j'ouvre le menu de l'après-midi du premier lundi du mois de l'expert de test
    Et je choisis "Ajouter une astreinte / HNO" dans le menu
    Alors la saisie propose le premier lundi du mois de "12:00" à "23:59"
    Quand je ferme la saisie des astreintes
    Alors la saisie des astreintes est fermée

  Scénario: Administrateur : modification puis suppression d'une astreinte depuis le menu
    Étant donné qu'une astreinte de test de l'expert de test a lieu le premier lundi du mois M+4 de "18:00" à "23:00"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+4 dans la planification
    Et j'ouvre le menu de l'après-midi du premier lundi du mois de l'expert de test
    Alors le menu propose de modifier et de supprimer l'astreinte de test, puis d'ajouter une astreinte / HNO
    Quand je choisis de modifier l'astreinte de test dans le menu
    Alors la saisie présente l'astreinte de test à modifier
    Quand je change l'objet de l'astreinte de test
    Et j'ajoute la ligne de la saisie
    Et je termine la saisie des astreintes
    Alors l'astreinte de test modifiée est la seule astreinte de test de l'expert de test
    Quand j'ouvre le menu de l'après-midi du premier lundi du mois de l'expert de test
    Et je choisis de supprimer l'astreinte de test dans le menu et je confirme
    Alors l'expert de test n'a plus d'astreinte de test
    Et l'après-midi du premier lundi du mois de l'expert de test ne porte plus de pastille

  Scénario: Ressource sans compte : saisie impossible
    Étant donné qu'une ressource de test existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+4 dans la planification
    Et j'ouvre le menu de la matinée du premier lundi du mois de la ressource de test
    Et je choisis "Ajouter une astreinte / HNO" dans le menu
    Alors une alerte affiche "Cette ressource n'a pas de compte utilisateur associé."

  Scénario: Expert : menu sur sa ligne seulement
    Étant donné qu'une ressource de test existe
    Et que je suis connecté en tant que "Expert"
    Quand j'affiche le mois M+4 dans la planification
    Et je retire le filtre des ressources
    Et j'ouvre le menu de la matinée du premier lundi du mois de la ressource de test
    Alors aucun menu de demi-journée n'est ouvert
    Quand j'ouvre le menu de la matinée du premier lundi du mois de l'expert de test
    Alors le menu propose seulement "Ajouter une astreinte / HNO"

  Scénario: Astreinte commencée le mois précédent : modifiée sans être dupliquée
    Étant donné qu'une astreinte de test de l'expert de test va du dernier jour du mois M+3 "20:00" au premier jour du mois M+4 "08:00"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+4 dans la planification
    Et j'ouvre le menu de la matinée du premier jour du mois de l'expert de test
    Et je choisis de modifier l'astreinte de test dans le menu
    Et je change l'objet de l'astreinte de test
    Et j'ajoute la ligne de la saisie
    Et je termine la saisie des astreintes
    Alors l'astreinte de test modifiée est la seule astreinte de test de l'expert de test

  Scénario: « Tous les SAMU » conservé à l'enregistrement du mois
    Étant donné qu'un travail HNO de test de l'expert de test pour tous les SAMU a lieu le premier lundi du mois M+4 de "18:00" à "23:00"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+4 dans la planification
    Et j'ouvre le menu de la matinée du deuxième lundi du mois de l'expert de test
    Et je choisis "Ajouter une astreinte / HNO" dans le menu
    Alors la liste de la saisie présente le travail HNO de test pour "Tous les SAMU"
    Quand je termine la saisie des astreintes
    Alors le travail HNO de test est toujours enregistré pour tous les SAMU
