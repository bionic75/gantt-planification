// Son de notification des messages reçus : réglage du navigateur (Administration › Paramétrages divers, essai) ; son
// personnalisé (data URI) ou deux tons courts par défaut

const CLE_ACTIF = 'notifSoundEnabled';
const CLE_SON = 'notifSoundData';

export function jouerSonNotification(): void {
    try {
        if (localStorage.getItem(CLE_ACTIF) === 'false') return;
        const personnalise = localStorage.getItem(CLE_SON);
        if (personnalise) {
            const audio = new Audio(personnalise);
            audio.volume = 0.7;
            void audio.play().catch(() => {});
        } else bipParDefaut();
    } catch {
        /* son indisponible */
    }
}

function bipParDefaut() {
    try {
        const Contexte =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Contexte) return;
        const ctx = new Contexte();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        // Deux tons courts façon messagerie
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        setTimeout(() => void ctx.close(), 700);
    } catch {
        /* son indisponible */
    }
}
