// Suivi des serveurs de test : aucun processus ne doit survivre à son lanceur (un serveur orphelin tourne à 100 % de
// CPU). Chaque serveur lancé est enregistré (un fichier par PID dans os.tmpdir()), tué à la fin de la série, à
// l'arrêt du lanceur, et les orphelins des séries précédentes sont nettoyés au démarrage.
import { execFileSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const POSIX = process.platform !== 'win32';
const SUIVI = path.join(os.tmpdir(), 'gantt-test-pids');
/** Série en cours : posée par global-setup (processus principal), héritée par les processus de test */
const SERIE = () => process.env.GANTT_TEST_SERIE || String(process.pid);
const lances = new Set<ChildProcess>();

const vivant = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
};

/** Enregistre un serveur lancé ; il est oublié dès qu'il se termine */
export function enregistrerServeur(proc: ChildProcess) {
    if (!proc.pid) return;
    lances.add(proc);
    fs.mkdirSync(SUIVI, { recursive: true });
    const fichier = path.join(SUIVI, String(proc.pid));
    fs.writeFileSync(fichier, SERIE());
    proc.once('exit', () => {
        lances.delete(proc);
        fs.rmSync(fichier, { force: true });
    });
}

const tuerLances = () => lances.forEach(p => p.kill('SIGKILL'));
// Arrêt du lanceur : serveurs tués avant de partir (SIGKILL du lanceur : chien de garde du serveur)
process.on('exit', tuerLances);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        tuerLances();
        process.kill(process.pid, signal);
    });
}

/** Tue les serveurs enregistrés par la série en cours (fin de série, processus de test déjà arrêtés) */
export function tuerServeursDeLaSerie() {
    if (!fs.existsSync(SUIVI)) return;
    for (const nom of fs.readdirSync(SUIVI)) {
        const fichier = path.join(SUIVI, nom);
        if (fs.readFileSync(fichier, 'utf8') !== SERIE()) continue;
        if (vivant(Number(nom))) process.kill(Number(nom), 'SIGKILL');
        fs.rmSync(fichier, { force: true });
    }
}

/** Répertoire de travail d'un processus (lsof), null s'il est inconnu */
function repertoireDe(pid: number) {
    try {
        const sortie = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], { encoding: 'utf8' });
        return (
            sortie
                .split('\n')
                .find(l => l.startsWith('n'))
                ?.slice(1) ?? null
        );
    } catch {
        return null;
    }
}

/** Processus en cours (ps portable macOS / Linux) ; liste vide si ps est indisponible : le nettoyage reste facultatif */
function listeProcessus() {
    try {
        return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n');
    } catch {
        return [];
    }
}

/**
 * Au démarrage d'une série : tue les serveurs de tests précédents devenus orphelins, c'est-à-dire parent launchd/init
 * (PPID 1), « server.ts » du projet et répertoire de travail gantt-test-* dans os.tmpdir(). Aucun autre processus n'est
 * touché (serveur de développement compris).
 */
export function nettoyerOrphelins() {
    if (!POSIX) return;
    const racine = fs.realpathSync(os.tmpdir());
    const serveur = path.resolve(import.meta.dirname, '../../server.ts');
    const lignes = listeProcessus();
    for (const ligne of lignes) {
        const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(ligne);
        if (!m || m[2] !== '1' || !m[3].endsWith(` ${serveur}`)) continue;
        const cwd = repertoireDe(Number(m[1]));
        if (cwd && path.dirname(cwd) === racine && path.basename(cwd).startsWith('gantt-test-')) {
            process.kill(Number(m[1]), 'SIGKILL');
        }
    }
    fs.rmSync(SUIVI, { recursive: true, force: true });
}

/** Répertoires gantt-test-* et gantt-test-template-* laissés par d'anciennes exécutions (plus d'une heure) */
export function supprimerDossiersPerimes() {
    const limite = Date.now() - 60 * 60 * 1000;
    for (const nom of fs.readdirSync(os.tmpdir())) {
        if (!nom.startsWith('gantt-test-')) continue;
        const dossier = path.join(os.tmpdir(), nom);
        try {
            if (fs.statSync(dossier).mtimeMs < limite) {
                fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            }
        } catch {
            /* déjà supprimé */
        }
    }
}
