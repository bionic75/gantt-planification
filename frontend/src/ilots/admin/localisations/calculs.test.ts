import { describe, expect, it } from 'vitest';
import type { Localisation } from '@/api/localisations';
import {
    analyserCsv,
    basculerTri,
    donneesConflit,
    identiques,
    messageSuppression,
    repartir,
    resumeImport,
    trier,
    type LigneCsv
} from './calculs';

const loc = (id: number, long: string, court: string, extra: Partial<Localisation> = {}): Localisation => ({
    id,
    libelle_long: long,
    libelle_court: court,
    adresse: null,
    latitude: null,
    longitude: null,
    ...extra
});

describe('tri de la liste', () => {
    const liste = [
        loc(1, 'ÉVRY', 'B', { latitude: 10 }),
        loc(2, 'ANGERS', 'A', { latitude: 2 }),
        loc(3, 'ZURICH', 'C', { latitude: null })
    ];

    it('textes dans l’ordre français, sens inversé', () => {
        expect(trier(liste, 'libelle_long', 'asc').map(l => l.id)).toEqual([2, 1, 3]);
        expect(trier(liste, 'libelle_long', 'desc').map(l => l.id)).toEqual([3, 1, 2]);
    });

    it('nombres comparés en valeur, valeur absente comme texte vide', () => {
        expect(trier(liste.slice(0, 2), 'latitude', 'asc').map(l => l.id)).toEqual([2, 1]);
        expect(trier(liste, 'latitude', 'asc')[0]?.id).toBe(3);
    });

    it('clic sur la colonne : sens inversé ; nouvelle colonne : croissant', () => {
        expect(basculerTri({ colonne: 'adresse', sens: 'asc' }, 'adresse')).toEqual({
            colonne: 'adresse',
            sens: 'desc'
        });
        expect(basculerTri({ colonne: 'adresse', sens: 'desc' }, 'latitude')).toEqual({
            colonne: 'latitude',
            sens: 'asc'
        });
    });
});

describe('analyse du fichier CSV', () => {
    it('séparateur « ; », BOM retiré, majuscules, virgule décimale, lignes incomplètes ignorées', () => {
        const r = analyserCsv(
            '\uFEFFlibelle_long;libelle_court;adresse;latitude;longitude\r\nChu;c;1 rue;48,5;2.3\n;x;;;\n'
        );
        expect(r).toEqual({
            ok: true,
            separateur: ';',
            lignes: [{ libelle_long: 'CHU', libelle_court: 'C', adresse: '1 RUE', latitude: 48.5, longitude: 2.3 }]
        });
    });

    it('tabulation prioritaire, en-têtes abrégés, adresse facultative, coordonnée illisible = null', () => {
        const r = analyserCsv('ll\tlc\tlat\tlng\nA\tB\tabc\t1');
        expect(r).toMatchObject({
            ok: true,
            separateur: '\t',
            lignes: [{ adresse: '', latitude: null, longitude: 1 }]
        });
    });

    it('erreurs : fichier vide, colonnes absentes (avec le détail), aucune ligne valide', () => {
        expect(analyserCsv('libelle_long;libelle_court')).toEqual({
            ok: false,
            message: '⚠️ Fichier vide ou sans données.'
        });
        expect(analyserCsv('nom,court\nA,B')).toEqual({
            ok: false,
            message: '⚠️ Colonnes libelle_long et libelle_court introuvables.',
            detail: { separateur: ',', entetes: ['nom', 'court'] }
        });
        expect(analyserCsv('libelle_long;libelle_court;x\nA;B;1')).toMatchObject({
            ok: false,
            message: '⚠️ Colonnes latitude/longitude introuvables.'
        });
        expect(analyserCsv('ll;lc;lat;lng\n;B;1;2')).toEqual({ ok: false, message: '⚠️ Aucune ligne valide trouvée.' });
    });
});

