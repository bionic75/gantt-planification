// @ts-check
// Application mobile : mire (identifiants), planning d'une ressource choisie (semaine, mois, jour), tiroir d'une
// demi-journée, déconnexion. Ressource et événement de test dans la semaine courante, supprimés en fin de scénario.
import { expect } from '@playwright/test';
import { adminApi, cle, creerEvenement, creerRessource } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

/** Lundi de la semaine courante (heure de Paris) et le jour suivant, « AAAA-MM-JJ » */
function semaineCourante() {
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const lundi = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
    return { jour, lundi, mardi: d.toISOString().slice(0, 10) };
}

const pasCache = async (/** @type {Monde} */ monde, /** @type {string} */ sel) =>
    expect(monde.page.locator(sel)).not.toHaveClass(/\bhidden\b/, { timeout: 30000 });

// ---------- Mire ----------

When("j'ouvre la page mobile sans être connecté", async ({ monde }) => {
    const { page } = await monde.anonyme('mobile-mire', { mobile: true });
    await page.goto('/mobile.html');
    await pasCache(monde, '#loginScreen');
    await page.waitForLoadState('networkidle').catch(() => {});
});

When('je valide la connexion mobile sans identifiants', async ({ monde }) => {
    await monde.page.locator('#loginButton').click();
});

When('je me connecte sur la page mobile avec un identifiant inconnu', async ({ monde }) => {
    await monde.page.locator('#loginUsername').fill(`e2e-inconnu-${Date.now()}`);
    await monde.page.locator('#loginPassword').fill('Mot-de-passe-inconnu-1!');
    await monde.page.locator('#loginButton').click();
});

Then('la mire mobile signale {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#loginError')).toHaveText(texte);
});

// ---------- Données ----------

Given(
    'une ressource de test est en « ANS Déploiement » lundi matin et en congé mardi de la semaine courante',
    async ({ monde }) => {
        const r = await creerRessource(monde);
        const { lundi, mardi } = semaineCourante();
        await (
            await adminApi(monde)
        ).ok('POST', '/api/schedule', {
            [cle(r.id, 'available', lundi, 'AM')]: '2',
            [cle(r.id, 'activity', lundi, 'AM')]: '5',
            [cle(r.id, 'available', mardi, 'AM')]: '3',
            [cle(r.id, 'available', mardi, 'PM')]: '3'
        });
        monde.d.ressource = r;
    }
);

Given('un événement de test a lieu lundi de la semaine courante', async ({ monde }) => {
    const label = monde.unique('Évt E2E mobile');
    await creerEvenement(monde, { startDate: semaineCourante().lundi, label });
    monde.d.evenementMobile = label;
});

// ---------- Planning ----------

When('je choisis la ressource de test dans la liste des experts', async ({ monde }) => {
    const r = monde.d.ressource;
    await monde.page.locator('#expertSelect').selectOption({ label: `${r.prenom} ${r.nom}` });
});

const cellulesSemaine = (/** @type {Monde} */ monde) => monde.page.locator('#planningScreen .week-cell');

Then('la semaine présente lundi matin {string} et mardi {string}', async ({ monde }, activite, conge) => {
    // Cellules du matin (lundi → vendredi), puis de l'après-midi
    await expect(cellulesSemaine(monde)).toHaveCount(10);
    await expect(cellulesSemaine(monde).nth(0)).toHaveText(activite);
    await expect(cellulesSemaine(monde).nth(1)).toHaveText(conge);
    await expect(cellulesSemaine(monde).nth(6)).toHaveText(conge);
});

Then("les événements de la semaine présentent l'événement de test", async ({ monde }) => {
    const section = monde.page.locator('#planningScreen .events-section', { hasText: 'Événements de la semaine' });
    await expect(section.locator('.event-card', { hasText: monde.d.evenementMobile })).toHaveCount(1);
});

When('je touche la demi-journée de lundi matin', async ({ monde }) => {
    await cellulesSemaine(monde).nth(0).click();
});

Then("le tiroir présente {string}, {string} et l'événement de test", async ({ monde }, periode, activite) => {
    await expect(monde.page.locator('#drawer')).toHaveClass(/\bopen\b/);
    await expect(monde.page.locator('#drawerTitle')).toContainText(`— ${periode}`);
    await expect(monde.page.locator('#drawerBody')).toContainText(activite);
    await expect(monde.page.locator('#drawerBody')).toContainText(monde.d.evenementMobile);
});

When('je ferme le tiroir', async ({ monde }) => {
    await monde.page.locator('#drawerOverlay').click({ position: { x: 20, y: 20 } });
});

Then('le tiroir est fermé', async ({ monde }) => {
    await expect(monde.page.locator('#drawer')).not.toHaveClass(/\bopen\b/);
});

When('je touche le jour de mardi dans le mois', async ({ monde }) => {
    const { jour, mardi } = semaineCourante();
    // Mardi dans le mois précédent (semaine à cheval sur deux mois) : mois précédent affiché
    if (mardi.slice(0, 7) !== jour.slice(0, 7)) await monde.page.locator('#prevBtn').click();
    await monde.page
        .locator('#planningScreen .month-cell:not(.empty)')
        .filter({ has: monde.page.locator('.month-day-num', { hasText: new RegExp(`^${Number(mardi.slice(8))}$`) }) })
        .click();
});

Then('la vue Jour présente le congé de mardi', async ({ monde }) => {
    await expect(monde.page.locator('#viewTabs button.active')).toHaveText('Jour');
    await expect(monde.page.locator('#planningScreen .day-title')).toContainText('mardi');
    await expect(monde.page.locator('#planningScreen .conge-banner')).toContainText('Journée de congé');
    await expect(monde.page.locator('#planningScreen .act-badge')).toHaveText([/Congé$/, /Congé$/]);
});

// ---------- Déconnexion ----------

When("je me déconnecte de l'application mobile", async ({ monde }) => {
    await monde.page.locator('#logoutBtn').click();
});

Then('la mire mobile est affichée', async ({ monde }) => {
    await pasCache(monde, '#loginScreen');
    await expect(monde.page.locator('#planningScreen')).toHaveClass(/\bhidden\b/);
    const s = await monde.page.request.get('/api/check-session');
    expect(s.status()).toBe(401);
});
