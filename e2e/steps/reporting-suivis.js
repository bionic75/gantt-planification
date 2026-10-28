// @ts-check
// Reporting › disponibilités / affectations, HNO / astreintes, événements
import fs from 'fs';
import { expect } from '@playwright/test';
import { adminApi, creerEvenement, creerRessource, moisCourantParis } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Locator} Locator */

const SECTION_DISPO = '#reportingDispoBody';
const SECTION_HNO = '#reportingHnoBody';
const SECTION_EVENEMENTS = '#reportingEventsBody';

/** Ressource créée pour le scénario, par son alias (« Alpha »…) */
const ressource = (/** @type {Monde} */ monde, /** @type {string} */ alias) => {
    const r = monde.d.ressourcesReporting?.[alias];
    if (!r) throw new Error(`Ressource de reporting « ${alias} » non créée`);
    return r;
};
/** Libellé de la ressource dans les listes et les rapports (« Prénom Nom ») */
const libelle = (/** @type {{ prenom: string, nom: string }} */ r) => `${r.prenom} ${r.nom}`;

async function creerRessourceReporting(/** @type {Monde} */ monde, /** @type {string} */ alias, fonction = '') {
    const nom = monde.unique('E2E').replace(/\s+/g, '-');
    const r = await creerRessource(monde, {
        prenom: alias,
        nom,
        ...(fonction ? { fonction: `${fonction} ${nom}` } : {})
    });
    (monde.d.ressourcesReporting ||= {})[alias] = r;
}

Given('une ressource de reporting {string} existe', async ({ monde }, alias) => {
    await creerRessourceReporting(monde, alias);
});

Given('une ressource de reporting {string} de fonction {string} existe', async ({ monde }, alias, fonction) => {
    await creerRessourceReporting(monde, alias, fonction);
});

/** Bouton d'une section, par son libellé */
const bouton = (/** @type {Monde} */ monde, /** @type {string} */ section, /** @type {RegExp} */ nom) =>
    monde.page.locator(section).getByRole('button', { name: nom });

/** Lignes d'un tableau de résultats : textes des cellules (en-têtes exclus) */
const lignes = (/** @type {Locator} */ tableau) =>
    tableau
        .locator('tbody tr')
        .evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim())));

/** Fichier CSV téléchargé par un bouton : nom et contenu */
async function telecharger(/** @type {Monde} */ monde, /** @type {Locator} */ declencheur) {
    const telechargement = monde.page.waitForEvent('download');
    await declencheur.click();
    const d = await telechargement;
    const chemin = await d.path();
    return { nom: d.suggestedFilename(), contenu: fs.readFileSync(/** @type {string} */ (chemin), 'utf8') };
}

const dateDuJour = () => new Date().toISOString().slice(0, 10);

// ---------- Disponibilités / affectations ----------

When(
    /^je choisis seulement (?:la ressource "([^"]+)"|les ressources "([^"]+)" et "([^"]+)") pour le rapport des disponibilités$/,
    async ({ monde }, a, b, c) => {
        const alias = [a, b, c].filter(Boolean);
        await monde.page.locator('#reportingExperts').selectOption(alias.map(x => libelle(ressource(monde, x))));
    }
);

When('je ne choisis aucun expert pour le rapport des disponibilités', async ({ monde }) => {
    await monde.page.locator('#reportingExperts').selectOption([]);
});

When('je choisis une période de fin antérieure au début pour le rapport des disponibilités', async ({ monde }) => {
    const { annee } = moisCourantParis();
    const page = monde.page;
    await page.locator('#reportingStartMonth').selectOption('5');
    await page.locator('#reportingStartYear').selectOption(String(annee));
    await page.locator('#reportingEndMonth').selectOption('2');
    await page.locator('#reportingEndYear').selectOption(String(annee));
});

When('je génère le rapport des disponibilités', async ({ monde }) => {
    await bouton(monde, SECTION_DISPO, /Générer le rapport/).click();
});

