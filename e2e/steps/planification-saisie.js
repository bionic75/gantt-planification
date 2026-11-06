// @ts-check
// Planification › fenêtres de saisie et de notification : astreintes/HNO, demande d'affectation, invitations Outlook
// (sans envoi), nouvelles affectations de l'expert
import { expect } from '@playwright/test';
import { adminApi, aujourdhuiParis, cle, nettoyerMoisExpert, ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';
import { ongletPlanification } from './planification.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Locator} Locator */

const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');

// ---------- Astreintes : données ----------

Given('les notifications Teams des astreintes ne partent vers aucun canal réel', async ({ monde, $test }) => {
    const config = (await (await adminApi(monde)).ok('GET', '/api/automation/config/3')).config || {};
    const reel =
        !!config.enabled &&
        Array.isArray(config.notifications) &&
        config.notifications.includes('astreinte') &&
        !!config.teamsEmail &&
        !String(config.teamsEmail).endsWith('.invalid');
    $test.skip(reel, 'Notification Teams des astreintes active vers un canal réel (automatisation n°3)');
});

/** Astreintes de test (objet unique) supprimées en fin de scénario */
function suivreAstreintes(/** @type {Monde} */ monde) {
    if (monde.d.objetAstreinte) return monde.d.objetAstreinte;
    monde.d.objetAstreinte = monde.unique('Astreinte E2E');
    monde.aNettoyer('astreintes de test', async () => {
        const api = await adminApi(monde);
        for (const a of await lignesDeTest(monde)) await api.ok('DELETE', `/api/astreintes/${a.id}`);
    });
    return monde.d.objetAstreinte;
}

/** Lignes d'astreinte de test (objet commençant par l'objet unique du scénario) */
async function lignesDeTest(/** @type {Monde} */ monde) {
    const objet = monde.d.objetAstreinte;
    const toutes = await (await adminApi(monde)).ok('GET', '/api/astreintes');
    return toutes.filter((/** @type {any} */ a) => String(a.objet).startsWith(objet));
}

Given("une activité courante de test de l'expert de test existe le {string}", async ({ monde }, date) => {
    const objet = suivreAstreintes(monde);
    const api = await monde.apiDe('Expert');
    await api.ok('POST', '/api/astreintes', {
        type: 'activite_courante',
        date_debut: date,
        date_fin: date,
        heure_debut: '09:00',
        heure_fin: '17:00',
        samu: null,
        tous_samu: true,
        objet
    });
});

// ---------- Astreintes : fenêtre ----------

const fenetreAstreintes = (/** @type {Monde} */ monde) => monde.page.locator('#astreintesModal');
const arbre = (/** @type {Monde} */ monde) => monde.page.locator('#astreintesTreeView');

When("j'ouvre la fenêtre des astreintes\\/HNO", async ({ monde }) => {
    await ongletPlanification(monde.page);
    await monde.page.locator('#astreintesBtn').click();
    await expect(fenetreAstreintes(monde)).toBeVisible();
    // Liste chargée
    await expect(arbre(monde)).not.toContainText('Chargement');
});

Then('la fenêtre des astreintes a pour titre {string}', async ({ monde }, titre) => {
    await expect(monde.page.locator('#astreintesModalTitle')).toHaveText(titre);
});

Then('le formulaire des astreintes est replié', async ({ monde }) => {
    await expect(monde.page.locator('#astreintesDateDebut')).toBeHidden();
});

When('je déplie le formulaire des astreintes', async ({ monde }) => {
    await monde.page.locator('#astreintesFormTitle').click();
    await expect(monde.page.locator('#astreintesDateDebut')).toBeVisible();
});

When("j'enregistre l'astreinte", async ({ monde }) => {
    await fenetreAstreintes(monde)
        .getByRole('button', { name: /Enregistrer/ })
        .click();
});

When("je choisis le {string} comme date de début de l'astreinte", async ({ monde }, date) => {
    await monde.page.locator('#astreintesDateDebut').fill(date);
});

Then("la date de fin de l'astreinte est le {string}", async ({ monde }, date) => {
    await expect(monde.page.locator('#astreintesDateFin')).toHaveValue(date);
});

When('je choisis les heures {string} à {string}', async ({ monde }, debut, fin) => {
    await monde.page.locator('#astreintesHeureDebut').fill(debut);
    await monde.page.locator('#astreintesHeureFin').fill(fin);
});

When('je choisis le SAMU {string}', async ({ monde }, samu) => {
    await monde.page.locator('#astreintesSamu').selectOption(samu);
});

When("je donne un objet de test à l'astreinte", async ({ monde }) => {
    await monde.page.locator('#astreintesObjet').fill(suivreAstreintes(monde));
});

When(
    'je saisis une astreinte de test complète le {string}, de {string} à {string}, {string}',
    async ({ monde }, date, debut, fin, samu) => {
        const page = monde.page;
        await page.locator('#astreintesDateDebut').fill(date);
        await page.locator('#astreintesDateFin').fill(date);
        await page.locator('#astreintesHeureDebut').fill(debut);
        await page.locator('#astreintesHeureFin').fill(fin);
        await page.locator('#astreintesSamu').selectOption(samu);
        await page.locator('#astreintesObjet').fill(suivreAstreintes(monde));
    }
);

When("je choisis l'expert de test pour l'astreinte", async ({ monde }) => {
    const { userId } = await ressourceExpert(monde);
    await monde.page.locator('#astreintesExpert').selectOption(String(userId));
});

Then(
    "l'astreinte de test est enregistrée pour l'expert de test : {string} le {string} de {string} à {string}, {string}",
    async ({ monde }, type, date, debut, fin, samu) => {
        const { userId } = await ressourceExpert(monde);
        await expect
            .poll(async () =>
                (await lignesDeTest(monde)).map((/** @type {any} */ a) => ({
                    user_id: a.user_id,
                    type: a.type,
                    date_debut: a.date_debut,
                    date_fin: a.date_fin,
                    heure_debut: a.heure_debut,
                    heure_fin: a.heure_fin,
                    samu: a.tous_samu ? 'Tous les SAMU' : a.samu
                }))
            )
            .toEqual([
                { user_id: userId, type, date_debut: date, date_fin: date, heure_debut: debut, heure_fin: fin, samu }
            ]);
    }
);

/** Nœud affiché de l'arborescence (titre seul : flèche, icône et libellé ; les branches repliées sont ignorées) */
const noeud = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    arbre(monde)
        .locator('div, button')
        .filter({ hasText: new RegExp(`^[▶▼\\s]*${libelle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
        .filter({ visible: true })
        .first();

async function deplier(/** @type {Monde} */ monde, /** @type {string[]} */ libelles) {
    for (const libelle of libelles) {
        const n = noeud(monde, libelle);
        await expect(n).toBeVisible();
        await n.click();
    }
}

When('je déplie {string} puis {string} dans la liste des astreintes', async ({ monde }, annee, mois) => {
    await deplier(monde, [annee, mois]);
});

When(
    "je déplie l'expert de test, {string} puis {string} dans la liste des astreintes",
    async ({ monde }, annee, mois) => {
        const { userId } = await ressourceExpert(monde);
        const expert = (await (await adminApi(monde)).ok('GET', '/api/experts-list')).find(
            (/** @type {any} */ e) => e.id === userId
        );
        await deplier(monde, [`${expert.nom} ${expert.prenom}`, annee, mois]);
    }
);

/** Élément de la liste : le plus petit bloc qui porte l'objet de test et les boutons de modification */
const element = (/** @type {Monde} */ monde) =>
    arbre(monde)
        .locator('div')
        .filter({ hasText: monde.d.objetAstreinte })
        .filter({ has: monde.page.locator('button') })
        .last();

Then("la liste présente l'astreinte de test : {string}, {string}, {string}", async ({ monde }, type, periode, samu) => {
    const e = element(monde);
    await expect(e).toBeVisible();
    for (const texte of [type, periode, samu]) await expect(e).toContainText(texte);
});

const modifier = (/** @type {Monde} */ monde) => element(monde).locator('button').first();
const supprimer = (/** @type {Monde} */ monde) => element(monde).locator('button').nth(1);

When("je modifie l'astreinte de test en travail HNO pour tous les SAMU", async ({ monde }) => {
    await modifier(monde).click();
    await expect(monde.page.locator('#astreintesFormTitle')).toHaveText("Modifier l'astreinte/HNO");
    await monde.page.locator('#astreintesType').selectOption('hno');
    await monde.page.locator('#astreintesTousSamu').check();
    await expect(monde.page.locator('#astreintesSamu')).toBeDisabled();
    await fenetreAstreintes(monde)
        .getByRole('button', { name: /Enregistrer/ })
        .click();
});

When("je modifie l'objet de l'astreinte de test", async ({ monde }) => {
    await modifier(monde).click();
    await expect(monde.page.locator('#astreintesObjet')).toHaveValue(monde.d.objetAstreinte);
    await monde.page.locator('#astreintesObjet').fill(`${monde.d.objetAstreinte} modifiée`);
    await fenetreAstreintes(monde)
        .getByRole('button', { name: /Enregistrer/ })
        .click();
});

Then("l'astreinte de test modifiée est toujours une activité courante", async ({ monde }) => {
    await expect
        .poll(async () => (await lignesDeTest(monde)).map((/** @type {any} */ a) => `${a.type}|${a.objet}`))
        .toEqual([`activite_courante|${monde.d.objetAstreinte} modifiée`]);
});

When("je supprime l'astreinte de test et je confirme", async ({ monde }) => {
    await confirmer(monde, () => supprimer(monde).click());
});

Then("l'astreinte de test n'existe plus", async ({ monde }) => {
    await expect.poll(async () => (await lignesDeTest(monde)).length).toBe(0);
});

// ---------- Demande d'affectation ----------

const demande = (/** @type {Monde} */ monde) => monde.page.locator('#requestModal');

When("j'ouvre la demande d'affectation", async ({ monde }) => {
    await ongletPlanification(monde.page);
    await monde.page.locator('#requestBtn').click();
    await expect(demande(monde)).toBeVisible();
});

Then(
    "la demande est préremplie au nom de {string}, du jour même au matin au jour même l'après-midi",
    async ({ monde }, profil) => {
        const s = await monde.sessionDe(profil);
        const nom = `${s.prenom} ${String(s.nom).toUpperCase()}`;
        const page = monde.page;
        await expect(page.locator('#requestFrom')).toHaveValue(nom);
        await expect(page.locator('#requestSubject')).toHaveValue(`De la part de ${nom}: demande d'affectation`);
        await expect(page.locator('#requestMessage')).toHaveValue(new RegExp(`^Bonjour,[\\s\\S]*${nom}$`));
        const jour = aujourdhuiParis();
        await expect(page.locator('#requestStartDate')).toHaveValue(jour);
        await expect(page.locator('#requestEndDate')).toHaveValue(jour);
        await expect(page.locator('#requestStartPeriod')).toHaveValue('Matin');
        await expect(page.locator('#requestEndPeriod')).toHaveValue('Après-midi');
    }
);

When('je choisis le {string} comme début de la demande', async ({ monde }, date) => {
    await monde.page.locator('#requestStartDate').fill(date);
});

When('je choisis le {string} comme fin de la demande', async ({ monde }, date) => {
    await monde.page.locator('#requestEndDate').fill(date);
});

Then('la fin de la demande est le {string}', async ({ monde }, date) => {
    await expect(monde.page.locator('#requestEndDate')).toHaveValue(date);
});

Then('la demande signale {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#dateError')).toHaveText(texte);
});

