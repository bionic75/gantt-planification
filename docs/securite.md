# Sécurité

Protections de l'application et réglages associés. Les variables d'environnement sont décrites dans `.env.example`.

## Requêtes d'autres sites (CSRF) et CORS

Code : `backend/src/middlewares/csrf.ts`.

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

Code : `securityHeaders()` dans `backend/src/app.ts` (helmet).

- `Content-Security-Policy` : scripts servis par l'application seulement (`script-src 'self'`, aucun script en ligne
  ni attribut `onclick=`… : `script-src-attr 'none'`, depuis le lot 6.5 de la [migration](migration-vue.md)),
  feuilles de style de l'application seulement (`style-src 'self'` : ni attribut `style=` ni bloc `<style>` dans le
  HTML, depuis le lot 6.6 ; les styles posés en JavaScript restent admis, voir `frontend/src/outils/styles-en-ligne.ts`),
  images `data:` / `blob:` et tuiles OpenStreetMap, appels réseau vers l'application et Nominatim, aucun objet
  (`object-src 'none'`), affichage dans un cadre limité à l'application (`frame-ancestors 'self'`). Exceptions :
  l'aide en ligne (`/aide.html`, contenu statique, personnalisable) admet les styles en ligne ; le développement
  (serveur Vite) aussi, pour ses `<style>` injectés. Une aide en ligne personnalisée ne peut pas contenir de script :
  le bouton « Retour à l'application » (classe `back-btn`) est géré par le point d'entrée de l'aide. Les scénarios e2e
  échouent à la moindre violation de la politique (`e2e/support/fixtures.js`).
  **Nouveau domaine externe** (CDN, service cartographique) : l'ajouter à la directive concernée, sinon le
  navigateur le bloque (message « violates the following Content Security Policy directive » dans la console).
- HTTPS (`APP_URL` en `https://`) : `Strict-Transport-Security` (180 jours) et `upgrade-insecure-requests`.
- `X-Content-Type-Options: nosniff`, pas de `X-Powered-By`.
- `Referrer-Policy: strict-origin-when-cross-origin` : seule l'origine de l'application est transmise aux autres
  sites (les tuiles OpenStreetMap exigent un en-tête `Referer`).

## Sessions

- Stockées en base (table `sessions`, `backend/src/db/session-store.ts`) : elles survivent aux redémarrages ; les sessions
  expirées sont supprimées toutes les 15 minutes.
- Les sessions du compte sont marquées fermées en base, et leur requête suivante reçoit `401 SESSION_TERMINATED`
  (même après un redémarrage), dans ces cas :
    - fermeture forcée (administration) ;
    - réinitialisation du mot de passe, par le lien « mot de passe oublié » ou par un administrateur ;
    - compte désactivé ou supprimé ;
    - profils (administrateur, expert, utilisateur, RH) ou ressource rattachée modifiés : une session ouverte garderait
      les anciens droits. Un simple changement de nom ou d'adresse email ne ferme pas les sessions.
- Changement de profil (`/api/switch-profile`) : nouvel identifiant de session.
- Cookie `Secure` dès que la requête arrive en HTTPS, directement ou par un proxy de confiance (`TRUST_PROXY`).
- Les sauvegardes `.gpdump` et le transfert vers PostgreSQL / MariaDB ne contiennent pas les sessions.

## Proxy de confiance

`TRUST_PROXY` (défaut : proxys du réseau local ou privé, par exemple nginx ou le réseau Docker) détermine qui peut
fixer l'adresse IP du client (`X-Forwarded-For`, utilisée par la limitation des tentatives et les journaux) et le
protocole (`X-Forwarded-Proto`, cookie `Secure`). L'application exposée directement sur Internet sans proxy :
`TRUST_PROXY=false`.

## Limitation des tentatives

Code : `backend/src/middlewares/rate-limit.ts`. Compteurs en mémoire, par processus ; réponse `429`.

