// Demande d'affectation : préremplissage, destinataires proposés, contrôle des dates
import type { Ressource } from '@/api/ressources';

/** Expert proposé en destinataire : ressource active disposant d'une adresse e-mail */
export interface Destinataire {
    id: number;
    prenom: string;
    nom: string;
    trigramme: string;
    email: string;
}

export const destinatairesPossibles = (ressources: Ressource[]): Destinataire[] =>
    ressources
        .filter(r => r.actif === 1 && r.email && r.email.trim())
        .map(r => ({ id: r.id, prenom: r.prenom, nom: r.nom, trigramme: r.trigramme, email: r.email as string }));

/** Propositions de la saisie semi-automatique : non choisis, nom, prénom ou trigramme contenant la recherche, 10 au plus */
export function propositions(tous: Destinataire[], choisis: Destinataire[], recherche: string): Destinataire[] {
    const q = (recherche || '').toLowerCase().trim();
    const deja = new Set(choisis.map(e => e.id));
    return tous
        .filter(e => !deja.has(e.id))
        .filter(e => !q || `${e.prenom} ${e.nom} ${e.trigramme}`.toLowerCase().includes(q))
        .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`))
        .slice(0, 10);
}

export const libelleDestinataire = (e: Destinataire) => `${e.prenom} ${e.nom} (${e.trigramme})`;

/** Expéditeur, sujet et message proposés (nom de famille en majuscules) */
export function preremplissage(prenom: string, nom: string) {
    const expediteur = `${prenom} ${nom.toUpperCase()}`;
    return {
        expediteur,
        sujet: `De la part de ${expediteur}: demande d'affectation`,
        message: `Bonjour,

j'aurais besoin que tu sois disponible pour une mission.

Pourrais-tu te rendre disponible pour les dates demandées ?

En te remerciant par avance,
${expediteur}`
    };
}

export const ERREUR_DATES = 'La date de fin doit être postérieure ou égale à la date de début';

/** Erreur de dates (fin avant le début), ou chaîne vide */
export const erreurDates = (debut: string, fin: string) => (debut && fin && fin < debut ? ERREUR_DATES : '');
