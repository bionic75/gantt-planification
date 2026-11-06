// @ts-check
// Planification › menu contextuel de la grille : astreintes / HNO d'une demi-journée (ajout, modification,
// suppression, saisie du mois). Lignes de l'expert de test sur le mois M+4, supprimées en fin de scénario.
import { expect } from '@playwright/test';
import { adminApi, aujourdhuiParis, ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';
import { ongletPlanification } from './planification.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** Mois M+n (Paris) : { annee, mois0 } */
function mois(/** @type {number} */ decalage) {
    const [a, m] = aujourdhuiParis().split('-').map(Number);
    const d = new Date(a, m - 1 + decalage, 1);
    return { annee: d.getFullYear(), mois0: d.getMonth() };
}
const cleJour = (/** @type {number} */ annee, /** @type {number} */ mois0, /** @type {number} */ jour) => ({
    annee,
    mois0,
    jour,
    date: `${annee}-${deux(mois0 + 1)}-${deux(jour)}`
});

/** Jour du mois M+4 : « premier lundi », « deuxième lundi », « premier jour » */
function jourM4(/** @type {string} */ libelle) {
    const { annee, mois0 } = mois(4);
    if (libelle === 'premier jour') return cleJour(annee, mois0, 1);
    const premier = 1 + ((8 - new Date(annee, mois0, 1).getDay()) % 7);
    return cleJour(annee, mois0, premier + (libelle === 'deuxième lundi' ? 7 : 0));
}

// ---------- Données ----------

/** Objet des astreintes de test (préfixe unique), supprimées en fin de scénario */
function objetDeTest(/** @type {Monde} */ monde) {
    if (monde.d.objetMenu) return monde.d.objetMenu;
    monde.d.objetMenu = monde.unique('Astr menu E2E');
    monde.aNettoyer('astreintes de test du menu', async () => {
        const api = await adminApi(monde);
        for (const a of await lignesDeTest(monde)) await api.ok('DELETE', `/api/astreintes/${a.id}`);
    });
    return monde.d.objetMenu;
}

async function lignesDeTest(/** @type {Monde} */ monde) {
    const toutes = await (await adminApi(monde)).ok('GET', '/api/astreintes');
    return toutes.filter((/** @type {any} */ a) => String(a.objet).startsWith(monde.d.objetMenu));
}

async function creerLigne(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ champs) {
    const objet = objetDeTest(monde);
    const { userId } = await ressourceExpert(monde);
    await (
        await adminApi(monde)
    ).ok('POST', '/api/astreintes', { user_id: userId, samu: 'SAMU 75', tous_samu: false, objet, ...champs });
}

Given(
    "une astreinte de test de l'expert de test a lieu le premier lundi du mois M+4 de {string} à {string}",
    async ({ monde }, debut, fin) => {
        const { date } = jourM4('premier lundi');
        await creerLigne(monde, {
            type: 'astreinte',
            date_debut: date,
            date_fin: date,
            heure_debut: debut,
            heure_fin: fin
        });
    }
);

Given(
    "une astreinte de test de l'expert de test va du dernier jour du mois M+3 {string} au premier jour du mois M+4 {string}",
    async ({ monde }, debut, fin) => {
        const { annee, mois0 } = mois(3);
        const veille = cleJour(annee, mois0, new Date(annee, mois0 + 1, 0).getDate()).date;
        await creerLigne(monde, {
            type: 'astreinte',
            date_debut: veille,
            date_fin: jourM4('premier jour').date,
            heure_debut: debut,
            heure_fin: fin
        });
    }
);

Given(
    "un travail HNO de test de l'expert de test pour tous les SAMU a lieu le premier lundi du mois M+4 de {string} à {string}",
    async ({ monde }, debut, fin) => {
        const { date } = jourM4('premier lundi');
        await creerLigne(monde, {
            type: 'hno',
            date_debut: date,
            date_fin: date,
            heure_debut: debut,
            heure_fin: fin,
            samu: null,
            tous_samu: true
        });
    }
);

// ---------- Grille et menu ----------

When("j'affiche le mois M+4 dans la planification", async ({ monde }) => {
    const { annee, mois0 } = mois(4);
    const page = monde.page;
    await ongletPlanification(page);
    if (!(await page.locator('#planningControlsSection').isVisible()))
        await page.locator('#planning h3', { hasText: "Options d'affichage" }).click();
    await page.locator('#yearSelect').selectOption(String(annee));
    await page.locator('#monthSelect').selectOption(String(mois0));
    await expect(page.locator('#currentMonthDisplay')).toContainText(String(annee));
});

const PERIODES = /** @type {Record<string, string>} */ ({ matinée: 'AM', 'après-midi': 'PM' });

async function ligneRessource(/** @type {Monde} */ monde, /** @type {string} */ qui) {
    const id = qui.includes('expert') ? (await ressourceExpert(monde)).resourceId : monde.d.ressource.id;
    return monde.page.locator(`#ganttBody tr[data-resource-id="${id}"]`);
}

const cellule = async (
    /** @type {Monde} */ monde,
    /** @type {string} */ qui,
    /** @type {string} */ moment,
    /** @type {string} */ jour
) => {
    const { annee, mois0, jour: j } = jourM4(jour);
    return (await ligneRessource(monde, qui)).locator(
        `td[data-date="${annee}-${mois0 + 1}-${j}"][data-period="${PERIODES[moment]}"]`
    );
};

When(
    /^j'ouvre le menu de (la matinée|l'après-midi) du (premier lundi|deuxième lundi|premier jour) du mois de (l'expert de test|la ressource de test)$/,
    async ({ monde }, moment, jour, qui) => {
        monde.d.jourMenu = jourM4(jour);
        monde.d.periodeMenu = PERIODES[moment.replace(/^(la |l')/, '')];
        const c = await cellule(monde, qui, moment.replace(/^(la |l')/, ''), jour);
        await c.scrollIntoViewIfNeeded();
        await c.locator('.gantt-cell-row').first().click({ button: 'right' });
    }
);

const menu = (/** @type {Monde} */ monde) => monde.page.locator('#ganttContextMenu');
const elements = (/** @type {Monde} */ monde) => monde.page.locator('#ganttContextMenuItems');

/** Menu ouvert, vérification du verrou du CRA terminée */
async function menuPret(/** @type {Monde} */ monde) {
    await expect(menu(monde)).toBeVisible();
    await expect(elements(monde)).not.toContainText('Vérification');
}

Then(
    "le menu de la demi-journée est titré pour l'expert de test, le premier lundi du mois, {string}",
    async ({ monde }, periode) => {
        await menuPret(monde);
        const nom = await (await ligneRessource(monde, 'expert')).getAttribute('data-resource-name');
        const { jour, mois0, annee } = jourM4('premier lundi');
        await expect(monde.page.locator('#ganttContextMenuHeader')).toHaveText(
            `${nom} — ${deux(jour)}/${deux(mois0 + 1)}/${annee} (${periode})`
        );
    }
);

Then('le menu propose seulement {string}', async ({ monde }, libelle) => {
    await menuPret(monde);
    await expect(elements(monde)).toHaveText(new RegExp(`^\\W*${libelle.replace(/[/]/g, '\\/')}\\s*$`, 'u'));
});

Then(
    "le menu propose de modifier et de supprimer l'astreinte de test, puis d'ajouter une astreinte \\/ HNO",
    async ({ monde }) => {
        await menuPret(monde);
        const court = monde.d.objetMenu.substring(0, 22);
        const texte = (await elements(monde).textContent()) ?? '';
        expect(texte).toMatch(/Modifier — .*Astreinte/);
        expect(texte.indexOf(`Modifier — `)).toBeLessThan(texte.indexOf('Supprimer — '));
        expect(texte.indexOf('Supprimer — ')).toBeLessThan(texte.lastIndexOf('Ajouter une astreinte / HNO'));
        expect(texte).toContain(court);
    }
);

When('je choisis {string} dans le menu', async ({ monde }, libelle) => {
    await menuPret(monde);
    await elements(monde).getByText(libelle).click();
});

When("je choisis de modifier l'astreinte de test dans le menu", async ({ monde }) => {
    await menuPret(monde);
    await elements(monde)
        .getByText(/^Modifier — /)
        .first()
        .click();
});

When("je choisis de supprimer l'astreinte de test dans le menu et je confirme", async ({ monde }) => {
    await menuPret(monde);
    await confirmer(monde, () =>
        elements(monde)
            .getByText(/^Supprimer — /)
            .first()
            .click()
    );
});

Then("aucun menu de demi-journée n'est ouvert", async ({ monde }) => {
    await monde.page.waitForTimeout(500);
    await expect(menu(monde)).toBeHidden();
});

// ---------- Saisie du mois ----------

const saisie = (/** @type {Monde} */ monde) => monde.page.locator('#ganttAstreinteModal');
const champ = (/** @type {Monde} */ monde, /** @type {string} */ nom) => monde.page.locator(`#ganttAstreinte${nom}`);

Then("la saisie des astreintes de l'expert de test est ouverte pour le mois M+4", async ({ monde }) => {
    await expect(saisie(monde)).toBeVisible();
    const nom = await (await ligneRessource(monde, 'expert')).getAttribute('data-resource-name');
    const { annee, mois0 } = mois(4);
    const libelleMois = new Date(annee, mois0, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    await expect(champ(monde, 'ModalTitle')).toHaveText(`${nom} — ${libelleMois}`);
});

Then('la saisie propose le premier lundi du mois de {string} à {string}', async ({ monde }, debut, fin) => {
    await expect(saisie(monde)).toBeVisible();
    const { date } = jourM4('premier lundi');
    await expect(champ(monde, 'DateDebut')).toHaveValue(date);
    await expect(champ(monde, 'DateFin')).toHaveValue(date);
    await expect(champ(monde, 'HeureDebut')).toHaveValue(debut);
    await expect(champ(monde, 'HeureFin')).toHaveValue(fin);
});

When("j'ajoute la ligne de la saisie", async ({ monde }) => {
    await champ(monde, 'AddBtn').click();
});

When('je saisis une astreinte de test sur le premier SAMU proposé', async ({ monde }) => {
    await champ(monde, 'Type').selectOption('astreinte');
    const samu = champ(monde, 'Samu');
    // Premier SAMU de la liste (hors choix vide et « Tous les SAMU »)
    monde.d.samuMenu = await samu
        .locator('option')
        .filter({ hasNotText: /^-- |^Tous les SAMU$/ })
        .first()
        .getAttribute('value');
    await samu.selectOption(monde.d.samuMenu);
    await champ(monde, 'Objet').fill(objetDeTest(monde));
});

Then("la liste de la saisie présente l'astreinte de test", async ({ monde }) => {
    await expect(champ(monde, 'List')).toContainText(monde.d.objetMenu);
});

Then('la liste de la saisie présente le travail HNO de test pour {string}', async ({ monde }, samu) => {
    const ligne = champ(monde, 'List').locator('div', { hasText: monde.d.objetMenu }).last();
    await expect(ligne).toContainText(samu);
});

Then("la saisie présente l'astreinte de test à modifier", async ({ monde }) => {
    await expect(saisie(monde)).toBeVisible();
    await expect(champ(monde, 'Objet')).toHaveValue(monde.d.objetMenu);
});

When("je change l'objet de l'astreinte de test", async ({ monde }) => {
    await champ(monde, 'Objet').fill(`${monde.d.objetMenu} modifiée`);
});

When('je termine la saisie des astreintes', async ({ monde }) => {
    await saisie(monde)
        .getByRole('button', { name: /Terminer/ })
        .click();
});

When('je ferme la saisie des astreintes', async ({ monde }) => {
    await saisie(monde).getByRole('button', { name: 'Fermer', exact: true }).last().click();
});

Then('la saisie des astreintes est fermée', async ({ monde }) => {
    await expect(saisie(monde)).toBeHidden();
});

// ---------- Contrôles enregistrés ----------

Then(
    "l'astreinte de test est enregistrée pour l'expert de test le premier lundi du mois de {string} à {string}",
    async ({ monde }, debut, fin) => {
        const { userId } = await ressourceExpert(monde);
        const { date } = jourM4('premier lundi');
        await expect
            .poll(async () =>
                (await lignesDeTest(monde)).map((/** @type {any} */ a) => [
                    a.user_id,
                    a.type,
                    a.date_debut,
                    a.heure_debut,
                    a.heure_fin,
                    a.samu
                ])
            )
            .toEqual([[userId, 'astreinte', date, debut, fin, monde.d.samuMenu]]);
    }
);

Then("l'astreinte de test modifiée est la seule astreinte de test de l'expert de test", async ({ monde }) => {
    await expect
        .poll(async () => (await lignesDeTest(monde)).map((/** @type {any} */ a) => a.objet))
        .toEqual([`${monde.d.objetMenu} modifiée`]);
});

Then("l'expert de test n'a plus d'astreinte de test", async ({ monde }) => {
    await expect.poll(async () => (await lignesDeTest(monde)).length).toBe(0);
});

Then('le travail HNO de test est toujours enregistré pour tous les SAMU', async ({ monde }) => {
    await expect
        .poll(async () =>
            (await lignesDeTest(monde)).map((/** @type {any} */ a) => `${a.type}|${a.tous_samu}|${a.samu ?? ''}`)
        )
        .toEqual(['hno|1|']);
});

Then(
    /^(la matinée|l'après-midi) du premier lundi du mois de l'expert de test porte la pastille "([^"]+)"$/,
    async ({ monde }, moment, pastille) => {
        const c = await cellule(monde, 'expert', moment.replace(/^(la |l')/, ''), 'premier lundi');
        await expect(c.locator('.astreinte-badge')).toHaveText(pastille);
    }
);

Then(
    /^(la matinée|l'après-midi) du premier lundi du mois de l'expert de test ne porte plus de pastille$/,
    async ({ monde }, moment) => {
        const c = await cellule(monde, 'expert', moment.replace(/^(la |l')/, ''), 'premier lundi');
        await expect(c.locator('.astreinte-badge')).toHaveCount(0);
    }
);
