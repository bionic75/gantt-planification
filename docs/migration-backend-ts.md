# Migration du serveur vers TypeScript

Le serveur (`backend/`) passe de JavaScript à TypeScript, par lots, sans changement de comportement : l'API, ses
réponses et les traitements restent identiques. Les anomalies que le typage révèle sont notées ci-dessous et ne sont
corrigées que sur décision.

## Principes (décisions du 16/11/2026)

| Sujet                  | Décision                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exécution              | Node 22 exécute directement les fichiers `.ts` (types effacés au chargement) : pas de compilation, même image Docker                                                                        |
| Syntaxe                | Effaçable seulement (`erasableSyntaxOnly`) : ni `enum`, ni `namespace`, ni propriétés de paramètres ; imports avec l'extension `.ts`, `import type` pour les types (`verbatimModuleSyntax`) |
| Rigueur                | `strict` partout, code historique compris ; `any` explicite et commenté là où un typage précis coûterait trop (formats Asana, PowerPoint)                                                   |
| Tests                  | Chaque fichier de test passe en TypeScript dans le même lot que son module                                                                                                                  |
| Scripts d'exploitation | Renommés en `.ts` au lot 3 ; documentation et Dockerfile mis à jour                                                                                                                         |
| Découpage              | Trois lots ; périmètre présenté et validé avant chaque lot                                                                                                                                  |

Pendant la migration, fichiers `.js` et `.ts` coexistent : un fichier JavaScript importe un fichier TypeScript (et
inversement) avec son extension réelle. Les fichiers `.js` marqués `// @ts-check` sont vérifiés avec les mêmes règles.

## Vérifications

- `npm run typecheck:back` : types du serveur (`backend/tsconfig.json`), étape « Backend type check » de la CI ;
- `npm test` : tests du serveur (`.js` et `.ts`) ;
- `npm run lint` : règles TypeScript (`typescript-eslint`) pour `backend/**/*.ts`.

## Lots

| Lot | Périmètre                                                                                                                                                                                                                                                  | État    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Socle (`tsconfig`, types des bibliothèques, vérification en CI, ESLint, Vitest) et infrastructure : `server`, `app`, `routes`, `config/`, `db/`, `lib/`, `middlewares/`, `services/`, `state/`, `jobs/` ; aides et configuration des tests, tests associés | Fait    |
| 2   | Modules sauf l'affectation : admin, auth, astreintes, astreintes-ho, automations, calendar, cra, deplacements, events, locations, logs, notifications, poi, public-api, reporting, resources, schedule, users ; leurs tests                                | À faire |
| 3   | Affectation (dont `asana.service`, `export.service`), scripts d'exploitation (`backend/scripts`), `prisma.config`, finalisation (`allowJs` retiré, annotations JSDoc devenues inutiles supprimées)                                                         | À faire |

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

## Anomalies relevées par le typage

| N°  | Lot | Constat                                                                                                                                                                                                               | Suite                                              |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| T1  | 1   | `sendEmail` (`lib/mailer.ts`) passe l'option `family: 4` (forcer IPv4) au transport SMTP : absente des types de nodemailer et jamais lue par nodemailer 10, elle est sans effet (la résolution essaie IPv4 puis IPv6) | Comportement conservé (option laissée, sans effet) |
