// Types de gifenc (encodeur GIF sans dépendance, licence MIT), qui n'en fournit pas
declare module 'gifenc' {
    export type Palette = number[][];
    export interface EncodeurGif {
        writeFrame(
            index: Uint8Array,
            largeur: number,
            hauteur: number,
            options?: { palette?: Palette; delay?: number; repeat?: number }
        ): void;
        finish(): void;
        bytes(): Uint8Array;
    }
    export function GIFEncoder(): EncodeurGif;
    export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxCouleurs: number): Palette;
    export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: Palette): Uint8Array;
}
