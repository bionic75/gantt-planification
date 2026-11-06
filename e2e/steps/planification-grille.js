// @ts-check
// Planification › grille : saisie des demi-journées (disponibilité, affectation, localisation, SAMU), refus, compteurs,
// navigation et zoom. Ressources de test et mois M+3 (expert de test : mois M+3 remis en état).
import { expect } from '@playwright/test';
import {
    adminApi,
    aujourdhuiParis,
    cle,
    creerRessource,
    nettoyerMoisExpert,
    ressourceExpert
} from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { ongletPlanification } from './planification.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Page} Page */

const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** Mois M+3 (Paris) : { annee, mois0 } */
function moisM3() {
    const [a, m] = aujourdhuiParis().split('-').map(Number);
    const d = new Date(a, m - 1 + 3, 1);
    return { annee: d.getFullYear(), mois0: d.getMonth() };
}

/** n-ième lundi du mois M+3 : { annee, mois0, jour, date } */
function lundi(/** @type {number} */ n) {
    const { annee, mois0 } = moisM3();
    const premier = 1 + ((8 - new Date(annee, mois0, 1).getDay()) % 7);
    const jour = premier + (n - 1) * 7;
    return { annee, mois0, jour, date: `${annee}-${deux(mois0 + 1)}-${deux(jour)}` };
}
const RANGS = /** @type {Record<string, number>} */ ({ premier: 1, deuxième: 2 });

/** Ressource visée : « la ressource de test » ou « l'expert de test » */
async function ressourceId(/** @type {Monde} */ monde, /** @type {string} */ qui) {
    return qui.includes('expert') ? (await ressourceExpert(monde)).resourceId : monde.d.ressource.id;
}

// ---------- Données ----------

Given('une ressource de test existe', async ({ monde }) => {
    monde.d.ressource = await creerRessource(monde);
});

const ecrire = async (/** @type {Monde} */ monde, /** @type {Record<string, string>} */ cellules) =>
    (await adminApi(monde)).ok('POST', '/api/schedule/save', cellules);

Given('une ressource de test est disponible le premier lundi du mois M+3 au matin', async ({ monde }) => {
    const r = (monde.d.ressource = await creerRessource(monde));
    const { date } = lundi(1);
    await ecrire(monde, { [cle(r.id, 'available', date, 'AM')]: '2', [cle(r.id, 'activity', date, 'AM')]: '2' });
});

Given(
    'une ressource de test est affectée en {string} le premier lundi du mois M+3 au matin par {string}',
    async ({ monde }, affectation, auteur) => {
        const r = (monde.d.ressource = await creerRessource(monde));
        const { date } = lundi(1);
        await ecrire(monde, {
            [cle(r.id, 'available', date, 'AM')]: '2',
            [cle(r.id, 'activity', date, 'AM')]: affectation,
            [cle(r.id, 'author', date, 'AM')]: auteur
        });
    }
);

Given('la ressource de test est en congés le deuxième lundi du mois M+3 au matin', async ({ monde }) => {
    const r = monde.d.ressource;
    const { date } = lundi(2);
    await ecrire(monde, {
        [cle(r.id, 'available', date, 'AM')]: '3',
        [cle(r.id, 'activity', date, 'AM')]: '1',
        [cle(r.id, 'localisation', date, 'AM')]: '🏖️'
    });
});

Given("le mois M+3 de l'expert de test sera remis en état après le scénario", async ({ monde }) => {
    const { annee, mois0 } = moisM3();
    await nettoyerMoisExpert(monde, annee, mois0);
});

Given("une ressource de test mise à disposition jusqu'au dernier jour du mois M+3 existe", async ({ monde }) => {
    const { annee, mois0 } = moisM3();
    const fin = `${annee}-${deux(mois0 + 1)}-${deux(new Date(annee, mois0 + 1, 0).getDate())}`;
    const r = (monde.d.ressource = await creerRessource(monde, { date_fin: fin }));
    // Période de MAD créée avec la ressource (sans fin) : close au dernier jour du mois
    const api = await adminApi(monde);
    const [periode] = await api.ok('GET', `/api/resources/${r.id}/mad-history`);
    await api.ok('PUT', `/api/resources/${r.id}/mad-history/${periode.id}`, {
        taux: periode.taux,
        date_debut: periode.date_debut,
        date_fin: fin
    });
});

Given(
    'une ressource de test mise à disposition à 100 % à partir du premier lundi du mois M+3 existe',
    async ({ monde }) => {
        // Période de MAD créée avec la ressource : à partir de sa date de début, au taux de la ressource
        monde.d.ressource = await creerRessource(monde, { date_debut: lundi(1).date, taux: 100 });
    }
);

// ---------- Navigation ----------

