// @ts-check
// Aide à l'affectation › ateliers métier : simulation et enregistrement du rétroplanning, liste, invitation (jamais
// envoyée), sondage de date (brouillon, réponse publique, clôture, réouverture, suppression ; jamais envoyé), page
// publique du sondage, cadre de l'application. Déploiement de test (MEP 2032) ; rétroplanning et sondages supprimés en
// fin de scénario.
import { expect } from '@playwright/test';
import { adminApi, creerDeploiement } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer } from '../support/interface.js';
import { ouvrirApplication } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const APPLICATION = "Aide à l'affectation opérationnelle";
const onglet = (/** @type {Monde} */ monde) => monde.page.locator('#affectationAteliersTab');
const tableau = (/** @type {Monde} */ monde) => monde.page.locator('#atTableBox');
const ligneJalon = (/** @type {Monde} */ monde, /** @type {string} */ jalon) =>
    tableau(monde)
        .locator('tbody tr')
        .filter({ has: monde.page.locator('td:first-child', { hasText: new RegExp(`^${jalon}`) }) });
const samu = (/** @type {Monde} */ monde) => monde.d.localisation.court;
const avecSamu = (/** @type {Monde} */ monde, /** @type {string} */ t) => t.replace('{samu}', samu(monde));

/** Rétroplannings du SAMU de test supprimés en fin de scénario (sondages compris) */
function nettoyerRetroplannings(/** @type {Monde} */ monde) {
    const nom = samu(monde);
    monde.aNettoyer(`rétroplanning ${nom}`, async () => {
        const api = await adminApi(monde);
        const { retroplannings } = await api.ok('GET', '/api/affectation/ateliers');
        for (const r of retroplannings.filter((/** @type {any} */ x) => x.samu_name === nom))
            await api.delete(`/api/affectation/ateliers/${r.id}`);
    });
}

Given(
    'un déploiement de test a une visite métier du {string} au {string} et sa mise en production le {string}',
    async ({ monde }, debut, fin, mep) => {
        await creerDeploiement(monde, { visite: [debut, fin], extra: { date_mise_en_production: mep } });
        nettoyerRetroplannings(monde);
    }
);

async function ouvrirAffectation(/** @type {Monde} */ monde) {
    const page = monde.page;
    await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
    await page.locator('#appSwitcherBtn').click();
    await page.locator('#appSwitcherDropdown > div', { hasText: APPLICATION }).click();
    await expect(page.locator('#affectationContainer')).toBeVisible({ timeout: 20000 });
}

Given("j'ouvre les ateliers métier en tant que {string}", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
    await ouvrirAffectation(monde);
    await monde.page.locator('#affectationTabAteliers').click();
    await expect(monde.page.locator('#atSamu2')).toBeVisible({ timeout: 20000 });
});

// ---------- Simulation ----------

When('je choisis le SAMU de test dans la simulation', async ({ monde }) => {
    await monde.page.locator('#atSamu2').selectOption(samu(monde));
});

Then('la date de MEP reprise du déploiement est {string}', async ({ monde }, date) => {
    await expect(monde.page.locator('#atMep2')).toHaveValue(date);
    await expect(onglet(monde)).toContainText('Reprise du déploiement.');
});

Then("la zone de vacances n'est pas déterminée pour ce SAMU", async ({ monde }) => {
    await expect(monde.page.locator('#atZoneHint')).toContainText('Zone non déterminée pour ce SAMU');
});

Then('la simulation est {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#atSavedBadge')).toHaveText(texte);
});

When('je choisis la zone {string} et {int} ateliers', async ({ monde }, zone, nb) => {
    await monde.page.locator('#atZone2').selectOption(zone);
    await monde.page.locator('#atNb2').selectOption(String(nb));
});

