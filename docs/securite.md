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
  images `data:` / `blob:`, tuiles OpenStreetMap (plan) et IGN `data.geopf.fr` (satellite), appels réseau vers l'application et Nominatim, aucun objet
  (`object-src 'none'`), affichage dans un cadre limité à l'application (`frame-ancestors 'self'`). Exceptions :
  l'aide en ligne (`/aide.html`, contenu statique, personnalisable) admet les styles en ligne ; le développement
  (serveur Vite) aussi, pour ses `<style>` injectés. Une aide en ligne personnalisée ne peut pas contenir de script :
  le bouton « Retour à l'application » (classe `back-btn`) est géré par le point d'entrée de l'aide ; ses nouveautés,
  reprises dans la fenêtre affichée après la connexion, sont en plus filtrées par DOMPurify
  (`frontend/src/outils/html-sur.ts`). Les scénarios e2e
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
- Changement du mot de passe depuis « Mon profil » ou à la connexion : les autres sessions du compte sont fermées et
  la session courante prend un nouvel identifiant.
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

Les codes de double authentification ont aussi leurs propres limites (voir « Double authentification »).

## Comptes

- Écran de connexion : identifiant et mot de passe sont vérifiés d'abord (`POST /api/login` sans profil) ; le choix
  du profil n'est proposé qu'ensuite, pour un compte qui en a plusieurs. Un compte inconnu, désactivé ou un mauvais
  mot de passe reçoivent la même réponse (« Identifiants incorrects »), dans le même temps.
- Mot de passe donné par un administrateur (compte administrateur initial, compte créé ou mot de passe réinitialisé
  par un administrateur) : à remplacer à la connexion suivante. Tant que ce n'est pas fait, l'application reste
  bloquée sur l'écran de changement et l'API répond `403 PASSWORD_CHANGE_REQUIRED` à toute autre requête
  (`backend/src/middlewares/password-change.ts`) ; le nouveau mot de passe doit respecter les règles de complexité et
  différer de l'ancien. L'application mobile refuse la connexion de ces comptes. Un mot de passe choisi par
  l'utilisateur (écran « Mon profil », lien « mot de passe oublié ») lève l'obligation. Le contrôle porte sur le
  chemin de l'URL sans tenir compte de la casse (`/API/...` est bloqué comme `/api/...`).
