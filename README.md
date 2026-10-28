# Plateforme de planification des ressources

Application web de l'Agence du Numérique en Santé (programme SI-SAMU) pour planifier l'activité des experts métier :
disponibilités et affectations sur un planning de type GANTT, événements, astreintes, comptes rendus d'activité,
déplacements.

## Fonctionnalités

- **Planning** mensuel par ressource : disponibilités, activités, localisations, congés scolaires et jours fériés,
  notification des affectations par email (invitation Outlook).
- **Ressources** : experts, taux et historique de mise à disposition (MAD), affectations SAMU.
- **Événements** et participants, carte des événements et déplacements, calendriers ICS.
- **Astreintes et HNO**, **comptes rendus d'activité (CRA)** avec circuit de visas, PDF signé et diffusion à la RH.
- **Déplacements** : bons de commande, consommation des unités d'œuvre.
- **Localisations**, carnet de lieux SAMU-SAS (« TripAdvisor »), **reporting**, journaux de connexion.
- **Aide à l'affectation** des déploiements (import Asana, export PDF / PowerPoint).
- **Automatisations** : rappels, sauvegardes du planning par email, notifications Teams, relances des CRA.
- Profils **Administrateur**, **Expert métier**, **Utilisateur** (planning en lecture seule), **RH** ; double
  authentification ; version mobile ; API publique des événements (clé d'API).

## Démarrage rapide

Prérequis : Node.js 22.22.2 ou plus. Les PDF utilisent le Chromium téléchargé par Puppeteer à l'installation (ou celui
indiqué par `PUPPETEER_EXECUTABLE_PATH`).

```bash
npm install            # dépendances et client Prisma (SQLite par défaut)
cp .env.example .env   # configuration (facultative en développement)
npm run dev            # migrations de la base, puis serveur sur http://localhost:3000
```

En développement, l'interface Vue (`frontend/`) est compilée à la volée par le serveur. Pour lancer le serveur avec
`NODE_ENV=production` hors Docker, construire d'abord l'interface : `npm run build:front`.

Première connexion : compte administrateur `admin` / `admin` (ou `INITIAL_ADMIN_USERNAME` /
`INITIAL_ADMIN_PASSWORD` s'ils sont définis) ; l'application impose alors le choix d'un nouveau mot de passe.

## Configuration

Variables d'environnement décrites dans [.env.example](.env.example) et validées au démarrage
(`src/config/env.js`) : le serveur refuse de démarrer si une variable obligatoire manque. En production :
`NODE_ENV=production`, `SESSION_SECRET` (32 caractères minimum) et `APP_URL` sont obligatoires.

La configuration SMTP (envoi des emails), la double authentification et les paramètres de l'application se règlent
dans l'écran Administration.

## Commandes

| Commande                          | Usage                                            |
| --------------------------------- | ------------------------------------------------ |
| `npm run dev` / `npm start`       | serveur (avec / sans redémarrage automatique)    |
| `npm test`                        | tests (API et interface)                         |
| `npm run build:front`             | build de l'interface Vue (`dist/frontend`)       |
| `npm run test:front`              | tests unitaires de l'interface Vue               |
| `npm run lint` / `npm run format` | vérification et mise en forme du code            |
| `npm run db:migrate`              | migrations de la base (automatique au démarrage) |
| `npm run db:migration -- <nom>`   | nouvelle migration après modification du schéma  |
| `npm run routes`                  | inventaire des routes et référence de l'API      |
| `npm run app:version -- X.Y.Z`    | version de l'application avant publication       |

## Documentation

| Document                                           | Contenu                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)       | organisation du code, modules, frontend, tâches de fond, tests                      |
| [docs/deploiement.md](docs/deploiement.md)         | Docker, workflows GitHub, secrets, publication d'une version, exploitation          |
| [docs/base-de-donnees.md](docs/base-de-donnees.md) | SQLite / PostgreSQL / MariaDB, migrations, sauvegardes, reprise d'une ancienne base |
| [docs/securite.md](docs/securite.md)               | protections (CSRF, sessions, en-têtes, limitations…) et réglages                    |
| [docs/api.md](docs/api.md)                         | référence des routes de l'API (générée)                                             |

L'aide destinée aux utilisateurs et l'historique des versions sont dans l'application (`/aide.html`).