Then(
    'le rétroplanning simulé présente la visite métier, {int} ateliers et la mise en production',
    async ({ monde }, nb) => {
        await expect(tableau(monde).locator('tbody tr')).toHaveCount(nb + 3, { timeout: 20000 });
        await expect(ligneJalon(monde, 'Visite métier')).toHaveCount(1);
        for (let k = 1; k <= nb; k++) await expect(ligneJalon(monde, `Atelier ${k}`)).toHaveCount(1);
        await expect(ligneJalon(monde, 'MEP')).toHaveCount(1);
    }
);

Then('la mise en production est proposée le {string}', async ({ monde }, date) => {
    await expect(ligneJalon(monde, 'MEP').locator('td').nth(3)).toHaveText(date);
});

When("je porte l'écart entre l'atelier 1 et l'atelier 2 à {int} jours", async ({ monde }, n) => {
    monde.d.atelier1Avant = (await ligneJalon(monde, 'Atelier 1').locator('td').nth(3).textContent())?.trim();
    await monde.page.locator('#atEcart12').fill(String(n));
});

/** « mar. 01/06/2032 » → « 2032-06-01 » */
const iso = (/** @type {string} */ t) =>
    t
        .replace(/^\S+\s+/, '')
        .split('/')
        .reverse()
        .join('-');

Then("l'atelier 1 est proposé plus tôt qu'avant", async ({ monde }) => {
    const avant = iso(monde.d.atelier1Avant);
    await expect
        .poll(
            async () =>
                iso(((await ligneJalon(monde, 'Atelier 1').locator('td').nth(3).textContent()) ?? '').trim()) < avant
        )
        .toBe(true);
});

Given(
    'je simule le rétroplanning du SAMU de test en zone {string} avec {int} ateliers',
    async ({ monde }, zone, nb) => {
        await monde.page.locator('#atSamu2').selectOption(samu(monde));
        await monde.page.locator('#atZone2').selectOption(zone);
        await monde.page.locator('#atNb2').selectOption(String(nb));
        await expect(tableau(monde).locator('tbody tr')).toHaveCount(nb + 3, { timeout: 20000 });
    }
);

// ---------- Enregistrement, liste ----------

const annonces = (/** @type {Monde} */ monde) => monde.page.locator('.at-toast');

When("j'enregistre le rétroplanning", async ({ monde }) => {
    await onglet(monde).getByRole('button', { name: 'Enregistrer le rétroplanning' }).click();
    await expect(monde.page.locator('#atSavedBadge')).toContainText('Rétroplanning enregistré', { timeout: 20000 });
});

Then('une annonce des ateliers indique {string}', async ({ monde }, texte) => {
    await expect(annonces(monde).filter({ hasText: texte }).first()).toBeVisible({ timeout: 20000 });
});

Then('la simulation indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#atSavedBadge')).toContainText(texte);
});

const ligneListe = (/** @type {Monde} */ monde) =>
    monde.page
        .locator('#atList tbody tr')
        .filter({ has: monde.page.locator('td:first-child', { hasText: new RegExp(`^${samu(monde)}$`) }) });

Then('la liste des rétroplannings présente le SAMU de test avec {string}', async ({ monde }, texte) => {
    await expect(ligneListe(monde)).toHaveCount(1);
    await expect(ligneListe(monde)).toContainText(texte);
});

Then('la liste des rétroplannings ne présente plus le SAMU de test', async ({ monde }) => {
    await expect(ligneListe(monde)).toHaveCount(0);
});

When('je lance une nouvelle simulation', async ({ monde }) => {
    await onglet(monde).getByRole('button', { name: 'Nouvelle simulation' }).click();
});

Then('la simulation ne présente plus de SAMU', async ({ monde }) => {
    await expect(monde.page.locator('#atSamu2')).toHaveValue('');
    await expect(tableau(monde)).toContainText('Choisissez un SAMU, une date de MEP et une zone');
});

When('je modifie le rétroplanning du SAMU de test depuis la liste', async ({ monde }) => {
    await ligneListe(monde).getByRole('button', { name: 'Modifier' }).click();
});

