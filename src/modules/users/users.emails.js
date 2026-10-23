// @ts-check
// Modèles des emails envoyés aux utilisateurs

/**
 * @param {{ prenom?: string, nom?: string, username: string, password: string, roles: string, appUrl: string }} p
 */
export const accountCreatedEmail = ({ prenom, nom, username, password, roles, appUrl }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Bienvenue ${prenom} ${nom} !</h2>
        <p>Votre compte a été créé avec succès sur la plateforme de Planification GANTT.</p>
        <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Nom d'utilisateur :</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Mot de passe :</strong> ${password}</p>
            <p style="margin: 5px 0;"><strong>Profil(s) :</strong> ${roles}</p>
        </div>
        <p style="color: #e74c3c; font-weight: bold;">⚠️ Pour des raisons de sécurité, veuillez changer votre mot de passe lors de votre première connexion.</p>
        <p>Vous pouvez vous connecter à l'adresse : <a href="${appUrl}">${appUrl}</a></p>
        <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</p>
    </div>
`;

/**
 * @param {{ prenom?: string, nom?: string, username: string, password: string, appUrl: string }} p
 */
export const passwordResetByAdminEmail = ({ prenom, nom, username, password, appUrl }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Réinitialisation de mot de passe</h2>
        <p>Bonjour ${prenom} ${nom},</p>
        <p>Votre mot de passe a été réinitialisé par un administrateur.</p>
        <div style="background-color: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Nom d'utilisateur :</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Nouveau mot de passe :</strong> ${password}</p>
        </div>
        <p style="color: #e74c3c; font-weight: bold;">⚠️ Pour des raisons de sécurité, veuillez changer ce mot de passe lors de votre prochaine connexion.</p>
        <p>Vous pouvez vous connecter à l'adresse : <a href="${appUrl}">${appUrl}</a></p>
    </div>
`;
