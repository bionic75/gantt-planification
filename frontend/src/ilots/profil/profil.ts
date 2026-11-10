// Règles de la fenêtre « Mon profil » : photo acceptée, règle du mot de passe, initiales du rond
import type { Session } from '@/api/types';

/** Taille maximale d'une photo de profil (2 Mo) */
export const TAILLE_MAX_PHOTO = 2 * 1024 * 1024;

export const estImage = (type: string) => type.startsWith('image/');

/** Caractères spéciaux reconnus par la règle du mot de passe (comme l'ancien écran) */
const SPECIAL = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/]/;

/**
 * Règle du mot de passe, vérifiée pendant la saisie : 8 caractères minimum et 1 caractère spécial ; null sans saisie
 */
export function regleMotDePasse(motDePasse: string): { ok: boolean; texte: string } | null {
    if (!motDePasse) return null;
    const erreurs = [
        ...(motDePasse.length >= 8 ? [] : ['8 caractères minimum']),
        ...(SPECIAL.test(motDePasse) ? [] : ['1 caractère spécial requis'])
    ];
    return erreurs.length
        ? { ok: false, texte: `✗ ${erreurs.join(', ')}` }
        : { ok: true, texte: '✓ Mot de passe valide' };
}

/** Rond sans photo : trigramme, à défaut les initiales du prénom et du nom */
export const initiales = (s: Pick<Session, 'trigramme' | 'prenom' | 'nom'>) =>
    s.trigramme || `${s.prenom?.charAt(0) || ''}${s.nom?.charAt(0) || ''}` || '??';
