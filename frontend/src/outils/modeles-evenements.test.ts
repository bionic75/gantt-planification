import { describe, expect, it } from 'vitest';
import { iconeDuLibelle, MODELES } from './modeles-evenements';

describe('icône d’un événement sans type, d’après son libellé', () => {
    it('début du libellé, sans accents ni points, sans espace exigé', () => {
        expect(iconeDuLibelle('Mise en service SAMU 75')).toBe('power');
        expect(iconeDuLibelle('Formations utilisateurs')).toBe('graduation');
        expect(iconeDuLibelle('Accompagnement post démarrage')).toBe('lifebuoy');
        expect(iconeDuLibelle('ACCOMP. POST DÉM.')).toBe('lifebuoy');
        expect(iconeDuLibelle('CONGRÈS AFARM')).toBe('presentation');
        expect(iconeDuLibelle('Visite post MES')).toBe('eye');
    });

    it('aucun modèle reconnu : null', () => {
        expect(iconeDuLibelle('Réunion d’équipe')).toBeNull();
        expect(iconeDuLibelle('')).toBeNull();
        expect(iconeDuLibelle(null)).toBeNull();
    });

    it('chaque modèle du filtre « Libellé » donne son icône', () => {
        for (const m of MODELES) expect(iconeDuLibelle(m.label), m.label).toBe(m.icone);
    });
});
