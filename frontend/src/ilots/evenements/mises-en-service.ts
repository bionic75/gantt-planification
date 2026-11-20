// Animation de la carte : progression des mises en service (SAMU « En service » apparaissant à leur date)
import type { DeploiementCarte, StatutDeploiement } from '@/api/deploiements';
import { isoDuJour, jour, type PlageLecture } from './carte';

/** Date de mise en service d'un SAMU : date saisie, à défaut date suggérée par les événements */
const dateDe = (d: DeploiementCarte) => d.date_mise_en_service || d.date_suggeree || null;

/** SAMU « En service » avec leur date de mise en service (ceux sans date ne peuvent pas être animés) */
function datees(deploiements: DeploiementCarte[], statuts: StatutDeploiement[]) {
    const service = new Set(statuts.filter(s => s.is_service).map(s => s.id));
    return deploiements.flatMap(d => {
        const date = dateDe(d);
        return d.status_id != null && service.has(d.status_id) && date ? [{ d, date }] : [];
    });
}

/** Période animée : de la première à la dernière mise en service ; null si rien à animer */
export function plageMisesEnService(
    deploiements: DeploiementCarte[],
    statuts: StatutDeploiement[]
): PlageLecture | null {
    const dates = datees(deploiements, statuts)
        .map(x => x.date)
        .sort();
    const debut = dates[0];
    const fin = dates[dates.length - 1];
    if (!debut || !fin) return null;
    return { debut, fin, jours: Math.max(1, jour(fin) - jour(debut)) };
}

/** SAMU « En service » déjà mis en service à cette date, dans la période animée */
export function misesEnServiceA(
    deploiements: DeploiementCarte[],
    statuts: StatutDeploiement[],
    plage: PlageLecture,
    date: string
) {
    return datees(deploiements, statuts)
        .filter(x => x.date >= plage.debut && x.date <= plage.fin && x.date <= date)
        .map(x => x.d);
}

/** Nombre de SAMU qui passent « En service » dans la période (total de l'animation) */
export const nbMisesEnService = (deploiements: DeploiementCarte[], statuts: StatutDeploiement[], plage: PlageLecture) =>
    datees(deploiements, statuts).filter(x => x.date >= plage.debut && x.date <= plage.fin).length;

/** Dates des images d'une animation exportée : `nb` images réparties sur la période (au plus une par jour) */
export function datesDesImages(plage: PlageLecture, nb: number) {
    const n = Math.max(2, Math.min(nb, plage.jours + 1));
    const premier = jour(plage.debut);
    return Array.from({ length: n }, (_, i) => isoDuJour(premier + Math.round((i * plage.jours) / (n - 1))));
}
