import { afterEach, describe, expect, it, vi } from 'vitest';
import { ecouter } from '@/liaison';
import { api, ErreurApi } from './client';

/** Réponse du serveur simulée pour le prochain appel */
function repondre(statut: number, corps: unknown) {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(corps), { status: statut }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("client de l'API", () => {
    it('envoie le corps en JSON avec le cookie de session et renvoie la réponse', async () => {
        const fetch = repondre(200, { id: 3 });
        expect(await api.post<{ id: number }>('/poi', { name: 'Lieu' })).toEqual({ id: 3 });
        expect(fetch).toHaveBeenCalledWith('/api/poi', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: '{"name":"Lieu"}'
        });
    });

    it('erreur du serveur : statut et message', async () => {
        repondre(403, { error: 'Accès refusé' });
        const erreur = await api.get('/users').catch((e: unknown) => e);
        expect(erreur).toBeInstanceOf(ErreurApi);
        expect(erreur).toMatchObject({ statut: 403, message: 'Accès refusé' });
    });

    it('session fermée (401) : signalée à la liaison', async () => {
        const recus: unknown[] = [];
        const arreter = ecouter('session-perdue', d => recus.push(d));
        repondre(401, { error: 'SESSION_TERMINATED', message: 'Session fermée' });
        await expect(api.get('/resources')).rejects.toMatchObject({ statut: 401 });
        expect(recus).toEqual([{ message: 'Session fermée' }]);

        // Autre refus 401 (code MFA invalide…) : pas une fin de session
        repondre(401, { error: 'Code invalide' });
        await expect(api.post('/mfa/verify')).rejects.toMatchObject({ statut: 401 });
        expect(recus).toHaveLength(1);
        arreter();
    });
});
