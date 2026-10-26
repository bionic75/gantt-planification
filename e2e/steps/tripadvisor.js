// @ts-check
// SAMU-SAS TripAdVisor : lieux, notes, commentaires, droits, filtres, trajets, échappement des saisies
import { expect } from '@playwright/test';
import { adminApi, creerLieu, creerLocalisation } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

Given('un SAMU-SAS de test géolocalisé existe', async ({ monde }) => {
    monde.d.samuSas = await creerLocalisation(monde, { geo: true, prefixe: 'SAS 9' });
});

const lieuOk = (/** @type {Monde} */ monde) =>
    expect(monde.reponse?.status, JSON.stringify(monde.reponse?.data)).toBe(200);

const detail = async (/** @type {Monde} */ monde, /** @type {string} */ profil = 'Administrateur') =>
    await (await monde.apiDe(profil)).get(`/api/poi/${monde.d.lieu.id}`);

/** Corps complet d'un lieu pour une modification */
const corpsLieu = async (/** @type {Monde} */ monde, /** @type {Record<string, unknown>} */ changements) => {
    const { poi } = (await detail(monde)).data;
    return {
        category: poi.category,
        name: poi.name,
        location_id: poi.location_id,
        address: poi.address,
        latitude: poi.latitude,
        longitude: poi.longitude,
        comment: poi.comment,
        ...changements
    };
};

// ---------- Ajout ----------

When(
    '{string} ajoute un lieu {string} nommé {string} au {string} avec ses coordonnées',
    async ({ monde }, profil, categorie, nom, adresse) => {
        await creerLieu(monde, profil, { category: categorie, name: nom, address: adresse });
        monde.d.createurLieu = profil;
    }
);

When(
    "{string} ajoute un lieu {string} nommé {string} avec la référence OpenStreetMap d'un restaurant",
    async ({ monde }, profil, categorie, nom) => {
        await creerLieu(monde, profil, { category: categorie, name: nom, osm_ref: 'node/1234567890' });
        lieuOk(monde);
    }
);

When('{string} ajoute un lieu sans typologie', async ({ monde }, profil) => {
    await creerLieu(monde, profil, { category: undefined });
});

When(
    "{string} ajoute un lieu {string} nommé {string} à l'adresse {string} sans coordonnées",
    async ({ monde }, profil, categorie, nom, adresse) => {
        await creerLieu(monde, profil, {
            category: categorie,
            name: nom,
            address: adresse,
            latitude: null,
            longitude: null
        });
    }
);

Given('{string} a ajouté un lieu de test', async ({ monde }, profil) => {
    await creerLieu(monde, profil, {});
    lieuOk(monde);
    monde.d.createurLieu = profil;
});

Given('{string} a ajouté un lieu {string} nommé {string}', async ({ monde }, profil, categorie, nom) => {
    await creerLieu(monde, profil, { category: categorie, name: nom });
    lieuOk(monde);
});

Given(
    '{string} a ajouté un lieu {string} nommé {string} commenté {string}',
    async ({ monde }, profil, categorie, nom, commentaire) => {
        await creerLieu(monde, profil, { category: categorie, name: nom, comment: commentaire });
        lieuOk(monde);
    }
);

Then('le lieu est géolocalisé et rattaché au SAMU-SAS de test', async ({ monde }) => {
    const { poi } = (await detail(monde)).data;
    expect(poi.location_id).toBe(monde.d.samuSas.id);
    expect(poi.latitude).not.toBeNull();
    expect(poi.longitude).not.toBeNull();
});

Then('le lieu indique son créateur {string} et son horodatage', async ({ monde }, profil) => {
    const s = await monde.sessionDe(profil);
    const { poi } = (await detail(monde)).data;
    expect(poi.creator).toBe(`${s.prenom} ${String(s.nom).toUpperCase()}`);
    expect(poi.created_at, 'horodatage de création absent').toBeTruthy();
});

const nomsFiltres = async (/** @type {Monde} */ monde, /** @type {string} */ requete = '') => {
    const { pois } = await (await adminApi(monde)).ok('GET', `/api/poi?location_id=${monde.d.samuSas.id}${requete}`);
    return pois.map((/** @type {any} */ p) => p.name).sort();
};

Then('le lieu apparaît dans la liste des lieux du SAMU-SAS', async ({ monde }) => {
    const { pois } = await (await adminApi(monde)).ok('GET', `/api/poi?location_id=${monde.d.samuSas.id}`);
    expect(pois.map((/** @type {any} */ p) => p.id)).toContain(monde.d.lieu.id);
});

When("j'affiche les lieux du SAMU-SAS de test", async ({ monde }) => {
    const page = monde.page;
    await expect(page.locator('#trLoc')).toBeVisible({ timeout: 20000 });
    await page.locator('#trLoc').selectOption(String(monde.d.samuSas.id));
    await expect(page.locator(`#trCard_${monde.d.lieu.id}`)).toBeVisible();
});

