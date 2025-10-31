import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import session from 'express-session';
import nodemailer from 'nodemailer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(session({
    secret: 'gantt-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Initialiser la base de données SQLite
const database = new sqlite3.Database('data.db', (err) => {
    if (err) {
        console.error('Erreur connexion DB:', err);
    } else {
        console.log('Connecté à SQLite');
        initDB();
    }
});

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Configuration email
let emailConfig = {
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    user: '',
    password: ''
};

// Créer transporteur email avec options pour Render.com
function createEmailTransporter() {
    if (!emailConfig.user || !emailConfig.password) {
        return null;
    }
    
    return nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.password
        },
        // Options pour résoudre les problèmes sur Render.com
        connectionTimeout: 10000, // 10 secondes
        greetingTimeout: 10000,
        socketTimeout: 10000,
        // Tenter avec TLS
        requireTLS: true,
        tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false
        }
    });
}

// Envoyer un email
async function sendEmail(to, subject, html) {
    console.log('📧 sendEmail appelé:');
    console.log('   - Destinataire:', to);
    console.log('   - Sujet:', subject);
    console.log('   - Config user:', emailConfig.user ? 'Défini' : 'NON DÉFINI');
    console.log('   - Config password:', emailConfig.password ? 'Défini' : 'NON DÉFINI');
    console.log('   - Config host:', emailConfig.host);
    console.log('   - Config port:', emailConfig.port);
    
    const transporter = createEmailTransporter();
    
    if (!transporter) {
        console.error('❌ Transporteur email null - configuration manquante');
        throw new Error('Configuration email non définie. Veuillez configurer les paramètres SMTP dans l\'onglet Administration.');
    }

    try {
        console.log('🔄 Tentative d\'envoi email...');
        const info = await transporter.sendMail({
            from: `"Planification GANTT" <${emailConfig.user}>`,
            to: to,
            subject: subject,
            html: html
        });
        
        console.log('✅ Email envoyé avec succès! Message ID:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Erreur détaillée envoi email:');
        console.error('   - Message:', error.message);
        console.error('   - Code:', error.code);
        console.error('   - Command:', error.command);
        console.error('   - Stack:', error.stack);
        throw error;
    }
}

// Initialiser les tables
function initDB() {
 database.run(`
    CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        trigramme TEXT NOT NULL,
        email TEXT,
        telephone TEXT,
        taux REAL NOT NULL,
        samu TEXT NOT NULL,
        actif INTEGER DEFAULT 1,
        date_debut TEXT,
        date_fin TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error('Erreur création table resources:', err);
    } else {
        // Vérifier et migrer la colonne email si nécessaire
        database.all(`PRAGMA table_info(resources)`, [], (pragmaErr, columns) => {
            if (!pragmaErr && columns) {
                const emailCol = columns.find(col => col.name === 'email');
                // Si email existe et est NOT NULL, on doit recréer la table
                if (emailCol && emailCol.notnull === 1) {
                    console.log('Migration: Rendre email nullable dans resources...');
                    database.serialize(() => {
                        database.run(`CREATE TABLE resources_new (
                            id INTEGER PRIMARY KEY,
                            nom TEXT NOT NULL,
                            prenom TEXT NOT NULL,
                            trigramme TEXT NOT NULL,
                            email TEXT,
                            telephone TEXT,
                            taux REAL NOT NULL,
                            samu TEXT NOT NULL,
                            actif INTEGER DEFAULT 1,
                            date_debut TEXT,
                            date_fin TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`);
                        
                        database.run(`INSERT INTO resources_new SELECT * FROM resources`);
                        database.run(`DROP TABLE resources`);
                        database.run(`ALTER TABLE resources_new RENAME TO resources`);
                        console.log('✅ Migration terminée: email est maintenant nullable');
                    });
                }
            }
        });
    }
});

    database.run(`
        CREATE TABLE IF NOT EXISTS schedule_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date_key TEXT NOT NULL,
            type TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(resource_id, date_key, type)
        )
    `, (err) => {
        if (err) console.error('Erreur création table schedule_data:', err);
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            email TEXT NOT NULL,
            telephone TEXT,
            is_admin INTEGER DEFAULT 0,
            is_expert INTEGER DEFAULT 0,
            is_user INTEGER DEFAULT 0,
            resource_id INTEGER,
            actif INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table users:', err);
        } else {
            // Vérifier si la colonne telephone existe
            database.get(`PRAGMA table_info(users)`, [], (err, rows) => {
                if (!err) {
                    database.all(`PRAGMA table_info(users)`, [], (err, columns) => {
                        const hasTelephone = columns.some(col => col.name === 'telephone');
                        
                        if (!hasTelephone) {
                            console.log('⚠️  Migration: Ajout de la colonne telephone à la table users...');
                            database.run(`ALTER TABLE users ADD COLUMN telephone TEXT`, (err) => {
                                if (err) {
                                    console.error('❌ Erreur ajout colonne telephone:', err.message);
                                } else {
                                    console.log('✅ Colonne telephone ajoutée avec succès');
                                }
                            });
                        } else {
                            console.log('✅ Colonne telephone déjà présente');
                        }
                    });
                }
            });
            
            database.get('SELECT * FROM users WHERE is_admin = 1', [], (err, row) => {
                if (!row) {
                    database.run(`
                        INSERT INTO users (username, password, nom, prenom, email, is_admin, is_expert, is_user)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, ['admin', hashPassword('Admin2025!'), 'Administrateur', 'Système', 'admin@example.com', 1, 0, 0], (err) => {
                        if (err) {
                            console.error('Erreur création admin:', err);
                        } else {
                            console.log('Compte admin créé: admin / Admin2025!');
                        }
                    });
                }
            });
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS email_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            secure INTEGER DEFAULT 0,
            user TEXT NOT NULL,
            password TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table email_config:', err);
        } else {
            // Charger la configuration email existante
            loadEmailConfig();
        }
    });
}

