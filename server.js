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
import cron from 'node-cron';

import config from './config/config.json' with { type: "json" };

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
    secret: process.env.SESSION_SECRET || 'gantt-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production' ? false : false, // Mettre true si HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    name: 'gantt.sid' // Nom personnalisé pour éviter les conflits
}));

// NOTE: express.static sera défini APRÈS les routes API pour éviter les conflits

// Map pour tracker les utilisateurs connectés (userId -> { lastActivity, profile })
const activeSessions = new Map();

// Nettoyer les sessions inactives toutes les minutes (timeout 15 min)
setInterval(() => {
    const now = Date.now();
    const timeout = 15 * 60 * 1000; // 15 minutes
    for (const [userId, session] of activeSessions) {
        if (now - session.lastActivity > timeout) {
            activeSessions.delete(userId);
            console.log(`🔴 Session expirée pour userId: ${userId}`);
        }
    }
}, 60 * 1000);

// Déterminer le chemin de la base de données
const DB_DIR = config.DB_PATH || __dirname;
const DB_FILE = path.join(DB_DIR, 'data.db');

// Créer le répertoire s'il n'existe pas
if (!fs.existsSync(DB_DIR)) {
    console.log('📁 Création du répertoire DB:', DB_DIR);
    fs.mkdirSync(DB_DIR, { recursive: true });
}

console.log('📊 Chemin base de données:', DB_FILE);

// Initialiser la base de données SQLite
const database = new sqlite3.Database(DB_FILE, (err) => 
 {
    if (err) {
        console.error('Erreur connexion DB:', err);
    } else {
        initDB();
    }
});

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Configuration email
let emailConfig = {
    host: 'smtp.gmail.com',
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
        secure: emailConfig.secure, // true pour port 465, false pour les autres ports
        auth: {
            user: emailConfig.user,
            pass: emailConfig.password
        },
        // Timeouts généreux
        connectionTimeout: 60000, // 60 secondes
        greetingTimeout: 60000,
        socketTimeout: 60000,
        // Configuration TLS moins stricte
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1'
        },
        // Logs de débogage désactivés
        debug: false,
        logger: false
    });
}

// Envoyer un email
async function sendEmail(to, subject, html, attachments = []) {
    const transporter = createEmailTransporter();
    if (!transporter) {
        throw new Error('Configuration email non définie');
    }
    try {
        
        // Note: La vérification SMTP est désactivée pour accélérer l'envoi
        // Si un problème survient, il sera détecté lors de l'envoi réel
        
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: to,
            subject: subject,
            html: html
        };
        
        if (attachments.length > 0) {
            mailOptions.attachments = attachments;
        }
        
        const info = await transporter.sendMail(mailOptions);
        
        return { success: true, messageId: info.messageId };
    } catch (error) {
        
        // Messages d'erreur plus clairs pour l'utilisateur
        let userMessage = error.message;
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            userMessage = `Le serveur SMTP ne répond pas (timeout). Vérifiez :\n- L'adresse du serveur SMTP (${emailConfig.host}:${emailConfig.port})\n- Votre connexion internet\n- Que le serveur SMTP autorise les connexions depuis cette IP`;
        } else if (error.code === 'EAUTH' || error.message.includes('authentication')) {
            userMessage = `Erreur d'authentification. Vérifiez vos identifiants SMTP (email et mot de passe).`;
        } else if (error.code === 'ECONNREFUSED') {
            userMessage = `Connexion refusée par le serveur SMTP. Vérifiez l'adresse et le port.`;
        }
        
        const enhancedError = new Error(userMessage);
        enhancedError.code = error.code;
        throw enhancedError;
    }
}

// Initialiser les tables
function initDB() {
    // Vérifier les permissions d'écriture
    try {
        fs.accessSync(DB_DIR, fs.constants.W_OK);
        console.log('✅ Permissions d\'écriture OK sur:', DB_DIR);
    } catch (err) {
        console.error('❌ ERREUR: Pas de permissions d\'écriture sur:', DB_DIR);
        console.error('   Erreur:', err.message);
    }
    
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
            notification TEXT DEFAULT '0',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(resource_id, date_key, type)
        )
    `, (err) => {
        if (err) console.error('Erreur création table schedule_data:', err);
    });
    
    // Ajouter la colonne notification si elle n'existe pas (migration)
    database.run(`
        ALTER TABLE schedule_data ADD COLUMN notification TEXT DEFAULT '0'
    `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Erreur ajout colonne notification:', err);
        } else if (!err) {
            console.log('✅ Colonne notification ajoutée à schedule_data');
        }
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table users:', err);
        } else {
            // Migration: ajouter profile_photo si elle n'existe pas
            database.all(`PRAGMA table_info(users)`, [], (pragmaErr, columns) => {
                if (!pragmaErr && columns) {
                    const photoCol = columns.find(col => col.name === 'profile_photo');
                    if (!photoCol) {
                        console.log('Migration: Ajout colonne profile_photo à users...');
                        database.run(`ALTER TABLE users ADD COLUMN profile_photo TEXT`, (alterErr) => {
                            if (alterErr) {
                                console.error('Erreur migration profile_photo:', alterErr);
                            } else {
                                console.log('✅ Migration terminée: profile_photo ajouté');
                            }
                        });
                    }
                }
            });
            
            database.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (!row) {
                    const hashedPwd = hashPassword('Admin2025!');
                    database.run(
                        `INSERT INTO users (username, password, nom, prenom, email, is_admin) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        ['admin', hashedPwd, 'Admin', 'Système', 'admin@example.com', 1],
                        () => console.log('Compte admin créé')
                    );
                }
            });
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS email_config (
            id INTEGER PRIMARY KEY,
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
            database.get('SELECT * FROM email_config WHERE id = 1', [], (err, row) => {
                if (row) {
                    emailConfig = {
                        host: row.host,
                        port: row.port,
                        secure: row.secure === 1,
                        user: row.user,
                        password: row.password
                    };
                    console.log('✅ Configuration email chargée depuis DB');
                }
            });
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS system_config (
            id INTEGER PRIMARY KEY,
            version TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Erreur création table system_config:', err);
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS connection_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            profile TEXT NOT NULL,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            modifications TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table connection_logs:', err);
        } else {
            // Migration: ajouter user_id si elle n'existe pas
            database.all(`PRAGMA table_info(connection_logs)`, [], (pragmaErr, columns) => {
                if (!pragmaErr && columns) {
                    const userIdCol = columns.find(col => col.name === 'user_id');
                    if (!userIdCol) {
                        console.log('Migration: Ajout colonne user_id à connection_logs...');
                        database.run(`ALTER TABLE connection_logs ADD COLUMN user_id INTEGER`, (alterErr) => {
                            if (alterErr) {
                                console.error('Erreur migration user_id:', alterErr);
                            } else {
                                console.log('✅ Migration terminée: user_id ajouté');
                            }
                        });
                    }
                }
            });
        }
    });

    // Table des notifications pour les experts
    database.run(`
        CREATE TABLE IF NOT EXISTS expert_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expert_id INTEGER NOT NULL,
            date DATE NOT NULL,
            period TEXT NOT NULL,
            activity_name TEXT NOT NULL,
            requester_name TEXT NOT NULL,
            action_type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read INTEGER DEFAULT 0,
            FOREIGN KEY (expert_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table expert_notifications:', err);
        } else {
            console.log('✅ Table expert_notifications créée');
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table settings:', err);
        } else {
            // Initialiser les paramètres par défaut
            database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('inactivity_enabled', 'false')`);
            database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('inactivity_timeout', '15')`);
            database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('favicon', 'calendrier')`);
            console.log('✅ Table settings initialisée');
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS pending_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            resource_id INTEGER NOT NULL,
            expert_id INTEGER NOT NULL,
            assignment_data TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (expert_id) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table pending_notifications:', err);
        } else {
            console.log('✅ Table pending_notifications créée');
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS action_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table action_logs:', err);
        } else {
            console.log('✅ Table action_logs créée');
        }
    });
    
    // Table pour les logs d'automatisation
    database.run(`
        CREATE TABLE IF NOT EXISTS automation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            automation_id INTEGER NOT NULL,
            expert_id INTEGER,
            expert_name TEXT,
            expert_email TEXT,
            target_month TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table automation_logs:', err);
        } else {
            console.log('✅ Table automation_logs créée');
        }
    });
}

// ==================== MIDDLEWARE AUTH ====================

function logUserAction(req, action, details = {}) {
    if (!req.session || !req.session.logId) {
        return;
    }
    
    const timestamp = new Date().toISOString();
    const actionLog = {
        timestamp,
        action,
        details,
        profile: req.session.activeProfile
    };
    
    database.get(
        'SELECT modifications FROM connection_logs WHERE id = ?',
        [req.session.logId],
        (err, row) => {
            if (err) {
                console.error('❌ Erreur lecture log:', err);
                return;
            }
            
            if (!row) {
                console.error('❌ Aucune ligne trouvée pour logId:', req.session.logId);
                return;
            }
            
            let modifications = [];
            if (row && row.modifications) {
                try {
                    modifications = JSON.parse(row.modifications);
                } catch (e) {
                    modifications = [];
                }
            }
            
            modifications.push(actionLog);
            
            // Vérifier que la session existe avant d'accéder à logId
            if (!req.session || !req.session.logId) {
                console.warn('⚠️ Session invalide, impossible de mettre à jour le log');
                return;
            }
            
            database.run(
                'UPDATE connection_logs SET modifications = ? WHERE id = ?',
                [JSON.stringify(modifications), req.session.logId],
                (err) => {
                    if (err) {
                        console.error('❌ Erreur update log:', err);
                    } else {
                    }
                }
            );
        }
    );
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    // Mettre à jour l'activité de la session
    if (activeSessions.has(req.session.userId)) {
        activeSessions.get(req.session.userId).lastActivity = Date.now();
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId || req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    // Mettre à jour l'activité de la session
    if (activeSessions.has(req.session.userId)) {
        activeSessions.get(req.session.userId).lastActivity = Date.now();
    }
    next();
}

// ==================== API CONNEXION ====================

app.post('/api/login', (req, res) => {
    const { username, password, profile } = req.body;
    
    if (!username || !password || !profile) {
        return res.status(400).json({ error: 'Username, password et profil requis' });
    }

    const hashedPassword = hashPassword(password);
    
    database.get(
        `SELECT u.*, r.trigramme 
         FROM users u 
         LEFT JOIN resources r ON r.id = u.resource_id 
         WHERE u.username = ? AND u.password = ? AND u.actif = 1`,
        [username, hashedPassword],
        (err, user) => {
            if (err) {
                console.error('Erreur login:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'Identifiants incorrects' });
            }
            
            let profileValid = false;
            if (profile === 'admin' && user.is_admin === 1) profileValid = true;
            if (profile === 'expert' && user.is_expert === 1) profileValid = true;
            if (profile === 'user' && user.is_user === 1) profileValid = true;
            
            if (!profileValid) {
                return res.status(403).json({ error: 'Profil non autorisé' });
            }
            
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.nom = user.nom;
            req.session.prenom = user.prenom;
            req.session.activeProfile = profile;
            req.session.resourceId = user.resource_id;
            
            // Tracker la session active
            activeSessions.set(user.id, {
                lastActivity: Date.now(),
                profile: profile,
                username: user.username
            });
            console.log(`🟢 Session active pour ${user.username} (userId: ${user.id})`);
            
            // Logger la connexion
            database.run(
                `INSERT INTO connection_logs (user_id, username, nom, prenom, profile) VALUES (?, ?, ?, ?, ?)`,
                [user.id, user.username, user.nom, user.prenom, profile],
                function(err) {
                    if (err) {
                        console.error('❌ Erreur log connexion:', err);
                    } else {
                        // Sauvegarder l'ID du log dans la session
                        req.session.logId = this.lastID;
                    }
                    
                    // Répondre APRÈS avoir tenté d'insérer le log
                    const userResponse = {
                        id: user.id,
                        username: user.username,
                        nom: user.nom,
                        prenom: user.prenom,
                        email: user.email,
                        trigramme: user.trigramme || null,
                        profilePhoto: user.profile_photo || null,
                        activeProfile: profile,
                        resourceId: user.resource_id
                    };
                    
                    res.json({ 
                        success: true,
                        user: userResponse
                    });
                }
            );
        }
    );
});

app.post('/api/logout', (req, res) => {
    const userId = req.session.userId;
    const username = req.session.username;
    
    // Afficher l'état de la base de données avant déconnexion
    if (userId) {
        // Récupérer le resource_id de l'utilisateur
        database.get(
            `SELECT resource_id FROM users WHERE id = ?`,
            [userId],
            (err, user) => {
                if (err || !user) {
                    // Erreur silencieuse - pas critique
                }
            }
        );
        
        // Supprimer de la Map des sessions actives
        activeSessions.delete(userId);
        console.log(`🔴 Session terminée pour ${username} (userId: ${userId})`);
        
        // Logger la déconnexion dans action_logs
        const timestamp = new Date().toISOString();
        
        database.run(
            `INSERT INTO action_logs (user_id, action_type, details, created_at) VALUES (?, ?, ?, ?)`,
            [userId, 'deconnexion', JSON.stringify({ username }), timestamp],
            function(err) {
                if (err) {
                    console.error('❌ Erreur log déconnexion:', err);
                } else {
                }
            }
        );
    }
    
    req.session.destroy();
    res.json({ success: true });
});

// Route pour mot de passe oublié
app.post('/api/forgot-password', async (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Identifiant requis' });
    }
    
    database.get(
        'SELECT id, nom, prenom, email FROM users WHERE username = ? AND actif = 1',
        [username],
        async (err, user) => {
            if (err) {
                console.error('Erreur récup user:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.status(404).json({ error: 'Utilisateur non trouvé ou compte désactivé' });
            }
            
            // Générer un mot de passe temporaire
            const tempPassword = crypto.randomBytes(4).toString('hex').toUpperCase();
            const hashedPassword = hashPassword(tempPassword);
            
            // Mettre à jour le mot de passe
            database.run(
                'UPDATE users SET password = ? WHERE id = ?',
                [hashedPassword, user.id],
                async (err) => {
                    if (err) {
                        console.error('Erreur update password:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    // Logger la réinitialisation (sans session, on crée un log simple)
                    database.run(
                        `INSERT INTO connection_logs (user_id, username, nom, prenom, profile, modifications) 
                         VALUES (?, ?, ?, ?, 'system', ?)`,
                        [
                            user.id,
                            username, 
                            user.nom, 
                            user.prenom, 
                            JSON.stringify([{
                                timestamp: new Date().toISOString(),
                                action: 'Réinitialisation mot de passe',
                                details: { userId: user.id }
                            }])
                        ]
                    );
                    
                    let emailSent = false;
                    let emailError = null;
                    
                    // Tenter d'envoyer l'email si configuré
                    if (emailConfig.user && user.email) {
                        try {
                            await sendEmail(
                                user.email,
                                'Réinitialisation de votre mot de passe',
                                `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #2c3e50;">Réinitialisation de mot de passe</h2>
                                    <p>Bonjour ${user.prenom} ${user.nom},</p>
                                    <p>Votre mot de passe a été réinitialisé avec succès.</p>
                                    <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
                                        <p style="margin: 5px 0;"><strong>Identifiant :</strong> ${username}</p>
                                        <p style="margin: 5px 0;"><strong>Nouveau mot de passe temporaire :</strong> ${tempPassword}</p>
                                    </div>
                                    <p style="color: #e74c3c; font-weight: bold;">⚠️ Veuillez changer ce mot de passe lors de votre prochaine connexion.</p>
                                    <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">Si vous n'êtes pas à l'origine de cette demande, veuillez contacter un administrateur immédiatement.</p>
                                </div>
                                `
                            );
                            emailSent = true;
                        } catch (error) {
                            console.error('Erreur envoi email:', error);
                            emailError = error.message;
                        }
                    }
                    
                    if (emailSent) {
                        res.json({
                            success: true,
                            emailSent: true,
                            message: 'Un email avec votre nouveau mot de passe a été envoyé à votre adresse email.'
                        });
                    } else {
                        res.json({
                            success: true,
                            emailSent: false,
                            tempPassword: tempPassword,
                            message: user.email 
                                ? `Impossible d'envoyer l'email. Votre nouveau mot de passe temporaire est : ${tempPassword}`
                                : `Aucun email configuré. Votre nouveau mot de passe temporaire est : ${tempPassword}`
                        });
                    }
                }
            );
        }
    );
});

app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.userId) {
        // Récupérer le trigramme, la photo et l'email depuis la base
        database.get(
            `SELECT u.email, u.profile_photo, r.trigramme 
             FROM users u 
             LEFT JOIN resources r ON r.id = u.resource_id 
             WHERE u.id = ?`,
            [req.session.userId],
            (err, userData) => {
                if (err) {
                    console.error('Erreur récupération données session:', err);
                }
                
                res.json({
                    userId: req.session.userId,
                    username: req.session.username,
                    nom: req.session.nom,
                    prenom: req.session.prenom,
                    email: userData?.email || null,
                    activeProfile: req.session.activeProfile,
                    resourceId: req.session.resourceId,
                    trigramme: userData?.trigramme || null,
                    profilePhoto: userData?.profile_photo || null
                });
            }
        );
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// Route pour obtenir les profils disponibles d'un utilisateur
app.get('/api/user/profiles', (req, res) => {
    const { username } = req.query;
    
    if (!username) {
        return res.status(400).json({ error: 'Username requis' });
    }
    
    database.get(
        'SELECT is_admin, is_expert, is_user, actif FROM users WHERE username = ?',
        [username],
        (err, user) => {
            if (err) {
                console.error('Erreur récup profils:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.json({ profiles: [] });
            }
            
            if (user.actif !== 1) {
                return res.json({ profiles: [], error: 'Compte désactivé' });
            }
            
            const profiles = [];
            if (user.is_admin === 1) profiles.push('admin');
            if (user.is_expert === 1) profiles.push('expert');
            if (user.is_user === 1) profiles.push('user');
            
            res.json({ profiles });
        }
    );
});

// Route pour obtenir l'email d'un utilisateur associé à une ressource
app.get('/api/user/email-by-resource/:resourceId', requireAuth, (req, res) => {
    const { resourceId } = req.params;
    
    database.get(
        'SELECT id, username, email, nom, prenom, is_expert, resource_id FROM users WHERE resource_id = ? AND is_expert = 1 LIMIT 1',
        [resourceId],
        (err, user) => {
            if (err) {
                console.error('Erreur récup email user:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (user && user.email) {
                res.json({ email: user.email, nom: user.nom, prenom: user.prenom });
            } else {
                res.json({ email: null });
            }
        }
    );
});

// ==================== API RESSOURCES ====================

app.get('/api/resources', requireAuth, (req, res) => {
    database.all(`
        SELECT 
            r.*,
            u.email as user_email
        FROM resources r
        LEFT JOIN users u ON u.resource_id = r.id
        ORDER BY r.nom, r.prenom
    `, (err, rows) => {
        if (err) {
            console.error('Erreur récup resources:', err);
            res.status(500).json({ error: err.message });
        } else {
            // Utiliser user_email si disponible, sinon garder l'email de resources
            const rowsWithEmail = rows.map(row => ({
                ...row,
                email: row.user_email || row.email
            }));
            res.json(rowsWithEmail || []);
        }
    });
});

app.post('/api/resources', requireAdmin, (req, res) => {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin } = req.body;
    
    if (!nom || !prenom || !trigramme || !taux || !samu) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    database.run(
        `INSERT INTO resources (nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nom, prenom, trigramme, email || null, telephone || null, taux, samu, date_debut || null, date_fin || null],
        function(err) {
            if (err) {
                console.error('Erreur ajout resource:', err);
                res.status(500).json({ error: err.message });
            } else {
                logUserAction(req, 'Création ressource', { 
                    resourceId: this.lastID, 
                    nom, 
                    prenom, 
                    trigramme 
                });
                res.json({ id: this.lastID, success: true });
            }
        }
    );
});

