// @ts-check
// Aide à l'affectation › onglet « Administration » : déploiements (formulaire, contrôles, liens avec les événements,
// historique, suppression), couleurs des étapes, nom des fichiers d'export, correspondance des activités, rubriques
// repliables. Localisation, déploiements et événements de test supprimés en fin de scénario ; couleurs et nom des
// fichiers d'export (communs à tous) rétablis en fin de scénario.
import { expect } from '@playwright/test';
import { adminApi, lireDeploiement, lireEvenement, suivreDeploiement } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer } from '../support/interface.js';
import { attendreFinDemarrage, ouvrirApplication } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Page} Page */

const APPLICATION = "Aide à l'affectation opérationnelle";
const onglet = (/** @type {Monde} */ monde) => monde.page.locator('#affectationAdminTab');
const fenetre = (/** @type {Monde} */ monde) => monde.page.locator('#affProjectModal');
const corpsFormulaire = (/** @type {Monde} */ monde) => monde.page.locator('#affModalBody');
const ligneDeploiement = (/** @type {Monde} */ monde) =>
    monde.page.locator('#affProjects .aff-proj').filter({
        has: monde.page.locator('.aff-proj-name', { hasText: new RegExp(`^${monde.d.localisation.court}$`) })
    });

/** Application ouverte par le menu Applications, onglet « Administration » affiché */
async function ouvrirAdministration(/** @type {Page} */ page) {
    if (!(await page.locator('#affectationContainer').isVisible())) {
        await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
        await page.locator('#appSwitcherBtn').click();
        await page.locator('#appSwitcherDropdown > div', { hasText: APPLICATION }).click();
        await expect(page.locator('#affectationContainer')).toBeVisible({ timeout: 20000 });
    }
    await page.locator('#affectationTabAdmin').click();
    await expect(page.locator('#affectationAdminTab')).toBeVisible();
    await expect(page.locator('#affProjects')).not.toContainText('Chargement', { timeout: 20000 });
}

Given("j'ouvre l'administration de l'aide à l'affectation en tant que {string}", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
    await ouvrirAdministration(monde.page);
});

When("je rouvre l'administration de l'aide à l'affectation", async ({ monde }) => {
    const page = monde.page;
    await page.reload();
    await expect(page.locator('#userInfo:visible, #affectationContainer:visible').first()).toBeVisible({
        timeout: 30000
    });
    await attendreFinDemarrage(page);
    await ouvrirAdministration(page);
});

Then("l'onglet « Administration » de l'aide à l'affectation n'est pas proposé", async ({ monde }) => {
    await expect(monde.page.locator('#affectationTabPlanning')).toBeVisible();
    await expect(monde.page.locator('#affectationTabAdmin')).toBeHidden();
});

// ---------- Formulaire d'un déploiement ----------

/** Déploiement créé par l'écran : supprimé en fin de scénario (avec ses événements) */
function nettoyerDeploiementsDuSamu(/** @type {Monde} */ monde) {
    const samu = monde.d.localisation.court;
    monde.aNettoyer(`déploiements ${samu}`, async () => {
        const api = await adminApi(monde);
        const { projects } = await api.ok('GET', '/api/affectation/projects');
        for (const p of projects.filter((/** @type {any} */ x) => x.samu_name === samu)) {
            await api.delete(`/api/affectation/projects/${p.id}?events=delete`);
        }
    });
}

When("j'ouvre le formulaire « Nouveau déploiement »", async ({ monde }) => {
    nettoyerDeploiementsDuSamu(monde);
    await onglet(monde).getByRole('button', { name: 'Nouveau déploiement' }).click();
    await expect(fenetre(monde)).toBeVisible();
    await expect(fenetre(monde)).toContainText('Nouveau déploiement de SAMU');
    await expect(
        corpsFormulaire(monde).getByText('Enregistrez le déploiement pour relier des événements.').first()
    ).toBeVisible();
});

When('je choisis le SAMU de test parmi les entités proposées, au clavier', async ({ monde }) => {
    const champ = monde.page.locator('#affSamu');
    await champ.fill(monde.d.localisation.court);
    const liste = monde.page.locator('#affSug');
    await expect(liste).toBeVisible();
    await expect(liste.locator('.cnt')).toContainText('Entrée pour choisir');
    await expect(liste.locator('div[data-i]').first()).toContainText(monde.d.localisation.court);
    await champ.press('ArrowDown');
    await expect(liste.locator('div[data-i]').first()).toHaveClass(/\bon\b/);
    await champ.press('Enter');
    await expect(liste).toBeHidden();
    await expect(champ).toHaveValue(monde.d.localisation.court);
});

