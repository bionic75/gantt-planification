# Base de données

Le schéma est géré par **Prisma** et des **migrations** versionnées. Trois bases sont possibles :
SQLite (par défaut), PostgreSQL (16 ou plus) et MariaDB (10.10 ou plus).

## Configuration

| Variable                 | Rôle                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| `DB_PROVIDER`            | `sqlite` (défaut), `postgresql` ou `mysql`                                |
| `DB_HOST`, `DB_NAME`     | Hors SQLite : serveur et nom de la base                                   |
| `DB_PORT`                | Hors SQLite : port (défaut 5432 pour PostgreSQL, 3306 pour MariaDB)       |
| `DB_USER`, `DB_PASSWORD` | Hors SQLite : identifiants (secrets), encodés automatiquement dans l'URL  |
| `DATABASE_URL`           | URL de connexion complète, prioritaire sur les variables `DB_*` ci-dessus |
| `DB_PATH`                | SQLite : répertoire du fichier `data.db` (défaut `./data`)                |

Les secrets (`SESSION_SECRET`, `DB_USER`, `DB_PASSWORD`) sont listés dans `.env.example`.

Le client Prisma est généré pour un seul fournisseur. Il est généré à l'installation (`npm install`, script
`postinstall`) d'après `DB_PROVIDER`. Après un changement de fournisseur : `npm run db:generate`. L'image Docker
reçoit le fournisseur en argument de construction (`docker build --build-arg DB_PROVIDER=postgresql`) ; les
workflows GitHub le prennent dans la variable du dépôt `DB_PROVIDER`.

## Créer la base PostgreSQL ou MariaDB

La base est créée vide, une seule fois ; les tables sont créées par les migrations au démarrage. Les textes
sont triés selon les règles françaises (accents, majuscules) :

```sql
-- PostgreSQL : encodage UTF-8 obligatoire (vérifié au démarrage), tri fr-FR
CREATE DATABASE planning ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'fr-FR' LOCALE 'C' TEMPLATE template0;
CREATE USER planning WITH PASSWORD '…';
ALTER DATABASE planning OWNER TO planning;

-- MariaDB 10.10 ou plus (collation utf8mb4_uca1400_ai_ci des tables)
CREATE DATABASE planning CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
CREATE USER 'planning'@'%' IDENTIFIED BY '…';
GRANT ALL PRIVILEGES ON planning.* TO 'planning'@'%';
```

## Passer une installation SQLite à PostgreSQL ou MariaDB

`npm run db:transfer -- --from=<data.db>` copie toutes les données d'une base SQLite vers la base configurée
(`DB_PROVIDER` et connexion). La source et la cible doivent être au même niveau de migrations ; la cible doit être
vide (ou `--replace` pour remplacer son contenu). Les nombres de lignes sont vérifiés table par table.

1. Arrêter l'application et copier `data.db` (ainsi que `data/pdfs/`, les PDF des CRA).
2. Si la base vient de l'ancienne version : `npm run db:adopt` puis `npm run db:migrate` **sur la copie**
   (`DB_PATH` pointant sur son répertoire, `DB_PROVIDER=sqlite`).
3. Créer la base cible (paragraphe précédent), puis, avec la configuration cible : `npm run db:migrate`.
4. `npm run db:transfer -- --from=<copie>/data.db` (même version de l'application que l'étape 2).
5. Copier les PDF dans le `data/pdfs/` du nouveau serveur, puis démarrer l'application.

Le client Prisma doit être généré pour la cible (`DB_PROVIDER=postgresql npm run db:generate`) ; la lecture
de la source SQLite n'en a pas besoin.

## Tests et CI

