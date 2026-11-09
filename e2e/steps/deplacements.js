// @ts-check
// Suivi des déplacements › mes déplacements : formulaire d'ajout, contrôles, liste, modification, suppression, tri.
// Bon de commande de test (10 UO, année 2031) et déplacements de 2031 à ville unique, supprimés en fin de scénario.
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';
import { ouvrirApplication } from './commun.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const APPLICATION = 'Suivi des déplacements';
/** Fond des lignes à traiter (à affecter, en dépassement) */
const ROUGE_ATTENTION = 'rgb(255, 235, 238)';

/** Ville unique des déplacements de test (en majuscules, comme enregistrée) */
function villeDeTest(/** @type {Monde} */ monde, suffixe = '') {
    monde.d.villeBase ??= monde
        .unique('E2EVILLE')
        .replace(/[^A-Z0-9]/gi, '')
        .toUpperCase();
    return `${monde.d.villeBase}${suffixe}`;
}

/** Déplacements de test (ville commençant par la ville de base), supprimés avant le bon de commande */
async function deplacementsDeTest(/** @type {Monde} */ monde) {
    const tous = await (await adminApi(monde)).ok('GET', '/api/deplacements');
    return tous.filter((/** @type {any} */ d) => String(d.ville).startsWith(villeDeTest(monde)));
}

Given("{string} a accès à l'application « Suivi des déplacements »", async ({ monde, $test }, profil) => {
    const api = await adminApi(monde);
    const { userId } = await monde.sessionDe(profil);
    const acces = await api.ok('GET', '/api/app-access');
    const deja = (acces.deplacements?.users ?? []).some((/** @type {any} */ u) => u.id === userId);
    if (profil === 'Administrateur') {
        $test.skip(!deja, "Compte administrateur de test sans accès à l'application « Suivi des déplacements »");
        return;
    }
    if (!deja) {
        await api.ok('POST', '/api/app-access/deplacements/users', { userId });
        monde.aNettoyer(`accès Déplacements de ${profil}`, () =>
            api.delete(`/api/app-access/deplacements/users/${userId}`)
        );
    }
});

Given("un bon de commande de test de 10 UO couvre l'année 2031", async ({ monde }) => {
    const api = await adminApi(monde);
    const intitule = monde.unique('BDC-E2E').replace(/\s+/g, '-');
    monde.aNettoyer('bon de commande de test', async () => {
        for (const d of await deplacementsDeTest(monde)) await api.delete(`/api/deplacements/${d.id}`);
        if (monde.d.bdc) await api.delete(`/api/bons-commande/${monde.d.bdc.id}`);
    });
    const r = await api.post('/api/bons-commande', {
        intitule,
        titulaire: 'E2E',
        date_debut: '2031-01-01',
        date_fin: '2031-12-31',
        nb_uo: 10
    });
    // Accès à l'application refusé au compte administrateur de test : scénario ignoré à l'étape suivante
    if (r.status === 403) return;
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    monde.d.bdc = { id: r.data.id, intitule };
});

/** Déplacement créé par l'API (administrateur de test, AMOA CED : lui-même) */
async function creerDeplacement(
    /** @type {Monde} */ monde,
    /** @type {string} */ ville,
    /** @type {number} */ jours,
    /** @type {boolean} */ avecBon,
    debut = '2031-04-01'
) {
    const { userId } = await monde.sessionDe('Administrateur');
    const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + (jours - 1) * 86400000).toISOString().slice(0, 10);
    await (
        await adminApi(monde)
    ).ok('POST', '/api/deplacements', {
        amoa_ced_id: userId,
        date_debut: debut,
        date_fin: fin,
        samu: 'SAMU 75',
        ville,
        commentaire: '',
        ...(avecBon ? { bon_commande_id: monde.d.bdc.id } : {})
    });
}

Given('un déplacement de test de {int} UO existe sur le bon de commande de test', async ({ monde }, jours) => {
    await creerDeplacement(monde, villeDeTest(monde), Number(jours), true, '2031-04-01');
});

Given('un second déplacement de test de {int} UO existe sur le bon de commande de test', async ({ monde }, jours) => {
    // Date de création postérieure au premier (à la seconde près) : c'est lui qui fait dépasser le plafond
    await new Promise(r => setTimeout(r, 1100));
    await creerDeplacement(monde, villeDeTest(monde, 'B'), Number(jours), true, '2031-05-01');
});

