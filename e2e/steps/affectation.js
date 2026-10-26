// @ts-check
// Aide à l'affectation : déploiements, affectations, report dans la planification, événements, Asana
import { expect } from '@playwright/test';
import { config } from '../support/config.js';
import {
    adminApi,
    cle,
    corpsDeploiement,
    creerEvenement,
    creerLocalisation,
    creerRessource,
    jours,
    lireDeploiement,
    lireEvenement,
    nettoyerMoisExpert,
    ressourceExpert,
    suivreDeploiement,
    suivreEvenement,
    typeParCode
} from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const deploiement = async (/** @type {Monde} */ monde) => lireDeploiement(monde, monde.d.deploiement.id);
const planning = async (/** @type {Monde} */ monde) => (await adminApi(monde)).ok('GET', '/api/schedule');
const PERIODES = /** @type {const} */ (['AM', 'PM']);

Given('une localisation SAMU de test existe', async ({ monde }) => {
    monde.d.localisation = await creerLocalisation(monde);
});

async function creerParApi(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ body) {
    monde.reponse = await (await adminApi(monde)).post('/api/affectation/projects', body);
    if (monde.reponse.status === 200) await suivreDeploiement(monde, monde.reponse.data);
}

When(
    "l'administrateur crée un déploiement pour cette localisation débutant le {string} avec une visite métier du {string} au {string} pour {int} ressource(s)",
    async ({ monde }, debut, d1, d2, needed) => {
        await creerParApi(monde, corpsDeploiement(monde.d.localisation, { debut, visite: [d1, d2], needed }));
    }
);

When(
    "l'administrateur crée un déploiement pour cette localisation débutant le {string} avec une visite métier du {string} au {string} sans nombre de ressources",
    async ({ monde }, debut, d1, d2) => {
        await creerParApi(monde, corpsDeploiement(monde.d.localisation, { debut, visite: [d1, d2], needed: null }));
    }
);

When(/^l'administrateur crée un déploiement incohérent : (.+)$/, async ({ monde }, cas) => {
    const loc = monde.d.localisation;
    /** @type {Record<string, () => Record<string, unknown>>} */
    const corps = {
        'une visite métier qui finit avant de commencer': () =>
            corpsDeploiement(loc, { visite: ['2031-03-05', '2031-03-03'] }),
        'une mise en service avant le début du projet': () =>
            corpsDeploiement(loc, { extra: { date_mise_en_service: '2030-12-01' } }),
        'sans date de début de projet': () => ({ ...corpsDeploiement(loc), date_debut: undefined })
    };
    if (!corps[cas]) throw new Error(`Cas inconnu : ${cas}`);
    await creerParApi(monde, corps[cas]());
});

Then('le déploiement apparaît dans le planning des déploiements', async ({ monde }) => {
    expect(await deploiement(monde)).toMatchObject({
        samu_name: monde.d.localisation.court,
        location_id: monde.d.localisation.id
    });
});

const historique = async (/** @type {Monde} */ monde) =>
    (await (await adminApi(monde)).ok('GET', `/api/affectation/projects/${monde.d.deploiement.id}/history`)).history;

Then("l'historique du déploiement contient l'action {string}", async ({ monde }, action) => {
    expect((await historique(monde)).map((/** @type {any} */ h) => h.action)).toContain(action);
});

Then("l'historique du déploiement liste {string}, la plus récente d'abord", async ({ monde }, liste) => {
    expect((await historique(monde)).map((/** @type {any} */ h) => h.action).join(', ')).toBe(liste);
});

Then("chaque entrée de l'historique indique qui et quand", async ({ monde }) => {
    for (const h of await historique(monde)) {
        expect(h.user, JSON.stringify(h)).toBeTruthy();
        expect(h.at, JSON.stringify(h)).toBeTruthy();
    }
});

When("l'administrateur consulte la liste des étapes d'un déploiement", async ({ monde }) => {
    monde.d.config = await (await adminApi(monde)).ok('GET', '/api/affectation/config');
});

/** Libellé comparable : sans guillemets ni casse (« Formation « Utilisateurs » » = « Formation utilisateurs ») */
const normalise = (/** @type {string} */ s) => s.replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

