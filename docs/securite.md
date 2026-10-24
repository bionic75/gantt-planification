# Sécurité

Protections de l'application et réglages associés. Les variables d'environnement sont décrites dans `.env.example`.

## Requêtes d'autres sites (CSRF) et CORS

Code : `src/middlewares/csrf.js`.

Une requête de modification (POST, PUT, PATCH, DELETE) envoyée par un navigateur depuis un autre site est refusée
(403), y compris la connexion :

1. en-tête `Sec-Fetch-Site` (navigateurs récents) : seules `same-origin` et `none` sont acceptées ;
2. sinon en-tête `Origin` : il doit être l'origine de `APP_URL`, ou celle de l'hôte de la requête ;
3. sans ces en-têtes (scripts, appels serveur à serveur), la requête est acceptée : elle ne porte pas le cookie de
   session d'un utilisateur à son insu.

Le frontend n'a rien à ajouter à ses appels `fetch`. Le cookie de session est en outre `SameSite=Lax` et `HttpOnly`.

CORS : l'application n'autorise aucune autre origine. Seule l'API publique (`/api/public/…`, clé d'API, sans
cookie) répond `Access-Control-Allow-Origin: *`.

## En-têtes HTTP

Code : `securityHeaders()` dans `src/app.js` (helmet).

- `Content-Security-Policy` : scripts et styles de l'application et des CDN utilisés (cdnjs, jsdelivr), images
  `data:` / `blob:` et tuiles OpenStreetMap, appels réseau vers l'application et Nominatim, aucun objet
  (`object-src 'none'`), affichage dans un cadre limité à l'application (`frame-ancestors 'self'`).
  Les scripts en ligne (`onclick=`…) restent autorisés tant que le frontend en contient.
  **Nouveau domaine externe** (CDN, service cartographique) : l'ajouter à la directive concernée, sinon le
  navigateur le bloque (message « violates the following Content Security Policy directive » dans la console).
- HTTPS (`APP_URL` en `https://`) : `Strict-Transport-Security` (180 jours) et `upgrade-insecure-requests`.
- `X-Content-Type-Options: nosniff`, pas de `X-Powered-By`.
- `Referrer-Policy: strict-origin-when-cross-origin` : seule l'origine de l'application est transmise aux autres
  sites (les tuiles OpenStreetMap exigent un en-tête `Referer`).

## Sessions

- Stockées en base (table `sessions`, `src/db/session-store.js`) : elles survivent aux redémarrages ; les sessions
  expirées sont supprimées toutes les 15 minutes.
- Fermeture forcée (administration) et réinitialisation du mot de passe : les sessions du compte sont marquées
  fermées en base ; leur requête suivante reçoit `401 SESSION_TERMINATED`, même après un redémarrage.
- Cookie `Secure` dès que la requête arrive en HTTPS, directement ou par un proxy de confiance (`TRUST_PROXY`).
- Les sauvegardes `.gpdump` et le transfert vers PostgreSQL / MariaDB ne contiennent pas les sessions.

## Proxy de confiance

`TRUST_PROXY` (défaut : proxys du réseau local ou privé, par exemple nginx ou le réseau Docker) détermine qui peut
fixer l'adresse IP du client (`X-Forwarded-For`, utilisée par la limitation des tentatives et les journaux) et le
protocole (`X-Forwarded-Proto`, cookie `Secure`). L'application exposée directement sur Internet sans proxy :
`TRUST_PROXY=false`.

## Limitation des tentatives

Code : `src/middlewares/rate-limit.js`. Compteurs en mémoire, par processus ; réponse `429`.

| Route                                                                       | Limite                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/api/login`, `/api/mobile-login`                                           | 10 échecs par identifiant et 30 échecs par adresse IP, 15 min   |
| `/api/forgot-password`                                                      | 20 demandes par adresse IP, 15 min (et 1 par minute par compte) |
| `/api/reset-password`, `/check`, `/api/mfa/verify`, `/api/mfa/totp-confirm` | 30 échecs par adresse IP, 15 min                                |
| `/api/user/profiles`                                                        | 100 requêtes par adresse IP, 15 min                             |

## Comptes

- `/api/user/profiles` (écran de connexion) répond pour un compte inconnu ou désactivé comme pour un compte
  « utilisateur » simple, et la connexion à un compte inconnu prend le même temps qu'un mauvais mot de passe.
  Limite connue : un compte à plusieurs profils reste reconnaissable, l'écran de connexion demandant les profils
  avant le mot de passe.
- Profil « utilisateur » : planning en lecture seule (modifications refusées, `403`).

## Données saisies dans les emails et les PDF

- Les données insérées dans les emails et les documents CRA (noms, commentaires, motifs…) sont échappées
  (`src/lib/html.js`) : elles ne peuvent pas injecter de HTML ni de liens.
- Rendu PDF (Chromium) : page sans JavaScript ni accès réseau, seules les ressources intégrées (`data:`) se chargent
  (`isolatePage`, `src/lib/puppeteer.js`). Le HTML envoyé par le navigateur pour l'export du planning ne peut donc
  pas faire lire au serveur des adresses internes ou des fichiers.
- Envoi du calendrier par email : destinataire lu en base (utilisateur rattaché à la ressource). Invitations
  d'affectation : adresses limitées aux utilisateurs rattachés aux ressources concernées.
- Noms des PDF de CRA : caractères interdits dans un nom de fichier remplacés (pas d'écriture hors du répertoire).

## API publique

Clé d'API dans l'en-tête `X-Api-Key` uniquement : le paramètre `?api_key=` est refusé (la clé apparaîtrait dans les
journaux et l'historique). Clés créées et révoquées dans l'administration, enregistrées hachées.

## Serveur SMTP

Certificat du serveur SMTP vérifié et TLS 1.2 minimum : les identifiants SMTP ne peuvent pas être interceptés.
Serveur au certificat invalide (auto-signé, nom différent) : `SMTP_TLS_INSECURE=true` rétablit l'ancien comportement
(tout certificat, TLS 1.0), à éviter. En production, la variable du dépôt GitHub `SMTP_TLS_INSECURE` (Settings ›
Secrets and variables › Actions › Variables) est recopiée dans le `.env` à chaque déploiement.

## Conteneur Docker

L'application tourne avec l'utilisateur `node` (uid 1000), sans privilèges. Les répertoires montés depuis le serveur
doivent lui appartenir ; **une fois, avant le premier déploiement de cette version**, sur la VM :

```bash
sudo chown -R 1000:1000 "$APP_DATA_PATH/config" "$APP_DATA_PATH/data"
```

Sans cela, l'application ne peut plus écrire sa base SQLite, les PDF des CRA ni les sauvegardes.

## Requêtes et journaux

- Taille des requêtes : 100 Ko sans session ouverte, 50 Mo pour un utilisateur connecté (planning complet, modèles,
  photos). Au-delà : `413`.
- Journaux : les valeurs des paramètres d'URL sensibles (jeton, clé, mot de passe, code) sont masquées.
