# Migration de l'interface vers Vue 3

Plan de migration du frontend (`public/`) vers Vue 3, décidé en octobre 2026. Ce document est la référence de chaque
étape : périmètre, règles, critères de sortie.

## Décisions

| Sujet              | Décision                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Stratégie          | Migration progressive par **îlots** : chaque onglet devient une application Vue montée dans la page existante |
| Langage            | **TypeScript**                                                                                                |
| Outils             | Vue 3 (Composition API, `<script setup>`), Vite, Pinia, Vitest + Vue Test Utils                               |
| Mise en production | **Par îlot**, dès que ses scénarios e2e passent                                                               |
| Périmètre          | Planification (et Analyse, Déplacements), Aide à l'affectation, **application mobile**                        |
| Apparence          | Inchangée pendant la migration ; **DSFR dans une phase ultérieure** distincte                                 |
| Comportement       | Identique à l'existant ; les anomalies connues (`@anomalie-connue`) sont corrigées à part                     |

Avant le démarrage de chaque îlot, son périmètre (écrans, fichiers, scénarios e2e) est présenté et validé.

## Principe des îlots

```
index.html (existant)
├── mire, en-tête, onglets, fenêtres communes ........ code existant jusqu'à la phase 6
├── <div id="tripadvisor" class="tab-content">  ...... îlot Vue (phase 1)
├── <div id="reporting" class="tab-content">  ........ îlot Vue (phase 2)
└── …
```

- Un îlot est monté dans le conteneur de son onglet ; il remplace le HTML et le script de l'onglet.
- Il lit ses données à l'API, jamais dans les variables globales de l'ancien code (`resources`, `scheduleData`…).
  Depuis le lot 4.5, les données de la planification sont tenues par un magasin Pinia (`ilots/planification/magasin.ts`)
  partagé par l'onglet et les fenêtres ouvertes depuis les en-têtes (le magasin des îlots est commun aux fenêtres) ;
  depuis le lot 4.6, l'ancien code ne tient plus de planning. Il garde une copie des affectations en attente
  (`gp:invitations-en-attente` : compteur de l'enveloppe, journal à la déconnexion) jusqu'à la phase 6.
- Les échanges avec l'ancien code passaient par le module de liaison (`frontend/src/liaison.ts`) : événements de
  session (session perdue, changement de profil) et de rafraîchissement (planning, référentiels). Depuis le lot 6.4b,
  l'ancien code de l'application a disparu : le module est devenu le bus d'événements de l'interface
  (`frontend/src/evenements.ts`), entre composants qui ne partagent pas de magasin.
- Les éléments ciblés par les tests e2e gardent leur identifiant (`id`) ou leur `data-testid` : les scénarios
  passent sans modification sur l'îlot migré.

## Règles de développement

- Les écrans n'utilisent que des composants communs `App*` (`AppButton`, `AppModal`, `AppTable`, `AppInput`,
  `AppSelect`, `AppAlert`…), dont l'interface reprend celle des composants VueDsfr : la phase DSFR remplacera leur
  intérieur sans retoucher les écrans.
- Couleurs, espacements et rayons passent par des variables CSS centralisées ; pas de style en ligne.
- Accessibilité intégrée aux composants communs (libellés de champs, clavier, fenêtres modales) : exigence RGAA.
- Les tests e2e ne dépendent ni des attributs `onclick` ni des fonctions globales de l'ancien code (phase 0). Ils
  ciblent identifiants, rôles et libellés ; les sélecteurs sur des classes CSS de l'ancien code sont remplacés par
  des `data-testid` au moment de la migration de l'écran concerné, jamais ajoutés dans le nouveau code.
- Pas de `alert()` / `confirm()` du navigateur dans le nouveau code : `AppAlert` pour les messages, confirmation
  partagée par l'îlot (`fournirConfirmation` dans le composant racine, `useConfirmation` ailleurs). Les étapes e2e
  acceptent les deux formes (fenêtre du navigateur ou `alertdialog`) pendant la migration, pour confirmer
  (`confirmer`) comme pour annuler (`annulerConfirmation`, `e2e/support/interface.js`).
- Un îlot qui doit se mettre à jour à chaque ouverture de son onglet (comme l'ancien code) utilise
  `surReouverture` (`frontend/src/ilots/activation.ts`) ; depuis le lot 6.4b, la réouverture est signalée par
  l'enveloppe de l'adresse (`frontend/src/cadre/vues.ts`, onglets et applications gardés en vie par `KeepAlive`).
- Un onglet trop gros pour un seul îlot est migré par **sous-îlots** : chacun remplace une section de l'onglet (son
  conteneur) ; depuis le lot 6.4b, les sections de l'Administration sont réunies par
  `frontend/src/cadre/OngletAdministration.vue`.
- Une fenêtre ouverte par un bouton d'en-tête est montée à sa première demande (événement `gp:fenetre-demandee`) :
  elle est enregistrée dans `FENETRES` (`frontend/src/cadre/fenetres.ts`), montée par `cadre/FenetresDemandees.vue`
  et réagit à chaque demande avec `surDemande` ; démontage à la fin de la session.
- `frontend/src/decor/icones-emojis.ts` (ex-`public/js/ui-icons.js`) remplace les émojis des textes de la page par des icônes, îlots compris : un nœud texte
  converti n'est plus mis à jour par Vue. Un texte variable contenant un émoji est donc recréé à chaque changement
  (élément avec `:key` sur le texte, comme dans `AppAlert`), ou la partie variable isolée dans son propre élément.
- Bibliothèques installées par npm et intégrées au build (pas de CDN) ; en développement, les dépendances des îlots
  sont déclarées dans `optimizeDeps.include` (`frontend/vite.config.ts`) pour éviter un rechargement de la page.

## Phases

