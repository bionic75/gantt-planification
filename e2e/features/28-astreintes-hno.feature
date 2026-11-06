# language: fr
@astreintes
Fonctionnalité: Astreintes HNO (écran)
  Rubrique « Gestion des astreintes HNO » de l'onglet Astreintes, réservée à l'administrateur : volontaires,
  disponibilités (règles FPH), génération du planning, planning actuel. Les données sont celles de ressources de test
  créées pour le scénario, sur le dernier mois proposé par l'écran (M+3) ; elles sont supprimées en fin de scénario.
  La génération remplace le planning HNO du mois en base, sans retour possible : son scénario est @destructif
  (campagne destructive de la CI, base jetable, jamais sur une instance partagée).

  Scénario: Rubrique HNO : quatre sections, réservée à l'administrateur
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'ouvre la rubrique HNO
    Alors la rubrique HNO présente les sections « Volontaires », « Disponibilités », « Génération » et « Planning actuel »

  Scénario: Volontaires : activation puis désactivation d'une ressource
    Étant donné qu'une ressource standard existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'ouvre la rubrique HNO
    Et j'ouvre la section "Volontaires au dispositif d'astreinte"
    Et je rends la ressource volontaire au dispositif d'astreinte
    Alors la ressource est volontaire au dispositif d'astreinte, activée aujourd'hui
    Et la ligne de la ressource dans les volontaires indique la date d'activation du jour
    Quand j'ouvre la section "Disponibilités pour l'astreinte"
    Alors la ressource est proposée dans les disponibilités
    Quand je retire la ressource du dispositif d'astreinte
    Alors la ressource n'est plus volontaire au dispositif d'astreinte
    Et la ressource n'est plus proposée dans les disponibilités

  Scénario: Disponibilités : saisie, règle FPH du samedi, RAZ et enregistrement
    Étant donné qu'une ressource standard volontaire au dispositif d'astreinte existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'ouvre la rubrique HNO
    Et j'ouvre la section "Disponibilités pour l'astreinte"
    Et j'affiche les disponibilités de la ressource pour le dernier mois proposé
    Alors le calendrier des disponibilités indique 0 créneau disponible (0h)
    Quand je rends disponible le premier lundi du mois
    Alors le calendrier des disponibilités indique 1 créneau disponible (14h)
    Quand je rends disponible le premier samedi du mois
    Alors le calendrier des disponibilités indique 2 créneaux disponibles (38h)
    Quand je rends disponible le deuxième samedi du mois
    Alors une alerte affiche "Impossible de se déclarer disponible ce jour"
    Et le calendrier des disponibilités indique 2 créneaux disponibles (38h)
    Quand je remets les disponibilités à zéro et je confirme
    Alors le calendrier des disponibilités indique 0 créneau disponible (0h)
    Quand je rends disponible le premier lundi du mois
    Et je valide les disponibilités
    Alors une alerte affiche "Disponibilités enregistrées avec succès"
    Et les disponibilités enregistrées de la ressource sont le premier lundi du mois

  Scénario: Planning actuel : affichage du dernier mois proposé
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'ouvre la rubrique HNO
    Et j'ouvre la section "Planning d'astreinte actuel"
    Et j'affiche le planning actuel du dernier mois proposé
    Alors le planning actuel présente le planning enregistré du mois

  @destructif
  Scénario: Génération du planning, changement d'expert, export et planning actuel
    Étant donné que deux ressources volontaires sont disponibles le premier lundi du dernier mois proposé
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Astreintes"
    Et j'ouvre la rubrique HNO
    Et j'ouvre la section "Génération du planning d'astreinte"
    Et je génère le planning du dernier mois proposé
    Alors le planning généré présente un créneau par jour du mois
    Et le premier lundi du mois est attribué à l'une des deux ressources
    Quand j'attribue le premier lundi du mois à l'autre ressource
    Alors le premier lundi du mois est enregistré pour l'autre ressource
    Et l'export CSV du planning généré présente l'autre ressource
    Quand j'ouvre la section "Planning d'astreinte actuel"
    Et j'affiche le planning actuel du dernier mois proposé
    Alors le planning actuel présente le planning enregistré du mois