Then("l'étape {string} existe", async ({ monde }, libelle) => {
    expect(monde.d.config.stages.map((/** @type {any} */ s) => normalise(s.label))).toContain(normalise(libelle));
});

Then('aucune étape ne mentionne {string}', async ({ monde }, texte) => {
    const libelles = monde.d.config.stages.map((/** @type {any} */ s) => `${s.key} ${s.label}`.toLowerCase());
    expect(libelles.filter((/** @type {string} */ l) => l.includes(texte.toLowerCase()))).toEqual([]);
});

// ---------- Ressources affectées et planification ----------

async function ressourceDisponible(/** @type {Monde} */ monde, /** @type {string} */ debut, /** @type {string} */ fin) {
    const r = await creerRessource(monde);
    /** @type {Record<string, string>} */
    const cellules = {};
    for (const j of jours(debut, fin)) for (const p of PERIODES) cellules[cle(r.id, 'available', j, p)] = '2';
    await (await adminApi(monde)).ok('POST', '/api/schedule', cellules);
    return r;
}

Given('une ressource de test est « 2 - Disponible » du {string} au {string}', async ({ monde }, debut, fin) => {
    monde.d.ressource = await ressourceDisponible(monde, debut, fin);
});

Given('deux ressources de test sont « 2 - Disponible » du {string} au {string}', async ({ monde }, debut, fin) => {
    monde.d.ressources = [await ressourceDisponible(monde, debut, fin), await ressourceDisponible(monde, debut, fin)];
});

