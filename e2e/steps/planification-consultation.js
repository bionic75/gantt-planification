// @ts-check
// Planification › fenêtres de consultation : vue calendrier mensuel, calendrier des congés et événements, recherche
// avancée, impression des calendriers (document intercepté, sans boîte de dialogue d'impression)
import { expect } from '@playwright/test';
import { adminApi, aujourdhuiParis, cle, creerEvenement, creerRessource } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { ongletPlanification } from './planification.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Locator} Locator */

const MOIS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];
const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** Mois courant à Paris, éventuellement décalé : { annee, mois0, libelle } */
function moisParis(decalage = 0) {
    const [a, m] = aujourdhuiParis().split('-').map(Number);
    const d = new Date(a, m - 1 + decalage, 1);
    return { annee: d.getFullYear(), mois0: d.getMonth(), libelle: `${MOIS[d.getMonth()]} ${d.getFullYear()}` };
}

/** Semaine ISO 8601 d'une date (calendrier local) */
function semaineIso(/** @type {Date} */ date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
}

/** Semaines ISO des lignes d'un mois (lundi en tête de ligne) */
function semainesDuMois(/** @type {number} */ annee, /** @type {number} */ mois0) {
    const decalage = (new Date(annee, mois0, 1).getDay() + 6) % 7;
    const jours = new Date(annee, mois0 + 1, 0).getDate();
    const lignes = Math.ceil((decalage + jours) / 7);
    return Array.from({ length: lignes }, (_, i) => String(semaineIso(new Date(annee, mois0, 1 - decalage + i * 7))));
}

// ---------- Données ----------

Given(
    'une ressource de test est disponible le {string} matin et après-midi et le {string} matin',
    async ({ monde }, jour1, jour2) => {
        const r = await creerRessource(monde);
        monde.d.ressource = r;
        // Planification supprimée avec la ressource en fin de scénario
        await (
            await adminApi(monde)
        ).ok('POST', '/api/schedule', {
            [cle(r.id, 'available', jour1, 'AM')]: '2',
            [cle(r.id, 'available', jour1, 'PM')]: '2',
            [cle(r.id, 'available', jour2, 'AM')]: '2'
        });
    }
);

Given('un événement de test a lieu le {string}', async ({ monde }, date) => {
    monde.d.evenement = monde.unique('Évt E2E');
    await creerEvenement(monde, { startDate: date, label: monde.d.evenement });
});

// ---------- Vue calendrier mensuel ----------

const mensuel = (/** @type {Monde} */ monde) => monde.page.locator('#monthlyCalendarModal');
const titreMensuel = (/** @type {Monde} */ monde) => mensuel(monde).locator('h2');

When("j'ouvre la vue calendrier mensuel", async ({ monde }) => {
    await ongletPlanification(monde.page);
    await monde.page.locator('#ganttHeaderButtons button[title="Vue calendrier mensuel"]').click();
    await expect(mensuel(monde)).toBeVisible();
});

When('je filtre la planification sur la ressource de test', async ({ monde }) => {
    const page = monde.page;
    await ongletPlanification(page);
    // Filtre dans la section repliable « Options d'affichage »
    if (!(await page.locator('#planningControlsSection').isVisible()))
        await page.locator('#planning h3', { hasText: "Options d'affichage" }).click();
    await page.locator('#resourceFilter').selectOption(String(monde.d.ressource.id));
});

Then('le calendrier mensuel affiche {string}', async ({ monde }, titre) => {
    await expect(titreMensuel(monde)).toHaveText(titre);
});

Then('le calendrier mensuel affiche le mois de la planification', async ({ monde }) => {
    const annee = await monde.page.locator('#yearSelect').inputValue();
    const mois0 = Number(await monde.page.locator('#monthSelect').inputValue());
    await expect(titreMensuel(monde)).toHaveText(`${MOIS[mois0]} ${annee}`);
});

/**
 * Mène un calendrier jusqu'au mois voulu par ses boutons « Mois précédent » / « Mois suivant », un clic après
 * l'autre (chacun attendu)
 */
async function mener(
    /** @type {Locator} */ titre,
    /** @type {(sens: 'Mois précédent' | 'Mois suivant') => Promise<void>} */ cliquer,
    /** @type {string} */ libelle
) {
    const rang = (/** @type {string} */ t) => {
        const [nom, annee] = t.trim().split(' ');
        return Number(annee) * 12 + MOIS.indexOf(nom);
    };
    const cible = rang(libelle);
    for (let i = 0; i < 240; i++) {
        const actuel = (await titre.textContent()) ?? '';
        const ecart = cible - rang(actuel);
        if (ecart === 0) return;
        await cliquer(ecart > 0 ? 'Mois suivant' : 'Mois précédent');
        await expect(titre).not.toHaveText(actuel);
    }
    await expect(titre).toHaveText(libelle);
}

