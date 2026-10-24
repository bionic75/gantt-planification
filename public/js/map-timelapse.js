// Lecture chronologique des événements sur la carte : les pastilles apparaissent progressivement
// entre la date de début et la date de fin choisies, à la vitesse sélectionnée.
(function () {
    'use strict';

    const PLAY =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="fill:currentColor;stroke:none;"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';
    const PAUSE =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="fill:currentColor;stroke:none;"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>';

    const style = document.createElement('style');
    style.textContent =
        '@keyframes gpPinPop { 0% { transform: scale(.15); opacity: 0; } 55% { transform: scale(1.4); opacity: 1; } 100% { transform: scale(1); } }';
    document.head.appendChild(style);

    const S = {
        timer: null,
        t0: 0,
        base: 0,
        playing: false,
        f: 0,
        range: null,
        lastDate: null,
        counts: {},
        active: false
    };

    const el = id => document.getElementById(id);
    const day = iso => Date.parse(iso + 'T00:00:00Z') / 86400000;
    const isoOf = d => new Date(d * 86400000).toISOString().slice(0, 10);
    const fr = iso => iso.split('-').reverse().join('/');
    const duration = () => Number(el('mapPlaySpeed').value) || 30;

    function range() {
        const ev = (typeof _lastMapEvents !== 'undefined' && _lastMapEvents) || [];
        let s = el('modalMapStartDate').value;
        let e = el('modalMapEndDate').value;
        const starts = ev
            .map(x => x.start_date)
            .filter(Boolean)
            .sort();
        const ends = ev
            .map(x => x.end_date || x.start_date)
            .filter(Boolean)
            .sort();
        if (!s) s = starts[0];
        if (!e) e = ends[ends.length - 1];
        if (!s || !e || e < s) return null;
        return { s, e, days: Math.max(1, day(e) - day(s)) };
    }

    function experts() {
        return typeof _showExpertMarkers !== 'undefined' && _showExpertMarkers ? _expertsMapData || [] : [];
    }

    // Événements visibles à une date donnée : ceux qui ont déjà commencé (cumul progressif)
    function subsetAt(dateIso) {
        return ((typeof _lastMapEvents !== 'undefined' && _lastMapEvents) || []).filter(
            x => (x.start_date || '') <= dateIso
        );
    }

    function render(dateIso) {
        const sub = subsetAt(dateIso);
        const counts = {};
        sub.forEach(x => {
            counts[x.location_id] = (counts[x.location_id] || 0) + 1;
        });
        const pop = new Set(Object.keys(counts).filter(k => counts[k] !== S.counts[k]));
        S.counts = counts;
        renderModalMapMarkers(sub, experts(), { noFit: true, pop });
        el('mapPlayCount').textContent = `${sub.length} / ${_lastMapEvents.length} événement(s)`;
    }

    function updateUi() {
        el('mapPlayBtn').innerHTML = S.playing
            ? PAUSE + 'Pause'
            : PLAY + (S.f > 0 && S.f < 1 ? 'Reprendre' : 'Lecture');
        el('mapPlaySlider').value = Math.round(S.f * 1000);
        el('mapPlayDate').textContent = S.lastDate ? fr(S.lastDate) : '—';
    }

    function showFrame(f) {
        if (!S.range) return;
        S.f = Math.max(0, Math.min(1, f));
        const date = isoOf(day(S.range.s) + Math.floor(S.f * S.range.days));
        if (date !== S.lastDate) {
            S.lastDate = date;
            render(date);
        }
        updateUi();
    }

    function frameLoop() {
        const elapsed = S.base + (performance.now() - S.t0) / 1000;
        const f = elapsed / duration();
        showFrame(f);
        if (f >= 1) {
            S.playing = false;
            clearInterval(S.timer);
            S.timer = null;
            updateUi();
        }
    }

    function fitAll() {
        const pts = ((typeof _lastMapEvents !== 'undefined' && _lastMapEvents) || [])
            .filter(x => x.latitude && x.longitude)
            .map(x => [x.latitude, x.longitude]);
        if (pts.length && typeof eventModalMap !== 'undefined' && eventModalMap)
            eventModalMap.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
    }

    const MapTimelapse = {
        toggle() {
            if (S.playing) {
                MapTimelapse.pause();
                return;
            }
            const r = range();
            if (!r) {
                alert('Aucun événement à lire : renseignez une date de début (et de fin) ou affichez des événements.');
                return;
            }
            if (!S.active || S.f >= 1) {
                S.range = r;
                S.f = 0;
                S.base = 0;
                S.lastDate = null;
                S.counts = {};
                fitAll();
            } else {
                S.range = r;
                S.base = S.f * duration();
            }
            S.active = true;
            S.playing = true;
            S.t0 = performance.now();
            clearInterval(S.timer);
            S.timer = setInterval(frameLoop, 120);
            frameLoop();
        },
        pause() {
            if (!S.playing) return;
            S.base += (performance.now() - S.t0) / 1000;
            S.playing = false;
            clearInterval(S.timer);
            S.timer = null;
            updateUi();
        },
        speedChanged() {
            if (!S.active) return;
            const wasPlaying = S.playing;
            if (wasPlaying) {
                clearInterval(S.timer);
                S.timer = null;
            }
            S.base = S.f * duration();
            S.t0 = performance.now();
            if (wasPlaying) S.timer = setInterval(frameLoop, 120);
        },
        scrub(v) {
            if (!S.active) {
                const r = range();
                if (!r) return;
                S.range = r;
                S.active = true;
                S.counts = {};
                fitAll();
            }
            S.base = (Number(v) / 1000) * duration();
            S.t0 = performance.now();
            showFrame(Number(v) / 1000);
        },
        stop() {
            MapTimelapse.reset();
            if (typeof _lastMapEvents !== 'undefined')
                renderModalMapMarkers(_lastMapEvents, experts(), { noFit: true });
        },
        // Retour à l'affichage normal (sans redessiner la carte)
        reset() {
            clearInterval(S.timer);
            S.timer = null;
            S.playing = false;
            S.active = false;
            S.f = 0;
            S.base = 0;
            S.lastDate = null;
            S.counts = {};
            if (el('mapPlayBtn')) {
                updateUi();
                el('mapPlayDate').textContent = '—';
                el('mapPlayCount').textContent = '';
            }
        },
        visibleEvents(all) {
            return S.active && S.lastDate ? all.filter(x => (x.start_date || '') <= S.lastDate) : all;
        }
    };

    window.MapTimelapse = MapTimelapse;
    document.addEventListener('DOMContentLoaded', () => {
        if (el('mapPlayBtn')) updateUi();
    });
})();
