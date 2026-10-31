// @ts-check
// Administration › Jours et événements spéciaux : congés scolaires et dates particulières (fichiers .ics), types
// d'événements, reprise des données des événements
import { expect } from '@playwright/test';
import { adminApi, lireEvenement } from '../support/donnees.js';
import { Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

/** Fichier .ics : événements « résumé, début, fin » (dates AAAAMMJJ) */
function ics(/** @type {Array<[string, string, string]>} */ evenements) {
    const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//E2E//Planification//FR'];
    for (const [resume, debut, fin] of evenements)
        lignes.push(
            'BEGIN:VEVENT',
            `SUMMARY:${resume}`,
            `DTSTART;VALUE=DATE:${debut}`,
            `DTEND;VALUE=DATE:${fin}`,
            'END:VEVENT'
        );
    lignes.push('END:VCALENDAR');
    return Buffer.from(lignes.join('\r\n'), 'utf8');
}

const fichierIcs = (/** @type {string} */ name, /** @type {Buffer} */ buffer) => ({
    name,
    mimeType: 'text/calendar',
    buffer
});

/** Fichier de test supprimé en fin de scénario, d'après son nom */
function nettoyerFichier(/** @type {Monde} */ monde, /** @type {string} */ type, /** @type {string} */ nom) {
    monde.aNettoyer(`fichier ${nom}`, async () => {
        const api = await adminApi(monde);
        const { files } = await api.ok('GET', `/api/ics-files/${type}`);
        for (const f of files.filter((/** @type {any} */ x) => x.filename === nom))
            await api.delete(`/api/ics-files/${type}/${f.id}`);
    });
}

const fichiers = async (/** @type {Monde} */ monde, /** @type {string} */ type) =>
    (await (await adminApi(monde)).ok('GET', `/api/ics-files/${type}`)).files;

// ---------- Congés scolaires ----------

const conges = (/** @type {Monde} */ monde) => monde.page.locator('#specialSub1');
const importerConges = (/** @type {Monde} */ monde) =>
    conges(monde)
        .getByRole('button', { name: /^\s*\S*\s*Importer$/ })
        .click();
const ligneConges = (/** @type {Monde} */ monde) =>
    monde.page.locator('#schoolHolidaysFilesList tr').filter({ hasText: monde.d.fichierConges });

When("j'importe un fichier de congés scolaires de test pour les zones A, B et C", async ({ monde }) => {
    const nom = `e2e-conges-${monde.suffixe.toLowerCase()}.ics`;
    monde.d.fichierConges = nom;
    monde.d.resumeConges = `Vacances E2E ${monde.suffixe}`;
    nettoyerFichier(monde, 'school-holidays', nom);
    const r = monde.d.resumeConges;
    await monde.page.locator('#schoolHolidaysFile').setInputFiles(
        fichierIcs(
            nom,
            ics([
                [`${r} Zone A`, '20310203', '20310210'],
                [`${r} Zone B`, '20310210', '20310217'],
                [`${r} Zone C`, '20310217', '20310224']
            ])
        )
    );
    await importerConges(monde);
});

When("j'importe les congés scolaires sans choisir de fichier", async ({ monde }) => {
    await importerConges(monde);
});

When("j'importe un fichier de congés scolaires sans période de vacances", async ({ monde }) => {
    const nom = `e2e-conges-vide-${monde.suffixe.toLowerCase()}.ics`;
    nettoyerFichier(monde, 'school-holidays', nom);
    await monde.page
        .locator('#schoolHolidaysFile')
        .setInputFiles(fichierIcs(nom, ics([['Pont E2E', '20310505', '20310506']])));
    await importerConges(monde);
});

Then("l'import des congés scolaires indique {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#schoolHolidaysStatus')).toContainText(texte);
});

Then(
    'la liste des fichiers de congés scolaires présente le fichier de test avec {int} périodes',
    async ({ monde }, n) => {
        await expect(ligneConges(monde)).toHaveCount(1);
        await expect(ligneConges(monde).locator('td').nth(2)).toHaveText(String(n));
        expect(
            (await fichiers(monde, 'school-holidays')).find(
                (/** @type {any} */ f) => f.filename === monde.d.fichierConges
            )
        ).toMatchObject({ periods_count: n });
    }
);