| Phase | Contenu                                                                                                                                                                                                                                                           | Taille | Scénarios e2e concernés                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 0     | Préparation : e2e indépendants de l'implémentation, Vite + Vue + TypeScript, intégration serveur, CI, Docker, briques communes                                                                                                                                    | M      | tous (non-régression)                                                       |
| 1     | Pilote : onglet SAMU-SAS TripAdVisor                                                                                                                                                                                                                              | S      | `09-tripadvisor`                                                            |
| 2     | Onglets Reporting, Événements (et types d'événements), Administration                                                                                                                                                                                             | M      | `08-reporting`, `05-evenements`, `11-administration`, `02-profils-et-acces` |
| 3     | Ressources, CRA (découpé en sous-lots)                                                                                                                                                                                                                            | L      | `03-ressources`, `07-cra`                                                   |
| 4     | Planification : grille, vues calendrier, impression, astreintes / HNO                                                                                                                                                                                             | L      | `04-planification`                                                          |
| 5     | Applications : Aide à l'affectation, Déplacements, Analyse, **mobile**                                                                                                                                                                                            | L      | `06-aide-affectation`, `10-mobile`, `14-non-regression`                     |
| 6     | Cadre de l'application : mire et double authentification (composant commun au bureau et au mobile, voir ci-dessous), en-tête, connectés et messagerie, inactivité, thèmes, menu Applications ; Vue Router ; retrait de l'ancien code ; CSP sans `'unsafe-inline'` | M      | `01-authentification`, tous                                                 |
| 7     | DSFR (phase distincte, après la migration)                                                                                                                                                                                                                        | M      | tous                                                                        |

### Avancement

| Phase | État                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Terminée                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1     | En production : îlot `frontend/src/ilots/tripadvisor/`, 7 scénarios d'écran ajoutés à `09-tripadvisor`                                                                                                                                                                                                                                                                                                                                                              |
| 2     | Découpée en trois îlots mis en production l'un après l'autre : Reporting, Événements, Administration. Reporting en production (`frontend/src/ilots/reporting/`, scénarios `15-reporting-suivis`). Événements en production (`frontend/src/ilots/evenements/`, scénarios `16-evenements-ecran`) ; carte des événements migrée à part (lot 5.1). Administration entièrement migrée en sous-îlots (voir ci-dessous) : phase terminée à la mise en production du lot 4g |
| 3     | Ressources puis CRA, chacun découpé en deux lots (voir ci-dessous). Ressources entièrement migrées (lot 3b en production). CRA : circuit (lot 3c) et administration et vue RH (lot 3d) en production : phase terminée                                                                                                                                                                                                                                               |
| 4     | Découpée en six lots mis en production l'un après l'autre (voir ci-dessous) : onglet Astreintes (4.1 HO, 4.2 HNO), fenêtres de consultation (4.3), fenêtres de saisie et de notification (4.4), grille (4.5), exports, impressions et clôture (4.6) : phase terminée                                                                                                                                                                                                |
| 5     | Découpée en lots mis en production l'un après l'autre (voir ci-dessous) : carte des événements (5.1), Déplacements (5.2), Analyse de fichiers (5.3), Aide à l'affectation (5.4), mobile (5.5)                                                                                                                                                                                                                                                                       |
| 6     | Plan validé (voir ci-dessous) : mire et double authentification (6.1, en production), en-tête et profil (6.2a et 6.2b en production), connectés, messagerie et inactivité (6.3, en production), racine Vue, onglets et Vue Router (6.4a et 6.4b en production), clôture (6.5, en production), styles en ligne (6.6, réalisé)                                                                                                                                                       |

Sous-îlots de l'Administration, mis en production l'un après l'autre :

| #    | Sous-îlot                  | Sections                                                                                                                                                 | État                                                                                                   |
| ---- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 4a   | Localisations              | Formulaire, liste, import CSV et conflits                                                                                                                | En production (`frontend/src/ilots/admin/localisations/`, scénarios `17-admin-localisations`)          |
| 4b   | Sécurité et messagerie     | SMTP, double authentification, clés d'API publiques, connexion Asana                                                                                     | En production (`frontend/src/ilots/admin/securite/`, trois sous-îlots, scénarios `18-admin-securite`)  |
| 4c-1 | Accès                      | Accès aux applications, accès aux onglets par profil                                                                                                     | En production (`frontend/src/ilots/admin/acces/`, deux sous-îlots, scénarios `19-admin-acces`)         |
| 4c-2 | Utilisateurs               | Création, liste, modification, mot de passe, TOTP, déconnexion, suppression, détails et journaux                                                         | En production (`frontend/src/ilots/admin/utilisateurs/`, scénarios `20-admin-utilisateurs`)            |
| 4d   | Paramétrages divers        | Version, inactivité, favicon, aide en ligne, sauvegarde et restauration, thèmes, son des notifications                                                   | En production (`frontend/src/ilots/admin/parametrages/`, scénarios `21-admin-parametrages`)            |
| 4e-1 | Jours spéciaux (.ics)      | Congés scolaires, dates particulières ; formulaire masqué des événements de l'administration supprimé                                                    | En production (`frontend/src/ilots/admin/jours-speciaux/`, scénarios `22-admin-jours-speciaux`)        |
| 4e-2 | Types d'événements         | Paramétrage des types d'événements, reprise des données des événements                                                                                   | En production (même dossier et mêmes scénarios, sous-îlot `#adminJoursSpeciaux` étendu)                |
| 4f-1 | Automatisations n°1 et n°2 | Rappel de saisie des disponibilités, sauvegarde des plannings (historiques, diagnostic et nettoyage des données, tests)                                  | En production (`frontend/src/ilots/admin/automatisations/`, scénarios `23-admin-automatisations`)      |
| 4f-2 | Automatisations n°3 à n°6  | Notifications Teams, workflow CRA, astreintes HO ; section entière « Automatisations et rappels »                                                        | En production (même dossier et mêmes scénarios, sous-îlot `#adminAutomatisations` étendu à la section) |
| 4g   | Clôture                    | En-tête de la section des jours ou événements spéciaux (dernier élément de l'onglet dans l'ancien code) ; fonctions de repli de l'ancien code supprimées | En production (`#adminJoursSpeciaux` étendu à la section)                                              |

Lots de l'onglet Ressources (phase 3), mis en production l'un après l'autre :

| #   | Lot            | Contenu                                                                                                                                                                                     | État                                                                                                                    |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 3a  | Liste et ajout | Liste (tri, bascules des astreintes et de l'activation, suppression, export), formulaire d'ajout (trigramme proposé, expert principal / secondaire sur des SAMU), profil RH en consultation | En production (`frontend/src/ilots/ressources/`, îlot `#resources`, scénarios `24-ressources-ecran` et `03-ressources`) |
| 3b  | Fiche          | Modification, consultation RH, historique des taux de MAD et particularités, contacts RH                                                                                                    | En production (même îlot et mêmes scénarios ; onglet Ressources entièrement migré)                                      |

Lots de l'onglet CRA (phase 3) :

| #   | Lot                      | Contenu                                                                                                                                                                                                                                                                                                                        | État                                                                                              |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 3c  | Circuit du CRA           | Cartes en cours (expert, administrateur, archivage), cartes signées (expert), détail (étapes, signatures, lignes, motifs), saisie des lignes et collecte (MAD volante), soumission, rappel, « Rien à déclarer », visas N1 / N2, refus motivé, correction et renvoi par l'administrateur, document PDF, lien d'une notification | En production (`frontend/src/ilots/cra/`, trois sous-îlots, scénarios `25-cra-ecran` et `07-cra`) |
| 3d  | Administration et vue RH | CRA à lancer, signés, archivés, supprimés, en attente de diffusion, fenêtre de diffusion, visualisation, vue RH (filtre « Mois » corrigé) ; `cra.js` et le reste du HTML de l'onglet supprimés                                                                                                                                 | En production (îlot d'onglet `#cra` remplaçant les sous-îlots, scénarios `26-cra-administration`) |

Lots de la Planification (phase 4), numérotés 4.1 à 4.6 (4a à 4g désignent les sous-îlots de l'Administration) :

| #    | Lot                                   | Contenu                                                                                                                                                                                                                                                                                                   | État                                                                                                                               |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Astreintes HO                         | Rubrique « Gestion des astreintes HO » : droits, navigation, inscriptions sur les demi-journées, astreinte HO ANS (un ou plusieurs utilisateurs par jour), enregistrement et e-mail de mise à jour ; `astreintes-ho.js` supprimé                                                                          | En production (`frontend/src/ilots/astreintes/`, sous-îlot `#astreintesHo`, scénarios `27-astreintes-ho`)                          |
| 4.2  | Astreintes HNO                        | Volontaires, disponibilités (règles FPH), génération du planning (scénario `@destructif` : campagne destructive de la CI seulement), changement d'expert, export, planning actuel ; onglet Astreintes entièrement migré (`astreintes.js` supprimé)                                                        | En production (îlot d'onglet `#astreintesGestion` remplaçant le sous-îlot HO, scénarios `28-astreintes-hno` et `27-astreintes-ho`) |
| 4.3  | Fenêtres de consultation              | Calendrier mensuel, calendrier des congés et événements, leurs impressions, recherche avancée (dates proposées corrigées) ; `search.js` supprimé, `calendar-views.js` réduit aux notifications (lot 4.4)                                                                                                  | En production (`frontend/src/ilots/consultation/`, fenêtres montées à la demande, scénarios `29-planification-consultation`)       |
| 4.4  | Fenêtres de saisie et de notification | « Gérer mes astreintes/HNO », demande d'affectation, invitations Outlook (sans envoi dans les e2e), nouvelles affectations de l'expert ; `hno.js`, `assignment-request.js` et `calendar-views.js` supprimés, `assignment-notifications.js` réduit au suivi des affectations de la grille et à la pastille | En production (`frontend/src/ilots/saisie/`, scénarios `30-planification-saisie`)                                                  |
| 4.5a | Grille et saisie des demi-journées    | Options d'affichage, légende, grille, navigation, zoom, lignes masquées, saisie (disponibilité, affectation, localisation, SAMU), enregistrement cellule par cellule, affectations à notifier ; anomalies a à f corrigées (voir ci-dessous)                                                               | En production (îlot d'onglet `#planning`, `frontend/src/ilots/planification/`, scénarios `31-planification-grille`)                |
| 4.5b | Menu contextuel de la grille          | Ajout, modification, suppression d'une astreinte / HNO depuis une demi-journée, saisie de l'îlot CRA réutilisée (source CRA ou mois de la grille ; fin de la copie `#ganttAstreinteModal`) ; anomalies corrigées (voir ci-dessous)                                                                        | En production (`MenuGrille.vue`, `cra/SaisieCra.vue`, scénarios `32-planification-menu`)                                           |
| 4.6  | Exports, impressions et clôture       | Téléchargement CSV, impression A4, calendrier d'une ressource (aperçu, impression, envoi par e-mail construit par le serveur) ; `planning-tools.js` et `particularites.js` supprimés, fin du planning tenu par l'ancien code (`scheduleData`, `loadSchedule`, `gp:grille-modifiee`)                       | En production (`FenetreTelechargement.vue`, `FenetreCalendrierRessource.vue`, scénarios `33-planification-exports`)                |