Then("le lieu {string} est affiché dans l'onglet", async ({ monde }, nom) => {
    const page = monde.page;
    await expect(page.locator('#trLoc')).toBeVisible({ timeout: 20000 });
    await page.locator('#trLoc').selectOption(String(monde.d.samuSas.id));
    await expect(page.locator(`#trCard_${monde.d.lieu.id}`)).toContainText(nom);
});

Then('le lieu a la typologie {string}', async ({ monde }, categorie) => {
    expect((await detail(monde)).data.poi.category).toBe(categorie);
});

// ---------- Suggestions OpenStreetMap ----------

When('{string} recherche le lieu {string} près du SAMU-SAS de test', async ({ monde }, profil, q) => {
    monde.d.suggestions = await (
        await monde.apiDe(profil)
    ).ok('GET', `/api/poi/places?q=${encodeURIComponent(q)}&location_id=${monde.d.samuSas.id}`);
});

Then('des suggestions avec nom, adresse et coordonnées sont proposées', async ({ monde }) => {
    const { places } = monde.d.suggestions;
    expect(places.length).toBeGreaterThan(0);
    for (const p of places) {
        expect(p.name).toBeTruthy();
        expect(Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).toBe(true);
        expect(p).toHaveProperty('address');
    }
});

Then("aucune suggestion n'est proposée", async ({ monde }) => {
    expect(monde.d.suggestions.places).toEqual([]);
});

// ---------- Droits ----------

When(/^"([^"]+)" (?:tente de modifier|renomme) ce lieu(?: en "([^"]+)")?$/, async ({ monde }, profil, nom) => {
    const body = await corpsLieu(monde, { name: nom || 'Tentative E2E' });
    monde.reponse = await (await monde.apiDe(profil)).put(`/api/poi/${monde.d.lieu.id}`, body);
});

When(/^"([^"]+)" (?:tente de supprimer|supprime) ce lieu$/, async ({ monde }, profil) => {
    monde.reponse = await (await monde.apiDe(profil)).delete(`/api/poi/${monde.d.lieu.id}`);
});

Then("le lieu n'existe plus", async ({ monde }) => {
    expect((await detail(monde)).status).toBe(404);
});

// ---------- Notes ----------

When(/^"([^"]+)" note ce lieu (-?\d+)$/, async ({ monde }, profil, note) => {
    monde.reponse = await (
        await monde.apiDe(profil)
    ).put(`/api/poi/${monde.d.lieu.id}/rating`, { rating: Number(note) });
});

Then('le lieu a une moyenne de {float} pour {int} note(s)', async ({ monde }, moyenne, n) => {
    const { poi } = (await detail(monde)).data;
    expect(poi.avg_rating).toBe(moyenne);
    expect(poi.n_ratings).toBe(n);
});

When('{string} supprime la note de {string}', async ({ monde }, profil, auteur) => {
    const { userId } = await monde.sessionDe(auteur);
    monde.reponse = await (await monde.apiDe(profil)).delete(`/api/poi/${monde.d.lieu.id}/rating?user_id=${userId}`);
});

// ---------- Commentaires ----------

async function commenter(/** @type {Monde} */ monde, /** @type {string} */ profil, /** @type {string} */ texte) {
    monde.reponse = await (await monde.apiDe(profil)).post(`/api/poi/${monde.d.lieu.id}/comments`, { text: texte });
    lieuOk(monde);
    (monde.d.commentaires ||= {})[profil] = monde.reponse.data.id;
}

Given("{string} a noté ce lieu {int} et l'a commenté", async ({ monde }, profil, note) => {
    const api = await monde.apiDe(profil);
    expect((await api.put(`/api/poi/${monde.d.lieu.id}/rating`, { rating: note })).status).toBe(200);
    await commenter(monde, profil, `Avis E2E de ${profil}`);
});

Given('{string} a commenté ce lieu {string}', async ({ monde }, profil, texte) => {
    await commenter(monde, profil, texte);
});

When('{string} commente ce lieu {string}', async ({ monde }, profil, texte) => {
    await commenter(monde, profil, texte);
});

When('{string} modifie son commentaire en {string}', async ({ monde }, profil, texte) => {
    monde.reponse = await (
        await monde.apiDe(profil)
    ).put(`/api/poi/comments/${monde.d.commentaires[profil]}`, { text: texte });
});

When('{string} tente de modifier le commentaire de {string}', async ({ monde }, profil, auteur) => {
    monde.reponse = await (
        await monde.apiDe(profil)
    ).put(`/api/poi/comments/${monde.d.commentaires[auteur]}`, { text: 'Tentative E2E' });
});

