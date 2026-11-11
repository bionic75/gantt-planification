// Navigation de la page principale : onglets de la Planification accessibles au profil (configuration de
// l'administration, /api/tab-access), onglet d'arrivée, pastille des CRA en cours, adresses des onglets et des
// applications (Vue Router, lot 6.4b : /planification, /cra/12, /deplacements…), adresse refusée ou inconnue renvoyée
// vers l'onglet d'arrivée, anciens liens des notifications (« /?tab=cra&cra_id=12 ») redirigés vers /cra/12.
// État de la session en cours, remis à zéro à la fin de la session.
import { reactive, toRaw } from 'vue';
import type { RouteLocationRaw, RouteMeta, RouteRecordNameGeneric, Router } from 'vue-router';
import { api } from '@/api/client';
import type { Session } from '@/api/types';
import { ecouter, emettre } from '@/evenements';
import { deconnecter } from '@/session/session';

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

// ── Adresses ─────────────────────────────────────────────────────────────────

export type CleApplication = 'planification' | 'deplacements' | 'analyse' | 'affectation';
export type CleAutreApplication = Exclude<CleApplication, 'planification'>;

/** Adresse de chaque onglet de la Planification */
export const CHEMINS_ONGLETS: Record<CleOnglet, string> = {
    accueil: '/accueil',
    resources: '/ressources',
    evenements: '/evenements',
    planning: '/planification',
    tripadvisor: '/samu-sas',
    cra: '/cra',
    reporting: '/reporting',
    admin: '/administration',
    astreintesGestion: '/astreintes'
};

/** Adresse de chaque autre application */
export const CHEMINS_APPLICATIONS: Record<CleAutreApplication, string> = {
    deplacements: '/deplacements',
    analyse: '/analyse',
    affectation: '/affectation'
};

/** Repères d'une adresse : onglet de la Planification ou autre application */
export interface RepereRoute {
    onglet?: CleOnglet;
    application?: CleAutreApplication;
}

declare module 'vue-router' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extension des métadonnées des routes
    interface RouteMeta extends RepereRoute {}
}

/** Anciens liens des notifications (« ?tab=cra&cra_id=12 », ou « craId » des anciens courriels) : CRA à ouvrir */
export function craDuLien(query: Record<string, unknown>): { cra: boolean; id: number | null } {
    if (query.tab !== 'cra') return { cra: false, id: null };
    const id = Number(query.cra_id ?? query.craId);
    return { cra: true, id: Number.isInteger(id) && id > 0 ? id : null };
}

const cheminArrivee = (config: ConfigOnglets | null, s: Session) =>
    CHEMINS_ONGLETS[ongletArrivee(config, s) as CleOnglet] ?? CHEMINS_ONGLETS.accueil;

/**
 * Adresse à ouvrir à la place de celle demandée ; null si elle est permise. Racine : onglet d'arrivée (ancien lien
 * d'une notification : le CRA) ; adresse inconnue, onglet ou application refusés au profil : onglet d'arrivée
 */
export function destination(
    cible: { name?: RouteRecordNameGeneric | null; meta: RouteMeta; query: Record<string, unknown> },
    config: ConfigOnglets | null,
    s: Session
): string | null {
    if (cible.name === 'racine') {
        const lien = craDuLien(cible.query);
        if (lien.cra && craVisible(config, s)) return lien.id ? `/cra/${lien.id}` : CHEMINS_ONGLETS.cra;
        return cheminArrivee(config, s);
    }
    const { onglet, application } = cible.meta;
    if (onglet) {
        const permis =
            onglet === 'accueil' || (onglet === 'cra' ? craVisible(config, s) : peut(config, s.activeProfile, onglet));
        return permis ? null : cheminArrivee(config, s);
    }
    if (application) return (s.availableApps ?? []).includes(application) ? null : cheminArrivee(config, s);
    return cheminArrivee(config, s);
}

// ── État de la session ───────────────────────────────────────────────────────

export const navigation = reactive({
    config: null as ConfigOnglets | null,
    session: null as Session | null,
    /** Accès chargés et adresse vérifiée : le contenu de l'onglet ou de l'application peut s'afficher */
    pret: false,
    /** Dernier onglet ouvert de la Planification (« » : aucun encore) */
    onglet: '' as string,
    application: 'planification' as CleApplication,
    pastilleCra: 0,
    /** CRA demandé par l'adresse (/cra/12), en attente d'ouverture par l'onglet CRA */
    craDemande: null as number | null
});

let routeur: Router | null = null;

