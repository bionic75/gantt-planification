import { describe, expect, it } from 'vitest';
import type { EvenementTrouve, LigneConnexions, RapportDisponibilites, RapportHno } from '@/api/reporting';
import {
    avatar,
    basculerTri,
    bornesDuMois,
    couleursEvenement,
    dateFr,
    libellePeriode,
    moisDeLaPeriode,
    niveauTaux,
    ouTiret,
    periodeDisponibilites,
    periodeHno,
    periodeValide,
    regrouperConnexions,
    tableauDisponibilites,
    tableauHno,
    TRI_CONNEXIONS,
    trierConnexions,
    trierParNom
} from './calculs';

describe('périodes', () => {
    it('disponibilités : du mois courant au troisième mois suivant, changement d’année compris', () => {
        expect(periodeDisponibilites(new Date(2026, 10, 15))).toEqual({
            startMonth: 10,
            startYear: 2026,
            endMonth: 1,
            endYear: 2027
        });
    });

    it('HNO : année en cours, de janvier à décembre', () => {
        expect(periodeHno(new Date(2026, 4, 2))).toEqual({
            startMonth: 0,
            startYear: 2026,
            endMonth: 11,
            endYear: 2026
        });
    });

    it('période valide si le début précède la fin (même mois accepté)', () => {
        expect(periodeValide({ startMonth: 3, startYear: 2026, endMonth: 3, endYear: 2026 })).toBe(true);
        expect(periodeValide({ startMonth: 5, startYear: 2026, endMonth: 2, endYear: 2026 })).toBe(false);
        expect(periodeValide({ startMonth: 11, startYear: 2025, endMonth: 0, endYear: 2026 })).toBe(true);
    });

    it('connexions, mode mensuel : premier et dernier jour du mois', () => {
        expect(bornesDuMois('02', '2028')).toEqual({ dateStart: '2028-02-01', dateEnd: '2028-02-29' });
        expect(bornesDuMois('12', '2026')).toEqual({ dateStart: '2026-12-01', dateEnd: '2026-12-31' });
    });
});

describe('disponibilités / affectations', () => {
    const rapport: RapportDisponibilites = {
        months: [
            { year: 2026, month: 9 },
            { year: 2026, month: 10 }
        ],
        experts: [
            {
                id: 1,
                name: 'Bravo B',
                tauxMad: 50,
                avgWorkingDaysPerMonth: 21,
                monthlyStats: { '2026-10': { available: 10, assigned: 8, leave: 2, rate: 80 } }
            },
            { id: 2, name: 'alpha A', tauxMad: 100, monthlyStats: {} }
        ]
    };

    it('totaux par expert, par mois et général ; mois sans données à zéro', () => {
        const t = tableauDisponibilites(rapport);
        expect(t.lignes[0]).toMatchObject({ disponible: 10, affecte: 8, taux: 80, joursMad: '10.5' });
        expect(t.lignes[1]).toMatchObject({ disponible: 0, affecte: 0, taux: 0, joursMad: '22.0' });
        expect(t.parMois).toEqual([
            { disponible: 10, affecte: 8 },
            { disponible: 0, affecte: 0 }
        ]);
        expect(t.total).toEqual({ disponible: 10, affecte: 8 });
    });

    it('couleur selon le taux ; gris sans jour disponible', () => {
        expect([niveauTaux(80), niveauTaux(75), niveauTaux(60), niveauTaux(49)]).toEqual([
            'optimal',
            'optimal',
            'moyen',
            'faible'
        ]);
        expect(niveauTaux(0, 0)).toBe('vide');
    });

    it('tri par nom, insensible à la casse ; sans tri : ordre du serveur', () => {
        const { lignes } = tableauDisponibilites(rapport);
        expect(trierParNom(lignes, 'asc').map(l => l.nom)).toEqual(['alpha A', 'Bravo B']);
        expect(trierParNom(lignes, 'desc').map(l => l.nom)).toEqual(['Bravo B', 'alpha A']);
        expect(trierParNom(lignes, null).map(l => l.nom)).toEqual(['Bravo B', 'alpha A']);
    });
});

