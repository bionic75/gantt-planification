import { describe, expect, it } from 'vitest';
import type { LigneAstreinte } from '@/api/astreintes';
import {
    SAMU_ASTREINTES,
    apparenceType,
    arbreAdministrateur,
    arbreExpert,
    controler,
    periode,
    saisieDe,
    saisieVide,
    samuAffiche,
    typesProposes,
    type SaisieAstreinte
} from './astreintes';

const ligne = (champs: Partial<LigneAstreinte>): LigneAstreinte => ({
    id: 1,
    user_id: 7,
    type: 'astreinte',
    date_debut: '2031-08-04',
    date_fin: '2031-08-04',
    heure_debut: '18:00',
    heure_fin: '23:00',
    samu: 'SAMU 75',
    tous_samu: 0,
    objet: 'Objet',
    ...champs
});

const saisie = (champs: Partial<SaisieAstreinte>): SaisieAstreinte => ({
    ...saisieVide(),
    dateDebut: '2031-08-04',
    dateFin: '2031-08-04',
    heureDebut: '18:00',
    heureFin: '23:00',
    samu: 'SAMU 75',
    objet: ' Objet ',
    ...champs
});

const options = { administrateur: false, modification: false, adhesion: null };

describe('SAMU, types et affichage', () => {
    it('liste fixe des SAMU', () => {
        expect(SAMU_ASTREINTES).toHaveLength(99);
        expect(SAMU_ASTREINTES.slice(0, 2)).toEqual(['SAMU 01', 'SAMU 02']);
        expect(SAMU_ASTREINTES.at(-1)).toBe('SAMU 2B');
    });

    it('« Activité courante » proposée seulement pour modifier une telle ligne', () => {
        expect(typesProposes(null).map(t => t.valeur)).toEqual(['astreinte', 'hno']);
        expect(typesProposes('hno').map(t => t.valeur)).toEqual(['astreinte', 'hno']);
        expect(typesProposes('activite_courante').map(t => t.valeur)).toEqual([
            'astreinte',
            'hno',
            'activite_courante'
        ]);
    });

    it('étiquette du type, période et SAMU', () => {
        expect(apparenceType('astreinte').libelle).toBe('🔔 Astreinte');
        expect(apparenceType('activite_courante').libelle).toBe('✅ Activité courante');
        expect(apparenceType('hno').libelle).toBe('⏰ HNO');
        expect(periode(ligne({}))).toBe('04/08/2031 (18:00 - 23:00)');
        expect(periode(ligne({ date_fin: '2031-08-06', heure_debut: null }))).toBe('04/08/2031 - 06/08/2031');
        expect(samuAffiche(ligne({ tous_samu: 1, samu: null }))).toBe('Tous les SAMU');
    });
});

describe('arborescence', () => {
    it('expert : années puis mois, du plus récent au plus ancien', () => {
        const arbre = arbreExpert([
            ligne({ id: 1, date_debut: '2030-12-01' }),
            ligne({ id: 2, date_debut: '2031-01-15' }),
            ligne({ id: 3, date_debut: '2031-08-04' }),
            ligne({ id: 4, date_debut: '2031-08-20' })
        ]);
        expect(arbre.map(a => a.libelle)).toEqual(['2031', '2030']);
        expect(arbre[0]!.mois.map(m => m.libelle)).toEqual(['Août', 'Janvier']);
        expect(arbre[0]!.mois[0]!.lignes.map(l => l.id)).toEqual([3, 4]);
    });

    it('administrateur : experts « nom prénom » par ordre alphabétique', () => {
        const arbre = arbreAdministrateur([
            ligne({ id: 1, user_nom: 'MARTIN', user_prenom: 'Léa' }),
            ligne({ id: 2, user_nom: 'DURAND', user_prenom: 'Paul' })
        ]);
        expect(arbre.map(e => e.libelle)).toEqual(['DURAND Paul', 'MARTIN Léa']);
        expect(arbre[0]!.annees[0]!.cle).toBe('DURAND Paul|2031');
    });
});

describe('contrôle de la saisie', () => {
    it('refus dans l’ordre : dates, heures, SAMU, objet', () => {
        expect(controler(saisie({ dateFin: '' }), options)).toEqual({ erreur: 'Veuillez remplir les dates' });
        expect(controler(saisie({ heureFin: '' }), options)).toEqual({
            erreur: 'Veuillez remplir les heures de début et de fin'
        });
        expect(controler(saisie({ samu: '' }), options)).toEqual({
            erreur: 'Veuillez sélectionner un SAMU ou cocher "Tous les SAMU"'
        });
        expect(controler(saisie({ objet: '  ' }), options)).toEqual({ erreur: "Veuillez remplir l'objet" });
    });

    it('date d’adhésion de l’expert au dispositif', () => {
        const r = controler(saisie({}), { ...options, adhesion: '2031-09-01' });
        expect('erreur' in r && r.erreur).toContain("avant votre date d'adhésion");
        expect('corps' in controler(saisie({}), { ...options, adhesion: '2031-08-04' })).toBe(true);
    });

    it('corps : objet sans espaces, SAMU nul pour « Tous les SAMU »', () => {
        expect(controler(saisie({ tousSamu: true }), options)).toEqual({
            corps: {
                type: 'astreinte',
                date_debut: '2031-08-04',
                date_fin: '2031-08-04',
                heure_debut: '18:00',
                heure_fin: '23:00',
                samu: null,
                tous_samu: true,
                objet: 'Objet'
            }
        });
    });

    it('administrateur : expert obligatoire à la création', () => {
        const admin = { ...options, administrateur: true };
        expect(controler(saisie({}), admin)).toEqual({ erreur: 'Veuillez sélectionner un expert' });
        const r = controler(saisie({ expert: '7' }), admin);
        expect('corps' in r && r.corps.user_id).toBe(7);
        expect('corps' in controler(saisie({}), { ...admin, modification: true })).toBe(true);
    });

    it('modification d’une activité courante : type conservé', () => {
        const s = saisieDe(ligne({ type: 'activite_courante', tous_samu: 1, samu: null }));
        expect(s.type).toBe('activite_courante');
        const r = controler(s, options);
        expect('corps' in r && r.corps.type).toBe('activite_courante');
    });
});
