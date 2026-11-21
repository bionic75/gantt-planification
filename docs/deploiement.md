# Déploiement et exploitation

## Vue d'ensemble

```
tag vX.Y.Z ──► GitHub Actions ──► image Docker (ghcr.io) ──► VM : docker compose up
                (build, analyse Trivy, push)        (.env réécrit depuis les secrets GitHub)
```

L'application tourne dans un conteneur Docker sur la VM « SAMU Tools », dans `~/samu/planif-ressources/`.
Au démarrage, le conteneur applique les migrations de base en attente puis lance le serveur.

## Image Docker

`Dockerfile` : Node 26 (Alpine) avec Chromium (génération des PDF), dépendances de production, client Prisma généré
pour la base choisie (argument `DB_PROVIDER`, `sqlite` par défaut). L'application tourne avec l'utilisateur `node`
(uid 1000) et écoute sur le port `PORT` (3000 par défaut). L'image ne contient pas npm (ni yarn, corepack), inutile à
l'exécution et source d'alertes de vulnérabilités : les commandes se lancent avec `node`, par exemple
`docker compose run --rm planif-ressources node backend/scripts/db-adopt.ts`.

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

Le port 8080 de la VM, sur l'interface locale seulement (`127.0.0.1:8080`), est relié au port 3000 du conteneur :
l'application n'est joignable que par le proxy HTTPS (nginx…) installé sur la VM, jamais directement en HTTP depuis le
réseau. La valeur par défaut de `TRUST_PROXY` fait confiance à ce proxy ([sécurité](securite.md#proxy-de-confiance)).

Conteneur durci (`docker-compose.yml`) : aucune élévation de privilèges (`no-new-privileges`), aucune capacité Linux
(`cap_drop: ALL`), processus `init` (arrêt propre de Chromium et LibreOffice), mémoire limitée à 2 Go et 1 024
processus. Si la VM a moins de mémoire, ou si de gros exports échouent faute de mémoire, ajuster `mem_limit`.

**Après une modification de `docker-compose.yml`** (non déployé par les workflows) : le recopier sur la VM, puis
`docker compose up -d` dans `~/samu/planif-ressources/` (ou attendre le déploiement suivant).

## Workflows GitHub

| Workflow              | Déclenchement                                     | Rôle                                                                                                                                       |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`              | push sur `main` et `feature/**`, pull request     | lint, format, tests ; migrations et tests sur PostgreSQL / MariaDB si utilisé ; construction et démarrage de l'image                       |
| `deploy-on-tag.yml`   | tag `vX.Y.Z`                                      | image construite, analysée (Trivy : échec sur une vulnérabilité HIGH / CRITICAL corrigeable), publiée sur ghcr.io, puis déployée sur la VM |
| `deploy-manually.yml` | manuel (Actions › Run workflow), version à saisir | redéploie une image déjà publiée (retour à une version précédente)                                                                         |

### Secrets et variables du dépôt

Settings › Secrets and variables › Actions.

| Secret                                                        | Usage                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROD_SESSION_SECRET`                                         | secret des cookies de session (32 caractères minimum)                                                                                       |
| `PROD_APP_URL`                                                | URL publique de l'application (liens des emails, protection CSRF)                                                                           |
| `PROD_APP_DATA_PATH`                                          | répertoire des données sur la VM                                                                                                            |
| `PROD_INITIAL_ADMIN_USERNAME`, `_PASSWORD`                    | compte administrateur créé au premier démarrage (identifiant par défaut `admin` ; mot de passe obligatoire tant que ce compte n'existe pas) |
| `PROD_DB_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD`        | base PostgreSQL / MariaDB (vides avec SQLite)                                                                                               |
| `SAMU_TOOLS_HOST`, `_USERNAME`, `_PRIVATE_KEY`, `_PASSPHRASE` | connexion SSH à la VM                                                                                                                       |
| `SAMU_TOOLS_HOST_FINGERPRINT`                                 | empreinte de la clé d'hôte SSH de la VM (obligatoire, voir ci-dessous)                                                                      |
| `CI_DB_USER`, `CI_DB_PASSWORD`                                | base de test de la CI (PostgreSQL / MariaDB)                                                                                                |

| Variable            | Usage                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `DB_PROVIDER`       | `postgresql` ou `mysql` si la production n'utilise pas SQLite (image, tests de la CI)               |
| `SMTP_TLS_INSECURE` | `true` seulement si le serveur SMTP a un certificat invalide ([sécurité](securite.md#serveur-smtp)) |

Le déploiement vérifie la présence des secrets indispensables avant de toucher à la VM.

**Empreinte SSH de la VM** (`SAMU_TOOLS_HOST_FINGERPRINT`) : le déploiement vérifie la clé d'hôte de la VM et
s'arrête si elle ne correspond pas, sans envoyer les secrets à un serveur intercalé. Valeur à lire **sur la VM
elle-même** (pas à travers le réseau, que l'on cherche justement à vérifier) :

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f2   # SHA256:…
```

Si le déploiement échoue ensuite sur une empreinte différente, la VM présente une autre de ses clés : prendre celle de
`/etc/ssh/ssh_host_ecdsa_key.pub` (ou `ssh_host_rsa_key.pub`). À mettre à jour si la VM est réinstallée.

**Version saisie** dans `deploy-manually.yml` : de la forme `X.Y.Z` uniquement, sinon le workflow s'arrête avant de
se connecter à la VM.

**Actions GitHub** : épinglées par empreinte de commit (SHA), version en commentaire ; une étiquette déplacée vers du
code malveillant (comme `trivy-action` en mars 2026) n'a donc pas d'effet. Dependabot propose chaque semaine les
nouvelles versions des actions, des paquets npm et de l'image de base `node:26-alpine` (épinglée par digest dans le
`Dockerfile`), à relire avant fusion.

## Publier une version

1. `npm run app:version -- X.Y.Z` : version affichée dans `frontend/pages/index.html` ;
2. ajouter l'entrée de la version dans l'historique de `frontend/pages/aide.html` ;
3. commit, puis `git tag vX.Y.Z` et `git push --tags` : le workflow construit, analyse et déploie l'image.

Les migrations de base sont appliquées au démarrage du nouveau conteneur. Avant une version qui modifie le schéma,
faire une sauvegarde (ci-dessous). Retour arrière : `deploy-manually.yml` avec la version précédente (une migration
déjà appliquée n'est pas annulée : restaurer la sauvegarde si le schéma a changé).

## Première installation

1. Créer les répertoires de données sur la VM, leur donner le propriétaire `1000:1000`, y copier
   `docker-compose.yml` ; avec PostgreSQL / MariaDB, créer la base ([base-de-donnees.md](base-de-donnees.md#créer-la-base-postgresql-ou-mariadb)).
2. Renseigner les secrets et variables du dépôt, puis publier une version (tag).
3. Se connecter avec le compte administrateur initial (secrets `PROD_INITIAL_ADMIN_USERNAME`, à défaut `admin`, et
   `PROD_INITIAL_ADMIN_PASSWORD`, obligatoire : sans lui, le serveur refuse de créer le compte et ne démarre pas) :
   l'application impose le choix d'un nouveau mot de passe ; créer ensuite les comptes
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
