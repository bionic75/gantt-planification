// @ts-check
// Astreintes › rubrique HNO (écran) : volontaires, disponibilités (règles FPH), génération du planning, planning actuel
import { expect } from '@playwright/test';
import { adminApi, creerRessource, lireRessource } from '../support/donnees.js';
import { Given, Then, When } from '../support/fixtures.js';
import { confirmer, telecharger } from '../support/interface.js';

/** @typedef {import('../support/monde.js').Monde} Monde */

const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** Dernier mois proposé par l'écran : mois courant + 3 (« AAAA-MM ») */
function dernierMois() {
    const d = new Date();
    const m = new Date(d.getFullYear(), d.getMonth() + 3, 1);
    return { annee: m.getFullYear(), mois: m.getMonth() + 1, cle: `${m.getFullYear()}-${deux(m.getMonth() + 1)}` };
}

/** n-ième jour de la semaine (0 = dimanche, 1 = lundi, 6 = samedi) du dernier mois proposé : « AAAA-MM-JJ » */
function nieme(/** @type {number} */ jourSemaine, /** @type {number} */ n) {
    const { annee, mois } = dernierMois();
    let trouves = 0;
    for (let j = 1; j <= 31; j++) {
        const d = new Date(annee, mois - 1, j);
        if (d.getMonth() !== mois - 1) break;
        if (d.getDay() === jourSemaine && ++trouves === n) return `${annee}-${deux(mois)}-${deux(j)}`;
    }
    throw new Error('jour introuvable');
}
const JOURS = /** @type {Record<string, [number, number]>} */ ({
    'premier lundi': [1, 1],
    'premier samedi': [6, 1],
    'deuxième samedi': [6, 2]
});
const dateDe = (/** @type {string} */ libelle) => nieme(...JOURS[libelle]);
const dateFr = (/** @type {string} */ iso) => iso.split('-').reverse().join('/');

const nomAffiche = (/** @type {{ nom: string, prenom: string }} */ r) => `${r.nom.toUpperCase()} ${r.prenom}`;

async function rendreVolontaire(/** @type {Monde} */ monde, /** @type {{ id: number }} */ r) {
    const api = await adminApi(monde);
    await api.ok('POST', `/api/astreinte/volontaire/${r.id}`, { volontaire: true });
    // Disponibilités du mois retirées avant la suppression de la ressource
    monde.aNettoyer('disponibilités HNO de la ressource de test', () =>
        api.post(`/api/astreinte/dispos/${r.id}/${dernierMois().cle}`, { disponibilites: [] })
    );
}

// ---------- Données ----------

Given("une ressource standard volontaire au dispositif d'astreinte existe", async ({ monde }) => {
    monde.d.ressource = await creerRessource(monde);
    await rendreVolontaire(monde, monde.d.ressource);
});

Given('deux ressources volontaires sont disponibles le premier lundi du dernier mois proposé', async ({ monde }) => {
    const api = await adminApi(monde);
    const lundi = dateDe('premier lundi');
    monde.d.ressources = [];
    for (let i = 0; i < 2; i++) {
        const r = await creerRessource(monde);
        await rendreVolontaire(monde, r);
        await api.ok('POST', `/api/astreinte/dispos/${r.id}/${dernierMois().cle}`, { disponibilites: [lundi] });
        monde.d.ressources.push(r);
    }
});

// ---------- Rubrique et sections ----------

When("j'ouvre la rubrique HNO", async ({ monde }) => {
    await monde.page.locator('#astreinteSubTabHno').click();
    await expect(monde.page.locator('#astreintesHnoPanel')).toBeVisible();
});

Then(
    'la rubrique HNO présente les sections « Volontaires », « Disponibilités », « Génération » et « Planning actuel »',
    async ({ monde }) => {
        const panneau = monde.page.locator('#astreintesHnoPanel');
        for (const titre of [
            "Volontaires au dispositif d'astreinte",
            "Disponibilités pour l'astreinte",
            "Génération du planning d'astreinte",
            "Planning d'astreinte actuel"
        ])
            await expect(panneau.locator('h3', { hasText: titre })).toBeVisible();
    }
);

