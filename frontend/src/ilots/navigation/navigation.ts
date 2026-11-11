// Navigation de la page principale (lot 6.4a) : onglets de la Planification accessibles au profil (configuration de
// l'administration, /api/tab-access), onglet ouvert (classe « active » des conteneurs, montage des îlots), onglet
// d'arrivée, pastille des CRA en cours, changement d'application (Planification, Déplacements, Analyse, Affectation ;
// application gardée pour l'onglet du navigateur, sessionStorage « selectedApp »), lien vers un CRA (?tab=cra&cra_id=).
// État de la session en cours, remis à zéro à la fin de la session ; Vue Router le remplacera (lot 6.4b).
import { reactive } from 'vue';
import { api } from '@/api/client';
import type { Session } from '@/api/types';
import { deconnecter, ecouter, emettre } from '@/liaison';

/** Onglets soumis à la configuration de l'accès (ordre de l'écran d'administration) */
export const ONGLETS_CONFIGURABLES = [
    'resources',
    'evenements',
    'planning',
    'cra',
    'reporting',
    'admin',
    'astreintesGestion',
    'tripadvisor'
] as const;
export type CleOnglet = (typeof ONGLETS_CONFIGURABLES)[number] | 'accueil';

export type ConfigOnglets = Record<string, Record<string, boolean>>;

/** Accès par défaut (serveur injoignable), identiques au comportement historique */
export const ACCES_PAR_DEFAUT: ConfigOnglets = {
    admin: Object.fromEntries(ONGLETS_CONFIGURABLES.map(o => [o, true])),
    user: {
        resources: false,
        evenements: true,
        planning: true,
        cra: false,
        reporting: false,
        admin: false,
        astreintesGestion: true,
        tripadvisor: true
    },
    rh: {
        resources: true,
        evenements: false,
        planning: false,
        cra: true,
        reporting: false,
        admin: false,
        astreintesGestion: true,
        tripadvisor: true
    },
    expert: {
        resources: false,
        evenements: true,
        planning: true,
        cra: true,
        reporting: false,
        admin: false,
        astreintesGestion: true,
        tripadvisor: true
    }
};

/** Onglet permis au profil (profil absent de la configuration : droits du profil Utilisateur) */
export function peut(config: ConfigOnglets | null, profil: string, onglet: string): boolean {
    const c = config ?? ACCES_PAR_DEFAUT;
    return !!(c[profil] ?? ACCES_PAR_DEFAUT.user ?? {})[onglet];
}

export const ongletsDisponibles = (config: ConfigOnglets | null, profil: string): string[] =>
    ONGLETS_CONFIGURABLES.filter(o => peut(config, profil, o));

type SessionAcces = Pick<Session, 'activeProfile' | 'astreinte_volontaire' | 'is_admin' | 'is_rh'>;

/** Onglet CRA : réservé, pour le profil Expert, aux experts volontaires aux astreintes */
export function craVisible(config: ConfigOnglets | null, s: SessionAcces | null): boolean {
    if (!s || !peut(config, s.activeProfile, 'cra')) return false;
    return s.activeProfile !== 'expert' || !!(s.astreinte_volontaire || s.is_admin || s.is_rh);
}

/** Fonctions de l'accueil et de la planification accessibles à l'utilisateur */
export interface AccesAccueil {
    planning: boolean;
    /** Affecter des experts à une mission : tous les profils sauf l'expert */
    affecter: boolean;
    evenements: boolean;
    cra: boolean;
    affectation: boolean;
    deplacements: boolean;
    /** Ajout d'un lieu (SAMU-SAS TripAdVisor) */
    lieux: boolean;
    /** Planning des astreintes HO, proposé aux experts */
    astreintes: boolean;
    /** Compte rattaché à une ressource : il renseigne son propre planning */
    ressource: boolean;
    /** « Gérer mes / les astreintes/HNO » : administrateur ou expert ayant accès à l'onglet Astreintes */
    gestionAstreintes?: boolean;
    /** « Faire une demande » d'affectation : administrateur et utilisateur */
    demandeAffectation?: boolean;
}

