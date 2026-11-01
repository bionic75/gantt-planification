// Accueil : appels et réponses (src/modules/schedule, resources, events)
import { api } from '@/api/client';
import type { ListeEvenements } from '@/api/evenements';
import type { Planning, RessourceAccueil } from '@/ilots/accueil/calculs';
import type { AstreintesHo } from '@/ilots/accueil/calculs';
import type { ConfigDeploiements, Deploiement } from '@/ilots/accueil/deploiements';

export const apiAccueil = {
    planning: () => api.get<Planning>('/schedule'),
    ressources: () => api.get<RessourceAccueil[]>('/resources'),
    /** Réservés aux utilisateurs habilités à l'Aide à l'affectation */
    deploiements: () => api.get<{ projects: Deploiement[] }>('/affectation/projects'),
    configDeploiements: () => api.get<ConfigDeploiements>('/affectation/config'),
    /** Planning des astreintes HO du mois « AAAA-MM » */
    astreintesHo: (mois: string) => api.get<AstreintesHo>(`/astreintes-ho?month=${mois}`),
    evenements: () => api.get<ListeEvenements>('/my-custom-events')
};
