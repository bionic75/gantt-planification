# Déploiement et exploitation

## Vue d'ensemble

```
tag vX.Y.Z ──► GitHub Actions ──► image Docker (ghcr.io) ──► VM : docker compose up
                (build, analyse Trivy, push)        (.env réécrit depuis les secrets GitHub)
```

L'application tourne dans un conteneur Docker sur la VM « SAMU Tools », dans `~/samu/planif-ressources/`.
Au démarrage, le conteneur applique les migrations de base en attente puis lance le serveur.

## Image Docker

`Dockerfile` : Node 22 (Alpine) avec Chromium (génération des PDF), dépendances de production, client Prisma généré
pour la base choisie (argument `DB_PROVIDER`, `sqlite` par défaut). L'application tourne avec l'utilisateur `node`
(uid 1000) et écoute sur le port `PORT` (3000 par défaut).

| Répertoire du conteneur | Contenu                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `/app/data`             | base SQLite (`data.db`), PDF des CRA (`pdfs/`), sauvegardes, clé Asana |
| `/app/config`           | `config.json` (ancien emplacement du réglage `DB_PATH`)                |

## Sur la VM

`~/samu/planif-ressources/` contient :

- `docker-compose.yml` : copie de celui du dépôt. **Il n'est pas déployé par les workflows** : le recopier sur la VM
  quand il change ;
- `.env` : réécrit à chaque déploiement depuis les secrets GitHub (ne pas le modifier à la main) ;
- les données, dans `$APP_DATA_PATH/data` et `$APP_DATA_PATH/config` (montés dans le conteneur).

Les répertoires de données doivent appartenir à l'utilisateur du conteneur (une fois, à l'installation ou avant le
premier déploiement d'une version qui tourne sans root) :

```bash
sudo chown -R 1000:1000 "$APP_DATA_PATH/config" "$APP_DATA_PATH/data"
```

Le port 8080 de la VM est relié au port 3000 du conteneur. HTTPS est assuré devant l'application par un proxy
(nginx…) : la valeur par défaut de `TRUST_PROXY` lui fait confiance s'il est sur la VM ou sur un réseau privé
([sécurité](securite.md#proxy-de-confiance)).

## Workflows GitHub

| Workflow              | Déclenchement                                     | Rôle                                                                                                                                       |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`              | push sur `main` et `feature/**`, pull request     | lint, format, tests ; migrations et tests sur PostgreSQL / MariaDB si utilisé ; construction et démarrage de l'image                       |
| `deploy-on-tag.yml`   | tag `vX.Y.Z`                                      | image construite, analysée (Trivy : échec sur une vulnérabilité HIGH / CRITICAL corrigeable), publiée sur ghcr.io, puis déployée sur la VM |
| `deploy-manually.yml` | manuel (Actions › Run workflow), version à saisir | redéploie une image déjà publiée (retour à une version précédente)                                                                         |

### Secrets et variables du dépôt

Settings › Secrets and variables › Actions.

| Secret                                                        | Usage                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `PROD_SESSION_SECRET`                                         | secret des cookies de session (32 caractères minimum)                      |
| `PROD_APP_URL`                                                | URL publique de l'application (liens des emails, protection CSRF)          |
| `PROD_APP_DATA_PATH`                                          | répertoire des données sur la VM                                           |
| `PROD_INITIAL_ADMIN_USERNAME`, `_PASSWORD`                    | compte administrateur créé au premier démarrage (défaut `admin` / `admin`) |
| `PROD_DB_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD`        | base PostgreSQL / MariaDB (vides avec SQLite)                              |
| `SAMU_TOOLS_HOST`, `_USERNAME`, `_PRIVATE_KEY`, `_PASSPHRASE` | connexion SSH à la VM                                                      |
| `CI_DB_USER`, `CI_DB_PASSWORD`                                | base de test de la CI (PostgreSQL / MariaDB)                               |

| Variable            | Usage                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `DB_PROVIDER`       | `postgresql` ou `mysql` si la production n'utilise pas SQLite (image, tests de la CI)               |
| `SMTP_TLS_INSECURE` | `true` seulement si le serveur SMTP a un certificat invalide ([sécurité](securite.md#serveur-smtp)) |

Le déploiement vérifie la présence des secrets indispensables avant de toucher à la VM.

## Publier une version

1. `npm run app:version -- X.Y.Z` : version affichée et paramètre de cache des scripts dans `public/index.html` ;
2. ajouter l'entrée de la version dans l'historique de `public/aide.html` ;
3. commit, puis `git tag vX.Y.Z` et `git push --tags` : le workflow construit, analyse et déploie l'image.

Les migrations de base sont appliquées au démarrage du nouveau conteneur. Avant une version qui modifie le schéma,
faire une sauvegarde (ci-dessous). Retour arrière : `deploy-manually.yml` avec la version précédente (une migration
déjà appliquée n'est pas annulée : restaurer la sauvegarde si le schéma a changé).

## Première installation

1. Créer les répertoires de données sur la VM, leur donner le propriétaire `1000:1000`, y copier
   `docker-compose.yml` ; avec PostgreSQL / MariaDB, créer la base ([base-de-donnees.md](base-de-donnees.md#créer-la-base-postgresql-ou-mariadb)).
2. Renseigner les secrets et variables du dépôt, puis publier une version (tag).
3. Se connecter avec le compte administrateur initial (secrets `PROD_INITIAL_ADMIN_USERNAME` / `_PASSWORD`, à
   défaut `admin` / `admin`) : l'application impose le choix d'un nouveau mot de passe ; créer ensuite les comptes
   nominatifs (leur mot de passe, donné par l'administrateur, sera lui aussi à changer à la première connexion). Ce
   compte n'est créé que s'il n'existe pas : modifier ces secrets ensuite ne change pas un compte existant.
4. Administration : configuration SMTP (envoi des emails), double authentification, paramètres.

Reprise d'une installation existante (base SQLite de l'ancienne version, passage à PostgreSQL / MariaDB) :
[base-de-donnees.md](base-de-donnees.md).

## Exploitation courante

- Journaux : `docker logs -f planif-ressources` (requêtes, envois d'emails, tâches planifiées, erreurs).
- Redémarrage : `docker compose restart` dans `~/samu/planif-ressources/` ; les sessions des utilisateurs sont
  conservées (stockées en base).
- Sauvegarde : SQLite depuis l'administration (fichier `.gpdump`, base et PDF des CRA) ; PostgreSQL / MariaDB avec les
  outils de la base ([base-de-donnees.md](base-de-donnees.md#sauvegarde-et-restauration)).
- État de la configuration : le serveur refuse de démarrer si une variable obligatoire manque ou est invalide, et le
  journal indique laquelle.
