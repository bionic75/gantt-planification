// Processus lanceur des tests d'orphelins (processus-orphelins.test.ts) : démarre un serveur de test puis attend d'être
// tué. Affiche « <pid du serveur> <répertoire de travail> » une fois le serveur prêt.
import { createWorkDir, startServer } from '../helpers/server.ts';

const workDir = createWorkDir();
const server = await startServer({ workDir });
console.log(`${server.pid} ${workDir}`);
setInterval(() => {}, 1000);
