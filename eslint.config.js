import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

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
            globals: { ...globals.node }
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    },
    {
        // Code historique en cours de découpage : règles de style assouplies, les erreurs réelles restent bloquantes
        files: ['server.js', 'db-dump.js', 'email-worker.js'],
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
