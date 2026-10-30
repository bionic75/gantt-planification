import { describe, expect, it } from 'vitest';
import type { AnalyseDump } from '@/api/parametrages';
import {
    champsThemes,
    configThemes,
    etatTheme,
    inactivite,
    lignesTables,
    messagePublication,
    messageRestauration,
    niveauVersion,
    notesColonnes,
    octets
} from './calculs';

describe('inactivité et aide', () => {
    it('délai de 15 minutes par défaut', () => {
        expect(inactivite({})).toEqual({ active: false, minutes: '15' });
        expect(inactivite({ inactivity_enabled: 'true', inactivity_timeout: '30' })).toEqual({
            active: true,
            minutes: '30'
        });
    });

    it('message de publication des nouveautés', () => {
        expect(messagePublication(true, 'v2.2.0')).toBe(
            "Publication activée pour la version v2.2.0.\nLa popup s'affichera à la prochaine connexion de chaque utilisateur."
        );
        expect(messagePublication(false, 'v2.2.0')).toBe('Publication désactivée.');
    });
});

describe('dump', () => {
    it('tailles lisibles', () => {
        expect(octets(undefined)).toBe('—');
        expect(octets(512)).toBe('512 o');
        expect(octets(2048)).toBe('2.0 Ko');
        expect(octets(3 * 1048576)).toBe('3.0 Mo');
        expect(octets(2 * 1073741824)).toBe('2.00 Go');
    });

    it('version : identique, plus récente ou plus ancienne', () => {
        expect([0, 1, -1].map(niveauVersion)).toEqual(['identique', 'recente', 'ancienne']);
    });

    const analyse = {
        manifest: { tables: { users: 4, cra: 2, ancienne: 1 } },
        current: { tables: { users: 4, cra: 3, nouvelle: 0 } },
        schemaDiff: { columnsIgnored: { users: ['x'] }, columnsDefaulted: { cra: ['y', 'z'] } }
    } as unknown as AnalyseDump;

    it('tables triées, écarts et tables absentes signalés', () => {
        expect(lignesTables(analyse)).toEqual([
            { table: 'ancienne', dump: 1, actuel: undefined, note: 'inconnue localement (ignorée)', ecart: true },
            { table: 'cra', dump: 2, actuel: 3, note: '', ecart: true },
            { table: 'nouvelle', dump: undefined, actuel: 0, note: 'absente du dump (sera vidée)', ecart: true },
            { table: 'users', dump: 4, actuel: 4, note: '', ecart: false }
        ]);
        expect(notesColonnes(analyse)).toEqual([
            'users : colonnes ignorées (x)',
            'cra : colonnes à valeur par défaut (y, z)'
        ]);
    });

    it('message de fin de restauration', () => {
        expect(
            messageRestauration({ durationMs: 2500, rows: 10, tables: 3, pdfs: 1, safetyBackup: 'sauvegarde.db' })
        ).toContain(
            '✅ Restauration terminée en 2.5 s\n\n10 lignes dans 3 tables, 1 PDF.\nSauvegarde de sécurité : sauvegarde.db'
        );
    });
});

describe('thèmes', () => {
    it('valeurs par défaut de l’ancien écran', () => {
        const c = champsThemes({}, 2026);
        expect(c).toMatchObject({ mode: 'off', force: 'noel', intensite: 'sobre' });
        expect(c.themes.noel).toEqual({ auto: true, debut: '2026-01-01', fin: '2026-01-01', avant: 7, apres: 1 });
    });

    it('aller-retour : dates réduites à « MM-JJ », jours autour de Pâques', () => {
        const config = {
            mode: 'auto' as const,
            forced: 'halloween',
            intensity: 'anime' as const,
            themes: {
                halloween: { auto: true, start: '10-20', end: '11-02' },
                noel: { auto: false, start: '12-01', end: '01-06' },
                saintvalentin: { auto: true, start: '02-10', end: '02-15' },
                saintpatrick: { auto: true, start: '03-15', end: '03-18' },
                paques: { auto: true, before: 5, after: 2 },
                vacances: { auto: true, start: '07-01', end: '08-31' }
            }
        };
        expect(configThemes(champsThemes(config, 2026))).toEqual(config);
    });

    it('état du thème affiché', () => {
        expect(etatTheme(null, id => id)).toBe('Aucun thème affiché actuellement.');
        expect(etatTheme({ id: 'noel', reason: 'forcé' }, () => 'Noël')).toBe(
            'Thème affiché actuellement : Noël (forcé)'
        );
    });
});
