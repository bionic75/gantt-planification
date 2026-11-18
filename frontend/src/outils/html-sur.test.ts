import { describe, expect, it } from 'vitest';
import { htmlSur } from './html-sur';

describe('HTML de l’administration', () => {
    it('scripts, attributs d’événements et liens javascript: retirés', () => {
        const html = htmlSur(
            '<p onclick="alert(1)">Texte</p><script>alert(2)</script><img src=x onerror="alert(3)"><a href="javascript:alert(4)">lien</a>'
        );
        expect(html).not.toMatch(/script|onclick|onerror|javascript:/);
        expect(html).toContain('<p>Texte</p>');
        expect(html).toContain('<a>lien</a>');
    });

    it('mise en forme de l’aide conservée', () => {
        const html =
            '<h4>Version 3.4.0</h4><ul><li><strong>Nouveau</strong> : <a href="/aide.html#x">détails</a></li></ul>';
        expect(htmlSur(html)).toBe(html);
    });
});
