// @ts-check
// Onglet Événements : formulaire (création, modification), liste par année et mois, droits, exports, localisation
import { expect } from '@playwright/test';
import { adminApi, creerEvenement, lireEvenement, nettoyerMoisExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { action, confirmer, telecharger } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const liste = (/** @type {Monde} */ monde) => monde.page.locator('#myEventsTableContainer');
const nomAffiche = (/** @type {{ prenom: string, nom: string }} */ s) => `${s.prenom} ${String(s.nom).toUpperCase()}`;

/** Fiche d'un événement de la liste, par son libellé (élément le plus proche portant l'action « Modifier ») */
const fiche = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    liste(monde)
        .locator('*')
        .filter({ hasText: libelle })
        .filter({ has: monde.page.getByRole('button', { name: "Modifier l'événement" }) })
        .last();

/** Libellé actuel de l'événement de test (relu à l'API : il peut avoir été renommé) */
const libelleTest = async (/** @type {Monde} */ monde, id = monde.d.evenement) =>
    /** @type {string} */ ((await lireEvenement(monde, id))?.label);

/** Nœud de l'arbre (année ou mois) déplié s'il est replié */
async function deplier(/** @type {import('@playwright/test').Locator} */ entete) {
    await expect(entete).toBeVisible();
    if ((await entete.textContent())?.includes('▶')) await entete.click();
}

When(/^j'affiche l'événement de test en (\w+) (\d{4})$/, async ({ monde }, mois, annee) => {
    await deplier(
        liste(monde)
            .getByText(new RegExp(`[▶▼]\\s*${annee}\\b`))
            .first()
    );
    await deplier(
        liste(monde)
            .getByText(new RegExp(`[▶▼]\\s*${mois[0].toUpperCase()}${mois.slice(1)}\\b`))
            .filter({ visible: true })
            .first()
    );
    await expect(fiche(monde, await libelleTest(monde))).toBeVisible();
});

// ---------- Formulaire ----------

/** Libellé saisi dans le formulaire (en majuscules, comme l'écran) ; supprimé en fin de scénario */
function libelleSaisi(/** @type {Monde} */ monde) {
    if (!monde.d.libelleIhm) {
        monde.d.libelleIhm = monde.unique('EVT IHM').toUpperCase();
        const libelle = monde.d.libelleIhm;
        monde.aNettoyer(`événements « ${libelle} »`, async () => {
            const api = await adminApi(monde);
            const { events } = await api.ok('GET', '/api/custom-events');
            for (const e of events.filter((/** @type {any} */ x) => x.label === libelle))
                await api.delete(`/api/custom-events/${e.id}`);
        });
    }
    return /** @type {string} */ (monde.d.libelleIhm);
}

When('je choisis le type de test', async ({ monde }) => {
    await monde.page.locator('#myEventTypeId').selectOption(String(monde.d.type.id));
});

When('je saisis la date de début {string}', async ({ monde }, date) => {
    await monde.page.locator('#myEventStartDate').fill(date);
});

When(
    /^je saisis un événement du type de test du "([^"]+)" au "([^"]+)"( sur la localisation de test)?$/,
    async ({ monde }, debut, fin, avecLocalisation) => {
        const page = monde.page;
        await page.locator('#myEventTypeId').selectOption(String(monde.d.type.id));
        await page.locator('#myEventStartDate').fill(debut);
        await page.locator('#myEventEndDate').fill(fin);
        await page.locator('#myEventLabel').fill(libelleSaisi(monde));
        if (avecLocalisation) await page.locator('#myEventLocationId').selectOption(String(monde.d.localisation.id));
    }
);

When("j'ajoute le participant interne {string} et l'invité externe {string}", async ({ monde }, profil, email) => {
    const page = monde.page;
    const s = await monde.sessionDe(profil);
    await page.locator('#myEventParticipantInput').fill(String(s.nom));
    await page.locator('#myEventParticipantDropdown').getByText(nomAffiche(s)).first().click();
    await page.locator('#myEventParticipantInput').fill(email);
    await page.locator('#myEventParticipantInput').press('Enter');
    monde.d.inviteExterne = email;
    const participants = page.locator('#myEventParticipantsContainer');
    await expect(participants).toContainText(nomAffiche(s));
    await expect(participants).toContainText(email);
});

Then(
    'la prévisualisation reprend les dates, le type, le libellé, la localisation et le participant {string}',
    async ({ monde }, profil) => {
        const apercu = monde.page.locator('#myEventPreview');
        await expect(apercu).toContainText('12/05/2031');
        await expect(apercu).toContainText('13/05/2031');
        await expect(apercu).toContainText(monde.d.type.label_short);
        await expect(apercu).toContainText(libelleSaisi(monde));
        await expect(apercu).toContainText(monde.d.localisation.court);
        await expect(apercu).toContainText(nomAffiche(await monde.sessionDe(profil)));
    }
);

Then("le choix de la demi-journée n'est pas proposé", async ({ monde }) => {
    await expect(monde.page.locator('#myEventPeriodAM')).toBeHidden();
});

When('je choisis la demi-journée {string}', async ({ monde }, choix) => {
    const id = { Matin: '#myEventPeriodAM', 'Après-midi': '#myEventPeriodPM', 'Journée entière': '#myEventPeriodFull' }[
        /** @type {string} */ (choix)
    ];
    await monde.page.locator(/** @type {string} */ (id)).check();
});

When("j'ajoute l'événement", async ({ monde }) => {
    await monde.page.locator('#myEventActionBtn').click();
});

When("j'ajoute l'événement et le planning est rechargé", async ({ monde }) => {
    // Événements du planning rechargés après l'enregistrement (ancien code, ou îlot via la liaison)
    const rechargement = monde.page.waitForRequest(r => r.url().includes('/api/ics-files/special-dates/all'));
    await monde.page.locator('#myEventActionBtn').click();
    await rechargement;
});

Then("le formulaire de l'événement est replié", async ({ monde }) => {
    await expect(monde.page.locator('#myEventFormBody')).toBeHidden();
});

/** Événement saisi depuis le formulaire, relu à l'API */
async function evenementSaisi(/** @type {Monde} */ monde) {
    const libelle = libelleSaisi(monde);
    /** @type {any} */
    let e;
    await expect
        .poll(async () => {
            const { events } = await (await adminApi(monde)).ok('GET', '/api/custom-events');
            e = events.find((/** @type {any} */ x) => x.label === libelle);
            return !!e;
        })
        .toBe(true);
    return e;
}

Then(
    "l'événement saisi est affiché en mai 2031 avec la localisation de test et le participant {string}",
    async ({ monde }, profil) => {
        await deplier(
            liste(monde)
                .getByText(/[▶▼]\s*2031\b/)
                .first()
        );
        await deplier(
            liste(monde)
                .getByText(/[▶▼]\s*Mai\b/)
                .filter({ visible: true })
                .first()
        );
        const f = fiche(monde, libelleSaisi(monde));
        await expect(f).toBeVisible();
        await expect(f).toContainText(`${monde.d.localisation.court} | ${monde.d.type.label_short}`);
        await expect(f).toContainText(nomAffiche(await monde.sessionDe(profil)));
        await expect(f).toContainText(monde.d.inviteExterne);
    }
);

Then(
    "l'événement saisi est enregistré avec le type, la localisation, la période {string} et les participants",
    async ({ monde }, periode) => {
        const e = await evenementSaisi(monde);
        const { userId } = await monde.sessionDe('Expert');
        expect(e.type_id).toBe(monde.d.type.id);
        expect(e.location_id).toBe(monde.d.localisation.id);
        expect(e.period).toBe(periode);
        expect(e.participants.map((/** @type {any} */ p) => p.user_id)).toEqual([userId]);
        expect(e.external_participants.map((/** @type {any} */ p) => p.email)).toEqual([monde.d.inviteExterne]);
    }
);

Then("l'événement saisi est enregistré avec la période {string}", async ({ monde }, periode) => {
    expect((await evenementSaisi(monde)).period).toBe(periode);
});

// ---------- Modification, suppression, droits ----------

When("je modifie l'événement de test depuis la liste", async ({ monde }) => {
    await fiche(monde, await libelleTest(monde))
        .getByRole('button', { name: "Modifier l'événement" })
        .click();
});

Then("le formulaire présente l'événement de test et le choix de son créateur", async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#myEventFormBody')).toBeVisible();
    await expect(page.locator('#myEventLabel')).toHaveValue(await libelleTest(monde));
    await expect(page.locator('#myEventCreator')).toBeVisible();
    const { userId } = await monde.sessionDe('Administrateur');
    await expect(page.locator('#myEventCreator')).toHaveValue(String(userId));
});

