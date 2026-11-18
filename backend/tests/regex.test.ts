// Filtre de noms Asana (audit de sécurité, lot 4) : expressions à quantificateurs imbriqués refusées (ReDoS)
import { describe, expect, it } from 'vitest';
import { hasNestedQuantifier } from '../src/lib/regex.ts';

describe('quantificateurs imbriqués', () => {
    it.each(['(a+)+', '(\\w*x)*', '((a+))+', '(a|b+){2,}', '(?:x+y)+$'])('%s refusée', pattern => {
        expect(hasNestedQuantifier(pattern)).toBe(true);
    });

    it.each(['\\[SAMU\\s*[^\\]]+\\]', '^SAMU (\\d+)$', '(a+)?', '(ab)+', '\\(a+\\)+', '[(a+)]+', 'x{2}(y)'])(
        '%s acceptée',
        pattern => {
            expect(hasNestedQuantifier(pattern)).toBe(false);
        }
    );
});
