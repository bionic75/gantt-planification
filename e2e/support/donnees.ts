// Données de test créées par l'API (session administrateur), toujours supprimées en fin de scénario.
// Les dates sont placées en 2031 (déploiements, planification) ou au-delà de 2090 (CRA) pour ne pas croiser
// les données réelles de l'environnement testé.
import { expect } from '@playwright/test';

import type { Monde } from './monde.ts';

const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const alea = (n: number, alphabet = lettres) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

/** Coordonnées du SAMU-SAS de test (Paris) et d'un lieu proche */
export const PARIS = { latitude: 48.8566, longitude: 2.3522 };
export const PRES_DE_PARIS = { latitude: 48.8606, longitude: 2.3376 };

export const adminApi = (monde: Monde) => monde.apiDe('Administrateur');

/** Date AAAA-MM-JJ → liste des jours (inclus) */
export function jours(debut: string, fin: string) {
    const out = [];
    for (let d = new Date(`${debut}T12:00:00Z`); d <= new Date(`${fin}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

/** Clé de cellule de la planification */
export const cle = (rid: number, type: string, date: string, p: 'AM' | 'PM') => `${rid}_${type}_${date}_${p}`;

/**
 * Date du jour AAAA-MM-JJ à Paris, fuseau de l'application et du navigateur des tests, quel que soit celui de la
 * machine qui exécute les tests (UTC sur les runners de CI)
 */
export const aujourdhuiParis = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());

/** Mois courant à Paris : { annee, mois } (mois de 1 à 12) */
export const moisCourantParis = () => {
    const [annee, mois] = aujourdhuiParis().split('-').map(Number);
    return { annee, mois };
};

export const premierJourDuMois = () => `${aujourdhuiParis().slice(0, 8)}01`;

/**
 * Ressource standard (supprimée en fin de scénario avec sa planification)
 */
export async function creerRessource(monde: Monde, champs: Record<string, unknown> = {}) {
    const api = await adminApi(monde);
    const body = {
        nom: monde.unique('E2E').replace(/\s+/g, '-'),
        prenom: 'Test',
        trigramme: `Z${alea(2)}`,
        taux: 50,
        samu: 'SAMU 75',
        date_debut: '2026-01-01',
        ...champs
    };
    const r = await api.post('/api/resources', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const ressource = { id: r.data.id as number, ...body };
    monde.aNettoyer(`ressource ${ressource.nom}`, () => api.delete(`/api/resources/${ressource.id}`));
    return ressource;
}

export async function lireRessource(monde: Monde, id: number) {
    const api = await adminApi(monde);
    return (await api.ok('GET', '/api/resources')).find((r: any) => r.id === id);
}

/** Ressource trouvée par son nom (créée depuis l'interface) ; nettoyage enregistré */
export async function ressourceParNom(monde: Monde, nom: string) {
    const api = await adminApi(monde);
    const r = (await api.ok('GET', '/api/resources')).find((x: any) => x.nom === nom);
    if (r && !monde.d[`nettoyage_res_${r.id}`]) {
        monde.d[`nettoyage_res_${r.id}`] = true;
        monde.aNettoyer(`ressource ${nom}`, () => api.delete(`/api/resources/${r.id}`));
    }
    return r;
}

/**
 * Localisation (SAMU) de test, libellé court « SAMU 9xxx »
 */
export async function creerLocalisation(
    monde: Monde,
    { geo = true, prefixe = 'SAMU 9' }: { geo?: boolean; prefixe?: string } = {}
) {
    const api = await adminApi(monde);
    // Numéro à 4 chiffres « 9xxx » : jamais celui d'un SAMU réel, et lu comme un numéro par l'application
    const court = `${prefixe}${alea(3, '0123456789')}`;
    const body = {
        libelle_long: `${monde.unique('E2E SAMU')} ${court}`,
        libelle_court: court,
        adresse: '1 place du Test, Paris',
        ...(geo ? PARIS : {})
    };
    const r = await api.post('/api/locations', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const loc = {
        id: r.data.id as number,
        court: court.toUpperCase(),
        long: body.libelle_long.toUpperCase()
    };
    monde.aNettoyer(`localisation ${court}`, () => api.delete(`/api/locations/${loc.id}`));
    return loc;
}

/** Options d'un déploiement de test */
export interface OptionsDeploiement {
    debut?: string;
    visite?: [string, string];
    needed?: number | null;
    extra?: Record<string, unknown>;
}

/** Déploiement d'une localisation (visite métier en 2031) ; supprimé avec ses événements en fin de scénario */
export function corpsDeploiement(
    loc: { id: number; court: string },
    { debut = '2031-01-06', visite = ['2031-03-03', '2031-03-05'], needed = 2, extra = {} }: OptionsDeploiement = {}
) {
    const periode: Record<string, unknown> = { start: visite[0], end: visite[1] };
    if (needed != null) periode.needed = needed;
    return {
        samu_name: loc.court,
        location_id: loc.id,
        date_debut: debut,
        date_mise_en_service: '2031-04-01',
        periods: { visite_metier: [periode] },
        ...extra
    };
}

/** Enregistre le nettoyage d'un déploiement créé (événements liés supprimés) */
export async function suivreDeploiement(monde: Monde, dep: any) {
    const api = await adminApi(monde);
    monde.d.deploiement = dep;
    monde.aNettoyer(`déploiement ${dep.samu_name}`, async () => {
        const r = await api.delete(`/api/affectation/projects/${dep.id}?events=delete`);
        if (r.status >= 400 && r.status !== 404) throw new Error(JSON.stringify(r.data));
    });
}

export async function creerDeploiement(monde: Monde, options: Parameters<typeof corpsDeploiement>[1] = {}) {
    const loc = monde.d.localisation || (monde.d.localisation = await creerLocalisation(monde));
    const api = await adminApi(monde);
    const r = await api.post('/api/affectation/projects', corpsDeploiement(loc, options));
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    await suivreDeploiement(monde, r.data);
    return r.data;
}

export async function lireDeploiement(monde: Monde, id: number) {
    const api = await adminApi(monde);
    return (await api.ok('GET', '/api/affectation/projects')).projects.find((p: any) => p.id === id);
}

/** Type d'événement de test */
export async function creerTypeEvenement(monde: Monde, champs: Record<string, unknown> = {}) {
    const api = await adminApi(monde);
    const body = {
        label_long: monde.unique('Type E2E'),
        label_short: 'E2E',
        icon: 'flag',
        bg_color: '#112233',
        text_color: '#ffffff',
        border_color: '#000000',
        ...champs
    };
    const r = await api.post('/api/event-types', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const type = { id: r.data.id as number, ...body };
    monde.aNettoyer(`type ${body.label_long}`, () => api.delete(`/api/event-types/${type.id}`));
    return type;
}

export const typeParCode = async (monde: Monde, code: string) =>
    (await (await adminApi(monde)).ok('GET', '/api/event-types')).types.find((t: any) => t.code === code);

/** Suppression d'un événement en fin de scénario (sans erreur s'il a déjà été supprimé) */
export async function suivreEvenement(monde: Monde, id: number) {
    const api = await adminApi(monde);
    monde.aNettoyer(`événement ${id}`, () => api.delete(`/api/custom-events/${id}`));
}

/** Événement créé par l'administrateur */
export async function creerEvenement(monde: Monde, champs: Record<string, unknown> = {}) {
    const api = await adminApi(monde);
    const r = await api.post('/api/custom-events', {
        startDate: '2031-05-01',
        label: monde.unique('Évt E2E'),
        ...champs
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    await suivreEvenement(monde, r.data.eventId);
    return r.data.eventId as number;
}

export async function lireEvenement(monde: Monde, id: number) {
    const api = await adminApi(monde);
    return (await api.ok('GET', '/api/custom-events')).events.find((e: any) => e.id === id);
}

/** Lieu TripAdVisor créé par un acteur (supprimé par l'administrateur en fin de scénario) */
export async function creerLieu(monde: Monde, acteur: string, champs: Record<string, unknown> = {}) {
    const api = await monde.apiDe(acteur);
    const loc = monde.d.samuSas!;
    const body = {
        category: 'restaurant',
        name: monde.unique('Lieu E2E'),
        location_id: loc.id,
        address: '1 rue du Test, Paris',
        ...PRES_DE_PARIS,
        ...champs
    };
    const r = await api.post('/api/poi', body);
    monde.reponse = r;
    if (r.status === 200) {
        const id = r.data.id;
        const admin = await adminApi(monde);
        monde.aNettoyer(`lieu ${id}`, () => admin.delete(`/api/poi/${id}`));
        monde.d.lieu = { id, ...body };
    }
    return r;
}

/**
 * Compte de test (profil Utilisateur par défaut), supprimé en fin de scénario. Distinct des quatre comptes partagés :
 * les actions sur un compte (désactivation, mot de passe, déconnexion…) ne gênent aucun autre scénario.
 */
export async function creerCompte(monde: Monde, champs: Record<string, unknown> = {}) {
    const api = await adminApi(monde);
    const id = `${monde.suffixe}${++monde.seq}`;
    const login = `e2e.compte.${id.toLowerCase()}`;
    const body = {
        username: login,
        password: 'Compte-E2E-2026!',
        nom: 'E2E',
        prenom: `Compte${id.toLowerCase()}`,
        email: `${login}@example.invalid`,
        is_user: 1,
        ...champs
    };
    const r = await api.post('/api/users', body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const compte = { id: r.data.id as number, ...body };
    monde.aNettoyer(`compte ${login}`, () => api.delete(`/api/users/${compte.id}`));
    return compte;
}

/** Ressource de l'expert de test (compte rattaché à une ressource) */
export async function ressourceExpert(monde: Monde) {
    const s = await monde.sessionDe('Expert');
    if (!s.resourceId) throw new Error("Le compte Expert de test n'est rattaché à aucune ressource");
    return { userId: s.userId as number, resourceId: s.resourceId as number, session: s };
}

/** Réinitialise un mois de planification de la ressource de l'expert en fin de scénario */
export async function nettoyerMoisExpert(monde: Monde, annee: number, mois0: number) {
    const { resourceId } = await ressourceExpert(monde);
    const cleNettoyage = `planif_expert_${annee}_${mois0}` as const;
    if (monde.d[cleNettoyage]) return;
    monde.d[cleNettoyage] = true;
    const api = await adminApi(monde);
    monde.aNettoyer(`planification expert ${mois0 + 1}/${annee}`, () =>
        api.post('/api/schedule/reset-month', { resourceId, year: annee, month: mois0 })
    );
}

/** Réessaie une lecture jusqu'à obtenir une valeur (écritures faites après la réponse du serveur) */
export async function attendre(fn: () => Promise<any>, timeoutMs = 10000) {
    const fin = Date.now() + timeoutMs;
    let dernier;
    while (Date.now() < fin) {
        dernier = await fn();
        if (dernier) return dernier;
        await new Promise(r => setTimeout(r, 250));
    }
    return dernier;
}
