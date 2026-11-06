// @ts-check
// Planification › exports et impressions : téléchargement CSV, impression A4, calendrier d'une ressource (aperçu,
// impression, envoi par e-mail arrêté à la confirmation). Aucun message n'est envoyé.
import { expect } from '@playwright/test';
import { adminApi, aujourdhuiParis, ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, telecharger } from '../support/interface.js';
import { ongletPlanification } from './planification.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');
const libelleMois = (/** @type {number} */ annee, /** @type {number} */ mois0) => {
    const l = new Date(annee, mois0, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return l.charAt(0).toUpperCase() + l.slice(1);
};
/** Mois M+n (Paris) */
function mois(/** @type {number} */ decalage) {
    const [a, m] = aujourdhuiParis().split('-').map(Number);
    const d = new Date(a, m - 1 + decalage, 1);
    return { annee: d.getFullYear(), mois0: d.getMonth() };
}

/** Premier lundi du mois M+5 : { annee, mois0, jour, date } */
function premierLundiM5() {
    const { annee, mois0 } = mois(5);
    const jour = 1 + ((8 - new Date(annee, mois0, 1).getDay()) % 7);
    return { annee, mois0, jour, date: `${annee}-${deux(mois0 + 1)}-${deux(jour)}` };
}

Given(
    "une astreinte d'export de l'expert de test a lieu le premier lundi du mois M+5 de {string} à {string}",
    async ({ monde }, debut, fin) => {
        const api = await adminApi(monde);
        const objet = monde.unique('Astr export E2E');
        monde.aNettoyer("astreinte d'export", async () => {
            const toutes = await api.ok('GET', '/api/astreintes');
            for (const a of toutes.filter((/** @type {any} */ a) => a.objet === objet))
                await api.ok('DELETE', `/api/astreintes/${a.id}`);
        });
        const { userId } = await ressourceExpert(monde);
        const { date } = premierLundiM5();
        await api.ok('POST', '/api/astreintes', {
            user_id: userId,
            type: 'astreinte',
            date_debut: date,
            date_fin: date,
            heure_debut: debut,
            heure_fin: fin,
            samu: 'SAMU 75',
            tous_samu: false,
            objet
        });
    }
);

When("j'affiche le mois M+5 dans la planification", async ({ monde }) => {
    const { annee, mois0 } = mois(5);
    const page = monde.page;
    await optionsAffichage(monde);
    await page.locator('#yearSelect').selectOption(String(annee));
    await page.locator('#monthSelect').selectOption(String(mois0));
    await expect(page.locator('#currentMonthDisplay')).toHaveText(libelleMois(annee, mois0));
});

/** Options d'affichage dépliées (boutons Télécharger et Imprimer A4) */
async function optionsAffichage(/** @type {Monde} */ monde) {
    const page = monde.page;
    await ongletPlanification(page);
    if (!(await page.locator('#planningControlsSection').isVisible()))
        await page.locator('#planning h3', { hasText: "Options d'affichage" }).click();
    return page.locator('#planningControlsSection');
}

// ---------- Téléchargement ----------

const fenetreTelechargement = (/** @type {Monde} */ monde) => monde.page.locator('#downloadPlanningModal');

When("j'ouvre la fenêtre de téléchargement du planning", async ({ monde }) => {
    await (await optionsAffichage(monde)).getByRole('button', { name: /Télécharger/ }).click();
    await expect(fenetreTelechargement(monde)).toBeVisible();
});

Then(
    'la fenêtre propose seize mois, du mois courant moins douze au mois courant plus trois, le mois courant choisi',
    async ({ monde }) => {
        const liste = monde.page.locator('#downloadMonthSelect');
        const attendus = [-12, 0, 3].map(n => mois(n)).map(m => libelleMois(m.annee, m.mois0));
        const options = liste.locator('option');
        await expect(options).toHaveCount(16);
        await expect(options.first()).toHaveText(attendus[0]);
        await expect(options.last()).toHaveText(attendus[2]);
        const { annee, mois0 } = mois(0);
        await expect(liste).toHaveValue(`${annee}-${deux(mois0 + 1)}`);
    }
);

When('je télécharge le planning au format CSV', async ({ monde }) => {
    monde.d.fichier = await telecharger(
        monde,
        fenetreTelechargement(monde).getByRole('button', { name: /Télécharger au format CSV/ })
    );
});

Then('le fichier {string} présente le planning du mois courant', async ({ monde }, _modele) => {
    const { annee, mois0 } = mois(0);
    const { nom, contenu } = monde.d.fichier;
    expect(nom).toMatch(
        new RegExp(
            `^Expert_Planning_${annee}${deux(mois0 + 1)}_Sauvegarde_de_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}\\.csv$`
        )
    );
    // Marque d'ordre des octets (BOM) en tête du fichier
    expect(contenu.replace(new RegExp('^\\uFEFF'), '').split('\n')[0]).toBe(`Planning - ${libelleMois(annee, mois0)}`);
});

When("j'abandonne le téléchargement", async ({ monde }) => {
    await fenetreTelechargement(monde).getByRole('button', { name: 'Annuler', exact: true }).click();
});

Then('la fenêtre de téléchargement est fermée', async ({ monde }) => {
    await expect(fenetreTelechargement(monde)).toBeHidden();
});

// ---------- Impression A4 ----------

Given('les impressions de la page sont interceptées', async ({ monde }) => {
    await monde.page.evaluate(() => {
        Object.assign(window, { __impressionsPage: 0 });
        window.print = () => {
            /** @type {any} */ (window).__impressionsPage++;
        };
    });
});

When("j'imprime la planification au format A4", async ({ monde }) => {
    await (await optionsAffichage(monde)).getByRole('button', { name: 'Imprimer A4' }).click();
});

Then("l'impression de la page est demandée une seule fois", async ({ monde }) => {
    await expect.poll(() => monde.page.evaluate(() => /** @type {any} */ (window).__impressionsPage)).toBe(1);
    await monde.page.waitForTimeout(500);
    expect(await monde.page.evaluate(() => /** @type {any} */ (window).__impressionsPage)).toBe(1);
});

// ---------- Calendrier d'une ressource ----------

const apercu = (/** @type {Monde} */ monde) => monde.page.locator('#printCalendarModal');

async function boutonsRessource(/** @type {Monde} */ monde, /** @type {string} */ qui) {
    const id = qui.includes('expert') ? (await ressourceExpert(monde)).resourceId : monde.d.ressource.id;
    const ligne = monde.page.locator(`#ganttBody tr[data-resource-id="${id}"]`);
    await ligne.scrollIntoViewIfNeeded();
    return ligne;
}

When("j'ouvre l'aperçu du calendrier de l'expert de test", async ({ monde }) => {
    await (await boutonsRessource(monde, 'expert')).getByTitle('Imprimer le calendrier').click();
});

Then("l'aperçu présente le calendrier de l'expert de test pour le mois M+5", async ({ monde }) => {
    const { annee, mois0 } = mois(5);
    const { resourceId } = await ressourceExpert(monde);
    const ressource = (await (await adminApi(monde)).ok('GET', '/api/resources')).find(
        (/** @type {any} */ r) => r.id === resourceId
    );
    await expect(apercu(monde)).toBeVisible();
    const contenu = monde.page.locator('#calendarToPrint');
    await expect(contenu.locator('h2')).toHaveText(`Planning - ${ressource.nom.toUpperCase()} ${ressource.prenom}`);
    await expect(contenu.locator('h3')).toHaveText(libelleMois(annee, mois0));
    await expect(contenu).toContainText(`Trigramme: ${ressource.trigramme}`);
    monde.d.ressourceCalendrier = ressource;
});

Then("l'aperçu porte la pastille {string} l'après-midi du premier lundi du mois", async ({ monde }, pastille) => {
    const { jour: lundi } = premierLundiM5();
    const jour = monde.page
        .locator('#calendarToPrint td')
        .filter({ has: monde.page.locator('div', { hasText: new RegExp(`^${lundi}$`) }) });
    // Demi-journée : bloc qui porte le libellé « AM: » ou « PM: »
    const demi = (/** @type {string} */ p) =>
        jour.locator('div').filter({ has: monde.page.locator('strong', { hasText: `${p}:` }) });
    await expect(demi('PM').locator('span')).toHaveText(pastille);
    await expect(demi('AM').locator('span')).toHaveCount(0);
});

When("j'imprime l'aperçu du calendrier", async ({ monde }) => {
    monde.d.impressions = await monde.page.evaluate(() => /** @type {any} */ (window).__impressions.length);
    await apercu(monde)
        .getByRole('button', { name: /Imprimer/ })
        .click();
});

Then("le calendrier de l'expert de test est imprimé une seule fois, en paysage", async ({ monde }) => {
    const dernier = () =>
        monde.page.evaluate(
            n => /** @type {any} */ (window).__impressions.slice(n).at(-1) ?? null,
            /** @type {number} */ (monde.d.impressions)
        );
    await expect.poll(async () => (await dernier())?.impressions ?? 0).toBeGreaterThan(0);
    await monde.page.waitForTimeout(1000);
    const { html, impressions } = await dernier();
    expect(impressions).toBe(1);
    expect(html).toContain('<title>Planning individuel</title>');
    expect(html).toContain('size: landscape');
    expect(html).toContain(`Planning - ${monde.d.ressourceCalendrier.nom.toUpperCase()}`);
});

When("je ferme l'aperçu du calendrier", async ({ monde }) => {
    await apercu(monde).getByRole('button', { name: 'Fermer', exact: true }).last().click();
});

Then("l'aperçu du calendrier est fermé", async ({ monde }) => {
    await expect(apercu(monde)).toBeHidden();
});

// ---------- Envoi par e-mail (jamais effectué) ----------

/** Demandes d'envoi du calendrier relevées sur la page */
function suivreEnvois(/** @type {Monde} */ monde) {
    if (monde.d.envoisCalendrier) return;
    monde.d.envoisCalendrier = [];
    monde.page.on('request', r => {
        if (r.url().includes('/api/send-calendar-email')) monde.d.envoisCalendrier.push(r.url());
    });
}

When("je demande l'envoi par e-mail du calendrier de l'expert de test et refuse la confirmation", async ({ monde }) => {
    suivreEnvois(monde);
    const ligne = await boutonsRessource(monde, 'expert');
    monde.d.confirmationEnvoi = await annulerConfirmation(monde, () => ligne.getByTitle('Envoyer par email').click());
});

When("je demande l'envoi par e-mail du calendrier de la ressource de test", async ({ monde }) => {
    suivreEnvois(monde);
    await (await boutonsRessource(monde, 'ressource')).getByTitle('Envoyer par email').click();
});

Then("la confirmation proposait l'envoi à l'adresse de l'expert de test", async ({ monde }) => {
    const { resourceId } = await ressourceExpert(monde);
    const { email } = await (await adminApi(monde)).ok('GET', `/api/user/email-by-resource/${resourceId}`);
    expect(monde.d.confirmationEnvoi).toContain(`Envoyer le calendrier par email à ${email} ?`);
});

Then("aucun calendrier n'a été envoyé", async ({ monde }) => {
    await monde.page.waitForTimeout(500);
    expect(monde.d.envoisCalendrier).toEqual([]);
});