Given('un déplacement de test sans bon de commande existe', async ({ monde }) => {
    await creerDeplacement(monde, villeDeTest(monde, 'C'), 1, false, '2031-06-01');
});

const onglet = (/** @type {Monde} */ monde) => monde.page.locator('#deplacementsPlanificationTab');
const corps = (/** @type {Monde} */ monde) => monde.page.locator('#mesDeplacementsTable tbody');

When("j'ouvre le suivi des déplacements en tant que {string}", async ({ monde }, profil) => {
    await ouvrirApplication(monde, profil);
    const page = monde.page;
    await expect(page.locator('#appSwitcherBtn')).toBeVisible({ timeout: 20000 });
    await page.locator('#appSwitcherBtn').click();
    await page.locator('#appSwitcherDropdown > div', { hasText: APPLICATION }).click();
    await expect(onglet(monde)).toBeVisible();
    await expect(corps(monde)).not.toContainText('Chargement');
});

Then('la liste est titrée {string}', async ({ monde }, titre) => {
    await expect(monde.page.locator('#mesDeplacementsTitle')).toHaveText(titre);
});

const entetes = (/** @type {Monde} */ monde) => monde.page.locator('#mesDeplacementsTable thead th');

Then('la liste présente les colonnes {string} et {string}', async ({ monde }, a, b) => {
    await expect(entetes(monde).filter({ hasText: a })).toHaveCount(1);
    await expect(entetes(monde).filter({ hasText: b })).toHaveCount(1);
});

Then('la liste ne présente pas la colonne {string}', async ({ monde }, nom) => {
    await expect(entetes(monde).first()).toBeVisible();
    await expect(entetes(monde).filter({ hasText: nom })).toHaveCount(0);
});

const ligne = (/** @type {Monde} */ monde, /** @type {string} */ ville) =>
    corps(monde)
        .locator('tr')
        .filter({ has: monde.page.locator('td', { hasText: new RegExp(`^${ville}$`) }) });

Then(
    'la liste présente le déplacement de test avec {string} UO et le bon de commande de test',
    async ({ monde }, uo) => {
        const l = ligne(monde, villeDeTest(monde));
        await expect(l).toHaveCount(1);
        await expect(l.locator('td').nth(2)).toHaveText(uo);
        await expect(l).toContainText(monde.d.bdc.intitule);
    }
);

Then("l'AMOA CED se choisit dans une liste", async ({ monde }) => {
    await expect(monde.page.locator('#deplacementAmoaCed')).toBeVisible();
    await expect(monde.page.locator('#deplacementAmoaCedFixed')).toBeHidden();
});

Then("l'AMOA CED est fixé au nom de {string}", async ({ monde }, profil) => {
    const s = await monde.sessionDe(profil);
    await expect(monde.page.locator('#deplacementAmoaCed')).toBeHidden();
    await expect(monde.page.locator('#deplacementAmoaCedFixed')).toBeVisible();
    await expect(monde.page.locator('#deplacementAmoaCedFixedName')).toContainText(String(s.nom).toUpperCase());
});

// ---------- Formulaire d'ajout ----------

When('je saisis un déplacement de test du {string} au {string}', async ({ monde }, debut, fin) => {
    const page = monde.page;
    const { userId } = await monde.sessionDe('Administrateur');
    const amoa = page.locator('#deplacementAmoaCed');
    if (await amoa.isVisible()) await amoa.selectOption(String(userId));
    await page.locator('#deplacementDateDebut').fill(debut);
    await page.locator('#deplacementDateFin').fill(fin);
    // Changement de date pris en compte (calcul des UO, bon de commande)
    await page.locator('#deplacementDateFin').dispatchEvent('change');
    await page.locator('#deplacementSamu').selectOption('SAMU 75');
    await page.locator('#deplacementVille').fill(villeDeTest(monde).toLowerCase());
    await page.locator('#deplacementCommentaire').fill('Commentaire E2E');
});

When('je choisis le bon de commande de test', async ({ monde }) => {
    await monde.page.locator('#deplacementBonCommande').selectOption(String(monde.d.bdc.id));
});

Then("le nombre d'UO proposé est {string}", async ({ monde }, uo) => {
    await expect(monde.page.locator('#deplacementNbUO')).toHaveValue(uo);
});

