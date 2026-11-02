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
/** Fenêtre de l'historique (îlot : une fenêtre ; ancien écran : fenêtre propre à l'automatisation n°3) */
const historique = (/** @type {Monde} */ monde) =>
    monde.page.locator('#automationLogsModal:visible, #automation3LogsModal:visible');
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
    else
        await expect(fenetre).toContainText(
            n === 3 ? 'Aucune notification Teams enregistrée' : 'Aucun envoi enregistré'
        );
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

// ---------- N°3 : notifications Teams ----------

/** Adresses fictives (domaine réservé .invalid) : aucun message ne peut partir vers un vrai canal */
const TEAMS_FICTIVE = 'e2e-teams.canal@example.invalid';
const TEAMS_FICTIVE_2 = 'e2e-teams.autre@example.invalid';

Given(
    "l'automatisation 3 est active avec une adresse Teams fictive et sans type de notification",
    async ({ monde }) => {
        await (
            await adminApi(monde)
        ).ok('POST', '/api/automation/config/3', {
            config: { ...monde.d.automatisation3, enabled: true, teamsEmail: TEAMS_FICTIVE, notifications: [] }
        });
    }
);

Then("l'automatisation 3 affiche sa configuration enregistrée", async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#automation3Enabled')).toBeChecked();
    await expect(page.locator('#automation3Config')).toBeVisible();
    await expect(page.locator('#automation3TeamsEmail')).toHaveValue(TEAMS_FICTIVE);
    const cases = page.locator('#automation3NotifList input[type=checkbox]');
    await expect(cases).toHaveCount(4);
    for (const c of await cases.all()) await expect(c).not.toBeChecked();
});

When('je coche la notification Teams {string}', async ({ monde }, libelle) => {
    // Clic simple : l'ancien écran redessine la liste (case remplacée) à chaque changement
    await monde.page.locator('#automation3NotifList label', { hasText: libelle }).locator('input').click();
});

Then("l'automatisation 3 est enregistrée avec les notifications {string}", async ({ monde }, types) => {
    await expect
        .poll(async () => {
            const c = await configuration(monde, 3);
            return { enabled: !!c.enabled, teamsEmail: c.teamsEmail, notifications: c.notifications };
        })
        .toEqual({ enabled: true, teamsEmail: TEAMS_FICTIVE, notifications: types.split(', ') });
});

When("je remplace l'adresse du canal Teams par une autre adresse fictive", async ({ monde }) => {
    const champ = monde.page.locator('#automation3TeamsEmail');
    await champ.fill(TEAMS_FICTIVE_2);
    await champ.press('Tab');
});

Then("l'automatisation 3 est enregistrée avec la nouvelle adresse fictive", async ({ monde }) => {
    await expect.poll(async () => (await configuration(monde, 3)).teamsEmail).toBe(TEAMS_FICTIVE_2);
});

When("je refuse de vider l'historique des notifications Teams", async ({ monde }) => {
    const texte = await annulerConfirmation(monde, () =>
        historique(monde)
            .getByRole('button', { name: /Vider l'historique/ })
            .click()
    );
    // Libellé de l'ancienne fenêtre partagée (anomalie conservée)
    expect(texte).toContain("Voulez-vous vraiment supprimer tout l'historique des sauvegardes de planning ?");
});

When("j'efface l'adresse du canal Teams puis j'envoie un test", async ({ monde }) => {
    const champ = monde.page.locator('#automation3TeamsEmail');
    await champ.fill('');
    await champ.press('Tab');
    await expect.poll(async () => (await configuration(monde, 3)).teamsEmail).toBe('');
    await corps(monde, 3)
        .getByRole('button', { name: /Envoyer un test/ })
        .click();
});

Then('le test Teams indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#automation3TestResult')).toContainText(texte);
});

// ---------- N°4 : workflow CRA ----------

Then(
    "l'automatisation 4 affiche sa configuration enregistrée, les viseurs RH et les experts d'astreinte",
    async ({ monde }) => {
        const c = monde.d.automatisation4;
        const page = monde.page;
        const api = await adminApi(monde);
        const comptes = await api.ok('GET', '/api/users');
        const rh = (comptes.users || comptes).filter((/** @type {any} */ u) => u.is_rh === 1 && u.actif === 1);
        const experts = await api.ok('GET', '/api/cra/experts-astreinte');
        await expect(page.locator('#automation4Enabled')).toBeChecked({ checked: !!c.enabled });
        await expect(page.locator('#automation4Day option')).toHaveCount(28);
        await expect(page.locator('#automation4Day')).toHaveValue(String(c.day || 1));
        for (const id of ['automation4AdminN1', 'automation4AdminN2']) {
            await expect(page.locator(`#${id} option`)).toHaveCount(rh.length + 1);
        }
        await expect(page.locator('#automation4AdminN1')).toHaveValue(String(c.admin_n1_id || ''));
        await expect(page.locator('#automation4AdminN2')).toHaveValue(String(c.admin_n2_id || ''));
        await expect(page.locator('#automation4DrhAns option')).toHaveCount(rh.length);
        const liste = page.locator('#automation4ExpertsList');
        if (experts.length) await expect(liste).toContainText('Contacts RH définis dans la fiche ressource');
        else await expect(liste).toContainText('Aucun expert avec astreinte activée.');
        await expect(page.locator('#automation4TestExpert option')).toHaveCount(
            experts.filter((/** @type {any} */ e) => e.user_id).length + 1
        );
    }
);

