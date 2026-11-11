import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, type Router } from 'vue-router';
import type { Session } from '@/api/types';
import { creerRouteur } from '@/cadre/routes';
import { emettre } from '@/evenements';
import {
    accesDe,
    ACCES_PAR_DEFAUT,
    craDuLien,
    craVisible,
    crasEnCours,
    demarrerNavigation,
    destination,
    installerNavigation,
    navigation,
    ongletArrivee,
    ongletsDisponibles,
    ouvrirApplication,
    ouvrirOnglet,
    peut,
    revenirPlanification
} from './navigation';
import { memoriserOrdre, ordreMemorise, reordonner } from './ordre';

const SESSION: Session = {
    userId: 3,
    username: 'u',
    nom: 'N',
    prenom: 'P',
    email: null,
    activeProfile: 'expert',
    resourceId: 12,
    trigramme: null,
    profilePhoto: null,
    availableApps: ['analyse'],
    is_admin: false,
    is_expert: true,
    is_user: false,
    is_rh: false,
    astreinte_volontaire: false,
    astreinte_date_activation: null,
    defaultTab: 'reporting',
    mustChangePassword: false
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Serveur injoignable : accès par défaut, pas de pastille
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('hors ligne')))
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('accès aux onglets', () => {
    it('configuration de l’administration, à défaut accès par défaut ; profil inconnu : droits Utilisateur', () => {
        expect(peut(null, 'user', 'resources')).toBe(false);
        expect(peut({ user: { resources: true } }, 'user', 'resources')).toBe(true);
        expect(peut(null, 'inconnu', 'planning')).toBe(ACCES_PAR_DEFAUT.user!.planning);
        expect(ongletsDisponibles(null, 'rh')).toEqual(['resources', 'cra', 'astreintesGestion', 'tripadvisor']);
    });

    it('onglet CRA de l’expert : volontaire aux astreintes seulement', () => {
        expect(craVisible(null, SESSION)).toBe(false);
        expect(craVisible(null, { ...SESSION, astreinte_volontaire: true })).toBe(true);
        expect(accesDe(null, SESSION)).toMatchObject({
            affecter: false,
            astreintes: true,
            ressource: true,
            affectation: false
        });
    });

    it('onglet d’arrivée : celui du profil s’il est accessible, sinon l’Accueil', () => {
        expect(ongletArrivee(null, SESSION)).toBe('accueil');
        expect(ongletArrivee(null, { ...SESSION, defaultTab: 'planning' })).toBe('planning');
    });

    it('pastille : CRA non archivés et non diffusés', () => {
        expect(crasEnCours([{ statut: 'soumis' }, { statut: 'diffuse' }, { archived: true, statut: 'soumis' }])).toBe(
            1
        );
    });

    it('lien d’une notification : cra_id, ou craId des anciens courriels', () => {
        expect(craDuLien({ tab: 'cra', cra_id: '12' })).toEqual({ cra: true, id: 12 });
        expect(craDuLien({ tab: 'cra', craId: '7' })).toEqual({ cra: true, id: 7 });
        expect(craDuLien({ tab: 'cra' })).toEqual({ cra: true, id: null });
        expect(craDuLien({ tab: 'planning' })).toEqual({ cra: false, id: null });
    });
});

describe('ordre des onglets', () => {
    it('glisser-déposer : après la cible en venant d’avant, avant elle sinon', () => {
        const o = ['resources', 'evenements', 'planning', 'reporting'];
        expect(reordonner(o, 'resources', 'planning')).toEqual(['evenements', 'planning', 'resources', 'reporting']);
        expect(reordonner(o, 'reporting', 'resources')).toEqual(['reporting', 'resources', 'evenements', 'planning']);
    });

    it('mémorisé par utilisateur, complété par les onglets nouveaux', () => {
        memoriserOrdre(3, ['planning', 'resources', 'inconnu']);
        expect(ordreMemorise(3, ['resources', 'evenements', 'planning'])).toEqual([
            'planning',
            'resources',
            'evenements'
        ]);
        expect(ordreMemorise(4, ['resources', 'evenements'])).toEqual(['resources', 'evenements']);
    });
});

