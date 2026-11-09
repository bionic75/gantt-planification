// @ts-check
// Carte des événements : filtres, pastilles et info-bulles, experts, lecture chronologique. Événements de test de
// septembre 2031 sur une localisation de test géolocalisée (choisie dans le filtre), supprimés en fin de scénario.
import { expect } from '@playwright/test';
import { adminApi, creerEvenement, creerLocalisation, creerTypeEvenement } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const fenetre = (/** @type {Monde} */ monde) => monde.page.locator('#eventMapModal');
const carte = (/** @type {Monde} */ monde) => monde.page.locator('#eventMapModalContainer');

Given(
    'trois événements de test de septembre 2031 existent sur une localisation de test géolocalisée',
    async ({ monde }) => {
        const loc = (monde.d.locCarte = await creerLocalisation(monde, { geo: true }));
        const type = (monde.d.typeCarte = await creerTypeEvenement(monde));
        const { userId } = await monde.sessionDe('Expert');
        const expert = (await (await adminApi(monde)).ok('GET', '/api/users')).find(
            (/** @type {any} */ u) => u.id === userId
        );
        monde.d.expertCarte = expert;
        monde.d.externeCarte = {
            nom: 'Externe',
            prenom: 'Invité',
            email: `${monde.unique('externe').replace(/\s+/g, '.').toLowerCase()}@example.invalid`
        };
        monde.d.evtExpert = monde.unique('Évt carte expert');
        await creerEvenement(monde, {
            startDate: '2031-09-02',
            label: monde.d.evtExpert,
            type_id: type.id,
            location_id: loc.id,
            participants: [userId]
        });
        await creerEvenement(monde, {
            startDate: '2031-09-15',
            endDate: '2031-09-16',
            label: monde.unique('Évt carte externe'),
            type_id: type.id,
            location_id: loc.id,
            external_participants: [monde.d.externeCarte]
        });
        await creerEvenement(monde, {
            startDate: '2031-09-25',
            label: monde.unique('Évt carte sans type'),
            location_id: loc.id
        });
    }
);

/** Filtres de la carte : dates, localisation ; « Afficher » */
async function afficher(
    /** @type {Monde} */ monde,
    /** @type {string} */ debut,
    /** @type {string} */ fin,
    /** @type {string} */ locId
) {
    const page = monde.page;
    await page.locator('#modalMapStartDate').fill(debut);
    await page.locator('#modalMapEndDate').fill(fin);
    await page.locator('#modalMapLocationFilter').selectOption(locId);
    await fenetre(monde)
        .getByRole('button', { name: /Afficher/ })
        .click();
}

When("j'affiche sur la carte les événements de la localisation de test en septembre 2031", async ({ monde }) => {
    await expect(fenetre(monde)).toBeVisible();
    // Localisation de test proposée (liste relue à chaque ouverture)
    await expect(monde.page.locator(`#modalMapLocationFilter option[value="${monde.d.locCarte.id}"]`)).toHaveCount(1);
    await afficher(monde, '2031-09-01', '2031-09-30', String(monde.d.locCarte.id));
});

When("j'affiche sur la carte une localisation de test sans événement, sans date", async ({ monde }) => {
    const vide = await creerLocalisation(monde, { geo: true });
    // Liste des localisations relue à la réouverture de la carte
    await fermer(monde);
    await monde.page
        .locator('#evenements')
        .getByRole('button', { name: /Carte des Événements/ })
        .click();
    await expect(monde.page.locator(`#modalMapLocationFilter option[value="${vide.id}"]`)).toHaveCount(1);
    await afficher(monde, '', '', String(vide.id));
    await expect(monde.page.locator('#modalMapEventCount')).toHaveText('Aucun événement géolocalisé.');
});

Then('la carte indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#modalMapEventCount')).toHaveText(texte);
});

/** Pastille d'un lieu : nombre d'événements du lieu */
const pastilleLieu = (/** @type {Monde} */ monde, /** @type {string} */ nombre) =>
    carte(monde).locator('.leaflet-marker-icon', { hasText: new RegExp(`^${nombre}$`) });

Then('la carte présente un lieu portant {string} événements', async ({ monde }, nombre) => {
    await expect(pastilleLieu(monde, nombre)).toHaveCount(1);
});

When('je réinitialise les filtres de la carte', async ({ monde }) => {
    // Bouton qui suit « Afficher » (icône seule dans l'ancien écran)
    await fenetre(monde)
        .getByRole('button', { name: /Afficher/ })
        .locator('xpath=following-sibling::button[1]')
        .click();
});

Then("la date de début de la carte est le 1er janvier de l'année en cours", async ({ monde }) => {
    await expect(monde.page.locator('#modalMapStartDate')).toHaveValue(`${new Date().getFullYear()}-01-01`);
});

Then('la date de fin de la carte est vide', async ({ monde }) => {
    await expect(monde.page.locator('#modalMapEndDate')).toHaveValue('');
});

Then('toutes les localisations sont choisies sur la carte', async ({ monde }) => {
    await expect(monde.page.locator('#modalMapLocationFilter')).toHaveValue('');
});

// ---------- Info-bulle ----------

When("j'ouvre l'info-bulle du lieu de test sur la carte", async ({ monde }) => {
    // Seul lieu affiché (filtre sur la localisation de test) : pastille portant le nombre d'événements ; clic transmis
    // à l'élément (les pastilles des experts, placées à côté, peuvent le recouvrir)
    await pastilleLieu(monde, '3').dispatchEvent('click');
    await expect(carte(monde).locator('.leaflet-popup-content')).toBeVisible();
});

