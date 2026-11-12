// @ts-check
// Aide à l'affectation › Asana : connexion (projets, filtre, analyse, appariement, import en masse), import CSV,
// rafraîchissements, changements, conflits, tâches du projet. Les routes Asana sont simulées dans le navigateur
// (réponses fixes, appels mémorisés) : rien n'est lu dans Asana ni écrit en base, sauf l'import CSV (serveur réel,
// déploiement de test supprimé en fin de scénario).
import { expect } from '@playwright/test';
import { adminApi, suivreDeploiement } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */
/** @typedef {{ cle: string, corps: any }} AppelAsana */

const RACINE = '/api/affectation';

/**
 * Réponses simulées : « MÉTHODE /api/… » → réponse (ou fonction du corps de la requête). Les autres appels passent au
 * serveur. Les appels simulés sont mémorisés (monde.d.asanaAppels).
 */
async function simuler(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ reponses) {
    const { page } = await monde.acteur('Administrateur');
    monde.d.asanaAppels ??= [];
    monde.d.asanaSim = { ...(monde.d.asanaSim ?? {}), ...reponses };
    if (monde.d.asanaRoute) return;
    monde.d.asanaRoute = true;
    await page.route(`**${RACINE}/**`, async route => {
        const req = route.request();
        const cle = `${req.method()} ${new URL(req.url()).pathname}`;
        const r = monde.d.asanaSim[cle];
        if (r === undefined) return route.fallback();
        /** @type {any} */
        let corps;
        try {
            corps = req.postDataJSON();
        } catch {
            corps = null;
        }
        monde.d.asanaAppels.push({ cle, corps });
        const data = typeof r === 'function' ? r(corps) : r;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
}

const appels = (/** @type {Monde} */ monde, /** @type {string} */ cle) =>
    /** @type {AppelAsana[]} */ (monde.d.asanaAppels ?? []).filter(a => a.cle === cle);

const CONFIGURE = {
    tokenSet: true,
    workspaceGid: '1111',
    workspaceName: 'Espace E2E',
    teamGid: '2222',
    teamName: 'Équipe E2E',
    nameFilter: 'SAMU'
};

// ── Projets du périmètre (données simulées) ──

const PROJETS = {
    Lyon: { gid: '1000000000000001', name: '[SAMU 9001] E2E Déploiement Lyon' },
    Nice: { gid: '1000000000000002', name: '[SAMU 9002] E2E Déploiement Nice' },
    Brest: { gid: '1000000000000003', name: '[SAMU 9003] E2E Déploiement Brest' }
};
const DEPLOIEMENTS = [
    { id: 990001, samu_name: 'SAMU 9001' },
    { id: 990002, samu_name: 'SAMU 9002' }
];
const projet = (/** @type {string} */ nom) => {
    const p = /** @type {Record<string, { gid: string, name: string }>} */ (PROJETS)[nom];
    if (!p) throw new Error(`Projet simulé inconnu : ${nom}`);
    return p;
};

const ligne = (
    /** @type {string} */ key,
    /** @type {string} */ label,
    /** @type {string} */ status,
    /** @type {string} */ ancien = '—',
    /** @type {string} */ nouveau = '03/02/2031 → 14/02/2031'
) => ({ key, label, old: ancien, new: nouveau, status, reason: '', previous: '' });

/** Aperçu d'un projet (Lyon : 2 rubriques à reprendre ; Nice : 1 conflit) */
const APERCUS = /** @type {Record<string, any>} */ ({
    [PROJETS.Lyon.gid]: {
        samuName: 'SAMU 9001',
        projectName: PROJETS.Lyon.name,
        taskCount: 12,
        existing: { id: 990001 },
        locationFound: true,
        rows: [
            ligne('cadrage', 'Cadrage', 'nouveau'),
            ligne('visite_metier', 'Visite métier', 'modifié', '03/03/2031 → 05/03/2031', '10/03/2031 → 12/03/2031'),
            ligne('date_debut', 'Début du projet', 'identique', '06/01/2031', '06/01/2031')
        ]
    },
    [PROJETS.Nice.gid]: {
        samuName: 'SAMU 9002',
        projectName: PROJETS.Nice.name,
        taskCount: 8,
        existing: { id: 990002 },
        locationFound: true,
        rows: [ligne('visite_metier', 'Visite métier', 'conflit', '03/03/2031 → 05/03/2031', '10/03/2031 → 12/03/2031')]
    }
});

/** Import automatique : Lyon créé (une rubrique), Nice seulement en conflit */
const IMPORTS = /** @type {Record<string, any>} */ ({
    [PROJETS.Lyon.gid]: {
        success: true,
        created: true,
        id: 990001,
        samu_name: 'SAMU 9001',
        changes: [{ label: 'Cadrage', from: '—', to: '03/02/2031 → 14/02/2031' }],
        conflicts: []
    },
    [PROJETS.Nice.gid]: {
        success: true,
        unchanged: false,
        id: 990002,
        samu_name: 'SAMU 9002',
        conflicts: [
            {
                key: 'visite_metier',
                label: 'Visite métier',
                app: '03/03/2031 → 05/03/2031',
                asana: '10/03/2031 → 12/03/2031',
                previous: '01/03/2031 → 03/03/2031'
            }
        ]
    }
});

Given("la connexion Asana simulée n'est pas configurée", async ({ monde }) => {
    await simuler(monde, {
        [`GET ${RACINE}/asana/config`]: {
            tokenSet: false,
            workspaceGid: '',
            workspaceName: '',
            teamGid: '',
            teamName: ''
        }
    });
});

Given('Asana simulé propose 3 projets de déploiement', async ({ monde }) => {
    await simuler(monde, {
        [`GET ${RACINE}/asana/config`]: CONFIGURE,
        [`GET ${RACINE}/asana/projects`]: {
            deployments: DEPLOIEMENTS,
            projects: [
                { ...PROJETS.Lyon, samuNo: '9001', deployment: DEPLOIEMENTS[0], manual: false, ignored: false },
                { ...PROJETS.Nice, samuNo: '9002', deployment: null, manual: false, ignored: false },
                { ...PROJETS.Brest, samuNo: '9003', deployment: null, manual: false, ignored: true }
            ]
        },
        [`POST ${RACINE}/asana/preview`]: (/** @type {any} */ c) => APERCUS[c.gid],
        [`POST ${RACINE}/asana/apply`]: (/** @type {any} */ c) => IMPORTS[c.gid],
        [`PUT ${RACINE}/asana/links`]: { success: true }
    });
});

const rubriqueAsana = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaCfg');
const tableProjets = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaTable');
const ligneProjet = (/** @type {Monde} */ monde, /** @type {string} */ nom) =>
    tableProjets(monde)
        .locator('tbody tr')
        .filter({ hasText: projet(nom).name });

Then('la rubrique « Connexion Asana » indique {string}', async ({ monde }, texte) => {
    await expect(rubriqueAsana(monde)).toContainText(texte, { timeout: 20000 });
});

Then('{int} projets Asana sont listés', async ({ monde }, n) => {
    await expect(tableProjets(monde).locator('tbody tr')).toHaveCount(n, { timeout: 20000 });
    await expect(monde.page.locator('#affAsanaCount')).toHaveText(String(n));
});

When('je filtre les projets Asana sur {string}', async ({ monde }, texte) => {
    await monde.page.locator('#affAsanaKw').fill(texte);
});

When("j'efface le filtre des projets Asana", async ({ monde }) => {
    await monde.page.locator('#affAsanaKw').fill('');
});

Then('le compteur des projets Asana indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('#affAsanaCount')).toHaveText(texte);
    await expect(ligneProjet(monde, 'Nice')).toBeVisible();
    await expect(ligneProjet(monde, 'Lyon')).toBeHidden();
});

When("j'analyse tous les projets Asana", async ({ monde }) => {
    await monde.page.locator('#affAsanaProjects').getByRole('button', { name: 'Tout analyser' }).click();
});

Then('le projet {string} indique {string}', async ({ monde }, nom, texte) => {
    // Émoji ⚠ remplacé par une icône (ui-icons.js) : fin du texte comparée
    const fin = texte.replace(/^⚠\s*/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(ligneProjet(monde, nom).locator('td').nth(3)).toHaveText(new RegExp(`(^|\\s)${fin}$`));
});

Then('Asana a été interrogé {int} fois en aperçu, sans import', async ({ monde }, n) => {
    expect(appels(monde, `POST ${RACINE}/asana/preview`)).toHaveLength(n);
    expect(appels(monde, `POST ${RACINE}/asana/apply`)).toHaveLength(0);
});

When("j'apparie le projet {string} au déploiement {string}", async ({ monde }, nom, samu) => {
    monde.d.lecturesProjets = appels(monde, `GET ${RACINE}/asana/projects`).length;
    await ligneProjet(monde, nom).locator('select').selectOption({ label: samu });
});

Then("l'appariement demandé relie le projet {string} au déploiement {int}", async ({ monde }, nom, id) => {
    await expect.poll(() => appels(monde, `PUT ${RACINE}/asana/links`).length).toBe(1);
    expect(appels(monde, `PUT ${RACINE}/asana/links`)[0]?.corps).toEqual({ gid: projet(nom).gid, deploymentId: id });
});

Then('la liste des projets Asana est relue', async ({ monde }) => {
    await expect
        .poll(() => appels(monde, `GET ${RACINE}/asana/projects`).length)
        .toBeGreaterThan(monde.d.lecturesProjets);
});

// ── Import en masse ──

When('je coche les projets Asana {string} et {string}', async ({ monde }, a, b) => {
    for (const nom of [a, b]) await ligneProjet(monde, nom).locator('input[type="checkbox"]').check();
});

Then("le bouton d'import indique {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#affAsanaBulkBtn')).toHaveText(texte);
});

When("j'importe la sélection et je confirme", async ({ monde }) => {
    const texte = await confirmer(monde, () => monde.page.locator('#affAsanaBulkBtn').click());
    expect(texte).toContain('Importer 2 projet(s) Asana ?');
});

const fenetreConflits = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaConfModal');
const fenetreChangements = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaChgModal');
const remplacerSamu = (/** @type {Monde} */ monde, /** @type {string} */ t) =>
    t.replace('{samu}', monde.d.localisation?.court ?? '');

Then('la fenêtre des conflits présente {string} pour {string}', async ({ monde }, rubrique, samu) => {
    await expect(fenetreConflits(monde)).toBeVisible({ timeout: 20000 });
    const bloc = fenetreConflits(monde).locator('#affAsanaConfBody > div').filter({ hasText: samu });
    await expect(bloc.locator('tbody tr').filter({ hasText: rubrique })).toHaveCount(1);
});

Then('la fenêtre des conflits présente {string} pour le SAMU de test', async ({ monde }, rubrique) => {
    await expect(fenetreConflits(monde)).toBeVisible({ timeout: 20000 });
    const bloc = fenetreConflits(monde)
        .locator('#affAsanaConfBody > div')
        .filter({ hasText: monde.d.localisation.court });
    await expect(bloc.locator('tbody tr').filter({ hasText: rubrique })).toHaveCount(1);
});

When('je remets les conflits à plus tard', async ({ monde }) => {
    await fenetreConflits(monde).getByRole('button', { name: 'Plus tard' }).click();
    await expect(fenetreConflits(monde)).toBeHidden();
});

When("je reprends la valeur d'Asana pour {string} et je valide mes choix", async ({ monde }, rubrique) => {
    const rangee = fenetreConflits(monde).locator('tbody tr').filter({ hasText: rubrique });
    await rangee.getByLabel('Reprendre Asana').check();
    await fenetreConflits(monde).getByRole('button', { name: 'Valider mes choix' }).click();
    await expect(fenetreConflits(monde)).toBeHidden();
});

Then("l'arbitrage envoyé reprend Asana pour « {word} »", async ({ monde }, cle) => {
    const envoyes = appels(monde, `POST ${RACINE}/projects/${monde.d.deploiement.id}/asana-conflicts`);
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]?.corps).toEqual({ choices: { [cle]: 'asana' } });
});