Then(
    'la simulation présente le SAMU de test enregistré, en zone {string} avec {int} ateliers',
    async ({ monde }, zone, nb) => {
        await expect(monde.page.locator('#atSamu2')).toHaveValue(samu(monde));
        await expect(monde.page.locator('#atZone2')).toHaveValue(zone);
        await expect(monde.page.locator('#atNb2')).toHaveValue(String(nb));
        await expect(monde.page.locator('#atSavedBadge')).toContainText('Rétroplanning enregistré');
    }
);

When('je supprime le rétroplanning du SAMU de test', async ({ monde }) => {
    const texte = await confirmer(monde, () => ligneListe(monde).getByRole('button', { name: 'Supprimer' }).click());
    expect(texte).toContain(`Supprimer le rétroplanning des ateliers métier de ${samu(monde)} ?`);
});

// ---------- Date planifiée, invitation ----------

When(
    "je planifie l'atelier {int} au {string} à {string} et j'enregistre le rétroplanning",
    async ({ monde }, k, date, heure) => {
        const ligne = ligneJalon(monde, `Atelier ${k}`);
        await ligne.locator('input[type="date"]').fill(date);
        await ligne.locator('input[type="date"]').dispatchEvent('change');
        await expect(ligne.locator('input[type="time"]')).toBeEnabled();
        await ligne.locator('input[type="time"]').fill(heure);
        await ligne.locator('input[type="time"]').dispatchEvent('change');
        await expect(ligne.locator('td').nth(6)).toContainText('Planifié', { timeout: 20000 });
        await onglet(monde).getByRole('button', { name: 'Enregistrer le rétroplanning' }).click();
        await expect(annonces(monde).filter({ hasText: 'Rétroplanning mis à jour.' }).first()).toBeVisible({
            timeout: 20000
        });
    }
);

Then("l'atelier {int} est {string} et propose « Inviter »", async ({ monde }, k, statut) => {
    const ligne = ligneJalon(monde, `Atelier ${k}`);
    await expect(ligne.locator('td').nth(6)).toContainText(statut);
    await expect(ligne.getByRole('button', { name: /Inviter/ })).toBeEnabled();
});

const fenetreInvitation = (/** @type {Monde} */ monde) => monde.page.locator('#atMailModal');

When("j'ouvre l'invitation de l'atelier {int}", async ({ monde }, k) => {
    await ligneJalon(monde, `Atelier ${k}`)
        .getByRole('button', { name: /Inviter/ })
        .click();
    await expect(fenetreInvitation(monde)).toBeVisible({ timeout: 20000 });
    await expect(fenetreInvitation(monde)).toContainText(`Invitation — Atelier ${k} · ${samu(monde)}`);
});

Then("l'invitation présente l'objet {string}", async ({ monde }, debut) => {
    await expect(monde.page.locator('#atMailSubject')).toHaveValue(
        new RegExp(`^${avecSamu(monde, debut).replace(/[[\]|.*+?^${}()\\]/g, '\\$&')}.+`)
    );
});

Then("l'invitation propose une fin de l'atelier à {string}", async ({ monde }, heure) => {
    await expect(monde.page.locator('#atMailEnd')).toHaveValue(heure);
});

When("j'ajoute le destinataire {string} à l'invitation", async ({ monde }, adresse) => {
    const champ = fenetreInvitation(monde).locator('#atMailTo input');
    await champ.fill(adresse);
    await champ.press('Enter');
});

Then("l'invitation présente le destinataire {string}", async ({ monde }, adresse) => {
    await expect(fenetreInvitation(monde).locator('#atMailTo')).toContainText(adresse);
});

When("j'annule l'invitation", async ({ monde }) => {
    await fenetreInvitation(monde).getByRole('button', { name: 'Annuler' }).click();
});

