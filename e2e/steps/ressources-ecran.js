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

// ---------- Fiche de la ressource ----------

const fiche = (/** @type {Monde} */ monde) => monde.page.locator('#editModal');

When("j'ouvre la fiche de la ressource en consultation", async ({ monde }) => {
    await ligneRessource(monde).getByRole('button', { name: 'Voir la ressource' }).click();
    await expect(fiche(monde)).toBeVisible();
});

Then(
    'la fiche présente la ressource, {string} en principal et {string} en secondaire, sans astreinte',
    async ({ monde }, principal, secondaire) => {
        const page = monde.page;
        const r = monde.d.ressource;
        await expect(page.locator('#editNom')).toHaveValue(r.nom);
        await expect(page.locator('#editTrigramme')).toHaveValue(r.trigramme);
        await expect(page.locator('#editSamu')).toHaveValue(r.samu);
        await expect(page.locator('#samuTags_edit_principal')).toContainText(principal);
        await expect(page.locator('#samuTags_edit_secondaire')).toContainText(secondaire);
        for (const id of ['editAstreinteHo', 'editAstreinteVolontaire', 'editAstreinteApd'])
            await expect(page.locator(`#${id}`)).not.toBeChecked();
    }
);

When("je retire le dernier SAMU secondaire de la fiche et je coche l'astreinte HO de la fiche", async ({ monde }) => {
    const page = monde.page;
    // Retour arrière dans le champ vide : dernière étiquette retirée
    await page.locator('#samuInput_edit_secondaire').click();
    await page.locator('#samuInput_edit_secondaire').press('Backspace');
    await expect(page.locator('#samuTags_edit_secondaire')).not.toContainText('SAMU');
    await page.locator('#editAstreinteHo').check();
});

When("j'enregistre la fiche", async ({ monde }) => {
    // Clic par le DOM : le bas de la fenêtre peut être recouvert par la barre d'outils flottante
    await fiche(monde)
        .getByRole('button', { name: 'Enregistrer', exact: true })
        .last()
        .evaluate(b => /** @type {HTMLElement} */ (b).click());
});

Then("la ressource n'est plus expert que sur {string}, en principal", async ({ monde }, samu) => {
    const api = await adminApi(monde);
    await expect
        .poll(async () =>
            (await api.ok('GET', `/api/resources/${monde.d.ressource.id}/samu-assignments`)).map(
                (/** @type {any} */ a) => `${a.samu}|${a.role}`
            )
        )
        .toEqual([`${samu}|principal`]);
    await expect(fiche(monde)).toBeHidden();
});

When('je saisis les contacts RH {string} et {string} dans la fiche', async ({ monde }, a, b) => {
    const champ = monde.page.locator('#editContactsRh');
    await champ.fill(`${a}\n${b}`);
    await champ.blur();
});

Then("la fiche signale l'adresse invalide {string}", async ({ monde }, adresse) => {
    await expect(fiche(monde).getByText(`Adresse(s) e-mail invalide(s) : ${adresse}`)).toBeVisible();
});

Then('la fiche est toujours ouverte', async ({ monde }) => {
    await expect(fiche(monde)).toBeVisible();
});

Then('les contacts RH de la ressource sont {string}', async ({ monde }, contacts) => {
    await expect.poll(async () => (await lireRessource(monde, monde.d.ressource.id))?.contacts_rh).toBe(contacts);
});

// Historique des taux de MAD

const lignesHistorique = (/** @type {Monde} */ monde) => monde.page.locator('#madHistoryContainer tbody tr');
const fenetrePeriode = (/** @type {Monde} */ monde) => monde.page.locator('#madHistoryModal');

Then("l'historique de la fiche présente {int} période(s), la dernière au taux {string}", async ({ monde }, n, taux) => {
    await expect(lignesHistorique(monde)).toHaveCount(n);
    await expect(lignesHistorique(monde).last().locator('td').nth(2)).toHaveText(taux);
});

/** Enregistrement de la fenêtre d'une période de MAD */
async function enregistrerPeriode(/** @type {Monde} */ monde) {
    await fenetrePeriode(monde).getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(fenetrePeriode(monde)).toBeHidden();
}