describe('HNO / astreintes', () => {
    it('mois de la période (clé « AAAA-m ») et totaux', () => {
        const mois = moisDeLaPeriode({ startMonth: 11, startYear: 2025, endMonth: 0, endYear: 2026 });
        expect(mois).toEqual([
            { cle: '2025-11', libelle: 'Déc 2025' },
            { cle: '2026-0', libelle: 'Jan 2026' }
        ]);
        const r: RapportHno = {
            experts: [
                { resource_id: 1, prenom: 'A', nom: 'B', monthlyData: { '2025-11': { hno: 2, astreintes: 1 } } },
                { resource_id: 2, prenom: 'C', nom: 'D', monthlyData: { '2026-0': { hno: 1, astreintes: 0 } } }
            ]
        };
        const t = tableauHno(r, mois);
        expect(t.lignes.map(l => [l.nom, l.hno, l.astreintes])).toEqual([
            ['A B', 2, 1],
            ['C D', 1, 0]
        ]);
        expect(t.parMois).toEqual([
            { hno: 2, astreintes: 1 },
            { hno: 1, astreintes: 0 }
        ]);
        expect(t.total).toEqual({ hno: 3, astreintes: 1 });
        expect([ouTiret(0), ouTiret(3)]).toEqual(['-', '3']);
    });
});

describe('événements', () => {
    it('dates, période d’une journée, couleurs du type', () => {
        expect(dateFr('2031-05-06')).toBe('06/05/2031');
        expect(dateFr(null)).toBe('-');
        expect([libellePeriode('AM'), libellePeriode('PM'), libellePeriode(null)]).toEqual([
            '☀️ Matin',
            '🌙 Après-midi',
            'Journée entière'
        ]);
        const e = { config: '{"bgColor":"#123456"}' } as EvenementTrouve;
        expect(couleursEvenement(e)).toEqual({ fond: '#123456', texte: '#000', bordure: '#ccc' });
        expect(couleursEvenement({ config: 'invalide' } as EvenementTrouve).fond).toBe('#ffeb3b');
    });

    it('pastille : initiales et couleur stable', () => {
        const a = avatar('Marie', 'Curie');
        expect(a.initiales).toBe('MC');
        expect(avatar('Marie', 'Curie').couleur).toBe(a.couleur);
    });
});

describe('connexions', () => {
    const ligne = (username: string, profile: string, nb: number, derniere: string): LigneConnexions => ({
        username,
        nom: username.toUpperCase(),
        prenom: 'P',
        profile,
        nb_connexions: nb,
        derniere_connexion: derniere
    });
    const rows = [
        ligne('zoe', 'admin', 2, '2026-10-01 10:00:00'),
        ligne('ZOE', 'expert', 5, '2026-10-03 09:00:00'),
        ligne('alex', 'user', 4, '2026-10-02 08:00:00')
    ];

    it('une ligne par utilisateur : total, profils du plus utilisé, dernière connexion', () => {
        const [zoe, alex] = regrouperConnexions(rows);
        expect(zoe).toMatchObject({ login: 'zoe', total: 7, derniere: '2026-10-03 09:00:00' });
        expect(zoe?.profils).toEqual([
            { profil: 'expert', nb: 5 },
            { profil: 'admin', nb: 2 }
        ]);
        expect(alex?.total).toBe(4);
    });

    it('tri : total décroissant par défaut, sens inversé au second clic', () => {
        const u = regrouperConnexions(rows);
        expect(trierConnexions(u, TRI_CONNEXIONS).map(x => x.login)).toEqual(['zoe', 'alex']);
        const parLogin = basculerTri(TRI_CONNEXIONS, 'login');
        expect(parLogin).toEqual({ cle: 'login', sens: 1 });
        expect(trierConnexions(u, parLogin).map(x => x.login)).toEqual(['alex', 'zoe']);
        expect(basculerTri(parLogin, 'login')).toEqual({ cle: 'login', sens: -1 });
        expect(basculerTri(parLogin, 'last')).toEqual({ cle: 'last', sens: -1 });
    });
});
