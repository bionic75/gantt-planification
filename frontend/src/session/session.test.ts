import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ecouter, emettre } from '@/evenements';
import {
    deconnecter,
    etatSession,
    forcerFinSession,
    installerSurveillanceSession,
    MESSAGE_ECHEC_DECONNEXION,
    MESSAGE_SESSION_EXPIREE,
    MESSAGE_SESSION_FERMEE
} from './session';

const reponse = (statut: number, corps: unknown = {}) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

let serveur: ReturnType<typeof vi.fn>;
let arreter: () => void = () => {};
let messages: (string | undefined)[] = [];
let arretMire: () => void = () => {};

beforeEach(() => {
    vi.useFakeTimers();
    serveur = vi.fn(async () => reponse(200));
    vi.stubGlobal('fetch', serveur);
    vi.stubGlobal('scrollTo', () => {});
    arreter = installerSurveillanceSession();
    messages = [];
    arretMire = ecouter('mire-affichee', d => messages.push(d?.message));
    emettre('session-ouverte', { utilisateur: {} as never, reprise: true });
});

afterEach(() => {
    // Garde des fins simultanées levée avant le test suivant
    vi.advanceTimersByTime(6000);
    arreter();
    arretMire();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('session perdue', () => {
    it('401 « Non authentifié » : mire avec le message d’expiration', async () => {
        serveur.mockResolvedValueOnce(reponse(401, { error: 'Non authentifié' }));
        await fetch('/api/resources');
        expect(etatSession.ouverte).toBe(false);
        expect(messages).toEqual([MESSAGE_SESSION_EXPIREE]);
    });

    it('401 « SESSION_TERMINATED » : mire avec le message de fermeture par un administrateur', async () => {
        serveur.mockResolvedValueOnce(reponse(401, { error: 'SESSION_TERMINATED' }));
        await fetch('/api/resources');
        expect(messages).toEqual([MESSAGE_SESSION_FERMEE]);
    });

    it('adresses de la connexion et refus sans session ignorés', async () => {
        serveur.mockResolvedValueOnce(reponse(401, { error: 'Non authentifié' }));
        await fetch('/api/login');
        expect(etatSession.ouverte).toBe(true);
        emettre('session-absente');
        serveur.mockResolvedValueOnce(reponse(401, { error: 'Non authentifié' }));
        await fetch('/api/resources');
        expect(messages).toEqual([]);
    });

    it('403 : session vérifiée auprès du serveur, au plus toutes les 5 s', async () => {
        serveur.mockResolvedValueOnce(reponse(403)).mockResolvedValueOnce(reponse(200));
        await fetch('/api/admin');
        await vi.advanceTimersByTimeAsync(0);
        expect(serveur).toHaveBeenCalledWith('/api/check-session', { credentials: 'include' });
        expect(etatSession.ouverte).toBe(true);
        serveur.mockResolvedValueOnce(reponse(403));
        await fetch('/api/admin');
        expect(serveur).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(5000);
        serveur.mockResolvedValueOnce(reponse(403)).mockResolvedValueOnce(reponse(401));
        await fetch('/api/admin');
        await vi.advanceTimersByTimeAsync(0);
        expect(messages).toEqual([MESSAGE_SESSION_EXPIREE]);
    });

    it('fins simultanées : une seule ; refus du client de l’API : message du serveur', () => {
        const fins: unknown[] = [];
        const arret = ecouter('session-terminee', () => fins.push(1));
        emettre('session-perdue', { message: 'Session expirée' });
        forcerFinSession('autre');
        arret();
        expect(fins).toHaveLength(1);
        expect(messages).toEqual(['Session expirée']);
    });
});

describe('déconnexion', () => {
    it('écran d’attente puis mire', async () => {
        const attente = deconnecter();
        expect(etatSession.deconnexion).toBe(true);
        await attente;
        expect(serveur).toHaveBeenCalledWith('/api/logout', { method: 'POST', credentials: 'include' });
        expect(etatSession.deconnexion).toBe(false);
        expect(etatSession.ouverte).toBe(false);
        expect(messages).toEqual([undefined]);
    });

    it('échec : message affiché, session gardée', async () => {
        serveur.mockResolvedValueOnce(reponse(500));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await deconnecter();
        expect(etatSession.erreur).toBe(MESSAGE_ECHEC_DECONNEXION);
        expect(etatSession.ouverte).toBe(true);
    });
});