Then('les périodes du fichier de test sont prises en compte par la planification', async ({ monde }) => {
    const { periods } = await (await adminApi(monde)).ok('GET', '/api/ics-files/school-holidays/all-periods');
    for (const zone of ['zoneA', 'zoneB', 'zoneC'])
        expect(JSON.stringify(periods[zone]), zone).toContain(monde.d.resumeConges);
});

When('je supprime le fichier de congés scolaires de test et je confirme', async ({ monde }) => {
    await confirmer(monde, () => ligneConges(monde).getByRole('button').last().click());
});

Then('la liste des fichiers de congés scolaires ne présente plus le fichier de test', async ({ monde }) => {
    await expect(ligneConges(monde)).toHaveCount(0);
    expect(
        (await fichiers(monde, 'school-holidays')).some((/** @type {any} */ f) => f.filename === monde.d.fichierConges)
    ).toBe(false);
});

// ---------- Dates particulières ----------

const PRESETS = /** @type {Record<string, { bgColor: string, textColor: string, borderColor: string }>} */ ({
    Rouge: { bgColor: '#e53935', textColor: '#ffffff', borderColor: '#b71c1c' }
});

const dates = (/** @type {Monde} */ monde) => monde.page.locator('#specialSub2');
const configuration = (/** @type {Monde} */ monde) => monde.page.locator('#specialDatesConfigModal');
const ligneDates = (/** @type {Monde} */ monde) =>
    monde.page.locator('#specialDatesFilesList tr').filter({ hasText: monde.d.fichierDates });
const importerDates = (/** @type {Monde} */ monde) =>
    dates(monde)
        .getByRole('button', { name: /Importer et configurer/ })
        .click();
const fichierDatesEnregistre = async (/** @type {Monde} */ monde) =>
    (await fichiers(monde, 'special-dates')).find((/** @type {any} */ f) => f.filename === monde.d.fichierDates);

When("je choisis un fichier de dates particulières de test et je l'importe en le configurant", async ({ monde }) => {
    const nom = `e2e-dates-${monde.suffixe.toLowerCase()}.ics`;
    monde.d.fichierDates = nom;
    nettoyerFichier(monde, 'special-dates', nom);
    await monde.page.locator('#specialDatesFile').setInputFiles(
        fichierIcs(
            nom,
            ics([
                [`Jour E2E 1 ${monde.suffixe}`, '20310615', '20310616'],
                [`Jour E2E 2 ${monde.suffixe}`, '20310616', '20310617']
            ])
        )
    );
    await importerDates(monde);
});

When("j'importe des dates particulières sans choisir de fichier", async ({ monde }) => {
    await importerDates(monde);
});

Then('la configuration présente le nom du fichier de test', async ({ monde }) => {
    await expect(configuration(monde)).toBeVisible();
    await expect(monde.page.locator('#specialDatesFileName')).toHaveText(monde.d.fichierDates);
});

When("je saisis le libellé {string} et j'applique le préréglage {string}", async ({ monde }, libelle, preset) => {
    await monde.page.locator('#specialDatesLabel').fill(libelle);
    await configuration(monde).getByRole('button', { name: preset, exact: true }).click();
});

Then("l'aperçu de la configuration affiche {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#specialDatesPreview')).toHaveText(texte);
});

When("j'importe avec cette configuration", async ({ monde }) => {
    await configuration(monde)
        .getByRole('button', { name: /Importer avec cette configuration/ })
        .click();
});

Then("l'import des dates particulières indique {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#specialDatesStatus')).toContainText(texte);
});

Then(
    'le fichier de dates particulières de test est enregistré avec le libellé {string} et les couleurs du préréglage {string}',
    async ({ monde }, libelle, preset) => {
        await expect
            .poll(async () => (await fichierDatesEnregistre(monde))?.config)
            .toEqual({
                label: libelle,
                ...PRESETS[preset]
            });
    }
);

Then(
    'la liste des fichiers de dates particulières présente le fichier de test avec {int} dates',
    async ({ monde }, n) => {
        await expect(ligneDates(monde)).toHaveCount(1);
        await expect(ligneDates(monde).locator('td').nth(2)).toHaveText(String(n));
    }
);

When(
    "je modifie l'apparence du fichier de dates particulières de test avec le libellé {string}",
    async ({ monde }, libelle) => {
        const page = monde.page;
        await ligneDates(monde).getByRole('button').first().click();
        await expect(page.locator('#editSpecialDatesLabel')).toBeVisible();
        await page.locator('#editSpecialDatesLabel').fill(libelle);
        await page
            .locator('#editSpecialDatesModal')
            .getByRole('button', { name: /Enregistrer/ })
            .click();
    }
);

