# language: fr
@grille
Fonctionnalité: Grille de la planification : affichage et saisie des demi-journées
  Saisie par clic dans la grille : disponibilité, affectation, localisation (et SAMU), refus selon le profil et l'état
  de la demi-journée, enregistrement. Les données sont celles de ressources de test sur le mois M+3 (la grille ne va
  pas au-delà de la dernière année proposée), supprimées en fin de scénario ; pour l'expert de test, le mois M+3 est
  remis en état après le scénario.

  Scénario: Disponibilité et affectation : cycles de l'administrateur, enregistrement et totaux
    Étant donné qu'une ressource de test existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Et je clique sur la disponibilité de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "2", "-"
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "2", sans localisation
    Et les totaux du premier lundi du mois indiquent "D:0.5" et "A:0.0"
    Quand je clique sur l'affectation de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "3", "-"
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "3", sans localisation
    Et les totaux du premier lundi du mois indiquent "D:0.5" et "A:0.5"
    Quand je clique 6 fois sur l'affectation de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "2", "-"
    Quand je clique sur la disponibilité de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "1", "1", "-"
    Et la planification de la ressource de test le premier lundi du mois au matin est "1", "1", sans localisation

  Scénario: Localisation : disponibilité puis SAMU d'une affectation SAMU, localisation effacée enregistrée
    Étant donné qu'une ressource de test est disponible le premier lundi du mois M+3 au matin
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Et je clique sur la localisation de la ressource de test le premier lundi du mois au matin
    Alors la fenêtre des localisations a pour titre "Où êtes-vous disponible ? (AM)"
    Et la fenêtre des localisations propose "Je suis en télétravail", "Je suis à PSC", "Je peux me déplacer"
    Quand je choisis la localisation "Je suis à PSC"
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "2", "PSC"
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "2", "🗼 PSC"
    Quand je clique sur l'affectation de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "3", "-"
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "3", sans localisation
    Quand je clique sur la localisation de la ressource de test le premier lundi du mois au matin
    Alors la fenêtre des localisations a pour titre "Choisir la localisation de l'activité (AM)"
    Et la fenêtre des localisations propose "Télétravail", "SAMU (cliquer pour sélectionner)", "PSC", "Autres (Congrès, CFARM, EHESP...)"
    Quand je choisis la localisation "SAMU (cliquer pour sélectionner)"
    Et je valide le choix du SAMU sans en choisir
    Alors une alerte affiche "Veuillez sélectionner un SAMU"
    Quand je ferme le message
    Et je valide le choix du SAMU "SAMU 75"
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "3", "75"
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "3", "🚨 SAMU 75"

  Scénario: Affectation posée par quelqu'un d'autre : confirmation avant modification
    Étant donné qu'une ressource de test est affectée en "5" le premier lundi du mois M+3 au matin par "Autre.Personne"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Et je clique sur l'affectation de la ressource de test le premier lundi du mois au matin
    Alors la confirmation de modification signale l'affectation "ANS (Déploiement)" posée par "Autre Personne"
    Quand j'abandonne la modification
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "5", "-"
    Quand je clique sur l'affectation de la ressource de test le premier lundi du mois au matin
    Et je poursuis la modification
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "6", "-"
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "6", sans localisation

  Scénario: Refus selon l'état de la demi-journée
    Étant donné qu'une ressource de test existe
    Et que la ressource de test est en congés le deuxième lundi du mois M+3 au matin
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Et je clique sur l'affectation de la ressource de test le premier lundi du mois au matin
    Alors une alerte affiche "La ressource est indisponible ce jour. Vous devez d'abord mettre la disponibilité à 2."
    Quand je ferme le message
    Et je clique sur la localisation de la ressource de test le premier lundi du mois au matin
    Alors une alerte affiche "Vous devez d'abord indiquer"
    Quand je ferme le message
    Et je clique sur la disponibilité de la ressource de test le deuxième lundi du mois au matin
    Alors une alerte affiche "Cette période est en Congés (posée par l'expert). Seul l'expert peut modifier ce statut."
    Quand je ferme le message
    Alors la demi-journée de la ressource de test le deuxième lundi du mois au matin affiche "congés"

  Scénario: Profil Utilisateur : planning en lecture seule
    Étant donné qu'une ressource de test est disponible le premier lundi du mois M+3 au matin
    Et que je suis connecté en tant que "Utilisateur"
    Quand j'affiche le mois M+3 dans la planification
    Et je clique sur la disponibilité de la ressource de test le premier lundi du mois au matin
    Alors une alerte affiche "Vous n'avez pas les droits pour modifier la disponibilité. Seuls Admin et Expert peuvent le faire."
    Quand je ferme le message
    Et je clique sur l'affectation de la ressource de test le premier lundi du mois au matin
    Alors une alerte affiche "Profil utilisateur : planning en lecture seule"
    Quand je ferme le message
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "2", "-"
    Quand je clique sur la localisation de la ressource de test le premier lundi du mois au matin
    Alors une alerte affiche "Profil utilisateur : planning en lecture seule"
    Quand je ferme le message
    Alors la planification de la ressource de test le premier lundi du mois au matin est "2", "2", sans localisation

  Scénario: Expert : sa ligne seulement, congés posés par l'expert
    Étant donné qu'une ressource de test existe
    Et que le mois M+3 de l'expert de test sera remis en état après le scénario
    Et que je suis connecté en tant que "Expert"
    Quand j'affiche le mois M+3 dans la planification
    Et je retire le filtre des ressources
    Et je clique sur la disponibilité de l'expert de test le premier lundi du mois au matin
    Alors la demi-journée de l'expert de test le premier lundi du mois au matin affiche "2", "2", "-"
    Quand je clique sur la disponibilité de l'expert de test le premier lundi du mois au matin
    Alors la demi-journée de l'expert de test le premier lundi du mois au matin affiche "congés"
    Et la planification de l'expert de test le premier lundi du mois au matin est "3", "1", "🏖️"
    Quand je clique sur la disponibilité de l'expert de test le premier lundi du mois au matin
    Alors la demi-journée de l'expert de test le premier lundi du mois au matin affiche "1", "1", "-"
    Et la planification de l'expert de test le premier lundi du mois au matin est "1", "1", sans localisation
    Quand je clique sur la disponibilité de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "1", "1", "-"

  Scénario: Fin de mise à disposition dans le mois : la saisie reste possible jusqu'au dernier jour
    Étant donné qu'une ressource de test mise à disposition jusqu'au dernier jour du mois M+3 existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Et je clique sur la disponibilité de la ressource de test le premier lundi du mois au matin
    Alors la demi-journée de la ressource de test le premier lundi du mois au matin affiche "2", "2", "-"

  Scénario: Enregistrement : une saisie n'écrase pas les modifications faites ailleurs entre-temps
    Étant donné qu'une ressource de test est disponible le premier lundi du mois M+3 au matin
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Et l'affectation de la ressource de test le premier lundi du mois au matin passe à "7" depuis un autre poste
    Et je clique sur la disponibilité de la ressource de test le deuxième lundi du mois au matin
    Alors la planification de la ressource de test le deuxième lundi du mois au matin est "2", "2", sans localisation
    Et la planification de la ressource de test le premier lundi du mois au matin est "2", "7", sans localisation

  Scénario: Compteur de jours d'une ressource dont la mise à disposition commence dans le mois
    Étant donné qu'une ressource de test mise à disposition à 100 % à partir du premier lundi du mois M+3 existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+3 dans la planification
    Alors le compteur de la ressource de test indique les jours ouvrés du mois à partir du premier lundi

  Scénario: Navigation au-delà de la dernière année proposée et zoom
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois de décembre de la dernière année proposée dans la planification
    Et je passe au mois suivant dans la planification
    Alors la planification affiche janvier de l'année suivante
    Et la grille de la planification présente 31 jours
    Quand je zoome 5 fois en avant
    Alors le zoom indique "140%"
    Quand je zoome 7 fois en arrière
    Alors le zoom indique "80%"
    Quand je réinitialise le zoom
    Alors le zoom indique "100%"
