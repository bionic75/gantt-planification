import { describe, expect, it } from 'vitest';
import type { CraListe, CraSupprime, JournalDiffusion } from '@/api/cra';
import type { Utilisateur } from '@/api/utilisateurs';
import {
    ajouterDestinataire,
    adresseValide,
    annees,
    etatEnvoi,
    libelleDestinataire,
    periodesLancement,
    renvoiPossible,
    restaurerVers,
    statutTableau,
    suggestions,
    trier,
    typeDestinataire
} from './administration';

const ligne = (champs: Partial<CraListe>): CraListe =>
    ({
        id: 1,
        user_id: 1,
        mois: 1,
        annee: 2093,
        statut: 'diffuse',
        archived: 0,
        created_at: null,
        submitted_at: null,
        vise_n1_at: null,
        vise_n2_at: null,
        diffuse_at: null,
        refuse_at: null,
        commentaire_expert: null,
        commentaire_refus: null,
        modifie_admin_at: null,
        modifie_admin_nom: null,
        pdf_filename: null,
        vise_n1_nom: '',
        vise_n2_nom: '',
        expert_nom: '',
        nb_lignes: 0,
        ...champs
    }) as CraListe;

describe('lancement et filtres', () => {
    it('treize périodes, du même mois de l’année précédente au mois courant', () => {
        const p = periodesLancement(new Date(2026, 10, 2));
        expect(p).toHaveLength(13);
        expect(p[0]).toEqual({ valeur: '11:2025', libelle: 'Novembre 2025' });
        expect(p[12]).toEqual({ valeur: '11:2026', libelle: 'Novembre 2026' });
    });

    it('années : l’année courante et les cinq précédentes', () => {
        expect(annees(new Date(2026, 0, 1))).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
    });
});

describe('tableaux', () => {
    it('statuts affichés', () => {
        expect(statutTableau('soumis')).toBe('📤 Soumis');
        expect(statutTableau(null)).toBe('—');
        expect(statutTableau('autre')).toBe('autre');
    });

    it('tri : période numérique, lignes numériques, dates ISO, texte en français', () => {
        const liste = [
            ligne({ id: 1, mois: 12, annee: 2092, nb_lignes: 10, expert_nom: 'Émile' }),
            ligne({ id: 2, mois: 2, annee: 2093, nb_lignes: 9, expert_nom: 'Bruno' }),
            ligne({ id: 3, mois: 1, annee: 2093, nb_lignes: 2, expert_nom: 'Zoé' })
        ];
        expect(trier(liste, 1, true).map(c => c.id)).toEqual([1, 3, 2]);
        expect(trier(liste, 7, false).map(c => c.id)).toEqual([1, 2, 3]);
        expect(trier(liste, 0, true).map(c => c.id)).toEqual([2, 1, 3]);
    });

    it('restauration vers la section d’origine', () => {
        const c = (champs: Partial<CraSupprime>) =>
            ({ pre_delete_archived: 0, pre_delete_statut: 'soumis', ...champs }) as CraSupprime;
        expect(restaurerVers(c({ pre_delete_archived: 1 }))).toBe('↩️ Vers Archives');
        expect(restaurerVers(c({ pre_delete_statut: 'diffuse' }))).toBe('↩️ Vers Signés');
        expect(restaurerVers(c({}))).toBe('↩️ Vers En cours');
    });
});

describe('diffusion', () => {
    it('destinataires : adresse avec « @ », sans doublon, libellé', () => {
        expect(adresseValide('rh@x.fr')).toBe(true);
        expect(adresseValide('sans-arobase')).toBe(false);
        const l = ajouterDestinataire([{ email: 'a@x.fr', nom: 'A' }], { email: 'a@x.fr', nom: '' });
        expect(l).toHaveLength(1);
        expect(libelleDestinataire(l[0]!)).toBe('A <a@x.fr>');
        expect(libelleDestinataire({ email: 'b@x.fr', nom: '' })).toBe('b@x.fr');
    });

    it('suggestions : deux caractères au moins, adresse, nom ou prénom, huit au plus', () => {
        const u = (i: number, champs: Partial<Utilisateur> = {}) =>
            ({ id: i, email: `u${i}@x.fr`, nom: 'Martin', prenom: 'Léa', ...champs }) as Utilisateur;
        const liste = Array.from({ length: 10 }, (_, i) => u(i));
        expect(suggestions(liste, 'm')).toEqual([]);
        expect(suggestions(liste, 'mar')).toHaveLength(8);
        expect(suggestions([u(1, { email: '' })], 'mar')).toEqual([]);
        expect(suggestions([u(1)], 'U1@').map(x => x.id)).toEqual([1]);
    });

    it('journal : type, état et renvoi (sauf profil RH)', () => {
        expect(typeDestinataire('drh_ans').libelle).toBe('DRH ANS');
        expect(typeDestinataire('rh_es').libelle).toBe('DRH ES');
        const l = (email_status: JournalDiffusion['email_status']) =>
            ({ email_status, error_message: null }) as JournalDiffusion;
        expect(etatEnvoi(l('sent'))).toMatchObject({ icone: '✅', libelle: 'Envoyé' });
        expect(etatEnvoi(l(null)).libelle).toBe('Inconnu');
        expect(renvoiPossible(l('failed'), 'admin')).toBe(true);
        expect(renvoiPossible(l('pending'), 'rh')).toBe(false);
        expect(renvoiPossible(l('sent'), 'admin')).toBe(false);
    });
});
