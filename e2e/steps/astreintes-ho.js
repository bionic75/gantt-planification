// @ts-check
// Astreintes › rubrique HO (écran) : droits, navigation, inscriptions sur les demi-journées, astreinte HO ANS,
// enregistrement
import { expect } from '@playwright/test';
import { adminApi, lireRessource, ressourceExpert } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { annulerConfirmation, confirmer } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const MOIS = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre'
];
const MOIS_TESTE = '2031-03';
const majuscule = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
const echapper = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** « mars 2031 » → indice de mois absolu (année × 12 + mois) */
function indiceMois(/** @type {string} */ libelle) {
    const [mois, annee] = libelle.toLowerCase().trim().split(/\s+/);
    const i = MOIS.indexOf(/** @type {string} */ (mois));
    if (i < 0) throw new Error(`Mois inconnu : ${libelle}`);
    return Number(annee) * 12 + i;
}

const etiquetteMois = (/** @type {Monde} */ monde) => monde.page.locator('#hoMonthLabel');
const grille = (/** @type {Monde} */ monde) => monde.page.locator('#hoGrid');
const boutonEnregistrer = (/** @type {Monde} */ monde) => monde.page.locator('#hoSaveBtn');
const fenetreEnregistrement = (/** @type {Monde} */ monde) => monde.page.locator('#hoSaveModal');

/** Demi-journée : « mardi 04/03/2031 » et « matin » ou « après-midi » (début de son titre) */
const demiJournee = (/** @type {Monde} */ monde, /** @type {string} */ jour, /** @type {string} */ periode) =>
    grille(monde).locator(`[title^="${jour} — ${periode}"]`);

/** Astreinte HO ANS d'un jour : « jeudi 06/03/2031 » ou « 06/03/2031 » */
const jourAns = (/** @type {Monde} */ monde, /** @type {string} */ jour) =>
    grille(monde).locator(`[title^="Astreinte HO ANS — ${jour.split(' ').pop()}"]`);

/** Ressource de l'expert de test : identifiant, nom affiché (« Prénom NOM ») et trigramme */
async function expertHo(/** @type {Monde} */ monde) {
    const { resourceId } = await ressourceExpert(monde);
    const r = await lireRessource(monde, resourceId);
    return { id: resourceId, nom: `${r.prenom} ${String(r.nom).toUpperCase()}`, trigramme: r.trigramme };
}

/** Compte de test : identifiant et nom affiché (« Prénom NOM ») */
async function compte(/** @type {Monde} */ monde, /** @type {string} */ profil) {
    const s = await monde.sessionDe(profil);
    return {
        id: /** @type {number} */ (s.userId),
        nom: `${s.prenom} ${String(s.nom || '').toUpperCase()}`,
        complet: `${s.prenom} ${s.nom}`
    };
}

const moisHo = async (/** @type {Monde} */ monde, /** @type {string} */ mois) =>
    (await adminApi(monde)).ok('GET', `/api/astreintes-ho?month=${mois}`);

// ---------- Données ----------

Given("la ressource de l'expert de test participe aux astreintes HO", async ({ monde }) => {
    const { resourceId } = await ressourceExpert(monde);
    if ((await lireRessource(monde, resourceId)).astreinte_ho === 1) return;
    const api = await adminApi(monde);
    await api.ok('POST', `/api/resources/${resourceId}/astreinte`, { type: 'ho', hasAccess: true });
    monde.aNettoyer("astreintes HO de l'expert de test", () =>
        api.post(`/api/resources/${resourceId}/astreinte`, { type: 'ho', hasAccess: false })
    );
});

Given('le compte {string} de test est déclaré « Astreinte HO ANS »', async ({ monde }, profil) => {
    const { id } = await compte(monde, profil);
    const api = await adminApi(monde);
    const u = (await api.ok('GET', '/api/users')).find((/** @type {any} */ x) => x.id === id);
    if (u?.astreinte_ho_ans === 1) return;
    await api.ok('POST', `/api/users/${id}/astreinte-ho-ans`, { hasAccess: true });
    monde.aNettoyer(`astreinte HO ANS du compte ${profil}`, () =>
        api.post(`/api/users/${id}/astreinte-ho-ans`, { hasAccess: false })
    );
});