/** Saisie d'une date comme au clavier : valeur puis validation du champ */
async function saisirDate(/** @type {import('@playwright/test').Locator} */ champ, /** @type {string} */ date) {
    await champ.fill(date);
    await champ.dispatchEvent('change');
}

When('je saisis le début du projet {string}', async ({ monde }, date) => {
    await saisirDate(monde.page.locator('#affDebut'), date);
});

const champVisite = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    corpsFormulaire(monde).getByLabel(`${libelle} Visite métier`, { exact: true });

When(
    'je choisis dans le calendrier la semaine {int} de mars 2034 pour le début de la visite métier',
    async ({ monde }, semaine) => {
        const page = monde.page;
        await champVisite(monde, 'Début').click();
        const calendrier = page.locator('.aff-dp');
        await expect(calendrier).toBeVisible();
        // Ouvert sur la borne basse (début du projet, janvier 2034)
        await expect(calendrier.locator('.hd')).toContainText('Janvier 2034');
        await calendrier.getByRole('button', { name: 'Mois suivant' }).click();
        await calendrier.getByRole('button', { name: 'Mois suivant' }).click();
        await expect(calendrier.locator('.hd')).toContainText('Mars 2034');
        await calendrier.locator(`td.wk[title^="Choisir la semaine ${semaine} "]`).click();
        await expect(calendrier).toBeHidden();
    }
);

Then(
    'la visite métier commence le {string} en semaine {string} et finit le {string}',
    async ({ monde }, debut, semaine, fin) => {
        await expect(champVisite(monde, 'Début')).toHaveValue(debut);
        await expect(champVisite(monde, 'Semaine de début')).toHaveValue(semaine);
        await expect(champVisite(monde, 'Fin')).toHaveValue(fin);
        await expect(champVisite(monde, 'Nombre de jours')).toHaveValue('1');
    }
);

When('je saisis {int} jours et {int} ressources pour la visite métier', async ({ monde }, jours, ressources) => {
    await champVisite(monde, 'Nombre de jours').fill(String(jours));
    await champVisite(monde, 'Ressources nécessaires').selectOption(String(ressources));
});

Then('la visite métier finit le {string}', async ({ monde }, fin) => {
    await expect(champVisite(monde, 'Fin')).toHaveValue(fin);
});

When('je saisis une visite métier du {string} au {string}', async ({ monde }, debut, fin) => {
    await saisirDate(champVisite(monde, 'Début'), debut);
    await saisirDate(champVisite(monde, 'Fin'), fin);
});

When("j'enregistre le déploiement", async ({ monde }) => {
    await fenetre(monde).getByRole('button', { name: 'Enregistrer' }).click();
});

When("je saisis la mise en service {string} et j'enregistre le déploiement", async ({ monde }, date) => {
    await saisirDate(corpsFormulaire(monde).getByLabel('Mise en service', { exact: true }), date);
    await fenetre(monde).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetre(monde)).toBeHidden();
});

Then('le déploiement du SAMU de test est listé avec {string}', async ({ monde }, texte) => {
    await expect(fenetre(monde)).toBeHidden();
    await expect(ligneDeploiement(monde)).toHaveCount(1);
    await expect(ligneDeploiement(monde)).toContainText(texte);
    if (!monde.d.deploiement) {
        const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
        const dep = projects.find((/** @type {any} */ p) => p.samu_name === monde.d.localisation.court);
        expect(dep, 'déploiement créé').toBeTruthy();
        await suivreDeploiement(monde, dep);
    }
});

Then(
    'le déploiement enregistré est rattaché à la localisation, avec une visite métier du {string} au {string} pour {int} ressources',
    async ({ monde }, debut, fin, ressources) => {
        expect(await lireDeploiement(monde, monde.d.deploiement.id)).toMatchObject({
            location_id: monde.d.localisation.id,
            periods: { visite_metier: [{ start: debut, end: fin, needed: ressources }] }
        });
    }
);

Then('le formulaire signale {string}', async ({ monde }, message) => {
    await expect(monde.page.locator('#affModalError')).toContainText(`• ${message}`);
});

