# language: fr
@affectation
Fonctionnalité: Aide à l'affectation : onglet « Événements »
  Onglet « Événements » de l'application « Aide à l'affectation opérationnelle » : événements des activités suivies pour
  les SAMU du planning des déploiements (filtres, recherche, tri, comparaison avec le planning), suppression d'un
  événement et fusion des doublons (administrateur). Données : une localisation SAMU de test, un déploiement de test
  (visite métier du 03/03/2031 au 05/03/2031) et des événements « Visite métier » de test sur cette localisation,
  supprimés en fin de scénario. La fusion de tous les doublons certains n'est pas exercée : elle porterait sur les
  données des autres fonctionnalités exécutées en parallèle.

  Contexte:
    Étant donné qu'un déploiement de test a une visite métier du "2031-03-03" au "2031-03-05"
    Et qu'un événement « Visite métier » de test "A" a lieu du "2031-03-03" au "2031-03-05"
    Et qu'un événement « Visite métier » de test "B" a lieu le "2031-03-10"

  Scénario: Liste filtrée sur le SAMU de test, comparaison avec le planning
    Étant donné que j'ouvre les événements de l'aide à l'affectation en tant que "Administrateur"
    Quand je filtre les événements sur le SAMU de test
    Alors la liste des événements compte "2 événements"
    Et l'événement "A" est daté "03/03/2031 → 05/03/2031", de type « Visite métier », avec « ✔ mêmes dates »
    Et l'événement "B" est daté "10/03/2031" et signale « ⚠ activité prévue : "03/03/2031 → 05/03/2031" »

  Scénario: Recherche et filtre par type d'événement
    Étant donné que j'ouvre les événements de l'aide à l'affectation en tant que "Administrateur"
    Quand je filtre les événements sur le SAMU de test
    Et je recherche l'intitulé de l'événement "B"
    Alors la liste des événements compte "1 événement"
    Et la liste présente l'événement "B" seulement
    Quand j'efface la recherche des événements
    Et je filtre les événements sur le type « Mise en service »
    Alors aucun événement n'est listé pour ces critères

  Scénario: Tri par intitulé, dans un sens puis dans l'autre
    Étant donné que j'ouvre les événements de l'aide à l'affectation en tant que "Administrateur"
    Quand je filtre les événements sur le SAMU de test
    Et je trie les événements par « Intitulé »
    Alors les événements sont dans l'ordre "A, B"
    Quand je trie les événements par « Intitulé »
    Alors les événements sont dans l'ordre "B, A"

  Scénario: Suppression d'un événement : annulée, puis confirmée
    Étant donné que j'ouvre les événements de l'aide à l'affectation en tant que "Administrateur"
    Quand je filtre les événements sur le SAMU de test
    Et je supprime l'événement "B" et j'annule
    Alors la liste des événements compte "2 événements"
    Quand je supprime l'événement "B" et je confirme
    Alors un message annonce la suppression de l'événement "B"
    Et la liste des événements compte "1 événement"
    Et l'événement "B" n'existe plus

  Scénario: Doublon certain : fusion en conservant l'événement présélectionné
    Étant donné qu'un événement « Visite métier » de test "A" en double a lieu du "2031-03-03" au "2031-03-05"
    Et que j'ouvre les événements de l'aide à l'affectation en tant que "Administrateur"
    Quand je recherche les doublons des événements
    Alors les doublons présentent un groupe « Certain » avec les 2 événements "A"
    Quand je fusionne le groupe des événements "A" et je confirme
    Alors la fenêtre des doublons annonce "Fusion effectuée : 1 événement supprimé, 0 participant ajouté."
    Et un seul événement "A" existe encore
