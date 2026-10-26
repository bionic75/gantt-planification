# language: fr
@cra
Fonctionnalité: Comptes rendus d'activité (CRA)
  Les CRA de test portent sur un mois lointain (année 2090 et suivantes) propre à chaque scénario, pour ne pas
  croiser les CRA réels de l'expert de test. Ils sont supprimés définitivement en fin de scénario.
  Préalable : l'expert de test est rattaché à une ressource et participe au dispositif Astreintes/HNO.

  Contexte:
    Étant donné que l'expert de test participe au dispositif Astreintes/HNO
    Et qu'un mois de CRA inédit est choisi pour le scénario

  Scénario: Lancement des CRA d'un mois
    Quand l'administrateur lance le CRA du mois pour l'expert de test
    Alors la réponse a le statut 200
    Et l'expert de test a un CRA « à compléter » pour le mois
    Quand l'administrateur lance de nouveau le CRA du mois pour l'expert de test
    Alors la réponse a le statut 409
    Et l'expert de test n'a qu'un seul CRA pour le mois

  Scénario: Remplir et soumettre un CRA
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Quand l'expert saisit les lignes suivantes dans son CRA :
      | type              | jour | début | fin   | objet          |
      | astreinte         | 05   | 18:00 | 08:00 | Astreinte E2E  |
      | hno               | 06   | 20:00 | 22:00 | Intervention   |
      | activite_courante | 07   | 09:00 | 18:00 | Activité E2E   |
    Et l'expert soumet son CRA
    Alors le CRA est au statut "soumis"
    Et le CRA porte la signature de rang 1
    Et le CRA contient 3 lignes
    Quand l'expert tente de modifier les lignes de son CRA soumis
    Alors la réponse a le statut 400

  Scénario: « Rien à déclarer »
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Quand l'expert déclare « rien à déclarer »
    Alors le CRA est au statut "soumis"
    Et le CRA contient 0 ligne
    Et le CRA est marqué « rien à déclarer »

  Scénario: Rappel d'un CRA soumis
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Quand l'expert rappelle son CRA
    Alors le CRA est au statut "a_completer"
    Et le CRA ne porte plus aucune signature

  @smtp
  Scénario: Circuit de validation N1 puis N2 puis diffusion
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Quand l'administrateur tente de viser le CRA en N2
    Alors la réponse a le statut 400
    Quand l'administrateur vise le CRA en N1
    Alors le CRA est au statut "vise_n1"
    Quand l'administrateur tente de diffuser le CRA
    Alors la réponse a le statut 400
    Quand l'administrateur vise le CRA en N2
    Alors le CRA est au statut "vise_n2"
    Et chaque visa est horodaté avec le nom du signataire
    Quand l'administrateur diffuse le CRA
    Alors le CRA est au statut "diffuse"

  Plan du scénario: Refus d'un CRA en <niveau>
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que le CRA est visé jusqu'au niveau précédant <niveau>
    Quand l'administrateur refuse le CRA en <niveau> sans motif
    Alors la réponse a le statut 400
    Quand l'administrateur refuse le CRA en <niveau> avec le motif "Lignes incomplètes (E2E)"
    Alors le CRA est au statut "a_completer"
    Et le CRA porte le commentaire de refus "Lignes incomplètes (E2E)"
    Et le CRA ne porte plus aucune signature

    Exemples:
      | niveau |
      | N1     |
      | N2     |

  @smtp
  Scénario: Diffusion : destinataires et journal
    Étant donné que l'expert de test a un CRA visé N2 pour le mois
    Et que la ressource de l'expert de test a pour contact RH la boîte partagée
    Quand l'administrateur consulte les destinataires de diffusion du CRA
    Alors les destinataires proposés comprennent l'expert et le contact RH
    Quand l'administrateur diffuse le CRA
    Et l'administrateur ouvre le statut de diffusion du CRA
    Alors le journal de diffusion liste le contact RH et l'expert

  Scénario: « CRA signés » = diffusés uniquement
    Étant donné que l'expert de test a un CRA visé N2 pour le mois
    Quand l'administrateur liste les CRA au statut "diffuse"
    Alors le CRA du mois n'y figure pas
    Quand l'administrateur liste les CRA au statut "vise_n2"
    Alors le CRA du mois y figure

  Scénario: Colonne « Lignes » dans la liste des CRA
    Étant donné que l'expert de test a un CRA à compléter pour le mois
    Quand l'expert saisit les lignes suivantes dans son CRA :
      | type      | jour | début | fin   | objet         |
      | hno       | 03   | 20:00 | 22:00 | Intervention  |
      | astreinte | 04   | 18:00 | 08:00 | Astreinte E2E |
    Alors la liste des CRA indique 2 lignes pour le CRA du mois
    Quand l'expert déclare « rien à déclarer » sur un autre mois
    Alors la liste des CRA indique 0 ligne pour le CRA de cet autre mois

  Scénario: CRA modifié par un administrateur
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Et que l'administrateur vise le CRA en N1
    Quand l'administrateur reprend le CRA pour correction
    Alors le CRA est au statut "a_completer"
    Et le CRA ne porte plus aucune signature
    Quand l'administrateur corrige les lignes du CRA
    Alors le CRA est marqué « modifié par l'administrateur »
    Quand l'administrateur renvoie le CRA à l'expert
    Alors la réponse a le statut 200
    Quand l'administrateur tente de déclarer « rien à déclarer » à la place de l'expert
    Alors la réponse a le statut 403

  @mad
  Scénario: Collecte des activités depuis la planification (MAD volante)
    Étant donné que l'expert de test est une MAD volante
    Et que l'expert de test a un CRA à compléter pour le mois
    Et que la planification de l'expert de test contient une journée d'activité "6" et une matinée d'activité "8" dans le mois
    Quand l'expert lance la collecte des activités de son CRA
    Alors la collecte propose les lignes :
      | jour | début | fin   | objet             |
      | 02   | 09:00 | 18:00 | ANS (Dev. usages) |
      | 03   | 09:00 | 12:00 | Divers            |

  Scénario: Collecte non proposée hors MAD volante
    Étant donné que l'expert de test n'est pas une MAD volante
    Et que l'expert de test a un CRA à compléter pour le mois
    Quand l'expert lance la collecte des activités de son CRA
    Alors la collecte n'est pas proposée

  Scénario: Archivage et restauration
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Quand l'administrateur archive le CRA
    Alors le CRA figure dans les archives
    Quand l'administrateur désarchive le CRA
    Alors le CRA ne figure plus dans les archives
    Quand l'administrateur archive le CRA
    Et l'administrateur supprime le CRA (corbeille)
    Alors le CRA figure dans la corbeille
    Quand l'administrateur restaure le CRA supprimé
    Alors le CRA est au statut "soumis"
    Et le CRA ne figure plus dans la corbeille

  Scénario: Filtres Expert / Mois / Année
    Étant donné que l'expert de test a un CRA soumis pour le mois
    Quand l'administrateur filtre la liste des CRA sur l'expert de test, le mois et l'année
    Alors la liste filtrée contient uniquement le CRA du mois
    Quand l'administrateur filtre la liste des CRA sur l'expert de test et le statut "a_completer,vise_n1"
    Alors la liste filtrée ne contient pas le CRA du mois
    Quand l'administrateur liste tous les CRA sans filtre
    Alors la liste contient le CRA du mois

  # Anomalie connue : un CRA diffusé ne peut pas être corrigé par l'administrateur (« CRA non modifiable dans ce statut »)
  @smtp @anomalie-connue @fail
  Scénario: Scénario CRA complet avec correction
    Quand l'administrateur lance le CRA du mois pour l'expert de test
    Et l'expert saisit les lignes suivantes dans son CRA :
      | type | jour | début | fin   | objet        |
      | hno  | 10   | 20:00 | 23:00 | Intervention |
    Et l'expert soumet son CRA
    Et l'administrateur vise le CRA en N1
    Et l'administrateur refuse le CRA en N2 avec le motif "Horaires à préciser (E2E)"
    Alors le CRA est au statut "a_completer"
    Quand l'expert saisit les lignes suivantes dans son CRA :
      | type | jour | début | fin   | objet        |
      | hno  | 10   | 20:30 | 23:00 | Intervention |
    Et l'expert soumet son CRA
    Et l'administrateur vise le CRA en N1
    Et l'administrateur vise le CRA en N2
    Et l'administrateur diffuse le CRA
    Alors le CRA est au statut "diffuse"
    Et l'historique des signatures comporte les rangs 1, 2 et 3
    Quand l'administrateur corrige les lignes du CRA
    Alors le CRA est marqué « modifié par l'administrateur »
