// Géolocalisation d'une adresse saisie sans suggestion : OpenStreetMap, à défaut la Base Adresse Nationale
import { afterEach, describe, expect, it, vi } from 'vitest';
import { poiGeocode } from '../src/modules/poi/poi.external.ts';

const reponses = (osm: unknown, ban: unknown) => {
    const fetchMock = vi.fn(async (url: string) => {
        const corps = url.startsWith('https://nominatim.') ? osm : ban;
        if (corps instanceof Error) throw corps;
        return { ok: true, json: async () => corps };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};
const ban = (score: number) => ({
    features: [{ geometry: { coordinates: [0.096129, 45.674736] }, properties: { score } }]
});

afterEach(() => vi.unstubAllGlobals());

describe('géolocalisation d’une adresse', () => {
    it('OpenStreetMap d’abord, sans interroger la Base Adresse Nationale', async () => {
        const f = reponses([{ lat: '48.1', lon: '2.1' }], ban(0.9));
        expect(await poiGeocode('adresse connue', '')).toEqual({ lat: 48.1, lng: 2.1 });
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('adresse inconnue d’OpenStreetMap : Base Adresse Nationale', async () => {
        reponses([], ban(0.95));
        expect(await poiGeocode('1 rue de la Combe Jaillou, 16730 Fléac', 'Chez X')).toEqual({
            lat: 45.674736,
            lng: 0.096129
        });
    });

    it('OpenStreetMap indisponible : Base Adresse Nationale', async () => {
        reponses(new Error('hors service'), ban(0.8));
        expect(await poiGeocode('2 rue indisponible, 16000 Angoulême', '')).toEqual({ lat: 45.674736, lng: 0.096129 });
    });

    it('résultat trop incertain, ou nom seul sans adresse : introuvable', async () => {
        reponses([], ban(0.3));
        expect(await poiGeocode('adresse très vague', '')).toBeNull();
        const f = reponses([], ban(0.9));
        expect(await poiGeocode('', 'Un nom seul')).toBeNull();
        expect(f).toHaveBeenCalledTimes(1);
    });
});
