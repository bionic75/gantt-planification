// Onglets de la Planification : libellé et icône (tracés SVG 24 × 24 de la barre d'onglets, index.html), partagés par
// la fenêtre « Mon profil » (onglet par défaut) et, à venir, la barre d'onglets (lot 6.4)

export interface DefinitionOnglet {
    libelle: string;
    traces: string;
}

export const ONGLETS: Record<string, DefinitionOnglet> = {
    accueil: {
        libelle: 'Accueil',
        traces: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>'
    },
    resources: {
        libelle: 'Ressources',
        traces: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    },
    evenements: {
        libelle: 'Événements',
        traces: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'
    },
    planning: {
        libelle: 'Planification',
        traces: '<path d="M3 3v18h18"/><rect x="7" y="7" width="8" height="3" rx="1"/><rect x="11" y="12" width="9" height="3" rx="1"/><rect x="7" y="17" width="5" height="2" rx="1"/>'
    },
    tripadvisor: {
        libelle: 'SAMU-SAS TripAdVisor',
        traces: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
    },
    cra: {
        libelle: 'CRA',
        traces: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'
    },
    reporting: {
        libelle: 'Reporting',
        traces: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
    },
    admin: {
        libelle: 'Administration',
        traces: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
    },
    astreintesGestion: {
        libelle: 'Astreintes',
        traces: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
    }
};

/** Libellé d'un onglet (sa clé s'il est inconnu) */
export const libelleOnglet = (cle: string) => ONGLETS[cle]?.libelle ?? cle;