When("l'administrateur affecte les deux ressources à la visite métier du déploiement", async ({ monde }) => {
    monde.reponse = await (
        await adminApi(monde)
    ).put(`/api/affectation/projects/${monde.d.deploiement.id}/assignments/visite_metier`, {
        resource_ids: monde.d.ressources.map((/** @type {any} */ r) => r.id)
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

/** Report des affectations de la visite métier dans la planification (et création de l'événement si demandé) */
async function reporter(/** @type {Monde} */ monde, /** @type {boolean} */ avecEvenement) {
    const api = await adminApi(monde);
    const url = `/api/affectation/projects/${monde.d.deploiement.id}/sync/visite_metier`;
    const apercu = await api.ok('GET', url);
    const ids = (await deploiement(monde)).assignments?.visite_metier || [];
    // Planification de l'expert de test éventuellement modifiée : remise en état en fin de scénario
    const expert = await ressourceExpert(monde).catch(() => null);
    if (expert && ids.includes(expert.resourceId)) {
        for (const j of jours(apercu.start, apercu.end)) {
            const [a, m] = j.split('-').map(Number);
            await nettoyerMoisExpert(monde, a, m - 1);
        }
    }
    /** @type {Record<string, unknown>} */
    const body = { planning: { resource_ids: ids } };
    if (avecEvenement) {
        body.event = {
            apply: true,
            participants: apercu.resources.map((/** @type {any} */ r) => r.user_id).filter(Boolean)
        };
    }
    monde.reponse = await api.post(url, body);
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
    const evt = monde.reponse.data.event;
    if (evt?.id) {
        monde.d.evenementVisite = evt.id;
        monde.d.evenement = evt.id;
        await suivreEvenement(monde, evt.id);
    }
}

When("l'administrateur reporte l'affectation de la visite métier dans la planification", async ({ monde }) => {
    await reporter(monde, false);
});

When(
    "l'administrateur reporte l'affectation de la visite métier dans la planification avec création de l'événement",
    async ({ monde }) => {
        await reporter(monde, true);
    }
);

Given(
    "l'affectation de la visite métier est reportée dans la planification avec création de l'événement",
    async ({ monde }) => {
        await reporter(monde, true);
    }
);

async function verifierDeploiement(
    /** @type {Monde} */ monde,
    /** @type {number} */ rid,
    /** @type {string} */ debut,
    /** @type {string} */ fin
) {
    const p = await planning(monde);
    const samu = `🚨 ${monde.d.localisation.court}`;
    for (const j of jours(debut, fin)) {
        for (const per of PERIODES) {
            expect(p[cle(rid, 'activity', j, per)], `${j} ${per}`).toBe('3');
            expect(p[cle(rid, 'localisation', j, per)], `${j} ${per}`).toBe(samu);
        }
    }
}

Then(
    'la planification de la ressource est « 3 - Déploiement » du {string} au {string} sur le SAMU du déploiement',
    async ({ monde }, debut, fin) => {
        await verifierDeploiement(monde, monde.d.ressource.id, debut, fin);
    }
);

Then(
    'les deux ressources sont « 3 - Déploiement » du {string} au {string} sur le SAMU du déploiement',
    async ({ monde }, debut, fin) => {
        for (const r of monde.d.ressources) await verifierDeploiement(monde, r.id, debut, fin);
    }
);

When("l'administrateur consulte la disponibilité des ressources pour la visite métier", async ({ monde }) => {
    monde.d.disponibilite = await (
        await adminApi(monde)
    ).ok('GET', `/api/affectation/projects/${monde.d.deploiement.id}/availability/visite_metier`);
});

Then('la ressource est signalée affectée à {string} sur la période', async ({ monde }, samu) => {
    const dispo = monde.d.disponibilite.availability[monde.d.ressource.id];
    expect(dispo?.other).toBeGreaterThan(0);
    expect(dispo.others).toContain(samu);
});

/** Désaffectation comme dans l'écran : nouvelle liste des affectés, puis remise en situation de la planification */
async function desaffecter(/** @type {Monde} */ monde, /** @type {number} */ rid) {
    const api = await adminApi(monde);
    const restants = ((await deploiement(monde)).assignments?.visite_metier || []).filter(
        (/** @type {number} */ id) => id !== rid
    );
    const put = await api.put(`/api/affectation/projects/${monde.d.deploiement.id}/assignments/visite_metier`, {
        resource_ids: restants
    });
    expect(put.status, JSON.stringify(put.data)).toBe(200);
    monde.reponse = await api.post(
        `/api/affectation/projects/${monde.d.deploiement.id}/assignments/visite_metier/release`,
        { resource_ids: [rid] }
    );
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
}

When("l'administrateur désaffecte l'expert de test de la visite métier", async ({ monde }) => {
    await desaffecter(monde, (await ressourceExpert(monde)).resourceId);
});

When("l'administrateur désaffecte la première ressource de la visite métier", async ({ monde }) => {
    await desaffecter(monde, monde.d.ressources[0].id);
});

async function verifierRemiseEnSituation(
    /** @type {Monde} */ monde,
    /** @type {number} */ rid,
    /** @type {string} */ debut,
    /** @type {string} */ fin
) {
    const p = await planning(monde);
    for (const j of jours(debut, fin)) {
        for (const per of PERIODES) {
            expect(p[cle(rid, 'available', j, per)], `${j} ${per}`).toBe('2');
            expect(p[cle(rid, 'activity', j, per)], `${j} ${per}`).toBe('2');
            expect(p[cle(rid, 'localisation', j, per)] || '', `${j} ${per}`).toBe('');
        }
    }
}

Then(
    "la planification de l'expert de test est « 2 - Disponible \\/ 2 - En attente d'affectation » sans localisation du {string} au {string}",
    async ({ monde }, debut, fin) => {
        await verifierRemiseEnSituation(monde, (await ressourceExpert(monde)).resourceId, debut, fin);
    }
);

Then("la première ressource n'est plus affectée à la visite métier", async ({ monde }) => {
    expect((await deploiement(monde)).assignments?.visite_metier || []).not.toContain(monde.d.ressources[0].id);
});

Then("l'expert de test n'est plus participant de l'événement de la visite métier", async ({ monde }) => {
    const { userId } = await ressourceExpert(monde);
    const e = await lireEvenement(monde, monde.d.evenementVisite);
    expect(e.participants.map((/** @type {any} */ p) => p.user_id)).not.toContain(userId);
});

Then('aucune des deux ressources ne reste en « 3 - Déploiement » sur la période', async ({ monde }) => {
    const p = await planning(monde);
    for (const r of monde.d.ressources) {
        for (const j of jours('2031-03-03', '2031-03-19')) {
            for (const per of PERIODES) expect(p[cle(r.id, 'activity', j, per)], `${r.nom} ${j} ${per}`).not.toBe('3');
        }
    }
});

// ---------- Modification et suppression ----------

async function modifier(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ changements) {
    const d = await deploiement(monde);
    monde.reponse = await (
        await adminApi(monde)
    ).put(`/api/affectation/projects/${d.id}`, {
        samu_name: d.samu_name,
        location_id: d.location_id,
        chef_projet_id: d.chef_projet_id,
        date_debut: d.date_debut,
        date_mise_en_service: d.date_mise_en_service,
        date_mise_en_production: d.date_mise_en_production,
        periods: d.periods,
        ...changements
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
}

When("l'administrateur modifie la mise en service du déploiement au {string}", async ({ monde }, date) => {
    await modifier(monde, { date_mise_en_service: date });
});

When(
    "l'administrateur décale la visite métier du déploiement au {string} - {string}",
    async ({ monde }, debut, fin) => {
        const d = await deploiement(monde);
        const visite = d.periods.visite_metier[0];
        await modifier(monde, { periods: { ...d.periods, visite_metier: [{ ...visite, start: debut, end: fin }] } });
    }
);

When("l'administrateur supprime le déploiement sans préciser le sort des événements", async ({ monde }) => {
    monde.reponse = await (await adminApi(monde)).delete(`/api/affectation/projects/${monde.d.deploiement.id}`);
});

When("l'administrateur supprime le déploiement en conservant les événements", async ({ monde }) => {
    monde.reponse = await (
        await adminApi(monde)
    ).delete(`/api/affectation/projects/${monde.d.deploiement.id}?events=keep`);
});

When("l'administrateur supprime le déploiement avec ses événements", async ({ monde }) => {
    monde.reponse = await (
        await adminApi(monde)
    ).delete(`/api/affectation/projects/${monde.d.deploiement.id}?events=delete`);
});

Then('la validation demandée indique {int} événements liés', async ({ monde }, n) => {
    expect(monde.reponse?.data.code).toBe('EVENTS_LINKED');
    expect(monde.reponse?.data.events).toHaveLength(n);
});

Then("le déploiement n'existe plus", async ({ monde }) => {
    expect(await deploiement(monde)).toBeUndefined();
});

Then('les {int} événements liés existent toujours', async ({ monde }, n) => {
    expect(monde.d.evenementsLies).toHaveLength(n);
    for (const id of monde.d.evenementsLies) expect(await lireEvenement(monde, id), `événement ${id}`).toBeTruthy();
});

// ---------- Application et onglet Événements ----------

Then("l'application d'aide à l'affectation est affichée", async ({ monde }) => {
    await expect(monde.page.locator('#affectationContainer')).toBeVisible({ timeout: 20000 });
    await monde.page.waitForLoadState('networkidle').catch(() => {});
});

Given(
    "l'administrateur a créé un événement de type « Autre » sur la localisation du déploiement le {string}",
    async ({ monde }, date) => {
        const autre = await typeParCode(monde, 'autre');
        monde.d.evenementAutre = await creerEvenement(monde, {
            startDate: date,
            type_id: autre.id,
            location_id: monde.d.localisation.id
        });
    }
);

Given(
    "l'administrateur a créé un événement de type « Visite métier » sur une localisation hors planning le {string}",
    async ({ monde }, date) => {
        const hors = await creerLocalisation(monde);
        const visite = await typeParCode(monde, 'visiteMetier');
        monde.d.evenementHorsPlanning = await creerEvenement(monde, {
            startDate: date,
            type_id: visite.id,
            location_id: hors.id
        });
    }
);

When("l'administrateur consulte l'onglet Événements de l'aide à l'affectation", async ({ monde }) => {
    monde.d.listeAffectation = await (await adminApi(monde)).ok('GET', '/api/affectation/events');
});

const listeIds = (/** @type {Monde} */ monde) => monde.d.listeAffectation.events.map((/** @type {any} */ e) => e.id);

Then("l'événement de la visite métier est listé", async ({ monde }) => {
    expect(listeIds(monde)).toContain(monde.d.evenementVisite);
});

Then("l'événement de type « Autre » n'est pas listé", async ({ monde }) => {
    expect(listeIds(monde)).not.toContain(monde.d.evenementAutre);
});

Then("l'événement hors planning n'est pas listé", async ({ monde }) => {
    expect(listeIds(monde)).not.toContain(monde.d.evenementHorsPlanning);
});

Then("la liste ne contient que des événements des 7 types d'activité", async ({ monde }) => {
    const activites = [
        'visite_metier',
        'mise_en_service',
        'mise_en_production',
        'vft',
        'accompagnement',
        'test_prerequis',
        'formation_utilisateurs'
    ];
    for (const e of monde.d.listeAffectation.events) expect(activites, JSON.stringify(e)).toContain(e.stage);
});

Then(
    "l'événement de la visite métier indique l'activité prévue du {string} au {string}",
    async ({ monde }, debut, fin) => {
        const e = monde.d.listeAffectation.events.find((/** @type {any} */ x) => x.id === monde.d.evenementVisite);
        expect(e?.planned).toEqual({ start: debut, end: fin });
    }
);

Then(
    "l'événement créé est sur la localisation du déploiement, du type « Visite métier », du {string} au {string}",
    async ({ monde }, debut, fin) => {
        const visite = await typeParCode(monde, 'visiteMetier');
        expect(await lireEvenement(monde, monde.d.evenement)).toMatchObject({
            location_id: monde.d.localisation.id,
            type_id: visite.id,
            start_date: debut,
            end_date: fin
        });
    }
);

Then("la visite métier du déploiement est reliée à l'événement créé", async ({ monde }) => {
    const { candidates } = await (
        await adminApi(monde)
    ).ok('GET', `/api/affectation/projects/${monde.d.deploiement.id}/events-candidates`);
    expect(candidates.visite_metier.linked).toBe(monde.d.evenement);
});

// ---------- Asana ----------

When("l'administrateur consulte la configuration Asana", async ({ monde }) => {
    monde.reponse = await (await adminApi(monde)).get('/api/affectation/asana/config');
});

Then('la réponse indique seulement si un jeton est enregistré, sans le jeton', async ({ monde }) => {
    const data = monde.reponse?.data;
    expect(monde.reponse?.status).toBe(200);
    expect(typeof data.tokenSet).toBe('boolean');
    expect(Object.keys(data).filter(k => /token|jeton|secret/i.test(k))).toEqual(['tokenSet']);
    // Aucune valeur ressemblant à un jeton Asana (« 1/123… » ou « 2/… »)
    expect(JSON.stringify(data)).not.toMatch(/\d\/\d{6,}/);
});

Given("une localisation SAMU-SAS de test existe pour l'import CSV", async ({ monde }) => {
    monde.d.localisation = await creerLocalisation(monde, { prefixe: 'SAMU-SAS 9' });
    monde.d.csvNo = monde.d.localisation.court.replace('SAMU-SAS ', '');
});

Given("un export CSV d'un projet Asana pour ce SAMU est disponible", async ({ monde }) => {
    const projet = `Déploiement E2E [SAMU ${monde.d.csvNo}]`;
    monde.d.csv = [
        'Name,Section/Column,Start Date,Due Date,Parent task,Projects',
        `"Démarrage projet auprès de l'ES",,,2031-01-13,,"${projet}"`,
        `2.9 Fin du cadrage,,2031-02-03,2031-02-14,,"${projet}"`,
        `Mise en service du bandeau,,,2031-04-08,,"${projet}"`,
        `5.1 Visite métier,,2031-03-10,2031-03-11,,"${projet}"`
    ].join('\n');
});

When("l'administrateur importe le fichier CSV", async ({ monde }) => {
    const api = await adminApi(monde);
    monde.d.apercu = await api.ok('POST', '/api/affectation/import/asana-csv', { csv: monde.d.csv });
    monde.d.rubriques = monde.d.apercu.rows
        .filter((/** @type {any} */ r) => r.status === 'nouveau')
        .map((/** @type {any} */ r) => r.key);
    const applique = await api.ok('POST', '/api/affectation/import/asana-csv/apply', {
        csv: monde.d.csv,
        apply: monde.d.rubriques
    });
    monde.d.importe = applique;
    await suivreDeploiement(monde, { id: applique.id, samu_name: applique.samu_name });
});

Then("l'aperçu propose les dates du projet avant import", async ({ monde }) => {
    expect(monde.d.apercu).toMatchObject({ locationFound: true, existing: null });
    expect(monde.d.rubriques).toEqual(
        expect.arrayContaining(['date_debut', 'cadrage', 'mise_en_service', 'visite_metier'])
    );
});

Then("le déploiement est créé à partir du CSV, marqué « repris d'Asana »", async ({ monde }) => {
    expect(monde.d.importe).toMatchObject({ success: true, created: true, date_debut: '2031-01-13' });
    expect(await lireDeploiement(monde, monde.d.importe.id)).toMatchObject({
        from_asana: true,
        date_mise_en_service: '2031-04-08'
    });
});

When("l'administrateur importe une deuxième fois le même fichier CSV", async ({ monde }) => {
    monde.d.apercu2 = await (
        await adminApi(monde)
    ).ok('POST', '/api/affectation/import/asana-csv', { csv: monde.d.csv });
});

Then("l'aperçu indique « identique » pour les dates déjà reprises", async ({ monde }) => {
    expect(monde.d.apercu2.existing?.id).toBe(monde.d.importe.id);
    for (const key of monde.d.rubriques) {
        expect(monde.d.apercu2.rows.find((/** @type {any} */ r) => r.key === key)?.status, key).toBe('identique');
    }
});

Then("aucun doublon de déploiement n'est créé", async ({ monde }) => {
    const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
    expect(projects.filter((/** @type {any} */ p) => p.samu_name === monde.d.importe.samu_name)).toHaveLength(1);
});

When("l'administrateur charge la liste des projets Asana", async ({ monde, $test }) => {
    $test.skip(!config.asanaEnabled, 'Jeu de données Asana non disponible (E2E_ASANA_ENABLED)');
    const api = await adminApi(monde);
    monde.d.asanaConfig = await api.ok('GET', '/api/affectation/asana/config');
    monde.d.projetsAsana = await api.ok('GET', '/api/affectation/asana/projects');
});

Then("seuls les projets de l'équipe « SAMU - Bandeau de communication » sont proposés", async ({ monde }) => {
    expect(monde.d.asanaConfig.teamName).toContain('Bandeau de communication');
    const filtre = new RegExp(monde.d.asanaConfig.nameFilter, 'i');
    for (const p of monde.d.projetsAsana.projects) expect(p.name).toMatch(filtre);
});

Given("un déploiement repris d'Asana existe", async ({ monde, $test }) => {
    $test.skip(!config.asanaEnabled, 'Jeu de données Asana non disponible (E2E_ASANA_ENABLED)');
    const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
    const dep = projects.find((/** @type {any} */ p) => p.from_asana);
    $test.skip(!dep, "Aucun déploiement repris d'Asana");
    monde.d.deploiementAsana = dep;
});

When("l'administrateur rafraîchit tous les déploiements depuis Asana", async ({ monde }) => {
    monde.d.rafraichissement = await (await adminApi(monde)).ok('POST', '/api/affectation/asana/refresh-all', {});
});

Then('chaque SAMU est listé avec ses dates avant \\/ après, « déjà à jour » ou son erreur', async ({ monde }) => {
    const r = monde.d.rafraichissement;
    expect(r.updated.length + r.unchanged.length + r.noMatch.length + r.errors.length).toBe(r.total);
    for (const u of r.updated) expect(Array.isArray(u.changes), JSON.stringify(u)).toBe(true);
    for (const e of r.errors) expect(e.error, JSON.stringify(e)).toBeTruthy();
});

When("l'administrateur ouvre les tâches du projet Asana de ce déploiement", async ({ monde }) => {
    monde.d.tachesAsana = await (
        await adminApi(monde)
    ).ok('GET', `/api/affectation/projects/${monde.d.deploiementAsana.id}/asana-tasks`);
});

Then('chaque rubrique indique sa règle de reprise, sa valeur Asana et sa valeur actuelle', async ({ monde }) => {
    for (const r of monde.d.tachesAsana.rubriques) {
        expect(r.rule, r.key).toBeTruthy();
        expect(r, r.key).toHaveProperty('auto');
        expect(r, r.key).toHaveProperty('current');
    }
});
