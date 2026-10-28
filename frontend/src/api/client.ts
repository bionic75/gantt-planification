// Client de l'API de l'application (/api) : session par cookie, corps JSON, erreurs typées
import { emettre } from '@/liaison';

/** Erreur renvoyée par l'API : statut HTTP et message du serveur ({ error }) */
export class ErreurApi extends Error {
    constructor(
        readonly statut: number,
        message: string,
        readonly donnees: unknown = null
    ) {
        super(message);
        this.name = 'ErreurApi';
    }
}

/** Réponses du serveur signalant une session absente ou fermée */
const SESSIONS_FERMEES = ['Non authentifié', 'SESSION_TERMINATED'];

type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function appel<T>(methode: Methode, chemin: string, corps?: unknown): Promise<T> {
    const reponse = await fetch(`/api${chemin}`, {
        method: methode,
        credentials: 'include',
        headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: corps === undefined ? undefined : JSON.stringify(corps)
    });
    const texte = await reponse.text();
    let donnees: unknown = null;
    if (texte) {
        try {
            donnees = JSON.parse(texte);
        } catch {
            donnees = texte;
        }
    }
    if (!reponse.ok) {
        const erreur = (donnees as { error?: string; message?: string } | null)?.error;
        if (reponse.status === 401 && erreur && SESSIONS_FERMEES.includes(erreur)) {
            emettre('session-perdue', { message: (donnees as { message?: string }).message });
        }
        throw new ErreurApi(reponse.status, erreur || `Erreur ${reponse.status}`, donnees);
    }
    return donnees as T;
}

export const api = {
    get: <T>(chemin: string) => appel<T>('GET', chemin),
    post: <T>(chemin: string, corps: unknown = {}) => appel<T>('POST', chemin, corps),
    put: <T>(chemin: string, corps: unknown = {}) => appel<T>('PUT', chemin, corps),
    patch: <T>(chemin: string, corps: unknown = {}) => appel<T>('PATCH', chemin, corps),
    delete: <T>(chemin: string) => appel<T>('DELETE', chemin)
};
