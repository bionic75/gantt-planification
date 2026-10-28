import { describe, expect, it } from 'vitest';
import { csvDuTableau, nomFichierDuJour } from './export';

const tableau = (html: string) => {
    const t = document.createElement('table');
    t.innerHTML = html;
    return t;
};

describe('export CSV', () => {
    it('cellules entre guillemets (guillemets doublés), séparateur « ; », BOM pour Excel', () => {
        const csv = csvDuTableau(
            tableau(
                '<thead><tr><th>Expert</th><th>Note</th></tr></thead><tbody><tr><td>A "B"</td><td>1</td></tr></tbody>'
            )
        );
        expect(csv).toBe('\uFEFF"Expert";"Note"\n"A ""B""";"1"');
    });

    it('option une ligne par cellule : sauts de ligne remplacés, espaces retirés', () => {
        const t = tableau('<tbody><tr><td> Ligne 1\nLigne 2 </td></tr></tbody>');
        expect(csvDuTableau(t, true)).toBe('\uFEFF"Ligne 1 Ligne 2"');
    });

    it('nom de fichier daté du jour', () => {
        expect(nomFichierDuJour('suivi_evenements')).toMatch(/^suivi_evenements_\d{4}-\d{2}-\d{2}\.csv$/);
    });
});