When("j'affiche {string} dans le calendrier mensuel", async ({ monde }, libelle) => {
    await mener(titreMensuel(monde), sens => mensuel(monde).locator(`button[title="${sens}"]`).click(), libelle);
});

Then('les semaines du calendrier mensuel sont {string}', async ({ monde }, semaines) => {
    await expect(mensuel(monde).locator('tbody tr > td:first-child')).toHaveText(semaines.split(', '));
});

/** Case d'un jour du mois : son premier bloc porte le numéro du jour */
const caseDuJour = (/** @type {Locator} */ calendrier, /** @type {number} */ jour) =>
    calendrier
        .locator('tbody td')
        .filter({ has: calendrier.page().locator(`xpath=./div[1][normalize-space(.)="${jour}"]`) });

/** Trigrammes du matin et de l'après-midi d'une case (deux derniers blocs) */
const presents = (/** @type {Locator} */ caseJour) =>
    caseJour.evaluate(td =>
        [...td.children]
            .slice(-2)
            .map(bloc => [...bloc.querySelectorAll('span')].map(s => (s.textContent ?? '').trim()).filter(Boolean))
    );

Then(
    /^la ressource de test figure le (\d+) du calendrier mensuel (le matin et l'après-midi|le matin seulement)$/,
    async ({ monde }, jour, quand) => {
        const tri = monde.d.ressource.trigramme;
        const caseJour = caseDuJour(mensuel(monde), Number(jour));
        await expect(caseJour).toHaveCount(1);
        const [matin, apresMidi] = await presents(caseJour);
        expect(matin).toContain(tri);
        if (quand === "le matin et l'après-midi") expect(apresMidi).toContain(tri);
        else expect(apresMidi).not.toContain(tri);
    }
);

const legende = (/** @type {Monde} */ monde) =>
    mensuel(monde).locator('div:has(> div:text-is("Légende des experts:")) > div:nth-child(2) > div');

const entreeLegende = (/** @type {Monde} */ monde) =>
    `${monde.d.ressource.trigramme} - ${monde.d.ressource.nom} ${monde.d.ressource.prenom}`;

Then('la légende du calendrier mensuel présente la ressource de test', async ({ monde }) => {
    await expect(legende(monde).filter({ hasText: entreeLegende(monde) })).toHaveCount(1);
});

Then('la légende du calendrier mensuel ne présente que la ressource de test', async ({ monde }) => {
    await expect(legende(monde)).toHaveText([entreeLegende(monde)]);
});

When('je passe au mois suivant dans le calendrier mensuel', async ({ monde }) => {
    await mensuel(monde).locator('button[title="Mois suivant"]').click();
});

When('je reviens de {int} mois en arrière dans le calendrier mensuel', async ({ monde }, n) => {
    for (let i = 0; i < n; i++) {
        const avant = await titreMensuel(monde).textContent();
        await mensuel(monde).locator('button[title="Mois précédent"]').click();
        await expect(titreMensuel(monde)).not.toHaveText(avant ?? '');
    }
});

/** Bouton « Fermer » du bas de la fenêtre (une fenêtre Vue a aussi une croix nommée « Fermer ») */
const fermer = (/** @type {Locator} */ fenetre) => fenetre.getByRole('button', { name: 'Fermer', exact: true }).last();

When('je ferme le calendrier mensuel', async ({ monde }) => {
    await fermer(mensuel(monde)).click();
});

Then('le calendrier mensuel est fermé', async ({ monde }) => {
    await expect(mensuel(monde)).toBeHidden();
});

Then("l'événement de test figure le {int} du calendrier mensuel", async ({ monde }, jour) => {
    await expect(caseDuJour(mensuel(monde), jour)).toContainText(monde.d.evenement);
});

// ---------- Calendrier des congés et événements ----------

const evenements = (/** @type {Monde} */ monde) => monde.page.locator('#eventsCalendarModal');
const titreEvenements = (/** @type {Monde} */ monde) => monde.page.locator('#eventsCalendarTitle');

When("j'ouvre le calendrier des congés et événements", async ({ monde }) => {
    await ongletPlanification(monde.page);
    await monde.page.locator('#ganttHeaderButtons button', { hasText: 'Visualiser les événements' }).click();
    await expect(evenements(monde)).toBeVisible();
});

Then('le calendrier des événements affiche le mois courant', async ({ monde }) => {
    await expect(titreEvenements(monde)).toHaveText(moisParis().libelle);
});

Then('le calendrier des événements affiche le mois suivant le mois courant', async ({ monde }) => {
    await expect(titreEvenements(monde)).toHaveText(moisParis(1).libelle);
});

Then('les semaines et les jours du calendrier des événements correspondent au mois affiché', async ({ monde }) => {
    const { annee, mois0 } = moisParis();
    const grille = evenements(monde).locator('table');
    await expect(grille.locator('tbody tr > td:first-child')).toHaveText(semainesDuMois(annee, mois0));
    // Cases des jours : celles qui portent un numéro (les cases hors du mois sont vides)
    await expect(grille.locator('tbody td:not(:first-child):has(> div)')).toHaveCount(
        new Date(annee, mois0 + 1, 0).getDate()
    );
});

const naviguerEvenements = async (/** @type {Monde} */ monde, /** @type {string} */ sens) => {
    const avant = await titreEvenements(monde).textContent();
    await evenements(monde).getByRole('button', { name: sens }).click();
    await expect(titreEvenements(monde)).not.toHaveText(avant ?? '');
};

When('je passe au mois suivant dans le calendrier des événements', async ({ monde }) => {
    await naviguerEvenements(monde, 'Mois suivant');
});

When('je reviens au mois précédent dans le calendrier des événements', async ({ monde }) => {
    await naviguerEvenements(monde, 'Mois précédent');
});

When("j'affiche {string} dans le calendrier des événements", async ({ monde }, libelle) => {
    await mener(titreEvenements(monde), sens => evenements(monde).getByRole('button', { name: sens }).click(), libelle);
});

Then("l'événement de test figure le {int} du calendrier des événements", async ({ monde }, jour) => {
    await expect(caseDuJour(evenements(monde), jour)).toContainText(monde.d.evenement);
});

When('je ferme le calendrier des événements', async ({ monde }) => {
    await fermer(evenements(monde)).click();
});

Then('le calendrier des événements est fermé', async ({ monde }) => {
    await expect(evenements(monde)).toBeHidden();
});

// ---------- Recherche avancée ----------

const recherche = (/** @type {Monde} */ monde) => monde.page.locator('#searchModal');

When("j'ouvre la recherche avancée", async ({ monde }) => {
    await monde.page.locator('#searchBtn').click();
    await expect(recherche(monde)).toBeVisible();
});

Then('la recherche propose du premier au dernier jour du mois courant', async ({ monde }) => {
    const { annee, mois0 } = moisParis();
    const prefixe = `${annee}-${deux(mois0 + 1)}`;
    await expect(monde.page.locator('#searchStartDate')).toHaveValue(`${prefixe}-01`);
    await expect(monde.page.locator('#searchEndDate')).toHaveValue(
        `${prefixe}-${deux(new Date(annee, mois0 + 1, 0).getDate())}`
    );
});

const lancerRecherche = (/** @type {Monde} */ monde) =>
    recherche(monde)
        .getByRole('button', { name: /Rechercher/ })
        .click();

When(
    'je recherche les demi-journées {string} de la ressource de test du {string} au {string}',
    async ({ monde }, disponibilite, debut, fin) => {
        const page = monde.page;
        await page.locator('#searchExperts').selectOption(String(monde.d.ressource.id));
        await page.locator('#searchAvailability').selectOption({ label: disponibilite });
        await page.locator('#searchStartDate').fill(debut);
        await page.locator('#searchEndDate').fill(fin);
        await lancerRecherche(monde);
    }
);

Then('la recherche trouve la ressource de test avec {int} demi-journées : {string}', async ({ monde }, n, details) => {
    const resultats = monde.page.locator('#searchResultsContent');
    await expect(resultats).toContainText('1 expert(s) trouvé(s)');
    const r = monde.d.ressource;
    await expect(resultats.locator('tbody tr')).toHaveCount(1);
    await expect(resultats.locator('tbody tr td')).toHaveText([`${r.nom} ${r.prenom}`, String(n), details]);
});

Then(
    "le classement présente {int} créneaux d'un expert, du {string} matin au {string} matin",
    async ({ monde }, n, premier, dernier) => {
        const classement = monde.page.locator('#searchSlotRanking');
        await expect(classement).toBeVisible();
        await expect(classement).toContainText(`${n} créneau(x) trouvé(s)`);
        const lignes = classement.locator('tbody tr');
        await expect(lignes).toHaveCount(n);
        const tri = monde.d.ressource.trigramme;
        await expect(lignes.first().locator('td')).toHaveText(['1', premier, 'Matin', '1', tri]);
        await expect(lignes.last().locator('td')).toHaveText([String(n), dernier, 'Matin', '1', tri]);
    }
);

When('je réinitialise la recherche', async ({ monde }) => {
    await recherche(monde)
        .getByRole('button', { name: /Réinitialiser/ })
        .click();
});

Then('la recherche invite à choisir des critères', async ({ monde }) => {
    await expect(monde.page.locator('#searchResultsContent')).toHaveText(
        'Sélectionnez vos critères et cliquez sur "Rechercher"'
    );
    await expect(monde.page.locator('#searchSlotRanking')).toBeHidden();
    for (const id of ['searchExperts', 'searchAvailability', 'searchActivity', 'searchLocation'])
        expect(
            await monde.page
                .locator(`#${id}`)
                .evaluate(s => /** @type {HTMLSelectElement} */ (s).selectedOptions.length),
            id
        ).toBe(0);
});

When('je lance la recherche sans date de début', async ({ monde }) => {
    await monde.page.locator('#searchStartDate').fill('');
    await lancerRecherche(monde);
});

When('je ferme la recherche avancée', async ({ monde }) => {
    await fermer(recherche(monde)).click();
});

Then('la recherche avancée est fermée', async ({ monde }) => {
    await expect(recherche(monde)).toBeHidden();
});

// ---------- Impression ----------

/**
 * Fenêtre d'impression remplacée : le document écrit est conservé (window.__impressions), les appels à print() sont
 * comptés sans ouvrir la boîte de dialogue du navigateur ; le chargement de la page (onload) est simulé à sa fermeture
 */
Given('les impressions sont interceptées', async ({ monde }) => {
    await monde.page.evaluate(() => {
        /** @type {{ html: string, css: string, impressions: number }[]} */
        const documents = [];
        Object.assign(window, { __impressions: documents });
        window.open = () => {
            const doc = { html: '', css: '', impressions: 0 };
            documents.push(doc);
            /** @type {any} */
            const fenetre = {
                document: {
                    // Document écrit par ecrireDocument (frontend/src/outils/styles-en-ligne.ts)
                    open() {},
                    write: (/** @type {string} */ h) => (doc.html += h),
                    close: () => setTimeout(() => fenetre.onload?.(), 0),
                    querySelectorAll: () => [],
                    // Feuille construite à partir des blocs <style> du document (règles conservées pour les vérifications)
                    defaultView: window,
                    get adoptedStyleSheets() {
                        return [];
                    },
                    set adoptedStyleSheets(/** @type {CSSStyleSheet[]} */ feuilles) {
                        doc.css += feuilles.map(f => [...f.cssRules].map(r => r.cssText).join('\n')).join('\n');
                    }
                },
                focus() {},
                print() {
                    doc.impressions++;
                },
                close() {}
            };
            return fenetre;
        };
    });
});

When("j'imprime le calendrier", async ({ monde }) => {
    monde.d.impressions = await monde.page.evaluate(() => /** @type {any} */ (window).__impressions.length);
    await monde.page
        .locator('#monthlyCalendarModal:visible, #eventsCalendarModal:visible')
        .getByRole('button', { name: /Imprimer/ })
        .click();
});

/** Dernier document imprimé, une fois print() appelé ; nombre de demandes d'impression une seconde plus tard */
async function documentImprime(/** @type {Monde} */ monde) {
    const dernier = () =>
        monde.page.evaluate(
            n => /** @type {any} */ (window).__impressions.slice(n).at(-1) ?? null,
            /** @type {number} */ (monde.d.impressions)
        );
    await expect.poll(async () => (await dernier())?.impressions ?? 0).toBeGreaterThan(0);
    await monde.page.waitForTimeout(1000);
    const { html, impressions } = await dernier();
    return {
        html: /** @type {string} */ (html),
        impressions: /** @type {number} */ (impressions),
        titre: (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').trim(),
        sousTitre: (/<h2[^>]*>([^<]*)<\/h2>/.exec(html)?.[1] ?? '').trim()
    };
}

Then(
    'le document imprimé a pour titre {string} et pour sous-titre {string}, imprimé une seule fois',
    async ({ monde }, titre, sousTitre) => {
        const lu = await documentImprime(monde);
        expect(lu.titre).toBe(titre);
        expect(lu.sousTitre).toBe(sousTitre);
        expect(lu.impressions).toBe(1);
    }
);

Then('le document imprimé a pour titre « Calendrier des événements - » suivi du mois courant', async ({ monde }) => {
    const { titre } = await documentImprime(monde);
    expect(titre).toBe(`Calendrier des événements - ${moisParis().libelle}`);
});