app.put('/api/resources/:id', requireAdmin, (req, res) => {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin } = req.body;
    const { id } = req.params;
    
    database.run(
        `UPDATE resources 
         SET nom = ?, prenom = ?, trigramme = ?, email = ?, telephone = ?, taux = ?, samu = ?, date_debut = ?, date_fin = ?
         WHERE id = ?`,
        [nom, prenom, trigramme, email || null, telephone || null, taux, samu, date_debut || null, date_fin || null, id],
        (err) => {
            if (err) {
                console.error('Erreur update resource:', err);
                res.status(500).json({ error: err.message });
            } else {
                logUserAction(req, 'Modification ressource', { 
                    resourceId: id, 
                    nom, 
                    prenom, 
                    trigramme 
                });
                res.json({ success: true });
            }
        }
    );
});

app.delete('/api/resources/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.run('DELETE FROM resources WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Erreur suppression resource:', err);
            res.status(500).json({ error: err.message });
        } else {
            logUserAction(req, 'Suppression ressource', { resourceId: id });
            database.run('DELETE FROM schedule_data WHERE resource_id = ?', [id], (err2) => {
                if (err2) console.error('Erreur suppression schedule:', err2);
                res.json({ success: true });
            });
        }
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

// ==================== API PLANNING ====================

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
        // FIX MAJEUR : Utiliser join('_') au lieu de join('-') pour préserver le format des clés
        const dateKey = parts.slice(2).join('_');
        
        // Vérification des droits pour Expert métier
        if (req.session.activeProfile === 'expert') {
            // L'expert ne peut modifier que sa propre ligne
            if (parseInt(resourceId) !== req.session.resourceId) {
                completed++;
                if (completed === total) {
                    logUserAction(req, 'Sauvegarde planning', { 
                        modificationsCount: total - (updates.length - completed),
                        profile: req.session.activeProfile
                    });
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
                    logUserAction(req, 'Sauvegarde planning', { 
                        modificationsCount: total - (updates.length - completed),
                        profile: req.session.activeProfile
                    });
                    res.json({ success: true, saved: total });
                }
                return;
            }
        }
        
        //Déterminer si c'est un expert qui modifie sa propre ligne
        const isExpertSelfEdit = req.session.activeProfile === 'expert';
        
        database.run(
            `INSERT INTO schedule_data (resource_id, date_key, type, value, notification)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(resource_id, date_key, type) 
             DO UPDATE SET 
                value = excluded.value,
                notification = ?`,
            [resourceId, dateKey, type, value, isExpertSelfEdit ? '0' : '1', isExpertSelfEdit ? '0' : '1'],
            function(err) {
                if (err) console.error('Erreur insert schedule:', err);
                
                completed++;
                if (completed === total) {
                    logUserAction(req, 'Sauvegarde planning', { 
                        modificationsCount: total,
                        profile: req.session.activeProfile
                    });
                    res.json({ success: true, saved: total });
                }
            }
        );
    });
});

// Endpoint pour RAZ complète d'un mois pour une ressource
// Preview des données qui seront supprimées par RAZ
app.post('/api/schedule/preview-reset-month', requireAuth, (req, res) => {
    const { resourceId, year, month } = req.body;
    
    if (!resourceId || year === undefined || month === undefined) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }
    
    // Vérifier les droits
    if (req.session.activeProfile === 'expert') {
        if (parseInt(resourceId) !== req.session.resourceId) {
            return res.status(403).json({ error: 'Non autorisé' });
        }
    }
    
    // Pattern pour matcher toutes les dates de ce mois : YYYY-MM-%
    const monthPattern = `${year}-${String(month + 1).padStart(2, '0')}-%`;
    
    // Récupérer les données qui vont être supprimées
    const query = `SELECT * FROM schedule_data WHERE resource_id = ? AND date_key LIKE ? ORDER BY date_key`;
    const params = [resourceId, monthPattern];
    
    database.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erreur preview RAZ:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Grouper les données par date_key
        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.date_key]) {
                grouped[row.date_key] = {
                    date_key: row.date_key,
                    available: '-',
                    activity: '-',
                    localisation: '-',
                    author: '-'
                };
            }
            grouped[row.date_key][row.type] = row.value;
        });
        
        // Convertir en tableau trié et filtrer les données "fantômes" et corrompues
        const entries = Object.values(grouped)
            .filter(entry => {
                // Règles de cohérence
                if ((entry.available && entry.available !== '-') && (!entry.activity || entry.activity === '-')) {
                    return false;
                }
                if ((entry.activity && entry.activity !== '-') && (!entry.available || entry.available === '-')) {
                    return false;
                }
                if (entry.activity === '2' && (entry.localisation === '-' || !entry.localisation)) {
                    return false;
                }
                if (entry.activity === '-' && entry.available === '-') {
                    return false;
                }
                return true;
            })
            .sort((a, b) => a.date_key.localeCompare(b.date_key));
        
        res.json({ 
            success: true, 
            count: entries.length,
            entries: entries
        });
    });
});

app.post('/api/schedule/reset-month', requireAuth, (req, res) => {
    const { resourceId, year, month } = req.body;
    
    if (!resourceId || year === undefined || month === undefined) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }
    
    // Vérifier les droits
    if (req.session.activeProfile === 'expert') {
        if (parseInt(resourceId) !== req.session.resourceId) {
            return res.status(403).json({ error: 'Non autorisé' });
        }
    }
    
    // Pattern pour matcher toutes les dates de ce mois : YYYY-MM-%
    const monthPattern = `${year}-${String(month + 1).padStart(2, '0')}-%`;
    
    // Supprimer toutes les données pour cette ressource et ce mois
    const query = `DELETE FROM schedule_data WHERE resource_id = ? AND date_key LIKE ?`;
    const params = [resourceId, monthPattern];
    
    database.run(query, params, function(err) {
        if (err) {
            console.error('Erreur RAZ planning:', err);
            return res.status(500).json({ error: err.message });
        }
        
        logUserAction(req, `RAZ planning mois ${month+1}/${year}`, {
            resourceId: resourceId,
            pattern: monthPattern,
            lignesSupprimees: this.changes
        });
        
        res.json({ success: true, deleted: this.changes });
    });
});

