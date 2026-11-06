import { describe, expect, it } from 'vitest';
import type { Cra, DetailCra, LigneCra } from '@/api/cra';
import {
    TOUS_SAMU,
    actions,
    bilanCollecte,
    bilanReport,
    bornesMois,
    cartesExpert,
    collecter,
    configCra,
    controleLigne,
    corrections,
    droits,
    enCoursAdmin,
    etapes,
    formulaireDe,
    formulaireVide,
    libelleMois,
    ligneDuFormulaire,
    ligneSaisie,
    messageModifAdmin,
    optionsSamu,
    pastille,
    pdfEnregistre,
    questionReport,
    remplacer,
    rienADeclarerPropose,
    samuLigne,
    signatures,
    trierLignes,
    viseurs,
    vueCra
} from './calculs';

const cra = (champs: Partial<Cra> = {}): Cra => ({
    id: 1,
    user_id: 10,
    mois: 3,
    annee: 2093,
    statut: 'a_completer',
    archived: 0,
    created_at: '2093-03-01T08:00:00Z',
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
    ...champs
});

const detail = (champs: Partial<DetailCra> = {}): DetailCra => ({
    ...cra(),
    expert_nom: 'MARTIN Léa',
    es_rattachement: null,
    expert_samu: null,
    astreintes_hno: [],
    signatures: [],
    ...champs
});

const ligne = (champs: Partial<LigneCra> = {}): LigneCra => ({
    type: 'hno',
    date_debut: '2093-03-05',
    date_fin: '2093-03-05',
    heure_debut: '20:00',
    heure_fin: '22:00',
    samu: 'SAMU 75',
    objet: 'Intervention',
    ...champs
});

const expert = { userId: 10, is_admin: false, activeProfile: 'expert' };
const admin = { userId: 1, is_admin: true, activeProfile: 'admin' };
const libelles = (c: Cra, u: typeof expert, config = {}) => actions(c, droits(c, u, config)).map(a => a.libelle);

describe('cartes', () => {
    it('pastille : statut, ou « Modifier » pour un CRA rappelé ou refusé', () => {
        expect(pastille(cra()).libelle).toBe('À compléter');
        expect(pastille(cra({ refuse_at: '2093-03-02' }))).toEqual({
            cle: 'modifier',
            libelle: 'Modifier',
            icone: '✏️'
        });
        expect(pastille(cra({ statut: 'soumis' })).libelle).toBe('Soumis — en attente visa N1');
    });

    it('administrateur : CRA en cours hors archivés, diffusés et en attente de diffusion', () => {
        const liste = [
            cra({ id: 1 }),
            cra({ id: 2, statut: 'vise_n2' }),
            cra({ id: 3, statut: 'diffuse' }),
            cra({ id: 4, statut: 'vise_n1', archived: 1 }),
            cra({ id: 5, statut: 'vise_n1' })
        ];
        expect(enCoursAdmin(liste).map(c => c.id)).toEqual([1, 5]);
    });

    it('expert : en cours (CRA en attente de diffusion compris) et signés', () => {
        const liste = [
            cra({ id: 1, statut: 'vise_n2' }),
            cra({ id: 2, statut: 'diffuse' }),
            cra({ id: 3, archived: 1 })
        ];
        const c = cartesExpert(liste);
        expect(c.enCours.map(x => x.id)).toEqual([1]);
        expect(c.signes.map(x => x.id)).toEqual([2]);
    });

    it('viseurs et mois', () => {
        expect(viseurs(cra({ vise_n1_nom: 'A B', vise_n2_nom: 'C D' }))).toBe('Viseur N1 : A B | Viseur N2 : C D');
        expect(viseurs(cra())).toBe('');
        expect(libelleMois(3, 2093)).toBe('mars 2093');
    });

    it('vue selon le profil : un compte RH sous le profil expert a la vue RH, comme l’ancien écran', () => {
        expect(vueCra({ activeProfile: 'admin', is_rh: true })).toBe('admin');
        expect(vueCra({ activeProfile: 'expert', is_rh: true })).toBe('rh');
        expect(vueCra({ activeProfile: 'expert', is_rh: false })).toBe('expert');
    });
});

