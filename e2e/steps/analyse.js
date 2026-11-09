// @ts-check
// Analyse de fichiers : chargement (CSV, Excel, texte), structure, filtres, colonnes, doublons, pagination, export,
// fichier conservé dans le navigateur. Fichiers produits ici (CSV de 251 lignes en Windows-1252, fichiers texte) et
// classeur e2e/fixtures/analyse/classeur.xlsx ; rien n'est envoyé au serveur.
import fs from 'fs';
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, telecharger } from '../support/interface.js';
import { ouvrirApplication } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const APPLICATION = 'Analyse de fichiers';
const echapper = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CLASSEUR = new URL('../fixtures/analyse/classeur.xlsx', import.meta.url);

// ---------- Fichier CSV de test (déterministe) ----------

const ENTETES = ['Identifiant', 'Nom', 'Prénom', 'Service', 'Compétences', "Date d'entrée", 'Actif'];
const NOMS = ['DURAND', 'LEFÈVRE', 'MARTIN', 'BÉRANGER', 'PETIT', 'ROUX', 'GARÇON', 'LÉGER', 'FAURE', 'NOËL'];
const PRENOMS = ['Élodie', 'Jérôme', 'Anaïs', 'Hélène', 'Loïc', 'Zoé', 'Gaëtan'];
const SERVICES = ['Achats', 'Juridique', 'Informatique', 'Ressources humaines'];
const COMPETENCES = ['Excel; Word', 'SQL', 'Python; SQL', 'Excel', 'Word; Python'];
const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** 250 lignes, puis une copie de la première (doublon) */
const LIGNES = (() => {
    /** @type {Record<string, string>[]} */
    const lignes = [];
    for (let i = 1; i <= 250; i++) {
        lignes.push({
            Identifiant: `ID-${String(i).padStart(4, '0')}`,
            Nom: NOMS[i % 10],
            Prénom: PRENOMS[i % 7],
            Service: SERVICES[i % 4],
            Compétences: COMPETENCES[i % 5],
            // Jour de 13 à 28 : date lue telle quelle par toutes les versions de SheetJS (0.18 convertissait 02/02/2031 en 2/2/31)
            "Date d'entrée": `${deux((i % 16) + 13)}/${deux((i % 12) + 1)}/2031`,
            Actif: i % 3 === 0 ? 'Non' : 'Oui'
        });
    }
    lignes.push({ ...lignes[0] });
    return lignes;
})();

const jetons = (/** @type {string} */ v) => v.split(/\s*;\s*/).filter(Boolean);

/** Champ CSV : entre guillemets s'il contient le séparateur (listes « a; b ») */
const champCsv = (/** @type {string} */ v) => (v.includes(';') ? `"${v}"` : v);

/** CSV « ; » encodé en Windows-1252 (accents invalides en UTF-8) */
const csvDeTest = () => ({
    name: 'personnes-e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
        [ENTETES.join(';'), ...LIGNES.map(l => ENTETES.map(e => champCsv(l[e])).join(';'))].join('\r\n'),
        'latin1'
    )
});

const texte = (/** @type {string} */ name, /** @type {string[]} */ lignes) => ({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(lignes.join('\n'), 'utf8')
});

// ---------- Ouverture ----------

Given("{string} a accès à l'application « Analyse de fichiers »", async ({ monde }, profil) => {
    const api = await adminApi(monde);
    const { userId } = await monde.sessionDe(profil);
    const acces = await api.ok('GET', '/api/app-access');
    if ((acces.analyse?.users ?? []).some((/** @type {any} */ u) => u.id === userId)) return;
    await api.ok('POST', '/api/app-access/analyse/users', { userId });
    monde.aNettoyer(`accès Analyse de ${profil}`, () => api.delete(`/api/app-access/analyse/users/${userId}`));
});

const application = (/** @type {Monde} */ monde) => monde.page.locator('#analyseContainer');

When("j'ouvre l'Analyse de fichiers en tant que {string}", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
    const page = monde.page;
    await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
    await page.locator('#appSwitcherBtn').click();
    await page.locator('#appSwitcherDropdown > div', { hasText: APPLICATION }).click();
    await expect(page.locator('#analyseDropZone')).toBeVisible();
});

