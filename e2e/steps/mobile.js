// @ts-check
// Application mobile : connexion, vues du planning, mode sombre, carte « Autour de moi »
import { expect } from '@playwright/test';
import { profil as profilDe } from '../support/config.js';
import { connexionMobile } from '../support/connexion.js';
import { PARIS } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Page} Page */

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

const visibleSansHidden = async (/** @type {Page} */ page, /** @type {string} */ sel, timeout = 30000) =>
    expect(page.locator(sel)).not.toHaveClass(/\bhidden\b/, { timeout });

When('je me connecte sur la page mobile avec le profil {string}', async ({ monde }, label) => {
    const { page } = await monde.anonyme('mobile', { mobile: true });
    monde.d.connexionMobile = await connexionMobile(page, profilDe(label));
});

async function ouvrirMobile(
    /** @type {Monde} */ monde,
    /** @type {string} */ label,
    /** @type {{ geolocalisation?: any }} */ options = {}
) {
    const { page, context } = await monde.acteur(label, { mobile: true, ...options });
    // L'application mobile mémorise l'utilisateur connecté dans le sessionStorage (absent des sessions enregistrées)
    if (!monde.d[`mobile_${label}`]) {
        monde.d[`mobile_${label}`] = true;
        const s = await (await context.request.get('/api/check-session')).json();
        await context.addInitScript(u => sessionStorage.setItem('ans_mob_user', JSON.stringify(u)), {
            ...s,
            id: s.userId
        });
    }
    await page.goto('/mobile.html');
    await visibleSansHidden(page, '#planningScreen');
    return page;
}

Given("{string} ouvre l'application mobile", async ({ monde }, label) => {
    await ouvrirMobile(monde, label);
});

Given("{string} ouvre l'application mobile avec la position du SAMU-SAS de test", async ({ monde }, label) => {
    await ouvrirMobile(monde, label, { geolocalisation: { ...PARIS, accuracy: 50 } });
});

Given("{string} ouvre l'application mobile sans autoriser la localisation", async ({ monde }, label) => {
    const page = await ouvrirMobile(monde, label);
    await page.context().clearPermissions();
});

Then('le planning personnel mobile est affiché', async ({ monde }) => {
    if (monde.d.connexionMobile)
        expect(monde.d.connexionMobile.etat, monde.d.connexionMobile.message || '').toBe('planning');
    await visibleSansHidden(monde.page, '#planningScreen');
    await visibleSansHidden(monde.page, '#header');
});

Then('la mire mobile reprend celle du bureau', async ({ monde }) => {
    // Mêmes composants et feuille de style que la mire du bureau (login.css, classes lp-*)
    await expect(monde.page.locator('link[href*="login.css"]')).toHaveCount(1);
    await expect(monde.page.locator('#loginPage .lp-card')).toHaveCount(1);
});

Then("l'écran mobile « Accès réservé » est affiché", async ({ monde }) => {
    expect(monde.d.connexionMobile.etat, monde.d.connexionMobile.message || '').toBe('acces-reserve');
    await expect(monde.page.locator('#accessDeniedScreen')).toContainText('Accès réservé');
});

Then("aucune donnée de planning n'est affichée sur mobile", async ({ monde }) => {
    await expect(monde.page.locator('#planningScreen')).toHaveClass(/\bhidden\b/);
});

// ---------- Vues ----------

Then('les vues {string} sont proposées', async ({ monde }, vues) => {
    const libelles = (await monde.page.locator('#viewTabs button').allTextContents()).map(t => t.trim());
    expect(libelles.join(', ')).toBe(vues);
});

When('je choisis la vue mobile {string}', async ({ monde }, vue) => {
    monde.d.libellePeriode = await monde.page.locator('#periodLabel').textContent();
    await monde.page.locator('#viewTabs button', { hasText: vue }).click();
    await expect(monde.page.locator('#viewTabs button.active')).toHaveText(vue);
});

When('je passe à la période suivante puis reviens à la période précédente', async ({ monde }) => {
    await monde.page.locator('#nextBtn').click();
    await monde.page.locator('#prevBtn').click();
});

Then('le libellé de période correspond au mois courant', async ({ monde }) => {
    const now = new Date();
    await expect(monde.page.locator('#periodLabel')).toHaveText(`${MOIS[now.getMonth()]} ${now.getFullYear()}`);
});

Then('le libellé de période change de format', async ({ monde }) => {
    await expect(monde.page.locator('#periodLabel')).not.toHaveText(String(monde.d.libellePeriode));
    await expect(monde.page.locator('#periodLabel')).toHaveText(/^Sem \d+/);
});