function aller(chemin: RouteLocationRaw) {
    void routeur?.push(chemin);
}

ecouter('session-terminee', () => {
    navigation.config = null;
    navigation.session = null;
    navigation.pret = false;
    navigation.onglet = '';
    navigation.pastilleCra = 0;
    navigation.craDemande = null;
    navigation.application = 'planification';
    // Connexion suivante : onglet d'arrivée du nouvel utilisateur
    void routeur?.replace('/');
});
// Accès aux onglets enregistrés dans l'administration : onglet ouvert devenu interdit → onglet d'arrivée
ecouter('onglets-modifies', d => {
    navigation.config = d.config;
    const s = navigation.session;
    if (!s || !navigation.onglet || navigation.onglet === 'accueil') return;
    const visible =
        navigation.onglet === 'cra' ? craVisible(d.config, s) : peut(d.config, s.activeProfile, navigation.onglet);
    if (visible) return;
    if (navigation.application === 'planification') aller(cheminArrivee(d.config, s));
    else navigation.onglet = '';
});
// CRA traités par l'onglet CRA : pastille relue
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

/**
 * Routeur de la page : adresse vérifiée avant chaque changement (session ouverte), onglet ou application affichés
 * retenus, CRA demandé par l'adresse transmis à l'onglet CRA
 */
export function installerNavigation(r: Router): void {
    routeur = r;
    r.beforeEach(to => {
        // Sans session, la mire masque l'application : adresse gardée, vérifiée à l'ouverture de la session
        const s = navigation.session;
        if (!s || !navigation.pret) return true;
        const autre = destination(to, navigation.config, s);
        return autre === null ? true : { path: autre, replace: true };
    });
    r.afterEach((to, _from, echec) => {
        if (echec || !navigation.session) return;
        const { onglet, application } = to.meta;
        if (onglet) {
            navigation.onglet = onglet;
            navigation.application = 'planification';
            if (onglet === 'cra') void chargerPastilleCra();
            const id = Number(to.params.id);
            if (onglet === 'cra' && Number.isInteger(id) && id > 0) {
                navigation.craDemande = id;
                emettre('cra-demande');
            }
        } else if (application) {
            navigation.application = application;
            (window as unknown as { GPTools?: { position: () => void } }).GPTools?.position();
        }
    });
}

/**
 * Session ouverte : accès chargés, puis adresse de la page vérifiée (adresse demandée avant la connexion gardée si
 * elle est permise, sinon onglet d'arrivée)
 */
export async function demarrerNavigation(s: Session): Promise<void> {
    navigation.session = s;
    await chargerAcces();
    // Session terminée pendant le chargement des accès
    if (toRaw(navigation.session) !== toRaw(s)) return;
    navigation.pret = true;
    void chargerPastilleCra();
    if (!routeur) return;
    const { path, query, hash } = routeur.currentRoute.value;
    await routeur.replace({ path, query, hash, force: true });
}

/** Onglet de la Planification ouvert (son adresse) */
export function ouvrirOnglet(cle: string) {
    const chemin = CHEMINS_ONGLETS[cle as CleOnglet];
    if (chemin) aller(chemin);
}

/** Application affichée (menu Applications, Accueil) */
export function ouvrirApplication(cle: CleApplication) {
    if (cle === 'planification') return revenirPlanification();
    aller(CHEMINS_APPLICATIONS[cle]);
}

/** Retour à la Planification (menu Applications, Accueil d'une application) : dernier onglet ouvert */
export function revenirPlanification() {
    const s = navigation.session;
    const onglet = navigation.onglet as CleOnglet;
    aller(onglet ? CHEMINS_ONGLETS[onglet] : s ? cheminArrivee(navigation.config, s) : '/');
}

/** Bouton « Accueil » des applications : retour à la Planification, sur l'Accueil */
export function allerAccueil() {
    aller(CHEMINS_ONGLETS.accueil);
}

/** Fenêtre de déconnexion des Déplacements : « Aller sur la Plateforme de planification », données relues */
export function quitterDeplacementsVersPlanification() {
    revenirPlanification();
    emettre('ressources-modifiees');
    emettre('grille-a-rafraichir');
}

/** Déconnexion confirmée dans une application */
export async function deconnecterDepuisApplication() {
    await deconnecter();
}

/** CRA demandé par l'adresse, retiré de l'attente ; null si aucun */
export function prendreCraDemande(): number | null {
    const id = navigation.craDemande;
    navigation.craDemande = null;
    return id;
}
