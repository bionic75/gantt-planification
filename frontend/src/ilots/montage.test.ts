import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { useSessionStore } from '@/stores/session';
import { emettre } from '@/liaison';
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
});
