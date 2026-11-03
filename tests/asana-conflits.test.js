// Asana : nouvelles étapes (Réunion de lancement stratégique, Visite OB) et arbitrage des conflits (statuts d'une rubrique)
import { describe, expect, it } from 'vitest';
import {
    asanaApplyOverrides,
    asanaComputeTasks,
    asanaTemplateChoices,
    asanaUseStageRules,
    asanaStatus,
    asanaValueOf
} from '../src/modules/affectation/asana.service.js';
import { AFF_EVENT_KEYS, AFF_STAGES } from '../src/modules/affectation/affectation.service.js';

const task = (name, start, due, extra = {}) => ({
    name,
    section: '',
    start,
    due,
    parent: '',
    projects: '',
    phase: '',
    ...extra
});

describe('étapes Réunion de lancement stratégique et Visite OB', () => {
    it('déclarées comme jalons sans ressources expertes, reliées aux événements', () => {
        for (const key of ['reunion_lancement', 'visite_ob']) {
            const def = AFF_STAGES.find(s => s.key === key);
            expect(def).toMatchObject({ kind: 'milestone' });
            expect(def.resources).toBeFalsy();
            expect(AFF_EVENT_KEYS).toContain(key);
        }
    });

    it('reprises des tâches Asana portant leur nom (accents et casse ignorés)', () => {
        const c = asanaComputeTasks(
            [
                task('Réunion de lancement STRATÉGIQUE', '2027-02-01', '2027-02-02'),
                task('Visite OB sur site', '2027-03-10', '2027-03-11'),
                task('Visite obligatoire', '2027-04-01', '2027-04-02'),
                task('Démarrage projet auprès de l’ES', '', '2027-01-04')
            ],
            '[SAMU 25] SF4'
        );
        expect(c.found.reunion_lancement).toEqual({ start: '2027-02-02', end: '2027-02-02' });
        // Jalon : la date d'échéance de la tâche
        expect(c.found.visite_ob).toEqual({ start: '2027-03-11', end: '2027-03-11' });
        expect(asanaValueOf(c, 'visite_ob')).toBe('11/03/2027');
    });

    it('absentes du projet Asana : raison indiquée', () => {
        const c = asanaComputeTasks([task('Démarrage projet auprès de l’ES', '', '2027-01-04')], '[SAMU 25] SF4');
        expect(c.found.visite_ob).toBeUndefined();
        expect(c.reasons.visite_ob).toMatch(/Visite OB/);
        expect(c.reasons.reunion_lancement).toMatch(/Réunion de lancement/);
    });
});

describe('statut d’une rubrique (modification dans l’application ou dans Asana)', () => {
    const A = '01/03/2027 → 05/03/2027';
    const B = '08/03/2027 → 12/03/2027';
    const C = '15/03/2027 → 19/03/2027';

    it('rien dans Asana : absent ; valeurs égales : identique ; rien dans l’application : nouveau', () => {
        expect(asanaStatus(A, '', A)).toBe('absent');
        expect(asanaStatus(A, A, undefined)).toBe('identique');
        expect(asanaStatus('', A, undefined)).toBe('nouveau');
    });

    it('Asana seul a changé depuis la dernière reprise : modifié (reprise sans risque)', () => {
        expect(asanaStatus(A, B, A)).toBe('modifié');
    });

    it('l’application seule a changé : local (rien à reprendre)', () => {
        expect(asanaStatus(B, A, A)).toBe('local');
    });

    it('modifié des deux côtés, ou modifié sans historique de reprise : conflit à arbitrer', () => {
        expect(asanaStatus(B, C, A)).toBe('conflit');
        expect(asanaStatus(B, C, undefined)).toBe('conflit');
    });
});

