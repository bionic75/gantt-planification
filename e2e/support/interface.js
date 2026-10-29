// @ts-check
// Éléments d'interface communs aux écrans de l'ancien code et aux îlots Vue (migration, docs/migration-vue.md)
import { expect } from '@playwright/test';

/** @typedef {import('./monde.js').Monde} Monde */
/** @typedef {import('@playwright/test').Locator} Locator */

/**
 * Action à confirmer : fenêtre du navigateur (ancien code, acceptée par le monde) ou fenêtre de confirmation de
 * l'écran (îlot Vue, rôle alertdialog)
 */
export async function confirmer(/** @type {Monde} */ monde, /** @type {() => Promise<void>} */ declencher) {
    const avant = monde.dialogues.length;
    const boite = monde.page.getByRole('alertdialog');
    await declencher();
    await expect
        .poll(async () => monde.dialogues.length > avant || (await boite.isVisible()), { message: 'confirmation' })
        .toBe(true);
    if (monde.dialogues.length === avant) await boite.getByRole('button', { name: /^(Supprimer|Confirmer)$/ }).click();
}

/** Action présentée en lien (ancien code) ou en bouton (îlot Vue) */
export const action = (/** @type {Locator} */ zone, /** @type {string | RegExp} */ nom) =>
    zone.getByRole('link', { name: nom, exact: true }).or(zone.getByRole('button', { name: nom, exact: true }));

/** Fichier téléchargé par un clic : nom et contenu texte */
export async function telecharger(/** @type {Monde} */ monde, /** @type {Locator} */ declencheur) {
    const fs = await import('fs');
    const telechargement = monde.page.waitForEvent('download');
    await declencheur.click();
    const d = await telechargement;
    return {
        nom: d.suggestedFilename(),
        contenu: fs.readFileSync(/** @type {string} */ (await d.path()), 'utf8')
    };
}