export function accesDe(config: ConfigOnglets | null, s: Session): AccesAccueil {
    const p = s.activeProfile;
    const applications = s.availableApps ?? [];
    return {
        planning: peut(config, p, 'planning'),
        affecter: p !== 'expert',
        evenements: peut(config, p, 'evenements'),
        lieux: peut(config, p, 'tripadvisor'),
        astreintes: p === 'expert' && peut(config, p, 'astreintesGestion'),
        cra: craVisible(config, s),
        affectation: applications.includes('affectation'),
        deplacements: applications.includes('deplacements'),
        ressource: !!s.resourceId,
        gestionAstreintes: (p === 'admin' || p === 'expert') && peut(config, p, 'astreintesGestion'),
        demandeAffectation: p === 'admin' || p === 'user'
    };
}

/** Onglet d'arrivée : celui choisi dans le profil s'il est accessible, sinon l'Accueil */
export function ongletArrivee(config: ConfigOnglets | null, s: Pick<Session, 'activeProfile' | 'defaultTab'>): string {
    const prefere = s.defaultTab || 'accueil';
    return prefere === 'accueil' || ongletsDisponibles(config, s.activeProfile).includes(prefere) ? prefere : 'accueil';
}

/** CRA en cours de traitement (non archivés, non diffusés) : pastille de l'onglet */
export const crasEnCours = (liste: { archived?: boolean | number; statut?: string }[]) =>
    liste.filter(c => !c.archived && c.statut !== 'diffuse').length;

// ── État de la session ───────────────────────────────────────────────────────

export type CleApplication = 'planification' | 'deplacements' | 'analyse' | 'affectation';

const CONTENEURS: Record<Exclude<CleApplication, 'planification'>, string> = {
    deplacements: 'deplacementsContainer',
    analyse: 'analyseContainer',
    affectation: 'affectationContainer'
};

export const navigation = reactive({
    config: null as ConfigOnglets | null,
    session: null as Session | null,
    onglet: 'resources',
    application: 'planification' as CleApplication,
    pastilleCra: 0,
    /** CRA demandé par le lien d'une notification, en attente d'ouverture par l'îlot du CRA */
    craDemande: null as number | null
});

ecouter('session-terminee', () => {
    navigation.config = null;
    navigation.session = null;
    navigation.pastilleCra = 0;
    navigation.craDemande = null;
    navigation.application = 'planification';
});
// Accès aux onglets enregistrés dans l'administration
ecouter('onglets-modifies', d => {
    navigation.config = d.config;
    if (navigation.onglet !== 'accueil' && navigation.session) {
        const visible =
            navigation.onglet === 'cra'
                ? craVisible(d.config, navigation.session)
                : peut(d.config, navigation.session.activeProfile, navigation.onglet);
        if (!visible) ouvrirOnglet(ongletArrivee(d.config, navigation.session));
    }
});
// CRA traités par l'îlot de l'onglet CRA : pastille relue
ecouter('cra-modifies', () => void chargerPastilleCra());

export async function chargerAcces() {
    try {
        navigation.config = (await api.get<{ config: ConfigOnglets }>('/tab-access')).config;
    } catch {
        /* accès par défaut */
    }
}

/** Fonctions de l'accueil accessibles ; null sans session */
export const accesAccueil = (): AccesAccueil | null =>
    navigation.session ? accesDe(navigation.config, navigation.session) : null;

/** Onglets de la Planification accessibles au profil (hors Accueil, accessible à tous) */
export const ongletsAccessibles = (profil: string): string[] => ongletsDisponibles(navigation.config, profil);

/** Onglet de la Planification ouvert : son conteneur (classe « active ») monte l'îlot */
export function ouvrirOnglet(cle: string) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === cle));
    navigation.onglet = cle;
    if (cle === 'cra') void chargerPastilleCra();
}