Then("la fenêtre des changements s'intitule {string}", async ({ monde }, titre) => {
    await expect(fenetreChangements(monde)).toBeVisible({ timeout: 20000 });
    await expect(fenetreChangements(monde)).toContainText(remplacerSamu(monde, titre));
});

/** Bloc d'un SAMU dans la fenêtre des changements, et ligne d'une rubrique */
async function verifierChangement(
    /** @type {Monde} */ monde,
    /** @type {string | null} */ samu,
    /** @type {string | null} */ etat,
    /** @type {string} */ rubrique,
    /** @type {string} */ avant,
    /** @type {string} */ apres
) {
    let zone = fenetreChangements(monde).locator('#affAsanaChgBody');
    if (samu) zone = zone.locator(':scope > div').filter({ hasText: samu });
    if (etat) await expect(zone.locator('.aff-av-b').first()).toHaveText(etat);
    const rangee = zone.locator('tbody tr').filter({ hasText: rubrique });
    await expect(rangee).toHaveCount(1);
    await expect(rangee.locator('td').nth(1)).toHaveText(avant);
    await expect(rangee.locator('td').nth(3)).toHaveText(apres);
}

Then(
    'la fenêtre des changements présente {string} créé avec {string} de {string} à {string}',
    async ({ monde }, samu, rubrique, avant, apres) => {
        await verifierChangement(monde, samu, 'créé', rubrique, avant, apres);
    }
);