Then('le libellé de période indique le numéro de semaine', async ({ monde }) => {
    await expect(monde.page.locator('#periodLabel')).toHaveText(/\(Sem \d+\)/);
});

// ---------- Mode sombre ----------

When('je bascule le mode sombre mobile', async ({ monde }) => {
    await monde.page.locator('#colorModeBtn').click();
});

Then("l'application mobile est en mode sombre", async ({ monde }) => {
    await expect(monde.page.locator('html')).toHaveClass(/dark-mode/);
});

Then("l'application mobile est en mode clair", async ({ monde }) => {
    await expect(monde.page.locator('html')).not.toHaveClass(/dark-mode/);
});

// ---------- Carte « Autour de moi » ----------

When("je touche l'icône épingle", async ({ monde }) => {
    await monde.page.locator('#nearBtn').click();
    await visibleSansHidden(monde.page, '#nearScreen');
    // Lieux rechargés à chaque ouverture, puis localisation
    await expect(monde.page.locator('#nearInfo')).not.toHaveText(/Localisation en cours/, { timeout: 30000 });
});

When('je ferme la carte « Autour de moi »', async ({ monde }) => {
    await monde.page.locator('#nearClose').click();
    await expect(monde.page.locator('#nearScreen')).toHaveClass(/\bhidden\b/);
});

Then('la carte « Autour de moi » est affichée', async ({ monde }) => {
    await expect(monde.page.locator('#nearMap')).toBeVisible();
});

Then('ma position est affichée avec le cercle du périmètre', async ({ monde }) => {
    await expect(monde.page.locator('#nearMap .near-me')).toBeVisible();
    await expect(monde.page.locator('#nearMap path.leaflet-interactive').first()).toBeAttached();
});

Then('le message de décompte indique le nombre de lieux dans le rayon', async ({ monde }) => {
    await expect(monde.page.locator('#nearInfo')).toHaveText(/\d+ lieux? (dans un rayon de \d+ km|en France)/);
});

Then('le message indique que la position est refusée, sans bloquer la carte', async ({ monde }) => {
    await expect(monde.page.locator('#nearInfo')).toHaveText(
        /Position (refusée|introuvable)|Géolocalisation non disponible/
    );
    await expect(monde.page.locator('#nearMap')).toBeVisible();
});

Then('la pastille du SAMU-SAS de test est affichée sur la carte', async ({ monde }) => {
    await expect(
        monde.page.locator('#nearMap .near-sas', { hasText: `SAMU-SAS ${monde.d.samuSas.court}` })
    ).toBeVisible();
});

const marqueurLieu = (/** @type {Monde} */ monde) =>
    monde.page
        .locator('#nearMap .leaflet-marker-icon')
        .filter({ has: monde.page.locator('.near-lbl', { hasText: monde.d.lieu.name }) });

Then('le lieu de test est affiché par un rond de 46 px avec son nom', async ({ monde }) => {
    const pin = marqueurLieu(monde).locator('.near-pin');
    await expect(pin).toBeVisible();
    const box = await pin.boundingBox();
    expect(Math.round(box?.width || 0)).toBe(46);
    expect(Math.round(box?.height || 0)).toBe(46);
});

Then('pour chaque périmètre proposé, le décompte des lieux est mis à jour', async ({ monde }) => {
    const page = monde.page;
    const valeurs = await page
        .locator('#nearRadius option')
        .evaluateAll(os => os.map(o => /** @type {HTMLOptionElement} */ (o).value));
    expect(valeurs.length).toBeGreaterThan(1);
    for (const v of valeurs) {
        await page.locator('#nearRadius').selectOption(v);
        await expect(page.locator('#nearInfo'), `périmètre ${v}`).toHaveText(
            Number(v) > 0 ? new RegExp(`dans un rayon de ${v} km`) : /en France/
        );
    }
});

When('je touche le lieu de test sur la carte', async ({ monde }) => {
    await marqueurLieu(monde).locator('.near-pin').click();
});

Then(
    'la fiche du lieu indique son nom, sa typologie, son SAMU-SAS, son adresse, son créateur, la distance et un lien « Itinéraire »',
    async ({ monde }) => {
        const fiche = monde.page.locator('.leaflet-popup .near-pop');
        await expect(fiche).toBeVisible();
        const lieu = monde.d.lieu;
        for (const texte of [lieu.name, `SAMU-SAS ${monde.d.samuSas.court}`, lieu.address, 'par ', ' km']) {
            await expect(fiche).toContainText(texte);
        }
        await expect(fiche.getByRole('link', { name: 'Itinéraire' })).toBeVisible();
    }
);