Lots des applications (phase 5), mis en production l'un après l'autre. Chaque lot commence par ses scénarios d'écran,
écrits sur l'ancien code. L'Aide à l'affectation, les Déplacements et l'Analyse sont des conteneurs de la page
principale (affichés par le menu Applications) ; le mobile est une page à part (point d'entrée Vite dédié), comme la
page publique des sondages (`sondage.html`).

| #    | Lot                                             | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | État                                                                                                            |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 5.1  | Carte des événements                            | Fenêtre plein écran de l'onglet Événements : filtres (dates, localisation, participants, type), pastilles des lieux et des experts, lecture chronologique ; `maps.js` et `map-timelapse.js` supprimés                                                                                                                                                                                                                                                                                                                                                                                        | En production (`frontend/src/ilots/evenements/FenetreCarte.vue`, scénarios `34-carte-evenements`)               |
| 5.2a | Déplacements : mes déplacements                 | Onglet « Planification des déplacements » en sous-îlot, monté seulement quand l'application est affichée : formulaire d'ajout (UO, bon de commande présélectionné, avertissement de dépassement), liste (mises en évidence, tri), modification, suppression ; routes de l'application réservées à l'accès « deplacements »                                                                                                                                                                                                                                                                   | En production (`frontend/src/ilots/deplacements/`, scénarios `35-deplacements`)                                 |
| 5.2b | Déplacements : cadre, reporting, administration | Application entière en îlot : en-tête commun des applications, onglets, fenêtre de déconnexion, recherche ; synthèse, liste filtrable, export CSV, bons de commande (écriture : administrateur, régularisation technique) ; `deplacements.js` supprimé (fonctions du cadre déplacées telles quelles, en attendant la phase 6)                                                                                                                                                                                                                                                                | En production (`ApplicationDeplacements.vue`, `ilots/applications/`, scénarios `36-deplacements-cadre`)         |
| 5.3  | Analyse de fichiers                             | Application entière en îlot (lots 5.3a et 5.3b réunis : les filtres agissent sur le tableau du même conteneur) : en-tête et pastilles communs ; chargement (xlsx, csv, txt ; encodage, séparateur, largeur fixe, ligne d'intitulés), fichier conservé dans le navigateur ; structure et renommage ; filtres (listes ET / OU et exclusions, texte, dates, oui / non) ; colonnes, doublons, pagination, export CSV ; SheetJS installé par npm ; `file-analysis.js` supprimé                                                                                                                    | En production (`frontend/src/ilots/analyse/`, scénarios `37-analyse`)                                           |
| 5.4a | Affectation : événements                        | Onglet « Événements » en îlot dans le conteneur de l'ancien code (onglet d'une application, monté application affichée) : liste filtrée (SAMU, type, recherche), tri, comparaison avec le planning ; suppression et doublons (fenêtre commune avec l'onglet Événements) ; routes `/api/affectation/*` réservées à l'accès « affectation », administrateur compris                                                                                                                                                                                                                            | En production (`frontend/src/ilots/affectation/`, scénarios `38-affectation-evenements`)                        |
| 5.4b | Affectation : planning des déploiements         | Onglet « Planning des déploiements » en îlot (lots 5.4b, 5.4c et 5.4d réunis : l'impression reprend le rendu de la grille, l'affectation s'ouvre depuis la grille) : grille (échelles, période, tri, SAMU affichés, lignes retirées, légende, colonne SAMU redimensionnable), affectation des ressources et report dans la planification (désaffectation et report réservés à l'administrateur, comme le serveur), impression et exports PDF / PowerPoint                                                                                                                                    | En production (`frontend/src/ilots/affectation/planning/`, scénarios `39-affectation-planning`)                 |
| 5.4e | Affectation : administration                    | Onglet « Administration » en îlot : déploiements (liste et frises, formulaire avec entité proposée, calendrier à numéros de semaine, périodes, contrôles ; liens avec les événements du SAMU ; historique ; suppression et sort des événements), correspondance des activités et projet Asana type, modèle PowerPoint et nom des fichiers d'export, couleurs et motifs ; historique et correspondance réservés à l'administrateur côté serveur                                                                                                                                               | En production (`frontend/src/ilots/affectation/administration/`, scénarios `40-affectation-administration`)     |
| 5.4f | Affectation : Asana                             | Rubrique « Connexion Asana » (projets du périmètre, filtre, appariement, analyse sans écriture, import en masse) ; fenêtres communes au planning et à l'administration (fenêtre « asana » du registre des fenêtres, magasin partagé) : import d'un export CSV ou d'un projet, rafraîchissement d'un déploiement ou de tous, changements constatés, conflits à trancher, tâches du projet et remplacements ; partie Asana de `affectation-app.js` supprimée                                                                                                                                   | En production (`frontend/src/ilots/affectation/asana/`, scénarios `41-affectation-asana`)                       |
| 5.4g | Affectation : ateliers, sondages et cadre       | Onglet « Planification des ateliers métier » (paramétrage, simulation, contenus, dates planifiées, enregistrement, liste ; fenêtres d'invitation et de sondage : dates, destinataires en pastilles, adresse unique, réponses, créneau retenu, clôture, réouverture, suppression, envois) ; page publique `sondage.html` (second point d'entrée Vite, balises injectées par le serveur) ; cadre de l'application (en-tête, pastilles et onglets communs, déconnexion) : application entière en îlot sur `#affectationContainer` ; `affectation-app.js` et `affectation-ateliers.js` supprimés | En production (`frontend/src/ilots/affectation/`, `frontend/src/sondage/`, scénarios `42-affectation-ateliers`) |
| 5.5  | Mobile                                          | Lots 5.5a et 5.5b réunis : application mobile entière en îlot (point d'entrée Vite `src/mobile.ts`, balises injectées par le serveur sur `/mobile` et `/mobile.html`) : mire et double authentification, vues Jour / Semaine / Mois, choix de l'expert, tiroir d'une demi-journée, événements, mode sombre, déconnexion ; carte « Autour de moi » (Leaflet installé par npm, CDN retiré de la page) ; `js/mobile/app.js` et `css/mobile.css` supprimés                                                                                                                                       | En production (`frontend/src/mobile/`, scénarios `10-mobile`, `44-mobile-planning`)                             |

Aide à l'affectation (décision du lot 5.4a) : migration onglet par onglet, chaque onglet devenant un îlot dans le
conteneur construit par `affectation-app.js` ; le cadre (en-tête, pastilles, onglets) passe en dernier (lot 5.4g),
quand plus aucun onglet ne dépend de l'ancien code (onglets et fenêtres partagent son état interne).

Décisions prises pour la phase 5 : les restrictions de l'écran s'appliquent aussi au serveur (routes des déplacements,
des bons de commande et des AMOA CED réservées à l'accès « deplacements », administrateur compris ; écriture des bons
de commande : administrateur) ; liste des SAMU des Déplacements remplacée par la liste commune ; message du bouton « Rechercher » des
Déplacements dans une fenêtre de la page ; scénarios e2e arrêtés avant tout envoi de courriel (invitations, sondages,
rétroplannings) ; SheetJS et Leaflet installés par npm.

Saisie des astreintes / HNO commune (lot 4.5b) : le CRA et le menu d'une demi-journée de la grille utilisent la même
saisie (`cra/SaisieCra.vue`, source CRA ou mois de la grille ; identifiants des champs `craSaisie…` ou
`ganttAstreinte…`) ; la copie réduite de l'ancien code (lot 3c) est supprimée.

Phase 6, composants communs au bureau et au mobile (décision du 10/11/2026) : la mire du mobile
(`frontend/src/mobile/MireMobile.vue`, reprise à l'identique au lot 5.5, comme la page mobile de l'ancien code avait
sa propre mire) est une copie à supprimer. La migration de la mire du bureau en fait un seul composant de connexion :

- mode « mobile » : pas de choix du profil (profil choisi par `POST /api/mobile-login`), pas d'écran de changement de
  mot de passe ; mode « bureau » : choix du profil, changement de mot de passe obligatoire, mot de passe oublié ;
- étape de double authentification commune (choix de la méthode, envoi du code, vérification : même API) ;
- présentation adaptée à la taille de l'écran (requêtes média) plutôt que par une classe propre au mobile (`lp-mobile`).

La page mobile utilise alors ce composant et `MireMobile.vue` est supprimée ; les scénarios `01-authentification` et
`10-mobile` couvrent les deux modes. Les vues du planning restent distinctes (grille du bureau ; vues Jour, Semaine et
Mois du mobile : deux interfaces différentes), mais leurs règles sont regroupées dans des modules TypeScript partagés
au lieu des copies actuelles : semaine ISO et lundi d'une date (`mobile/planning.ts`,
`ilots/affectation/planning/outils.ts`, `ilots/consultation/calendrier.ts`, `ilots/astreintes/ho.ts`,
`ilots/accueil/calculs.ts`), icônes des modèles d'événements (`mobile/planning.ts`,
`ilots/admin/jours-speciaux/types-evenements.ts`).

Lots du cadre de l'application (phase 6, plan validé le 10/11/2026), mis en production l'un après l'autre à partir de
`main` (après le lot 5.5). Chaque lot commence par ses scénarios d'écran, écrits sur l'ancien code ; le code mort est
supprimé dans le lot qui le rend inutile.

| #   | Lot                               | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Scénarios                                       |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 6.1 | Mire et double authentification   | Composant de connexion commun au bureau et au mobile (voir ci-dessus) : identifiants et identifiants mémorisés, choix du profil, mot de passe oublié, changement forcé, nouveau mot de passe (lien reçu), code par e-mail ou TOTP, mise en place du TOTP, choix de la méthode ; magasin Pinia `session` ; suite de la connexion confiée à l'ancien code par la liaison ; `MireMobile.vue` supprimée                                                                                                                                                                                                                                                                                                                                                                                                         | `01`, `10`, `12`, `44`, nouveau `45-mire`       |
| 6.2 | En-tête et profil                 | Découpé en deux lots. 6.2a, en-tête (réalisé) : zone de l'utilisateur commune aux applications (`ilots/applications/ZoneUtilisateur.vue`), changement de profil, pastille des nouvelles affectations, boutons de l'en-tête, enveloppe des invitations (fin de la copie `gp:invitations-en-attente`), menu Applications, déconnexion ; îlots du « cadre » (montés pendant la session). 6.2b, fenêtres (réalisé) : « Mon profil », nouveautés de l'aide, bandeau de mise en production, favicon                                                                                                                                                                                                                                                                                                               | `02`, `13`, `30`, nouveau `46-entete`           |
| 6.3 | Connectés, messagerie, inactivité | Connectés (avatars, liste), notifications du serveur (SSE), fenêtres de discussion, son, détection du réveil, compte à rebours et fenêtre d'inactivité (les pastilles des applications lisent le magasin) ; dans les e2e, envoi et réception des messages simulés (`page.route`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | nouveau `47-connectes`                          |
| 6.4 | Racine Vue, onglets, Vue Router   | Découpé en deux lots. 6.4a, onglets et applications (réalisé) : barre d'onglets en îlot du cadre (`ilots/navigation/BarreOnglets.vue` : accès par profil, ordre par glisser-déposer, pastille des CRA, onglet d'arrivée, lien vers un CRA), changement d'application (`ilots/navigation/navigation.ts`), `tabs.js` et `tab-access.js` supprimés. 6.4b (réalisé) : `index.html` réduit au conteneur de l'application, racine Vue et Vue Router (chemins `/accueil`, `/ressources`, `/evenements`, `/planification`, `/samu-sas`, `/cra`, `/cra/:id`, `/reporting`, `/administration`, `/astreintes`, `/deplacements`, `/analyse`, `/affectation`), courriels générés avec les nouveaux chemins, anciens liens `?tab=` redirigés, déroulé de la session en Vue, `liaison.ts` et chargements hérités supprimés | tous (`02`, `14` surtout), nouveau `48-onglets` |
| 6.5 | Clôture                           | (réalisé) Utilitaires communs en modules TypeScript (mode sombre, thèmes, mise en page, `ui-icons.js` repris à l'identique : composant d'icône lors de la phase DSFR) ; feuilles de style déplacées dans `frontend/` ; `public/js/` supprimé ; `aide.html` sans `onclick` ; CSP sans `'unsafe-inline'` pour les scripts ; règles partagées regroupées (semaine ISO, icônes des modèles d'événements)                                                                                                                                                                                                                                                                                                                                                                                                        | tous                                            |
| 6.6 | Styles en ligne                   | (réalisé) CSP sans `'unsafe-inline'` pour les styles : `style=` du HTML construit en TypeScript (grille et impression de l'Aide à l'affectation), styles statiques des gabarits, styles posés par Leaflet ; peut être reporté après la migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | tous                                            |

Points à traiter après la migration (relevés pendant la phase 5, comportement conservé) :

- Routes sans appelant dans l'écran : `POST /api/deplacements/:id/regularisation`, `POST /api/deplacements/:id/reaffecter`
  et `POST /api/affectation/ateliers/:id/send` (diffusion d'un rétroplanning par e-mail, décrite par l'aide en ligne
  sans bouton dans l'écran).
- Aide à l'affectation : l'ouverture de la grille des déploiements demande au serveur de reprendre les participants des
  événements comme ressources affectées (`POST /affectation/sync-from-events`) ; une consultation peut donc modifier
  les affectations (rattrapage de la synchronisation faite à chaque modification d'événement).
- Déplacements : un déplacement n'est jamais marqué « à régulariser » (le serveur compare au champ « uo_commandees »,
  absent du bon de commande ; comportement historique conservé par la réécriture du serveur) : badge « À RÉGULARISER »
  et bouton « Régulariser » jamais affichés.
- Déplacements : l'onglet Reporting est proposé à tout compte autorisé sur l'application (le serveur assimile
  « AMOA CED » à cet accès) ; pour un compte non administrateur, les noms des AMOA CED du reporting viennent des
  déplacements (liste des AMOA CED chargée pour l'administrateur seulement).
- Analyse de fichiers : retirer la dernière valeur incluse d'un filtre de liste retire aussi ses exclusions. La
  détection des accents doublement encodés (« Ã » suivi d'une lettre À-ÿ) ne reconnaît pas le cas courant « Ã© » (é).
  Un filtre de date dont seul le mode est choisi (sans date) compte comme actif et écarte les lignes sans date.
- Mobile : l'écran « accès réservé » n'est jamais affiché (accès mobile réservé aux experts, scénario
  `@anomalie-connue` de `10-mobile`). La liste « Expert » propose toutes les ressources actives, quel que soit le
  profil (comme le serveur le permet).
- Aide à l'affectation, ateliers métier : pour un compte non administrateur, le bouton d'un sondage existant reste
  proposé (consultation en lecture seule), mais la fenêtre ne s'ouvre pas : elle charge la liste des utilisateurs
  (`GET /api/users`, réservée à l'administrateur) et affiche l'erreur (décision du lot 5.4g : conservé).
- Aide à l'affectation, formulaire d'un déploiement : l'icône devant « Événement » (liens avec les événements) est
  vide (icône « calendar » absente de l'ancien écran) ; place conservée.

Anomalies relevées pendant la migration (comportement conservé, correction à part) :

- Localisations : à la reprise d'une session (page rechargée), l'ancien code ne charge pas les localisations (listes de
  l'ancien code qui en dépendent vides jusqu'à l'ouverture de la section Localisation de l'Administration ; le sous-îlot
  conserve ce rechargement à l'ouverture). Les listes SAMU des ressources sont chargées par leur îlot.

- Reporting : les listes d'experts (disponibilités, HNO / astreintes) et d'utilisateurs (connexions) ne sont chargées
  que pour le profil administrateur ; un autre profil ayant accès à l'onglet (configuration des onglets, accès
  reporting) les trouve vides.
- Événements : le bouton « Participer » reste proposé à un expert déjà participant (participants comparés sur un
  champ `id` alors que l'API fournit `user_id`).
- Événements : les exports CSV et HTML ont des colonnes « Localisation » et « Description » toujours vides (champs
  absents de l'API) ; avec le filtre de localisation, aucun événement n'est exporté.
- Utilisateurs : dans les détails d'un compte, la liste des rôles omet le profil RH, et une connexion avec le profil
  RH est affichée « Utilisateur ».
- Utilisateurs : l'export CSV des journaux écrit « undefined » à chaque ligne de connexion (champ `login_time` absent
  des connexions regroupées renvoyées par l'API).
- Utilisateurs : le tri par « Actif » ou par « Dernière connexion » est sans effet (colonnes mal référencées).
- Congés scolaires : à l'import, une période n'est rattachée à une zone que si son résumé contient « zone a », « zone b
  » ou « zone c » ; une période commune à plusieurs zones (« Zones A/B/C ») est ignorée.
- Types d'événements : modifier ou supprimer un type recharge la reprise des données, dont les modifications non
  enregistrées sont perdues ; enregistrer la reprise efface les libellés en cours de saisie dans le formulaire des types.
- Reprise des données : le tri « Créé par » se fait sur « nom prénom », la colonne affiche « prénom NOM ».
- Automatisation n°1 : dans la fenêtre de test, la case « Sélectionner » de l'en-tête est sans effet sur les experts
  cochés (fonction homonyme de l'aide à l'affectation chargée après celle de l'automatisation).
- Automatisation n°2 : après un envoi de test réussi, les boutons du récapitulatif restent masqués jusqu'au
  rechargement de la page.
- Automatisations : la fenêtre de l'historique sert aussi au diagnostic des mois et à l'aperçu du nettoyage ; son
  bouton « Vider l'historique » y reste proposé et vide l'historique de la dernière automatisation consultée (n°1 par
  défaut).
- Automatisation n°3 : la confirmation du vidage de l'historique Teams parle des « sauvegardes de planning ».
- Ressources : le bouton « Exporter (Excel) » télécharge un fichier CSV.
- Ressources : après un ajout, la case « MAD volante », la date de fin et les jours max du formulaire restent remplis.
- Ressources : le tri de la liste se fait sur le texte affiché des cellules (badges SAMU compris) ; la liste revient à
  l'ordre alphabétique à chaque rechargement, le sens du dernier tri de chaque colonne étant conservé.
- Ressources (fiche) : le taux enregistré avec la fiche est celui de la période de MAD en cours, ou, si aucune n'est en
  cours ou si son taux vaut 0, celui de la période qui commence le plus tard.
- Ressources (fiche) : sans historique de taux, une période est créée à l'ouverture de la fiche (taux et date de début
  de la ressource ; refusée au profil RH, dont la fiche reste alors sans historique).
- Ressources (fiche) : la suppression d'une période de MAD ne recharge pas la liste des ressources ; l'ajout, la
  modification et la suppression d'une particularité ne rechargent pas la planification.
- Ressources (fiche) : la modification d'une particularité n'est pas contrôlée (dates et taux), contrairement à l'ajout.
- Ressources (consultation RH) : l'historique des taux garde son en-tête « Actions », sans cellules.
- CRA : le lien d'une notification (`?tab=cra&cra_id=`) n'ouvre le CRA qu'à la connexion par la mire ; une session
  déjà ouverte affiche l'application sans l'ouvrir.
- CRA : un compte administrateur connecté sous un autre profil voit les actions d'administration du détail (refusées
  par le serveur) ; un compte RH connecté sous le profil expert a la vue RH, sans ses propres CRA.
- CRA (saisie) : les lignes sont repérées par leur rang ; supprimer une ligne placée avant celle en cours de
  modification fait porter la modification sur la ligne suivante.
- CRA (administration) : la ligne d'un CRA archivé (ou signé) propose « Statut » quel que soit son statut ; le
  filtre « Année » ne propose que l'année courante et les cinq précédentes.
- Astreintes HNO : « Générer le planning » enregistre aussitôt le planning du mois (il remplace le planning existant)
  et chaque changement d'expert est enregistré immédiatement ; le bouton « Sauvegarder le planning » n'affiche qu'un
  message. Le planning actuel ne s'affiche qu'au changement de mois (le mois courant présélectionné n'est pas chargé).
  L'export CSV porte le mois choisi au moment de l'export, même s'il diffère du mois généré.
- CRA : pour un CRA en cours, « Télécharger PDF » ouvre une page à imprimer (bouton « Imprimer / Enregistrer PDF »),
  pas un fichier.
- Calendrier mensuel (impression) : les boutons ◀ ▶ sont imprimés.
- Calendrier des congés et événements : les en-têtes portent les flèches de tri « ▲▼ » des tableaux de l'application
  (sans tri) ; à l'impression, les en-têtes du week-end perdent leur jaune.
- Recherche avancée : le classement s'intitule « Créneaux par nombre d'experts disponibles ANS » quels que soient les
  critères ; les en-têtes des tableaux gardent le gris des tableaux de l'application (le bleu et le vert prévus sont
  masqués) ; à chaque ouverture, experts et localisations sont désélectionnés, les autres critères et les derniers
  résultats sont conservés.
- Invitations Outlook : un refus de l'envoi par le serveur n'est pas signalé (affectations conservées) ; après une
  réponse 502 / 504 ou une erreur réseau, les experts sont retirés de l'attente sans message ; la case « Sélectionner /
  Désélectionner tous » ne suit pas les cases des experts.
- Nouvelles affectations : les notifications sont marquées lues deux fois (avant et après l'affichage) ; aucune partie
  de l'application ne les crée (route `POST /api/notifications/create-batch` jamais appelée) : la pastille ne s'affiche
  que pour des notifications créées par un autre outil.
- Grille : à l'ouverture de l'onglet, le mois courant est réaffiché (et, pour un expert, sa ressource seule dans le
  filtre) ; un clic sur une demi-journée n'est pas signalé en cas d'échec d'enregistrement (trois nouvelles tentatives,
  sans message ni retour en arrière) ; les congés scolaires viennent des congés enregistrés au chargement, puis des
  fichiers importés après un import ; une astreinte se terminant à midi pile couvre l'après-midi.

Changements de comportement décidés pendant la migration :

- Astreintes HNO : messages (alert) et confirmations (confirm) remplacés par des messages et une fenêtre de la page ;
  revenir sur la rubrique HNO remet à zéro les choix et le planning généré affiché (l'ancien écran remettait à zéro
  les choix mais gardait le tableau généré).
- Astreintes HO : le message de résultat de l'enregistrement et les refus (semaine passée, inscription d'un autre
  expert) s'affichent dans la rubrique, au lieu d'un message flottant de quelques secondes ; la confirmation du
  changement de mois avec des modifications non enregistrées est une fenêtre de la page.

- Automatisation n°3 : l'adresse du canal Teams n'est plus pré-remplie avec une adresse réelle lorsqu'aucune n'est
  enregistrée (champ vide) ; une adresse déjà enregistrée est conservée.
- Ressources : la liste « SAMU de rattachement » du formulaire d'ajout est chargée par l'îlot (plus vide après le
  rechargement de la page) ; le pré-remplissage « SAMU » au focus, hérité d'un ancien champ texte, n'est pas repris.
- Ressources (fiche) : la consultation par le profil RH ne remplace plus définitivement le bloc des astreintes de la
  fiche (l'ancien écran le laissait en lecture seule jusqu'au rechargement de la page, y compris après un passage au
  profil administrateur) ; les dates proposées pour une particularité sont bornées par la période affichée (l'ancien
  écran gardait la borne de fin d'une période consultée auparavant).
- CRA : la saisie du CRA et celle du menu contextuel du Gantt sont séparées. L'ancienne fenêtre commune pouvait garder
  le titre du Gantt, afficher le bouton de collecte d'un CRA ouvert auparavant, et, après une fenêtre du Gantt fermée
  sans « Terminer », enregistrer les lignes d'un CRA dans le mois et pour la personne du Gantt.
- CRA : les messages (alert) et confirmations (confirm) du navigateur sont remplacés par des messages et des fenêtres
  de la page ; la question de la collecte propose « Remplacer » ou « Conserver ». La configuration des viseurs N1 / N2
  est relue à chaque ouverture du détail (l'ancien écran la lisait à la connexion et à son enregistrement).
- CRA (vue RH) : le filtre « Mois » des CRA signés et archivés propose les douze mois (l'ancien écran n'affichait que
  « Tous », son modèle de liste n'étant pas interprété).
- CRA (administration) : les messages (alert) de lancement, diffusion, archivage, restauration et renvoi d'e-mails
  s'affichent sous le titre de l'onglet ; la sélection de « CRA à lancer » n'est plus remise à zéro après chaque
  traitement d'une autre liste (seulement après un lancement et à la réouverture de l'onglet) ; les colonnes des
  tableaux de CRA signés et archivés utilisent le redimensionnement commun aux autres tableaux.
- CRA : dans le document d'un CRA en cours, le texte saisi (objet, commentaire…) est affiché tel quel, sans être
  interprété comme du HTML.
- Recherche avancée : l'intervalle proposé va du premier au dernier jour du mois courant (l'ancien écran, par une
  conversion en UTC, proposait en France du dernier jour du mois précédent à l'avant-dernier jour du mois) ; le message
  « Veuillez sélectionner un intervalle de dates » s'affiche dans la fenêtre (alert du navigateur auparavant).
- Calendrier mensuel (impression) : le sous-titre est le mois affiché (l'ancien écran reprenait le texte du premier
  élément du calendrier : « Aucun », une pastille d'événement ou un trigramme) ; l'impression n'est demandée qu'une
  fois (l'ancien écran la demandait au chargement de la page d'impression puis à nouveau après 500 ms).
- Calendriers et recherche avancée : fenêtres communes de l'interface (fermeture par Échap, focus maintenu dans la
  fenêtre) ; libellés, infobulles et noms d'événements affichés tels quels, sans être interprétés comme du HTML.
- Astreintes / HNO déclarées : modifier une ligne « Activité courante » (saisie depuis un CRA) conserve son type,
  proposé dans la liste (l'ancien écran n'avait pas ce type : l'enregistrement était refusé, « Type, dates et objet
  sont requis ») ; messages de résultat et refus de la saisie affichés dans la fenêtre, suppression confirmée par une
  fenêtre de la page.
- Demande d'affectation : la date proposée est celle du jour en France (l'ancien écran, par une conversion en UTC,
  proposait la veille entre minuit et 1 h / 2 h) ; messages affichés dans la fenêtre.
- Invitations Outlook et nouvelles affectations : messages dans une fenêtre de la page (alert du navigateur
  auparavant), dont « Aucune modification d'affectation à envoyer » ; fin d'envoi annoncée par un message de la page
  (comme l'ancien écran).
- Grille (anomalies corrigées, lot 4.5a) : a) une localisation effacée (retour à « En attente », congés retirés) est
  supprimée en base (elle réapparaissait au rechargement : le serveur ne savait qu'écrire) ; b) seules les
  demi-journées modifiées sont envoyées (l'envoi du planning entier écrasait les modifications faites ailleurs entre
  temps) ; c) la période de MAD est vérifiée sur le jour cliqué (l'ancien écran vérifiait le même jour du mois
  suivant : refus à tort le dernier mois d'une MAD) ; d) la liste des années va de 2025 à l'année courante + 2 et suit
  la navigation (au-delà de 2028, l'ancien écran affichait « NaN ») ; e) le profil Utilisateur est prévenu que le
  planning est en lecture seule (la saisie s'affichait puis était refusée par le serveur, sans retour en arrière) ;
  f) le compteur « Jours » d'une ressource compte les jours attendus au jour près (décalage d'un jour en UTC).
- Menu d'une demi-journée (lot 4.5b) : proposé selon le profil actif (administrateur), comme le serveur (un compte
  administrateur connecté sous un autre profil voyait le menu sur les lignes des autres, puis la saisie était
  refusée) ; une astreinte commencée le mois précédent est modifiée sur place (l'ancien écran en créait une copie) ;
  « Tous les SAMU » est proposé dans la liste des SAMU et conservé à l'enregistrement du mois (l'ancien écran et le
  serveur le perdaient) ; confirmation de suppression et messages dans des fenêtres de la page.
- Montage des îlots (corrigé au lot 4.5b, régression depuis le lot 3a) : aucun îlot n'est monté tant que la mire de
  connexion est affichée. L'onglet Ressources, actif dans la page au chargement, montait son îlot sous la mire : appels
  à l'API sans session (401), message « Votre session a expiré » sur la mire d'un premier chargement, et champs de
  connexion vidés s'ils étaient déjà saisis à l'arrivée de la réponse.
- Mes déplacements (lot 5.2a) : routes `/api/deplacements`, `/api/mes-deplacements`, `/api/bons-commande`,
  `/api/reporting-deplacements`, `/api/liste-samu` et `/api/users/amoa-ced` réservées aux comptes autorisés sur
  l'application (403 sinon, administrateur compris, comme le menu Applications) ; liste des SAMU commune aux îlots
  (`frontend/src/composants/samu.ts`, mêmes 99 SAMU) ; textes de la liste échappés ; messages et confirmation dans des
  fenêtres de la page (alert / confirm auparavant) ; le tri choisi est conservé au rechargement de la liste (l'ancien
  écran le perdait).
- Déplacements : cadre, reporting et administration (lot 5.2b) : `POST`, `PUT` et `DELETE /api/bons-commande`
  réservés à l'administrateur (403 sinon), comme l'onglet Administration ; le minuteur d'inactivité de l'application
  décompte (il restait figé sur « 05:00 » ; orange sous 2 minutes, rouge sous 1 minute, comme l'Analyse) ; message de
  la recherche, messages et confirmations dans des fenêtres de la page (alert / confirm auparavant) ; textes des
  tableaux échappés ; filtres du reporting remis à zéro à chaque ouverture de l'onglet (l'ancien écran gardait les
  dates saisies mais affichait la liste entière) ; tri des tableaux conservé au rechargement. En-tête, pastilles et
  onglets dans l'îlot (`EnTeteApplication.vue`, `PastillesApplication.vue`, communs aux applications) ; le bouton
  masqué « Planification » (`#backToPlanificationBtn`), utilisé par les autres applications, est sorti du conteneur ;
  bulle `#deplacementsOnlineUsersTooltip` supprimée (jamais affichée : la pastille ouvre la bulle commune).
- Mobile (lot 5.5) : comportement et présentation identiques ; Leaflet servi par l'application (installé par npm) au
  lieu du CDN ; logo de la mire servi par `/img/logo-ans.webp` (même image que celle intégrée en base64) ; messages
  de débogage de la console (`[DEBUG]`, `[EVENTS]`) retirés ; textes des fiches de la carte échappés. Le script du
  mode sombre (`js/mobile/dark-mode.js`) reste chargé en tête de page pour éviter un flash au chargement, et
  `ui-icons.js` remplace toujours les pictogrammes : le planning est recréé à chaque changement de vue, de période ou
  de ressource (comme l'ancien écran le redessinait), pour que les pictogrammes remplacés soient à jour.
- Mire et double authentification (lot 6.1) : un seul composant pour le bureau et le mobile
  (`frontend/src/connexion/MireConnexion.vue`, modes « bureau » et « mobile »), présentation adaptée par requêtes média
  (écran de 600 px au plus : en-tête et formulaire resserrés ; classe `lp-mobile` supprimée). Décisions du lot :
  double authentification dans la carte de connexion pour les deux (fenêtres du bureau supprimées : choix de la
  méthode, code, mise en place de l'application) ; messages du bureau partout (mobile : « Veuillez remplir les
  identifiants », puis le message du serveur ; le mobile n'affiche plus « Aucun profil valide pour ce compte. » à la
  place de « Mot de passe à changer : connectez-vous une première fois depuis un ordinateur… ») ; code par e-mail
  envoyé dès le choix de la méthode (le mobile demandait un clic sur « Envoyer le code par email »), « Renvoyer le
  code » proposé aussi sur mobile ; mise en place de l'application d'authentification proposée sur mobile (le mobile
  demandait un code sans permettre de configurer l'application). La touche Entrée valide aussi la mire du bureau.
  Fenêtres « Mot de passe oublié », « Choisissez votre mot de passe » et « Choisir un nouveau mot de passe » dans la
  présentation commune (`AppModal`) ; page de connexion défilante quand la carte dépasse la hauteur de l'écran. Session
  vérifiée au chargement par le magasin `session` (`connexion/magasin.ts`), version de la mire lue par le composant
  (l'ancien code n'y écrit plus : `loadVersion`, `loadAppVersion` supprimées), logo servi par `/img/logo-ans.webp`
  (plus de base64 dans `index.html`). Liaison : `gp:session-ouverte` (connexion ou reprise : l'ancien code ouvre
  l'application), `gp:session-absente`, `gp:mire-affichee` (déconnexion, session perdue, réveil : mire vidée, message
  éventuel). Le serveur injecte aussi les feuilles de style des modules partagés entre points d'entrée
  (`feuillesDeStyle`, `src/lib/frontend.js`). Code mort supprimé : `tryFillCredentials`, `getISOWeekNumber`, branche
  « déplacements » de `completeFinalLogin`, styles de l'ancienne mire mobile (`.login-card`…).
- En-tête de la Planification (lot 6.2a) : îlots du « cadre » de l'application (forme `{ chargeur, cadre: true }` de
  `ilots/montage.ts` : montés pendant toute la session, mire masquée, démontés à sa fin) : zone de l'utilisateur
  (`ilots/entete/EnTetePlanification.vue`), boutons à droite des onglets (`BoutonsEnTete.vue`, dans `#enteteBoutons`)
  et menu Applications (`MenuApplications.vue`, dans `#menuApplications`). La zone de l'utilisateur
  (`ilots/applications/ZoneUtilisateur.vue`) est commune à la Planification et aux applications (`EnTeteApplication`) ;
  changement de profil et pastille des nouvelles affectations dans la Planification seulement (décision du lot).
  Correction décidée : profil RH affiché « RH » partout (l'en-tête de la Planification affichait « rh », celui des
  applications « Utilisateur »). Rond sans photo ni trigramme : initiales du prénom et du nom aussi dans les
  applications (« ? » auparavant). Déconnexion confirmée dans une fenêtre de la page (`confirm` auparavant) ; erreur
  d'un changement de profil affichée dans la liste des profils (`alert` auparavant). L'enveloppe lit les affectations en
  attente dans le magasin de la Planification : copie `gp:invitations-en-attente` et `pendingAssignments` supprimées ;
  journal des affectations non envoyées à la déconnexion par l'îlot (`journaliserInvitations`), demandé par l'ancien
  code à la déconnexion pour inactivité (`gp:journal-invitations`). Photo enregistrée : `gp:photo-modifiee`. Le
  magasin de la Planification ne recharge plus ses données sur un événement tant qu'il ne les a pas chargées (il est
  créé dès la connexion par l'en-tête). Le réveil du poste sans session démonte aussi les îlots (`gp:session-terminee`).
  `mfa.js` et `assignment-notifications.js` supprimés ; identifiants de l'ancien en-tête conservés.
- Planification, lignes masquées (correction relevée pendant le lot 6.2a, régression du lot 4.5a) : le bouton « N masqués »
  et sa liste ne s'affichaient jamais (`app.css` les masquait par défaut, l'îlot les affiche par `v-show`) ; ils sont
  de nouveau proposés. Le scénario « Lignes experts et congés masquables » de `04-planification`, ignoré faute de ligne
  des congés hors CI, crée désormais son propre événement du jour.
- Fenêtres de l'en-tête (lot 6.2b) : fenêtre « Mon profil » (`ilots/profil/FenetreProfil.vue`, fenêtre « profil » du
  registre, ouverte par le rond de l'utilisateur de la Planification et des applications) ; messages et confirmation
  du mot de passe dans la fenêtre (`alert` / `confirm` auparavant), confirmation de la photo et de l'onglet par défaut
  dans un message bref en bas de page. Correction décidée : choisir l'Accueil comme onglet par défaut affichait
  « Onglet par défaut : undefined ». SAMU de l'expert saisis avec la saisie de la fiche ressource (`SaisieSamu`,
  liste commune des SAMU) : un SAMU n'a plus qu'un rôle (principal ou secondaire), suggestions limitées à 10, triées.
  Règle de l'écran appliquée au serveur : `PUT /api/me/samu-assignments` réservé au profil Expert actif (403 sinon).
  `GET /api/check-session` renvoie l'onglet par défaut (`defaultTab`) : la fenêtre l'affiche aussi après un
  rechargement de la page (l'ancien écran affichait alors l'Accueil). Libellés et icônes des onglets dans
  `ilots/onglets.ts`. Mode d'affichage et thème saisonnier toujours appliqués par `darkmode.js` et `themes.js`
  (`Themes.userEnabled` ajouté). Nouveautés de l'aide (`CadreSession.vue`, îlot du cadre) après une connexion par la
  mire (repère `gp_connexion_recente`), contenu de `aide.html` repris tel quel (décision du lot : à revoir avec la
  CSP, lot 6.6) ; favicon appliqué par le même îlot. Bandeau de mise en production (`BandeauMiseEnProduction.vue`)
  monté dès le chargement (mire comprise). `profile.js` et `version-watch.js` supprimés ; `settings.js` réduit à
  l'inactivité (lot 6.3).
- Anomalie relevée (lot 6.2b, comportement conservé) : la fenêtre « Mon profil » propose l'onglet « SAMU-SAS
  TripAdVisor » comme onglet par défaut, mais le serveur le refuse (« Onglet invalide », liste `DEFAULT_TABS`).
- Connectés, messagerie et inactivité (lot 6.3) : pastilles (connectés, minuteur) communes à la Planification et aux
  applications (`PastillesApplication.vue`, identifiants de l'ancien en-tête sans préfixe), une seule liste des
  connectés ouverte sous la pastille cliquée (`ilots/connectes/BulleConnectes.vue`), conversations, réception des
  messages et décompte dans l'îlot du cadre `CadreConnectes.vue`, magasins de la session `connectes`, `discussions`,
  `inactivite` (relecture des connectés une seule fois pour toutes les applications) ; historiques des conversations
  dans `sessionStorage` (mêmes clés). Décisions du lot : un seul décompte d'inactivité pour toute la session (changer
  d'application ne le relance plus) ; mêmes couleurs du minuteur partout (orange sous 2 min, rouge sous 1 min).
  Conséquence : le minuteur et la déconnexion pour inactivité suivent partout le paramétrage de l'administration ; les
  applications (Déplacements, Analyse, Affectation) démarraient auparavant un décompte même inactivité désactivée
  (durée paramétrée, à défaut 5 minutes). Pastille des connectés : avatars colorés selon le profil et nombre de
  connectés partout. Erreur d'envoi d'un message dans la conversation (`alert` auparavant). Déconnexion pour inactivité
  par l'îlot (journal des invitations compris ; `gp:journal-invitations` supprimé). Réveil du poste : session vérifiée
  (sinon retour à la mire, `afficherMire`), décompte recalé, connectés et grille relus. Son de notification :
  `ilots/connectes/son.ts`, aussi utilisé par l'essai de l'administration. Code mort supprimé : fenêtre « Nouvelle
  localisation » de l'ancien code, géocodage, carte de vérification, `autoCheckGristByLabel`, feuille Leaflet du CDN.
  `realtime.js` et `settings.js` supprimés.
- Onglets et applications (lot 6.4a) : barre d'onglets en îlot du cadre (`ilots/navigation/BarreOnglets.vue`,
  identifiants de l'ancienne barre conservés), règles d'accès, onglet d'arrivée, pastille des CRA, changement
  d'application et application gardée pour l'onglet du navigateur dans `ilots/navigation/navigation.ts` (fonctions
  appelées directement par les îlots, retirées de la liaison). Correction décidée : après un rechargement de la page,
  l'ordre choisi des onglets est réappliqué et le glisser-déposer reste disponible (l'ancien code ne les mettait en
  place qu'après une connexion par la mire). Le lien d'une notification vers un CRA (`?tab=cra&cra_id=`) est aussi
  suivi après un rechargement, et accepte `craId` : correction décidée, la notification « CRA à vérifier et
  soumettre » générait `?tab=cra&craId=` (CRA non ouvert) ; elle génère désormais le même lien que les autres. Redirection
  conservée : ces liens `?tab=cra` des courriels déjà envoyés resteront acceptés après le passage aux chemins du lot
  6.4b. L'onglet d'arrivée est ouvert dès l'affichage de l'application (avant, après les chargements de l'ancien code).
  Bouton masqué « Planification » (`#backToPlanificationBtn`, jamais affiché) supprimé ; `uiIcon` déplacé dans
  `event-types.js` (lot 6.5) ; `tabs.js` et `tab-access.js` supprimés.
- Racine Vue, Vue Router et session (lot 6.4b) : `index.html` réduit à `<div id="app">` ; point d'entrée
  `frontend/src/principal.ts` (à la place de `ilots.ts`), racine `cadre/ApplicationPrincipale.vue` (mire, cadre de la
  session `cadre/CadreApplication.vue`, bandeau de mise en production, écran de déconnexion). Adresses
  (`cadre/routes.ts`, `ilots/navigation/navigation.ts`) : `/accueil`, `/ressources`, `/evenements`, `/planification`,
  `/samu-sas`, `/cra` et `/cra/:id`, `/reporting`, `/administration`, `/astreintes`, `/deplacements`, `/analyse`,
  `/affectation` ; conteneurs et identifiants d'origine conservés (`#planning.tab-content`, `#analyseContainer`…).
  Changements de comportement décidés : le rechargement de la page garde l'onglet ou l'application affichés (avant :
  onglet d'arrivée, sauf application gardée par `sessionStorage` « selectedApp », supprimé) ; retour arrière du
  navigateur entre onglets et applications ; `/` et adresse inconnue ou refusée au profil : onglet d'arrivée ; adresse
  demandée avant la connexion ouverte après la connexion si elle est permise ; à la fin de la session, l'adresse
  revient à `/` (connexion suivante : onglet d'arrivée). Courriels des CRA : `/cra/:id` et `/cra` (`cra.automation.js`,
  `cra.notifications.js`). **Redirection conservée** : les anciens liens `/?tab=cra&cra_id=` (et `craId`) des
  courriels déjà envoyés mènent à `/cra/:id` ; à garder tant que de tels courriels peuvent être ouverts. Onglets et
  applications gardés en vie (`KeepAlive`) pendant la session, comme les îlots auparavant ; la réouverture est
  désormais signalée aussi au retour d'une autre application. Session (`session/session.ts`, repris de `core.js`) :
  même surveillance des réponses (401 « Non authentifié » ou « SESSION_TERMINATED », 403 vérifié au plus toutes les
  5 s) et mêmes messages ; écran « Déconnexion en cours... » ; échec de la déconnexion signalé dans la page (`alert`
  auparavant) ; magasins Pinia vidés à la fin de la session (sauf celui de la mire). Lien de réinitialisation du mot
  de passe : jeton retiré de l'adresse avant sa lecture par le routeur (`connexion/jeton.ts`). Utilitaires repris en
  TypeScript : colonnes redimensionnables et masquables (`outils/colonnes.ts`, styles en classes), bandeau « Données
  synchronisées » et accès au décor jusqu'au lot 6.5 (`outils/page.ts`), style des fenêtres d'impression
  (`outils/impression.ts`) ; `layout-fix.js` appelle `window.makeColResizable` et `window.resetZoomPlanning`, posés
  par le point d'entrée. `liaison.ts` devenu `evenements.ts` (bus d'événements) ; `ilots/montage.ts`,
  `ilots/fenetres.ts` remplacés. Code supprimé : `core.js`, `planning.js`, `conges-scolaires.js`, `locations.js`,
  `dump.js`, `planning-navigation.js` (chargements de ressources, utilisateurs, congés, dates et localisations que
  plus rien ne lisait), `email-validation.js` (sans appelant), `boot.js` (réglage remplacé par l'attribut
  `data-ui-icons-keep-alert` de `<html>`), purge des cookies au chargement de la page. Dépendance ajoutée :
  `vue-router` 4.6.4. e2e adaptés : `01` « Déconnexion pendant le chargement initial » interrompt désormais le
  chargement des accès aux onglets (les chargements hérités ont disparu), `16` attend l'enregistrement de l'événement
  (la planification n'est relue que si elle est chargée). Commentaires du code qui décrivent encore des échanges avec l'ancien code : revus au lot 6.5.
- Clôture (lot 6.5) : `public/js/` supprimé. Décor de la page repris en modules TypeScript (`frontend/src/decor/`) :
  mode d'affichage (`mode-affichage.ts`), thèmes saisonniers (`themes.ts`, appelé directement par l'administration et
  « Mon profil », plus de `window.Themes`), mise en page et bouton « Ajuster l'affichage » (`mise-en-page.ts`, plus de
  `window.makeColResizable` ni `window.resetZoomPlanning`), barre d'outils flottante (`outils-flottants.ts`, ex-
  `GPTools`), icônes des émojis et infobulles (`icones-emojis.ts`, repris à l'identique de `ui-icons.js`), icônes des
  alertes ⚠️ (`alertes.ts`). Seul script classique restant : `frontend/public/mode-affichage.js` (servi sous `/vue/`,
  dans `<head>` de `index.html` et `mobile.html`) qui pose le mode sombre avant l'affichage. `event-types.js` supprimé
  (sans appelant). Feuilles de style déplacées dans `frontend/src/styles/` : feuilles globales de la page principale
  regroupées dans un point d'entrée CSS (`globales.css`) injecté avant celles des composants, dans l'ordre d'origine ;
  le serveur insère désormais les feuilles de chaque page à la fin de `<head>`. Aide en ligne : point d'entrée
  `aide.ts` (feuille de style, icônes, bouton « Retour à l'application » sans `onclick`), aussi injecté dans une aide
  personnalisée, dont les balises de l'ancienne aide livrée (`/js/…`, `/css/aide.css`) sont retirées ; les scripts
  qu'une aide personnalisée contiendrait ne s'exécutent plus. Fenêtre d'impression du CRA : bouton branché depuis
  l'application (`onclick` auparavant). CSP : `script-src 'self'` et `script-src-attr 'none'` (plus de
  `'unsafe-inline'`), `cdnjs.cloudflare.com` retiré des scripts et des styles ; styles en ligne admis jusqu'au lot
  6.6. Redirections des anciennes adresses des scripts et feuilles de style retirées (celles des images gardées).
  Paramètre `?v=` des balises supprimé (fichiers à empreinte) : `npm run app:version` ne met plus à jour que la
  version de `index.html`. Semaine ISO 8601 : règle partagée `outils/semaine.ts` (planification, consultation,
  astreintes, aide à l'affectation, mobile). Icône d'un événement sans type d'après son libellé : règle partagée
  `outils/modeles-evenements.ts` ; **changement décidé** : la règle du mobile (début du libellé, points ignorés,
  « Formations utilisateurs » → toque, « Accompagnement post démarrage » → bouée) s'applique aussi au bureau, qui
  n'affichait d'icône que pour un libellé égal au modèle ou suivi d'un espace ; l'épingle par défaut reste propre au
  mobile. Commentaires décrivant l'ancien code revus. e2e : nouvelle
  fonctionnalité `49-cloture` (aucune violation CSP sur la mire, l'application, l'aide et le mobile ; mode sombre
  gardé après un rechargement ; aide en ligne).
- Styles en ligne (lot 6.6) : CSP `style-src 'self'` (plus de `'unsafe-inline'`, sauf en développement pour le
  serveur Vite et pour l'aide en ligne, contenu statique et personnalisable). Mécanisme commun
  `outils/styles-en-ligne.ts` : le HTML construit en chaîne garde ses styles sous la forme `data-style`, réappliqués en
  JavaScript après l'insertion (`sansStyleEnLigne` + directive `v-styles-en-ligne` : grille et aperçu d'impression de
  l'aide à l'affectation, calendrier d'une ressource construit par le serveur, nouveautés de l'aide ; icônes des
  émojis et des alertes ; repères de la carte du mobile) ; constructeurs inchangés (leur HTML sert aussi aux exports
  PDF / PowerPoint rendus par le serveur). Fenêtres et cadres d'impression écrits par `ecrireDocument` : blocs
  `<style>` repris en feuille construite (`adoptedStyleSheets`), avec le style des icônes (l'ancien remplacement de
  `window.open`, `outils/impression.ts`, est supprimé). Éléments `<style>` créés par le code (zoom de la grille,
  colonnes masquées) remplacés par des feuilles construites (`feuilleConstruite`). Légende de la Planification : couleurs
  en classes (`color-code--…`) ; la recherche avancée lit leur couleur calculée. Suivi HNO : `position: sticky` lié par
  `:style` (règles globales `[style*=sticky]` conservées). Page d'un sondage : bloc `<style>` déplacé dans
  `frontend/src/sondage/sondage.css`. e2e : les violations CSP sont aussi relevées dans les fenêtres ouvertes
  (impressions) et font échouer tout scénario (`e2e/support/fixtures.js`) ; `49-cloture` couvre chaque onglet et
  application.
- Aide à l'affectation, ateliers, sondages et cadre (lot 5.4g) : confirmations (suppression d'un rétroplanning, clôture,
  réouverture et suppression d'un sondage, déconnexion) dans des fenêtres de la page (confirm auparavant) ; fenêtres
  d'invitation et de sondage dans la présentation commune (Échap ferme). Après le premier enregistrement d'un
  rétroplanning, les boutons « Sondage » sont aussitôt utilisables (l'ancien écran les laissait grisés jusqu'au
  recalcul suivant du tableau). Textes échappés. L'application entière est un îlot (`#affectationContainer` dans
  `index.html`) ; ouverture, fermeture et déconnexion : `tab-access.js` (`showAffectationApp`,
  `hideAffectationApp`, `confirmLogoutFromAffectation`), comme les Déplacements et l'Analyse ; règles CSS communes
  de l'application dans `ilots/affectation/affectation.css`. Page publique d'un sondage : même présentation, script
  en ligne remplacé par le point d'entrée `src/sondage.ts` (`src/lib/frontend.js` sert `index.html` et
  `sondage.html` avec leurs balises).
- Aide à l'affectation, Asana (lot 5.4f) : message de fin d'import et erreur d'appariement dans une fenêtre de la page
  (alert auparavant) ; confirmations de l'import en masse et de la création d'un événement (fenêtre des tâches) dans
  des fenêtres de la page (confirm auparavant) ; fenêtres dans la présentation commune (Échap ferme). Les fenêtres Asana
  sont montées une fois pour le planning et l'administration (registre des fenêtres, magasin Pinia partagé) ; les
  îlots se préviennent par `gp:deploiements-modifies`. Le filtre des projets retire de la liste ceux qui ne
  correspondent pas (l'ancien écran les masquait). Événement associé d'une rubrique (fenêtre des tâches) : composant
  des liens du formulaire d'un déploiement. Textes échappés. `affectation-app.js` ne garde que le cadre de
  l'application et l'ouverture des ateliers (lot 5.4g).
- Aide à l'affectation, onglet « Administration » (lot 5.4e) : `GET /api/affectation/projects/:id/history` et
  `GET /api/affectation/stage-event-types` réservés à l'administrateur (403 sinon), comme l'onglet qui seul les
  affiche. Confirmations (suppression d'un déploiement, création d'un événement, suppression du modèle PowerPoint) et
  erreurs dans des fenêtres de la page (confirm / alert auparavant) ; fenêtres du formulaire, de l'historique et de la
  suppression dans la présentation commune des fenêtres (fermeture par Échap ; Échap ferme d'abord le calendrier ou
  la liste des entités). Liste, couleurs, modèle et correspondance relus à chaque ouverture de l'onglet (l'ancien écran
  les chargeait une fois). Formulaire : « Ajouter une période » et « Effacer cette période » n'agissent que sur la
  ligne concernée (l'ancien écran reconstruisait les lignes et perdait celles sans date) ; l'indication « mêmes dates
  que l'activité » suit les dates saisies ; la liste des entités ne s'ouvre plus d'elle-même à l'ouverture de la
  fenêtre. Textes échappés. La rubrique « Connexion Asana » et les fenêtres Asana restent servies par l'ancien code
  (lot 5.4f) : les boutons Asana de l'îlot les appellent (`liaison.ts`), et l'ancien code prévient la liste de ses
  modifications par `gp:deploiements-modifies` (il ne garde des étapes que leurs libellés, lus à l'ouverture des tâches
  Asana). Règles CSS de l'onglet déplacées dans `administration/administration.css` ; les règles communes à
  l'application (`.aff-card`, `.aff-btn`, `.aff-field`, `.aff-icon-btn`…) restent dans l'ancien code jusqu'au lot du
  cadre (5.4g).
- Aide à l'affectation, onglet « Planning des déploiements » (lot 5.4b) : dans la fenêtre d'affectation, la
  désaffectation (remise en situation de la planification des experts retirés ou des journées décochées) et le report
  dans la planification et l'événement (« Synchroniser », proposé aussi après l'enregistrement) ne sont plus proposés
  qu'à l'administrateur, comme le serveur qui les refusait aux autres profils (anomalie corrigée). Confirmations,
  messages et erreurs dans des fenêtres de la page (confirm / alert auparavant). La grille et les pages imprimées sont
  produites en HTML par le même code (`planning/grille.ts`, textes échappés) ; les barres des étapes sont accessibles
  au clavier. L'administration (ancien code) prévient la grille de ses modifications (événement
  `gp:deploiements-modifies`) au lieu de la redessiner ; le rafraîchissement Asana d'une ligne reste dans l'ancien code
  (lot 5.4f). Styles de l'onglet déplacés dans `frontend/src/ilots/affectation/planning/*.css` (aussi insérés dans le
  HTML des exports). Exemple du nom des fichiers d'export (Administration) : calculé à l'échelle jour.
- Aide à l'affectation, onglet « Événements » (lot 5.4a) : routes `/api/affectation/*` protégées par
  `requireAffectationAccess` réservées aux comptes autorisés sur l'application (403 sinon, administrateur compris :
  le profil administrateur passait sans cet accès), comme le menu Applications et la frise de l'Accueil.
  Confirmations (suppression, fusion) et erreurs dans des fenêtres de la page (confirm / alert auparavant) ; fenêtre
  des doublons commune avec l'onglet Événements de la planification (même présentation, limitée aux événements de
  l'onglet) ; textes échappés. `affectation-app.js` construit son conteneur dès son chargement (script différé) au lieu
  d'attendre la fin du chargement de la page, pour que l'îlot le trouve.
- Analyse de fichiers (lot 5.3) : SheetJS 0.20.3 installé par npm (archive de SheetJS) au lieu de la version 0.18.5
  chargée par le CDN, désormais retiré de la page ; conséquence : les dates d'un CSV sont conservées telles qu'écrites
  (la 0.18.5 convertissait celles dont le jour est ≤ 12 au format américain court, « 02/02/2031 » devenant « 2/2/31 »,
  heure perdue ; la colonne n'était alors plus reconnue comme une date). Pastilles alignées sur celles des autres
  applications (avatars, « N connecté(s) », ⏱). Textes du fichier échappés (cellules, intitulés, valeurs proposées : ils
  étaient insérés tels quels dans la page) ; messages et confirmation de déconnexion dans des fenêtres de la page
  (alert / confirm auparavant). Fichier conservé : même base du navigateur (un fichier déjà conservé reste proposé).
  Dates d'un classeur Excel affichées « JJ/MM/AAAA » (« JJ/MM/AAAA HH:mm » si la cellule porte une heure), calculées
  sur la valeur numérique d'Excel, sans effet du fuseau horaire (anomalie corrigée : SheetJS les affichait au format
  américain court « 3/15/31 », en 0.18.5 comme en 0.20.3, le format demandé ne s'appliquant pas) ; elles sont ainsi
  reconnues comme dates par les filtres et la structure. Politique de sécurité du contenu : `cdn.jsdelivr.net` retiré
  des origines de scripts (plus aucun script chargé depuis ce CDN).
- Carte des événements (lot 5.1) : le filtre « Participants » retrouve les événements des personnes choisies (le
  serveur ne renvoyait que les noms affichés et pas les invités externes : un participant choisi vidait la carte) ;
  `GET /api/reporting/events-map` renvoie aussi `participant_ids` et `external_participants`. Textes des bulles
  (lieux, adresses, participants, experts) échappés. Localisations relues à chaque ouverture (vides à la reprise d'une
  session dans l'ancien code). Message « Aucun événement à lire » dans une fenêtre de la page (alert auparavant).
  Leaflet installé par npm pour cette fenêtre (la vérification d'une nouvelle localisation, encore dans l'ancien code,
  le charge toujours par le CDN). Le code mort de la carte intégrée (`#eventsMapContainer`) est supprimé.
- Exports et impressions (lot 4.6) : le calendrier d'une ressource (aperçu et e-mail) est construit par le serveur à
  partir du planning enregistré (`GET /api/resource-calendar/:resourceId`) ; `POST /api/send-calendar-email` ne
  reçoit plus que la ressource, l'année et le mois (la page fournissait le contenu et l'objet du message : tout compte
  connecté pouvait faire envoyer un message libre à un expert depuis l'adresse de l'application) ; les noms et objets
  sont échappés. L'impression du calendrier n'est demandée qu'une fois (deux demandes auparavant). Le nom de fichier
  proposé pour le CSV est filtré par le serveur (lettres, chiffres, « _ », « - », « . »). Confirmation et messages
  dans des fenêtres de la page (confirm / alert auparavant).
- Grille : messages des refus de saisie dans une fenêtre de la page (alert auparavant), fenêtres communes pour la
  localisation, le SAMU et la confirmation de modification ; le tri par la colonne « Ressource » est conservé
  jusqu'au tri suivant (l'ancien écran le perdait au premier clic) ; l'historique des MAD n'est plus chargé à la
  connexion par l'ancien code (une requête par ressource et par période) mais par l'îlot, en parallèle.

### Critères de sortie d'un îlot

1. Tous les scénarios e2e de la campagne par défaut passent en CI (pas seulement ceux de l'îlot).
2. Tests de composants (Vitest) pour la logique de l'îlot ; `vue-tsc`, lint et Prettier sans erreur.
3. Ancien script et HTML de l'onglet supprimés.
4. Mise en production, puis îlot suivant.

## Points d'attention

- Comportements transverses à conserver : retour sur la mire en cas de session perdue (401), polling et temps réel,
  minuteur d'inactivité, thèmes saisonniers et mode sombre, préférences mémorisées dans le navigateur.
- Exports PDF et PowerPoint du planning des déploiements : générés par le serveur à partir du HTML de l'écran ; le
  rendu Vue doit produire un HTML équivalent.
- Grille de planification (phase 4) : mesure de performance avant / après ; rendu par ligne, virtualisation si besoin.
- L'aide en ligne (`aide.html`, personnalisable en base) reste hors de Vue.
- Pendant la migration, une évolution d'un onglet non encore migré se fait dans l'ancien code.