Then("aucun déploiement n'est enregistré pour le SAMU de test", async ({ monde }) => {
    await expect(fenetre(monde)).toBeVisible();
    await expect(corpsFormulaire(monde).locator('.aff-bad').first()).toBeVisible();
    const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
    expect(projects.filter((/** @type {any} */ p) => p.samu_name === monde.d.localisation.court)).toEqual([]);
});

When('je modifie le déploiement du SAMU de test', async ({ monde }) => {
    await ligneDeploiement(monde).getByRole('button', { name: 'Modifier les dates' }).click();
    await expect(fenetre(monde)).toBeVisible();
    await expect(fenetre(monde)).toContainText(`Modifier : ${monde.d.localisation.court}`);
    await expect(monde.page.locator('#affSamu')).toHaveValue(monde.d.localisation.court);
});

Then('le déploiement enregistré a sa mise en service au {string}', async ({ monde }, date) => {
    expect((await lireDeploiement(monde, monde.d.deploiement.id)).date_mise_en_service).toBe(date);
});

When('je ferme le formulaire du déploiement', async ({ monde }) => {
    await fenetre(monde).getByRole('button', { name: 'Annuler' }).click();
    await expect(fenetre(monde)).toBeHidden();
});

// ---------- Événements reliés ----------

const evenement = (/** @type {Monde} */ monde, /** @type {string} */ nom) => {
    const e = (monde.d.evenements ?? []).find((/** @type {any} */ x) => x.nom === nom);
    if (!e) throw new Error(`Événement de test inconnu : ${nom}`);
    return /** @type {number} */ (e.id);
};

When("je relie l'événement {string} à la visite métier", async ({ monde }, nom) => {
    const liste = corpsFormulaire(monde).locator('.aff-evl[data-ek="visite_metier"] select');
    await expect(liste).toBeVisible({ timeout: 20000 });
    await liste.selectOption(String(evenement(monde, nom)));
});

Then("le formulaire indique « ✔ mêmes dates que l'activité » pour la visite métier", async ({ monde }) => {
    await expect(monde.page.locator('#aEvInfo_visite_metier')).toHaveText("✔ mêmes dates que l'activité");
});

Then("la visite métier du déploiement est reliée à l'événement {string}", async ({ monde }, nom) => {
    const api = await adminApi(monde);
    await expect
        .poll(
            async () =>
                (await api.ok('GET', `/api/affectation/projects/${monde.d.deploiement.id}/events-candidates`))
                    .candidates.visite_metier.linked
        )
        .toBe(evenement(monde, nom));
});

// ---------- Suppression ----------

const boutonSupprimer = (/** @type {Monde} */ monde) =>
    ligneDeploiement(monde).getByRole('button', { name: 'Supprimer ce déploiement' });

When('je supprime le déploiement du SAMU de test', async ({ monde }) => {
    const texte = await confirmer(monde, () => boutonSupprimer(monde).click());
    expect(texte).toContain(`Supprimer le déploiement « ${monde.d.localisation.court} » ?`);
});

When('je renonce à supprimer le déploiement du SAMU de test', async ({ monde }) => {
    await annulerConfirmation(monde, () => boutonSupprimer(monde).click());
});

Then("la suppression présente l'événement {string} lié au déploiement", async ({ monde }, nom) => {
    const boite = monde.page.locator('#affDelEvModal');
    await expect(boite).toBeVisible();
    await expect(boite).toContainText(`${monde.d.localisation.court} est relié à 1 événement(s). Que faire ?`);
    await expect(boite).toContainText(`${monde.d.prefixeEvenements} ${nom}`);
    await expect(boite).toContainText('03/03/2031 → 05/03/2031');
});

When('je choisis « Supprimer le déploiement seulement »', async ({ monde }) => {
    const boite = monde.page.locator('#affDelEvModal');
    await boite.getByRole('button', { name: 'Supprimer le déploiement seulement' }).click();
    await expect(boite).toBeHidden();
});

Then("le déploiement du SAMU de test n'est plus listé", async ({ monde }) => {
    await expect(ligneDeploiement(monde)).toHaveCount(0);
    expect(await lireDeploiement(monde, monde.d.deploiement.id)).toBeUndefined();
});

Then("l'événement {string} existe toujours", async ({ monde }, nom) => {
    expect(await lireEvenement(monde, evenement(monde, nom))).toBeTruthy();
});

// ---------- Historique ----------