describe('actions proposées', () => {
    it('expert propriétaire, CRA à compléter : saisie, soumission, « Rien à déclarer »', () => {
        expect(libelles(cra(), expert)).toEqual(['✏️ Compléter mon CRA', '📤 Valider et soumettre']);
        expect(libelles(cra({ refuse_at: 'x' }), expert)[0]).toBe('✏️ Corriger/Compléter mon CRA');
        expect(rienADeclarerPropose(cra(), droits(cra(), expert, {}))).toBe(true);
    });

    it('expert propriétaire, CRA soumis : rappel', () => {
        expect(libelles(cra({ statut: 'soumis' }), expert)).toEqual(['✏️ Corriger/Compléter mon CRA']);
    });

    it('administrateur, CRA d’un expert à compléter : modification et renvoi, sans « Rien à déclarer »', () => {
        expect(libelles(cra(), admin)).toEqual([
            '✏️ Modifier ce CRA (admin)',
            "📨 Renvoyer à l'expert pour vérification"
        ]);
        expect(rienADeclarerPropose(cra(), droits(cra(), admin, {}))).toBe(false);
    });

    it('administrateur sans viseur désigné : correction, visas et refus à chaque niveau', () => {
        expect(libelles(cra({ statut: 'soumis' }), admin)).toEqual([
            '🔧 Corriger ce CRA (admin)',
            '✅ Viser (niveau 1)',
            '❌ Refuser'
        ]);
        expect(libelles(cra({ statut: 'vise_n1' }), admin)).toEqual([
            '🔧 Corriger ce CRA (admin)',
            '✅ Viser (niveau 2)',
            '❌ Refuser'
        ]);
        expect(libelles(cra({ statut: 'vise_n2' }), admin)).toEqual([]);
        expect(libelles(cra({ statut: 'diffuse' }), admin)).toEqual([]);
    });

    it('viseurs désignés : chaque administrateur ne vise qu’à son niveau', () => {
        const config = { admin_n1_id: '1', admin_n2_id: 2 };
        expect(libelles(cra({ statut: 'soumis' }), admin, config)).toContain('✅ Viser (niveau 1)');
        expect(libelles(cra({ statut: 'vise_n1' }), admin, config)).toEqual(['🔧 Corriger ce CRA (admin)']);
    });

    it('compte administrateur sous un autre profil : boutons d’administration, comme l’ancien écran', () => {
        const u = { userId: 10, is_admin: true, activeProfile: 'expert' };
        expect(libelles(cra({ statut: 'soumis' }), u)).toContain('🔧 Corriger ce CRA (admin)');
    });

    it('PDF signé enregistré pour un CRA visé N2 ou diffusé', () => {
        expect(pdfEnregistre(cra({ statut: 'vise_n2' }))).toBe(true);
        expect(pdfEnregistre(cra({ statut: 'vise_n1' }))).toBe(false);
    });
});

