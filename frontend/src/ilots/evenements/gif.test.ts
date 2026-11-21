import { describe, expect, it } from 'vitest';
import { NOM_FICHIER_GIF, nomFichierGif } from './gif';

describe('nomFichierGif', () => {
    it('nom par défaut si rien n’est saisi', () => {
        expect(nomFichierGif('')).toBe(`${NOM_FICHIER_GIF}.gif`);
        expect(nomFichierGif('   ')).toBe(`${NOM_FICHIER_GIF}.gif`);
    });
    it('ajoute l’extension, sans la doubler', () => {
        expect(nomFichierGif('Déploiement 2026')).toBe('Déploiement-2026.gif');
        expect(nomFichierGif('suivi.GIF')).toBe('suivi.gif');
    });
    it('remplace les caractères interdits dans un nom de fichier', () => {
        expect(nomFichierGif('a/b\\c:d*e?"<>|f')).toBe('a-b-c-d-e-f.gif');
        expect(nomFichierGif('///')).toBe(`${NOM_FICHIER_GIF}.gif`);
    });
    it('limite la longueur', () => {
        expect(nomFichierGif('x'.repeat(300)).length).toBeLessThanOrEqual(84);
    });

    it('extension mp4 : remplace .gif ou .mp4 saisi', () => {
        expect(nomFichierGif('suivi.gif', 'mp4')).toBe('suivi.mp4');
        expect(nomFichierGif('suivi.mp4', 'mp4')).toBe('suivi.mp4');
        expect(nomFichierGif('', 'mp4')).toBe(`${NOM_FICHIER_GIF}.mp4`);
    });
});
