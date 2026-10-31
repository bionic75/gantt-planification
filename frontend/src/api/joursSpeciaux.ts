// Jours et événements spéciaux (administration) : fichiers .ics de congés scolaires et de dates particulières
import { api } from '@/api/client';
import type { EvenementIcs } from '@/ilots/admin/jours-speciaux/ics';

/** Apparence des dates d'un fichier sur le planning */
export interface ApparenceDates {
    label: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
}

export interface FichierConges {
    id: number;
    filename: string;
    imported_at: string;
    periods_count?: number;
}

export interface FichierDates {
    id: number;
    filename: string;
    config?: Partial<ApparenceDates>;
    dates_count?: number;
}

export const apiConges = {
    liste: () => api.get<{ files?: FichierConges[] }>('/ics-files/school-holidays'),
    importer: (corps: {
        filename: string;
        content: string;
        zoneA: EvenementIcs[];
        zoneB: EvenementIcs[];
        zoneC: EvenementIcs[];
    }) => api.post('/ics-files/school-holidays', corps),
    supprimer: (id: number) => api.delete(`/ics-files/school-holidays/${id}`)
};

export const apiDatesParticulieres = {
    liste: () => api.get<{ files?: FichierDates[] }>('/ics-files/special-dates'),
    importer: (corps: { filename: string; content: string; events: EvenementIcs[]; config: ApparenceDates }) =>
        api.post('/ics-files/special-dates', corps),
    modifier: (id: number, config: ApparenceDates) => api.put(`/ics-files/special-dates/${id}/config`, { config }),
    supprimer: (id: number) => api.delete(`/ics-files/special-dates/${id}`)
};