Then('la demande ne signale aucune erreur de date', async ({ monde }) => {
    await expect(monde.page.locator('#dateError')).toBeHidden();
});

When('je valide la demande', async ({ monde }) => {
    await demande(monde)
        .getByRole('button', { name: /Envoyer la demande/ })
        .click();
});

/** Expert de test tel que la liste des ressources le présente (e-mail du compte) */
async function expertDeTest(/** @type {Monde} */ monde) {
    const { resourceId } = await ressourceExpert(monde);
    return (await (await adminApi(monde)).ok('GET', '/api/resources')).find(
        (/** @type {any} */ r) => r.id === resourceId
    );
}

When("je cherche l'expert de test parmi les destinataires", async ({ monde }) => {
    monde.d.expertDemande = await expertDeTest(monde);
    await monde.page.locator('#requestExpertsInput').fill(monde.d.expertDemande.trigramme);
});

const propositionExpert = (/** @type {Monde} */ monde) =>
    monde.page.locator('#requestExpertsDropdown > div', {
        hasText: `${monde.d.expertDemande.prenom} ${monde.d.expertDemande.nom} (${monde.d.expertDemande.trigramme})`
    });

Then("l'expert de test est proposé avec son adresse e-mail", async ({ monde }) => {
    await expect(propositionExpert(monde)).toContainText(monde.d.expertDemande.email);
});

