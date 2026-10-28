// @ts-check
// Reporting › Suivi des connexions utilisateurs
import { expect } from '@playwright/test';
import { profil as profilDe } from '../support/config.js';
import { adminApi, aujourdhuiParis as aujourdhui, premierJourDuMois as premierDuMois } from '../support/donnees.js';
import { Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Page} Page */

const COLONNES = /** @type {Record<string, { ck: string, index: number }>} */ ({
    Utilisateur: { ck: 'nom', index: 0 },
    Login: { ck: 'login', index: 1 },
    Profil: { ck: 'profil', index: 2 },
    'Nb connexions': { ck: 'total', index: 3 },
    'Dernière connexion': { ck: 'last', index: 4 }
});

/** Lignes affichées du rapport : cellules texte */
const lignes = async (/** @type {Page} */ page) =>
    page
        .locator('#connexionsReportBody tr')
        .evaluateAll(trs =>
            trs
                .map(tr => [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim()))
                .filter(c => c.length >= 5)
        );

const cliquerGenerer = (/** @type {Page} */ page) =>
    page
        .locator('#reportingConnexionsBody button', { hasText: 'Générer' })
        .evaluate(b => /** @type {HTMLElement} */ (b).click());

async function generer(/** @type {Page} */ page) {
    // Le tableau précédent reste affiché pendant le rechargement : attente de la réponse du serveur, puis du tableau
    // correspondant (une ligne par utilisateur, ou la ligne « Aucune connexion »)
    const reponse = page.waitForResponse(r => r.url().includes('/api/reporting/connections'));
    await cliquerGenerer(page);
    const { rows } = await (await reponse).json();
    const utilisateurs = new Set(rows.map((/** @type {any} */ r) => String(r.username || '').toLowerCase())).size;
    await expect(page.locator('#connexionsReportResult')).toBeVisible();
    await expect(page.locator('#connexionsReportBody tr')).toHaveCount(Math.max(utilisateurs, 1));
    const total = rows.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + (r.nb_connexions || 0), 0);
    await expect(page.locator('#connexionsTotalCount')).toHaveText(String(total));
}

When('je lance la génération du rapport des connexions', async ({ monde }) => {
    const page = monde.page;
    // Les deux dates de l'intervalle renseignées : appel au serveur, attendu ; sinon simple alerte de l'écran
    const libre = await page.locator('#connexionsModeInterval').isChecked();
    const complet =
        !libre ||
        ((await page.locator('#connexionsStart').inputValue()) && (await page.locator('#connexionsEnd').inputValue()));
    if (complet) await generer(page);
    else await cliquerGenerer(page);
});

When('je génère le rapport des connexions du mois courant', async ({ monde }) => {
    const page = monde.page;
    await page.locator('#connexionsModeMonth').check();
    const [annee, mois] = aujourdhui().split('-');
    await page.locator('#connexionsMonth').selectOption(mois);
    await page.locator('#connexionsYear').selectOption(annee);
    await generer(page);
});

Then('le rapport contient une seule ligne par utilisateur', async ({ monde }) => {
    const logins = (await lignes(monde.page)).map(c => c[1].toLowerCase());
    expect(logins.length).toBeGreaterThan(0);
    expect(new Set(logins).size).toBe(logins.length);
});

const ligneDe = async (/** @type {Page} */ page, /** @type {string} */ login) =>
    (await lignes(page)).find(c => c[1].toLowerCase() === login.toLowerCase());

Then('le compte {string} figure dans le rapport avec son badge de profil', async ({ monde }, label) => {
    const ligne = await ligneDe(monde.page, profilDe(label).login);
    expect(ligne, `${label} absent du rapport`).toBeTruthy();
    expect(ligne?.[2], 'badge de profil vide').toBeTruthy();
});

Then('le compte {string} figure dans le rapport', async ({ monde }, label) => {
    await expect
        .poll(() => ligneDe(monde.page, profilDe(label).login), { message: `${label} absent du rapport` })
        .toBeTruthy();
});

Then('le total affiché est la somme des connexions des lignes', async ({ monde }) => {
    const somme = (await lignes(monde.page)).reduce((s, c) => s + Number(c[3]), 0);
    await expect(monde.page.locator('#connexionsTotalCount')).toHaveText(String(somme));
});

Then("le profil « system » n'apparaît pas dans le rapport", async ({ monde }) => {
    for (const c of await lignes(monde.page))
        expect(`${c[1]} ${c[2]}`.toLowerCase(), c.join(' | ')).not.toMatch(/\bsystem\b/);
});

// ---------- Tri ----------

When('je trie le rapport par la colonne {string}', async ({ monde }, colonne) => {
    await monde.page.locator(`#connexionsReportResult thead th[data-ck="${COLONNES[colonne].ck}"]`).click();
});

const sensAffiche = async (/** @type {Page} */ page, /** @type {string} */ colonne) =>
    page.locator(`#connexionsReportResult thead th[data-ck="${COLONNES[colonne].ck}"]`).getAttribute('data-dir');

