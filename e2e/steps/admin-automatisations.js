// @ts-check
// Administration › Automatisations et rappels : configuration, historiques, tests sans envoi, diagnostic et aperçu du
// nettoyage (aucun message envoyé, aucune donnée nettoyée)
import { expect } from '@playwright/test';
import { adminApi } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const configuration = async (/** @type {Monde} */ monde, /** @type {number} */ n) =>
    (await (await adminApi(monde)).ok('GET', `/api/automation/config/${n}`)).config || {};
const envois = async (/** @type {Monde} */ monde, /** @type {number} */ n) =>
    (await (await adminApi(monde)).ok('GET', `/api/automation/logs/${n}`)).logs || [];

const corps = (/** @type {Monde} */ monde, /** @type {number} */ n) => monde.page.locator(`#automation${n}Body`);
const historique = (/** @type {Monde} */ monde) => monde.page.locator('#automationLogsModal');
/** Bouton « Fermer » d'une fenêtre (le dernier : celui du pied de la fenêtre) */
const fermer = (/** @type {import('@playwright/test').Locator} */ fenetre) =>
    fenetre.getByRole('button', { name: 'Fermer', exact: true }).last().click();

Given(
    "la configuration de l'automatisation {int} est conservée pour être rétablie après le scénario",
    async ({ monde }, n) => {
        const api = await adminApi(monde);
        const initiale = await configuration(monde, n);
        monde.d[`automatisation${n}`] = initiale;
        monde.aNettoyer(`automatisation ${n}`, () => api.post(`/api/automation/config/${n}`, { config: initiale }));
    }
);

When("je développe l'automatisation {int}", async ({ monde }, n) => {
    if (!(await corps(monde, n).isVisible())) await monde.page.locator(`#automation${n}BodySubIcon`).click();
    await expect(corps(monde, n)).toBeVisible();
});

// ---------- N°1 ----------

Then("l'automatisation 1 affiche sa configuration enregistrée", async ({ monde }) => {
    const c = monde.d.automatisation1;
    const page = monde.page;
    await expect(page.locator('#automation1Enabled')).toBeChecked({ checked: !!c.enabled });
    await expect(page.locator('#automation1Days')).toHaveValue(String(c.days || '5'));
    await expect(page.locator('#automation1CopyUser')).toHaveValue(String(c.copyUserId || ''));
});

When('je choisis de rappeler {string} avant la fin du mois', async ({ monde }, jours) => {
    await monde.page.locator('#automation1Days').selectOption({ label: jours });
});

Then("l'automatisation 1 est enregistrée avec 10 jours, son activation et sa copie inchangées", async ({ monde }) => {
    const c = monde.d.automatisation1;
    await expect
        .poll(async () => {
            const lue = await configuration(monde, 1);
            return { days: lue.days, enabled: !!lue.enabled, copie: String(lue.copyUserId || '') };
        })
        .toEqual({ days: 10, enabled: !!c.enabled, copie: String(c.copyUserId || '') });
});

When("je lance le test de l'automatisation {int}", async ({ monde }, n) => {
    monde.d[`envoisAvant${n}`] = (await envois(monde, n)).length;
    await corps(monde, n)
        .getByRole('button', { name: /Tester maintenant/ })
        .click();
});

Then("le test de l'automatisation 1 présente les experts sans disponibilités du mois prochain", async ({ monde }) => {
    const { expertsWithoutAvailability: experts, targetMonth } = await (
        await adminApi(monde)
    ).ok('GET', '/api/automation/test/1');
    const resultat = monde.page.locator('#automation1TestResult');
    if (!experts.length) {
        await expect(resultat).toContainText(`Tous les experts ont renseigné leurs disponibilités pour ${targetMonth}`);
        return;
    }
    await expect(resultat).toContainText(`${experts.length} expert(s) sans disponibilités sur ${targetMonth}`);
    const fenetre = monde.page.locator('#automationTestModal');
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText(`${experts.length} expert(s) n'ont pas renseigné leurs disponibilités`);
    await expect(fenetre.locator('tbody tr')).toHaveCount(experts.length);
    monde.d.fenetreTest1 = true;
});

When("je ferme le test de l'automatisation 1 sans envoyer de rappel", async ({ monde }) => {
    if (!monde.d.fenetreTest1) return;
    const fenetre = monde.page.locator('#automationTestModal');
    await fermer(fenetre);
    await expect(fenetre).toBeHidden();
});