export async function chargerPastilleCra() {
    const s = navigation.session;
    const admin = !!s && (s.is_admin || s.activeProfile === 'admin');
    const expert = !!s && (s.astreinte_volontaire || s.activeProfile === 'expert');
    if (!s || (!admin && !expert)) return;
    try {
        navigation.pastilleCra = crasEnCours(await api.get<{ archived?: boolean; statut?: string }[]>('/cra/my-list'));
    } catch (e) {
        console.warn('Erreur badge CRA:', e);
    }
}

function memoriserApplication(cle: CleApplication | null) {
    try {
        if (cle) sessionStorage.setItem('selectedApp', cle);
        else sessionStorage.removeItem('selectedApp');
    } catch {
        /* stockage indisponible */
    }
}

/** Application gardée pour l'onglet du navigateur (page rechargée) ; null si aucune ou non accessible */
export function applicationMemorisee(s: Pick<Session, 'availableApps'>): CleApplication | null {
    let cle: string | null = null;
    try {
        cle = sessionStorage.getItem('selectedApp');
    } catch {
        /* stockage indisponible */
    }
    return cle && cle in CONTENEURS && (s.availableApps ?? []).includes(cle) ? (cle as CleApplication) : null;
}

const conteneur = (id: string) => document.getElementById(id);
const planification = () => document.querySelector<HTMLElement>('.container');

/** Application affichée (menu Applications) : son conteneur, montré, monte l'îlot de l'application */
export function ouvrirApplication(cle: CleApplication) {
    if (cle === 'planification') return revenirPlanification();
    document.getElementById('loginPage')?.classList.remove('active');
    const p = planification();
    if (p) p.style.display = 'none';
    for (const [app, id] of Object.entries(CONTENEURS)) {
        const c = conteneur(id);
        if (c) c.style.display = app === cle ? 'block' : 'none';
    }
    navigation.application = cle;
    memoriserApplication(cle);
    (window as unknown as { GPTools?: { position: () => void } }).GPTools?.position();
}

/** Retour à la Planification (menu Applications, Accueil d'une application) */
export function revenirPlanification() {
    for (const id of Object.values(CONTENEURS)) {
        const c = conteneur(id);
        if (c) c.style.display = 'none';
    }
    const p = planification();
    if (p) p.style.display = 'block';
    navigation.application = 'planification';
    memoriserApplication('planification');
}

/** Bouton « Accueil » des applications : retour à la Planification, sur l'Accueil */
export function allerAccueil() {
    revenirPlanification();
    ouvrirOnglet('accueil');
}

/** Fenêtre de déconnexion des Déplacements : « Aller sur la Plateforme de planification », données relues */
export function quitterDeplacementsVersPlanification() {
    revenirPlanification();
    emettre('ressources-modifiees');
    emettre('grille-a-rafraichir');
}

/** Déconnexion confirmée dans une application */
export async function deconnecterDepuisApplication(cle: Exclude<CleApplication, 'planification'>) {
    memoriserApplication(null);
    await deconnecter();
    const c = conteneur(CONTENEURS[cle]);
    if (c) c.style.display = 'none';
}

/** Lien d'une notification (« ?tab=cra&cra_id=12 », ou « craId » des anciens courriels) : CRA à ouvrir */
export function craDuLien(recherche: string): { cra: boolean; id: number | null } {
    const p = new URLSearchParams(recherche);
    if (p.get('tab') !== 'cra') return { cra: false, id: null };
    const id = Number(p.get('cra_id') ?? p.get('craId'));
    return { cra: true, id: Number.isInteger(id) && id > 0 ? id : null };
}

/** CRA demandé par le lien d'une notification, retiré de l'attente ; null si aucun */
export function prendreCraDemande(): number | null {
    const id = navigation.craDemande;
    navigation.craDemande = null;
    return id;
}