When(/^"([^"]+)" (?:tente de supprimer|supprime) le commentaire de "([^"]+)"$/, async ({ monde }, profil, auteur) => {
    monde.reponse = await (await monde.apiDe(profil)).delete(`/api/poi/comments/${monde.d.commentaires[auteur]}`);
});

When('{string} supprime son commentaire', async ({ monde }, profil) => {
    monde.reponse = await (await monde.apiDe(profil)).delete(`/api/poi/comments/${monde.d.commentaires[profil]}`);
});

Then('chaque commentaire affiche ses dates de création et de modification', async ({ monde }) => {
    const { comments } = (await detail(monde)).data;
    expect(comments.length).toBeGreaterThan(0);
    for (const c of comments) expect(c.created_at, JSON.stringify(c)).toBeTruthy();
    const modifie = comments.find((/** @type {any} */ c) => c.id === monde.d.commentaires.Utilisateur);
    expect(modifie?.updated_at, 'date de modification absente').toBeTruthy();
});

Then('les notes et commentaires du lieu ont été supprimés', async ({ monde }) => {
    const api = await adminApi(monde);
    for (const id of Object.values(monde.d.commentaires || {})) {
        expect((await api.delete(`/api/poi/comments/${id}`)).status, `commentaire ${id}`).toBe(404);
    }
});

// ---------- Filtres ----------

const liste = (/** @type {string} */ s) =>
    s
        .split(',')
        .map(x => x.trim())
        .sort();

Then('le filtre SAMU-SAS donne {string}', async ({ monde }, noms) => {
    expect(await nomsFiltres(monde)).toEqual(liste(noms));
});

Then('le filtre créateur {string} donne {string}', async ({ monde }, profil, noms) => {
    const { userId } = await monde.sessionDe(profil);
    expect(await nomsFiltres(monde, `&creator=${userId}`)).toEqual(liste(noms));
});

Then('le filtre typologie {string} donne {string}', async ({ monde }, categorie, noms) => {
    expect(await nomsFiltres(monde, `&category=${categorie}`)).toEqual(liste(noms));
});

Then('la recherche {string} donne {string}', async ({ monde }, q, noms) => {
    expect(await nomsFiltres(monde, `&q=${encodeURIComponent(q)}`)).toEqual(liste(noms));
});

Then(
    'le filtre combiné créateur {string} et typologie {string} ne donne aucun lieu',
    async ({ monde }, profil, categorie) => {
        const { userId } = await monde.sessionDe(profil);
        expect(await nomsFiltres(monde, `&creator=${userId}&category=${categorie}`)).toEqual([]);
    }
);

Then(
    'les compteurs par typologie du SAMU-SAS indiquent {int} {string} et {int} {string}',
    async ({ monde }, n1, c1, n2, c2) => {
        const meta = await (await adminApi(monde)).ok('GET', '/api/poi/meta');
        const compteurs = meta.counts[monde.d.samuSas.id] || {};
        expect(compteurs[c1]).toBe(n1);
        expect(compteurs[c2]).toBe(n2);
    }
);

// ---------- Trajets ----------

When('{string} demande le trajet de ce lieu vers le SAMU-SAS', async ({ monde }, profil) => {
    monde.reponse = await (await monde.apiDe(profil)).get(`/api/poi/${monde.d.lieu.id}/route`);
});

Then(
    "le trajet est calculé pour les modes {string}, {string} et {string}, avec durée et distance ou un message d'indisponibilité",
    async ({ monde }, m1, m2, m3) => {
        const { modes } = monde.reponse?.data || {};
        for (const m of [m1, m2, m3]) {
            const r = modes[m];
            expect(r, `mode ${m} absent`).toBeTruthy();
            if (!r.error) {
                const detail = `mode ${m} : ${JSON.stringify(r).slice(0, 200)}`;
                expect(r.duration, detail).toBeGreaterThan(0);
                // Transports en commun : durée, lignes et correspondances ; autres modes : durée et distance
                if (m === 'transit') expect(Array.isArray(r.legs) && r.legs.length > 0, detail).toBe(true);
                else expect(Object.keys(r).join(' '), detail).toMatch(/dist/i);
            }
        }
        expect(
            Object.values(modes).some((/** @type {any} */ r) => !r.error),
            'aucun mode de trajet disponible'
        ).toBe(true);
    }
);

Given('le SAMU-SAS de test perd sa géolocalisation', async ({ monde }) => {
    const s = monde.d.samuSas;
    const r = await (
        await adminApi(monde)
    ).put(`/api/locations/${s.id}`, {
        libelle_long: s.long,
        libelle_court: s.court,
        adresse: '1 place du Test, Paris',
        latitude: null,
        longitude: null
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
});

// ---------- Échappement ----------

Then('le texte {string} est affiché tel quel', async ({ monde }, texte) => {
    await expect(monde.page.locator(`#trCard_${monde.d.lieu.id}`)).toContainText(texte);
});

Then("aucun script injecté n'a été exécuté", async ({ monde }) => {
    await monde.page.waitForTimeout(1000);
    expect(await monde.page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
    expect(monde.dialogues).toEqual([]);
});
