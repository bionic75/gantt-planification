// Application mobile : utilisateur connecté, mémorisé pour l'onglet du navigateur (sessionStorage « ans_mob_user »)

export interface UtilisateurMobile {
    id?: number;
    userId?: number;
    nom: string | null;
    prenom: string | null;
    activeProfile: string;
    resourceId?: number | null;
}

const CLE = 'ans_mob_user';

export function utilisateurMemorise(): UtilisateurMobile | null {
    try {
        return JSON.parse(sessionStorage.getItem(CLE) || 'null') as UtilisateurMobile | null;
    } catch {
        return null;
    }
}

export function memoriserUtilisateur(u: UtilisateurMobile | null) {
    try {
        if (u) sessionStorage.setItem(CLE, JSON.stringify(u));
        else sessionStorage.removeItem(CLE);
    } catch {
        /* stockage indisponible */
    }
}

/** Initiales, nom affiché (« NOM Prénom » de l'ancien écran : nom puis prénom) et profil */
export function entete(u: UtilisateurMobile) {
    const initiales = ((u.prenom || '')[0] || '').toUpperCase() + ((u.nom || '')[0] || '').toUpperCase();
    const PROFILS: Record<string, string> = {
        admin: 'Administrateur',
        expert: 'Expert Métier',
        consumer: 'Utilisateur'
    };
    return {
        initiales: initiales || '?',
        nom: `${u.nom || ''} ${u.prenom || ''}`.trim(),
        profil: PROFILS[u.activeProfile] || u.activeProfile || ''
    };
}
