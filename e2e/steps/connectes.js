// @ts-check
// Utilisateurs connectés, messagerie et inactivité : connectés, envoi et réception des messages (événements du
// serveur), paramétrage de l'inactivité simulés dans le navigateur (page.route) ; temps avancé par page.clock.
import { expect } from '@playwright/test';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */
/** @typedef {import('../support/monde.js').Monde} Monde */

/** Comptes fictifs des réponses simulées */
const FICTIFS = /** @type {Record<string, { userId: number, prenom: string, nom: string, trigramme: string }>} */ ({
    'Test Fictif': { userId: 999001, prenom: 'Test', nom: 'Fictif', trigramme: 'TFI' },
    'Expéditeur Fictif': { userId: 999002, prenom: 'Expéditeur', nom: 'Fictif', trigramme: 'EFI' }
});
const fictif = (/** @type {string} */ nom) => {
    const f = FICTIFS[nom];
    if (!f) throw new Error(`Compte fictif inconnu : ${nom}`);
    return f;
};

const json = (/** @type {Route} */ route, /** @type {unknown} */ corps, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corps) });

// ---------- Connectés ----------

Given(
    "les connectés lus par l'application sont le compte courant et {string} \\(réponse simulée)",
    async ({ monde }, nom) => {
        const s = await monde.sessionDe('Utilisateur');
        monde.d.compteCourant = s;
        const { page } = await monde.acteur('Utilisateur');
        const autre = fictif(nom);
        await page.route('**/api/active-sessions', route =>
            json(route, {
                activeUsers: [
                    {
                        userId: s.userId,
                        username: s.username,
                        prenom: s.prenom,
                        nom: s.nom,
                        trigramme: s.trigramme,
                        profile: s.activeProfile,
                        profilePhoto: null
                    },
                    { ...autre, username: 'e2e.fictif', profile: 'expert', profilePhoto: null }
                ]
            })
        );
    }
);

Then('la pastille des connectés présente {int} utilisateurs', async ({ monde }, n) => {
    const pastille = monde.page.locator('#onlineUsersContainer');
    await expect(pastille).toBeVisible({ timeout: 20000 });
    await expect(pastille.locator('[title]')).toHaveCount(n);
});

When("j'ouvre la liste des utilisateurs connectés", async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#onlineUsersContainer')).toBeVisible({ timeout: 20000 });
    if (!(await page.locator('#onlineUsersTooltip').isVisible())) await page.locator('#onlineUsersContainer').click();
    await expect(page.locator('#onlineUsersTooltip')).toBeVisible();
});

const nomComplet = (/** @type {any} */ s) => `${s.prenom || ''} ${s.nom || ''}`.trim();

Then(
    'la liste présente le compte courant sans bouton de message et {string} avec un bouton de message',
    async ({ monde }, nom) => {
        const liste = monde.page.locator('#onlineUsersTooltipList');
        const courant = nomComplet(monde.d.compteCourant);
        await expect(liste).toContainText(courant);
        await expect(liste).toContainText(nom);
        await expect(liste.getByRole('button', { name: `Envoyer un message à ${courant}` })).toHaveCount(0);
        await expect(liste.locator(`button[title="Envoyer un message à ${nom}"]`)).toBeVisible();
    }
);

// ---------- Envoi ----------

Given("l'envoi des messages est simulé", async ({ monde }) => {
    const { page } = await monde.acteur('Utilisateur');
    monde.d.envois = [];
    monde.d.refusEnvoi = null;
    await page.route('**/api/push-message', route => {
        monde.d.envois.push(route.request().postDataJSON());
        return monde.d.refusEnvoi ? json(route, { error: monde.d.refusEnvoi }, 400) : json(route, { success: true });
    });
});

const panneau = (/** @type {Page} */ page, /** @type {string} */ nom) => page.locator(`#pcp_${fictif(nom).userId}`);

When("j'ouvre la conversation avec {string}", async ({ monde }, nom) => {
    await monde.page.locator(`#onlineUsersTooltipList button[title="Envoyer un message à ${nom}"]`).click();
    await expect(panneau(monde.page, nom)).toBeVisible();
    monde.d.conversation = nom;
});

When("j'envoie le message {string}", async ({ monde }, message) => {
    const p = panneau(monde.page, monde.d.conversation);
    await p.locator('textarea').fill(message);
    await p.getByTitle('Envoyer (Ctrl+↵)').click();
});

Then('la conversation présente mon message {string}', async ({ monde }, message) => {
    await expect(panneau(monde.page, monde.d.conversation)).toContainText(message);
});

Then('le serveur a reçu le message {string} pour {string}', async ({ monde }, message, nom) => {
    await expect.poll(() => monde.d.envois.length).toBeGreaterThan(0);
    expect(monde.d.envois[0]).toEqual({ toUserId: fictif(nom).userId, message });
});

When("l'envoi suivant est refusé par le serveur avec {string}", async ({ monde }, erreur) => {
    monde.d.refusEnvoi = erreur;
});

Then("l'envoi est signalé en erreur avec {string}", async ({ monde }, erreur) => {
    const p = panneau(monde.page, monde.d.conversation);
    // Message dans la conversation, ou fenêtre du navigateur (ancien écran, acceptée par le monde)
    await expect
        .poll(async () => `${monde.dialogues.join('\n')} ${await p.textContent()}`)
        .toContain(`Erreur : ${erreur}`);
});

