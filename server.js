import express from 'express';
console.log('✅ Express importé');
import cors from 'cors';
console.log('✅ CORS importé');
import bodyParser from 'body-parser';
console.log('✅ Body-parser importé');
import sqlite3 from 'sqlite3';
console.log('✅ SQLite3 importé');
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import session from 'express-session';
console.log('✅ Session importé');
import nodemailer from 'nodemailer';
console.log('✅ Nodemailer importé');
import fs from 'fs';
import cron from 'node-cron';
console.log('✅ Cron importé');
import QRCode from 'qrcode';
console.log('✅ QRCode importé');

console.log('📂 Chargement config.json...');
import config from './config/config.json' with { type: "json" };
console.log('✅ Config chargé');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stockage temporaire des jobs de debug (en mémoire)
const debugJobs = new Map();
const DEBUG_JOB_TTL = 5 * 60 * 1000; // 5 minutes

// Nettoyer les vieux jobs périodiquement
setInterval(() => {
    const now = Date.now();
    for (const [jobId, job] of debugJobs.entries()) {
        if (now - job.createdAt > DEBUG_JOB_TTL) {
            debugJobs.delete(jobId);
        }
    }
}, 60000); // Toutes les minutes

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
    const timeout = 15 * 60 * 1000; // 15 minutes par défaut
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
        // Activer WAL mode pour permettre lectures/écritures concurrentes
        database.run('PRAGMA journal_mode = WAL', (err) => {
            if (err) console.error('❌ Erreur PRAGMA WAL:', err);
            else console.log('✅ SQLite WAL mode activé');
        });
        // Attendre 5s au lieu d'échouer immédiatement sur SQLITE_BUSY
        database.run('PRAGMA busy_timeout = 5000', (err) => {
            if (err) console.error('❌ Erreur PRAGMA busy_timeout:', err);
            else console.log('✅ SQLite busy_timeout = 5000ms');
        });
        initDB();
    }
});

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Formater une date en français
function formatDateFR(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Envoyer une notification Teams depuis le serveur
async function sendTeamsNotificationFromServer(type, data) {
    try {
        // Récupérer la configuration de l'automatisation 3
        const configRow = await new Promise((resolve, reject) => {
            database.get(
                `SELECT value FROM settings WHERE key = ?`,
                ['automation_3_config'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!configRow || !configRow.value) {
            console.log('📢 Teams: Configuration non trouvée');
            return;
        }
        
        const config = JSON.parse(configRow.value);
        
        if (!config.enabled) {
            console.log('📢 Teams: Automatisation désactivée');
            return;
        }
        
        if (!config.notifications || !config.notifications.includes(type)) {
            console.log(`📢 Teams: Type de notification "${type}" non activé`);
            return;
        }
        
        if (!config.teamsEmail) {
            console.log('📢 Teams: Email Teams non configuré');
            return;
        }
        
        // Construire le message selon le type
        let subject = '';
        let content = '';
        let color = '#3498db';
        
        switch (type) {
            case 'affectation':
                subject = '📅 Nouvelle affectation';
                color = '#3498db';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Activité :</strong> ${data.activity || 'Non spécifiée'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    <p><strong>Période :</strong> ${data.period || 'Non spécifiée'}</p>
                    ${data.location ? `<p><strong>Localisation :</strong> ${data.location}</p>` : ''}
                `;
                break;
                
            case 'demande':
                subject = '✉️ Demande d\'affectation';
                color = '#27ae60';
                content = `
                    <p><strong>De :</strong> ${data.from || 'Non spécifié'}</p>
                    <p><strong>Objet :</strong> ${data.subject || 'Non spécifié'}</p>
                    <p><strong>Message :</strong></p>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 5px;">
                        ${(data.message || '').replace(/\n/g, '<br>').substring(0, 500)}
                    </div>
                `;
                break;
                
            case 'astreinte':
                subject = '🔔 Nouvelle astreinte/HNO';
                color = '#9c27b0';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Type :</strong> ${data.type === 'hno' ? 'HNO (Heures Non Ouvrées)' : 'Astreinte'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.heureDebut ? `<p><strong>Horaires :</strong> ${data.heureDebut} - ${data.heureFin}</p>` : ''}
                `;
                break;
                
            case 'evenement':
                subject = '📆 Nouvel événement';
                color = '#ff9800';
                content = `
                    <p><strong>Événement :</strong> ${data.name || 'Non spécifié'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.createdBy ? `<p><strong>Créé par :</strong> ${data.createdBy}</p>` : ''}
                `;
                break;
                
            default:
                console.log(`📢 Teams: Type de notification inconnu: ${type}`);
                return;
        }
        
        const transporter = createEmailTransporter();
        if (!transporter) {
            console.log('📢 Teams: Transporteur email non disponible');
            return;
        }
        
        const mailOptions = {
            from: `"Planning ANS" <${emailConfig.user || 'noreply@esante.gouv.fr'}>`,
            to: config.teamsEmail,
            subject: `${subject} - Planning ANS`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">${subject}</h2>
                        </div>
                        <div style="padding: 25px;">
                            ${content}
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        // Logger l'envoi
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at) VALUES (?, ?, ?, ?, datetime('now'))`,
            [3, type, config.teamsEmail, JSON.stringify(data)],
            (err) => {
                if (err) console.error('Erreur log Teams notify:', err);
            }
        );
        
        console.log(`📢 Notification Teams [${type}] envoyée avec succès`);
    } catch (error) {
        console.error('📢 Erreur envoi notification Teams:', error);
    }
}

// Configuration email
let emailConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    user: '',
    password: ''
};

// Créer transporteur email avec options pour Render.com
// Cache du transporteur email
let emailTransporterCache = null;
let emailTransporterConfigHash = null;

function createEmailTransporter() {
    if (!emailConfig.user || !emailConfig.password) {
        return null;
    }
    
    // Créer un hash de la config pour détecter les changements
    const configHash = `${emailConfig.host}:${emailConfig.port}:${emailConfig.user}`;
    
    // Réutiliser le transporteur s'il existe et que la config n'a pas changé
    if (emailTransporterCache && emailTransporterConfigHash === configHash) {
        return emailTransporterCache;
    }
    
    // Créer un nouveau transporteur avec pool de connexions
    emailTransporterCache = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.password
        },
        // Pool de connexions pour réutiliser les connexions
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        // Timeouts courts pour ne pas bloquer
        connectionTimeout: 10000, // 10 secondes
        greetingTimeout: 10000,
        socketTimeout: 30000, // 30 secondes pour l'envoi
        // Configuration TLS
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1'
        },
        debug: false,
        logger: false
    });
    
    emailTransporterConfigHash = configHash;
    console.log('📧 Transporteur email créé avec pool de connexions');
    
    return emailTransporterCache;
}

// Envoyer un email
async function sendEmail(to, subject, html, attachments = []) {
    const startTime = Date.now();
    console.log(`📧 sendEmail: Début envoi à ${to}, ${attachments.length} pièce(s) jointe(s)`);
    
    const transporter = createEmailTransporter();
    if (!transporter) {
        throw new Error('Configuration email non définie');
    }
    
    try {
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: to,
            subject: subject,
            html: html
        };
        
        if (attachments.length > 0) {
            // Formater correctement les pièces jointes ICS pour Gmail
            mailOptions.attachments = attachments.map(att => {
                // Si c'est un fichier ICS, utiliser les bons headers
                if (att.contentType && att.contentType.includes('text/calendar')) {
                    return {
                        filename: att.filename,
                        content: att.content,
                        contentType: att.contentType,
                        // Ajouter les headers pour que Gmail reconnaisse l'invitation
                        headers: {
                            'Content-Class': 'urn:content-classes:calendarmessage'
                        }
                    };
                }
                return att;
            });
            
            // Log la taille des attachments
            const totalSize = attachments.reduce((sum, a) => sum + (a.content?.length || 0), 0);
            console.log(`📧 sendEmail: Taille totale pièces jointes: ${totalSize} bytes`);
        }
        
        console.log(`📧 sendEmail: Appel transporter.sendMail() à +${Date.now() - startTime}ms`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 sendEmail: sendMail() terminé à +${Date.now() - startTime}ms, messageId: ${info.messageId}`);
        
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`📧 sendEmail: ERREUR à +${Date.now() - startTime}ms:`, error.message);
        
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
        es_rattachement TEXT,
        fonction TEXT,
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
                            es_rattachement TEXT,
                            fonction TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`);
                        
                        database.run(`INSERT INTO resources_new SELECT id, nom, prenom, trigramme, email, telephone, taux, samu, actif, date_debut, date_fin, NULL, NULL, created_at FROM resources`);
                        database.run(`DROP TABLE resources`);
                        database.run(`ALTER TABLE resources_new RENAME TO resources`);
                        console.log('✅ Migration terminée: email est maintenant nullable');
                    });
                }
                
                // Migration pour es_rattachement et fonction
                const esCol = columns.find(col => col.name === 'es_rattachement');
                if (!esCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN es_rattachement TEXT`);
                    console.log('Migration: Ajout colonne es_rattachement à resources');
                }
                const fonctionCol = columns.find(col => col.name === 'fonction');
                if (!fonctionCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN fonction TEXT`);
                    console.log('Migration: Ajout colonne fonction à resources');
                }
                
                // Migration pour astreinte_volontaire et astreinte_date_activation
                const astrVolCol = columns.find(col => col.name === 'astreinte_volontaire');
                if (!astrVolCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN astreinte_volontaire INTEGER DEFAULT 0`);
                    console.log('Migration: Ajout colonne astreinte_volontaire à resources');
                }
                const astrDateCol = columns.find(col => col.name === 'astreinte_date_activation');
                if (!astrDateCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN astreinte_date_activation TEXT`);
                    console.log('Migration: Ajout colonne astreinte_date_activation à resources');
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
                    
                    // Migration: ajouter has_reporting_access si elle n'existe pas
                    const reportingCol = columns.find(col => col.name === 'has_reporting_access');
                    if (!reportingCol) {
                        console.log('Migration: Ajout colonne has_reporting_access à users...');
                        database.run(`ALTER TABLE users ADD COLUMN has_reporting_access INTEGER DEFAULT 0`, (alterErr) => {
                            if (alterErr) {
                                console.error('Erreur migration has_reporting_access:', alterErr);
                            } else {
                                console.log('✅ Migration terminée: has_reporting_access ajouté');
                                // Par défaut, les admins ont accès au reporting
                                database.run(`UPDATE users SET has_reporting_access = 1 WHERE is_admin = 1`);
                            }
                        });
                    }
                    
                    // Migration: ajouter amoa_ced si elle n'existe pas
                    const amoaCedCol = columns.find(col => col.name === 'amoa_ced');
                    if (!amoaCedCol) {
                        console.log('Migration: Ajout colonne amoa_ced à users...');
                        database.run(`ALTER TABLE users ADD COLUMN amoa_ced INTEGER DEFAULT 0`, (alterErr) => {
                            if (alterErr) {
                                console.error('Erreur migration amoa_ced:', alterErr);
                            } else {
                                console.log('✅ Migration terminée: amoa_ced ajouté');
                            }
                        });
                    }
                    
                    // Migration: ajouter trigramme si elle n'existe pas
                    const trigrammeCol = columns.find(col => col.name === 'trigramme');
                    if (!trigrammeCol) {
                        console.log('Migration: Ajout colonne trigramme à users...');
                        database.run(`ALTER TABLE users ADD COLUMN trigramme TEXT`, (alterErr) => {
                            if (alterErr) {
                                console.error('Erreur migration trigramme:', alterErr);
                            } else {
                                console.log('✅ Migration terminée: trigramme ajouté');
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
    
    // Table pour l'historique des taux de MAD
    database.run(`
        CREATE TABLE IF NOT EXISTS resource_mad_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            taux REAL NOT NULL,
            date_debut TEXT NOT NULL,
            date_fin TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table resource_mad_history:', err);
        } else {
            console.log('✅ Table resource_mad_history créée');
        }
    });
    
    // Table pour les particularités de taux MAD (variations temporaires)
    database.run(`
        CREATE TABLE IF NOT EXISTS resource_mad_particularites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            mad_history_id INTEGER NOT NULL,
            taux REAL NOT NULL,
            date_debut TEXT NOT NULL,
            date_fin TEXT NOT NULL,
            motif TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (mad_history_id) REFERENCES resource_mad_history(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table resource_mad_particularites:', err);
        } else {
            console.log('✅ Table resource_mad_particularites créée');
        }
    });
    
    // Table pour les indisponibilités d'astreinte (conservée pour compatibilité)
    database.run(`
        CREATE TABLE IF NOT EXISTS astreinte_indisponibilites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type_creneau TEXT NOT NULL,
            motif TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            UNIQUE(resource_id, date, type_creneau)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table astreinte_indisponibilites:', err);
        } else {
            console.log('✅ Table astreinte_indisponibilites créée');
        }
    });
    
    // Table pour les disponibilités d'astreinte (jours verts)
    database.run(`
        CREATE TABLE IF NOT EXISTS astreinte_disponibilites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type_creneau TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            UNIQUE(resource_id, date)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table astreinte_disponibilites:', err);
        } else {
            console.log('✅ Table astreinte_disponibilites créée');
        }
    });
    
    // Table pour le planning d'astreinte
    database.run(`
        CREATE TABLE IF NOT EXISTS astreinte_planning (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type_creneau TEXT NOT NULL,
            resource_id INTEGER,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            UNIQUE(date, type_creneau)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table astreinte_planning:', err);
        } else {
            console.log('✅ Table astreinte_planning créée');
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
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            recipients_list TEXT,
            file_content TEXT,
            filename TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table automation_logs:', err);
        } else {
            console.log('✅ Table automation_logs créée');
            
            // Migration: ajouter les nouvelles colonnes si elles n'existent pas
            database.all(`PRAGMA table_info(automation_logs)`, [], (pragmaErr, columns) => {
                if (!pragmaErr && columns) {
                    const columnNames = columns.map(c => c.name);
                    
                    if (!columnNames.includes('recipients_list')) {
                        database.run(`ALTER TABLE automation_logs ADD COLUMN recipients_list TEXT`);
                        console.log('Migration: Ajout colonne recipients_list à automation_logs');
                    }
                    if (!columnNames.includes('file_content')) {
                        database.run(`ALTER TABLE automation_logs ADD COLUMN file_content TEXT`);
                        console.log('Migration: Ajout colonne file_content à automation_logs');
                    }
                    if (!columnNames.includes('filename')) {
                        database.run(`ALTER TABLE automation_logs ADD COLUMN filename TEXT`);
                        console.log('Migration: Ajout colonne filename à automation_logs');
                    }
                }
            });
        }
    });
    
    // Tables MFA
    database.run(`
        CREATE TABLE IF NOT EXISTS mfa_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            code TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Erreur création table mfa_codes:', err);
        else console.log('✅ Table mfa_codes créée');
    });
    
    database.run(`
        CREATE TABLE IF NOT EXISTS mfa_validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            validated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Erreur création table mfa_validations:', err);
        else console.log('✅ Table mfa_validations créée');
    });
    
    // Migration: ajouter colonne totp_secret à users si elle n'existe pas
    database.all(`PRAGMA table_info(users)`, [], (err, columns) => {
        if (!err && columns) {
            const columnNames = columns.map(c => c.name);
            if (!columnNames.includes('totp_secret')) {
                database.run(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
                console.log('Migration: Ajout colonne totp_secret à users');
            }
            if (!columnNames.includes('default_tab')) {
                database.run(`ALTER TABLE users ADD COLUMN default_tab TEXT DEFAULT 'planning'`);
                console.log('Migration: Ajout colonne default_tab à users');
            }
        }
    });

    // Table des bons de commande pour les déplacements
    database.run(`
        CREATE TABLE IF NOT EXISTS bons_commande (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intitule TEXT NOT NULL,
            titulaire TEXT,
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            nb_uo INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            actif INTEGER DEFAULT 1,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table bons_commande:', err);
        } else {
            console.log('✅ Table bons_commande créée');
            // Migration: ajouter la colonne titulaire si elle n'existe pas
            database.run(`ALTER TABLE bons_commande ADD COLUMN titulaire TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer l'erreur si la colonne existe déjà
                }
            });
            // Migration: ajouter la colonne solde (BDC soldé) si elle n'existe pas
            database.run(`ALTER TABLE bons_commande ADD COLUMN solde INTEGER DEFAULT 0`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer l'erreur si la colonne existe déjà
                }
            });
        }
    });

    // Table des déplacements
    database.run(`
        CREATE TABLE IF NOT EXISTS deplacements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amoa_ced_id INTEGER,
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            samu TEXT NOT NULL,
            ville TEXT NOT NULL,
            bon_commande_id INTEGER,
            nb_uo INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (amoa_ced_id) REFERENCES resources(id),
            FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table deplacements:', err);
        } else {
            console.log('✅ Table deplacements créée');
            // Migration: ajouter la colonne amoa_ced_id si elle n'existe pas
            database.run(`ALTER TABLE deplacements ADD COLUMN amoa_ced_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer l'erreur si la colonne existe déjà
                }
            });
            // Migration: ajouter la colonne a_regulariser pour marquer les déplacements sur BC en surconsommation
            database.run(`ALTER TABLE deplacements ADD COLUMN a_regulariser INTEGER DEFAULT 0`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer l'erreur si la colonne existe déjà
                }
            });
            // Migration: ajouter la colonne commentaire
            database.run(`ALTER TABLE deplacements ADD COLUMN commentaire TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer l'erreur si la colonne existe déjà
                }
            });
        }
    });

    // Table des astreintes et HNO
    database.run(`
        CREATE TABLE IF NOT EXISTS astreintes_hno (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('astreinte', 'hno')),
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            heure_debut TIME,
            heure_fin TIME,
            samu TEXT,
            tous_samu INTEGER DEFAULT 0,
            objet TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table astreintes_hno:', err);
        } else {
            console.log('✅ Table astreintes_hno créée');
        }
    });
    
    // Table file d'attente d'emails
    database.run(`
        CREATE TABLE IF NOT EXISTS email_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            recipient_name TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            sender_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            html_body TEXT NOT NULL,
            ics_content TEXT,
            ics_method TEXT,
            ics_filename TEXT,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            error_message TEXT,
            action_type TEXT,
            resource_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME,
            next_retry_at DATETIME
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table email_queue:', err);
        } else {
            console.log('✅ Table email_queue créée');
            // Nettoyer les vieux emails traités (> 7 jours)
            database.run(`DELETE FROM email_queue WHERE status IN ('sent', 'failed') AND created_at < datetime('now', '-7 days')`);
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

// Middleware pour vérifier l'accès au reporting (admin OU utilisateur avec droit)
function requireReportingAccess(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    
    // Les admins ont toujours accès
    if (req.session.activeProfile === 'admin') {
        if (activeSessions.has(req.session.userId)) {
            activeSessions.get(req.session.userId).lastActivity = Date.now();
        }
        return next();
    }
    
    // Vérifier si l'utilisateur a l'accès au reporting
    database.get(
        'SELECT has_reporting_access, is_admin FROM users WHERE id = ?',
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return res.status(403).json({ error: 'Accès refusé' });
            }
            
            if (user.is_admin === 1 || user.has_reporting_access === 1) {
                if (activeSessions.has(req.session.userId)) {
                    activeSessions.get(req.session.userId).lastActivity = Date.now();
                }
                return next();
            }
            
            return res.status(403).json({ error: 'Accès au reporting non autorisé' });
        }
    );
}

// ==================== API CONNEXION ====================

app.post('/api/login', async (req, res) => {
    const { username, password, profile } = req.body;
    
    if (!username || !password || !profile) {
        return res.status(400).json({ error: 'Username, password et profil requis' });
    }

    const hashedPassword = hashPassword(password);
    
    try {
        const user = await new Promise((resolve, reject) => {
            database.get(
                `SELECT u.*, r.trigramme 
                 FROM users u 
                 LEFT JOIN resources r ON r.id = u.resource_id 
                 WHERE u.username = ? AND u.password = ? AND u.actif = 1`,
                [username, hashedPassword],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
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
        
        // Vérifier si MFA est requis
        const mfaConfig = await getMfaConfig();
        
        if (mfaConfig && mfaConfig.enabled) {
            // Vérifier si le profil nécessite MFA
            const profileNeedsMfa = 
                (profile === 'admin' && mfaConfig.profileAdmin) ||
                (profile === 'expert' && mfaConfig.profileExpert) ||
                (profile === 'user' && mfaConfig.profileUser);
            
            if (profileNeedsMfa) {
                // Vérifier si MFA a déjà été validé récemment
                const mfaStillValid = await checkMfaValidity(user.id, mfaConfig.frequency);
                
                if (!mfaStillValid) {
                    // MFA requis
                    const totpConfigured = await isUserTotpConfigured(user.id);
                    
                    let mfaMethod = mfaConfig.method;
                    if (mfaMethod === 'both') {
                        mfaMethod = 'choice';
                    }
                    
                    return res.json({
                        mfaRequired: true,
                        mfaMethod: mfaMethod,
                        totpConfigured: totpConfigured,
                        pendingUserId: user.id
                    });
                }
            }
        }
        
        // Pas de MFA requis, continuer le login normal
        await completeLogin(req, res, user, profile);
        
    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fonction pour compléter le login
async function completeLogin(req, res, user, profile) {
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.nom = user.nom;
    req.session.prenom = user.prenom;
    req.session.activeProfile = profile;
    req.session.resourceId = user.resource_id;
    req.session.email = user.email;
    
    // Tracker la session active
    activeSessions.set(user.id, {
        lastActivity: Date.now(),
        profile: profile,
        username: user.username
    });
    console.log(`🟢 Session active pour ${user.username} (userId: ${user.id})`);
    
    // Logger la connexion
    return new Promise((resolve, reject) => {
        database.run(
            `INSERT INTO connection_logs (user_id, username, nom, prenom, profile) VALUES (?, ?, ?, ?, ?)`,
            [user.id, user.username, user.nom, user.prenom, profile],
            function(err) {
                if (err) {
                    console.error('❌ Erreur log connexion:', err);
                } else {
                    req.session.logId = this.lastID;
                }
                
                const userResponse = {
                    id: user.id,
                    username: user.username,
                    nom: user.nom,
                    prenom: user.prenom,
                    email: user.email,
                    trigramme: user.trigramme || null,
                    profilePhoto: user.profile_photo || null,
                    activeProfile: profile,
                    resourceId: user.resource_id,
                    hasReportingAccess: user.has_reporting_access === 1 || user.is_admin === 1,
                    amoaCed: user.amoa_ced === 1,
                    is_amoa_ced: user.amoa_ced === 1,
                    defaultTab: user.default_tab || 'planning'
                };
                
                res.json({ 
                    success: true,
                    user: userResponse
                });
                resolve();
            }
        );
    });
}

// Fonctions helper pour MFA
async function getMfaConfig() {
    return new Promise((resolve, reject) => {
        database.get(
            `SELECT value FROM settings WHERE key = 'mfa_config'`,
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? JSON.parse(row.value) : null);
            }
        );
    });
}

async function checkMfaValidity(userId, frequency) {
    return new Promise((resolve, reject) => {
        database.get(
            `SELECT validated_at FROM mfa_validations WHERE user_id = ? ORDER BY validated_at DESC LIMIT 1`,
            [userId],
            (err, row) => {
                if (err) reject(err);
                else if (!row) resolve(false);
                else {
                    const validatedAt = new Date(row.validated_at);
                    const now = new Date();
                    let maxAge;
                    
                    switch (frequency) {
                        case 'always': maxAge = 0; break;
                        case 'daily': maxAge = 24 * 60 * 60 * 1000; break;
                        case 'weekly': maxAge = 7 * 24 * 60 * 60 * 1000; break;
                        case 'monthly': maxAge = 30 * 24 * 60 * 60 * 1000; break;
                        default: maxAge = 24 * 60 * 60 * 1000;
                    }
                    
                    resolve(now - validatedAt < maxAge);
                }
            }
        );
    });
}

async function isUserTotpConfigured(userId) {
    return new Promise((resolve, reject) => {
        database.get(
            `SELECT totp_secret FROM users WHERE id = ? AND totp_secret IS NOT NULL`,
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
}

// Générer un code MFA à 6 chiffres
function generateMfaCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Générer une clé secrète TOTP
function generateTotpSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

// Vérifier un code TOTP
function verifyTotp(secret, code) {
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = 30;
    
    // Vérifier le code pour la fenêtre actuelle et les deux adjacentes
    for (let i = -1; i <= 1; i++) {
        const counter = Math.floor((epoch / timeStep) + i);
        const expectedCode = generateTotpCode(secret, counter);
        if (expectedCode === code) {
            return true;
        }
    }
    return false;
}

// Générer un code TOTP pour un compteur donné
function generateTotpCode(secret, counter) {
    // Décoder le secret base32
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < secret.length; i++) {
        const val = base32Chars.indexOf(secret.charAt(i).toUpperCase());
        bits += val.toString(2).padStart(5, '0');
    }
    
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    const key = Buffer.from(bytes);
    
    // Créer le compteur en bytes
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));
    
    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(counterBuffer);
    const hash = hmac.digest();
    
    // Extraction dynamique
    const offset = hash[hash.length - 1] & 0xf;
    const binary = ((hash[offset] & 0x7f) << 24) |
                   ((hash[offset + 1] & 0xff) << 16) |
                   ((hash[offset + 2] & 0xff) << 8) |
                   (hash[offset + 3] & 0xff);
    
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}

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
        // Récupérer le trigramme, la photo, l'email et amoa_ced depuis la base
        database.get(
            `SELECT u.email, u.profile_photo, u.amoa_ced, r.trigramme 
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
                    profilePhoto: userData?.profile_photo || null,
                    amoaCed: userData?.amoa_ced === 1,
                    is_amoa_ced: userData?.amoa_ced === 1
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
        'SELECT is_admin, is_expert, is_user, actif, amoa_ced FROM users WHERE username = ?',
        [username],
        (err, user) => {
            if (err) {
                console.error('Erreur récup profils:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.json({ profiles: [], amoaCed: false });
            }
            
            if (user.actif !== 1) {
                return res.json({ profiles: [], error: 'Compte désactivé', amoaCed: false });
            }
            
            const profiles = [];
            if (user.is_admin === 1) profiles.push('admin');
            if (user.is_expert === 1) profiles.push('expert');
            if (user.is_user === 1) profiles.push('user');
            
            res.json({ profiles, amoaCed: user.amoa_ced === 1 });
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
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } = req.body;
    
    if (!nom || !prenom || !trigramme || !taux || !samu) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    database.run(
        `INSERT INTO resources (nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nom, prenom, trigramme, email || null, telephone || null, taux, samu, date_debut || null, date_fin || null, es_rattachement || null, fonction || null],
        function(err) {
            if (err) {
                console.error('Erreur ajout resource:', err);
                res.status(500).json({ error: err.message });
            } else {
                const resourceId = this.lastID;
                
                // Créer l'entrée initiale dans l'historique MAD
                database.run(
                    `INSERT INTO resource_mad_history (resource_id, taux, date_debut, date_fin, created_by) VALUES (?, ?, ?, NULL, ?)`,
                    [resourceId, taux, date_debut || new Date().toISOString().split('T')[0], req.session.userId],
                    (madErr) => {
                        if (madErr) {
                            console.error('Erreur création historique MAD:', madErr);
                        }
                    }
                );
                
                logUserAction(req, 'Création ressource', { 
                    resourceId: resourceId, 
                    nom, 
                    prenom, 
                    trigramme 
                });
                res.json({ id: resourceId, success: true });
            }
        }
    );
});

app.put('/api/resources/:id', requireAdmin, (req, res) => {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } = req.body;
    const { id } = req.params;
    
    database.run(
        `UPDATE resources 
         SET nom = ?, prenom = ?, trigramme = ?, email = ?, telephone = ?, taux = ?, samu = ?, date_debut = ?, date_fin = ?, es_rattachement = ?, fonction = ?
         WHERE id = ?`,
        [nom, prenom, trigramme, email || null, telephone || null, taux, samu, date_debut || null, date_fin || null, es_rattachement || null, fonction || null, id],
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
            // Supprimer aussi l'historique MAD et les particularités
            database.run('DELETE FROM resource_mad_particularites WHERE resource_id = ?', [id]);
            database.run('DELETE FROM resource_mad_history WHERE resource_id = ?', [id]);
            database.run('DELETE FROM schedule_data WHERE resource_id = ?', [id], (err2) => {
                if (err2) console.error('Erreur suppression schedule:', err2);
                res.json({ success: true });
            });
        }
    });
});

// ========== ROUTES HISTORIQUE TAUX MAD ==========

// Récupérer l'historique MAD d'une ressource
app.get('/api/resources/:id/mad-history', requireAuth, (req, res) => {
    const { id } = req.params;
    
    database.all(
        `SELECT * FROM resource_mad_history WHERE resource_id = ? ORDER BY date_debut`,
        [id],
        (err, rows) => {
            if (err) {
                console.error('Erreur récup historique MAD:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

// Ajouter un taux MAD
app.post('/api/resources/:id/mad-history', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { taux, date_debut, date_fin } = req.body;
    
    if (taux === undefined || !date_debut) {
        return res.status(400).json({ error: 'Taux et date de début requis' });
    }
    
    try {
        // Récupérer toutes les périodes existantes
        const existingPeriods = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM resource_mad_history WHERE resource_id = ?`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        // Vérifier les chevauchements
        const thisStart = date_debut;
        const thisEnd = date_fin || '9999-12-31';
        
        for (const other of existingPeriods) {
            const otherStart = other.date_debut;
            const otherEnd = other.date_fin || '9999-12-31';
            
            // Vérifier si les périodes partagent au moins un jour
            const overlapStart = thisStart > otherStart ? thisStart : otherStart;
            const overlapEnd = thisEnd < otherEnd ? thisEnd : otherEnd;
            
            if (overlapStart <= overlapEnd) {
                return res.status(400).json({ 
                    error: `Chevauchement de dates détecté avec la période ${other.date_debut} - ${other.date_fin || 'en cours'}` 
                });
            }
        }
        
        // Insérer le nouveau taux
        const result = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO resource_mad_history (resource_id, taux, date_debut, date_fin, created_by) VALUES (?, ?, ?, ?, ?)`,
                [id, taux, date_debut, date_fin || null, req.session.userId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        // Mettre à jour le taux actuel dans resources si c'est la période en cours
        const today = new Date().toISOString().split('T')[0];
        if (date_debut <= today && (!date_fin || date_fin >= today)) {
            await new Promise((resolve, reject) => {
                database.run(`UPDATE resources SET taux = ? WHERE id = ?`, [taux, id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        
        logUserAction(req, 'Ajout taux MAD', { resourceId: id, taux, date_debut, date_fin });
        res.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Erreur ajout taux MAD:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier un taux MAD
app.put('/api/resources/:id/mad-history/:historyId', requireAdmin, async (req, res) => {
    const { id, historyId } = req.params;
    const { taux, date_debut, date_fin } = req.body;
    
    try {
        // Récupérer toutes les autres périodes (exclure celle en cours de modification)
        const otherPeriods = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM resource_mad_history WHERE resource_id = ? AND id != ?`,
                [id, historyId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        // Vérifier les chevauchements
        // Deux périodes se chevauchent si : debut1 <= fin2 ET debut2 <= fin1
        // Mais les périodes consécutives (fin1 = jour avant debut2) ne sont PAS des chevauchements
        const thisStart = date_debut;
        const thisEnd = date_fin || '9999-12-31';
        
        for (const other of otherPeriods) {
            const otherStart = other.date_debut;
            const otherEnd = other.date_fin || '9999-12-31';
            
            // Vérifier si les périodes se chevauchent vraiment (partagent au moins un jour)
            // Chevauchement = NOT (thisEnd < otherStart OR otherEnd < thisStart)
            // En d'autres termes : thisStart <= otherEnd AND otherStart <= thisEnd
            if (thisStart <= otherEnd && otherStart <= thisEnd) {
                // Mais on autorise les périodes qui se "touchent" exactement
                // Ex: période 1 finit le 31/03, période 2 commence le 01/04 = OK
                // Chevauchement réel = les périodes partagent AU MOINS un jour commun
                // thisStart <= otherEnd signifie que this commence avant ou le jour où other finit
                // otherStart <= thisEnd signifie que other commence avant ou le jour où this finit
                
                // Pour qu'il y ait chevauchement réel, il faut que :
                // - this commence AVANT ou LE JOUR où other finit ET
                // - other commence AVANT ou LE JOUR où this finit
                // Mais si this finit EXACTEMENT le jour AVANT que other commence, c'est OK
                
                // Simplification : on vérifie si les intervalles partagent un jour
                // [thisStart, thisEnd] et [otherStart, otherEnd] se chevauchent si
                // max(thisStart, otherStart) <= min(thisEnd, otherEnd)
                const overlapStart = thisStart > otherStart ? thisStart : otherStart;
                const overlapEnd = thisEnd < otherEnd ? thisEnd : otherEnd;
                
                if (overlapStart <= overlapEnd) {
                    return res.status(400).json({ 
                        error: `Chevauchement de dates détecté avec la période ${other.date_debut} - ${other.date_fin || 'en cours'}` 
                    });
                }
            }
        }
        
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE resource_mad_history SET taux = ?, date_debut = ?, date_fin = ? WHERE id = ? AND resource_id = ?`,
                [taux, date_debut, date_fin || null, historyId, id],
                (err) => err ? reject(err) : resolve()
            );
        });
        
        // Mettre à jour le taux actuel dans resources si c'est la période en cours
        const today = new Date().toISOString().split('T')[0];
        if (date_debut <= today && (!date_fin || date_fin >= today)) {
            await new Promise((resolve, reject) => {
                database.run(`UPDATE resources SET taux = ? WHERE id = ?`, [taux, id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        
        logUserAction(req, 'Modification taux MAD', { resourceId: id, historyId, taux, date_debut, date_fin });
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification taux MAD:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un taux MAD
app.delete('/api/resources/:id/mad-history/:historyId', requireAdmin, async (req, res) => {
    const { id, historyId } = req.params;
    
    try {
        // Vérifier qu'il reste au moins une entrée
        const count = await new Promise((resolve, reject) => {
            database.get(`SELECT COUNT(*) as count FROM resource_mad_history WHERE resource_id = ?`, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        if (count <= 1) {
            return res.status(400).json({ error: 'Impossible de supprimer le dernier taux MAD' });
        }
        
        // Supprimer aussi les particularités liées
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM resource_mad_particularites WHERE mad_history_id = ?`, [historyId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM resource_mad_history WHERE id = ? AND resource_id = ?`, [historyId, id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        logUserAction(req, 'Suppression taux MAD', { resourceId: id, historyId });
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression taux MAD:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== ROUTES PARTICULARITÉS MAD ==========

// Récupérer les particularités d'une période MAD
app.get('/api/resources/:id/mad-history/:historyId/particularites', requireAuth, (req, res) => {
    const { id, historyId } = req.params;
    
    database.all(
        `SELECT * FROM resource_mad_particularites WHERE resource_id = ? AND mad_history_id = ? ORDER BY date_debut`,
        [id, historyId],
        (err, rows) => {
            if (err) {
                console.error('Erreur récup particularités MAD:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

// Ajouter une particularité
app.post('/api/resources/:id/mad-history/:historyId/particularites', requireAdmin, async (req, res) => {
    const { id, historyId } = req.params;
    const { taux, date_debut, date_fin, motif } = req.body;
    
    if (taux === undefined || !date_debut || !date_fin) {
        return res.status(400).json({ error: 'Taux, date de début et date de fin requis' });
    }
    
    try {
        // Vérifier que les dates sont dans la période MAD parente
        const parentPeriod = await new Promise((resolve, reject) => {
            database.get(`SELECT * FROM resource_mad_history WHERE id = ? AND resource_id = ?`, [historyId, id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!parentPeriod) {
            return res.status(404).json({ error: 'Période MAD non trouvée' });
        }
        
        if (date_debut < parentPeriod.date_debut || (parentPeriod.date_fin && date_fin > parentPeriod.date_fin)) {
            return res.status(400).json({ error: 'Les dates doivent être dans la période MAD parente' });
        }
        
        // Vérifier les chevauchements avec d'autres particularités
        const overlaps = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM resource_mad_particularites 
                 WHERE resource_id = ? AND mad_history_id = ?
                 AND (
                     (date_debut <= ? AND date_fin >= ?)
                     OR (date_debut <= ? AND date_fin >= ?)
                     OR (date_debut >= ? AND date_debut <= ?)
                 )`,
                [id, historyId, date_debut, date_debut, date_fin, date_fin, date_debut, date_fin],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        if (overlaps.length > 0) {
            return res.status(400).json({ error: 'Chevauchement de dates détecté avec une particularité existante' });
        }
        
        const result = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO resource_mad_particularites (resource_id, mad_history_id, taux, date_debut, date_fin, motif, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, historyId, taux, date_debut, date_fin, motif || null, req.session.userId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });
        
        logUserAction(req, 'Ajout particularité MAD', { resourceId: id, historyId, taux, date_debut, date_fin });
        res.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Erreur ajout particularité MAD:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier une particularité
app.put('/api/resources/:id/mad-history/:historyId/particularites/:particulariteId', requireAdmin, async (req, res) => {
    const { id, historyId, particulariteId } = req.params;
    const { taux, date_debut, date_fin, motif } = req.body;
    
    try {
        // Vérifier les chevauchements (exclure l'entrée en cours de modification)
        const overlaps = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM resource_mad_particularites 
                 WHERE resource_id = ? AND mad_history_id = ? AND id != ?
                 AND (
                     (date_debut <= ? AND date_fin >= ?)
                     OR (date_debut <= ? AND date_fin >= ?)
                     OR (date_debut >= ? AND date_debut <= ?)
                 )`,
                [id, historyId, particulariteId, date_debut, date_debut, date_fin, date_fin, date_debut, date_fin],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        if (overlaps.length > 0) {
            return res.status(400).json({ error: 'Chevauchement de dates détecté' });
        }
        
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE resource_mad_particularites SET taux = ?, date_debut = ?, date_fin = ?, motif = ? WHERE id = ?`,
                [taux, date_debut, date_fin, motif || null, particulariteId],
                (err) => err ? reject(err) : resolve()
            );
        });
        
        logUserAction(req, 'Modification particularité MAD', { resourceId: id, particulariteId, taux, date_debut, date_fin });
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification particularité MAD:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer une particularité
app.delete('/api/resources/:id/mad-history/:historyId/particularites/:particulariteId', requireAdmin, (req, res) => {
    const { id, particulariteId } = req.params;
    
    database.run(`DELETE FROM resource_mad_particularites WHERE id = ? AND resource_id = ?`, [particulariteId, id], (err) => {
        if (err) {
            console.error('Erreur suppression particularité MAD:', err);
            res.status(500).json({ error: err.message });
        } else {
            logUserAction(req, 'Suppression particularité MAD', { resourceId: id, particulariteId });
            res.json({ success: true });
        }
    });
});

// Récupérer le taux MAD effectif pour une ressource à une date donnée
app.get('/api/resources/:id/effective-mad-rate', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        // D'abord vérifier les particularités
        const particularite = await new Promise((resolve, reject) => {
            database.get(
                `SELECT p.* FROM resource_mad_particularites p
                 WHERE p.resource_id = ? AND p.date_debut <= ? AND p.date_fin >= ?`,
                [id, targetDate, targetDate],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (particularite) {
            return res.json({ taux: particularite.taux, source: 'particularite', particularite });
        }
        
        // Sinon, chercher dans l'historique MAD
        const madHistory = await new Promise((resolve, reject) => {
            database.get(
                `SELECT * FROM resource_mad_history 
                 WHERE resource_id = ? AND date_debut <= ? AND (date_fin IS NULL OR date_fin >= ?)`,
                [id, targetDate, targetDate],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (madHistory) {
            return res.json({ taux: madHistory.taux, source: 'history', history: madHistory });
        }
        
        // Par défaut, retourner le taux de la ressource
        const resource = await new Promise((resolve, reject) => {
            database.get(`SELECT taux FROM resources WHERE id = ?`, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        res.json({ taux: resource ? resource.taux : 0, source: 'resource' });
    } catch (error) {
        console.error('Erreur récup taux effectif MAD:', error);
        res.status(500).json({ error: error.message });
    }
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
        SELECT u.*, r.trigramme as resource_trigramme,
               COALESCE(u.trigramme, r.trigramme) as trigramme,
               (SELECT MAX(login_time) FROM connection_logs WHERE user_id = u.id) as last_login
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
            COALESCE(u.trigramme, r.trigramme) as trigramme
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

// Récupérer les utilisateurs AMOA CED actifs
app.get('/api/users/amoa-ced', requireAuth, (req, res) => {
    database.all(`
        SELECT 
            u.id,
            u.nom,
            u.prenom,
            u.email,
            u.resource_id,
            r.trigramme
        FROM users u 
        LEFT JOIN resources r ON u.resource_id = r.id
        WHERE u.actif = 1 AND u.amoa_ced = 1
        ORDER BY u.nom, u.prenom
    `, (err, rows) => {
        if (err) {
            console.error('Erreur récup users AMOA CED:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, resource_id, has_reporting_access, amoa_ced, sendEmail: shouldSendEmail } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username et password requis' });
    }

    const hashedPassword = hashPassword(password);
    
    database.run(
        `INSERT INTO users (username, password, nom, prenom, email, telephone, is_admin, is_expert, is_user, resource_id, has_reporting_access, amoa_ced) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, nom, prenom, email, telephone || null, is_admin ? 1 : 0, is_expert ? 1 : 0, is_user ? 1 : 0, resource_id || null, has_reporting_access ? 1 : 0, amoa_ced ? 1 : 0],
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
    const { nom, prenom, email, trigramme, is_admin, is_expert, is_user, resource_id, has_reporting_access, amoa_ced } = req.body;
    const { id } = req.params;
    
    // Convertir resource_id en integer ou null
    let finalResourceId = null;
    if (resource_id) {
        const parsed = parseInt(resource_id);
        if (!isNaN(parsed)) {
            finalResourceId = parsed;
        }
    }
    
    // Trigramme en majuscules
    const finalTrigramme = trigramme ? trigramme.toUpperCase().trim() : null;
    
    console.log('💾 Modification utilisateur ID', id, ':', {
        nom,
        prenom,
        trigramme: finalTrigramme,
        is_expert,
        resource_id_recu: resource_id,
        resource_id_type: typeof resource_id,
        resource_id_final: finalResourceId,
        has_reporting_access,
        amoa_ced
    });
    
    database.run(
        `UPDATE users 
         SET nom = ?, prenom = ?, email = ?, trigramme = ?, is_admin = ?, is_expert = ?, is_user = ?, resource_id = ?, has_reporting_access = ?, amoa_ced = ?
         WHERE id = ?`,
        [nom, prenom, email, finalTrigramme, is_admin ? 1 : 0, is_expert ? 1 : 0, is_user ? 1 : 0, finalResourceId, has_reporting_access ? 1 : 0, amoa_ced ? 1 : 0, id],
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
                    resource_id: finalResourceId,
                    has_reporting_access,
                    amoa_ced
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

// Modifier l'accès au reporting d'un utilisateur
app.post('/api/users/:id/reporting-access', requireAdmin, (req, res) => {
    const { hasAccess } = req.body;
    const { id } = req.params;
    
    database.run(
        'UPDATE users SET has_reporting_access = ? WHERE id = ?',
        [hasAccess ? 1 : 0, id],
        (err) => {
            if (err) {
                console.error('Erreur modification accès reporting:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log(`✅ Accès reporting modifié pour user ${id}: ${hasAccess}`);
                res.json({ success: true, hasReportingAccess: hasAccess });
            }
        }
    );
});

app.post('/api/users/:id/amoa-ced', requireAdmin, (req, res) => {
    const { hasAccess } = req.body;
    const { id } = req.params;
    
    database.run(
        'UPDATE users SET amoa_ced = ? WHERE id = ?',
        [hasAccess ? 1 : 0, id],
        (err) => {
            if (err) {
                console.error('Erreur modification accès AMOA CED:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log(`✅ Accès AMOA CED modifié pour user ${id}: ${hasAccess}`);
                res.json({ success: true, amoaCed: hasAccess });
            }
        }
    );
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

// Endpoint pour récupérer les sessions actives (utilisateurs connectés) - accessible à tous les utilisateurs authentifiés
app.get('/api/active-sessions', requireAuth, async (req, res) => {
    const activeUsers = [];
    const now = Date.now();
    const timeout = 15 * 60 * 1000; // 15 minutes
    
    // Collecter les IDs des utilisateurs actifs
    const activeUserIds = [];
    for (const [userId, session] of activeSessions) {
        if (now - session.lastActivity <= timeout) {
            activeUserIds.push(userId);
        }
    }
    
    if (activeUserIds.length === 0) {
        return res.json({ activeUsers: [] });
    }
    
    // Récupérer les infos complètes des utilisateurs actifs (nom, prénom, photo, trigramme)
    try {
        const placeholders = activeUserIds.map(() => '?').join(',');
        const users = await new Promise((resolve, reject) => {
            database.all(
                `SELECT u.id, u.nom, u.prenom, u.profile_photo, r.trigramme 
                 FROM users u 
                 LEFT JOIN resources r ON u.resource_id = r.id 
                 WHERE u.id IN (${placeholders})`,
                activeUserIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        // Créer un map pour accès rapide
        const userInfoMap = new Map();
        users.forEach(u => userInfoMap.set(u.id, u));
        
        for (const [userId, session] of activeSessions) {
            if (now - session.lastActivity <= timeout) {
                const userInfo = userInfoMap.get(userId) || {};
                activeUsers.push({
                    userId: userId,
                    profile: session.profile,
                    username: session.username,
                    nom: userInfo.nom || '',
                    prenom: userInfo.prenom || '',
                    trigramme: userInfo.trigramme || '',
                    profilePhoto: userInfo.profile_photo || null,
                    lastActivity: session.lastActivity
                });
            }
        }
        
        res.json({ activeUsers });
    } catch (error) {
        console.error('Erreur récupération sessions actives:', error);
        res.status(500).json({ error: error.message });
    }
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

// ========== FILE D'ATTENTE EMAILS (EMAIL QUEUE WORKER) ==========

let emailWorkerRunning = false;
const EMAIL_WORKER_POLL_INTERVAL = 1500; // Vérification quand la queue est vide
const EMAIL_INTER_SEND_DELAY = 500; // 500ms entre chaque email (évite de saturer le SMTP)
const EMAIL_RETRY_DELAYS = [0, 30000, 120000]; // Retry immédiat, puis 30s, puis 2min
let cachedTransporter = null;
let cachedTransporterConfig = '';

// Obtenir un transporter réutilisable (ne recrée que si la config change)
function getReusableTransporter() {
    const configKey = `${emailConfig.host}:${emailConfig.port}:${emailConfig.user}`;
    if (cachedTransporter && cachedTransporterConfig === configKey) {
        return cachedTransporter;
    }
    cachedTransporter = createEmailTransporter();
    cachedTransporterConfig = configKey;
    return cachedTransporter;
}

// Ajouter un email à la file d'attente
function enqueueEmail({ batchId, recipientEmail, recipientName, senderName, senderEmail, subject, htmlBody, icsContent, icsMethod, icsFilename, actionType, resourceId }) {
    return new Promise((resolve, reject) => {
        database.run(
            `INSERT INTO email_queue (batch_id, recipient_email, recipient_name, sender_name, sender_email, subject, html_body, ics_content, ics_method, ics_filename, action_type, resource_id, next_retry_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [batchId, recipientEmail, recipientName, senderName, senderEmail, subject, htmlBody, icsContent || null, icsMethod || null, icsFilename || null, actionType || 'new', resourceId || null],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

// Récupérer le prochain email à traiter
function getNextQueuedEmail() {
    return new Promise((resolve, reject) => {
        database.get(
            `SELECT * FROM email_queue 
             WHERE status = 'pending' AND next_retry_at <= datetime('now') AND attempts < max_attempts
             ORDER BY created_at ASC LIMIT 1`,
            [],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

// Mettre à jour le statut d'un email dans la file
function updateQueueStatus(id, status, errorMessage) {
    return new Promise((resolve, reject) => {
        if (status === 'sent') {
            database.run(
                `UPDATE email_queue SET status = 'sent', processed_at = datetime('now'), attempts = attempts + 1 WHERE id = ?`,
                [id],
                (err) => err ? reject(err) : resolve()
            );
        } else if (status === 'failed') {
            database.run(
                `UPDATE email_queue SET status = 'failed', error_message = ?, attempts = attempts + 1, processed_at = datetime('now') WHERE id = ?`,
                [errorMessage, id],
                (err) => err ? reject(err) : resolve()
            );
        } else if (status === 'retry') {
            database.get(`SELECT attempts FROM email_queue WHERE id = ?`, [id], (err, row) => {
                if (err) return reject(err);
                const attempts = (row ? row.attempts : 0) + 1;
                const delayMs = EMAIL_RETRY_DELAYS[Math.min(attempts, EMAIL_RETRY_DELAYS.length - 1)];
                const delaySec = Math.floor(delayMs / 1000);
                database.run(
                    `UPDATE email_queue SET status = 'pending', error_message = ?, attempts = attempts + 1, next_retry_at = datetime('now', '+${delaySec} seconds') WHERE id = ?`,
                    [errorMessage, id],
                    (err2) => err2 ? reject(err2) : resolve()
                );
            });
        }
    });
}

// Pause utilitaire
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Worker qui traite la file d'attente en boucle (enchaîne tant qu'il y a des emails)
async function processEmailQueue() {
    if (emailWorkerRunning) return;
    emailWorkerRunning = true;
    
    try {
        const transporter = getReusableTransporter();
        if (!transporter) {
            emailWorkerRunning = false;
            return;
        }
        
        // Boucle : traiter tous les emails disponibles d'un coup
        let processed = 0;
        while (true) {
            const email = await getNextQueuedEmail();
            if (!email) break; // Queue vide
            
            const mailOptions = {
                from: `"${email.sender_name} (Planning SI-SAMU)" <${emailConfig.user}>`,
                to: email.recipient_email,
                subject: email.subject,
                html: email.html_body
            };
            
            if (email.ics_content) {
                mailOptions.icalEvent = {
                    filename: email.ics_filename || 'invitation.ics',
                    method: email.ics_method || 'REQUEST',
                    content: email.ics_content
                };
            }
            
            try {
                await transporter.sendMail(mailOptions);
                await updateQueueStatus(email.id, 'sent');
                processed++;
                console.log(`✅ Queue [${processed}]: envoyé à ${email.recipient_email} (${email.action_type}) [batch:${email.batch_id.substring(0, 8)}]`);
            } catch (sendError) {
                const errorMsg = sendError.message || 'Erreur inconnue';
                console.error(`❌ Queue: échec envoi à ${email.recipient_email}: ${errorMsg}`);
                
                // Invalider le transporter en cache si erreur de connexion
                if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ESOCKET')) {
                    cachedTransporter = null;
                    cachedTransporterConfig = '';
                }
                
                if (email.attempts + 1 >= email.max_attempts) {
                    await updateQueueStatus(email.id, 'failed', errorMsg);
                    console.log(`💀 Queue: abandonné après ${email.max_attempts} tentatives`);
                } else {
                    await updateQueueStatus(email.id, 'retry', errorMsg);
                    console.log(`🔄 Queue: retry planifié (tentative ${email.attempts + 2}/${email.max_attempts})`);
                }
            }
            
            // Petite pause entre les envois pour ne pas saturer le SMTP
            await sleep(EMAIL_INTER_SEND_DELAY);
        }
        
        if (processed > 0) {
            console.log(`📧 Queue: ${processed} email(s) traités dans ce cycle`);
        }
    } catch (error) {
        console.error('❌ Queue worker error:', error);
    }
    
    emailWorkerRunning = false;
}

// Vérifier la queue périodiquement (le worker enchaîne quand il y a des emails)
setInterval(processEmailQueue, EMAIL_WORKER_POLL_INTERVAL);

// Endpoint: statut d'un batch d'emails
app.get('/api/email-queue/status/:batchId', requireAuth, async (req, res) => {
    const { batchId } = req.params;
    
    try {
        const stats = await new Promise((resolve, reject) => {
            database.get(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
                 FROM email_queue WHERE batch_id = ?`,
                [batchId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        // Récupérer les détails des emails échoués
        const failures = await new Promise((resolve, reject) => {
            database.all(
                `SELECT recipient_name, recipient_email, error_message, action_type 
                 FROM email_queue WHERE batch_id = ? AND status = 'failed'`,
                [batchId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        const completed = (stats.sent || 0) + (stats.failed || 0);
        const isComplete = completed >= stats.total;
        
        res.json({
            success: true,
            batchId,
            total: stats.total || 0,
            sent: stats.sent || 0,
            pending: stats.pending || 0,
            failed: stats.failed || 0,
            isComplete,
            progress: stats.total > 0 ? Math.round((completed / stats.total) * 100) : 0,
            failures
        });
    } catch (error) {
        console.error('Erreur statut queue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== GENERATION ICS (INVITATIONS OUTLOOK) ==========

// Formater une date en format ICS (YYYYMMDDTHHmmssZ)
function formatDateICS(dateStr, hours, minutes) {
    const [year, month, day] = dateStr.split('-').map(Number);
    // Créer la date en heure locale Paris, convertir en UTC (Paris = UTC+1 en hiver, UTC+2 en été)
    const date = new Date(year, month - 1, day, hours, minutes, 0);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}00Z`;
}

// Formater un timestamp now en ICS
function nowICS() {
    const now = new Date();
    return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Générer un UID unique pour un événement ICS
function generateICSUid() {
    return crypto.randomUUID() + '@planning-ans';
}

// Construire un fichier ICS pour une invitation (METHOD: REQUEST)
function buildICS({ uid, summary, description, location, dtstart, dtend, organizer, organizerName, attendee, attendeeName, sequence, method }) {
    const methodStr = method || 'REQUEST';
    const seq = sequence || 0;
    const status = methodStr === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
    const now = nowICS();
    
    let ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Planning ANS//SI-SAMU//FR',
        `METHOD:${methodStr}`,
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
    ];
    
    if (location) {
        ics.push(`LOCATION:${location}`);
    }
    
    ics.push(`ORGANIZER;CN=${organizerName}:mailto:${organizer}`);
    ics.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${attendeeName}:mailto:${attendee}`);
    ics.push(`SEQUENCE:${seq}`);
    ics.push(`STATUS:${status}`);
    ics.push('END:VEVENT');
    ics.push('END:VCALENDAR');
    
    return ics.join('\r\n');
}

// Horaires des demi-journées
const HALF_DAY_HOURS = {
    AM: { start: 8, end: 12 },
    PM: { start: 14, end: 18 }
};

// Grouper les affectations contiguës de même type/localisation
function groupContiguousAssignments(assignments) {
    if (!assignments || assignments.length === 0) return [];
    
    // Trier par date puis par période (AM avant PM)
    const sorted = [...assignments].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.period === 'AM' ? -1 : 1;
    });
    
    const groups = [];
    let currentGroup = null;
    
    for (const item of sorted) {
        if (!currentGroup) {
            currentGroup = { activity: item.activity, activityCode: item.activityCode, location: item.location, slots: [item] };
            continue;
        }
        
        // Vérifier si même activité ET même localisation
        const sameActivity = currentGroup.activityCode === item.activityCode;
        const sameLocation = (currentGroup.location || '') === (item.location || '');
        
        if (!sameActivity || !sameLocation) {
            groups.push(currentGroup);
            currentGroup = { activity: item.activity, activityCode: item.activityCode, location: item.location, slots: [item] };
            continue;
        }
        
        // Vérifier la contiguïté
        const lastSlot = currentGroup.slots[currentGroup.slots.length - 1];
        const isContiguous = checkContiguous(lastSlot.date, lastSlot.period, item.date, item.period);
        
        if (isContiguous) {
            currentGroup.slots.push(item);
        } else {
            groups.push(currentGroup);
            currentGroup = { activity: item.activity, activityCode: item.activityCode, location: item.location, slots: [item] };
        }
    }
    
    if (currentGroup) groups.push(currentGroup);
    return groups;
}

// Vérifier si deux créneaux sont contigus
function checkContiguous(date1, period1, date2, period2) {
    // AM puis PM du même jour
    if (date1 === date2 && period1 === 'AM' && period2 === 'PM') return true;
    
    // PM d'un jour puis AM du jour ouvré suivant
    if (period1 === 'PM' && period2 === 'AM') {
        const nextWorkDay = getNextWorkDay(date1);
        if (nextWorkDay === date2) return true;
    }
    
    return false;
}

// Obtenir le prochain jour ouvré après une date
function getNextWorkDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    do {
        date.setDate(date.getDate() + 1);
    } while (date.getDay() === 0 || date.getDay() === 6); // Skip weekend
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
}

// Labels d'activités propres (sans emoji) pour les ICS
const ACTIVITY_LABELS = {
    '3': 'SAMU (Déploiement)',
    '4': 'SAMU (Dev. usages)',
    '5': 'ANS (Déploiement)',
    '6': 'ANS (Dev. usages)',
    '7': 'Qualification',
    '8': 'Autre mission'
};

function getCleanActivityLabel(assignment) {
    // Priorité : activityCode → oldActivityCode → fallback sur activity sans emoji
    if (assignment.activityCode && ACTIVITY_LABELS[assignment.activityCode]) {
        return ACTIVITY_LABELS[assignment.activityCode];
    }
    // Nettoyer les emojis du label si pas de code
    if (assignment.activity) {
        return assignment.activity.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    }
    return 'Affectation';
}

function getCleanOldActivityLabel(assignment) {
    if (assignment.oldActivityCode && ACTIVITY_LABELS[assignment.oldActivityCode]) {
        return ACTIVITY_LABELS[assignment.oldActivityCode];
    }
    if (assignment.oldActivity) {
        return assignment.oldActivity.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    }
    return 'Affectation';
}

// ========== ENDPOINT ENVOI EMAILS D'AFFECTATION (REFONTE ICS) ==========

app.post('/api/send-assignment-emails', (req, res, next) => {
    req.timingStart = Date.now();
    console.log(`📧 [${req.timingStart}] ROUTE HIT - avant requireAuth`);
    next();
}, requireAuth, (req, res) => {
    const afterAuth = Date.now();
    console.log(`📧 [${afterAuth}] APRÈS requireAuth (+${afterAuth - req.timingStart}ms)`);
    
    const debugMode = req.body.debug === true;
    const { assignments, senderName, senderEmail: clientSenderEmail } = req.body;
    
    const afterParse = Date.now();
    console.log(`📧 [${afterParse}] Body parsé (+${afterParse - req.timingStart}ms), debugMode=${debugMode}`);
    
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ success: false, error: 'Aucune affectation à envoyer' });
    }
    
    if (!emailConfig.user || !emailConfig.password) {
        return res.status(500).json({ success: false, error: 'Configuration email non disponible' });
    }
    
    const requesterName = senderName || `${req.session.prenom || 'Admin'} ${req.session.nom || 'Système'}`;
    const senderEmailAddr = clientSenderEmail || emailConfig.user;
    const sessionLogId = req.session?.logId;
    
    // Headers pour désactiver le buffering du reverse proxy
    res.set({
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache, no-store',
        'Connection': 'close'
    });
    
    // En mode debug, créer un job avec les timings
    if (debugMode) {
        const jobId = crypto.randomUUID();
        const job = {
            id: jobId,
            status: 'running',
            logs: [],
            result: null,
            createdAt: Date.now(),
            timingStart: req.timingStart
        };
        debugJobs.set(jobId, job);
        
        // Ajouter les logs de timing DANS le job
        const addTimingLog = (msg) => {
            const now = Date.now();
            const elapsed = now - req.timingStart;
            job.logs.push({ 
                type: 'info', 
                message: `⏱️ ${msg} (+${elapsed}ms)`, 
                timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
            });
        };
        
        addTimingLog('Requête reçue par le serveur');
        addTimingLog(`Auth vérifiée en ${afterAuth - req.timingStart}ms`);
        addTimingLog('Job créé, réponse envoyée');
        
        const beforeSend = Date.now();
        console.log(`📧 [${beforeSend}] ENVOI res.json() (+${beforeSend - req.timingStart}ms)`);
        
        // Répondre IMMÉDIATEMENT avec res.end() explicite pour forcer le flush
        const responseBody = JSON.stringify({ success: true, jobId, message: 'Job créé' });
        res.status(200)
           .set('Content-Type', 'application/json')
           .set('Content-Length', Buffer.byteLength(responseBody))
           .end(responseBody);
        
        const afterSend = Date.now();
        console.log(`📧 [${afterSend}] res.end() terminé (+${afterSend - req.timingStart}ms)`);
        
        // Lancer le traitement en arrière-plan
        setTimeout(() => {
            const startProcess = Date.now();
            console.log(`📧 [${startProcess}] setTimeout exécuté (+${startProcess - req.timingStart}ms)`);
            job.logs.push({ 
                type: 'info', 
                message: `⏱️ Traitement démarré (+${startProcess - req.timingStart}ms depuis la requête)`, 
                timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
            });
            processEmailJob(job, assignments, requesterName, senderEmailAddr, sessionLogId);
        }, 10);
        
        return;
    }
    
    // Mode normal : répondre immédiatement
    console.log(`📧 [${Date.now()}] Mode normal, ENVOI RÉPONSE (+${Date.now() - req.timingStart}ms)`);
    const responseBody = JSON.stringify({ success: true, message: 'Invitations en cours d\'envoi...' });
    res.status(200)
       .set('Content-Type', 'application/json')
       .set('Content-Length', Buffer.byteLength(responseBody))
       .end(responseBody);
    
    // Traiter en arrière-plan
    setTimeout(() => processEmailJobNormal(assignments, requesterName, senderEmailAddr, sessionLogId), 10);
});

// Fonction de traitement pour le mode debug
async function processEmailJob(job, assignments, requesterName, senderEmailAddr, sessionLogId) {
    const addLog = (type, message) => {
        const timestamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
        job.logs.push({ type, message, timestamp });
        console.log(`[DEBUG ${job.id.slice(0,8)}] [${type}] ${message}`);
    };
    
    try {
        addLog('info', '📧 === DEBUT send-assignment-emails (DEBUG MODE) ===');
        addLog('info', `📧 Expéditeur: ${requesterName} <${senderEmailAddr}>`);
        addLog('info', `👥 Experts à traiter: ${assignments.length}`);
        addLog('email', `📧 Configuration SMTP:`);
        addLog('email', `   Host: ${emailConfig.host}`);
        addLog('email', `   Port: ${emailConfig.port}`);
        addLog('email', `   Secure: ${emailConfig.secure}`);
        addLog('email', `   User: ${emailConfig.user}`);
        
        // 1. PRÉPARER LES EMAILS D'ABORD (rapide, pas de réseau)
        addLog('info', '📧 Préparation des emails...');
        const emailsToSend = [];
        for (const item of assignments) {
            const { resourceId, email, expertNom, expertPrenom, expertName, assignments: expertAssignments } = item;
            const attendeeName = (expertPrenom && expertNom) ? `${expertPrenom} ${expertNom}` : (expertName || expertPrenom || expertNom || 'Expert');
            if (!email) {
                addLog('warning', `   ⚠️ ${attendeeName}: pas d'email configuré`);
                continue;
            }
            addLog('info', `   ${attendeeName} <${email}>: ${expertAssignments.length} affectation(s)`);
            
            const newAssigns = expertAssignments.filter(a => a.actionType === 'new' || !a.actionType);
            const modifiedAssigns = expertAssignments.filter(a => a.actionType === 'modified');
            const deletedAssigns = expertAssignments.filter(a => a.actionType === 'deleted');
            
            if (newAssigns.length > 0) {
                const groups = groupContiguousAssignments(newAssigns);
                for (const group of groups) {
                    try {
                        const firstSlot = group.slots[0], lastSlot = group.slots[group.slots.length - 1];
                        const startHours = HALF_DAY_HOURS[firstSlot.period], endHours = HALF_DAY_HOURS[lastSlot.period];
                        const uid = generateICSUid();
                        const cleanLabel = ACTIVITY_LABELS[group.activityCode] || getCleanActivityLabel({ activityCode: group.activityCode, activity: group.activity });
                        const summary = `Domaines des Urgences - Affectation – ${cleanLabel} – ${requesterName}`;
                        const location = group.location && group.location !== '-' ? group.location : '';
                        const slotsDesc = group.slots.map(s => { const [y,m,d] = s.date.split('-'); return `${d}/${m}/${y} (${s.period === 'AM' ? 'Matin 8h-12h' : 'Apres-midi 14h-18h'})`; }).join('\\n');
                        const description = `Affectation: ${cleanLabel}\\nLocalisation: ${location || 'Non precisee'}\\nDemandeur: ${requesterName}\\n\\nCreneaux:\\n${slotsDesc}`;
                        emailsToSend.push({ type: 'new', to: email, subject: summary, attendeeName,
                            html: buildInvitationHTML(attendeeName, requesterName, group, 'new'),
                            attachments: [{ filename: 'invitation.ics', content: buildICS({ uid, summary, description, location, dtstart: formatDateICS(firstSlot.date, startHours.start, 0), dtend: formatDateICS(lastSlot.date, endHours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, method: 'REQUEST' }), contentType: 'text/calendar; method=REQUEST' }]
                        });
                    } catch (e) { addLog('error', `   Erreur préparation NEW: ${e.message}`); }
                }
            }
            
            for (const assignment of modifiedAssigns) {
                try {
                    const hours = HALF_DAY_HOURS[assignment.period];
                    const oldLabel = getCleanOldActivityLabel(assignment);
                    const cancelSummary = `Domaines des Urgences - Affectation – ${oldLabel} – ${requesterName}`;
                    const oldLoc = assignment.oldLocation && assignment.oldLocation !== '-' ? assignment.oldLocation : '';
                    emailsToSend.push({ type: 'cancel_modify', to: email, subject: `Annule: ${cancelSummary}`, attendeeName,
                        html: buildInvitationHTML(attendeeName, requesterName, { activity: oldLabel, location: oldLoc, slots: [assignment] }, 'cancelled'),
                        attachments: [{ filename: 'annulation.ics', content: buildICS({ uid: generateICSUid(), summary: cancelSummary, description: `Annulation: cette affectation a ete modifiee par ${requesterName}.`, location: oldLoc, dtstart: formatDateICS(assignment.date, hours.start, 0), dtend: formatDateICS(assignment.date, hours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, sequence: 1, method: 'CANCEL' }), contentType: 'text/calendar; method=CANCEL' }]
                    });
                    const newLabel = ACTIVITY_LABELS[assignment.activityCode] || getCleanActivityLabel(assignment);
                    const newSummary = `Domaines des Urgences - Affectation – ${newLabel} – ${requesterName}`;
                    const newLoc = assignment.location && assignment.location !== '-' ? assignment.location : '';
                    emailsToSend.push({ type: 'modified', to: email, subject: newSummary, attendeeName,
                        html: buildInvitationHTML(attendeeName, requesterName, { activity: newLabel, location: newLoc, slots: [assignment] }, 'modified'),
                        attachments: [{ filename: 'invitation.ics', content: buildICS({ uid: generateICSUid(), summary: newSummary, description: `Nouvelle affectation: ${newLabel}\\nLocalisation: ${newLoc || 'Non precisee'}\\nDemandeur: ${requesterName}`, location: newLoc, dtstart: formatDateICS(assignment.date, hours.start, 0), dtend: formatDateICS(assignment.date, hours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, method: 'REQUEST' }), contentType: 'text/calendar; method=REQUEST' }]
                    });
                } catch (e) { addLog('error', `   Erreur préparation MODIFIED: ${e.message}`); }
            }
            
            for (const assignment of deletedAssigns) {
                try {
                    const hours = HALF_DAY_HOURS[assignment.period];
                    const delLabel = getCleanOldActivityLabel(assignment);
                    const cancelSummary = `Domaines des Urgences - Affectation – ${delLabel} – ${requesterName}`;
                    const loc = assignment.oldLocation && assignment.oldLocation !== '-' ? assignment.oldLocation : (assignment.location && assignment.location !== '-' ? assignment.location : '');
                    emailsToSend.push({ type: 'deleted', to: email, subject: `Annule: ${cancelSummary}`, attendeeName,
                        html: buildInvitationHTML(attendeeName, requesterName, { activity: delLabel, location: loc, slots: [assignment] }, 'cancelled'),
                        attachments: [{ filename: 'annulation.ics', content: buildICS({ uid: generateICSUid(), summary: cancelSummary, description: `Cette affectation a ete supprimee par ${requesterName}.`, location: loc, dtstart: formatDateICS(assignment.date, hours.start, 0), dtend: formatDateICS(assignment.date, hours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, sequence: 1, method: 'CANCEL' }), contentType: 'text/calendar; method=CANCEL' }]
                    });
                } catch (e) { addLog('error', `   Erreur préparation DELETED: ${e.message}`); }
            }
        }
        
        addLog('info', `📧 ${emailsToSend.length} email(s) préparés`);
        
        // Log de la taille des ICS
        if (emailsToSend.length > 0 && emailsToSend[0].attachments) {
            const icsSize = emailsToSend[0].attachments[0]?.content?.length || 0;
            addLog('info', `📎 Taille fichier ICS: ${icsSize} caractères`);
        }
        
        addLog('info', '─'.repeat(50));
        
        // 2. ENVOYER LES EMAILS (avec retry sur le premier)
        addLog('email', '📤 Début envoi des emails...');
        let totalSent = 0, totalFailed = 0;
        
        for (let i = 0; i < emailsToSend.length; i++) {
            const mail = emailsToSend[i];
            const icsInfo = mail.attachments?.[0] ? `ICS: ${mail.attachments[0].content?.length || 0} chars` : 'pas de pièce jointe';
            addLog('email', `📧 [${i+1}/${emailsToSend.length}] Envoi à ${mail.to} (${mail.type}, ${icsInfo})...`);
            const emailStartTime = Date.now();
            
            let success = false;
            let lastError = null;
            const maxRetries = (i === 0) ? 3 : 1; // Plus de retries pour le premier email
            
            for (let retry = 0; retry < maxRetries && !success; retry++) {
                if (retry > 0) {
                    addLog('warning', `   ⚠️ Retry ${retry}/${maxRetries-1}...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1s avant retry
                }
                
                try {
                    await sendEmail(mail.to, mail.subject, mail.html, mail.attachments);
                    success = true;
                } catch (error) {
                    lastError = error;
                }
            }
            
            const duration = Date.now() - emailStartTime;
            if (success) {
                totalSent++;
                addLog('success', `   ✅ Envoyé en ${duration}ms`);
            } else {
                totalFailed++;
                addLog('error', `   ❌ Échec après ${duration}ms: ${lastError.message}`);
                if (lastError.code) addLog('error', `   Code: ${lastError.code}`);
            }
            
            if (i < emailsToSend.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        addLog('info', '─'.repeat(50));
        addLog('info', `📊 RÉSUMÉ EMAILS: ${totalSent} envoyé(s), ${totalFailed} échec(s)`);
        
        // 3. NOTIFICATIONS EN BASE (après les emails, en parallèle)
        addLog('db', '📝 Création des notifications en base (arrière-plan)...');
        const dbStartTime = Date.now();
        let notificationsCreated = 0;
        
        // Créer toutes les notifications en batch plutôt qu'une par une
        const notifPromises = [];
        for (const item of assignments) {
            const { resourceId, assignments: expertAssignments } = item;
            notifPromises.push((async () => {
                try {
                    const user = await new Promise((resolve, reject) => {
                        database.get(`SELECT id FROM users WHERE resource_id = ? AND is_expert = 1`, [resourceId],
                            (err, row) => err ? reject(err) : resolve(row));
                    });
                    if (user) {
                        for (const assignment of expertAssignments) {
                            let activityName = assignment.activity;
                            if (assignment.location && assignment.location !== '-') activityName = `${assignment.activity} (${assignment.location})`;
                            let actionLabel = 'Nouvelle affectation';
                            if (assignment.actionType === 'modified') actionLabel = 'Modification affectation';
                            if (assignment.actionType === 'deleted') actionLabel = 'Suppression affectation';
                            
                            await new Promise((resolve, reject) => {
                                database.run(`INSERT OR REPLACE INTO expert_notifications (expert_id, date, period, activity_name, requester_name, action_type) VALUES (?, ?, ?, ?, ?, ?)`,
                                    [user.id, assignment.date, assignment.period, activityName, requesterName, actionLabel], 
                                    (err) => err ? reject(err) : resolve());
                            });
                            notificationsCreated++;
                        }
                    }
                } catch (e) { console.error(`Erreur notification:`, e.message); }
            })());
        }
        await Promise.all(notifPromises);
        addLog('db', `✅ ${notificationsCreated} notification(s) créée(s) en ${Date.now() - dbStartTime}ms`);
        
        // Logger l'action
        if (sessionLogId) {
            const allEmails = assignments.map(a => a.email).filter(e => e).join(', ');
            database.run(`UPDATE connection_logs SET modifications = modifications || ? WHERE id = ?`,
                [`${new Date().toLocaleString('fr-FR')}: Invitations Outlook (${totalSent}/${totalSent + totalFailed}) pour: ${allEmails}\n`, sessionLogId]);
        }
        
        job.status = 'completed';
        job.result = { success: totalSent > 0, sent: totalSent, failed: totalFailed };
        
    } catch (error) {
        job.logs.push({ type: 'error', message: `❌ EXCEPTION: ${error.message}`, timestamp: new Date().toLocaleTimeString('fr-FR') });
        job.status = 'error';
        job.result = { success: false, error: error.message };
    }
}

// Fonction de traitement pour le mode normal (non-debug)
async function processEmailJobNormal(assignments, requesterName, senderEmailAddr, sessionLogId) {
    try {
        // Préparer les emails
        const emailsToSend = [];
        for (const item of assignments) {
            const { resourceId, email, expertNom, expertPrenom, expertName, assignments: expertAssignments } = item;
            const attendeeName = (expertPrenom && expertNom) ? `${expertPrenom} ${expertNom}` : (expertName || expertPrenom || expertNom || 'Expert');
            if (!email) continue;
            
            const newAssigns = expertAssignments.filter(a => a.actionType === 'new' || !a.actionType);
            const modifiedAssigns = expertAssignments.filter(a => a.actionType === 'modified');
            const deletedAssigns = expertAssignments.filter(a => a.actionType === 'deleted');
            
            if (newAssigns.length > 0) {
                const groups = groupContiguousAssignments(newAssigns);
                for (const group of groups) {
                    try {
                        const firstSlot = group.slots[0], lastSlot = group.slots[group.slots.length - 1];
                        const startHours = HALF_DAY_HOURS[firstSlot.period], endHours = HALF_DAY_HOURS[lastSlot.period];
                        const uid = generateICSUid();
                        const cleanLabel = ACTIVITY_LABELS[group.activityCode] || getCleanActivityLabel({ activityCode: group.activityCode, activity: group.activity });
                        const summary = `Domaines des Urgences - Affectation – ${cleanLabel} – ${requesterName}`;
                        const location = group.location && group.location !== '-' ? group.location : '';
                        const slotsDesc = group.slots.map(s => { const [y,m,d] = s.date.split('-'); return `${d}/${m}/${y} (${s.period === 'AM' ? 'Matin 8h-12h' : 'Apres-midi 14h-18h'})`; }).join('\\n');
                        const description = `Affectation: ${cleanLabel}\\nLocalisation: ${location || 'Non precisee'}\\nDemandeur: ${requesterName}\\n\\nCreneaux:\\n${slotsDesc}`;
                        emailsToSend.push({ type: 'new', to: email, subject: summary,
                            html: buildInvitationHTML(attendeeName, requesterName, group, 'new'),
                            attachments: [{ filename: 'invitation.ics', content: buildICS({ uid, summary, description, location, dtstart: formatDateICS(firstSlot.date, startHours.start, 0), dtend: formatDateICS(lastSlot.date, endHours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, method: 'REQUEST' }), contentType: 'text/calendar; method=REQUEST' }]
                        });
                    } catch (e) { console.error(`Erreur préparation NEW:`, e.message); }
                }
            }
            
            for (const assignment of modifiedAssigns) {
                try {
                    const hours = HALF_DAY_HOURS[assignment.period];
                    const oldLabel = getCleanOldActivityLabel(assignment);
                    const cancelSummary = `Domaines des Urgences - Affectation – ${oldLabel} – ${requesterName}`;
                    const oldLoc = assignment.oldLocation && assignment.oldLocation !== '-' ? assignment.oldLocation : '';
                    emailsToSend.push({ type: 'cancel_modify', to: email, subject: `Annule: ${cancelSummary}`,
                        html: buildInvitationHTML(attendeeName, requesterName, { activity: oldLabel, location: oldLoc, slots: [assignment] }, 'cancelled'),
                        attachments: [{ filename: 'annulation.ics', content: buildICS({ uid: generateICSUid(), summary: cancelSummary, description: `Annulation: cette affectation a ete modifiee par ${requesterName}.`, location: oldLoc, dtstart: formatDateICS(assignment.date, hours.start, 0), dtend: formatDateICS(assignment.date, hours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, sequence: 1, method: 'CANCEL' }), contentType: 'text/calendar; method=CANCEL' }]
                    });
                    const newLabel = ACTIVITY_LABELS[assignment.activityCode] || getCleanActivityLabel(assignment);
                    const newSummary = `Domaines des Urgences - Affectation – ${newLabel} – ${requesterName}`;
                    const newLoc = assignment.location && assignment.location !== '-' ? assignment.location : '';
                    emailsToSend.push({ type: 'modified', to: email, subject: newSummary,
                        html: buildInvitationHTML(attendeeName, requesterName, { activity: newLabel, location: newLoc, slots: [assignment] }, 'modified'),
                        attachments: [{ filename: 'invitation.ics', content: buildICS({ uid: generateICSUid(), summary: newSummary, description: `Nouvelle affectation: ${newLabel}\\nLocalisation: ${newLoc || 'Non precisee'}\\nDemandeur: ${requesterName}`, location: newLoc, dtstart: formatDateICS(assignment.date, hours.start, 0), dtend: formatDateICS(assignment.date, hours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, method: 'REQUEST' }), contentType: 'text/calendar; method=REQUEST' }]
                    });
                } catch (e) { console.error(`Erreur préparation MODIFIED:`, e.message); }
            }
            
            for (const assignment of deletedAssigns) {
                try {
                    const hours = HALF_DAY_HOURS[assignment.period];
                    const delLabel = getCleanOldActivityLabel(assignment);
                    const cancelSummary = `Domaines des Urgences - Affectation – ${delLabel} – ${requesterName}`;
                    const loc = assignment.oldLocation && assignment.oldLocation !== '-' ? assignment.oldLocation : (assignment.location && assignment.location !== '-' ? assignment.location : '');
                    emailsToSend.push({ type: 'deleted', to: email, subject: `Annule: ${cancelSummary}`,
                        html: buildInvitationHTML(attendeeName, requesterName, { activity: delLabel, location: loc, slots: [assignment] }, 'cancelled'),
                        attachments: [{ filename: 'annulation.ics', content: buildICS({ uid: generateICSUid(), summary: cancelSummary, description: `Cette affectation a ete supprimee par ${requesterName}.`, location: loc, dtstart: formatDateICS(assignment.date, hours.start, 0), dtend: formatDateICS(assignment.date, hours.end, 0), organizer: senderEmailAddr, organizerName: requesterName, attendee: email, attendeeName, sequence: 1, method: 'CANCEL' }), contentType: 'text/calendar; method=CANCEL' }]
                    });
                } catch (e) { console.error(`Erreur préparation DELETED:`, e.message); }
            }
        }
        
        console.log(`📧 ${emailsToSend.length} email(s) préparés, envoi...`);
        
        // Envoyer les emails
        let totalSent = 0, totalFailed = 0;
        for (let i = 0; i < emailsToSend.length; i++) {
            const mail = emailsToSend[i];
            try {
                if (i > 0) await new Promise(resolve => setTimeout(resolve, 100));
                await sendEmail(mail.to, mail.subject, mail.html, mail.attachments);
                totalSent++;
                console.log(`✅ [${i+1}/${emailsToSend.length}] Email envoyé à ${mail.to}`);
            } catch (error) {
                totalFailed++;
                console.error(`❌ [${i+1}/${emailsToSend.length}] Erreur envoi à ${mail.to}:`, error.message);
            }
        }
        
        console.log(`📊 Résultat: ${totalSent} envoyé(s), ${totalFailed} échec(s)`);
        
        // Notifications en base (en arrière-plan, ne bloque pas)
        for (const item of assignments) {
            const { resourceId, assignments: expertAssignments } = item;
            database.get(`SELECT id FROM users WHERE resource_id = ? AND is_expert = 1`, [resourceId], (err, user) => {
                if (!err && user) {
                    for (const assignment of expertAssignments) {
                        let activityName = assignment.activity;
                        if (assignment.location && assignment.location !== '-') activityName = `${assignment.activity} (${assignment.location})`;
                        let actionLabel = assignment.actionType === 'modified' ? 'Modification' : assignment.actionType === 'deleted' ? 'Suppression' : 'Nouvelle';
                        database.run(`INSERT OR REPLACE INTO expert_notifications (expert_id, date, period, activity_name, requester_name, action_type) VALUES (?, ?, ?, ?, ?, ?)`,
                            [user.id, assignment.date, assignment.period, activityName, requesterName, actionLabel]);
                    }
                }
            });
        }
        
        if (sessionLogId) {
            const allEmails = assignments.map(a => a.email).filter(e => e).join(', ');
            database.run(`UPDATE connection_logs SET modifications = modifications || ? WHERE id = ?`,
                [`${new Date().toLocaleString('fr-FR')}: Invitations Outlook (${totalSent}/${totalSent + totalFailed}) pour: ${allEmails}\n`, sessionLogId]);
        }
        
    } catch (bgError) {
        console.error('❌ Erreur traitement background:', bgError);
    }
}

// Construire le HTML du body d'une invitation
function buildInvitationHTML(attendeeName, requesterName, group, type) {
    const isCancel = type === 'cancelled';
    const isModified = type === 'modified';
    const color = isCancel ? '#D60B51' : isModified ? '#ff9800' : '#1D70B7';
    const icon = isCancel ? '❌' : isModified ? '🔄' : '📅';
    const title = isCancel ? 'Affectation annulée' : isModified ? 'Affectation modifiée' : 'Nouvelle affectation';
    
    const slotsHTML = group.slots.map(s => {
        const [y, m, d] = s.date.split('-');
        const dateStr = `${d}/${m}/${y}`;
        const periodStr = s.period === 'AM' ? 'Matin (8h-12h)' : 'Après-midi (14h-18h)';
        return `<li><strong>${dateStr}</strong> - ${periodStr}</li>`;
    }).join('');
    
    const locationHTML = group.location && group.location !== '-' 
        ? `<p><strong>📍 Localisation :</strong> ${group.location}</p>` 
        : '';
    
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h2 style="color: ${color}; border-bottom: 2px solid ${color}; padding-bottom: 10px;">
                    ${icon} ${title}
                </h2>
                
                <p>Bonjour ${attendeeName},</p>
                
                <p><strong>${requesterName}</strong> ${isCancel ? 'a annulé' : isModified ? 'a modifié' : 'vous a affecté'} :</p>
                
                <div style="background-color: ${isCancel ? '#fde8e8' : '#e3f2fd'}; padding: 15px; border-left: 4px solid ${color}; border-radius: 4px; margin: 15px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Activité :</strong> ${group.activity}</p>
                    ${locationHTML}
                    <ul style="margin: 8px 0 0 0; padding-left: 20px;">${slotsHTML}</ul>
                </div>
                
                ${!isCancel ? '<p style="font-size: 12px; color: #666;">💡 Cette invitation a été ajoutée à votre calendrier Outlook.</p>' : '<p style="font-size: 12px; color: #666;">Cette occurrence a été retirée de votre calendrier.</p>'}
                
                <p style="margin-top: 20px;">Cordialement,<br>${requesterName}<br>Système de planification SI-SAMU</p>
                
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                
                <p style="color: #7f8c8d; font-size: 11px; text-align: center;">
                    📅 Domaine des Urgences - Planification des Experts - ANS
                </p>
            </div>
        </div>
    `;
}

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
        `SELECT id, automation_id, expert_id, expert_name, expert_email, target_month, sent_at, recipients_list, filename FROM automation_logs WHERE automation_id = ? ORDER BY sent_at DESC LIMIT 100`,
        [id],
        (err, rows) => {
            if (err) {
                // Table n'existe peut-être pas encore
                console.error('Erreur lecture logs automation:', err);
                return res.json({ success: true, logs: [] });
            }
            
            // Ajouter file_id pour savoir si le fichier est téléchargeable
            const logsWithFileId = (rows || []).map(row => ({
                ...row,
                file_id: row.id, // On utilise l'ID comme file_id
                recipients_count: row.recipients_list ? JSON.parse(row.recipients_list).length : 0
            }));
            
            res.json({ success: true, logs: logsWithFileId });
        }
    );
});

// Télécharger un fichier de sauvegarde depuis les logs
app.get('/api/automation/download/2/:logId', requireAdmin, (req, res) => {
    const { logId } = req.params;
    
    database.get(
        `SELECT filename, file_content FROM automation_logs WHERE id = ? AND automation_id = 2`,
        [logId],
        (err, row) => {
            if (err) {
                console.error('Erreur récupération fichier:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (!row || !row.file_content) {
                return res.status(404).json({ error: 'Fichier non trouvé' });
            }
            
            const filename = row.filename || 'Expert_Planning_Sauvegarde.csv';
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(row.file_content);
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

// ========== AUTOMATISATION N°2 : SAUVEGARDE PLANNINGS ==========

// Récupérer les mois qui ont des données (hors lignes vides 1-1)
app.get('/api/automation/available-months', requireAdmin, async (req, res) => {
    try {
        // Récupérer les mois distincts où il y a des données NON vides
        // On ne compte que les lignes où available != '1' OU activity != '1'
        const monthsData = await new Promise((resolve, reject) => {
            database.all(`
                SELECT DISTINCT substr(date_key, 1, 7) as month 
                FROM schedule_data 
                WHERE (type = 'available' AND value != '1')
                   OR (type = 'activity' AND value != '1')
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        console.log('📅 Mois bruts trouvés:', monthsData.map(r => r.month));
        
        // Filtrer, normaliser et trier les mois chronologiquement
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        
        const formattedMonths = monthsData
            .map(row => {
                // Normaliser le format du mois (gérer "2025-9-" -> "2025-09")
                let monthStr = row.month;
                if (!monthStr) return null;
                
                // Nettoyer les caractères en trop
                monthStr = monthStr.replace(/-$/, ''); // Enlever le tiret final s'il existe
                
                // Parser année et mois
                const parts = monthStr.split('-');
                if (parts.length < 2) return null;
                
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                
                // Vérifier la validité
                if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
                
                // Retourner le format normalisé
                return `${year}-${String(month).padStart(2, '0')}`;
            })
            .filter(m => m !== null)
            // Supprimer les doublons après normalisation
            .filter((value, index, self) => self.indexOf(value) === index)
            .sort((a, b) => {
                // Tri chronologique: comparer année puis mois
                const [yearA, monthA] = a.split('-').map(Number);
                const [yearB, monthB] = b.split('-').map(Number);
                if (yearA !== yearB) return yearA - yearB;
                return monthA - monthB;
            })
            .map(monthStr => {
                const [year, month] = monthStr.split('-');
                return {
                    value: monthStr, // "2025-01"
                    label: `${monthNames[parseInt(month) - 1]} ${year}` // "Janvier 2025"
                };
            });
        
        console.log('📅 Mois formatés:', formattedMonths.map(m => `${m.value} -> ${m.label}`));
        
        res.json({ success: true, months: formattedMonths });
    } catch (error) {
        console.error('Erreur récupération mois disponibles:', error);
        res.status(500).json({ error: error.message });
    }
});

// Diagnostic des mois - pour comprendre les données
app.get('/api/automation/diagnose-months', requireAdmin, async (req, res) => {
    try {
        // Récupérer tous les mois distincts avec leurs statistiques
        const allMonthsData = await new Promise((resolve, reject) => {
            database.all(`
                SELECT 
                    substr(date_key, 1, 7) as month,
                    COUNT(*) as total_rows,
                    SUM(CASE WHEN type = 'available' AND value != '1' THEN 1 ELSE 0 END) as available_not_1,
                    SUM(CASE WHEN type = 'activity' AND value != '1' THEN 1 ELSE 0 END) as activity_not_1,
                    GROUP_CONCAT(DISTINCT type || '=' || value) as unique_values
                FROM schedule_data
                GROUP BY substr(date_key, 1, 7)
                ORDER BY month
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Récupérer quelques exemples de données pour chaque mois
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        
        const monthsWithDetails = await Promise.all(allMonthsData.map(async (m) => {
            // Récupérer des exemples de données non-vides pour ce mois
            const samples = await new Promise((resolve, reject) => {
                database.all(`
                    SELECT date_key, type, value, resource_id
                    FROM schedule_data 
                    WHERE substr(date_key, 1, 7) = ?
                      AND ((type = 'available' AND value != '1') OR (type = 'activity' AND value != '1'))
                    LIMIT 5
                `, [m.month], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            // Parser le mois pour l'affichage
            let label = m.month;
            if (m.month) {
                const cleanMonth = m.month.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                if (parts.length >= 2) {
                    const year = parts[0];
                    const month = parseInt(parts[1]);
                    if (!isNaN(month) && month >= 1 && month <= 12) {
                        label = `${monthNames[month - 1]} ${year}`;
                    }
                }
            }
            
            return {
                raw: m.month,
                label: label,
                totalRows: m.total_rows,
                availableNot1: m.available_not_1,
                activityNot1: m.activity_not_1,
                uniqueValues: m.unique_values,
                samples: samples.map(s => `${s.date_key}: ${s.type}=${s.value} (res:${s.resource_id})`).join(', ')
            };
        }));
        
        // Chercher des données avec des date_key mal formatées
        const orphanData = await new Promise((resolve, reject) => {
            database.all(`
                SELECT DISTINCT date_key, type, value
                FROM schedule_data 
                WHERE date_key NOT LIKE '____-__-__%'
                LIMIT 20
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        res.json({ 
            success: true, 
            months: monthsWithDetails,
            orphanData: orphanData
        });
    } catch (error) {
        console.error('Erreur diagnostic mois:', error);
        res.status(500).json({ error: error.message });
    }
});

// Prévisualisation du nettoyage des dates (sans modification)
app.post('/api/automation/cleanup-dates-preview', requireAdmin, async (req, res) => {
    try {
        console.log('🔍 Prévisualisation du nettoyage des dates...');
        
        // 1. Trouver les données avec mois = 0 (à supprimer)
        const toDelete = await new Promise((resolve, reject) => {
            database.all(`
                SELECT date_key, type, value, resource_id 
                FROM schedule_data 
                WHERE date_key LIKE '%-0-%'
                ORDER BY date_key
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        console.log(`🗑️ Lignes à supprimer (mois=0): ${toDelete.length}`);
        
        // 2. Trouver les dates mal formatées (à normaliser)
        // Inclut: 2025-9-1, 2025-9-1_AM, 2026-2-18_AM, etc.
        const badDates = await new Promise((resolve, reject) => {
            database.all(`
                SELECT DISTINCT date_key, COUNT(*) as row_count
                FROM schedule_data 
                WHERE (
                    -- Format sans zéro pour le mois: 2025-9-XX ou 2026-2-XX
                    date_key GLOB '[0-9][0-9][0-9][0-9]-[0-9]-*'
                    -- Exclure les mois = 0
                    AND date_key NOT LIKE '%-0-%'
                )
                GROUP BY date_key
                ORDER BY date_key
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        console.log(`✏️ Dates mal formatées: ${badDates.length}`);
        
        // 3. Pour chaque date mal formatée, vérifier s'il y a conflit
        const toNormalize = [];
        let conflictCount = 0;
        
        for (const row of badDates) {
            const oldKey = row.date_key;
            
            // Parser la date - formats possibles:
            // 2025-9-1, 2025-9-1_AM, 2026-2-18_AM, 2026-2-18_PM
            const match = oldKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:_([AP]M))?$/);
            if (match) {
                const [, year, month, day, period] = match;
                const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                const newKey = period ? `${normalizedDate}_${period}` : `${normalizedDate}_AM`;
                
                // Vérifier si la nouvelle clé existe déjà
                const existingCount = await new Promise((resolve, reject) => {
                    database.get(`SELECT COUNT(*) as count FROM schedule_data WHERE date_key = ?`, [newKey], (err, row) => {
                        if (err) reject(err);
                        else resolve(row ? row.count : 0);
                    });
                });
                
                const hasConflict = existingCount > 0;
                if (hasConflict) conflictCount++;
                
                toNormalize.push({
                    oldKey,
                    newKey,
                    rowCount: row.row_count,
                    hasConflict,
                    existingCount
                });
            }
        }
        
        res.json({
            success: true,
            toDelete,
            toNormalize,
            conflictCount
        });
        
    } catch (error) {
        console.error('Erreur prévisualisation nettoyage:', error);
        res.status(500).json({ error: error.message });
    }
});

// Exécuter le nettoyage des dates (avec modification)
app.post('/api/automation/cleanup-dates-execute', requireAdmin, async (req, res) => {
    try {
        console.log('🧹 Exécution du nettoyage des dates...');
        
        let deleted = 0;
        let normalized = 0;
        let duplicatesRemoved = 0;
        
        // 1. Supprimer les données avec mois = 0
        const deleteResult = await new Promise((resolve, reject) => {
            database.run(`DELETE FROM schedule_data WHERE date_key LIKE '%-0-%'`, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
        deleted = deleteResult;
        console.log(`🗑️ Supprimé ${deleted} lignes avec mois=0`);
        
        // 2. Normaliser les dates mal formatées
        const badDates = await new Promise((resolve, reject) => {
            database.all(`
                SELECT DISTINCT date_key
                FROM schedule_data 
                WHERE date_key GLOB '[0-9][0-9][0-9][0-9]-[0-9]-*'
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        for (const row of badDates) {
            const oldKey = row.date_key;
            
            // Parser la date - formats possibles:
            // 2025-9-1, 2025-9-1_AM, 2026-2-18_AM, 2026-2-18_PM
            const match = oldKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:_([AP]M))?$/);
            if (match) {
                const [, year, month, day, period] = match;
                const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                const newKey = period ? `${normalizedDate}_${period}` : `${normalizedDate}_AM`;
                
                // Vérifier si la nouvelle clé existe déjà
                const existingCount = await new Promise((resolve, reject) => {
                    database.get(`SELECT COUNT(*) as count FROM schedule_data WHERE date_key = ?`, [newKey], (err, row) => {
                        if (err) reject(err);
                        else resolve(row ? row.count : 0);
                    });
                });
                
                if (existingCount === 0) {
                    // Pas de conflit : renommer
                    await new Promise((resolve, reject) => {
                        database.run(`UPDATE schedule_data SET date_key = ? WHERE date_key = ?`, [newKey, oldKey], function(err) {
                            if (err) reject(err);
                            else resolve(this.changes);
                        });
                    });
                    normalized++;
                    console.log(`✏️ Renommé: ${oldKey} → ${newKey}`);
                } else {
                    // Conflit : supprimer l'ancien (doublon)
                    const deletedDup = await new Promise((resolve, reject) => {
                        database.run(`DELETE FROM schedule_data WHERE date_key = ?`, [oldKey], function(err) {
                            if (err) reject(err);
                            else resolve(this.changes);
                        });
                    });
                    duplicatesRemoved += deletedDup;
                    console.log(`🗑️ Doublon supprimé: ${oldKey} (${deletedDup} lignes)`);
                }
            }
        }
        
        // Logger l'action
        logUserAction(req, 'Nettoyage dates invalides exécuté', { deleted, normalized, duplicatesRemoved });
        
        console.log(`✅ Nettoyage terminé: ${deleted} supprimés, ${normalized} normalisés, ${duplicatesRemoved} doublons supprimés`);
        
        res.json({
            success: true,
            deleted,
            normalized,
            duplicatesRemoved
        });
        
    } catch (error) {
        console.error('Erreur exécution nettoyage:', error);
        res.status(500).json({ error: error.message });
    }
});

// Prévisualisation de l'automatisation 2
app.post('/api/automation/preview/2', requireAdmin, async (req, res) => {
    console.log('👁️ PREVIEW/2 APPELÉ - Affichage du récapitulatif (pas d\'envoi)');
    console.log('👁️ Body reçu:', JSON.stringify(req.body, null, 2));
    const { groupAdmin, groupUser, groupExpert, recipients, allMonths, selectedMonths, allExperts, expertsList, excludeEmpty, format } = req.body;
    
    try {
        // Construire la liste des destinataires
        let recipientIds = []; // Pour éviter les doublons d'utilisateurs
        let recipientEmails = []; // Les emails uniques pour l'envoi
        let recipientNames = []; // Les noms pour l'affichage
        
        // Groupes
        if (groupAdmin) {
            const admins = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE is_admin = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            admins.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Admin)`);
                }
            });
        }
        
        if (groupUser) {
            const users = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE is_user = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            users.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Utilisateur)`);
                }
            });
        }
        
        if (groupExpert) {
            const expertsUsers = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE is_expert = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            expertsUsers.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Expert)`);
                }
            });
        }
        
        // Destinataires individuels
        if (recipients && recipients.length > 0) {
            console.log('📧 Recipients individuels reçus:', recipients);
            const individualUsers = await new Promise((resolve, reject) => {
                const query = `SELECT id, nom, prenom, email FROM users WHERE id IN (${recipients.join(',')}) AND email IS NOT NULL AND email != ''`;
                database.all(query, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            individualUsers.forEach(u => {
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom} (Individuel)`);
                }
            });
        }
        
        console.log('📧 Total destinataires:', recipientNames.length, 'personnes,', recipientEmails.length, 'emails uniques');
        console.log('📧 Liste:', recipientNames);
        
        // Compter les experts selon la sélection
        let expertsCount = 0;
        let expertsNamesList = [];
        
        if (allExperts) {
            const resourcesData = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom FROM resources ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            expertsCount = resourcesData.length;
            expertsNamesList = resourcesData.map(r => `${r.prenom} ${r.nom}`);
        } else if (expertsList && expertsList.length > 0) {
            const resourcesData = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom FROM resources WHERE id IN (${expertsList.join(',')}) ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            expertsCount = resourcesData.length;
            expertsNamesList = resourcesData.map(r => `${r.prenom} ${r.nom}`);
        }
        
        // Déterminer les mois à inclure
        let monthsLabel = '';
        if (allMonths) {
            // Récupérer tous les mois distincts où il y a des données NON vides
            const monthsData = await new Promise((resolve, reject) => {
                database.all(`
                    SELECT DISTINCT substr(date_key, 1, 7) as month 
                    FROM schedule_data 
                    WHERE (type = 'available' AND value != '1')
                       OR (type = 'activity' AND value != '1')
                `, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            // Filtrer et compter les mois valides
            const validMonths = monthsData
                .map(row => {
                    let monthStr = row.month;
                    if (!monthStr) return null;
                    monthStr = monthStr.replace(/-$/, '');
                    const parts = monthStr.split('-');
                    if (parts.length < 2) return null;
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
                    return `${year}-${String(month).padStart(2, '0')}`;
                })
                .filter(m => m !== null)
                .filter((value, index, self) => self.indexOf(value) === index);
            
            monthsLabel = validMonths.length > 0 ? `Toutes les données (${validMonths.length} mois)` : 'Toutes les données';
        } else if (selectedMonths && selectedMonths.length > 0) {
            // selectedMonths contient des valeurs comme "2025-01" ou "2025-09"
            const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
            const monthsLabels = selectedMonths.map(monthStr => {
                // Nettoyer et parser le mois
                const cleanMonth = monthStr.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                const year = parts[0];
                const month = parseInt(parts[1]);
                if (isNaN(month) || month < 1 || month > 12) return monthStr;
                return `${monthNames[month - 1]} ${year}`;
            });
            monthsLabel = monthsLabels.join(', ');
        } else {
            monthsLabel = 'Aucun mois sélectionné';
        }
        
        // Générer le nom du fichier
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `Expert_Planning_Sauvegarde_de_${timestamp}.${format}`;
        
        console.log('👁️ Preview/2 réponse:', {
            recipientsCount: recipientNames.length,
            emailsCount: recipientEmails.length,
            expertsCount,
            monthsLabel,
            filename
        });
        
        res.json({
            success: true,
            recipientsCount: recipientNames.length, // Nombre de personnes
            emailsCount: recipientEmails.length, // Nombre d'emails uniques
            recipientsList: recipientNames,
            expertsCount,
            expertsNamesList,
            monthsLabel,
            excludeEmpty: excludeEmpty !== false,
            filename
        });
        
    } catch (error) {
        console.error('❌ Erreur preview automation 2:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// Envoyer la sauvegarde du planning (automatisation 2)
app.post('/api/automation/send/2', requireAdmin, async (req, res) => {
    console.log('🚨 SEND/2 APPELÉ - Vérifiez que vous avez cliqué sur Confirmer et envoyer !');
    const { groupAdmin, groupUser, groupExpert, recipients, allMonths, selectedMonths, allExperts, expertsList, excludeEmpty, format } = req.body;
    
    try {
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(500).json({ error: 'Configuration email non disponible' });
        }
        
        // Construire la liste des destinataires
        let recipientIds = []; // Pour éviter les doublons d'utilisateurs
        let recipientEmails = []; // Les emails uniques pour l'envoi
        let recipientNames = []; // Les noms pour l'affichage
        
        if (groupAdmin) {
            const admins = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE is_admin = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            admins.forEach(u => { 
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }
        
        if (groupUser) {
            const usersData = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE is_user = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            usersData.forEach(u => { 
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }
        
        if (groupExpert) {
            const expertsUsers = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE is_expert = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            expertsUsers.forEach(u => { 
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }
        
        if (recipients && recipients.length > 0) {
            const individualUsers = await new Promise((resolve, reject) => {
                database.all(`SELECT id, nom, prenom, email FROM users WHERE id IN (${recipients.join(',')}) AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            individualUsers.forEach(u => { 
                if (!recipientIds.includes(u.id)) {
                    recipientIds.push(u.id);
                    if (!recipientEmails.includes(u.email)) {
                        recipientEmails.push(u.email);
                    }
                    recipientNames.push(`${u.prenom} ${u.nom}`);
                }
            });
        }
        
        if (recipientEmails.length === 0) {
            return res.status(400).json({ error: 'Aucun destinataire' });
        }
        
        console.log(`📧 Envoi à ${recipientNames.length} personnes (${recipientEmails.length} emails uniques)`);
        
        // Récupérer les ressources selon la sélection
        let resourcesList = [];
        if (allExperts) {
            resourcesList = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM resources ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
        } else if (expertsList && expertsList.length > 0) {
            resourcesList = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM resources WHERE id IN (${expertsList.join(',')}) ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
        }
        
        const now = new Date();
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        let monthsLabels = [];
        let scheduleData = [];
        
        console.log('📊 Config send/2:', { allMonths, selectedMonths, allExperts, expertsList: expertsList?.length, excludeEmpty });
        
        if (allMonths) {
            // Récupérer TOUTES les données de schedule_data
            scheduleData = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM schedule_data ORDER BY resource_id, date_key`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            monthsLabels = ['Toutes les données'];
            console.log(`📊 Toutes les données: ${scheduleData.length} lignes`);
        } else if (selectedMonths && selectedMonths.length > 0) {
            // selectedMonths contient des valeurs comme "2025-01" ou "2025-09"
            let allPatterns = [];
            selectedMonths.forEach(monthStr => {
                // Nettoyer le mois et créer les patterns
                const cleanMonth = monthStr.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                const year = parts[0];
                const month = parseInt(parts[1]);
                
                if (!isNaN(month) && month >= 1 && month <= 12) {
                    // Créer deux patterns pour gérer les deux formats possibles dans la DB
                    // Format avec zéro: "2025-09-%"
                    const patternWithZero = `${year}-${String(month).padStart(2, '0')}-%`;
                    // Format sans zéro: "2025-9-%"
                    const patternWithoutZero = `${year}-${month}-%`;
                    
                    allPatterns.push(patternWithZero);
                    if (patternWithZero !== patternWithoutZero) {
                        allPatterns.push(patternWithoutZero);
                    }
                    
                    monthsLabels.push(`${monthNames[month - 1]} ${year}`);
                }
            });
            
            if (allPatterns.length === 0) {
                console.log('📊 Aucun pattern valide!');
                return res.status(400).json({ error: 'Format de mois invalide' });
            }
            
            const likeConditions = allPatterns.map(() => `date_key LIKE ?`).join(' OR ');
            console.log('📊 Requête mois:', likeConditions, allPatterns);
            
            scheduleData = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT * FROM schedule_data WHERE ${likeConditions} ORDER BY resource_id, date_key`,
                    allPatterns,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });
            console.log(`📊 Mois sélectionnés: ${scheduleData.length} lignes`);
        } else {
            console.log('📊 Aucun mois sélectionné!');
            return res.status(400).json({ error: 'Aucun mois sélectionné' });
        }
        
        // Organiser les données par ressource et date
        const dataByResource = {};
        scheduleData.forEach(row => {
            if (!dataByResource[row.resource_id]) {
                dataByResource[row.resource_id] = {};
            }
            if (!dataByResource[row.resource_id][row.date_key]) {
                dataByResource[row.resource_id][row.date_key] = {};
            }
            dataByResource[row.resource_id][row.date_key][row.type] = row.value;
        });
        
        // Générer le fichier CSV
        const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `Expert_Planning_Sauvegarde_de_${timestamp}.${format}`;
        
        const availLabels = { '1': 'Indisponible', '2': 'Disponible', '3': 'Congés' };
        const actLabels = { '1': 'Indisponible', '2': 'En attente', '3': 'SAMU Déploiement', '4': 'SAMU Dev', '5': 'ANS Déploiement', '6': 'ANS Dev', '7': 'Qualification', '8': 'Divers' };
        
        let csvContent = '\ufeff'; // BOM UTF-8
        csvContent += 'Expert,Date,Période,Disponibilité,Affectation,Localisation\n';
        
        // Récupérer toutes les date_key uniques (format: 2025-01-15_AM)
        const allDateKeys = new Set();
        Object.values(dataByResource).forEach(resData => {
            Object.keys(resData).forEach(dateKey => allDateKeys.add(dateKey));
        });
        const sortedDateKeys = Array.from(allDateKeys).sort();
        
        resourcesList.forEach(resource => {
            const resData = dataByResource[resource.id] || {};
            
            sortedDateKeys.forEach(dateKey => {
                // dateKey est au format "2025-01-15_AM"
                const data = resData[dateKey] || {};
                
                // Extraire la date et la période
                const parts = dateKey.split('_');
                const datePart = parts[0]; // "2025-01-15"
                const period = parts[1] || 'AM'; // "AM" ou "PM"
                
                const avail = data.available || '1';
                const act = data.activity || '1';
                const loc = data.localisation || '-';
                
                // Exclure les lignes vides si l'option est cochée (1-1 = Indisponible-Indisponible)
                const isEmpty = avail === '1' && act === '1';
                const shouldExclude = excludeEmpty && isEmpty;
                
                if (!shouldExclude) {
                    csvContent += `"${resource.prenom} ${resource.nom}","${datePart}","${period}","${availLabels[avail] || avail}","${actLabels[act] || act}","${loc}"\n`;
                }
            });
        });
        
        // Envoyer l'email avec pièce jointe
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: recipientEmails.join(', '),
            subject: `📊 Sauvegarde du planning - ${monthsLabels.join(', ')}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #e65100; border-bottom: 2px solid #ff9800; padding-bottom: 10px;">
                            📊 Sauvegarde automatique du planning
                        </h2>
                        
                        <p>Bonjour,</p>
                        
                        <p>Veuillez trouver ci-joint la sauvegarde du planning${allMonths ? ' (toutes les données)' : ' pour les mois suivants :'}</p>
                        
                        ${!allMonths ? `<ul>${monthsLabels.map(m => `<li>${m}</li>`).join('')}</ul>` : ''}
                        
                        <div style="margin: 20px 0; padding: 15px; background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
                            <p style="margin: 0;"><strong>Informations :</strong></p>
                            <p style="margin: 5px 0 0 0;">
                                • ${resourcesList.length} expert(s) inclus<br>
                                • Format : ${format.toUpperCase()}<br>
                                ${excludeEmpty ? '• Lignes vides exclues<br>' : ''}
                                • Date de génération : ${new Date().toLocaleString('fr-FR')}
                            </p>
                        </div>
                        
                        <p>Cordialement,<br>Système de planification SI-SAMU</p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                            Cet email a été envoyé automatiquement depuis le système SI-SAMU de planification des ressources.
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: filename,
                    content: csvContent,
                    contentType: 'text/csv; charset=utf-8'
                }
            ]
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`✅ Sauvegarde planning envoyée à ${recipientEmails.length} destinataire(s)`);
        
        // Enregistrer dans les logs avec le contenu du fichier et la liste des destinataires
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at, recipients_list, file_content, filename)
             VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
            [2, `${recipientNames.length} personnes`, recipientEmails.join(', '), monthsLabels.join(', '), JSON.stringify(recipientNames), csvContent, filename]
        );
        
        res.json({ 
            success: true, 
            sent: recipientNames.length, // Nombre de personnes
            emailsSent: recipientEmails.length, // Nombre d'emails uniques
            failed: 0 
        });
        
    } catch (error) {
        console.error('Erreur envoi automation 2:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== FIN AUTOMATISATION N°2 ==========

// ========== REPORTING ==========

// Endpoint pour le rapport de disponibilités/affectations
app.post('/api/reporting/availability', requireReportingAccess, async (req, res) => {
    try {
        const { startMonth, startYear, endMonth, endYear, expertIds, includeLeave } = req.body;
        
        console.log('📊 Génération rapport:', { startMonth, startYear, endMonth, endYear, expertIds: expertIds?.length, includeLeave });
        
        // Vérification de sécurité
        if (!expertIds || !Array.isArray(expertIds) || expertIds.length === 0) {
            return res.status(400).json({ error: 'Aucun expert sélectionné' });
        }
        
        // Générer la liste des mois (avec protection contre boucle infinie)
        const months = [];
        let currentDate = new Date(startYear, startMonth, 1);
        const endDate = new Date(endYear, endMonth + 1, 0);
        const maxMonths = 60; // Maximum 5 ans
        
        while (currentDate <= endDate && months.length < maxMonths) {
            months.push({
                year: currentDate.getFullYear(),
                month: currentDate.getMonth()
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        if (months.length === 0) {
            return res.status(400).json({ error: 'Période invalide' });
        }
        
        // Récupérer les experts sélectionnés
        const placeholders = expertIds.map(() => '?').join(',');
        const experts = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM resources WHERE id IN (${placeholders}) ORDER BY nom, prenom`,
                expertIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        // Calculer le nombre moyen de jours ouvrés par mois (sur la période)
        let totalWorkingDays = 0;
        for (const month of months) {
            const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(month.year, month.month, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    totalWorkingDays++;
                }
            }
        }
        const avgWorkingDaysPerMonth = months.length > 0 ? totalWorkingDays / months.length : 22;
        
        // Pour chaque expert, calculer les stats mensuelles
        const expertsWithStats = await Promise.all(experts.map(async (expert) => {
            const monthlyStats = {};
            
            for (const month of months) {
                const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
                
                // Calculer le nombre de jours ouvrés dans le mois
                const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
                let workingDays = 0;
                let leaveDays = 0;
                
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(month.year, month.month, day);
                    const dayOfWeek = date.getDay();
                    // Exclure samedi (6) et dimanche (0)
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        workingDays++;
                    }
                }
                
                // Récupérer les données de disponibilité et d'affectation pour ce mois
                // Chercher avec les deux formats possibles: 2025-12-% et 2025-12-%
                const monthPattern1 = `${monthKey}-%`;
                const monthPattern2 = `${month.year}-${month.month + 1}-%`; // Format sans zéro
                
                const scheduleData = await new Promise((resolve, reject) => {
                    database.all(
                        `SELECT date_key, type, value FROM schedule_data 
                         WHERE resource_id = ? AND (date_key LIKE ? OR date_key LIKE ?)`,
                        [expert.id, monthPattern1, monthPattern2],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });
                
                // Organiser les données par date et période
                // Gérer les formats: 2025-12-15_AM, 2025-12-15_PM, 2025-12-15 (ancien format = journée complète)
                const dataByDatePeriod = {};
                scheduleData.forEach(row => {
                    let dateKey = row.date_key;
                    
                    // Si le format n'a pas _AM ou _PM, c'est l'ancien format (journée complète)
                    // On le compte comme AM et PM
                    if (!dateKey.includes('_AM') && !dateKey.includes('_PM')) {
                        // Normaliser la date d'abord (ex: 2025-9-15 -> 2025-09-15)
                        const parts = dateKey.split('-');
                        if (parts.length >= 3) {
                            const normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                            // Ajouter pour AM
                            const amKey = `${normalizedDate}_AM`;
                            if (!dataByDatePeriod[amKey]) dataByDatePeriod[amKey] = {};
                            dataByDatePeriod[amKey][row.type] = row.value;
                            // Ajouter pour PM
                            const pmKey = `${normalizedDate}_PM`;
                            if (!dataByDatePeriod[pmKey]) dataByDatePeriod[pmKey] = {};
                            dataByDatePeriod[pmKey][row.type] = row.value;
                        }
                    } else {
                        // Format moderne avec _AM ou _PM
                        // Normaliser la partie date si nécessaire
                        const [datePart, period] = dateKey.split('_');
                        const parts = datePart.split('-');
                        if (parts.length >= 3) {
                            const normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                            const normalizedKey = `${normalizedDate}_${period}`;
                            if (!dataByDatePeriod[normalizedKey]) dataByDatePeriod[normalizedKey] = {};
                            dataByDatePeriod[normalizedKey][row.type] = row.value;
                        }
                    }
                });
                
                // Compter les jours disponibles, affectés et congés
                // Disponible = disponibilité = "2"
                // Affecté = activité = "3", "4", "5", "6", "7" ou "8"
                // Congés = disponibilité = "3"
                let availableDays = 0;
                let assignedDays = 0;
                
                // Parcourir toutes les demi-journées du mois (y compris week-ends)
                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    
                    // Vérifier AM
                    const amKey = `${dateStr}_AM`;
                    const amData = dataByDatePeriod[amKey] || {};
                    
                    // Disponible = valeur 2
                    if (amData.available === '2') {
                        availableDays += 0.5;
                    }
                    // Congés = valeur 3
                    if (amData.available === '3') {
                        leaveDays += 0.5;
                    }
                    // Affecté = activité 3, 4, 5, 6, 7 ou 8
                    const amActivity = amData.activity;
                    if (amActivity && ['3', '4', '5', '6', '7', '8'].includes(amActivity)) {
                        assignedDays += 0.5;
                    }
                    
                    // Vérifier PM
                    const pmKey = `${dateStr}_PM`;
                    const pmData = dataByDatePeriod[pmKey] || {};
                    
                    if (pmData.available === '2') {
                        availableDays += 0.5;
                    }
                    if (pmData.available === '3') {
                        leaveDays += 0.5;
                    }
                    const pmActivity = pmData.activity;
                    if (pmActivity && ['3', '4', '5', '6', '7', '8'].includes(pmActivity)) {
                        assignedDays += 0.5;
                    }
                }
                
                // Calculer le taux : Affecté / Disponible
                // Si "Prendre en compte les congés" est coché, on ajuste le taux
                // mais on affiche toujours les vrais chiffres bruts
                let effectiveAvailable = availableDays;
                let rateBase = availableDays;
                
                if (includeLeave && leaveDays > 0) {
                    // Le taux est calculé sur la capacité réelle (disponible - congés ne fait pas sens car congés != disponible)
                    // En fait, on garde availableDays tel quel car les congés sont déjà exclus de availableDays
                    // (available=3 n'est pas compté dans availableDays)
                    rateBase = availableDays;
                }
                
                // Calculer le taux : Affecté / Disponible
                const rate = rateBase > 0 ? (assignedDays / rateBase) * 100 : 0;
                
                monthlyStats[monthKey] = {
                    workingDays,
                    available: Math.round(availableDays * 10) / 10,
                    assigned: Math.round(assignedDays * 10) / 10,
                    leave: Math.round(leaveDays * 10) / 10,
                    rate: Math.round(rate * 10) / 10
                };
            }
            
            return {
                id: expert.id,
                name: `${expert.prenom} ${expert.nom}`,
                tauxMad: expert.taux || 100,
                avgWorkingDaysPerMonth: Math.round(avgWorkingDaysPerMonth * 10) / 10,
                monthlyStats
            };
        }));
        
        res.json({
            success: true,
            months,
            experts: expertsWithStats
        });
        
    } catch (error) {
        console.error('Erreur génération rapport:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint de diagnostic pour voir les données brutes d'un expert sur un mois
app.get('/api/reporting/diagnose/:expertId/:year/:month', requireReportingAccess, async (req, res) => {
    try {
        const { expertId, year, month } = req.params;
        const monthKey = `${year}-${String(parseInt(month)).padStart(2, '0')}`;
        const monthPattern1 = `${monthKey}-%`;
        const monthPattern2 = `${year}-${parseInt(month)}-%`; // Format sans zéro
        
        // Récupérer toutes les données brutes
        const rawData = await new Promise((resolve, reject) => {
            database.all(
                `SELECT date_key, type, value FROM schedule_data 
                 WHERE resource_id = ? AND (date_key LIKE ? OR date_key LIKE ?)
                 ORDER BY date_key, type`,
                [expertId, monthPattern1, monthPattern2],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        // Compter
        let availableCount = 0;
        let assignedCount = 0;
        let leaveCount = 0;
        
        rawData.forEach(row => {
            if (row.type === 'available' && row.value === '2') availableCount++;
            if (row.type === 'available' && row.value === '3') leaveCount++;
            if (row.type === 'activity' && ['3','4','5','6','7','8'].includes(row.value)) assignedCount++;
        });
        
        res.json({
            success: true,
            expertId,
            monthKey,
            patterns: [monthPattern1, monthPattern2],
            totalRows: rawData.length,
            summary: {
                availableSlots: availableCount,
                assignedSlots: assignedCount,
                leaveSlots: leaveCount,
                availableDays: availableCount / 2,
                assignedDays: assignedCount / 2,
                leaveDays: leaveCount / 2
            },
            rawData: rawData.slice(0, 100) // Limiter à 100 lignes
        });
        
    } catch (error) {
        console.error('Erreur diagnostic reporting:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== FIN REPORTING ==========

// ========== GESTION DES FICHIERS ICS ==========

// Créer les tables pour les fichiers ICS si elles n'existent pas
database.serialize(() => {
    database.run(`
        CREATE TABLE IF NOT EXISTS ics_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            filename TEXT NOT NULL,
            content TEXT,
            config TEXT,
            imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (!err) console.log('✅ Table ics_files créée ou existante');
    });
    
    database.run(`
        CREATE TABLE IF NOT EXISTS ics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            event_date TEXT NOT NULL,
            event_end_date TEXT,
            summary TEXT,
            zone TEXT,
            FOREIGN KEY (file_id) REFERENCES ics_files(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (!err) console.log('✅ Table ics_events créée ou existante');
    });
});

// Lister les fichiers de congés scolaires
app.get('/api/ics-files/school-holidays', requireAdmin, async (req, res) => {
    try {
        const files = await new Promise((resolve, reject) => {
            database.all(`
                SELECT f.id, f.filename, f.imported_at,
                       (SELECT COUNT(*) FROM ics_events WHERE file_id = f.id) as periods_count
                FROM ics_files f
                WHERE f.type = 'school-holidays'
                ORDER BY f.imported_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        res.json({ files });
    } catch (error) {
        console.error('Erreur liste fichiers congés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Importer un fichier de congés scolaires
app.post('/api/ics-files/school-holidays', requireAdmin, async (req, res) => {
    try {
        const { filename, content, zoneA, zoneB, zoneC } = req.body;
        
        // Insérer le fichier
        const fileId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO ics_files (type, filename, content) VALUES (?, ?, ?)`,
                ['school-holidays', filename, content],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Insérer les événements
        const insertEvent = (event, zone) => {
            return new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO ics_events (file_id, event_date, event_end_date, summary, zone) VALUES (?, ?, ?, ?, ?)`,
                    [fileId, event.start, event.end, event.summary, zone],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        };
        
        for (const event of zoneA) await insertEvent(event, 'zoneA');
        for (const event of zoneB) await insertEvent(event, 'zoneB');
        for (const event of zoneC) await insertEvent(event, 'zoneC');
        
        res.json({ success: true, fileId });
    } catch (error) {
        console.error('Erreur import fichier congés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un fichier de congés scolaires
app.delete('/api/ics-files/school-holidays/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_events WHERE file_id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_files WHERE id = ? AND type = 'school-holidays'`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression fichier congés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Récupérer toutes les périodes de congés scolaires (tous les fichiers combinés)
app.get('/api/ics-files/school-holidays/all-periods', requireAuth, async (req, res) => {
    try {
        const events = await new Promise((resolve, reject) => {
            database.all(`
                SELECT event_date, event_end_date, summary, zone
                FROM ics_events e
                JOIN ics_files f ON e.file_id = f.id
                WHERE f.type = 'school-holidays'
                ORDER BY event_date
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        const periods = { zoneA: [], zoneB: [], zoneC: [] };
        events.forEach(e => {
            if (periods[e.zone]) {
                periods[e.zone].push({ start: e.event_date, end: e.event_end_date, name: e.summary });
            }
        });
        
        res.json({ periods });
    } catch (error) {
        console.error('Erreur récupération périodes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Lister les fichiers de dates particulières
app.get('/api/ics-files/special-dates', requireAdmin, async (req, res) => {
    try {
        const files = await new Promise((resolve, reject) => {
            database.all(`
                SELECT f.id, f.filename, f.config, f.imported_at,
                       (SELECT COUNT(*) FROM ics_events WHERE file_id = f.id) as dates_count
                FROM ics_files f
                WHERE f.type = 'special-dates'
                ORDER BY f.imported_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Parser la config JSON
        files.forEach(f => {
            try {
                f.config = f.config ? JSON.parse(f.config) : {};
            } catch (e) {
                f.config = {};
            }
        });
        
        res.json({ files });
    } catch (error) {
        console.error('Erreur liste fichiers dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// Importer un fichier de dates particulières
app.post('/api/ics-files/special-dates', requireAdmin, async (req, res) => {
    try {
        const { filename, content, events, config } = req.body;
        
        console.log(`📅 Import special-dates: ${filename}, ${events ? events.length : 0} événements`);
        
        // Filtrer les événements sans date
        const validEvents = (events || []).filter(e => e && e.start);
        console.log(`📅 Événements valides: ${validEvents.length}`);
        
        if (validEvents.length === 0) {
            return res.status(400).json({ error: 'Aucun événement valide trouvé dans le fichier' });
        }
        
        // Insérer le fichier
        const fileId = await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO ics_files (type, filename, content, config) VALUES (?, ?, ?, ?)`,
                ['special-dates', filename, content, JSON.stringify(config)],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Insérer les événements
        for (const event of validEvents) {
            await new Promise((resolve, reject) => {
                database.run(
                    `INSERT INTO ics_events (file_id, event_date, event_end_date, summary) VALUES (?, ?, ?, ?)`,
                    [fileId, event.start, event.end || event.start, event.summary || 'Événement'],
                    (err) => {
                        if (err) {
                            console.error('Erreur insertion événement:', err, event);
                            reject(err);
                        }
                        else resolve();
                    }
                );
            });
        }
        
        console.log(`📅 Import réussi: ${validEvents.length} événements insérés`);
        res.json({ success: true, fileId, count: validEvents.length });
    } catch (error) {
        console.error('Erreur import fichier dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier la config d'un fichier de dates particulières
app.put('/api/ics-files/special-dates/:id/config', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;
        
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE ics_files SET config = ? WHERE id = ? AND type = 'special-dates'`,
                [JSON.stringify(config), id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un fichier de dates particulières
app.delete('/api/ics-files/special-dates/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_events WHERE file_id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM ics_files WHERE id = ? AND type = 'special-dates'`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression fichier dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// Récupérer toutes les dates particulières (pour l'affichage Gantt)
// Inclut les fichiers ICS ET les événements personnalisés
app.get('/api/ics-files/special-dates/all', requireAuth, async (req, res) => {
    try {
        const result = [];
        
        // 1. Récupérer les dates des fichiers ICS
        const files = await new Promise((resolve, reject) => {
            database.all(`
                SELECT f.id, f.config
                FROM ics_files f
                WHERE f.type = 'special-dates'
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        for (const file of files) {
            const config = file.config ? JSON.parse(file.config) : {};
            const events = await new Promise((resolve, reject) => {
                database.all(`
                    SELECT event_date, event_end_date, summary
                    FROM ics_events
                    WHERE file_id = ?
                `, [file.id], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            events.forEach(e => {
                result.push({
                    date: e.event_date,
                    endDate: e.event_end_date,
                    summary: e.summary,
                    config: config
                });
            });
        }
        
        // 2. Récupérer les événements personnalisés avec les infos du créateur
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all("PRAGMA table_info(custom_events)", (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });
        
        const hasCreatedBy = columns.some(col => col.name === 'created_by');
        
        let customEventsQuery;
        if (hasCreatedBy) {
            customEventsQuery = `
                SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom, r.trigramme as creator_trigramme
                FROM custom_events ce
                LEFT JOIN users u ON ce.created_by = u.id
                LEFT JOIN resources r ON u.resource_id = r.id
            `;
        } else {
            customEventsQuery = `SELECT * FROM custom_events`;
        }
        
        const customEvents = await new Promise((resolve, reject) => {
            database.all(customEventsQuery, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        customEvents.forEach(e => {
            const config = e.config ? JSON.parse(e.config) : {};
            // Ajouter le label dans le config pour l'affichage sur le Gantt
            config.label = e.label;
            config.eventId = e.id;
            result.push({
                date: e.start_date,
                endDate: e.end_date,
                summary: e.label,
                config: config
            });
        });
        
        // 3. Charger les participants pour les événements personnalisés
        const eventIds = customEvents.map(e => e.id);
        if (eventIds.length > 0) {
            const participants = await new Promise((resolve, reject) => {
                database.all(
                    `SELECT cep.event_id, u.nom, u.prenom
                     FROM custom_event_participants cep
                     JOIN users u ON cep.user_id = u.id
                     WHERE cep.event_id IN (${eventIds.map(() => '?').join(',')})
                     ORDER BY u.nom, u.prenom`,
                    eventIds,
                    (err, rows) => err ? reject(err) : resolve(rows || [])
                );
            });
            
            // Grouper par event_id
            const participantsByEvent = {};
            for (const p of participants) {
                if (!participantsByEvent[p.event_id]) participantsByEvent[p.event_id] = [];
                participantsByEvent[p.event_id].push(`${p.prenom || ''} ${(p.nom || '').toUpperCase()}`.trim());
            }
            
            // Injecter dans les résultats
            for (const r of result) {
                if (r.config && r.config.eventId && participantsByEvent[r.config.eventId]) {
                    r.config.participants = participantsByEvent[r.config.eventId];
                }
            }
        }
        
        console.log(`📅 Dates particulières chargées: ${result.length} (ICS + personnalisés)`);
        res.json({ dates: result });
    } catch (error) {
        console.error('Erreur récupération dates particulières:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== FIN GESTION DES FICHIERS ICS ==========

// ========== ÉVÉNEMENTS PERSONNALISÉS ==========

// Créer la table des événements personnalisés si elle n'existe pas
database.run(`
    CREATE TABLE IF NOT EXISTS custom_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        config TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error('Erreur création table custom_events:', err);
    } else {
        console.log('✅ Table custom_events créée ou existante');
    }
    
    // Migration: ajouter la colonne created_by si elle n'existe pas (toujours vérifier)
    database.all("PRAGMA table_info(custom_events)", (pragmaErr, columns) => {
        if (pragmaErr) {
            console.error('Erreur PRAGMA custom_events:', pragmaErr);
            return;
        }
        if (columns) {
            const createdByCol = columns.find(col => col.name === 'created_by');
            if (!createdByCol) {
                console.log('Migration: Ajout colonne created_by à custom_events...');
                database.run(`ALTER TABLE custom_events ADD COLUMN created_by INTEGER`, (alterErr) => {
                    if (alterErr) {
                        console.error('Erreur migration created_by:', alterErr);
                    } else {
                        console.log('✅ Migration terminée: created_by ajouté');
                    }
                });
            } else {
                console.log('✅ Colonne created_by déjà présente');
            }
        }
    });
});

// Table des participants aux événements personnalisés
database.run(`
    CREATE TABLE IF NOT EXISTS custom_event_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES custom_events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(event_id, user_id)
    )
`, (err) => {
    if (err) console.error('Erreur création table custom_event_participants:', err);
    else console.log('✅ Table custom_event_participants créée ou existante');
});

// Lister tous les événements personnalisés (admin uniquement - pour l'administration)
app.get('/api/custom-events', requireAdmin, async (req, res) => {
    try {
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all("PRAGMA table_info(custom_events)", (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });
        
        const hasCreatedBy = columns.some(col => col.name === 'created_by');
        
        let query;
        if (hasCreatedBy) {
            query = `
                SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom, r.trigramme as creator_trigramme
                FROM custom_events ce
                LEFT JOIN users u ON ce.created_by = u.id
                LEFT JOIN resources r ON u.resource_id = r.id
                ORDER BY ce.start_date
            `;
        } else {
            query = `SELECT * FROM custom_events ORDER BY start_date`;
        }
        
        const events = await new Promise((resolve, reject) => {
            database.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Charger les participants pour chaque événement
        for (const event of events) {
            try {
                const participants = await new Promise((resolve, reject) => {
                    database.all(
                        `SELECT cep.user_id, u.nom, u.prenom, u.email, u.profile_photo
                         FROM custom_event_participants cep
                         JOIN users u ON cep.user_id = u.id
                         WHERE cep.event_id = ?
                         ORDER BY u.nom, u.prenom`,
                        [event.id],
                        (err, rows) => err ? reject(err) : resolve(rows || [])
                    );
                });
                event.participants = participants;
            } catch (e) {
                event.participants = [];
            }
        }
        
        res.json({ events });
    } catch (error) {
        console.error('Erreur liste événements personnalisés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Lister les événements personnalisés de l'utilisateur connecté (pour experts/utilisateurs)
app.get('/api/my-custom-events', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const isAdmin = req.session.activeProfile === 'admin';
        
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all("PRAGMA table_info(custom_events)", (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });
        
        const hasCreatedBy = columns.some(col => col.name === 'created_by');
        
        let query;
        let params;
        
        if (hasCreatedBy) {
            if (isAdmin) {
                // Admin voit tous les événements
                query = `
                    SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom, r.trigramme as creator_trigramme
                    FROM custom_events ce
                    LEFT JOIN users u ON ce.created_by = u.id
                    LEFT JOIN resources r ON u.resource_id = r.id
                    ORDER BY ce.start_date
                `;
                params = [];
            } else {
                // Les autres ne voient que leurs propres événements
                query = `
                    SELECT ce.*, u.nom as creator_nom, u.prenom as creator_prenom, r.trigramme as creator_trigramme
                    FROM custom_events ce
                    LEFT JOIN users u ON ce.created_by = u.id
                    LEFT JOIN resources r ON u.resource_id = r.id
                    WHERE ce.created_by = ?
                    ORDER BY ce.start_date
                `;
                params = [userId];
            }
        } else {
            // Pas de colonne created_by, tout le monde voit tous les événements
            query = `SELECT * FROM custom_events ORDER BY start_date`;
            params = [];
        }
        
        const events = await new Promise((resolve, reject) => {
            database.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Charger les participants pour chaque événement
        for (const event of events) {
            try {
                const participants = await new Promise((resolve, reject) => {
                    database.all(
                        `SELECT cep.user_id, u.nom, u.prenom, u.email, u.profile_photo
                         FROM custom_event_participants cep
                         JOIN users u ON cep.user_id = u.id
                         WHERE cep.event_id = ?
                         ORDER BY u.nom, u.prenom`,
                        [event.id],
                        (err, rows) => err ? reject(err) : resolve(rows || [])
                    );
                });
                event.participants = participants;
            } catch (e) {
                event.participants = [];
            }
        }
        
        res.json({ events, isAdmin });
    } catch (error) {
        console.error('Erreur liste mes événements personnalisés:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ajouter un événement personnalisé (admin via interface admin)
app.post('/api/custom-events', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, label, config, participants } = req.body;
        const createdBy = req.session.userId;
        
        if (!startDate || !label) {
            return res.status(400).json({ error: 'Date de début et libellé requis' });
        }
        
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all("PRAGMA table_info(custom_events)", (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });
        
        const hasCreatedBy = columns.some(col => col.name === 'created_by');
        
        const eventId = await new Promise((resolve, reject) => {
            if (hasCreatedBy) {
                database.run(
                    `INSERT INTO custom_events (label, start_date, end_date, config, created_by) VALUES (?, ?, ?, ?, ?)`,
                    [label, startDate, endDate || startDate, JSON.stringify(config), createdBy],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            } else {
                database.run(
                    `INSERT INTO custom_events (label, start_date, end_date, config) VALUES (?, ?, ?, ?)`,
                    [label, startDate, endDate || startDate, JSON.stringify(config)],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            }
        });
        
        // Sauvegarder les participants
        if (participants && Array.isArray(participants) && participants.length > 0) {
            for (const userId of participants) {
                try {
                    await new Promise((resolve, reject) => {
                        database.run(
                            `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                            [eventId, userId],
                            (err) => err ? reject(err) : resolve()
                        );
                    });
                } catch (e) {
                    console.error(`❌ Erreur ajout participant ${userId}:`, e.message);
                }
            }
            console.log(`✅ Événement personnalisé ajouté (ID: ${eventId}) avec ${participants.length} participant(s)`);
        } else {
            console.log(`✅ Événement personnalisé ajouté (ID: ${eventId})`);
        }
        
        res.json({ success: true, eventId });
    } catch (error) {
        console.error('Erreur ajout événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ajouter un événement personnalisé (utilisateurs/experts via pop-up planification)
app.post('/api/my-custom-events', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate, label, config, participants } = req.body;
        const createdBy = req.session.userId;
        
        if (!startDate || !label) {
            return res.status(400).json({ error: 'Date de début et libellé requis' });
        }
        
        // Vérifier si la colonne created_by existe
        const columns = await new Promise((resolve, reject) => {
            database.all("PRAGMA table_info(custom_events)", (err, cols) => {
                if (err) reject(err);
                else resolve(cols || []);
            });
        });
        
        const hasCreatedBy = columns.some(col => col.name === 'created_by');
        
        const eventId = await new Promise((resolve, reject) => {
            if (hasCreatedBy) {
                database.run(
                    `INSERT INTO custom_events (label, start_date, end_date, config, created_by) VALUES (?, ?, ?, ?, ?)`,
                    [label, startDate, endDate || startDate, JSON.stringify(config), createdBy],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            } else {
                database.run(
                    `INSERT INTO custom_events (label, start_date, end_date, config) VALUES (?, ?, ?, ?)`,
                    [label, startDate, endDate || startDate, JSON.stringify(config)],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            }
        });
        
        // Sauvegarder les participants
        if (participants && Array.isArray(participants) && participants.length > 0) {
            for (const userId of participants) {
                try {
                    await new Promise((resolve, reject) => {
                        database.run(
                            `INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                            [eventId, userId],
                            (err) => err ? reject(err) : resolve()
                        );
                    });
                } catch (e) {
                    console.error(`❌ Erreur ajout participant ${userId}:`, e.message);
                }
            }
        }
        
        // Envoyer notification Teams
        sendTeamsNotificationFromServer('evenement', {
            name: label,
            date: `${formatDateFR(startDate)}${endDate && endDate !== startDate ? ' au ' + formatDateFR(endDate) : ''}`,
            createdBy: `${req.session.prenom} ${req.session.nom}`
        });
        
        console.log(`✅ Mon événement personnalisé ajouté (ID: ${eventId}, ${participants?.length || 0} participant(s))`);
        res.json({ success: true, eventId });
    } catch (error) {
        console.error('Erreur ajout mon événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier un événement personnalisé (admin)
app.put('/api/custom-events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, label, config, createdBy, participants } = req.body;
        
        if (createdBy !== undefined) {
            await new Promise((resolve, reject) => {
                database.run(
                    `UPDATE custom_events SET label = ?, start_date = ?, end_date = ?, config = ?, created_by = ? WHERE id = ?`,
                    [label, startDate, endDate || startDate, JSON.stringify(config), createdBy, id],
                    (err) => err ? reject(err) : resolve()
                );
            });
        } else {
            await new Promise((resolve, reject) => {
                database.run(
                    `UPDATE custom_events SET label = ?, start_date = ?, end_date = ?, config = ? WHERE id = ?`,
                    [label, startDate, endDate || startDate, JSON.stringify(config), id],
                    (err) => err ? reject(err) : resolve()
                );
            });
        }
        
        // Mettre à jour les participants
        if (participants !== undefined) {
            await new Promise((resolve, reject) => {
                database.run(`DELETE FROM custom_event_participants WHERE event_id = ?`, [id],
                    (err) => err ? reject(err) : resolve());
            });
            if (Array.isArray(participants)) {
                for (const uid of participants) {
                    try {
                        await new Promise((resolve, reject) => {
                            database.run(`INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                                [id, uid], (err) => err ? reject(err) : resolve());
                        });
                    } catch (e) { /* ignore */ }
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier un événement personnalisé (utilisateur - seulement ses propres événements)
app.put('/api/my-custom-events/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, label, config, participants } = req.body;
        const userId = req.session.userId;
        const isAdmin = req.session.activeProfile === 'admin';
        
        // Vérifier que l'événement appartient à l'utilisateur (sauf admin)
        if (!isAdmin) {
            const event = await new Promise((resolve, reject) => {
                database.get(`SELECT created_by FROM custom_events WHERE id = ?`, [id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!event || event.created_by !== userId) {
                return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres événements' });
            }
        }
        
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE custom_events SET label = ?, start_date = ?, end_date = ?, config = ? WHERE id = ?`,
                [label, startDate, endDate || startDate, JSON.stringify(config), id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Mettre à jour les participants (supprimer puis ré-insérer)
        if (participants !== undefined) {
            await new Promise((resolve, reject) => {
                database.run(`DELETE FROM custom_event_participants WHERE event_id = ?`, [id],
                    (err) => err ? reject(err) : resolve());
            });
            
            if (Array.isArray(participants)) {
                for (const uid of participants) {
                    try {
                        await new Promise((resolve, reject) => {
                            database.run(`INSERT OR IGNORE INTO custom_event_participants (event_id, user_id) VALUES (?, ?)`,
                                [id, uid], (err) => err ? reject(err) : resolve());
                        });
                    } catch (e) { /* ignore duplicates */ }
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur modification mon événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un événement personnalisé (admin)
app.delete('/api/custom-events/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM custom_events WHERE id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// Supprimer un événement personnalisé (utilisateur - seulement ses propres événements)
app.delete('/api/my-custom-events/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.userId;
        const isAdmin = req.session.activeProfile === 'admin';
        
        // Vérifier que l'événement appartient à l'utilisateur (sauf admin)
        if (!isAdmin) {
            const event = await new Promise((resolve, reject) => {
                database.get(`SELECT created_by FROM custom_events WHERE id = ?`, [id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!event || event.created_by !== userId) {
                return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres événements' });
            }
        }
        
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM custom_events WHERE id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur suppression mon événement personnalisé:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== FIN ÉVÉNEMENTS PERSONNALISÉS ==========

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
    const debugMode = req.body.debug === true;
    const debugLogs = [];
    
    const addLog = (type, message) => {
        const timestamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
        debugLogs.push({ type, message, timestamp });
        console.log(`[${type}] ${message}`);
    };

    try {
        const { fromName, fromEmail, expertIds, subject, startDate, startPeriod, endDate, endPeriod, message } = req.body;

        addLog('info', '📧 Demande d\'affectation reçue');
        addLog('info', `   Expéditeur: ${fromName} <${fromEmail}>`);
        addLog('info', `   Expert IDs: ${JSON.stringify(expertIds)}`);

        if (!expertIds || expertIds.length === 0) {
            addLog('error', '❌ Aucun expert sélectionné');
            return res.status(400).json({ success: false, error: 'Aucun expert sélectionné', debugLogs });
        }

        if (!fromEmail) {
            addLog('error', '❌ Email expéditeur manquant');
            return res.status(400).json({ success: false, error: 'Email de l\'expéditeur manquant', debugLogs });
        }

        // Récupérer les informations des experts
        addLog('db', '🔍 Requête DB: Recherche des experts...');
        const dbStartTime = Date.now();
        
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
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        addLog('db', `✅ Requête DB terminée en ${Date.now() - dbStartTime}ms`);
        addLog('db', `   Experts trouvés: ${experts.length}`);
        experts.forEach(e => {
            addLog('db', `   - ${e.prenom} ${e.nom}: ${e.email || '(pas d\'email)'}`);
        });

        if (experts.length === 0) {
            addLog('error', '❌ Aucun expert trouvé dans la base');
            return res.status(404).json({ success: false, error: 'Aucun expert trouvé', debugLogs });
        }

        const expertsWithEmail = experts.filter(e => e.email && e.email.trim() !== '');
        const expertsWithoutEmail = experts.filter(e => !e.email || e.email.trim() === '');

        if (expertsWithoutEmail.length > 0) {
            addLog('warning', `⚠️ ${expertsWithoutEmail.length} expert(s) sans email: ${expertsWithoutEmail.map(e => `${e.prenom} ${e.nom}`).join(', ')}`);
        }

        if (expertsWithEmail.length === 0) {
            addLog('error', '❌ Aucun expert avec email configuré');
            return res.status(400).json({ 
                success: false, 
                error: 'Aucun des experts sélectionnés n\'a d\'adresse email configurée.',
                debugLogs
            });
        }

        // Vérifier le transporteur email
        addLog('email', '📧 Vérification configuration SMTP...');
        addLog('email', `   Host: ${emailConfig.host}`);
        addLog('email', `   Port: ${emailConfig.port}`);
        addLog('email', `   Secure: ${emailConfig.secure}`);
        addLog('email', `   User: ${emailConfig.user}`);
        
        const transporter = createEmailTransporter();
        
        if (!transporter) {
            addLog('error', '❌ Transporteur email non configuré');
            return res.status(500).json({ 
                success: false, 
                error: 'Configuration email non disponible.',
                debugLogs
            });
        }
        
        addLog('email', '✅ Transporteur email créé');

        // Formater les dates
        const formatDate = (dateStr) => {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        };
        const startDateFormatted = `${formatDate(startDate)} - ${startPeriod}`;
        const endDateFormatted = `${formatDate(endDate)} - ${endPeriod}`;

        // En mode debug, on attend l'envoi des emails pour retourner les logs complets
        if (debugMode) {
            addLog('email', '📤 Début envoi des emails (mode synchrone pour debug)...');
            
            const emailResults = [];
            
            for (const expert of expertsWithEmail) {
                const personalizedMessage = message.replace(/\[Prénom de l'utilisateur\]/g, expert.prenom);
                
                addLog('email', `📧 Envoi à ${expert.email} (${expert.prenom} ${expert.nom})...`);
                const emailStartTime = Date.now();

                const mailOptions = {
                    from: `"SI-SAMU Planning" <${emailConfig.user}>`,
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
                                    <a href="mailto:${fromEmail}?subject=${encodeURIComponent('Re: ' + subject)}" 
                                       style="display: inline-block; padding: 12px 30px; background-color: #27ae60; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                        📧 Répondre à ${fromName}
                                    </a>
                                </div>
                                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                                <p style="color: #7f8c8d; font-size: 12px; text-align: center; margin: 0;">
                                    Système SI-SAMU de planification des ressources
                                </p>
                            </div>
                        </div>
                    `
                };

                try {
                    const info = await transporter.sendMail(mailOptions);
                    const duration = Date.now() - emailStartTime;
                    addLog('success', `   ✅ Envoyé en ${duration}ms - MessageId: ${info.messageId}`);
                    addLog('success', `   Response: ${info.response || 'OK'}`);
                    emailResults.push({ email: expert.email, success: true });
                } catch (emailError) {
                    const duration = Date.now() - emailStartTime;
                    addLog('error', `   ❌ Échec après ${duration}ms`);
                    addLog('error', `   Erreur: ${emailError.message}`);
                    if (emailError.code) addLog('error', `   Code: ${emailError.code}`);
                    if (emailError.command) addLog('error', `   Command: ${emailError.command}`);
                    emailResults.push({ email: expert.email, success: false, error: emailError.message });
                }
            }

            const successfulEmails = emailResults.filter(r => r.success).map(r => r.email);
            const failedEmails = emailResults.filter(r => !r.success);

            addLog('info', '─'.repeat(50));
            addLog('info', `📊 RÉSUMÉ: ${successfulEmails.length}/${emailResults.length} emails envoyés`);
            
            if (failedEmails.length > 0) {
                addLog('warning', `⚠️ Échecs: ${failedEmails.map(f => f.email).join(', ')}`);
            }

            if (successfulEmails.length > 0) {
                return res.json({
                    success: true,
                    message: `${successfulEmails.length} email(s) envoyé(s) avec succès`,
                    emails: successfulEmails,
                    debugLogs
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Aucun email n\'a pu être envoyé',
                    debugLogs
                });
            }
        } else {
            // Mode normal : réponse immédiate, envoi en arrière-plan
            let responseMessage = `Demande envoyée à ${expertsWithEmail.length} expert(s)`;
            if (expertsWithoutEmail.length > 0) {
                responseMessage += ` (${expertsWithoutEmail.length} sans email)`;
            }
            
            res.json({
                success: true,
                message: responseMessage,
                emails: expertsWithEmail.map(e => e.email)
            });

            // Envoi en arrière-plan
            process.nextTick(() => {
                expertsWithEmail.forEach(expert => {
                    const personalizedMessage = message.replace(/\[Prénom de l'utilisateur\]/g, expert.prenom);

                    const mailOptions = {
                        from: `"SI-SAMU Planning" <${emailConfig.user}>`,
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
                                        <a href="mailto:${fromEmail}?subject=${encodeURIComponent('Re: ' + subject)}" 
                                           style="display: inline-block; padding: 12px 30px; background-color: #27ae60; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                            📧 Répondre à ${fromName}
                                        </a>
                                    </div>
                                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                                    <p style="color: #7f8c8d; font-size: 12px; text-align: center; margin: 0;">
                                        Système SI-SAMU de planification des ressources
                                    </p>
                                </div>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions)
                        .then(() => console.log(`✅ Email envoyé à ${expert.email}`))
                        .catch(err => console.error(`❌ Erreur email ${expert.email}:`, err.message));
                });
            });
        }

    } catch (error) {
        console.error('❌ Erreur demande d\'affectation:', error);
        const errorLog = { type: 'error', message: `❌ EXCEPTION: ${error.message}`, timestamp: new Date().toLocaleTimeString('fr-FR') };
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message, debugLogs: [...(debugMode ? debugLogs : []), errorLog] });
        }
    }
});

// ========== RAZ (REMISE À ZÉRO) DES LOGS ==========

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

// Route pour sauvegarder l'onglet par défaut
app.put('/api/users/:id/default-tab', requireAuth, (req, res) => {
    const { id } = req.params;
    const { defaultTab } = req.body;
    
    // Vérifier que l'utilisateur modifie son propre paramètre
    if (parseInt(id) !== req.session.userId) {
        return res.status(403).json({ error: 'Non autorisé' });
    }
    
    // Liste des onglets valides
    const validTabs = ['resources', 'planning', 'reporting', 'admin', 'astreintesGestion'];
    if (!validTabs.includes(defaultTab)) {
        return res.status(400).json({ error: 'Onglet invalide' });
    }
    
    database.run(
        `UPDATE users SET default_tab = ? WHERE id = ?`,
        [defaultTab, id],
        (err) => {
            if (err) {
                console.error('Erreur sauvegarde onglet par défaut:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log(`✅ Onglet par défaut changé pour user ${id}: ${defaultTab}`);
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

// ========== API BONS DE COMMANDE ET DÉPLACEMENTS ==========

// Récupérer tous les bons de commande
app.get('/api/bons-commande', requireAuth, (req, res) => {
    database.all(`
        SELECT bc.*, u.nom as creator_nom, u.prenom as creator_prenom
        FROM bons_commande bc
        LEFT JOIN users u ON bc.created_by = u.id
        ORDER BY bc.date_debut DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('Erreur récupération bons de commande:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Créer un bon de commande
app.post('/api/bons-commande', requireAuth, (req, res) => {
    const { intitule, titulaire, date_debut, date_fin, nb_uo } = req.body;
    
    if (!intitule || !titulaire || !date_debut || !date_fin || !nb_uo) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    // Vérifier l'unicité du numéro de CBDC
    database.get(`SELECT id FROM bons_commande WHERE LOWER(intitule) = LOWER(?)`, [intitule], (err, existing) => {
        if (err) {
            console.error('Erreur vérification unicité CBDC:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (existing) {
            return res.status(400).json({ error: 'Ce numéro de CBDC existe déjà' });
        }
        
        database.run(
            `INSERT INTO bons_commande (intitule, titulaire, date_debut, date_fin, nb_uo, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [intitule, titulaire.toUpperCase(), date_debut, date_fin, nb_uo, req.session.userId],
            function(err) {
                if (err) {
                    console.error('Erreur création bon de commande:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, message: 'Bon de commande créé' });
            }
        );
    });
});

// Modifier un bon de commande
app.put('/api/bons-commande/:id', requireAuth, (req, res) => {
    const { intitule, titulaire, date_debut, date_fin, nb_uo, solde } = req.body;
    const id = req.params.id;
    
    database.run(
        `UPDATE bons_commande SET intitule = ?, titulaire = ?, date_debut = ?, date_fin = ?, nb_uo = ?, actif = 1, solde = ? WHERE id = ?`,
        [intitule, titulaire ? titulaire.toUpperCase() : null, date_debut, date_fin, nb_uo, solde ? 1 : 0, id],
        function(err) {
            if (err) {
                console.error('Erreur modification bon de commande:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Bon de commande modifié' });
        }
    );
});

// Supprimer un bon de commande
app.delete('/api/bons-commande/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    
    // Récupérer les infos du BC et compter les déplacements associés
    database.get(`SELECT COUNT(*) as count FROM deplacements WHERE bon_commande_id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const nbDeplacements = row.count;
        
        // D'abord, désaffecter tous les déplacements liés à ce BC (mettre bon_commande_id à NULL)
        database.run(`UPDATE deplacements SET bon_commande_id = NULL WHERE bon_commande_id = ?`, [id], function(err) {
            if (err) {
                console.error('Erreur désaffectation déplacements:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Ensuite, supprimer le bon de commande
            database.run(`DELETE FROM bons_commande WHERE id = ?`, [id], function(err) {
                if (err) {
                    console.error('Erreur suppression bon de commande:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                if (nbDeplacements > 0) {
                    console.log(`✅ BC ${id} supprimé, ${nbDeplacements} déplacement(s) désaffecté(s)`);
                    res.json({ 
                        message: 'Bon de commande supprimé', 
                        deplacements_desaffectes: nbDeplacements 
                    });
                } else {
                    res.json({ message: 'Bon de commande supprimé' });
                }
            });
        });
    });
});

// Récupérer tous les déplacements (pour reporting) - avec filtre optionnel par bon_commande_id
app.get('/api/deplacements', requireAuth, (req, res) => {
    const bonCommandeId = req.query.bon_commande_id;
    
    let query = `
        SELECT d.*, 
               u.nom as user_nom, u.prenom as user_prenom,
               bc.intitule as bon_commande_intitule,
               bc.titulaire as bon_commande_titulaire,
               amoa.nom as amoa_ced_nom,
               amoa.prenom as amoa_ced_prenom
        FROM deplacements d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id
        LEFT JOIN users amoa ON d.amoa_ced_id = amoa.id
    `;
    
    const params = [];
    
    if (bonCommandeId) {
        query += ` WHERE d.bon_commande_id = ?`;
        params.push(bonCommandeId);
    }
    
    query += ` ORDER BY d.date_debut DESC`;
    
    database.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erreur récupération déplacements:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer les déplacements de l'utilisateur connecté
app.get('/api/mes-deplacements', requireAuth, (req, res) => {
    // Si admin, afficher tous les déplacements, sinon seulement ceux de l'utilisateur
    const isAdmin = req.session.activeProfile === 'admin';
    
    let query = `
        SELECT d.*, 
               bc.intitule as bon_commande_intitule, 
               bc.titulaire as bon_commande_titulaire,
               bc.nb_uo as bc_uo_commandees,
               u.nom as amoa_ced_nom,
               u.prenom as amoa_ced_prenom,
               creator.nom as creator_nom,
               creator.prenom as creator_prenom
        FROM deplacements d
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id
        LEFT JOIN users u ON d.amoa_ced_id = u.id
        LEFT JOIN users creator ON d.user_id = creator.id
    `;
    
    let params = [];
    
    if (!isAdmin) {
        query += ` WHERE d.user_id = ?`;
        params.push(req.session.userId);
    }
    
    query += ` ORDER BY d.date_debut DESC`;
    
    database.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erreur récupération mes déplacements:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer un déplacement par ID
app.get('/api/deplacements/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    
    database.get(`
        SELECT d.*, bc.intitule as bon_commande_intitule, bc.titulaire as bon_commande_titulaire
        FROM deplacements d
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id
        WHERE d.id = ?
    `, [id], (err, row) => {
        if (err) {
            console.error('Erreur récupération déplacement:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }
        res.json(row);
    });
});

// Créer un déplacement
app.post('/api/deplacements', requireAuth, (req, res) => {
    const { amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, commentaire } = req.body;
    
    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    // Calculer le nombre d'UO (nombre de jours)
    const start = new Date(date_debut);
    const end = new Date(date_fin);
    const diffTime = Math.abs(end - start);
    const nb_uo = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 pour inclure le jour de départ
    
    // Utiliser le bon_commande_id passé en paramètre s'il existe
    const bcId = bon_commande_id || null;
    const comm = commentaire ? commentaire.trim() : null;
    
    // Vérifier si le BC est en surconsommation
    if (bcId) {
        database.get(`
            SELECT bc.*, COALESCE(SUM(d.nb_uo), 0) as uo_consommees
            FROM bons_commande bc
            LEFT JOIN deplacements d ON d.bon_commande_id = bc.id
            WHERE bc.id = ?
            GROUP BY bc.id
        `, [bcId], (err, bc) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Calculer si après ajout on sera en surconsommation
            const uoApresAjout = (bc.uo_consommees || 0) + nb_uo;
            const enSurconsommation = uoApresAjout > bc.uo_commandees;
            
            database.run(
                `INSERT INTO deplacements (user_id, amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, nb_uo, a_regulariser, commentaire) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.session.userId, amoa_ced_id, date_debut, date_fin, samu, ville.toUpperCase(), bcId, nb_uo, enSurconsommation ? 1 : 0, comm],
                function(err) {
                    if (err) {
                        console.error('Erreur création déplacement:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ 
                        id: this.lastID, 
                        nb_uo, 
                        bon_commande_id: bcId, 
                        a_regulariser: enSurconsommation,
                        message: enSurconsommation 
                            ? '⚠️ Déplacement créé - À RÉGULARISER (bon de commande en surconsommation)' 
                            : 'Déplacement créé'
                    });
                }
            );
        });
    } else {
        // Pas de BC, pas de vérification de surconsommation
        database.run(
            `INSERT INTO deplacements (user_id, amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, nb_uo, a_regulariser, commentaire) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [req.session.userId, amoa_ced_id, date_debut, date_fin, samu, ville.toUpperCase(), bcId, nb_uo, comm],
            function(err) {
                if (err) {
                    console.error('Erreur création déplacement:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, nb_uo, bon_commande_id: bcId, message: 'Déplacement créé' });
            }
        );
    }
});

// Modifier un déplacement
app.put('/api/deplacements/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    const { amoa_ced_id, date_debut, date_fin, samu, ville, bon_commande_id, commentaire } = req.body;
    
    if (!amoa_ced_id || !date_debut || !date_fin || !samu || !ville) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    // Calculer le nombre d'UO (nombre de jours)
    const start = new Date(date_debut);
    const end = new Date(date_fin);
    const diffTime = Math.abs(end - start);
    const nb_uo = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const comm = commentaire ? commentaire.trim() : null;
    
    // Vérifier que le déplacement appartient à l'utilisateur (sauf admin)
    database.get(`SELECT user_id FROM deplacements WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }
        
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        
        database.run(
            `UPDATE deplacements SET amoa_ced_id = ?, date_debut = ?, date_fin = ?, samu = ?, ville = ?, bon_commande_id = ?, nb_uo = ?, commentaire = ? WHERE id = ?`,
            [amoa_ced_id, date_debut, date_fin, samu, ville.toUpperCase(), bon_commande_id || null, nb_uo, comm, id],
            function(err) {
                if (err) {
                    console.error('Erreur modification déplacement:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Déplacement modifié' });
            }
        );
    });
});

// Régularisation d'un déplacement (transfert d'un bon de commande à un autre)
app.post('/api/deplacements/:id/regularisation', requireAuth, (req, res) => {
    const id = req.params.id;
    const { ancien_bon_commande_id, nouveau_bon_commande_id } = req.body;
    
    if (!ancien_bon_commande_id || !nouveau_bon_commande_id) {
        return res.status(400).json({ error: 'Les deux bons de commande sont requis' });
    }
    
    if (ancien_bon_commande_id === nouveau_bon_commande_id) {
        return res.status(400).json({ error: 'Les deux bons de commande doivent être différents' });
    }
    
    // Vérifier que l'utilisateur est admin ou propriétaire du déplacement
    database.get(`SELECT * FROM deplacements WHERE id = ?`, [id], (err, deplacement) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!deplacement) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }
        
        if (deplacement.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        
        // Vérifier que le nouveau bon de commande existe et n'est pas soldé
        database.get(`SELECT * FROM bons_commande WHERE id = ? AND (solde IS NULL OR solde = 0)`, [nouveau_bon_commande_id], (err, nouveauBc) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!nouveauBc) {
                return res.status(404).json({ error: 'Nouveau bon de commande non trouvé ou soldé' });
            }
            
            // Vérifier que les dates du déplacement sont dans la période du nouveau BC
            if (deplacement.date_debut < nouveauBc.date_debut || deplacement.date_fin > nouveauBc.date_fin) {
                return res.status(400).json({ 
                    error: `Les dates du déplacement (${deplacement.date_debut} - ${deplacement.date_fin}) ne sont pas dans la période du nouveau bon de commande (${nouveauBc.date_debut} - ${nouveauBc.date_fin})` 
                });
            }
            
            // Calculer les UO disponibles sur le nouveau BC
            database.get(`
                SELECT COALESCE(SUM(nb_uo), 0) as uo_consommees 
                FROM deplacements 
                WHERE bon_commande_id = ?
            `, [nouveau_bon_commande_id], (err, stats) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                const uoDisponibles = nouveauBc.uo_commandees - stats.uo_consommees;
                
                if (uoDisponibles < deplacement.nb_uo) {
                    return res.status(400).json({ 
                        error: `Le nouveau bon de commande n'a pas assez d'UO disponibles (${uoDisponibles} disponibles, ${deplacement.nb_uo} nécessaires)` 
                    });
                }
                
                // Effectuer le transfert : mettre à jour le bon de commande du déplacement ET retirer le marquage à régulariser
                database.run(
                    `UPDATE deplacements SET bon_commande_id = ?, a_regulariser = 0 WHERE id = ?`,
                    [nouveau_bon_commande_id, id],
                    function(err) {
                        if (err) {
                            console.error('Erreur régularisation déplacement:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        
                        console.log(`✅ Régularisation effectuée: Déplacement ${id} transféré du BC ${ancien_bon_commande_id} vers BC ${nouveau_bon_commande_id} (${deplacement.nb_uo} UO)`);
                        
                        res.json({ 
                            message: 'Régularisation effectuée avec succès',
                            details: {
                                deplacement_id: id,
                                ancien_bon_commande_id: ancien_bon_commande_id,
                                nouveau_bon_commande_id: nouveau_bon_commande_id,
                                nb_uo_transferees: deplacement.nb_uo
                            }
                        });
                    }
                );
            });
        });
    });
});

// Réaffectation simple d'un déplacement vers un autre BC (sans vérification des UO disponibles)
app.post('/api/deplacements/:id/reaffecter', requireAuth, (req, res) => {
    const id = req.params.id;
    const { nouveau_bon_commande_id } = req.body;
    
    if (!nouveau_bon_commande_id) {
        return res.status(400).json({ error: 'Le nouveau bon de commande est requis' });
    }
    
    // Vérifier que l'utilisateur est admin
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Seul un administrateur peut effectuer cette opération' });
    }
    
    // Vérifier que le déplacement existe
    database.get(`
        SELECT d.*, bc.intitule as ancien_bc_intitule 
        FROM deplacements d 
        LEFT JOIN bons_commande bc ON d.bon_commande_id = bc.id 
        WHERE d.id = ?
    `, [id], (err, deplacement) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!deplacement) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }
        
        // Vérifier que le nouveau bon de commande existe
        database.get(`SELECT * FROM bons_commande WHERE id = ?`, [nouveau_bon_commande_id], (err, nouveauBc) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!nouveauBc) {
                return res.status(404).json({ error: 'Nouveau bon de commande non trouvé' });
            }
            
            // Préparer le nouveau commentaire avec la trace de réaffectation
            const ancienBcRef = deplacement.ancien_bc_intitule || 'N/A';
            const nouveauBcRef = nouveauBc.intitule;
            const traceReaffectation = `Réaffectation du BDC n° ${ancienBcRef} vers le BDC n° ${nouveauBcRef}`;
            
            // Si un commentaire existait, l'ajouter après la trace
            let nouveauCommentaire = traceReaffectation;
            if (deplacement.commentaire && deplacement.commentaire.trim()) {
                // Vérifier si ce n'est pas déjà une trace de réaffectation
                if (!deplacement.commentaire.startsWith('Réaffectation du BDC')) {
                    nouveauCommentaire = traceReaffectation + ' | ' + deplacement.commentaire;
                }
            }
            
            // Effectuer le transfert : mettre à jour le bon de commande, le commentaire et retirer le marquage à régulariser
            database.run(
                `UPDATE deplacements SET bon_commande_id = ?, a_regulariser = 0, commentaire = ? WHERE id = ?`,
                [nouveau_bon_commande_id, nouveauCommentaire, id],
                function(err) {
                    if (err) {
                        console.error('Erreur réaffectation déplacement:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    console.log(`✅ Réaffectation effectuée: Déplacement ${id} transféré de BC ${ancienBcRef} vers BC ${nouveauBcRef} (${deplacement.nb_uo} UO)`);
                    
                    res.json({ 
                        message: 'Réaffectation effectuée avec succès',
                        details: {
                            deplacement_id: id,
                            ancien_bon_commande: ancienBcRef,
                            nouveau_bon_commande: nouveauBcRef,
                            nb_uo_transferees: deplacement.nb_uo
                        }
                    });
                }
            );
        });
    });
});

// Supprimer un déplacement
app.delete('/api/deplacements/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    
    // Vérifier que le déplacement appartient à l'utilisateur (sauf admin)
    database.get(`SELECT user_id FROM deplacements WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Déplacement non trouvé' });
        }
        
        // Seul l'utilisateur propriétaire ou un admin peut supprimer
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        
        database.run(`DELETE FROM deplacements WHERE id = ?`, [id], function(err) {
            if (err) {
                console.error('Erreur suppression déplacement:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Déplacement supprimé' });
        });
    });
});

// Reporting: statistiques des bons de commande
app.get('/api/reporting-deplacements', requireAuth, (req, res) => {
    database.all(`
        SELECT 
            bc.id,
            bc.intitule,
            bc.titulaire,
            bc.date_debut,
            bc.date_fin,
            bc.nb_uo as uo_commandees,
            bc.actif,
            bc.solde,
            COALESCE(SUM(d.nb_uo), 0) as uo_consommees
        FROM bons_commande bc
        LEFT JOIN deplacements d ON d.bon_commande_id = bc.id
        GROUP BY bc.id
        ORDER BY bc.date_debut DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('Erreur reporting déplacements:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer la liste des SAMU (depuis les ressources)
app.get('/api/liste-samu', requireAuth, (req, res) => {
    database.all(`SELECT DISTINCT samu FROM resources WHERE samu IS NOT NULL AND samu != '' ORDER BY samu`, [], (err, rows) => {
        if (err) {
            console.error('Erreur récupération liste SAMU:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(r => r.samu));
    });
});

// ========== FIN API BONS DE COMMANDE ET DÉPLACEMENTS ==========

// ========== API ASTREINTES ET HNO ==========

// Récupérer les astreintes/HNO de l'utilisateur connecté
app.get('/api/mes-astreintes', requireAuth, (req, res) => {
    database.all(`
        SELECT * FROM astreintes_hno 
        WHERE user_id = ?
        ORDER BY date_debut DESC
    `, [req.session.userId], (err, rows) => {
        if (err) {
            console.error('Erreur récupération astreintes:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer toutes les astreintes/HNO pour affichage sur le planning
app.get('/api/all-astreintes-planning', requireAuth, (req, res) => {
    database.all(`
        SELECT a.*, u.nom as user_nom, u.prenom as user_prenom, u.resource_id
        FROM astreintes_hno a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE u.resource_id IS NOT NULL
        ORDER BY a.date_debut
    `, [], (err, rows) => {
        if (err) {
            console.error('Erreur récupération astreintes planning:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer toutes les astreintes/HNO (admin)
app.get('/api/astreintes', requireAuth, (req, res) => {
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    database.all(`
        SELECT a.*, u.nom as user_nom, u.prenom as user_prenom
        FROM astreintes_hno a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY u.nom, u.prenom, a.date_debut DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('Erreur récupération astreintes:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Récupérer la liste des experts (pour admin)
app.get('/api/experts-list', requireAuth, (req, res) => {
    if (req.session.activeProfile !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    database.all(`
        SELECT id, nom, prenom 
        FROM users 
        WHERE is_expert = 1 AND actif = 1
        ORDER BY nom, prenom
    `, [], (err, rows) => {
        if (err) {
            console.error('Erreur récupération experts:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Créer une astreinte/HNO
app.post('/api/astreintes', requireAuth, (req, res) => {
    const { user_id, type, date_debut, date_fin, heure_debut, heure_fin, samu, tous_samu, objet } = req.body;
    
    // Vérifier les droits
    const targetUserId = req.session.activeProfile === 'admin' ? (user_id || req.session.userId) : req.session.userId;
    
    if (!type || !date_debut || !date_fin || !objet) {
        return res.status(400).json({ error: 'Type, dates et objet sont requis' });
    }
    
    // Heures obligatoires pour astreintes ET HNO
    if (!heure_debut || !heure_fin) {
        return res.status(400).json({ error: 'Heures de début et fin requises' });
    }
    
    if (!tous_samu && !samu) {
        return res.status(400).json({ error: 'SAMU requis ou cocher "Tous les SAMU"' });
    }
    
    database.run(
        `INSERT INTO astreintes_hno (user_id, type, date_debut, date_fin, heure_debut, heure_fin, samu, tous_samu, objet) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [targetUserId, type, date_debut, date_fin, heure_debut, heure_fin, tous_samu ? null : samu, tous_samu ? 1 : 0, objet],
        function(err) {
            if (err) {
                console.error('Erreur création astreinte:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Envoyer notification Teams
            sendTeamsNotificationFromServer('astreinte', {
                expert: `${req.session.prenom} ${req.session.nom}`,
                type: type,
                date: `${formatDateFR(date_debut)}${date_fin !== date_debut ? ' au ' + formatDateFR(date_fin) : ''}`,
                heureDebut: heure_debut,
                heureFin: heure_fin
            });
            
            res.json({ id: this.lastID, message: 'Astreinte/HNO créée' });
        }
    );
});

// Modifier une astreinte/HNO
app.put('/api/astreintes/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    const { type, date_debut, date_fin, heure_debut, heure_fin, samu, tous_samu, objet } = req.body;
    
    // Vérifier que l'astreinte appartient à l'utilisateur (sauf admin)
    database.get(`SELECT user_id FROM astreintes_hno WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Astreinte non trouvée' });
        }
        
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        
        // Heures obligatoires pour astreintes ET HNO
        if (!heure_debut || !heure_fin) {
            return res.status(400).json({ error: 'Heures de début et fin requises' });
        }
        
        database.run(
            `UPDATE astreintes_hno 
             SET type = ?, date_debut = ?, date_fin = ?, heure_debut = ?, heure_fin = ?, samu = ?, tous_samu = ?, objet = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [type, date_debut, date_fin, heure_debut, heure_fin, tous_samu ? null : samu, tous_samu ? 1 : 0, objet, id],
            function(err) {
                if (err) {
                    console.error('Erreur modification astreinte:', err);
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Astreinte/HNO modifiée' });
            }
        );
    });
});

// Supprimer une astreinte/HNO
app.delete('/api/astreintes/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    
    // Vérifier que l'astreinte appartient à l'utilisateur (sauf admin)
    database.get(`SELECT user_id FROM astreintes_hno WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Astreinte non trouvée' });
        }
        
        if (row.user_id !== req.session.userId && req.session.activeProfile !== 'admin') {
            return res.status(403).json({ error: 'Non autorisé' });
        }
        
        database.run(`DELETE FROM astreintes_hno WHERE id = ?`, [id], function(err) {
            if (err) {
                console.error('Erreur suppression astreinte:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Astreinte/HNO supprimée' });
        });
    });
});

// Reporting HNO/Astreintes
app.post('/api/reporting/hno-astreintes', requireAuth, (req, res) => {
    const { startMonth, startYear, endMonth, endYear, expertIds, showHno, showAstreintes } = req.body;
    
    // Récupérer les ressources sélectionnées avec leurs user_id
    database.all(`
        SELECT r.id as resource_id, r.nom, r.prenom, u.id as user_id
        FROM resources r
        LEFT JOIN users u ON u.resource_id = r.id
        WHERE r.id IN (${expertIds.map(() => '?').join(',')})
        ORDER BY r.nom, r.prenom
    `, expertIds, (err, experts) => {
        if (err) {
            console.error('Erreur récupération experts:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Récupérer toutes les astreintes/HNO pour ces experts dans la période
        const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;
        const endDate = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-31`;
        
        const userIds = experts.map(e => e.user_id).filter(id => id != null);
        
        if (userIds.length === 0) {
            // Aucun expert n'a de compte utilisateur associé
            return res.json({
                experts: experts.map(e => ({
                    resource_id: e.resource_id,
                    nom: e.nom,
                    prenom: e.prenom,
                    monthlyData: {}
                }))
            });
        }
        
        database.all(`
            SELECT a.*, u.resource_id
            FROM astreintes_hno a
            JOIN users u ON a.user_id = u.id
            WHERE a.user_id IN (${userIds.map(() => '?').join(',')})
            AND a.date_debut <= ?
            AND a.date_fin >= ?
        `, [...userIds, endDate, startDate], (err, astreintes) => {
            if (err) {
                console.error('Erreur récupération astreintes:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Calculer les données par expert et par mois
            const result = {
                experts: experts.map(expert => {
                    const monthlyData = {};
                    
                    // Pour chaque mois de la période
                    let currentDate = new Date(startYear, startMonth, 1);
                    const endPeriod = new Date(endYear, endMonth + 1, 0);
                    
                    while (currentDate <= endPeriod) {
                        const month = currentDate.getMonth();
                        const year = currentDate.getFullYear();
                        const key = `${year}-${month}`;
                        
                        monthlyData[key] = { hno: 0, astreintes: 0 };
                        
                        // Compter les astreintes/HNO pour cet expert ce mois
                        astreintes.forEach(a => {
                            if (a.resource_id !== expert.resource_id) return;
                            
                            const aStart = new Date(a.date_debut);
                            const aEnd = new Date(a.date_fin);
                            const monthStart = new Date(year, month, 1);
                            const monthEnd = new Date(year, month + 1, 0);
                            
                            // Vérifier si l'astreinte chevauche ce mois
                            if (aStart <= monthEnd && aEnd >= monthStart) {
                                // Compter le nombre de jours dans ce mois
                                const overlapStart = aStart > monthStart ? aStart : monthStart;
                                const overlapEnd = aEnd < monthEnd ? aEnd : monthEnd;
                                const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                                
                                if (a.type === 'hno') {
                                    monthlyData[key].hno += days;
                                } else if (a.type === 'astreinte') {
                                    monthlyData[key].astreintes += days;
                                }
                            }
                        });
                        
                        currentDate.setMonth(currentDate.getMonth() + 1);
                    }
                    
                    return {
                        resource_id: expert.resource_id,
                        nom: expert.nom,
                        prenom: expert.prenom,
                        monthlyData
                    };
                })
            };
            
            res.json(result);
        });
    });
});

// ========== FIN API ASTREINTES ET HNO ==========

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

// Fonction pour exécuter l'automatisation n°2 (sauvegarde plannings)
async function runAutomation2() {
    console.log('⏰ [CRON] Vérification automatisation n°2...');
    
    try {
        // Récupérer la configuration
        const configRow = await new Promise((resolve, reject) => {
            database.get(
                `SELECT value FROM settings WHERE key = 'automation_2_config'`,
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!configRow || !configRow.value) {
            console.log('⏰ [CRON] Automatisation n°2 non configurée');
            return;
        }
        
        const config = JSON.parse(configRow.value);
        
        if (!config.enabled) {
            console.log('⏰ [CRON] Automatisation n°2 désactivée');
            return;
        }
        
        // Utiliser l'heure de Paris pour la vérification
        const now = new Date();
        const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const currentDay = parisTime.getDate();
        const currentDayOfWeek = parisTime.getDay(); // 0=Dimanche, 1=Lundi, etc.
        const currentHour = parisTime.getHours();
        
        console.log(`⏰ [CRON] Heure Paris: ${currentHour}h, Config: ${config.hour}h, Fréquence: ${config.frequency}`);
        
        // Vérifier si c'est le bon moment pour envoyer
        let shouldSend = false;
        
        if (config.frequency === 'daily') {
            shouldSend = (currentHour === parseInt(config.hour));
        } else if (config.frequency === 'weekly') {
            shouldSend = (currentDayOfWeek === parseInt(config.weekDay) && currentHour === parseInt(config.hour));
        } else if (config.frequency === 'monthly') {
            shouldSend = (currentDay === parseInt(config.monthDay) && currentHour === parseInt(config.hour));
        }
        
        if (!shouldSend) {
            console.log(`⏰ [CRON] Pas le bon moment pour l'automatisation n°2`);
            return;
        }
        
        console.log('⏰ [CRON] Déclenchement de l\'automatisation n°2...');
        
        const transporter = createEmailTransporter();
        if (!transporter) {
            console.error('⏰ [CRON] Configuration email non disponible');
            return;
        }
        
        // Construire la liste des destinataires
        let recipientEmails = [];
        
        if (config.groupAdmin) {
            const admins = await new Promise((resolve, reject) => {
                database.all(`SELECT email FROM users WHERE is_admin = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            admins.forEach(u => { if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email); });
        }
        
        if (config.groupUser) {
            const usersData = await new Promise((resolve, reject) => {
                database.all(`SELECT email FROM users WHERE is_user = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            usersData.forEach(u => { if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email); });
        }
        
        if (config.groupExpert) {
            const expertsUsers = await new Promise((resolve, reject) => {
                database.all(`SELECT email FROM users WHERE is_expert = 1 AND actif = 1 AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            expertsUsers.forEach(u => { if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email); });
        }
        
        if (config.recipients && config.recipients.length > 0) {
            const individualUsers = await new Promise((resolve, reject) => {
                database.all(`SELECT email FROM users WHERE id IN (${config.recipients.join(',')}) AND email IS NOT NULL AND email != ''`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            individualUsers.forEach(u => { if (!recipientEmails.includes(u.email)) recipientEmails.push(u.email); });
        }
        
        if (recipientEmails.length === 0) {
            console.log('⏰ [CRON] Automatisation n°2: aucun destinataire');
            return;
        }
        
        // Récupérer les ressources selon la sélection
        let resourcesList = [];
        if (config.allExperts !== false) { // Par défaut tous les experts
            resourcesList = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM resources ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
        } else if (config.expertsList && config.expertsList.length > 0) {
            resourcesList = await new Promise((resolve, reject) => {
                database.all(`SELECT * FROM resources WHERE id IN (${config.expertsList.join(',')}) ORDER BY nom, prenom`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
        }
        
        // Récupérer les données de planning
        // Utiliser selectedMonths (format "2025-01") si pas allMonths
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        let allPatterns = [];
        let monthsLabels = [];
        let selectedMonthsList = [];
        
        if (config.allMonths) {
            // Récupérer tous les mois disponibles depuis la base
            const availableMonths = await new Promise((resolve, reject) => {
                database.all(`
                    SELECT DISTINCT substr(date_key, 1, 7) as month
                    FROM schedule_data 
                    WHERE (type = 'available' AND value != '1')
                       OR (type = 'activity' AND value != '1')
                `, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            selectedMonthsList = availableMonths.map(r => r.month).filter(m => m && m.length >= 7);
        } else if (config.selectedMonths && config.selectedMonths.length > 0) {
            selectedMonthsList = config.selectedMonths;
        } else {
            // Fallback: mois courant et suivant
            const d1 = new Date();
            const d2 = new Date(d1.getFullYear(), d1.getMonth() + 1, 1);
            selectedMonthsList = [
                `${d1.getFullYear()}-${String(d1.getMonth()+1).padStart(2,'0')}`,
                `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}`
            ];
        }
        
        console.log(`⏰ [CRON] Mois sélectionnés: ${selectedMonthsList.join(', ')}`);
        
        selectedMonthsList.forEach(monthStr => {
            // Format: "2025-01" ou "2025-1-"
            const cleanMonth = monthStr.replace(/-$/, '');
            const parts = cleanMonth.split('-');
            if (parts.length >= 2) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                    // Pattern avec zéro
                    const patternWithZero = `${year}-${String(month).padStart(2, '0')}-%`;
                    allPatterns.push(patternWithZero);
                    // Pattern sans zéro (pour les anciennes données)
                    const patternWithoutZero = `${year}-${month}-%`;
                    if (patternWithZero !== patternWithoutZero) {
                        allPatterns.push(patternWithoutZero);
                    }
                    monthsLabels.push(`${monthNames[month - 1]} ${year}`);
                }
            }
        });
        
        if (allPatterns.length === 0) {
            console.log('⏰ [CRON] Automatisation n°2: aucun mois sélectionné');
            return;
        }
        
        const likeConditions = allPatterns.map(() => `date_key LIKE ?`).join(' OR ');
        
        const scheduleData = await new Promise((resolve, reject) => {
            database.all(
                `SELECT * FROM schedule_data WHERE ${likeConditions} ORDER BY resource_id, date_key`,
                allPatterns,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
        
        // Organiser les données
        const dataByResource = {};
        scheduleData.forEach(row => {
            if (!dataByResource[row.resource_id]) dataByResource[row.resource_id] = {};
            if (!dataByResource[row.resource_id][row.date_key]) dataByResource[row.resource_id][row.date_key] = {};
            dataByResource[row.resource_id][row.date_key][row.type] = row.value;
        });
        
        // Générer le fichier avec l'heure de Paris
        const format = config.format || 'csv';
        const parisTimeForFile = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const timestamp = `${parisTimeForFile.getFullYear()}-${String(parisTimeForFile.getMonth()+1).padStart(2,'0')}-${String(parisTimeForFile.getDate()).padStart(2,'0')}_${String(parisTimeForFile.getHours()).padStart(2,'0')}-${String(parisTimeForFile.getMinutes()).padStart(2,'0')}`;
        const filename = `Expert_Planning_Sauvegarde_de_${timestamp}.${format}`;
        
        const availLabels = { '1': 'Indisponible', '2': 'Disponible', '3': 'Congés' };
        const actLabels = { '1': 'Indisponible', '2': 'En attente', '3': 'SAMU Déploiement', '4': 'SAMU Dev', '5': 'ANS Déploiement', '6': 'ANS Dev', '7': 'Qualification', '8': 'Divers' };
        
        // Option excludeEmpty
        const excludeEmpty = config.excludeEmpty !== false; // Par défaut true
        console.log(`⏰ [CRON] Exclure lignes vides: ${excludeEmpty}`);
        
        let csvContent = '\ufeff';
        csvContent += 'Expert,Date,Période,Disponibilité,Affectation,Localisation\n';
        let totalRows = 0;
        let excludedRows = 0;
        
        resourcesList.forEach(resource => {
            const resData = dataByResource[resource.id] || {};
            
            // Parcourir tous les mois sélectionnés
            selectedMonthsList.forEach(monthStr => {
                const cleanMonth = monthStr.replace(/-$/, '');
                const parts = cleanMonth.split('-');
                if (parts.length >= 2) {
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                        const daysInMonth = new Date(year, month, 0).getDate();
                        
                        for (let day = 1; day <= daysInMonth; day++) {
                            const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                            ['AM', 'PM'].forEach(period => {
                                const key = `${dateKey}_${period}`;
                                // Aussi chercher avec l'ancien format sans zéro
                                const keyAlt = `${year}-${month}-${day}_${period}`;
                                const data = resData[key] || resData[keyAlt] || {};
                                
                                const avail = data.available || '1';
                                const act = data.activity || '1';
                                const loc = data.localisation || '-';
                                
                                // Vérifier si on doit exclure cette ligne
                                const isEmpty = (avail === '1' && act === '1');
                                
                                if (excludeEmpty && isEmpty) {
                                    excludedRows++;
                                    return; // Sauter cette ligne
                                }
                                
                                totalRows++;
                                csvContent += `"${resource.prenom} ${resource.nom}","${dateKey}","${period}","${availLabels[avail] || avail}","${actLabels[act] || act}","${loc}"\n`;
                            });
                        }
                    }
                }
            });
        });
        
        console.log(`⏰ [CRON] CSV généré: ${totalRows} lignes (${excludedRows} exclues car vides)`);
        
        // Construire la liste des noms des destinataires pour les logs
        let recipientNames = [];
        if (config.groupAdmin) recipientNames.push('Groupe Administrateurs');
        if (config.groupUser) recipientNames.push('Groupe Utilisateurs');
        if (config.groupExpert) recipientNames.push('Groupe Experts');
        // Récupérer les noms des destinataires individuels
        if (config.recipients && config.recipients.length > 0) {
            const individualUsers = await new Promise((resolve, reject) => {
                database.all(`SELECT nom, prenom FROM users WHERE id IN (${config.recipients.join(',')})`, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            individualUsers.forEach(u => recipientNames.push(`${u.prenom} ${u.nom}`));
        }
        
        // Envoyer l'email
        const mailOptions = {
            from: `"Domaine des Urgences - Planification des ressources" <${emailConfig.user}>`,
            to: recipientEmails.join(', '),
            subject: `📊 Sauvegarde automatique du planning - ${monthsLabels.join(', ')}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #e65100;">📊 Sauvegarde automatique du planning</h2>
                    <p>Veuillez trouver ci-joint la sauvegarde du planning pour : ${monthsLabels.join(', ')}</p>
                    <p>• ${resourcesList.length} expert(s) inclus<br>• Format : ${format.toUpperCase()}</p>
                    <hr><p style="color: #999; font-size: 12px;">Email automatique - Système SI-SAMU</p>
                </div>
            `,
            attachments: [{ filename, content: csvContent, contentType: 'text/csv; charset=utf-8' }]
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`⏰ [CRON] ✅ Automatisation n°2: sauvegarde envoyée à ${recipientEmails.length} destinataire(s)`);
        
        // Enregistrer dans les logs avec toutes les informations
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at, recipients_list, file_content, filename) 
             VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
            [2, `${recipientNames.length} personnes`, recipientEmails.join(', '), monthsLabels.join(', '), JSON.stringify(recipientNames), csvContent, filename]
        );
        
    } catch (error) {
        console.error('⏰ [CRON] Erreur automatisation n°2:', error);
    }
}

// Planifier les crons
// Cron pour vérification toutes les heures (pour automation 2 avec différentes fréquences)
cron.schedule('0 * * * *', () => {
    console.log('⏰ [CRON] Vérification horaire - ' + new Date().toLocaleString('fr-FR'));
    runAutomation2();
}, {
    timezone: "Europe/Paris"
});

// Cron spécifique pour automation 1 à 8h00
cron.schedule('0 8 * * *', () => {
    console.log('⏰ [CRON] Exécution automatisation n°1 - ' + new Date().toLocaleString('fr-FR'));
    runAutomation1();
}, {
    timezone: "Europe/Paris"
});

console.log('⏰ Crons configurés: vérification horaire + automatisation n°1 à 8h00 (Europe/Paris)');

// ========== FIN SYSTÈME DE CRON ==========

// ========== ROUTES GESTION ASTREINTES ==========

// Récupérer la liste des volontaires
app.get('/api/astreinte/volontaires', requireAdmin, (req, res) => {
    database.all(`SELECT id, nom, prenom, trigramme, astreinte_volontaire, astreinte_date_activation 
                  FROM resources WHERE actif = 1 ORDER BY nom, prenom`, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// Activer/désactiver un volontaire
app.post('/api/astreinte/volontaire/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { volontaire } = req.body;
    
    const dateActivation = volontaire ? new Date().toISOString() : null;
    
    database.run(`UPDATE resources SET astreinte_volontaire = ?, astreinte_date_activation = ? WHERE id = ?`,
        [volontaire ? 1 : 0, dateActivation, id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        });
});

// Récupérer les indisponibilités
app.get('/api/astreinte/indispos', requireAdmin, (req, res) => {
    database.all(`SELECT * FROM astreinte_indisponibilites ORDER BY date`, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// Récupérer les disponibilités d'un expert pour un mois
app.get('/api/astreinte/dispos/:expertId/:mois', requireAuth, (req, res) => {
    const { expertId, mois } = req.params;
    console.log('📅 GET astreinte/dispos - expertId:', expertId, 'mois:', mois);
    
    const [year, month] = mois.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;
    
    // On stocke maintenant les DISPONIBILITÉS (jours verts)
    database.all(`SELECT * FROM astreinte_disponibilites 
                  WHERE resource_id = ? AND date >= ? AND date <= ?
                  ORDER BY date`,
        [expertId, startDate, endDate], (err, rows) => {
            if (err) {
                console.error('📅 Erreur GET dispos:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log('📅 Disponibilités trouvées:', rows?.length || 0);
                res.json(rows || []);
            }
        });
});

// Sauvegarder les disponibilités d'un expert pour un mois
app.post('/api/astreinte/dispos/:expertId/:mois', requireAuth, async (req, res) => {
    const { expertId, mois } = req.params;
    const { disponibilites } = req.body; // Array de dates disponibles (vertes)
    const [year, month] = mois.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;
    
    try {
        // Supprimer les anciennes disponibilités du mois pour cet expert
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM astreinte_disponibilites 
                          WHERE resource_id = ? AND date >= ? AND date <= ?`,
                [expertId, startDate, endDate], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });
        
        // Insérer les nouvelles disponibilités
        for (const date of disponibilites) {
            // Déterminer le type de créneau selon le jour
            const dateObj = new Date(date);
            const dayOfWeek = dateObj.getDay();
            const typeCreneau = (dayOfWeek === 0 || dayOfWeek === 6) ? 'journee' : 'soir';
            
            await new Promise((resolve, reject) => {
                database.run(`INSERT INTO astreinte_disponibilites (resource_id, date, type_creneau) VALUES (?, ?, ?)`,
                    [expertId, date, typeCreneau], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
        }
        
        res.json({ success: true, count: disponibilites.length });
        
    } catch (error) {
        console.error('Erreur sauvegarde dispos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ajouter une indisponibilité
app.post('/api/astreinte/indispo', requireAdmin, (req, res) => {
    const { resource_id, date, type_creneau, motif } = req.body;
    
    database.run(`INSERT OR REPLACE INTO astreinte_indisponibilites (resource_id, date, type_creneau, motif) VALUES (?, ?, ?, ?)`,
        [resource_id, date, type_creneau, motif || null], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, id: this.lastID });
            }
        });
});

// Supprimer une indisponibilité
app.delete('/api/astreinte/indispo/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    database.run(`DELETE FROM astreinte_indisponibilites WHERE id = ?`, [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Générer le planning d'astreinte
app.post('/api/astreinte/generate', requireAdmin, async (req, res) => {
    const { year, month } = req.body;
    
    try {
        // Récupérer les volontaires actifs
        const volontaires = await new Promise((resolve, reject) => {
            database.all(`SELECT * FROM resources WHERE actif = 1 AND astreinte_volontaire = 1`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        if (volontaires.length === 0) {
            return res.status(400).json({ error: 'Aucun volontaire disponible' });
        }
        
        // Récupérer les DISPONIBILITÉS du mois (jours verts déclarés)
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
        
        const disponibilites = await new Promise((resolve, reject) => {
            database.all(`SELECT * FROM astreinte_disponibilites WHERE date >= ? AND date <= ?`,
                [startDate, endDate], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
        });
        
        // Récupérer les affectations existantes (déplacements, bascules)
        const affectations = await new Promise((resolve, reject) => {
            database.all(`SELECT * FROM schedule_data WHERE date_key LIKE ? AND type = 'activity' AND value IN ('3', '4')`,
                [`${year}-${String(month).padStart(2, '0')}%`], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
        });
        
        // Générer les créneaux du mois
        const slots = [];
        const daysInMonth = new Date(year, month, 0).getDate();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = date.getDay();
            
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                // Week-end : journée complète
                slots.push({ date: dateStr, type_creneau: 'journee', dayOfWeek });
            } else {
                // Semaine : soir seulement
                slots.push({ date: dateStr, type_creneau: 'soir', dayOfWeek });
            }
        }
        
        // Algorithme de répartition
        const planning = [];
        const compteur = {}; // Compteur d'astreintes par expert
        const dernierAstreinte = {}; // Dernière date d'astreinte par expert
        const warnings = [];
        
        volontaires.forEach(v => {
            compteur[v.id] = 0;
            dernierAstreinte[v.id] = null;
        });
        
        // Fonction pour vérifier si un expert est disponible
        const isDisponible = (expertId, date, typeCreneau) => {
            // Vérifier si l'expert a déclaré être DISPONIBLE pour cette date
            const dispo = disponibilites.find(d => 
                d.resource_id === expertId && 
                d.date === date
            );
            // Si pas de disponibilité déclarée pour cette date = indisponible (rouge par défaut)
            if (!dispo) return false;
            
            // Vérifier si déplacement/bascule le lendemain (pour astreinte soir)
            if (typeCreneau === 'soir') {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDateStr = nextDay.toISOString().split('T')[0];
                
                const affectLendemain = affectations.find(a => 
                    a.resource_id === expertId && 
                    a.date_key === nextDateStr
                );
                if (affectLendemain) return false;
            }
            
            return true;
        };
        
        // Fonction pour vérifier les contraintes FPH
        const checkContraintesFPH = (expertId, date) => {
            // Max 15 astreintes par mois
            if (compteur[expertId] >= 15) return false;
            
            // Calculer les heures sur 7 jours glissants (simplifié)
            // Soir = 14h, Journée WE = 24h
            // Max 72h sur 7 jours
            // Pour simplifier, on limite à 3 créneaux sur 7 jours
            const dateObj = new Date(date);
            let countLast7Days = 0;
            
            for (const slot of planning) {
                const slotDate = new Date(slot.date);
                const diffDays = Math.abs((dateObj - slotDate) / (1000 * 60 * 60 * 24));
                if (slot.resource_id === expertId && diffDays < 7) {
                    countLast7Days++;
                }
            }
            
            if (countLast7Days >= 3) return false;
            
            // Repos de 11h entre deux périodes
            if (dernierAstreinte[expertId]) {
                const lastDate = new Date(dernierAstreinte[expertId]);
                const currentDate = new Date(date);
                const diffHours = (currentDate - lastDate) / (1000 * 60 * 60);
                if (diffHours < 11) return false;
            }
            
            return true;
        };
        
        // Assigner les créneaux
        for (const slot of slots) {
            // Trier les volontaires par nombre d'astreintes (équité)
            const sortedVolontaires = [...volontaires].sort((a, b) => compteur[a.id] - compteur[b.id]);
            
            let assigned = false;
            for (const expert of sortedVolontaires) {
                if (isDisponible(expert.id, slot.date, slot.type_creneau) && 
                    checkContraintesFPH(expert.id, slot.date)) {
                    
                    planning.push({
                        date: slot.date,
                        type_creneau: slot.type_creneau,
                        resource_id: expert.id,
                        year,
                        month
                    });
                    
                    compteur[expert.id]++;
                    dernierAstreinte[expert.id] = slot.date;
                    assigned = true;
                    break;
                }
            }
            
            if (!assigned) {
                planning.push({
                    date: slot.date,
                    type_creneau: slot.type_creneau,
                    resource_id: null,
                    year,
                    month
                });
                warnings.push(`Aucun expert disponible pour le ${slot.date} (${slot.type_creneau})`);
            }
        }
        
        // Sauvegarder le planning en base
        await new Promise((resolve, reject) => {
            database.run(`DELETE FROM astreinte_planning WHERE year = ? AND month = ?`, [year, month], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        for (const slot of planning) {
            await new Promise((resolve, reject) => {
                database.run(`INSERT INTO astreinte_planning (date, type_creneau, resource_id, year, month) VALUES (?, ?, ?, ?, ?)`,
                    [slot.date, slot.type_creneau, slot.resource_id, year, month], function(err) {
                        if (err) reject(err);
                        else {
                            slot.id = this.lastID;
                            resolve();
                        }
                    });
            });
        }
        
        // Statistiques
        const stats = {};
        volontaires.forEach(v => {
            if (compteur[v.id] > 0) {
                stats[`${v.nom.toUpperCase()} ${v.prenom}`] = compteur[v.id];
            }
        });
        
        res.json({ planning, warnings, stats, disponibilites });
        
    } catch (error) {
        console.error('Erreur génération planning:', error);
        res.status(500).json({ error: error.message });
    }
});

// Modifier une assignation
app.put('/api/astreinte/slot/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { resource_id } = req.body;
    
    database.run(`UPDATE astreinte_planning SET resource_id = ? WHERE id = ?`,
        [resource_id, id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        });
});

// Récupérer le planning d'un mois
app.get('/api/astreinte/planning/:mois', requireAdmin, (req, res) => {
    const { mois } = req.params;
    const [year, month] = mois.split('-').map(Number);
    
    database.all(`SELECT * FROM astreinte_planning WHERE year = ? AND month = ? ORDER BY date`,
        [year, month], (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        });
});

// ========== FIN ROUTES GESTION ASTREINTES ==========

// ========== ROUTES NOTIFICATIONS TEAMS ==========

// Tester l'envoi vers Teams
app.post('/api/teams/test', requireAdmin, async (req, res) => {
    const { teamsEmail } = req.body;
    
    if (!teamsEmail) {
        return res.status(400).json({ error: 'Adresse email Teams requise' });
    }
    
    try {
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(500).json({ error: 'Configuration email non disponible. Veuillez configurer SMTP dans les paramètres.' });
        }
        
        const mailOptions = {
            from: `"Planning ANS" <${emailConfig.user || 'noreply@esante.gouv.fr'}>`,
            to: teamsEmail,
            subject: '🧪 Test de notification - Planning ANS',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">🧪 Test de notification</h2>
                        </div>
                        <div style="padding: 25px;">
                            <p style="font-size: 16px; color: #333;">
                                ✅ <strong>Félicitations !</strong>
                            </p>
                            <p style="color: #666;">
                                Si vous voyez ce message, la connexion entre l'application <strong>Planning ANS</strong> et votre canal Teams fonctionne correctement.
                            </p>
                            <p style="color: #666;">
                                Les notifications automatiques seront désormais envoyées ici selon la configuration choisie.
                            </p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        // Logger l'envoi
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at) VALUES (?, ?, ?, ?, datetime('now'))`,
            [3, 'TEST', teamsEmail, 'Test de connexion'],
            (err) => {
                if (err) console.error('Erreur log Teams test:', err);
            }
        );
        
        console.log('📢 Test Teams envoyé à:', teamsEmail);
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur envoi test Teams:', error);
        res.status(500).json({ error: error.message });
    }
});

// Envoyer une notification Teams
app.post('/api/teams/notify', requireAuth, async (req, res) => {
    const { type, data } = req.body;
    
    try {
        // Récupérer la configuration de l'automatisation 3
        const configRow = await new Promise((resolve, reject) => {
            database.get(
                `SELECT value FROM settings WHERE key = ?`,
                ['automation_3_config'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!configRow || !configRow.value) {
            return res.json({ success: false, reason: 'Configuration non trouvée' });
        }
        
        const config = JSON.parse(configRow.value);
        
        if (!config.enabled) {
            return res.json({ success: false, reason: 'Automatisation désactivée' });
        }
        
        if (!config.notifications || !config.notifications.includes(type)) {
            return res.json({ success: false, reason: 'Type de notification non activé' });
        }
        
        if (!config.teamsEmail) {
            return res.json({ success: false, reason: 'Email Teams non configuré' });
        }
        
        // Construire le message selon le type
        let subject = '';
        let content = '';
        let emoji = '';
        let color = '#3498db';
        
        switch (type) {
            case 'affectation':
                emoji = '📅';
                subject = `${emoji} Nouvelle affectation`;
                color = '#3498db';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Activité :</strong> ${data.activity || 'Non spécifiée'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    <p><strong>Période :</strong> ${data.period || 'Non spécifiée'}</p>
                    ${data.location ? `<p><strong>Localisation :</strong> ${data.location}</p>` : ''}
                `;
                break;
                
            case 'demande':
                emoji = '✉️';
                subject = `${emoji} Demande d'affectation`;
                color = '#27ae60';
                content = `
                    <p><strong>De :</strong> ${data.from || 'Non spécifié'}</p>
                    <p><strong>Objet :</strong> ${data.subject || 'Non spécifié'}</p>
                    ${data.experts ? `<p><strong>Expert(s) contacté(s) :</strong> ${data.experts}</p>` : ''}
                    ${data.startDate ? `<p><strong>Période demandée :</strong></p><p style="margin-left: 15px;">📅 Du ${data.startDate}<br>📅 Au ${data.endDate}</p>` : ''}
                    <p><strong>Message :</strong></p>
                    <div style="background: #ffffff; border: 1px solid #e0e0e0; padding: 12px; border-radius: 5px; margin-top: 5px; color: #333333; line-height: 1.6;">
                        ${(data.message || '').replace(/\n/g, '<br>')}
                    </div>
                `;
                break;
                
            case 'astreinte':
                emoji = '🔔';
                subject = `${emoji} Nouvelle astreinte/HNO`;
                color = '#9c27b0';
                content = `
                    <p><strong>Expert :</strong> ${data.expert || 'Non spécifié'}</p>
                    <p><strong>Type :</strong> ${data.type === 'hno' ? 'HNO (Heures Non Ouvrées)' : 'Astreinte'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.heureDebut ? `<p><strong>Horaires :</strong> ${data.heureDebut} - ${data.heureFin}</p>` : ''}
                `;
                break;
                
            case 'evenement':
                emoji = '📆';
                subject = `${emoji} Nouvel événement`;
                color = '#ff9800';
                content = `
                    <p><strong>Événement :</strong> ${data.name || 'Non spécifié'}</p>
                    <p><strong>Date :</strong> ${data.date || 'Non spécifiée'}</p>
                    ${data.createdBy ? `<p><strong>Créé par :</strong> ${data.createdBy}</p>` : ''}
                `;
                break;
                
            default:
                return res.json({ success: false, reason: 'Type de notification inconnu' });
        }
        
        const mailOptions = {
            from: `"Planning ANS" <${process.env.SMTP_USER || 'noreply@esante.gouv.fr'}>`,
            to: config.teamsEmail,
            subject: `${subject} - Planning ANS`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">${subject}</h2>
                        </div>
                        <div style="padding: 25px;">
                            ${content}
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                📅 Application de Planification des Experts - ANS
                            </p>
                        </div>
                    </div>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        // Logger l'envoi
        database.run(
            `INSERT INTO automation_logs (automation_id, expert_name, expert_email, target_month, sent_at) VALUES (?, ?, ?, ?, datetime('now'))`,
            [3, type, config.teamsEmail, JSON.stringify(data)],
            (err) => {
                if (err) console.error('Erreur log Teams notify:', err);
            }
        );
        
        console.log(`📢 Notification Teams [${type}] envoyée`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur envoi notification Teams:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== FIN ROUTES NOTIFICATIONS TEAMS ==========

// ========== ROUTES MFA ==========

// Récupérer la configuration MFA
app.get('/api/mfa/config', requireAdmin, (req, res) => {
    database.get(
        `SELECT value FROM settings WHERE key = 'mfa_config'`,
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ config: row ? JSON.parse(row.value) : {} });
        }
    );
});

// Sauvegarder la configuration MFA
app.post('/api/mfa/config', requireAdmin, (req, res) => {
    const { config } = req.body;
    
    database.run(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('mfa_config', ?)`,
        [JSON.stringify(config)],
        (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            console.log('🔐 Configuration MFA sauvegardée:', config);
            res.json({ success: true });
        }
    );
});

// Réinitialiser le MFA de tous les utilisateurs
app.post('/api/mfa/reset-all', requireAdmin, (req, res) => {
    database.serialize(() => {
        // Supprimer les secrets TOTP
        database.run(`UPDATE users SET totp_secret = NULL`);
        // Supprimer les validations MFA
        database.run(`DELETE FROM mfa_validations`);
        // Supprimer les codes MFA en attente
        database.run(`DELETE FROM mfa_codes`);
    });
    
    console.log('🔐 MFA réinitialisé pour tous les utilisateurs');
    res.json({ success: true });
});

// Envoyer un code MFA par email
app.post('/api/mfa/send-code', async (req, res) => {
    const { userId } = req.body;
    
    try {
        // Récupérer l'utilisateur
        const user = await new Promise((resolve, reject) => {
            database.get(`SELECT email, prenom, nom FROM users WHERE id = ?`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user || !user.email) {
            return res.status(400).json({ error: 'Utilisateur sans email' });
        }
        
        // Générer le code
        const code = generateMfaCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
        
        // Sauvegarder le code
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT OR REPLACE INTO mfa_codes (user_id, code, expires_at) VALUES (?, ?, ?)`,
                [userId, code, expiresAt],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Envoyer l'email
        const transporter = createEmailTransporter();
        if (!transporter) {
            return res.status(500).json({ error: 'Configuration email non disponible' });
        }
        
        await transporter.sendMail({
            from: `"Planning ANS" <${emailConfig.user}>`,
            to: user.email,
            subject: '🔐 Code de vérification - Planning ANS',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                    <div style="max-width: 450px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, #4caf50 0%, #43a047 100%); color: white; padding: 25px; text-align: center;">
                            <h2 style="margin: 0;">🔐 Code de vérification</h2>
                        </div>
                        <div style="padding: 30px; text-align: center;">
                            <p style="color: #666; margin-bottom: 20px;">
                                Bonjour ${user.prenom},<br>
                                Voici votre code de vérification pour accéder à l'application.
                            </p>
                            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                <span style="font-size: 36px; font-family: monospace; letter-spacing: 8px; font-weight: bold; color: #2e7d32;">${code}</span>
                            </div>
                            <p style="color: #999; font-size: 12px;">
                                Ce code est valable pendant 10 minutes.<br>
                                Si vous n'avez pas demandé ce code, ignorez cet email.
                            </p>
                        </div>
                    </div>
                </div>
            `
        });
        
        console.log(`🔐 Code MFA envoyé à ${user.email}`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erreur envoi code MFA:', error);
        res.status(500).json({ error: error.message });
    }
});

// Vérifier un code MFA
app.post('/api/mfa/verify', async (req, res) => {
    const { userId, code, profile } = req.body;
    
    try {
        // Vérifier d'abord si c'est un code email
        const emailCode = await new Promise((resolve, reject) => {
            database.get(
                `SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > datetime('now')`,
                [userId, code],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        let valid = false;
        
        if (emailCode) {
            valid = true;
            // Supprimer le code utilisé
            await new Promise((resolve, reject) => {
                database.run(`DELETE FROM mfa_codes WHERE user_id = ?`, [userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } else {
            // Essayer TOTP
            const user = await new Promise((resolve, reject) => {
                database.get(`SELECT totp_secret FROM users WHERE id = ?`, [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (user && user.totp_secret) {
                valid = verifyTotp(user.totp_secret, code);
            }
        }
        
        if (!valid) {
            return res.status(401).json({ error: 'Code invalide ou expiré' });
        }
        
        // Enregistrer la validation MFA
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO mfa_validations (user_id, validated_at) VALUES (?, datetime('now'))`,
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Récupérer l'utilisateur et compléter le login
        const user = await new Promise((resolve, reject) => {
            database.get(
                `SELECT u.*, r.trigramme 
                 FROM users u 
                 LEFT JOIN resources r ON r.id = u.resource_id 
                 WHERE u.id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        await completeLogin(req, res, user, profile);
        
    } catch (error) {
        console.error('Erreur vérification MFA:', error);
        res.status(500).json({ error: error.message });
    }
});

// Vérifier le statut TOTP d'un utilisateur
app.get('/api/mfa/totp-status/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const configured = await isUserTotpConfigured(userId);
        res.json({ configured });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Configurer TOTP pour un utilisateur
app.post('/api/mfa/totp-setup', async (req, res) => {
    const { userId } = req.body;
    
    try {
        // Récupérer l'utilisateur
        const user = await new Promise((resolve, reject) => {
            database.get(`SELECT username, email FROM users WHERE id = ?`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        // Générer la clé secrète
        const secret = generateTotpSecret();
        
        // Générer l'URL otpauth
        const otpauthUrl = `otpauth://totp/Planning%20ANS:${encodeURIComponent(user.username)}?secret=${secret}&issuer=Planning%20ANS`;
        
        // Générer le QR code
        const qrCode = await QRCode.toDataURL(otpauthUrl);
        
        res.json({
            secret: secret,
            qrCode: qrCode
        });
        
    } catch (error) {
        console.error('Erreur setup TOTP:', error);
        res.status(500).json({ error: error.message });
    }
});

// Confirmer la configuration TOTP
app.post('/api/mfa/totp-confirm', async (req, res) => {
    const { userId, secret, code, profile } = req.body;
    
    try {
        // Vérifier le code
        if (!verifyTotp(secret, code)) {
            return res.status(401).json({ error: 'Code invalide' });
        }
        
        // Sauvegarder le secret
        await new Promise((resolve, reject) => {
            database.run(
                `UPDATE users SET totp_secret = ? WHERE id = ?`,
                [secret, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Enregistrer la validation MFA
        await new Promise((resolve, reject) => {
            database.run(
                `INSERT INTO mfa_validations (user_id, validated_at) VALUES (?, datetime('now'))`,
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Récupérer l'utilisateur et compléter le login
        const user = await new Promise((resolve, reject) => {
            database.get(
                `SELECT u.*, r.trigramme 
                 FROM users u 
                 LEFT JOIN resources r ON r.id = u.resource_id 
                 WHERE u.id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        console.log(`🔐 TOTP configuré pour l'utilisateur ${userId}`);
        await completeLogin(req, res, user, profile);
        
    } catch (error) {
        console.error('Erreur confirmation TOTP:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== FIN ROUTES MFA ==========

// ========== ROUTE DEBUG JOBS ==========

// Récupérer les logs d'un job de debug
app.get('/api/debug-job/:jobId', requireAuth, (req, res) => {
    const { jobId } = req.params;
    const job = debugJobs.get(jobId);
    
    if (!job) {
        return res.status(404).json({ error: 'Job non trouvé ou expiré' });
    }
    
    res.json({
        status: job.status,
        logs: job.logs,
        result: job.result
    });
});

// Route catch-all pour servir index.html (doit être la DERNIÈRE route API)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serveur Ecoute
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`👤 Compte admin: admin / Admin2025!`);
    console.log(`⏰ Automatisations programmées actives`);
    
    // Préchauffer la connexion SMTP après 5 secondes (laisser le temps à la config de se charger)
    setTimeout(async () => {
        await warmupSMTPConnection();
    }, 5000);
});

// Fonction pour préchauffer la connexion SMTP
async function warmupSMTPConnection() {
    console.log('📧 Préchauffage connexion SMTP...');
    
    if (!emailConfig.user || !emailConfig.password) {
        console.log('📧 Configuration SMTP non disponible, warmup ignoré');
        return;
    }
    
    try {
        const transporter = createEmailTransporter();
        if (transporter) {
            // Vérifier la connexion sans envoyer d'email
            await transporter.verify();
            console.log('✅ Connexion SMTP préchauffée et prête');
        }
    } catch (error) {
        console.log('⚠️ Warmup SMTP échoué (normal si config pas encore chargée):', error.message);
    }
}

// Garder la connexion SMTP active en faisant un verify périodique
setInterval(async () => {
    if (emailConfig.user && emailConfig.password && emailTransporterCache) {
        try {
            await emailTransporterCache.verify();
            console.log('📧 Connexion SMTP maintenue active');
        } catch (error) {
            console.log('📧 Connexion SMTP perdue, sera recréée au prochain envoi');
            emailTransporterCache = null;
            emailTransporterConfigHash = null;
        }
    }
}, 5 * 60 * 1000); // Toutes les 5 minutes

// Protection contre les crash silencieux
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection:', reason);
    console.error('⚠️ Stack:', reason?.stack || 'no stack');
});

process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
    console.error('🔥 Stack:', err?.stack || 'no stack');
    // NE PAS process.exit() - on veut que le serveur continue
});
