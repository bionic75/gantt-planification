// @ts-check
// Ressources › liste et ajout (écran) : colonnes, tri, bascules du tableau, suppression, export, trigramme proposé,
// expert principal / secondaire sur des SAMU, profil RH
import { expect } from '@playwright/test';
import { adminApi, creerLocalisation, lireRessource, ressourceParNom } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const tableau = (/** @type {Monde} */ monde) => monde.page.locator('#resourcesTable');
const ligneRessource = (/** @type {Monde} */ monde) =>
    tableau(monde).locator('tbody tr', { hasText: monde.d.ressource.nom });

/** Colonnes de la liste (index à partir de 1, pour :nth-child) */
const COLONNES = /** @type {Record<string, number>} */ ({ Nom: 1, Trigramme: 3, 'Taux MAD': 4, Statut: 12 });

Given(
    'la ressource est expert principal sur {string} et expert secondaire sur {string}',
    async ({ monde }, principal, secondaire) => {
        await (
            await adminApi(monde)
        ).ok('PUT', `/api/resources/${monde.d.ressource.id}/samu-assignments`, {
            principal: [principal],
            secondaire: [secondaire]
        });
    }
);

// ---------- Liste ----------

Then(
    'la ligne de la ressource présente son trigramme, le taux {string} et le statut {string}',
    async ({ monde }, taux, statut) => {
        const ligne = ligneRessource(monde);
        await expect(ligne).toHaveCount(1);
        await expect(ligne.locator(`td:nth-child(${COLONNES.Trigramme})`)).toHaveText(monde.d.ressource.trigramme);
        await expect(ligne.locator(`td:nth-child(${COLONNES['Taux MAD']})`)).toHaveText(taux);
        await expect(ligne.locator(`td:nth-child(${COLONNES.Statut})`)).toHaveText(statut);
    }
);

Then(
    'la ligne de la ressource présente {string} en principal et {string} en secondaire',
    async ({ monde }, principal, secondaire) => {
        const ligne = ligneRessource(monde);
        await expect(ligne.locator('td:nth-child(6)')).toContainText(principal);
        await expect(ligne.locator('td:nth-child(7)')).toContainText(secondaire);
    }
);

When('je trie la liste des ressources par {string}', async ({ monde }, colonne) => {
    await tableau(monde).locator('thead th', { hasText: colonne }).first().click();
});

/** Ordre de l'ancien écran : texte des cellules en minuscules, nombres comparés comme des nombres */
function compare(/** @type {string} */ a, /** @type {string} */ b) {
    if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
    return a.localeCompare(b);
}

Then('la colonne {string} de la liste des ressources est triée par ordre {word}', async ({ monde }, colonne, ordre) => {
    const cellules = tableau(monde).locator(`tbody tr td:nth-child(${COLONNES[colonne]})`);
    await expect(cellules.first()).toBeVisible();
    await expect
        .poll(async () => {
            const textes = (await cellules.allTextContents()).map(t => t.toLowerCase().trim());
            const attendu = [...textes].sort(compare);
            if (ordre === 'décroissant') attendu.reverse();
            return JSON.stringify(textes) === JSON.stringify(attendu);
        })
        .toBe(true);
});

When('je désactive la ressource depuis la liste', async ({ monde }) => {
    // Interrupteur « Actif » : libellé de la dernière case de la ligne (case masquée sous le curseur)
    await ligneRessource(monde)
        .locator('label')
        .filter({ has: monde.page.getByRole('checkbox') })
        .last()
        .click();
});

Then('la ressource est inactive', async ({ monde }) => {
    await expect.poll(async () => (await lireRessource(monde, monde.d.ressource.id))?.actif).toBe(0);
});

When("je coche l'astreinte {string} de la ressource dans la liste", async ({ monde }, type) => {
    await ligneRessource(monde)
        .getByRole('checkbox', { name: new RegExp(`^Astreintes ${type}\\b`) })
        .check();
});

Then('la ressource participe aux astreintes {string}', async ({ monde }, type) => {
    const champ = /** @type {Record<string, string>} */ ({
        HO: 'astreinte_ho',
        HNO: 'astreinte_volontaire',
        APD: 'astreinte_apd'
    })[type];
    await expect.poll(async () => (await lireRessource(monde, monde.d.ressource.id))?.[champ]).toBe(1);
});

const boutonSupprimer = (/** @type {Monde} */ monde) =>
    ligneRessource(monde).getByRole('button', { name: 'Supprimer la ressource' });

When('je supprime la ressource depuis la liste et je refuse la confirmation', async ({ monde }) => {
    const texte = await annulerConfirmation(monde, () => boutonSupprimer(monde).click());
    expect(texte).toContain('Confirmer la suppression ?');
});