When('je clôture dans la fiche la période en cours au {string}', async ({ monde }, fin) => {
    await lignesHistorique(monde).last().getByTitle('Modifier', { exact: true }).click();
    await expect(fenetrePeriode(monde)).toBeVisible();
    await monde.page.locator('#madDateFin').fill(fin);
    await enregistrerPeriode(monde);
});

When("j'ajoute dans la fiche une période au taux de {int} % à partir du {string}", async ({ monde }, taux, debut) => {
    const page = monde.page;
    await fiche(monde)
        .getByRole('button', { name: /Ajouter un taux de MAD/ })
        .click();
    await expect(fenetrePeriode(monde)).toBeVisible();
    await page.locator('#madDateDebut').fill(debut);
    await page.locator('#madTaux').fill(String(taux));
    await enregistrerPeriode(monde);
});

When('je supprime dans la fiche la dernière période de MAD et je confirme', async ({ monde }) => {
    await confirmer(monde, () => lignesHistorique(monde).last().getByTitle('Supprimer', { exact: true }).click());
});

// Particularités

const particularites = (/** @type {Monde} */ monde) => monde.page.locator('#madParticularitesModal');
const ligneParticularite = (/** @type {Monde} */ monde) => monde.page.locator('#particularitesListContainer tbody tr');

When("j'ouvre les particularités de la période en cours", async ({ monde }) => {
    await lignesHistorique(monde).last().getByTitle('Gérer les particularités', { exact: true }).click();
    await expect(particularites(monde)).toBeVisible();
});

Then('les particularités indiquent {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#particularitesListContainer')).toContainText(texte);
});

When(
    "j'ajoute une particularité au taux de {int} % du {string} au {string} pour le motif {string}",
    async ({ monde }, taux, debut, fin, motif) => {
        const page = monde.page;
        await page.locator('#particulariteDateDebut').fill(debut);
        await page.locator('#particulariteDateFin').fill(fin);
        await page.locator('#particulariteTaux').fill(String(taux));
        await page.locator('#particulariteMotif').fill(motif);
        await particularites(monde).getByRole('button', { name: 'Ajouter', exact: true }).click();
    }
);

Then(
    'les particularités présentent la période {string} au taux {string} pour le motif {string}',
    async ({ monde }, periode, taux, motif) => {
        const ligne = ligneParticularite(monde);
        await expect(ligne).toHaveCount(1);
        await expect(ligne.locator('td').nth(0)).toHaveText(periode);
        await expect(ligne.locator('td').nth(1)).toHaveText(taux);
        await expect(ligne.locator('td').nth(2)).toHaveText(motif);
    }
);

When('je modifie le taux de la particularité à {int} %', async ({ monde }, taux) => {
    const page = monde.page;
    await ligneParticularite(monde).getByRole('button').first().click();
    const fenetre = page.locator('#editParticulariteModal');
    await expect(fenetre).toBeVisible();
    await page.locator('#editParticulariteTaux').fill(String(taux));
    await fenetre.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(fenetre).toBeHidden();
});

When('je supprime la particularité et je confirme', async ({ monde }) => {
    await confirmer(monde, () => ligneParticularite(monde).getByRole('button').last().click());
});

// Consultation RH

Then(
    'la fiche « Détail de la ressource » est en lecture seule, sans ajout de taux de MAD, avec les astreintes en texte',
    async ({ monde }) => {
        const page = monde.page;
        await expect(fiche(monde)).toContainText('Détail de la ressource');
        for (const id of ['editNom', 'editTrigramme', 'editSamu', 'editFonction', 'editContactsRh'])
            await expect(page.locator(`#${id}`)).toBeDisabled();
        await expect(fiche(monde).getByRole('button', { name: /Ajouter un taux de MAD/ })).toBeHidden();
        await expect(fiche(monde).getByRole('button', { name: 'Enregistrer', exact: true })).toHaveCount(0);
        await expect(fiche(monde)).toContainText('Astreintes HO : non');
    }
);

When('je ferme la fiche', async ({ monde }) => {
    // Clic par le DOM : le bas de la fenêtre peut être recouvert par la barre d'outils flottante
    await fiche(monde)
        .getByRole('button', { name: 'Fermer', exact: true })
        .last()
        .evaluate(b => /** @type {HTMLElement} */ (b).click());
});

Then("la fiche n'est plus affichée", async ({ monde }) => {
    await expect(fiche(monde)).toBeHidden();
});