const bulle = (/** @type {Monde} */ monde) => carte(monde).locator('.leaflet-popup-content');

Then("l'info-bulle présente la localisation de test et {string}", async ({ monde }, texte) => {
    await expect(bulle(monde)).toContainText(monde.d.locCarte.court);
    await expect(bulle(monde)).toContainText(texte);
});

Then(
    "l'info-bulle présente l'événement de l'expert du {string} avec l'expert de test en participant",
    async ({ monde }, date) => {
        const e = monde.d.expertCarte;
        const texte = (await bulle(monde).textContent()) ?? '';
        const bloc = texte.slice(texte.indexOf(monde.d.evtExpert));
        expect(texte).toContain(monde.d.evtExpert);
        expect(bloc).toContain(date);
        expect(bloc).toContain(`${e.prenom} ${String(e.nom).toUpperCase()}`);
    }
);

Then("l'info-bulle présente le type de test", async ({ monde }) => {
    // Événement typé : libellé court du type, puis libellé de l'événement
    const texte = (await bulle(monde).textContent()) ?? '';
    expect(texte).toContain(`${monde.d.typeCarte.label_short}`);
    expect(texte.indexOf(monde.d.typeCarte.label_short)).toBeLessThan(texte.indexOf(monde.d.evtExpert));
});

// ---------- Filtres Type et Participants ----------

When('je choisis le type de test sur la carte', async ({ monde }) => {
    await monde.page.locator('#modalMapLabelFilter').selectOption(monde.d.typeCarte.label_long);
    await fenetre(monde)
        .getByRole('button', { name: /Afficher/ })
        .click();
});

/** Saisie dans le champ des participants, puis choix de la proposition */
async function participant(/** @type {Monde} */ monde, /** @type {string} */ saisie, /** @type {RegExp} */ choix) {
    const page = monde.page;
    await page.locator('#modalMapParticipantInput').fill(saisie);
    await page.locator('#modalMapParticipantDropdown').getByText(choix).first().click();
    await fenetre(monde)
        .getByRole('button', { name: /Afficher/ })
        .click();
}

When("je choisis l'expert de test dans les participants de la carte", async ({ monde }) => {
    const e = monde.d.expertCarte;
    await participant(monde, String(e.nom), new RegExp(`${e.prenom} ${String(e.nom).toUpperCase()}`));
});

When("je choisis l'invité externe de test dans les participants de la carte", async ({ monde }) => {
    const { email } = monde.d.externeCarte;
    await participant(monde, email, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ---------- Experts ----------

When("je bascule l'affichage des experts sur la carte", async ({ monde }) => {
    await monde.page.locator('#toggleExpertsMapBtn').click();
});

Then('le bouton des experts de la carte indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#toggleExpertsMapBtn')).toContainText(texte);
});

// ---------- Lecture chronologique ----------

When('je choisis la durée de défilement {string}', async ({ monde }, libelle) => {
    await monde.page.locator('#mapPlaySpeed').selectOption({ label: libelle });
});

When('je lance la lecture chronologique', async ({ monde }) => {
    await monde.page.locator('#mapPlayBtn').click();
});

Then('la lecture chronologique se termine au {string} avec {string}', async ({ monde }, date, compte) => {
    await expect(monde.page.locator('#mapPlayDate')).toHaveText(date, { timeout: 20000 });
    await expect(monde.page.locator('#mapPlayCount')).toHaveText(compte);
    await expect(monde.page.locator('#mapPlayBtn')).toContainText('Lecture');
});

When("j'arrête la lecture chronologique", async ({ monde }) => {
    await monde.page.locator('#mapPlayBar').getByTitle('Arrêter et réafficher tous les événements').click();
});

Then('la lecture chronologique est réinitialisée', async ({ monde }) => {
    await expect(monde.page.locator('#mapPlayDate')).toHaveText('—');
    await expect(monde.page.locator('#mapPlayCount')).toHaveText('');
    await expect(monde.page.locator('#mapPlayBtn')).toContainText('Lecture');
    await expect(monde.page.locator('#modalMapEventCount')).toHaveText('3 événement(s)');
});

/** Curseur placé à une position (0 à 1000) : événement « input » comme au glisser */
async function curseur(/** @type {Monde} */ monde, /** @type {number} */ valeur) {
    await monde.page.locator('#mapPlaySlider').fill(String(valeur));
}

When('je place le curseur de la lecture chronologique au début', async ({ monde }) => {
    await curseur(monde, 0);
});

When('je place le curseur de la lecture chronologique à la fin', async ({ monde }) => {
    await curseur(monde, 1000);
});

Then('la lecture chronologique affiche le {string} avec {string}', async ({ monde }, date, compte) => {
    await expect(monde.page.locator('#mapPlayDate')).toHaveText(date);
    await expect(monde.page.locator('#mapPlayCount')).toHaveText(compte);
});

// ---------- Fermeture ----------

async function fermer(/** @type {Monde} */ monde) {
    await fenetre(monde)
        .getByRole('button', { name: 'Fermer' })
        .or(fenetre(monde).getByText('×', { exact: true }))
        .first()
        .click();
    await expect(fenetre(monde)).toBeHidden();
}

When('je ferme la carte des événements', async ({ monde }) => {
    await fermer(monde);
});

Then('la carte des événements est fermée', async ({ monde }) => {
    await expect(fenetre(monde)).toBeHidden();
});
