// @ts-check
// Administration › Paramétrages divers : version, inactivité, favicon, aide en ligne, dump, thèmes, son de notification
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const SOUS_SECTIONS = /** @type {Record<string, string>} */ ({
    "Version de l'application": 'subAppVersion',
    "Compteur d'inactivité": 'subInactivity',
    "Icône de l'application (favicon)": 'subFavicon',
    "Administration de l'aide en ligne": 'subAideEnLigne',
    'Dump complet & restauration (test avec données de production)': 'subDump',
    "Thèmes d'affichage": 'subTheme',
    'Son de notification push': 'subNotifSound',
    // Administration des jours ou événements spéciaux
    'Injection des périodes de congés scolaires': 'specialSub1',
    'Injection de dates particulières (jours fériés, ...)': 'specialSub2',
    "Paramétrage des types d'événements": 'specialSub3',
    'Reprise des données des événements (type et libellé)': 'specialSub4'
});

const sousSection = (/** @type {Monde} */ monde, /** @type {string} */ titre) => {
    const id = SOUS_SECTIONS[titre];
    if (!id) throw new Error(`Sous-section inconnue : ${titre}`);
    return monde.page.locator(`#${id}`);
};

const lireParametres = async (/** @type {Monde} */ monde) => (await adminApi(monde)).ok('GET', '/api/settings');

When("j'ouvre la sous-section {string}", async ({ monde }, titre) => {
    const corps = sousSection(monde, titre);
    if (!(await corps.isVisible())) await monde.page.locator('.tab-content.active').getByText(titre).first().click();
    await expect(corps).toBeVisible();
});

/** Bouton « Sauvegarder » d'une sous-section */
const sauvegarder = (/** @type {Monde} */ monde, /** @type {string} */ titre) =>
    sousSection(monde, titre)
        .getByRole('button', { name: /Sauvegarder/ })
        .first()
        .click();

// ---------- Version ----------

Then('la version affichée est celle enregistrée', async ({ monde }) => {
    monde.d.parametres = await lireParametres(monde);
    await expect(monde.page.locator('#appVersionInput')).toHaveValue(monde.d.parametres.app_version || '');
});

When('je réenregistre la version', async ({ monde }) => {
    await sauvegarder(monde, "Version de l'application");
});

Then('la version enregistrée est inchangée', async ({ monde }) => {
    expect((await lireParametres(monde)).app_version).toBe(monde.d.parametres.app_version);
});

// ---------- Inactivité ----------

const inactivite = (/** @type {Record<string, string>} */ p) => ({
    active: p.inactivity_enabled === 'true',
    delai: p.inactivity_timeout || '15'
});

Then("la configuration d'inactivité affichée est celle enregistrée", async ({ monde }) => {
    monde.d.parametres = await lireParametres(monde);
    const { active, delai } = inactivite(monde.d.parametres);
    const caseActive = monde.page.locator('#inactivityEnabled');
    await (active ? expect(caseActive).toBeChecked() : expect(caseActive).not.toBeChecked());
    await expect(monde.page.locator('#inactivityTimeout')).toHaveValue(delai);
});

When("je réenregistre la configuration d'inactivité", async ({ monde }) => {
    await sauvegarder(monde, "Compteur d'inactivité");
});

Then("la configuration d'inactivité enregistrée est inchangée", async ({ monde }) => {
    expect(inactivite(await lireParametres(monde))).toEqual(inactivite(monde.d.parametres));
});

// ---------- Favicon ----------

const ICONES = /** @type {Record<string, string>} */ ({
    calendrier: 'Calendrier',
    gantt: 'Gantt',
    grille: 'Grille',
    timeline: 'Timeline'
});

Given('le favicon sera rétabli après le scénario', async ({ monde }) => {
    const api = await adminApi(monde);
    const initial = (await lireParametres(monde)).favicon || 'calendrier';
    monde.d.faviconInitial = initial;
    monde.aNettoyer('favicon', () => api.put('/api/settings', { key: 'favicon', value: initial }));
});

When("je choisis une autre icône que celle enregistrée et je l'enregistre", async ({ monde }) => {
    const autre = /** @type {string} */ (Object.keys(ICONES).find(id => id !== monde.d.faviconInitial));
    monde.d.faviconChoisi = autre;
    await monde.page.locator('#faviconPicker').getByRole('radio').filter({ hasText: ICONES[autre] }).click();
    await sauvegarder(monde, "Icône de l'application (favicon)");
});

Then("l'icône choisie est enregistrée et appliquée à la page", async ({ monde }) => {
    const id = monde.d.faviconChoisi;
    await expect.poll(async () => (await lireParametres(monde)).favicon).toBe(id);
    await expect(monde.page.locator('link[rel="icon"]')).toHaveAttribute('href', new RegExp(`favicon-${id}\\.svg`));
});

// ---------- Aide en ligne ----------

Then("l'état de publication des nouveautés est celui enregistré, pour la version courante", async ({ monde }) => {
    const p = await lireParametres(monde);
    const publication = monde.page.locator('#helpPublicationEnabled');
    await (p.help_publication_enabled === 'true'
        ? expect(publication).toBeChecked()
        : expect(publication).not.toBeChecked());
    if (p.app_version) await expect(monde.page.locator('#currentVersionLabel')).toHaveText(p.app_version);
});

