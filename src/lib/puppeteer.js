// @ts-check
// Chargement de Puppeteer (génération de PDF). Module ESM uniquement : import() dynamique.
// `puppeteer` reste null si le paquet n'est pas disponible ; les fonctionnalités PDF répondent alors une erreur.

/** @type {any} */
export let puppeteer = null;

import('puppeteer')
    .then(mod => {
        puppeteer = mod.default;
        console.log('✅ Puppeteer chargé (ESM)');
    })
    .catch(() => {
        console.warn('⚠️ Puppeteer non installé — génération PDF désactivée.');
    });