Then("l'invitation est fermée sans envoi", async ({ monde }) => {
    await expect(fenetreInvitation(monde)).toBeHidden();
    const { retroplannings } = await (await adminApi(monde)).ok('GET', '/api/affectation/ateliers');
    const r = retroplannings.find((/** @type {any} */ x) => x.samu_name === samu(monde));
    expect(r.lignes.invites ?? {}).toEqual({});
});

// ---------- Sondage ----------

const fenetreSondage = (/** @type {Monde} */ monde) => monde.page.locator('#atSondageModal');
const boutonSondage = (/** @type {Monde} */ monde, /** @type {number} */ k) =>
    ligneJalon(monde, `Atelier ${k}`).locator('td').nth(4).getByRole('button');

When("j'ouvre le sondage de l'atelier {int}", async ({ monde }, k) => {
    await boutonSondage(monde, k).click();
    await expect(fenetreSondage(monde)).toBeVisible({ timeout: 20000 });
});

Then('le sondage est {string}, nommé {string}', async ({ monde }, statut, debut) => {
    await expect(monde.page.locator('#sdBadge')).toHaveText(statut);
    await expect(monde.page.locator('#sdNom')).toHaveValue(
        new RegExp(`^${avecSamu(monde, debut).replace(/[[\]|.*+?^${}()\\]/g, '\\$&')}.+`)
    );
});

When(
    "je propose aussi le {string} de {int} h à {int} h et je génère l'adresse du sondage",
    async ({ monde }, date, debut, fin) => {
        const f = fenetreSondage(monde);
        await f.getByRole('button', { name: '+ Ajouter une date' }).click();
        const rangee = f.locator('#sdOpts .at-opt').last();
        await rangee.locator('input.d').fill(date);
        await rangee.locator('input.d').dispatchEvent('change');
        await rangee.locator('select.sh').selectOption(String(debut).padStart(2, '0'));
        await expect(rangee.locator('select.eh')).toHaveValue(String(debut + 1).padStart(2, '0'));
        await rangee.locator('select.eh').selectOption(String(fin).padStart(2, '0'));
        await f.getByRole('button', { name: 'Génération' }).click();
    }
);

Then("le sondage est {string}, avec son adresse d'accès", async ({ monde }, statut) => {
    await expect(fenetreSondage(monde)).toBeVisible({ timeout: 20000 });
    await expect(monde.page.locator('#sdBadge')).toHaveText(statut);
    await expect(monde.page.locator('#sdUrl')).toHaveValue(/\/sondage\/[\w-]+$/);
    monde.d.urlSondage = await monde.page.locator('#sdUrl').inputValue();
});

/** Page publique dans un navigateur sans session */
async function pagePublique(/** @type {Monde} */ monde, /** @type {string} */ url) {
    const { page } = await monde.anonyme('répondant');
    await page.goto(url);
    return page;
}
async function revenirAdministrateur(/** @type {Monde} */ monde) {
    await monde.acteur('Administrateur');
}

/** Case d'une date de la page publique (colonne dont l'en-tête porte la date) */
async function caseDate(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ date) {
    const fr = date.split('-').reverse().join('/');
    const entetes = await page.locator('thead th').evaluateAll(ths => ths.map(th => th.textContent || ''));
    const i = entetes.findIndex(t => t.includes(fr));
    expect(i, `colonne du ${fr}`).toBeGreaterThan(0);
    return page.locator(`tbody tr.moi td:nth-child(${i + 1}) input[type="checkbox"]`);
}

When('une personne répond {string} pour le {string} sur la page publique du sondage', async ({ monde }, nom, date) => {
    const page = await pagePublique(monde, monde.d.urlSondage);
    await page.locator('#nom').fill(nom);
    await (await caseDate(page, date)).check();
    await page.locator('#envoi').click();
});

Then('la page publique confirme {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#msg')).toHaveText(texte);
});

When("j'actualise les réponses du sondage", async ({ monde }) => {
    await revenirAdministrateur(monde);
    await fenetreSondage(monde).getByRole('button', { name: 'Actualiser' }).click();
});