When("j'ajoute l'expert de test aux destinataires", async ({ monde }) => {
    await propositionExpert(monde).click();
});

const destinataires = (/** @type {Monde} */ monde) => monde.page.locator('#requestExpertsTags .samu-tag');

Then("l'expert de test figure parmi les destinataires", async ({ monde }) => {
    const e = monde.d.expertDemande;
    const libelle = `${e.prenom} ${e.nom} (${e.trigramme})`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(destinataires(monde)).toHaveText([new RegExp(`^${libelle}\\s*×\\s*$`)]);
});

When("je retire l'expert de test des destinataires", async ({ monde }) => {
    await destinataires(monde).locator('.samu-tag-remove').click();
});

Then("aucun destinataire n'est choisi", async ({ monde }) => {
    await expect(destinataires(monde)).toHaveCount(0);
});

When("j'annule la demande", async ({ monde }) => {
    await demande(monde).getByRole('button', { name: 'Annuler', exact: true }).click();
});

Then("la demande d'affectation est fermée", async ({ monde }) => {
    await expect(demande(monde)).toBeHidden();
});

Then("le bouton {string} n'est pas proposé", async ({ monde }, libelle) => {
    await expect(monde.page.locator('#ganttHeaderButtons button', { hasText: libelle })).toBeHidden();
});

