import { describe, expect, it } from 'vitest';
import type { Evenement, TypeEvenement } from '@/api/evenements';
import {
    AUTRES,
    type ColonneTableau,
    type Sens,
    cocheGrist,
    correspondAuModele,
    couleurs,
    exportCsv,
    exportHtml,
    filtrerExport,
    filtrerListe,
    grouperParAnnee,
    iconeEvenement,
    libelleAffiche,
    libelleModele,
    mentionCreation,
    periodeAffichee,
    SANS_FILTRE,
    tableauPossible,
    trierTableau
} from './calculs';

const evt = (champs: Partial<Evenement>): Evenement => ({
    id: 1,
    label: 'LIBELLÉ',
    start_date: '2031-05-12',
    end_date: '2031-05-12',
    config: null,
    created_by: 1,
    created_at: null,
    needs_resources: 0,
    resources_count: 1,
    type_id: null,
    grist: 0,
    location_id: null,
    period: 'FULL',
    creator_nom: null,
    creator_prenom: null,
    type_long: null,
    type_short: null,
    type_icon: null,
    type_other: null,
    participants: [],
    external_participants: [],
    ...champs
});
const TYPES = new Map<number, TypeEvenement>([
    [
        7,
        {
            id: 7,
            code: 'formation',
            label_long: 'Formation',
            label_short: 'FORM',
            icon: 'graduation',
            bg_color: '#111111',
            text_color: '#ffffff',
            border_color: '#000000',
            is_other: 0
        }
    ]
]);

describe('modèles et GRIST', () => {
    it('libellé du modèle reconnu (exact ou en début), ou type du modèle', () => {
        expect(correspondAuModele(evt({ label: 'Congres AFARM' }), 'CONGRÈS', TYPES)).toBe(true);
        expect(correspondAuModele(evt({ label: 'CONGRESSISTES' }), 'CONGRÈS', TYPES)).toBe(false);
        expect(correspondAuModele(evt({ label: 'Divers', type_id: 7 }), 'FORMATION', TYPES)).toBe(true);
    });

    it('GRIST coché pour certains libellés et types', () => {
        expect(cocheGrist('mise en service')).toBe(true);
        expect(cocheGrist('FORMATION')).toBe(false);
        expect(libelleModele('visiteMetier')).toBe('VISITE METIER');
        expect(cocheGrist(libelleModele('visiteMetier'))).toBe(true);
    });
});

describe('filtres', () => {
    const a = evt({
        id: 1,
        label: 'FORMATION SAMU 25',
        location_id: 3,
        participants: [{ user_id: 9, nom: 'Durand', prenom: 'Léa', email: null }],
        start_date: '2031-05-12',
        end_date: '2031-05-13'
    });
    const b = evt({
        id: 2,
        label: 'RÉUNION',
        external_participants: [{ nom: '', prenom: '', email: 'invite@exemple.fr' }],
        start_date: '2030-01-02',
        end_date: '2030-01-02'
    });

    it('libellé (modèle ou autres), localisation, participant sans accents, dates', () => {
        const f = (x: Partial<typeof SANS_FILTRE>) =>
            filtrerListe([a, b], { ...SANS_FILTRE, ...x }, TYPES).map(e => e.id);
        expect(f({ libelle: 'FORMATION' })).toEqual([1]);
        expect(f({ libelle: AUTRES })).toEqual([2]);
        expect(f({ localisation: '3' })).toEqual([1]);
        expect(f({ participant: 'lea' })).toEqual([1]);
        expect(f({ participant: 'invite@' })).toEqual([2]);
        expect(f({ debut: '2031-01-01' })).toEqual([1]);
        expect(f({ fin: '2030-12-31' })).toEqual([2]);
    });

    it('export : filtre de localisation sur un champ absent de l’API (anomalie conservée)', () => {
        expect(filtrerExport([a, b], { ...SANS_FILTRE, localisation: '3' }, TYPES)).toEqual([]);
        expect(filtrerExport([a, b], SANS_FILTRE, TYPES)).toHaveLength(2);
    });
});

describe('arborescence', () => {
    const liste = [
        evt({ id: 1, start_date: '2030-05-06' }),
        evt({ id: 2, start_date: '2031-05-20' }),
        evt({ id: 3, start_date: '2031-05-02' }),
        evt({ id: 4, start_date: '2031-01-15' })
    ];

    it('années, mois et événements du plus récent au plus ancien, ou l’inverse', () => {
        const desc = grouperParAnnee(liste, 'desc');
        expect(desc.map(g => [g.annee, g.nombre])).toEqual([
            [2031, 3],
            [2030, 1]
        ]);
        expect(desc[0]?.mois.map(m => m.mois)).toEqual([4, 0]);
        expect(desc[0]?.mois[0]?.evenements.map(e => e.id)).toEqual([2, 3]);
        const asc = grouperParAnnee(liste, 'asc');
        expect(asc.map(g => g.annee)).toEqual([2030, 2031]);
        expect(asc[1]?.mois[1]?.evenements.map(e => e.id)).toEqual([3, 2]);
    });
});

