# Événements / Cartographie : statuts de déploiement et calques — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** renommer l'onglet « Événements » en « Événements / Cartographie », ajouter la rubrique admin « Paramétrage des déploiements » (statuts colorés, statut par déploiement, date de mise en service) et trois calques sur la carte dont les départements colorés par statut.

**Architecture :** une table `deployment_statuses` et une colonne `affectation_projects.status_id` (module `affectation`, backend Express + Prisma, trois bases). Le front (Vue 3, Pinia) lit statuts et déploiements par deux routes, calcule le département de chaque déploiement dans le navigateur (point dans polygone sur un GeoJSON embarqué) et dessine les calques avec Leaflet.

**Tech Stack :** Node 22.23.4 (`export PATH=~/.nvm/versions/node/v22.23.4/bin:$PATH`), Express, Prisma, Vue 3, Pinia, Leaflet 1.9.4, vitest, Playwright/Cucumber (CI seulement).

**Spec :** `docs/superpowers/specs/2026-11-15-cartographie-deploiements-design.md`

## Global Constraints

- Interface en français ; branche `feat/cartographie-deploiements`, PR vers `main`, jamais de push direct.
- Aucun appel réseau nouveau : la CSP n'est pas élargie (contours servis par l'application).
- Schéma modifié dans `backend/prisma/schema.base.prisma` uniquement, puis `npm run db:schemas` et `npm run db:migration -- statuts_deploiement` (jamais à la main dans `prisma/<fournisseur>/`).
- Routes documentées : `npm run routes` régénère `backend/tests/fixtures/routes.json` et `docs/api.md`.
- Contrôles avant chaque commit : `npm run typecheck:front`, `npm run lint` (0 erreur), `npx prettier --write` sur les fichiers touchés ; tests front `npm run test:front`, tests back ciblés `npx vitest run --config backend/vitest.config.js backend/tests/<fichier> --maxWorkers=2`.
- Statut « En service » : fourni par défaut (`is_service = 1`), ni renommable ni supprimable. Départements : métropole seule (96). Version par défaut de la transparence : 60 %.
- Contours : `departements-version-simplifiee.geojson` de `gregoiredavid/france-geojson` (IGN Admin Express 2018), coordonnées arrondies à 3 décimales (~225 Ko).
- Fin de livraison (hors plan) : numéro de version, fiche `aide.html`, PR ; déploiement seulement après confirmation de la sauvegarde de la base.

## Review Focus

- Déploiement sans localisation, ou localisation sans latitude/longitude : aucun département, aucune erreur (Task 3).
- Point hors de tous les contours (mer, hors métropole) : `departementDe` renvoie `null` (Task 3).
- Département partagé par deux déploiements de statuts différents : le statut le mieux placé dans la liste l'emporte (Task 3).
- Suppression d'un statut utilisé : refusée en 409 avec les noms des SAMU concernés ; suppression/renommage de « En service » refusés (Task 2).
- Statut non « En service » : la date de mise en service n'est pas modifiée par le changement de statut (Task 2).
- Couleur de statut invalide (hors `#rrggbb`) refusée (Task 2).

---

### Task 1 : Libellé « Événements / Cartographie »

**Files :**

- Modify : `frontend/src/ilots/onglets.ts` (clé `evenements`, `libelle`)
- Modify : `frontend/src/ilots/evenements/OngletEvenements.vue` (`<h2>`)
- Modify : `frontend/pages/index.html` (libellé de l'onglet s'il y est écrit en dur), `frontend/pages/aide.html` (mentions « onglet Événements » de la carte)
- Test : `frontend/src/ilots/onglets.test.ts` (créer si absent)

**Interfaces :**

- Consumes : `libelleOnglet(cle: string): string` existant.
- Produces : `libelleOnglet('evenements') === 'Événements / Cartographie'`.