Then('le bouton {string} est proposé', async ({ monde }, libelle) => {
    await expect(monde.page.locator('#ganttHeaderButtons button', { hasText: libelle })).toBeVisible();
});

// ---------- Invitations Outlook ----------

/** Premier lundi du mois M+2 (Paris) : { annee, mois0, date } — mois réservé à cette fonctionnalité */
function premierLundiM2() {
    const [a, m] = aujourdhuiParis().split('-').map(Number);
    const debut = new Date(a, m - 1 + 2, 1);
    const jour = 1 + ((8 - debut.getDay()) % 7);
    const annee = debut.getFullYear();
    const mois0 = debut.getMonth();
    return { annee, mois0, jour, date: `${annee}-${deux(mois0 + 1)}-${deux(jour)}` };
}

Given("l'expert de test est disponible le premier lundi du mois M+2 au matin", async ({ monde }) => {
    const { annee, mois0, date } = premierLundiM2();
    const { resourceId } = await ressourceExpert(monde);
    await nettoyerMoisExpert(monde, annee, mois0);
    await (await adminApi(monde)).ok('POST', '/api/schedule', { [cle(resourceId, 'available', date, 'AM')]: '2' });
});

const fenetreInvitations = (/** @type {Monde} */ monde) => monde.page.locator('#sendEmailModalContainer');

/** Message affiché dans une fenêtre de la page (îlot Vue) ; la fenêtre du navigateur de l'ancien écran est déjà acceptée */
When('je ferme le message', async ({ monde }) => {
    const fenetre = monde.page.getByRole('dialog', { name: 'Information' });
    if (await fenetre.isVisible()) {
        await fenetre.getByRole('button', { name: 'OK', exact: true }).click();
        await expect(fenetre).toBeHidden();
    }
});

When("j'ouvre les invitations Outlook", async ({ monde }) => {
    const bouton = monde.page.locator('#sendEmailBtn');
    await expect(bouton).not.toHaveCSS('display', 'none');
    // Clic par le DOM : en 1280 px, la barre d'en-tête déborde et l'enveloppe sort de l'écran
    await bouton.evaluate(b => /** @type {HTMLElement} */ (b).click());
});

When("j'affecte l'expert de test le premier lundi du mois M+2 au matin dans la planification", async ({ monde }) => {
    const page = monde.page;
    const { annee, mois0, jour } = premierLundiM2();
    const { resourceId } = await ressourceExpert(monde);
    await ongletPlanification(page);
    if (!(await page.locator('#planningControlsSection').isVisible()))
        await page.locator('#planning h3', { hasText: "Options d'affichage" }).click();
    await page.locator('#yearSelect').selectOption(String(annee));
    await page.locator('#monthSelect').selectOption(String(mois0));
    // Cellule du matin : disponibilité (1re ligne) puis affectation (2e ligne) ; une affectation vide (affichée « 1 »,
    // comptée « 2 - En attente ») passe à « 3 - SAMU (Déploiement) »
    const cellule = page.locator(
        `#ganttBody tr[data-resource-id="${resourceId}"] td[data-date="${annee}-${mois0 + 1}-${jour}"][data-period="AM"]`
    );
    await expect(cellule.locator('.gantt-cell-row').first()).toHaveText('2');
    await cellule.locator('.gantt-cell-row').nth(1).click();
    await expect(cellule.locator('.gantt-cell-row').nth(1)).toHaveText('3');
});

