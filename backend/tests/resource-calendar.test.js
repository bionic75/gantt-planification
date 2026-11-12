// Calendrier mensuel d'une ressource (aperçu avant impression, envoi par e-mail) : construction du HTML
import { describe, expect, it } from 'vitest';
import { calendrierRessource } from '../src/modules/notifications/resource-calendar.js';

const ressource = { nom: 'Martin', prenom: 'Léa', trigramme: 'LMA' };
const base = { ressource, annee: 2027, mois: 2, cellules: {}, astreintes: [], aujourdhui: '2000-01-01' };
/** Cellules du jour (balise <td> qui contient le numéro du jour) */
const jour = (html, n) => html.split('<td').find(td => td.includes(`border-radius: 3px;">${n}</div>`));

describe('calendrier d’une ressource', () => {
    it('en-tête, objet et document complet', () => {
        const c = calendrierRessource(base);
        expect(c.titre).toBe('Planning Martin Léa - Mars 2027');
        expect(c.contenu).toContain('<h2 style="margin: 0; color: #2c3e50;">Planning - MARTIN Léa</h2>');
        expect(c.contenu).toContain('Mars 2027');
        expect(c.contenu).toContain('Trigramme: LMA');
        expect(c.document).toMatch(/^<!DOCTYPE html>[\s\S]*<title>Planning Martin Léa - Mars 2027<\/title>/);
    });

    it('semaines ISO du lundi au dimanche (mars 2027 : du lundi 1er, semaines 9 à 13)', () => {
        const c = calendrierRessource(base);
        const semaines = [...c.contenu.matchAll(/font-size: 11px;">(\d+)<\/td>/g)].map(m => Number(m[1]));
        expect(semaines).toEqual([9, 10, 11, 12, 13]);
        // Premier jour en première colonne : aucune case vide avant le 1er
        expect(c.contenu.split('<tbody>')[1].indexOf('#f5f5f5')).toBeGreaterThan(
            c.contenu.split('<tbody>')[1].indexOf('>1</div>')
        );
    });

    it('demi-journées : indisponible par défaut, activité et localisation, en attente sans activité connue', () => {
        const c = calendrierRessource({
            ...base,
            cellules: {
                'available_2027-03-03_AM': '2',
                'activity_2027-03-03_AM': '5',
                'localisation_2027-03-03_AM': 'T',
                'available_2027-03-03_PM': '2',
                'activity_2027-03-03_PM': '99'
            }
        });
        const td = jour(c.contenu, 3);
        expect(td).toContain('<strong>AM:</strong> ANS Dép. (🏠 T)');
        expect(td).toContain('<strong>PM:</strong> En attente');
        expect(jour(c.contenu, 4)).toContain('<strong>AM:</strong> Indisponible');
    });

    it('pastilles ASTR / HNO selon les heures, aucune pour une activité courante', () => {
        const a = (type, debut, fin, hD = null, hF = null) => ({
            id: 1,
            type,
            objet: 'Objet <i>',
            samu: 'SAMU 75',
            tous_samu: 0,
            date_debut: debut,
            date_fin: fin,
            heure_debut: hD,
            heure_fin: hF
        });
        const c = calendrierRessource({
            ...base,
            astreintes: [
                a('astreinte', '2027-03-08', '2027-03-08'),
                a('hno', '2027-03-09', '2027-03-09', '18:00', '22:00'),
                a('activite_courante', '2027-03-10', '2027-03-10')
            ]
        });
        const pastilles = td => [...(td.match(/>(ASTR|HNO)<\/span>/g) || [])].length;
        expect(pastilles(jour(c.contenu, 8))).toBe(2);
        // HNO du soir : après-midi seulement
        const hno = jour(c.contenu, 9);
        expect(hno.split('<strong>PM:</strong>')[0]).not.toContain('>HNO</span>');
        expect(hno.split('<strong>PM:</strong>')[1]).toContain('>HNO</span>');
        expect(pastilles(jour(c.contenu, 10))).toBe(0);
        // Textes échappés
        expect(c.contenu).toContain('Astreinte: Objet &lt;i&gt; - SAMU 75');
    });

    it('jour courant mis en évidence, noms échappés', () => {
        const c = calendrierRessource({
            ...base,
            ressource: { nom: '<b>X', prenom: null, trigramme: null },
            aujourdhui: '2027-03-17'
        });
        expect(jour(c.contenu, 17)).toContain('background-color: #d4edda;');
        expect(c.contenu).toContain('Planning - &lt;B&gt;X');
        expect(c.contenu).not.toContain('<b>X');
    });
});