| Route                                                                                               | Limite                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/api/login`, `/api/mobile-login`                                                                   | 10 échecs par identifiant et 30 échecs par adresse IP, 15 min   |
| `/api/forgot-password`                                                                              | 20 demandes par adresse IP, 15 min (et 1 par minute par compte) |
| `/api/reset-password`, `/check`, `/api/mfa/verify`, `/api/mfa/totp-unlock`, `/api/mfa/totp-confirm` | 30 échecs par adresse IP, 15 min                                |

## Comptes

- Écran de connexion : identifiant et mot de passe sont vérifiés d'abord (`POST /api/login` sans profil) ; le choix
  du profil n'est proposé qu'ensuite, pour un compte qui en a plusieurs. Un compte inconnu, désactivé ou un mauvais
  mot de passe reçoivent la même réponse (« Identifiants incorrects »), dans le même temps.
- Mot de passe donné par un administrateur (compte administrateur initial, compte créé ou mot de passe réinitialisé
  par un administrateur) : à remplacer à la connexion suivante. Tant que ce n'est pas fait, l'application reste
  bloquée sur l'écran de changement et l'API répond `403 PASSWORD_CHANGE_REQUIRED` à toute autre requête
  (`backend/src/middlewares/password-change.ts`) ; le nouveau mot de passe doit respecter les règles de complexité et
  différer de l'ancien. L'application mobile refuse la connexion de ces comptes. Un mot de passe choisi par
  l'utilisateur (écran « Mon profil », lien « mot de passe oublié ») lève l'obligation.
- Profil « utilisateur » : planning en lecture seule (modifications refusées, `403`).
- Profil « expert » : seule la ligne de sa ressource est modifiable dans le planning. L'identifiant de ressource d'une
  cellule n'est accepté qu'écrit en chiffres (« 12 ») : une clé mal formée (« 1e1 ») est ignorée.

## Double authentification

Code : `backend/src/modules/auth/` (`mfa.service.ts`, `mfa-pending.ts`, `auth.controller.ts`). Réglages dans
l'administration : profils soumis (le profil RH ne l'est jamais), méthode, fréquence.

- La connexion reste en attente (côté serveur, 10 minutes) tant que le code n'est pas validé. Seules les méthodes de
  la configuration sont acceptées :
    - **email** : code reçu par email ; aucune application d'authentification ne peut être enregistrée ;
    - **application** : code de l'application d'authentification (TOTP). Le premier enregistrement de l'application se
      fait à la première connexion, sur le seul mot de passe : aucun autre facteur n'existe encore (risque assumé) ;
    - **au choix** : code email ou code de l'application. L'enregistrement d'une application exige d'abord un code
      reçu par email pendant la même connexion (`/api/mfa/totp-unlock`) : un mot de passe volé ne suffit pas à enregistrer
      l'application d'un attaquant.
- Une application déjà enregistrée ne peut être remplacée qu'après sa réinitialisation par un administrateur.
- Fréquence « chaque jour / semaine / mois » : la dispense vaut pour **l'appareil** où le code a été validé (cookie
  `gantt.mfa`, `HttpOnly`, jeton aléatoire dont seule l'empreinte est conservée en base, durée égale à la période),
  pas pour le compte. Une connexion depuis un autre appareil demande un code. La réinitialisation de la double
  authentification d'un compte (administration) retire ses appareils de confiance.
- Changement de profil vers un profil soumis à la double authentification : accepté seulement si elle a été faite
  pour la session ou si l'appareil est de confiance ; sinon refusé (« reconnectez-vous en choisissant ce profil »).

## Données saisies dans les emails et les PDF

- Les données insérées dans les emails et les documents CRA (noms, commentaires, motifs…) sont échappées
  (`backend/src/lib/html.ts`) : elles ne peuvent pas injecter de HTML ni de liens.
- Rendu PDF (Chromium) : page sans JavaScript ni accès réseau, seules les ressources intégrées (`data:`) se chargent
  (`isolatePage`, `backend/src/lib/puppeteer.ts`). Le HTML envoyé par le navigateur pour l'export du planning ne peut donc
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
