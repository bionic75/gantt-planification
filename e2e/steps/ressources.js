// @ts-check
// Ressources : formulaire d'ajout, fiche de modification, MAD volantes, historique des taux, SAMU, astreintes
import { expect } from '@playwright/test';
import { adminApi, creerRessource, lireRessource, premierJourDuMois, ressourceParNom } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Page} Page */

const CHAMPS_AJOUT = {
    Nom: '#nom',
    Prénom: '#prenom',
    Trigramme: '#trigramme',
    'SAMU de rattachement': '#samu',
    'Date début MAD': '#dateDebut'
};

/** Saisie du formulaire d'ajout ; la ressource éventuellement créée est supprimée en fin de scénario */
async function saisirRessource(
    /** @type {Monde} */ monde,
    /** @type {{ taux?: number | null, sans?: string }} */ { taux = 50, sans } = {}
) {
    const page = monde.page;
    const nom = monde.unique('E2E').replace(/\s+/g, '-');
    const trigramme = `z${String.fromCharCode(97 + Math.floor(Math.random() * 26))}${String.fromCharCode(97 + Math.floor(Math.random() * 26))}`;
    monde.d.saisie = { nom, trigramme };
    monde.aNettoyer(`ressource saisie ${nom}`, async () => {
        const r = await ressourceParNom(monde, nom);
        if (r) await (await adminApi(monde)).delete(`/api/resources/${r.id}`);
    });
    await page.locator('#nom').fill(nom);
    await page.locator('#prenom').fill('Saisie');
    // Sortie du champ Prénom : le trigramme est proposé automatiquement (remplacé plus bas par la saisie)
    await page.locator('#prenom').blur();
    if (taux != null) await page.locator('#taux').fill(String(taux));
    if ((await page.locator('#samu option:not([value=""])').count()) === 0) {
        // Anomalie constatée : à la reprise d'une session (page rechargée), les localisations ne sont pas chargées et
        // la liste « SAMU de rattachement » reste vide. Signalée dans le rapport, puis contournée pour poursuivre.
        monde.testInfo.annotations.push({
            type: 'anomalie',
            description:
                'Liste « SAMU de rattachement » vide après rechargement de la page (localisations non chargées)'
        });
        await page.evaluate(() => /** @type {any} */ (window).loadLocations());
    }
    const premierSamu = await page.locator('#samu option:not([value=""])').first().getAttribute('value');
    expect(premierSamu, 'aucun SAMU proposé dans le formulaire (localisations absentes)').toBeTruthy();
    await page.locator('#samu').selectOption(/** @type {string} */ (premierSamu));
    await page.locator('#dateDebut').fill(premierJourDuMois());
    await page.locator('#trigramme').fill(trigramme);
    if (sans) {
        const sel = /** @type {Record<string, string>} */ (CHAMPS_AJOUT)[sans];
        if (sans === 'SAMU de rattachement') await page.locator(sel).selectOption('');
        else await page.locator(sel).fill('');
    }
}

When(
    'je saisis une nouvelle ressource avec un trigramme en minuscules et un taux de {int} %',
    async ({ monde }, taux) => {
        await saisirRessource(monde, { taux });
    }
);

When('je saisis une nouvelle ressource sans le champ {string}', async ({ monde }, champ) => {
    await saisirRessource(monde, { sans: champ });
});

When(
    "je saisis une nouvelle ressource MAD volante jusqu'au {string} avec {int} jours maximum",
    async ({ monde }, fin, jours) => {
        await saisirRessource(monde, { taux: null });
        await monde.page.locator('#dateFinMad').fill(fin);
        await monde.page.locator('#joursMaxMad').fill(String(jours));
    }
);

When('je saisis une nouvelle ressource MAD volante sans date de fin ni jours maximum', async ({ monde }) => {
    await saisirRessource(monde, { taux: null });
});

When('je coche la case {string}', async ({ monde }, libelle) => {
    const sel = /** @type {Record<string, string>} */ ({
        'MAD volante': '#addMadVolante',
        'Astreintes HNO': '#addAstreinteVolontaire'
    })[libelle];
    if (!sel) throw new Error(`Case inconnue : ${libelle}`);
    await monde.page.locator(sel).check();
});

