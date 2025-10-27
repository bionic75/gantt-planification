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

// Créer transporteur email
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
        }
    });
}

// Envoyer un email
async function sendEmail(to, subject, html) {
    const transporter = createEmailTransporter();
    
    if (!transporter) {
        throw new Error('Configuration email non définie');
    }

    try {
        const info = await transporter.sendMail({
            from: `"Planification GANTT" <${emailConfig.user}>`,
            to: to,
            subject: subject,
            html: html
        });
        
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Erreur envoi email:', error);
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
            email TEXT NOT NULL,
            telephone TEXT,
            taux REAL NOT NULL,
            samu TEXT NOT NULL,
            actif INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Erreur création table resources:', err);
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
            role TEXT DEFAULT 'user',
            actif INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Erreur création table users:', err);
        } else {
            database.get('SELECT * FROM users WHERE role = ?', ['admin'], (err, row) => {
                if (!row) {
                    database.run(`
                        INSERT INTO users (username, password, nom, prenom, email, role)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, ['admin', hashPassword('Admin2025!'), 'Administrateur', 'Système', 'admin@example.com', 'admin'], (err) => {
                        if (err) {
                            console.error('Erreur création admin:', err);
                        } else {
                            console.log('✅ Compte admin créé: admin / Admin2025!');
                        }
                    });
                }
            });
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
    if (req.session && req.session.userId && req.session.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Accès refusé - Admin uniquement' });
    }
}

// ==================== API AUTHENTIFICATION ====================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username et password requis' });
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
            
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            req.session.nom = user.nom;
            req.session.prenom = user.prenom;
            
            res.json({ 
                success: true, 
                user: { 
                    id: user.id,
                    username: user.username,
                    nom: user.nom,
                    prenom: user.prenom,
                    role: user.role
                }
            });
        }
    );
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur déconnexion' });
        }
        res.json({ success: true });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            authenticated: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                nom: req.session.nom,
                prenom: req.session.prenom,
                role: req.session.role
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

// ==================== API UTILISATEURS (ADMIN) ====================

app.get('/api/users', requireAdmin, (req, res) => {
    database.all('SELECT id, username, nom, prenom, email, role, actif, created_at FROM users ORDER BY nom', (err, rows) => {
        if (err) {
            console.error('Erreur GET users:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, nom, prenom, email, role, sendEmail: shouldSendEmail } = req.body;
    
    if (!username || !password || !nom || !prenom || !email) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const hashedPassword = hashPassword(password);

    database.run(
        `INSERT INTO users (username, password, nom, prenom, email, role, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, nom, prenom, email, role || 'user', 1],
        async function(err) {
            if (err) {
                console.error('Erreur INSERT user:', err);
                if (err.message.includes('UNIQUE')) {
                    res.status(400).json({ error: 'Ce username existe déjà' });
                } else {
                    res.status(500).json({ error: err.message });
                }
            } else {
                const response = { 
                    success: true,
                    id: this.lastID
                };

                if (shouldSendEmail) {
                    try {
                        await sendEmail(
                            email,
                            'Vos identifiants de connexion - Planification GANTT',
                            `
                            <h2>Bienvenue ${prenom} ${nom} !</h2>
                            <p>Votre compte a été créé sur la plateforme de planification GANTT.</p>
                            <p><strong>Vos identifiants de connexion :</strong></p>
                            <ul>
                                <li><strong>Login :</strong> ${username}</li>
                                <li><strong>Mot de passe :</strong> ${password}</li>
                            </ul>
                            <p>Vous pouvez vous connecter à l'application.</p>
                            <p><em>Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe dès votre première connexion.</em></p>
                            `
                        );
                        response.emailSent = true;
                    } catch (emailError) {
                        console.error('Erreur envoi email:', emailError);
                        response.emailError = emailError.message;
                    }
                }

                res.json(response);
            }
        }
    );
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    const { nom, prenom, email, role } = req.body;
    
    database.run(
        `UPDATE users 
         SET nom = ?, prenom = ?, email = ?, role = ?
         WHERE id = ?`,
        [nom, prenom, email, role, id],
        function(err) {
            if (err) {
                console.error('Erreur UPDATE user:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.post('/api/users/:id/reset-password', requireAdmin, (req, res) => {
    const id = req.params.id;
    const { newPassword } = req.body;
    
    if (!newPassword) {
        return res.status(400).json({ error: 'Nouveau mot de passe requis' });
    }

    const hashedPassword = hashPassword(newPassword);
    
    database.run(
        `UPDATE users SET password = ? WHERE id = ?`,
        [hashedPassword, id],
        function(err) {
            if (err) {
                console.error('Erreur reset password:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.post('/api/users/:id/toggle', requireAdmin, (req, res) => {
    const id = req.params.id;
    
    database.run(
        `UPDATE users 
         SET actif = CASE WHEN actif = 1 THEN 0 ELSE 1 END
         WHERE id = ?`,
        [id],
        function(err) {
            if (err) {
                console.error('Erreur toggle user:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    
    database.get('SELECT COUNT(*) as count FROM users WHERE role = ? AND actif = 1', ['admin'], (err, result) => {
        if (err || result.count <= 1) {
            return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur' });
        }
        
        database.run('DELETE FROM users WHERE id = ?', [id], function(err) {
            if (err) {
                console.error('Erreur DELETE user:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        });
    });
});

// ==================== API RESSOURCES ====================

app.get('/api/resources', requireAuth, (req, res) => {
    database.all('SELECT * FROM resources ORDER BY prenom', (err, rows) => {
        if (err) {
            console.error('Erreur GET resources:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

app.post('/api/resources', requireAuth, (req, res) => {
    const { nom, prenom, trigramme, email, telephone, taux, samu, actif } = req.body;
    
    if (!nom || !prenom || !trigramme || !email || !taux || !samu) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    database.run(
        `INSERT INTO resources (nom, prenom, trigramme, email, telephone, taux, samu, actif)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nom, prenom, trigramme, email, telephone || null, taux, samu, actif || 1],
        function(err) {
            if (err) {
                console.error('Erreur INSERT resources:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ 
                    id: this.lastID, 
                    nom, prenom, trigramme, email, telephone, taux, samu, 
                    actif: actif || 1 
                });
            }
        }
    );
});

app.put('/api/resources/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    const { nom, prenom, email, telephone, taux, samu } = req.body;
    
    database.run(
        `UPDATE resources 
         SET nom = ?, prenom = ?, email = ?, telephone = ?, taux = ?, samu = ?
         WHERE id = ?`,
        [nom, prenom, email, telephone || null, taux, samu, id],
        function(err) {
            if (err) {
                console.error('Erreur UPDATE resources:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.post('/api/resources/:id/toggle', requireAuth, (req, res) => {
    const id = req.params.id;
    
    database.run(
        `UPDATE resources 
         SET actif = CASE WHEN actif = 1 THEN 0 ELSE 1 END
         WHERE id = ?`,
        [id],
        function(err) {
            if (err) {
                console.error('Erreur toggle actif:', err);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

app.delete('/api/resources/:id', requireAuth, (req, res) => {
    const id = req.params.id;
    
    database.run('DELETE FROM resources WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Erreur DELETE resources:', err);
            res.status(500).json({ error: err.message });
        } else {
            database.run('DELETE FROM schedule_data WHERE resource_id = ?', [id], function(err) {
                if (err) {
                    console.error('Erreur DELETE schedule_data:', err);
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ success: true });
                }
            });
        }
    });
});

// ==================== API PLANIFICATION ====================

app.get('/api/schedule', requireAuth, (req, res) => {
    database.all('SELECT * FROM schedule_data', (err, rows) => {
        if (err) {
            console.error('Erreur GET schedule:', err);
            res.status(500).json({ error: err.message });
        } else {
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
    
    let completed = 0;
    let total = Object.keys(scheduleData).length;

    if (total === 0) {
        return res.json({ success: true, saved: 0 });
    }

    for (const [key, value] of Object.entries(scheduleData)) {
        const parts = key.split('_');
        if (parts.length < 3) continue;

        const resourceId = parts[0];
        const type = parts[1];
        const dateKey = parts.slice(2).join('_');
        
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
    }
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
    
    res.json({ success: true });
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

            database.all('SELECT id, username, nom, prenom, email, role, actif, created_at FROM users ORDER BY id', (err3, users) => {
                if (err3) {
                    return res.status(500).json({ error: err3.message });
                }

                let csv = `BACKUP COMPLET BASE DE DONNÉES - ${new Date().toLocaleString('fr-FR')}\n\n`;
                
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
                csv += 'id,username,nom,prenom,email,role,actif,created_at\n';
                users.forEach(u => {
                    csv += `${u.id},"${u.username}","${u.nom}","${u.prenom}","${u.email}","${u.role}",${u.actif},"${u.created_at}"\n`;
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

// Serveur écoute
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
    console.log(`🔐 Compte admin: admin / Admin2025!`);
});