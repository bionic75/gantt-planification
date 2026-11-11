# language: fr
Fonctionnalité: Utilisateurs connectés, messagerie et inactivité
  Les connectés, l'envoi et la réception des messages (événements du serveur) et le paramétrage de l'inactivité sont
  simulés dans le navigateur (page.route) : aucun message n'est envoyé, aucun paramètre global n'est modifié. Le temps
  de l'inactivité est avancé par l'horloge du navigateur (page.clock), sans attendre l'échéance réelle ni se
  déconnecter.

  Scénario: Pastille et liste des connectés
    Étant donné que les connectés lus par l'application sont le compte courant et "Test Fictif" (réponse simulée)
    Et que "Utilisateur" ouvre l'application
    Alors la pastille des connectés présente 2 utilisateurs
    Quand j'ouvre la liste des utilisateurs connectés
    Alors la liste présente le compte courant sans bouton de message et "Test Fictif" avec un bouton de message

  Scénario: Message envoyé, refusé, puis conversation restaurée après un rechargement
    Étant donné que les connectés lus par l'application sont le compte courant et "Test Fictif" (réponse simulée)
    Et que l'envoi des messages est simulé
    Et que "Utilisateur" ouvre l'application
    Quand j'ouvre la liste des utilisateurs connectés
    Et j'ouvre la conversation avec "Test Fictif"
    Et j'envoie le message "Bonjour, ceci est un message de test"
    Alors la conversation présente mon message "Bonjour, ceci est un message de test"
    Et le serveur a reçu le message "Bonjour, ceci est un message de test" pour "Test Fictif"
    Quand l'envoi suivant est refusé par le serveur avec "Destinataire hors ligne"
    Et j'envoie le message "Second message"
    Alors l'envoi est signalé en erreur avec "Destinataire hors ligne"
    Quand je recharge la page
    Alors la conversation avec "Test Fictif" est restaurée avec mon message "Bonjour, ceci est un message de test"
    Quand je ferme la conversation avec "Test Fictif"
    Alors aucune conversation n'est ouverte

  Scénario: Message reçu : conversation ouverte, réduite puis rouverte
    Étant donné que le serveur transmettra un message de "Expéditeur Fictif" : "Message reçu de test" (réponse simulée)
    Et que "Utilisateur" ouvre l'application
    Alors une conversation avec "Expéditeur Fictif" présente le message reçu "Message reçu de test"
    Quand je réduis la conversation avec "Expéditeur Fictif"
    Alors la conversation avec "Expéditeur Fictif" est réduite
    Quand je rouvre la conversation avec "Expéditeur Fictif"
    Alors une conversation avec "Expéditeur Fictif" présente le message reçu "Message reçu de test"

  Scénario: Minuteur d'inactivité : décompte, activité, échéance puis « Rester connecté »
    Étant donné que l'inactivité est paramétrée à 2 minutes (réponse simulée) et l'horloge du navigateur contrôlée
    Et que "Utilisateur" ouvre l'application
    Alors le minuteur d'inactivité indique "02:00"
    Quand 70 secondes passent sans activité
    Alors le minuteur d'inactivité indique "00:50"
    Quand je clique dans la page
    Et 1 seconde passe sans activité
    Alors le minuteur d'inactivité indique "01:59"
    Quand 119 secondes passent sans activité
    Alors la fenêtre d'inactivité annonce une déconnexion dans 15 secondes
    Quand je choisis de rester connecté
    Alors la fenêtre d'inactivité est fermée
    Et le minuteur d'inactivité indique "02:00"