/** Date « JJ/MM/AAAA HH:MM » → clé triable */
const cleDate = (/** @type {string} */ t) => {
    const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})/);
    return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}` : '';
};

async function verifierOrdre(/** @type {Page} */ page, /** @type {string} */ colonne, /** @type {string} */ sens) {
    const { index, ck } = COLONNES[colonne];
    if (ck === 'profil') return; // libellés des badges : seul l'indicateur de tri est contrôlé
    const valeurs = (await lignes(page)).map(c => (ck === 'last' ? cleDate(c[index]) : c[index]));
    const cmp = (/** @type {string} */ a, /** @type {string} */ b) =>
        ck === 'total' ? Number(a) - Number(b) : a.localeCompare(b, 'fr', { numeric: true });
    for (let i = 1; i < valeurs.length; i++) {
        const ecart = cmp(valeurs[i - 1], valeurs[i]);
        expect(sens === 'asc' ? ecart <= 0 : ecart >= 0, `${colonne} ${sens} : ${valeurs.join(' | ')}`).toBe(true);
    }
}

Then('le rapport est trié par {string} dans un sens', async ({ monde }, colonne) => {
    const sens = await sensAffiche(monde.page, colonne);
    expect(['asc', 'desc']).toContain(sens);
    monde.d.sensTri = sens;
    await verifierOrdre(monde.page, colonne, /** @type {string} */ (sens));
});

Then("le rapport est trié par {string} dans l'autre sens", async ({ monde }, colonne) => {
    const sens = await sensAffiche(monde.page, colonne);
    expect(sens).toBe(monde.d.sensTri === 'asc' ? 'desc' : 'asc');
    monde.d.sensTri = sens;
    await verifierOrdre(monde.page, colonne, /** @type {string} */ (sens));
});

Then('le rapport est toujours trié par {string}', async ({ monde }, colonne) => {
    expect(await sensAffiche(monde.page, colonne)).toBe(monde.d.sensTri);
    await verifierOrdre(monde.page, colonne, monde.d.sensTri);
});

// ---------- Période et filtre ----------

When("je choisis l'intervalle libre avec seulement la date de début renseignée", async ({ monde }) => {
    const page = monde.page;
    await page.locator('#connexionsModeInterval').check();
    await page.locator('#connexionsStart').fill(premierDuMois());
    await page.locator('#connexionsEnd').fill('');
});

When("je choisis l'intervalle libre du premier jour du mois courant à aujourd'hui", async ({ monde }) => {
    const page = monde.page;
    await page.locator('#connexionsModeInterval').check();
    await page.locator('#connexionsStart').fill(premierDuMois());
    await page.locator('#connexionsEnd').fill(aujourdhui());
});

When("je choisis l'intervalle libre du {string} au {string}", async ({ monde }, debut, fin) => {
    const page = monde.page;
    await page.locator('#connexionsModeInterval').check();
    await page.locator('#connexionsStart').fill(debut);
    await page.locator('#connexionsEnd').fill(fin);
});

Then('le rapport des connexions affiche {string} et un total de {int}', async ({ monde }, texte, total) => {
    await expect(monde.page.locator('#connexionsReportBody')).toContainText(texte);
    await expect(monde.page.locator('#connexionsTotalCount')).toHaveText(String(total));
});

Then("le rapport par l'API sur cette période, bornes incluses, donne les mêmes totaux", async ({ monde }) => {
    const page = monde.page;
    const reponse = page.waitForResponse(r => r.url().includes('/api/reporting/connections'));
    await cliquerGenerer(page);
    const r = await reponse;
    // Période transmise telle que saisie (bornes incluses côté serveur)
    const params = new URL(r.url()).searchParams;
    expect([params.get('dateStart'), params.get('dateEnd')]).toEqual([premierDuMois(), aujourdhui()]);
    // Même requête rejouée par l'API : mêmes totaux (nouvelles connexions éventuelles : nouvel essai)
    const api = await adminApi(monde);
    const totalDe = (/** @type {any[]} */ rows) => rows.reduce((s, x) => s + (x.nb_connexions || 0), 0);
    await expect(page.locator('#connexionsTotalCount')).toHaveText(String(totalDe((await r.json()).rows)));
    await expect(async () => {
        const { rows } = await api.ok('GET', `/api/reporting/connections?${params}`);
        await generer(page);
        await expect(page.locator('#connexionsTotalCount')).toHaveText(String(totalDe(rows)), { timeout: 1000 });
    }).toPass({ timeout: 30000 });
});

When('je sélectionne les utilisateurs {string} et {string}', async ({ monde }, a, b) => {
    const ids = [String((await monde.sessionDe(a)).userId), String((await monde.sessionDe(b)).userId)];
    await monde.page.locator('#connexionsUserSelect').selectOption(ids);
});

Then('le rapport ne contient que les comptes {string} et {string}', async ({ monde }, a, b) => {
    const attendus = [profilDe(a).login.toLowerCase(), profilDe(b).login.toLowerCase()];
    const logins = (await lignes(monde.page)).map(c => c[1].toLowerCase());
    expect(logins.length).toBeGreaterThan(0);
    for (const l of logins) expect(attendus).toContain(l);
});
