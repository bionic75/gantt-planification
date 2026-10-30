import { describe, expect, it } from 'vitest';
import type { CleApi } from '@/api/securite';
import { champsMfa, champsSmtp, dateCreation, derniereUtilisation, donneesSmtp } from './calculs';

describe('SMTP', () => {
    it('valeurs proposées par défaut, mot de passe jamais prérempli', () => {
        expect(champsSmtp({})).toEqual({ host: 'smtp.office365.com', port: '587', user: '', password: '' });
        expect(champsSmtp({ host: 'smtp.test', port: 25, user: 'robot@test', passwordSet: true })).toEqual({
            host: 'smtp.test',
            port: '25',
            user: 'robot@test',
            password: ''
        });
    });

    it('SSL sur le port 465, STARTTLS sinon', () => {
        const champs = { host: 'h', port: '465', user: 'u', password: 'p' };
        expect(donneesSmtp(champs, false)).toEqual({ host: 'h', port: 465, secure: true, user: 'u', password: 'p' });
        expect(donneesSmtp({ ...champs, port: '587' }, false)?.secure).toBe(false);
    });

    it('champs requis ; mot de passe vide accepté seulement s’il est déjà enregistré', () => {
        const champs = { host: 'h', port: '587', user: 'u', password: '' };
        expect(donneesSmtp(champs, false)).toBeNull();
        expect(donneesSmtp(champs, true)).toMatchObject({ password: '' });
        expect(donneesSmtp({ ...champs, user: '' }, true)).toBeNull();
        expect(donneesSmtp({ ...champs, port: 'x' }, true)).toBeNull();
    });
});

describe('double authentification', () => {
    it('valeurs par défaut de l’ancien écran pour une configuration absente', () => {
        expect(champsMfa(null)).toEqual({
            enabled: false,
            method: 'email',
            frequency: 'daily',
            profileAdmin: true,
            profileExpert: false,
            profileUser: false,
            codeValidity: 10
        });
    });

    it('configuration enregistrée reprise telle quelle', () => {
        const c = {
            enabled: true,
            method: 'totp',
            frequency: 'always',
            profileAdmin: false,
            profileExpert: true,
            profileUser: true,
            codeValidity: 30
        } as const;
        expect(champsMfa(c)).toEqual(c);
    });
});

describe("clés d'API", () => {
    const cle = (extra: Partial<CleApi>): CleApi => ({
        id: 1,
        label: 'Grist',
        key_prefix: 'ans_0123abcd...',
        created_at: null,
        last_used_at: null,
        revoked: 0,
        ...extra
    });

    it('dates en français, « Jamais » sans utilisation', () => {
        expect(dateCreation(cle({}))).toBe('—');
        expect(derniereUtilisation(cle({}))).toBe('Jamais');
        expect(dateCreation(cle({ created_at: '2026-10-30T10:00:00Z' }))).toBe('30/10/2026');
        expect(derniereUtilisation(cle({ last_used_at: '2026-10-30T10:00:00Z' }))).toMatch(/^30\/10\/2026 /);
    });
});
