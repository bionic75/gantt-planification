// Cadre de la session : favicon de l'application, nouveautés de l'aide en ligne, vérification de la version
import { sansStyleEnLigne } from '@/outils/styles-en-ligne';

/** Repère posé par la mire à la connexion (sessionStorage) : nouveautés de l'aide proposées une fois la session ouverte */
export const CLE_CONNEXION_RECENTE = 'gp_connexion_recente';

/** Favicon choisi dans l'administration (public/img/favicon-{nom}.svg) */
export function appliquerFavicon(nom: string, doc: Document = document) {
    let lien = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!lien) {
        lien = doc.createElement('link');
        lien.rel = 'icon';
        lien.type = 'image/svg+xml';
        doc.head.appendChild(lien);
    }
    lien.href = `/img/favicon-${nom}.svg?t=${Date.now()}`;
}

/**
 * Bloc de la version publiée dans la page d'aide (carte des notes de version dont le titre en gras est la version) ;
 * à défaut toute la section des notes de version ; null sans cette section
 */
export function extraireNouveautes(html: string, version: string): string | null {
    // Document analysé soumis à la politique de contenu de la page : attributs style mis de côté (data-style)
    const doc = new DOMParser().parseFromString(sansStyleEnLigne(html), 'text/html');
    const cartes = doc.querySelectorAll('#section-notes-version .card, #section-notes-version [class*="card"]');
    for (const carte of cartes) {
        if (carte.querySelector('strong')?.textContent?.trim() === version) return carte.outerHTML;
    }
    return doc.getElementById('section-notes-version')?.outerHTML ?? null;
}

// ── Bandeau de mise en production ────────────────────────────────────────────

export type EtatBandeau = { type: 'aucun' } | { type: 'coupure' } | { type: 'version'; version: string };

/**
 * Suivi de la version du serveur : première version lue retenue sans bandeau ; version changée : bandeau (sauf
 * version déjà masquée) ; 3 échecs successifs : coupure (mise en production en cours) ; serveur revenu à la même
 * version : plus de bandeau
 */
export function suiviVersion(echecsAvantCoupure = 3) {
    let connue: string | null = null;
    let coupure = false;
    let echecs = 0;
    let etat: EtatBandeau = { type: 'aucun' };
    return {
        /** Version lue ; masquee : version dont le bandeau a été masqué pendant la session du navigateur */
        lue(version: string, masquee: string | null): EtatBandeau {
            echecs = 0;
            if (connue === null) {
                connue = version;
                coupure = false;
                return etat;
            }
            if (coupure) {
                coupure = false;
                if (version === connue) return (etat = { type: 'aucun' });
            }
            if (version !== connue) {
                if (masquee !== version) etat = { type: 'version', version };
            } else etat = { type: 'aucun' };
            return etat;
        },
        echec(): EtatBandeau {
            echecs++;
            if (!coupure && echecs >= echecsAvantCoupure) {
                coupure = true;
                etat = { type: 'coupure' };
            }
            return etat;
        },
        masquer(): EtatBandeau {
            return (etat = { type: 'aucun' });
        }
    };
}
