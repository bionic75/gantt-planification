FROM node:18-alpine

# Chromium + libs requises par Puppeteer
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Nom de la variable depuis Puppeteer 20 (l'ancien est ignoré)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# SESSION_SECRET (32 caractères min.) doit être fourni au conteneur : le serveur refuse de démarrer sans
ENV NODE_ENV=production

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

EXPOSE 8080

CMD ["node", "server.js"]