Then(
    'le fichier de dates particulières de test est enregistré avec le libellé {string}',
    async ({ monde }, libelle) => {
        await expect.poll(async () => (await fichierDatesEnregistre(monde))?.config?.label).toBe(libelle);
    }
);

When('je supprime le fichier de dates particulières de test et je confirme', async ({ monde }) => {
    await confirmer(monde, () => ligneDates(monde).getByRole('button').last().click());
});

Then('la liste des fichiers de dates particulières ne présente plus le fichier de test', async ({ monde }) => {
    await expect(ligneDates(monde)).toHaveCount(0);
    expect(await fichierDatesEnregistre(monde)).toBeUndefined();
});

// ---------- Types d'événements ----------

const types = async (/** @type {Monde} */ monde) => (await (await adminApi(monde)).ok('GET', '/api/event-types')).types;
const typeDeTest = async (/** @type {Monde} */ monde) =>
    (await types(monde)).find((/** @type {any} */ t) => t.label_long === monde.d.libelleType);
const typeAutre = async (/** @type {Monde} */ monde) => (await types(monde)).find((/** @type {any} */ t) => t.is_other);

const parametrage = (/** @type {Monde} */ monde) => monde.page.locator('#evtTypesAdmin');
const ligneType = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    monde.page.locator('#evtTypesTblBox tbody tr').filter({ hasText: libelle });

When(
    "je saisis un type d'événement de test avec le libellé court {string}, l'icône {string} et le gabarit {string}",
    async ({ monde }, court, icone, gabarit) => {
        const page = monde.page;
        monde.d.libelleType = monde.unique('Type E2E');
        monde.aNettoyer(`type ${monde.d.libelleType}`, async () => {
            const t = await typeDeTest(monde);
            if (t) await (await adminApi(monde)).delete(`/api/event-types/${t.id}`);
        });
        await page.locator('#evtTLong').fill(monde.d.libelleType);
        await page.locator('#evtTShort').fill(court);
        await page.locator('#evtTIconBtn').click();
        await page.locator('#evtTPicker').getByTitle(icone, { exact: true }).click();
        await page.locator('#evtTplBtn').click();
        await page.locator('#evtTplList').getByTitle(gabarit, { exact: true }).click();
    }
);

Then("l'aperçu du type d'événement affiche {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#evtTPrev')).toHaveText(texte);
});

When("j'ajoute le type d'événement", async ({ monde }) => {
    await parametrage(monde)
        .getByRole('button', { name: /Ajouter$/ })
        .click();
});

Then(
    "le type d'événement de test est enregistré avec le libellé court {string}, l'icône {string} et les couleurs {string}, {string}, {string}",
    async ({ monde }, court, icon, bg, text, border) => {
        await expect
            .poll(() => typeDeTest(monde))
            .toMatchObject({ label_short: court, icon, bg_color: bg, text_color: text, border_color: border });
    }
);

Then("la liste des types présente le type d'événement de test", async ({ monde }) => {
    await expect(ligneType(monde, monde.d.libelleType)).toHaveCount(1);
});

When("je modifie directement le libellé court du type d'événement de test en {string}", async ({ monde }, court) => {
    const ligne = ligneType(monde, monde.d.libelleType);
    await ligne.locator('td').nth(2).click();
    await ligne.locator('input').fill(court);
    await ligne.locator('input').press('Enter');
});

Then("le type d'événement de test est enregistré avec le libellé court {string}", async ({ monde }, court) => {
    await expect.poll(async () => (await typeDeTest(monde))?.label_short).toBe(court);
    await expect(ligneType(monde, monde.d.libelleType).locator('td').nth(2)).toHaveText(court);
});

When(
    "je modifie le type d'événement de test avec les couleurs personnalisées {string}, {string}, {string}",
    async ({ monde }, bg, text, border) => {
        const page = monde.page;
        await ligneType(monde, monde.d.libelleType)
            .getByRole('button', { name: /Modifier/ })
            .click();
        await expect(page.locator('#evtTLong')).toHaveValue(monde.d.libelleType);
        await page.locator('#evtTplBtn').click();
        await page
            .locator('#evtTplList')
            .getByRole('button', { name: /Personnalisé/ })
            .click();
        await page.locator('#evtTBg').fill(bg);
        await page.locator('#evtTTx').fill(text);
        await page.locator('#evtTBd').fill(border);
        await parametrage(monde)
            .getByRole('button', { name: /Enregistrer$/ })
            .click();
    }
);

