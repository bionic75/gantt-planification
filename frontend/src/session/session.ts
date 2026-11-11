// Session de la page principale (lot 6.4b, repris de public/js/app/core.js) : application affichée tant qu'une session
// est ouverte (mire sinon), session perdue détectée sur toutes les réponses du serveur, fin de session (composants de la
// session démontés, magasins vidés, mire réaffichée avec un message), déconnexion avec un écran d'attente.
import { reactive } from 'vue';
import { ecouter, emettre } from '@/evenements';

export const etatSession = reactive({
    /** Session ouverte : application affichée ; sinon la mire */
    ouverte: false,
    /** Déconnexion en cours : écran d'attente */
    deconnexion: false,
    /** Échec de la déconnexion, affiché jusqu'à sa fermeture */
    erreur: ''
});

export const MESSAGE_SESSION_EXPIREE =
    'Votre session a expiré (déconnexion ou redémarrage du serveur). Veuillez vous reconnecter.';
export const MESSAGE_SESSION_FERMEE = 'Votre session a été fermée par un administrateur. Veuillez vous reconnecter.';
const MESSAGE_PAR_DEFAUT = 'Votre session a expiré. Veuillez vous reconnecter.';
export const MESSAGE_ECHEC_DECONNEXION = 'Erreur lors de la déconnexion. Veuillez réessayer.';

/** Adresses de la connexion elle-même : leurs refus ne signalent pas une session perdue */
const ADRESSES_CONNEXION = /\/(login|logout|check-session|version|mfa|forgot|reset)/;

/**
 * Fin de la session : composants de la session démontés et magasins vidés (session-terminee), mire réaffichée,
 * vidée, avec le message éventuel ; haut de la page
 */
export function terminerSession(message?: string): void {
    emettre('session-terminee');
    etatSession.ouverte = false;
    emettre('mire-affichee', { message });
    window.scrollTo(0, 0);
}

let finEnCours = false;

/** Session fermée côté serveur (redémarrage, expiration, administrateur) : une seule fin pour des refus simultanés */
export function forcerFinSession(message?: string): void {
    if (finEnCours) return;
    finEnCours = true;
    terminerSession(message || MESSAGE_PAR_DEFAUT);
    setTimeout(() => (finEnCours = false), 1500);
}

/** Session expirée (réveil du poste) : retour sur la mire sans message */
export function afficherMire(): void {
    terminerSession();
}

/** Déconnexion : écran d'attente, session fermée par le serveur, mire ; en cas d'échec, message et session gardée */
export async function deconnecter(): Promise<void> {
    etatSession.deconnexion = true;
    etatSession.erreur = '';
    try {
        const r = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        if (!r.ok) throw new Error('Erreur serveur lors de la déconnexion');
        terminerSession();
    } catch (e) {
        console.error('Erreur logout:', e);
        etatSession.erreur = MESSAGE_ECHEC_DECONNEXION;
    } finally {
        etatSession.deconnexion = false;
    }
}

const adresse = (cible: RequestInfo | URL) =>
    typeof cible === 'string' ? cible : cible instanceof URL ? cible.href : cible.url;

/**
 * Réponses du serveur surveillées pendant la session : 401 « Non authentifié » ou « SESSION_TERMINATED », ou 403
 * confirmé par une session refusée (vérification au plus toutes les 5 s) → fin de la session avec son message
 */
export function installerSurveillanceSession(): () => void {
    const fetchOrigine = window.fetch.bind(window);
    let verification = false;

    window.fetch = async (cible: RequestInfo | URL, init?: RequestInit) => {
        const reponse = await fetchOrigine(cible, init);
        if (!etatSession.ouverte || (reponse.status !== 401 && reponse.status !== 403)) return reponse;
        if (ADRESSES_CONNEXION.test(adresse(cible))) return reponse;
        if (reponse.status === 403) {
            if (!verification) {
                verification = true;
                fetchOrigine('/api/check-session', { credentials: 'include' })
                    .then(r => {
                        if (r.status === 401 || r.status === 403) forcerFinSession(MESSAGE_SESSION_EXPIREE);
                    })
                    .catch(() => {})
                    .finally(() => setTimeout(() => (verification = false), 5000));
            }
            return reponse;
        }
        const donnees = (await reponse
            .clone()
            .json()
            .catch(() => ({}))) as { error?: string };
        if (donnees.error === 'Non authentifié') forcerFinSession(MESSAGE_SESSION_EXPIREE);
        else if (donnees.error === 'SESSION_TERMINATED') forcerFinSession(MESSAGE_SESSION_FERMEE);
        return reponse;
    };

    const arrets = [
        // Session ouverte par la mire ou reprise au chargement de la page
        ecouter('session-ouverte', () => (etatSession.ouverte = true)),
        ecouter('session-absente', () => (etatSession.ouverte = false)),
        // Refus d'un appel du client de l'API (api/client.ts), avec le message du serveur
        ecouter('session-perdue', d => forcerFinSession(d?.message))
    ];

    return () => {
        window.fetch = fetchOrigine;
        arrets.forEach(a => a());
    };
}