Then(
    'la fenêtre des changements présente {string} mis à jour avec {string} de {string} à {string}',
    async ({ monde }, samu, rubrique, avant, apres) => {
        await verifierChangement(monde, samu, 'mis à jour', rubrique, avant, apres);
    }
);

Then(
    'la fenêtre des changements présente {string} de {string} à {string}',
    async ({ monde }, rubrique, avant, apres) => {
        await verifierChangement(monde, null, null, rubrique, avant, apres);
    }
);

Then('la fenêtre des changements liste {string}', async ({ monde }, texte) => {
    await expect(fenetreChangements(monde).locator('#affAsanaChgBody')).toContainText(texte);
});

When('je ferme la fenêtre des changements', async ({ monde }) => {
    await fenetreChangements(monde)
        .locator('.aff-modal-foot, .gp-modale__actions')
        .getByRole('button', { name: 'Fermer' })
        .click();
    await expect(fenetreChangements(monde)).toBeHidden();
});

Then("le compte rendu de l'import indique {string}", async ({ monde }, texte) => {
    await expect(monde.page.locator('#affAsanaBulkMsg')).toHaveText(texte);
});

Then('Asana a reçu {int} imports automatiques', async ({ monde }, n) => {
    const imports = appels(monde, `POST ${RACINE}/asana/apply`);
    expect(imports).toHaveLength(n);
    for (const i of imports) expect(i.corps).toMatchObject({ apply: 'auto' });
});

