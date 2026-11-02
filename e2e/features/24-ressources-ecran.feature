# language: fr
@ressources
Fonctionnalité: Ressources › liste et ajout (écran)
  Liste des ressources (colonnes, tri, bascules, suppression, export) et formulaire d'ajout (trigramme proposé,
  expert principal / secondaire sur des SAMU). Les ressources et SAMU créés portent un nom préfixé « E2E » ou un
  numéro « SAMU 9xxx » et sont supprimés en fin de scénario.

  Scénario: Liste : une ressource avec son taux, son statut et ses SAMU principaux et secondaires
    Étant donné qu'une ressource standard existe
    Et que la ressource est expert principal sur "SAMU 75" et expert secondaire sur "SAMU 93"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Alors la ligne de la ressource présente son trigramme, le taux "50%" et le statut "En cours"
    Et la ligne de la ressource présente "SAMU 75" en principal et "SAMU 93" en secondaire

  Scénario: Liste : tri par colonne, croissant puis décroissant
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et je trie la liste des ressources par "Trigramme"
    Alors la colonne "Trigramme" de la liste des ressources est triée par ordre croissant
    Quand je trie la liste des ressources par "Trigramme"
    Alors la colonne "Trigramme" de la liste des ressources est triée par ordre décroissant

  Scénario: Liste : activation et astreintes modifiées depuis le tableau
    Étant donné qu'une ressource standard existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et je désactive la ressource depuis la liste
    Alors la ressource est inactive
    Quand je coche l'astreinte "HO" de la ressource dans la liste
    Alors la ressource participe aux astreintes "HO"

  Scénario: Liste : suppression refusée puis confirmée
    Étant donné qu'une ressource standard existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et je supprime la ressource depuis la liste et je refuse la confirmation
    Alors la ressource existe toujours
    Quand je supprime la ressource depuis la liste et je confirme
    Alors la ressource n'existe plus et n'est plus listée

  Scénario: Liste : export Excel
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Alors le bouton "Exporter (Excel)" télécharge l'export des ressources

  Scénario: Ajout : trigramme proposé d'après le prénom et le nom
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je saisis le nom "Dupré-Lévy" et le prénom "élodie"
    Alors le prénom devient "Élodie" et le trigramme proposé est "EDU"

  Scénario: Ajout : expert principal et secondaire sur des SAMU
    Étant donné que deux SAMU de test existent
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je saisis une nouvelle ressource avec un trigramme en minuscules et un taux de 60 %
    Et je choisis le premier SAMU de test en expert principal
    Alors le premier SAMU de test n'est plus proposé en expert secondaire
    Quand je choisis le second SAMU de test en expert secondaire
    Et je clique sur le bouton "Ajouter la ressource"
    Alors la ressource saisie est expert principal sur le premier SAMU de test et secondaire sur le second

  Scénario: Profil RH : liste en lecture seule, sans formulaire d'ajout
    Étant donné qu'une ressource standard existe
    Et que je suis connecté en tant que "RH"
    Quand j'ouvre l'onglet "Ressources"
    Alors le formulaire d'ajout de ressource n'est pas proposé
    Et la ligne de la ressource ne propose que la consultation, avec des cases d'astreinte non modifiables
