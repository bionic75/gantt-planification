// @ts-check
// Événements, types d'événements, lien avec les activités des déploiements, carte des événements
import { expect } from '@playwright/test';
import {
    adminApi,
    creerEvenement,
    creerLocalisation,
    creerTypeEvenement,
    lireEvenement,
    PARIS,
    ressourceExpert,
    suivreEvenement
} from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const PERIODES = /** @type {Record<string, string>} */ ({ matin: 'AM', 'après-midi': 'PM', journée: 'FULL' });

/** Création par l'administrateur ; l'identifiant de l'événement créé est mémorisé (et supprimé en fin de scénario) */
async function adminCree(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ body) {
    const api = await adminApi(monde);
    monde.reponse = await api.post('/api/custom-events', body);
    if (monde.reponse.status === 200) {
        monde.d.evenement = monde.reponse.data.eventId;
        await suivreEvenement(monde, monde.d.evenement);
    }
}

const evenementCree = async (/** @type {Monde} */ monde) => {
    expect(monde.d.evenement, 'aucun événement créé').toBeTruthy();
    const e = await lireEvenement(monde, monde.d.evenement);
    expect(e, `événement ${monde.d.evenement} introuvable`).toBeTruthy();
    return e;
};

const config = (/** @type {any} */ e) => (typeof e.config === 'string' ? JSON.parse(e.config || '{}') : e.config || {});

Given("un type d'événement de test existe", async ({ monde }) => {
    monde.d.type = await creerTypeEvenement(monde);
});

Given('une localisation SAMU de test géolocalisée existe', async ({ monde }) => {
    monde.d.localisation = await creerLocalisation(monde, { geo: true });
});

When(
    "l'administrateur crée un événement de ce type sur cette localisation du {string} au {string} avec {string} en participant",
    async ({ monde }, debut, fin, profil) => {
        const { userId } = await monde.sessionDe(profil);
        await adminCree(monde, {
            startDate: debut,
            endDate: fin,
            label: monde.unique('Évt E2E'),
            type_id: monde.d.type.id,
            location_id: monde.d.localisation.id,
            participants: [userId]
        });
    }
);

Then("l'événement créé porte le type, l'icône et les couleurs du type d'événement", async ({ monde }) => {
    const e = await evenementCree(monde);
    const t = monde.d.type;
    expect(e.type_id).toBe(t.id);
    expect(e.type_long).toBe(t.label_long);
    const types = (await (await adminApi(monde)).ok('GET', '/api/event-types')).types;
    expect(types.find((/** @type {any} */ x) => x.id === t.id)?.icon).toBe(t.icon);
    expect(config(e)).toMatchObject({ bgColor: t.bg_color, textColor: t.text_color, borderColor: t.border_color });
});

Then("l'événement créé est rattaché à la localisation", async ({ monde }) => {
    expect((await evenementCree(monde)).location_id).toBe(monde.d.localisation.id);
});

Then("l'événement créé a {string} pour participant", async ({ monde }, profil) => {
    const { userId } = await monde.sessionDe(profil);
    const e = await evenementCree(monde);
    expect(e.participants.map((/** @type {any} */ p) => p.user_id)).toContain(userId);
});

Then("l'événement créé n'a plus de participant", async ({ monde }) => {
    expect((await evenementCree(monde)).participants).toEqual([]);
});

When("l'administrateur crée un événement sans libellé", async ({ monde }) => {
    await adminCree(monde, { startDate: '2031-05-01' });
});

When("l'administrateur crée un événement sans date de début", async ({ monde }) => {
    await adminCree(monde, { label: monde.unique('Évt E2E') });
});

When(
    "l'administrateur crée un événement d'un seul jour le {string} sur la période {string}",
    async ({ monde }, date, periode) => {
        await adminCree(monde, {
            startDate: date,
            endDate: date,
            period: PERIODES[periode],
            label: monde.unique('Évt E2E')
        });
    }
);

When(
    "l'administrateur crée un événement du {string} au {string} sur la période {string}",
    async ({ monde }, debut, fin, periode) => {
        await adminCree(monde, {
            startDate: debut,
            endDate: fin,
            period: PERIODES[periode],
            label: monde.unique('Évt E2E')
        });
    }
);

Then("l'événement créé a la période {string}", async ({ monde }, periode) => {
    expect((await evenementCree(monde)).period).toBe(periode);
});

// ---------- Créateur ----------

Given("{string} a créé un événement de test aujourd'hui", async ({ monde }, profil) => {
    const api = await monde.apiDe(profil);
    const label = monde.unique('Évt E2E');
    const r = await api.post('/api/my-custom-events', { startDate: new Date().toISOString().slice(0, 10), label });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    monde.d.evenement = r.data.eventId;
    monde.d.libelleEvenement = label;
    await suivreEvenement(monde, r.data.eventId);
});