When('je supprime la ressource depuis la liste et je confirme', async ({ monde }) => {
    await confirmer(monde, () => boutonSupprimer(monde).click());
});

Then('la ressource existe toujours', async ({ monde }) => {
    expect(await lireRessource(monde, monde.d.ressource.id)).toBeTruthy();
    await expect(ligneRessource(monde)).toHaveCount(1);
});

Then("la ressource n'existe plus et n'est plus listée", async ({ monde }) => {
    await expect.poll(() => lireRessource(monde, monde.d.ressource.id)).toBeUndefined();
    await expect(ligneRessource(monde)).toHaveCount(0);
});

Then("le bouton {string} télécharge l'export des ressources", async ({ monde }, libelle) => {
    const page = monde.page;
    const [telechargement] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.tab-content.active').getByRole('button', { name: libelle }).click()
    ]);
    // Fichier CSV malgré le libellé « Excel » du bouton (ancien écran, conservé)
    expect(telechargement.suggestedFilename()).toMatch(/^resources_.+\.csv$/);
});

// ---------- Ajout ----------

When('je saisis le nom {string} et le prénom {string}', async ({ monde }, nom, prenom) => {
    const page = monde.page;
    await page.locator('#nom').fill(nom);
    await page.locator('#nom').blur();
    await page.locator('#prenom').fill(prenom);
    await page.locator('#prenom').blur();
});

Then('le prénom devient {string} et le trigramme proposé est {string}', async ({ monde }, prenom, trigramme) => {
    await expect(monde.page.locator('#prenom')).toHaveValue(prenom);
    await expect(monde.page.locator('#trigramme')).toHaveValue(trigramme);
});

Given('deux SAMU de test existent', async ({ monde }) => {
    monde.d.samus = [
        (await creerLocalisation(monde, { geo: false })).court,
        (await creerLocalisation(monde, { geo: false })).court
    ];
});

/** Choix d'un SAMU dans la saisie avec suggestions (expert principal ou secondaire) */
async function choisirSamu(/** @type {Monde} */ monde, /** @type {string} */ role, /** @type {string} */ samu) {
    const page = monde.page;
    await page.locator(`#samuInput_add_${role}`).fill(samu);
    await page.locator(`#samuDropdown_add_${role}`).getByText(samu, { exact: true }).click();
    await expect(page.locator(`#samuTags_add_${role}`)).toContainText(samu);
}

When('je choisis le premier SAMU de test en expert principal', async ({ monde }) => {
    await choisirSamu(monde, 'principal', monde.d.samus[0]);
});

When('je choisis le second SAMU de test en expert secondaire', async ({ monde }) => {
    await choisirSamu(monde, 'secondaire', monde.d.samus[1]);
});

Then("le premier SAMU de test n'est plus proposé en expert secondaire", async ({ monde }) => {
    const page = monde.page;
    await page.locator('#samuInput_add_secondaire').fill(monde.d.samus[0]);
    const liste = page.locator('#samuDropdown_add_secondaire');
    await expect(liste).toBeVisible();
    await expect(liste.getByText(monde.d.samus[0], { exact: true })).toHaveCount(0);
    await page.locator('#samuInput_add_secondaire').fill('');
});

Then(
    'la ressource saisie est expert principal sur le premier SAMU de test et secondaire sur le second',
    async ({ monde }) => {
        let ressource;
        await expect
            .poll(async () => (ressource = await ressourceParNom(monde, monde.d.saisie.nom)), {
                message: 'ressource saisie non créée'
            })
            .toBeTruthy();
        const api = await adminApi(monde);
        await expect
            .poll(async () =>
                (await api.ok('GET', `/api/resources/${ressource.id}/samu-assignments`))
                    .map((/** @type {any} */ a) => `${a.samu}|${a.role}`)
                    .sort()
            )
            .toEqual([`${monde.d.samus[0]}|principal`, `${monde.d.samus[1]}|secondaire`].sort());
    }
);

// ---------- Profil RH ----------

Then("le formulaire d'ajout de ressource n'est pas proposé", async ({ monde }) => {
    await expect(tableau(monde)).toBeVisible();
    await expect(monde.page.locator('#addResourceFormSection')).toBeHidden();
});

Then(
    "la ligne de la ressource ne propose que la consultation, avec des cases d'astreinte non modifiables",
    async ({ monde }) => {
        const ligne = ligneRessource(monde);
        await expect(ligne).toHaveCount(1);
        await expect(ligne.getByRole('button')).toHaveCount(1);
        await expect(ligne.getByRole('button', { name: 'Voir la ressource' })).toBeVisible();
        const cases = ligne.getByRole('checkbox');
        await expect(cases).toHaveCount(3);
        for (const c of await cases.all()) await expect(c).toBeDisabled();
        await expect(ligne).toContainText('Actif');
    }
);