describe('conflits d’import', () => {
    const ligne = (long: string, extra: Partial<LigneCsv> = {}): LigneCsv => ({
        libelle_long: long,
        libelle_court: 'C',
        adresse: 'ADR',
        latitude: 48.86,
        longitude: 2.36,
        ...extra
    });
    const existante = loc(7, 'CHU', 'C', { adresse: 'ADR', latitude: 48.86, longitude: 2.36 });

    it('coordonnées comparées en valeur ; adresse absente = vide', () => {
        expect(identiques(ligne('CHU'), existante)).toBe(true);
        expect(identiques(ligne('CHU', { latitude: 48.9 }), existante)).toBe(false);
        expect(identiques(ligne('X', { adresse: '', latitude: null, longitude: null }), loc(1, 'X', 'C'))).toBe(true);
    });

    it('lignes nouvelles et conflits (même libellé long), « conserver » par défaut, saisie préremplie', () => {
        const { nouvelles, conflits } = repartir([ligne('NEUF'), ligne('CHU', { libelle_court: 'Z' })], [existante]);
        expect(nouvelles.map(l => l.libelle_long)).toEqual(['NEUF']);
        expect(conflits).toHaveLength(1);
        expect(conflits[0]).toMatchObject({
            identique: false,
            action: 'keep',
            manuel: { libelle_court: 'C', adresse: 'ADR', latitude: 48.86, longitude: 2.36 }
        });
    });

    it('données écrites selon l’action', () => {
        const [c] = repartir([ligne('CHU', { libelle_court: 'Z' })], [existante]).conflits;
        if (!c) throw new Error('conflit attendu');
        expect(donneesConflit(c)).toBeNull();
        c.action = 'overwrite';
        expect(donneesConflit(c)).toMatchObject({ libelle_long: 'CHU', libelle_court: 'Z' });
        c.action = 'manual';
        c.manuel.libelle_court = 'M';
        expect(donneesConflit(c)).toMatchObject({ libelle_long: 'CHU', libelle_court: 'M' });
    });

    it('résumé de l’import', () => {
        const { conflits } = repartir([ligne('CHU'), ligne('AUTRE')], [existante, loc(8, 'AUTRE', 'X')]);
        expect(resumeImport(2, conflits)).toBe(
            "⚠️ 2 ajouté(s) | 1 avec données différentes | 1 déjà identiques en base — choisissez l'action pour chaque entrée existante."
        );
        expect(resumeImport(0, conflits.slice(1))).toBe(
            "⚠️ 1 avec données différentes — choisissez l'action pour chaque entrée existante."
        );
    });
});

describe('confirmation de suppression', () => {
    it('aucune localisation utilisée : liste simple', () => {
        expect(
            messageSuppression(
                [
                    { id: 1, nom: 'A', count: 0, events: [] },
                    { id: 2, nom: 'B', count: 0, events: [] }
                ],
                2
            )
        ).toBe('Supprimer 2 localisations ?\n\n• A\n• B');
        expect(messageSuppression([{ id: 1, nom: 'A', count: 0, events: [] }], 1)).toBe(
            'Supprimer 1 localisation ?\n\n• A'
        );
    });

    it('localisation utilisée : événements détaillés (3 au plus), localisations libres, avertissement', () => {
        const ev = (n: number) => ({ label: `E${n}`, start_date: '2026-01-0' + n, end_date: '2026-01-0' + n });
        const texte = messageSuppression(
            [
                {
                    id: 1,
                    nom: 'A',
                    count: 4,
                    events: [{ label: 'E0', start_date: '2026-01-01', end_date: '2026-01-02' }, ev(2), ev(3), ev(4)]
                },
                { id: 2, nom: 'B', count: 0, events: [] }
            ],
            2
        );
        expect(texte).toBe(
            '⚠️ ATTENTION — 1 localisation(s) sur 2 sont utilisées par des événements :\n\n' +
                '• A → 4 événement(s)\n' +
                '   - "E0" (2026-01-01 → 2026-01-02)\n' +
                '   - "E2" (2026-01-02)\n' +
                '   - "E3" (2026-01-03)\n' +
                '   ... et 1 autre(s)\n' +
                '\n1 localisation(s) non utilisée(s) seront aussi supprimées.\n' +
                '\nSi vous confirmez, les événements concernés afficheront "NON DÉFINI" à la place de la localisation.' +
                '\n\nConfirmer la suppression ?'
        );
    });
});
