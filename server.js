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
    secret: 'gantt-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// NOTE: express.static sera défini APRÈS les routes API pour éviter les conflits

// Initialiser la base de données SQLite
const database = new sqlite3.Database(config.DB_PATH + '/data.db', (err) => 
 {
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
async function sendEmail(to, subject, html, attachments = []) {
    console.log('📧 sendEmail appelé:');
    console.log('   - Destinataire:', to);
    console.log('   - Sujet:', subject);
    console.log('   - Pièces jointes:', attachments.length);
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
        const mailOptions = {
            from: `"Planification GANTT" <${emailConfig.user}>`,
            to: to,
            subject: subject,
            html: html
        };
        
        if (attachments.length > 0) {
            mailOptions.attachments = attachments;
        }
        
        const info = await transporter.sendMail(mailOptions);
        
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table users:', err);
        } else {
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
            username TEXT NOT NULL,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            profile TEXT NOT NULL,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            modifications TEXT DEFAULT ''
        )
    `, (err) => {
        if (err) console.error('Erreur création table connection_logs:', err);
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
                console.error('Erreur lecture log:', err);
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
            
            database.run(
                'UPDATE connection_logs SET modifications = ? WHERE id = ?',
                [JSON.stringify(modifications), req.session.logId],
                (err) => {
                    if (err) console.error('Erreur update log:', err);
                }
            );
        }
    );
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId || req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
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
        'SELECT * FROM users WHERE username = ? AND password = ? AND actif = 1',
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
            
            // Logger la connexion
            console.log(`📝 Tentative de log connexion pour: ${user.username} (${profile})`);
            database.run(
                `INSERT INTO connection_logs (username, nom, prenom, profile) VALUES (?, ?, ?, ?)`,
                [user.username, user.nom, user.prenom, profile],
                function(err) {
                    if (err) {
                        console.error('❌ Erreur log connexion:', err);
                    } else {
                        console.log(`✅ Log connexion créé avec ID: ${this.lastID}`);
                        // Sauvegarder l'ID du log dans la session
                        req.session.logId = this.lastID;
                    }
                    
                    // Répondre APRÈS avoir tenté d'insérer le log
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
        }
    );
});

app.post('/api/logout', (req, res) => {
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
                        `INSERT INTO connection_logs (username, nom, prenom, profile, modifications) 
                         VALUES (?, ?, ?, 'system', ?)`,
                        [
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
        res.json({
            userId: req.session.userId,
            username: req.session.username,
            nom: req.session.nom,
            prenom: req.session.prenom,
            activeProfile: req.session.activeProfile,
            resourceId: req.session.resourceId
        });
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
        'SELECT email, nom, prenom FROM users WHERE resource_id = ? AND actif = 1 LIMIT 1',
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
    database.all('SELECT * FROM resources ORDER BY nom, prenom', (err, rows) => {
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
                    logUserAction(req, 'Sauvegarde planning rapide', { 
                        modificationsCount: total,
                        profile: req.session.activeProfile
                    });
                    res.json({ success: true, saved: total });
                }
            }
        );
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
                logUserAction(req, 'Modification utilisateur', { 
                    userId: id, 
                    nom, 
                    prenom,
                    roles: { is_admin, is_expert, is_user }
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

// Récupération des logs de connexion (20 derniers)
app.get('/api/logs/connections', requireAdmin, (req, res) => {
    database.all(
        `SELECT id, username, nom, prenom, profile, login_time, modifications 
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
        `SELECT id, username, nom, prenom, profile, login_time, modifications 
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
    const sourcePath = path.join(__dirname, 'data.db');
    const destPath = path.join(__dirname, `backup_${timestamp}.db`);
    
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

// Servir les fichiers statiques APRÈS les routes API pour éviter les conflits
app.use(express.static(path.join(__dirname, 'public')));

// Route catch-all pour servir index.html (doit être la dernière route)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serveur Ecoute
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Compte admin: admin / Admin2025!`);
});
