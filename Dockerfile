# Interface Vue (frontend/, docs/migration-vue.md) : construite à part, seul le résultat (dist/frontend) est copié
# dans l'image finale, sans les outils de build (dépendances de développement)
# Image de base épinglée par digest (constructions reproductibles, pas de substitution de l'étiquette) ; Dependabot
# propose chaque nouvelle image node:26-alpine (.github/dependabot.yml). Même digest pour les deux étapes.
# Node 26 (LTS « Lithium ») : même version majeure que la CI et qu'engines (package.json).
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS frontend
WORKDIR /build
# Paquets npm (workspaces) : manifestes de la racine et des deux paquets, puis dépendances du seul paquet frontend
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --ignore-scripts --workspace frontend
COPY frontend ./frontend
RUN npm run build:front

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

# Chromium + libs requises par Puppeteer ; LibreOffice (conversion PowerPoint → PDF de l'export du planning avec modèle)
# et polices pour la mise en page des documents convertis
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont \
        libreoffice font-liberation ttf-dejavu

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Nom de la variable depuis Puppeteer 20 (l'ancien est ignoré)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# SESSION_SECRET (32 caractères min.) et APP_URL doivent être fournis au conteneur : le serveur refuse de démarrer sans
ENV NODE_ENV=production
# Base de données : sqlite (défaut), postgresql ou mysql. Le client Prisma est généré pour ce fournisseur.
ARG DB_PROVIDER=sqlite
ENV DB_PROVIDER=${DB_PROVIDER}

WORKDIR /app
RUN chown node:node /app

# Utilisateur sans privilèges (uid 1000) : les répertoires montés (config, data) doivent lui appartenir,
# voir docs/securite.md
USER node

COPY --chown=node:node . .
COPY --from=frontend --chown=node:node /build/dist/frontend ./dist/frontend

# Dépendances d'exécution du seul paquet backend (génère aussi le client Prisma : script postinstall du paquet)
RUN npm ci --omit=dev --workspace backend && npm cache clean --force

# Gestionnaires de paquets inutiles à l'exécution (l'application et ses commandes se lancent avec node) : retirés de
# l'image, avec leurs propres dépendances, signalées par les analyses de vulnérabilités (Trivy)
USER root
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node

# Port d'écoute : PORT (défaut 3000)
EXPOSE 3000

# Migrations en attente appliquées à chaque démarrage, puis lancement du serveur (code du serveur : backend/ ;
# répertoire courant /app : .env, config/ et data/ restent à la racine)
CMD ["sh", "-c", "node backend/scripts/db-migrate.ts && exec node backend/server.ts"]