When("je renseigne la date de démarrage du régime d'astreintes {string}", async ({ monde }, date) => {
    await monde.page.locator('#addAstreinteDate').fill(date);
});

const GROUPES = {
    'Taux de MAD (%)': '#addTauxGroup',
    'Date de fin MAD': '#addDateFinMadGroup',
    'Jours max sur la période': '#addJoursMaxGroup'
};
const groupe = (/** @type {string} */ l) => /** @type {Record<string, string>} */ (GROUPES)[l];

Then('le champ {string} est masqué', async ({ monde }, libelle) => {
    await expect(monde.page.locator(groupe(libelle))).toBeHidden();
});

Then('les champs {string} et {string} sont affichés', async ({ monde }, a, b) => {
    await expect(monde.page.locator(groupe(a))).toBeVisible();
    await expect(monde.page.locator(groupe(b))).toBeVisible();
});

const ressourceSaisie = async (/** @type {Monde} */ monde) => {
    let r;
    await expect
        .poll(async () => (r = await ressourceParNom(monde, monde.d.saisie.nom)), {
            message: 'ressource saisie non créée'
        })
        .toBeTruthy();
    return r;
};

Then('la ressource saisie est créée avec son trigramme en majuscules', async ({ monde }) => {
    const r = await ressourceSaisie(monde);
    expect(r.trigramme).toBe(monde.d.saisie.trigramme.toUpperCase());
});

Then('la ressource saisie est créée en MAD volante avec un taux de {int}', async ({ monde }, taux) => {
    const r = await ressourceSaisie(monde);
    expect(r.is_mad_volante).toBe(1);
    expect(r.taux).toBe(taux);
});

Then('la ressource saisie apparaît dans la liste des ressources', async ({ monde }) => {
    await expect(monde.page.locator('#resourcesTable')).toContainText(monde.d.saisie.nom);
});

Then('la ressource saisie apparaît dans la planification', async ({ monde }) => {
    const r = await ressourceSaisie(monde);
    const page = monde.page;
    await page
        .locator('#mainTabsContainer button.tab-btn[data-tab="planning"]')
        .evaluate(b => /** @type {HTMLElement} */ (b).click());
    await expect(page.locator(`#ganttBody tr[data-resource-id="${r.id}"]`)).toHaveCount(1, { timeout: 20000 });
});

Then("la ressource saisie n'a pas été créée", async ({ monde }) => {
    await monde.page.waitForTimeout(1000);
    expect(await ressourceParNom(monde, monde.d.saisie.nom)).toBeUndefined();
});

Then('la ressource saisie participe au dispositif Astreintes\\/HNO depuis le {string}', async ({ monde }, date) => {
    const r = await ressourceSaisie(monde);
    expect(r.astreinte_volontaire).toBe(1);
    expect(r.astreinte_date_activation).toBe(date);
});

Then('la ressource saisie apparaît dans la liste des experts astreinte', async ({ monde }) => {
    const r = await ressourceSaisie(monde);
    const experts = await (await adminApi(monde)).ok('GET', '/api/cra/experts-astreinte');
    expect(experts.map((/** @type {any} */ e) => e.resource_id ?? e.id)).toContain(r.id);
});

// ---------- Création par l'API ----------

const corpsRessource = (/** @type {Monde} */ monde) => ({
    nom: monde.unique('E2E').replace(/\s+/g, '-'),
    prenom: 'Api',
    trigramme: 'ZAP',
    taux: 50,
    samu: 'SAMU 75',
    date_debut: '2026-01-01'
});

async function creerParApi(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ body) {
    const api = await adminApi(monde);
    monde.reponse = await api.post('/api/resources', body);
    if (monde.reponse.status === 200) {
        const id = monde.reponse.data.id;
        monde.aNettoyer(`ressource ${id}`, () => api.delete(`/api/resources/${id}`));
    }
}

