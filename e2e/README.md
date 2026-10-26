# Tests de bout en bout (Playwright BDD)

Scénarios du cahier de tests `Planif_ressources_tests_e2e.pdf`, écrits en Gherkin français (`features/`) et
exécutés par [playwright-bdd](https://vitalets.github.io/playwright-bdd/) dans Chromium.

Projet autonome (ses propres dépendances) : il ne modifie pas celles de l'application.

## Installation

```bash
cd e2e
npm install
npm run install:browsers      # Chromium de Playwright
cp .env.example .env          # puis renseigner les mots de passe et la boîte partagée
```

## Configuration (`e2e/.env`)

| Variable                                                                            | Rôle                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `E2E_BASE_URL`                                                                      | URL de l'application testée (défaut `http://localhost:3000`)                      |
| `E2E_<PROFIL>_LOGIN` / `_PASSWORD`                                                  | Compte de test de chaque profil : `EXPERT`, `UTILISATEUR`, `RH`, `ADMINISTRATEUR` |
| `E2E_MAIL_PROVIDER`                                                                 | `imap` (boîte réelle) ou `mailpit` (SMTP de test local)                           |
| `E2E_IMAP_*`                                                                        | Accès IMAP à la boîte partagée qui reçoit les codes OTP                           |
| `E2E_SHARED_MAILBOX`                                                                | Adresse de la boîte partagée (comptes temporaires, contacts RH des CRA de test)   |
| `E2E_TAGS`                                                                          | Scénarios générés (expression de tags), voir plus bas                             |
| `E2E_WORKERS`                                                                       | Parallélisme des scénarios métier (défaut 2)                                      |
| `E2E_SMTP_TEST`, `E2E_ASANA_ENABLED`, `E2E_ALLOW_MFA_RESET`, `E2E_PARITY_REFERENCE` | Préalables optionnels                                                             |

Les variables d'environnement du système sont prioritaires sur le fichier.

## Authentification et codes OTP

1. Le projet Playwright `authentification` (`auth.setup.js`) connecte les 4 profils **l'un après l'autre**,
   dans l'ordre Administrateur → Expert → Utilisateur → RH, par la mire de connexion, avec le code reçu par e-mail.
   Les sessions sont enregistrées dans `.auth/` puis réutilisées par tous les scénarios (et par les lancements
   suivants tant qu'elles restent valides, `E2E_AUTH_MAX_AGE_HOURS`).
2. Avant chaque demande de code, un repère est pris dans la boîte (UID IMAP suivant) ; le code retenu est celui du
   message « Code de vérification » le plus récent arrivé après ce repère.
3. Toute connexion qui peut demander un code (y compris celles des scénarios d'authentification) passe par un
   verrou inter-processus (`.auth/otp.lock`) : jamais deux demandes de code en même temps, quel que soit le nombre
   de workers.

Le profil RH n'est jamais soumis à la double authentification (règle de l'application).

## Lancement

```bash
npm test                 # génération (bddgen) puis exécution
npm run test:headed      # navigateur visible
npm run test:ui          # mode interactif de Playwright
npm run test:auth        # mise en place seule (connexions séquentielles)
npm run report           # rapport HTML Playwright
npm run report:monocart  # rapport Monocart
npm run report:allure    # génère le rapport Allure (allure-report/), puis : npm run report:allure:open
```

| Rapport    | Dossier                              | Contenu                                                           |
| ---------- | ------------------------------------ | ----------------------------------------------------------------- |
| Playwright | `playwright-report/`                 | Rapport HTML natif (étapes, captures, vidéos, traces)             |
| Cucumber   | `cucumber-report/`                   | HTML Cucumber par fonctionnalité et `junit.xml`                   |
| Monocart   | `monocart-report/`                   | Rapport HTML autonome (arborescence, tendances, filtres)          |
| Allure     | `allure-results/` → `allure-report/` | Résultats bruts écrits pendant l'exécution, puis rapport Allure 3 |

Les traces Playwright ne sont pas enregistrées en CI (variable `CI`) : elles contiennent les requêtes réseau, donc
les cookies de session, les mots de passe et les codes OTP.

### Tags

| Tag                                           | Exclu par défaut | Signification                                                                                   |
| --------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `@manuel`                                     | oui              | Vérification visuelle ou manipulation hors navigateur (scénario conservé pour la traçabilité)   |
| `@destructif`                                 | oui              | Restaure un dump complet : à lancer seul, avec `E2E_WORKERS=1`                                  |
| `@exploitation`                               | oui              | À exécuter sur le serveur de l'application (version de Node.js, parité des routes, PDF des CRA) |
| `@asana`                                      | oui              | Nécessite le jeu de données Asana de test (`E2E_ASANA_ENABLED=true`)                            |
| `@lent`                                       | oui              | Délai d'inactivité réduit à 1 minute : modifie un paramètre global, à lancer seul               |
| `@smtp`, `@mfa`, `@totp`, `@internet`, `@mad` | non              | Ignorés à l'exécution si le préalable manque (message dans le rapport)                          |
| `@anomalie-connue` + `@fail`                  | non              | Anomalie connue de l'application : réussit tant qu'elle existe, échoue dès qu'elle est corrigée |

### Anomalies connues

Ces scénarios décrivent le comportement attendu par le cahier de tests, que l'application ne respecte pas encore.
Le tag `@fail` (Playwright : `test.fail()`) les fait réussir tant que l'anomalie existe, sans bloquer les pull
requests. Une fois l'anomalie corrigée, le scénario échoue (« expected to fail, but passed ») : retirer alors les
tags `@anomalie-connue @fail` du scénario.

| Scénario                                                 | Anomalie                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mobile › Accès mobile réservé aux experts                | Le profil Utilisateur accède au planning mobile                                   |
| CRA › Scénario CRA complet avec correction               | Un CRA diffusé ne peut pas être corrigé par l'administrateur                      |
| Aide à l'affectation › Scénario complet d'un déploiement | Activité décalée puis déploiement supprimé : anciens jours en « 3 - Déploiement » |

Exemples :

```bash
E2E_TAGS="not @manuel and not @destructif" npm test             # tout sauf le destructif
E2E_TAGS="@destructif" E2E_WORKERS=1 npm test                   # dump / restauration seul
E2E_TAGS="@cra" npm test                                        # une fonctionnalité
```

## Données de test

- Chaque scénario crée ses données (préfixe « E2E », localisations « SAMU 9xxx », dates en 2031, CRA sur des
  années ≥ 2090) et les supprime en fin de scénario, même en cas d'échec.
- Les paramètres globaux modifiés (accès aux onglets, thème, couleurs, modèle de nom, automatisations) sont rétablis.
- Préalables de l'environnement : au moins une localisation (SAMU), le compte Expert rattaché à une ressource,
  un SMTP **de test** (jamais de production) pour les codes OTP et la diffusion des CRA.

### Instance vierge : `npm run seed`

`scripts/seed.mjs` crée ces préalables sur une instance neuve (CI, poste de développement) : 4 localisations SAMU
géolocalisées, la ressource de l'expert (volontaire aux astreintes), les 4 comptes de test (logins et mots de passe de
`.env`, e-mail `E2E_SHARED_MAILBOX`), les applications de l'administrateur, le SMTP de test et la double
authentification par e-mail demandée à chaque connexion. Relançable sans effet sur une instance déjà initialisée.

| Variable                                           | Rôle                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `E2E_SEED_ADMIN_LOGIN` / `E2E_SEED_ADMIN_PASSWORD` | Administrateur initial de l'instance (`INITIAL_ADMIN_USERNAME` / `_PASSWORD`) |
| `E2E_SEED_SMTP_HOST` / `E2E_SEED_SMTP_PORT`        | SMTP de test vu depuis le serveur (Mailpit : `127.0.0.1:1025`)                |
| `E2E_SEED_ALLOW_REMOTE=true`                       | Autorise une instance autre que `localhost` (jamais la production)            |

Exemple en local avec Mailpit (`MP_SMTP_AUTH_ACCEPT_ANY=1`, `MP_SMTP_AUTH_ALLOW_INSECURE=1`) :

```bash
INITIAL_ADMIN_USERNAME=bootstrap INITIAL_ADMIN_PASSWORD='Bootstrap-2026!' DB_PATH=/tmp/e2e-data npm run dev   # racine
E2E_SEED_ADMIN_LOGIN=bootstrap E2E_SEED_ADMIN_PASSWORD='Bootstrap-2026!' npm run seed                        # e2e/
E2E_MAIL_PROVIDER=mailpit npm test
```

## Intégration continue

Le job `e2e` de `.github/workflows/ci.yml` s'exécute à chaque push et pull request :

1. Mailpit en conteneur de service (SMTP 1025, API 8025) ;
2. application de la branche démarrée sur une base SQLite neuve ;
3. `scripts/seed.mjs` ;
4. scénarios par défaut sans `@internet` (2 workers), puis `@destructif` seul (`E2E_RAPPORT=destructif`) ;
5. rapport Allure généré à partir des deux exécutions ;
6. rapports publiés en artefact `e2e-reports` (Playwright, Cucumber HTML / JUnit, Monocart, Allure, journal du
   serveur).

Instance jetable : les mots de passe sont écrits dans le workflow, aucun secret n'est nécessaire.
Les scénarios `@lent`, `@internet`, `@asana` et `@exploitation` sont prévus pour une exécution planifiée sur
l'environnement de recette.

## Organisation

```
features/        scénarios Gherkin, un fichier par domaine du cahier de tests
steps/           définitions des étapes (une par domaine) + étapes communes
support/         configuration, boîte e-mail (IMAP / Mailpit), connexion, verrou OTP, données de test, « monde »
auth.setup.js    connexions séquentielles des 4 profils
```