Then('le bon de commande de test est présélectionné', async ({ monde }) => {
    await expect(monde.page.locator('#deplacementBonCommande')).toHaveValue(String(monde.d.bdc.id));
});

When("j'ajoute le déplacement", async ({ monde }) => {
    await onglet(monde).getByRole('button', { name: 'Ajouter le déplacement' }).click();
});

Then("le formulaire d'ajout est vidé", async ({ monde }) => {
    for (const id of ['deplacementDateDebut', 'deplacementDateFin', 'deplacementVille', 'deplacementCommentaire'])
        await expect(monde.page.locator(`#${id}`)).toHaveValue('');
    await expect(monde.page.locator('#deplacementNbUO')).toHaveValue('0');
});

Then("aucun déplacement de test n'est enregistré", async ({ monde }) => {
    expect(await deplacementsDeTest(monde)).toEqual([]);
});

Then("l'avertissement indique {string}", async ({ monde }, texte) => {
    const avertissement = monde.page.locator('#deplacementSurconsommationWarning');
    await expect(avertissement).toBeVisible();
    await expect(avertissement).toContainText(texte);
    await expect(avertissement).toContainText(monde.d.bdc.intitule);
});

// ---------- Mise en évidence ----------

Then('le second déplacement de test est mis en évidence avec {string}', async ({ monde }, texte) => {
    const l = ligne(monde, villeDeTest(monde, 'B'));
    // Commentaire tronqué à 30 caractères : texte complet en infobulle
    await expect(l.locator(`[title*="${texte}"]`)).toHaveCount(1);
    await expect(l).toHaveCSS('background-color', ROUGE_ATTENTION);
    // Premier déplacement (8 UO sur 10) : sous le plafond
    await expect(ligne(monde, villeDeTest(monde))).not.toContainText('Dépasse le plafond');
});

Then('le déplacement de test sans bon de commande est mis en évidence, à affecter', async ({ monde }) => {
    const l = ligne(monde, villeDeTest(monde, 'C'));
    await expect(l).toContainText('À affecter');
    await expect(l).toHaveCSS('background-color', ROUGE_ATTENTION);
    await expect(l.getByRole('button', { name: /Affecter/ })).toBeVisible();
});

// ---------- Modification, suppression ----------

When('je modifie la ville du déplacement de test', async ({ monde }) => {
    const page = monde.page;
    await ligne(monde, villeDeTest(monde))
        .getByRole('button', { name: /Modifier/ })
        .click();
    const fenetre = page.locator('#editDeplacementModal');
    await expect(fenetre).toBeVisible();
    await expect(page.locator('#editDeplacementVille')).toHaveValue(villeDeTest(monde));
    await page.locator('#editDeplacementVille').fill(villeDeTest(monde, 'MODIF').toLowerCase());
    await fenetre.getByRole('button', { name: /Enregistrer/ }).click();
});

Then('la liste présente le déplacement de test avec sa nouvelle ville', async ({ monde }) => {
    await expect(ligne(monde, villeDeTest(monde, 'MODIF'))).toHaveCount(1);
    await expect(monde.page.locator('#editDeplacementModal')).toBeHidden();
});

When('je supprime le déplacement de test et je confirme', async ({ monde }) => {
    await confirmer(monde, () =>
        ligne(monde, villeDeTest(monde))
            .getByRole('button', { name: /Supprimer/ })
            .click()
    );
});

Then('la liste ne présente plus le déplacement de test', async ({ monde }) => {
    await expect(ligne(monde, villeDeTest(monde))).toHaveCount(0);
    expect(await deplacementsDeTest(monde)).toEqual([]);
});

// ---------- Tri ----------

When('je trie la liste par {string}', async ({ monde }, colonne) => {
    await entetes(monde).filter({ hasText: colonne }).first().click();
});

Then('la colonne {string} de la liste est triée', async ({ monde }, colonne) => {
    const index = (await entetes(monde).allTextContents()).findIndex(t => t.includes(colonne));
    const valeurs = await corps(monde)
        .locator(`tr td:nth-child(${index + 1})`)
        .allTextContents();
    const nettoyees = valeurs.map(v => v.trim());
    expect(nettoyees.length).toBeGreaterThan(0);
    const triees = [...nettoyees].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const inverses = [...triees].reverse();
    expect([JSON.stringify(triees), JSON.stringify(inverses)]).toContain(JSON.stringify(nettoyees));
});
