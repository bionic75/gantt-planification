import { describe, expect, it } from 'vitest';
import { MFA_ICONES, RESET_ICONES, mfaCodeEmail, passwordResetLinkEmail } from '../src/modules/auth/auth.emails.ts';
import { existsSync } from 'node:fs';

/** Toutes les images « cid: » du message sont jointes */
const cidsManquants = (html: string, pieces: { cid: string }[]) =>
    [...html.matchAll(/src="cid:([^"]+)"/g)].map(m => m[1]).filter(c => !pieces.some(p => p.cid === c));

describe('emails d’authentification : charte du site', () => {
    it('code de vérification : gabarit, icônes jointes, valeurs échappées', () => {
        const html = mfaCodeEmail({ prenom: '<b>Léa</b>', code: '123456' });
        expect(html).toContain('Plateforme de Planification');
        expect(html).toContain('Code de vérification');
        expect(html).toContain('123456');
        expect(html).toContain('#1d70b7');
        expect(html).not.toContain('<b>Léa</b>');
        expect(cidsManquants(html, MFA_ICONES)).toEqual([]);
        expect(html).toMatch(/src="cid:cadenas-grand@planification"/);
        expect(MFA_ICONES.every(p => existsSync(p.path))).toBe(true);
    });

    it('réinitialisation : bouton, lien et icônes jointes', () => {
        const link = 'https://exemple.fr/?reset_token=abc';
        const html = passwordResetLinkEmail({ prenom: 'Léa', nom: 'Durand', username: 'ldurand', link });
        expect(html).toContain(`href="${link}"`);
        expect(html).toContain('Choisir un nouveau mot de passe');
        expect(html).toContain('ldurand');
        expect(cidsManquants(html, RESET_ICONES)).toEqual([]);
        expect(RESET_ICONES.every(p => existsSync(p.path))).toBe(true);
    });
});