describe('détail', () => {
    it('étapes : faites, courante (première non faite), noms des viseurs configurés', () => {
        const e = etapes(detail({ submitted_at: '2093-03-04T10:00:00Z' }), { admin_n1_nom: 'Alice N1' });
        expect(e.map(x => x.libelle)).toEqual([
            'Créé',
            "Soumis par l'expert",
            'Visé par Alice N1',
            'Visé par Viseur N2',
            'Diffusé à la RH'
        ]);
        expect(e.map(x => x.fait)).toEqual([true, true, false, false, false]);
        expect(e.map(x => x.courante)).toEqual([false, false, true, false, false]);
        expect(e[1]!.date).toBe('04/03/2093');
    });

    it('signatures : expert puis viseurs, dans l’ordre du circuit', () => {
        const s = signatures(
            detail({ submitted_at: 'a', vise_n1_at: 'b', vise_n1_nom: 'Alice', vise_n2_at: null, expert_nom: '' })
        );
        expect(s.map(x => [x.libelle, x.nom])).toEqual([
            ['Expert', '—'],
            ['Viseur N1', 'Alice']
        ]);
    });

    it('CRA modifié par un administrateur : message pour l’expert ou pour les administrateurs', () => {
        const d = detail({ modifie_admin_at: '2093-03-05T10:00:00Z', modifie_admin_nom: 'Paul Admin' });
        expect(messageModifAdmin(d, 10)).toMatch(/^Paul Admin a modifié ce CRA le .+ Vérifiez-le/);
        expect(messageModifAdmin(d, 1)).toMatch(/^Modifié par Paul Admin le .+ avant toute validation\.$/);
        expect(messageModifAdmin({ ...d, statut: 'soumis' }, 10)).toBeNull();
    });

    it('configuration du workflow illisible : aucune', () => {
        expect(configCra({ automation_4_config: '{' })).toEqual({});
        expect(configCra({ automation_4_config: '{"admin_n1_id":3}' })).toEqual({ admin_n1_id: 3 });
    });
});

describe('saisie des lignes', () => {
    const f = (champs = {}) => ({ ...formulaireVide(), ...ligne(), ...champs });

    it('bornes du mois et SAMU proposés', () => {
        expect(bornesMois(2, 2092)).toEqual({ min: '2092-02-01', max: '2092-02-29' });
        expect(
            optionsSamu([
                {
                    id: 1,
                    libelle_court: 'SAMU 75',
                    libelle_long: 'Paris',
                    adresse: null,
                    latitude: null,
                    longitude: null
                },
                { id: 2, libelle_court: '', libelle_long: 'Lyon', adresse: null, latitude: null, longitude: null }
            ])
        ).toEqual([
            { valeur: 'SAMU 75', libelle: 'SAMU 75 — Paris' },
            { valeur: 'Lyon', libelle: 'Lyon' }
        ]);
    });

    it('contrôles : champs obligatoires, dates, heures', () => {
        expect(controleLigne(f({ objet: '  ' }), [], null)).toBe('Veuillez remplir tous les champs obligatoires (*)');
        expect(controleLigne(f({ date_fin: '2093-03-04' }), [], null)).toBe(
            'La date de fin doit être ≥ à la date de début'
        );
        expect(controleLigne(f({ heure_fin: '20:00' }), [], null)).toBe(
            "L'heure de fin doit être > à l'heure de début"
        );
        // Créneau de nuit sur deux jours
        expect(controleLigne(f({ date_fin: '2093-03-06', heure_fin: '08:00' }), [], null)).toBeNull();
    });

    it('chevauchement d’une ligne du même type refusé, sauf la ligne modifiée', () => {
        const existantes = [ligne({ heure_debut: '21:00', heure_fin: '23:00', objet: 'Déjà là' })];
        expect(controleLigne(f(), existantes, null)).toMatch(/^⚠️ Conflit détecté\n\nUn\(e\) HNO existe déjà/);
        expect(controleLigne(f(), existantes, null)).toContain('📅 05/03/2093  ⏰ 21:00–23:00\n📝 Déjà là');
        expect(controleLigne(f(), existantes, 0)).toBeNull();
        expect(controleLigne(f({ type: 'astreinte' }), existantes, null)).toBeNull();
        // Créneaux contigus : pas de chevauchement
        expect(controleLigne(f({ heure_debut: '23:00', heure_fin: '23:30' }), existantes, null)).toBeNull();
    });

    it('ligne modifiée : identifiant et origine (collecte) conservés, objet sans espaces', () => {
        const origine = { kind: 'activity' };
        const remplacee = ligne({ id: 7, origin: origine, orig: { ...ligne() } });
        const l = ligneDuFormulaire(f({ objet: ' Nouvel objet ' }), remplacee);
        expect(l).toMatchObject({ id: 7, origin: origine, objet: 'Nouvel objet' });
        expect(ligneDuFormulaire(f(), undefined).id).toBeUndefined();
    });
});

