# Architecture

Application web de planification des ressources : serveur Node.js (Express) et base de données gérée par Prisma,
interface en HTML / JavaScript servie par le même serveur, en cours de migration vers Vue 3
([migration-vue.md](migration-vue.md)).

| Élément         | Technologie                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| Serveur         | Node.js 22, Express 4, modules ES                                                   |
| Base de données | Prisma 7 : SQLite (défaut), PostgreSQL ou MariaDB ([détails](base-de-donnees.md))   |
| Interface       | HTML, CSS et JavaScript « classique » dans `public/` ; îlots Vue 3 dans `frontend/` |
| PDF             | Chromium piloté par Puppeteer (CRA, export du planning) ; LibreOffice (PPTX → PDF)  |
| Emails          | Nodemailer, file d'attente en base                                                  |
| Tests           | Vitest (API par HTTP, interface dans Chromium)                                      |

## Arborescence

```
server.js              point d'entrée : base, données initiales, application, tâches de fond, écoute HTTP
src/
  app.js               application Express : middlewares communs, routes /api, pages, fichiers statiques
  routes.js            routeur /api : un sous-routeur par module
  config/              configuration (env.js : variables d'environnement validées au démarrage)
  db/                  client Prisma, sessions en base, données initiales, conversions de valeurs
  middlewares/         contrôle d'accès, CSRF, limitation des tentatives, gestion des erreurs
  modules/<module>/    fonctionnalités : routes, contrôleurs, services, emails (voir ci-dessous)
  services/            services transverses : paramètres, journal des actions, file d'emails
  lib/                 utilitaires : erreurs HTTP, mots de passe, échappement HTML, emails, ICS, Puppeteer
  jobs/scheduler.js    tâches planifiées (cron)
  state/sessions.js    suivi en mémoire des utilisateurs connectés
  generated/prisma/    client Prisma généré (non versionné)
prisma/                schéma source (schema.base.prisma), schémas et migrations par base
scripts/               commandes d'exploitation (migrations, adoption, transfert, sauvegarde, inventaire des routes)
public/                interface (voir « Frontend »)
frontend/              îlots Vue 3 / TypeScript (voir « Interface Vue ») ; build dans dist/frontend (non versionné)
tests/                 tests automatisés
e2e/                   tests de bout en bout (Playwright BDD, voir e2e/README.md)
docs/                  documentation
```

## Démarrage du serveur

