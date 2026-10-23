// Point d'entrée : création du schéma de la base (initDB, remplacé par les migrations Prisma en phase 2),
// application Express (src/app.js, routes dans src/modules), tâches de fond et démarrage du serveur HTTP.
import { env as appEnv } from './src/config/env.js';
import fs from 'fs';
import { registerDumpRoutes } from './db-dump.js';
import { createApp, finalizeApp } from './src/app.js';
import { database, databaseReady, dbRun, DB_DIR, DB_FILE } from './src/db/database.js';
import { startScheduler } from './src/jobs/scheduler.js';
import { hashPassword } from './src/lib/password.js';
import { emailConfig, setEmailConfig } from './src/lib/mailer.js';
import { requireAdmin } from './src/middlewares/auth.js';
import { evtSeedTypes } from './src/modules/events/events.service.js';
import { logUserAction } from './src/services/action-log.js';
import {
    getReusableTransporter,
    resetReusableTransporter,
    startEmailQueueWorker
} from './src/services/email-queue.js';

const app = createApp();
const PORT = appEnv.PORT;

databaseReady.then(() => initDB());

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
                const contactsRhCol = columns.find(col => col.name === 'contacts_rh');
                if (!contactsRhCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN contacts_rh TEXT`);
                    console.log('Migration: Ajout colonne contacts_rh à resources');
                }
                const madVolanteCol = columns.find(col => col.name === 'is_mad_volante');
                if (!madVolanteCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN is_mad_volante INTEGER DEFAULT 0`);
                    console.log('Migration: Ajout colonne is_mad_volante à resources');
                }
                const dateFinMadCol = columns.find(col => col.name === 'date_fin_mad');
                if (!dateFinMadCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN date_fin_mad TEXT`);
                    console.log('Migration: Ajout colonne date_fin_mad à resources');
                }
                const joursMaxMadCol = columns.find(col => col.name === 'jours_max_mad');
                if (!joursMaxMadCol) {
                    database.run(`ALTER TABLE resources ADD COLUMN jours_max_mad INTEGER`);
                    console.log('Migration: Ajout colonne jours_max_mad à resources');
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

                    // Migration: ajouter is_rh si elle n'existe pas
                    const rhCol = columns.find(col => col.name === 'is_rh');
                    if (!rhCol) {
                        database.run(`ALTER TABLE users ADD COLUMN is_rh INTEGER DEFAULT 0`);
                        console.log('Migration: Ajout colonne is_rh à users');
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
            
            database.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, row) => {
                if (!row) {
                    const hashedPwd = await hashPassword('Admin2025!');
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
                    setEmailConfig({
                        host: row.host,
                        port: row.port,
                        secure: row.secure === 1,
                        user: row.user,
                        password: row.password
                    });
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
            database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('help_publication_enabled', 'false')`);
            database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('help_publication_version', '')`);
            console.log('✅ Table settings initialisée');
        }
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS pending_push_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            to_user_id INTEGER NOT NULL,
            from_user_id INTEGER NOT NULL,
            from_name TEXT,
            from_photo TEXT,
            message TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (to_user_id) REFERENCES users(id),
            FOREIGN KEY (from_user_id) REFERENCES users(id)
        )
    `, err => { if (err) console.error('Erreur création table pending_push_messages:', err); });

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

    // Table pour les affectations SAMU multiples (expert principal / secondaire) par ressource
    database.run(`
        CREATE TABLE IF NOT EXISTS resource_samu_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            samu TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('principal','secondaire')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(resource_id, samu),
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table resource_samu_assignments:', err);
        } else {
            console.log('✅ Table resource_samu_assignments créée');
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

    // Jetons de réinitialisation de mot de passe (seule l'empreinte SHA-256 du jeton est stockée)
    database.run(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error('Erreur création table password_reset_tokens:', err);
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
            // Migration: stocker le BDC cible de régularisation
            database.run(`ALTER TABLE bons_commande ADD COLUMN regularisation_cible_bdc_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer si existe déjà
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
            // Migration: tracer l'origine/destination des lignes de régularisation technique
            database.run(`ALTER TABLE deplacements ADD COLUMN regularisation_source_bdc_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer si existe déjà
                }
            });
            database.run(`ALTER TABLE deplacements ADD COLUMN regularisation_cible_bdc_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    // Ignorer si existe déjà
                }
            });
        }
    });

    // Table des astreintes et HNO (avec migration pour ajouter activite_courante si besoin)
    database.run(`
        CREATE TABLE IF NOT EXISTS astreintes_hno (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('astreinte', 'hno', 'activite_courante')),
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
    // Migration astreintes_hno : ajouter le type 'activite_courante' au CHECK si absent
    database.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='astreintes_hno'`, (err, row) => {
        if (err || !row) return; // table absente ou erreur : CREATE TABLE IF NOT EXISTS suffit
        if (row.sql.includes('activite_courante')) return; // déjà migré

        // Table existante sans 'activite_courante' → recréer avec serialize() pour garantir l'ordre
        console.log('🔄 Migration astreintes_hno : ajout du type activite_courante...');
        const newSchema = `
            CREATE TABLE astreintes_hno (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('astreinte', 'hno', 'activite_courante')),
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
            )`;
        database.serialize(() => {
            database.run(`BEGIN TRANSACTION`);
            database.run(`ALTER TABLE astreintes_hno RENAME TO astreintes_hno_backup`);
            database.run(newSchema);
            database.run(`INSERT INTO astreintes_hno SELECT * FROM astreintes_hno_backup`);
            database.run(`DROP TABLE astreintes_hno_backup`);
            database.run(`COMMIT`, e => {
                if (e) {
                    console.error('❌ Migration astreintes_hno échouée :', e.message);
                    database.serialize(() => {
                        database.run(`ROLLBACK`);
                        // Restaurer la table si elle a été renommée mais pas recréée
                        database.get(`SELECT name FROM sqlite_master WHERE name='astreintes_hno_backup'`, (e2, r) => {
                            if (r) {
                                database.serialize(() => {
                                    database.run(`DROP TABLE IF EXISTS astreintes_hno`);
                                    database.run(`ALTER TABLE astreintes_hno_backup RENAME TO astreintes_hno`, e3 => {
                                        if (!e3) console.log('✅ Table astreintes_hno restaurée depuis backup après échec migration');
                                    });
                                });
                            }
                        });
                    });
                } else {
                    console.log('✅ Migration astreintes_hno réussie : type activite_courante ajouté');
                }
            });
        });
    });

    database.run(`
        CREATE TABLE IF NOT EXISTS cra (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            resource_id INTEGER,
            mois INTEGER NOT NULL,
            annee INTEGER NOT NULL,
            statut TEXT NOT NULL DEFAULT 'a_completer',
            commentaire_expert TEXT,
            submitted_at DATETIME,
            vise_n1_at DATETIME,
            vise_n1_by INTEGER,
            vise_n2_at DATETIME,
            vise_n2_by INTEGER,
            diffuse_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, mois, annee)
        )
    `);

    // Migration : email_batch_id sur cra_diffusion_log
    database.run(`ALTER TABLE cra_diffusion_log ADD COLUMN email_batch_id TEXT`, () => {});
    database.run(`ALTER TABLE email_queue ADD COLUMN pdf_attachment TEXT`, () => {});
    database.run(`ALTER TABLE email_queue ADD COLUMN pdf_filename TEXT`, () => {});
    database.run(`ALTER TABLE email_queue ADD COLUMN cc_emails TEXT`, () => {});
    // Migration : colonnes CRA (chaînées pour éviter SQLITE_BUSY)
    database.run(`ALTER TABLE cra ADD COLUMN modifie_admin_at TEXT`, () => {});
    database.run(`ALTER TABLE cra ADD COLUMN modifie_admin_nom TEXT`, () => {});
    database.run(`ALTER TABLE cra ADD COLUMN archived INTEGER DEFAULT 0`, () => {
        database.run(`ALTER TABLE cra ADD COLUMN rien_a_declarer INTEGER DEFAULT 0`, () => {
            database.run(`ALTER TABLE cra ADD COLUMN deleted INTEGER DEFAULT 0`, () => {
                database.run(`ALTER TABLE cra ADD COLUMN pre_delete_statut TEXT`, () => {
                    database.run(`ALTER TABLE cra ADD COLUMN pre_delete_archived INTEGER`, () => {});
                });
            });
        });
    });
    database.run(`ALTER TABLE cra ADD COLUMN pdf_filename TEXT`, () => {});
    // Créer le répertoire de stockage des PDFs CRA
    import('fs').then(({ mkdirSync }) => { try { mkdirSync('./data/pdfs', { recursive: true }); } catch(e) {} });

    database.run(`
        CREATE TABLE IF NOT EXISTS cra_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cra_id INTEGER NOT NULL,
            rang INTEGER NOT NULL,
            signer_user_id INTEGER,
            signer_name TEXT NOT NULL,
            signer_email TEXT NOT NULL,
            signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,
            token TEXT UNIQUE,
            token_used INTEGER DEFAULT 0,
            token_expires_at DATETIME,
            FOREIGN KEY (cra_id) REFERENCES cra(id) ON DELETE CASCADE
        )
    `);

    database.run(`
        CREATE TABLE IF NOT EXISTS cra_diffusion_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cra_id INTEGER NOT NULL,
            recipient_email TEXT NOT NULL,
            recipient_name TEXT,
            recipient_type TEXT DEFAULT 'rh_es',
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            email_batch_id TEXT,
            FOREIGN KEY (cra_id) REFERENCES cra(id) ON DELETE CASCADE
        )
    `);

    database.run(`
        CREATE TABLE IF NOT EXISTS cra_rh_recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            nom TEXT,
            UNIQUE(resource_id, email),
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
    `);

    database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('automation_4_config', '{"enabled":false,"day":1}')`);

    // Migration CRA : ajout colonne commentaire_refus
    database.all(`PRAGMA table_info(cra)`, [], (err, cols) => {
        if (!err && cols) {
            const names = cols.map(c => c.name);
            if (!names.includes('commentaire_refus')) {
                database.run(`ALTER TABLE cra ADD COLUMN commentaire_refus TEXT`);
            }
            if (!names.includes('refuse_at')) {
                database.run(`ALTER TABLE cra ADD COLUMN refuse_at DATETIME`);
            }
            if (!names.includes('refuse_by')) {
                database.run(`ALTER TABLE cra ADD COLUMN refuse_by INTEGER`);
            }
        }
    });
    
    // Table des localisations
    database.run(`
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            libelle_long TEXT NOT NULL UNIQUE,
            libelle_court TEXT NOT NULL,
            adresse TEXT,
            latitude REAL,
            longitude REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Erreur création table locations:', err);
        else console.log('✅ Table locations créée');
    });

    // Table clés API publiques
    database.run(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME,
            revoked INTEGER DEFAULT 0
        )
    `, (err) => {
        if (err) console.error('Erreur création table api_keys:', err);
        else console.log('✅ Table api_keys créée ou existante');
    });

    // Migration : ajouter location_id à custom_events si absente
    database.all(`PRAGMA table_info(custom_events)`, [], (err, columns) => {
        if (!err && columns) {
            const colNames = columns.map(c => c.name);
            if (!colNames.includes('location_id')) {
                database.run(`ALTER TABLE custom_events ADD COLUMN location_id INTEGER REFERENCES locations(id)`, (e) => {
                    if (e) console.error('Erreur migration location_id:', e);
                    else console.log('✅ Migration: location_id ajouté à custom_events');
                });
            }
            if (!colNames.includes('needs_resources')) {
                database.run(`ALTER TABLE custom_events ADD COLUMN needs_resources INTEGER DEFAULT 0`);
            }
            if (!colNames.includes('resources_count')) {
                database.run(`ALTER TABLE custom_events ADD COLUMN resources_count INTEGER DEFAULT 1`);
            }
        }
    });

    // Table file d'attente d'emails
    database.run(`
        CREATE TABLE IF NOT EXISTS app_user_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_key TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(app_key, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table app_user_access:', err);
        } else {
            console.log('✅ Table app_user_access créée');
            // Migration: copier les amoa_ced existants
            database.run(`
                INSERT OR IGNORE INTO app_user_access (app_key, user_id)
                SELECT 'deplacements', id FROM users WHERE amoa_ced = 1
            `, (migErr) => {
                if (migErr) console.error('Migration app_user_access:', migErr);
                else console.log('✅ Migration amoa_ced → app_user_access terminée');
            });

            // Application « Aide à l'affectation opérationnelle » : projets de déploiement de SAMU
            database.run(`
                CREATE TABLE IF NOT EXISTS affectation_projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    samu_name TEXT NOT NULL,
                    location_id INTEGER,
                    chef_projet_id INTEGER,
                    date_debut TEXT NOT NULL,
                    date_mise_en_service TEXT,
                    date_mise_en_production TEXT,
                    periods TEXT NOT NULL DEFAULT '{}',
                    created_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (tblErr) => { if (tblErr) console.error('Erreur création table affectation_projects:', tblErr); });
            database.run(`
                CREATE TABLE IF NOT EXISTS affectation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    samu_name TEXT,
                    user_id INTEGER,
                    user_name TEXT,
                    action TEXT NOT NULL,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (tblErr) => {
                if (tblErr) { console.error('Erreur création table affectation_history:', tblErr); return; }
                // L'index n'est créé qu'une fois la table disponible (les requêtes ne sont pas exécutées dans l'ordre)
                database.run(`CREATE INDEX IF NOT EXISTS idx_aff_hist_project ON affectation_history (project_id, id)`, e => { if (e) console.error('Erreur index affectation_history:', e.message); });
            });
            database.run(`
                CREATE TABLE IF NOT EXISTS affectation_assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    stage_key TEXT NOT NULL,
                    resource_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, stage_key, resource_id)
                )
            `, (tblErr) => { if (tblErr) console.error('Erreur création table affectation_assignments:', tblErr); });

            // Application « Aide à l'affectation opérationnelle » : accès initial pour les administrateurs (une seule fois,
            // pour que la nouvelle application soit visible ; les accès restent ensuite gérés dans l'administration)
            database.get(`SELECT value FROM settings WHERE key = 'app_affectation_seeded'`, (seedErr, seedRow) => {
                if (seedErr || seedRow) return;
                database.run(`
                    INSERT OR IGNORE INTO app_user_access (app_key, user_id)
                    SELECT 'affectation', id FROM users WHERE is_admin = 1
                `, (insErr) => {
                    if (insErr) return console.error('Accès initial application affectation:', insErr);
                    database.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('app_affectation_seeded', '1')`);
                    console.log('✅ Accès initial « Aide à l\'affectation opérationnelle » accordé aux administrateurs');
                });
            });
        }
    });

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
            pdf_attachment TEXT,
            pdf_filename TEXT,
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

registerDumpRoutes(app, {
    database, DB_FILE, DB_DIR, requireAdmin, logUserAction,
    afterRestore: () => evtSeedTypes(),
    reloadEmailConfig: () => {
        database.get('SELECT * FROM email_config WHERE id = 1', [], (err, row) => {
            if (row) setEmailConfig({ host: row.host, port: row.port, secure: row.secure === 1, user: row.user, password: row.password });
        });
    }
});

// Traitement périodique de la file (le worker enchaîne quand il y a des emails)
startEmailQueueWorker();

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
    
    // Migrations : ajouter les colonnes manquantes si besoin
    database.all("PRAGMA table_info(custom_events)", (pragmaErr, columns) => {
        if (pragmaErr) { console.error('Erreur PRAGMA custom_events:', pragmaErr); return; }
        if (!columns) return;
        const colNames = columns.map(c => c.name);
        if (!colNames.includes('created_by')) {
            database.run(`ALTER TABLE custom_events ADD COLUMN created_by INTEGER`, (e) => {
                if (e) console.error('Erreur migration created_by:', e);
                else console.log('✅ Migration: created_by ajouté à custom_events');
            });
        }
        if (!colNames.includes('period')) {
            database.run(`ALTER TABLE custom_events ADD COLUMN period TEXT DEFAULT 'FULL'`, (e) => {
                if (e) console.error('Erreur migration period:', e);
                else console.log('✅ Migration: period ajouté à custom_events');
            });
        }
        if (!colNames.includes('grist')) {
            database.run(`ALTER TABLE custom_events ADD COLUMN grist INTEGER DEFAULT 0`, (e) => {
                if (e) console.error('Erreur migration grist:', e);
                else console.log('✅ Migration: grist ajouté à custom_events');
            });
        }
        // Base neuve : ces colonnes sont normalement ajoutées par la migration des localisations, qui peut passer avant la création de la table
        [['location_id', 'INTEGER'], ['needs_resources', 'INTEGER DEFAULT 0'], ['resources_count', 'INTEGER DEFAULT 1']].forEach(([c, t]) => {
            if (!colNames.includes(c)) database.run(`ALTER TABLE custom_events ADD COLUMN ${c} ${t}`, e => { if (e && !/duplicate column/i.test(e.message)) console.error('Erreur migration ' + c + ':', e.message); });
        });
        if (!colNames.includes('type_id')) {
            database.run(`ALTER TABLE custom_events ADD COLUMN type_id INTEGER`, (e) => {
                if (e) console.error('Erreur migration type_id:', e);
                else console.log('✅ Migration: type_id ajouté à custom_events');
            });
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

database.run(`
    CREATE TABLE IF NOT EXISTS custom_event_external_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        nom TEXT,
        prenom TEXT,
        email TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES custom_events(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) console.error('Erreur création table custom_event_external_participants:', err);
    else console.log('✅ Table custom_event_external_participants créée ou existante');
});

// ========== TYPES D'ÉVÉNEMENTS (administrables) ==========
database.run(`
    CREATE TABLE IF NOT EXISTS event_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        label_long TEXT NOT NULL,
        label_short TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'tag',
        bg_color TEXT NOT NULL DEFAULT '#ffeb3b',
        text_color TEXT NOT NULL DEFAULT '#000000',
        border_color TEXT NOT NULL DEFAULT '#000000',
        is_other INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
    )
`, (err) => {
    if (err) { console.error('Erreur création table event_types:', err); return; }
    evtSeedTypes().then(() => console.log('✅ Table event_types créée ou existante'));
});

// ========== SAMU-SAS TripAdVisor : bonnes adresses (hébergement, restaurant, bar) rattachées aux localisations ==========
(async () => {
    try {
        await dbRun(`CREATE TABLE IF NOT EXISTS poi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            location_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            latitude REAL,
            longitude REAL,
            comment TEXT,
            website TEXT,
            phone TEXT,
            osm_ref TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS poi_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poi_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (poi_id, user_id)
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS poi_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poi_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await dbRun('CREATE INDEX IF NOT EXISTS idx_poi_location ON poi(location_id)');
        await dbRun('CREATE INDEX IF NOT EXISTS idx_poi_comments_poi ON poi_comments(poi_id)');
        console.log('✅ Tables TripAdVisor créées ou existantes');
    } catch (e) { console.error('Erreur création tables TripAdVisor:', e.message); }
})();

// Tâches planifiées
startScheduler();

// Fichiers statiques, page mobile, renvoi vers index.html et gestion des erreurs : après toutes les routes
finalizeApp(app);

// Serveur Ecoute — réessaie si le port n'est pas encore libéré par le process précédent
async function startServer(attempt = 1) {
    if (attempt > 3) {
        console.error(`❌ Impossible de démarrer après 3 tentatives. Libérez le port ${PORT} manuellement puis relancez.`);
        process.exit(1);
    }

    // Synchroniser la version de l'application depuis index.html → settings DB
    try {
        const htmlContent = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
        const vMatch = htmlContent.match(/<!--\s*(v[\d]+\.[\d]+\.[\d]+)\s*-->/);
        if (vMatch) {
            const appVersion = vMatch[1];
            database.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['app_version', appVersion], () => {
                console.log(`📦 Version application synchronisée : ${appVersion}`);
            });
        }
    } catch (e) {
        console.warn('⚠️  Impossible de lire la version depuis index.html :', e.message);
    }

    const server = app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
        console.log(`👤 Compte admin: admin / Admin2025!`);
        console.log(`⏰ Automatisations programmées actives`);
        setTimeout(async () => { await warmupSMTPConnection(); }, 5000);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${PORT} encore occupé — nouvelle tentative dans 2s...`);
            setTimeout(() => startServer(attempt + 1), 2000);
        } else {
            console.error('❌ Erreur serveur :', err);
            process.exit(1);
        }
    });
}

startServer();

// Fonction pour préchauffer la connexion SMTP (pool du worker uniquement)
async function warmupSMTPConnection() {
    console.log('📧 Préchauffage connexion SMTP (pool worker)...');
    
    if (!emailConfig.user || !emailConfig.password) {
        console.log('📧 Configuration SMTP non disponible, warmup ignoré');
        return;
    }
    
    try {
        const transporter = getReusableTransporter();
        if (transporter) {
            await transporter.verify();
            console.log('✅ Connexion SMTP préchauffée et prête');
        }
    } catch (error) {
        // En local sans accès réseau OVH : normal. Ne pas laisser le pool en état d'erreur.
        console.log('⚠️ Warmup SMTP échoué (normal si config pas encore chargée):', error.message);
        resetReusableTransporter();
    }
}

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