Then('le sondage présente {int} réponse de {string}', async ({ monde }, n, nom) => {
    await expect(fenetreSondage(monde).locator('#sdResults')).toContainText(`Réponses (${n})`);
    await expect(fenetreSondage(monde).locator('#sdResults')).toContainText(nom);
});

When('je retiens le créneau du {string} et je clôture le sondage', async ({ monde }, date) => {
    const fr = date.split('-').reverse().join('/');
    const f = fenetreSondage(monde);
    await f.locator('#sdChoix label', { hasText: fr }).locator('input[type="radio"]').check();
    const texte = await confirmer(monde, () => f.getByRole('button', { name: 'Clôturer' }).click());
    expect(texte).toContain('Clôturer le sondage avec le créneau retenu');
});

Then("l'atelier {int} est planifié le {string} à {string}", async ({ monde }, k, date, heure) => {
    const ligne = ligneJalon(monde, `Atelier ${k}`);
    await expect(ligne.locator('input[type="date"]')).toHaveValue(date, { timeout: 20000 });
    await expect(ligne.locator('input[type="time"]')).toHaveValue(heure);
});

Then("le sondage de l'atelier {int} indique {string}", async ({ monde }, k, texte) => {
    await expect(boutonSondage(monde, k)).toHaveText(texte, { timeout: 20000 });
});

Then('la page publique du sondage annonce le créneau retenu', async ({ monde }) => {
    const page = await pagePublique(monde, monde.d.urlSondage);
    await expect(page.locator('.retenu')).toContainText('Sondage clôturé — créneau retenu');
    await expect(page.locator('.retenu')).toContainText('08/06/2032 · 14:00 – 16:00');
    await revenirAdministrateur(monde);
});

When("je rouvre le sondage de l'atelier {int}", async ({ monde }, k) => {
    await boutonSondage(monde, k).click();
    await expect(fenetreSondage(monde)).toBeVisible({ timeout: 20000 });
    const texte = await confirmer(monde, () => fenetreSondage(monde).getByRole('button', { name: 'Réouvrir' }).click());
    expect(texte).toContain('Rouvrir le sondage ?');
});

When("je supprime le sondage de l'atelier {int}", async ({ monde }, k) => {
    await boutonSondage(monde, k).click();
    await expect(fenetreSondage(monde)).toBeVisible({ timeout: 20000 });
    const texte = await confirmer(monde, () =>
        fenetreSondage(monde).getByRole('button', { name: 'Supprimer' }).click()
    );
    expect(texte).toContain('Supprimer ce sondage, ses dates et ses réponses ?');
    await expect(fenetreSondage(monde)).toBeHidden();
});

// ---------- Page publique (sondage créé par l'API) ----------

Given(
    "un sondage de test en brouillon propose le {string} pour l'atelier {int} du SAMU de test",
    async ({ monde }, date, k) => {
        const api = await adminApi(monde);
        const corps = {
            samu_name: samu(monde),
            mep: '2032-09-15',
            nb: 3,
            zone: 'A',
            delaiVisite: 14,
            delaiMep: 28,
            ecart12: 7,
            ecartAteliers: 14,
            lignes: {}
        };
        const r = await api.ok('PUT', '/api/affectation/ateliers', corps);
        const s = await api.ok('PUT', `/api/affectation/ateliers/${r.id}/sondages/a${k}`, {
            nom: `E2E sondage ${samu(monde)}`,
            options: [{ date, heure: '14:00', heure_fin: '16:00' }],
            destinataires: [],
            cc_user_ids: [],
            message: ''
        });
        monde.d.urlSondage = s.sondage.url;
    }
);

When('une personne ouvre la page publique du sondage', async ({ monde }) => {
    await pagePublique(monde, monde.d.urlSondage);
    await expect(monde.page.locator('#envoi')).toBeVisible({ timeout: 20000 });
});

When('elle enregistre sa réponse sans nom', async ({ monde }) => {
    await monde.page.locator('#envoi').click();
});

