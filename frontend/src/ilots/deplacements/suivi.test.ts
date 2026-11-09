import { describe, expect, it } from 'vitest';
import type { AmoaCed, BonCommandeSuivi, DeplacementReporting } from '@/api/deplacements';
import {
    confirmationSuppression,
    controlerCreation,
    controlerModification,
    corpsBon,
    messageSuppression
} from './administration';
import {
    amoaPresents,
    basculerTri,
    ciblesRegularisation,
    compteur,
    csvReporting,
    filtrer,
    filtresVides,
    ligneBon,
    ligneReporting,
    ligneSynthese,
    nomFichierCsv,
    premierDuMoisSuivant,
    samusPresents,
    trierBons,
    trierReporting
} from './suivi';

const bon = (b: Partial<BonCommandeSuivi> = {}): BonCommandeSuivi => ({
    id: 1,
    intitule: 'BDC-1',
    titulaire: 'ACME',
    date_debut: '2027-01-01',
    date_fin: '2027-12-31',
    uo_commandees: 10,
    uo_consommees: 3,
    actif: 1,
    solde: 0,
    regularisation_cible_bdc_id: null,
    regularisation_cible_intitule: null,
    ...b
});

const dep = (d: Partial<DeplacementReporting> = {}): DeplacementReporting => ({
    id: 1,
    user_id: 1,
    amoa_ced_id: 7,
    date_debut: '2027-03-01',
    date_fin: '2027-03-03',
    samu: 'SAMU 75',
    ville: 'PARIS',
    nb_uo: 3,
    bon_commande_id: 1,
    regularisation_source_bdc_id: null,
    user_nom: 'durand',
    user_prenom: 'Paul',
    bon_commande_intitule: 'BDC-1',
    bon_commande_titulaire: 'ACME',
    amoa_ced_nom: 'martin',
    amoa_ced_prenom: 'Léa',
    ...d
});

const amoa: AmoaCed[] = [{ id: 7, nom: 'martin', prenom: 'Léa', trigramme: 'LMA' }];

describe('synthèse des bons de commande', () => {
    it('solde, taux et couleurs', () => {
        expect(ligneSynthese(bon())).toMatchObject({
            bon: 'BDC-1 - ACME',
            periode: '01/01/2027 - 31/12/2027',
            solde: 7,
            taux: 30,
            tonSolde: 'vert',
            tonBarre: 'vert'
        });
        expect(ligneSynthese(bon({ uo_consommees: 9 }))).toMatchObject({ tonSolde: 'orange', tonBarre: 'orange' });
        expect(ligneSynthese(bon({ uo_consommees: 12 }))).toMatchObject({ solde: -2, taux: 120, tonSolde: 'rouge' });
        expect(ligneSynthese(bon({ uo_commandees: 0, uo_consommees: 0, titulaire: null }))).toMatchObject({
            bon: 'BDC-1',
            taux: 0
        });
    });
});

describe('observation des bons de commande', () => {
    it('bon non soldé : UO disponibles ou surconsommation', () => {
        expect(ligneBon(bon()).observation).toEqual({ texte: '7 UO disponibles', ton: 'vert', gras: false });
        expect(ligneBon(bon({ uo_consommees: 12 })).observation).toEqual({
            texte: '-2 UO (surconsommation)',
            ton: 'rouge',
            gras: false
        });
    });

    it('bon soldé : régularisation à prévoir, régularisée, réfaction, équilibré', () => {
        expect(ligneBon(bon({ solde: 1, uo_consommees: 12 }))).toMatchObject({
            ecart: 2,
            surconsommation: true,
            observation: { texte: '⚠️ Régularisation à prévoir pour 2 UO sur le prochain bon de commande', gras: true }
        });
        expect(ligneBon(bon({ solde: 1, uo_consommees: 12, regularisation_cible_bdc_id: 4 })).observation.texte).toBe(
            '✅ Surconsommation régularisée sur le bon de commande BDC #4'
        );
        expect(
            ligneBon(
                bon({
                    solde: 1,
                    uo_consommees: 12,
                    regularisation_cible_bdc_id: 4,
                    regularisation_cible_intitule: 'BDC-4'
                })
            ).observation.texte
        ).toBe('✅ Surconsommation régularisée sur le bon de commande BDC-4');
        expect(ligneBon(bon({ solde: 1 })).observation).toEqual({
            texte: 'ℹ️ Réfaction à prévoir pour 7 UO',
            ton: 'bleu',
            gras: true
        });
        expect(ligneBon(bon({ solde: 1, uo_consommees: 10 })).observation.texte).toBe('✅ Équilibré');
    });

    it('cibles de régularisation : actives, non soldées, autres que la source', () => {
        const bons = [bon(), bon({ id: 2 }), bon({ id: 3, solde: 1 }), bon({ id: 4, actif: 0 })];
        expect(ciblesRegularisation(bons, 1).map(b => b.id)).toEqual([2]);
    });

    it('premier jour du mois suivant', () => {
        expect(premierDuMoisSuivant(new Date(2026, 10, 9, 12))).toMatch(/^2026-1[12]-(01|30)$/);
    });
});