const tableauDispo = (/** @type {Monde} */ monde) => monde.page.locator('#reportingResults table');

Then(
    'le rapport des disponibilités contient la ressource {string}, la ligne TOTAL et {int} mois',
    async ({ monde }, alias, mois) => {
        const tableau = tableauDispo(monde);
        await expect(tableau).toBeVisible();
        // Expert, Taux MAD, mois, TOTAL
        await expect(tableau.locator('thead th')).toHaveCount(mois + 3);
        const contenu = await lignes(tableau);
        expect(contenu.map(l => l[0])).toEqual([libelle(ressource(monde, alias)), 'TOTAL']);
    }
);

Then("le total du rapport des disponibilités est celui de l'API", async ({ monde }) => {
    const page = monde.page;
    const corps = {
        startMonth: Number(await page.locator('#reportingStartMonth').inputValue()),
        startYear: Number(await page.locator('#reportingStartYear').inputValue()),
        endMonth: Number(await page.locator('#reportingEndMonth').inputValue()),
        endYear: Number(await page.locator('#reportingEndYear').inputValue()),
        expertIds: await page
            .locator('#reportingExperts')
            .evaluate(s => [.../** @type {HTMLSelectElement} */ (s).selectedOptions].map(o => Number(o.value))),
        includeLeave: await page.locator('#reportingIncludeLeave').isChecked()
    };
    const { experts } = await (await adminApi(monde)).ok('POST', '/api/reporting/availability', corps);
    let dispo = 0;
    let affecte = 0;
    for (const e of experts)
        for (const s of Object.values(e.monthlyStats)) {
            dispo += /** @type {any} */ (s).available;
            affecte += /** @type {any} */ (s).assigned;
        }
    const total = (await lignes(tableauDispo(monde))).at(-1);
    expect(total?.at(-1)?.replace(/\s+/g, ' ')).toBe(`${dispo} | ${affecte}`);
});

When('je trie le rapport des disponibilités par expert', async ({ monde }) => {
    await tableauDispo(monde).locator('thead th').first().click();
});

Then('le rapport des disponibilités liste {string} avant {string}', async ({ monde }, a, b) => {
    const noms = (await lignes(tableauDispo(monde))).map(l => l[0]);
    expect(noms.indexOf(libelle(ressource(monde, a)))).toBeLessThan(noms.indexOf(libelle(ressource(monde, b))));
    expect(noms.indexOf(libelle(ressource(monde, a)))).toBeGreaterThanOrEqual(0);
});

When('je filtre les experts du rapport sur la fonction {string}', async ({ monde }, fonction) => {
    const nom = ressource(monde, 'Alpha').nom;
    await monde.page.locator('#reportingFonctionFilter').selectOption(`${fonction} ${nom}`);
});

Then(
    'la liste des experts du rapport propose {string}, sélectionnée, et pas {string}',
    async ({ monde }, present, absent) => {
        const options = monde.page.locator('#reportingExperts option');
        await expect(options).toHaveCount(1);
        await expect(options.first()).toHaveText(libelle(ressource(monde, present)));
        expect(await options.first().evaluate(o => /** @type {HTMLOptionElement} */ (o).selected)).toBe(true);
        await expect(monde.page.locator('#reportingExperts')).not.toContainText(libelle(ressource(monde, absent)));
    }
);

Then(
    "l'export CSV du rapport des disponibilités donne le fichier {string} avec la ressource {string}",
    async ({ monde }, prefixe, alias) => {
        const { nom, contenu } = await telecharger(monde, bouton(monde, SECTION_DISPO, /Exporter CSV/));
        expect(nom).toBe(`${prefixe}_${dateDuJour()}.csv`);
        expect(contenu.charCodeAt(0), 'BOM UTF-8 (Excel)').toBe(0xfeff);
        expect(contenu).toContain('"Expert');
        expect(contenu).toContain(`"${libelle(ressource(monde, alias))}"`);
    }
);