Then('la conversation avec {string} est restaurée avec mon message {string}', async ({ monde }, nom, message) => {
    await expect(panneau(monde.page, nom)).toBeVisible({ timeout: 20000 });
    await expect(panneau(monde.page, nom)).toContainText(message);
});

When('je ferme la conversation avec {string}', async ({ monde }, nom) => {
    await panneau(monde.page, nom).getByTitle('Fermer').click();
});

Then("aucune conversation n'est ouverte", async ({ monde }) => {
    await expect(monde.page.locator('[id^="pcp_"]')).toHaveCount(0);
    const memorise = await monde.page.evaluate(() => sessionStorage.getItem('pcp_open_panels'));
    expect(JSON.parse(memorise || '[]')).toEqual([]);
});

// ---------- Réception ----------

Given(
    'le serveur transmettra un message de {string} : {string} \\(réponse simulée)',
    async ({ monde }, nom, message) => {
        const { page } = await monde.acteur('Utilisateur');
        const f = fictif(nom);
        const evenement = {
            fromUserId: f.userId,
            fromName: nom,
            fromPhoto: null,
            fromProfile: 'expert',
            message,
            sentAt: new Date().toISOString()
        };
        // Un seul message : reconnexion du navigateur repoussée (retry), message non renvoyé ensuite
        let transmis = false;
        await page.route('**/api/sse', route => {
            const corps = transmis
                ? 'retry: 600000\n\n'
                : `retry: 600000\nevent: push-message\ndata: ${JSON.stringify(evenement)}\n\n`;
            transmis = true;
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: corps });
        });
    }
);

Then('une conversation avec {string} présente le message reçu {string}', async ({ monde }, nom, message) => {
    await expect(panneau(monde.page, nom)).toBeVisible({ timeout: 20000 });
    await expect(panneau(monde.page, nom)).toContainText(message);
    await expect(panneau(monde.page, nom)).toContainText(nom);
});

const corpsPanneau = (/** @type {Page} */ page, /** @type {string} */ nom) =>
    page.locator(`#pcpBody_${fictif(nom).userId}`);

When('je réduis la conversation avec {string}', async ({ monde }, nom) => {
    await monde.page.locator(`#pcpHead_${fictif(nom).userId}`).click();
});

When('je rouvre la conversation avec {string}', async ({ monde }, nom) => {
    await monde.page.locator(`#pcpHead_${fictif(nom).userId}`).click();
    await expect(corpsPanneau(monde.page, nom)).toBeVisible();
});

Then('la conversation avec {string} est réduite', async ({ monde }, nom) => {
    await expect(corpsPanneau(monde.page, nom)).toBeHidden();
    await expect(panneau(monde.page, nom)).toBeVisible();
});

// ---------- Inactivité ----------

Given(
    "l'inactivité est paramétrée à {int} minutes \\(réponse simulée) et l'horloge du navigateur contrôlée",
    async ({ monde }, minutes) => {
        const { page } = await monde.acteur('Utilisateur');
        await page.clock.install();
        await page.route('**/api/settings', route =>
            route.request().method() === 'GET'
                ? json(route, { inactivity_enabled: 'true', inactivity_timeout: String(minutes) })
                : route.continue()
        );
    }
);

Given(
    "l'inactivité de {string} est paramétrée à {int} minutes \\(réponse simulée)",
    async ({ monde }, label, minutes) => {
        const { page } = await monde.acteur(label);
        await page.route('**/api/settings', route =>
            route.request().method() === 'GET'
                ? json(route, { inactivity_enabled: 'true', inactivity_timeout: String(minutes) })
                : route.continue()
        );
    }
);

Then("le minuteur d'inactivité indique {string}", async ({ monde }, texte) => {
    const minuteur = monde.page.locator('#inactivityTimerDisplay');
    await expect(minuteur).toBeVisible({ timeout: 20000 });
    await expect(minuteur).toContainText(texte);
});

When(/^(\d+) secondes? passe(?:nt)? sans activité$/, async ({ monde }, secondes) => {
    await monde.page.clock.runFor(Number(secondes) * 1000);
});

When('je clique dans la page', async ({ monde }) => {
    await monde.page.mouse.click(5, 300);
});

const fenetreInactivite = (/** @type {Page} */ page) => page.locator('#inactivityModal');

Then("la fenêtre d'inactivité annonce une déconnexion dans {int} secondes", async ({ monde }, secondes) => {
    const fenetre = fenetreInactivite(monde.page);
    // Échéance atteinte au cours de la dernière seconde avancée : la fenêtre s'ouvre au tic suivant au plus tard
    for (let i = 0; i < 3 && !(await fenetre.isVisible()); i++) await monde.page.clock.runFor(1000);
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText('Session inactive');
    const decompte = Number(await monde.page.locator('#inactivityCountdown').textContent());
    expect(decompte).toBeGreaterThanOrEqual(secondes - 3);
    expect(decompte).toBeLessThanOrEqual(secondes);
});

When('je choisis de rester connecté', async ({ monde }) => {
    await fenetreInactivite(monde.page)
        .getByRole('button', { name: /Rester connecté/ })
        .click();
});

Then("la fenêtre d'inactivité est fermée", async ({ monde }) => {
    await expect(fenetreInactivite(monde.page)).toBeHidden();
});
