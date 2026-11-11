import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PastillesApplication from '@/ilots/applications/PastillesApplication.vue';
import { CLE_CONVERSATIONS, cleHistorique, useDiscussionsStore } from './discussions';
import { DECOMPTE_ECHEANCE, restantes, useInactiviteStore } from './inactivite';
import { initialesConnecte, nomConnecte, useConnectesStore } from './magasin';

vi.mock('./son', () => ({ jouerSonNotification: vi.fn() }));

/** Réponses simulées de l'API : « MÉTHODE /chemin » → [statut, corps] ; corps envoyés enregistrés */
function simulerApi(reponses: Record<string, [number, unknown]>) {
    const appels: { cle: string; corps: unknown }[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
            const cle = `${init?.method ?? 'GET'} ${url.replace(/^\/api/, '')}`;
            appels.push({ cle, corps: init?.body ? JSON.parse(String(init.body)) : undefined });
            const [statut, corps] = reponses[cle] ?? [404, { error: `non simulé : ${cle}` }];
            return new Response(JSON.stringify(corps), {
                status: statut,
                headers: { 'Content-Type': 'application/json' }
            });
        })
    );
    return appels;
}

let pinia: Pinia;
beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    sessionStorage.clear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('connectés', () => {
    it('nom et initiales : trigramme, sinon initiales du prénom et du nom', () => {
        expect(nomConnecte({ prenom: 'Jeanne', nom: 'Dupont', username: 'jd' })).toBe('Jeanne Dupont');
        expect(nomConnecte({ prenom: null, nom: null, username: 'jd' })).toBe('jd');
        expect(initialesConnecte({ trigramme: 'JDU', prenom: 'Jeanne', nom: 'Dupont' })).toBe('JDU');
        expect(initialesConnecte({ trigramme: null, prenom: 'Jeanne', nom: 'Dupont' })).toBe('JD');
    });

    it('pastilles : identifiants de l’ancien en-tête sans préfixe, minuteur seulement si l’inactivité est active', async () => {
        simulerApi({
            'GET /active-sessions': [
                200,
                {
                    activeUsers: [
                        {
                            userId: 1,
                            username: 'a',
                            prenom: 'Ana',
                            nom: 'Lima',
                            trigramme: null,
                            profilePhoto: null,
                            profile: 'rh'
                        }
                    ]
                }
            ]
        });
        await useConnectesStore().charger();
        const w = mount(PastillesApplication, { global: { plugins: [pinia] } });
        expect(w.find('#onlineUsersContainer').exists()).toBe(true);
        expect(w.find('#onlineUsersCount').text()).toBe('1 connecté(s)');
        expect(w.find('#onlineUsersAvatars [title="Ana Lima"]').text()).toBe('AL');
        expect(w.find('#inactivityTimerDisplay').exists()).toBe(false);
        const inactivite = useInactiviteStore();
        inactivite.demarrer(2);
        await flushPromises();
        expect(w.find('#timerMinutes').text()).toBe('02');
        expect(w.find('#inactivityTimerDisplay').classes()).toContain('gp-pastilles__minuteur--orange');
        inactivite.arreter();
        const app = mount(PastillesApplication, { props: { prefixe: 'analyse' }, global: { plugins: [pinia] } });
        expect(app.find('#analyseOnlineUsersContainer').exists()).toBe(true);
    });
});

describe('conversations', () => {
    it('message reçu : conversation ouverte, historique gardé ; réduite : messages non lus comptés', () => {
        const d = useDiscussionsStore();
        const recu = (message: string) =>
            d.recevoir({
                fromUserId: 7,
                fromName: 'Test Fictif',
                fromPhoto: null,
                fromProfile: 'expert',
                message,
                sentAt: '2031-03-03T10:00:00Z'
            });
        recu('Bonjour');
        expect(d.discussions).toHaveLength(1);
        expect(JSON.parse(sessionStorage.getItem(CLE_CONVERSATIONS) || '[]')).toEqual([
            { userId: 7, name: 'Test Fictif', photo: null, minimized: false }
        ]);
        d.basculer(7);
        recu('Encore');
        expect(d.discussions[0]!.unread).toBe(1);
        d.basculer(7);
        expect(d.discussions[0]!.unread).toBe(0);
        expect(JSON.parse(sessionStorage.getItem(cleHistorique(7)) || '[]')).toHaveLength(2);
    });

    it('rechargement : conversations restaurées ; fermeture : historique effacé', () => {
        const d = useDiscussionsStore();
        d.demarrer(9, 'Autre', null, 'user');
        d.recevoir({
            fromUserId: 9,
            fromName: 'Autre',
            fromPhoto: null,
            message: 'Salut',
            sentAt: '2031-03-03T10:00:00Z'
        });
        setActivePinia(createPinia());
        const apres = useDiscussionsStore();
        apres.restaurer();
        expect(apres.discussions[0]?.messages.map(m => m.text)).toEqual(['Salut']);
        apres.fermer(9);
        expect(sessionStorage.getItem(cleHistorique(9))).toBeNull();
        expect(JSON.parse(sessionStorage.getItem(CLE_CONVERSATIONS) || '[]')).toEqual([]);
    });

    it('envoi : message ajouté ; refus : erreur du serveur dans la conversation', async () => {
        const d = useDiscussionsStore();
        d.demarrer(5, 'Test', null, null);
        const appels = simulerApi({ 'POST /push-message': [200, { success: true }] });
        expect(await d.envoyer(5, '  Bonjour  ')).toBe(true);
        expect(appels[0]?.corps).toEqual({ toUserId: 5, message: 'Bonjour' });
        expect(d.discussions[0]!.messages[0]).toMatchObject({ text: 'Bonjour', isOwn: true });
        simulerApi({ 'POST /push-message': [400, { error: 'Destinataire hors ligne' }] });
        expect(await d.envoyer(5, 'Second')).toBe(false);
        expect(d.discussions[0]!.erreur).toBe('Erreur : Destinataire hors ligne');
    });
});

describe('inactivité', () => {
    it('secondes restantes d’après la dernière activité', () => {
        expect(restantes(2, 0, 70_000)).toBe(50);
        expect(restantes(2, 0, 120_500)).toBe(0);
    });

    it('décompte, activité, échéance de 15 s, rester connecté', () => {
        vi.useFakeTimers();
        const i = useInactiviteStore();
        i.demarrer(2);
        vi.advanceTimersByTime(70_000);
        expect(i.restant).toBe(50);
        document.dispatchEvent(new MouseEvent('mousedown'));
        vi.advanceTimersByTime(1000);
        expect(i.restant).toBe(119);
        vi.advanceTimersByTime(119_000);
        expect(i.echeance).toBe(DECOMPTE_ECHEANCE);
        vi.advanceTimersByTime(3000);
        expect(i.echeance).toBe(DECOMPTE_ECHEANCE - 3);
        i.resterConnecte();
        expect(i.echeance).toBeNull();
        expect(i.restant).toBe(120);
        i.arreter();
    });

    it('paramétrage désactivé : pas de décompte', async () => {
        simulerApi({ 'GET /settings': [200, { inactivity_enabled: 'false' }] });
        const i = useInactiviteStore();
        i.demarrer(5);
        await i.configurer();
        expect(i.actif).toBe(false);
    });
});