Then(
    "le type d'événement de test est enregistré avec les couleurs {string}, {string}, {string}",
    async ({ monde }, bg, text, border) => {
        await expect
            .poll(() => typeDeTest(monde))
            .toMatchObject({ bg_color: bg, text_color: text, border_color: border });
    }
);

When("je supprime le type d'événement de test et je confirme", async ({ monde }) => {
    const texte = await confirmer(monde, () =>
        ligneType(monde, monde.d.libelleType)
            .getByRole('button', { name: /Supprimer/ })
            .click()
    );
    expect(texte).toContain(`Supprimer le type « ${monde.d.libelleType} » ?`);
});

Then("la liste des types ne présente plus le type d'événement de test", async ({ monde }) => {
    await expect(ligneType(monde, monde.d.libelleType)).toHaveCount(0);
    expect(await typeDeTest(monde)).toBeUndefined();
});

Then('le paramétrage des types indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#evtTMsg')).toHaveText(texte);
});

Then("le type « Autre\\(s) » n'est ni modifiable ni supprimable", async ({ monde }) => {
    const autre = await typeAutre(monde);
    const ligne = ligneType(monde, autre.label_long);
    await expect(ligne).toHaveCount(1);
    await expect(ligne.getByRole('button')).toHaveCount(0);
    await ligne.locator('td').nth(1).click();
    await expect(ligne.locator('input')).toHaveCount(0);
});

// ---------- Reprise des données ----------

const reprise = (/** @type {Monde} */ monde) => monde.page.locator('#evtRecoveryAdmin');
const ligneReprise = (/** @type {Monde} */ monde) => reprise(monde).locator('tbody tr');

When("j'affiche les événements traités de la reprise et je recherche l'événement de test", async ({ monde }) => {
    monde.d.libelleEvenement = (await lireEvenement(monde, monde.d.evenement)).label;
    await reprise(monde)
        .getByRole('button', { name: /^\s*Traité/ })
        .click();
    await reprise(monde).locator('#evtRecQ').fill(monde.d.libelleEvenement);
});

Then("la reprise présente l'événement de test seul, du type « Autre\\(s) »", async ({ monde }) => {
    await expect(ligneReprise(monde)).toHaveCount(1);
    await expect(ligneReprise(monde).locator('input[type=text]')).toHaveValue(monde.d.libelleEvenement);
    await expect(ligneReprise(monde).locator('select')).toHaveValue(String((await typeAutre(monde)).id));
});

const saisirLibelleReprise = async (/** @type {Monde} */ monde, /** @type {string} */ libelle) => {
    const champ = ligneReprise(monde).locator('input[type=text]');
    await champ.fill(libelle);
    await champ.press('Tab');
};

When("je change le libellé de l'événement de test dans la reprise", async ({ monde }) => {
    await saisirLibelleReprise(monde, `${monde.d.libelleEvenement} modifié`);
});

Then("le bouton d'enregistrement de la reprise indique {string}", async ({ monde }, texte) => {
    await expect(reprise(monde).locator('#evtRecSave')).toContainText(texte);
});

When('je recharge la reprise', async ({ monde }) => {
    await reprise(monde)
        .getByRole('button', { name: /Recharger/ })
        .click();
    await expect(ligneReprise(monde).locator('input[type=text]')).toHaveValue(monde.d.libelleEvenement);
});

When("j'affecte le type de test et un nouveau libellé à l'événement de test dans la reprise", async ({ monde }) => {
    monde.d.nouveauLibelle = `${monde.d.libelleEvenement} repris`;
    await ligneReprise(monde).locator('select').selectOption(String(monde.d.type.id));
    await saisirLibelleReprise(monde, monde.d.nouveauLibelle);
});

When("j'enregistre la reprise", async ({ monde }) => {
    await reprise(monde).locator('#evtRecSave').click();
});

Then('la reprise indique {string}', async ({ monde }, texte) => {
    await expect(reprise(monde).locator('#evtRecMsg')).toHaveText(texte);
});

Then("l'événement de test est enregistré avec le type de test et son nouveau libellé", async ({ monde }) => {
    await expect
        .poll(() => lireEvenement(monde, monde.d.evenement))
        .toMatchObject({ type_id: monde.d.type.id, label: monde.d.nouveauLibelle });
});
