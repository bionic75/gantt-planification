import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { useSessionStore } from '@/stores/session';
import { emettre } from '@/liaison';
import { surReouverture } from './activation';
import { surveillerIlots } from './montage';

/** Composant d'essai : affiche le profil de la session présente dans le magasin */
const Essai = defineComponent({
    setup() {
        const session = useSessionStore();
        return () => h('p', { 'data-testid': 'essai' }, `profil:${session.profil ?? 'aucun'}`);
    }
});

/** Attente du montage (chargement du composant puis rendu) */
const rendu = async () => {
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
};

let arreter: () => void = () => {};

beforeEach(() => {
    document.body.innerHTML = '<div id="onglet" class="tab-content"><p>ancien contenu</p></div>';
});
afterEach(() => arreter());

const conteneur = () => document.getElementById('onglet') as HTMLElement;

describe('montage des îlots', () => {
    it("monte l'îlot à la première ouverture de l'onglet, en conservant le conteneur", async () => {
        arreter = surveillerIlots({ onglet: async () => ({ default: Essai }) });
        await rendu();
        expect(conteneur().textContent).toBe('ancien contenu');

        conteneur().classList.add('active');
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')?.textContent).toBe('profil:aucun');
        expect(conteneur().id).toBe('onglet');
        expect(conteneur().classList.contains('tab-content')).toBe(true);
    });

    it("monte immédiatement l'îlot d'un onglet déjà affiché", async () => {
        conteneur().classList.add('active');
        arreter = surveillerIlots({ onglet: async () => ({ default: Essai }) });
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).not.toBeNull();
    });

    it('ignore un îlot dont le conteneur est absent de la page', async () => {
        arreter = surveillerIlots({ absent: async () => ({ default: Essai }) });
        await rendu();
        expect(conteneur().textContent).toBe('ancien contenu');
    });

    it("signale chaque réouverture de l'onglet à l'îlot monté", async () => {
        let reouvertures = 0;
        const Compteur = defineComponent({
            setup() {
                surReouverture(() => reouvertures++);
                return () => h('p', 'îlot');
            }
        });
        conteneur().classList.add('active');
        arreter = surveillerIlots({ onglet: async () => ({ default: Compteur }) });
        await rendu();
        expect(reouvertures).toBe(0);

        for (const n of [1, 2]) {
            conteneur().classList.remove('active');
            await rendu();
            conteneur().classList.add('active');
            await rendu();
            expect(reouvertures).toBe(n);
        }
        // Autre changement de classe, onglet toujours affiché : pas de réouverture
        conteneur().classList.add('autre');
        await rendu();
        expect(reouvertures).toBe(2);
    });

    it("sous-îlot : monté dans sa section à l'ouverture de l'onglet qui la contient", async () => {
        document.body.innerHTML =
            '<div id="onglet" class="tab-content"><div id="section"><p>ancienne section</p></div><p>autre section</p></div>';
        arreter = surveillerIlots({ section: { chargeur: async () => ({ default: Essai }), onglet: 'onglet' } });
        await rendu();
        expect(document.getElementById('section')?.textContent).toBe('ancienne section');

        conteneur().classList.add('active');
        await rendu();
        expect(document.querySelector('#section [data-testid="essai"]')).not.toBeNull();
        expect(conteneur().textContent).toContain('autre section');
    });

    it('fin de session : îlot démonté, nouveau magasin au montage suivant', async () => {
        conteneur().classList.add('active');
        let magasins = 0;
        arreter = surveillerIlots({ onglet: async () => ({ default: Essai }) }, () => {
            magasins++;
            return createPinia();
        });
        await rendu();
        expect(magasins).toBe(1);

        conteneur().classList.remove('active');
        emettre('session-terminee');
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).toBeNull();
        expect(magasins).toBe(2);

        conteneur().classList.add('active');
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).not.toBeNull();
    });

    it("mire de connexion affichée : îlot de l'onglet actif monté seulement à la connexion", async () => {
        document.body.innerHTML =
            '<div id="loginPage" class="modal active"></div><div id="onglet" class="tab-content active"></div>';
        arreter = surveillerIlots({ onglet: async () => ({ default: Essai }) });
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).toBeNull();

        document.getElementById('loginPage')?.classList.remove('active');
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).not.toBeNull();
    });

    it("onglet d'une application : monté quand l'application est affichée, réouverture à chaque affichage", async () => {
        document.body.innerHTML =
            '<div id="appli" style="display: none;"><div id="onglet" class="tab-content active"></div></div>';
        let reouvertures = 0;
        const Compteur = defineComponent({
            setup() {
                surReouverture(() => reouvertures++);
                return () => h('p', { 'data-testid': 'essai' }, 'îlot');
            }
        });
        arreter = surveillerIlots({
            onglet: { chargeur: async () => ({ default: Compteur }), onglet: 'onglet', application: 'appli' }
        });
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).toBeNull();

        const appli = document.getElementById('appli') as HTMLElement;
        appli.style.display = 'block';
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).not.toBeNull();

        appli.style.display = 'none';
        await rendu();
        appli.style.display = 'block';
        await rendu();
        expect(reouvertures).toBe(1);
    });

    it("fin de session, onglet resté affiché : pas de remontage avant la réouverture de l'onglet", async () => {
        conteneur().classList.add('active');
        let montages = 0;
        const Compte = defineComponent({
            setup() {
                montages++;
                return () => h('p', { 'data-testid': 'essai' }, 'îlot');
            }
        });
        arreter = surveillerIlots({ onglet: async () => ({ default: Compte }) });
        await rendu();
        expect(montages).toBe(1);

        // Mire de connexion affichée : l'onglet garde sa classe « active »
        emettre('session-terminee');
        await rendu();
        expect(conteneur().querySelector('[data-testid="essai"]')).toBeNull();
        expect(montages).toBe(1);

        // Connexion suivante : l'ancien code rouvre l'onglet (classe retirée puis remise, switchTab)
        conteneur().classList.remove('active');
        conteneur().classList.add('active');
        await rendu();
        expect(montages).toBe(2);
        expect(conteneur().querySelector('[data-testid="essai"]')).not.toBeNull();
    });
});