Then("le fichier d'aide actuel est indiqué", async ({ monde }) => {
    await expect(monde.page.locator('#helpCurrentFile')).toContainText(/Page d'aide (active|par défaut)/);
});

When("j'envoie une page d'aide sans choisir de fichier", async ({ monde }) => {
    await sousSection(monde, "Administration de l'aide en ligne")
        .getByRole('button', { name: /Uploader/ })
        .click();
});

// ---------- Dump ----------

const DUMP = 'Dump complet & restauration (test avec données de production)';
const resultat = (/** @type {Monde} */ monde) => monde.page.locator('#dumpInspectResult');

When('je génère et télécharge le dump complet', async ({ monde }) => {
    const page = monde.page;
    const telechargement = page.waitForEvent('download', { timeout: 120_000 });
    await sousSection(monde, DUMP)
        .getByRole('button', { name: /Générer et télécharger le dump complet/ })
        .click();
    const d = await telechargement;
    const fichier = path.join(os.tmpdir(), `e2e-${monde.suffixe}-${d.suggestedFilename()}`);
    await d.saveAs(fichier);
    monde.aNettoyer('dump téléchargé', async () => fs.rmSync(fichier, { force: true }));
    monde.d.dump = { nom: d.suggestedFilename(), fichier };
});

Then('un fichier de dump est téléchargé et sa génération confirmée', async ({ monde }) => {
    expect(monde.d.dump.nom).toMatch(/\.gpdump$/);
    expect(fs.statSync(monde.d.dump.fichier).size).toBeGreaterThan(0);
    await expect(monde.page.locator('#dumpCreateStatus')).toContainText(monde.d.dump.nom);
});

/** Envoi d'un fichier à l'analyse ; attente de la réponse du serveur */
async function analyser(
    /** @type {Monde} */ monde,
    /** @type {string | { name: string, mimeType: string, buffer: Buffer }} */ fichier
) {
    const page = monde.page;
    const reponse = page.waitForResponse(r => r.url().includes('/api/admin/dump/inspect'), { timeout: 120_000 });
    await page.locator('#dumpFileInput').setInputFiles(fichier);
    await sousSection(monde, DUMP)
        .getByRole('button', { name: /Analyser le dump/ })
        .click();
    await reponse;
}

When("j'analyse le dump téléchargé", async ({ monde }) => {
    await analyser(monde, monde.d.dump.fichier);
});

When("j'analyse un fichier de dump corrompu", async ({ monde }) => {
    await analyser(monde, {
        name: 'corrompu.gpdump',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('pas un dump')
    });
});

Then("l'analyse présente la version, la date et le détail par table du dump", async ({ monde }) => {
    await expect(resultat(monde)).toContainText('Version du site');
    await expect(resultat(monde)).toContainText('Date de sauvegarde');
    await expect(resultat(monde)).toContainText('Détail par table');
});

Then("la restauration n'est possible qu'après la saisie du nom du serveur", async ({ monde }) => {
    const restaurer = resultat(monde).getByRole('button', { name: /Restaurer ce dump/ });
    await expect(restaurer).toBeDisabled();
    const saisie = monde.page.locator('#dumpConfirmInput');
    await saisie.fill('autre-serveur');
    await expect(restaurer).toBeDisabled();
    await saisie.fill((await saisie.getAttribute('placeholder')) || '');
    await expect(restaurer).toBeEnabled();
});

When("j'annule la restauration", async ({ monde }) => {
    await resultat(monde).getByRole('button', { name: 'Annuler', exact: true }).click();
});

Then("l'analyse du dump n'est plus affichée", async ({ monde }) => {
    await expect(resultat(monde)).not.toContainText('Version du site');
    await expect(monde.page.locator('#dumpConfirmInput')).toHaveCount(0);
});

Then("l'analyse du dump affiche une erreur", async ({ monde }) => {
    await expect(resultat(monde)).not.toBeEmpty();
    await expect(resultat(monde)).not.toContainText('Version du site');
    await expect(resultat(monde).getByRole('button', { name: /Restaurer ce dump/ })).toHaveCount(0);
});

// ---------- Thèmes ----------

Then("l'écran des thèmes présente les six thèmes, leur mode et l'état du thème affiché", async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#themeAdminRows tr')).toHaveCount(6);
    await expect(page.locator('input[name="themeMode"]:checked')).toHaveCount(1);
    await expect(page.locator('#themeAdminStatus')).toHaveText(/Thème affiché actuellement|Aucun thème affiché/);
});

When('je prévisualise le thème {string}', async ({ monde }, libelle) => {
    await monde.page
        .locator('#themeAdminRows tr')
        .filter({ hasText: libelle })
        .getByRole('button', { name: 'Aperçu' })
        .click();
});

Then('le thème {string} est appliqué à la page', async ({ monde }, theme) => {
    await expect(monde.page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 5000 });
});

// ---------- Son de notification ----------

const sonActive = (/** @type {Monde} */ monde) => monde.page.evaluate(() => localStorage.getItem('notifSoundEnabled'));

When('je désactive le son de notification', async ({ monde }) => {
    await monde.page.locator('#notifSoundEnabled').uncheck();
});

When('je réactive le son de notification', async ({ monde }) => {
    await monde.page.locator('#notifSoundEnabled').check();
});

Then('le son de notification est désactivé pour ce navigateur', async ({ monde }) => {
    await expect.poll(() => sonActive(monde)).toBe('false');
});

Then('le son de notification est activé pour ce navigateur', async ({ monde }) => {
    await expect.poll(() => sonActive(monde)).toBe('true');
});
