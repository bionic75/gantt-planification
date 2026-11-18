// Types partagés du serveur : données de session et requête Express
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
        /** Horodatage de la connexion */
        loginAt: number;
        /** Mot de passe donné par un administrateur, à changer avant toute autre action (middlewares/password-change.ts) */
        mustChangePassword: boolean;
        /** Session fermée par une déconnexion forcée ou un changement de mot de passe (db/session-store.ts) */
        terminated: boolean;
        /**
         * Double authentification validée pour cette session (code ou appareil de confiance) : condition du passage à un
         * profil qui y est soumis (/api/switch-profile)
         */
        mfaValidated: boolean;
        mfaPending: {
            userId: number;
            profile: 'admin' | 'expert' | 'user' | 'rh';
            expiresAt: number;
            attempts: number;
            codeSends: number;
            totpSecret: string | null;
            /** Code email validé pendant cette connexion : autorise l'enregistrement d'une application (méthode « au choix ») */
            emailVerified?: boolean;
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
