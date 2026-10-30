import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import AppConfirmation from './AppConfirmation.vue';
import AppModal from './AppModal.vue';
import AppNotation from './AppNotation.vue';
import AppSectionAdmin from './AppSectionAdmin.vue';
import { fournirConfirmation, useConfirmation } from './confirmation';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('AppModal', () => {
    const monter = (props: Record<string, unknown> = {}) =>
        mount(AppModal, {
            props: { opened: true, title: 'Ajouter un lieu', ...props },
            slots: { default: '<input id="champ" /><button id="dernier">OK</button>' },
            attachTo: document.body
        });

    it('fenêtre nommée par son titre, focus sur le premier champ', async () => {
        const w = monter();
        await nextTick();
        await nextTick();
        const boite = document.querySelector('[role="dialog"]') as HTMLElement;
        expect(boite.getAttribute('aria-modal')).toBe('true');
        expect(document.getElementById(boite.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
            'Ajouter un lieu'
        );
        expect(document.activeElement?.id).toBe('champ');
        w.unmount();
    });

    it('Échap ou bouton Fermer : événement close', async () => {
        const w = monter();
        await nextTick();
        const boite = document.querySelector('[role="dialog"]') as HTMLElement;
        boite.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        (document.querySelector('button[aria-label="Fermer"]') as HTMLButtonElement).click();
        expect(w.emitted('close')).toHaveLength(2);
        w.unmount();
    });

    it('fenêtre fermée : rien dans la page', () => {
        const w = monter({ opened: false });
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        w.unmount();
    });
});

describe('AppNotation', () => {
    it('un bouton par étoile, nommé « n / 5 » ; clic : note choisie', async () => {
        const w = mount(AppNotation, { props: { modelValue: 2 } });
        const boutons = w.findAll('button');
        expect(boutons.map(b => b.attributes('aria-label'))).toEqual(['1 / 5', '2 / 5', '3 / 5', '4 / 5', '5 / 5']);
        expect(boutons.filter(b => b.classes('gp-notation__etoile--pleine'))).toHaveLength(2);
        await boutons[3]?.trigger('click');
        expect(w.emitted('update:modelValue')).toEqual([[4]]);
    });
});

describe('confirmation', () => {
    /** Composant racine fournissant la fenêtre, et un enfant qui demande la confirmation */
    function monter() {
        let reponse: Promise<boolean> | null = null;
        const Enfant = defineComponent({
            setup() {
                const confirmer = useConfirmation();
                return () =>
                    h('button', {
                        id: 'action',
                        onClick: () => (reponse = confirmer('Supprimer ce lieu ?', 'Supprimer'))
                    });
            }
        });
        const Racine = defineComponent({
            setup() {
                const { demande, repondre } = fournirConfirmation();
                return () => [
                    h(Enfant),
                    h(AppConfirmation, {
                        opened: !!demande.value,
                        message: demande.value?.message ?? '',
                        labelConfirmer: demande.value?.labelConfirmer,
                        onConfirm: () => repondre(true),
                        onCancel: () => repondre(false)
                    })
                ];
            }
        });
        const w = mount(Racine, { attachTo: document.body });
        return { w, reponse: () => reponse };
    }

    it('fenêtre d’alerte avec le message ; Supprimer : confirmé', async () => {
        const { w, reponse } = monter();
        await w.find('#action').trigger('click');
        await nextTick();
        const boite = document.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(boite.textContent).toContain('Supprimer ce lieu ?');
        const supprimer = [...boite.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Supprimer');
        supprimer?.click();
        expect(await reponse()).toBe(true);
        await nextTick();
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        w.unmount();
    });

    it('Annuler : non confirmé', async () => {
        const { w, reponse } = monter();
        await w.find('#action').trigger('click');
        await nextTick();
        const annuler = [...document.querySelectorAll('[role="alertdialog"] button')].find(
            b => b.textContent?.trim() === 'Annuler'
        ) as HTMLButtonElement;
        annuler.click();
        expect(await reponse()).toBe(false);
        w.unmount();
    });
});

describe('AppSectionAdmin', () => {
    it('fermée par défaut ; ouverture signalée une fois, aussi quand le parent contrôle l’état (v-model)', async () => {
        const Parent = defineComponent({
            data: () => ({ ouverte: false, ouvertures: 0 }),
            render() {
                return h(
                    AppSectionAdmin,
                    {
                        titre: 'Gestion des API',
                        idCorps: 'corps',
                        teinte: 'vert',
                        ouverte: this.ouverte,
                        'onUpdate:ouverte': (v: boolean) => (this.ouverte = v),
                        onOuverture: () => this.ouvertures++
                    },
                    () => h('p', 'Contenu')
                );
            }
        });
        const w = mount(Parent);
        const bouton = w.get('h3 button');
        expect(bouton.attributes('aria-expanded')).toBe('false');
        expect(w.get('#corps').isVisible()).toBe(false);
        await bouton.trigger('click');
        expect(bouton.attributes('aria-expanded')).toBe('true');
        expect(w.vm.ouvertures).toBe(1);
        await bouton.trigger('click');
        expect(bouton.attributes('aria-expanded')).toBe('false');
        expect(w.vm.ouvertures).toBe(1);
    });
});
