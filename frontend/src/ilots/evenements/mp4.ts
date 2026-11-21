// Export de l'animation en vidéo MP4 (H.264) : images dessinées sur un canvas, encodées par le navigateur (WebCodecs)
// et assemblées dans un conteneur MP4 par mp4-muxer (MIT, embarqué dans le bundle).
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

/** Encodeur vidéo du navigateur disponible (Chrome, Edge, Safari récents ; Firefox selon la version) */
export const mp4Disponible = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

const respirer = () => new Promise<void>(r => setTimeout(r, 0));
/** H.264 exige des dimensions paires */
export const pair = (n: number) => n - (n % 2);

/** Vidéo MP4 à partir d'une suite de dessins : `dessiner(i, ctx)` peint l'image i ; mêmes options que genererGif */
export async function genererMp4(options: {
    largeur: number;
    hauteur: number;
    images: number;
    delaiMs: number;
    pauseFinMs?: number;
    dessiner: (i: number, ctx: CanvasRenderingContext2D) => void;
    progression?: (i: number, total: number) => void;
}): Promise<Blob> {
    if (!mp4Disponible()) throw new Error('Encodage vidéo indisponible dans ce navigateur');
    const largeur = pair(options.largeur);
    const hauteur = pair(options.hauteur);
    const config: VideoEncoderConfig = {
        codec: 'avc1.640034',
        width: largeur,
        height: hauteur,
        bitrate: Math.round(largeur * hauteur * 6),
        framerate: 1000 / options.delaiMs
    };
    if (!(await VideoEncoder.isConfigSupported(config)).supported) {
        throw new Error('Codec H.264 indisponible dans ce navigateur');
    }
    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas indisponible');
    const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: largeur, height: hauteur },
        fastStart: 'in-memory'
    });
    let erreur: Error | null = null;
    const encodeur = new VideoEncoder({
        output: (morceau, meta) => muxer.addVideoChunk(morceau, meta),
        error: e => (erreur = e)
    });
    encodeur.configure(config);
    let instantMs = 0;
    for (let i = 0; i < options.images; i++) {
        if (erreur) throw erreur;
        options.dessiner(i, ctx);
        const dernier = i === options.images - 1;
        // La dernière image est maintenue plus longtemps : le conteneur ne mesure la durée d'une image que par l'écart
        // avec la suivante, d'où une copie de l'image finale en fin de pause
        const dureeMs = dernier
            ? Math.max(0, (options.pauseFinMs ?? options.delaiMs) - options.delaiMs)
            : options.delaiMs;
        const emettre = (debutMs: number, duree: number) => {
            const image = new VideoFrame(canvas, { timestamp: debutMs * 1000, duration: duree * 1000 });
            encodeur.encode(image, { keyFrame: true });
            image.close();
        };
        emettre(instantMs, dureeMs || options.delaiMs);
        instantMs += dureeMs || options.delaiMs;
        if (dernier && dureeMs) emettre(instantMs, options.delaiMs);
        options.progression?.(i + 1, options.images);
        await respirer();
    }
    await encodeur.flush();
    if (erreur) throw erreur;
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