// Charger la configuration email depuis la base de données
function loadEmailConfig() {
    database.get('SELECT * FROM email_config WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('Erreur chargement config email:', err);
        } else if (row) {
            emailConfig = {
                host: row.host,
                port: row.port,
                secure: row.secure === 1,
                user: row.user,
                password: row.password
            };
            console.log('Configuration email chargée depuis la base de données');
        }
    });
}

// Middleware d'authentification
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Non authentifié' });
    }
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.activeProfile === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Accès refusé - Admin uniquement' });
    }
}

// ==================== API AUTHENTIFICATION ====================

app.post('/api/login', (req, res) => {
    const { username, password, profile } = req.body;
    
    if (!username || !password || !profile) {
        return res.status(400).json({ error: 'Username, password et profil requis' });
    }

    const hashedPassword = hashPassword(password);
    
    database.get('SELECT * FROM users WHERE username = ? AND password = ? AND actif = 1', 
        [username, hashedPassword], 
        (err, user) => {
            if (err) {
                console.error('Erreur login:', err);
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'Identifiants incorrects' });
            }
            
            // Vérifier si l'utilisateur a le droit d'utiliser ce profil
            let hasProfile = false;
            let profileField = '';
            
            switch(profile) {
                case 'admin':
                    hasProfile = user.is_admin === 1;
                    profileField = 'is_admin';
                    break;
                case 'expert':
                    hasProfile = user.is_expert === 1;
                    profileField = 'is_expert';
                    break;
                case 'user':
                    hasProfile = user.is_user === 1;
                    profileField = 'is_user';
                    break;
                default:
                    return res.status(400).json({ error: 'Profil invalide' });
            }
            
            if (!hasProfile) {
                return res.status(403).json({ 
                    error: `Vous n'êtes pas autorisé à utiliser le profil "${profile === 'admin' ? 'Administrateur' : profile === 'expert' ? 'Expert métier' : 'Utilisateur'}". Veuillez sélectionner un profil pour lequel vous avez les droits.` 
                });
            }
            
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.activeProfile = profile;
            req.session.nom = user.nom;
            req.session.prenom = user.prenom;
            req.session.resourceId = user.resource_id;
            
            res.json({ 
                success: true, 
                user: { 
                    id: user.id,
                    username: user.username,
                    nom: user.nom,
                    prenom: user.prenom,
                    activeProfile: profile,
                    resourceId: user.resource_id
                }
            });
        }
    );
});

app.get('/api/user/profiles', (req, res) => {
    const { username } = req.query;
    
    if (!username) {
        return res.status(400).json({ error: 'Username requis' });
    }
    
    database.get('SELECT is_admin, is_expert, is_user FROM users WHERE username = ? AND actif = 1', 
        [username], 
        (err, user) => {
            if (err) {
                console.error('Erreur récupération profils:', err);
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            
            if (!user) {
                return res.json({ profiles: [] });
            }
            
            const profiles = [];
            if (user.is_admin === 1) profiles.push('admin');
            if (user.is_expert === 1) profiles.push('expert');
            if (user.is_user === 1) profiles.push('user');
            
            res.json({ profiles });
        }
    );
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur logout' });
        }
        res.json({ success: true });
    });
});