When("j'ouvre l'historique du déploiement du SAMU de test", async ({ monde }) => {
    await ligneDeploiement(monde)
        .getByRole('button', { name: /^Historique/ })
        .click();
    const boite = monde.page.locator('#affHistModal');
    await expect(boite).toBeVisible();
    await expect(boite).toContainText(`Historique — ${monde.d.localisation.court}`);
    await expect(boite.locator('.aff-hist-item').first()).toBeVisible();
});

Then("l'historique présente {string} puis {string}", async ({ monde }, premiere, seconde) => {
    const items = monde.page.locator('#affHistBody .aff-hist-tag');
    await expect(items).toHaveText([premiere, seconde]);
    await expect(monde.page.locator('#affHistBody')).toContainText('2 événement(s), du plus récent au plus ancien.');
});

Then("l'historique indique {string} de {string} à {string}", async ({ monde }, rubrique, avant, apres) => {
    await expect(monde.page.locator('#affHistBody li', { hasText: `${rubrique} : ${avant}` })).toHaveText(
        `${rubrique} : ${avant} → ${apres}`
    );
});

// ---------- Couleurs des étapes ----------

const ligneCouleur = (/** @type {Monde} */ monde, /** @type {string} */ etape) =>
    monde.page
        .locator('#affColors .aff-color-row')
        .filter({ has: monde.page.locator('.lbl', { hasText: new RegExp(`^${etape}$`) }) });

When(
    "je choisis la couleur {string} et le motif « {word} » pour l'étape « {}»",
    async ({ monde }, couleur, motif, etape) => {
        // Couleurs communes à tous : rétablies en fin de scénario
        const api = await adminApi(monde);
        const { colors, patterns } = await api.ok('GET', '/api/affectation/config');
        monde.aNettoyer('couleurs des étapes', () => api.ok('PUT', '/api/affectation/colors', { colors, patterns }));
        const ligne = ligneCouleur(monde, etape.trim());
        await ligne.locator('input[type="color"]').fill(couleur);
        await ligne.locator('select').selectOption({ label: motif });
    }
);

const apercu = (/** @type {Monde} */ monde, /** @type {string} */ etape) =>
    ligneCouleur(monde, etape.trim()).locator('.aff-pat-prev');

