import { describe, expect, it } from 'vitest';
import type { DetailCra } from '@/api/cra';
import { pageDocument } from './document';

const cra: DetailCra = {
    id: 1,
    user_id: 10,
    mois: 3,
    annee: 2093,
    statut: 'soumis',
    archived: 0,
    created_at: null,
    submitted_at: '2093-03-04T10:00:00Z',
    vise_n1_at: null,
    vise_n2_at: null,
    diffuse_at: null,
    refuse_at: null,
    commentaire_expert: 'Mois <calme>',
    commentaire_refus: null,
    modifie_admin_at: null,
    modifie_admin_nom: null,
    pdf_filename: null,
    vise_n1_nom: '',
    vise_n2_nom: '',
    expert_nom: 'MARTIN Léa',
    es_rattachement: 'CHU',
    expert_samu: 'SAMU 75',
    astreintes_hno: [
        {
            id: 3,
            type: 'astreinte',
            date_debut: '2093-03-05',
            date_fin: '2093-03-06',
            heure_debut: '18:00',
            heure_fin: '08:00',
            samu: 'SAMU 75',
            objet: 'Nuit <b>agitée</b>'
        }
    ],
    signatures: [{ rang: 1, signer_name: 'Léa Martin', signed_at: '2093-03-04T10:00:00Z', ip_address: null }]
};

describe('document du CRA', () => {
    const page = pageDocument(cra, new Date('2093-04-01T09:00:00Z'));

    it('en-tête, période, statut et lignes', () => {
        expect(page).toContain('<h2>MARTIN Léa — Mars 2093</h2>');
        expect(page).toContain('<td colspan="3" class="statut">Soumis</td>');
        expect(page).toContain('🔔 Astreinte');
        expect(page).toContain('<td>18:00 → 08:00</td>');
    });

    it('signatures : expert signé, visas en attente', () => {
        expect(page).toContain('<div class="sig-name">Léa Martin</div>');
        expect(page).toContain('IP : N/A');
        expect(page.match(/En attente/g)).toHaveLength(2);
    });

    it('texte saisi neutralisé (pas de balise injectée)', () => {
        expect(page).toContain('Nuit &lt;b&gt;agitée&lt;/b&gt;');
        expect(page).toContain('Mois &lt;calme&gt;');
    });

    it('aucune ligne : ligne vide signalée', () => {
        expect(pageDocument({ ...cra, astreintes_hno: [] })).toContain('Aucune activité enregistrée');
    });
});