/** Inscriptions de l'expert de test et désignations ANS des comptes de test retirées du mois testé */
Given('le planning HO de mars 2031 sera remis en état après le scénario', async ({ monde }) => {
    const { resourceId } = await ressourceExpert(monde);
    const comptes = [];
    for (const profil of ['Utilisateur', 'Expert', 'Administrateur']) comptes.push((await compte(monde, profil)).id);
    monde.aNettoyer('planning HO de mars 2031', async () => {
        const d = await moisHo(monde, MOIS_TESTE);
        const changes = d.slots
            .filter((/** @type {any} */ s) => s.resource_id === resourceId)
            .map((/** @type {any} */ s) => ({
                date: s.date,
                period: s.period,
                resource_id: s.resource_id,
                action: 'remove'
            }));
        const jours = [
            ...new Set(
                d.ans.slots
                    .filter((/** @type {any} */ s) => comptes.includes(s.user_id))
                    .map((/** @type {any} */ s) => s.date)
            )
        ];
        const ansChanges = jours.map(date => ({
            date,
            user_ids: d.ans.slots
                .filter((/** @type {any} */ s) => s.date === date && !comptes.includes(s.user_id))
                .map((/** @type {any} */ s) => s.user_id)
        }));
        if (changes.length || ansChanges.length)
            await (await adminApi(monde)).ok('POST', '/api/astreintes-ho/save', { changes, ansChanges });
    });
});

Given(
    'le compte {string} de test est déjà désigné en astreinte HO ANS le {string}',
    async ({ monde }, profil, date) => {
        const { id } = await compte(monde, profil);
        await (await adminApi(monde)).ok('POST', '/api/astreintes-ho/save', { ansChanges: [{ date, user_ids: [id] }] });
    }
);

// ---------- Rubrique, droits, navigation ----------

Then('la rubrique HO présente les droits {string} et la légende', async ({ monde }, droits) => {
    await expect(monde.page.locator('#hoRights')).toContainText(droits);
    await expect(monde.page.locator('#hoLegend')).toContainText('Semaine en cours');
});

Then('la rubrique HO présente les droits {string}', async ({ monde }, droits) => {
    await expect(monde.page.locator('#hoRights')).toContainText(droits);
});

Then('la rubrique HNO est proposée', async ({ monde }) => {
    await expect(monde.page.locator('#astreinteSubTabHno')).toBeVisible();
});

Then("la rubrique HNO n'est pas proposée", async ({ monde }) => {
    await expect(monde.page.locator('#astreinteSubTabHo')).toBeVisible();
    await expect(monde.page.locator('#astreinteSubTabHno')).toBeHidden();
});

const navigation = (/** @type {Monde} */ monde, /** @type {string} */ titre) =>
    monde.page.locator('#astreintesGestion').getByTitle(titre, { exact: true });

When("j'affiche le mois de {string} dans les astreintes HO", async ({ monde }, mois) => {
    const libelle = etiquetteMois(monde);
    await expect(libelle).not.toHaveText('');
    const cible = indiceMois(mois);
    for (let i = 0; i < 240; i++) {
        const actuel = indiceMois((await libelle.textContent()) ?? '');
        if (actuel === cible) break;
        await navigation(monde, actuel < cible ? 'Mois suivant' : 'Mois précédent').click();
        await expect(libelle).not.toHaveText(new RegExp(`^${echapper(majuscule(MOIS[actuel % 12]))}`), {
            timeout: 10000
        });
    }
    await expect(libelle).toHaveText(majuscule(mois));
    await expect(grille(monde).locator('table')).toBeVisible();
});

When('je reviens au mois courant dans les astreintes HO', async ({ monde }) => {
    await monde.page.locator('#astreintesGestion').getByRole('button', { name: "Aujourd'hui", exact: true }).click();
});

When('je passe au mois précédent dans les astreintes HO', async ({ monde }) => {
    const avant = await etiquetteMois(monde).textContent();
    await navigation(monde, 'Mois précédent').click();
    await expect(etiquetteMois(monde)).not.toHaveText(avant ?? '');
});

When('je passe au mois suivant dans les astreintes HO et je refuse la confirmation', async ({ monde }) => {
    await annulerConfirmation(monde, () => navigation(monde, 'Mois suivant').click());
});

When('je passe au mois suivant dans les astreintes HO et je confirme', async ({ monde }) => {
    await confirmer(monde, () => navigation(monde, 'Mois suivant').click());
});

Then('le mois affiché dans les astreintes HO est {string}', async ({ monde }, mois) => {
    await expect(etiquetteMois(monde)).toHaveText(mois);
});

