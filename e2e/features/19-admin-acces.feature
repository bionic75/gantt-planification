# language: fr
@administration
Fonctionnalité: Administration › Accès aux applications et aux onglets (écran)
  Accès des utilisateurs aux applications supplémentaires et grille d'accès aux onglets par profil.
  Les comptes ajoutés aux applications sont des comptes de test créés puis supprimés par le scénario. La configuration
  des onglets n'est jamais enregistrée ici (enregistrement couvert par 02-profils-et-acces, qui la modifie en
  parallèle : case CRA du profil RH).

  Contexte:
    Étant donné que je suis connecté en tant que "Administrateur"
    Et j'ouvre l'onglet "Administration"

  Scénario: Accès à une application : ajout d'un compte par la recherche, puis retrait
    Étant donné qu'un compte de test existe
    Quand j'ouvre la section "Configuration des accès aux applications"
    Et j'ajoute le compte de test à l'application "Analyse de fichiers" par la recherche
    Alors l'application "Analyse de fichiers" liste le compte de test
    Et le compte de test a accès à l'application "analyse"
    Quand je retire le compte de test de l'application "Analyse de fichiers" et je confirme
    Alors l'application "Analyse de fichiers" ne liste plus le compte de test
    Et le compte de test n'a plus accès à l'application "analyse"

  Scénario: Accès à une application : un compte déjà autorisé n'est plus proposé
    Étant donné qu'un compte de test existe
    Et que le compte de test a reçu l'accès à l'application "analyse"
    Quand j'ouvre la section "Configuration des accès aux applications"
    Alors l'application "Analyse de fichiers" liste le compte de test
    Quand je recherche le compte de test pour l'application "Analyse de fichiers"
    Alors la recherche ne propose pas le compte de test
    Quand je recherche le compte de test pour l'application "Plateforme de suivi des déplacements"
    Alors la recherche propose le compte de test

  Scénario: Accès aux onglets : grille enregistrée, valeurs par défaut rétablies sans enregistrer
    Quand j'ouvre la section "Configuration de l'accès aux onglets"
    Alors la grille d'accès aux onglets présente la configuration enregistrée
    Et la case "Administration" du profil "Administrateur" est cochée et verrouillée
    Quand je rétablis les valeurs par défaut de l'accès aux onglets
    Alors le message de l'accès aux onglets contient "Valeurs par défaut rétablies : pensez à enregistrer."
    Et la grille d'accès aux onglets présente les valeurs par défaut
    Et la configuration enregistrée de l'accès aux onglets est inchangée
