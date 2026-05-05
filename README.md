# 📊 Application de Planification des Ressources - GANTT

Application web de gestion et planification des ressources avec vue GANTT interactive, gestion des disponibilités, affectations et localisations.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## 📋 Table des matières

- [Vue d'ensemble](#-vue-densemble)
- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Utilisation](#-utilisation)
- [Gestion des utilisateurs](#-gestion-des-utilisateurs)
- [API](#-api)
- [Déploiement](#-déploiement)
- [Dépannage](#-dépannage)
- [Support](#-support)

---

## 🎯 Vue d'ensemble

Application de planification permettant de gérer les ressources humaines (experts, consultants, etc.) avec :
- **Vue GANTT** mensuelle interactive
- **Gestion des disponibilités** jour par jour
- **Affectation** aux différents projets (ANS, SAMU, Qualification, etc.)
- **Localisation** (Télétravail, PSC, SAMU, Autres)
- **Export Excel** et impression
- **Système de permissions** (Admin, Expert Métier, Utilisateur)
- **Notifications email** automatiques

### Cas d'usage principaux

1. **Planification de ressources** pour projets ANS et SAMU
2. **Suivi des disponibilités** et taux de MAD (Mise à Disposition)
3. **Gestion des localisations** (télétravail, déplacements)
4. **Export et reporting** pour la direction
5. **Réinitialisation mensuelle** des plannings

---

## ✨ Fonctionnalités

### 🔐 Authentification & Sécurité

- **Connexion sécurisée** avec hashage des mots de passe (SHA-256)
- **Multi-profils** : un utilisateur peut avoir plusieurs rôles
- **Sessions persistantes** avec gestion automatique
- **Mot de passe oublié** avec temporisation (30s)
- **Déconnexion automatique** après inactivité

### 👥 Gestion des Ressources

#### Ajout de ressource
- Nom, Prénom, Trigramme (unique)
- Taux de MAD (%)
- SAMU de rattachement
- Dates de début et fin de MAD
- Statut actif/inactif

#### Modification
- Édition de tous les champs (sauf trigramme si déjà utilisé)
- Conservation de l'historique des plannings
- Désactivation sans suppression

#### Affichage
- Liste complète avec tri par colonnes
- Badges de statut (En cours, Terminé, Non démarré)
- Indicateur de disponibilité
- Export Excel

### 📅 Planification GANTT

#### Vue mensuelle
- Sélection année/mois
- Affichage jour par jour avec distinction weekend
- Filtrage par ressource
- Totaux quotidiens et mensuels

#### Trois niveaux d'information par jour

**1. Disponibilité** (ligne 1)
- `1` - Indisponible (gris)
- `2` - Disponible pour l'ANS (vert)

**2. Affectation** (ligne 2)
- `1` - Indisponible (gris)
- `2` - En attente d'affectation (violet)
- `3` - 🚨 SAMU (Déploiement) (orange)
- `4` - 🚨 SAMU (Dev. usages) (orange foncé)
- `5` - ANS (Déploiement) (bleu)
- `6` - ANS (Dev. usages) (bleu foncé)
- `7` - Qualification (rouge)
- `8` - Divers (turquoise)

**3. Localisation** (ligne 3)
- 📞 Télétravail
- 🗼 PSC (Paris Santé Campus)
- 🚨 SAMU
- 🎤 Autres (Congrès, CFARM, EHESP...)

#### Interactions
- **Clic sur disponibilité** : Bascule 1 ↔ 2
- **Clic sur affectation** : Cycle entre toutes les valeurs
- **Clic sur localisation** : Ouvre modale de sélection
- **Bouton RAZ** : Réinitialise le mois complet (selon permissions)

#### Fonctionnalités avancées
- **Masquage/Affichage** des contrôles et légendes
- **Respect des dates MAD** : cellules désactivées hors période
- **Calcul automatique** des jours disponibles vs attendus
- **Sauvegarde automatique** à chaque modification
- **Synchronisation temps réel** avec indicateur visuel

### 📊 Export et Impression

- **Export Excel** : tableau complet avec toutes les données
- **Impression A4** : optimisée pour le format paysage
- Mise en page automatique avec légendes

### 👤 Gestion des Utilisateurs (Admin)

#### Création d'utilisateur
- Identifiant, Nom, Prénom
- Email (notifications)
- Téléphone (optionnel)
- Mot de passe initial
- Attribution de profils multiples :
  - ✅ Administrateur
  - ✅ Expert Métier (lié à une ressource)
  - ✅ Utilisateur
- Statut actif/inactif

#### Modification
- Tous les champs modifiables
- Changement de profils
- Lien avec une ressource différente
- Désactivation sans suppression

#### Réinitialisation du mot de passe
- Admin peut forcer un nouveau mot de passe
- Email envoyé automatiquement
- Mot de passe sécurisé généré (12 caractères)

### 📧 Système d'emails

#### Configuration SMTP
- Support Office 365, Gmail, autres
- Configuration via interface Admin
- Test d'envoi intégré
- Stockage sécurisé des credentials

#### Emails automatiques
- Réinitialisation de mot de passe
- Notifications (extensible)
- Templates HTML professionnels
- Gestion des erreurs avec fallback

### 🔑 Système de Permissions

#### Administrateur
- **Accès complet** à toutes les fonctionnalités
- Gestion des ressources (CRUD)
- Gestion des utilisateurs (CRUD)
- Configuration email
- Réinitialisation des mots de passe
- **Planification** : Vue et modification de toutes les ressources
- **RAZ** : Bouton visible pour toutes les ressources

#### Expert Métier
- **Planification uniquement**
- Vue sur toutes les ressources (si souhaité)
- **Filtre automatique** sur sa propre ressource à la connexion
- Modification uniquement de sa propre ligne
- **RAZ** : Bouton visible uniquement pour sa ligne

#### Utilisateur
- **Lecture seule** sur la planification
- Aucune modification possible
- Aucun accès aux ressources ou utilisateurs
- **Pas de bouton RAZ**

---

## 🏗️ Architecture

### Stack Technique

**Backend**
- Node.js + Express.js
- SQLite3 (base de données embarquée)
- Express-session (gestion sessions)
- Nodemailer (envoi emails)
- Crypto (hashage mots de passe)

**Frontend**
- HTML5 / CSS3
- JavaScript Vanilla (pas de framework)
- Fetch API (communication serveur)
- Responsive Design

### Structure des fichiers

```
projet/
├── server.js              # Serveur Express + API
├── index.html             # Application frontend complète
├── gantt.db              # Base de données SQLite
├── package.json          # Dépendances Node.js
├── README.md             # Ce fichier
└── docs/                 # Documentation additionnelle
    ├── GUIDE_EMAIL_ET_MOT_DE_PASSE_OUBLIE.md
    ├── GUIDE_MIGRATION_SENDGRID.md
    ├── CORRECTION_TRIGRAMME_EMAIL.md
    └── NOUVELLES_FONCTIONNALITES.md
```

### Base de données

#### Table `resources`
```sql
- id (PRIMARY KEY)
- nom, prenom, trigramme (identité)
- email, telephone (contact)
- taux (% MAD)
- samu (rattachement)
- actif (0/1)
- date_debut, date_fin (période MAD)
- created_at
```

#### Table `users`
```sql
- id (PRIMARY KEY)
- username (UNIQUE)
- password (hashé SHA-256)
- nom, prenom, email, telephone
- is_admin, is_expert, is_user (profils)
- resource_id (FOREIGN KEY → resources)
- actif (0/1)
- created_at
```

#### Table `schedule_data`
```sql
- id (PRIMARY KEY)
- resource_id (lien ressource)
- date_key (YYYY-MM-DD)
- type (available/activity/localisation)
- value (valeur)
- created_at
- UNIQUE(resource_id, date_key, type)
```

#### Table `email_config`
```sql
- id (PRIMARY KEY)
- host, port, user, password (config SMTP)
- updated_at
```

---

## 🚀 Installation

### Prérequis

- Node.js ≥ 14.0.0
- npm ≥ 6.0.0
- 50 Mo d'espace disque

### Installation locale

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-repo/gantt-planning.git
cd gantt-planning

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur
node server.js

# 4. Ouvrir dans le navigateur
# http://localhost:3000
```

### Installation avec Docker (optionnel)

```dockerfile
FROM node:14
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t gantt-planning .
docker run -p 3000:3000 -v $(pwd)/gantt.db:/app/gantt.db gantt-planning
```

---

## ⚙️ Configuration

### Variables d'environnement

Créer un fichier `.env` :

```env
# Port du serveur
PORT=3000

# Session
SESSION_SECRET=votre_secret_tres_long_et_complexe

# Base de données
DB_PATH=./gantt.db

# Email (optionnel - peut être configuré via l'interface)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=votre-email@domaine.com
SMTP_PASS=votre_mot_de_passe_application

# SendGrid (alternative recommandée)
# SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
# SENDGRID_FROM_EMAIL=noreply@votredomaine.com
```

### Configuration initiale

Au premier lancement :

1. **Compte administrateur par défaut**
   - Identifiant : `admin`
   - Mot de passe : `XXX`
   - ⚠️ **Changez-le immédiatement !**

2. **Configuration email** (Onglet Administration)
   - Serveur SMTP : `smtp.office365.com` (ou autre)
   - Port : `587` (TLS) ou `465` (SSL)
   - Email expéditeur
   - Mot de passe d'application (recommandé)
   - Tester l'envoi

3. **Créer les ressources**
   - Onglet Ressources
   - Ajouter vos ressources humaines

4. **Créer les utilisateurs**
   - Onglet Administration
   - Créer un utilisateur par ressource (Expert Métier)
   - Créer des comptes Admin et Utilisateur selon besoins

---

## 📖 Utilisation

### Première connexion

1. **Se connecter** avec `admin` / `XXX`
2. **Changer le mot de passe** :
   - Admin → Modifier l'utilisateur admin
   - Réinitialiser le mot de passe
   - Noter le nouveau mot de passe envoyé par email
3. **Configurer l'email** (si pas déjà fait)
4. **Créer les ressources et utilisateurs**

### Workflow quotidien

#### En tant qu'Administrateur

1. **Gestion des ressources**
   - Ajouter/Modifier/Désactiver
   - Suivre les dates de MAD
   - Exporter la liste

2. **Planification**
   - Consulter le GANTT
   - Mettre à jour les disponibilités
   - Affecter aux projets
   - Définir les localisations
   - RAZ si besoin (réinitialiser un mois)

3. **Gestion des utilisateurs**
   - Créer nouveaux comptes
   - Réinitialiser mots de passe
   - Gérer les profils

4. **Export/Reporting**
   - Export Excel du planning
   - Impression A4
   - Analyse des disponibilités

#### En tant qu'Expert Métier

1. **Connexion** avec son identifiant
2. **Planification**
   - Vue automatique sur sa ressource
   - Mise à jour de sa disponibilité quotidienne
   - Déclaration de ses affectations
   - Indication de sa localisation
3. **RAZ** de son propre planning si nécessaire
4. **Consultation** des autres ressources (optionnel)

#### En tant qu'Utilisateur

1. **Connexion** avec son identifiant
2. **Consultation** du planning en lecture seule
3. **Export/Impression** des données
4. **Pas de modification possible**

### Fonctionnalités avancées

#### Réinitialisation (RAZ) d'un mois

**Usage** : Remettre à zéro tous les compteurs d'une ressource pour le mois affiché

**Comment** :
1. Onglet Planification
2. Sélectionner le mois
3. Cliquer sur le bouton **RAZ** à droite du nom de la ressource
4. Confirmer

**Effet** :
- Toutes les disponibilités → 1 (Indisponible)
- Toutes les affectations → 1 (Indisponible)
- Toutes les localisations → supprimées

**Permissions** :
- Admin : RAZ sur toutes les ressources
- Expert : RAZ uniquement sur sa ressource
- User : Pas de RAZ

#### Masquage des contrôles

Pour gagner de la place à l'écran :
1. Cliquer sur **"▼ Masquer/Afficher"**
2. Les filtres et légendes se replient
3. Plus d'espace pour le GANTT
4. Cliquer à nouveau pour réafficher

#### Mot de passe oublié

1. Page de connexion → **"Mot de passe oublié ?"**
2. Entrer son identifiant
3. Cliquer **"Envoyer"**
4. Recevoir l'email avec nouveau mot de passe
5. ⏱️ Attendre 30 secondes avant de pouvoir redemander

**Note** : Si l'email n'est pas configuré, le mot de passe s'affiche directement dans la modale.

---

## 👥 Gestion des utilisateurs

### Création d'un utilisateur

**Étapes** :
1. Admin → Section "Gestion des utilisateurs"
2. Remplir le formulaire :
   - Identifiant (unique)
   - Nom, Prénom
   - Email (pour notifications)
   - Mot de passe initial
   - Cocher les profils souhaités
   - Si Expert Métier : sélectionner la ressource liée
3. Cliquer **"Ajouter l'utilisateur"**
4. Email envoyé automatiquement avec les identifiants

### Attribution des profils

Un utilisateur peut avoir **plusieurs profils** :

**Exemples** :
- Admin + Expert → Gestion + Planification de sa ressource
- Expert + User → Planification de sa ressource + Consultation
- Admin + Expert + User → Tous les droits (redondant mais possible)

**Recommandations** :
- **Admin seul** : Direction, RH
- **Expert seul** : Consultants, Experts terrain
- **User seul** : Stagiaires, Consultation uniquement

### Lien ressource ↔ utilisateur

**Expert Métier** :
- DOIT être lié à une ressource
- Ne peut être lié qu'à UNE ressource
- La ressource peut avoir plusieurs utilisateurs Expert

**Exemple** :
```
Ressource: DUPONT Jean (JDU)
├─ Utilisateur 1: jean.dupont (Expert)
└─ Utilisateur 2: j.dupont2 (Expert backup)
```

### Désactivation vs Suppression

**Désactivation** (recommandé) :
- Conserve l'historique
- Conserve les plannings
- Peut être réactivé
- Connexion impossible

**Suppression** (non implémentée) :
- Perte de l'historique
- Perte des plannings associés
- ⚠️ Non recommandé

---

## 🔌 API

### Authentification

**POST** `/api/login`
```json
{
  "username": "admin",
  "password": "XXX!",
  "profile": "admin"
}
```

**POST** `/api/logout`

**GET** `/api/session` (requiert authentification)

**POST** `/api/forgot-password`
```json
{
  "username": "jean.dupont"
}
```

### Ressources

**GET** `/api/resources` (requiert auth)
- Retourne toutes les ressources

**POST** `/api/resources` (requiert admin)
```json
{
  "nom": "DUPONT",
  "prenom": "Jean",
  "trigramme": "JDU",
  "email": null,
  "telephone": null,
  "taux": 100,
  "samu": "SAMU 75",
  "date_debut": "2025-01-01",
  "date_fin": "2025-12-31"
}
```

**PUT** `/api/resources/:id` (requiert admin)

**POST** `/api/resources/:id/toggle` (requiert admin)
- Active/Désactive une ressource

**DELETE** `/api/resources/:id` (requiert admin)

### Planification

**GET** `/api/schedule` (requiert auth)
- Retourne toutes les données de planning

**POST** `/api/schedule` (requiert auth)
```json
{
  "resource_id": 1,
  "date_key": "2025-10-31",
  "type": "available",
  "value": "2"
}
```

### Utilisateurs

**GET** `/api/users` (requiert admin)

**POST** `/api/users` (requiert admin)
```json
{
  "username": "jean.dupont",
  "password": "TempPass123!",
  "nom": "DUPONT",
  "prenom": "Jean",
  "email": "jean.dupont@example.com",
  "telephone": null,
  "is_admin": 0,
  "is_expert": 1,
  "is_user": 0,
  "resource_id": 1,
  "actif": 1
}
```

**PUT** `/api/users/:id` (requiert admin)

**POST** `/api/users/:id/reset-password` (requiert admin)

**DELETE** `/api/users/:id` (requiert admin)

### Email

**GET** `/api/email/config` (requiert admin)

**POST** `/api/email/config` (requiert admin)
```json
{
  "host": "smtp.office365.com",
  "port": "587",
  "user": "noreply@example.com",
  "password": "mot_de_passe_application"
}
```

**POST** `/api/email/test` (requiert admin)

---

## 🌐 Déploiement

### Déploiement sur Render.com

1. **Créer un compte** sur https://render.com

2. **Nouveau Web Service**
   - Connect GitHub repository
   - Sélectionner le dépôt
   - Build Command : `npm install`
   - Start Command : `node server.js`

3. **Variables d'environnement**
   ```
   SESSION_SECRET=votre_secret_complexe
   PORT=3000
   ```

4. **Volumes persistants** (pour gantt.db)
   - Add Disk : `/app/gantt.db`
   - Size : 1 GB

5. **Déployer**

⚠️ **Problème emails sur Render** : Le port 587 peut être bloqué
→ Utiliser SendGrid (voir guide `GUIDE_MIGRATION_SENDGRID.md`)

### Déploiement sur Heroku

```bash
# 1. Installer Heroku CLI
brew tap heroku/brew && brew install heroku

# 2. Login
heroku login

# 3. Créer l'app
heroku create mon-gantt-planning

# 4. Configurer les variables
heroku config:set SESSION_SECRET=votre_secret
heroku config:set NODE_ENV=production

# 5. Déployer
git push heroku main

# 6. Ouvrir
heroku open
```

### Déploiement sur serveur VPS

```bash
# 1. Connexion SSH
ssh user@votre-serveur.com

# 2. Installation Node.js
curl -fsSL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone du projet
git clone https://github.com/votre-repo/gantt-planning.git
cd gantt-planning

# 4. Installation
npm install --production

# 5. Configuration PM2 (process manager)
sudo npm install -g pm2
pm2 start server.js --name gantt-planning
pm2 save
pm2 startup

# 6. Nginx (reverse proxy)
sudo apt install nginx
sudo nano /etc/nginx/sites-available/gantt
```

Configuration Nginx :
```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Activer et redémarrer
sudo ln -s /etc/nginx/sites-available/gantt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL/HTTPS avec Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.com
```

---

## 🐛 Dépannage

### Problème : Erreur de connexion à la base de données

**Symptômes** : `SQLITE_CANTOPEN` ou `database locked`

**Solutions** :
1. Vérifier les permissions du fichier `gantt.db`
   ```bash
   chmod 666 gantt.db
   ```
2. Vérifier que le répertoire est accessible en écriture
3. Redémarrer le serveur

### Problème : Email timeout sur Render

**Symptômes** : `ETIMEDOUT` lors de l'envoi d'email

**Solutions** :
1. **Option 1** : Essayer le port 465 (SSL)
2. **Option 2** : Migrer vers SendGrid (recommandé)
   - Voir `GUIDE_MIGRATION_SENDGRID.md`
3. **Option 3** : Utiliser Gmail avec mot de passe d'application

### Problème : Mot de passe oublié ne fonctionne pas

**Symptômes** : Pas d'email reçu

**Diagnostic** :
1. Vérifier la configuration SMTP dans Admin
2. Tester l'envoi depuis l'interface Admin
3. Vérifier les logs du serveur
4. Le mot de passe s'affiche dans la modale si l'email échoue

**Solutions** : Voir `DIAGNOSTIC_MOT_DE_PASSE_OUBLIE.md`

### Problème : Erreur lors de l'ajout de ressource

**Symptômes** : `Erreur ajout ressource` ou `NOT NULL constraint`

**Causes** :
1. Trigramme déjà utilisé
2. Champ email manquant (version ancienne)

**Solutions** :
1. Choisir un trigramme différent
2. Mettre à jour server.js (migration automatique)
3. Voir `CORRECTION_TRIGRAMME_EMAIL.md`

### Problème : Session expirée constamment

**Causes** :
1. `SESSION_SECRET` change à chaque redémarrage
2. Cookie non persistant

**Solutions** :
1. Définir `SESSION_SECRET` en variable d'environnement
2. Vérifier la configuration des cookies
3. Redémarrer le navigateur

### Problème : Planning ne se sauvegarde pas

**Symptômes** : Modifications perdues après rechargement

**Diagnostic** :
1. Ouvrir la console (F12)
2. Chercher les erreurs réseau
3. Vérifier l'indicateur de synchronisation

**Solutions** :
1. Vérifier la connexion réseau
2. Vérifier que l'utilisateur est connecté
3. Vérifier les permissions (Expert vs User)

---

## 📚 Documentation additionnelle

- `GUIDE_EMAIL_ET_MOT_DE_PASSE_OUBLIE.md` - Configuration emails et mot de passe oublié
- `GUIDE_MIGRATION_SENDGRID.md` - Migration vers SendGrid pour emails fiables
- `DIAGNOSTIC_MOT_DE_PASSE_OUBLIE.md` - Diagnostiquer les problèmes d'email
- `CORRECTION_TRIGRAMME_EMAIL.md` - Migration base de données (email nullable)
- `NOUVELLES_FONCTIONNALITES.md` - Dernières fonctionnalités ajoutées
- `CORRECTION_AJOUT_RESSOURCE.md` - Correction bug ajout ressource

---

## 🤝 Support

### Obtenir de l'aide

1. **Consulter la documentation** dans le dossier `/docs`
2. **Vérifier les logs** du serveur
3. **Ouvrir une issue** sur GitHub (si applicable)
4. **Contacter l'administrateur** système

### Logs et debug

**Activer les logs détaillés** :
```bash
# Linux/Mac
DEBUG=* node server.js

# Windows
set DEBUG=* & node server.js
```

**Logs importants** :
- `📧 sendEmail appelé` - Tentative d'envoi email
- `✅ Email envoyé` - Succès email
- `❌ Erreur` - Échec avec détails
- `Migration: ...` - Migration base de données
- `🔄 Tentative ...` - Actions en cours

---

## 🔄 Mises à jour

### Version actuelle : 1.0.0

**Nouveautés** :
- ✅ Système de permissions complet
- ✅ Mot de passe oublié avec temporisation
- ✅ RAZ selon profil
- ✅ Filtrage automatique Expert Métier
- ✅ Masquage/affichage des contrôles
- ✅ Emojis dans les localisations
- ✅ Migration email nullable
- ✅ Vérification trigramme unique

**À venir** :
- 🔜 Calendrier de congés
- 🔜 Notifications push
- 🔜 Export PDF
- 🔜 Vue hebdomadaire
- 🔜 Statistiques avancées
- 🔜 Import CSV

---

## 📝 License

MIT License - Voir le fichier LICENSE pour plus de détails

---

## 👏 Remerciements

Développé avec ❤️ par Claude

**Technologies utilisées** :
- Node.js & Express
- SQLite3
- Nodemailer
- JavaScript Vanilla
- HTML5 / CSS3

---

## 🎯 Feuille de route

### Court terme (1-3 mois)
- [ ] Import/Export CSV des ressources
- [ ] Calendrier des congés et jours fériés
- [ ] Notifications par email des modifications
- [ ] Vue hebdomadaire du planning

### Moyen terme (3-6 mois)
- [ ] Statistiques et tableaux de bord
- [ ] Export PDF du planning
- [ ] Application mobile (PWA)
- [ ] Intégration calendrier Outlook/Google

### Long terme (6-12 mois)
- [ ] Multi-tenancy (plusieurs organisations)
- [ ] API REST complète documentée
- [ ] Webhooks pour intégrations
- [ ] Système de commentaires
- [ ] Historique et audit trail

---

**Dernière mise à jour** : 31 octobre 2025
**Version** : 1.0.0
