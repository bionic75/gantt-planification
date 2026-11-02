// @ts-check
// CRA › circuit (écran) : cartes des CRA en cours, détail, saisie des lignes, soumission, rappel, « Rien à déclarer »,
// visas, refus, correction et renvoi par l'administrateur, document PDF, lien direct
import { expect } from '@playwright/test';
import { profil as profilDe } from '../support/config.js';
import { connecterBureau } from '../support/connexion.js';
import { adminApi, creerLocalisation } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const pad = (/** @type {number | string} */ n) => String(n).padStart(2, '0');

/** « mars 2093 », comme l'écran (date du navigateur en français) */
const moisNom = (/** @type {Monde} */ monde) =>
    new Date(monde.d.mois.annee, monde.d.mois.mois - 1, 1).toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
    });
const majuscule = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
const titreCarte = (/** @type {Monde} */ monde) => `Compte-rendu d'activité de ${moisNom(monde)}`;

/** Sections de cartes : titre → conteneur */
const SECTIONS = /** @type {Record<string, string>} */ ({
    'Mes CRA en cours de traitement': '#craListEnCours',
    'CRA en cours de traitement': '#craAdminEnCours'
});
const carte = (/** @type {Monde} */ monde, /** @type {string} */ section) =>
    monde.page.locator(SECTIONS[section]).locator(':scope > div', { hasText: titreCarte(monde) });

const detail = (/** @type {Monde} */ monde) => monde.page.locator('#craDetailPanel');
const actions = (/** @type {Monde} */ monde) => monde.page.locator('#craActionButtons');
const saisie = (/** @type {Monde} */ monde) => monde.page.locator('#craSaisieModal');
const lignesSaisie = (/** @type {Monde} */ monde) => monde.page.locator('#craSaisieList > div');

/** Libellé d'un bouton sans son pictogramme */
const libelle = (/** @type {string} */ texte) => texte.replace(/^[^\p{L}]+/u, '').trim();
const action = (/** @type {Monde} */ monde, /** @type {string} */ nom) =>
    actions(monde)
        .getByRole('button')
        .filter({ hasText: new RegExp(`${nom.replace(/[()/]/g, '\\$&')}\\s*$`) });

Given('un SAMU de test existe', async ({ monde }) => {
    monde.d.samu = (await creerLocalisation(monde, { geo: false })).court;
});

// ---------- Cartes ----------

Then(/^le CRA du mois figure dans « (.+) » au statut "(.+)"$/, async ({ monde }, section, statut) => {
    const c = carte(monde, section);
    await expect(c).toHaveCount(1);
    await expect(c).toContainText(statut);
});

Then(/^le CRA du mois ne figure plus dans « (.+) »$/, async ({ monde }, section) => {
    await expect(monde.page.locator(SECTIONS[section])).toBeVisible();
    await expect(carte(monde, section)).toHaveCount(0);
});

When("j'ouvre le CRA du mois", async ({ monde }) => {
    await monde.page.locator('#cra').getByText(titreCarte(monde)).first().click();
    await expect(detail(monde)).toBeVisible();
});

// ---------- Détail ----------

Then('le détail du CRA du mois est affiché', async ({ monde }) => {
    await expect(detail(monde)).toBeVisible();
    await expect(monde.page.locator('#craDetailTitle')).toHaveText(`CRA — ${majuscule(moisNom(monde))}`);
});

Then('le détail du CRA indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#craDataSection')).toContainText(texte);
});

Then(/^les actions proposées sont (.+)$/, async ({ monde }, liste) => {
    const attendu = [...liste.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    await expect
        .poll(async () =>
            (await actions(monde).locator('button:visible').allTextContents()).map(libelle).filter(Boolean)
        )
        .toEqual(attendu);
});

When('je ferme le détail du CRA', async ({ monde }) => {
    await detail(monde)
        .getByRole('button', { name: /✕|Fermer/ })
        .first()
        .click();
});

Then("le détail du CRA n'est plus affiché", async ({ monde }) => {
    await expect(detail(monde)).toBeHidden();
});

Then(
    "le détail du CRA liste l'activité {string} de {string} pour l'objet {string}",
    async ({ monde }, type, heures, objet) => {
        const ligne = monde.page.locator('#craDataSection tbody tr', { hasText: objet });
        await expect(ligne).toHaveCount(1);
        await expect(ligne).toContainText(type);
        await expect(ligne).toContainText(heures);
    }
);

Then("l'historique des signatures du détail présente {string} et {string}", async ({ monde }, a, b) => {
    const historique = monde.page.locator('#craStatusTimeline');
    await expect(historique).toContainText('Historique des signatures');
    await expect(historique).toContainText(a);
    await expect(historique).toContainText(b);
});

Then('le détail du CRA présente le motif de refus {string}', async ({ monde }, motif) => {
    await expect(monde.page.locator('#craRefusPanel')).toBeVisible();
    await expect(monde.page.locator('#craRefusCommentaire')).toHaveText(motif);
});

Then('le détail du CRA signale {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#craAdminModPanel')).toBeVisible();
    await expect(monde.page.locator('#craAdminModText')).toContainText(texte);
});

// ---------- Actions du circuit ----------

When("je clique sur l'action {string} et je confirme", async ({ monde }, nom) => {
    await confirmer(monde, () => action(monde, nom).click());
});

When('je saisis le commentaire {string} et je soumets le CRA', async ({ monde }, commentaire) => {
    await monde.page.locator('#craCommentaire').fill(commentaire);
    await confirmer(monde, () => action(monde, 'Valider et soumettre').click());
});

