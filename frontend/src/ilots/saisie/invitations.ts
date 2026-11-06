// Invitations Outlook des affectations en attente : regroupement par expert, résumé, corps de l'envoi
import type { InvitationsExpert } from '@/api/notifications';
import type { AffectationEnAttente, ExpertEnAttente } from '@/liaison';

export type TypeChangement = 'new' | 'modified' | 'deleted';

/** Type d'une affectation en attente (sans type : nouvelle) */
export const typeDe = (a: AffectationEnAttente): TypeChangement => a.actionType || 'new';

export interface Compteurs {
    nouvelles: number;
    modifications: number;
    suppressions: number;
}

export function compter(affectations: AffectationEnAttente[]): Compteurs {
    const c: Compteurs = { nouvelles: 0, modifications: 0, suppressions: 0 };
    for (const a of affectations) {
        const t = typeDe(a);
        if (t === 'deleted') c.suppressions++;
        else if (t === 'modified') c.modifications++;
        else c.nouvelles++;
    }
    return c;
}

/** « 1 expert(s) - 2 nouvelle(s), 1 suppression(s) » */
export function resume(experts: ExpertEnAttente[]): string {
    const total = compter(experts.flatMap(e => e.assignments));
    const parties: string[] = [];
    if (total.nouvelles > 0) parties.push(`${total.nouvelles} nouvelle(s)`);
    if (total.modifications > 0) parties.push(`${total.modifications} modification(s)`);
    if (total.suppressions > 0) parties.push(`${total.suppressions} suppression(s)`);
    return `${experts.length} expert(s) - ${parties.join(', ')}`;
}

/** Affectations d'un expert par date, le matin avant l'après-midi */
export const parDate = (affectations: AffectationEnAttente[]) =>
    [...affectations].sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.period === 'AM' ? -1 : 1));

/** Jour affiché : « lun. 04/01 » */
export const jourCourt = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });

export const ICONES_TYPE: Record<TypeChangement, { icone: string; titre: string }> = {
    new: { icone: '📅', titre: 'Nouvelle' },
    modified: { icone: '🔄', titre: 'Modification' },
    deleted: { icone: '❌', titre: 'Suppression' }
};

/** Corps de l'envoi pour les experts choisis (identifiants de ressource) */
export function invitationsDe(experts: Record<string, ExpertEnAttente>, choisis: string[]): InvitationsExpert[] {
    return choisis
        .filter(id => experts[id])
        .map(id => {
            const e = experts[id]!;
            return {
                resourceId: parseInt(id),
                email: e.expertEmail,
                expertNom: e.expertNom || e.resourceNom,
                expertPrenom: e.expertPrenom || e.resourcePrenom,
                assignments: e.assignments.map(a => ({
                    date: a.date,
                    period: a.period,
                    activity: a.activity,
                    activityCode: a.activityCode,
                    location: a.location,
                    actionType: typeDe(a),
                    oldActivity: a.oldActivity || null,
                    oldActivityCode: a.oldActivityCode || null,
                    oldLocation: a.oldLocation || null
                }))
            };
        });
}

/** Message de fin d'envoi : titre et détail (noms des experts, à défaut nombre d'e-mails) */
export function messageFinEnvoi(envoyes: number, echecs: number, total: number, noms: string[]) {
    return {
        succes: echecs === 0,
        titre:
            echecs === 0
                ? `Invitations envoyées (${envoyes}/${total})`
                : `Invitations partiellement envoyées (${envoyes}/${total})`,
        detail: noms.length > 0 ? noms.join(', ') : `${total} email(s)`
    };
}
