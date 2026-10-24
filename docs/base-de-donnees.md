# Base de données

Le schéma est géré par **Prisma** et des **migrations** versionnées. Trois bases sont prévues :
SQLite (par défaut), PostgreSQL et MariaDB/MySQL.

> PostgreSQL et MariaDB ne sont pas encore utilisables : une partie du code accède encore directement à
> SQLite. Ils le seront à la fin du passage à Prisma. Leurs migrations sont déjà vérifiées par la CI.

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

En CI, les migrations sont appliquées sur une vraie base PostgreSQL ou MariaDB seulement si la variable du dépôt
`DB_PROVIDER` (Settings › Secrets and variables › Actions › Variables) vaut `postgresql` ou `mysql` : le fournisseur
utilisé en production. La base de test utilise alors les secrets du dépôt `CI_DB_USER` et `CI_DB_PASSWORD`.
Sans cette variable (SQLite), seuls les tests tournent.

Le client Prisma est généré pour un seul fournisseur. Il est généré à l'installation (`npm install`, script
`postinstall`) d'après `DB_PROVIDER`. Après un changement de fournisseur : `npm run db:generate`.

## Commandes

| Commande                        | Usage                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run db:migrate`            | Applique les migrations en attente. Lancée par `npm start` et l'image Docker avant le serveur |
| `npm run db:adopt`              | Adoption, une seule fois, d'une base SQLite créée par l'ancienne version                      |
| `npm run db:migration -- <nom>` | Crée une migration pour les trois fournisseurs après une modification du schéma               |
| `npm run db:schemas`            | Régénère les schémas des trois fournisseurs depuis le schéma source                           |
| `npm run db:generate`           | Régénère le client Prisma                                                                     |

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

Procédure (Docker) :

```bash
# 1. Vérification sans modification : rapport et script de conversion
docker compose run --rm <service> npm run db:adopt -- --dry-run

# 2. Adoption
docker compose run --rm <service> npm run db:adopt

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
- MariaDB/MySQL : les textes sont en `LONGTEXT`, sauf les colonnes indexées (`VARCHAR(191)`).
