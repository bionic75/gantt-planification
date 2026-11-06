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
  Exception décidée au lot 4.3 : les fenêtres de consultation de la planification lisent à leur ouverture un
  instantané des données de la grille, encore tenue par l'ancien code (`etatPlanning`, liaison), remplacé par un
  magasin Vue au lot 4.5. De même au lot 4.4, la fenêtre des invitations Outlook lit les affectations en attente
  relevées par la grille (`affectationsEnAttente`) et signale les envois (`gp:invitations-envoyees`).
- Les échanges avec l'ancien code passent par le module de liaison (`frontend/src/liaison.ts`) : événements de
  session (session perdue, changement de profil) et de rafraîchissement (planning, référentiels). Il disparaît à
  la phase 6.
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
  `surReouverture` (`frontend/src/ilots/activation.ts`).
- Un onglet trop gros pour un seul îlot est migré par **sous-îlots** : chacun remplace une section de l'onglet (son
  conteneur) et se monte à l'ouverture de l'onglet (`{ chargeur, onglet }` dans `frontend/src/ilots.ts`) ; les
  sections non migrées restent dans l'ancien code.
- Une fenêtre ouverte par un bouton resté dans l'ancien code (en-têtes de la page ou de la planification) est montée à
  sa première demande : le bouton appelle `ouvrirFenetreVue('<nom>')` (`public/js/app/core.js`, événement
  `gp:fenetre-demandee`), la fenêtre est enregistrée dans `FENETRES` (`frontend/src/ilots.ts`) et réagit à chaque
  demande avec `surDemande` (`frontend/src/ilots/fenetres.ts`) ; démontage à la fin de la session.
- `public/js/ui-icons.js` remplace les émojis des textes de la page par des icônes, îlots compris : un nœud texte
  converti n'est plus mis à jour par Vue. Un texte variable contenant un émoji est donc recréé à chaque changement
  (élément avec `:key` sur le texte, comme dans `AppAlert`), ou la partie variable isolée dans son propre élément.
- Bibliothèques installées par npm et intégrées au build (pas de CDN) ; en développement, les dépendances des îlots
  sont déclarées dans `optimizeDeps.include` (`frontend/vite.config.ts`) pour éviter un rechargement de la page.

## Phases

