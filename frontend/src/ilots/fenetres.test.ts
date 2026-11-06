import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { emettre } from '@/liaison';
import { surDemande, surveillerFenetres } from './fenetres';

/** Attente du montage (chargement du composant puis rendu) */
const rendu = async () => {
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
};

let arreter: () => void = () => {};
afterEach(() => {
    arreter();
    document.body.innerHTML = '';
});

/** Fenêtre d'essai : compte les demandes d'ouverture reçues */
const Essai = defineComponent({
    setup() {
        const ouvertures = ref(0);
        surDemande(() => ouvertures.value++);
        return () => h('p', { 'data-testid': 'essai' }, `ouvertures:${ouvertures.value}`);
    }
});

const fenetre = () => document.querySelector('[data-fenetre="recherche-avancee"]');

describe('fenêtres ouvertes par l’ancien code', () => {
    it('monte la fenêtre à sa première demande seulement', async () => {
        let chargements = 0;
        arreter = surveillerFenetres({
            'recherche-avancee': async () => {
                chargements++;
                return { default: Essai };
            }
        });
        await rendu();
        expect(fenetre()).toBeNull();

        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        await rendu();
        expect(fenetre()?.textContent).toBe('ouvertures:1');

        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        await rendu();
        expect(fenetre()?.textContent).toBe('ouvertures:2');
        expect(chargements).toBe(1);
        expect(document.querySelectorAll('[data-fenetre]')).toHaveLength(1);
    });

    it('ignore une fenêtre non enregistrée', async () => {
        arreter = surveillerFenetres({});
        emettre('fenetre-demandee', { fenetre: 'calendrier-mensuel' });
        await rendu();
        expect(document.querySelector('[data-fenetre]')).toBeNull();
    });

    it('démonte les fenêtres à la fin de la session, remontées à la demande suivante', async () => {
        arreter = surveillerFenetres({ 'recherche-avancee': async () => ({ default: Essai }) });
        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        await rendu();
        emettre('session-terminee');
        expect(fenetre()).toBeNull();

        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        await rendu();
        expect(fenetre()?.textContent).toBe('ouvertures:1');
    });

    it('ne monte pas une fenêtre chargée après la fin de la session', async () => {
        let charger: (v: { default: typeof Essai }) => void = () => {};
        arreter = surveillerFenetres({
            'recherche-avancee': () => new Promise(r => (charger = r))
        });
        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        emettre('session-terminee');
        charger({ default: Essai });
        await rendu();
        expect(fenetre()).toBeNull();
    });
});
