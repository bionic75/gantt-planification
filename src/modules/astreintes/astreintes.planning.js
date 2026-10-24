// @ts-check
// Génération du planning d'astreinte d'un mois : soirs en semaine, journées le week-end,
// répartis équitablement entre les volontaires disponibles (contraintes FPH simplifiées).

/** @typedef {{ date: string, type_creneau: string, resource_id: number | null, year: unknown, month: unknown }} Slot */

/**
 * @param {{
 *   year: any, month: any,
 *   volontaires: Array<{ id: number }>,
 *   disponibilites: Array<{ resource_id: number, date: string }>,
 *   affectations: Array<{ resource_id: number, date_key: string }>
 * }} input
 * @returns {{ planning: Slot[], warnings: string[], compteur: Record<number, number> }}
 */
export function generatePlanning({ year, month, volontaires, disponibilites, affectations }) {
    const pad = (/** @type {unknown} */ n) => String(n).padStart(2, '0');

    // Créneaux du mois : journée complète le week-end, soir en semaine
    const slots = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = new Date(year, month - 1, day).getDay();
        const date = `${year}-${pad(month)}-${pad(day)}`;
        slots.push({ date, type_creneau: dayOfWeek === 0 || dayOfWeek === 6 ? 'journee' : 'soir' });
    }

    /** @type {Slot[]} */
    const planning = [];
    /** @type {Record<number, number>} nombre d'astreintes par expert */
    const compteur = {};
    /** @type {Record<number, string | null>} dernière date d'astreinte par expert */
    const dernierAstreinte = {};
    const warnings = [];
    for (const v of volontaires) {
        compteur[v.id] = 0;
        dernierAstreinte[v.id] = null;
    }

    // Disponibilité déclarée (jour vert) ; pour un soir, pas de déplacement ni de bascule le lendemain
    const isDisponible = (
        /** @type {number} */ expertId,
        /** @type {string} */ date,
        /** @type {string} */ typeCreneau
    ) => {
        if (!disponibilites.some(d => d.resource_id === expertId && d.date === date)) return false;
        if (typeCreneau === 'soir') {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDateStr = nextDay.toISOString().split('T')[0];
            // Comportement historique conservé : les clés de planification portent la demi-journée
            // (« AAAA-MM-JJ_AM »), cette comparaison ne trouve donc jamais d'affectation
            if (affectations.some(a => a.resource_id === expertId && a.date_key === nextDateStr)) return false;
        }
        return true;
    };

    // Contraintes FPH : 15 astreintes par mois au plus, 3 créneaux sur 7 jours glissants, 11 h de repos
    const checkContraintesFPH = (/** @type {number} */ expertId, /** @type {string} */ date) => {
        if (compteur[expertId] >= 15) return false;
        const dateObj = new Date(date);
        let countLast7Days = 0;
        for (const slot of planning) {
            const diffDays = Math.abs((dateObj.getTime() - new Date(slot.date).getTime()) / (1000 * 60 * 60 * 24));
            if (slot.resource_id === expertId && diffDays < 7) countLast7Days++;
        }
        if (countLast7Days >= 3) return false;
        const last = dernierAstreinte[expertId];
        if (last && (new Date(date).getTime() - new Date(last).getTime()) / (1000 * 60 * 60) < 11) return false;
        return true;
    };

    for (const slot of slots) {
        // Équité : les volontaires ayant le moins d'astreintes d'abord
        const sorted = [...volontaires].sort((a, b) => compteur[a.id] - compteur[b.id]);
        const expert = sorted.find(
            e => isDisponible(e.id, slot.date, slot.type_creneau) && checkContraintesFPH(e.id, slot.date)
        );
        if (expert) {
            planning.push({ ...slot, resource_id: expert.id, year, month });
            compteur[expert.id]++;
            dernierAstreinte[expert.id] = slot.date;
        } else {
            planning.push({ ...slot, resource_id: null, year, month });
            warnings.push(`Aucun expert disponible pour le ${slot.date} (${slot.type_creneau})`);
        }
    }
    return { planning, warnings, compteur };
}