- Écran « Mon profil » : le mot de passe actuel est exigé pour en choisir un nouveau (`/api/profile/change-password`),
  sauf pour le changement imposé à la connexion (il vient d'être saisi). Une session volée ne suffit donc pas à
  s'approprier le compte. L'ancienne route `/api/users/change-password` (6 caractères, sans règles de complexité) est
  supprimée.
- Compte administrateur initial : `admin` / `admin` hors production. En production (`NODE_ENV=production`), tant que
  ce compte n'existe pas, `INITIAL_ADMIN_PASSWORD` est obligatoire : sans lui, le serveur refuse de démarrer.
- Profil « utilisateur » : planning en lecture seule (modifications refusées, `403`).
- Profil « expert » : seule la ligne de sa ressource est modifiable dans le planning. L'identifiant de ressource d'une
  cellule n'est accepté qu'écrit en chiffres (« 12 ») : une clé mal formée (« 1e1 ») est ignorée.
- Saisie des astreintes / HNO (création, modification) : profils administrateur et expert, comme le bouton « Gérer
  mes / les astreintes/HNO » de l'interface.
- Rapport astreintes / HNO : même contrôle que les autres rapports de l'onglet Reporting (`requireReportingAccess`).
- Profil RH : lecture de tous les CRA (rôle métier : suivi et diffusion), sans les modifier.
- Liste des connectés (`/api/active-sessions`) : identifiant de connexion (`username`) renvoyé au seul
  administrateur ; les autres profils voient nom, prénom, photo et profil.

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
- Codes erronés (`/api/mfa/verify`, `/api/mfa/totp-unlock`, `/api/mfa/totp-confirm`) :
    - 5 essais par connexion en attente, qui est ensuite annulée ;
    - 10 codes erronés par compte en 15 minutes : au-delà, le compte est bloqué (`429`) jusqu'à la fin de la fenêtre,
      même avec un bon code (se reconnecter ne remet pas le compteur à zéro). Compteur en mémoire, par processus ;
    - un code email faux 5 fois est supprimé : il faut en demander un nouveau.
- Code de l'application d'authentification (TOTP) : accepté sur 90 secondes (fenêtre courante et adjacentes), mais une
  seule fois : un code déjà accepté, ou plus ancien que le dernier accepté pour ce compte, est refusé (rejeu d'un code
  intercepté ou vu par-dessus l'épaule). Mémoire du serveur, par processus.

## Données saisies dans les emails et les PDF

- Les données insérées dans les emails et les documents CRA (noms, commentaires, motifs…) sont échappées
  (`backend/src/lib/html.ts`) : elles ne peuvent pas injecter de HTML ni de liens.
- Rendu PDF (Chromium) : page sans JavaScript ni accès réseau, seules les ressources intégrées (`data:`) se chargent
  (`isolatePage`, `backend/src/lib/puppeteer.ts`). Le HTML envoyé par le navigateur pour l'export du planning ne peut donc
  pas faire lire au serveur des adresses internes ou des fichiers.
- Envoi du calendrier par email : destinataire lu en base (utilisateur rattaché à la ressource). Invitations
  d'affectation : adresses limitées aux utilisateurs rattachés aux ressources concernées.
- Noms des PDF de CRA : caractères interdits dans un nom de fichier remplacés (pas d'écriture hors du répertoire).
- PDF de CRA enregistrés (`/api/cra/pdf-saved/:nom`) : mêmes droits que la lecture du CRA (un expert ne lit que les
  siens) ; un fichier sans CRA correspondant est réservé aux profils administrateur et RH. Journal de diffusion d'un
  CRA (`/api/cra/:id/diffusion-log`, adresses des destinataires) : mêmes droits.
- Info-bulles des cartes (Leaflet) : données saisies insérées comme texte ou échappées.
- Invitations calendrier (ICS, `backend/src/lib/ics.ts`) : libellé, description, lieu et noms échappés (RFC 5545) ;
  une donnée saisie ne peut pas ajouter de ligne au fichier (organisateur, rappel, autre événement).
- Expéditeur des invitations et des demandes d'affectation : le compte connecté (nom et adresse de la session),
  jamais une valeur envoyée par le navigateur. Nom affiché dans l'en-tête `From` sans guillemet, chevron ni retour à
  la ligne. Comme dans l'interface, les invitations sont refusées au profil RH et les demandes d'affectation sont
  réservées aux profils administrateur et utilisateur.
- Routes de notification non utilisées par l'interface supprimées (elles permettaient d'envoyer des emails ou des
  messages Teams au contenu libre) : `/api/pending-notifications`, `/api/send-assignment-notifications`,
  `/api/notifications/create-batch`, `/api/teams/notify`. Les experts sont notifiés par le serveur lui-même quand un
  tiers enregistre une affectation.

## Exports (CSV, HTML)

- CSV produits par le serveur (`backend/src/lib/csv.ts`) et par l'interface (`frontend/src/outils/csv.ts`) : une valeur
  commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est préfixée d'une apostrophe, pour que le
  tableur ne l'exécute pas comme une formule (sauf les nombres et le « - » des cases vides). Les guillemets sont
  doublés.
- Export du planning (`/api/export/gantt`) : année sur 4 chiffres et mois de 0 à 11 exigés (sinon `400`).
- Export HTML des événements : toutes les données échappées (participants externes compris), couleurs des types
  limitées à un code hexadécimal ; le fichier est ouvert hors de l'application, sans sa politique de contenu.

## Paramètres

`GET /api/settings` renvoie à l'administrateur tous les paramètres sauf les secrets (`asana_token_enc`), et aux autres
profils seulement ceux dont l'interface a besoin (favicon, aide publiée, inactivité, sauvegarde automatique).

`POST` / `PUT /api/settings` (administrateur) n'écrit que les paramètres des écrans de l'administration (favicon,
inactivité, publication de l'aide, version, workflow CRA) et les clés `test_…` des tests automatisés, jamais lues par
l'application. Les autres paramètres (jeton Asana, automatisations, accès aux onglets, thème…) ont leur propre route
et ses contrôles ; une clé interne ne peut pas être remplacée.

Filtre de noms des projets Asana (expression régulière saisie par l'administrateur) : 200 caractères au plus,
quantificateurs imbriqués (« (a+)+ ») refusés, car ils peuvent bloquer le serveur (`backend/src/lib/regex.ts`).

## Sauvegardes `.gpdump`

Restauration réservée à l'administrateur : fichier de 2 Go au plus, contenu décompressé (base et PDF) de 10 Go au plus
et tailles annoncées vérifiées avant toute extraction (un petit fichier piégé ne peut pas remplir le disque) ; base du
fichier ouverte avec `trusted_schema` désactivé (ses vues et déclencheurs ne peuvent pas appeler de fonctions SQL).

## Données conservées dans le navigateur

- Identifiants mémorisés sur l'écran de connexion (`localStorage`) : jamais de mot de passe ; confort voulu.
- Fichier importé dans l'outil d'analyse (IndexedDB) : effacé à la fin de la session (déconnexion, inactivité,
  session fermée).
- Préférences d'affichage (mode sombre, colonnes, ordre des onglets…) : sans donnée sensible.

## API publique

Clé d'API dans l'en-tête `X-Api-Key` uniquement : le paramètre `?api_key=` est refusé (la clé apparaîtrait dans les
journaux et l'historique). Clés créées et révoquées dans l'administration, enregistrées hachées.

## Serveur SMTP

Certificat du serveur SMTP vérifié et TLS 1.2 minimum : les identifiants SMTP ne peuvent pas être interceptés.
Serveur au certificat invalide (auto-signé, nom différent) : `SMTP_TLS_INSECURE=true` rétablit l'ancien comportement
(tout certificat, TLS 1.0), à éviter. En production, la variable du dépôt GitHub `SMTP_TLS_INSECURE` (Settings ›
Secrets and variables › Actions › Variables) est recopiée dans le `.env` à chaque déploiement.

Le mot de passe SMTP est chiffré en base (AES-256-GCM, `backend/src/lib/secrets.ts`), avec la même clé que le jeton
Asana (fichier `DB_PATH/.asana_key`, ou clé dérivée de `SESSION_SECRET`) : il ne figure pas en clair dans la base ni
dans une sauvegarde `.gpdump`. Un mot de passe encore en clair (version précédente, ancienne sauvegarde restaurée) est
chiffré au démarrage. Une sauvegarde restaurée sur un autre serveur (autre clé) rend le mot de passe illisible :
l'administration indique alors qu'aucun mot de passe n'est enregistré, il est à ressaisir.

## Conteneur Docker

L'application tourne avec l'utilisateur `node` (uid 1000), sans privilèges. Les répertoires montés depuis le serveur
doivent lui appartenir ; **une fois, avant le premier déploiement de cette version**, sur la VM :

```bash
sudo chown -R 1000:1000 "$APP_DATA_PATH/config" "$APP_DATA_PATH/data"
```

Sans cela, l'application ne peut plus écrire sa base SQLite, les PDF des CRA ni les sauvegardes.

`docker-compose.yml` : port publié sur l'interface locale de la VM seulement (`127.0.0.1:8080`, derrière le proxy
HTTPS), `no-new-privileges`, aucune capacité Linux, plafonds de mémoire et de processus
([déploiement](deploiement.md#sur-la-vm)). Image de base épinglée par digest.

## CI et déploiement

- Actions GitHub épinglées par empreinte de commit (SHA) ; Dependabot (actions, npm, image Docker) chaque semaine.
  Versions majeures de `node` (image), `@types/node` et `typescript` ignorées par Dependabot : elles font l'objet de
  lots décidés (une image Node seule divergerait de la CI ; `typescript-eslint` limite la version de TypeScript).
- Déploiement : clé d'hôte SSH de la VM vérifiée (secret `SAMU_TOOLS_HOST_FINGERPRINT`, obligatoire) ; version saisie
  à la main contrôlée (`X.Y.Z`) avant d'être utilisée dans le script exécuté sur la VM ; jeton du registre retiré de la
  VM après le téléchargement de l'image (`docker logout`) ; workflow manuel sans droits sur le dépôt
  (`permissions: {}`).

## Dépendances npm

`npm audit --omit=dev` (dépendances de l'image de production) : aucune vulnérabilité. Alertes connues et acceptées
(novembre 2026), toutes dans les outils de développement et de la campagne e2e, jamais dans l'image :

- `picomatch` ≤ 4.0.7 (élevée, ReDoS sur un motif de fichiers piégé) : aucune version corrigée publiée. Alertes
  induites sur `tinyglobby`, `fdir`, `vite`, `vitest`, `vue-tsc`, `typescript-eslint` et `playwright-bdd`.
- `minimatch` 10 et `glob` 13 (modérées) tirés par `@vue/test-utils` (via `js-beautify`) et par `allure` (rapports
  e2e) : correction seulement dans des versions majeures que ces paquets n'acceptent pas encore ; pas de forçage par
  `overrides` (paquets non testés avec ces versions).

Les motifs de fichiers de ces outils viennent de la configuration du dépôt, jamais d'une saisie extérieure : risque
très faible. Dependabot propose les versions corrigées dès leur publication ; vérifier `npm audit` (racine et `e2e/`)
à chaque mise à jour des outils.

## Requêtes et journaux

- Taille des requêtes : 100 Ko sans session ouverte, 50 Mo pour un utilisateur connecté (planning complet, modèles,
  photos). Au-delà : `413`.
- Journaux : les valeurs des paramètres d'URL sensibles (jeton, clé, mot de passe, code) sont masquées.
