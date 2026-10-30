# language: fr
@administration
Fonctionnalité: Administration › Paramétrages divers (écran)
  Version, compteur d'inactivité, favicon, aide en ligne, dump, thèmes et son de notification.
  Paramètres globaux, partagés avec les fonctionnalités exécutées en parallèle : la version, l'inactivité (qui
  déconnecterait les autres scénarios), la publication des nouveautés (fenêtre à la connexion), la page d'aide (lue par
  11-administration) et la configuration des thèmes (modifiée par 11-administration) ne sont jamais modifiés ; seuls
  leur affichage et leur réenregistrement à l'identique sont vérifiés. Le favicon modifié est rétabli. Aucun dump n'est
  restauré.

  Contexte:
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Paramétrages divers"

  Scénario: Version de l'application : affichée et réenregistrée à l'identique
    Quand j'ouvre la sous-section "Version de l'application"
    Alors la version affichée est celle enregistrée
    Quand je réenregistre la version
    Alors une alerte affiche "Version sauvegardée"
    Et la version enregistrée est inchangée

  Scénario: Compteur d'inactivité : affiché et réenregistré à l'identique
    Quand j'ouvre la sous-section "Compteur d'inactivité"
    Alors la configuration d'inactivité affichée est celle enregistrée
    Quand je réenregistre la configuration d'inactivité
    Alors une alerte affiche "Configuration d'inactivité sauvegardée"
    Et la configuration d'inactivité enregistrée est inchangée

  Scénario: Favicon : choix appliqué à la page et enregistré
    Étant donné que le favicon sera rétabli après le scénario
    Quand j'ouvre la sous-section "Icône de l'application (favicon)"
    Et je choisis une autre icône que celle enregistrée et je l'enregistre
    Alors une alerte affiche "Favicon sauvegardé"
    Et l'icône choisie est enregistrée et appliquée à la page

  Scénario: Aide en ligne : état affiché, envoi sans fichier refusé
    Quand j'ouvre la sous-section "Administration de l'aide en ligne"
    Alors l'état de publication des nouveautés est celui enregistré, pour la version courante
    Et le fichier d'aide actuel est indiqué
    Quand j'envoie une page d'aide sans choisir de fichier
    Alors une alerte affiche "Sélectionnez un fichier HTML"

  Scénario: Dump : génération, analyse puis annulation sans restauration
    Quand j'ouvre la sous-section "Dump complet & restauration (test avec données de production)"
    Et je génère et télécharge le dump complet
    Alors un fichier de dump est téléchargé et sa génération confirmée
    Quand j'analyse le dump téléchargé
    Alors l'analyse présente la version, la date et le détail par table du dump
    Et la restauration n'est possible qu'après la saisie du nom du serveur
    Quand j'annule la restauration
    Alors l'analyse du dump n'est plus affichée

  Scénario: Dump : fichier corrompu refusé
    Quand j'ouvre la sous-section "Dump complet & restauration (test avec données de production)"
    Et j'analyse un fichier de dump corrompu
    Alors l'analyse du dump affiche une erreur

  Scénario: Thèmes : configuration affichée et aperçu temporaire
    Quand j'ouvre la sous-section "Thèmes d'affichage"
    Alors l'écran des thèmes présente les six thèmes, leur mode et l'état du thème affiché
    Quand je prévisualise le thème "Noël"
    Alors le thème "noel" est appliqué à la page

  Scénario: Son de notification : activation mémorisée dans le navigateur
    Quand j'ouvre la sous-section "Son de notification push"
    Et je désactive le son de notification
    Alors le son de notification est désactivé pour ce navigateur
    Quand je réactive le son de notification
    Alors le son de notification est activé pour ce navigateur

  # Remplace la page d'aide de l'environnement (lue par d'autres scénarios) : vérification manuelle
  @manuel
  Scénario: Aide en ligne : envoi d'une page d'aide puis retour à la page par défaut
    Quand j'envoie une page d'aide HTML
    Alors la page /aide.html est la page envoyée et le fichier actuel est indiqué avec sa date
    Quand je supprime la page envoyée et je confirme
    Alors la page d'aide par défaut est de nouveau servie

  # Remplace toute la base du serveur : vérification manuelle sur un serveur de test (couverte par l'API en @destructif)
  @manuel
  Scénario: Dump : restauration sur un serveur de test
    Quand j'analyse un dump puis saisis le nom du serveur et confirme la restauration
    Alors la base est remplacée par le dump, une sauvegarde de sécurité est créée et la page est rechargée