// ---------- Cadre ----------

Then("l'en-tête de l'Analyse présente le nom de {string} et le profil {string}", async ({ monde }, profil, libelle) => {
    const s = await monde.sessionDe(profil);
    await expect(monde.page.locator('#analyseUserDisplayName')).toContainText(String(s.nom));
    await expect(monde.page.locator('#analyseUserDisplayRole')).toHaveText(libelle);
});

Then("le minuteur de l'Analyse décompte", async ({ monde }) => {
    const minuteur = monde.page.locator('#analyseTimerDisplay');
    await expect(minuteur).toBeVisible();
    await expect(minuteur).toHaveText(/\d{2}:\d{2}/);
    const lire = async () => ((await minuteur.textContent()) ?? '').replace(/[^0-9:]/g, '');
    const avant = await lire();
    await expect.poll(lire, { timeout: 5000, message: 'décompte du minuteur' }).not.toBe(avant);
});

When("je demande la déconnexion de l'Analyse et j'annule", async ({ monde }) => {
    const texte = await annulerConfirmation(monde, () => application(monde).locator('.logout-icon').click());
    expect(texte).toContain('Voulez-vous vraiment vous déconnecter ?');
});

Then("l'Analyse de fichiers est toujours affichée", async ({ monde }) => {
    await expect(application(monde)).toBeVisible();
    await expect(monde.page.locator('#analyseDropZone')).toBeVisible();
});

// ---------- Chargement ----------

/** @param {Monde} monde @param {Parameters<import('@playwright/test').Locator['setInputFiles']>[0]} fichier */
async function charger(monde, fichier) {
    await monde.page.locator('#analyseFileInput').setInputFiles(fichier);
}

const chargerEtAttendre = async (/** @type {Monde} */ monde, /** @type {any} */ fichier) => {
    await charger(monde, fichier);
    await expect(monde.page.locator('#analyseWorkspace')).toBeVisible();
};

When("je charge le fichier {string} dans l'Analyse", async ({ monde }, nom) => {
    await charger(monde, { name: nom, mimeType: 'application/octet-stream', buffer: Buffer.from('%PDF-1.4') });
});

When("je charge le CSV de test dans l'Analyse", async ({ monde }) => {
    await chargerEtAttendre(monde, csvDeTest());
});

When("je charge le classeur de test dans l'Analyse", async ({ monde }) => {
    await chargerEtAttendre(monde, {
        name: 'classeur.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fs.readFileSync(CLASSEUR)
    });
});

When("je charge le fichier texte à lignes de titre dans l'Analyse", async ({ monde }) => {
    const villes = ['Paris', 'Lyon', 'Lille', 'Nantes', 'Rennes', 'Brest', 'Nice', 'Metz', 'Caen', 'Pau'];
    await chargerEtAttendre(
        monde,
        texte('equipes-titres.txt', [
            'Rapport E2E des équipes',
            'Généré le 01/01/2031',
            'Code;Equipe;Ville',
            ...villes.map((v, i) => `E${deux(i + 1)};Equipe ${i + 1};${v}`)
        ])
    );
});

When("je charge le fichier texte à largeur fixe dans l'Analyse", async ({ monde }) => {
    await chargerEtAttendre(
        monde,
        texte('equipes-largeur-fixe.txt', [
            'Code   Equipe      Ville',
            'E01    Alpha       Paris',
            'E02    Beta        Lyon',
            'E03    Gamma       Lille',
            'E04    Delta       Nantes'
        ])
    );
});

Then("le fichier chargé est {string} avec l'encodage {string}", async ({ monde }, nom, encodage) => {
    // Icône 📄 remplacée par une image (ui-icons.js) : texte vérifié sans elle
    await expect(monde.page.locator('#analyseFileName')).toHaveText(
        new RegExp(`${echapper(nom)} — encodage : ${echapper(encodage)}$`)
    );
    await expect(monde.page.locator('#analyseEncodingBanner')).toContainText(`Encodage détecté : ${encodage}`);
});