Then("l'aperçu de l'étape « {}» est en {string} avec un motif", async ({ monde }, etape, rgb) => {
    await expect(apercu(monde, etape)).toHaveCSS('background-color', rgb);
    await expect(apercu(monde, etape)).toHaveCSS('background-image', /^url\(/);
});

Then("l'aperçu de l'étape « {}» n'a plus de motif", async ({ monde }, etape) => {
    await expect(apercu(monde, etape)).toHaveCSS('background-image', 'none');
});

When("j'enregistre les couleurs", async ({ monde }) => {
    await onglet(monde).getByRole('button', { name: 'Enregistrer les couleurs' }).click();
});

When('je rétablis les couleurs par défaut', async ({ monde }) => {
    await onglet(monde).getByRole('button', { name: 'Couleurs par défaut' }).click();
});

Then('le message des couleurs indique {string}', async ({ monde }, message) => {
    await expect(monde.page.locator('#affColorsMsg')).toHaveText(message);
});

Then(
    "la couleur {string} et le motif {string} de l'étape « {word} » sont enregistrés",
    async ({ monde }, couleur, motif, cle) => {
        const { colors, patterns } = await (await adminApi(monde)).ok('GET', '/api/affectation/config');
        expect(colors[cle]).toBe(couleur);
        expect(patterns[cle]).toBe(motif);
    }
);

// ---------- Nom des fichiers d'export ----------

async function retablirNomEnFin(/** @type {Monde} */ monde) {
    if (monde.d.nomExportRetabli) return;
    monde.d.nomExportRetabli = true;
    const api = await adminApi(monde);
    const { pattern } = await api.ok('GET', '/api/affectation/export-config');
    monde.aNettoyer("nom des fichiers d'export", () => api.ok('PUT', '/api/affectation/export-config', { pattern }));
}

When('je saisis le modèle de nom {string}', async ({ monde }, modele) => {
    await retablirNomEnFin(monde);
    await monde.page.locator('#affFnPattern').fill(modele);
});

Then("l'exemple de nom est {string}", async ({ monde }, nom) => {
    await expect(monde.page.locator('#affFnExample')).toHaveText(
        nom.replace('{année}', String(new Date().getFullYear()))
    );
});

When("j'enregistre le modèle de nom", async ({ monde }) => {
    await monde.page.locator('.aff-fn').getByRole('button', { name: 'Enregistrer' }).click();
});

When('je rétablis le nom par défaut', async ({ monde }) => {
    await retablirNomEnFin(monde);
    await monde.page.locator('.aff-fn').getByRole('button', { name: 'Par défaut' }).click();
    await expect(monde.page.locator('#affTplMsg')).toHaveText('Nom de fichier enregistré.');
});

Then('le message du modèle indique {string}', async ({ monde }, message) => {
    await expect(monde.page.locator('#affTplMsg')).toHaveText(message);
});

Then('le modèle de nom enregistré est {string}', async ({ monde }, modele) => {
    const config = await (await adminApi(monde)).ok('GET', '/api/affectation/export-config');
    expect(config.pattern).toBe(modele);
});

Then('le modèle de nom enregistré est celui par défaut', async ({ monde }) => {
    const config = await (await adminApi(monde)).ok('GET', '/api/affectation/export-config');
    expect(config.pattern).toBe(config.defaultPattern);
    await expect(monde.page.locator('#affFnPattern')).toHaveValue(config.defaultPattern);
});

// ---------- Asana (ancien code) ----------

Then("la rubrique « Connexion Asana » présente l'état de la connexion", async ({ monde }) => {
    await expect(monde.page.locator('#affAsanaCfg')).toContainText(/Connexion|connexion Asana/, { timeout: 20000 });
    await expect(monde.page.locator('#affAsanaCfg')).not.toContainText('Chargement');
});

const fenetreImportAsana = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaModal');

When("j'ouvre « Importer depuis Asana »", async ({ monde }) => {
    await onglet(monde).getByRole('button', { name: 'Importer depuis Asana' }).click();
});

Then("la fenêtre d'import d'un export CSV d'Asana est proposée", async ({ monde }) => {
    await expect(fenetreImportAsana(monde)).toBeVisible();
    await expect(fenetreImportAsana(monde).locator('#affAsanaFile')).toBeVisible();
});

When("je ferme la fenêtre d'import Asana", async ({ monde }) => {
    await fenetreImportAsana(monde).locator('.aff-modal-foot').getByRole('button', { name: 'Fermer' }).click();
});

Then("la fenêtre d'import d'un export CSV d'Asana est fermée", async ({ monde }) => {
    await expect(fenetreImportAsana(monde)).toBeHidden();
});

// ---------- Correspondance, rubriques repliables ----------

Then(
    "la correspondance présente l'activité « {}» avec son type d'événement et son aperçu",
    async ({ monde }, activite) => {
        const ligne = monde.page
            .locator('#affStageTypes tbody tr')
            .filter({ has: monde.page.locator('td:first-child', { hasText: new RegExp(`^${activite.trim()}$`) }) });
        await expect(ligne).toHaveCount(1, { timeout: 20000 });
        await expect(ligne.locator('td:nth-child(2) select')).toBeVisible();
        await expect(ligne.locator('td:nth-child(3) select')).toHaveValue(/^\d+$/);
        await expect(ligne.locator('td:nth-child(4) span').first()).toBeVisible();
    }
);

const rubrique = (/** @type {Monde} */ monde, /** @type {string} */ titre) =>
    onglet(monde)
        .locator('section.aff-card')
        .filter({
            has: monde.page.locator('.aff-card-title', { hasText: titre })
        });

async function basculerRubrique(/** @type {Monde} */ monde, /** @type {string} */ titre) {
    await rubrique(monde, titre).locator('.aff-card-title').click();
}

When('je replie la rubrique « {}»', async ({ monde }, titre) => {
    await basculerRubrique(monde, titre.trim());
});

When('je déplie la rubrique « {}»', async ({ monde }, titre) => {
    await basculerRubrique(monde, titre.trim());
});

Then('la rubrique « {}» est repliée', async ({ monde }, titre) => {
    await expect(rubrique(monde, titre.trim())).toHaveClass(/\bfolded\b/);
    await expect(rubrique(monde, titre.trim()).locator('.aff-card-body')).toBeHidden();
});

Then('la rubrique « {}» est dépliée', async ({ monde }, titre) => {
    await expect(rubrique(monde, titre.trim())).not.toHaveClass(/\bfolded\b/);
    await expect(rubrique(monde, titre.trim()).locator('.aff-card-body')).toBeVisible();
});