Then('une annonce indique {string}', async ({ monde }, texte) => {
    await expect(monde.page.locator('.aff-toast').filter({ hasText: remplacerSamu(monde, texte) })).toBeVisible({
        timeout: 20000
    });
});

// ── Import d'un export CSV (serveur réel) ──

const fenetreImport = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaModal');

When("je charge l'export CSV dans la fenêtre d'import", async ({ monde }) => {
    // Déploiement créé par l'import : supprimé en fin de scénario
    const loc = monde.d.localisation;
    monde.aNettoyer(`déploiements importés ${loc.court}`, async () => {
        const api = await adminApi(monde);
        const { projects } = await api.ok('GET', '/api/affectation/projects');
        for (const p of projects.filter((/** @type {any} */ x) => x.location_id === loc.id))
            await api.delete(`/api/affectation/projects/${p.id}?events=delete`);
    });
    await fenetreImport(monde)
        .locator('#affAsanaFile')
        .setInputFiles({ name: 'export-asana.csv', mimeType: 'text/csv', buffer: Buffer.from(monde.d.csv, 'utf8') });
});

Then("l'aperçu annonce la création du déploiement du SAMU de test", async ({ monde }) => {
    const resultat = fenetreImport(monde).locator('#affAsanaResult');
    await expect(resultat).toContainText(`Déploiement E2E [SAMU ${monde.d.csvNo}]`, { timeout: 20000 });
    await expect(resultat).toContainText('Aucun déploiement pour ce SAMU : il sera créé');
});

