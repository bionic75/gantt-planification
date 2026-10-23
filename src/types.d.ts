// Types partagés pour la vérification JSDoc (// @ts-check) dans l'éditeur
import 'express-session';

declare module 'express-session' {
    interface SessionData {
        userId: number;
        username: string;
        nom: string;
        prenom: string;
        email: string;
        activeProfile: 'admin' | 'expert' | 'user' | 'rh';
        resourceId: number | null;
        logId: number;
        /** Horodatage de la connexion (révocation des sessions, voir state/sessions.js) */
        loginAt: number;
        mfaPending: {
            userId: number;
            profile: 'admin' | 'expert' | 'user' | 'rh';
            expiresAt: number;
            attempts: number;
            codeSends: number;
            totpSecret: string | null;
        };
    }
}

declare global {
    // URL de l'application déduite de la première requête authentifiée
    var _detectedAppUrl: string | undefined;

    namespace Express {
        interface Request {
            mfaPending?: import('express-session').SessionData['mfaPending'];
        }
    }
}