Then('le compteur des invitations indique {int}', async ({ monde }, n) => {
    await expect(monde.page.locator('#pendingEmailBadge')).toHaveText(String(n));
});

Then('les invitations résument {string}', async ({ monde }, resume) => {
    await expect(fenetreInvitations(monde)).toBeVisible();
    await expect(monde.page.locator('#sendEmailModalSummary')).toHaveText(resume);
});

Then(
    "les invitations présentent l'expert de test : {int} nouvelle affectation le premier lundi du mois M+2, {string}, {string}",
    async ({ monde }, n, periode, affectation) => {
        const s = await monde.sessionDe('Expert');
        const bloc = monde.page.locator('#sendEmailModalContent > div', { hasText: `${s.prenom} ${s.nom}` });
        await expect(bloc).toHaveCount(1);
        await expect(bloc).toContainText(`${n} nouvelle(s)`);
        const { date } = premierLundiM2();
        const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
        });
        const lignes = bloc.locator('tbody tr');
        await expect(lignes).toHaveCount(n);
        await expect(lignes.first()).toContainText(jour);
        await expect(lignes.first()).toContainText(periode);
        await expect(lignes.first()).toContainText(affectation);
    }
);

When('je décoche tous les experts des invitations', async ({ monde }) => {
    await monde.page.locator('#selectAllExperts').uncheck();
    for (const c of await monde.page.locator('#sendEmailModalContent input[type=checkbox]').all())
        await expect(c).not.toBeChecked();
});

When("j'envoie les invitations", async ({ monde }) => {
    await fenetreInvitations(monde)
        .getByRole('button', { name: /Envoyer les invitations Outlook/ })
        .click();
});

When("j'annule les invitations", async ({ monde }) => {
    await fenetreInvitations(monde).getByRole('button', { name: 'Annuler', exact: true }).click();
});

Then('les invitations sont fermées', async ({ monde }) => {
    await expect(fenetreInvitations(monde)).toBeHidden();
});

// ---------- Nouvelles affectations de l'expert ----------

Given(
    "une nouvelle affectation de test est notifiée à l'expert de test le {string} au matin",
    async ({ monde }, date) => {
        const { resourceId } = await ressourceExpert(monde);
        const expert = await monde.apiDe('Expert');
        // Notifications de l'expert de test lues en fin de scénario (aucune ne reste affichée)
        monde.aNettoyer('notifications de l’expert de test', () => expert.post('/api/notifications/mark-read', {}));
        await (
            await adminApi(monde)
        ).ok('POST', '/api/notifications/create-batch', {
            notifications: [{ resourceId, date, period: 'Matin', activity: 'SAMU (Déploiement)', location: '-' }]
        });
    }
);

const pastille = (/** @type {Monde} */ monde) => monde.page.locator('#notificationBadge');
const fenetreNotifications = (/** @type {Monde} */ monde) => monde.page.locator('#newAssignmentsModal');

Then('la pastille des nouvelles affectations est affichée', async ({ monde }) => {
    await expect(pastille(monde)).toBeVisible({ timeout: 20000 });
});

When("j'ouvre les nouvelles affectations", async ({ monde }) => {
    await pastille(monde).click();
    await expect(fenetreNotifications(monde)).toBeVisible();
});

Then(
    "les nouvelles affectations présentent le {string}, {string}, {string} de l'administrateur de test",
    async ({ monde }, date, periode, affectation) => {
        const s = await monde.sessionDe('Administrateur');
        const ligne = fenetreNotifications(monde).locator('tbody tr', { hasText: date });
        await expect(ligne).toHaveCount(1);
        await expect(ligne.locator('td')).toHaveText([date, periode, affectation, '-', `${s.prenom} ${s.nom}`]);
    }
);

When('je ferme les nouvelles affectations', async ({ monde }) => {
    const f = fenetreNotifications(monde);
    // Croix de l'ancien écran ou bouton « Fermer » de la fenêtre
    await f
        .locator('.close')
        .or(f.getByRole('button', { name: 'Fermer', exact: true }).last())
        .first()
        .click();
    await expect(f).toBeHidden();
});

Then('la pastille des nouvelles affectations est masquée', async ({ monde }) => {
    await expect(pastille(monde)).toBeHidden();
});

Then("les notifications de l'expert de test sont lues", async ({ monde }) => {
    const expert = await monde.apiDe('Expert');
    expect((await expert.ok('GET', '/api/notifications/count')).count).toBe(0);
});
