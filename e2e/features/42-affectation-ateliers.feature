# language: fr
@affectation
Fonctionnalité: Aide à l'affectation : ateliers métier, sondages de date et cadre de l'application
  Simulation et enregistrement du rétroplanning des ateliers métier d'un SAMU, liste des rétroplannings, invitation à
  un atelier (fenêtre ouverte, jamais envoyée), sondage de date (généré en brouillon, jamais envoyé ; réponse sur la
  page publique ; clôture avec créneau retenu, réouverture, suppression) ; cadre de l'application (en-tête, onglets,
  déconnexion). Données : une localisation et un déploiement de test (mise en production le 15/09/2032), dont le
  rétroplanning et les sondages sont supprimés en fin de scénario. Aucun courriel n'est envoyé.

  Contexte:
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05" et sa mise en production le "2032-09-15"

  Scénario: Simulation du rétroplanning d'un SAMU
    Étant donné que j'ouvre les ateliers métier en tant que "Administrateur"
    Quand je choisis le SAMU de test dans la simulation
    Alors la date de MEP reprise du déploiement est "2032-09-15"
    Et la zone de vacances n'est pas déterminée pour ce SAMU
    Et la simulation est "Non enregistré"
    Quand je choisis la zone "A" et 3 ateliers
    Alors le rétroplanning simulé présente la visite métier, 3 ateliers et la mise en production
    Et la mise en production est proposée le "mer. 15/09/2032"
    Quand je porte l'écart entre l'atelier 1 et l'atelier 2 à 14 jours
    Alors l'atelier 1 est proposé plus tôt qu'avant

  Scénario: Enregistrement, liste, modification et suppression d'un rétroplanning
    Étant donné que j'ouvre les ateliers métier en tant que "Administrateur"
    Et que je simule le rétroplanning du SAMU de test en zone "A" avec 3 ateliers
    Quand j'enregistre le rétroplanning
    Alors une annonce des ateliers indique "Rétroplanning enregistré."
    Et la simulation indique "Rétroplanning enregistré le"
    Et la liste des rétroplannings présente le SAMU de test avec "0/4 planifiés"
    Quand je lance une nouvelle simulation
    Alors la simulation ne présente plus de SAMU
    Quand je modifie le rétroplanning du SAMU de test depuis la liste
    Alors la simulation présente le SAMU de test enregistré, en zone "A" avec 3 ateliers
    Quand je supprime le rétroplanning du SAMU de test
    Alors une annonce des ateliers indique "Rétroplanning supprimé."
    Et la liste des rétroplannings ne présente plus le SAMU de test

  Scénario: Date planifiée d'un atelier, puis invitation préparée sans envoi
    Étant donné que j'ouvre les ateliers métier en tant que "Administrateur"
    Et que je simule le rétroplanning du SAMU de test en zone "A" avec 3 ateliers
    Et que j'enregistre le rétroplanning
    Quand je planifie l'atelier 1 au "2032-06-01" à "10:00" et j'enregistre le rétroplanning
    Alors l'atelier 1 est "Planifié" et propose « Inviter »
    Et la liste des rétroplannings présente le SAMU de test avec "1/4 planifiés"
    Quand j'ouvre l'invitation de l'atelier 1
    Alors l'invitation présente l'objet "[SI-SAMU] {samu} - Atelier Métier #1 | "
    Et l'invitation propose une fin de l'atelier à "11:00"
    Quand j'ajoute le destinataire "e2e-atelier@example.invalid" à l'invitation
    Alors l'invitation présente le destinataire "e2e-atelier@example.invalid"
    Quand j'annule l'invitation
    Alors l'invitation est fermée sans envoi

  Scénario: Sondage de date : brouillon, réponse publique, clôture, réouverture, suppression
    Étant donné que j'ouvre les ateliers métier en tant que "Administrateur"
    Et que je simule le rétroplanning du SAMU de test en zone "A" avec 3 ateliers
    Et que j'enregistre le rétroplanning
    Et que je modifie le rétroplanning du SAMU de test depuis la liste
    Quand j'ouvre le sondage de l'atelier 2
    Alors le sondage est "Nouveau", nommé "[SI-SAMU] {samu} - Atelier Métier #2 | "
    Quand je propose aussi le "2032-06-08" de 14 h à 16 h et je génère l'adresse du sondage
    Alors une annonce des ateliers indique "Adresse générée."
    Et le sondage est "Sondage (brouillon)", avec son adresse d'accès
    Quand une personne répond "E2E Répondant" pour le "2032-06-08" sur la page publique du sondage
    Alors la page publique confirme "Réponse enregistrée. Merci !"
    Quand j'actualise les réponses du sondage
    Alors le sondage présente 1 réponse de "E2E Répondant"
    Quand je retiens le créneau du "2032-06-08" et je clôture le sondage
    Alors une annonce des ateliers indique "Sondage terminé"
    Et l'atelier 2 est planifié le "2032-06-08" à "14:00"
    Et le sondage de l'atelier 2 indique "Sondage terminé"
    Et la page publique du sondage annonce le créneau retenu
    Quand je rouvre le sondage de l'atelier 2
    Alors une annonce des ateliers indique "Sondage rouvert."
    Quand je supprime le sondage de l'atelier 2
    Alors le sondage de l'atelier 2 indique "Sondage"

  Scénario: Page publique d'un sondage : contrôles, modification de la réponse, adresse inconnue
    Étant donné qu'un sondage de test en brouillon propose le "2032-06-08" pour l'atelier 2 du SAMU de test
    Quand une personne ouvre la page publique du sondage
    Et elle enregistre sa réponse sans nom
    Alors la page publique signale "Indiquez votre nom."
    Quand elle saisit le nom "E2E Public" et enregistre sa réponse sans cocher de date
    Alors la page publique signale "Cochez au moins une date."
    Quand elle coche le "2032-06-08" et enregistre sa réponse
    Alors la page publique confirme "Réponse enregistrée. Merci !"
    Quand elle rouvre la page publique du sondage
    Alors sa réponse "E2E Public" est reprise et peut être modifiée
    Quand elle modifie sa réponse
    Alors la page publique confirme "Votre réponse a été mise à jour. Merci !"
    Quand elle indique « Ce n'est pas moi »
    Alors la page publique propose une réponse vierge
    Quand une personne ouvre une adresse de sondage inconnue
    Alors la page publique indique "Ce sondage n’existe pas ou n’est plus disponible."
  Scénario: Cadre de l'application : en-tête, onglets, déconnexion annulée
    Étant donné que j'ouvre les ateliers métier en tant que "Administrateur"
    Alors l'en-tête de l'aide à l'affectation présente le nom du compte et "Administrateur"
    Quand je passe sur l'onglet « Événements » de l'aide à l'affectation
    Alors l'onglet « Événements » de l'aide à l'affectation est affiché
    Quand je renonce à me déconnecter de l'aide à l'affectation
    Alors l'application d'aide à l'affectation est affichée
    Quand je rouvre l'aide à l'affectation par le menu Applications
    Alors l'onglet « Planning des déploiements » de l'aide à l'affectation est affiché