Then('la grille HO présente les semaines S10 à S14', async ({ monde }) => {
    const semaines = grille(monde).locator('tbody tr > th');
    await expect(semaines).toHaveCount(5);
    const textes = (await semaines.allTextContents()).map(t => t.trim().slice(0, 3));
    expect(textes).toEqual(['S10', 'S11', 'S12', 'S13', 'S14']);
});

Then('la grille HO présente le mois courant', async ({ monde }) => {
    const d = new Date();
    await expect(etiquetteMois(monde)).toHaveText(`${majuscule(MOIS[d.getMonth()])} ${d.getFullYear()}`);
});

// ---------- Inscriptions ----------

/** Ferme la fenêtre contextuelle (clic hors de la grille) */
const fermerChoix = (/** @type {Monde} */ monde) => etiquetteMois(monde).click();

When(/^j'inscris l'expert de test le "(.+)" (matin|après-midi)$/, async ({ monde }, jour, periode) => {
    const e = await expertHo(monde);
    await demiJournee(monde, jour, periode).click();
    await monde.page.getByRole('checkbox', { name: new RegExp(echapper(e.nom)) }).check();
    await fermerChoix(monde);
});

When(/^je retire l'expert de test le "(.+)" (matin|après-midi)$/, async ({ monde }, jour, periode) => {
    const e = await expertHo(monde);
    await demiJournee(monde, jour, periode).click();
    await monde.page.getByRole('checkbox', { name: new RegExp(echapper(e.nom)) }).uncheck();
    await fermerChoix(monde);
});

When(/^je clique sur la demi-journée du "(.+)" (matin|après-midi)$/, async ({ monde }, jour, periode) => {
    await demiJournee(monde, jour, periode).click();
});

When('je clique sur la première demi-journée affichée', async ({ monde }) => {
    await grille(monde).locator('[title*=" — matin"]').first().click();
});

Then(
    /^la demi-journée du "(.+)" (matin|après-midi) présente l'expert de test, non enregistré$/,
    async ({ monde }, jour, periode) => {
        const e = await expertHo(monde);
        await expect(demiJournee(monde, jour, periode)).toContainText(e.trigramme);
        await expect(boutonEnregistrer(monde)).toBeVisible();
    }
);

Then(/^la demi-journée du "(.+)" (matin|après-midi) est vide$/, async ({ monde }, jour, periode) => {
    await expect(demiJournee(monde, jour, periode)).toContainText('vide');
});

Then('{int} modification HO est à enregistrer', async ({ monde }, n) => {
    await expect(boutonEnregistrer(monde)).toBeVisible();
    await expect(boutonEnregistrer(monde)).toContainText(`(${n})`);
});

Then("aucune modification HO n'est à enregistrer", async ({ monde }) => {
    await monde.page.waitForTimeout(300);
    await expect(boutonEnregistrer(monde)).toBeHidden();
});

When("j'annule les modifications HO", async ({ monde }) => {
    await monde.page.locator('#hoCancelBtn').click();
});

// ---------- Enregistrement ----------

When("j'ouvre l'enregistrement du planning HO", async ({ monde }) => {
    await boutonEnregistrer(monde).click();
    await expect(fenetreEnregistrement(monde)).toBeVisible();
});

Then(
    /^la fenêtre d'enregistrement liste l'ajout de l'expert de test le "(.+)" (matin|après-midi)$/,
    async ({ monde }, jour, periode) => {
        const e = await expertHo(monde);
        const ligne = fenetreEnregistrement(monde).locator('tr', { hasText: jour }).filter({ hasText: e.nom });
        await expect(ligne).toHaveCount(1);
        await expect(ligne).toContainText(periode);
        await expect(ligne).toContainText('ajout');
    }
);

const lignesAns = (/** @type {Monde} */ monde, /** @type {string} */ jour) =>
    fenetreEnregistrement(monde).locator('tr', { hasText: jour }).filter({ hasText: 'HO ANS' });

Then("la fenêtre d'enregistrement liste {int} ajouts HO ANS le {string}", async ({ monde }, n, jour) => {
    await expect(lignesAns(monde, jour).filter({ hasText: 'ajout' })).toHaveCount(n);
});

Then(
    "la fenêtre d'enregistrement liste le retrait HO ANS du compte {string} de test le {string}",
    async ({ monde }, profil, jour) => {
        const c = await compte(monde, profil);
        const ligne = lignesAns(monde, jour);
        await expect(ligne).toHaveCount(1);
        await expect(ligne).toContainText(c.nom);
        await expect(ligne).toContainText('retrait');
    }
);

