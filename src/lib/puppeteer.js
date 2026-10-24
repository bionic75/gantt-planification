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

/**
 * Isole une page avant d'y charger du HTML construit à partir de données (CRA) ou envoyé par le navigateur
 * (export du planning) : sans JavaScript ni accès réseau, seules les ressources intégrées (data:, blob:) se
 * chargent. Empêche un contenu injecté de faire lire au serveur des adresses internes (SSRF) ou des fichiers.
 * @param {any} page page Puppeteer
 */
export async function isolatePage(page) {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (/** @type {any} */ request) => {
        if (/^(data|blob|about):/i.test(request.url())) request.continue();
        else request.abort('blockedbyclient');
    });
}
