// Géolocalisation d'une adresse saisie sans suggestion : OpenStreetMap, à défaut la Base Adresse Nationale
import { afterEach, describe, expect, it, vi } from 'vitest';
import { poiAdresses, poiDepartement, poiGeocode } from '../src/modules/poi/poi.external.ts';

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

describe('adresses proposées pendant la saisie', () => {
    const adresse = (name: string, postcode: string, city: string) => ({
        geometry: { coordinates: [0.1, 45.6] },
        properties: { name, postcode, city, label: `${name} ${postcode} ${city}`, score: 0.7 }
    });

    it('département du SAMU-SAS tiré de son libellé', () => {
        expect(['SAMU-SAS 16', 'SAMU 2A', 'SAMU-SAS 64B', 'SAMU-SAS 971', 'CAPTV 49'].map(poiDepartement)).toEqual([
            '16',
            '2A',
            '64',
            '971',
            '49'
        ]);
        expect([poiDepartement('ANS'), poiDepartement(null)]).toEqual([null, null]);
    });

    it('le département d’abord, complété par le reste de la France sans doublon', async () => {
        const local = adresse('Rue de la Combe', '16730', 'Fléac');
        const f = vi.fn(async (url: string) => ({
            ok: true,
            json: async () => ({
                features: url.includes('depcode=16')
                    ? [local]
                    : [local, adresse('Rue de la Combe', '24000', 'Périgueux')]
            })
        }));
        vi.stubGlobal('fetch', f);
        const r = await poiAdresses('rue de la combe', { departement: '16', lat: 45.65, lng: 0.15 });
        expect(r.map(a => a.address)).toEqual(['Rue de la Combe, 16730 Fléac', 'Rue de la Combe, 24000 Périgueux']);
        expect(r[0]).toMatchObject({ latitude: 45.6, longitude: 0.1 });
        expect(f.mock.calls[0]![0]).toContain('autocomplete=1');
        expect(f.mock.calls[0]![0]).toContain('lat=45.65');
    });

    it('assez de résultats dans le département : une seule requête', async () => {
        const f = vi.fn(async () => ({
            ok: true,
            json: async () => ({ features: [1, 2, 3, 4, 5].map(n => adresse(`${n} rue A`, '16000', 'Angoulême')) })
        }));
        vi.stubGlobal('fetch', f);
        expect(await poiAdresses('rue a', { departement: '16' })).toHaveLength(5);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('service indisponible : erreur signalée', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 503 }))
        );
        await expect(poiAdresses('rue a', {})).rejects.toThrow('503');
    });
});
