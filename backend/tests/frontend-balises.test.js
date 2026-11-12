// Balises de l'interface Vue injectées dans les pages : feuilles de style d'un point d'entrée et des modules qu'il
// importe (module partagé entre points d'entrée, ex. la mire commune au bureau et au mobile)
import { describe, expect, it } from 'vitest';
import { feuillesDeStyle } from '../src/lib/frontend.js';

describe('feuilles de style d’un point d’entrée', () => {
    const manifeste = {
        'src/principal.ts': { css: ['assets/principal.css'], imports: ['_mire.js', '_runtime.js'] },
        'src/mobile.ts': { css: ['assets/mobile.css'], imports: ['_mire.js'] },
        '_mire.js': { css: ['assets/mire.css'], imports: ['_runtime.js', '_modale.js'] },
        '_modale.js': { css: ['assets/modale.css'], imports: ['_mire.js'] },
        '_runtime.js': {}
    };

    it('modules importés d’abord (cascade : le point d’entrée l’emporte), sans doublon ni boucle', () => {
        expect(feuillesDeStyle(manifeste, 'src/principal.ts')).toEqual([
            'assets/modale.css',
            'assets/mire.css',
            'assets/principal.css'
        ]);
        expect(feuillesDeStyle(manifeste, 'src/mobile.ts')).toEqual([
            'assets/modale.css',
            'assets/mire.css',
            'assets/mobile.css'
        ]);
    });

    it('entrée absente du manifeste : aucune feuille', () => {
        expect(feuillesDeStyle(manifeste, 'src/inconnu.ts')).toEqual([]);
    });
});
