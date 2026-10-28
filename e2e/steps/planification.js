// @ts-check
// Planification : saisie d'une demi-journée, semaines ISO, lignes masquables, navigation, conflits d'affectation
import { expect } from '@playwright/test';
import {
    adminApi,
    cle,
    creerDeploiement,
    creerRessource,
    lireDeploiement,
    moisCourantParis,
    nettoyerMoisExpert,
    ressourceExpert
} from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Page} Page */

const MOIS = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre'
];

// ---------- Saisie d'une demi-journée ----------

Given("la ressource de l'expert de test est connue", async ({ monde }) => {
    monde.d.expert = await ressourceExpert(monde);
});

Given(
    "la demi-journée du {string} matin de l'expert de test sera remise en état après le scénario",
    async ({ monde }, date) => {
        const [annee, mois] = date.split('-').map(Number);
        await nettoyerMoisExpert(monde, annee, mois - 1);
    }
);

When(
    '{string} enregistre pour lui-même le {string} matin : disponibilité {string}, affectation {string}, SAMU {string}',
    async ({ monde }, profil, date, dispo, affectation, samu) => {
        const { resourceId } = await ressourceExpert(monde);
        const api = await monde.apiDe(profil);
        monde.d.saisiePlanning = {
            [cle(resourceId, 'available', date, 'AM')]: dispo,
            [cle(resourceId, 'activity', date, 'AM')]: affectation,
            [cle(resourceId, 'localisation', date, 'AM')]: samu
        };
        monde.reponse = await api.post('/api/schedule', monde.d.saisiePlanning);
        expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
    }
);

Then(
    "la planification de l'expert de test contient pour le {string} matin la disponibilité {string} et l'affectation {string}",
    async ({ monde }, date, dispo, affectation) => {
        const { resourceId } = await ressourceExpert(monde);
        const planning = await (await adminApi(monde)).ok('GET', '/api/schedule');
        expect(planning[cle(resourceId, 'available', date, 'AM')]).toBe(dispo);
        expect(planning[cle(resourceId, 'activity', date, 'AM')]).toBe(affectation);
    }
);

Then('{string} voit la même saisie dans la planification', async ({ monde }, profil) => {
    const planning = await (await monde.apiDe(profil)).ok('GET', '/api/schedule');
    for (const [k, v] of Object.entries(monde.d.saisiePlanning)) expect(planning[k], k).toBe(v);
});

// ---------- Grille ----------

async function ongletPlanification(/** @type {Page} */ page) {
    const contenu = page.locator('#planning.tab-content');
    if (!(await contenu.evaluate(e => e.classList.contains('active')))) {
        await page
            .locator('#mainTabsContainer button.tab-btn[data-tab="planning"]')
            .evaluate(b => /** @type {HTMLElement} */ (b).click());
    }
    // Section « Planification » dépliée
    if (!(await page.locator('#ganttDisplaySection').isVisible())) {
        await page.locator('#planning h3', { hasText: 'Planification' }).first().click();
    }
    await expect(page.locator('#ganttBody tr').first()).toBeAttached({ timeout: 20000 });
}

When("j'affiche le mois de {string} dans la planification", async ({ monde }, libelle) => {
    const page = monde.page;
    await ongletPlanification(page);
    const [nomMois, annee] = libelle.split(' ');
    const mois = MOIS.indexOf(nomMois.toLowerCase());
    expect(mois, `mois inconnu : ${nomMois}`).toBeGreaterThanOrEqual(0);
    // Sélecteurs d'année et de mois dans la section repliable « Options d'affichage »
    if (!(await page.locator('#planningControlsSection').isVisible())) {
        await page.locator('#planning h3', { hasText: "Options d'affichage" }).click();
    }
    await page.locator('#yearSelect').selectOption(annee);
    // Le changement de mois redessine la grille
    await page.locator('#monthSelect').selectOption(String(mois));
});

Then('les en-têtes de semaine sont {string}', async ({ monde }, attendu) => {
    // Assertion réessayée : la grille du mois choisi peut être encore en cours d'affichage
    await expect(monde.page.locator('#planning th.week-number-header')).toHaveText(attendu.split(', '));
});

const ligneExpert = (/** @type {Page} */ page, /** @type {string} */ id) =>
    page.locator(`#ganttBody tr[data-hide-id="${id}"]`);

When("je masque la première ligne d'expert avec le bouton \\(−\\)", async ({ monde }) => {
    const page = monde.page;
    await ongletPlanification(page);
    // Lignes masquées lors d'un scénario précédent (préférence mémorisée dans le navigateur) : affichage d'origine
    if (await page.locator('#ganttHiddenWrap').isVisible()) {
        await ouvrirLignesMasquees(page);
        await page.locator('#ganttHiddenPop .ghp-all').click();
    }
    // Hors ressources temporaires (« E2E-… ») des scénarios exécutés en parallèle : elles peuvent disparaître
    const lignes = page.locator('#ganttBody tr[data-resource-id]:not(.gantt-row-hidden):not([data-hide-name^="E2E-"])');
    expect(await lignes.count(), 'aucun expert dans la planification').toBeGreaterThan(0);
    const premiere = lignes.first();
    monde.d.ligneMasquee = {
        id: await premiere.getAttribute('data-hide-id'),
        nom: await premiere.getAttribute('data-hide-name')
    };
    monde.d.secondeLigne = (await lignes.count()) > 1 ? await lignes.nth(1).getAttribute('data-hide-id') : null;
    await premiere.locator('.gantt-hide-btn').click();
});

