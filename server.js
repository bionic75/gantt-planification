import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialiser la base de données SQLite
const db = new sqlite3.Database('data.db', (err) => {
    if (err) {
        console.error('Erreur connexion DB:', err);
    } else {
        console.log('Connecté à SQLite');
        initDB();
    }
});

// Initialiser les tables
function initDB() {
    db.run(`
        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            trigramme TEXT NOT NULL,
            email TEXT NOT NULL,
            taux REAL NOT NULL,
            samu TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS schedule_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            date_key TEXT NOT NULL,
            type TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(resource_id, date_key, type)
        )
    `);
}

// ==================== API RESSOURCES ====================

// GET toutes les ressources
app.get('/api/resources', (req, res) => {
    db.all('SELECT * FROM resources ORDER BY prenom', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// POST nouvelle ressource
app.post('/api/resources', (req, res) => {
    const { nom, prenom, trigramme, email, taux, samu } = req.body;
    
    const stmt = db.prepare(`
        INSERT INTO resources (nom, prenom, trigramme, email, taux, samu)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([nom, prenom, trigramme, email, taux, samu], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, nom, prenom, trigramme, email, taux, samu });
        }
    });
});

// DELETE ressource
app.delete('/api/resources/:id', (req, res) => {
    const id = req.params.id;
    
    db.run('DELETE FROM resources WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            db.run('DELETE FROM schedule_data WHERE resource_id = ?', [id], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ success: true });
                }
            });
        }
    });
});

// ==================== API PLANIFICATION ====================

// GET toutes les données de planification
app.get('/api/schedule', (req, res) => {
    db.all('SELECT * FROM schedule_data', (err, rows) => {
        if (err) {
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

// POST/UPDATE données de planification
app.post('/api/schedule', (req, res) => {
    const scheduleData = req.body;
    
    const stmt = db.prepare(`
        INSERT INTO schedule_data (resource_id, date_key, type, value)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(resource_id, date_key, type) 
        DO UPDATE SET value = excluded.value
    `);
    
    let count = 0;
    for (const [key, value] of Object.entries(scheduleData)) {
        const parts = key.split('_');
        const resourceId = parts[0];
        const type = parts[1];
        const dateKey = parts.slice(2).join('_');
        
        stmt.run([resourceId, dateKey, type, value], (err) => {
            if (err) console.error('Erreur insert:', err);
        });
        count++;
    }
    
    res.json({ success: true, saved: count });
});

// ==================== API EXPORT ====================

// GET export CSV resources
app.get('/api/export/resources', (req, res) => {
    db.all('SELECT * FROM resources ORDER BY prenom', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            let csv = 'Nom,Prénom,Trigramme,Email,Taux MAD (%),SAMU\n';
            (rows || []).forEach(r => {
                csv += `${r.nom},${r.prenom},${r.trigramme},${r.email},${r.taux},${r.samu}\n`;
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=ressources.csv');
            res.send(csv);
        }
    });
});

// GET export CSV calendrier
app.get('/api/export/gantt', (req, res) => {
    const { year, month } = req.query;
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    db.all('SELECT * FROM resources ORDER BY prenom', (err, resources) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        db.all('SELECT * FROM schedule_data', (err, scheduleRows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            const scheduleData = {};
            (scheduleRows || []).forEach(row => {
                const key = `${row.resource_id}_${row.type}_${row.date_key}`;
                scheduleData[key] = row.value;
            });

            const lastDay = new Date(year, month + 1, 0).getDate();
            let csv = `Calendrier de Planification - ${monthNames[month]} ${year}\n\n`;
            
            csv += 'Ressource,Nb jours Dispo,Jours MAD attendus';
            for (let day = 1; day <= lastDay; day++) {
                csv += `,${day}`;
            }
            csv += '\n';

            resources.forEach(resource => {
                let dispoCount = 0;
                for (let day = 1; day <= lastDay; day++) {
                    const dateKey = `${year}-${month}-${day}`;
                    const key = `${resource.id}_available_${dateKey}`;
                    if (scheduleData[key] === '2') dispoCount++;
                }

                const totalWorkDays = countWorkDays(year, month);
                const expectedDays = (totalWorkDays * resource.taux / 100).toFixed(1);

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
            csv += 'AFFECTATION,1,En attente d\'affectation\n';
            csv += 'AFFECTATION,2,SAMU (Déploiement)\n';
            csv += 'AFFECTATION,3,SAMU (Dev. usages)\n';
            csv += 'AFFECTATION,4,ANS (Déploiement)\n';
            csv += 'AFFECTATION,5,ANS (Dev. usages)\n';
            csv += 'AFFECTATION,6,Qualification\n';
            csv += 'AFFECTATION,7,Divers\n';

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=gantt_${monthNames[month]}_${year}.csv`);
            res.send(csv);
        });
    });
});

// Fonction utilitaire
function countWorkDays(year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    let workDays = 0;
    for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            workDays++;
        }
    }
    return workDays;
}

// Serveur écoute
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
