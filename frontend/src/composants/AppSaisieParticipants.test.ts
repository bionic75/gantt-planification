import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppSaisieParticipants, { type Participant } from './AppSaisieParticipants.vue';

const COMPTES = [
    { id: 1, nom: 'Durand', prenom: 'Léa', email: 'lea@exemple.fr', is_expert: 1 },
    { id: 2, nom: 'Martin', prenom: 'Paul', email: 'paul@exemple.fr' }
];

function monter(externes = false) {
    const w = mount(AppSaisieParticipants, {
        props: {
            comptes: COMPTES,
            label: 'Participants',
            idSaisie: 'saisie',
            idCadre: 'cadre',
            idListe: 'liste',
            externes,
            detaille: externes,
            modelValue: [] as Participant[],
            'onUpdate:modelValue': (v: Participant[]) => w.setProps({ modelValue: v })
        },
        attachTo: document.body
    });
    return w;
}

describe('AppSaisieParticipants', () => {
    it('suggestions par nom ou email ; choix : étiquette, compte retiré des suggestions', async () => {
        const w = monter();
        await w.find('#saisie').setValue('dur');
        const options = w.findAll('[role="option"]');
        expect(options.map(o => o.text())).toEqual(['LDLéa DURAND']);
        await options[0]?.trigger('click');
        expect(w.props('modelValue')).toEqual([{ id: 1, nom: 'Durand', prenom: 'Léa', email: 'lea@exemple.fr' }]);
        await w.find('#saisie').setValue('a');
        expect(w.findAll('[role="option"]').map(o => o.text())).toEqual(['PMPaul MARTIN']);
        w.unmount();
    });

    it('invité externe : Entrée ajoute un email, ou un nom ; Retour arrière retire le dernier', async () => {
        const w = monter(true);
        const saisie = w.find('#saisie');
        await saisie.setValue('invite@exemple.fr');
        expect(w.find('.gp-participants__option-externe').text()).toContain('invite@exemple.fr');
        await saisie.trigger('keydown', { key: 'Enter' });
        await saisie.setValue('Jean Externe');
        await saisie.trigger('keydown', { key: 'Enter' });
        expect(w.props('modelValue')).toEqual([
            { external: true, nom: '', prenom: '', email: 'invite@exemple.fr' },
            { external: true, nom: 'Jean Externe', prenom: '', email: '' }
        ]);
        expect(w.find('#cadre').text()).toContain('✉');
        await saisie.setValue('');
        await saisie.trigger('keydown', { key: 'Backspace' });
        expect(w.props('modelValue')).toHaveLength(1);
        w.unmount();
    });

    it('suggestions détaillées : email et badge Expert', async () => {
        const w = monter(true);
        await w.find('#saisie').setValue('lea');
        const option = w.find('[role="option"]');
        expect(option.text()).toContain('Expert');
        expect(option.text()).toContain('lea@exemple.fr');
        w.unmount();
    });
});
