// Éléments d'interface communs aux écrans de l'ancien code et aux îlots Vue (migration, docs/migration-vue.md)
import { expect } from '@playwright/test';

import type { Monde } from './monde.ts';
import type { Locator } from '@playwright/test';

/**
 * Action à confirmer : fenêtre du navigateur (ancien code, acceptée par le monde) ou fenêtre de confirmation de
 * l'écran (îlot Vue, rôle alertdialog). Renvoie le texte de la confirmation.
 */
export async function confirmer(monde: Monde, declencher: () => Promise<void>) {
    const avant = monde.dialogues.length;
    const boite = monde.page.getByRole('alertdialog');
    await declencher();
    await expect
        .poll(async () => monde.dialogues.length > avant || (await boite.isVisible()), { message: 'confirmation' })
        .toBe(true);
    if (monde.dialogues.length > avant) return monde.dialogues.at(-1) as string;
    const texte = (await boite.textContent()) ?? '';
    await boite.getByRole('button', { name: /^(Supprimer|Confirmer|Fusionner)$/ }).click();
    return texte;
}

/**
 * Action à confirmer, annulée : fenêtre du navigateur refusée ou bouton de refus de la fenêtre de l'écran (« Annuler »
 * par défaut). Renvoie le texte affiché.
 */
export async function annulerConfirmation(monde: Monde, declencher: () => Promise<void>, refus: string = 'Annuler') {
    const avant = monde.dialogues.length;
    const boite = monde.page.getByRole('alertdialog');
    monde.refuserProchainDialogue = true;
    try {
        await declencher();
        await expect
            .poll(async () => monde.dialogues.length > avant || (await boite.isVisible()), { message: 'confirmation' })
            .toBe(true);
    } finally {
        if (monde.dialogues.length === avant) monde.refuserProchainDialogue = false;
    }
    if (monde.dialogues.length > avant) return monde.dialogues.at(-1) as string;
    const texte = (await boite.textContent()) ?? '';
    await boite.getByRole('button', { name: refus, exact: true }).click();
    await expect(boite).toBeHidden();
    return texte;
}

/** Action présentée en lien (ancien code) ou en bouton (îlot Vue) */
export const action = (zone: Locator, nom: string | RegExp) =>
    zone.getByRole('link', { name: nom, exact: true }).or(zone.getByRole('button', { name: nom, exact: true }));

/** Fichier téléchargé par un clic : nom et contenu texte */
export async function telecharger(monde: Monde, declencheur: Locator) {
    const fs = await import('fs');
    const telechargement = monde.page.waitForEvent('download');
    await declencheur.click();
    const d = await telechargement;
    return {
        nom: d.suggestedFilename(),
        contenu: fs.readFileSync((await d.path()) as string, 'utf8')
    };
}
