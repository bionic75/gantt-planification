// @ts-check
// Connexions SQLite partagées par toute l'application (remplacées par Prisma en phase 2)
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { env } from '../config/env.js';

export const DB_DIR = env.DB_PATH;
export const DB_FILE = path.join(DB_DIR, 'data.db');

if (!fs.existsSync(DB_DIR)) {
    console.log('📁 Création du répertoire DB:', DB_DIR);
    fs.mkdirSync(DB_DIR, { recursive: true });
}
console.log('📊 Chemin base de données:', DB_FILE);

/** @type {(value?: unknown) => void} */
let markReady = () => {};
/** Résolue une fois la connexion ouverte et configurée */
export const databaseReady = new Promise(resolve => (markReady = resolve));

export const database = new sqlite3.Database(DB_FILE, err => {
    if (err) {
        console.error('Erreur connexion DB:', err);
        return;
    }
    // WAL : lectures et écritures concurrentes
    database.run('PRAGMA journal_mode = WAL', err => {
        if (err) console.error('❌ Erreur PRAGMA WAL:', err);
        else console.log('✅ SQLite WAL mode activé');
    });
    // Attendre 5 s au lieu d'échouer immédiatement sur SQLITE_BUSY
    database.run('PRAGMA busy_timeout = 5000', err => {
        if (err) console.error('❌ Erreur PRAGMA busy_timeout:', err);
        else console.log('✅ SQLite busy_timeout = 5000ms');
    });
    markReady();
});

// Connexion lecture seule dédiée aux lectures lourdes des tâches planifiées : en mode WAL,
// elle lit en parallèle des écritures sans bloquer la file d'opérations principale.
export const dbRead = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY, err => {
    if (err) console.error('❌ Erreur connexion dbRead:', err);
    else {
        dbRead.run('PRAGMA busy_timeout = 5000');
        console.log('✅ SQLite connexion lecture (dbRead) ouverte');
    }
});

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<any[]>}
 */
export const dbAll = (sql, params) =>
    new Promise((resolve, reject) => database.all(sql, params || [], (e, r) => (e ? reject(e) : resolve(r || []))));

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<any>}
 */
export const dbGet = (sql, params) =>
    new Promise((resolve, reject) => database.get(sql, params || [], (e, r) => (e ? reject(e) : resolve(r))));

/**
 * Résout avec l'objet Statement de sqlite3 ({ lastID, changes })
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<{ lastID: number, changes: number }>}
 */
export const dbRun = (sql, params) =>
    new Promise((resolve, reject) =>
        database.run(sql, params || [], function (e) {
            if (e) reject(e);
            else resolve(this);
        })
    );
