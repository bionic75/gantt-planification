// @ts-check
// Fixture « monde » et fonctions de définition des étapes (Given / When / Then en français dans les scénarios)
import { test as base, createBdd } from 'playwright-bdd';
import { Monde } from './monde.js';

export const test = base.extend(
    /** @type {{ monde: Monde }} */ ({
        monde: async ({ browser, $testInfo }, use) => {
            const monde = new Monde({ browser, testInfo: $testInfo });
            await use(monde);
            if (monde.dialogues.length) await $testInfo.attach('dialogues', { body: monde.dialogues.join('\n') });
            if (monde.problemes.length) await $testInfo.attach('problemes', { body: monde.problemes.join('\n') });
            await monde.fermer();
            // Politique de sécurité du contenu (lots 6.5 et 6.6) : aucune violation tolérée, quelle que soit l'étape
            const csp = monde.problemes.filter(p => p.startsWith('CSP'));
            if (csp.length) throw new Error(`Violations de la politique de sécurité du contenu :\n${csp.join('\n')}`);
        }
    })
);

export const { Given, When, Then, BeforeScenario, AfterScenario } = createBdd(test);
