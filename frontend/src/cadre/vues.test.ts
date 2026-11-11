import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, KeepAlive, nextTick, ref, shallowRef, type Component } from 'vue';
import { surReouverture } from '@/ilots/activation';
import { vueApplication, vueOnglet } from './vues';

const rendu = async () => {
    for (let i = 0; i < 4; i++) {
        await flushPromises();
        await nextTick();
    }
};

describe('enveloppes des adresses', () => {
    it('conteneur d’origine, composant chargé une fois, réouvertures signalées (pas le premier affichage)', async () => {
        let chargements = 0;
        const reouvertures = ref(0);
        const Contenu = defineComponent({
            setup() {
                surReouverture(() => reouvertures.value++);
                return () => h('p', 'contenu');
            }
        });
        const onglet = vueOnglet('planning', async () => {
            chargements++;
            return { default: Contenu };
        });
        const application = vueApplication('analyseContainer', async () => ({ default: Contenu }), 'analyse');
        const courant = shallowRef<Component>(onglet);
        const w = mount(defineComponent({ setup: () => () => h(KeepAlive, null, [h(courant.value)]) }));
        await rendu();
        expect(w.find('#planning.tab-content.active > p').text()).toBe('contenu');
        expect(reouvertures.value).toBe(0);

        courant.value = application;
        await rendu();
        expect(w.find('#analyseContainer.analyse').exists()).toBe(true);
        courant.value = onglet;
        await rendu();
        expect(reouvertures.value).toBe(1);
        expect(chargements).toBe(1);
        w.unmount();
    });
});