// ---------- Volontaires ----------

const ligneVolontaire = (/** @type {Monde} */ monde) =>
    monde.page.locator('#volontairesListContainer tbody tr', { hasText: monde.d.ressource.nom.toUpperCase() });

/** Interrupteur « Volontaire » : libellé de la case (case masquée sous le curseur) */
const interrupteur = (/** @type {Monde} */ monde) =>
    ligneVolontaire(monde)
        .locator('label')
        .filter({ has: monde.page.getByRole('checkbox') });

When("je rends la ressource volontaire au dispositif d'astreinte", async ({ monde }) => {
    await expect(ligneVolontaire(monde).getByRole('checkbox')).not.toBeChecked();
    await interrupteur(monde).click();
});

When("je retire la ressource du dispositif d'astreinte", async ({ monde }) => {
    await expect(ligneVolontaire(monde).getByRole('checkbox')).toBeChecked();
    await interrupteur(monde).click();
});

const aujourdhui = () => new Date().toISOString().slice(0, 10);

Then("la ressource est volontaire au dispositif d'astreinte, activée aujourd'hui", async ({ monde }) => {
    await expect
        .poll(async () => {
            const r = await lireRessource(monde, monde.d.ressource.id);
            return `${r?.astreinte_volontaire}|${String(r?.astreinte_date_activation || '').slice(0, 10)}`;
        })
        .toBe(`1|${aujourdhui()}`);
});

Then("la ressource n'est plus volontaire au dispositif d'astreinte", async ({ monde }) => {
    await expect.poll(async () => (await lireRessource(monde, monde.d.ressource.id))?.astreinte_volontaire).toBe(0);
});

Then("la ligne de la ressource dans les volontaires indique la date d'activation du jour", async ({ monde }) => {
    await expect(ligneVolontaire(monde)).toContainText(new Date().toLocaleDateString('fr-FR'));
});

const optionExpert = (/** @type {Monde} */ monde) =>
    monde.page.locator(`#astreinteDispoExpert option[value="${monde.d.ressource.id}"]`);

Then('la ressource est proposée dans les disponibilités', async ({ monde }) => {
    await expect(optionExpert(monde)).toHaveCount(1);
});

Then("la ressource n'est plus proposée dans les disponibilités", async ({ monde }) => {
    await expect(optionExpert(monde)).toHaveCount(0);
});

// ---------- Disponibilités ----------

const calendrier = (/** @type {Monde} */ monde) => monde.page.locator('#astreinteDispoCalendarContent');

When("j'affiche les disponibilités de la ressource pour le dernier mois proposé", async ({ monde }) => {
    const page = monde.page;
    await expect(optionExpert(monde)).toHaveCount(1);
    await page.locator('#astreinteDispoMois').selectOption(dernierMois().cle);
    await page.locator('#astreinteDispoExpert').selectOption(String(monde.d.ressource.id));
    await expect(calendrier(monde)).toBeVisible();
});

When(/^je rends disponible le (premier lundi|premier samedi|deuxième samedi) du mois$/, async ({ monde }, jour) => {
    const n = Number(dateDe(jour).slice(8));
    // Jours du mois dans l'ordre (cases vides avant le 1er exclues)
    await calendrier(monde)
        .locator('td:has(div)')
        .nth(n - 1)
        .locator('div')
        .first()
        .click();
});

Then(
    /^le calendrier des disponibilités indique (\d+) créneaux? disponibles? \((\d+)h\)$/,
    async ({ monde }, n, heures) => {
        await expect(calendrier(monde)).toContainText(`${n} créneaux disponibles (${heures}h)`);
    }
);

When('je remets les disponibilités à zéro et je confirme', async ({ monde }) => {
    await confirmer(monde, () => monde.page.locator('#astreintesGestion').getByRole('button', { name: /RAZ/ }).click());
});

