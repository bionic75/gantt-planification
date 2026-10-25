// version-watch
// Extrait de index.html : script classique, portée globale partagée avec les autres scripts de la page

(function () {
    let _knownVersion = null;
    let _serverDown = false;
    let _failures = 0;
    const INTERVAL = 30000; // 30s
    const FAILS_BEFORE_BANNER = 3; // une coupure brève (réseau, veille du poste, redémarrage rapide) n'affiche rien
    const dismissed = () => {
        try {
            return sessionStorage.getItem('deployDismissed');
        } catch (e) {
            return null;
        }
    };

    async function checkVersion() {
        if (document.hidden) return; // onglet en arrière-plan : on revérifie au retour
        try {
            const r = await fetch('/api/version', { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            const v = data.version;
            _failures = 0;

            if (_knownVersion === null) {
                _knownVersion = v; // initialisation silencieuse
                _serverDown = false;
                return;
            }

            if (_serverDown) {
                // Serveur revenu : le bandeau orange disparaît ; le bandeau vert n'apparaît que si la version a réellement changé
                _serverDown = false;
                if (v === _knownVersion) {
                    hideBanner();
                    return;
                }
            }

            if (v !== _knownVersion) {
                // Version changée (mise en production) : une seule alerte par version, masquable
                if (dismissed() !== v) showBannerNewVersion(v);
            } else {
                hideBanner();
            }
        } catch (e) {
            _failures++;
            if (!_serverDown && _failures >= FAILS_BEFORE_BANNER) {
                _serverDown = true;
                showBannerDown();
            }
        }
    }

    function hideBanner() {
        const b = document.getElementById('deployBanner');
        if (b) b.style.display = 'none';
    }
    window.deployBannerDismiss = function () {
        const t = document.getElementById('deployBannerText').textContent;
        const m = /\((v?[\d.]+)\)/.exec(t);
        if (m) {
            try {
                sessionStorage.setItem('deployDismissed', m[1]);
            } catch (e) {
                /* stockage indisponible */
            }
        }
        hideBanner();
    };
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkVersion();
    });

    function showBannerDown() {
        const b = document.getElementById('deployBanner');
        const t = document.getElementById('deployBannerText');
        const btn = document.getElementById('deployBannerReload');
        b.style.background = '#e65100';
        b.style.color = 'white';
        t.textContent =
            "⚙️  Mise en production en cours — l'application sera de nouveau disponible dans 1 à 2 minutes. Une reconnexion sera nécessaire.";
        btn.style.display = 'none';
        b.style.display = 'block';
    }

    function showBannerNewVersion(v) {
        const b = document.getElementById('deployBanner');
        const t = document.getElementById('deployBannerText');
        const btn = document.getElementById('deployBannerReload');
        b.style.background = '#1b5e20';
        b.style.color = 'white';
        t.textContent = `✅  Nouvelle version disponible (${v}) — veuillez recharger la page et vous reconnecter.`;
        btn.style.display = 'inline-block';
        b.style.display = 'block';
    }

    // Démarrer le polling après 5s (laisser la page s'initialiser)
    setTimeout(() => {
        checkVersion(); // lecture initiale de la version
        setInterval(checkVersion, INTERVAL);
    }, 5000);
})();