- [ ] **Step 1 : test** — `onglets.test.ts`, `it("libellé de l'onglet des événements", ...)` : `expect(libelleOnglet('evenements')).toBe('Événements / Cartographie')`.
- [ ] **Step 2 :** `npm run test:front -- onglets` → FAIL.
- [ ] **Step 3 :** changer le libellé dans `ONGLETS.evenements`, le `<h2>` de `OngletEvenements.vue`, et `rg "Événements" frontend/pages/index.html frontend/src` pour le libellé d'onglet écrit ailleurs (barre d'onglets, matrice `SectionOnglets.vue` lisent `ONGLETS` : rien à faire). Ne pas toucher aux « Événements du jour/de la semaine » de l'accueil.
- [ ] **Step 4 :** e2e : `e2e/steps/commun.js` mappe le libellé vers `data-tab` ; vérifier avec `rg -n "ongletCle|data-tab" e2e/steps` si un pas compare un libellé affiché (`getByText('Événements')`) ; si oui, adapter ce pas (regex `/Événements/`), sinon ne rien changer. `npm run test:front`, typecheck, lint → PASS.
- [ ] **Step 5 :** commit `Onglet Événements renommé « Événements / Cartographie »`.

---

### Task 2 : Statuts de déploiement — base et API

**Files :**