Then('le fichier chargé est {string} sans encodage annoncé', async ({ monde }, nom) => {
    await expect(monde.page.locator('#analyseFileName')).toHaveText(new RegExp(`${echapper(nom)}$`));
    await expect(monde.page.locator('#analyseEncodingBanner')).toBeHidden();
});

Then("le bandeau d'encodage annonce {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#analyseEncodingBanner')).toContainText(texte);
});

const resultats = (/** @type {Monde} */ monde) => monde.page.locator('#analyseResultCount');

Then("l'Analyse compte {int} résultats sur {int} lignes", async ({ monde }, n, total) => {
    await expect(resultats(monde)).toHaveText(`${n} résultat(s) sur ${total} lignes`);
    await expect(monde.page.locator('#analyseStatsHeader')).toHaveText(`${n} / ${total} lignes`);
});

/** Nombre attendu de lignes du CSV de test vérifiant un prédicat */
const attendre = async (/** @type {Monde} */ monde, /** @type {(l: Record<string, string>) => boolean} */ garder) => {
    const n = LIGNES.filter(garder).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(LIGNES.length);
    await expect(resultats(monde)).toHaveText(`${n} résultat(s) sur ${LIGNES.length} lignes`);
};

const entetesTableau = (/** @type {Monde} */ monde) => monde.page.locator('#analyseTableHead th');

Then('le tableau présente les colonnes {string}', async ({ monde }, liste) => {
    await expect
        .poll(async () => (await entetesTableau(monde).allTextContents()).map(t => t.trim()).join(', '))
        .toBe(liste);
});

Then('le tableau présente la valeur {string}', async ({ monde }, valeur) => {
    await expect(monde.page.locator('#analyseTableBody td', { hasText: valeur }).first()).toBeVisible();
});

const ligneTableau = (/** @type {Monde} */ monde, /** @type {string} */ texte) =>
    monde.page.locator('#analyseTableBody tr').filter({ has: monde.page.locator('td', { hasText: texte }) });

Then('la ligne {string} du tableau présente la date {string}', async ({ monde }, texte, date) => {
    await expect(ligneTableau(monde, texte).first()).toContainText(date);
});

// ---------- Structure ----------

const structure = (/** @type {Monde} */ monde) => monde.page.locator('#analyseStructPanel');

When("j'ouvre la structure du fichier", async ({ monde }) => {
    await application(monde)
        .getByRole('button', { name: /Structure/ })
        .click();
    await expect(structure(monde)).toBeVisible();
});

Then('la structure annonce {string}', async ({ monde }, texte) => {
    await expect(structure(monde)).toContainText(texte);
});

const ligneIntitules = (/** @type {Monde} */ monde) => structure(monde).locator('input[type="number"]');

Then(
    'la structure indique les intitulés en ligne {int}, détectés, {int} ligne(s) au-dessus ignorée(s)',
    async ({ monde }, ligne, ignorees) => {
        await expect(ligneIntitules(monde)).toHaveValue(String(ligne));
        const pluriel = ignorees > 1 ? 's' : '';
        await expect(structure(monde)).toContainText(
            `détecté automatiquement — ${ignorees} ligne${pluriel} au-dessus ignorée${pluriel}`
        );
    }
);

When("je choisis la ligne d'intitulés {int}", async ({ monde }, ligne) => {
    await ligneIntitules(monde).fill(String(ligne));
    await ligneIntitules(monde).dispatchEvent('change');
});

const ligneStructure = (/** @type {Monde} */ monde, /** @type {string} */ colonne) =>
    structure(monde)
        .locator('tbody tr')
        .filter({ has: monde.page.locator('td:nth-child(2)', { hasText: new RegExp(`^${colonne}`) }) });

Then(
    'la structure présente la colonne {string} de type {string}, rôle {string}',
    async ({ monde }, colonne, type, confiance) => {
        const l = ligneStructure(monde, colonne);
        await expect(l.locator('td').nth(3)).toHaveText(type);
        await expect(l.locator('td').nth(2)).toContainText(`● ${confiance}`);
    }
);

Then('la structure présente la colonne {string} de type {string}', async ({ monde }, colonne, type) => {
    await expect(ligneStructure(monde, colonne).locator('td').nth(3)).toHaveText(type);
});