async function optionsAffichage(/** @type {Page} */ page) {
    await ongletPlanification(page);
    if (!(await page.locator('#planningControlsSection').isVisible()))
        await page.locator('#planning h3', { hasText: "Options d'affichage" }).click();
}

When("j'affiche le mois M+3 dans la planification", async ({ monde }) => {
    const { annee, mois0 } = moisM3();
    await optionsAffichage(monde.page);
    await monde.page.locator('#yearSelect').selectOption(String(annee));
    await monde.page.locator('#monthSelect').selectOption(String(mois0));
    await expect(monde.page.locator('#currentMonthDisplay')).toContainText(String(annee));
});

When('je retire le filtre des ressources', async ({ monde }) => {
    await optionsAffichage(monde.page);
    await monde.page.locator('#resourceFilter').selectOption('');
});

// ---------- Cellules ----------

const cellule = async (/** @type {Monde} */ monde, /** @type {string} */ qui, /** @type {string} */ rang) => {
    const id = await ressourceId(monde, qui);
    const { annee, mois0, jour } = lundi(RANGS[rang] ?? 1);
    return monde.page.locator(
        `#ganttBody tr[data-resource-id="${id}"] td[data-date="${annee}-${mois0 + 1}-${jour}"][data-period="AM"]`
    );
};

const LIGNES = /** @type {Record<string, number>} */ ({ disponibilité: 0, affectation: 1, localisation: 2 });

When(
    /^je clique (?:(\d+) fois )?sur (?:la |l')(disponibilité|affectation|localisation) (?:de )?(la ressource de test|l'expert de test) le (premier|deuxième) lundi du mois au matin$/,
    async ({ monde }, fois, ligne, qui, rang) => {
        const c = await cellule(monde, qui, rang);
        await expect(c).toBeVisible();
        for (let i = 0; i < Number(fois || 1); i++) {
            // Clic par le DOM : la cellule peut être sous l'en-tête collant de la grille
            await c
                .locator('.gantt-cell-row')
                .nth(LIGNES[ligne])
                .evaluate(e => /** @type {HTMLElement} */ (e).click());
            if (fois) await monde.page.waitForTimeout(150);
        }
    }
);

