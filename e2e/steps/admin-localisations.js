// @ts-check
// Administration › Localisations : formulaire, liste (tri, sélection, suppression), import CSV et conflits
import { expect } from '@playwright/test';
import { adminApi, creerEvenement, creerLocalisation } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const section = (/** @type {Monde} */ monde) => monde.page.locator('#localisationAdminSection');
const tableau = (/** @type {Monde} */ monde) => monde.page.locator('#localisationsTableContainer');
const ligne = (/** @type {Monde} */ monde, /** @type {number} */ id) => monde.page.locator(`#locRow_${id}`);

/** Localisation supprimée en fin de scénario, d'après son libellé long (créée depuis l'écran) */
function nettoyerParLibelleLong(/** @type {Monde} */ monde, /** @type {string} */ libelle) {
    monde.aNettoyer(`localisation ${libelle}`, async () => {
        const api = await adminApi(monde);
        const { locations } = await api.ok('GET', '/api/locations');
        for (const l of locations.filter((/** @type {any} */ x) => x.libelle_long === libelle))
            await api.delete(`/api/locations/${l.id}`);
    });
}

const lireLocalisation = async (/** @type {Monde} */ monde, /** @type {number} */ id) =>
    (await (await adminApi(monde)).ok('GET', '/api/locations')).locations.find((/** @type {any} */ l) => l.id === id);

Given('une seconde localisation SAMU de test existe', async ({ monde }) => {
    monde.d.localisation2 = await creerLocalisation(monde, { geo: false });
});

Given("l'administrateur a créé un événement sur la localisation de test le {string}", async ({ monde }, date) => {
    await creerEvenement(monde, { startDate: date, location_id: monde.d.localisation.id });
});

When("j'ouvre la section « Localisation » de l'administration", async ({ monde }) => {
    const page = monde.page;
    await page
        .locator('#mainTabsContainer button.tab-btn[data-tab="admin"]')
        .evaluate(b => /** @type {HTMLElement} */ (b).click());
    await expect(page.locator('#admin.tab-content')).toHaveClass(/active/);
    if (!(await section(monde).isVisible()))
        await page.locator('#admin h3', { hasText: /^\s*[▶▼]?\s*Localisation\s*$/ }).click();
    await expect(section(monde)).toBeVisible();
});

// ---------- Formulaire ----------

When("j'ouvre le formulaire de localisation", async ({ monde }) => {
    await section(monde).getByText('Ajouter une localisation').click();
    await expect(monde.page.locator('#localisationFormBody')).toBeVisible();
});

When(
    'je saisis la localisation {string}, {string}, {string} aux coordonnées {string}, {string}',
    async ({ monde }, long, court, adresse, lat, lng) => {
        const page = monde.page;
        nettoyerParLibelleLong(monde, long.toUpperCase());
        await page.locator('#locLong').fill(long);
        await page.locator('#locCourt').fill(court);
        await page.locator('#locAdresse').fill(adresse);
        await page.locator('#locLat').fill(lat);
        await page.locator('#locLng').fill(lng);
    }
);

When("j'enregistre la localisation", async ({ monde }) => {
    await monde.page
        .locator('#localisationFormBody')
        .getByRole('button', { name: /Enregistrer/ })
        .click();
});

Then('le formulaire de localisation est replié', async ({ monde }) => {
    await expect(monde.page.locator('#localisationFormBody')).toBeHidden();
});

When("j'ouvre la liste des localisations", async ({ monde }) => {
    const liste = monde.page.locator('#locListSub');
    if (!(await liste.isVisible())) await section(monde).getByText('Liste des localisations renseignées').click();
    await expect(tableau(monde).locator('table')).toBeVisible();
});

/** Cellules d'une ligne (case à cocher et actions comprises) */
const cellules = async (/** @type {import('@playwright/test').Locator} */ tr) =>
    (await tr.locator('td').allTextContents()).map(t => t.trim());

Then(
    'la liste des localisations présente {string} avec {string}, {string}, {string} et {string}',
    async ({ monde }, long, court, adresse, lat, lng) => {
        const liste = monde.page.locator('#locListSub');
        if (!(await liste.isVisible())) await section(monde).getByText('Liste des localisations renseignées').click();
        const tr = tableau(monde).locator('tbody tr').filter({ hasText: long });
        await expect(tr).toHaveCount(1);
        expect((await cellules(tr)).slice(1, 6)).toEqual([long, court, adresse, lat, lng]);
    }
);

When('je modifie la localisation de test depuis la liste', async ({ monde }) => {
    // Actions de la ligne : modifier, puis supprimer
    await ligne(monde, monde.d.localisation.id).getByRole('button').nth(0).click();
});

Then('le formulaire « Modifier la localisation » présente la localisation de test', async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#localisationFormBody')).toBeVisible();
    await expect(section(monde).getByText('Modifier la localisation')).toBeVisible();
    await expect(page.locator('#locLong')).toHaveValue(monde.d.localisation.long);
    await expect(page.locator('#locCourt')).toHaveValue(monde.d.localisation.court);
});

When("je change son libellé court en {string} et l'enregistre", async ({ monde }, court) => {
    await monde.page.locator('#locCourt').fill(court);
    await monde.page
        .locator('#localisationFormBody')
        .getByRole('button', { name: /Enregistrer/ })
        .click();
});