describe('intervalles de dates des tâches Asana', () => {
    // Projet « SAMU 56 » : chaque activité porte un intervalle début → fin dans Asana
    const projet = () => [
        task("Démarrage projet auprès de l'ES", '', '2026-01-15', { gid: '1' }),
        task('2.9 Fin du cadrage', '2026-02-02', '2026-03-13', { gid: '2' }),
        task('Mise en service du bandeau', '', '2026-10-13', { gid: '3' }),
        task('Mise en production du bandeau', '', '2026-10-20', { gid: '4' }),
        task('5.1 Visite de site expert métier ANS', '2026-06-26', '2026-06-30', { gid: '5' }),
        task('5.9 VFT ANS', '2026-09-07', '2026-09-25', { gid: '6' }),
        task('6.3 Formation au bandeau de communication', '2026-09-14', '2026-10-09', { gid: '7' }),
        task('6.6 Accompagnement post démarrage', '2026-10-13', '2026-10-19', { gid: '8' }),
        task('Vérification des prérequis', '2026-06-01', '2026-06-12', { gid: '9' })
    ];

    it('chaque activité reprend début ET fin de sa tâche', () => {
        const c = asanaComputeTasks(projet(), '[SAMU 56] SF4');
        expect(c.found.cadrage).toEqual({ start: '2026-01-15', end: '2026-03-13' });
        expect(c.found.visite_metier).toEqual({ start: '2026-06-26', end: '2026-06-30' });
        expect(c.found.vft).toEqual({ start: '2026-09-07', end: '2026-09-25' });
        expect(c.found.accompagnement).toEqual({ start: '2026-10-13', end: '2026-10-19' });
        expect(c.found.test_prerequis).toEqual({ start: '2026-06-01', end: '2026-06-12' });
        expect(c.found.deploiement).toEqual({ start: '2026-03-14', end: '2026-10-13' });
    });

    it('formation : tâche 6.3.4 si elle est datée, sinon tâche 6.3 avec tout son intervalle', () => {
        const sans = asanaComputeTasks(projet(), '[SAMU 56] SF4');
        expect(sans.found.formation_utilisateurs).toEqual({ start: '2026-09-14', end: '2026-10-09' });
        const avec = asanaComputeTasks(
            [...projet(), task('6.3.4 Formation utilisateurs', '2026-09-14', '2026-09-18', { gid: '10' })],
            '[SAMU 56] SF4'
        );
        expect(avec.found.formation_utilisateurs).toEqual({ start: '2026-09-14', end: '2026-09-18' });
    });

    it('une tâche parente sans dates prend l’intervalle de ses sous-tâches', () => {
        const c = asanaComputeTasks(
            [
                ...projet().filter(t => !t.name.startsWith('5.9')),
                task('5.9 VFT ANS', '', '', { gid: '6' }),
                task('5.9.1 VFT jour 1', '2026-09-07', '2026-09-08', { parent: '5.9 VFT ANS' }),
                task('5.9.2 VFT jour 2', '2026-09-21', '2026-09-25', { parent: '5.9 VFT ANS' })
            ],
            '[SAMU 56] SF4'
        );
        expect(c.found.vft).toEqual({ start: '2026-09-07', end: '2026-09-25' });
    });

    it('remplacement manuel par une seule tâche : tout son intervalle est repris', () => {
        const compute = () => asanaComputeTasks(projet(), '[SAMU 56] SF4');
        // Début seul sur la tâche 6.3 (14/09 → 09/10) : la fin n'est plus celle de la règle automatique
        const c1 = asanaApplyOverrides(compute(), { vft: { start: '7' } });
        expect(c1.found.vft).toEqual({ start: '2026-09-14', end: '2026-10-09' });
        // Fin seule
        const c2 = asanaApplyOverrides(compute(), { vft: { end: '7' } });
        expect(c2.found.vft).toEqual({ start: '2026-09-14', end: '2026-10-09' });
        // Début et fin sur deux tâches : début de la première, fin de la seconde
        const c3 = asanaApplyOverrides(compute(), { vft: { start: '5', end: '8' } });
        expect(c3.found.vft).toEqual({ start: '2026-06-26', end: '2026-10-19' });
        // Tâche d'un seul jour : l'autre borne reste celle de la règle automatique
        const un = [...projet(), task('Atelier', '2026-09-10', '2026-09-10', { gid: '11' })];
        const c4 = asanaApplyOverrides(asanaComputeTasks(un, '[SAMU 56] SF4'), { vft: { start: '11' } });
        expect(c4.found.vft).toEqual({ start: '2026-09-10', end: '2026-09-25' });
    });
});

describe('activité Asana choisie dans l’administration', () => {
    const tasks = () => [
        task('5.1 Visite métier', '2027-03-01', '2027-03-02'),
        task('5.4 Visite complémentaire', '2027-03-08', '2027-03-09'),
        task('Visite OB sur site', '2027-03-10', '2027-03-11'),
        task('Démarrage projet auprès de l’ES', '', '2027-01-04')
    ];
    it('règle par défaut sans choix, tâche désignée par code ou par titre sinon', () => {
        try {
            asanaUseStageRules({});
            expect(asanaComputeTasks(tasks(), '[SAMU 25] SF4').found.visite_metier).toEqual({
                start: '2027-03-01',
                end: '2027-03-02'
            });
            asanaUseStageRules({ visite_metier: '5.4', vft: 'title:visite ob' });
            const c = asanaComputeTasks(tasks(), '[SAMU 25] SF4');
            expect(c.found.visite_metier).toEqual({ start: '2027-03-08', end: '2027-03-09' });
            expect(c.found.vft).toEqual({ start: '2027-03-10', end: '2027-03-11' });
        } finally {
            asanaUseStageRules({});
        }
    });
});

describe('projet Asana type', () => {
    it('tâches converties en choix : code de tâche, sinon titre normalisé, sans doublon', () => {
        const t = n => ({ name: n });
        expect(
            asanaTemplateChoices([t('5.1 Visite métier'), t('5.1. Autre'), t('Visite OB'), t('  '), t('2.9.1 Fin')])
        ).toEqual([
            { value: '5.1', label: '5.1 Visite métier' },
            { value: 'title:visite ob', label: 'Visite OB' },
            { value: '2.9.1', label: '2.9.1 Fin' }
        ]);
    });
});