Then(
    /^la demi-journée de (la ressource de test|l'expert de test) le (premier|deuxième) lundi du mois au matin affiche "([^"]*)", "([^"]*)", "([^"]*)"$/,
    async ({ monde }, qui, rang, dispo, affectation, localisation) => {
        const lignes = (await cellule(monde, qui, rang)).locator('.gantt-cell-row');
        await expect(lignes).toHaveText([dispo, affectation, localisation]);
    }
);

Then(
    /^la demi-journée de (la ressource de test|l'expert de test) le (premier|deuxième) lundi du mois au matin affiche "congés"$/,
    async ({ monde }, qui, rang) => {
        const lignes = (await cellule(monde, qui, rang)).locator('.gantt-cell-row');
        await expect(lignes.nth(1)).toHaveAttribute('title', /Congés/);
    }
);

Then(
    /^la planification de (la ressource de test|l'expert de test) le (premier|deuxième) lundi du mois au matin est "([^"]*)", "([^"]*)", (?:"([^"]*)"|sans localisation)$/,
    async ({ monde }, qui, rang, dispo, affectation, localisation) => {
        const id = await ressourceId(monde, qui);
        const { date } = lundi(RANGS[rang] ?? 1);
        const api = await adminApi(monde);
        await expect
            .poll(async () => {
                const p = await api.ok('GET', '/api/schedule');
                return [
                    p[cle(id, 'available', date, 'AM')],
                    p[cle(id, 'activity', date, 'AM')],
                    p[cle(id, 'localisation', date, 'AM')]
                ];
            })
            .toEqual([dispo, affectation, localisation ?? undefined]);
    }
);

When(
    "l'affectation de la ressource de test le premier lundi du mois au matin passe à {string} depuis un autre poste",
    async ({ monde }, valeur) => {
        const { date } = lundi(1);
        await ecrire(monde, { [cle(monde.d.ressource.id, 'activity', date, 'AM')]: valeur });
    }
);

Then('les totaux du premier lundi du mois indiquent {string} et {string}', async ({ monde }, dispo, affect) => {
    const { jour } = lundi(1);
    // Colonnes des totaux : une par jour, après les deux colonnes d'en-tête de la ligne
    const total = monde.page.locator('#ganttBody tr.total-row td.total-cell').nth(jour - 1);
    await expect(total).toContainText(dispo);
    await expect(total).toContainText(affect);
});

// ---------- Localisation et SAMU ----------

const fenetreLocalisation = (/** @type {Monde} */ monde) => monde.page.locator('#localisationModal');

Then('la fenêtre des localisations a pour titre {string}', async ({ monde }, titre) => {
    await expect(fenetreLocalisation(monde)).toBeVisible();
    await expect(monde.page.locator('#localisationModalTitle')).toHaveText(titre);
});

Then(/^la fenêtre des localisations propose (.+)$/, async ({ monde }, liste) => {
    const attendus = [...liste.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    await expect(monde.page.locator('#localisationOptionsContainer button')).toHaveText(attendus);
});

When('je choisis la localisation {string}', async ({ monde }, libelle) => {
    await monde.page.locator('#localisationOptionsContainer button', { hasText: libelle }).click();
});

When('je valide le choix du SAMU sans en choisir', async ({ monde }) => {
    await expect(monde.page.locator('#samuModal')).toBeVisible();
    await monde.page.locator('#samuModal').getByRole('button', { name: 'Valider', exact: true }).click();
});

When('je valide le choix du SAMU {string}', async ({ monde }, samu) => {
    await monde.page.locator('#samuSelect').selectOption(samu);
    await monde.page.locator('#samuModal').getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(monde.page.locator('#samuModal')).toBeHidden();
});

// ---------- Confirmation de modification ----------

const confirmation = (/** @type {Monde} */ monde) => monde.page.locator('#assignmentConfirmModal');

Then(
    "la confirmation de modification signale l'affectation {string} posée par {string}",
    async ({ monde }, affectation, auteur) => {
        const c = confirmation(monde);
        await expect(c).toBeVisible();
        await expect(c).toContainText("Cette affectation a été posée par quelqu'un d'autre.");
        await expect(c).toContainText(`Veuillez contacter ${auteur} avant toute modification.`);
        await expect(c).toContainText(affectation);
    }
);

When("j'abandonne la modification", async ({ monde }) => {
    await confirmation(monde).getByRole('button', { name: 'Abandonner' }).click();
    await expect(confirmation(monde)).toBeHidden();
});

When('je poursuis la modification', async ({ monde }) => {
    await confirmation(monde).getByRole('button', { name: 'Je veux quand même poursuivre' }).click();
    await expect(confirmation(monde)).toBeHidden();
});

// ---------- Compteur ----------

Then(
    'le compteur de la ressource de test indique les jours ouvrés du mois à partir du premier lundi',
    async ({ monde }) => {
        const { annee, mois0, jour } = lundi(1);
        let ouvres = 0;
        for (let j = jour; j <= new Date(annee, mois0 + 1, 0).getDate(); j++) {
            const d = new Date(annee, mois0, j).getDay();
            if (d !== 0 && d !== 6) ouvres++;
        }
        const ligne = monde.page.locator(
            `#ganttBody tr[data-resource-id="${monde.d.ressource.id}"] td.resource-header`
        );
        await expect(ligne).toContainText(`Jours: 0/${ouvres}.0`);
    }
);

// ---------- Navigation au-delà de la dernière année, zoom ----------

When("j'affiche le mois de décembre de la dernière année proposée dans la planification", async ({ monde }) => {
    const page = monde.page;
    await optionsAffichage(page);
    const annees = await page
        .locator('#yearSelect option')
        .evaluateAll(os => os.map(o => /** @type {HTMLOptionElement} */ (o).value));
    monde.d.derniereAnnee = Number(annees.at(-1));
    await page.locator('#yearSelect').selectOption(String(monde.d.derniereAnnee));
    await page.locator('#monthSelect').selectOption('11');
    await expect(page.locator('#currentMonthDisplay')).toHaveText(`Décembre ${monde.d.derniereAnnee}`);
});

When('je passe au mois suivant dans la planification', async ({ monde }) => {
    await monde.page.locator('#ganttHeaderButtons button', { hasText: 'Mois suivant' }).click();
});

Then("la planification affiche janvier de l'année suivante", async ({ monde }) => {
    const annee = monde.d.derniereAnnee + 1;
    await expect(monde.page.locator('#currentMonthDisplay')).toHaveText(`Janvier ${annee}`);
    await expect(monde.page.locator('#yearSelect')).toHaveValue(String(annee));
    await expect(monde.page.locator('#monthSelect')).toHaveValue('0');
});

Then('la grille de la planification présente {int} jours', async ({ monde }, n) => {
    await expect(monde.page.locator('#planning th.day-name-header')).toHaveCount(n);
});

When(/^je zoome (\d+) fois en (avant|arrière)$/, async ({ monde }, n, sens) => {
    const bouton = monde.page.getByTitle(sens === 'avant' ? 'Agrandir (zoom avant)' : 'Réduire (zoom arrière)');
    for (let i = 0; i < Number(n); i++) await bouton.click();
});

When('je réinitialise le zoom', async ({ monde }) => {
    await monde.page.getByTitle('Réinitialiser le zoom à 100%').click();
});

Then('le zoom indique {string}', async ({ monde }, niveau) => {
    await expect(monde.page.locator('#zoomLevelDisplay')).toHaveText(niveau);
});