// Stockage en mémoire des demandes de reset (username -> timestamp)
const resetPasswordRequests = new Map();

app.post('/api/forgot-password', async (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Nom d\'utilisateur requis' });
    }
    
    // Vérifier la temporisation de 30 secondes
    const lastRequest = resetPasswordRequests.get(username);
    const now = Date.now();
    
    if (lastRequest && (now - lastRequest) < 30000) {
        const remainingSeconds = Math.ceil((30000 - (now - lastRequest)) / 1000);
        return res.status(429).json({ 
            error: `Veuillez attendre ${remainingSeconds} secondes avant de redemander un nouveau mot de passe`,
            remainingSeconds 
        });
    }
    
    // Rechercher l'utilisateur
    database.get('SELECT * FROM users WHERE username = ? AND actif = 1', [username], async (err, user) => {
        if (err) {
            console.error('Erreur recherche user:', err);
            // On renvoie un message générique pour la sécurité
            return res.json({ success: true, message: 'Si cet utilisateur existe, un email a été envoyé' });
        }
        
        if (!user || !user.email) {
            // On renvoie un message générique pour ne pas révéler si l'utilisateur existe
            return res.json({ success: true, message: 'Si cet utilisateur existe, un email a été envoyé' });
        }
        
        // Générer un nouveau mot de passe
        const newPassword = generateRandomPassword();
        const hashedPassword = hashPassword(newPassword);
        
        // Mettre à jour le mot de passe
        database.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], async (err) => {
            if (err) {
                console.error('Erreur update password:', err);
                return res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
            }
            
            // Enregistrer la demande avec timestamp
            resetPasswordRequests.set(username, now);
            
            // Nettoyer les anciennes demandes (plus de 5 minutes)
            for (const [key, timestamp] of resetPasswordRequests.entries()) {
                if (now - timestamp > 300000) {
                    resetPasswordRequests.delete(key);
                }
            }
            
            // Envoyer l'email
            let emailSent = false;
            let emailError = null;
            
            console.log(`🔄 Tentative d'envoi email pour reset password à: ${user.email}`);
            
            try {
                await sendEmail(
                    user.email,
                    'Réinitialisation de votre mot de passe - Planification GANTT',
                    `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2c3e50;">Réinitialisation de mot de passe</h2>
                        <p>Bonjour ${user.prenom} ${user.nom},</p>
                        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
                        <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Nom d'utilisateur :</strong> ${user.username}</p>
                            <p style="margin: 5px 0;"><strong>Nouveau mot de passe :</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 3px; font-size: 16px;">${newPassword}</code></p>
                        </div>
                        <p style="color: #e74c3c; font-weight: bold;">⚠️ Pour des raisons de sécurité, veuillez changer ce mot de passe dès votre première connexion.</p>
                        <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">Si vous n'avez pas demandé cette réinitialisation, veuillez contacter un administrateur immédiatement.</p>
                    </div>
                    `
                );
                emailSent = true;
                console.log(`✅ Email envoyé avec succès pour reset password`);
            } catch (error) {
                emailSent = false;
                emailError = error.message || 'Erreur inconnue';
                console.error('❌ Erreur envoi email forgot password:', error);
                console.error('Détails erreur:', emailError);
            }
            
            if (emailSent) {
                res.json({ 
                    success: true, 
                    message: 'Un nouveau mot de passe a été envoyé à votre adresse email',
                    emailSent: true 
                });
            } else {
                // Si l'email échoue, on renvoie le mot de passe dans la réponse (temporaire pour debug)
                console.log(`⚠️ Mot de passe généré mais email non envoyé: ${newPassword}`);
                res.json({ 
                    success: true, 
                    message: `Mot de passe réinitialisé mais l'email n'a pas pu être envoyé. Votre nouveau mot de passe est : ${newPassword}`,
                    emailSent: false,
                    tempPassword: newPassword,  // ATTENTION: À retirer en production
                    emailError: emailError
                });
            }
        });
    });
});