- Modify : `backend/prisma/schema.base.prisma` (modèle `DeploymentStatus`, champ `status_id Int?` sur `AffectationProject`) + fichiers générés par `npm run db:schemas` + migration `backend/prisma/*/migrations/*_statuts_deploiement/` créée par `npm run db:migration -- statuts_deploiement`
- Create : `backend/src/modules/affectation/statuts.service.js`, `statuts.controller.js`
- Modify : `backend/src/modules/affectation/affectation.routes.js`
- Test : `backend/tests/deploiement-statuts.test.js` (calqué sur `affectation.test.js` pour l'amorçage)

**Interfaces :**

- Produces (modèle) : `DeploymentStatus { id Int; label String @unique; color String; position Int; is_service Int @default(0) }` → table `deployment_statuses`. Migration insère « En service » (`color '#2e7d32'`, `position 0`, `is_service 1`).
- Produces (service, `statuts.service.js`) :
    - `listStatuses(): Promise<Array<{id, label, color, position, is_service}>>` trié par `position`
    - `createStatus({label, color}): Promise<Status>` (position = max + 1)
    - `updateStatus(id, {label, color}): Promise<Status>` (libellé ignoré si `is_service`)
    - `deleteStatus(id): Promise<void>` (409 si `is_service` ou utilisé : message avec les `samu_name`)
    - `reorderStatuses(ids: number[]): Promise<Status[]>` (ids = tous les statuts, sinon 400)
    - `setProjectStatus(projectId, {status_id: number|null, date_mise_en_service?: string|null}): Promise<void>` (date acceptée seulement si le statut est `is_service`, sinon ignorée ; format AAAA-MM-JJ)
    - `deploymentMap(): Promise<{statuses: Status[], deployments: Array<{id, samu_name, location_id, latitude, longitude, status_id, date_mise_en_service}>}>` (latitude/longitude de la localisation, `null` si absentes)
- Produces (routes) : `GET /affectation/deployment-statuses` et `GET /affectation/deployment-map` (`requireAuth`) ; `POST /affectation/deployment-statuses`, `PUT /affectation/deployment-statuses/:id`, `DELETE /affectation/deployment-statuses/:id`, `PUT /affectation/deployment-statuses-order` (body `{ids}`), `PUT /affectation/projects/:id/status` (`requireAdmin`).

- [ ] **Step 1 : tests** (un `it` par ligne) : liste initiale = [« En service »] ; création trie à la suite ; couleur `rouge` → 400 ; libellé vide ou doublon → 400 ; « En service » non supprimable (409), libellé non modifiable mais couleur oui ; suppression d'un statut utilisé → 409 dont le message contient le `samu_name` ; `reorder` avec ids manquants → 400 puis OK ; `setProjectStatus` sur « En service » avec date → `date_mise_en_service` enregistrée, sur autre statut avec date → date inchangée ; `deploymentMap` renvoie `latitude: null` pour un déploiement sans localisation ; un non-admin reçoit 403 sur chaque écriture, 200 sur les deux lectures.
- [ ] **Step 2 :** lancer le fichier → FAIL.
- [ ] **Step 3 :** modifier `schema.base.prisma`, puis `npm run db:schemas`, `npm run db:migration -- statuts_deploiement`, et ajouter à chaque `migration.sql` générée l'insertion de « En service » (SQL propre à chaque fournisseur, voir la migration `init` pour la forme des identifiants). Implémenter service, contrôleur (même style `h(...)` / `HttpError` que `affectation.controller.js`), routes.
- [ ] **Step 4 :** fichier de tests → PASS ; `npm run routes` ; tests `affectation.test.js` et le test de routes (`backend/tests/routes*.test.js` selon le nom réel) → PASS ; lancer la suite complète en arrière-plan avant la PR (`npm test`, > 120 s).
- [ ] **Step 5 :** commit `Statuts de déploiement : table, API et statut par déploiement`.

---

### Task 3 : Calcul du département et couleurs (logique pure)

**Files :**

- Create : `frontend/public/departements.geojson` (fichier arrondi, voir ci-dessous), `frontend/src/ilots/evenements/departements.ts`, `frontend/src/ilots/evenements/departements.test.ts`
- Create : `frontend/src/api/deploiements.ts`
- Modify : `docs/architecture.md` (source et licence des contours)

**Interfaces :**

- Produces (`api/deploiements.ts`) : types `StatutDeploiement {id; label; color; position; is_service}`, `DeploiementCarte {id; samu_name; location_id; latitude: number|null; longitude: number|null; status_id: number|null; date_mise_en_service: string|null}` ; `apiDeploiements.carte(): Promise<{statuses; deployments}>`, `.statuts()`, `.creer(d)`, `.modifier(id, d)`, `.supprimer(id)`, `.reordonner(ids)`, `.affecter(projectId, {status_id, date_mise_en_service?})`, branchés sur les routes de la Task 2 (suivre `api/carte.ts`).
- Produces (`departements.ts`) :
    - `interface Contours { features: Array<{properties: {code: string; nom: string}; geometry: {type: 'Polygon'|'MultiPolygon'; coordinates: unknown}}> }`
    - `departementDe(lat: number, lng: number, contours: Contours): {code: string; nom: string} | null`
    - `couleursDepartements(deploiements: DeploiementCarte[], statuts: StatutDeploiement[], contours: Contours): Map<string, {couleur: string; statut: string; samu: string[]}>` (clé = code département ; ignore les déploiements sans coordonnées ou sans statut ; plusieurs : statut de plus petite `position`, `samu` = tous les SAMU de ce département ayant ce statut)

- [ ] **Step 1 :** générer le fichier de contours : `python3 -I` sur `<clone>/departements-version-simplifiee.geojson`, arrondir toutes les coordonnées à 3 décimales, `json.dumps(separators=(',', ':'))`, écrire `frontend/public/departements.geojson` (~225 Ko). Clone : `gh repo clone gregoiredavid/france-geojson <dossier-scratchpad>/france-geojson -- --depth 1`. Servi sous `/vue/departements.geojson` (`base: '/vue/'`).
- [ ] **Step 2 : tests** `departements.test.ts` avec un `Contours` de trois polygones carrés fabriqués (un Polygon, un MultiPolygon, un Polygon avec trou) : point dedans → code ; point dans le trou → `null` ; point en mer → `null` ; `couleursDepartements` : déploiement sans coordonnées ignoré, sans `status_id` ignoré, deux déploiements du même département → statut de plus petite position, `samu` listant les deux si même statut. Un test de lecture sur le vrai fichier : Paris (48.8566, 2.3522) → code `75`, Marseille (43.2965, 5.3698) → `13`.
- [ ] **Step 3 :** `npm run test:front -- departements` → FAIL ; implémenter (rayon croisé, anneau extérieur moins trous, parcours de tous les polygones) ; → PASS.
- [ ] **Step 4 :** typecheck, lint, prettier. Commit `Cartographie : département d'un déploiement et couleurs par statut`.

---

### Task 4 : Rubrique « Paramétrage des déploiements » (administrateur)

**Files :**

- Create : `frontend/src/ilots/evenements/ParametrageDeploiements.vue`, `frontend/src/ilots/evenements/magasin-deploiements.ts` (store Pinia `useDeploiementsStore`), `magasin-deploiements.test.ts`
- Modify : `frontend/src/ilots/evenements/OngletEvenements.vue` (afficher la rubrique sous le formulaire, `v-if="ev.estAdmin"`)
- Test : `e2e/features/18-statuts-deploiements.feature` + `e2e/steps/statuts-deploiements.js`

**Interfaces :**

- Consumes : `apiDeploiements` (Task 3), `ev.estAdmin`.
- Produces (store) : état `{statuts: StatutDeploiement[]; deploiements: DeploiementCarte[]; erreur: string}` ; actions `charger()`, `ajouterStatut(label: string, couleur: string)`, `modifierStatut(id, {label, couleur})`, `supprimerStatut(id)`, `deplacerStatut(id, sens: -1|1)`, `affecter(projectId, statusId: number|null, date?: string|null)` ; après chaque écriture `emettre('deploiements-modifies')` (bus `@/evenements`, à déclarer dans `frontend/src/evenements.ts`).
- Produces (vue) : rubrique repliable « ▶ Paramétrage des déploiements » (même mécanique `ouvert` / `basculer` / flèche ▶▼ que `FormulaireEvenement.vue`), `data-testid="parametrage-deploiements"` ; liste des statuts (pastille de couleur, `<input type="color">`, boutons ▲▼, suppression avec `useConfirmation()`, « En service » sans suppression ni champ libellé) ; ligne d'ajout (libellé + couleur) ; tableau « SAMU / Statut (menu) / Date de mise en service (`<input type="date">` seulement si le statut choisi est `is_service`) ».

- [ ] **Step 1 : tests du store** : `charger` remplit statuts et déploiements ; `affecter` appelle l'API avec la date seulement pour un statut `is_service` ; erreur 409 de suppression → `erreur` contient le message serveur ; `emettre('deploiements-modifies')` après écriture.
- [ ] **Step 2 :** `npm run test:front -- magasin-deploiements` → FAIL ; implémenter le store → PASS.
- [ ] **Step 3 :** écrire la vue et l'insérer dans `OngletEvenements.vue` ; vérifier à l'écran (`preview_start`, onglet, ajout d'un statut, affectation à un SAMU, date) ; typecheck, lint.
- [ ] **Step 4 : e2e** (écrits ici, exécutés par la CI) : scénarios « l'administrateur ajoute un statut coloré », « affecte « En service » à un SAMU et saisit la date », « un utilisateur non administrateur ne voit pas la rubrique ».
- [ ] **Step 5 :** commit `Événements / Cartographie : rubrique de paramétrage des déploiements`.

---

### Task 5 : Calques de la carte

**Files :**

- Modify : `frontend/src/ilots/evenements/FenetreCarte.vue` (calques, contrôle, curseur), `frontend/src/ilots/evenements/carte.ts` (état des calques)
- Create : `frontend/src/ilots/evenements/calques.ts`, `calques.test.ts`
- Test : `frontend/src/ilots/evenements/carte.test.ts` (existant), scénario e2e dans `e2e/features/18-statuts-deploiements.feature`

**Interfaces :**

- Consumes : `couleursDepartements`, `Contours`, `apiDeploiements.carte()` (Task 3) ; groupes Leaflet actuels : `calque` (lieux) et marqueurs d'experts dans `FenetreCarte.vue`.
- Produces (`calques.ts`) :
    - `interface EtatCalques { departements: boolean; evenements: boolean; experts: boolean; transparence: number }` (transparence 0–100, part d'opacité retirée)
    - `etatInitial(): EtatCalques` → tous `true`, `transparence: 60` ; `lireEtat(stockage: Pick<Storage,'getItem'>): EtatCalques` (valeurs invalides ou accès impossible → `etatInitial()`) ; `ecrireEtat(stockage: Pick<Storage,'setItem'>, e: EtatCalques): void` (ignore les erreurs) ; clé `gp-carte-calques`.
    - `opaciteDepartements(transparence: number): number` = `(100 - clamp(transparence, 0, 100)) / 100 * 0.8` (0,8 = opacité maximale de remplissage).
- Produces (carte) : trois `L.LayerGroup` (`lieux`, `experts`, `departements`) ajoutés/retirés de la carte selon `EtatCalques` ; calque départements = `L.geoJSON(contoursFiltres)` ne gardant que les départements colorés, `style` `{fillColor: couleur, fillOpacity: opaciteDepartements(t), color: couleur, weight: 1}`, tooltip « <nom> : <statut> (<SAMU, …>) » ; contours chargés par `fetch('/vue/departements.geojson')` à la première activation ; panneau de commandes (3 cases à cocher « Départements », « Événements / déplacements », « Experts métier » + curseur « Transparence des départements » visible quand le calque est coché), `data-testid="carte-calques"`.

- [ ] **Step 1 : tests `calques.test.ts`** : `etatInitial()` ; `lireEtat` sur JSON invalide, valeur absente, `getItem` qui lève → `etatInitial()` ; aller-retour `ecrireEtat`/`lireEtat` ; `opaciteDepartements(0) === 0.8`, `(100) === 0`, `(60) === 0.32`, `(150) === 0` et `(-5) === 0.8`.
- [ ] **Step 2 :** `npm run test:front -- calques` → FAIL ; implémenter → PASS.
- [ ] **Step 3 :** dans `FenetreCarte.vue`, basculer lieux et experts dans leurs groupes, ajouter le calque départements et le panneau de commandes ; relire statuts et déploiements à chaque ouverture et sur `ecouter('deploiements-modifies')` ; un seul chargement des contours (mémorisé) ; échec du chargement → message `AppAlert` sans casser les autres calques. Vérification à l'écran : un SAMU « En service » à Paris colore le 75 ; décocher « Événements / déplacements » masque les pastilles de lieux, « Experts métier » masque les pastilles d'experts, curseur à 100 % rend le remplissage invisible.
- [ ] **Step 4 :** e2e : « la carte affiche et masque les calques » (cases à cocher, présence/absence de `.leaflet-interactive` coloré). Suite front, typecheck, lint, prettier → PASS.
- [ ] **Step 5 :** commit `Carte des événements : calques départements, événements et experts`.

---

### Task 6 : Livraison

**Files :** `package.json` (`version`), `frontend/pages/index.html` (via `npm run app:version -- <X.Y.Z>`), `frontend/pages/aide.html` (fiche de version + paragraphe sur le paramétrage et les calques, remplacer la phrase de la ligne 266 « onglet Événements »), `docs/api.md` (via `npm run routes`).

- [ ] **Step 1 :** version mineure suivante (3.3.0), fiche `<!-- v3.3.0 -->` au-dessus de la précédente (`badge-current` déplacé), aide mise à jour ; suite complète back en arrière-plan, suite front, typecheck, lint.
- [ ] **Step 2 :** push de la branche, `gh pr create --base main`, `mcp__ccd_pr__get_status`, surveiller la CI (e2e compris). Déploiement uniquement après confirmation explicite de la sauvegarde de la base.