When("je confirme l'enregistrement du planning HO", async ({ monde }) => {
    await fenetreEnregistrement(monde).getByRole('button', { name: 'Confirmer et enregistrer' }).click();
    await expect(fenetreEnregistrement(monde)).toBeHidden();
});

Then('le message {string} est affiché', async ({ monde }, message) => {
    await expect(monde.page.getByText(message).first()).toBeVisible();
});

const inscrit = async (/** @type {Monde} */ monde, /** @type {string} */ date, /** @type {string} */ periode) => {
    const { resourceId } = await ressourceExpert(monde);
    const p = periode === 'matin' ? 'AM' : 'PM';
    return (await moisHo(monde, date.slice(0, 7))).slots.some(
        (/** @type {any} */ s) => s.date === date && s.period === p && s.resource_id === resourceId
    );
};

Then(/^l'expert de test est inscrit le "(.+)" (matin|après-midi)$/, async ({ monde }, date, periode) => {
    await expect.poll(() => inscrit(monde, date, periode)).toBe(true);
});

Then(
    /^l'expert de test n'(?:est plus|est pas) inscrit le "(.+)" (matin|après-midi)$/,
    async ({ monde }, date, periode) => {
        await expect.poll(() => inscrit(monde, date, periode)).toBe(false);
    }
);

// ---------- Astreinte HO ANS ----------

/** Case à cocher d'un compte dans la fenêtre de l'astreinte HO ANS (administrateur) */
async function caseAns(/** @type {Monde} */ monde, /** @type {string} */ profil) {
    const c = await compte(monde, profil);
    return monde.page.getByRole('checkbox', { name: new RegExp(`^${echapper(c.nom)}`) });
}

When(
    'je coche les comptes {string} et {string} de test en astreinte HO ANS le {string}',
    async ({ monde }, a, b, jour) => {
        await jourAns(monde, jour).click();
        await (await caseAns(monde, a)).check();
        await (await caseAns(monde, b)).check();
        await fermerChoix(monde);
    }
);

When('je décoche le compte {string} de test en astreinte HO ANS le {string}', async ({ monde }, profil, jour) => {
    await jourAns(monde, jour).click();
    await (await caseAns(monde, profil)).uncheck();
    await fermerChoix(monde);
});

When("je clique sur l'astreinte HO ANS du {string}", async ({ monde }, jour) => {
    await jourAns(monde, jour).click();
});

Then(
    "l'astreinte HO ANS du {string} présente les comptes {string} et {string} de test, non enregistrée",
    async ({ monde }, jour, a, b) => {
        for (const profil of [a, b]) {
            const c = await compte(monde, profil);
            await expect(jourAns(monde, jour)).toHaveAttribute('title', new RegExp(echapper(c.complet)));
        }
        await expect(boutonEnregistrer(monde)).toBeVisible();
    }
);

/** Utilisateurs désignés un jour (identifiants triés) */
const designes = async (/** @type {Monde} */ monde, /** @type {string} */ date) =>
    (await moisHo(monde, date.slice(0, 7))).ans.slots
        .filter((/** @type {any} */ s) => s.date === date)
        .map((/** @type {any} */ s) => s.user_id)
        .sort((/** @type {number} */ x, /** @type {number} */ y) => x - y);

const identifiants = async (/** @type {Monde} */ monde, /** @type {string[]} */ profils) => {
    const ids = [];
    for (const p of profils) ids.push((await compte(monde, p)).id);
    return ids.sort((x, y) => x - y);
};

Then(
    'les comptes {string} et {string} de test sont désignés en astreinte HO ANS le {string}',
    async ({ monde }, a, b, date) => {
        const attendus = await identifiants(monde, [a, b]);
        await expect
            .poll(async () => (await designes(monde, date)).filter(id => attendus.includes(id)))
            .toEqual(attendus);
    }
);

Then('seul le compte {string} de test est désigné en astreinte HO ANS le {string}', async ({ monde }, profil, date) => {
    const tests = await identifiants(monde, ['Utilisateur', 'Expert', 'Administrateur']);
    const attendu = await identifiants(monde, [profil]);
    await expect.poll(async () => (await designes(monde, date)).filter(id => tests.includes(id))).toEqual(attendu);
});