Then(
    'la liste des localisations présente la localisation de test avec le libellé court {string}',
    async ({ monde }, court) => {
        await expect(ligne(monde, monde.d.localisation.id).locator('td').nth(2)).toHaveText(court);
        expect((await lireLocalisation(monde, monde.d.localisation.id)).libelle_court).toBe(court);
    }
);

// ---------- Tri ----------

When('je trie la liste des localisations par {string}', async ({ monde }, colonne) => {
    await tableau(monde).locator('thead th', { hasText: colonne }).click();
});

Then(
    /^la liste des localisations est triée par libellé court dans l'ordre (croissant|décroissant)$/,
    async ({ monde }, ordre) => {
        await expect(async () => {
            const valeurs = (await tableau(monde).locator('tbody tr td:nth-child(3)').allTextContents()).map(t =>
                t.trim()
            );
            const attendu = [...valeurs].sort((a, b) => a.localeCompare(b, 'fr'));
            if (ordre === 'décroissant') attendu.reverse();
            expect(valeurs).toEqual(attendu);
        }).toPass({ timeout: 5000 });
    }
);

// ---------- Suppression ----------

When('je supprime la localisation de test depuis la liste et je confirme', async ({ monde }) => {
    monde.d.confirmation = await confirmer(monde, () =>
        ligne(monde, monde.d.localisation.id).getByRole('button').nth(1).click()
    );
});

Then('la confirmation signalait {string}', async ({ monde }, texte) => {
    expect(monde.d.confirmation).toContain(texte);
});

Then('la confirmation signalait {string} et {string}', async ({ monde }, a, b) => {
    expect(monde.d.confirmation).toContain(a);
    expect(monde.d.confirmation).toContain(b);
});

Then("la localisation de test n'est plus dans la liste", async ({ monde }) => {
    await expect(ligne(monde, monde.d.localisation.id)).toHaveCount(0);
});

Then("l'import des localisations affiche {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#locImportStatus')).toContainText(texte);
});

When('je sélectionne les deux localisations de test', async ({ monde }) => {
    for (const l of [monde.d.localisation, monde.d.localisation2])
        await ligne(monde, l.id).getByRole('checkbox').check();
});

Then('le bouton « Supprimer la sélection \\(2) » est proposé', async ({ monde }) => {
    await expect(tableau(monde).getByRole('button', { name: /Supprimer la sélection \(2\)/ })).toBeVisible();
});

When('je supprime la sélection et je confirme', async ({ monde }) => {
    monde.d.confirmation = await confirmer(monde, () =>
        tableau(monde)
            .getByRole('button', { name: /Supprimer la sélection/ })
            .click()
    );
});

Then('les deux localisations de test ne sont plus dans la liste', async ({ monde }) => {
    for (const l of [monde.d.localisation, monde.d.localisation2]) await expect(ligne(monde, l.id)).toHaveCount(0);
});

// ---------- Import CSV ----------

When(
    "j'importe un fichier CSV modifiant la localisation de test et ajoutant une nouvelle localisation",
    async ({ monde }) => {
        const page = monde.page;
        const l = monde.d.localisation;
        const nouvelle = `${monde.unique('E2E CSV')}`.toUpperCase();
        monde.d.nouvelleCsv = nouvelle;
        nettoyerParLibelleLong(monde, nouvelle);
        const csv = [
            'libelle_long;libelle_court;adresse;latitude;longitude',
            `${l.long};ZCSV;2 rue du csv, paris;48,86;2,36`,
            `${nouvelle};ZNEW;3 rue du csv, paris;48.87;2.37`
        ].join('\n');
        await page.locator('#locCsvFile').setInputFiles({
            name: 'localisations.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csv, 'utf8')
        });
        await section(monde)
            .getByRole('button', { name: /Importer$/ })
            .click();
    }
);

const conflits = (/** @type {Monde} */ monde) => monde.page.locator('#locConflictModal');

Then("les conflits d'import présentent la localisation de test avec des données différentes", async ({ monde }) => {
    await expect(conflits(monde)).toBeVisible();
    await expect(conflits(monde)).toContainText("Conflits détectés lors de l'import");
    await expect(conflits(monde)).toContainText(monde.d.localisation.long);
    await expect(conflits(monde)).toContainText('Données différentes');
});

When("je choisis d'écraser avec le CSV et j'applique les choix", async ({ monde }) => {
    await conflits(monde).getByLabel('Écraser avec le CSV').first().check();
    await conflits(monde)
        .getByRole('button', { name: /Appliquer les choix/ })
        .click();
});

Then('la localisation de test a les données du fichier CSV', async ({ monde }) => {
    await expect
        .poll(async () => {
            const l = await lireLocalisation(monde, monde.d.localisation.id);
            return [l.libelle_court, l.adresse, l.latitude, l.longitude];
        })
        .toEqual(['ZCSV', '2 RUE DU CSV, PARIS', 48.86, 2.36]);
});

Then('la nouvelle localisation du fichier CSV existe', async ({ monde }) => {
    const { locations } = await (await adminApi(monde)).ok('GET', '/api/locations');
    expect(locations.find((/** @type {any} */ l) => l.libelle_long === monde.d.nouvelleCsv)).toMatchObject({
        libelle_court: 'ZNEW',
        latitude: 48.87,
        longitude: 2.37
    });
});
