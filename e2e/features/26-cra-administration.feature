# language: fr
@cra
Fonctionnalité: CRA — administration et vue RH (écran)
  CRA à lancer, CRA en attente de diffusion, fenêtres de diffusion et de visualisation, CRA signés (statut de
  diffusion, archivage), CRA archivés (désarchivage, suppression), CRA supprimés (restauration, purge) et vue RH en
  consultation. Les CRA de test portent sur un mois lointain (année 2090 et suivantes), sauf le lancement, limité par
  l'écran aux treize derniers mois (période sans CRA de l'expert de test) ; ils sont supprimés définitivement en fin
  de scénario. La diffusion n'est adressée qu'à l'expert de test et à la boîte partagée de test ; « Purger tout » et
  « Renvoyer l'email » ne sont jamais utilisés.

  Contexte:
    Étant donné que l'expert de test participe au dispositif Astreintes/HNO
    Et qu'un mois de CRA inédit est choisi pour le scénario

  Scénario: CRA à lancer : sélection obligatoire, lancement, doublon refusé
    Étant donné qu'une période proposée au lancement est libre pour l'expert de test
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Et je lance un CRA sans choisir d'expert
    Alors une alerte affiche "Veuillez sélectionner un expert et une période."
    Quand je lance le CRA de l'expert de test pour la période libre
    Alors l'expert de test a un CRA « à compléter » pour la période libre
    Et le CRA de la période libre figure dans « CRA en cours de traitement »
    Quand je lance le CRA de l'expert de test pour la période libre
    Alors une alerte affiche "Un CRA en cours de traitement existe déjà pour cet expert sur cette période."

  Scénario: CRA en attente de diffusion : bloc, visualisation et fenêtre de diffusion
    Étant donné que l'expert de test a un CRA visé N2 pour le mois
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Alors le bloc « CRA en attente de diffusion » présente le CRA du mois et ses deux viseurs
    Quand je visualise le CRA du mois depuis le bloc « CRA en attente de diffusion »
    Alors la visualisation présente le CRA du mois, signé par l'expert et les viseurs N1 et N2
    Et la visualisation ne propose pas de renvoyer l'email
    Quand je ferme la visualisation
    Et j'ouvre la diffusion du CRA du mois
    Alors la fenêtre de diffusion présente le CRA du mois, avec un destinataire expert
    Et l'envoi de la diffusion est impossible tant que le PDF n'est pas généré
    Quand j'ajoute le destinataire RH ES "sans-arobase"
    Alors les destinataires RH ES ne comprennent pas "sans-arobase"
    Quand j'ajoute le destinataire RH ES "rh.e2e@example.invalid"
    Alors les destinataires RH ES comprennent "rh.e2e@example.invalid"
    Quand je retire le destinataire RH ES "rh.e2e@example.invalid"
    Alors les destinataires RH ES ne comprennent pas "rh.e2e@example.invalid"
    Quand j'annule la diffusion
    Alors la fenêtre de diffusion est fermée

  @smtp
  Scénario: Diffusion depuis l'écran, CRA signés, statut de diffusion et archivage
    Étant donné que l'expert de test a un CRA visé N2 pour le mois
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre la diffusion du CRA du mois
    Et je remplace les destinataires RH par la boîte partagée de test
    Et je génère le PDF de la diffusion
    Et j'envoie la diffusion
    Alors une alerte affiche "CRA diffusé"
    Et le CRA est au statut "diffuse"
    Quand j'ouvre la section "CRA signés"
    Et je recherche les CRA signés de l'expert de test
    Alors les CRA signés présentent le CRA du mois au statut "Diffusé"
    Quand j'ouvre le statut de diffusion du CRA du mois
    Alors le statut de diffusion liste la boîte partagée de test
    Quand je visualise le CRA du mois depuis les CRA signés
    Alors la visualisation présente le journal de diffusion avec la boîte partagée de test
    Et la visualisation propose de renvoyer l'email
    Quand je ferme la visualisation
    Et j'archive le CRA du mois depuis les CRA signés et je confirme
    Alors le CRA figure dans les archives

  Scénario: CRA archivés : visualisation et désarchivage
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que l'administrateur archive le CRA
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre la section "CRA archivés"
    Et je recherche les CRA archivés de l'expert de test
    Alors les CRA archivés présentent le CRA du mois au statut "Soumis"
    Quand je visualise le CRA du mois depuis les CRA archivés
    Alors la visualisation présente le CRA du mois, signé par l'expert seul
    Quand je ferme la visualisation
    Et je désarchive le CRA du mois et je confirme
    Alors le CRA ne figure plus dans les archives
    Et le CRA du mois figure dans « CRA en cours de traitement » au statut "Soumis — en attente visa N1"

  Scénario: CRA supprimés : suppression, restauration puis purge
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que l'administrateur archive le CRA
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "CRA"
    Et j'ouvre la section "CRA archivés"
    Et je recherche les CRA archivés de l'expert de test
    Et je supprime le CRA du mois depuis les CRA archivés et je confirme
    Alors le CRA figure dans la corbeille
    Quand j'ouvre la section "CRA supprimés"
    Alors les CRA supprimés présentent le CRA du mois, « Soumis » et archivé, à restaurer « Vers Archives »
    Et le bouton « Purger tout » est proposé
    Quand je restaure le CRA du mois depuis les CRA supprimés et je confirme
    Alors le CRA ne figure plus dans la corbeille
    Et le CRA figure dans les archives
    Quand l'administrateur supprime le CRA (corbeille)
    Et je recharge la liste des CRA supprimés
    Et je purge le CRA du mois depuis les CRA supprimés et je confirme
    Alors le CRA du mois n'existe plus

  Scénario: Vue RH : consultation des CRA archivés, filtre « Mois » sur les douze mois
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que l'administrateur archive le CRA
    Et que je suis connecté en tant que "RH"
    Quand j'ouvre l'onglet "CRA"
    Alors les filtres « Mois » de la vue RH proposent les douze mois
    Et les sections « CRA à lancer » et « CRA supprimés » ne sont pas proposées
    Quand j'ouvre la section "CRA archivés"
    Et je recherche les CRA archivés de l'expert de test
    Alors les CRA archivés présentent le CRA du mois au statut "Soumis"
    Et la ligne du CRA du mois propose « Voir », sans archivage, désarchivage ni suppression
    Quand je visualise le CRA du mois depuis les CRA archivés
    Alors la visualisation présente le CRA du mois, signé par l'expert seul
