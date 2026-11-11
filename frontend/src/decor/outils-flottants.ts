// Barre d'outils flottante (mode sombre, thème, mise en page) : placée à gauche des pastilles fixes de l'en-tête, quelle
// que soit l'application. Reprise de public/js/darkmode.js (GPTools, lot 6.5).

/** Pastilles fixes de l'en-tête des applications, que la barre ne doit pas recouvrir */
const PASTILLES = [
    'appSwitcher',
    'backToPlanificationBtn',
    'onlineUsersContainer',
    'deplacementsOnlineUsersContainer',
    'inactivityTimerDisplay',
    'deplacementsTimerDisplay',
    'affectationBackBtn',
    'affectationOnlineUsersContainer',
    'affectationTimerDisplay',
    'analyseOnlineUsersContainer',
    'analyseTimerDisplay'
];

/** Barre placée à gauche de la pastille visible la plus à gauche, en haut de la page */
export function positionnerOutils(): void {
    const barre = document.getElementById('gpTools');
    if (!barre) return;
    let gauche = window.innerWidth - 10;
    for (const id of PASTILLES) {
        const el = document.getElementById(id);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.top < 60 && r.left < gauche) gauche = r.left;
    }
    barre.style.right = `${Math.max(10, window.innerWidth - gauche + 10)}px`;
}

/** Bouton ajouté à la barre, à son rang (1 : mode sombre, 2 : thème, 3 : mise en page) */
export function monterOutil(bouton: HTMLElement, rang: number): void {
    let barre = document.getElementById('gpTools');
    if (!barre) {
        barre = document.createElement('div');
        barre.id = 'gpTools';
        document.body.appendChild(barre);
    }
    bouton.style.order = String(rang);
    barre.appendChild(bouton);
    positionnerOutils();
}

let installe = false;

export function installerOutilsFlottants(): void {
    if (installe) return;
    installe = true;
    window.addEventListener('resize', positionnerOutils);
}