describe('collecte depuis la planification', () => {
    it('ajout sans doublon ; ligne identique rattachée à la planification ; ligne différente mise de côté', () => {
        const saisies = [ligne({ objet: 'Identique' }), ligne({ date_debut: '2093-03-10', date_fin: '2093-03-10' })];
        const proposees = [
            ligne({ objet: 'Identique', origin: { o: 1 } }),
            ligne({ date_debut: '2093-03-10', date_fin: '2093-03-10', heure_debut: '21:00', origin: { o: 2 } }),
            ligne({ date_debut: '2093-03-02', date_fin: '2093-03-02', origin: { o: 3 } })
        ];
        const c = collecter(saisies, proposees);
        expect([c.ajoutees, c.doublons, c.differentes.length]).toEqual([1, 1, 1]);
        expect(c.lignes[0]).toMatchObject({ origin: { o: 1 }, orig: { objet: 'Identique' } });
        expect(saisies[0]!.origin).toBeUndefined();
        const r = remplacer(c);
        expect(r.remplacees).toBe(1);
        expect(trierLignes(r.lignes).map(l => [l.date_debut, l.heure_debut])).toEqual([
            ['2093-03-02', '20:00'],
            ['2093-03-05', '20:00'],
            ['2093-03-10', '21:00']
        ]);
        expect(bilanCollecte({ ajoutees: 1, remplacees: 1, doublons: 1, conservees: 0 })).toBe(
            '1 ligne(s) ajoutée(s), 1 remplacée(s), 1 déjà conforme(s). Vérifiez et corrigez si besoin.'
        );
    });

    it('corrections à reporter : lignes collectées dont les dates ou heures ont changé, lignes supprimées', () => {
        const orig = { ...ligne() };
        const lignes = [
            ligne({ origin: { o: 1 }, orig, heure_fin: '23:00' }),
            ligne({ origin: { o: 2 }, orig, objet: 'Objet seul modifié' }),
            ligne()
        ];
        const c = corrections(lignes, [{ o: 3 }]);
        expect(c).toEqual([
            {
                origin: { o: 1 },
                line: { date_debut: '2093-03-05', date_fin: '2093-03-05', heure_debut: '20:00', heure_fin: '23:00' }
            },
            { origin: { o: 3 }, line: null }
        ]);
        expect(questionReport(2, 1)).toMatch(/^Vous avez corrigé 1 ligne\(s\) et supprimé 1 ligne\(s\) issues/);
        expect(bilanReport({ activity: 1, astreinte: 0, skipped: ['a', 'b'] })).toBe(
            'Planification mise à jour : 1 activité(s), 0 astreinte(s).\n\nNon reporté :\n- a\n- b'
        );
    });
});

describe('« Tous les SAMU » (saisie depuis la grille)', () => {
    it('ligne enregistrée, formulaire, ligne saisie et affichage', () => {
        const enregistree = ligneSaisie({
            id: 3,
            type: 'hno',
            date_debut: '2093-03-02',
            date_fin: '2093-03-02',
            heure_debut: '18:00',
            heure_fin: '23:00',
            samu: null,
            objet: 'Nuit',
            tous_samu: 1
        });
        expect(enregistree).toMatchObject({ samu: '', tous_samu: 1 });
        expect(samuLigne(enregistree)).toBe('Tous les SAMU');
        const f = formulaireDe(enregistree);
        expect(f.samu).toBe(TOUS_SAMU);
        expect(ligneDuFormulaire(f, enregistree)).toMatchObject({ id: 3, samu: '', tous_samu: 1 });
        expect(ligneDuFormulaire({ ...f, samu: 'SAMU 75' }, enregistree)).not.toHaveProperty('tous_samu');
        expect(controleLigne(f, [], null)).toBeNull();
    });
});
