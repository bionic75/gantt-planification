// @ts-check
import fs from 'fs';
import path from 'path';
import { defineConfig } from '@playwright/test';
import { cucumberReporter, defineBddConfig } from 'playwright-bdd';
import { config, E2E_DIR } from './support/config.js';

// Scénarios Gherkin (features/) → tests Playwright générés dans .features-gen/ par « bddgen »
const testDir = defineBddConfig({
    features: 'features/**/*.feature',
    steps: ['steps/**/*.js', 'support/fixtures.js'],
    language: 'fr',
    tags: config.tags,
    outputDir: '.features-gen'
});

const suffixeRapport = process.env.E2E_RAPPORT ? `-${process.env.E2E_RAPPORT}` : '';

// Résultats Allure : écrits fichier par fichier, sans nettoyage par le reporter. Vidés au lancement (processus
// principal uniquement : la configuration est aussi chargée par chaque worker)
const resultatsAllure = `allure-results${suffixeRapport}`;
if (process.env.TEST_WORKER_INDEX === undefined)
    fs.rmSync(path.join(E2E_DIR, resultatsAllure), { recursive: true, force: true });

export default defineConfig({
    timeout: 180_000,
    expect: { timeout: 15_000 },
    // Un fichier de fonctionnalité par worker, scénarios d'un même fichier dans l'ordre
    fullyParallel: false,
    workers: config.workers,
    retries: 0,
    // E2E_RAPPORT : suffixe des dossiers de rapports (plusieurs exécutions successives, en CI par exemple)
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: `playwright-report${suffixeRapport}` }],
        cucumberReporter('html', { outputFile: `cucumber-report${suffixeRapport}/index.html` }),
        cucumberReporter('junit', {
            outputFile: `cucumber-report${suffixeRapport}/junit.xml`,
            suiteName: 'Planification e2e'
        }),
        ['monocart-reporter', { name: 'Planification e2e', outputFile: `monocart-report${suffixeRapport}/index.html` }],
        // Rapport HTML produit ensuite par « npm run report:allure » (Allure 3)
        [
            'allure-playwright',
            {
                resultsDir: resultatsAllure,
                suiteTitle: true,
                environmentInfo: { Application: config.baseUrl, 'Node.js': process.version }
            }
        ]
    ],
    use: {
        baseURL: config.baseUrl,
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        // Pas de traces en CI : elles enregistrent les requêtes réseau (cookies de session, mots de passe et codes
        // OTP compris). En local, conservées pour les scénarios en échec (« npx playwright show-trace »)
        trace: process.env.CI ? 'off' : 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 20_000,
        navigationTimeout: 30_000
    },
    projects: [
        // Connexions séquentielles des 4 profils (codes OTP lus un à un dans la boîte partagée)
        { name: 'authentification', testMatch: /auth\.setup\.js/, fullyParallel: false },
        { name: 'scenarios', testDir, dependencies: ['authentification'] }
    ]
});
