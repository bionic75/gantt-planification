# language: fr
@ressources
Fonctionnalité: Gestion des ressources (experts mis à disposition)
  Les ressources créées par les scénarios portent un nom préfixé « E2E » et sont supprimées en fin de scénario.

  Scénario: Création d'une ressource standard
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je saisis une nouvelle ressource avec un trigramme en minuscules et un taux de 80 %
    Et je clique sur le bouton "Ajouter la ressource"
    Alors la ressource saisie est créée avec son trigramme en majuscules
    Et la ressource saisie apparaît dans la liste des ressources
    Et la ressource saisie apparaît dans la planification

  Plan du scénario: Champs obligatoires d'une ressource : <champ>
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je saisis une nouvelle ressource sans le champ "<champ>"
    Et je clique sur le bouton "Ajouter la ressource"
    Alors une alerte affiche "Remplissez tous les champs obligatoires"
    Et la ressource saisie n'a pas été créée

    Exemples:
      | champ                |
      | Nom                  |
      | Prénom               |
      | Trigramme            |
      | SAMU de rattachement |
      | Date début MAD       |

  Plan du scénario: Champs obligatoires d'une ressource, contrôle côté serveur : <champ>
    Quand l'administrateur crée par l'API une ressource sans le champ "<champ>"
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Champs obligatoires manquants"

    Exemples:
      | champ     |
      | nom       |
      | prenom    |
      | trigramme |
      | samu      |
      | taux      |

  Scénario: Création d'une MAD volante
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je coche la case "MAD volante"
    Alors le champ "Taux de MAD (%)" est masqué
    Et les champs "Date de fin MAD" et "Jours max sur la période" sont affichés
    Quand je saisis une nouvelle ressource MAD volante jusqu'au "2027-03-31" avec 15 jours maximum
    Et je clique sur le bouton "Ajouter la ressource"
    Alors la ressource saisie est créée en MAD volante avec un taux de 0

  Scénario: MAD volante : date de fin et jours max obligatoires
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je coche la case "MAD volante"
    Et je saisis une nouvelle ressource MAD volante sans date de fin ni jours maximum
    Et je clique sur le bouton "Ajouter la ressource"
    Alors une alerte affiche "Remplissez la date de fin et les jours max pour une MAD volante"
    Et la ressource saisie n'a pas été créée
    Quand l'administrateur crée par l'API une MAD volante sans date de fin
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Date de fin et jours max obligatoires pour une MAD volante"

  Scénario: Modification MAD : la date de début est affichée et modifiable
    Étant donné qu'une ressource MAD volante débutant le "2026-10-15" existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Alors le champ "Date de début MAD" de la fiche contient "2026-10-15"
    Quand je remplace la date de début MAD par "2026-10-20" et j'enregistre la fiche
    Et j'ouvre la fiche de la ressource
    Alors le champ "Date de début MAD" de la fiche contient "2026-10-20"

  Scénario: Enregistrer une ressource n'efface pas ses dates
    Étant donné qu'une ressource avec une date de début "2026-01-05" et une date de fin "2027-12-31" existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Et je remplace la fonction par "Infirmier E2E" et j'enregistre la fiche
    Alors la ressource a la fonction "Infirmier E2E"
    Et la ressource a toujours la date de début "2026-01-05" et la date de fin "2027-12-31"

  Scénario: MAD : date de fin avant la date de début
    Étant donné qu'une ressource MAD volante débutant le "2026-10-15" existe
    Et que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la fiche de la ressource
    Et je remplace la date de fin MAD par "2026-10-01" et j'enregistre la fiche
    Alors une alerte affiche "La date de fin de la MAD précède sa date de début"
    Et la ressource a toujours la date de fin MAD d'origine

  Scénario: Historique des taux de MAD
    Étant donné qu'une ressource non volante au taux de 50 % depuis le "2026-01-01" existe
    Quand l'administrateur clôt la période de MAD initiale au "2026-06-30"
    Et l'administrateur ajoute une période de MAD au taux de 70 % à partir du "2026-07-01"
    Alors l'historique des taux de la ressource contient 2 périodes
    Et le taux courant de la ressource est de 70 %
    Quand l'administrateur ajoute une période de MAD au taux de 60 % à partir du "2026-06-15"
    Alors la réponse a le statut 400
    Et le message d'erreur contient "Chevauchement"
    Quand l'administrateur modifie la dernière période de MAD au taux de 75 %
    Alors le taux courant de la ressource est de 75 %
    Quand l'administrateur supprime la dernière période de MAD
    Alors l'historique des taux de la ressource contient 1 période

  # L'aide en ligne indique que le nombre de jours consommés n'est plus rappelé dans l'onglet Ressources :
  # vérification visuelle des alertes (jaune / orange / rouge) dans la planification.
  @manuel
  Scénario: Jours consommés d'une MAD volante
    Étant donné qu'une ressource MAD volante de 15 jours maximum existe
    Quand des disponibilités et affectations sont renseignées sur sa période
    Alors le compteur affiche les jours consommés et restants
    Et la couleur d'alerte évolue sous 50 % puis 20 % de jours restants

  Scénario: Expert principal / secondaire sur des SAMU
    Étant donné qu'une ressource standard existe
    Quand l'administrateur rattache la ressource en expert principal sur "SAMU 75, SAMU 92" et en expert secondaire sur "SAMU 93"
    Alors les SAMU de la ressource sont enregistrés par rôle :
      | samu    | rôle       |
      | SAMU 75 | principal  |
      | SAMU 92 | principal  |
      | SAMU 93 | secondaire |

  Scénario: Dispositif Astreintes/HNO
    Étant donné que je suis connecté en tant que "Administrateur"
    Quand j'ouvre l'onglet "Ressources"
    Et j'ouvre la section "Ajouter une nouvelle ressource"
    Et je saisis une nouvelle ressource avec un trigramme en minuscules et un taux de 50 %
    Et je coche la case "Astreintes HNO"
    Et je clique sur le bouton "Ajouter la ressource"
    Alors une alerte affiche "Veuillez saisir la date de démarrage du régime d'astreintes"
    Et la ressource saisie n'a pas été créée
    Quand je renseigne la date de démarrage du régime d'astreintes "2026-11-01"
    Et je clique sur le bouton "Ajouter la ressource"
    Alors la ressource saisie participe au dispositif Astreintes/HNO depuis le "2026-11-01"
    Et la ressource saisie apparaît dans la liste des experts astreinte

  Scénario: Contacts RH de l'ES (un e-mail par ligne)
    Étant donné qu'une ressource standard existe
    Quand l'administrateur enregistre les contacts RH suivants :
      """
      rh.e2e@etablissement.fr
      texte libre
      drh.e2e@hopital
      """
    Alors la réponse a le statut 400
    Et le message d'erreur contient "texte libre, drh.e2e@hopital"
    Quand l'administrateur enregistre les contacts RH suivants :
      """
       rh.e2e@etablissement.fr

      RH.E2E@ETABLISSEMENT.FR
      drh.e2e@hopital.fr
      """
    Alors la réponse a le statut 200
    Et les contacts RH de la ressource sont "rh.e2e@etablissement.fr" et "drh.e2e@hopital.fr"
