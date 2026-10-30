# language: fr
@administration
Fonctionnalité: Administration › Gestion des utilisateurs (écran)
  Création, liste, modification, droits, mot de passe, double authentification, déconnexion, suppression et journaux
  d'un compte. Toutes les actions portent sur des comptes de test créés puis supprimés par le scénario (jamais sur les
  quatre comptes partagés) ; aucun e-mail n'est envoyé.

  # Liste chargée à l'ouverture de l'onglet : comptes de test créés avant
  Contexte:
    Étant donné que je suis connecté en tant que "Administrateur"

  Scénario: Création d'un compte depuis le formulaire, sans envoi du mot de passe par e-mail
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je saisis un nouveau compte "Utilisateur" avec un mot de passe généré
    Et je crée le compte sans envoyer le mot de passe par e-mail
    Alors la question d'envoi par e-mail mentionnait l'adresse et le mot de passe du compte
    Et une alerte affiche "Utilisateur créé avec succès"
    Et la liste des utilisateurs présente le nouveau compte avec le profil "Utilisateur"
    Et le nouveau compte existe avec le profil "Utilisateur"
    Et le compteur des utilisateurs indique les comptes actifs et le total

  Scénario: Création : champs requis, profil et ressource d'un expert obligatoires
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je crée un compte sans renseigner les champs requis
    Alors une alerte affiche "Veuillez remplir tous les champs requis"
    Quand je saisis un nouveau compte sans profil
    Et je crée le compte
    Alors une alerte affiche "Veuillez sélectionner au moins un profil"
    Quand je coche le profil "Expert Métier" du nouveau compte
    Alors le choix de la ressource associée est proposé
    Quand je crée le compte
    Alors une alerte affiche "Veuillez sélectionner une ressource pour le profil Expert Métier"

  Scénario: Modification d'un compte
    Étant donné qu'un compte de test existe
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je modifie le compte de test : prénom "Modifie", profil RH en plus
    Alors une alerte affiche "Utilisateur modifié avec succès"
    Et le compte de test a le prénom "Modifie" et les profils "Utilisateur" et "RH"

  Scénario: Activation, accès Reporting et validation RH depuis la liste
    Étant donné qu'un compte de test existe
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je désactive le compte de test depuis la liste
    Alors le compte de test est inactif
    Quand je donne au compte de test l'accès Reporting depuis la liste
    Alors le compte de test a l'accès Reporting
    Quand je donne au compte de test la validation RH depuis la liste
    Alors le compte de test a la validation RH

  Scénario: Nouveau mot de passe donné par l'administrateur
    Étant donné qu'un compte de test RH existe
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je réinitialise le mot de passe du compte de test en "Nouveau-E2E-2026!" sans l'envoyer par e-mail
    Alors le nouveau mot de passe "Nouveau-E2E-2026!" est affiché, sans e-mail envoyé
    Et le compte de test se connecte avec le mot de passe "Nouveau-E2E-2026!"

  Scénario: Déconnexion forcée et réinitialisation de l'appairage TOTP
    Étant donné qu'un compte de test RH existe
    Et que le compte de test est connecté
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je force la déconnexion du compte de test et je confirme
    Alors une alerte affiche "a été déconnecté(e)"
    Et la session du compte de test est fermée
    Quand je réinitialise l'appairage TOTP du compte de test et je confirme
    Alors une alerte affiche "TOTP réinitialisé pour"

  Scénario: Détails d'un compte : connexions, export CSV et remise à zéro
    Étant donné qu'un compte de test RH existe
    Et que le compte de test est connecté
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et j'ouvre les détails du compte de test
    Alors les détails présentent le login du compte de test et ses connexions
    Et l'export CSV des détails donne le fichier des journaux du compte de test
    Quand je remets à zéro les connexions du compte de test et je confirme
    Alors une alerte affiche "enregistrement(s) supprimé(s)"
    Et les détails indiquent "Aucune connexion enregistrée"

  Scénario: Suppression d'un compte
    Étant donné qu'un compte de test existe
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je supprime le compte de test depuis la liste et je confirme
    Alors la liste des utilisateurs ne présente plus le compte de test
    Et le compte de test n'existe plus

  Scénario: Tri de la liste par login
    Quand j'ouvre l'onglet "Administration"
    Et j'ouvre la section "Gestion des utilisateurs"
    Et je trie la liste des utilisateurs par "Login"
    Alors la liste des utilisateurs est triée par login dans l'ordre croissant
    Quand je trie la liste des utilisateurs par "Login"
    Alors la liste des utilisateurs est triée par login dans l'ordre décroissant
