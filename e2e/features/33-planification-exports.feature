# language: fr
@exports-grille
Fonctionnalité: Exports et impressions de la planification
  Téléchargement du planning d'un mois au format CSV, impression A4 de la page, calendrier du mois d'une ressource
  (aperçu, impression, envoi par e-mail). Les impressions sont interceptées (aucune boîte de dialogue du navigateur) ;
  l'envoi par e-mail s'arrête à la confirmation, refusée : aucun message n'est envoyé. Astreinte de l'expert de test
  sur le mois M+5 (réservé à cette fonctionnalité), supprimée en fin de scénario.

  Scénario: Téléchargement du planning du mois courant au format CSV
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre la fenêtre de téléchargement du planning
    Alors la fenêtre propose seize mois, du mois courant moins douze au mois courant plus trois, le mois courant choisi
    Quand je télécharge le planning au format CSV
    Alors le fichier "Expert_Planning_<mois courant>_Sauvegarde_de_<horodatage>.csv" présente le planning du mois courant
    Et la fenêtre de téléchargement est fermée

  Scénario: Téléchargement abandonné
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre la fenêtre de téléchargement du planning
    Et j'abandonne le téléchargement
    Alors la fenêtre de téléchargement est fermée

  Scénario: Impression A4 de la planification
    Étant donné que je suis connecté en tant que "Administrateur"
    Et que les impressions de la page sont interceptées
    Quand j'imprime la planification au format A4
    Alors l'impression de la page est demandée une seule fois

  Scénario: Calendrier d'une ressource : aperçu et impression, pastille d'une astreinte
    Étant donné que les notifications Teams des astreintes ne partent vers aucun canal réel
    Et qu'une astreinte d'export de l'expert de test a lieu le premier lundi du mois M+5 de "18:00" à "23:00"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+5 dans la planification
    Et j'ouvre l'aperçu du calendrier de l'expert de test
    Alors l'aperçu présente le calendrier de l'expert de test pour le mois M+5
    Et l'aperçu porte la pastille "ASTR" l'après-midi du premier lundi du mois
    Quand les impressions sont interceptées
    Et j'imprime l'aperçu du calendrier
    Alors le calendrier de l'expert de test est imprimé une seule fois, en paysage
    Quand je ferme l'aperçu du calendrier
    Alors l'aperçu du calendrier est fermé

  Scénario: Envoi du calendrier par e-mail : confirmation refusée, aucun envoi
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+5 dans la planification
    Et je demande l'envoi par e-mail du calendrier de l'expert de test et refuse la confirmation
    Alors la confirmation proposait l'envoi à l'adresse de l'expert de test
    Et aucun calendrier n'a été envoyé

  Scénario: Envoi du calendrier d'une ressource sans compte : refusé
    Étant donné qu'une ressource de test existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'affiche le mois M+5 dans la planification
    Et je demande l'envoi par e-mail du calendrier de la ressource de test
    Alors une alerte affiche "Aucun utilisateur avec email n'est associé à"
    Et aucun calendrier n'a été envoyé