Then("l'aperçu propose la rubrique {string} en {string}, cochée", async ({ monde }, rubrique, etat) => {
    const rangee = fenetreImport(monde).locator('#affAsanaResult tbody tr').filter({ hasText: rubrique });
    await expect(rangee.locator('td').nth(4)).toHaveText(etat);
    await expect(rangee.locator('input[type="checkbox"]')).toBeChecked();
});

When("j'applique la sélection de l'import", async ({ monde }) => {
    await fenetreImport(monde).getByRole('button', { name: 'Appliquer la sélection' }).click();
    await expect(fenetreImport(monde)).toBeHidden();
});

Then("le déploiement importé est repris d'Asana, avec sa mise en service au {string}", async ({ monde }, date) => {
    const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
    const dep = projects.find((/** @type {any} */ p) => p.location_id === monde.d.localisation.id);
    expect(dep).toMatchObject({ from_asana: true, date_mise_en_service: date });
    await suivreDeploiement(monde, dep);
    await expect(
        monde.page.locator('#affProjects .aff-proj-name', { hasText: dep.samu_name }).locator('img[alt="Asana"]')
    ).toBeVisible();
});

// ── Rafraîchissements ──

const PROJET_DE_TEST = '[E2E] Projet de test';

Given(
    'Asana simulé modifie la visite métier du déploiement de test et signale un conflit sur la mise en service',
    async ({ monde }) => {
        const id = monde.d.deploiement.id;
        const samu = monde.d.localisation.court;
        await simuler(monde, {
            [`POST ${RACINE}/projects/${id}/asana-refresh`]: {
                success: true,
                updated: 1,
                samu_name: samu,
                asana: PROJET_DE_TEST,
                changes: [{ label: 'Visite métier', from: '03/03/2031 → 05/03/2031', to: '10/03/2031 → 12/03/2031' }],
                conflicts: [
                    {
                        key: 'mise_en_service',
                        label: 'Mise en service',
                        app: '01/04/2031',
                        asana: '15/04/2031',
                        previous: '02/04/2031'
                    }
                ]
            },
            [`POST ${RACINE}/projects/${id}/asana-conflicts`]: { success: true, applied: 1, kept: 0 }
        });
    }
);

Given("Asana simulé n'a rien de nouveau pour le déploiement de test", async ({ monde }) => {
    await simuler(monde, {
        [`POST ${RACINE}/projects/${monde.d.deploiement.id}/asana-refresh`]: {
            success: true,
            unchanged: true,
            samu_name: monde.d.localisation.court,
            asana: PROJET_DE_TEST
        }
    });
});

Given('Asana simulé rafraîchit tous les déploiements', async ({ monde }) => {
    await simuler(monde, {
        [`POST ${RACINE}/asana/refresh-all`]: {
            success: true,
            total: 4,
            updated: [
                {
                    samu: 'SAMU 9001',
                    asana: PROJETS.Lyon.name,
                    rows: 1,
                    changes: [{ label: 'Cadrage', from: '—', to: '03/02/2031 → 14/02/2031' }]
                }
            ],
            unchanged: ['SAMU 9002'],
            noMatch: ['SAMU 9004'],
            errors: [{ samu: 'SAMU 9005', error: 'Projet Asana illisible' }],
            conflicts: []
        }
    });
});

const ligneDeploiement = (/** @type {Monde} */ monde) =>
    monde.page.locator('#affProjects .aff-proj').filter({
        has: monde.page.locator('.aff-proj-name', { hasText: new RegExp(`^${monde.d.localisation.court}$`) })
    });

When('je rafraîchis le déploiement de test depuis Asana', async ({ monde }) => {
    await ligneDeploiement(monde)
        .getByRole('button', { name: /^Rafraîchir depuis Asana/ })
        .click();
});

When('je rafraîchis depuis Asana la ligne du SAMU de test dans la grille', async ({ monde }) => {
    const ligneGrille = monde.page
        .locator('#affPlan tbody tr')
        .filter({ has: monde.page.locator('th', { hasText: monde.d.localisation.court }) });
    await ligneGrille.getByRole('button', { name: /^Rafraîchir depuis Asana/ }).click();
});

When('je rafraîchis tous les déploiements depuis Asana', async ({ monde }) => {
    await monde.page
        .locator('#affectationAdminTab')
        .getByRole('button', { name: 'Tout rafraîchir depuis Asana' })
        .click();
});

