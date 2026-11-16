# Migration du serveur vers TypeScript

Le serveur (`backend/`) est passé de JavaScript à TypeScript en trois lots (migration terminée le 16/11/2026), sans
changement de comportement : l'API, ses réponses et les traitements restent identiques. Les anomalies que le typage a
révélées sont notées ci-dessous et ne sont corrigées que sur décision.

## Principes (décisions du 16/11/2026)

| Sujet                  | Décision                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exécution              | Node 22 exécute directement les fichiers `.ts` (types effacés au chargement) : pas de compilation, même image Docker                                                                                                                                                                                               |
| Syntaxe                | Effaçable seulement (`erasableSyntaxOnly`) : ni `enum`, ni `namespace`, ni propriétés de paramètres ; imports avec l'extension `.ts`, `import type` pour les types (`verbatimModuleSyntax`)                                                                                                                        |
| Rigueur                | `strict` partout, code historique compris ; `any` explicite là où un typage précis coûterait trop : formats Asana et PowerPoint, réponses des services externes, configurations JSON enregistrées, réponses de l'API dans les tests (règle ESLint `no-explicit-any` désactivée pour le serveur, comme pour `e2e/`) |
| Tests                  | Chaque fichier de test passe en TypeScript dans le même lot que son module                                                                                                                                                                                                                                         |
| Scripts d'exploitation | Renommés en `.ts` au lot 3 ; documentation et Dockerfile mis à jour                                                                                                                                                                                                                                                |
| Découpage              | Trois lots ; périmètre présenté et validé avant chaque lot                                                                                                                                                                                                                                                         |

Le backend ne contient plus de JavaScript (`allowJs` retiré) : serveur, modules, scripts d'exploitation, tests et
configurations (`prisma.config.ts`, `vitest.config.ts`) sont en TypeScript, vérifiés avec `strict`.

## Vérifications

- `npm run typecheck:back` : types du serveur (`backend/tsconfig.json`), étape « Backend type check » de la CI ;
- `npm test` : tests du serveur (`backend/tests/**/*.test.ts`) ;
- `npm run lint` : règles TypeScript (`typescript-eslint`) pour `backend/**/*.ts`.

## Lots

| Lot | Périmètre                                                                                                                                                                                                                                                  | État |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Socle (`tsconfig`, types des bibliothèques, vérification en CI, ESLint, Vitest) et infrastructure : `server`, `app`, `routes`, `config/`, `db/`, `lib/`, `middlewares/`, `services/`, `state/`, `jobs/` ; aides et configuration des tests, tests associés | Fait |
| 2   | Modules sauf l'affectation : admin, auth, astreintes, astreintes-ho, automations, calendar, cra, deplacements, events, locations, logs, notifications, poi, public-api, reporting, resources, schedule, users ; leurs tests                                | Fait |
| 3   | Affectation (dont `asana.service`, `export.service`), scripts d'exploitation (`backend/scripts`), `prisma.config`, finalisation (`allowJs` retiré, annotations JSDoc devenues inutiles supprimées)                                                         | Fait |

### Lot 1 : socle et infrastructure

- `backend/server.js` devient `backend/server.ts` : `npm start`, `npm run dev`, le `CMD` du Dockerfile et le job e2e de
  la CI lancent `node backend/server.ts`.
- Types des bibliothèques en dépendances de développement (versions exactes) : Express 4, express-session, cors,
  nodemailer, better-sqlite3, bcrypt, qrcode, Node 22.
- Bibliothèque standard déclarée : ES2024, assistants d'itérateurs et opérations d'ensembles (disponibles dans Node 22,
  déjà utilisés par le code).
- Modèles Prisma utilisés comme types (ex. `EmailQueue` pour la file d'emails).
- Modules encore en JavaScript : une vingtaine d'annotations JSDoc corrigées pour que la vérification passe (types de
  tableaux, conversions explicites), sans changement de code exécuté.

### Lot 2 : modules hors affectation

- 74 fichiers de modules et 27 fichiers de tests passés en TypeScript ; annotations JSDoc converties en types
  TypeScript (paramètres, conversions, définitions de types), puis retirées.
- Code historique typé à son tour : `cra.documents` (documents et PDF des CRA : types `LigneCra`, `SignatureCra`,
  `CraDocument`), `poi.external` (géocodage et itinéraires, `// @ts-nocheck` retiré ; réponses des services externes en
  `any`), `admin.service` (accès aux onglets, thèmes).
- Tests : serveur, clients et serveur SMTP de test typés (`TestServer`, `Client`, `SmtpSink`) ; réponses JSON de l'API
  en `any`.

### Lot 3 : affectation, scripts d'exploitation, finalisation

- Module affectation (15 fichiers) et ses tests en TypeScript. Code historique typé : `asana.service` (réponses de l'API
  Asana en `any`, `asanaApi` renvoie `Promise<any>`) et `export.service` (modèle PowerPoint lu avec JSZip en `any`,
  formes et diapositives typées) ; ils restent dans la liste ESLint du code historique (règles de style assouplies).
- Scripts d'exploitation renommés en `.ts` (`db-migrate`, `db-adopt`, `db-transfer`, `db-dump`, `db-common`,
  `create-migration`, `build-prisma-schemas`, `routes`, `set-version`, `icones-mail`) ; `prisma.config.ts`. Les
  commandes `npm run …` sont inchangées ; un lancement direct devient `node backend/scripts/<script>.ts` (Docker :
  `docker compose run --rm <service> node backend/scripts/db-adopt.ts`).
- Finalisation : `allowJs` retiré, tests `.ts` seulement, annotations JSDoc de type supprimées (descriptions gardées).
- Seuls changements de forme du code exécuté : une expression à virgule écrite en bloc (`affectation.service`,
  `extra.push(…)` puis l'état de la demi-journée) ; nom du fichier d'un dump lu comme texte (`String(…)`) avant décodage,
  comme le faisait déjà `decodeURIComponent`.

## Anomalies relevées par le typage

| N°  | Lot | Constat                                                                                                                                                                                                               | Suite                                                                |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| T1  | 1   | `sendEmail` (`lib/mailer.ts`) passe l'option `family: 4` (forcer IPv4) au transport SMTP : absente des types de nodemailer et jamais lue par nodemailer 10, elle est sans effet (la résolution essaie IPv4 puis IPv6) | Comportement conservé (option laissée, sans effet)                   |
| T2  | 3   | `affRenderPages` (`export.service`) lance Chromium avec `headless: 'new'`, valeur retirée de Puppeteer (≥ 22 : `true` ou `'shell'`) ; Puppeteer la traite comme `true` (nouveau mode sans interface)                  | Comportement conservé (valeur laissée, conversion de type commentée) |