describe('mises en forme', () => {
    it('dates et nombre de jours', () => {
        expect(periodeAffichee(evt({ start_date: '2031-05-12', end_date: '2031-05-12' }))).toEqual({
            texte: '12/05/2031',
            jours: 1
        });
        expect(periodeAffichee(evt({ start_date: '2031-03-30', end_date: '2031-04-02' }))).toEqual({
            texte: '30/03/2031 - 02/04/2031',
            jours: 4
        });
    });

    it('mention de création (heure locale), à défaut « Créé par »', () => {
        expect(mentionCreation('2031-05-12 08:30:00')).toMatch(/^Créé le 12\/05\/2031 \d{2}:30 par $/);
        expect(mentionCreation(null)).toBe('Créé par ');
    });

    it('libellé affiché : localisation, type ou libellé ; icône du type ou du modèle', () => {
        const typé = evt({ type_long: 'Formation', type_short: 'FORM', type_icon: 'graduation', location_id: 3 });
        expect(libelleAffiche(typé, [{ id: 3, libelle_court: 'SAMU 25', libelle_long: 'X' }])).toBe('SAMU 25 | FORM');
        expect(libelleAffiche(evt({ location_id: 99 }), [])).toBe('NON DÉFINI | LIBELLÉ');
        expect(iconeEvenement(typé)).toBe('graduation');
        expect(iconeEvenement(evt({ label: 'Visite terrain Lyon' }))).toBe('pin');
        expect(iconeEvenement(evt({ label: 'Autre chose' }))).toBe('');
        expect(couleurs(evt({ config: '{"bgColor":"#123456"}' }))).toEqual({
            fond: '#123456',
            texte: '#000',
            bordure: '#fbc02d'
        });
    });
});

describe('exports', () => {
    const e = evt({
        label: 'FORMATION "A"',
        participants: [{ user_id: 1, nom: 'Durand', prenom: 'Léa', email: null }],
        external_participants: [{ nom: '', prenom: '', email: 'x@y.fr' }]
    });

    it('CSV : en-têtes, valeurs entre guillemets, BOM', () => {
        const csv = exportCsv([e]);
        expect(csv.startsWith('\uFEFFType,Libellé,Date début')).toBe(true);
        expect(csv).toContain('"FORMATION ""A""","2031-05-12","2031-05-12","","Léa Durand","x@y.fr",""');
    });

    it('HTML : page autonome, libellé échappé', () => {
        const html = exportHtml([e], new Date(2031, 4, 12));
        expect(html).toContain('<title>Événements exportés</title>');
        expect(html).toContain('export du 12/05/2031');
        expect(html).toContain('FORMATION &quot;A&quot;');
    });
});

describe('tableau triable', () => {
    const locs = [
        { id: 1, libelle_court: 'SAMU 44', libelle_long: 'SAMU 44' },
        { id: 2, libelle_court: 'SAMU 13', libelle_long: 'SAMU 13' }
    ];
    const liste = [
        evt({ id: 1, label: 'B', start_date: '2031-05-12', end_date: '2031-05-12', location_id: 1 }),
        evt({ id: 2, label: 'A', start_date: '2031-04-01', end_date: '2031-04-03', location_id: 2 }),
        evt({ id: 3, label: 'C', start_date: '2031-06-01', end_date: '2031-06-01', location_id: 2 })
    ];
    const ids = (c: ColonneTableau, sens: Sens) => trierTableau(liste, locs, c, sens).map(e => e.id);

    it('proposé dès qu’un libellé, une localisation ou un participant est choisi', () => {
        expect(tableauPossible(SANS_FILTRE)).toBe(false);
        expect(tableauPossible({ ...SANS_FILTRE, debut: '2031-01-01' })).toBe(false);
        expect(tableauPossible({ ...SANS_FILTRE, localisation: '1' })).toBe(true);
        expect(tableauPossible({ ...SANS_FILTRE, participant: ' ali ' })).toBe(true);
        expect(tableauPossible({ ...SANS_FILTRE, libelle: AUTRES })).toBe(true);
    });
    it('tri par colonne, dans les deux sens, à égalité par date puis identifiant', () => {
        expect(ids('libelle', 'asc')).toEqual([2, 1, 3]);
        expect(ids('libelle', 'desc')).toEqual([3, 1, 2]);
        expect(ids('debut', 'desc')).toEqual([3, 1, 2]);
        expect(ids('jours', 'desc')).toEqual([2, 1, 3]);
        expect(ids('lieu', 'asc')).toEqual([2, 3, 1]);
    });
});