app.post('/api/schedule/save', requireAuth, (req, res) => {
    // Supporter les deux formats : { updates: [...] } OU scheduleData direct
    let updates;
    if (req.body.updates) {
        updates = req.body.updates;
    } else {
        const scheduleData = req.body;
        updates = Object.entries(scheduleData).map(([key, value]) => ({ key, value }));
    }
    
    if (!updates || updates.length === 0) {
        return res.json({ success: true, saved: 0 });
    }

    let completed = 0;
    const total = updates.length;
    
    // Collecter les activités modifiées pour créer les notifications une seule fois par demi-journée
    const notificationsToCreate = new Map(); // Clé: "resourceId_date_period", Valeur: {resourceId, date, period, activity}

    updates.forEach(({ key, value }) => {
        const parts = key.split('_');
        const resourceId = parts[0];
        const type = parts[1];
        // FIX MAJEUR : Utiliser join('_') au lieu de join('-') pour préserver le format des clés
        const dateKey = parts.slice(2).join('_');
        
        // Vérification des droits pour Expert métier
        if (req.session.activeProfile === 'expert') {
            // L'expert ne peut modifier que sa propre ligne
            if (parseInt(resourceId) !== req.session.resourceId) {
                completed++;
                if (completed === total) {
                    logUserAction(req, 'Sauvegarde planning rapide', { 
                        modificationsCount: completed,
                        profile: req.session.activeProfile
                    });
                    res.json({ success: true, saved: total });
                }
                return;
            }
        }
        
        // ===== VÉRIFIER AVANT L'INSERT SI C'EST UNE VRAIE MODIFICATION (ASYNCHRONE) =====
        database.get(
            'SELECT value FROM schedule_data WHERE resource_id = ? AND date_key = ? AND type = ?',
            [resourceId, dateKey, type],
            (errCheck, existingRow) => {
                const oldValue = existingRow ? existingRow.value : null;
                const hasReallyChanged = (oldValue !== value);
                
                database.run(
                    `INSERT INTO schedule_data (resource_id, date_key, type, value)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(resource_id, date_key, type) 
                     DO UPDATE SET value = excluded.value`,
                    [resourceId, dateKey, type, value],
                    (err) => {
                        if (err) console.error('Erreur insert schedule:', err);
                        
                        // Collecter les activités pour notifications (une seule par demi-journée)
                        if (!err && type === 'activity' && value !== '1' && value !== '2' && req.session.activeProfile !== 'expert' && hasReallyChanged) {
                            // C'est une vraie affectation SAMU/ANS qui a VRAIMENT changé
                            const dateKeyParts = dateKey.split('_');
                            const date = dateKeyParts[0];
                            const period = dateKeyParts[1];
                            const notifKey = `${resourceId}_${date}_${period}`;
                            
                            // N'ajouter que si pas déjà présent
                            if (!notificationsToCreate.has(notifKey)) {
                                notificationsToCreate.set(notifKey, {
                                    resourceId,
                                    date,
                                    period,
                                    activityValue: value
                                });
                            }
                        }
                        
                        // Créer le log planning_modification quand une ACTIVITÉ affectable est modifiée
                        if (!err && type === 'activity' && ['3','4','5','6','7','8'].includes(value) && hasReallyChanged) {
                            const dateKeyParts = dateKey.split('_');
                            const date = dateKeyParts[0];
                            const period = dateKeyParts[1];
                            const resId = parseInt(resourceId);
                            
                            const activityLabelsLocal = {
                                '3': '🚨 SAMU (Déploiement)',
                                '4': '🚨 SAMU (Dev. usages)',
                                '5': 'ANS (Déploiement)',
                                '6': 'ANS (Dev. usages)',
                                '7': 'Qualification',
                                '8': 'Autre mission'
                            };
                            
                            // Récupérer la localisation existante (si présente)
                            database.get(
                                'SELECT value FROM schedule_data WHERE resource_id = ? AND date_key = ? AND type = ?',
                                [resId, dateKey, 'localisation'],
                                (errLoc, locRow) => {
                                    database.get('SELECT nom, prenom FROM resources WHERE id = ?', [resId], (errRes, resource) => {
                                        if (!errRes && resource) {
                                            const logDetails = {
                                                resourceId: resId,
                                                resourceName: `${resource.prenom} ${resource.nom}`,
                                                date: date,
                                                period: period === 'AM' ? 'Matin' : 'Après-midi',
                                                activity: activityLabelsLocal[value] || value,
                                                location: (locRow && locRow.value) ? locRow.value : '-',
                                                modifiedBy: req.session.activeProfile
                                            };
                                            
                                            database.run(
                                                `INSERT INTO action_logs (user_id, action_type, details) VALUES (?, ?, ?)`,
                                                [req.session.userId, 'planning_modification', JSON.stringify(logDetails)],
                                                (errLog) => {
                                                    if (errLog) {
                                                        console.error('❌ Erreur création log planning_modification (activity):', errLog);
                                                    } else {
                                                        console.log(`✅ Log planning_modification créé pour ${resource.prenom} ${resource.nom} - ${date} ${period} - ${activityLabelsLocal[value]} (par ${req.session.activeProfile})`);
                                                    }
                                                }
                                            );
                                        }
                                    });
                                }
                            );
                        }
                        
                        // Créer/Mettre à jour le log planning_modification quand la LOCALISATION est modifiée
                        if (!err && type === 'localisation' && hasReallyChanged) {
                            const dateKeyParts = dateKey.split('_');
                            const date = dateKeyParts[0];
                            const period = dateKeyParts[1];
                            const resId = parseInt(resourceId);
                            
                            // Vérifier s'il y a une activité affectable (3-8) pour cette demi-journée
                            database.get(
                                'SELECT value FROM schedule_data WHERE resource_id = ? AND date_key = ? AND type = ?',
                                [resId, dateKey, 'activity'],
                                (errAct, actRow) => {
                                    if (!errAct && actRow && ['3','4','5','6','7','8'].includes(actRow.value)) {
                                        // Il y a une affectation, créer le log avec la localisation
                                        const activityLabelsLocal = {
                                            '3': '🚨 SAMU (Déploiement)',
                                            '4': '🚨 SAMU (Dev. usages)',
                                            '5': 'ANS (Déploiement)',
                                            '6': 'ANS (Dev. usages)',
                                            '7': 'Qualification',
                                            '8': 'Autre mission'
                                        };
                                        
                                        database.get('SELECT nom, prenom FROM resources WHERE id = ?', [resId], (errRes, resource) => {
                                            if (!errRes && resource) {
                                                const logDetails = {
                                                    resourceId: resId,
                                                    resourceName: `${resource.prenom} ${resource.nom}`,
                                                    date: date,
                                                    period: period === 'AM' ? 'Matin' : 'Après-midi',
                                                    activity: activityLabelsLocal[actRow.value] || actRow.value,
                                                    location: value,
                                                    modifiedBy: req.session.activeProfile
                                                };
                                                
                                                database.run(
                                                    `INSERT INTO action_logs (user_id, action_type, details) VALUES (?, ?, ?)`,
                                                    [req.session.userId, 'planning_modification', JSON.stringify(logDetails)],
                                                    (errLog) => {
                                                        if (errLog) {
                                                            console.error('❌ Erreur création log planning_modification (localisation):', errLog);
                                                        } else {
                                                            console.log(`✅ Log planning_modification créé pour ${resource.prenom} ${resource.nom} - ${date} ${period} - localisation: ${value} (par ${req.session.activeProfile})`);
                                                        }
                                                    }
                                                );
                                            }
                                        });
                                    }
                                }
                            );
                        }
                
                completed++;
                if (completed === total) {
                    // NOTE: Les notifications ne sont plus créées ici mais à la déconnexion
                    // via l'endpoint /api/notifications/create-batch appelé par le client
                    // après l'envoi des emails récapitulatifs aux experts
                    
                    // Note: Les logs planning_modification sont créés quand la LOCALISATION est modifiée
                    // (voir le bloc "NOUVEAU" plus haut qui gère type === 'localisation')
                    
                    logUserAction(req, 'Sauvegarde planning rapide', { 
                        modificationsCount: total,
                        profile: req.session.activeProfile
                    });
                    res.json({ success: true, saved: total });
                }
            }
        );
        }); // Fermeture du callback database.get
    });
});

// Nouvel endpoint pour nettoyer les anciennes données (sans AM/PM)
app.post('/api/schedule/cleanup-old-format', requireAdmin, (req, res) => {
    // Supprimer toutes les entrées qui n'ont PAS de période (AM/PM) dans la date_key
    database.run(
        `DELETE FROM schedule_data 
         WHERE date_key NOT LIKE '%_AM' 
         AND date_key NOT LIKE '%_PM'`,
        [],
        function(err) {
            if (err) {
                console.error('Erreur nettoyage anciennes données:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log(`✅ ${this.changes} anciennes entrées supprimées`);
                res.json({ success: true, deleted: this.changes });
            }
        }
    );
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

// Endpoint public pour récupérer les infos de base des users (pour affichage dans le Gantt)
app.get('/api/users/public', requireAuth, (req, res) => {
    database.all(`
        SELECT 
            u.id,
            u.nom,
            u.prenom,
            u.email,
            u.resource_id,
            u.profile_photo,
            u.is_expert,
            r.trigramme
        FROM users u 
        LEFT JOIN resources r ON u.resource_id = r.id
        WHERE u.actif = 1
        ORDER BY u.nom, u.prenom
    `, (err, rows) => {
        if (err) {
            console.error('Erreur récup users publics:', err);
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
                
                logUserAction(req, 'Création utilisateur', { 
                    userId: this.lastID, 
                    username, 
                    nom, 
                    prenom,
                    roles: { is_admin, is_expert, is_user }
                });
                res.json({ id: this.lastID, success: true, emailSent });
            }
        }
    );
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
    const { nom, prenom, email, is_admin, is_expert, is_user, resource_id } = req.body;
    const { id } = req.params;
    
    // Convertir resource_id en integer ou null
    let finalResourceId = null;
    if (resource_id) {
        const parsed = parseInt(resource_id);
        if (!isNaN(parsed)) {
            finalResourceId = parsed;
        }
    }
    
    console.log('💾 Modification utilisateur ID', id, ':', {
        nom,
        prenom,
        is_expert,
        resource_id_recu: resource_id,
        resource_id_type: typeof resource_id,
        resource_id_final: finalResourceId
    });
    
    database.run(
        `UPDATE users 
         SET nom = ?, prenom = ?, email = ?, is_admin = ?, is_expert = ?, is_user = ?, resource_id = ?
         WHERE id = ?`,
        [nom, prenom, email, is_admin ? 1 : 0, is_expert ? 1 : 0, is_user ? 1 : 0, finalResourceId, id],
        (err) => {
            if (err) {
                console.error('Erreur update user:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log('✅ Utilisateur modifié, resource_id final:', finalResourceId);
                logUserAction(req, 'Modification utilisateur', { 
                    userId: id, 
                    nom, 
                    prenom,
                    roles: { is_admin, is_expert, is_user },
                    resource_id: finalResourceId
                });
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
                
                deleteUserRecord(id, res, req);
            });
        } else {
            deleteUserRecord(id, res, req);
        }
    });
});

function deleteUserRecord(id, res, req) {
    database.run('DELETE FROM users WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Erreur suppression user:', err);
            res.status(500).json({ error: err.message });
        } else {
            if (req) {
                logUserAction(req, 'Suppression utilisateur', { userId: id });
            }
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
        
        database.run(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, id],
            async (err) => {
                if (err) {
                    console.error('Erreur reset password:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                let emailSent = false;
                
                if (shouldSendEmail) {
                    try {
                        await sendEmail(
                            user.email,
                            'Réinitialisation de votre mot de passe - Planification GANTT',
                            `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #2c3e50;">Réinitialisation de mot de passe</h2>
                                <p>Bonjour ${user.prenom} ${user.nom},</p>
                                <p>Votre mot de passe a été réinitialisé par un administrateur.</p>
                                <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
                                    <p style="margin: 5px 0;"><strong>Nom d'utilisateur :</strong> ${user.username}</p>
                                    <p style="margin: 5px 0;"><strong>Nouveau mot de passe :</strong> ${newPassword}</p>
                                </div>
                                <p style="color: #e74c3c; font-weight: bold;">⚠️ Pour des raisons de sécurité, veuillez changer ce mot de passe lors de votre prochaine connexion.</p>
                                <p>Vous pouvez vous connecter à l'adresse : <a href="${req.protocol}://${req.get('host')}">${req.protocol}://${req.get('host')}</a></p>
                            </div>
                            `
                        );
                        emailSent = true;
                    } catch (emailError) {
                        console.error('Erreur envoi email:', emailError);
                    }
                }
                
                res.json({ success: true, emailSent });
            }
        );
    });
});

