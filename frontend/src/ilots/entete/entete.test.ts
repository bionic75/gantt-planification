import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/api/types';
import ZoneUtilisateur from '@/ilots/applications/ZoneUtilisateur.vue';
import { usePlanificationStore } from '@/ilots/planification/magasin';
import { useSessionStore } from '@/stores/session';
import BoutonsEnTete from './BoutonsEnTete.vue';
import MenuApplications from './MenuApplications.vue';

const SESSION: Session = {
    userId: 7,
    username: 'jdupont',
    nom: 'Dupont',
    prenom: 'Jeanne',
    email: null,
    activeProfile: 'rh',
    resourceId: null,
    trigramme: null,
    profilePhoto: null,
    availableApps: ['analyse', 'deplacements'],
    is_admin: false,
    is_expert: false,
    is_user: true,
    is_rh: true,
    astreinte_volontaire: false,
    astreinte_date_activation: null,
    mustChangePassword: false
};

let pinia: Pinia;
beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
});
afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('ZoneUtilisateur', () => {
    it('Planification : « NOM Prénom », initiales sans trigramme, libellé RH, changement de profil proposé', () => {
        const w = mount(ZoneUtilisateur, {
            props: { session: SESSION, format: 'nom-prenom', changementProfil: true }
        });
        expect(w.find('#userDisplayName').text()).toBe('DUPONT Jeanne');
        expect(w.find('#profileTrigramme').text()).toBe('JD');
        expect(w.find('#profileSwitcherLabel').text()).toBe('RH');
        expect(w.findAll('#profileDropdown > div').map(d => d.text())).toEqual(['RH✓', 'Utilisateur']);
        expect(w.find('#userDisplayRole').exists()).toBe(false);
    });

    it('application : « Prénom Nom », identifiants préfixés, profil seul (RH) sans changement de profil', () => {
        const w = mount(ZoneUtilisateur, { props: { session: { ...SESSION, trigramme: 'JDU' }, prefixe: 'analyse' } });
        expect(w.find('#analyseUserDisplayName').text()).toBe('Jeanne Dupont');
        expect(w.find('#analyseProfileTrigramme').text()).toBe('JDU');
        expect(w.find('#analyseUserDisplayRole').text()).toBe('RH');
        expect(w.find('#analyseProfileSwitcher').exists()).toBe(false);
    });

    it('pastille des nouvelles affectations : affichée si non nulle, clic signalé', async () => {
        const w = mount(ZoneUtilisateur, { props: { session: SESSION, nouvellesAffectations: 3 } });
        expect(w.find('#notificationCount').text()).toBe('3');
        await w.find('#notificationBadge').trigger('click');
        expect(w.emitted('nouvelles-affectations')).toHaveLength(1);
        await w.setProps({ nouvellesAffectations: 0 });
        expect(w.find('#notificationBadge').exists()).toBe(false);
    });
});

describe('BoutonsEnTete', () => {
    const monter = (session: Session) => {
        useSessionStore().session = session;
        return mount(BoutonsEnTete, { global: { plugins: [pinia] }, attachTo: document.body });
    };

    it('profil RH : ni recherche ni enveloppe', () => {
        const w = monter(SESSION);
        expect(w.find('#homeBtn').exists()).toBe(true);
        expect(w.find('#searchBtn').exists()).toBe(false);
        expect(w.find('#sendEmailBtn').exists()).toBe(false);
        w.unmount();
    });

    it('pastille de l’enveloppe : nombre et teinte selon les affectations en attente', async () => {
        const w = monter({ ...SESSION, activeProfile: 'user' });
        expect(w.find('#pendingEmailBadge').exists()).toBe(false);
        const p = usePlanificationStore();
        const expert = (types: string[]) => ({
            expertId: 1,
            expertEmail: null,
            expertNom: 'N',
            expertPrenom: 'P',
            resourceNom: 'N',
            resourcePrenom: 'P',
            assignments: types.map(t => ({
                date: '2031-03-03',
                period: 'AM' as const,
                activity: 'A',
                activityCode: '5',
                location: '',
                actionType: t as 'new' | 'modified' | 'deleted'
            }))
        });
        p.enAttente = { '1': expert(['modified', 'modified']) };
        await flushPromises();
        expect(w.find('#pendingEmailBadge').text()).toBe('2');
        expect(w.find('#pendingEmailBadge').classes()).toContain('gp-entete-bouton__pastille--modifications');
        p.enAttente = { '1': expert(['new', 'deleted']) };
        await flushPromises();
        expect(w.find('#pendingEmailBadge').classes()).not.toContain('gp-entete-bouton__pastille--modifications');
        w.unmount();
    });
});

describe('MenuApplications', () => {
    it('applications du compte sauf celle affichée ; depuis une autre application, Planification en premier', async () => {
        document.body.innerHTML = '<div id="analyseContainer" style="display: none"></div>';
        useSessionStore().session = SESSION;
        const w = mount(MenuApplications, { global: { plugins: [pinia] }, attachTo: document.body });
        await w.find('#appSwitcherBtn').trigger('click');
        expect(w.findAll('#appSwitcherDropdown > div').map(d => d.text())).toEqual([
            'Analyse de fichiers',
            'Suivi des déplacements'
        ]);
        await w.find('#appSwitcherBtn').trigger('click');
        (document.getElementById('analyseContainer') as HTMLElement).style.display = 'block';
        await w.find('#appSwitcherBtn').trigger('click');
        expect(w.findAll('#appSwitcherDropdown > div').map(d => d.text())).toEqual([
            'Planification',
            'Suivi des déplacements'
        ]);
        w.unmount();
    });

    it('aucune application supplémentaire : menu absent', () => {
        useSessionStore().session = { ...SESSION, availableApps: [] };
        const w = mount(MenuApplications, { global: { plugins: [pinia] } });
        expect(w.find('#appSwitcher').exists()).toBe(false);
    });
});
