# language: fr
@ressources
Fonctionnalité: Ressources (écran)
  Liste des ressources (colonnes, tri, bascules, suppression, export), formulaire d'ajout (trigramme proposé,
  expert principal / secondaire sur des SAMU) et fiche de la ressource (modification, contacts RH, historique des taux
  de MAD et particularités, consultation RH). Les ressources et SAMU créés portent un nom préfixé « E2E » ou un
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

  # ---------- Fiche de la ressource ----------

  Scénario: Fiche : affichée puis modifiée (SAMU secondaire retiré, astreinte HO)
    Étant donné qu'une ressource standard existe
    Et que la ressource est expert principal sur "SAMU 75" et expert secondaire sur "SAMU 93"
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Alors la fiche présente la ressource, "SAMU 75" en principal et "SAMU 93" en secondaire, sans astreinte
    Quand je retire le dernier SAMU secondaire de la fiche et je coche l'astreinte HO de la fiche
    Et j'enregistre la fiche
    Alors la ressource participe aux astreintes "HO"
    Et la ressource n'est plus expert que sur "SAMU 75", en principal

  Scénario: Fiche : contacts RH contrôlés (une adresse par ligne)
    Étant donné qu'une ressource standard existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Et je saisis les contacts RH "rh.e2e@etablissement.fr" et "texte libre" dans la fiche
    Alors la fiche signale l'adresse invalide "texte libre"
    Quand j'enregistre la fiche
    Alors une alerte affiche "Contacts RH : adresse(s) e-mail invalide(s)"
    Et la fiche est toujours ouverte
    Quand je saisis les contacts RH "rh.e2e@etablissement.fr" et "RH.E2E@ETABLISSEMENT.FR" dans la fiche
    Et j'enregistre la fiche
    Alors les contacts RH de la ressource sont "rh.e2e@etablissement.fr"

  Scénario: Fiche : historique des taux de MAD (clôture, ajout, suppression)
    Étant donné qu'une ressource non volante au taux de 50 % depuis le "2026-01-01" existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Alors l'historique de la fiche présente 1 période, la dernière au taux "50%"
    Quand je clôture dans la fiche la période en cours au "2026-06-30"
    Et j'ajoute dans la fiche une période au taux de 70 % à partir du "2026-07-01"
    Alors l'historique de la fiche présente 2 périodes, la dernière au taux "70%"
    Et le taux courant de la ressource est de 70 %
    Quand je supprime dans la fiche la dernière période de MAD et je confirme
    Alors l'historique de la fiche présente 1 période, la dernière au taux "50%"

  Scénario: Fiche : particularités d'une période de MAD
    Étant donné qu'une ressource non volante au taux de 50 % depuis le "2026-01-01" existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Et j'ouvre les particularités de la période en cours
    Alors les particularités indiquent "Aucune particularité définie pour cette période."
    Quand j'ajoute une particularité au taux de 0 % du "2026-03-02" au "2026-03-06" pour le motif "Congé E2E"
    Alors les particularités présentent la période "02/03/2026 - 06/03/2026" au taux "0%" pour le motif "Congé E2E"
    Quand je modifie le taux de la particularité à 20 %
    Alors les particularités présentent la période "02/03/2026 - 06/03/2026" au taux "20%" pour le motif "Congé E2E"
    Quand je supprime la particularité et je confirme
    Alors les particularités indiquent "Aucune particularité définie pour cette période."

  Scénario: Fiche : consultation par le profil RH
    Étant donné qu'une ressource standard existe
    Et que je suis connecté en tant que "RH"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource en consultation
    Alors la fiche « Détail de la ressource » est en lecture seule, sans ajout de taux de MAD, avec les astreintes en texte
    Quand je ferme la fiche
    Alors la fiche n'est plus affichée