When("l'administrateur consulte cet événement", async ({ monde }) => {
    monde.d.evt = await evenementCree(monde);
});

Then("l'événement indique son créateur {string} et sa date de création", async ({ monde }, profil) => {
    const s = await monde.sessionDe(profil);
    expect(monde.d.evt.created_by).toBe(s.userId);
    expect(monde.d.evt.creator_prenom).toBe(s.prenom);
    expect(monde.d.evt.created_at, 'date de création absente').toBeTruthy();
});

Then(
    'la mention « Créé le JJ\\/MM\\/AAAA HH:MM par » du créateur {string} est affichée pour cet événement',
    async ({ monde }, profil) => {
        const s = await monde.sessionDe(profil);
        const page = monde.page;
        const bloc = page
            .locator('#evenements *', { hasText: monde.d.libelleEvenement })
            .filter({ hasText: /Créé le \d{2}\/\d{2}\/\d{4} (à )?\d{2}[:h]\d{2} par/ })
            .last();
        await expect(bloc).toBeVisible({ timeout: 20000 });
        await expect(bloc).toContainText(s.prenom);
    }
);

// ---------- Types d'événements ----------

When(
    "l'administrateur crée un type d'événement avec un libellé long, un libellé court, l'icône {string} et les couleurs {string}, {string}, {string}",
    async ({ monde }, icon, bg, text, border) => {
        const api = await adminApi(monde);
        const body = {
            label_long: monde.unique('Type E2E'),
            label_short: 'E2E',
            icon,
            bg_color: bg,
            text_color: text,
            border_color: border
        };
        monde.reponse = await api.post('/api/event-types', body);
        if (monde.reponse.status === 200) {
            monde.d.type = { id: monde.reponse.data.id, ...body };
            monde.aNettoyer(`type ${body.label_long}`, () => api.delete(`/api/event-types/${monde.d.type.id}`));
        }
    }
);

Then("le type d'événement apparaît dans la liste des types", async ({ monde }) => {
    const types = (await (await adminApi(monde)).ok('GET', '/api/event-types')).types;
    expect(types.find((/** @type {any} */ t) => t.id === monde.d.type.id)).toMatchObject({
        label_long: monde.d.type.label_long,
        label_short: monde.d.type.label_short,
        icon: monde.d.type.icon
    });
});

When("l'administrateur crée un événement de ce type le {string}", async ({ monde }, date) => {
    await adminCree(monde, { startDate: date, label: monde.unique('Évt E2E'), type_id: monde.d.type.id });
});

Then(
    "l'événement créé est affiché avec les couleurs {string}, {string}, {string}",
    async ({ monde }, bg, text, border) => {
        expect(config(await evenementCree(monde))).toMatchObject({
            bgColor: bg.toLowerCase(),
            textColor: text.toLowerCase(),
            borderColor: border.toLowerCase()
        });
    }
);

When("l'administrateur crée un type d'événement avec le même libellé long en majuscules", async ({ monde }) => {
    const t = monde.d.type;
    monde.reponse = await (
        await adminApi(monde)
    ).post('/api/event-types', { ...t, id: undefined, label_long: t.label_long.toUpperCase() });
});

const typeAutre = async (/** @type {Monde} */ monde) =>
    (await (await adminApi(monde)).ok('GET', '/api/event-types')).types.find(
        (/** @type {any} */ t) => t.is_other || t.code === 'autre'
    );

When("l'administrateur tente de modifier le type « Autre »", async ({ monde }) => {
    const autre = await typeAutre(monde);
    monde.reponse = await (
        await adminApi(monde)
    ).put(`/api/event-types/${autre.id}`, {
        label_long: 'Renommé E2E',
        bg_color: '#000000',
        text_color: '#ffffff',
        border_color: '#000000'
    });
});

When("l'administrateur tente de supprimer le type « Autre »", async ({ monde }) => {
    const autre = await typeAutre(monde);
    monde.reponse = await (await adminApi(monde)).delete(`/api/event-types/${autre.id}`);
});

When("l'administrateur crée un événement d'un type inexistant le {string}", async ({ monde }, date) => {
    await adminCree(monde, { startDate: date, label: monde.unique('Évt E2E'), type_id: 999999 });
});

Then("l'événement créé est du type « Autre »", async ({ monde }) => {
    const autre = await typeAutre(monde);
    expect((await evenementCree(monde)).type_id).toBe(autre.id);
});

// ---------- Lien avec les déploiements ----------