When("je renomme l'événement en {string} et l'enregistre", async ({ monde }, libelle) => {
    await monde.page.locator('#myEventLabel').fill(libelle);
    await monde.page.locator('#myEventActionBtn').click();
});

Then("l'événement de test s'appelle {string}", async ({ monde }, libelle) => {
    await expect.poll(() => libelleTest(monde)).toBe(libelle);
    await expect(monde.page.locator('#myEventFormBody')).toBeHidden();
});

When("je supprime l'événement de test depuis la liste et je confirme", async ({ monde }) => {
    monde.d.libelleSupprime = await libelleTest(monde);
    await confirmer(monde, () =>
        fiche(monde, monde.d.libelleSupprime).getByRole('button', { name: "Supprimer l'événement" }).click()
    );
});

Then("l'événement de test n'est plus affiché", async ({ monde }) => {
    await expect(liste(monde)).not.toContainText(monde.d.libelleSupprime);
});

Then("l'événement de test propose la modification mais pas la suppression", async ({ monde }) => {
    const f = fiche(monde, await libelleTest(monde));
    await expect(f.getByRole('button', { name: "Modifier l'événement" })).toBeVisible();
    await expect(f.getByRole('button', { name: "Supprimer l'événement" })).toHaveCount(0);
});

Then("l'événement de test propose « Participer »", async ({ monde }) => {
    await expect(fiche(monde, await libelleTest(monde)).getByRole('button', { name: /Participer/ })).toBeVisible();
});