`server.js` : connexion à la base, vérification de l'encodage (PostgreSQL) et des migrations appliquées (sinon
arrêt avec le message « npm run db:migrate »), données initiales (`src/db/seed.js` : compte `admin`, paramètres,
types d'événements), configuration SMTP enregistrée, construction de l'application, routes de sauvegarde
(`scripts/db-dump.js`), démarrage de la file d'emails et des tâches planifiées, écoute sur `PORT`.

`npm start` et l'image Docker appliquent d'abord les migrations en attente (`scripts/db-migrate.mjs`).

## Traitement d'une requête

Ordre des middlewares (`src/app.js`) :

1. proxy de confiance (`TRUST_PROXY`), en-têtes de sécurité (helmet, CSP) ;
2. refus des modifications venant d'un autre site (CSRF) ; CORS ouvert pour `/api/public` seulement ;
3. blocage pendant une restauration de sauvegarde ; journal de la requête (secrets masqués) ;
4. session (cookie `gantt.sid`, stockée en base) ;
5. lecture du corps JSON (100 Ko sans session, 50 Mo connecté) ;
6. routes `/api` des modules, pages (`/aide.html`, redirections des anciennes adresses) ;
7. interface Vue sous `/vue/` (build ou serveur Vite), `index.html` avec le point d'entrée des îlots, fichiers
   statiques de `public/`, page mobile, `index.html` pour toute autre adresse ;
8. gestionnaire d'erreurs.

Détails des protections : [securite.md](securite.md). Liste des routes : [api.md](api.md).

## Modules

Un dossier par fonctionnalité dans `src/modules/` : `auth` (connexion, double authentification, mot de passe
oublié), `users`, `resources`, `schedule` (planning), `events`, `astreintes` (astreintes HNO), `astreintes-ho` (planning des astreintes HO et automatisations n°5 et n°6), `cra` (comptes rendus d'activité),
`deplacements`, `locations`, `poi`, `calendar`, `notifications`, `automations`, `reporting`, `logs`, `admin`,
`affectation` (application d'aide à l'affectation, Asana, exports, rétroplanning des ateliers métier), `public-api`.

Organisation d'un module :

| Fichier                  | Rôle                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `<module>.routes.js`     | routes et contrôle d'accès (`requireAuth`, `requireAdmin`…)                        |
| `<module>.controller.js` | lecture de la requête, appel du service, réponse ; journal des actions utilisateur |
| `<module>.service.js`    | règles métier et accès à la base (Prisma)                                          |
| `<module>.emails.js`     | modèles d'emails (données échappées avec `escapeHtml`)                             |
| autres                   | traitements propres au module (PDF, tâches planifiées, services externes…)         |

Conventions :

- erreurs métier : `throw badRequest('…')`, `notFound(…)`… (`src/lib/http-error.js`), renvoyées au client avec leur
  statut ; toute autre erreur est journalisée et masquée (500 « Erreur interne du serveur ») ;
- contrôleurs asynchrones enveloppés par `asyncHandler` (`h(...)` dans les fichiers de routes) ;
- paramètres de l'application : `getSetting` / `setSetting` (`src/services/settings.js`) ;
- dates et heures en chaînes (`AAAA-MM-JJ`, `AAAA-MM-JJ HH:MM:SS` UTC), booléens `0` / `1` (schéma historique) ;
- vérification de types JSDoc (`// @ts-check`) ; commentaires en français ;
- après l'ajout ou la modification d'une route : `npm run routes` (inventaire des tests et [api.md](api.md)).

## Tâches de fond

| Tâche                                | Fréquence                        | Code                                     |
| ------------------------------------ | -------------------------------- | ---------------------------------------- |
| Sauvegarde des plannings par email   | toutes les heures (selon config) | `automations.jobs.js` (automatisation 2) |
| Rappels de saisie des disponibilités | chaque jour à 8 h (Europe/Paris) | `automations.jobs.js` (automatisation 1) |
| Relances des CRA                     | chaque jour à 8 h                | `cra.automation.js` (automatisation 4)   |
| Envoi des emails en file d'attente   | toutes les 1,5 s                 | `src/services/email-queue.js`            |
| Purge des sessions expirées          | toutes les 15 min                | `src/db/session-store.js`                |

Les emails sont mis en file (table `email_queue`) puis envoyés en arrière-plan, avec nouvelles tentatives ; l'état
d'un envoi groupé est consultable (`/api/email-queue/status/:batchId`).

## Frontend

Pages servies par Express depuis `public/` :

| Page          | Rôle                                                                             | Scripts et styles                     |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| `index.html`  | application principale                                                           | `js/app/*.js`, `js/*.js`, `css/*.css` |
| `mobile.html` | version mobile (`/mobile` sur un téléphone)                                      | `js/mobile/*.js`, `css/mobile.css`    |
| `aide.html`   | aide en ligne et historique des versions (personnalisable dans l'administration) | `css/aide.css`                        |

`public/js/app/` contient le code de l'application principale découpé par domaine (`core.js` : connexion et
session ; `planning.js`, `cra.js`, `deplacements.js`, `astreintes.js`…). Ce sont des **scripts classiques** qui
partagent leur portée globale :

- ils sont chargés dans un ordre fixe, celui des balises `<script>` de `index.html` ; une variable ou une fonction
  est utilisable par les fichiers suivants et par les attributs `onclick="…"` du HTML ;
- du code exécuté au chargement (hors fonctions et gestionnaires d'événements) ne peut appeler qu'une fonction
  déclarée dans le même fichier ou dans un fichier précédent ;
- un nouveau fichier s'ajoute par une balise `<script src="/js/app/<nom>.js?v=…">` à sa place dans l'ordre.

`public/js/` contient les scripts autonomes (thèmes, mode sombre, icônes, application d'aide à l'affectation,
types d'événements, frise cartographique), `public/css/` les feuilles de style, `public/img/` les images
(icônes d'onglet au choix dans l'administration, logos ; le logo ANS est aussi joint aux emails). Les anciennes
adresses à la racine (`/ui-icons.js`, `/login.css`, `/favicon-….svg`…) redirigent vers ces répertoires. Les
bibliothèques externes (Leaflet, SheetJS) sont chargées depuis leur CDN, autorisé par la politique de contenu.

Version et cache : le commentaire `<!-- vX.Y.Z -->` en tête de `index.html` est la version affichée, et le paramètre
`?v=X.Y.Z` des scripts force les navigateurs à recharger les fichiers modifiés. Les deux sont mis à jour par
`npm run app:version -- X.Y.Z` ([déploiement](deploiement.md#publier-une-version)).

### Interface Vue

Les écrans sont migrés un par un vers Vue 3 + TypeScript ([plan et règles](migration-vue.md)). Chaque écran migré
est un **îlot** : un composant monté dans le conteneur de son onglet de `index.html`, à la première ouverture de
l'onglet, à la place de l'ancien code.

| Élément                         | Rôle                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/ilots.ts`         | point d'entrée : registre des îlots (onglet → composant ; section d'onglet → composant et onglet pour un sous-îlot), variables CSS (`styles/theme.css`)                                                                                                                                                              |
| `frontend/src/ilots/montage.ts` | montage à l'activation de l'onglet, signal de réouverture (`activation.ts`), démontage et magasins neufs à la déconnexion                                                                                                                                                                                            |
| `frontend/src/ilots/<îlot>/`    | écran migré : composants, magasin Pinia, mises en forme (ex. `tripadvisor/`)                                                                                                                                                                                                                                         |
| `frontend/src/composants/`      | composants communs `App*` (bouton, champs, étiquette, fenêtre, confirmation, alerte, notes)                                                                                                                                                                                                                          |
| `frontend/src/liaison.ts`       | événements échangés avec l'ancien code (`gp:session-terminee`, `gp:session-perdue`, `gp:evenements-modifies`, `gp:planning-modifie`, `gp:localisations-modifiees`, `gp:types-evenements-modifies`, `gp:applications-modifiees`, `gp:onglets-modifies`) ; écouteurs côté ancien code : fin de `public/js/app/core.js` |
| `frontend/src/api/`             | appels `/api` typés (`client.ts`, un fichier par module : `poi.ts`…) ; une réponse 401 signale la session perdue à l'ancien code                                                                                                                                                                                     |
| `frontend/src/stores/`          | magasins Pinia partagés par les îlots (session…)                                                                                                                                                                                                                                                                     |
| `src/lib/frontend.js` (serveur) | service de l'interface selon l'environnement et insertion du point d'entrée dans la page                                                                                                                                                                                                                             |

Îlots en service : **SAMU-SAS TripAdVisor** (`#tripadvisor`), **Reporting** (`#reporting`), **Événements**
(`#evenements`), et dans l'onglet Administration les sous-îlots **Localisations** (`#adminLocalisations`),
**Configuration Email (SMTP)** (`#adminSmtp`), **Authentification à deux facteurs** (`#adminMfa`), **Gestion des
API** (`#adminApi`), **Accès aux applications** (`#adminApplications`) et **Accès aux onglets** (`#adminOnglets`) :
sections montées à l'ouverture de l'onglet (composant commun `AppSectionAdmin`), les autres
restent dans l'ancien code. Les bibliothèques de l'interface
Vue (Leaflet…) sont intégrées au build, sans CDN.

Selon `NODE_ENV` :

- `production` : build `dist/frontend` (`npm run build:front`) servi sous `/vue/`, fichiers à empreinte mis en cache
  un an ; le serveur refuse de démarrer sans build. L'image Docker le construit dans une étape séparée ;
- `development` (défaut) : serveur Vite intégré à Express (compilation à la volée, rechargement à chaud sur le port
  24678, autorisé par la CSP en développement seulement) ;
- `test` : build s'il existe, sinon page sans îlots.

## Tests

`npm test` lance Vitest. Les tests sont « boîte noire » : chaque fichier démarre un vrai serveur (processus séparé,
base temporaire) et l'interroge par HTTP ; ils restent valables quelle que soit l'organisation interne du code.

| Élément                        | Rôle                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `tests/helpers/server.js`      | démarrage, redémarrage et arrêt d'un serveur de test                              |
| `tests/helpers/fixtures.js`    | création de comptes, ressources, experts ; connexion                              |
| `tests/helpers/smtp-sink.js`   | serveur SMTP de test (emails reçus inspectables)                                  |
| `tests/access-control.test.js` | protection de chaque route de l'inventaire (`tests/fixtures/routes.json`)         |
| `tests/ui.test.js`             | interface dans Chromium : connexion, onglets, page mobile, sans erreur JavaScript |

Les tests PDF et interface utilisent un Chrome / Chromium / Edge installé (sinon ils sont ignorés ;
`TEST_BROWSER_PATH` pour en indiquer un). Tests sur PostgreSQL ou MariaDB : [base-de-donnees.md](base-de-donnees.md#tests-et-ci).

Interface Vue : tests unitaires des composants et magasins (`frontend/src/**/*.test.ts`, Vitest + jsdom,
`npm run test:front`). Parcours métier de bout en bout : `e2e/` (Playwright BDD, [README](../e2e/README.md)),
indépendants de l'implémentation de l'interface ; ils valident chaque îlot migré.

## Commandes

| Commande                          | Usage                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| `npm start` / `npm run dev`       | migrations puis serveur (`dev` : redémarrage à chaque modification)  |
| `npm test`                        | tests                                                                |
| `npm run build:front`             | build de l'interface Vue (`dist/frontend`)                           |
| `npm run test:front`              | tests unitaires de l'interface Vue                                   |
| `npm run typecheck:front`         | vérification des types de l'interface Vue (vue-tsc)                  |
| `npm run lint` / `npm run format` | ESLint / Prettier (`format:check` en CI)                             |
| `npm run routes`                  | inventaire des routes et [api.md](api.md)                            |
| `npm run app:version -- X.Y.Z`    | version de l'application                                             |
| `npm run db:*`                    | base de données : [base-de-donnees.md](base-de-donnees.md#commandes) |