Given("l'expert de test est affecté à la visite métier du déploiement", async ({ monde }) => {
    const { resourceId } = await ressourceExpert(monde);
    const r = await (
        await adminApi(monde)
    ).put(`/api/affectation/projects/${monde.d.deploiement.id}/assignments/visite_metier`, {
        resource_ids: [resourceId]
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
});

async function evenementDepuisDeploiement(/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ body) {
    const api = await adminApi(monde);
    monde.reponse = await api.post(`/api/affectation/projects/${monde.d.deploiement.id}/event-create`, body);
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
    await suivreEvenement(monde, monde.reponse.data.eventId);
    (monde.d.evenementsLies ||= []).push(monde.reponse.data.eventId);
    return monde.reponse.data.eventId;
}

/** Événement de la visite métier, aux dates de l'activité du déploiement */
async function evenementVisite(/** @type {Monde} */ monde) {
    const { projects } = await (await adminApi(monde)).ok('GET', '/api/affectation/projects');
    const [visite] = projects.find((/** @type {any} */ p) => p.id === monde.d.deploiement.id).periods.visite_metier;
    monde.d.evenement = await evenementDepuisDeploiement(monde, {
        key: 'visite_metier',
        start: visite.start,
        end: visite.end
    });
    monde.d.evenementVisite = monde.d.evenement;
}

When("l'administrateur crée l'événement de la visite métier depuis le déploiement", async ({ monde }) => {
    await evenementVisite(monde);
});

Given("l'administrateur a créé l'événement de la visite métier depuis le déploiement", async ({ monde }) => {
    await evenementVisite(monde);
});

Given(
    "l'administrateur a créé l'événement de la mise en service le {string} depuis le déploiement",
    async ({ monde }, date) => {
        await evenementDepuisDeploiement(monde, { key: 'mise_en_service', start: date });
    }
);

When("l'administrateur retire {string} des participants de l'événement", async ({ monde }, profil) => {
    const { userId } = await monde.sessionDe(profil);
    const e = await evenementCree(monde);
    monde.reponse = await (
        await adminApi(monde)
    ).put(`/api/my-custom-events/${e.id}`, {
        startDate: e.start_date,
        endDate: e.end_date,
        label: e.label,
        period: e.period,
        type_id: e.type_id,
        location_id: e.location_id,
        participants: e.participants
            .map((/** @type {any} */ p) => p.user_id)
            .filter((/** @type {number} */ id) => id !== userId)
    });
    expect(monde.reponse.status, JSON.stringify(monde.reponse.data)).toBe(200);
});

When("l'administrateur supprime l'événement", async ({ monde }) => {
    monde.reponse = await (await adminApi(monde)).delete(`/api/my-custom-events/${monde.d.evenement}`);
});

Then("l'événement n'existe plus", async ({ monde }) => {
    expect(await lireEvenement(monde, monde.d.evenement)).toBeUndefined();
});

Then("l'activité visite métier du déploiement n'est plus reliée à un événement", async ({ monde }) => {
    const { candidates } = await (
        await adminApi(monde)
    ).ok('GET', `/api/affectation/projects/${monde.d.deploiement.id}/events-candidates`);
    expect(candidates.visite_metier?.linked ?? null).not.toBe(monde.d.evenement);
});

Given("l'administrateur a créé un événement de test le {string}", async ({ monde }, date) => {
    monde.d.evenement = await creerEvenement(monde, { startDate: date });
});

When('{string} tente de supprimer cet événement', async ({ monde }, profil) => {
    monde.reponse = await (await monde.apiDe(profil)).delete(`/api/my-custom-events/${monde.d.evenement}`);
});

// ---------- Carte des événements ----------

Given("l'administrateur a créé un événement de ce type sur cette localisation le {string}", async ({ monde }, date) => {
    monde.d.evenement = await creerEvenement(monde, {
        startDate: date,
        type_id: monde.d.type.id,
        location_id: monde.d.localisation.id
    });
});

When('{string} consulte la carte des événements de juin 2031', async ({ monde }, profil) => {
    monde.reponse = await (
        await monde.apiDe(profil)
    ).get('/api/reporting/events-map?startDate=2031-06-01&endDate=2031-06-30');
    expect(monde.reponse.status).toBe(200);
});

Then("l'événement créé figure sur la carte avec ses coordonnées et son type", async ({ monde }) => {
    const e = monde.reponse?.data.events.find((/** @type {any} */ x) => x.id === monde.d.evenement);
    expect(e, 'événement absent de la carte').toBeTruthy();
    expect(e.latitude).toBeCloseTo(PARIS.latitude, 3);
    expect(e.longitude).toBeCloseTo(PARIS.longitude, 3);
    expect(e.type_short ?? e.type_long).toBe(monde.d.type.label_short);
});