Given("la planification de l'expert de mai 2031 sera remise à zéro", async ({ monde }) => {
    await nettoyerMoisExpert(monde, 2031, 4);
});

When("je me déclare participant à l'événement de test", async ({ monde }) => {
    await fiche(monde, await libelleTest(monde))
        .getByRole('button', { name: /Participer/ })
        .click();
});

// ---------- Tri, filtres, exports ----------

Given(
    "l'administrateur a créé un événement de test le {string} avec {string} en participant",
    async ({ monde }, date, profil) => {
        const { userId } = await monde.sessionDe(profil);
        monde.d.evenementSansParticipant = monde.d.evenement;
        monde.d.evenement = await creerEvenement(monde, { startDate: date, participants: [userId] });
    }
);

/** Ordre d'affichage des années dans la liste */
const annees = async (/** @type {Monde} */ monde) =>
    (
        await liste(monde)
            .getByText(/[▶▼]\s*\d{4}\b/)
            .allTextContents()
    ).map(t => Number(t.match(/\d{4}/)?.[0]));

Then("la liste présente l'année {int} avant l'année {int}", async ({ monde }, a, b) => {
    await expect
        .poll(async () => {
            const ordre = await annees(monde);
            return ordre.includes(a) && ordre.includes(b) && ordre.indexOf(a) < ordre.indexOf(b);
        })
        .toBe(true);
});

When('je change le tri des années', async ({ monde }) => {
    await liste(monde)
        .getByRole('button', { name: /^Année/ })
        .click();
});

When(
    /^je filtre la liste sur (?:le participant "([^"]+)" et )?la période du "([^"]+)" au "([^"]+)"$/,
    async ({ monde }, profil, debut, fin) => {
        const page = monde.page;
        if (profil) await page.locator('#myEventsParticipantFilter').fill(String((await monde.sessionDe(profil)).nom));
        await page.locator('#myEventsDateDebut').fill(debut);
        await page.locator('#myEventsDateFin').fill(fin);
    }
);

Then("seul l'événement de test avec participant est affiché parmi les événements de test", async ({ monde }) => {
    await expect(fiche(monde, await libelleTest(monde))).toBeVisible();
    await expect(liste(monde)).not.toContainText(await libelleTest(monde, monde.d.evenementSansParticipant));
});

Then(
    /^l'export (CSV|HTML) de la liste donne le fichier "([^"]+)" avec l'événement de test$/,
    async ({ monde }, format, prefixe) => {
        const { nom, contenu } = await telecharger(
            monde,
            liste(monde).getByRole('button', { name: new RegExp(`${format}$`) })
        );
        expect(nom).toBe(`${prefixe}_${new Date().toISOString().slice(0, 10)}.${format.toLowerCase()}`);
        expect(contenu).toContain(await libelleTest(monde));
        expect(contenu).toContain('2031-05-06');
        if (format === 'CSV') expect(contenu.split('\n')[0]).toContain('Libellé');
        else expect(contenu).toContain('<title>Événements exportés</title>');
    }
);

// ---------- Localisation, carte ----------

When("je crée une localisation de test depuis le formulaire de l'événement", async ({ monde }) => {
    const page = monde.page;
    const court = `ZE2E${Math.floor(Math.random() * 9000 + 1000)}`;
    monde.d.localisationIhm = court;
    monde.aNettoyer(`localisation ${court}`, async () => {
        const api = await adminApi(monde);
        const { locations } = await api.ok('GET', '/api/locations');
        for (const l of locations.filter((/** @type {any} */ x) => x.libelle_court === court))
            await api.delete(`/api/locations/${l.id}`);
    });
    await action(page.locator('#evenements'), /Localisation introuvable/).click();
    await page.getByPlaceholder('Ex: CENTRE HOSPITALIER DE BORDEAUX').filter({ visible: true }).fill(`E2E ${court}`);
    await page.getByPlaceholder('Ex: CHB').filter({ visible: true }).fill(court);
    await page
        .getByRole('button', { name: /Créer$/ })
        .filter({ visible: true })
        .click();
});

Then("la localisation de test est choisie dans le formulaire de l'événement", async ({ monde }) => {
    const choix = monde.page.locator('#myEventLocationId option:checked');
    await expect(choix).toContainText(monde.d.localisationIhm);
});

When("j'ouvre la carte des événements", async ({ monde }) => {
    await monde.page
        .locator('#evenements')
        .getByRole('button', { name: /Carte des Événements/ })
        .click();
});

Then('la carte des événements est affichée', async ({ monde }) => {
    await expect(monde.page.locator('#eventMapModal')).toBeVisible();
});