`npm test` utilise SQLite. Pour les lancer sur PostgreSQL ou MariaDB (une base créée puis supprimée par serveur de
test, d'où une connexion autorisée à créer des bases) :

```bash
DB_PROVIDER=postgresql npm run db:generate
TEST_DB_PROVIDER=postgresql TEST_DATABASE_URL=postgresql://planning:…@localhost:5432/postgres npm test
# MariaDB : DB_PROVIDER=mysql, TEST_DB_PROVIDER=mysql, TEST_DATABASE_URL=mysql://root:…@localhost:3306/mysql
```

Les tests propres à SQLite (adoption, sauvegarde `.gpdump`) sont alors ignorés ; le test du transfert ne tourne
qu'hors SQLite.

En CI, les migrations et les tests tournent sur une vraie base PostgreSQL ou MariaDB seulement si la variable du
dépôt `DB_PROVIDER` (Settings › Secrets and variables › Actions › Variables) vaut `postgresql` ou `mysql` : le
fournisseur utilisé en production. La base de test utilise alors les secrets du dépôt `CI_DB_USER` et
`CI_DB_PASSWORD` (MariaDB : aussi mot de passe de `root`). Sans cette variable (SQLite), seuls les tests SQLite
tournent.

Les fins de ligne sont forcées en LF (`.gitattributes`) : l'empreinte des fichiers de migration, enregistrée dans
`_prisma_migrations`, doit être identique sur tous les postes. Après l'ajout de `.gitattributes`, une fois :
`git add --renormalize .`.

## Commandes

| Commande                                  | Usage                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run db:migrate`                      | Applique les migrations en attente. Lancée par `npm start` et l'image Docker avant le serveur |
| `npm run db:adopt`                        | Adoption, une seule fois, d'une base SQLite créée par l'ancienne version                      |
| `npm run db:transfer -- --from=<data.db>` | Copie les données d'une base SQLite vers la base PostgreSQL / MariaDB configurée              |
| `npm run db:migration -- <nom>`           | Crée une migration pour les trois fournisseurs après une modification du schéma               |
| `npm run db:schemas`                      | Régénère les schémas des trois fournisseurs depuis le schéma source                           |
| `npm run db:generate`                     | Régénère le client Prisma                                                                     |

## Mettre à jour une installation existante (base SQLite de l'ancienne version)

Les versions précédentes créaient les tables au démarrage, sans historique de migrations. Au premier démarrage
de la nouvelle version, `npm run db:migrate` refuse une telle base et demande de l'**adopter**. L'adoption :

1. sauvegarde la base dans `DB_PATH/backups/pre-migrations-<date>.db` ;
2. vérifie qu'aucune donnée ne sera perdue. Elle s'arrête si la base contient une table ou une colonne
   inconnue du schéma ;
3. reconstruit chaque table selon la migration initiale et copie les données. Les clés étrangères déclarées
   par les anciennes tables sont retirées : l'application ne les a jamais appliquées ;
4. marque la migration initiale comme appliquée, puis vérifie qu'il ne reste aucun écart et qu'aucune ligne
   n'a été perdue.

Procédure (Docker ; l'image ne contient pas npm : les scripts se lancent avec `node`) :

```bash
# 1. Vérification sans modification : rapport et script de conversion
docker compose run --rm <service> node scripts/db-adopt.mjs --dry-run

# 2. Adoption
docker compose run --rm <service> node scripts/db-adopt.mjs

# 3. Démarrage normal (les migrations suivantes sont appliquées automatiquement)
docker compose up -d
```

Si l'adoption signale une **table inconnue** :

- s'il s'agit d'un reste d'une ancienne migration (par exemple `resources_new`) et que son contenu est inutile,
  relancer avec `-- --drop-tables=<table>` ;
- sinon, l'ajouter au schéma avant l'adoption.

Une **colonne inconnue** doit être ajoutée au schéma.

En cas de problème, la sauvegarde de l'étape 1 se restaure en remplaçant `data.db` par ce fichier, sans autre
manipulation.

## Sauvegarde et restauration

**SQLite** : l'administration de l'application propose une sauvegarde complète (`/api/admin/dump`, code dans
`scripts/db-dump.js`). Le fichier `.gpdump` contient une copie cohérente de la base et les PDF des CRA.

- La restauration remplace toutes les données, après une sauvegarde de sécurité dans
  `<DB_PATH>/restore-backups/`. L'historique des migrations (`_prisma_migrations`) du serveur est conservé : la
  base restaurée reste au schéma de l'application, même depuis une sauvegarde plus ancienne. Les colonnes absentes
  de la sauvegarde prennent leur valeur par défaut.
- Les sauvegardes faites par l'ancienne version de l'application sont acceptées.
- Par défaut, la configuration SMTP et la file d'attente des emails sont neutralisées (restauration sur un serveur
  de test).

**PostgreSQL / MariaDB** : ces routes répondent « non disponible » (501). Utiliser les outils de la base :

```bash
pg_dump -Fc "$DATABASE_URL" > planning.dump          # restauration : pg_restore --clean -d "$DATABASE_URL" planning.dump
mysqldump --single-transaction planning > planning.sql   # restauration : mysql planning < planning.sql
```

Les PDF des CRA (`data/pdfs/`) sont à sauvegarder à part.

## Modifier le schéma

1. Modifier **`prisma/schema.base.prisma`**, le schéma source commun aux trois fournisseurs. Les fichiers
   `prisma/<fournisseur>/schema.prisma` sont générés : ne pas les modifier.
2. `npm run db:migration -- <nom_en_snake_case>` génère `prisma/<fournisseur>/migrations/<date>_<nom>/migration.sql`
   pour chaque fournisseur, sans base de données.
3. Relire les trois scripts SQL, et les compléter si besoin (reprise de données, valeurs par défaut).
4. `npm test`. La CI applique aussi les migrations sur le fournisseur utilisé en production (variable `DB_PROVIDER`).

### Conventions du schéma de départ

Le schéma de départ reproduit la base historique, pour que les réponses de l'API restent identiques :

- les tables et colonnes gardent leur nom (`snake_case`). Les modèles Prisma sont au singulier
  (`users` → `User`) ;
- les dates et heures sont des **chaînes** (`AAAA-MM-JJ`, `AAAA-MM-JJ HH:MM:SS` en UTC, `HH:MM`).
  L'horodatage par défaut a le même format sur les trois bases ;
- les booléens restent des entiers `0` / `1` ;
- **aucune clé étrangère en base** (`relationMode = "prisma"`). Les relations sont déclarées dans le schéma au
  fur et à mesure de la réécriture des modules, avec le comportement à la suppression de l'application
  actuelle. Elles ne modifient pas la base ;
- MariaDB/MySQL : les textes sont en `LONGTEXT`, sauf les colonnes indexées (`VARCHAR(191)`) et les horodatages
  (`VARCHAR(32)`). Collation `utf8mb4_uca1400_ai_ci`, substituée par `db:migration` à celle choisie par Prisma.
