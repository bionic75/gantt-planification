# Événements / Cartographie : statuts de déploiement et calques

## Intention

Donner une vue d'ensemble de l'avancement du déploiement sur la carte de France : chaque département prend la couleur du
statut du SAMU qui s'y trouve (en cours, en service…). La carte devient un outil de suivi, plus seulement une carte
d'événements.

## Objectifs

1. L'onglet « Événements » s'appelle « Événements / Cartographie » partout (barre d'onglets, matrice d'accès de
   l'administration, fenêtre « Mon profil », aide). Simple changement de libellé dans `frontend/src/ilots/onglets.ts`.
2. Dans cet onglet, une 2ᵉ rubrique repliable « Paramétrage des déploiements », réservée à l'administrateur :
    - **Statuts** : liste ordonnée (libellé, couleur). Ajout, modification, suppression, réordonnancement. Le statut
      « En service » est fourni par défaut et ne peut être ni renommé ni supprimé.
    - **Déploiements** : tableau des déploiements (`AffectationProject`) avec un menu de statut. Pour « En service »
      seulement, une date de mise en service s'affiche (champ existant `date_mise_en_service`).
3. Sur la carte, trois calques à cocher :
    - **Départements** : contours colorés selon le statut, curseur de transparence ;
    - **Événements / déplacements** : les pastilles de lieux actuelles ;
    - **Experts métier** : les pastilles d'experts actuelles.

## Hors périmètre

- Historique des changements de statut.
- Départements d'outre-mer (le fichier de contours retenu ne contient que la métropole, 96 départements).
- Déduire le département d'une localisation hébergée ailleurs (ANS…) : le calcul se fait sur les coordonnées de la
  localisation du déploiement, telles quelles.
- Édition des statuts par un profil autre qu'administrateur.

## Anti-objectifs

- Aucun appel réseau supplémentaire (la CSP n'est pas élargie).
- Aucune saisie obligatoire en plus : un déploiement sans statut ne colore rien.

## Contraintes

- Trois bases supportées : toute table nouvelle est déclarée dans `backend/prisma/{sqlite,postgresql,mysql}/schema.prisma`
  et dans les migrations existantes du projet.
- Routes documentées par `npm run routes` (`docs/api.md`, `backend/tests/fixtures/routes.json`).
- Interface en français, tests front (vitest) et back, e2e ajouté sur la CI.
- Procédure PR habituelle, pas de push direct sur `main`.

## Approches envisagées

| Approche                                               | Pour                                             | Contre                                                    |
| ------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| **A. Contours embarqués, calcul navigateur** (retenue) | Aucun appel externe, département toujours à jour | Calcul refait à l'affichage (négligeable)                 |
| B. Département calculé côté serveur et stocké          | Résultat figé                                    | Migration sur 3 bases, recalcul si la localisation change |
| C. Contours depuis un service externe                  | Rien à embarquer                                 | CSP à élargir, dépendance réseau                          |

Choix de l'utilisateur : A, avec calcul automatique du département (pas de champ saisi).

## Conception retenue

**Contours.** `departements-version-simplifiee.geojson` du dépôt `gregoiredavid/france-geojson` (tracés IGN Admin
Express, édition 2018), coordonnées arrondies à 3 décimales (environ 225 Ko), placé dans `frontend/` et chargé à la
première activation du calque. Source et licence notées dans `docs/architecture.md`.

**Calcul du département.** Fonction pure `departementDe(lat, lng, contours)` (point dans polygone, polygones et
multipolygones), testée. Un déploiement sans localisation ou sans coordonnées n'a pas de département.

**Données.** Nouvelle table `deployment_statuses` : `id`, `label`, `color`, `position`, `is_service` (0/1).
`affectation_projects` reçoit `status_id` (nullable). La date de mise en service réutilise `date_mise_en_service`. Passer
un déploiement à un autre statut que « En service » ne supprime pas la date, mais elle n'est plus affichée.

**Plusieurs déploiements dans un même département.** Le statut le mieux placé dans la liste des statuts l'emporte.

**API.** Routes admin pour lister, créer, modifier, supprimer et réordonner les statuts ; route pour affecter un statut
à un déploiement. La carte lit, avec les données déjà chargées, les déploiements avec leur statut et leurs coordonnées.
Suppression d'un statut utilisé : refusée avec un message qui liste les déploiements concernés.

**Carte.** Leaflet, `L.geoJSON` pour les départements (couleur du statut, `fillOpacity` pilotée par le curseur, bordure
fine), tooltip « département : statut (SAMU) ». Les calques existants (lieux, experts) passent dans des `LayerGroup`
distincts, pilotés par un contrôle de calques (cases à cocher). État des calques et transparence mémorisés dans le
navigateur (confort par utilisateur, absent : calques tous affichés, transparence 60 %).

## À la charge du constructeur

- Palette de couleurs proposée par défaut pour les statuts.
- Emplacement exact du contrôle de calques dans la fenêtre de carte.
- Texte d'aide à ajouter dans `frontend/pages/aide.html`.
- Découpage en lots : (1) libellé, (2) statuts et déploiements en administration, (3) calques de la carte.

## Révision du 2026-11-15 (retours à l'essai)

- **Le statut se rattache au SAMU (localisation), pas au déploiement d'affectation** : table `deployment_samus`
  (`location_id` unique, `status_id`, `date_mise_en_service`). La base de test compte 112 localisations, 14 événements
  « Mise en service » mais 9 déploiements d'affectation seulement.
- **Liste des SAMU suivis** : ceux qui ont une ligne saisie, ceux des déploiements d'affectation et ceux qui ont un
  événement « Mise en service » (date suggérée = première date de ces événements). Ajout de n'importe quelle
  localisation ; retrait possible pour les SAMU ajoutés à la main. Bouton « Reprendre les mises en service des
  événements » : « En service » pour les SAMU sans statut dont la mise en service est passée.
- **Palette restreinte de 15 couleurs**, de la moins à la plus avancée (la dernière est celle de « En service »),
  imposée par le serveur (`PALETTE_STATUTS`) et proposée par le sélecteur de couleur.