Then('la page publique signale {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#msg')).toHaveText(texte);
});

When('elle saisit le nom {string} et enregistre sa réponse sans cocher de date', async ({ monde }, nom) => {
    await monde.page.locator('#nom').fill(nom);
    await monde.page.locator('#envoi').click();
});

When('elle coche le {string} et enregistre sa réponse', async ({ monde }, date) => {
    await (await caseDate(monde.page, date)).check();
    await monde.page.locator('#envoi').click();
    await expect(monde.page.locator('#msg')).not.toHaveText('', { timeout: 20000 });
});

When('elle rouvre la page publique du sondage', async ({ monde }) => {
    await monde.page.reload();
});

Then('sa réponse {string} est reprise et peut être modifiée', async ({ monde }, nom) => {
    await expect(monde.page.locator('#nom')).toHaveValue(nom);
    await expect(monde.page.locator('#envoi')).toHaveText('Modifier ma réponse');
});

When('elle modifie sa réponse', async ({ monde }) => {
    await monde.page.locator('#envoi').click();
});

When("elle indique « Ce n'est pas moi »", async ({ monde }) => {
    await monde.page.getByRole('button', { name: 'Ce n’est pas moi' }).click();
});

Then('la page publique propose une réponse vierge', async ({ monde }) => {
    await expect(monde.page.locator('#nom')).toHaveValue('');
    await expect(monde.page.locator('#envoi')).toHaveText('Enregistrer ma réponse');
});

When('une personne ouvre une adresse de sondage inconnue', async ({ monde }) => {
    await pagePublique(monde, '/sondage/e2e-sondage-inconnu-0000');
});

Then('la page publique indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#app')).toContainText(texte, { timeout: 20000 });
});

// ---------- Lecture seule ----------

Then("l'enregistrement est réservé aux administrateurs", async ({ monde }) => {
    await expect(onglet(monde).getByRole('button', { name: 'Enregistrer le rétroplanning' })).toHaveCount(0);
    await expect(onglet(monde)).toContainText('Seuls les administrateurs enregistrent un rétroplanning.');
});

// ---------- Cadre ----------

Then("l'en-tête de l'aide à l'affectation présente {string} et {string}", async ({ monde }, nom, profil) => {
    await expect(monde.page.locator('#affectationUserDisplayName')).toHaveText(nom);
    await expect(monde.page.locator('#affectationUserDisplayRole')).toHaveText(profil);
});

const ONGLETS = /** @type {Record<string, [string, string]>} */ ({
    'Planning des déploiements': ['#affectationTabPlanning', '#affectationPlanningTab'],
    Événements: ['#affectationTabEvents', '#affectationEventsTab']
});

When("je passe sur l'onglet « {}» de l'aide à l'affectation", async ({ monde }, nom) => {
    await monde.page.locator(ONGLETS[nom.trim()]?.[0] ?? '').click();
});

Then("l'onglet « {}» de l'aide à l'affectation est affiché", async ({ monde }, nom) => {
    const [bouton, zone] = ONGLETS[nom.trim()] ?? ['', ''];
    await expect(monde.page.locator(bouton)).toHaveClass(/\bactive\b/);
    await expect(monde.page.locator(zone)).toBeVisible();
});

When("je renonce à me déconnecter de l'aide à l'affectation", async ({ monde }) => {
    await annulerConfirmation(monde, () =>
        monde.page
            .locator('#affectationContainer .logout-icon, #affectationContainer [title="Déconnexion"]')
            .first()
            .click()
    );
});

When("je rouvre l'aide à l'affectation par le menu Applications", async ({ monde }) => {
    const page = monde.page;
    await page.locator('#appSwitcherBtn').click();
    await page.locator('#appSwitcherDropdown > div', { hasText: 'Planification' }).click();
    await expect(page.locator('#affectationContainer')).toBeHidden();
    await ouvrirAffectation(monde);
});
