import { describe, expect, it } from 'vitest';
import {
    ajouterGroupe,
    ajouterJetons,
    basculerOperateur,
    clesEnDoublon,
    csvAnalyse,
    deplacerJeton,
    exclure,
    filtrer,
    nombreFiltresActifs,
    retirerExclusion,
    retirerGroupe,
    retirerJeton,
    type Filtres,
    type FiltreListe
} from './filtres';
import {
    choisirLigneEntete,
    decoder,
    decouperLigne,
    detecterLargeurs,
    detecterSeparateur,
    enteteAutomatique,
    lignesDuFichier,
    lignesDuTableau,
    lireFichier,
    lireTexte,
    natureFichier,
    type Ligne
} from './lecture';
import { profilColonne, proposerRole, typesDesFiltres } from './profil';

const octets = (...b: number[]) => new Uint8Array(b).buffer;

describe('lecture', () => {
    it('formats pris en charge', () => {
        expect(natureFichier('a.TXT')).toBe('texte');
        expect(natureFichier('a.tsv')).toBe('texte');
        expect(natureFichier('a.csv')).toBe('csv');
        expect(natureFichier('a.xls')).toBe('classeur');
        expect(natureFichier('a.pdf')).toBeNull();
    });

    it('encodage : BOM, UTF-8, Windows-1252, accents doublement encodés', () => {
        expect(decoder(octets(0xef, 0xbb, 0xbf, 0x61)).encoding).toBe('UTF-8 (BOM)');
        expect(decoder(octets(0xff, 0xfe, 0x61, 0)).encoding).toBe('UTF-16 LE');
        expect(decoder(new TextEncoder().encode('été').buffer as ArrayBuffer)).toEqual({
            text: 'été',
            encoding: 'UTF-8'
        });
        expect(decoder(octets(0x65, 0xe9))).toEqual({ text: 'eé', encoding: 'Windows-1252 / Latin-1' });
        // Détection de l'ancien écran conservée : « Ã » suivi d'une lettre À-ÿ (« Ã© », é doublement encodé, n'y entre pas)
        expect(decoder(new TextEncoder().encode('ÃÉ').buffer as ArrayBuffer).encoding).toBe(
            'Windows-1252 (détecté via mojibake)'
        );
        expect(decoder(new TextEncoder().encode('Ã©').buffer as ArrayBuffer).encoding).toBe('UTF-8');
    });

    it('découpage : guillemets, guillemet doublé, séparateur entre guillemets', () => {
        expect(decouperLigne('a;"b; c";"d ""e"""', ';')).toEqual(['a', 'b; c', 'd "e"']);
    });

    it('séparateur : le plus régulier, lignes de titre tolérées ; largeur fixe', () => {
        expect(detecterSeparateur(['a;b;c', '1;2;3', '4;5;6'])).toBe(';');
        expect(detecterSeparateur(['Titre', 'Sous-titre', 'a,b', '1,2', '3,4', '5,6', '7,8'])).toBe(',');
        expect(detecterSeparateur(['un deux', 'trois'])).toBeNull();
        expect(detecterLargeurs(['Code   Equipe', 'E01    Alpha ', 'E02    Beta  '])).toEqual([0, 7]);
        expect(lireTexte('\uFEFFa\tb\r\n\r\n1\t2\n').table).toEqual([
            ['a', 'b'],
            ['1', '2']
        ]);
        expect(() => lireTexte(' \n ')).toThrow('Le fichier est vide');
    });

    it("ligne d'intitulés : titres ignorés, détection stricte (texte) ou souple (classeur)", () => {
        const table = [['Rapport'], ['Code', 'Ville'], ['E01', 'Paris'], ['E02', 'Lyon']];
        expect(enteteAutomatique(table, true)).toEqual({ headerRow: 2, dataStart: 2, skipped: 1 });
        // Valeurs de même type que la colonne : pas d'intitulés
        expect(
            enteteAutomatique(
                [
                    ['1', '2'],
                    ['3', '4'],
                    ['5', '6']
                ],
                false
            )
        ).toEqual({
            headerRow: 0,
            dataStart: 0,
            skipped: 0
        });
        expect(enteteAutomatique([['Montant'], ['3'], ['4']], false).headerRow).toBe(1);
    });

    it('lignes : intitulés vides nommés, doublons numérotés, ligne choisie', () => {
        expect(
            lignesDuTableau(
                [
                    ['a', '', 'a'],
                    ['1', '2', '3', '4']
                ],
                1,
                1
            )
        ).toEqual([{ a: '1', 'Colonne 2': '2', 'a (2)': '3', 'Colonne 4': '4' }]);
        const lu = { table: [['T'], ['a', 'b'], ['1', '2']], encodage: null, meta: { kind: 'txt' as const } };
        expect(choisirLigneEntete(lu, 0)).toMatchObject({
            lignes: [{ 'Colonne 1': 'T', 'Colonne 2': '' }, {}, {}],
            meta: { hasHeader: false, headerRow: 0, skipped: 0, headerAuto: false }
        });
        expect(choisirLigneEntete(lu, 2).meta).toMatchObject({ headerRow: 2, skipped: 1 });
        expect(choisirLigneEntete(lu, 99).meta.headerRow).toBe(2);
    });

    it('CSV lu par SheetJS : dates conservées telles quelles, champs entre guillemets', async () => {
        const csv = 'Id;Date;Liste\nA;02/02/2031;"x; y"\nB;13/01/2031;z';
        const lu = await lireFichier('a.csv', new TextEncoder().encode(csv).buffer as ArrayBuffer);
        expect(lu.encodage).toBe('UTF-8');
        expect(lu.meta).toMatchObject({ kind: 'csv', headerRow: 1, hasHeader: true, headerAuto: true });
        expect(lignesDuFichier(lu)).toEqual([
            { Id: 'A', Date: '02/02/2031', Liste: 'x; y' },
            { Id: 'B', Date: '13/01/2031', Liste: 'z' }
        ]);
        await expect(lireFichier('a.pdf', octets(1))).rejects.toThrow('Format non supporté');
    });

    it('classeur : 1re feuille de données, dates « JJ/MM/AAAA » (avec l’heure si renseignée), nombres', async () => {
        const XLSX = await import('xlsx');
        const classeur = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet([['Sans données']]), 'Lisez-moi');
        XLSX.utils.book_append_sheet(
            classeur,
            XLSX.utils.aoa_to_sheet(
                [
                    ['Code', 'Date', 'Montant'],
                    ['A', new Date(2031, 2, 15), 12.5],
                    ['B', new Date(2031, 11, 31, 8, 30), 3]
                ],
                { cellDates: true }
            ),
            'Données'
        );
        const contenu = XLSX.write(classeur, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const lu = await lireFichier('a.xlsx', contenu);
        expect(lu.encodage).toBeNull();
        expect(lignesDuFichier(lu)).toEqual([
            { Code: 'A', Date: '15/03/2031', Montant: '12.5' },
            { Code: 'B', Date: '31/12/2031 08:30', Montant: '3' }
        ]);
    });
});