// Fonction pour générer un mot de passe aléatoire
function generateRandomPassword() {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + symbols;
    
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

app.get('/api/session', requireAuth, (req, res) => {
    res.json({
        userId: req.session.userId,
        username: req.session.username,
        activeProfile: req.session.activeProfile,
        nom: req.session.nom,
        prenom: req.session.prenom,
        resourceId: req.session.resourceId
    });
});

// ==================== API RESSOURCES ====================

app.get('/api/resources', requireAuth, (req, res) => {
    database.all('SELECT * FROM resources ORDER BY prenom', (err, rows) => {
        if (err) {
            console.error('Erreur récup resources:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.post('/api/resources', requireAdmin, (req, res) => {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin } = req.body;
    
    // Vérifier si le trigramme existe déjà
    database.get('SELECT id FROM resources WHERE trigramme = ? AND actif = 1', [trigramme], (err, existing) => {
        if (err) {
            console.error('Erreur vérification trigramme:', err);
            return res.status(500).json({ error: 'Erreur lors de la vérification du trigramme' });
        }
        
        if (existing) {
            return res.status(400).json({ error: `Le trigramme "${trigramme}" est déjà utilisé par une ressource active` });
        }
        
        // Si le trigramme est libre, on peut insérer
        database.run(
            `INSERT INTO resources (nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin],
            function(err) {
                if (err) {
                    console.error('Erreur ajout resource:', err);
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ id: this.lastID, success: true });
                }
            }
        );
    });
});

app.put('/api/resources/:id', requireAdmin, (req, res) => {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin } = req.body;
    const { id } = req.params;
    
    // Vérifier si le trigramme existe déjà (sauf pour cette ressource)
    database.get('SELECT id FROM resources WHERE trigramme = ? AND actif = 1 AND id != ?', [trigramme, id], (err, existing) => {
        if (err) {
            console.error('Erreur vérification trigramme:', err);
            return res.status(500).json({ error: 'Erreur lors de la vérification du trigramme' });
        }
        
        if (existing) {
            return res.status(400).json({ error: `Le trigramme "${trigramme}" est déjà utilisé par une autre ressource` });
        }
        
        // Si le trigramme est libre, on peut mettre à jour
        database.run(
            `UPDATE resources 
             SET nom = ?, prenom = ?, trigramme = ?, email = ?, telephone = ?, taux = ?, samu = ?, date_debut = ?, date_fin = ?
             WHERE id = ?`,
            [nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, id],
            (err) => {
                if (err) {
                    console.error('Erreur update resource:', err);
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ success: true });
                }
            }
        );
    });
});

app.post('/api/resources/:id/toggle', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.get('SELECT actif FROM resources WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erreur get resource:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        
        const newActif = row.actif === 1 ? 0 : 1;
        
        database.run('UPDATE resources SET actif = ? WHERE id = ?', [newActif, id], (err) => {
            if (err) {
                console.error('Erreur toggle resource:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, actif: newActif });
            }
        });
    });
});

app.delete('/api/resources/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.get('SELECT COUNT(*) as count FROM schedule_data WHERE resource_id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erreur vérification:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (row.count > 0) {
            res.status(400).json({ error: 'Impossible de supprimer : des données de planification existent pour cette ressource' });
            return;
        }
        
        database.run('DELETE FROM resources WHERE id = ?', [id], (err) => {
            if (err) {
                console.error('Erreur suppression resource:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        });
    });
});

// ==================== API PLANIFICATION ====================

app.get('/api/schedule', requireAuth, (req, res) => {
    database.all('SELECT * FROM schedule_data', (err, rows) => {
        if (err) {
            console.error('Erreur récup schedule:', err);
            res.status(500).json({ error: err.message });
        } else {
            // Transformer les lignes en objet avec clés composées
            const scheduleData = {};
            (rows || []).forEach(row => {
                const key = `${row.resource_id}_${row.type}_${row.date_key}`;
                scheduleData[key] = row.value;
            });
            res.json(scheduleData);
        }
    });
});

app.post('/api/schedule', requireAuth, (req, res) => {
    const scheduleData = req.body;
    
    if (!scheduleData || typeof scheduleData !== 'object') {
        return res.json({ success: true, saved: 0 });
    }

    const updates = Object.entries(scheduleData).map(([key, value]) => ({ key, value }));
    
    if (updates.length === 0) {
        return res.json({ success: true, saved: 0 });
    }

    let completed = 0;
    const total = updates.length;

    updates.forEach(({ key, value }) => {
        const parts = key.split('_');
        const resourceId = parts[0];
        const type = parts[1];
        const dateKey = parts.slice(2).join('-');
        
        // Vérification des droits pour Expert métier
        if (req.session.activeProfile === 'expert') {
            // L'expert ne peut modifier que sa propre ligne
            if (parseInt(resourceId) !== req.session.resourceId) {
                completed++;
                if (completed === total) {
                    res.json({ success: true, saved: total });
                }
                return;
            }
        }
        
        // Vérification des droits pour Utilisateur
        if (req.session.activeProfile === 'user') {
            // L'utilisateur ne peut pas modifier la disponibilité
            if (type === 'available') {
                completed++;
                if (completed === total) {
                    res.json({ success: true, saved: total });
                }
                return;
            }
        }
        
        database.run(
            `INSERT INTO schedule_data (resource_id, date_key, type, value)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(resource_id, date_key, type) 
             DO UPDATE SET value = excluded.value`,
            [resourceId, dateKey, type, value],
            (err) => {
                if (err) console.error('Erreur insert schedule:', err);
                completed++;
                if (completed === total) {
                    res.json({ success: true, saved: total });
                }
            }
        );
    });
});

app.post('/api/schedule/save', requireAuth, (req, res) => {
    const { updates } = req.body;
    
    if (!updates || updates.length === 0) {
        return res.json({ success: true, saved: 0 });
    }

    let completed = 0;
    const total = updates.length;

    updates.forEach(({ key, value }) => {
        const parts = key.split('_');
        const resourceId = parts[0];
        const type = parts[1];
        const dateKey = parts.slice(2).join('_');
        
        // Vérification des droits pour Expert métier
        if (req.session.activeProfile === 'expert') {
            // L'expert ne peut modifier que sa propre ligne
            if (parseInt(resourceId) !== req.session.resourceId) {
                completed++;
                if (completed === total) {
                    res.json({ success: true, saved: total });
                }
                return;
            }
        }
        
        database.run(
            `INSERT INTO schedule_data (resource_id, date_key, type, value)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(resource_id, date_key, type) 
             DO UPDATE SET value = excluded.value`,
            [resourceId, dateKey, type, value],
            (err) => {
                if (err) console.error('Erreur insert schedule:', err);
                completed++;
                if (completed === total) {
                    res.json({ success: true, saved: total });
                }
            }
        );
    });
});

// ==================== API UTILISATEURS ====================

app.get('/api/users', requireAdmin, (req, res) => {
    database.all(`
        SELECT u.*, r.trigramme as resource_trigramme 
        FROM users u 
        LEFT JOIN resources r ON u.resource_id = r.id
        ORDER BY u.username
    `, (err, rows) => {
        if (err) {
            console.error('Erreur récup users:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, resource_id, sendEmail: shouldSendEmail } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username et password requis' });
    }

    const hashedPassword = hashPassword(password);
    
    database.run(
        `INSERT INTO users (username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, resource_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, nom, prenom, email, telephone || null, is_admin ? 1 : 0, is_expert ? 1 : 0, is_user ? 1 : 0, resource_id || null],
        async function(err) {
            if (err) {
                console.error('Erreur ajout user:', err);
                if (err.message.includes('UNIQUE')) {
                    res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
                } else {
                    res.status(500).json({ error: err.message });
                }
            } else {
                let emailSent = false;
                
                // Envoyer l'email si demandé
                if (shouldSendEmail) {
                    try {
                        const roles = [];
                        if (is_admin) roles.push('Administrateur');
                        if (is_expert) roles.push('Expert Métier');
                        if (is_user) roles.push('Utilisateur');
                        const roleText = roles.join(', ');
                        
                        await sendEmail(
                            email,
                            'Création de votre compte - Planification GANTT',
                            `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #2c3e50;">Bienvenue ${prenom} ${nom} !</h2>
                                <p>Votre compte a été créé avec succès sur la plateforme de Planification GANTT.</p>
                                <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
                                    <p style="margin: 5px 0;"><strong>Nom d'utilisateur :</strong> ${username}</p>
                                    <p style="margin: 5px 0;"><strong>Mot de passe :</strong> ${password}</p>
                                    <p style="margin: 5px 0;"><strong>Profil(s) :</strong> ${roleText}</p>
                                </div>
                                <p style="color: #e74c3c; font-weight: bold;">⚠️ Pour des raisons de sécurité, veuillez changer votre mot de passe lors de votre première connexion.</p>
                                <p>Vous pouvez vous connecter à l'adresse : <a href="${req.protocol}://${req.get('host')}">${req.protocol}://${req.get('host')}</a></p>
                                <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</p>
                            </div>
                            `
                        );
                        emailSent = true;
                    } catch (emailError) {
                        console.error('Erreur envoi email:', emailError);
                    }
                }
                
                res.json({ id: this.lastID, success: true, emailSent });
            }
        }
    );
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
    const { nom, prenom, email, is_admin, is_expert, is_user, resource_id } = req.body;
    const { id } = req.params;
    
    database.run(
        `UPDATE users 
         SET nom = ?, prenom = ?, email = ?, is_admin = ?, is_expert = ?, is_user = ?, resource_id = ?
         WHERE id = ?`,
        [nom, prenom, email, is_admin ? 1 : 0, is_expert ? 1 : 0, is_user ? 1 : 0, resource_id || null, id],
        (err) => {
            if (err) {
                console.error('Erreur update user:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.get('SELECT is_admin FROM users WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erreur get user:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (row && row.is_admin === 1) {
            database.get('SELECT COUNT(*) as count FROM users WHERE is_admin = 1', [], (err2, countRow) => {
                if (err2 || countRow.count <= 1) {
                    res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur' });
                    return;
                }
                
                deleteUserRecord(id, res);
            });
        } else {
            deleteUserRecord(id, res);
        }
    });
});

function deleteUserRecord(id, res) {
    database.run('DELETE FROM users WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Erreur suppression user:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
}

app.post('/api/users/:id/toggle', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.get('SELECT actif FROM users WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erreur get user:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        
        const newActif = row.actif === 1 ? 0 : 1;
        
        database.run('UPDATE users SET actif = ? WHERE id = ?', [newActif, id], (err) => {
            if (err) {
                console.error('Erreur toggle user:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, actif: newActif });
            }
        });
    });
});

app.post('/api/users/:id/reset-password', requireAdmin, async (req, res) => {
    const { newPassword, sendEmail: shouldSendEmail } = req.body;
    const { id } = req.params;
    
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }
    
    const hashedPassword = hashPassword(newPassword);
    
    database.get('SELECT * FROM users WHERE id = ?', [id], async (err, user) => {
        if (err) {
            console.error('Erreur récupération user:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        database.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id], async (err) => {
            if (err) {
                console.error('Erreur reset password:', err);
                return res.status(500).json({ error: err.message });
            }
            
            let emailSent = false;
            
            // Envoyer l'email si demandé
            if (shouldSendEmail) {
                try {
                    await sendEmail(
                        user.email,
                        'Réinitialisation de votre mot de passe - Planification GANTT',
                        `
                        <h2>Réinitialisation de votre mot de passe</h2>
                        <p>Bonjour ${user.prenom} ${user.nom},</p>
                        <p>Votre mot de passe a été réinitialisé par un administrateur.</p>
                        <p><strong>Nouveau mot de passe :</strong> <code style="background-color: #f0f0f0; padding: 5px 10px; border-radius: 3px; font-size: 16px;">${newPassword}</code></p>
                        <p>Nom d'utilisateur : <strong>${user.username}</strong></p>
                        <p>Nous vous recommandons de changer ce mot de passe lors de votre première connexion.</p>
                        <hr>
                        <p style="color: #7f8c8d; font-size: 12px;">Ceci est un email automatique, merci de ne pas y répondre.</p>
                        `
                    );
                    emailSent = true;
                } catch (emailError) {
                    console.error('Erreur envoi email reset:', emailError);
                    // On continue même si l'email échoue
                }
            }
            
            res.json({ success: true, emailSent });
        });
    });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { username, nom, prenom, email, resource_id, is_admin, is_expert, is_user, actif } = req.body;
    
    if (!username || !nom || !prenom || !email) {
        return res.status(400).json({ error: 'Tous les champs requis doivent être remplis' });
    }
    
    // Vérifier qu'au moins un profil est sélectionné
    if (!is_admin && !is_expert && !is_user) {
        return res.status(400).json({ error: 'Au moins un profil doit être sélectionné' });
    }
    
    // Vérifier si le username existe déjà pour un autre utilisateur
    database.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, id], (err, row) => {
        if (err) {
            console.error('Erreur check username:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (row) {
            return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
        }
        
        // Mettre à jour l'utilisateur
        database.run(
            `UPDATE users 
             SET username = ?, nom = ?, prenom = ?, email = ?, resource_id = ?, 
                 is_admin = ?, is_expert = ?, is_user = ?, actif = ?
             WHERE id = ?`,
            [username, nom, prenom, email, resource_id, is_admin ? 1 : 0, is_expert ? 1 : 0, is_user ? 1 : 0, actif ? 1 : 0, id],
            (err) => {
                if (err) {
                    console.error('Erreur update user:', err);
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ success: true });
                }
            }
        );
    });
});

// ==================== API EXPORT ====================

app.get('/api/export/resources', requireAuth, (req, res) => {
    database.all('SELECT * FROM resources ORDER BY prenom', (err, rows) => {
        if (err) {
            console.error('Erreur export resources:', err);
            res.status(500).json({ error: err.message });
        } else {
            let csv = 'Nom,Prénom,Trigramme,Email,Téléphone,Taux MAD (%),SAMU,Actif\n';
            (rows || []).forEach(r => {
                csv += `"${r.nom}","${r.prenom}","${r.trigramme}","${r.email}","${r.telephone || ''}",${r.taux},"${r.samu}","${r.actif ? 'Oui' : 'Non'}"\n`;
            });
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=ressources.csv');
            res.send(csv);
        }
    });
});

app.get('/api/export/gantt', requireAuth, (req, res) => {
    const { year, month } = req.query;
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    database.all('SELECT * FROM resources WHERE actif = 1 ORDER BY prenom', (err, resources) => {
        if (err) {
            console.error('Erreur export gantt resources:', err);
            res.status(500).json({ error: err.message });
            return;
        }

        database.all('SELECT * FROM schedule_data', (err, scheduleRows) => {
            if (err) {
                console.error('Erreur export gantt schedule:', err);
                res.status(500).json({ error: err.message });
                return;
            }

            const scheduleData = {};
            (scheduleRows || []).forEach(row => {
                const key = `${row.resource_id}_${row.type}_${row.date_key}`;
                scheduleData[key] = row.value;
            });

            const lastDay = new Date(year, parseInt(month) + 1, 0).getDate();
            let csv = `Calendrier de Planification - ${monthNames[month]} ${year}\n\n`;
            
            csv += 'Ressource,Nb jours Dispo,Jours MAD attendus';
            for (let day = 1; day <= lastDay; day++) {
                csv += `,${day}`;
            }
            csv += '\n';

            resources.forEach(resource => {
                let dispoCount = 0;
                let workDays = 0;
                
                for (let day = 1; day <= lastDay; day++) {
                    const date = new Date(year, parseInt(month), day);
                    if (date.getDay() !== 0 && date.getDay() !== 6) {
                        workDays++;
                    }
                    const dateKey = `${year}-${month}-${day}`;
                    const key = `${resource.id}_available_${dateKey}`;
                    if (scheduleData[key] === '2') dispoCount++;
                }

                const expectedDays = (workDays * resource.taux / 100).toFixed(1);

                csv += `"${resource.prenom} ${resource.nom} (${resource.trigramme}) - Disponibilité",${dispoCount},${expectedDays}`;
                
                for (let day = 1; day <= lastDay; day++) {
                    const dateKey = `${year}-${month}-${day}`;
                    const key = `${resource.id}_available_${dateKey}`;
                    csv += `,${scheduleData[key] || '1'}`;
                }
                csv += '\n';

                csv += `"${resource.prenom} ${resource.nom} (${resource.trigramme}) - Activités",,`;
                
                for (let day = 1; day <= lastDay; day++) {
                    const dateKey = `${year}-${month}-${day}`;
                    const key = `${resource.id}_activity_${dateKey}`;
                    csv += `,${scheduleData[key] || '1'}`;
                }
                csv += '\n';
            });

            csv += '\n\nLÉGENDE\n';
            csv += 'DISPONIBILITÉ,1,Indisponible\n';
            csv += 'DISPONIBILITÉ,2,Disponible pour l\'ANS\n';
            csv += 'AFFECTATION,1,Indisponible\n';
            csv += 'AFFECTATION,2,En attente d\'affectation\n';
            csv += 'AFFECTATION,3,SAMU (Déploiement)\n';
            csv += 'AFFECTATION,4,SAMU (Dev. usages)\n';
            csv += 'AFFECTATION,5,ANS (Déploiement)\n';
            csv += 'AFFECTATION,6,ANS (Dev. usages)\n';
            csv += 'AFFECTATION,7,Qualification\n';
            csv += 'AFFECTATION,8,Divers\n';

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=gantt_${monthNames[month]}_${year}.csv`);
            res.send(csv);
        });
    });
});

// ==================== API EMAIL ====================

app.post('/api/email/config', requireAdmin, (req, res) => {
    const { host, port, user, password } = req.body;
    
    emailConfig = {
        host: host || 'smtp.office365.com',
        port: parseInt(port) || 587,
        secure: false,
        user: user,
        password: password
    };
    
    // Sauvegarder dans la base de données
    database.run(
        `INSERT INTO email_config (id, host, port, secure, user, password, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET 
            host = excluded.host,
            port = excluded.port,
            secure = excluded.secure,
            user = excluded.user,
            password = excluded.password,
            updated_at = CURRENT_TIMESTAMP`,
        [emailConfig.host, emailConfig.port, emailConfig.secure ? 1 : 0, emailConfig.user, emailConfig.password],
        (err) => {
            if (err) {
                console.error('Erreur sauvegarde config email:', err);
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.get('/api/email/config', requireAdmin, (req, res) => {
    database.get('SELECT host, port, user, password FROM email_config WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('Erreur récup config email:', err);
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json(row);
        } else {
            res.json({ host: 'smtp.office365.com', port: 587, user: '', password: '' });
        }
    });
});

app.post('/api/email/test', requireAdmin, async (req, res) => {
    try {
        if (!emailConfig.user) {
            return res.json({ success: false, error: 'Configuration email non définie' });
        }

        await sendEmail(
            emailConfig.user,
            'Test d\'envoi - Planification GANTT',
            '<h2>Test réussi !</h2><p>Votre configuration email fonctionne correctement.</p>'
        );
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ==================== API BACKUP ====================

app.get('/api/backup/csv', requireAdmin, (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    database.all('SELECT * FROM resources ORDER BY id', (err, resources) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        database.all('SELECT * FROM schedule_data ORDER BY resource_id, date_key', (err2, schedule) => {
            if (err2) {
                return res.status(500).json({ error: err2.message });
            }

            database.all('SELECT id, username, nom, prenom, email, is_admin, is_expert, is_user, resource_id, actif, created_at FROM users ORDER BY id', (err3, users) => {
                if (err3) {
                    return res.status(500).json({ error: err3.message });
                }

                let csv = `BACKUP COMPLET BASE DE DONNEES - ${new Date().toLocaleString('fr-FR')}\n\n`;
                
                csv += '=== TABLE: RESOURCES ===\n';
                csv += 'id,nom,prenom,trigramme,email,telephone,taux,samu,actif,created_at\n';
                resources.forEach(r => {
                    csv += `${r.id},"${r.nom}","${r.prenom}","${r.trigramme}","${r.email}","${r.telephone || ''}",${r.taux},"${r.samu}",${r.actif},"${r.created_at}"\n`;
                });
                
                csv += '\n\n=== TABLE: SCHEDULE_DATA ===\n';
                csv += 'id,resource_id,date_key,type,value,created_at\n';
                schedule.forEach(s => {
                    csv += `${s.id},${s.resource_id},"${s.date_key}","${s.type}","${s.value}","${s.created_at}"\n`;
                });
                
                csv += '\n\n=== TABLE: USERS ===\n';
                csv += 'id,username,nom,prenom,email,is_admin,is_expert,is_user,resource_id,actif,created_at\n';
                users.forEach(u => {
                    csv += `${u.id},"${u.username}","${u.nom}","${u.prenom}","${u.email}",${u.is_admin},${u.is_expert},${u.is_user},${u.resource_id || ''},${u.actif},"${u.created_at}"\n`;
                });

                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename=backup_complet_${timestamp}.csv`);
                res.send(csv);
            });
        });
    });
});

app.get('/api/backup/sql', requireAdmin, (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sourcePath = path.join(__dirname, 'data.db');
    const destPath = path.join(__dirname, `backup_${timestamp}.db`);
    
    try {
        fs.copyFileSync(sourcePath, destPath);
        res.download(destPath, `backup_${timestamp}.db`, (err) => {
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
        });
    } catch (error) {
        console.error('Erreur backup SQL:', error);
        res.status(500).json({ error: 'Erreur lors du backup' });
    }
});

// Serveur Ecoute
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Compte admin: admin / Admin2025!`);
});
