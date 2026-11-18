import { describe, expect, it } from 'vitest';
import { celluleCsv, sansFormule } from './csv';

describe('formules des exports CSV', () => {
    it('valeur commençant par = + - @ tabulation ou retour chariot préfixée d’une apostrophe', () => {
        expect(sansFormule('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
        expect(sansFormule('+33 6 12')).toBe("'+33 6 12");
        expect(sansFormule('-2+3')).toBe("'-2+3");
        expect(sansFormule('@SUM(A1)')).toBe("'@SUM(A1)");
        expect(sansFormule('\t=1')).toBe("'\t=1");
    });

    it('nombres, caractère isolé et texte ordinaire inchangés', () => {
        expect(sansFormule('-12')).toBe('-12');
        expect(sansFormule('+3,5')).toBe('+3,5');
        expect(sansFormule(-4)).toBe('-4');
        expect(sansFormule('-')).toBe('-');
        expect(sansFormule('SAMU 13')).toBe('SAMU 13');
        expect(sansFormule(null)).toBe('');
    });

    it('cellule entre guillemets, guillemets doublés', () => {
        expect(celluleCsv('=A1&"x"')).toBe('"\'=A1&""x"""');
        expect(celluleCsv('Léa')).toBe('"Léa"');
    });
});