app.post('/api/users/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }
    
    const hashedOldPassword = hashPassword(oldPassword);
    const hashedNewPassword = hashPassword(newPassword);
    
    database.get(
        'SELECT * FROM users WHERE id = ? AND password = ?',
        [req.session.userId, hashedOldPassword],
        (err, user) => {
            if (err) {
                console.error('Erreur vérification password:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
            }
            
            database.run(
                'UPDATE users SET password = ? WHERE id = ?',
                [hashedNewPassword, req.session.userId],
                (err) => {
                    if (err) {
                        console.error('Erreur changement password:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    res.json({ success: true });
                }
            );
        }
    );
});

// ==================== API EMAIL CONFIG ====================

app.get('/api/email-config', requireAdmin, (req, res) => {
    database.get('SELECT * FROM email_config WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('Erreur récup config:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(row || { host: '', port: 587, secure: 0, user: '', password: '' });
        }
    });
});

app.post('/api/email-config', requireAdmin, (req, res) => {
    const { host, port, secure, user, password } = req.body;
    
    if (!host || !port || !user || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    database.run(
        `INSERT INTO email_config (id, host, port, secure, user, password)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
            host = excluded.host,
            port = excluded.port,
            secure = excluded.secure,
            user = excluded.user,
            password = excluded.password,
            updated_at = CURRENT_TIMESTAMP`,
        [host, port, secure ? 1 : 0, user, password],
        (err) => {
            if (err) {
                console.error('Erreur sauvegarde config email:', err);
                res.status(500).json({ error: err.message });
            } else {
                emailConfig = { host, port, secure, user, password };
                logUserAction(req, 'Configuration email', { 
                    host, 
                    port, 
                    user 
                });
                res.json({ success: true });
            }
        }
    );
});

app.post('/api/email-config/test', requireAdmin, async (req, res) => {
    try {
        await sendEmail(
            emailConfig.user,
            'Test de configuration SMTP',
            '<p>Ceci est un email de test. Si vous recevez ce message, votre configuration SMTP est correcte !</p>'
        );
        res.json({ success: true, message: 'Email de test envoyé avec succès' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ==================== API BACKUP ====================

// Configuration et récupération de la version
app.post('/api/system/version', requireAdmin, (req, res) => {
    const { version } = req.body;
    
    if (!version) {
        return res.status(400).json({ error: 'Version requise' });
    }
    
    database.run(
        `INSERT INTO system_config (id, version, updated_at)
         VALUES (1, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET 
            version = excluded.version,
            updated_at = CURRENT_TIMESTAMP`,
        [version],
        (err) => {
            if (err) {
                console.error('Erreur sauvegarde version:', err);
                res.status(500).json({ success: false, error: err.message });
            } else {
                console.log('✅ Version mise à jour:', version);
                res.json({ success: true });
            }
        }
    );
});

app.get('/api/system/version', (req, res) => {
    database.get('SELECT version FROM system_config WHERE id = 1', [], (err, row) => {
        if (err) {
            console.error('Erreur récup version:', err);
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json({ version: row.version });
        } else {
            res.json({ version: '1.0.0' });
        }
    });
});

// Endpoint pour récupérer les sessions actives (utilisateurs connectés)
app.get('/api/active-sessions', requireAdmin, (req, res) => {
    const activeUsers = [];
    const now = Date.now();
    const timeout = 15 * 60 * 1000; // 15 minutes
    
    for (const [userId, session] of activeSessions) {
        // Vérifier si la session est encore active (moins de 15 min d'inactivité)
        if (now - session.lastActivity <= timeout) {
            activeUsers.push({
                userId: userId,
                profile: session.profile,
                username: session.username,
                lastActivity: session.lastActivity
            });
        }
    }
    
    res.json({ activeUsers });
});

// Récupération des logs de connexion (20 derniers)
app.get('/api/logs/connections', requireAdmin, (req, res) => {
    database.all(
        `SELECT id, user_id, username, nom, prenom, profile, login_time, modifications 
         FROM connection_logs 
         ORDER BY login_time DESC 
         LIMIT 20`,
        [],
        (err, logs) => {
            if (err) {
                console.error('Erreur récupération logs:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ logs });
            }
        }
    );
});

// Récupération d'un log spécifique par ID
app.get('/api/connection-logs/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.get(
        `SELECT id, user_id, username, nom, prenom, profile, login_time, modifications 
         FROM connection_logs 
         WHERE id = ?`,
        [id],
        (err, log) => {
            if (err) {
                console.error('Erreur récupération log:', err);
                res.status(500).json({ error: err.message });
            } else if (!log) {
                res.status(404).json({ error: 'Log non trouvé' });
            } else {
                res.json(log);
            }
        }
    );
});

// Récupération des logs d'actions filtrés par utilisateur
app.get('/api/logs/actions', requireAdmin, (req, res) => {
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId requis' });
    }
    
    database.all(
        `SELECT id, user_id, action_type, details, created_at 
         FROM action_logs 
         WHERE user_id = ?
         ORDER BY created_at DESC 
         LIMIT 100`,
        [userId],
        (err, logs) => {
            if (err) {
                console.error('Erreur récupération action logs:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ logs });
            }
        }
    );
});

// Mise à jour des modifications dans le log
app.post('/api/logs/add-modification', requireAuth, (req, res) => {
    const { modification } = req.body;
    
    if (!req.session.logId) {
        return res.json({ success: false, error: 'Aucun log actif' });
    }
    
    // Récupérer les modifications actuelles
    database.get(
        'SELECT modifications FROM connection_logs WHERE id = ?',
        [req.session.logId],
        (err, row) => {
            if (err) {
                console.error('Erreur récup modifications:', err);
                return res.status(500).json({ error: err.message });
            }
            
            const currentMods = row && row.modifications ? row.modifications : '';
            const timestamp = new Date().toLocaleString('fr-FR');
            const newMod = `${timestamp} - ${modification}`;
            const updatedMods = currentMods ? `${currentMods}\n${newMod}` : newMod;
            
            // Mettre à jour les modifications
            database.run(
                'UPDATE connection_logs SET modifications = ? WHERE id = ?',
                [updatedMods, req.session.logId],
                (err) => {
                    if (err) {
                        console.error('Erreur update modifications:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ success: true });
                }
            );
        }
    );
});

// Envoi du backup par email
app.post('/api/backup/send-email', requireAdmin, async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email requis' });
    }
    
    if (!emailConfig.user) {
        return res.status(400).json({ success: false, error: 'Configuration email non définie' });
    }
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Générer le CSV de backup
        const resources = await new Promise((resolve, reject) => {
            database.all('SELECT * FROM resources ORDER BY id', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const schedule = await new Promise((resolve, reject) => {
            database.all('SELECT * FROM schedule_data ORDER BY resource_id, date_key', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const users = await new Promise((resolve, reject) => {
            database.all('SELECT id, username, nom, prenom, email, is_admin, is_expert, is_user, resource_id, actif, created_at FROM users ORDER BY id', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        let csv = `BACKUP COMPLET BASE DE DONNEES - ${new Date().toLocaleString('fr-FR')}\n\n`;
        
        csv += '=== TABLE: RESOURCES ===\n';
        csv += 'id,nom,prenom,trigramme,email,telephone,taux,samu,actif,created_at\n';
        resources.forEach(r => {
            csv += `${r.id},"${r.nom}","${r.prenom}","${r.trigramme}","${r.email || ''}","${r.telephone || ''}",${r.taux},"${r.samu}",${r.actif},"${r.created_at}"\n`;
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
        
        // Envoyer l'email avec le CSV en pièce jointe
        await sendEmail(
            email,
            `Sauvegarde de la base de données - ${new Date().toLocaleDateString('fr-FR')}`,
            `<h2>Sauvegarde de la base de données</h2>
             <p>Veuillez trouver ci-joint la sauvegarde complète de la base de données du ${new Date().toLocaleString('fr-FR')}.</p>
             <p><strong>Contenu du backup :</strong></p>
             <ul>
                <li>Ressources : ${resources.length} entrées</li>
                <li>Données de planning : ${schedule.length} entrées</li>
                <li>Utilisateurs : ${users.length} entrées</li>
             </ul>`,
            [{
                filename: `backup_complet_${timestamp}.csv`,
                content: Buffer.from('\ufeff' + csv, 'utf-8')
            }]
        );
        
        logUserAction(req, 'Envoi backup par email', { 
            destinataire: email,
            resources: resources.length,
            schedule: schedule.length,
            users: users.length
        });
        res.json({ success: true, message: 'Backup envoyé par email avec succès' });
    } catch (error) {
        console.error('Erreur envoi backup par email:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
                logUserAction(req, 'Téléchargement backup CSV', { 
                    resources: resources.length,
                    schedule: schedule.length,
                    users: users.length
                });
                res.send(csv);
            });
        });
    });
});

app.get('/api/backup/sql', requireAdmin, (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sourcePath = DB_FILE;
    const destPath = path.join(DB_DIR, `backup_${timestamp}.db`);
    
    try {
        fs.copyFileSync(sourcePath, destPath);
        logUserAction(req, 'Téléchargement backup SQLite', { timestamp });
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

// Envoi du calendrier par email
app.post('/api/send-calendar-email', requireAuth, async (req, res) => {
    const { resourceId, email, html, subject } = req.body;
    
    if (!email || !html || !subject) {
        return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    }
    
    if (!emailConfig.user) {
        return res.status(400).json({ success: false, error: 'Configuration email non définie' });
    }
    
    try {
        await sendEmail(email, subject, html);
        
        logUserAction(req, 'Envoi calendrier par email', { 
            resourceId, 
            destinataire: email 
        });
        
        res.json({ success: true, message: 'Calendrier envoyé par email avec succès' });
    } catch (error) {
        console.error('Erreur envoi calendrier par email:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint optimisé pour envoyer les emails d'affectation (utilise Promise.all comme request-assignment)
app.post('/api/send-assignment-emails', requireAuth, async (req, res) => {
    const { assignments, senderName } = req.body;
    
    // assignments = [{ resourceId, email, expertName, assignments: [{date, period, activity, location}] }]
    
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucune affectation à envoyer' });
    }
    
    const transporter = createEmailTransporter();
    if (!transporter) {
        return res.status(500).json({ success: false, error: 'Configuration email non disponible' });
    }
    
    console.log(`📧 Envoi de ${assignments.length} email(s) d'affectation par ${senderName}`);
    
    // Envoyer tous les emails en parallèle (comme request-assignment)
    const emailPromises = assignments.map(async (item) => {
        const { resourceId, email, expertName, expertPrenom, assignments: expertAssignments } = item;
        
        if (!email) {
            console.log(`⚠️ Pas d'email pour ${expertName}`);
            return { resourceId, success: false, error: 'Pas d\'email' };
        }
        
        // Construire le contenu de l'email
        const assignmentsList = expertAssignments.map(a => {
            const [year, month, day] = a.date.split('-');
            const dateStr = `${day}/${month}/${year}`;
            let locationText = '';
            if (a.location && a.location !== '-') {
                locationText = ` - <em>${a.location}</em>`;
            }
            return `<li><strong>${dateStr} (${a.period})</strong> - ${a.activity}${locationText}</li>`;
        }).join('');
        
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: email,
            subject: 'Nouvelle affectation - Planification GANTT',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #1D70B7; border-bottom: 2px solid #1D70B7; padding-bottom: 10px;">
                            Nouvelle affectation
                        </h2>
                        
                        <p>Bonjour ${expertPrenom || expertName},</p>
                        
                        <p><strong>${senderName}</strong> vous a affecté ${expertAssignments.length} nouvelle(s) activité(s) :</p>
                        
                        <ul style="background-color: #e3f2fd; padding: 15px 15px 15px 35px; border-left: 4px solid #2196f3; border-radius: 4px; list-style-type: disc;">
                            ${assignmentsList}
                        </ul>
                        
                        <p style="margin-top: 20px;">Cordialement,<br>Le système de planification SI-SAMU</p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                            Cet email a été envoyé depuis le système SI-SAMU de planification des ressources.
                        </p>
                    </div>
                </div>
            `
        };
        
        try {
            console.log(`📧 Envoi à ${email} (${expertName})...`);
            await transporter.sendMail(mailOptions);
            console.log(`✅ Email envoyé à ${email}`);
            return { resourceId, success: true, email };
        } catch (error) {
            console.error(`❌ Erreur envoi à ${email}:`, error.message);
            return { resourceId, success: false, error: error.message };
        }
    });
    
    // Attendre tous les envois
    const results = await Promise.all(emailPromises);
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log(`📊 Résultat: ${successCount} envoyé(s), ${failedCount} échec(s)`);
    
    // Logger l'action
    if (successCount > 0 && req.session.logId) {
        const successEmails = results.filter(r => r.success).map(r => r.email).join(', ');
        database.run(
            `UPDATE connection_logs 
             SET modifications = modifications || ? 
             WHERE id = ?`,
            [`${new Date().toLocaleString('fr-FR')}: Emails d'affectation envoyés à: ${successEmails}\n`, req.session.logId]
        );
    }
    
    res.json({
        success: successCount > 0,
        results,
        sent: successCount,
        failed: failedCount
    });
});

// ========== GESTION DES CONGÉS SCOLAIRES ==========

// Sauvegarder les congés scolaires
app.post('/api/school-holidays', requireAdmin, (req, res) => {
    const { holidays } = req.body;
    
    if (!holidays) {
        return res.status(400).json({ success: false, error: 'Données manquantes' });
    }
    
    // Sauvegarder dans la table settings
    const holidaysJson = JSON.stringify(holidays);
    
    database.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('school_holidays', ?)`,
        [holidaysJson],
        (err) => {
            if (err) {
                console.error('Erreur sauvegarde congés scolaires:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            console.log('📅 Congés scolaires sauvegardés');
            res.json({ success: true });
        }
    );
});

// Récupérer les congés scolaires
app.get('/api/school-holidays', requireAuth, (req, res) => {
    database.get(
        `SELECT value FROM settings WHERE key = 'school_holidays'`,
        (err, row) => {
            if (err) {
                console.error('Erreur lecture congés scolaires:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            if (row && row.value) {
                try {
                    const holidays = JSON.parse(row.value);
                    res.json({ success: true, holidays });
                } catch (e) {
                    res.json({ success: true, holidays: { zoneA: [], zoneB: [], zoneC: [] } });
                }
            } else {
                res.json({ success: true, holidays: { zoneA: [], zoneB: [], zoneC: [] } });
            }
        }
    );
});

// ========== FIN GESTION DES CONGÉS SCOLAIRES ==========

// ========== GESTION DES AUTOMATISATIONS ==========

// Récupérer la configuration d'une automatisation
app.get('/api/automation/config/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.get(
        `SELECT value FROM settings WHERE key = ?`,
        [`automation_${id}_config`],
        (err, row) => {
            if (err) {
                console.error('Erreur lecture config automation:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (row && row.value) {
                try {
                    const config = JSON.parse(row.value);
                    res.json({ success: true, config });
                } catch (e) {
                    res.json({ success: true, config: {} });
                }
            } else {
                res.json({ success: true, config: {} });
            }
        }
    );
});

// Sauvegarder la configuration d'une automatisation
app.post('/api/automation/config/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { config } = req.body;
    
    const configJson = JSON.stringify(config);
    
    database.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        [`automation_${id}_config`, configJson],
        (err) => {
            if (err) {
                console.error('Erreur sauvegarde config automation:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log(`📧 Configuration automatisation ${id} sauvegardée:`, config);
            res.json({ success: true });
        }
    );
});

// Récupérer les logs d'une automatisation
app.get('/api/automation/logs/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.all(
        `SELECT * FROM automation_logs WHERE automation_id = ? ORDER BY sent_at DESC LIMIT 100`,
        [id],
        (err, rows) => {
            if (err) {
                // Table n'existe peut-être pas encore
                console.error('Erreur lecture logs automation:', err);
                return res.json({ success: true, logs: [] });
            }
            
            res.json({ success: true, logs: rows || [] });
        }
    );
});

// Supprimer les logs d'une automatisation
app.delete('/api/automation/logs/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.run(
        `DELETE FROM automation_logs WHERE automation_id = ?`,
        [id],
        (err) => {
            if (err) {
                console.error('Erreur suppression logs automation:', err);
                return res.status(500).json({ error: err.message });
            }
            
            res.json({ success: true });
        }
    );
});

// Tester l'automatisation n°1 : trouver les experts sans disponibilités pour M+1
app.get('/api/automation/test/1', requireAdmin, async (req, res) => {
    try {
        // Calculer le mois M+1
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const year = nextMonth.getFullYear();
        const month = nextMonth.getMonth(); // 0-indexed
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const targetMonth = `${monthNames[month]} ${year}`;
        
        // Calculer le premier et dernier jour du mois M+1 pour vérifier la période MAD
        const firstDayNextMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayNextMonth = new Date(year, month + 1, 0); // Dernier jour du mois
        const lastDayNextMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNextMonth.getDate()).padStart(2, '0')}`;
        
        // Récupérer tous les experts actifs avec leur ressource active et dont la période MAD couvre le mois M+1
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT u.id, u.nom, u.prenom, u.email, u.resource_id, r.date_debut, r.date_fin
                 FROM users u 
                 LEFT JOIN resources r ON u.resource_id = r.id
                 WHERE u.is_expert = 1 
                 AND u.actif = 1
                 AND u.email IS NOT NULL 
                 AND u.email != ''
                 AND u.resource_id IS NOT NULL
                 AND r.actif = 1
                 AND (r.date_debut IS NULL OR r.date_debut <= ?)
                 AND (r.date_fin IS NULL OR r.date_fin >= ?)`,
                [lastDayNextMonthStr, firstDayNextMonth],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        console.log(`🔍 ${experts.length} expert(s) actif(s) avec MAD couvrant ${targetMonth}`);
        
        // Pour chaque expert, vérifier s'il a des disponibilités pour le mois M+1
        const expertsWithoutAvailability = [];
        
        for (const expert of experts) {
            // Chercher des entrées de disponibilité (type='available', value='2') pour ce mois
            // Format date_key: YYYY-MM-DD_AM ou YYYY-MM-DD_PM
            const hasAvailability = await new Promise((resolve, reject) => {
                const monthStr = String(month + 1).padStart(2, '0');
                const pattern = `${year}-${monthStr}-%`;
                
                database.get(
                    `SELECT COUNT(*) as count FROM schedule_data 
                     WHERE resource_id = ? 
                     AND date_key LIKE ? 
                     AND type = 'available' 
                     AND value = '2'`,
                    [expert.resource_id, pattern],
                    (err, row) => {
                        if (err) {
                            console.error('Erreur requête disponibilités:', err);
                            reject(err);
                        } else {
                            console.log(`🔍 Expert ${expert.prenom} ${expert.nom} (resource_id=${expert.resource_id}): ${row?.count || 0} disponibilités pour ${year}-${monthStr}`);
                            resolve(row && row.count > 0);
                        }
                    }
                );
            });
            
            if (!hasAvailability) {
                expertsWithoutAvailability.push({
                    id: expert.id,
                    nom: expert.nom,
                    prenom: expert.prenom,
                    email: expert.email,
                    resource_id: expert.resource_id
                });
            }
        }
        
        res.json({
            success: true,
            targetMonth,
            year,
            month: month + 1,
            expertsWithoutAvailability
        });
        
    } catch (error) {
        console.error('Erreur test automation 1:', error);
        res.status(500).json({ error: error.message });
    }
});

// Envoyer des rappels aux experts
app.post('/api/automation/send-reminder', requireAdmin, async (req, res) => {
    const { experts, targetMonth } = req.body;
    
    if (!experts || experts.length === 0) {
        return res.status(400).json({ error: 'Aucun expert sélectionné' });
    }
    
    const transporter = createEmailTransporter();
    if (!transporter) {
        return res.status(500).json({ error: 'Configuration email non disponible' });
    }
    
    const senderName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    let sent = 0;
    let failed = 0;
    
    // Récupérer l'email de copie si configuré
    let copyEmail = null;
    try {
        const configRow = await new Promise((resolve, reject) => {
            database.get(
                `SELECT value FROM settings WHERE key = 'automation_1_config'`,
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (configRow && configRow.value) {
            const config = JSON.parse(configRow.value);
            if (config.copyUserId) {
                const copyUser = await new Promise((resolve, reject) => {
                    database.get(
                        `SELECT email FROM users WHERE id = ?`,
                        [config.copyUserId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                if (copyUser) copyEmail = copyUser.email;
            }
        }
    } catch (e) {
        console.error('Erreur récupération email copie:', e);
    }
    
    console.log(`📧 Envoi de rappels à ${experts.length} expert(s) pour ${targetMonth}`);
    
    for (const expert of experts) {
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: expert.email,
            cc: copyEmail || undefined,
            subject: `Rappel : Saisie des disponibilités pour ${targetMonth}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #ff9800; border-bottom: 2px solid #ff9800; padding-bottom: 10px;">
                            📅 Rappel de saisie des disponibilités
                        </h2>
                        
                        <p>Bonjour ${expert.prenom} ${expert.nom},</p>
                        
                        <p>Nous vous rappelons que vos disponibilités pour le mois de <strong>${targetMonth}</strong> n'ont pas encore été renseignées dans l'application de planification.</p>
                        
                        <div style="margin: 20px 0; padding: 15px; background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
                            <p style="margin: 0;"><strong>Action requise :</strong></p>
                            <p style="margin: 5px 0 0 0;">Merci de vous connecter à l'application et de saisir vos disponibilités pour le mois à venir.</p>
                        </div>
                        
                        <p>Cordialement,<br>${senderName}<br>Système de planification SI-SAMU</p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                            Cet email a été envoyé automatiquement depuis le système SI-SAMU de planification des ressources.
                        </p>
                    </div>
                </div>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Rappel envoyé à ${expert.email}`);
            sent++;
            
            // Enregistrer dans les logs
            database.run(
                `INSERT INTO automation_logs (automation_id, expert_id, expert_name, expert_email, target_month, sent_at)
                 VALUES (?, ?, ?, ?, ?, datetime('now'))`,
                [1, expert.id, `${expert.prenom} ${expert.nom}`, expert.email, targetMonth]
            );
            
        } catch (error) {
            console.error(`❌ Erreur envoi à ${expert.email}:`, error.message);
            failed++;
        }
    }
    
    res.json({ success: true, sent, failed });
});

// ========== FIN GESTION DES AUTOMATISATIONS ==========

// Routes d'export Excel
app.get('/api/export/resources', requireAuth, (req, res) => {
    database.all('SELECT * FROM resources ORDER BY nom, prenom', (err, resources) => {
        if (err) {
            console.error('Erreur export resources:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Générer CSV
        let csv = '\ufeff'; // BOM UTF-8
        csv += 'ID,Nom,Prénom,Trigramme,Email,Téléphone,Taux MAD (%),SAMU,Début MAD,Fin MAD,Actif,Date création\n';
        
        resources.forEach(r => {
            csv += `${r.id},"${r.nom}","${r.prenom}","${r.trigramme}","${r.email || ''}","${r.telephone || ''}",${r.taux},"${r.samu}","${r.date_debut || ''}","${r.date_fin || ''}",${r.actif ? 'Oui' : 'Non'},"${r.created_at}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=resources_${timestamp}.csv`);
        
        logUserAction(req, 'Export ressources Excel', { count: resources.length });
        res.send(csv);
    });
});

app.get('/api/export/gantt', requireAuth, (req, res) => {
    const { year, month, filename } = req.query;
    
    if (!year || month === undefined) {
        return res.status(400).json({ error: 'Année et mois requis' });
    }
    
    const monthInt = parseInt(month);
    
    database.all('SELECT * FROM resources WHERE actif = 1 ORDER BY nom, prenom', (err, resources) => {
        if (err) {
            console.error('Erreur export gantt:', err);
            return res.status(500).json({ error: err.message });
        }
        
        database.all('SELECT * FROM schedule_data', (err2, scheduleData) => {
            if (err2) {
                console.error('Erreur export schedule:', err2);
                return res.status(500).json({ error: err2.message });
            }
            
            const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                              'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
            
            // Format du mois pour la clé de date (avec zéro devant si nécessaire)
            const monthStr = String(monthInt + 1).padStart(2, '0');
            
            // Générer CSV
            let csv = '\ufeff'; // BOM UTF-8
            csv += `Planning - ${monthNames[monthInt]} ${year}\n\n`;
            
            // En-tête
            csv += 'Ressource,Trigramme,SAMU';
            
            const lastDay = new Date(parseInt(year), monthInt + 1, 0).getDate();
            for (let day = 1; day <= lastDay; day++) {
                const date = new Date(parseInt(year), monthInt, day);
                const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()];
                csv += `,${dayName} ${day} AM,${dayName} ${day} PM`;
            }
            csv += '\n';
            
            // Données par ressource
            resources.forEach(resource => {
                csv += `"${resource.nom} ${resource.prenom}","${resource.trigramme}","${resource.samu}"`;
                
                for (let day = 1; day <= lastDay; day++) {
                    const dayStr = String(day).padStart(2, '0');
                    const dateKeyBase = `${year}-${monthStr}-${dayStr}`;
                    
                    // AM
                    const dateKeyAM = `${dateKeyBase}_AM`;
                    const availAM = scheduleData.find(s => 
                        s.resource_id === resource.id && 
                        s.date_key === dateKeyAM && 
                        s.type === 'available'
                    );
                    const actAM = scheduleData.find(s => 
                        s.resource_id === resource.id && 
                        s.date_key === dateKeyAM && 
                        s.type === 'activity'
                    );
                    const locAM = scheduleData.find(s => 
                        s.resource_id === resource.id && 
                        s.date_key === dateKeyAM && 
                        s.type === 'localisation'
                    );
                    
                    // PM
                    const dateKeyPM = `${dateKeyBase}_PM`;
                    const availPM = scheduleData.find(s => 
                        s.resource_id === resource.id && 
                        s.date_key === dateKeyPM && 
                        s.type === 'available'
                    );
                    const actPM = scheduleData.find(s => 
                        s.resource_id === resource.id && 
                        s.date_key === dateKeyPM && 
                        s.type === 'activity'
                    );
                    const locPM = scheduleData.find(s => 
                        s.resource_id === resource.id && 
                        s.date_key === dateKeyPM && 
                        s.type === 'localisation'
                    );
                    
                    const availLabelAM = availAM ? (availAM.value === '1' ? 'Indispo' : 'Dispo') : '-';
                    const actLabelAM = actAM ? getActivityLabel(actAM.value) : '-';
                    const locLabelAM = locAM ? locAM.value : '-';
                    
                    const availLabelPM = availPM ? (availPM.value === '1' ? 'Indispo' : 'Dispo') : '-';
                    const actLabelPM = actPM ? getActivityLabel(actPM.value) : '-';
                    const locLabelPM = locPM ? locPM.value : '-';
                    
                    csv += `,"${availLabelAM} / ${actLabelAM} / ${locLabelAM}","${availLabelPM} / ${actLabelPM} / ${locLabelPM}"`;
                }
                
                csv += '\n';
            });
            
            // Utiliser le nom de fichier personnalisé si fourni, sinon générer un nom par défaut
            const finalFilename = filename || `planning_${monthNames[monthInt]}_${year}.csv`;
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
            
            logUserAction(req, 'Export planning CSV', { 
                year, 
                month: monthNames[monthInt],
                resources: resources.length 
            });
            res.send(csv);
        });
    });
});

function getActivityLabel(value) {
    const labels = {
        '1': 'Indisponible',
        '2': 'En attente',
        '3': 'SAMU Dép.',
        '4': 'SAMU Dev.',
        '5': 'ANS Dép.',
        '6': 'ANS Dev.',
        '7': 'Qualification',
        '8': 'Divers'
    };
    return labels[value] || '-';
}

// ==================== ROUTES SETTINGS ====================

app.get('/api/settings', requireAuth, (req, res) => {
    database.all('SELECT * FROM settings', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    });
});

// Endpoint PUBLIC pour récupérer la version (accessible sans authentification)
app.get('/api/version', (req, res) => {
    database.get('SELECT value FROM settings WHERE key = ?', ['app_version'], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ version: row ? row.value : '1.0.0' });
    });
});

app.put('/api/settings', requireAuth, requireAdmin, (req, res) => {
    const { key, value } = req.body;
    
    database.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            logUserAction(req, 'Mise à jour paramètre', { key, value });
            res.json({ success: true, key, value });
        }
    );
});

// ==================== ROUTES NOTIFICATIONS ====================

app.post('/api/pending-notifications', requireAuth, (req, res) => {
    const { sessionId, resourceId, expertId, assignmentData } = req.body;
    
    database.run(
        `INSERT INTO pending_notifications (session_id, resource_id, expert_id, assignment_data, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, resourceId, expertId, JSON.stringify(assignmentData), req.session.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.get('/api/pending-notifications/:sessionId', requireAuth, (req, res) => {
    const { sessionId } = req.params;
    
    database.all(
        `SELECT pn.*, u.email, u.nom, u.prenom, r.nom as resource_nom, r.prenom as resource_prenom
         FROM pending_notifications pn
         JOIN users u ON pn.expert_id = u.id
         JOIN resources r ON pn.resource_id = r.id
         WHERE pn.session_id = ?`,
        [sessionId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

app.delete('/api/pending-notifications/:sessionId', requireAuth, (req, res) => {
    const { sessionId } = req.params;
    
    database.run(
        'DELETE FROM pending_notifications WHERE session_id = ?',
        [sessionId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, deleted: this.changes });
        }
    );
});

app.post('/api/send-assignment-notifications', requireAuth, async (req, res) => {
    const { sessionId } = req.body;
    
    try {
        const notifications = await new Promise((resolve, reject) => {
            database.all(
                `SELECT pn.*, u.email, u.nom, u.prenom, r.nom as resource_nom, r.prenom as resource_prenom,
                        creator.nom as creator_nom, creator.prenom as creator_prenom
                 FROM pending_notifications pn
                 JOIN users u ON pn.expert_id = u.id
                 JOIN resources r ON pn.resource_id = r.id
                 JOIN users creator ON pn.created_by = creator.id
                 WHERE pn.session_id = ?`,
                [sessionId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        const results = [];
        for (const notif of notifications) {
            const assignmentData = JSON.parse(notif.assignment_data);
            
            const emailBody = `
                <h2>Nouvelle affectation - Planification GANTT</h2>
                <p>Bonjour ${notif.prenom} ${notif.nom},</p>
                <p><strong>${notif.creator_prenom} ${notif.creator_nom}</strong> vous a affecté une nouvelle activité :</p>
                <ul>
                    <li><strong>Période :</strong> ${assignmentData.dates}</li>
                    <li><strong>Activité :</strong> ${assignmentData.activity}</li>
                    <li><strong>Localisation :</strong> ${assignmentData.location}</li>
                </ul>
                <p>Cordialement,<br>Le système de planification</p>
            `;
            
            try {
                await sendEmail(notif.email, 'Nouvelle affectation', emailBody);
                results.push({ success: true, expert: `${notif.prenom} ${notif.nom}` });
            } catch (error) {
                results.push({ success: false, expert: `${notif.prenom} ${notif.nom}`, error: error.message });
            }
        }
        
        // Supprimer les notifications envoyées
        database.run('DELETE FROM pending_notifications WHERE session_id = ?', [sessionId]);
        
        logUserAction(req, 'Envoi notifications affectations', { 
            sessionId,
            count: notifications.length,
            results 
        });
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== DEMANDE D'AFFECTATION PAR EMAIL ==========
app.post('/api/request-assignment', requireAuth, async (req, res) => {
    try {
        const { fromName, fromEmail, expertIds, subject, startDate, startPeriod, endDate, endPeriod, message } = req.body;

        console.log('📧 Demande d\'affectation reçue:', { fromName, fromEmail, expertIds, subject, startDate, endDate });

        if (!expertIds || expertIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucun expert sélectionné' });
        }

        if (!fromEmail) {
            return res.status(400).json({ success: false, error: 'Email de l\'expéditeur manquant' });
        }

        // Récupérer les informations des experts avec leurs emails depuis la table users
        const placeholders = expertIds.map(() => '?').join(',');
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT 
                    r.id, 
                    r.nom, 
                    r.prenom, 
                    u.email
                FROM resources r
                LEFT JOIN users u ON u.resource_id = r.id
                WHERE r.id IN (${placeholders}) AND r.actif = 1`,
                expertIds,
                (err, rows) => {
                    if (err) {
                        console.error('❌ Erreur DB:', err);
                        reject(err);
                    } else {
                        console.log('✅ Experts trouvés:', rows);
                        resolve(rows);
                    }
                }
            );
        });

        if (experts.length === 0) {
            console.log('⚠️ Aucun expert trouvé dans la base de données');
            return res.status(404).json({ success: false, error: 'Aucun expert trouvé' });
        }

        // Vérifier que les experts ont des emails
        const expertsWithEmail = experts.filter(e => e.email && e.email.trim() !== '');
        const expertsWithoutEmail = experts.filter(e => !e.email || e.email.trim() === '');

        if (expertsWithoutEmail.length > 0) {
            console.log('⚠️ Experts sans email:', expertsWithoutEmail.map(e => `${e.prenom} ${e.nom}`));
        }

        if (expertsWithEmail.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Aucun des experts sélectionnés n\'a d\'adresse email configurée. Veuillez ajouter leur email dans la gestion des utilisateurs.' 
            });
        }

        // Formater les dates pour l'affichage
        const formatDate = (dateStr) => {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        };

        const startDateFormatted = `${formatDate(startDate)} - ${startPeriod}`;
        const endDateFormatted = `${formatDate(endDate)} - ${endPeriod}`;

        // Récupérer le transporteur email
        const transporter = createEmailTransporter();
        
        if (!transporter) {
            console.log('⚠️ Configuration email non disponible');
            return res.status(500).json({ 
                success: false, 
                error: 'Configuration email non disponible. Veuillez configurer SMTP dans les paramètres.' 
            });
        }

        console.log('📧 Envoi d\'emails à:', expertsWithEmail.map(e => e.email));

        // Envoyer un email à chaque expert
        const emailPromises = expertsWithEmail.map(expert => {
            const personalizedMessage = message.replace(/\[Prénom de l'utilisateur\]/g, expert.prenom);

            const mailOptions = {
                from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
                replyTo: fromEmail,
                to: expert.email,
                subject: subject,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <h2 style="color: #1D70B7; border-bottom: 2px solid #1D70B7; padding-bottom: 10px;">
                                Demande d'affectation
                            </h2>
                            
                            <div style="margin: 20px 0; padding: 15px; background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                                <p style="margin: 5px 0;"><strong>De:</strong> ${fromName} (${fromEmail})</p>
                                <p style="margin: 5px 0;"><strong>Début:</strong> ${startDateFormatted}</p>
                                <p style="margin: 5px 0;"><strong>Fin:</strong> ${endDateFormatted}</p>
                            </div>
                            
                            <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 4px; line-height: 1.8;">
                                ${personalizedMessage.split('\n').map(line => 
                                    line.trim() === '' ? '<br>' : `<p style="margin: 0 0 10px 0;">${line}</p>`
                                ).join('')}
                            </div>
                            
                            <div style="text-align: center; margin: 25px 0;">
                                <a href="mailto:${fromEmail}?subject=${encodeURIComponent('Re: ' + subject)}&body=${encodeURIComponent(`Bonjour ${fromName.split(' ')[0]},

[Votre réponse ici]

---
Contexte de la demande :
De : ${fromName} (${fromEmail})
Début : ${startDateFormatted}
Fin : ${endDateFormatted}
`)}" 
                                   style="display: inline-block; padding: 12px 30px; background-color: #27ae60; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                    📧 Répondre à ${fromName}
                                </a>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                            
                            <p style="color: #7f8c8d; font-size: 12px; text-align: center; margin: 0;">
                                Cet email a été envoyé depuis le système SI-SAMU de planification des ressources.
                            </p>
                        </div>
                    </div>
                `
            };

            console.log(`📧 Envoi email à ${expert.email} (${expert.prenom} ${expert.nom})...`);

            return transporter.sendMail(mailOptions)
                .then(() => {
                    console.log(`✅ Email envoyé avec succès à ${expert.email}`);
                    return expert.email;
                })
                .catch(error => {
                    console.error(`❌ Erreur envoi email à ${expert.email}:`, error.message);
                    return null;
                });
        });

        const results = await Promise.all(emailPromises);
        const successfulEmails = results.filter(email => email !== null);

        console.log('📊 Résultats envoi:', { 
            total: emailPromises.length, 
            succès: successfulEmails.length,
            échecs: emailPromises.length - successfulEmails.length 
        });

        if (successfulEmails.length > 0) {
            let responseMessage = `${successfulEmails.length} email(s) envoyé(s) avec succès`;
            if (expertsWithoutEmail.length > 0) {
                responseMessage += ` (${expertsWithoutEmail.length} expert(s) sans email configuré)`;
            }
            
            // Logger l'action dans connection_logs
            if (req.session.logId) {
                const expertNames = expertsWithEmail.map(e => `${e.prenom} ${e.nom}`).join(', ');
                const logMessage = `Demande d'affectation envoyée à: ${expertNames} (${startDate} ${startPeriod} - ${endDate} ${endPeriod})`;
                
                database.run(
                    `UPDATE connection_logs 
                     SET modifications = modifications || ? 
                     WHERE id = ?`,
                    [`${new Date().toLocaleString('fr-FR')}: ${logMessage}\n`, req.session.logId],
                    (err) => {
                        if (err) {
                            console.error('❌ Erreur log action:', err);
                        } else {
                            console.log('✅ Action loggée dans connection_logs');
                        }
                    }
                );
            }
            
            res.json({
                success: true,
                message: responseMessage,
                emails: successfulEmails
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Échec de l\'envoi de tous les emails. Vérifiez la configuration SMTP dans les paramètres.'
            });
        }

    } catch (error) {
        console.error('❌ Erreur demande d\'affectation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== RAZ (REMISE À ZÉRO) DES LOGS ==========

// Endpoint pour envoyer les emails d'affectation (utilise la même méthode que request-assignment)
app.post('/api/send-assignment-emails', requireAuth, async (req, res) => {
    try {
        const { assignments } = req.body;
        // assignments = [{ resourceId, expertEmail, expertNom, expertPrenom, items: [{date, period, activity, location}] }]
        
        console.log('📧 Envoi emails d\'affectation reçu:', assignments?.length, 'expert(s)');
        
        if (!assignments || assignments.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucune affectation à envoyer' });
        }
        
        // Récupérer le transporteur email
        const transporter = createEmailTransporter();
        
        if (!transporter) {
            console.log('⚠️ Configuration email non disponible');
            return res.status(500).json({ 
                success: false, 
                error: 'Configuration email non disponible. Veuillez configurer SMTP dans les paramètres.' 
            });
        }
        
        const senderName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
        
        // Préparer les emails
        const emailPromises = assignments.map(assignment => {
            const { resourceId, expertEmail, expertNom, expertPrenom, items } = assignment;
            
            if (!expertEmail) {
                console.log(`⚠️ Pas d'email pour ${expertPrenom} ${expertNom}`);
                return Promise.resolve({ resourceId, success: false, error: 'Pas d\'email' });
            }
            
            // Construire la liste des affectations
            const assignmentsList = items.map(a => {
                const [year, month, day] = a.date.split('-');
                const dateStr = `${day}/${month}/${year}`;
                const periodLabel = a.period === 'AM' ? 'Matin' : 'Après-midi';
                let locationText = '';
                if (a.location && a.location !== '-') {
                    locationText = ` - ${a.location}`;
                }
                return `<li><strong>${dateStr} (${periodLabel})</strong> - ${a.activity}${locationText}</li>`;
            }).join('');
            
            const mailOptions = {
                from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
                to: expertEmail,
                subject: 'Nouvelle affectation - Planification GANTT',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <h2 style="color: #1D70B7; border-bottom: 2px solid #1D70B7; padding-bottom: 10px;">
                                Nouvelle affectation - Planification GANTT
                            </h2>
                            
                            <p>Bonjour ${expertPrenom} ${expertNom},</p>
                            
                            <p><strong>${senderName}</strong> vous a affecté ${items.length} nouvelle(s) activité(s) :</p>
                            
                            <ul style="line-height: 1.8;">
                                ${assignmentsList}
                            </ul>
                            
                            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                            
                            <p style="color: #7f8c8d; font-size: 12px; text-align: center; margin: 0;">
                                Cet email a été envoyé depuis le système SI-SAMU de planification des ressources.
                            </p>
                        </div>
                    </div>
                `
            };
            
            console.log(`📧 Envoi email à ${expertEmail} (${expertPrenom} ${expertNom})...`);
            
            return transporter.sendMail(mailOptions)
                .then(() => {
                    console.log(`✅ Email envoyé avec succès à ${expertEmail}`);
                    return { resourceId, success: true, email: expertEmail };
                })
                .catch(error => {
                    console.error(`❌ Erreur envoi email à ${expertEmail}:`, error.message);
                    return { resourceId, success: false, error: error.message };
                });
        });
        
        const results = await Promise.all(emailPromises);
        const successfulResults = results.filter(r => r.success);
        const failedResults = results.filter(r => !r.success);
        
        console.log('📊 Résultats envoi:', { 
            total: results.length, 
            succès: successfulResults.length,
            échecs: failedResults.length 
        });
        
        res.json({
            success: successfulResults.length > 0,
            sent: successfulResults.map(r => r.resourceId),
            failed: failedResults.map(r => r.resourceId),
            message: `${successfulResults.length} email(s) envoyé(s), ${failedResults.length} échec(s)`
        });
        
    } catch (error) {
        console.error('❌ Erreur envoi emails d\'affectation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint de diagnostic pour les logs de planning (temporaire)
app.get('/api/logs/planning-debug', requireAdmin, (req, res) => {
    // Compter les logs de planning par user_id
    database.all(
        `SELECT 
            user_id,
            COUNT(*) as count
         FROM action_logs 
         WHERE action_type = 'planning_modification'
         GROUP BY user_id
         ORDER BY count DESC`,
        [],
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Récupérer quelques exemples de logs avec user_id NULL
            database.all(
                `SELECT id, user_id, created_at, details
                 FROM action_logs
                 WHERE action_type = 'planning_modification' AND user_id IS NULL
                 LIMIT 10`,
                [],
                (err2, nullLogs) => {
                    if (err2) {
                        return res.status(500).json({ error: err2.message });
                    }
                    
                    res.json({
                        stats: stats,
                        nullLogsCount: nullLogs.length,
                        nullLogsExamples: nullLogs,
                        message: stats.find(s => s.user_id === null) ? 
                            '⚠️ Des logs de planning ont user_id NULL' : 
                            '✅ Tous les logs de planning ont un user_id'
                    });
                }
            );
        }
    );
});

// Endpoint pour récupérer les nouvelles affectations depuis la dernière connexion

// ==================== NOUVEAUX ENDPOINTS NOTIFICATIONS v12.0 ====================

// Endpoint pour compter les notifications d'un expert

// ========== RAZ LOGS ==========

app.delete('/api/logs/raz', requireAdmin, (req, res) => {
    const { type, userId } = req.body;
    
    console.log(`🗑️ RAZ logs demandée: type=${type}, userId=${userId}`);
    
    if (!type || !userId) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }
    
    // Récupérer d'abord le username de l'utilisateur
    database.get(
        `SELECT username FROM users WHERE id = ?`,
        [userId],
        (errUser, user) => {
            if (errUser || !user) {
                console.error('❌ Utilisateur non trouvé:', userId);
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }
            
            console.log(`👤 Username trouvé: ${user.username}`);
            
            let query;
            let params;
            
            switch (type) {
                case 'connexions':
                    // Supprimer par username au lieu de user_id pour gérer les logs avec user_id NULL
                    query = 'DELETE FROM connection_logs WHERE username = ?';
                    params = [user.username];
                    break;
                    
                case 'planning':
                    // Supprimer par username pour cohérence (les anciens logs peuvent avoir user_id NULL)
                    query = `DELETE FROM action_logs WHERE user_id = ? AND action_type = ?`;
                    params = [userId, 'planning_modification'];
                    // Note: Les logs de planning n'ont pas de champ username, on utilise user_id
                    // Si des logs anciens ont user_id NULL, ils ne seront pas supprimés
                    // mais ce n'est normalement pas le cas pour les logs de planning
                    break;
                    
                case 'emails':
                    // Supprimer par user_id (les logs d'emails ont toujours un user_id valide)
                    query = 'DELETE FROM action_logs WHERE user_id = ? AND action_type = ?';
                    params = [userId, 'email_request'];
                    break;
                    
                default:
                    return res.status(400).json({ error: 'Type de log inconnu' });
            }
            
            // Faire la suppression
            database.run(query, params, function(err) {
                if (err) {
                    console.error('Erreur suppression logs:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                // Logger cette action
                const actionDescription = {
                    'connexions': 'Suppression connexions',
                    'planning': 'Suppression modifications planning',
                    'emails': 'Suppression demandes affectation'
                };
                
                logUserAction(req, actionDescription[type], { 
                    targetUserId: userId,
                    targetUsername: user.username,
                    deletedCount: this.changes 
                });
                
                res.json({ 
                    success: true, 
                    deleted: this.changes,
                    message: `${this.changes} enregistrement(s) supprimé(s)` 
                });
            });
        }
    );
});

// Endpoint de purge complète des logs (pour tous les utilisateurs)
app.delete('/api/logs/purge-all', requireAdmin, (req, res) => {
    const { table, type } = req.body;
    
    if (!table) {
        return res.status(400).json({ error: 'Paramètre table manquant' });
    }
    
    let query;
    let params = [];
    
    if (table === 'connection_logs') {
        query = 'DELETE FROM connection_logs';
    } else if (table === 'action_logs') {
        if (type) {
            query = 'DELETE FROM action_logs WHERE action_type = ?';
            params = [type];
        } else {
            query = 'DELETE FROM action_logs';
        }
    } else {
        return res.status(400).json({ error: 'Table invalide' });
    }
    
    // Faire la suppression
    database.run(query, params, function(err) {
        if (err) {
            console.error('Erreur purge logs:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Logger cette action critique
        logUserAction(req, 'Purge complète logs', { 
            table,
            type: type || 'all',
            deletedCount: this.changes 
        });
        
        res.json({ 
            success: true, 
            deleted: this.changes,
            table,
            message: `${this.changes} enregistrement(s) supprimé(s) de ${table}` 
        });
    });
});

// ========== PHOTO DE PROFIL ==========

// Récupérer la photo de profil de l'utilisateur connecté
app.get('/api/profile/photo', requireAuth, (req, res) => {
    database.get(
        `SELECT profile_photo FROM users WHERE id = ?`,
        [req.session.userId],
        (err, row) => {
            if (err) {
                console.error('Erreur récupération photo:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ photo: row?.profile_photo || null });
        }
    );
});

// Upload de la photo de profil (base64)
app.post('/api/profile/photo', requireAuth, (req, res) => {
    const { photo } = req.body;
    
    if (!photo) {
        return res.status(400).json({ error: 'Photo manquante' });
    }
    
    // Vérifier que c'est bien une image base64
    if (!photo.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Format invalide' });
    }
    
    database.run(
        `UPDATE users SET profile_photo = ? WHERE id = ?`,
        [photo, req.session.userId],
        (err) => {
            if (err) {
                console.error('Erreur upload photo:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log('✅ Photo de profil mise à jour pour user', req.session.userId);
            res.json({ success: true });
        }
    );
});

// Changer le mot de passe de l'utilisateur connecté
app.post('/api/profile/change-password', requireAuth, (req, res) => {
    const { newPassword } = req.body;
    
    if (!newPassword) {
        return res.status(400).json({ error: 'Nouveau mot de passe requis' });
    }
    
    // Validation du mot de passe
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }
    
    // Vérifier qu'il contient au moins un caractère spécial
    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/]/;
    if (!specialCharRegex.test(newPassword)) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 1 caractère spécial' });
    }
    
    // Hasher le nouveau mot de passe
    const hashedPassword = hashPassword(newPassword);
    
    database.run(
        `UPDATE users SET password = ? WHERE id = ?`,
        [hashedPassword, req.session.userId],
        (err) => {
            if (err) {
                console.error('Erreur changement mot de passe:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('✅ Mot de passe changé pour user', req.session.userId);
            
            // Logger l'action
            logUserAction(req, 'Changement de mot de passe', { userId: req.session.userId });
            
            res.json({ success: true });
        }
    );
});

// ========== NOTIFICATIONS EXPERTS ==========

// Récupérer le nombre de notifications non lues
app.get('/api/notifications/count', requireAuth, (req, res) => {
    if (!req.session.userId) {
        return res.json({ count: 0 });
    }

    database.get(
        `SELECT COUNT(*) as count FROM expert_notifications 
         WHERE expert_id = ? AND is_read = 0`,
        [req.session.userId],
        (err, row) => {
            if (err) {
                console.error('Erreur count notifications:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ count: row.count });
        }
    );
});

// Récupérer la liste des notifications
app.get('/api/notifications/list', requireAuth, (req, res) => {
    if (!req.session.userId) {
        return res.json({ notifications: [] });
    }

    // Récupérer d'abord les notifications et le resource_id de l'expert
    database.get(
        `SELECT resource_id FROM users WHERE id = ?`,
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return res.json({ notifications: [] });
            }
            
            const resourceId = user.resource_id;
            
            // Récupérer les notifications avec la localisation en temps réel
            database.all(
                `SELECT 
                    en.id,
                    en.expert_id,
                    en.date,
                    en.period,
                    en.activity_name,
                    en.requester_name,
                    en.action_type,
                    en.created_at,
                    en.is_read,
                    sd.value as localisation
                 FROM expert_notifications en
                 LEFT JOIN schedule_data sd ON sd.resource_id = ? 
                    AND sd.date_key = en.date || '_' || CASE WHEN en.period = 'Matin' THEN 'AM' ELSE 'PM' END
                    AND sd.type = 'localisation'
                 WHERE en.expert_id = ? AND en.is_read = 0
                 ORDER BY en.created_at DESC`,
                [resourceId, req.session.userId],
                (err, rows) => {
                    if (err) {
                        console.error('Erreur list notifications:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ notifications: rows });
                }
            );
        }
    );
});

// Marquer les notifications comme lues
app.post('/api/notifications/mark-read', requireAuth, (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: true });
    }

    database.run(
        `UPDATE expert_notifications 
         SET is_read = 1 
         WHERE expert_id = ? AND is_read = 0`,
        [req.session.userId],
        (err) => {
            if (err) {
                console.error('Erreur mark notifications read:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        }
    );
});

// Créer les notifications en batch (appelé à la déconnexion après envoi des emails)
app.post('/api/notifications/create-batch', requireAuth, async (req, res) => {
    const { notifications } = req.body;
    
    if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
        return res.json({ success: true, created: 0 });
    }
    
    const requesterName = `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    let created = 0;
    let errors = 0;
    
    console.log(`📝 Création de ${notifications.length} notification(s) en batch par ${requesterName}`);
    
    for (const notif of notifications) {
        const { resourceId, date, period, activity, location } = notif;
        
        try {
            // Récupérer l'user_id de l'expert à partir de resource_id
            const user = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT id FROM users WHERE resource_id = ? AND is_expert = 1`,
                    [resourceId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (!user) {
                console.log(`⚠️ Pas d'utilisateur expert trouvé pour resource_id ${resourceId}`);
                continue;
            }
            
            // Construire le nom de l'activité avec la localisation si présente
            let activityName = activity;
            if (location && location !== '-') {
                activityName = `${activity} (${location})`;
            }
            
            // Vérifier si une notification existe déjà pour cette demi-journée
            const existingNotif = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT id FROM expert_notifications 
                     WHERE expert_id = ? AND date = ? AND period = ? AND is_read = 0`,
                    [user.id, date, period],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (existingNotif) {
                // Une notification existe déjà pour cette demi-journée → UPDATE
                await new Promise((resolve, reject) => {
                    database.run(
                        `UPDATE expert_notifications 
                         SET activity_name = ?, requester_name = ?, action_type = ?, created_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [activityName, requesterName, 'Nouvelle affectation', existingNotif.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`🔄 Notification mise à jour pour expert_id ${user.id}, date ${date} ${period}`);
            } else {
                // Pas de notification existante → INSERT
                await new Promise((resolve, reject) => {
                    database.run(
                        `INSERT INTO expert_notifications (expert_id, date, period, activity_name, requester_name, action_type)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [user.id, date, period, activityName, requesterName, 'Nouvelle affectation'],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`✅ Notification créée pour expert_id ${user.id}, date ${date} ${period}`);
            }
            
            created++;
        } catch (error) {
            console.error(`❌ Erreur création notification pour resource ${resourceId}:`, error);
            errors++;
        }
    }
    
    console.log(`📊 Résultat batch: ${created} créée(s), ${errors} erreur(s)`);
    
    res.json({ success: true, created, errors });
});

// Supprimer toutes les notifications (pour nettoyer)
app.post('/api/notifications/clear-all', requireAdmin, (req, res) => {
    // D'abord, obtenir les statistiques par expert avant suppression
    database.all(
        `SELECT 
            en.expert_id,
            u.username,
            COUNT(*) as count
         FROM expert_notifications en
         LEFT JOIN users u ON en.expert_id = u.id
         GROUP BY en.expert_id, u.username
         ORDER BY u.username`,
        (err, stats) => {
            if (err) {
                console.error('Erreur récupération stats:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Calculer le total
            const totalNotifications = stats.reduce((sum, stat) => sum + stat.count, 0);
            
            // Maintenant supprimer toutes les notifications
            database.run(
                `DELETE FROM expert_notifications`,
                function(deleteErr) {
                    if (deleteErr) {
                        console.error('Erreur clear notifications:', deleteErr);
                        return res.status(500).json({ error: deleteErr.message });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: 'Toutes les notifications ont été supprimées',
                        totalDeleted: this.changes,
                        statsByExpert: stats
                    });
                }
            );
        }
    );
});

// Fonction helper pour créer une notification
function createNotification(expertResourceId, date, period, activityName, requesterName, actionType, callback) {
    
    // Récupérer l'user_id de l'expert à partir de resource_id
    database.get(
        `SELECT id FROM users WHERE resource_id = ? AND is_expert = 1`,
        [expertResourceId],
        (err, user) => {
            if (err || !user) {
                if (callback) callback(err);
                return;
            }

            // Vérifier si une notification existe déjà pour cette demi-journée
            database.get(
                `SELECT id FROM expert_notifications 
                 WHERE expert_id = ? AND date = ? AND period = ? AND is_read = 0`,
                [user.id, date, period],
                (errCheck, existingNotif) => {
                    if (errCheck) {
                        if (callback) callback(errCheck);
                        return;
                    }

                    if (existingNotif) {
                        // Une notification existe déjà pour cette demi-journée → UPDATE
                        database.run(
                            `UPDATE expert_notifications 
                             SET activity_name = ?, requester_name = ?, action_type = ?, created_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [activityName, requesterName, actionType, existingNotif.id],
                            (errUpdate) => {
                                if (callback) callback(errUpdate);
                            }
                        );
                    } else {
                        // Pas de notification existante → INSERT
                        database.run(
                            `INSERT INTO expert_notifications (expert_id, date, period, activity_name, requester_name, action_type)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [user.id, date, period, activityName, requesterName, actionType],
                            (errInsert) => {
                                if (callback) callback(errInsert);
                            }
                        );
                    }
                }
            );
        }
    );
}

// Servir les fichiers statiques APRÈS les routes API pour éviter les conflits
app.use(express.static(path.join(__dirname, 'public')));

// Route catch-all pour servir index.html (doit être la dernière route)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== SYSTÈME DE CRON POUR LES AUTOMATISATIONS ==========

// Fonction pour exécuter l'automatisation n°1 (rappel disponibilités)
async function runAutomation1() {
    console.log('⏰ [CRON] Vérification automatisation n°1...');
    
    try {
        // Récupérer la configuration
        const configRow = await new Promise((resolve, reject) => {
            database.get(
                `SELECT value FROM settings WHERE key = 'automation_1_config'`,
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!configRow || !configRow.value) {
            console.log('⏰ [CRON] Automatisation n°1 non configurée');
            return;
        }
        
        const config = JSON.parse(configRow.value);
        
        if (!config.enabled) {
            console.log('⏰ [CRON] Automatisation n°1 désactivée');
            return;
        }
        
        // Vérifier si on est à J-X de la fin du mois
        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysUntilEndOfMonth = lastDayOfMonth - currentDay;
        
        console.log(`⏰ [CRON] Jours avant fin du mois: ${daysUntilEndOfMonth}, Config: ${config.days} jours`);
        
        if (daysUntilEndOfMonth !== config.days) {
            console.log(`⏰ [CRON] Pas le bon jour pour l'envoi (J-${daysUntilEndOfMonth} vs J-${config.days})`);
            return;
        }
        
        console.log('⏰ [CRON] Déclenchement de l\'automatisation n°1...');
        
        // Calculer le mois M+1
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const year = nextMonth.getFullYear();
        const month = nextMonth.getMonth();
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const targetMonth = `${monthNames[month]} ${year}`;
        
        // Calculer le premier et dernier jour du mois M+1 pour vérifier la période MAD
        const firstDayNextMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDayNextMonth = new Date(year, month + 1, 0); // Dernier jour du mois
        const lastDayNextMonthStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNextMonth.getDate()).padStart(2, '0')}`;
        
        // Récupérer tous les experts actifs avec leur ressource active et dont la période MAD couvre le mois M+1
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT u.id, u.nom, u.prenom, u.email, u.resource_id, r.date_debut, r.date_fin
                 FROM users u 
                 LEFT JOIN resources r ON u.resource_id = r.id
                 WHERE u.is_expert = 1 
                 AND u.actif = 1
                 AND u.email IS NOT NULL 
                 AND u.email != ''
                 AND u.resource_id IS NOT NULL
                 AND r.actif = 1
                 AND (r.date_debut IS NULL OR r.date_debut <= ?)
                 AND (r.date_fin IS NULL OR r.date_fin >= ?)`,
                [lastDayNextMonthStr, firstDayNextMonth],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        console.log(`⏰ [CRON] ${experts.length} expert(s) actif(s) avec MAD couvrant ${targetMonth}`);
        
        // Trouver les experts sans disponibilités pour M+1
        const expertsToNotify = [];
        
        for (const expert of experts) {
            const hasAvailability = await new Promise((resolve, reject) => {
                const monthStr = String(month + 1).padStart(2, '0');
                const pattern = `${year}-${monthStr}-%`;
                
                database.get(
                    `SELECT COUNT(*) as count FROM schedule_data 
                     WHERE resource_id = ? 
                     AND date_key LIKE ? 
                     AND type = 'available' 
                     AND value = '2'`,
                    [expert.resource_id, pattern],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row && row.count > 0);
                    }
                );
            });
            
            if (!hasAvailability) {
                // Vérifier si on n'a pas déjà envoyé un rappel ce mois-ci pour ce mois cible
                const alreadySent = await new Promise((resolve, reject) => {
                    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    database.get(
                        `SELECT COUNT(*) as count FROM automation_logs 
                         WHERE automation_id = 1 
                         AND expert_id = ? 
                         AND target_month = ?
                         AND sent_at >= ?`,
                        [expert.id, targetMonth, startOfMonth],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row && row.count > 0);
                        }
                    );
                });
                
                if (!alreadySent) {
                    expertsToNotify.push(expert);
                } else {
                    console.log(`⏰ [CRON] Rappel déjà envoyé ce mois-ci à ${expert.prenom} ${expert.nom}`);
                }
            }
        }
        
        if (expertsToNotify.length === 0) {
            console.log('⏰ [CRON] Aucun expert à notifier');
            return;
        }
        
        console.log(`⏰ [CRON] ${expertsToNotify.length} expert(s) à notifier pour ${targetMonth}`);
        
        // Envoyer les emails
        const transporter = createEmailTransporter();
        if (!transporter) {
            console.error('⏰ [CRON] Configuration email non disponible');
            return;
        }
        
        // Récupérer l'email de copie si configuré
        let copyEmail = null;
        if (config.copyUserId) {
            const copyUser = await new Promise((resolve, reject) => {
                database.get(
                    `SELECT email FROM users WHERE id = ?`,
                    [config.copyUserId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            if (copyUser) copyEmail = copyUser.email;
        }
        
        let sent = 0;
        let failed = 0;
        
        for (const expert of expertsToNotify) {
            const mailOptions = {
                from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
                to: expert.email,
                cc: copyEmail || undefined,
                subject: `Rappel : Saisie des disponibilités pour ${targetMonth}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <h2 style="color: #ff9800; border-bottom: 2px solid #ff9800; padding-bottom: 10px;">
                                📅 Rappel de saisie des disponibilités
                            </h2>
                            
                            <p>Bonjour ${expert.prenom} ${expert.nom},</p>
                            
                            <p>Nous vous rappelons que vos disponibilités pour le mois de <strong>${targetMonth}</strong> n'ont pas encore été renseignées dans l'application de planification.</p>
                            
                            <div style="margin: 20px 0; padding: 15px; background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
                                <p style="margin: 0;"><strong>Action requise :</strong></p>
                                <p style="margin: 5px 0 0 0;">Merci de vous connecter à l'application et de saisir vos disponibilités pour le mois à venir.</p>
                            </div>
                            
                            <p>Cordialement,<br>Système de planification SI-SAMU</p>
                            
                            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                            
                            <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                                Cet email a été envoyé automatiquement depuis le système SI-SAMU de planification des ressources.
                            </p>
                        </div>
                    </div>
                `
            };
            
            try {
                await transporter.sendMail(mailOptions);
                console.log(`⏰ [CRON] ✅ Rappel envoyé à ${expert.email}`);
                sent++;
                
                // Enregistrer dans les logs
                database.run(
                    `INSERT INTO automation_logs (automation_id, expert_id, expert_name, expert_email, target_month, sent_at)
                     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
                    [1, expert.id, `${expert.prenom} ${expert.nom}`, expert.email, targetMonth]
                );
                
            } catch (error) {
                console.error(`⏰ [CRON] ❌ Erreur envoi à ${expert.email}:`, error.message);
                failed++;
            }
        }
        
        console.log(`⏰ [CRON] Automatisation n°1 terminée: ${sent} envoyé(s), ${failed} échec(s)`);
        
    } catch (error) {
        console.error('⏰ [CRON] Erreur automatisation n°1:', error);
    }
}

// Planifier le cron pour s'exécuter tous les jours à 8h00
cron.schedule('0 8 * * *', () => {
    console.log('⏰ [CRON] Exécution des automatisations programmées - ' + new Date().toLocaleString('fr-FR'));
    runAutomation1();
}, {
    timezone: "Europe/Paris"
});

console.log('⏰ Cron configuré: vérification quotidienne à 8h00 (Europe/Paris)');

// ========== FIN SYSTÈME DE CRON ==========

// Serveur Ecoute
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`👤 Compte admin: admin / Admin2025!`);
    console.log(`⏰ Automatisations programmées actives`);
});