Then('le bouton « Tout rafraîchir depuis Asana » est de nouveau disponible', async ({ monde }) => {
    const bouton = monde.page
        .locator('#affectationAdminTab')
        .getByRole('button', { name: 'Tout rafraîchir depuis Asana' });
    await expect(bouton).toBeVisible();
    await expect(bouton).not.toHaveClass(/aff-busy/);
});

// ── Tâches du projet Asana ──

const TACHES = [
    {
        gid: '3000000000000001',
        code: '2.1',
        name: '2.1 Démarrage',
        parent: null,
        start: null,
        due: '2031-01-06',
        eff: { start: '2031-01-06', end: '2031-01-06' }
    },
    {
        gid: '3000000000000002',
        code: '5.1',
        name: '5.1 Visite métier',
        parent: '5 Visites',
        start: '2031-03-03',
        due: '2031-03-05',
        eff: { start: '2031-03-03', end: '2031-03-05' }
    },
    {
        gid: '3000000000000003',
        code: '5.2',
        name: '5.2 Visite complémentaire',
        parent: '5 Visites',
        start: '2031-03-10',
        due: '2031-03-12',
        eff: { start: '2031-03-10', end: '2031-03-12' }
    },
    { gid: '3000000000000004', code: null, name: 'Tâche sans date', parent: null, start: null, due: null, eff: null }
];
const tache = (/** @type {string} */ code) => {
    const t = TACHES.find(x => x.code === code);
    if (!t) throw new Error(`Tâche simulée inconnue : ${code}`);
    return t;
};

Given('Asana simulé fournit les tâches du projet du déploiement de test', async ({ monde }) => {
    const id = monde.d.deploiement.id;
    const samu = monde.d.localisation.court;
    await simuler(monde, {
        [`GET ${RACINE}/projects/${id}/asana-tasks`]: {
            samu,
            asana: '[E2E] Projet de test',
            gid: '2000000000000001',
            url: 'https://app.asana.invalid/0/2000000000000001',
            candidates: [
                { gid: '2000000000000001', name: '[E2E] Projet de test' },
                { gid: '2000000000000002', name: '[E2E] Ancien projet' }
            ],
            tasks: TACHES,
            rubriques: [
                {
                    key: 'date_debut',
                    label: 'Début du projet',
                    kind: 'date',
                    rule: "Démarrage projet auprès de l'ES",
                    current: { date: '2031-01-06' },
                    auto: { date: '2031-01-06' },
                    sources: ['2.1 Démarrage'],
                    override: null
                },
                {
                    key: 'visite_metier',
                    label: 'Visite métier',
                    kind: 'period',
                    rule: '5.1 Visite métier',
                    current: { start: '2031-03-03', end: '2031-03-05' },
                    auto: { start: '2031-03-03', end: '2031-03-04' },
                    sources: ['5.1 Visite métier'],
                    override: null
                }
            ],
            overridden: []
        },
        [`PUT ${RACINE}/projects/${id}/asana-overrides`]: {
            success: true,
            updated: 1,
            samu_name: samu,
            asana: '[E2E] Projet de test',
            changes: [{ label: 'Visite métier', from: '03/03/2031 → 05/03/2031', to: '10/03/2031 → 12/03/2031' }]
        },
        [`PUT ${RACINE}/asana/links`]: { success: true }
    });
});

const fenetreTaches = (/** @type {Monde} */ monde) => monde.page.locator('#affAsanaTasksModal');
const rubriqueTaches = (/** @type {Monde} */ monde, /** @type {string} */ libelle) =>
    fenetreTaches(monde)
        .locator('#affAsanaTasksBody table')
        .first()
        .locator('tbody tr')
        .filter({ has: monde.page.locator('td:first-child b', { hasText: new RegExp(`^${libelle}$`) }) });

When("j'ouvre les tâches du projet Asana du déploiement de test", async ({ monde }) => {
    await ligneDeploiement(monde)
        .getByRole('button', { name: /^Tâches du projet Asana/ })
        .click();
    await expect(fenetreTaches(monde)).toBeVisible();
    await expect(fenetreTaches(monde)).toContainText(`Tâches du projet Asana — ${monde.d.localisation.court}`);
    await expect(rubriqueTaches(monde, 'Visite métier')).toHaveCount(1, { timeout: 20000 });
});