describe('adresses', () => {
    const route = (chemin: string) => creerRouteur(createMemoryHistory()).resolve(chemin);

    it('racine et adresse inconnue : onglet d’arrivée ; ancien lien d’un CRA : le CRA', () => {
        const s = { ...SESSION, defaultTab: 'planning' };
        expect(destination(route('/'), null, s)).toBe('/planification');
        expect(destination(route('/nulle-part'), null, s)).toBe('/planification');
        expect(destination(route('/?tab=cra&cra_id=12'), null, { ...s, astreinte_volontaire: true })).toBe('/cra/12');
        expect(destination(route('/?tab=cra'), null, { ...s, astreinte_volontaire: true })).toBe('/cra');
        // CRA refusé au profil : onglet d’arrivée
        expect(destination(route('/?tab=cra&cra_id=12'), null, s)).toBe('/planification');
    });

    it('onglet ou application refusés au profil : onglet d’arrivée ; permis : gardés', () => {
        expect(destination(route('/reporting'), null, SESSION)).toBe('/accueil');
        expect(destination(route('/planification'), null, SESSION)).toBeNull();
        expect(destination(route('/accueil'), null, SESSION)).toBeNull();
        expect(destination(route('/analyse'), null, SESSION)).toBeNull();
        expect(destination(route('/deplacements'), null, SESSION)).toBe('/accueil');
        expect(destination(route('/cra/3'), null, SESSION)).toBe('/accueil');
    });
});

describe('navigation pendant la session', () => {
    let routeur: Router;
    const chemin = () => routeur.currentRoute.value.fullPath;
    const attente = () => new Promise(r => setTimeout(r, 0));

    async function ouvrir(adresse: string, s: Session = SESSION) {
        routeur = creerRouteur(createMemoryHistory());
        installerNavigation(routeur);
        await routeur.push(adresse);
        await demarrerNavigation(s);
    }

    beforeEach(() => emettre('session-terminee'));

    it('adresse demandée avant la connexion gardée si elle est permise, sinon onglet d’arrivée', async () => {
        await ouvrir('/planification');
        expect(chemin()).toBe('/planification');
        expect(navigation.onglet).toBe('planning');
        emettre('session-terminee');
        await ouvrir('/reporting');
        expect(chemin()).toBe('/accueil');
    });

    it('onglets et applications : leur adresse ; retour à la Planification sur le dernier onglet', async () => {
        await ouvrir('/');
        ouvrirOnglet('planning');
        await attente();
        expect(chemin()).toBe('/planification');
        ouvrirApplication('analyse');
        await attente();
        expect(chemin()).toBe('/analyse');
        expect(navigation.application).toBe('analyse');
        revenirPlanification();
        await attente();
        expect(chemin()).toBe('/planification');
        expect(navigation.application).toBe('planification');
        // Retour arrière du navigateur
        routeur.back();
        await attente();
        expect(chemin()).toBe('/analyse');
    });

    it('adresse d’un CRA : CRA demandé à l’onglet CRA', async () => {
        await ouvrir('/cra/12', { ...SESSION, astreinte_volontaire: true });
        expect(chemin()).toBe('/cra/12');
        expect(navigation.craDemande).toBe(12);
    });

    it('fin de la session : état oublié, racine', async () => {
        await ouvrir('/planification');
        emettre('session-terminee');
        await attente();
        expect(navigation.session).toBeNull();
        expect(navigation.pret).toBe(false);
        expect(chemin()).toBe('/');
    });
});
describe('ancien lien d’une notification', () => {
    it('« /?tab=cra&cra_id=12 » à l’ouverture de la session : /cra/12', async () => {
        const routeur = creerRouteur(createMemoryHistory());
        installerNavigation(routeur);
        await routeur.push('/?tab=cra&cra_id=12');
        await demarrerNavigation({ ...SESSION, astreinte_volontaire: true });
        expect(routeur.currentRoute.value.fullPath).toBe('/cra/12');
        emettre('session-terminee');
    });
});