const ligne = (i: number): Ligne => ({
    Id: `ID-${String(i).padStart(4, '0')}`,
    Nom: ['DURAND', 'MARTIN'][i % 2]!,
    Comp: ['Excel; Word', 'SQL', 'Python; SQL'][i % 3]!,
    Date: `${String((i % 20) + 10)}/0${(i % 3) + 1}/2031`,
    Montant: String(i * 1.5),
    Vide: ''
});
const LIGNES = Array.from({ length: 30 }, (_, i) => ligne(i + 1));

describe('profil des colonnes', () => {
    it('types, plages, clé potentielle', () => {
        expect(profilColonne(LIGNES, 'Nom')).toMatchObject({
            kind: 'cat',
            label: 'Catégorie (2 valeurs)',
            distinct: 2
        });
        expect(profilColonne(LIGNES, 'Comp')).toMatchObject({ kind: 'list' });
        expect(profilColonne(LIGNES, 'Id')).toMatchObject({ kind: 'text', unique: true, minLen: 7, maxLen: 7 });
        const date = profilColonne(LIGNES, 'Date');
        expect(date.kind).toBe('date');
        expect(date.dmin?.getMonth()).toBe(0);
        expect(profilColonne(LIGNES, 'Montant')).toMatchObject({ kind: 'dec', min: 1.5, max: 45 });
        expect(profilColonne(LIGNES, 'Vide')).toMatchObject({ kind: 'empty', label: 'Vide', empty: 30 });
        expect(profilColonne(LIGNES, 'Nom').top[0]).toEqual(['MARTIN', 15]);
    });

    it("rôle proposé d'après l'intitulé ou le contenu", () => {
        const p = profilColonne(LIGNES, 'Nom');
        expect(proposerRole(LIGNES, 'Nom', p, true)).toEqual({
            label: 'Nom',
            source: 'entête',
            conf: 'haute',
            warn: ''
        });
        expect(proposerRole(LIGNES, 'Montant', profilColonne(LIGNES, 'Montant'), true)).toMatchObject({
            label: 'Montant',
            conf: 'haute'
        });
        expect(proposerRole(LIGNES, 'Date', profilColonne(LIGNES, 'Comp'), true)).toMatchObject({
            conf: 'faible',
            warn: 'le contenu ressemble plutôt à : liste (séparateur « ; »)'
        });
        expect(proposerRole(LIGNES, 'Colonne 1', profilColonne(LIGNES, 'Date'), false)).toMatchObject({
            label: 'Date',
            source: 'contenu'
        });
        expect(proposerRole(LIGNES, 'Divers', p, true)).toMatchObject({ label: 'Divers', conf: 'moyenne' });
    });

    it('types des filtres : date, liste, énumération, texte', () => {
        const types = typesDesFiltres(LIGNES, ['Date', 'Comp', 'Nom', 'Vide']);
        expect(types.Date).toEqual({ type: 'date', valeurs: [] });
        expect(types.Comp).toEqual({ type: 'list', valeurs: ['Excel', 'Python', 'SQL', 'Word'] });
        expect(types.Nom).toEqual({ type: 'enum', valeurs: ['DURAND', 'MARTIN'] });
        expect(types.Vide?.type).toBe('text');
        const nombreux = Array.from({ length: 201 }, (_, i) => ({ V: `v${i}` }));
        expect(typesDesFiltres(nombreux, ['V']).V?.type).toBe('text');
    });
});

