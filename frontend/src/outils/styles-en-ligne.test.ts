import { describe, expect, it } from 'vitest';
import { appliquerStyles, sansStyleEnLigne } from './styles-en-ligne';

describe('styles en ligne sans unsafe-inline', () => {
    it('attributs style des balises seulement, en data-style', () => {
        expect(sansStyleEnLigne('<td colspan="3" style="height:70px">style="texte"</td><b style=\'color:red\'>x</b>')).toBe(
            '<td colspan="3" data-style="height:70px">style="texte"</td><b data-style=\'color:red\'>x</b>'
        );
        expect(sansStyleEnLigne('<div data-style="a:b" class="c">')).toBe('<div data-style="a:b" class="c">');
    });

    it('styles réappliqués en JavaScript, attribut data-style retiré', () => {
        const racine = document.createElement('div');
        racine.setAttribute('data-style', 'position: relative;');
        racine.innerHTML = sansStyleEnLigne('<span style="color: red; left: 4px">a</span><svg style="stroke: blue"></svg>');
        appliquerStyles(racine);
        expect(racine.style.position).toBe('relative');
        expect(racine.querySelector('span')!.style.color).toBe('red');
        expect(racine.querySelector('span')!.style.left).toBe('4px');
        expect(racine.querySelector('svg')!.style.stroke).toBe('blue');
        expect(racine.querySelector('[data-style]')).toBeNull();
    });
});