Then("aucun rappel n'a été envoyé", async ({ monde }) => {
    expect((await envois(monde, 1)).length).toBe(monde.d.envoisAvant1);
});

// ---------- Historique ----------

When("j'ouvre l'historique des envois de l'automatisation {int}", async ({ monde }, n) => {
    monde.d.historiqueDe = n;
    await corps(monde, n)
        .getByRole('button', { name: /Historique des envois/ })
        .click();
});

Then("l'historique « {}» présente les envois enregistrés de l'automatisation {int}", async ({ monde }, titre, n) => {
    const fenetre = historique(monde);
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText(titre.trim());
    const liste = await envois(monde, n);
    monde.d.envoisHistorique = liste.length;
    if (liste.length) await expect(fenetre.locator('tbody tr')).toHaveCount(liste.length);
    else await expect(fenetre).toContainText('Aucun envoi enregistré');
});

When("je refuse de vider l'historique", async ({ monde }) => {
    const texte = await annulerConfirmation(monde, () =>
        historique(monde)
            .getByRole('button', { name: /Vider l'historique/ })
            .click()
    );
    expect(texte).toContain("Voulez-vous vraiment supprimer tout l'historique des rappels de disponibilités ?");
});

Then("l'historique de l'automatisation {int} est conservé", async ({ monde }, n) => {
    expect((await envois(monde, n)).length).toBe(monde.d.envoisHistorique);
    if (monde.d.envoisHistorique)
        await expect(historique(monde).locator('tbody tr')).toHaveCount(monde.d.envoisHistorique);
});

When("je ferme l'historique", async ({ monde }) => {
    await fermer(historique(monde));
    await expect(historique(monde)).toBeHidden();
});

// ---------- N°2 ----------

const RECAPITULATIF = {
    groupAdmin: true,
    groupUser: false,
    groupExpert: false,
    recipients: [],
    allMonths: true,
    selectedMonths: [],
    allExperts: true,
    expertsList: [],
    excludeEmpty: true,
    format: 'csv'
};

Given(
    "l'automatisation 2 est configurée pour les administrateurs, toutes les données et tous les experts",
    async ({ monde }) => {
        await (
            await adminApi(monde)
        ).ok('POST', '/api/automation/config/2', { config: { ...monde.d.automatisation2, ...RECAPITULATIF } });
    }
);

Given("l'automatisation 2 est configurée sans destinataire", async ({ monde }) => {
    await (
        await adminApi(monde)
    ).ok('POST', '/api/automation/config/2', {
        config: { ...monde.d.automatisation2, ...RECAPITULATIF, groupAdmin: false }
    });
});

Then("l'automatisation 2 affiche sa configuration enregistrée", async ({ monde }) => {
    const c = monde.d.automatisation2;
    const page = monde.page;
    await expect(page.locator('#automation2Enabled')).toBeChecked({ checked: !!c.enabled });
    await expect(page.locator('#automation2Frequency')).toHaveValue(c.frequency || 'daily');
    await expect(page.locator('#automation2Hour')).toHaveValue(String(c.hour || '8'));
    await expect(page.locator('#automation2Format')).toHaveValue(c.format || 'csv');
    for (const [id, cle] of [
        ['GroupAdmin', 'groupAdmin'],
        ['GroupUser', 'groupUser'],
        ['GroupExpert', 'groupExpert']
    ])
        await expect(page.locator(`#automation2${id}`)).toBeChecked({ checked: !!c[cle] });
    for (const [id, cle] of [
        ['AllMonths', 'allMonths'],
        ['AllExperts', 'allExperts'],
        ['ExcludeEmpty', 'excludeEmpty']
    ])
        await expect(page.locator(`#automation2${id}`)).toBeChecked({ checked: c[cle] !== false });
    await expect(page.locator('#automation2WeeklyOptions')).toBeVisible({ visible: c.frequency === 'weekly' });
    await expect(page.locator('#automation2MonthlyOptions')).toBeVisible({ visible: c.frequency === 'monthly' });
});

When('je choisis la fréquence {string} et le jour {string}', async ({ monde }, frequence, jour) => {
    const page = monde.page;
    await page.locator('#automation2Frequency').selectOption({ label: frequence });
    await expect(page.locator('#automation2WeeklyOptions')).toBeVisible();
    await page.locator('#automation2WeekDay').selectOption({ label: jour });
});

Then(
    "l'automatisation 2 est enregistrée chaque semaine le jour {string}, ses autres paramètres inchangés",
    async ({ monde }, jour) => {
        const c = monde.d.automatisation2;
        const resume = (/** @type {any} */ x) => ({
            enabled: !!x.enabled,
            hour: String(x.hour || '8'),
            format: x.format || 'csv',
            groupAdmin: !!x.groupAdmin,
            groupUser: !!x.groupUser,
            groupExpert: !!x.groupExpert,
            allMonths: x.allMonths !== false,
            allExperts: x.allExperts !== false,
            excludeEmpty: x.excludeEmpty !== false
        });
        await expect
            .poll(async () => {
                const lue = await configuration(monde, 2);
                return { frequency: lue.frequency, weekDay: lue.weekDay, ...resume(lue) };
            })
            .toEqual({ frequency: 'weekly', weekDay: jour, ...resume(c) });
    }
);

Then(
    'le récapitulatif de la sauvegarde présente les destinataires, les experts, le format et les lignes vides',
    async ({ monde }) => {
        const attendu = await (await adminApi(monde)).ok('POST', '/api/automation/preview/2', RECAPITULATIF);
        const fenetre = monde.page.locator('#automation2PreviewModal');
        await expect(fenetre).toBeVisible();
        await expect(fenetre).toContainText("Récapitulatif de l'envoi");
        const ligne = (/** @type {string} */ titre) => fenetre.locator('tr', { hasText: titre });
        await expect(ligne('Destinataires')).toContainText(`${attendu.recipientsCount} personne(s)`);
        await expect(ligne('Données incluses')).toContainText(attendu.monthsLabel);
        await expect(ligne('Experts')).toContainText(`${attendu.expertsCount} expert(s) (Tous les experts)`);
        await expect(ligne('Exclure lignes vides')).toContainText('Oui');
        await expect(ligne('Format')).toContainText('CSV');
        await expect(ligne('Nom du fichier')).toContainText(/Expert_Planning_Sauvegarde_de_.+\.csv/);
        for (const destinataire of attendu.recipientsList) await expect(fenetre).toContainText(destinataire);
    }
);

When("j'annule l'envoi de la sauvegarde", async ({ monde }) => {
    const fenetre = monde.page.locator('#automation2PreviewModal');
    await fenetre.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(fenetre).toBeHidden();
});

Then("aucune sauvegarde n'a été envoyée", async ({ monde }) => {
    expect((await envois(monde, 2)).length).toBe(monde.d.envoisAvant2);
});

Then("le test de l'automatisation 2 indique {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#automation2TestResult')).toContainText(texte);
    await expect(monde.page.locator('#automation2PreviewModal')).toBeHidden();
});

// ---------- Diagnostic et nettoyage ----------

When('je lance le diagnostic des mois', async ({ monde }) => {
    await corps(monde, 2)
        .getByRole('button', { name: /Diagnostic mois/ })
        .click();
});

Then('le diagnostic présente les mois trouvés en base', async ({ monde }) => {
    const { months } = await (await adminApi(monde)).ok('GET', '/api/automation/diagnose-months');
    const fenetre = historique(monde);
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText('Diagnostic des données');
    if (months?.length) await expect(fenetre.locator('tbody tr')).toHaveCount(months.length);
    else await expect(fenetre).toContainText('Aucune donnée trouvée.');
});

When('je prévisualise le nettoyage des données invalides', async ({ monde }) => {
    await corps(monde, 2)
        .getByRole('button', { name: /Nettoyer données invalides/ })
        .click();
});

Then("l'aperçu du nettoyage présente les suppressions et normalisations prévues", async ({ monde }) => {
    const apercu = await (await adminApi(monde)).ok('POST', '/api/automation/cleanup-dates-preview');
    const fenetre = historique(monde);
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText('Nettoyage des données');
    await expect(fenetre).toContainText(`Suppressions prévues : ${apercu.toDelete.length} lignes`);
    await expect(fenetre).toContainText(`Normalisations prévues : ${apercu.toNormalize.length} dates`);
    await expect(fenetre).toContainText("Aucune modification n'a encore été faite.");
});

When("j'annule le nettoyage", async ({ monde }) => {
    await historique(monde).getByRole('button', { name: 'Annuler', exact: true }).click();
});

Then('la fenêtre du nettoyage est fermée', async ({ monde }) => {
    await expect(historique(monde)).toBeHidden();
});
