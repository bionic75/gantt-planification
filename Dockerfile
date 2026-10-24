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

COPY . .

# Installation (génère aussi le client Prisma : script postinstall)
RUN npm ci --omit=dev

EXPOSE 8080

# Migrations en attente appliquées à chaque démarrage, puis lancement du serveur
CMD ["sh", "-c", "node scripts/db-migrate.mjs && exec node server.js"]
