import { describe, expect, it } from 'vitest';
import type { EvenementCarte, ExpertCarte, LocalisationCarte } from '@/api/carte';
import type { Compte } from '@/api/evenements';
import {
    commencesA,
    compteParLieu,
    dateALaPosition,
    filtrer,
    grouperParLieu,
    localisationsGeolocalisees,
    placerExperts,
    plageLecture,
    propositions,
    typesProposes
} from './carte';

const evt = (champs: Partial<EvenementCarte>): EvenementCarte => ({
    id: 1,
    label: 'Évt',
    start_date: '2031-09-02',
    end_date: '2031-09-02',
    period: 'FULL',
    config: null,
    location_id: 10,
    libelle_court: 'SAMU 75',
    libelle_long: 'SAMU de Paris',
    adresse: '1 rue de Paris',
    latitude: 48.85,
    longitude: 2.35,
    creator_nom: null,
    creator_prenom: null,
    type_long: null,
    type_short: null,
    type_icon: null,
    type_other: null,
    participants: [],
    participant_ids: [],
    external_participants: [],
    ...champs
});

const EVTS = [
    evt({ id: 1, type_long: 'Formation', participants: ['Léa MARTIN'], participant_ids: [5] }),
    evt({
        id: 2,
        start_date: '2031-09-15',
        end_date: '2031-09-16',
        type_long: 'Formation',
        external_participants: [{ nom: 'Durand', prenom: 'Éric', email: 'Eric.Durand@exemple.fr' }]
    }),
    evt({ id: 3, start_date: '2031-09-25', end_date: '2031-09-25', location_id: 11, latitude: 45.75, longitude: 4.85 })
];

describe('carte des événements : filtres', () => {
    it('types proposés : libellés longs, « Sans type », par ordre alphabétique', () => {
        expect(typesProposes(EVTS)).toEqual(['Formation', 'Sans type']);
    });

    it('localisation et type', () => {
        const sans = { localisation: '', type: '', participants: [] };
        expect(filtrer(EVTS, { ...sans, localisation: '11' }).map(e => e.id)).toEqual([3]);
        expect(filtrer(EVTS, { ...sans, type: 'Formation' }).map(e => e.id)).toEqual([1, 2]);
        expect(filtrer(EVTS, { ...sans, type: 'Sans type' }).map(e => e.id)).toEqual([3]);
    });

    it('participants : compte par son identifiant, invité externe par son e-mail (sans casse ni accents)', () => {
        const f = (participants: Parameters<typeof filtrer>[1]['participants']) =>
            filtrer(EVTS, { localisation: '', type: '', participants }).map(e => e.id);
        expect(f([{ id: 5, nom: 'Martin', prenom: 'Léa' }])).toEqual([1]);
        expect(f([{ external: true, nom: '', prenom: '', email: 'eric.durand@exemple.fr' }])).toEqual([2]);
        // Toutes les personnes choisies doivent participer
        expect(
            f([
                { id: 5, nom: 'Martin', prenom: 'Léa' },
                { id: 6, nom: 'X', prenom: 'Y' }
            ])
        ).toEqual([]);
        // Invité sans e-mail : nom et prénom
        const sansEmail = [evt({ id: 9, external_participants: [{ nom: 'Petit', prenom: 'Zoé', email: null }] })];
        expect(
            filtrer(sansEmail, {
                localisation: '',
                type: '',
                participants: [{ external: true, nom: 'PETIT', prenom: 'zoe' }]
            })
        ).toHaveLength(1);
    });

    it('propositions : comptes (6 au plus) puis invités externes des événements (4 au plus), choisis exclus', () => {
        const comptes = [
            { id: 5, nom: 'Martin', prenom: 'Léa', email: 'lea@exemple.fr' },
            { id: 6, nom: 'Durand', prenom: 'Paul', email: 'paul@exemple.fr' }
        ] as Compte[];
        expect(propositions('dur', comptes, EVTS, [])).toEqual([
            { id: 6, nom: 'Durand', prenom: 'Paul' },
            { external: true, nom: 'Durand', prenom: 'Éric', email: 'Eric.Durand@exemple.fr' }
        ]);
        expect(propositions('lea', comptes, EVTS, [{ id: 5, nom: 'Martin', prenom: 'Léa' }])).toEqual([]);
        expect(propositions('', comptes, EVTS, [])).toEqual([]);
    });

    it('localisations proposées : celles qui ont des coordonnées', () => {
        const l = (id: number, latitude: number | null): LocalisationCarte => ({
            id,
            libelle_court: `L${id}`,
            libelle_long: '',
            adresse: null,
            latitude,
            longitude: latitude
        });
        expect(localisationsGeolocalisees([l(1, 48), l(2, null)]).map(x => x.id)).toEqual([1]);
    });
});

describe('carte des événements : lieux et experts', () => {
    it('événements regroupés par lieu', () => {
        const lieux = grouperParLieu(EVTS);
        expect(lieux.map(l => [l.cle, l.evenements.length, l.libelle])).toEqual([
            ['10', 2, 'SAMU 75'],
            ['11', 1, 'SAMU 75']
        ]);
    });

    it('experts placés au lieu de leur SAMU, décalés et étalés', () => {
        const exp = (id: number, samu: string | null): ExpertCarte => ({
            id,
            nom: 'N',
            prenom: 'P',
            trigramme: 'NPP',
            es_rattachement: 'CH',
            samu,
            profile_photo: null
        });
        const loc: LocalisationCarte = {
            id: 1,
            libelle_court: 'SAMU 75',
            libelle_long: '',
            adresse: null,
            latitude: '48.85',
            longitude: '2.35'
        };
        const places = placerExperts([exp(1, 'samu 75 '), exp(2, 'SAMU 75'), exp(3, 'SAMU 13')], [loc]);
        expect(places.map(p => p.id)).toEqual([1, 2]);
        expect(places[0]?.lat).toBeCloseTo(48.825, 5);
        expect(places.map(p => p.lng)).toEqual([2.33, 2.37].map(n => expect.closeTo(n, 5)));
    });
});

describe('carte des événements : lecture chronologique', () => {
    it('période : dates choisies, à défaut celles des événements ; rien à lire sans date ni événement', () => {
        expect(plageLecture(EVTS, '2031-09-01', '2031-09-30')).toEqual({
            debut: '2031-09-01',
            fin: '2031-09-30',
            jours: 29
        });
        expect(plageLecture(EVTS, '', '')).toEqual({ debut: '2031-09-02', fin: '2031-09-25', jours: 23 });
        expect(plageLecture([], '', '')).toBeNull();
        expect(plageLecture(EVTS, '2031-10-01', '2031-09-01')).toBeNull();
    });

    it('date atteinte et événements déjà commencés', () => {
        const p = { debut: '2031-09-01', fin: '2031-09-30', jours: 29 };
        expect(dateALaPosition(p, 0)).toBe('2031-09-01');
        expect(dateALaPosition(p, 1)).toBe('2031-09-30');
        expect(dateALaPosition(p, 0.5)).toBe('2031-09-15');
        expect(commencesA(EVTS, '2031-09-15').map(e => e.id)).toEqual([1, 2]);
        expect(compteParLieu(commencesA(EVTS, '2031-09-30'))).toEqual({ 10: 2, 11: 1 });
    });
});