When('je valide les disponibilités', async ({ monde }) => {
    await monde.page
        .locator('#astreintesGestion')
        .getByRole('button', { name: /Valider/ })
        .click();
});

Then('les disponibilités enregistrées de la ressource sont le premier lundi du mois', async ({ monde }) => {
    const api = await adminApi(monde);
    await expect
        .poll(async () =>
            (await api.ok('GET', `/api/astreinte/dispos/${monde.d.ressource.id}/${dernierMois().cle}`)).map(
                (/** @type {any} */ d) => d.date
            )
        )
        .toEqual([dateDe('premier lundi')]);
});

// ---------- Planning actuel ----------

When("j'affiche le planning actuel du dernier mois proposé", async ({ monde }) => {
    await monde.page.locator('#astreinteMoisAffichage').selectOption(dernierMois().cle);
});

Then('le planning actuel présente le planning enregistré du mois', async ({ monde }) => {
    const planning = await (await adminApi(monde)).ok('GET', `/api/astreinte/planning/${dernierMois().cle}`);
    const conteneur = monde.page.locator('#astreintePlanningActuelContainer');
    if (!planning.length) await expect(conteneur).toContainText('Aucun planning pour ce mois');
    else await expect(conteneur.locator('tbody tr')).toHaveCount(planning.length);
});

// ---------- Génération (destructive) ----------

const tableauGenere = (/** @type {Monde} */ monde) => monde.page.locator('#astreintePlanningTable');
const ligneDuLundi = (/** @type {Monde} */ monde) =>
    tableauGenere(monde).locator('tbody tr', { hasText: dateFr(dateDe('premier lundi')) });

When('je génère le planning du dernier mois proposé', async ({ monde }) => {
    await monde.page.locator('#astreinteMoisGeneration').selectOption(dernierMois().cle);
    await monde.page
        .locator('#astreintesGestion')
        .getByRole('button', { name: /Générer le planning/ })
        .click();
});

Then('le planning généré présente un créneau par jour du mois', async ({ monde }) => {
    const { annee, mois } = dernierMois();
    await expect(tableauGenere(monde).locator('tbody tr')).toHaveCount(new Date(annee, mois, 0).getDate());
});

Then("le premier lundi du mois est attribué à l'une des deux ressources", async ({ monde }) => {
    const ligne = ligneDuLundi(monde);
    await expect(ligne).toHaveCount(1);
    const texte = (await ligne.textContent()) ?? '';
    const attribuee = monde.d.ressources.find((/** @type {any} */ r) => texte.includes(nomAffiche(r)));
    expect(attribuee, texte).toBeTruthy();
    monde.d.autre = monde.d.ressources.find((/** @type {any} */ r) => r !== attribuee);
});

When("j'attribue le premier lundi du mois à l'autre ressource", async ({ monde }) => {
    await ligneDuLundi(monde).locator('select').selectOption(String(monde.d.autre.id));
});

Then("le premier lundi du mois est enregistré pour l'autre ressource", async ({ monde }) => {
    await expect(ligneDuLundi(monde)).toContainText(nomAffiche(monde.d.autre));
    const api = await adminApi(monde);
    await expect
        .poll(
            async () =>
                (await api.ok('GET', `/api/astreinte/planning/${dernierMois().cle}`)).find(
                    (/** @type {any} */ s) => s.date === dateDe('premier lundi')
                )?.resource_id
        )
        .toBe(monde.d.autre.id);
});

Then("l'export CSV du planning généré présente l'autre ressource", async ({ monde }) => {
    const { nom, contenu } = await telecharger(
        monde,
        monde.page.locator('#astreintesGestion').getByRole('button', { name: /Exporter CSV/ })
    );
    expect(nom).toBe(`planning_astreinte_${dernierMois().cle}.csv`);
    expect(contenu).toContain(nomAffiche(monde.d.autre));
});
