# language: fr
@cra
Fonctionnalité: CRA — circuit (écran)
  Cartes des CRA en cours (expert, administrateur), détail d'un CRA (étapes, lignes, commentaire, motifs), saisie des
  lignes, soumission, rappel, « Rien à déclarer », visas N1 et N2, refus avec motif obligatoire, correction et renvoi
  par l'administrateur, document PDF et lien direct. Les CRA de test portent sur un mois lointain (année 2090 et
  suivantes) propre à chaque scénario et sont supprimés définitivement en fin de scénario ; les notifications partent
  vers les boîtes de test.

  Contexte:
    Étant donné que l'expert de test participe au dispositif Astreintes/HNO
    Et qu'un mois de CRA inédit est choisi pour le scénario

  Scénario: Expert : carte du CRA à compléter, détail et actions proposées
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "CRA"
    Alors le CRA du mois figure dans « Mes CRA en cours de traitement » au statut "À compléter"
    Quand j'ouvre le CRA du mois
    Alors le détail du CRA du mois est affiché
    Et le détail du CRA indique "Aucune activité astreinte/HNO enregistrée pour ce mois."
    Et les actions proposées sont "Compléter mon CRA", "Valider et soumettre", "Rien à déclarer" et "Télécharger PDF"
    Quand je ferme le détail du CRA
    Alors le détail du CRA n'est plus affiché

  Scénario: Expert : saisie des lignes (contrôles, chevauchement, modification, suppression)
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Et qu'un SAMU de test existe
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Et j'ouvre la saisie du CRA
    Et j'ajoute dans la saisie une ligne "Astreinte" le 05 de "18:00" à "23:00" pour l'objet "Astreinte E2E"
    Alors la saisie liste 1 ligne
    Quand j'ajoute dans la saisie une ligne "Astreinte" le 05 de "20:00" à "22:00" pour l'objet "Chevauchement E2E"
    Alors une alerte affiche "Conflit détecté"
    Et la saisie liste 1 ligne
    Quand j'ajoute dans la saisie une ligne "Travail HNO" le 06 de "20:00" à "22:00" pour l'objet ""
    Alors une alerte affiche "Veuillez remplir tous les champs obligatoires (*)"
    Quand j'ajoute dans la saisie une ligne "Travail HNO" le 06 de "20:00" à "22:00" pour l'objet "Intervention E2E"
    Alors la saisie liste 2 lignes
    Quand je modifie dans la saisie l'heure de fin de la ligne 2 à "23:30"
    Et je supprime dans la saisie la ligne 1 et je confirme
    Alors la saisie liste 1 ligne
    Quand je termine la saisie
    Alors le CRA contient 1 ligne
    Et le détail du CRA liste l'activité "HNO" de "20:00 → 23:30" pour l'objet "Intervention E2E"

  Scénario: Expert : soumission avec commentaire, puis rappel pour correction
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Et je saisis le commentaire "Commentaire E2E" et je soumets le CRA
    Alors le CRA est au statut "soumis"
    Et le CRA porte le commentaire de l'expert "Commentaire E2E"
    Et le CRA du mois figure dans « Mes CRA en cours de traitement » au statut "Soumis — en attente visa N1"
    Et le commentaire du CRA n'est plus modifiable
    Et les actions proposées sont "Corriger/Compléter mon CRA" et "Télécharger PDF"
    Quand je clique sur l'action "Corriger/Compléter mon CRA" et je confirme
    Alors le CRA est au statut "a_completer"
    Et le CRA ne porte plus aucune signature
    Et le CRA du mois figure dans « Mes CRA en cours de traitement » au statut "Modifier"

  Scénario: Expert : « Rien à déclarer »
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Et je clique sur l'action "Rien à déclarer" et je confirme
    Alors le CRA est au statut "soumis"
    Et le CRA est marqué « rien à déclarer »
    Et le détail du CRA n'est plus affiché
    Et le CRA du mois figure dans « Mes CRA en cours de traitement » au statut "Soumis — en attente visa N1"

  Scénario: Administrateur : visas N1 puis N2 depuis le détail
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que l'administrateur de test est viseur des CRA en N1 et N2
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Alors le CRA du mois figure dans « CRA en cours de traitement » au statut "Soumis — en attente visa N1"
    Quand j'ouvre le CRA du mois
    Alors les actions proposées sont "Corriger ce CRA (admin)", "Viser (niveau 1)", "Refuser" et "Télécharger PDF"
    Quand je clique sur l'action "Viser (niveau 1)" et je confirme
    Alors le CRA est au statut "vise_n1"
    Et l'historique des signatures du détail présente "Expert" et "Viseur N1"
    Et le CRA du mois figure dans « CRA en cours de traitement » au statut "Visé N1 — en attente visa N2"
    Quand je clique sur l'action "Viser (niveau 2)" et je confirme
    Alors le CRA est au statut "vise_n2"
    Et le CRA du mois ne figure plus dans « CRA en cours de traitement »

  Plan du scénario: Administrateur : refus en <niveau>, motif obligatoire, motif présenté à l'expert
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que le CRA est visé jusqu'au niveau précédant <niveau>
    Et que l'administrateur de test est viseur des CRA en N1 et N2
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Et je refuse le CRA sans motif
    Alors une alerte affiche "Le motif de refus est obligatoire."
    Et le CRA est au statut "<statut>"
    Quand je refuse le CRA avec le motif "Horaires à préciser (E2E)" et je confirme
    Alors une alerte affiche "CRA refusé — l'expert a été notifié par email."
    Et le CRA est au statut "a_completer"
    Et le CRA porte le commentaire de refus "Horaires à préciser (E2E)"
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Alors le détail du CRA présente le motif de refus "Horaires à préciser (E2E)"
    Et les actions proposées sont "Corriger/Compléter mon CRA", "Valider et soumettre", "Rien à déclarer" et "Télécharger PDF"

    Exemples:
      | niveau | statut  |
      | N1     | soumis  |
      | N2     | vise_n1 |

  Scénario: Administrateur : correction, modification des lignes et renvoi à l'expert
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que l'administrateur vise le CRA en N1
    Et qu'un SAMU de test existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Et je clique sur l'action "Corriger ce CRA (admin)" et je confirme
    Alors le CRA est au statut "a_completer"
    Et le CRA ne porte plus aucune signature
    Et les actions proposées sont "Modifier ce CRA (admin)", "Renvoyer à l'expert pour vérification" et "Télécharger PDF"
    Quand j'ouvre la saisie du CRA
    Et j'ajoute dans la saisie une ligne "Activité courante" le 12 de "09:00" à "18:00" pour l'objet "Correction admin E2E"
    Et je termine la saisie
    Alors le CRA est marqué « modifié par l'administrateur »
    Et le détail du CRA signale "L'expert doit le vérifier et le soumettre à nouveau avant toute validation."
    Quand je clique sur l'action "Renvoyer à l'expert pour vérification" et je confirme
    Alors une alerte affiche "CRA renvoyé à l'expert"
    Quand "Expert" ouvre l'application
    Et j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Alors le détail du CRA signale "Vérifiez-le, corrigez si besoin, puis soumettez-le à nouveau"
    Et le détail du CRA liste l'activité "Activité courante" de "09:00 → 18:00" pour l'objet "Correction admin E2E"

  Scénario: Document PDF d'un CRA en cours
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Et que l'expert saisit les lignes suivantes dans son CRA :
      | type      | jour | début | fin   | objet         |
      | astreinte | 04   | 18:00 | 23:00 | Astreinte E2E |
    Et que je suis connecté en tant que "Expert"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre le CRA du mois
    Et je télécharge le PDF du CRA
    Alors le document du CRA présente le mois, le statut "À compléter" et l'activité "Astreinte E2E"

  Scénario: Lien direct vers un CRA (notification)
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Quand "Expert" se connecte par le lien direct vers le CRA du mois
    Alors le détail du CRA du mois est affiché
