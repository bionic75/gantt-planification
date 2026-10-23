import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// Code historique, repris à l'identique en phase 1 : réécrit (contrôleurs / services, Prisma) en phase 2.
// Les erreurs réelles (variables non définies…) restent bloquantes, les règles de style sont assouplies.
const LEGACY_CODE = [
    'server.js',
    'db-dump.js',
    'email-worker.js',
    'src/modules/affectation/**',
    'src/modules/admin/**',
    'src/modules/astreintes/**',
    'src/modules/automations/**',
    'src/modules/calendar/**',
    'src/modules/cra/**',
    'src/modules/deplacements/**',
    'src/modules/events/**',
    'src/modules/locations/**',
    'src/modules/logs/**',
    'src/modules/notifications/**',
    'src/modules/poi/**',
    'src/modules/public-api/**',
    'src/modules/reporting/**',
    'src/lib/ics.js',
    'src/jobs/**'
];

export default [
    {
        // Frontend : sera traité lors de l'extraction du JavaScript de index.html (phase 5)
        ignores: ['node_modules/**', 'public/**', 'data/**', 'coverage/**']
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            // Globales Node en ESM : __dirname / require n'existent pas et sont signalés
            globals: { ...globals.nodeBuiltin }
        },
        rules: {
            // La globale Web Crypto n'a ni randomBytes ni createHash : importer le module Node
            'no-restricted-globals': [
                'error',
                { name: 'crypto', message: "Importer le module Node : import crypto from 'crypto'" }
            ],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    },
    {
        files: LEGACY_CODE,
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-empty': 'warn',
            eqeqeq: 'warn',
            'prefer-const': 'warn',
            'no-useless-assignment': 'warn',
            'no-useless-escape': 'warn',
            'no-control-regex': 'warn',
            'no-irregular-whitespace': 'warn',
            'preserve-caught-error': 'warn'
        }
    },
    prettier
];
