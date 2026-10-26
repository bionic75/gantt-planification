import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// Code historique repris tel quel (calculs, formats de fichiers, services externes) : les erreurs réelles
// (variables non définies…) restent bloquantes, les règles de style sont assouplies.
const LEGACY_CODE = [
    'src/modules/affectation/asana.service.js',
    'src/modules/affectation/export.service.js',
    'src/modules/poi/poi.external.js',
    'src/lib/ics.js',
    'src/jobs/**'
];

export default [
    {
        ignores: [
            'node_modules/**',
            'data/**',
            'coverage/**',
            'src/generated/**',
            'e2e/node_modules/**',
            'e2e/.features-gen/**',
            'e2e/playwright-report*/**',
            'e2e/test-results/**',
            'e2e/cucumber-report*/**',
            'e2e/monocart-report*/**',
            'e2e/allure-results*/**',
            'e2e/allure-report/**'
        ]
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
    {
        // Frontend : scripts classiques d'une même page, qui partagent leur portée globale (fonctions appelées
        // depuis un autre fichier ou depuis les attributs onclick= du HTML) : variables non définies ou non
        // utilisées ne sont pas détectables fichier par fichier.
        files: ['public/js/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: { ...globals.browser, L: 'readonly', XLSX: 'readonly' }
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'no-redeclare': 'off',
            'no-var': 'off',
            'prefer-const': 'off',
            eqeqeq: 'off',
            'no-restricted-globals': 'off',
            // Code historique : règles de style signalées sans bloquer
            'no-empty': 'warn',
            'no-useless-escape': 'warn',
            'no-useless-assignment': 'warn',
            'no-irregular-whitespace': 'warn'
        }
    },
    {
        // Tests d'interface : fonctions exécutées dans la page (Puppeteer, Playwright)
        files: ['tests/ui.test.js', 'e2e/**/*.js'],
        languageOptions: { globals: globals.browser }
    },
    prettier
];
