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

| Phase | État                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Terminée                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1     | En production : îlot `frontend/src/ilots/tripadvisor/`, 7 scénarios d'écran ajoutés à `09-tripadvisor`                                                                                                                                                                                                                                                                                                                       |
| 2     | Découpée en trois îlots mis en production l'un après l'autre : Reporting, Événements, Administration. Reporting en production (`frontend/src/ilots/reporting/`, scénarios `15-reporting-suivis`). Événements en production (`frontend/src/ilots/evenements/`, scénarios `16-evenements-ecran`) ; carte des événements laissée dans l'ancien code (migration à part). Administration découpée en sous-îlots (voir ci-dessous) |

Sous-îlots de l'Administration, mis en production l'un après l'autre :

| #    | Sous-îlot              | Sections                                                                                               | État                                                                                                                 |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 4a   | Localisations          | Formulaire, liste, import CSV et conflits                                                              | En production (`frontend/src/ilots/admin/localisations/`, scénarios `17-admin-localisations`)                        |
| 4b   | Sécurité et messagerie | SMTP, double authentification, clés d'API publiques, connexion Asana                                   | En production (`frontend/src/ilots/admin/securite/`, trois sous-îlots, scénarios `18-admin-securite`)                |
| 4c-1 | Accès                  | Accès aux applications, accès aux onglets par profil                                                   | En production (`frontend/src/ilots/admin/acces/`, deux sous-îlots, scénarios `19-admin-acces`)                       |
| 4c-2 | Utilisateurs           | Création, liste, modification, mot de passe, TOTP, déconnexion, suppression, détails et journaux       | En production (`frontend/src/ilots/admin/utilisateurs/`, scénarios `20-admin-utilisateurs`)                          |
| 4d   | Paramétrages divers    | Version, inactivité, favicon, aide en ligne, sauvegarde et restauration, thèmes, son des notifications | En production (`frontend/src/ilots/admin/parametrages/`, scénarios `21-admin-parametrages`)                          |
| 4e-1 | Jours spéciaux (.ics)  | Congés scolaires, dates particulières ; formulaire masqué des événements de l'administration supprimé  | En production (`frontend/src/ilots/admin/jours-speciaux/`, scénarios `22-admin-jours-speciaux`)                      |
| 4e-2 | Types d'événements     | Paramétrage des types d'événements, reprise des données des événements                                 | Réalisé (même dossier et mêmes scénarios, sous-îlot `#adminJoursSpeciaux` étendu) ; en attente de mise en production |
| 4f   | Automatisations        | Automatisations 1 à 6                                                                                  | À faire                                                                                                              |

Anomalies relevées pendant la migration (comportement conservé, correction à part) :

- Localisations : à la reprise d'une session (page rechargée), l'ancien code ne charge pas les localisations ; la
  liste « SAMU de rattachement » des ressources reste vide jusqu'à l'ouverture de la section Localisation de
  l'Administration (le sous-îlot conserve ce rechargement à l'ouverture).

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