When('je masque la ligne des congés scolaires et événements', async ({ monde, $test }) => {
    const page = monde.page;
    const conges = ligneExpert(page, '-1');
    // Ligne présente seulement s'il existe des congés ou dates particulières sur le mois : à défaut, second expert
    const id = (await conges.count()) ? '-1' : monde.d.secondeLigne;
    $test.skip(!id, 'Ni ligne des congés ni second expert dans la planification du mois');
    if (id !== '-1')
        monde.testInfo.annotations.push({
            type: 'info',
            description: 'ligne des congés absente : second expert masqué'
        });
    await ligneExpert(page, id).locator('.gantt-hide-btn').click();
});

Then("cette ligne d'expert n'est plus affichée", async ({ monde }) => {
    await expect(ligneExpert(monde.page, monde.d.ligneMasquee.id)).toBeHidden();
});

Then("cette ligne d'expert est de nouveau affichée", async ({ monde }) => {
    await expect(ligneExpert(monde.page, monde.d.ligneMasquee.id)).toBeVisible();
});

Then('le compteur indique {string}', async ({ monde }, texte) => {
    await ongletPlanification(monde.page);
    await expect(monde.page.locator('#ganttHiddenCount')).toHaveText(texte);
});

const ouvrirLignesMasquees = async (/** @type {Page} */ page) => {
    if (!(await page.locator('#ganttHiddenPop').isVisible())) await page.locator('#ganttHiddenBtn').click();
    await expect(page.locator('#ganttHiddenPop')).toBeVisible();
};

When("je rétablis la ligne d'expert depuis la liste des lignes masquées", async ({ monde }) => {
    const page = monde.page;
    await ouvrirLignesMasquees(page);
    await page.locator('#ganttHiddenPop .ghp-row', { hasText: monde.d.ligneMasquee.nom }).locator('.ghp-show').click();
});

When("je rétablis l'affichage d'origine", async ({ monde }) => {
    const page = monde.page;
    await ouvrirLignesMasquees(page);
    await page.locator('#ganttHiddenPop .ghp-all').click();
});

Then("aucune ligne n'est masquée", async ({ monde }) => {
    await expect(monde.page.locator('#ganttBody tr.gantt-row-hidden')).toHaveCount(0);
    await expect(monde.page.locator('#ganttHiddenWrap')).toBeHidden();
});

When('je navigue de {int} mois en avant puis de {int} mois en arrière', async ({ monde }, avant, arriere) => {
    const page = monde.page;
    await ongletPlanification(page);
    // Mois affiché (année × 12 + mois) : chaque clic est attendu avant le suivant, la grille se redessinant
    const moisAffiche = async () =>
        Number(await page.locator('#yearSelect').inputValue()) * 12 +
        Number(await page.locator('#monthSelect').inputValue());
    const naviguer = async (/** @type {string} */ libelle, /** @type {number} */ sens) => {
        const avantClic = await moisAffiche();
        await page.locator('#ganttHeaderButtons button', { hasText: libelle }).click();
        await expect.poll(moisAffiche, { message: `navigation « ${libelle} »` }).toBe(avantClic + sens);
    };
    for (let i = 0; i < avant; i++) await naviguer('Mois suivant', 1);
    for (let i = 0; i < arriere; i++) await naviguer('Mois précédent', -1);
});

Then('la grille affiche le mois courant', async ({ monde }) => {
    const { annee, mois } = moisCourantParis();
    await expect(monde.page.locator('#monthSelect')).toHaveValue(String(mois - 1));
    await expect(monde.page.locator('#yearSelect')).toHaveValue(String(annee));
});

Then("toutes les lignes d'expert ont le même nombre de cellules", async ({ monde }) => {
    // Lecture réessayée : la grille peut être en cours de réaffichage après la navigation
    await expect
        .poll(
            async () => {
                const comptes = await monde.page
                    .locator('#ganttBody tr[data-resource-id]')
                    .evaluateAll(trs => trs.map(tr => tr.querySelectorAll(':scope > td').length));
                return comptes.length > 0 && new Set(comptes).size === 1;
            },
            { message: "nombre de cellules différent d'une ligne d'expert à l'autre" }
        )
        .toBe(true);
});

// ---------- Déploiement et conflit d'affectation ----------

Given(
    'un déploiement de test avec une visite métier du {string} au {string} pour {int} ressource(s) existe',
    async ({ monde }, debut, fin, needed) => {
        await creerDeploiement(monde, { visite: [debut, fin], needed });
    }
);

Given('une ressource de test est déjà affectée au {string} le {string} matin', async ({ monde }, samu, date) => {
    const r = await creerRessource(monde);
    monde.d.ressource = r;
    await (
        await adminApi(monde)
    ).ok('POST', '/api/schedule', {
        [cle(r.id, 'available', date, 'AM')]: '2',
        [cle(r.id, 'activity', date, 'AM')]: '3',
        [cle(r.id, 'localisation', date, 'AM')]: `🚨 ${samu}`
    });
});

When("l'administrateur affecte cette ressource à la visite métier du déploiement", async ({ monde }) => {
    const api = await adminApi(monde);
    monde.reponse = await api.put(`/api/affectation/projects/${monde.d.deploiement.id}/assignments/visite_metier`, {
        resource_ids: [monde.d.ressource.id]
    });
});

Then("la ressource n'est pas affectée au déploiement", async ({ monde }) => {
    const dep = await lireDeploiement(monde, monde.d.deploiement.id);
    expect(dep.assignments?.visite_metier || []).not.toContain(monde.d.ressource.id);
});
