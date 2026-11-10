import { describe, expect, it } from 'vitest';
import { estImage, initiales, regleMotDePasse, TAILLE_MAX_PHOTO } from '@/ilots/profil/profil';
import { appliquerFavicon, extraireNouveautes, suiviVersion } from './cadre';

describe('bandeau de mise en production', () => {
    it('première version retenue sans bandeau, nouvelle version annoncée, masquée pour cette version', () => {
        const s = suiviVersion();
        expect(s.lue('2.18.1', null)).toEqual({ type: 'aucun' });
        expect(s.lue('2.18.1', null)).toEqual({ type: 'aucun' });
        expect(s.lue('2.19.0', null)).toEqual({ type: 'version', version: '2.19.0' });
        expect(s.masquer()).toEqual({ type: 'aucun' });
        expect(s.lue('2.19.0', '2.19.0')).toEqual({ type: 'aucun' });
    });

    it('coupure annoncée au 3e échec ; serveur revenu à la même version : plus de bandeau', () => {
        const s = suiviVersion();
        s.lue('2.18.1', null);
        expect(s.echec()).toEqual({ type: 'aucun' });
        expect(s.echec()).toEqual({ type: 'aucun' });
        expect(s.echec()).toEqual({ type: 'coupure' });
        expect(s.lue('2.18.1', null)).toEqual({ type: 'aucun' });
    });

    it('serveur revenu avec une nouvelle version : nouvelle version annoncée', () => {
        const s = suiviVersion();
        s.lue('2.18.1', null);
        s.echec();
        s.echec();
        s.echec();
        expect(s.lue('2.19.0', null)).toEqual({ type: 'version', version: '2.19.0' });
    });
});

describe('nouveautés de l’aide', () => {
    const AIDE = `<html><body><section id="section-notes-version">
        <div class="card"><strong>v2.19.0</strong><p>Nouveautés 2.19</p></div>
        <div class="card"><strong>v2.18.1</strong><p>Nouveautés 2.18</p></div>
    </section></body></html>`;

    it('bloc de la version publiée, à défaut toute la section', () => {
        expect(extraireNouveautes(AIDE, 'v2.18.1')).toContain('Nouveautés 2.18');
        expect(extraireNouveautes(AIDE, 'v2.18.1')).not.toContain('Nouveautés 2.19');
        expect(extraireNouveautes(AIDE, 'v9.9.9')).toContain('id="section-notes-version"');
        expect(extraireNouveautes('<p>aide</p>', 'v9.9.9')).toBeNull();
    });
});

describe('favicon', () => {
    it('lien de la page mis à jour, créé au besoin', () => {
        appliquerFavicon('grille');
        expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toMatch(
            /^\/img\/favicon-grille\.svg\?t=\d+$/
        );
    });
});

describe('Mon profil', () => {
    it('règle du mot de passe : 8 caractères et 1 caractère spécial', () => {
        expect(regleMotDePasse('')).toBeNull();
        expect(regleMotDePasse('court')).toEqual({
            ok: false,
            texte: '✗ 8 caractères minimum, 1 caractère spécial requis'
        });
        expect(regleMotDePasse('assezlong')?.texte).toBe('✗ 1 caractère spécial requis');
        expect(regleMotDePasse('Profil-E2E-2026!')).toEqual({ ok: true, texte: '✓ Mot de passe valide' });
    });

    it('photo : image de 2 Mo au plus ; rond : trigramme, sinon initiales', () => {
        expect(estImage('image/png')).toBe(true);
        expect(estImage('application/pdf')).toBe(false);
        expect(TAILLE_MAX_PHOTO).toBe(2 * 1024 * 1024);
        expect(initiales({ trigramme: 'JDU', prenom: 'Jeanne', nom: 'Dupont' })).toBe('JDU');
        expect(initiales({ trigramme: null, prenom: 'Jeanne', nom: 'Dupont' })).toBe('JD');
        expect(initiales({ trigramme: null, prenom: null, nom: null })).toBe('??');
    });
});
