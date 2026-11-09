import { describe, expect, it } from 'vitest';
import type { LigneApercu, RubriqueAsana, TacheAsana } from '@/api/asana';
import {
    aAppliquer,
    apresRemplacement,
    datesRubrique,
    effTexte,
    estRemplacee,
    filtreActif,
    libelleTache,
    origine,
    projetRetenu,
    resumeAnalyse,
    rubriqueBloquee,
    rubriqueCochee,
    valeurTexte
} from './asana';

const TACHES: TacheAsana[] = [
    {
        gid: 't1',
        code: '2.1',
        name: '2.1 Démarrage',
        parent: null,
        start: null,
        due: '2031-01-06',
        eff: { start: '2031-01-06', end: '2031-01-06' }
    },
    {
        gid: 't2',
        code: '5.2',
        name: '5.2. Visite complémentaire',
        parent: '5',
        start: '2031-03-10',
        due: '2031-03-12',
        eff: { start: '2031-03-10', end: '2031-03-12' }
    },
    { gid: 't3', code: null, name: 'Sans date', parent: null, start: null, due: null, eff: null }
];

const DEBUT: RubriqueAsana = {
    key: 'date_debut',
    label: 'Début du projet',
    kind: 'date',
    rule: 'Démarrage',
    current: { date: '2031-01-06' },
    auto: { date: '2031-01-06' },
    sources: [],
    override: null
};
const VISITE: RubriqueAsana = {
    key: 'visite_metier',
    label: 'Visite métier',
    kind: 'period',
    rule: '5.1',
    current: { start: '2031-03-03', end: '2031-03-05' },
    auto: { start: '2031-03-03', end: '2031-03-04' },
    sources: [],
    override: null
};

describe('libellés', () => {
    it('valeurs, échéances et tâches', () => {
        expect(valeurTexte(null)).toBe('—');
        expect(valeurTexte({ date: '2031-01-06' })).toBe('06/01/2031');
        expect(valeurTexte({ start: '2031-03-03', end: '2031-03-05' })).toBe('03/03/2031 → 05/03/2031');
        expect(effTexte(null)).toBe('non datée');
        expect(effTexte({ start: '2031-03-10', end: '2031-03-12' })).toBe('10/03 → 12/03/2031');
        expect(libelleTache(TACHES[1]!)).toBe('5.2 Visite complémentaire — 10/03 → 12/03/2031');
        expect(libelleTache(TACHES[2]!)).toBe('Sans date — non datée');
    });
});

describe('origine et remplacements', () => {
    it('origine : Asana si la valeur actuelle est celle de la règle ou du remplacement, sinon modifiée dans l’outil', () => {
        expect(origine(DEBUT, undefined, TACHES)).toBe('asana');
        expect(origine(VISITE, undefined, TACHES)).toBe('tool');
        // Remplacement par la tâche 5.2 : la valeur actuelle (03-05/03) diffère
        expect(origine(VISITE, { start: 't2', end: 't2' }, TACHES)).toBe('tool');
        expect(
            origine(
                { ...VISITE, current: { start: '2031-03-10', end: '2031-03-12' } },
                { start: 't2', end: 't2' },
                TACHES
            )
        ).toBe('asana');
        expect(origine({ ...DEBUT, current: null, auto: null }, undefined, TACHES)).toBeNull();
    });

    it('valeur après remplacement et rubrique remplacée', () => {
        expect(apresRemplacement(VISITE, undefined, TACHES)).toBe('');
        expect(apresRemplacement(VISITE, { start: 't2', end: 't2' }, TACHES)).toBe('10/03/2031 → 12/03/2031');
        // Début seul remplacé, après la fin de la règle : bornes remises dans l'ordre
        expect(apresRemplacement(VISITE, { start: 't2' }, TACHES)).toBe('04/03/2031 → 10/03/2031');
        expect(apresRemplacement(DEBUT, { task: 't2' }, TACHES)).toBe('12/03/2031');
        expect(estRemplacee(VISITE, { end: 't2' })).toBe(true);
        expect(estRemplacee(DEBUT, { start: 't2' })).toBe(false);
    });

    it("dates de l'activité : remplacements compris, intervalle complet d'une seule tâche choisie", () => {
        expect(datesRubrique(VISITE, undefined, TACHES)).toEqual({ start: '2031-03-03', end: '2031-03-05' });
        expect(datesRubrique(VISITE, { start: 't2' }, TACHES)).toEqual({ start: '2031-03-10', end: '2031-03-12' });
        expect(datesRubrique(DEBUT, { task: 't1' }, TACHES)).toEqual({ start: '2031-01-06', end: '2031-01-06' });
        expect(datesRubrique({ ...VISITE, current: null, auto: null }, undefined, TACHES)).toBeNull();
    });
});

describe('aperçu, analyse, filtre', () => {
    const ligne = (status: LigneApercu['status']): LigneApercu => ({
        key: status,
        label: status,
        old: '',
        new: '',
        status
    });

    it('rubriques cochées, bloquées, à appliquer ; résumé de l’analyse', () => {
        const lignes = (['nouveau', 'modifié', 'local', 'conflit', 'identique', 'absent'] as const).map(ligne);
        expect(lignes.filter(rubriqueCochee).map(l => l.status)).toEqual(['nouveau', 'modifié']);
        expect(lignes.filter(rubriqueBloquee).map(l => l.status)).toEqual(['local', 'identique', 'absent']);
        expect(aAppliquer([ligne('identique'), ligne('conflit')])).toBe(true);
        expect(aAppliquer([ligne('identique'), ligne('local')])).toBe(false);
        expect(resumeAnalyse(lignes)).toEqual({ aMettreAJour: 2, conflits: 1 });
    });

    it('filtre des projets : tous les mots, sans accents ni casse', () => {
        expect(projetRetenu('[SAMU 06] Déploiement Nice', 'nice 06')).toBe(true);
        expect(projetRetenu('[SAMU 06] Déploiement Nice', 'deploiement lyon')).toBe(false);
        expect(projetRetenu('[SAMU 06] Déploiement Nice', '')).toBe(true);
        expect(filtreActif('  ')).toBe(false);
        expect(filtreActif('sf4')).toBe(true);
    });
});
