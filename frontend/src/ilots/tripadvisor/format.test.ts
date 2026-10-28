import { describe, expect, it } from 'vitest';
import { dateHeure, distanceTrajet, duree, echapper, km, lienSite, note, pluriel } from './format';

describe('mises en forme TripAdVisor', () => {
    it('horodatage UTC de la base affiché en heure locale', () => {
        const attendu = new Date(Date.UTC(2026, 9, 28, 14, 5));
        const z = (n: number) => String(n).padStart(2, '0');
        expect(dateHeure('2026-10-28 14:05:00')).toBe(
            `${z(attendu.getDate())}/${z(attendu.getMonth() + 1)}/2026 ${z(attendu.getHours())}:${z(attendu.getMinutes())}`
        );
        expect(dateHeure(null)).toBe('');
        expect(dateHeure('pas une date')).toBe('');
    });

    it('notes, distances et pluriels au format français', () => {
        expect(note(3.5)).toBe('3,5');
        expect(note(4)).toBe('4,0');
        expect(km(1.2)).toBe('1,2');
        expect(pluriel(1, 'note')).toBe('1 note');
        expect(pluriel(0, 'commentaire')).toBe('0 commentaire');
        expect(pluriel(2, 'lieu', 'x')).toBe('2 lieux');
    });

    it('durées et distances des trajets', () => {
        expect(duree(12 * 60)).toBe('12 min');
        expect(duree(65 * 60)).toBe('1 h 05');
        expect(distanceTrajet(1250)).toBe(' · 1,3 km');
        expect(distanceTrajet(null)).toBe('');
    });

    it('site web complété en https://', () => {
        expect(lienSite('exemple.fr')).toBe('https://exemple.fr');
        expect(lienSite('http://exemple.fr')).toBe('http://exemple.fr');
    });

    it('échappement du contenu des bulles de la carte', () => {
        expect(echapper('<img src=x onerror="a()">&\'')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
        expect(echapper(null)).toBe('');
    });
});