describe('tri', () => {
    it('bons : numéro, nombre, date, valeurs vides en fin', () => {
        const lignes = [
            bon({ id: 1, intitule: 'b', uo_consommees: 9, date_debut: '2027-02-01', titulaire: null }),
            bon({ id: 2, intitule: 'A', uo_consommees: 10, date_debut: '2026-12-01' }),
            bon({ id: 3, intitule: 'c', uo_consommees: 1, date_debut: '2027-01-15' })
        ].map(ligneBon);
        const ids = (t: Parameters<typeof trierBons>[1]) => trierBons(lignes, t).map(l => l.bc.id);
        expect(ids({ colonne: 'intitule', croissant: true })).toEqual([2, 1, 3]);
        expect(ids({ colonne: 'consommees', croissant: false })).toEqual([2, 1, 3]);
        expect(ids({ colonne: 'debut', croissant: true })).toEqual([2, 3, 1]);
        expect(ids({ colonne: 'titulaire', croissant: true })).toEqual([2, 3, 1]);
        expect(ids({ colonne: 'titulaire', croissant: false })).toEqual([2, 3, 1]);
        expect(ids(null)).toEqual([1, 2, 3]);
    });

    it('second clic : sens inversé ; autre colonne : croissant', () => {
        const t = basculerTri(null, 'bon');
        expect(t).toEqual({ colonne: 'bon', croissant: true });
        expect(basculerTri(t, 'bon')).toEqual({ colonne: 'bon', croissant: false });
        expect(basculerTri(t, 'ville')).toEqual({ colonne: 'ville', croissant: true });
    });

    it('reporting : bon à affecter trié sur son libellé', () => {
        const lignes = [dep({ id: 1 }), dep({ id: 2, bon_commande_intitule: null })].map(d => ligneReporting(d, []));
        expect(trierReporting(lignes, { colonne: 'bon', croissant: true }).map(l => l.d.id)).toEqual([2, 1]);
    });
});

