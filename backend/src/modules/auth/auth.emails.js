// @ts-check
// Modèles des emails d'authentification
import { escapeHtml as e } from '../../lib/html.js';

/** @param {{ prenom?: string, code: string }} p */
export const mfaCodeEmail = ({
    prenom,
    code
}) => `<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
    <div style="max-width: 450px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #4caf50 0%, #43a047 100%); color: white; padding: 25px; text-align: center;">
            <h2 style="margin: 0;">🔐 Code de vérification</h2>
        </div>
        <div style="padding: 30px; text-align: center;">
            <p style="color: #666; margin-bottom: 20px;">
                Bonjour ${e(prenom)},<br>
                Voici votre code de vérification pour accéder à l'application.
            </p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <span style="font-size: 36px; font-family: monospace; letter-spacing: 8px; font-weight: bold; color: #2e7d32;">${code}</span>
            </div>
            <p style="color: #999; font-size: 12px;">
                Ce code est valable pendant 10 minutes.<br>
                Si vous n'avez pas demandé ce code, ignorez cet email.
            </p>
        </div>
    </div>
</div>`;

/** @param {{ prenom?: string, nom?: string, username: string, link: string }} p */
export const passwordResetLinkEmail = ({ prenom, nom, username, link }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Réinitialisation de mot de passe</h2>
        <p>Bonjour ${e(prenom)} ${e(nom)},</p>
        <p>Une réinitialisation du mot de passe du compte <strong>${e(username)}</strong> a été demandée.</p>
        <p style="margin: 25px 0; text-align: center;">
            <a href="${e(link)}" style="background-color: #2c3e50; color: #ffffff; padding: 12px 24px; border-radius: 5px; text-decoration: none; font-weight: bold;">Choisir un nouveau mot de passe</a>
        </p>
        <p style="font-size: 12px; color: #7f8c8d;">Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois. Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${e(link)}</p>
        <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.</p>
    </div>
`;