Then(
    "l'impression du rapport des disponibilités ouvre la fenêtre {string} avec la ressource {string}",
    async ({ monde }, titre, alias) => {
        const fenetre = monde.page.waitForEvent('popup');
        await bouton(monde, SECTION_DISPO, /Imprimer/).click();
        const popup = await fenetre;
        await expect(popup.locator('h2')).toHaveText(titre);
        await expect(popup.locator('table')).toContainText(libelle(ressource(monde, alias)));
        await popup.close();
    }
);

When('je lance le diagnostic des données', async ({ monde }) => {
    await bouton(monde, SECTION_DISPO, /Diagnostic/).click();
});

Then('le diagnostic de la ressource {string} est affiché', async ({ monde }, alias) => {
    const page = monde.page;
    await expect(page.getByText(`Diagnostic pour ${libelle(ressource(monde, alias))}`)).toBeVisible();
    await expect(page.getByText('Total lignes en base')).toBeVisible();
});

// ---------- HNO / Astreintes ----------

When('je choisis seulement la ressource {string} pour le rapport HNO \\/ Astreintes', async ({ monde }, alias) => {
    await monde.page.locator('#hnoReportingExperts').selectOption(libelle(ressource(monde, alias)));
});

When('je décoche {string} pour le rapport HNO \\/ Astreintes', async ({ monde }, type) => {
    await monde.page.locator(type === 'HNO' ? '#hnoReportingShowHno' : '#hnoReportingShowAstreintes').uncheck();
});

When('je génère le rapport HNO \\/ Astreintes', async ({ monde }) => {
    await bouton(monde, SECTION_HNO, /Générer le rapport/).click();
});

const tableauHno = (/** @type {Monde} */ monde) => monde.page.locator('#hnoReportingResults table');

/** En-têtes de second niveau (types de données), sans les emojis */
const sousEntetes = async (/** @type {Monde} */ monde) =>
    (await tableauHno(monde).locator('thead tr').nth(1).locator('th').allTextContents()).map(t =>
        t.replace(/[^A-Za-z]/g, '')
    );

Then(
    'le rapport HNO \\/ Astreintes contient la ressource {string}, la ligne TOTAL et {int} mois en colonnes {string} et {string}',
    async ({ monde }, alias, mois, hno, astr) => {
        await expect(tableauHno(monde)).toBeVisible();
        // Mois et Total, chacun avec ses deux colonnes
        expect(await sousEntetes(monde)).toEqual(Array.from({ length: mois + 1 }, () => [hno, astr]).flat());
        expect((await lignes(tableauHno(monde))).map(l => l[0])).toEqual([libelle(ressource(monde, alias)), 'TOTAL']);
    }
);

Then("le rapport HNO \\/ Astreintes n'a que des colonnes {string}", async ({ monde }, type) => {
    await expect(tableauHno(monde)).toBeVisible();
    const entetes = await sousEntetes(monde);
    expect(entetes.length).toBeGreaterThan(0);
    expect(new Set(entetes)).toEqual(new Set([type]));
});

Then("le total du rapport HNO \\/ Astreintes est celui de l'API", async ({ monde }) => {
    const page = monde.page;
    const corps = {
        startMonth: Number(await page.locator('#hnoReportingStartMonth').inputValue()),
        startYear: Number(await page.locator('#hnoReportingStartYear').inputValue()),
        endMonth: Number(await page.locator('#hnoReportingEndMonth').inputValue()),
        endYear: Number(await page.locator('#hnoReportingEndYear').inputValue()),
        expertIds: [ressource(monde, 'Alpha').id],
        showHno: true,
        showAstreintes: true
    };
    const { experts } = await (await adminApi(monde)).ok('POST', '/api/reporting/hno-astreintes', corps);
    let hno = 0;
    let astr = 0;
    for (const e of experts)
        for (const m of Object.values(e.monthlyData)) {
            hno += /** @type {any} */ (m).hno;
            astr += /** @type {any} */ (m).astreintes;
        }
    const total = (await lignes(tableauHno(monde))).at(-1) ?? [];
    expect(total.slice(-2)).toEqual([hno || '-', astr || '-'].map(String));
});

