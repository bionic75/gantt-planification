// @ts-check
// Étapes communes : acteurs connectés, navigation (onglets, sections, boutons), réponses de l'API, alertes
import { expect } from '@playwright/test';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

/** Libellés des onglets de la Planification (attribut data-tab) */
export const ONGLETS = {
    Ressources: 'resources',
    Événements: 'evenements',
    Planification: 'planning',
    'SAMU-SAS TripAdVisor': 'tripadvisor',
    CRA: 'cra',
    Reporting: 'reporting',
    Administration: 'admin',
    Astreintes: 'astreintesGestion'
};

export const ongletCle = (/** @type {string} */ libelle) => {
    const k = /** @type {Record<string, string>} */ (ONGLETS)[libelle];
    if (!k) throw new Error(`Onglet inconnu : ${libelle}`);
    return k;
};

/**
 * Fin du démarrage de l'application : le bandeau utilisateur s'affiche avant la fin des chargements initiaux, qui se
 * terminent en replaçant la planification sur le mois courant. Une action faite entre les deux peut être annulée :
 * on attend que le réseau se calme (aucune requête pendant 500 ms).
 */
export async function attendreFinDemarrage(/** @type {import('@playwright/test').Page} */ page) {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

/** Application ouverte avec la session enregistrée du profil */
export async function ouvrirApplication(/** @type {Monde} */ monde, /** @type {string} */ profil) {
    const { page } = await monde.acteur(profil);
    await page.goto('/');
    await expect(
        page.locator('#userInfo'),
        `Session de ${profil} refusée : supprimer e2e/.auth et relancer`
    ).toBeVisible({
        timeout: 30000
    });
    await attendreFinDemarrage(page);
    return page;
}

Given('je suis connecté en tant que {string}', async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
});

Given("{string} est connecté à l'application", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
});

When("{string} ouvre l'application", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
});

When("j'ouvre l'onglet {string}", async ({ monde }, libelle) => {
    const page = monde.page;
    const k = ongletCle(libelle);
    const bouton = page.locator(`#mainTabsContainer button.tab-btn[data-tab="${k}"]`);
    await expect(bouton).toBeVisible();
    // Clic par le DOM : un bandeau flottant peut recouvrir la barre d'onglets
    await bouton.evaluate(b => /** @type {HTMLElement} */ (b).click());
    await expect(page.locator(`#${k}.tab-content`)).toHaveClass(/active/);
});

/** Sections repliables : titre h3 d'une section de l'onglet affiché */
When("j'ouvre la section {string}", async ({ monde }, titre) => {
    const page = monde.page;
    const h3 = page.locator('.tab-content.active h3', { hasText: titre }).first();
    await expect(h3).toBeVisible();
    const icone = h3.locator('span[id$="Icon"]');
    const ouverte = (await icone.count()) ? (await icone.first().textContent())?.includes('▼') : false;
    if (!ouverte) await h3.click();
    await page.waitForTimeout(300);
});

When('je clique sur le bouton {string}', async ({ monde }, libelle) => {
    const bouton = monde.page.locator('.tab-content.active button:visible', { hasText: libelle }).first();
    await expect(bouton).toBeVisible();
    // Bouton recouvert par un bandeau flottant : clic par le DOM
    await bouton.click({ timeout: 5000 }).catch(() => bouton.evaluate(b => /** @type {HTMLElement} */ (b).click()));
});

When('je recharge la page', async ({ monde }) => {
    await monde.page.reload();
    await attendreFinDemarrage(monde.page);
});

/**
 * Message d'alerte : fenêtre du navigateur (ancien code, acceptée par le monde) ou message de la page annoncé aux
 * lecteurs d'écran (role="alert" ou "status", écrans migrés vers Vue)
 */
Then('une alerte affiche {string}', async ({ monde }, texte) => {
    const messages = monde.page.locator('[role="alert"]:visible, [role="status"]:visible');
    await expect
        .poll(async () => [...monde.dialogues, ...(await messages.allTextContents())].join('\n'), {
            message: `alerte « ${texte} »`
        })
        .toContain(texte);
});

Then('la réponse a le statut {int}', async ({ monde }, statut) => {
    expect(monde.reponse, 'aucune réponse API mémorisée').toBeTruthy();
    expect(monde.reponse?.status, JSON.stringify(monde.reponse?.data)?.slice(0, 500)).toBe(statut);
});

Then("le message d'erreur contient {string}", async ({ monde }, texte) => {
    const d = monde.reponse?.data;
    const message = typeof d === 'string' ? d : d?.error || d?.message || JSON.stringify(d);
    expect(message).toContain(texte);
});

Then("le message d'erreur est explicite", async ({ monde }) => {
    const d = monde.reponse?.data;
    expect(typeof d?.error === 'string' && d.error.length > 5, JSON.stringify(d)).toBe(true);
});

/** Appel direct d'une route : « GET /api/... » */
When('{string} appelle {string}', async ({ monde }, profil, appel) => {
    const [methode, url] = appel.split(/\s+/);
    const api = await monde.apiDe(profil);
    monde.reponse = await api.appel(methode, url, methode === 'GET' ? undefined : {});
});

Then("aucune erreur technique n'est survenue", async ({ monde }) => {
    expect(monde.problemes, monde.problemes.join('\n')).toEqual([]);
});

Then("l'onglet {string} n'est pas affiché", async ({ monde }, libelle) => {
    await expect(
        monde.page.locator(`#mainTabsContainer button.tab-btn[data-tab="${ongletCle(libelle)}"]`)
    ).toBeHidden();
});

Then("l'onglet {string} est affiché", async ({ monde }, libelle) => {
    await expect(
        monde.page.locator(`#mainTabsContainer button.tab-btn[data-tab="${ongletCle(libelle)}"]`)
    ).toBeVisible();
});