describe('liste des déplacements du reporting', () => {
    it('ligne : bon, créateur, AMOA CED (liste, déplacement, identifiant)', () => {
        expect(ligneReporting(dep(), amoa)).toMatchObject({
            bon: 'BDC-1 - ACME',
            debut: '01/03/2027',
            createur: 'DURAND Paul',
            amoa: 'MARTIN Léa'
        });
        expect(ligneReporting(dep({ amoa_ced_prenom: null }), [])).toMatchObject({ amoa: 'MARTIN' });
        expect(ligneReporting(dep({ amoa_ced_nom: null }), [])).toMatchObject({ amoa: 'AMOA CED #7' });
        expect(
            ligneReporting(dep({ amoa_ced_id: null, user_nom: null, bon_commande_intitule: null }), [])
        ).toMatchObject({ amoa: '-', createur: '-', bon: '' });
    });

    it('filtres : bon, période, SAMU, AMOA CED', () => {
        const liste = [
            dep({ id: 1 }),
            dep({ id: 2, bon_commande_id: 2, date_debut: '2027-05-01', date_fin: '2027-05-02', samu: 'SAMU 13' }),
            dep({ id: 3, amoa_ced_id: 8, date_fin: '2027-06-30' })
        ];
        const ids = (f: Partial<ReturnType<typeof filtresVides>>) =>
            filtrer(liste, { ...filtresVides(), ...f }).map(d => d.id);
        expect(ids({})).toEqual([1, 2, 3]);
        expect(ids({ bon: '2' })).toEqual([2]);
        expect(ids({ debut: '2027-04-01' })).toEqual([2]);
        expect(ids({ fin: '2027-05-31' })).toEqual([1, 2]);
        expect(ids({ samu: 'SAMU 75' })).toEqual([1, 3]);
        expect(ids({ amoa: '8' })).toEqual([3]);
    });

    it('compteur, SAMU et AMOA CED proposés', () => {
        const liste = [dep(), dep({ id: 2, samu: 'SAMU 13', nb_uo: 2, amoa_ced_id: 9, amoa_ced_nom: 'abel' })];
        expect(compteur(liste)).toBe('2 déplacement(s) - Total: 5 UO');
        expect(compteur([])).toBe('0 déplacement(s)');
        expect(samusPresents([...liste, dep({ samu: '' })])).toEqual(['SAMU 13', 'SAMU 75']);
        expect(amoaPresents(liste, amoa)).toEqual([{ id: 7, libelle: 'MARTIN Léa' }]);
        expect(amoaPresents(liste, [])).toEqual([
            { id: 9, libelle: 'ABEL Léa' },
            { id: 7, libelle: 'MARTIN Léa' }
        ]);
    });

    it('export CSV : BOM, séparateur « ; », bon à affecter, valeurs telles quelles', () => {
        const csv = csvReporting([dep(), dep({ bon_commande_intitule: null, bon_commande_titulaire: null })], amoa);
        expect(csv.split('\n')).toEqual([
            '\uFEFFN° de BDC;Titulaire;Date début;Date fin;Créé par;AMOA CED;SAMU;Ville;Nb UO',
            'BDC-1;ACME;2027-03-01;2027-03-03;DURAND Paul;MARTIN Léa;SAMU 75;PARIS;3',
            'À affecter;;2027-03-01;2027-03-03;DURAND Paul;MARTIN Léa;SAMU 75;PARIS;3'
        ]);
        expect(csvReporting([dep({ amoa_ced_nom: null })], []).split('\n')[1]).toContain(';DURAND Paul;;SAMU 75;');
        expect(nomFichierCsv(new Date('2027-04-05T10:00:00Z'))).toBe('export_deplacements_2027-04-05.csv');
    });
});

describe('administration des bons de commande', () => {
    const saisie = {
        intitule: ' BDC-9 ',
        titulaire: 'acme ',
        debut: '2027-01-01',
        fin: '2027-12-31',
        uo: '5',
        solde: true
    };

    it('corps envoyé', () => {
        expect(corpsBon(saisie, false)).toEqual({
            intitule: 'BDC-9',
            titulaire: 'ACME',
            date_debut: '2027-01-01',
            date_fin: '2027-12-31',
            nb_uo: 5
        });
        expect(corpsBon(saisie, true).solde).toBe(true);
    });

    it('contrôles de la création et de la modification', () => {
        expect(controlerCreation(saisie, [])).toBeNull();
        expect(controlerCreation({ ...saisie, uo: '0' }, [])).toBe('Veuillez remplir tous les champs');
        expect(controlerCreation({ ...saisie, titulaire: ' ' }, [])).toBe('Veuillez remplir tous les champs');
        expect(controlerCreation({ ...saisie, fin: '2026-12-31' }, [])).toBe(
            'La date de fin doit être postérieure à la date de début'
        );
        expect(controlerCreation(saisie, [bon({ intitule: 'bdc-9' })])).toBe(
            'Ce numéro de CBDC existe déjà. Veuillez en saisir un autre.'
        );
        expect(controlerModification(saisie)).toBeNull();
        expect(controlerModification({ ...saisie, debut: '' })).toBe('Veuillez remplir tous les champs');
    });

    it('messages de la suppression', () => {
        expect(confirmationSuppression('BDC-9')).toContain('supprimer "BDC-9"');
        expect(messageSuppression(0)).toBe('Bon de commande supprimé');
        expect(messageSuppression(2)).toContain('2 déplacement(s) ont été désaffectés');
    });
});