Then(
    "l'export CSV du rapport HNO \\/ Astreintes donne le fichier {string} avec la ressource {string}",
    async ({ monde }, prefixe, alias) => {
        const { nom, contenu } = await telecharger(monde, bouton(monde, SECTION_HNO, /Exporter CSV/));
        expect(nom).toBe(`${prefixe}_${dateDuJour()}.csv`);
        expect(contenu.charCodeAt(0), 'BOM UTF-8 (Excel)').toBe(0xfeff);
        expect(contenu).toContain('"Expert"');
        expect(contenu).toContain(`"${libelle(ressource(monde, alias))}"`);
    }
);

// ---------- Événements ----------

Given('un événement de reporting existe avec le participant {string}', async ({ monde }, profil) => {
    const { userId } = await monde.sessionDe(profil);
    const label = monde.unique('Suivi E2E');
    const id = await creerEvenement(monde, { label, startDate: '2031-05-06', participants: [userId] });
    monde.d.evenementReporting = { id, label };
});

When("je recherche les événements par le libellé de l'événement de reporting", async ({ monde }) => {
    await monde.page.locator('#eventsReportingLabel').fill(monde.d.evenementReporting.label);
    await bouton(monde, SECTION_EVENEMENTS, /^📊 Générer$|^Générer$/).click();
});

When('je génère le suivi des événements', async ({ monde }) => {
    await bouton(monde, SECTION_EVENEMENTS, /^📊 Générer$|^Générer$/).click();
});

When("j'ajoute le participant {string} au suivi des événements", async ({ monde }, profil) => {
    const s = await monde.sessionDe(profil);
    const nom = `${s.prenom} ${String(s.nom).toUpperCase()}`;
    const page = monde.page;
    await page.locator('#eventsReportingParticipantInput').fill(String(s.nom));
    await page.locator('#eventsReportingParticipantDropdown').getByText(nom, { exact: true }).click();
    await expect(page.locator('#eventsReportingParticipantsContainer')).toContainText(nom);
});

Then('le suivi des événements affiche {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#eventsReportingResults')).toContainText(texte);
});

Then("le suivi des événements affiche {string} et l'événement de reporting", async ({ monde }, texte) => {
    const resultats = monde.page.locator('#eventsReportingResults');
    await expect(resultats).toContainText(texte);
    await expect(resultats.locator('table')).toContainText(monde.d.evenementReporting.label);
    await expect(resultats.locator('table')).toContainText('06/05/2031');
});

Then(
    "l'export CSV du suivi des événements donne le fichier {string} avec l'événement de reporting",
    async ({ monde }, prefixe) => {
        const { nom, contenu } = await telecharger(monde, bouton(monde, SECTION_EVENEMENTS, /Exporter CSV/));
        expect(nom).toBe(`${prefixe}_${dateDuJour()}.csv`);
        expect(contenu.charCodeAt(0), 'BOM UTF-8 (Excel)').toBe(0xfeff);
        expect(contenu).toContain('"Libellé"');
        expect(contenu).toContain(`"${monde.d.evenementReporting.label}"`);
        expect(contenu).toContain('"06/05/2031"');
    }
);

When('je réinitialise le suivi des événements', async ({ monde }) => {
    await bouton(monde, SECTION_EVENEMENTS, /Réinitialiser/).click();
});

Then('les critères du suivi des événements sont vides', async ({ monde }) => {
    const page = monde.page;
    for (const id of ['#eventsReportingStart', '#eventsReportingEnd', '#eventsReportingLabel'])
        await expect(page.locator(id)).toHaveValue('');
    const participants = page.locator('#eventsReportingParticipantsContainer');
    for (const profil of ['Expert', 'Utilisateur']) {
        const s = await monde.sessionDe(profil);
        await expect(participants).not.toContainText(`${s.prenom} ${String(s.nom).toUpperCase()}`);
    }
    await expect(page.locator('#eventsReportingResults')).toContainText('Définissez vos critères');
});
