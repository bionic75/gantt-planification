import { describe, expect, it } from 'vitest';
import type { BonCommande, Deplacement } from '@/api/deplacements';
import {
    bonCouvrant,
    bonsModifiables,
    controler,
    dateCreation,
    dateFr,
    depassements,
    libelleBon,
    ligneDeplacement,
    nombreUo,
    trier
} from './calculs';

const bon = (champs: Partial<BonCommande>): BonCommande => ({
    id: 1,
    intitule: 'BDC-1',
    titulaire: 'ACME',
    date_debut: '2031-01-01',
    date_fin: '2031-12-31',
    nb_uo: 10,
    actif: 1,
    solde: 0,
    ...champs
});

const dep = (champs: Partial<Deplacement>): Deplacement => ({
    id: 1,
    user_id: 1,
    amoa_ced_id: 2,
    date_debut: '2031-03-02',
    date_fin: '2031-03-04',
    samu: 'SAMU 75',
    ville: 'PARIS',
    nb_uo: 3,
    commentaire: null,
    bon_commande_id: 1,
    a_regulariser: 0,
    created_at: '2031-01-10 10:00:00',
    bon_commande_intitule: 'BDC-1',
    bon_commande_titulaire: 'ACME',
    bc_uo_commandees: 10,
    amoa_ced_nom: 'Martin',
    amoa_ced_prenom: 'Léa',
    creator_nom: 'Durand',
    creator_prenom: 'Paul',
    ...champs
});

describe('mes déplacements : saisie', () => {
    it("nombre d'UO : jours bornes comprises", () => {
        expect(nombreUo('2031-03-02', '2031-03-04')).toBe(3);
        expect(nombreUo('2031-03-29', '2031-04-01')).toBe(4);
        expect(nombreUo('2031-03-02', '')).toBe(0);
    });

    it('bon de commande présélectionné : non soldé, couvrant les dates', () => {
        const bons = [bon({ id: 1, solde: 1 }), bon({ id: 2, date_debut: '2031-06-01' }), bon({ id: 3 })];
        expect(bonCouvrant(bons, '2031-03-02', '2031-03-04')?.id).toBe(3);
        expect(bonCouvrant(bons, '2032-01-01', '2032-01-02')).toBeUndefined();
    });

    it('contrôles : champs obligatoires, bon de commande, ordre des dates, période du bon', () => {
        const ok = {
            amoa: '2',
            debut: '2031-03-02',
            fin: '2031-03-04',
            samu: 'SAMU 75',
            ville: 'Paris',
            bon: '1',
            commentaire: ''
        };
        const bons = [bon({})];
        expect(controler(ok, bons, true)).toBeNull();
        expect(controler({ ...ok, ville: '  ' }, bons, true)).toBe('Veuillez remplir tous les champs obligatoires');
        expect(controler({ ...ok, bon: '' }, bons, true)).toBe('Veuillez sélectionner un bon de commande');
        expect(controler({ ...ok, bon: '' }, bons, false)).toBe('Veuillez remplir tous les champs obligatoires');
        expect(controler({ ...ok, fin: '2031-03-01' }, bons, true)).toBe(
            'La date de fin doit être postérieure ou égale à la date de début'
        );
        expect(controler({ ...ok, debut: '2032-01-05', fin: '2032-01-06' }, bons, true)).toContain(
            'Période valide : du 01/01/2031 au 31/12/2031'
        );
    });

    it('bons proposés à la modification et libellés', () => {
        const bons = [bon({ id: 1, solde: 1 }), bon({ id: 2 })];
        expect(bonsModifiables(bons, true, null).map(b => b.id)).toEqual([1, 2]);
        expect(bonsModifiables(bons, false, null).map(b => b.id)).toEqual([2]);
        expect(bonsModifiables(bons, false, 1).map(b => b.id)).toEqual([1, 2]);
        expect(libelleBon(bon({ solde: 1 }), true)).toBe('BDC-1 - ACME [SOLDÉ]');
        expect(libelleBon(bon({ titulaire: null }))).toBe('BDC-1 - N/A');
    });
});

describe('mes déplacements : liste', () => {
    it('dates affichées', () => {
        expect(dateFr('2031-03-02')).toBe('02/03/2031');
        expect(dateFr(null)).toBe('-');
        expect(dateCreation({ created_at: '2031-01-10T08:00:00.000Z' })).toBe('10/01/2031');
    });

    it('dépassement : le déplacement qui fait franchir le plafond, dans l’ordre de création', () => {
        const liste = [
            dep({ id: 2, nb_uo: 5, created_at: '2031-01-11 10:00:00' }),
            dep({ id: 1, nb_uo: 8, created_at: '2031-01-10 10:00:00' }),
            dep({ id: 3, nb_uo: 1, bon_commande_id: null })
        ];
        expect([...depassements(liste)]).toEqual([2]);
    });

    it('ligne : à affecter, dépassement signalé dans le commentaire, commentaire tronqué', () => {
        const sansBon = ligneDeplacement(dep({ bon_commande_id: null, bon_commande_intitule: null }), [], false);
        expect(sansBon).toMatchObject({ sansBon: true, attention: true, action: '📋 Affecter', amoa: 'MARTIN Léa' });
        const depasse = ligneDeplacement(dep({ commentaire: 'Mission de suivi du déploiement' }), [], true);
        expect(depasse.commentaire).toBe('⚠️ Dépasse le plafond de la commande | Mission de suivi du déploiement');
        expect(depasse.commentaireCourt).toBe(`${depasse.commentaire.substring(0, 30)}...`);
        expect(depasse).toMatchObject({ attention: true, action: '✏️ Modifier', bon: 'BDC-1 - ACME' });
        const normal = ligneDeplacement(dep({}), [{ id: 2, nom: 'Bernard', prenom: 'Zoé', trigramme: null }], false);
        expect(normal).toMatchObject({ attention: false, amoa: 'BERNARD Zoé', createur: 'DURAND Paul' });
    });

    it('tri : dates, nombres, texte ; valeurs vides en fin de liste', () => {
        const lignes = [
            ligneDeplacement(dep({ id: 1, ville: 'lyon', nb_uo: 10, date_debut: '2031-05-01' }), [], false),
            ligneDeplacement(dep({ id: 2, ville: 'Évry', nb_uo: 2, date_debut: '2031-04-01' }), [], false),
            ligneDeplacement(dep({ id: 3, ville: 'Paris', nb_uo: 3, amoa_ced_nom: null }), [], false)
        ];
        const ids = (l: typeof lignes) => l.map(x => x.d.id);
        expect(ids(trier(lignes, 'ville', true))).toEqual([2, 1, 3]);
        expect(ids(trier(lignes, 'uo', false))).toEqual([1, 3, 2]);
        expect(ids(trier(lignes, 'debut', true))).toEqual([3, 2, 1]);
        expect(ids(trier(lignes, 'amoa', true))).toEqual([1, 2, 3]);
        expect(ids(trier(lignes, 'amoa', false))).toEqual([1, 2, 3]);
    });
});