When("l'administrateur crée par l'API une ressource sans le champ {string}", async ({ monde }, champ) => {
    const body = /** @type {Record<string, unknown>} */ (corpsRessource(monde));
    if (champ === 'taux') body.taux = '';
    else delete body[champ];
    await creerParApi(monde, body);
});

When("l'administrateur crée par l'API une MAD volante sans date de fin", async ({ monde }) => {
    await creerParApi(monde, { ...corpsRessource(monde), taux: '', is_mad_volante: 1, jours_max_mad: 15 });
});

// ---------- Fiche d'une ressource existante ----------

Given('une ressource standard existe', async ({ monde }) => {
    monde.d.ressource = await creerRessource(monde);
});

Given('une ressource MAD volante débutant le {string} existe', async ({ monde }, debut) => {
    monde.d.ressource = await creerRessource(monde, {
        taux: '',
        is_mad_volante: 1,
        date_debut: debut,
        date_fin_mad: '2027-06-30',
        jours_max_mad: 15
    });
});

Given(
    'une ressource avec une date de début {string} et une date de fin {string} existe',
    async ({ monde }, debut, fin) => {
        monde.d.ressource = await creerRessource(monde, { date_debut: debut, date_fin: fin });
    }
);

Given('une ressource non volante au taux de {int} % depuis le {string} existe', async ({ monde }, taux, debut) => {
    monde.d.ressource = await creerRessource(monde, { taux, date_debut: debut });
});

When("j'ouvre la fiche de la ressource", async ({ monde }) => {
    const page = monde.page;
    const id = monde.d.ressource.id;
    const bouton = page.locator(`[onclick="openEditModal(${id})"]`).first();
    // La liste peut avoir été chargée avant la création de la ressource : rechargement de la liste
    if (!(await bouton.isVisible().catch(() => false)))
        await page.evaluate(() => /** @type {any} */ (window).loadResources());
    if (await bouton.isVisible().catch(() => false)) await bouton.click();
    else await page.evaluate(i => /** @type {any} */ (window).openEditModal(i), id);
    await expect(page.locator('#editModal')).toHaveClass(/active/);
    await page.waitForLoadState('networkidle').catch(() => {});
});

const CHAMPS_FICHE = {
    'Date de début MAD': '#editDateDebutMad',
    'Date de fin MAD': '#editDateFinMad',
    Fonction: '#editFonction'
};

Then('le champ {string} de la fiche contient {string}', async ({ monde }, libelle, valeur) => {
    await expect(monde.page.locator(/** @type {Record<string, string>} */ (CHAMPS_FICHE)[libelle])).toHaveValue(valeur);
});

async function enregistrerFiche(/** @type {Page} */ page, /** @type {string} */ sel, /** @type {string} */ valeur) {
    await page.locator(sel).fill(valeur);
    // Clic par le DOM : le bas de la fenêtre peut être recouvert par la barre d'outils flottante
    await page
        .locator('#editModal button[onclick="saveResourceEdit()"]')
        .last()
        .evaluate(b => /** @type {HTMLElement} */ (b).click());
}

When("je remplace la date de début MAD par {string} et j'enregistre la fiche", async ({ monde }, date) => {
    await enregistrerFiche(monde.page, '#editDateDebutMad', date);
    await expect(monde.page.locator('#editModal')).not.toHaveClass(/active/);
});

When("je remplace la fonction par {string} et j'enregistre la fiche", async ({ monde }, fonction) => {
    await enregistrerFiche(monde.page, '#editFonction', fonction);
    await expect(monde.page.locator('#editModal')).not.toHaveClass(/active/);
});

When("je remplace la date de fin MAD par {string} et j'enregistre la fiche", async ({ monde }, date) => {
    await enregistrerFiche(monde.page, '#editDateFinMad', date);
});

Then('la ressource a la fonction {string}', async ({ monde }, fonction) => {
    await expect.poll(async () => (await lireRessource(monde, monde.d.ressource.id))?.fonction).toBe(fonction);
});

