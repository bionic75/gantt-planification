import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import EtapeDoubleAuthentification from './EtapeDoubleAuthentification.vue';
import FenetreMotDePasseOublie from './FenetreMotDePasseOublie.vue';
import { identifiantsConnus, oublierIdentifiant, propositions, retenirIdentifiant } from './identifiants';
import { useSessionStore } from './magasin';
import MireConnexion from './MireConnexion.vue';

/** Réponses simulées de l'API : « MÉTHODE /chemin » → [statut, corps] ; appels enregistrés */
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

const VERSION: Record<string, [number, unknown]> = { 'GET /version': [200, { version: '2.19.0' }] };

beforeEach(() => {
    localStorage.clear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('identifiants utilisés sur le poste', () => {
    it('retenus en tête sans doublon (casse ignorée), 8 au plus, oubliés un à un', () => {
        for (let i = 0; i < 9; i++) retenirIdentifiant(`compte${i}`);
        retenirIdentifiant('COMPTE3');
        const connus = identifiantsConnus();
        expect(connus).toHaveLength(8);
        expect(connus[0]).toBe('COMPTE3');
        expect(connus.filter(x => x.toLowerCase() === 'compte3')).toHaveLength(1);
        oublierIdentifiant('COMPTE3');
        expect(identifiantsConnus()).not.toContain('COMPTE3');
    });

    it('proposés quand ils contiennent la saisie ; aucun si la saisie est le seul proposé', () => {
        const connus = ['e2e.alpha', 'e2e.beta', 'autre'];
        expect(propositions('', connus)).toEqual(connus);
        expect(propositions('E2E', connus)).toEqual(['e2e.alpha', 'e2e.beta']);
        expect(propositions('e2e.alpha', connus)).toEqual([]);
        expect(propositions('xyz', connus)).toEqual([]);
    });
});

describe('MireConnexion', () => {
    const monter = (mode: 'bureau' | 'mobile') => mount(MireConnexion, { props: { mode }, attachTo: document.body });
    const remplir = async (w: ReturnType<typeof monter>, login: string, mdp: string) => {
        await w.find('#loginUsername').setValue(login);
        await w.find('#loginPassword').setValue(mdp);
        await w.find('#loginButton').trigger('click');
        await flushPromises();
    };

    it('identifiants requis, version lue', async () => {
        simulerApi(VERSION);
        const w = monter('bureau');
        await flushPromises();
        expect(w.find('#appVersion').text()).toBe('2.19.0');
        await w.find('#loginButton').trigger('click');
        expect(w.find('#loginError').text()).toBe('Veuillez remplir les identifiants');
        w.unmount();
    });

    it('bureau : profil à choisir, puis connexion avec ce profil', async () => {
        const appels = simulerApi({
            ...VERSION,
            'POST /login': [200, { profileRequired: true, profiles: ['expert', 'user'] }]
        });
        const w = monter('bureau');
        await remplir(w, 'compte', 'Mot-de-passe-1!');
        expect(w.findAll('#loginProfile option').map(o => o.text())).toEqual([
            '-- Choisir un profil --',
            'Expert Métier',
            'Utilisateur'
        ]);
        expect(w.find('#loginButton').text()).toContain('Se connecter');
        await w.find('#loginButton').trigger('click');
        expect(w.find('#loginError').text()).toBe('Veuillez sélectionner un profil');

        simulerApi({
            ...VERSION,
            'POST /login': [200, { success: true, user: { id: 7, nom: 'N', prenom: 'P', activeProfile: 'user' } }]
        });
        await w.find('#loginProfile').setValue('user');
        await w.find('#loginButton').trigger('click');
        await flushPromises();
        expect(w.emitted('connecte')?.[0]?.[0]).toMatchObject({ id: 7, activeProfile: 'user' });
        expect(appels[1]?.corps).toEqual({ username: 'compte', password: 'Mot-de-passe-1!' });
        // Formulaire vidé, identifiant retenu sur le poste
        expect((w.find('#loginUsername').element as HTMLInputElement).value).toBe('');
        expect(identifiantsConnus()).toEqual(['compte']);
        w.unmount();
    });

    it('mobile : connexion par /mobile-login, message du serveur affiché, aucun identifiant retenu', async () => {
        const appels = simulerApi({
            ...VERSION,
            'POST /mobile-login': [403, { error: 'Mot de passe à changer : connectez-vous une première fois…' }]
        });
        const w = monter('mobile');
        expect(w.find('h2').text()).toBe('Mon planning');
        expect(w.find('.lp-forgot').exists()).toBe(false);
        await remplir(w, 'expert', 'Mot-de-passe-1!');
        expect(appels.map(a => a.cle)).toContain('POST /mobile-login');
        expect(w.find('#loginError').text()).toBe('Mot de passe à changer : connectez-vous une première fois…');
        expect(identifiantsConnus()).toEqual([]);
        w.unmount();
    });

    it('double authentification annulée : retour aux identifiants, mot de passe vidé', async () => {
        simulerApi({
            ...VERSION,
            'POST /login': [200, { mfaRequired: true, mfaMethod: 'choice', totpConfigured: true, pendingUserId: 3 }]
        });
        const w = monter('bureau');
        await remplir(w, 'compte', 'Mot-de-passe-1!');
        expect(w.find('[data-etape="choix-mfa"]').exists()).toBe(true);
        await w.find('.lp-link').trigger('click');
        expect(w.find('[data-etape="identifiants"]').exists()).toBe(true);
        expect((w.find('#loginPassword').element as HTMLInputElement).value).toBe('');
        expect((w.find('#loginUsername').element as HTMLInputElement).value).toBe('compte');
        w.unmount();
    });

    it('réinitialisée par la mire réaffichée : formulaire vidé, message affiché', async () => {
        simulerApi(VERSION);
        const w = monter('bureau');
        await w.find('#loginUsername').setValue('compte');
        (w.vm as unknown as { reinitialiser: (m?: string) => void }).reinitialiser('Votre session a expiré.');
        await nextTick();
        expect((w.find('#loginUsername').element as HTMLInputElement).value).toBe('');
        expect(w.find('#loginError').text()).toBe('Votre session a expiré.');
        w.unmount();
    });
});

describe('EtapeDoubleAuthentification', () => {
    const monter = (demande: Record<string, unknown>) =>
        mount(EtapeDoubleAuthentification, {
            props: { demande: { userId: 3, profil: 'user', methode: 'choice', totpConfigure: true, ...demande } },
            attachTo: document.body
        });

    it('code par e-mail envoyé dès le choix, code de 6 chiffres exigé, erreur du serveur affichée', async () => {
        const appels = simulerApi({
            'POST /mfa/send-code': [200, { success: true }],
            'POST /mfa/verify': [401, { error: 'Code invalide ou expiré' }]
        });
        const w = monter({});
        await nextTick();
        await w.findAll('.lp-choix__methode')[0]!.trigger('click');
        await flushPromises();
        expect(appels.map(a => a.cle)).toEqual(['POST /mfa/send-code']);
        expect(w.attributes('data-etape')).toBe('code-mfa');
        expect(w.attributes('data-methode')).toBe('email');
        await w.find('#mfaCodeInput').setValue('12');
        await w.find('#mfaVerifyButton').trigger('click');
        expect(w.find('#mfaCodeError').text()).toBe('Le code doit contenir 6 chiffres');
        await w.find('#mfaCodeInput').setValue('123456');
        await w.find('#mfaVerifyButton').trigger('click');
        await flushPromises();
        expect(appels[1]).toEqual({ cle: 'POST /mfa/verify', corps: { userId: 3, code: '123456', profile: 'user' } });
        expect(w.find('#mfaCodeError').text()).toBe('Code invalide ou expiré');
        expect((w.find('#mfaCodeInput').element as HTMLInputElement).value).toBe('');
        w.unmount();
    });

    it('application non configurée : mise en place (QR code, clé), puis connexion à la confirmation', async () => {
        const appels = simulerApi({
            'POST /mfa/totp-setup': [200, { secret: 'ABCDEF', qrCode: 'data:image/png;base64,AA' }],
            'POST /mfa/totp-confirm': [
                200,
                { success: true, user: { id: 3, nom: 'N', prenom: 'P', activeProfile: 'user' } }
            ]
        });
        const w = monter({ methode: 'totp', totpConfigure: false });
        await flushPromises();
        expect(w.attributes('data-etape')).toBe('totp-setup');
        expect(w.find('#mfaTotpSecret').text()).toBe('ABCDEF');
        await w.find('#mfaTotpConfirmCode').setValue('654321');
        await w.findAll('button.lp-btn').at(-1)!.trigger('click');
        await flushPromises();
        expect(appels[1]?.corps).toEqual({ userId: 3, secret: 'ABCDEF', code: '654321', profile: 'user' });
        expect(w.emitted('connecte')?.[0]?.[0]).toMatchObject({ id: 3 });
        w.unmount();
    });

    it('envoi du code impossible : retour aux identifiants avec le message (SMTP signalé)', async () => {
        simulerApi({ 'POST /mfa/send-code': [500, { error: 'Configuration SMTP absente' }] });
        const w = monter({ methode: 'email' });
        await flushPromises();
        expect(w.emitted('echec')?.[0]).toEqual(['❌ Configuration SMTP absente']);
        w.unmount();
    });
});

describe('FenetreMotDePasseOublie', () => {
    it('identifiant requis ; délai du serveur avant une nouvelle demande', async () => {
        vi.useFakeTimers();
        simulerApi({
            'POST /forgot-password': [429, { error: 'Patientez avant une nouvelle demande', remainingSeconds: 3 }]
        });
        const w = mount(FenetreMotDePasseOublie, {
            props: { ouverte: true, identifiant: '' },
            attachTo: document.body
        });
        await nextTick();
        const bouton = () => document.getElementById('forgotPasswordButton') as HTMLButtonElement;
        bouton().click();
        await nextTick();
        expect(document.getElementById('forgotPasswordMessage')?.textContent?.trim()).toBe(
            'Veuillez entrer votre identifiant'
        );
        const champ = document.getElementById('forgotUsername') as HTMLInputElement;
        champ.value = 'compte';
        champ.dispatchEvent(new Event('input'));
        bouton().click();
        await vi.waitFor(() => expect(bouton().textContent?.trim()).toBe('Réessayer dans 3s'));
        expect(bouton().disabled).toBe(true);
        await vi.advanceTimersByTimeAsync(3000);
        expect(bouton().textContent?.trim()).toBe('Envoyer');
        expect(bouton().disabled).toBe(false);
        w.unmount();
    });
});

describe('magasin de la session', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('session ouverte, mot de passe à changer, absente', async () => {
        const session = useSessionStore();
        simulerApi({ 'GET /check-session': [200, { userId: 5, nom: 'N', prenom: 'P', activeProfile: 'admin' }] });
        expect(await session.verifier()).toBe('ouverte');
        expect(session.utilisateur).toMatchObject({ id: 5, userId: 5 });
        simulerApi({ 'GET /check-session': [200, { userId: 5, mustChangePassword: true }] });
        expect(await session.verifier()).toBe('mot-de-passe-a-changer');
        expect(session.utilisateur).toBeNull();
        simulerApi({ 'GET /check-session': [401, { error: 'Non authentifié' }] });
        expect(await session.verifier()).toBe('absente');
    });
});
