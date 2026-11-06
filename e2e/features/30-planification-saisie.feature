# language: fr
@saisie
Fonctionnalité: Fenêtres de saisie et de notification de la planification
  « Gérer mes / les astreintes/HNO » et « Faire une demande » (en-tête de la planification), invitations Outlook des
  affectations (enveloppe de l'en-tête) et nouvelles affectations de l'expert (pastille de la photo de profil).
  Aucun message n'est envoyé : la demande d'affectation et les invitations s'arrêtent avant l'envoi. Les astreintes
  de test de l'expert de test sont placées en août 2031 et supprimées en fin de scénario ; leur création déclenche la
  notification Teams des astreintes (automatisation n°3) : ces scénarios sont ignorés si elle vise un canal réel.

  Scénario: Astreintes de l'expert : contrôles de saisie, ajout, modification et suppression
    Étant donné que les notifications Teams des astreintes ne partent vers aucun canal réel
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre la fenêtre des astreintes/HNO
    Alors la fenêtre des astreintes a pour titre "Gérer mes astreintes/HNO"
    Et le formulaire des astreintes est replié
    Quand je déplie le formulaire des astreintes
    Et j'enregistre l'astreinte
    Alors une alerte affiche "Veuillez remplir les dates"
    Quand je choisis le "2031-08-04" comme date de début de l'astreinte
    Alors la date de fin de l'astreinte est le "2031-08-04"
    Quand j'enregistre l'astreinte
    Alors une alerte affiche "Veuillez remplir les heures de début et de fin"
    Quand je choisis les heures "18:00" à "23:00"
    Et j'enregistre l'astreinte
    Alors une alerte affiche "Veuillez sélectionner un SAMU ou cocher"
    Quand je choisis le SAMU "SAMU 75"
    Et j'enregistre l'astreinte
    Alors une alerte affiche "Veuillez remplir l'objet"
    Quand je donne un objet de test à l'astreinte
    Et j'enregistre l'astreinte
    Alors une alerte affiche "Astreinte/HNO créée avec succès"
    Et l'astreinte de test est enregistrée pour l'expert de test : "astreinte" le "2031-08-04" de "18:00" à "23:00", "SAMU 75"
    Et le formulaire des astreintes est replié
    Quand je déplie "2031" puis "Août" dans la liste des astreintes
    Alors la liste présente l'astreinte de test : "Astreinte", "04/08/2031 (18:00 - 23:00)", "SAMU 75"
    Quand je modifie l'astreinte de test en travail HNO pour tous les SAMU
    Alors une alerte affiche "Astreinte/HNO modifiée avec succès"
    Et l'astreinte de test est enregistrée pour l'expert de test : "hno" le "2031-08-04" de "18:00" à "23:00", "Tous les SAMU"
    Et le formulaire des astreintes est replié
    Quand je déplie "2031" puis "Août" dans la liste des astreintes
    Alors la liste présente l'astreinte de test : "HNO", "04/08/2031 (18:00 - 23:00)", "Tous les SAMU"
    Quand je supprime l'astreinte de test et je confirme
    Alors une alerte affiche "Astreinte/HNO supprimée avec succès"
    Et l'astreinte de test n'existe plus

  Scénario: Astreintes : l'administrateur saisit pour un expert
    Étant donné que les notifications Teams des astreintes ne partent vers aucun canal réel
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre la fenêtre des astreintes/HNO
    Alors la fenêtre des astreintes a pour titre "Gérer les astreintes/HNO"
    Quand je déplie le formulaire des astreintes
    Et je saisis une astreinte de test complète le "2031-08-11", de "08:00" à "12:00", "SAMU 13"
    Et j'enregistre l'astreinte
    Alors une alerte affiche "Veuillez sélectionner un expert"
    Quand je choisis l'expert de test pour l'astreinte
    Et j'enregistre l'astreinte
    Alors une alerte affiche "Astreinte/HNO créée avec succès"
    Et l'astreinte de test est enregistrée pour l'expert de test : "astreinte" le "2031-08-11" de "08:00" à "12:00", "SAMU 13"
    Quand je déplie l'expert de test, "2031" puis "Août" dans la liste des astreintes
    Alors la liste présente l'astreinte de test : "Astreinte", "11/08/2031 (08:00 - 12:00)", "SAMU 13"

  Scénario: Astreintes : modifier une activité courante conserve son type
    Étant donné que les notifications Teams des astreintes ne partent vers aucun canal réel
    Et qu'une activité courante de test de l'expert de test existe le "2031-08-18"
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre la fenêtre des astreintes/HNO
    Et je déplie "2031" puis "Août" dans la liste des astreintes
    Alors la liste présente l'astreinte de test : "Activité courante", "18/08/2031 (09:00 - 17:00)", "Tous les SAMU"
    Quand je modifie l'objet de l'astreinte de test
    Alors une alerte affiche "Astreinte/HNO modifiée avec succès"
    Et l'astreinte de test modifiée est toujours une activité courante

  Scénario: Demande d'affectation : préremplissage et contrôles, sans envoi
    Étant donné que je suis connecté en tant que "Utilisateur"
    Quand j'ouvre la demande d'affectation
    Alors la demande est préremplie au nom de "Utilisateur", du jour même au matin au jour même l'après-midi
    Quand je choisis le "2031-08-04" comme début de la demande
    Alors la fin de la demande est le "2031-08-04"
    Quand je choisis le "2031-08-01" comme fin de la demande
    Alors la demande signale "La date de fin doit être postérieure ou égale à la date de début"
    Quand je choisis le "2031-08-05" comme fin de la demande
    Alors la demande ne signale aucune erreur de date
    Quand je valide la demande
    Alors une alerte affiche "Veuillez sélectionner au moins un expert."
    Quand je cherche l'expert de test parmi les destinataires
    Alors l'expert de test est proposé avec son adresse e-mail
    Quand j'ajoute l'expert de test aux destinataires
    Alors l'expert de test figure parmi les destinataires
    Quand je retire l'expert de test des destinataires
    Alors aucun destinataire n'est choisi
    Quand j'annule la demande
    Alors la demande d'affectation est fermée

  Scénario: Demande d'affectation et astreintes : boutons selon le profil
    Étant donné que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "Planification"
    Alors le bouton "Faire une demande" n'est pas proposé
    Et le bouton "Gérer mes astreintes/HNO" est proposé

  Scénario: Invitations Outlook : affectations en attente de l'expert de test, sans envoi
    Étant donné que l'expert de test est disponible le premier lundi du mois M+2 au matin
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre les invitations Outlook
    Alors une alerte affiche "Aucune modification d'affectation à envoyer."
    Quand je ferme le message
    Et j'affecte l'expert de test le premier lundi du mois M+2 au matin dans la planification
    Alors le compteur des invitations indique 1
    Quand j'ouvre les invitations Outlook
    Alors les invitations résument "1 expert(s) - 1 nouvelle(s)"
    Et les invitations présentent l'expert de test : 1 nouvelle affectation le premier lundi du mois M+2, "Matin", "SAMU (Déploiement)"
    Quand je décoche tous les experts des invitations
    Et j'envoie les invitations
    Alors une alerte affiche "Aucun expert sélectionné pour la notification."
    Quand j'annule les invitations
    Alors les invitations sont fermées
    Et le compteur des invitations indique 1

  Scénario: Nouvelles affectations de l'expert : pastille, liste puis lecture
    Étant donné qu'une nouvelle affectation de test est notifiée à l'expert de test le "2031-08-04" au matin
    Et que je suis connecté en tant que "Expert"
    Alors la pastille des nouvelles affectations est affichée
    Quand j'ouvre les nouvelles affectations
    Alors les nouvelles affectations présentent le "04/08/2031", "Matin", "SAMU (Déploiement)" de l'administrateur de test
    Quand je ferme les nouvelles affectations
    Alors la pastille des nouvelles affectations est masquée
    Et les notifications de l'expert de test sont lues
