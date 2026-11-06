// Notifications et e-mails des affectations (src/modules/notifications) : demande d'affectation, invitations
// Outlook, nouvelles affectations de l'expert
import { api } from '@/api/client';

/** Nouvelle affectation notifiée à l'expert (non lue) */
export interface NotificationExpert {
    id: number;
    date: string;
    /** « Matin » ou « Après-midi » */
    period: string;
    activity_name: string | null;
    requester_name: string | null;
    localisation?: string | null;
}

export interface CorpsDemandeAffectation {
    fromName: string;
    fromEmail: string;
    expertIds: number[];
    subject: string;
    startDate: string;
    startPeriod: string;
    endDate: string;
    endPeriod: string;
    message: string;
}

/** Affectation envoyée en invitation Outlook */
export interface AffectationInvitation {
    date: string;
    period: 'AM' | 'PM';
    activity: string;
    activityCode: string;
    location: string;
    actionType: 'new' | 'modified' | 'deleted';
    oldActivity: string | null;
    oldActivityCode: string | null;
    oldLocation: string | null;
}

export interface InvitationsExpert {
    resourceId: number;
    email: string | null;
    expertNom: string;
    expertPrenom: string;
    assignments: AffectationInvitation[];
}

/** POST /send-assignment-emails : lot d'e-mails mis en file d'envoi */
export interface ResultatInvitations {
    success: boolean;
    batchId?: string;
    enqueued?: number;
    error?: string;
}

/** GET /email-queue/status/:batchId */
export interface StatutEnvoi {
    isComplete: boolean;
    sent?: number;
    failed?: number;
    total?: number;
}

export const apiNotifications = {
    nouvellesAffectations: () => api.get<{ notifications: NotificationExpert[] }>('/notifications/list'),
    marquerLues: () => api.post<{ success: boolean }>('/notifications/mark-read'),
    demanderAffectation: (corps: CorpsDemandeAffectation) =>
        api.post<{ success: boolean; emails: string[]; error?: string }>('/request-assignment', corps),
    envoyerInvitations: (corps: {
        assignments: InvitationsExpert[];
        senderName: string;
        senderEmail: string | null;
        sessionId: string | null;
    }) => api.post<ResultatInvitations>('/send-assignment-emails', corps),
    statutEnvoi: (batchId: string) => api.get<StatutEnvoi>(`/email-queue/status/${encodeURIComponent(batchId)}`)
};