Then('la ressource a toujours la date de début {string} et la date de fin {string}', async ({ monde }, debut, fin) => {
    const r = await lireRessource(monde, monde.d.ressource.id);
    expect({ debut: r.date_debut, fin: r.date_fin }).toEqual({ debut, fin });
});

Then("la ressource a toujours la date de fin MAD d'origine", async ({ monde }) => {
    const r = await lireRessource(monde, monde.d.ressource.id);
    expect(r.date_fin_mad).toBe(monde.d.ressource.date_fin_mad);
});

// ---------- Historique des taux de MAD ----------

const historique = async (/** @type {Monde} */ monde) =>
    (await adminApi(monde)).ok('GET', `/api/resources/${monde.d.ressource.id}/mad-history`);

When("l'administrateur clôt la période de MAD initiale au {string}", async ({ monde }, fin) => {
    const [initiale] = await historique(monde);
    const api = await adminApi(monde);
    monde.reponse = await api.put(`/api/resources/${monde.d.ressource.id}/mad-history/${initiale.id}`, {
        taux: initiale.taux,
        date_debut: initiale.date_debut,
        date_fin: fin
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

When(
    "l'administrateur ajoute une période de MAD au taux de {int} % à partir du {string}",
    async ({ monde }, taux, debut) => {
        const api = await adminApi(monde);
        monde.reponse = await api.post(`/api/resources/${monde.d.ressource.id}/mad-history`, {
            taux,
            date_debut: debut
        });
    }
);

Then("l'historique des taux de la ressource contient {int} période(s)", async ({ monde }, n) => {
    expect(await historique(monde)).toHaveLength(n);
});

Then('le taux courant de la ressource est de {int} %', async ({ monde }, taux) => {
    expect((await lireRessource(monde, monde.d.ressource.id)).taux).toBe(taux);
});

When("l'administrateur modifie la dernière période de MAD au taux de {int} %", async ({ monde }, taux) => {
    const derniere = (await historique(monde)).at(-1);
    const api = await adminApi(monde);
    monde.reponse = await api.put(`/api/resources/${monde.d.ressource.id}/mad-history/${derniere.id}`, {
        taux,
        date_debut: derniere.date_debut,
        date_fin: derniere.date_fin
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

When("l'administrateur supprime la dernière période de MAD", async ({ monde }) => {
    const derniere = (await historique(monde)).at(-1);
    monde.reponse = await (
        await adminApi(monde)
    ).delete(`/api/resources/${monde.d.ressource.id}/mad-history/${derniere.id}`);
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

// ---------- SAMU, contacts RH ----------

When(
    "l'administrateur rattache la ressource en expert principal sur {string} et en expert secondaire sur {string}",
    async ({ monde }, principal, secondaire) => {
        const liste = (/** @type {string} */ s) => s.split(',').map(x => x.trim());
        monde.reponse = await (
            await adminApi(monde)
        ).put(`/api/resources/${monde.d.ressource.id}/samu-assignments`, {
            principal: liste(principal),
            secondaire: liste(secondaire)
        });
        expect(monde.reponse.status).toBe(200);
    }
);

Then('les SAMU de la ressource sont enregistrés par rôle :', async ({ monde }, table) => {
    const liste = await (await adminApi(monde)).ok('GET', `/api/resources/${monde.d.ressource.id}/samu-assignments`);
    const attendu = table
        .hashes()
        .map((/** @type {any} */ l) => `${l.samu}|${l['rôle']}`)
        .sort();
    expect(liste.map((/** @type {any} */ a) => `${a.samu}|${a.role}`).sort()).toEqual(attendu);
});

When("l'administrateur enregistre les contacts RH suivants :", async ({ monde }, contacts) => {
    const { id, ...ressource } = monde.d.ressource;
    monde.reponse = await (await adminApi(monde)).put(`/api/resources/${id}`, { ...ressource, contacts_rh: contacts });
});

Then('les contacts RH de la ressource sont {string} et {string}', async ({ monde }, a, b) => {
    expect((await lireRessource(monde, monde.d.ressource.id)).contacts_rh).toBe(`${a}\n${b}`);
});