Then("le CRA porte le commentaire de l'expert {string}", async ({ monde }, commentaire) => {
    const api = await adminApi(monde);
    await expect
        .poll(async () => (await api.ok('GET', `/api/cra/${monde.d.craId}`)).commentaire_expert)
        .toBe(commentaire);
});

Then("le commentaire du CRA n'est plus modifiable", async ({ monde }) => {
    await expect(monde.page.locator('#craCommentaire')).toBeDisabled();
});

Given("l'administrateur de test est viseur des CRA en N1 et N2", async ({ monde, $test }) => {
    const { userId } = await monde.sessionDe('Administrateur');
    const reglages = await (await adminApi(monde)).ok('GET', '/api/settings');
    const c = reglages.automation_4_config ? JSON.parse(reglages.automation_4_config) : {};
    // Sans viseur désigné, tout administrateur vise ; sinon, seuls les viseurs désignés
    const ouvert = !c.admin_n1_id && !c.admin_n2_id;
    const designe = String(c.admin_n1_id) === String(userId) && String(c.admin_n2_id) === String(userId);
    $test.skip(
        !ouvert && !designe,
        "Viseurs N1 / N2 désignés (automatisation n°4) : l'administrateur de test n'en est pas"
    );
});

const motifRefus = (/** @type {Monde} */ monde) => monde.page.locator('#craCommentaireRefus');

/** Zone du motif de refus ouverte (le bouton « Refuser » l'ouvre ou la referme) */
async function ouvrirRefus(/** @type {Monde} */ monde) {
    if (!(await motifRefus(monde).isVisible())) await action(monde, 'Refuser').click();
    await expect(motifRefus(monde)).toBeVisible();
}

const confirmerRefus = (/** @type {Monde} */ monde) =>
    detail(monde).getByRole('button', { name: /Confirmer le refus et notifier l'expert/ });

When('je refuse le CRA sans motif', async ({ monde }) => {
    await ouvrirRefus(monde);
    await motifRefus(monde).fill('');
    await confirmerRefus(monde).click();
});

When('je refuse le CRA avec le motif {string} et je confirme', async ({ monde }, motif) => {
    await ouvrirRefus(monde);
    await motifRefus(monde).fill(motif);
    await confirmer(monde, () => confirmerRefus(monde).click());
});

// ---------- Saisie des lignes ----------

When("j'ouvre la saisie du CRA", async ({ monde }) => {
    await action(monde, 'Compléter mon CRA').or(action(monde, 'Modifier ce CRA (admin)')).first().click();
    await expect(saisie(monde)).toBeVisible();
});

When(
    /^j'ajoute dans la saisie une ligne "(.+)" le (\d+) de "(.+)" à "(.+)" pour l'objet "(.*)"$/,
    async ({ monde }, type, jour, debut, fin, objet) => {
        const page = monde.page;
        const date = `${monde.d.mois.annee}-${pad(monde.d.mois.mois)}-${pad(jour)}`;
        await page.locator('#craSaisieType').selectOption({ label: type });
        await page.locator('#craSaisieDateDebut').fill(date);
        await page.locator('#craSaisieDateFin').fill(date);
        await page.locator('#craSaisieHeureDebut').fill(debut);
        await page.locator('#craSaisieHeureFin').fill(fin);
        await page.locator('#craSaisieSamu').selectOption(monde.d.samu);
        await page.locator('#craSaisieObjet').fill(objet);
        await page.locator('#craSaisieAddBtn').click();
    }
);

Then('la saisie liste {int} ligne(s)', async ({ monde }, n) => {
    await expect(lignesSaisie(monde)).toHaveCount(n);
});

When("je modifie dans la saisie l'heure de fin de la ligne {int} à {string}", async ({ monde }, n, fin) => {
    await lignesSaisie(monde)
        .nth(n - 1)
        .getByTitle('Modifier', { exact: true })
        .click();
    await monde.page.locator('#craSaisieHeureFin').fill(fin);
    await monde.page.locator('#craSaisieAddBtn').click();
});

When('je supprime dans la saisie la ligne {int} et je confirme', async ({ monde }, n) => {
    await confirmer(monde, () =>
        lignesSaisie(monde)
            .nth(n - 1)
            .getByTitle('Supprimer', { exact: true })
            .click()
    );
});

When('je termine la saisie', async ({ monde }) => {
    await saisie(monde)
        .getByRole('button', { name: /Terminer$/ })
        .click();
    await expect(saisie(monde)).toBeHidden();
    await expect(detail(monde)).toBeVisible();
});

// ---------- Document PDF ----------

When('je télécharge le PDF du CRA', async ({ monde }) => {
    const [fenetre] = await Promise.all([monde.page.waitForEvent('popup'), monde.page.locator('#craPdfBtn').click()]);
    await fenetre.waitForLoadState();
    monde.d.documentCra = fenetre;
});

Then(
    "le document du CRA présente le mois, le statut {string} et l'activité {string}",
    async ({ monde }, statut, objet) => {
        const corps = monde.d.documentCra.locator('body');
        await expect(corps).toContainText("Compte-Rendu d'Activité");
        await expect(corps).toContainText(majuscule(moisNom(monde)));
        await expect(corps).toContainText(statut);
        await expect(corps).toContainText(objet);
        await monde.d.documentCra.close();
    }
);

// ---------- Lien direct ----------

// Lien traité à la connexion par la mire (sans effet sur une session déjà ouverte, comme l'ancien écran)
When('{string} se connecte par le lien direct vers le CRA du mois', async ({ monde }, profil) => {
    const { page } = await monde.anonyme(`lien ${profil}`);
    await connecterBureau(page, profilDe(profil), { url: `/?tab=cra&cra_id=${monde.d.craId}` });
});
