// URL de connexion : DATABASE_URL, fichier SQLite, ou éléments de connexion (identifiants encodés)
import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '../src/config/database-url.js';

describe('resolveDatabaseUrl', () => {
    it('DATABASE_URL prioritaire', () => {
        expect(
            resolveDatabaseUrl({ DB_PROVIDER: 'postgresql', DATABASE_URL: 'postgresql://a@b/c', DB_HOST: 'x' })
        ).toBe('postgresql://a@b/c');
    });

    it('SQLite : fichier data.db du répertoire DB_PATH', () => {
        expect(resolveDatabaseUrl({ DB_PATH: './data' })).toBe(`file:${path.resolve('./data', 'data.db')}`);
    });

    it('PostgreSQL / MariaDB : URL construite, identifiants encodés, port par défaut', () => {
        const base = { DB_HOST: 'db.local', DB_NAME: 'planning', DB_USER: 'app', DB_PASSWORD: 'p@ss:w/rd#1' };
        expect(resolveDatabaseUrl({ ...base, DB_PROVIDER: 'postgresql' })).toBe(
            'postgresql://app:p%40ss%3Aw%2Frd%231@db.local:5432/planning'
        );
        expect(resolveDatabaseUrl({ ...base, DB_PROVIDER: 'mysql', DB_PORT: 3307 })).toBe(
            'mysql://app:p%40ss%3Aw%2Frd%231@db.local:3307/planning'
        );
        expect(resolveDatabaseUrl({ ...base, DB_PROVIDER: 'mysql', DB_PASSWORD: undefined })).toBe(
            'mysql://app@db.local:3306/planning'
        );
    });

    it('éléments incomplets : pas d’URL', () => {
        expect(
            resolveDatabaseUrl({ DB_PROVIDER: 'postgresql', DB_HOST: 'db.local', DB_NAME: 'planning' })
        ).toBeUndefined();
    });
});
