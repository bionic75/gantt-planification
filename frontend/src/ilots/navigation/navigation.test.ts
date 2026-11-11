import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '@/api/types';
import {
    accesDe,
    ACCES_PAR_DEFAUT,
    applicationMemorisee,
    craDuLien,
    craVisible,
    crasEnCours,
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
    document.body.innerHTML = `
        <div class="container"><div id="resources" class="tab-content active"></div><div id="accueil" class="tab-content"></div></div>
        <div id="analyseContainer" style="display: none"></div><div id="deplacementsContainer" style="display: none"></div>
        <div id="affectationContainer" style="display: none"></div>`;
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
        expect(craDuLien('?tab=cra&cra_id=12')).toEqual({ cra: true, id: 12 });
        expect(craDuLien('?tab=cra&craId=7')).toEqual({ cra: true, id: 7 });
        expect(craDuLien('?tab=cra')).toEqual({ cra: true, id: null });
        expect(craDuLien('?tab=planning')).toEqual({ cra: false, id: null });
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

describe('changement d’onglet et d’application', () => {
    it('onglet ouvert : conteneur « active »', () => {
        ouvrirOnglet('accueil');
        expect(document.getElementById('accueil')!.classList.contains('active')).toBe(true);
        expect(document.getElementById('resources')!.classList.contains('active')).toBe(false);
        expect(navigation.onglet).toBe('accueil');
    });

    it('application affichée et gardée pour l’onglet du navigateur ; retour à la Planification', () => {
        ouvrirApplication('analyse');
        expect(document.getElementById('analyseContainer')!.style.display).toBe('block');
        expect(document.querySelector<HTMLElement>('.container')!.style.display).toBe('none');
        expect(applicationMemorisee(SESSION)).toBe('analyse');
        expect(applicationMemorisee({ availableApps: [] })).toBeNull();
        revenirPlanification();
        expect(document.getElementById('analyseContainer')!.style.display).toBe('none');
        expect(navigation.application).toBe('planification');
        expect(applicationMemorisee(SESSION)).toBeNull();
    });
});
