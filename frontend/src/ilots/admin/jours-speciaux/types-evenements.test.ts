import { describe, expect, it } from 'vitest';
import type { EvenementReprise, TypeAdmin } from '@/api/typesEvenements';
import {
    BANQUE_ICONES,
    COULEURS_PAR_DEFAUT,
    dateFr,
    evenementsAffiches,
    gabaritDe,
    GABARITS,
    normaliser,
    ongletApresChargement,
    suggestion
} from './types-evenements';
import { ICONES_APPLICATION } from '@/composants/icones-application';
import { ICONES } from '@/composants/icones';

const type = (id: number, champs: Partial<TypeAdmin> = {}): TypeAdmin => ({
    id,
    code: null,
    label_long: `Type ${id}`,
    label_short: null,
    icon: 'tag',
    bg_color: '#ffffff',
    text_color: '#000000',
    border_color: '#000000',
    is_other: 0,
    ...champs
});

const TYPES = [
    type(1, { code: 'formation', label_long: 'Formation' }),
    type(2, { code: 'mes', label_long: 'Mise en service' }),
    type(3, { label_long: 'Comité de pilotage' }),
    type(9, { code: 'autre', label_long: 'Autre(s)', is_other: 1 })
];

const evt = (id: number, champs: Partial<EvenementReprise> = {}): EvenementReprise => ({
    id,
    label: `Évt ${id}`,
    start_date: '2031-01-01',
    end_date: '2031-01-01',
    period: 'FULL',
    type_id: null,
    location_court: null,
    location_long: null,
    creator_nom: null,
    creator_prenom: null,
    participants: [],
    ...champs
});

describe("types d'événements", () => {
    it('toutes les icônes de la banque existent', () => {
        for (const [nom] of BANQUE_ICONES) expect(nom in ICONES || nom in ICONES_APPLICATION, nom).toBe(true);
    });

    it('gabarit de couleurs retrouvé, personnalisé sinon ; nouveau type : « Jaune · texte noir »', () => {
        expect(GABARITS[gabaritDe(COULEURS_PAR_DEFAUT) as number]!.n).toBe('Jaune · texte noir');
        expect(gabaritDe({ bg: '#7b1fa2', text: '#ffffff', border: '#4a0072' })).toBe(7);
        expect(gabaritDe({ bg: '#123456', text: '#ffffff', border: '#000000' })).toBe('custom');
    });

    it('texte comparable sans accents, casse ni ponctuation', () => {
        expect(normaliser('  Réunion de LANCEMENT – stratégique ! ')).toBe('reunion de lancement strategique');
        expect(normaliser(null)).toBe('');
    });

    it('suggestion : libellé historique, suivi ou non d’autres mots, sinon même libellé long (hors « Autre(s) »)', () => {
        expect(suggestion('FORMATION', TYPES)?.id).toBe(1);
        expect(suggestion('Formation utilisateurs SAMU 75', TYPES)?.id).toBe(1);
        expect(suggestion('Mise en service', TYPES)?.id).toBe(2);
        expect(suggestion('comité de pilotage', TYPES)?.id).toBe(3);
        expect(suggestion('Autre(s)', TYPES)).toBeNull();
        expect(suggestion('Formations', TYPES)).toBeNull();
        // Libellé historique sans type de ce code : pas de suggestion
        expect(suggestion('Congrès national', TYPES)).toBeNull();
    });
});

describe('reprise des données', () => {
    const base = {
        modifications: {},
        types: TYPES,
        onglet: 'todo' as const,
        recherche: '',
        tri: 'start' as const,
        sens: 1 as const
    };
    const EVTS = [
        evt(1, { start_date: '2031-03-01', label: 'Formation SAMU' }),
        evt(2, { start_date: '2031-01-15', label: 'Visite', creator_nom: 'Durand', creator_prenom: 'Zoé' }),
        evt(3, { start_date: '2031-02-01', type_id: 2, label: 'MES', participants: ['Jean Dupont'] }),
        evt(4, { start_date: '2031-01-15', label: 'Réunion', creator_nom: 'Albert', creator_prenom: 'Yves' })
    ];

    it('dates au format français', () => {
        expect(dateFr('2031-07-08')).toBe('08/07/2031');
        expect(dateFr(null)).toBe('');
    });

    it('onglets : sans type à traiter, avec type traités ; tri par début puis identifiant', () => {
        expect(evenementsAffiches(EVTS, base).map(e => e.id)).toEqual([2, 4, 1]);
        expect(evenementsAffiches(EVTS, { ...base, onglet: 'done' }).map(e => e.id)).toEqual([3]);
        expect(evenementsAffiches(EVTS, { ...base, sens: -1 }).map(e => e.id)).toEqual([1, 2, 4]);
    });

    it('« Créé par » trié sur le nom puis le prénom', () => {
        expect(evenementsAffiches(EVTS, { ...base, tri: 'creator' }).map(e => e.id)).toEqual([1, 4, 2]);
    });

    it('recherche dans tous les champs, y compris le type et le libellé modifiés', () => {
        expect(evenementsAffiches(EVTS, { ...base, onglet: 'done', recherche: 'dupont' }).map(e => e.id)).toEqual([3]);
        expect(evenementsAffiches(EVTS, { ...base, onglet: 'done', recherche: 'mise en' }).map(e => e.id)).toEqual([3]);
        const modifications = { 2: { type_id: 3, label: 'Copil régional' } };
        expect(evenementsAffiches(EVTS, { ...base, modifications, recherche: 'copil' }).map(e => e.id)).toEqual([2]);
        expect(evenementsAffiches(EVTS, { ...base, modifications, recherche: 'comite' }).map(e => e.id)).toEqual([2]);
        // Onglet d'après le type enregistré : un type affecté non enregistré laisse l'événement « À traiter »
        expect(evenementsAffiches(EVTS, { ...base, modifications, onglet: 'done' }).map(e => e.id)).toEqual([3]);
    });

    it('onglet après chargement', () => {
        expect(ongletApresChargement(EVTS, null)).toBe('todo');
        expect(ongletApresChargement(EVTS, 'done')).toBe('done');
        expect(ongletApresChargement([EVTS[2]!], 'todo')).toBe('done');
        expect(ongletApresChargement([], null)).toBe('done');
    });
});