When("je renomme la colonne {string} en {string} et j'applique les noms", async ({ monde }, colonne, nom) => {
    await ligneStructure(monde, colonne).locator('input').fill(nom);
    await structure(monde)
        .getByRole('button', { name: /Appliquer les noms de colonnes/ })
        .click();
});

// ---------- Filtres ----------

const filtre = (/** @type {Monde} */ monde, /** @type {string} */ colonne) =>
    monde.page
        .locator('#analyseFiltersPanel > div')
        .filter({ has: monde.page.locator(`[title="${colonne.replace(/"/g, '\\"')}"]`) });

When("j'inclus les valeurs {string} de la colonne {string}", async ({ monde }, valeurs, colonne) => {
    const zone = filtre(monde, colonne);
    const recherche = zone.getByPlaceholder('Rechercher des valeurs à inclure dans le filtre…');
    await recherche.click();
    for (const v of valeurs.split(/\s*,\s*/)) {
        await zone.locator('.sug-item', { hasText: new RegExp(`^${v}$`) }).click();
    }
    await zone.getByRole('button', { name: /^Ajouter/ }).click();
});

When("j'ajoute un groupe ET à la colonne {string} et j'y glisse {string}", async ({ monde }, colonne, valeur) => {
    const zone = filtre(monde, colonne);
    await zone.getByRole('button', { name: /groupe ET/ }).click();
    const groupe2 = zone.getByText('Groupe 2', { exact: true }).locator('xpath=../following-sibling::div[1]');
    await zone.locator('[draggable="true"]', { hasText: valeur }).dragTo(groupe2);
    await expect(groupe2).toContainText(valeur);
});

When("je bascule l'opérateur entre les groupes de la colonne {string}", async ({ monde }, colonne) => {
    await filtre(monde, colonne).locator('[title="Cliquer pour basculer entre ET et OU"]').click();
});

When("j'exclus la valeur {string} de la colonne {string}", async ({ monde }, valeur, colonne) => {
    const zone = filtre(monde, colonne);
    await zone.getByPlaceholder('Rechercher des valeurs à exclure…').click();
    await zone.locator('.excl-item', { hasText: new RegExp(`^${valeur}$`) }).click();
});

Then("l'Analyse compte les lignes dont {string} contient {string} ou {string}", async ({ monde }, colonne, a, b) => {
    await attendre(monde, l => jetons(l[colonne]).some(t => t === a || t === b));
});

Then("l'Analyse compte les lignes dont {string} contient {string} et {string}", async ({ monde }, colonne, a, b) => {
    await attendre(monde, l => jetons(l[colonne]).includes(a) && jetons(l[colonne]).includes(b));
});

Then("l'Analyse compte les lignes dont {string} ne contient pas {string}", async ({ monde }, colonne, v) => {
    await attendre(monde, l => !jetons(l[colonne]).includes(v));
});

Then("l'Analyse compte les lignes dont {string} vaut {string}", async ({ monde }, colonne, v) => {
    await attendre(monde, l => l[colonne] === v);
});

Then("l'Analyse compte les lignes entrées en janvier 2031", async ({ monde }) => {
    await attendre(monde, l => l["Date d'entrée"].endsWith('/01/2031'));
});

Then('les filtres actifs sont {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#analyseActiveFiltersCount')).toHaveText(texte);
});

When("j'efface tous les filtres", async ({ monde }) => {
    await application(monde)
        .getByRole('button', { name: /Tout effacer/ })
        .click();
});

When('je recherche {string} dans la colonne {string}', async ({ monde }, texte, colonne) => {
    await filtre(monde, colonne).getByPlaceholder('Recherche libre…').fill(texte);
});

When('je filtre la colonne {string} avant le {string}', async ({ monde }, colonne, date) => {
    await filtre(monde, colonne).getByRole('button', { name: 'Avant le', exact: true }).click();
    await filtre(monde, colonne).locator('input[type="date"]').fill(date);
});

When('je choisis {string} dans la colonne {string}', async ({ monde }, valeur, colonne) => {
    await filtre(monde, colonne).getByRole('button', { name: valeur, exact: true }).click();
});

// ---------- Colonnes, doublons, pagination ----------

