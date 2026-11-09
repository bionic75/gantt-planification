// Analyse de fichiers › fichier conservé dans le navigateur (IndexedDB « analyseLocalFile », magasin « files », clé
// « last » : base de l'ancien écran, un fichier déjà conservé reste disponible)
const BASE = 'analyseLocalFile';
const MAGASIN = 'files';
const CLE = 'last';

export interface FichierConserve {
    name: string;
    buffer: ArrayBuffer;
    savedAt: number;
}

function ouvrir(): Promise<IDBDatabase> {
    return new Promise((resoudre, rejeter) => {
        const r = indexedDB.open(BASE, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
        r.onsuccess = () => resoudre(r.result);
        r.onerror = () => rejeter(r.error);
    });
}

async function transaction<T>(mode: IDBTransactionMode, action: (m: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const base = await ouvrir();
    return new Promise((resoudre, rejeter) => {
        const tx = base.transaction(MAGASIN, mode);
        const requete = action(tx.objectStore(MAGASIN));
        tx.oncomplete = () => {
            base.close();
            resoudre(requete.result);
        };
        tx.onerror = () => rejeter(tx.error);
    });
}

export const fichierConserve = {
    enregistrer: (name: string, buffer: ArrayBuffer) =>
        transaction('readwrite', m => m.put({ name, buffer, savedAt: Date.now() }, CLE)).then(() => undefined),
    lire: () => transaction<FichierConserve | undefined>('readonly', m => m.get(CLE)).then(r => r ?? null),
    supprimer: () => transaction('readwrite', m => m.delete(CLE)).then(() => undefined)
};
