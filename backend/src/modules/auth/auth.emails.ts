// Modèles des emails d'authentification (gabarit commun : lib/email-layout.ts). Chaque modèle expose aussi les
// icônes à joindre au message.
import { escapeHtml as e } from '../../lib/html.ts';
import { boutonMail, gabaritMail, ligneInfo, piecesIcones } from '../../lib/email-layout.ts';

/** Icônes jointes aux emails */
export const MFA_ICONES = piecesIcones(['cadenas-grand', 'horloge', 'bouclier']);
export const RESET_ICONES = piecesIcones(['cle-grand', 'horloge', 'bouclier']);

/** @param p */
export const mfaCodeEmail = ({ prenom, code }: { prenom?: string; code: string }) =>
    gabaritMail({
        icone: 'cadenas-grand',
        titre: 'Code de vérification',
        corps: `<p style="margin:0 0 18px;text-align:center;">Bonjour ${e(prenom)},<br>voici votre code de vérification pour accéder à l'application.</p>
<div style="background:#f0f6fc;border:1px solid #d6e6f5;border-radius:12px;padding:18px;text-align:center;margin-bottom:8px;"><span style="font-family:'Courier New',monospace;font-size:36px;letter-spacing:8px;font-weight:700;color:#1d70b7;">${e(code)}</span></div>`,
        infos:
            ligneInfo('horloge', 'Ce code est valable pendant <strong>10 minutes</strong>.') +
            ligneInfo(
                'bouclier',
                "Si vous n'avez pas demandé ce code, ignorez cet email : personne ne peut se connecter sans lui."
            )
    });

/** @param p */
export const passwordResetLinkEmail = ({
    prenom,
    nom,
    username,
    link
}: {
    prenom?: string;
    nom?: string;
    username: string;
    link: string;
}) =>
    gabaritMail({
        icone: 'cle-grand',
        titre: 'Réinitialisation de mot de passe',
        corps: `<p style="margin:0;text-align:center;">Bonjour ${e(prenom)} ${e(nom)},<br>une réinitialisation du mot de passe du compte <strong>${e(username)}</strong> a été demandée.</p>
${boutonMail(link, 'Choisir un nouveau mot de passe')}
<p style="margin:0;font-size:12px;line-height:18px;color:#8a97a8;text-align:center;">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><span style="word-break:break-all;">${e(link)}</span></p>`,
        infos:
            ligneInfo(
                'horloge',
                "Ce lien est valable <strong>1 heure</strong> et ne peut être utilisé qu'une seule fois."
            ) +
            ligneInfo(
                'bouclier',
                "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé."
            )
    });