When('je masque la colonne {string}', async ({ monde }, colonne) => {
    const cases = monde.page.locator('#analyseColumnCheckboxes');
    if (!(await cases.isVisible()))
        await application(monde)
            .getByRole('button', { name: /Colonnes/ })
            .click();
    await cases.locator('label', { hasText: colonne }).locator('input').uncheck();
});

When('je cherche les doublons sur la colonne {string}', async ({ monde }, colonne) => {
    await application(monde)
        .getByRole('button', { name: /Doublons/ })
        .click();
    await monde.page
        .locator('#analyseDupCheckboxes label', { hasText: new RegExp(`^\\s*${colonne}\\s*$`) })
        .locator('input')
        .check();
});

Then('les doublons annoncent {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#analyseDupCount')).toHaveText(texte);
});

Then('la page affichée est {int} sur {int}', async ({ monde }, page, total) => {
    await expect(monde.page.locator('#analysePage')).toHaveText(String(page));
    await expect(monde.page.locator('#analysePageTotal')).toHaveText(String(total));
});

When('je passe à la page suivante', async ({ monde }) => {
    // Bouton « ▶ » (ancien écran) ou « Page suivante » (nom accessible de l'îlot)
    await application(monde)
        .getByRole('button', { name: /^(▶|Page suivante)$/ })
        .click();
});

When('je vais à la page {int}', async ({ monde }, page) => {
    await monde.page.locator('#analysePageJump').fill(String(page));
    await monde.page.locator('#analysePageJump').press('Enter');
});

Then('la ligne en doublon {string} est mise en évidence', async ({ monde }, texte) => {
    await expect(ligneTableau(monde, texte)).toHaveAttribute('title', 'Ligne en doublon');
});

When("j'affiche {int} lignes par page", async ({ monde }, n) => {
    await monde.page.locator('#analysePageSizeSelect').selectOption(String(n));
});

// ---------- Export ----------

Then(
    "l'export CSV de l'Analyse contient les lignes dont {string} vaut {string}, sans la colonne {string}",
    async ({ monde }, colonne, valeur, masquee) => {
        const { nom, contenu } = await telecharger(
            monde,
            application(monde).getByRole('button', { name: /Export CSV/ })
        );
        expect(nom).toMatch(/^analyse_export_\d{4}-\d{2}-\d{2}\.csv$/);
        const colonnes = ENTETES.filter(e => e !== masquee);
        const champ = (/** @type {string} */ v) => `"${v.replace(/"/g, '""')}"`;
        const attendu = [
            colonnes.map(champ).join(';'),
            ...LIGNES.filter(l => l[colonne] === valeur).map(l => colonnes.map(c => champ(l[c])).join(';'))
        ].join('\r\n');
        expect(contenu).toBe(`\uFEFF${attendu}`);
    }
);

// ---------- Fichier conservé ----------

When('je coche « Conserver ce fichier localement »', async ({ monde }) => {
    await monde.page.locator('#analyseSaveLocalChk').check();
});

When('je charge un nouveau fichier', async ({ monde }) => {
    await application(monde)
        .getByRole('button', { name: /Nouveau fichier/ })
        .click();
    await expect(monde.page.locator('#analyseDropZone')).toBeVisible();
});

Then('le fichier sauvegardé proposé est {string}', async ({ monde }, nom) => {
    await expect(monde.page.locator('#analyseSavedFileBar')).toBeVisible();
    await expect(monde.page.locator('#analyseSavedFileName')).toHaveText(nom);
});

When('je charge le fichier sauvegardé', async ({ monde }) => {
    await monde.page.locator('#analyseSavedFileBar').getByRole('button', { name: 'Charger' }).click();
    await expect(monde.page.locator('#analyseWorkspace')).toBeVisible();
});

When('je supprime le fichier sauvegardé', async ({ monde }) => {
    await monde.page.locator('#analyseSavedFileBar').getByRole('button', { name: 'Supprimer' }).click();
});

Then("aucun fichier sauvegardé n'est proposé", async ({ monde }) => {
    await expect(monde.page.locator('#analyseSavedFileBar')).toBeHidden();
    await expect(monde.page.locator('#analyseSaveLocalChk')).not.toBeChecked();
});