Then('la rubrique {string} est indiquée « {}»', async ({ monde }, libelle, origine) => {
    await expect(rubriqueTaches(monde, libelle).locator('td').nth(1)).toContainText(origine.trim());
});

Then('la tâche {string} ne peut pas être choisie', async ({ monde }, nom) => {
    const option = rubriqueTaches(monde, 'Visite métier').locator('select').first().locator('option', { hasText: nom });
    await expect(option).toBeDisabled();
});

Then("l'événement associé à {string} propose « Nouveau »", async ({ monde }, libelle) => {
    const cellule = rubriqueTaches(monde, libelle).locator('td').nth(5);
    await expect(cellule.getByRole('button', { name: 'Nouveau' })).toBeVisible({ timeout: 20000 });
});

Then('la liste de toutes les tâches compte {int} tâches', async ({ monde }, n) => {
    await expect(fenetreTaches(monde).locator('summary', { hasText: 'Toutes les tâches du projet Asana' })).toHaveText(
        `Toutes les tâches du projet Asana (${n})`
    );
});

When('je remplace le début et la fin de {string} par la tâche {string}', async ({ monde }, libelle, code) => {
    const t = tache(code);
    await rubriqueTaches(monde, libelle).locator('select').nth(0).selectOption(t.gid);
    await rubriqueTaches(monde, libelle).locator('select').nth(1).selectOption(t.gid);
});

Then(
    'la rubrique {string} est marquée « remplacé », avec {string} après remplacement',
    async ({ monde }, libelle, apres) => {
        const r = rubriqueTaches(monde, libelle);
        await expect(r.locator('td').first()).toContainText('remplacé');
        await expect(r.locator('td').nth(4)).toHaveText(apres);
    }
);

When('je remets toutes les rubriques sur la règle', async ({ monde }) => {
    await fenetreTaches(monde).getByRole('button', { name: 'Tout remettre à la règle' }).click();
});

Then("la rubrique {string} n'est plus marquée « remplacé »", async ({ monde }, libelle) => {
    const r = rubriqueTaches(monde, libelle);
    await expect(r.locator('td').first()).not.toContainText('remplacé');
    await expect(r.locator('td').nth(4)).toHaveText('');
});

When("j'applique les remplacements", async ({ monde }) => {
    await fenetreTaches(monde).getByRole('button', { name: 'Appliquer les remplacements' }).click();
    await expect(fenetreTaches(monde)).toBeHidden();
});

Then(
    'les remplacements envoyés reprennent la tâche {string} pour le début et la fin de « {word} »',
    async ({ monde }, code, cle) => {
        const envoyes = appels(monde, `PUT ${RACINE}/projects/${monde.d.deploiement.id}/asana-overrides`);
        expect(envoyes).toHaveLength(1);
        expect(envoyes[0]?.corps).toEqual({ overrides: { [cle]: { start: tache(code).gid, end: tache(code).gid } } });
    }
);

When('je choisis le projet Asana {string} pour ce déploiement', async ({ monde }, nom) => {
    monde.d.lecturesTaches = appels(monde, `GET ${RACINE}/projects/${monde.d.deploiement.id}/asana-tasks`).length;
    await fenetreTaches(monde).locator('#affAsanaTasksBody p select').selectOption({ label: nom });
});

Then("l'appariement demandé relie le projet {string} au déploiement de test", async ({ monde }, nom) => {
    await expect.poll(() => appels(monde, `PUT ${RACINE}/asana/links`).length).toBe(1);
    expect(appels(monde, `PUT ${RACINE}/asana/links`)[0]?.corps).toEqual({
        gid: nom === 'Ancien projet' ? '2000000000000002' : '2000000000000001',
        deploymentId: monde.d.deploiement.id
    });
});

Then('les tâches du projet Asana sont relues', async ({ monde }) => {
    await expect
        .poll(() => appels(monde, `GET ${RACINE}/projects/${monde.d.deploiement.id}/asana-tasks`).length)
        .toBeGreaterThan(monde.d.lecturesTaches);
    await expect(rubriqueTaches(monde, 'Visite métier')).toHaveCount(1);
});
