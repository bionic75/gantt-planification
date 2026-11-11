import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { emettre, type NomFenetre } from '@/evenements';
import { surDemande } from './fenetres';
import FenetresDemandees from './FenetresDemandees.vue';
import type { ChargeurVue } from './vues';

/** Attente du montage (chargement du composant puis rendu) */
const rendu = async () => {
    for (let i = 0; i < 5; i++) {
        await flushPromises();
        await nextTick();
    }
};

let monte: VueWrapper | null = null;
afterEach(() => {
    monte?.unmount();
    monte = null;
});

const monter = (registre: Partial<Record<NomFenetre, ChargeurVue>>) =>
    (monte = mount(FenetresDemandees, { props: { registre }, attachTo: document.body }));

/** Fenêtre d'essai : compte les demandes d'ouverture reçues */
const Essai = defineComponent({
    setup() {
        const ouvertures = ref(0);
        surDemande(() => ouvertures.value++);
        return () => h('p', `ouvertures:${ouvertures.value}`);
    }
});

const fenetre = () => document.querySelector('[data-fenetre="recherche-avancee"]');

describe('fenêtres des en-têtes', () => {
    it('monte la fenêtre à sa première demande seulement', async () => {
        let chargements = 0;
        monter({
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
        monter({});
        emettre('fenetre-demandee', { fenetre: 'calendrier-mensuel' });
        await rendu();
        expect(document.querySelector('[data-fenetre]')).toBeNull();
    });

    it('n’écoute plus les demandes une fois démonté (fin de la session)', async () => {
        let chargements = 0;
        const w = monter({
            'recherche-avancee': async () => {
                chargements++;
                return { default: Essai };
            }
        });
        w.unmount();
        monte = null;
        emettre('fenetre-demandee', { fenetre: 'recherche-avancee' });
        await rendu();
        expect(chargements).toBe(0);
    });
});