| Phase | Contenu                                                                                                                                                                                              | Taille | Scénarios e2e concernés                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 0     | Préparation : e2e indépendants de l'implémentation, Vite + Vue + TypeScript, intégration serveur, CI, Docker, briques communes                                                                       | M      | tous (non-régression)                                                       |
| 1     | Pilote : onglet SAMU-SAS TripAdVisor                                                                                                                                                                 | S      | `09-tripadvisor`                                                            |
| 2     | Onglets Reporting, Événements (et types d'événements), Administration                                                                                                                                | M      | `08-reporting`, `05-evenements`, `11-administration`, `02-profils-et-acces` |
| 3     | Ressources, CRA (découpé en sous-lots)                                                                                                                                                               | L      | `03-ressources`, `07-cra`                                                   |
| 4     | Planification : grille, vues calendrier, impression, astreintes / HNO                                                                                                                                | L      | `04-planification`                                                          |
| 5     | Applications : Aide à l'affectation, Déplacements, Analyse, **mobile**                                                                                                                               | L      | `06-aide-affectation`, `10-mobile`, `14-non-regression`                     |
| 6     | Cadre de l'application : mire, double authentification, en-tête, connectés et messagerie, inactivité, thèmes, menu Applications ; Vue Router ; retrait de l'ancien code ; CSP sans `'unsafe-inline'` | M      | `01-authentification`, tous                                                 |
| 7     | DSFR (phase distincte, après la migration)                                                                                                                                                           | M      | tous                                                                        |

### Avancement

| Phase | État                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Terminée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1     | En production : îlot `frontend/src/ilots/tripadvisor/`, 7 scénarios d'écran ajoutés à `09-tripadvisor`                                                                                                                                                                                                                                                                                                                                                                                    |
| 2     | Découpée en trois îlots mis en production l'un après l'autre : Reporting, Événements, Administration. Reporting en production (`frontend/src/ilots/reporting/`, scénarios `15-reporting-suivis`). Événements en production (`frontend/src/ilots/evenements/`, scénarios `16-evenements-ecran`) ; carte des événements laissée dans l'ancien code (migration à part). Administration entièrement migrée en sous-îlots (voir ci-dessous) : phase terminée à la mise en production du lot 4g |
| 3     | Ressources puis CRA, chacun découpé en deux lots (voir ci-dessous). Ressources entièrement migrées (lot 3b en production). CRA : circuit (lot 3c) et administration et vue RH (lot 3d) en production : phase terminée                                                                                                                                                                                                                                                                     |
| 4     | Découpée en six lots mis en production l'un après l'autre (voir ci-dessous) : onglet Astreintes (4.1 HO, 4.2 HNO), fenêtres de consultation (4.3), fenêtres de saisie et de notification (4.4), grille (4.5), exports, impressions et clôture (4.6)                                                                                                                                                                                                                                       |

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

| #   | Lot                                   | Contenu                                                                                                                                                                                                                                                                                                   | État                                                                                                                               |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Astreintes HO                         | Rubrique « Gestion des astreintes HO » : droits, navigation, inscriptions sur les demi-journées, astreinte HO ANS (un ou plusieurs utilisateurs par jour), enregistrement et e-mail de mise à jour ; `astreintes-ho.js` supprimé                                                                          | En production (`frontend/src/ilots/astreintes/`, sous-îlot `#astreintesHo`, scénarios `27-astreintes-ho`)                          |
| 4.2 | Astreintes HNO                        | Volontaires, disponibilités (règles FPH), génération du planning (scénario `@destructif` : campagne destructive de la CI seulement), changement d'expert, export, planning actuel ; onglet Astreintes entièrement migré (`astreintes.js` supprimé)                                                        | En production (îlot d'onglet `#astreintesGestion` remplaçant le sous-îlot HO, scénarios `28-astreintes-hno` et `27-astreintes-ho`) |
| 4.3 | Fenêtres de consultation              | Calendrier mensuel, calendrier des congés et événements, leurs impressions, recherche avancée (dates proposées corrigées) ; `search.js` supprimé, `calendar-views.js` réduit aux notifications (lot 4.4)                                                                                                  | En production (`frontend/src/ilots/consultation/`, fenêtres montées à la demande, scénarios `29-planification-consultation`)       |
| 4.4 | Fenêtres de saisie et de notification | « Gérer mes astreintes/HNO », demande d'affectation, invitations Outlook (sans envoi dans les e2e), nouvelles affectations de l'expert ; `hno.js`, `assignment-request.js` et `calendar-views.js` supprimés, `assignment-notifications.js` réduit au suivi des affectations de la grille et à la pastille | Réalisé (`frontend/src/ilots/saisie/`, scénarios `30-planification-saisie`) ; en attente de mise en production                     |
| 4.5 | Grille                                | Options d'affichage, légende, grille, navigation, zoom, lignes masquées, saisie des demi-journées, menu contextuel des astreintes / HNO (saisie de l'îlot CRA réutilisée), enregistrement                                                                                                                 | À faire                                                                                                                            |
| 4.6 | Exports, impressions et clôture       | Téléchargement CSV / Excel, impression A4, calendrier d'une ressource ; derniers fichiers supprimés                                                                                                                                                                                                       | À faire                                                                                                                            |

Duplication temporaire (lot 3c, jusqu'à la migration de la planification, phase 4) : la saisie des astreintes / HNO du
menu contextuel du Gantt garde une copie réduite de l'ancienne saisie du CRA (`public/js/app/particularites.js`,
fenêtre `#ganttAstreinteModal`), sans la collecte ni le report vers la planification, propres au CRA.

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