When('je choisis le jour de déclenchement {string}', async ({ monde }, jour) => {
    await monde.page.locator('#automation4Day').selectOption(jour);
});

Then("l'automatisation 4 est enregistrée le jour 27, ses viseurs et son activation inchangés", async ({ monde }) => {
    const c = monde.d.automatisation4;
    await expect
        .poll(async () => {
            const lue = await configuration(monde, 4);
            return {
                day: lue.day,
                enabled: !!lue.enabled,
                n1: String(lue.admin_n1_id || ''),
                n2: String(lue.admin_n2_id || ''),
                drh: lue.drh_ans_ids || []
            };
        })
        .toEqual({
            day: 27,
            enabled: !!c.enabled,
            n1: String(c.admin_n1_id || ''),
            n2: String(c.admin_n2_id || ''),
            drh: c.drh_ans_ids || []
        });
});

// ---------- N°5 et n°6 : astreintes HO ----------

Then(
    'les automatisations 5 et 6 affichent leur configuration enregistrée et les champs disponibles',
    async ({ monde }) => {
        const page = monde.page;
        const info = await (await adminApi(monde)).ok('GET', '/api/astreintes-ho/info');
        const c5 = monde.d.automatisation5;
        const c6 = monde.d.automatisation6;
        await expect(page.locator('#automation5Enabled')).toBeChecked({ checked: !!c5.enabled });
        await expect(page.locator('#automation5WeekDay')).toHaveValue(String(c5.weekDay ?? 4));
        await expect(page.locator('#automation5Hour')).toHaveValue(String(c5.hour ?? 9));
        await expect(page.locator('#automation5AllExperts')).toBeChecked({ checked: c5.allExperts !== false });
        await expect(page.locator('#automation5Subject')).toHaveValue(c5.subject || info.templates[5].subject);
        await expect(page.locator('#automation5Text')).toHaveValue(c5.body || info.templates[5].body);
        await expect(page.locator('#automation6Enabled')).toBeChecked({ checked: !!c6.enabled });
        const jours = (Array.isArray(c6.weekDays) ? c6.weekDays : [1]).map(String);
        for (const c of await page.locator('.automation6Day').all())
            await expect(c).toBeChecked({ checked: jours.includes((await c.getAttribute('value')) ?? '') });
        await expect(page.locator('#automation6Hour')).toHaveValue(String(c6.hour ?? 8));
        await expect(page.locator('#automation6Week')).toHaveValue(c6.week === 'next' ? 'next' : 'current');
        await expect(page.locator('#automation6Subject')).toHaveValue(c6.subject || info.templates[6].subject);
        for (const n of [5, 6]) {
            await expect(page.locator(`#automation${n}Fields`)).toContainText('Champs disponibles :');
            if (info.fields?.length)
                await expect(page.locator(`#automation${n}Fields`)).toContainText(info.fields[0][0]);
        }
    }
);

When("je choisis l'heure d'envoi {string} de l'automatisation 5", async ({ monde }, heure) => {
    await monde.page.locator('#automation5Hour').selectOption({ label: heure });
});

When("je choisis de communiquer la {string} dans l'automatisation 6", async ({ monde }, semaine) => {
    await monde.page.locator('#automation6Week').selectOption({ label: semaine });
});

Then("l'automatisation {int} indique {string}", async ({ monde }, n, texte) => {
    await expect(monde.page.locator(`#automation${n}Msg`)).toContainText(texte);
});

/** Paramètres d'une automatisation HO, valeurs par défaut de l'écran pour les absents */
const parametresHo = (/** @type {number} */ n, /** @type {any} */ c) =>
    n === 5
        ? { enabled: !!c.enabled, weekDay: c.weekDay ?? 4, allExperts: c.allExperts !== false }
        : {
              enabled: !!c.enabled,
              hour: c.hour ?? 8,
              weekDays: Array.isArray(c.weekDays) ? c.weekDays.map(Number) : [1],
              groupAdmin: !!c.groupAdmin,
              groupUser: !!c.groupUser,
              groupExpert: !!c.groupExpert
          };

Then("l'automatisation 5 est enregistrée à 21 h, ses autres paramètres inchangés", async ({ monde }) => {
    await expect
        .poll(async () => {
            const lue = await configuration(monde, 5);
            return { hour: lue.hour, ...parametresHo(5, lue) };
        })
        .toEqual({ hour: 21, ...parametresHo(5, monde.d.automatisation5) });
});

Then(
    "l'automatisation 6 est enregistrée pour la semaine suivante, ses autres paramètres inchangés",
    async ({ monde }) => {
        await expect
            .poll(async () => {
                const lue = await configuration(monde, 6);
                return { week: lue.week, ...parametresHo(6, lue) };
            })
            .toEqual({ week: 'next', ...parametresHo(6, monde.d.automatisation6) });
    }
);
