FROM node:22-alpine

# Chromium + libs requises par Puppeteer
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

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

# Installation (génère aussi le client Prisma : script postinstall)
RUN npm ci --omit=dev && npm cache clean --force

# Gestionnaires de paquets inutiles à l'exécution (l'application et ses commandes se lancent avec node) : retirés de
# l'image, avec leurs propres dépendances, signalées par les analyses de vulnérabilités (Trivy)
USER root
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node

# Port d'écoute : PORT (défaut 3000)
EXPOSE 3000

# Migrations en attente appliquées à chaque démarrage, puis lancement du serveur
CMD ["sh", "-c", "node scripts/db-migrate.mjs && exec node server.js"]