describe('filtres', () => {
    const colonnes = typesDesFiltres(LIGNES, Object.keys(LIGNES[0]!));
    const entetes = Object.keys(LIGNES[0]!);
    const n = (f: Filtres) => filtrer(LIGNES, entetes, colonnes, f).length;
    const avec = (t: string) => LIGNES.filter(l => l.Comp!.split(/\s*;\s*/).includes(t)).length;

    it('liste : OU dans un groupe, ET / OU entre groupes, exclusions prioritaires', () => {
        let f: FiltreListe | null = ajouterJetons(undefined, ['SQL', 'Word']);
        expect(n({ Comp: f })).toBe(30);
        f = ajouterGroupe(retirerJeton(f, 0, 1), 'AND');
        f = ajouterJetons(f, ['Python']);
        expect(f.groups[0]!.tokens).toEqual(['SQL', 'Python']);
        f = deplacerJeton(f, { gi: 0, ti: 1 }, { gi: 1, ti: 0 });
        expect(n({ Comp: f })).toBe(avec('Python'));
        f = basculerOperateur(f, 0);
        expect(n({ Comp: f })).toBe(avec('SQL'));
        expect(n({ Comp: exclure(f, ['Python']) })).toBe(avec('SQL') - avec('Python'));
        expect(n({ Comp: exclure(undefined, ['SQL']) })).toBe(30 - avec('SQL'));
    });

    it('énumération : valeur choisie (oui / non) ou groupes', () => {
        expect(n({ Nom: 'DURAND' })).toBe(15);
        expect(n({ Nom: ajouterJetons(undefined, ['MARTIN']) })).toBe(15);
        expect(n({ Nom: exclure(undefined, ['MARTIN']) })).toBe(15);
    });

    it('texte : sans accents ni casse, jokers', () => {
        const lignes: Ligne[] = [{ T: 'Élodie' }, { T: 'elodie' }, { T: 'Hélène' }, { T: 'ID-0015' }, { T: 'ID-0105' }];
        const c = { T: { type: 'text' as const, valeurs: [] } };
        const k = (f: string) => filtrer(lignes, ['T'], c, { T: f }).length;
        expect(k('elo')).toBe(2);
        expect(k('HÉL')).toBe(1);
        expect(k('id-00*5')).toBe(1);
        expect(k('id-0?05')).toBe(1);
        expect(k('*')).toBe(5);
    });

    it('date : après, avant, entre, égal ; date absente écartée dès que le filtre existe', () => {
        const lignes: Ligne[] = [{ D: '10/01/2031' }, { D: '20/01/2031 08:00' }, { D: '' }];
        const c = { D: { type: 'date' as const, valeurs: [] } };
        const k = (f: Filtres['D']) => filtrer(lignes, ['D'], c, { D: f }).length;
        expect(k({ mode: 'after', date: '2031-01-15' })).toBe(1);
        expect(k({ mode: 'before', date: '2031-01-15' })).toBe(1);
        expect(k({ mode: 'between', from: '2031-01-01', to: '2031-01-31' })).toBe(2);
        expect(k({ mode: 'exact', date: '2031-01-20' })).toBe(1);
        expect(k({ mode: 'after' })).toBe(2);
    });

    it('groupes : retrait du dernier groupe, groupes vides retirés, exclusions', () => {
        const f = ajouterGroupe(ajouterJetons(undefined, ['A']), 'OR');
        expect(f).toEqual({ groups: [{ tokens: ['A'] }, { tokens: [] }], ops: ['OR'], excluded: [] });
        expect(retirerGroupe(f, 0)).toBeNull();
        expect(retirerGroupe(ajouterJetons(undefined, ['A']), 0)).toBeNull();
        // Comportement conservé : sans valeur incluse, les exclusions disparaissent avec le filtre
        expect(retirerJeton(exclure(ajouterJetons(undefined, ['A']), ['B']), 0, 0)).toBeNull();
        expect(retirerExclusion(exclure(undefined, ['B']), 0)).toBeNull();
        expect(retirerExclusion(exclure(ajouterJetons(undefined, ['A']), ['B', 'C']), 0)?.excluded).toEqual(['C']);
    });

    it('nombre de filtres actifs', () => {
        expect(
            nombreFiltresActifs({
                a: 'x',
                b: null,
                c: ajouterGroupe(undefined, 'AND'),
                d: exclure(undefined, ['v']),
                e: { mode: 'after' }
            })
        ).toBe(3);
    });
});

describe('doublons et export', () => {
    it('clés en doublon sur tout le fichier', () => {
        const lignes: Ligne[] = [
            { a: 'x', b: '1' },
            { a: 'x ', b: '1' },
            { a: 'y', b: '1' }
        ];
        expect(clesEnDoublon(lignes, ['a', 'b']).size).toBe(1);
        expect(clesEnDoublon(lignes, ['b']).size).toBe(1);
        expect(clesEnDoublon(lignes, []).size).toBe(0);
    });

    it('CSV : BOM, guillemets doublés, CRLF', () => {
        expect(csvAnalyse([{ a: 'x"y', b: '' }], ['a', 'b'])).toBe('\uFEFF"a";"b"\r\n"x""y";""');
    });
});
