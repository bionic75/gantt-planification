// Astreintes HO : mois affiché, semaines, inscriptions effectives (enregistrées et modifications en attente), droits,
// astreinte HO ANS (un ou plusieurs utilisateurs par jour), modifications à enregistrer et messages de l'enregistrement
import { semaineIsoTexte } from '@/outils/semaine';
import type {
    ModificationAns,
    ModificationHo,
    MoisHo,
    NomHo,
    PeriodeHo,
    ResultatHo,
    UtilisateurAns
} from '@/api/astreintes';

export const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
export const PERIODES: Array<{ cle: PeriodeHo; libelle: string }> = [
    { cle: 'AM', libelle: 'Matin' },
    { cle: 'PM', libelle: 'Après-midi' }
];
const MOIS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
];

/** Modifications en attente : « date|période|ressource » → ajout ou retrait */
export type EnAttente = Map<string, 'add' | 'remove'>;
/** Désignations HO ANS en attente : date → utilisateurs désignés, triés (liste vide : jour libéré) */
export type EnAttenteAns = Map<string, number[]>;

// ---------- Dates ----------

const deux = (n: number) => String(n).padStart(2, '0');

/** « AAAA-MM » du jour */
export const moisCourant = (d = new Date()) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}`;

export function decalerMois(mois: string, delta: number) {
    const [a, m] = mois.split('-').map(Number);
    const d = new Date(a!, m! - 1 + delta, 1);
    return moisCourant(d);
}

/** « Mars 2031 » */
export function libelleMois(mois: string) {
    const [a, m] = mois.split('-').map(Number);
    return `${MOIS[m! - 1]} ${a}`;
}

/** « 04/03/2031 » */
export const dateFr = (date: string) => date.split('-').reverse().join('/');

/** Lundi de la semaine d'une date (« AAAA-MM-JJ ») */
export function lundiDe(date: string) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay() || 7));
    return d.toISOString().slice(0, 10);
}

/** Numéro de semaine ISO (règle partagée, outils/semaine.ts) */
export const semaineIso = (date: string) => semaineIsoTexte(date).semaine;

/** « mardi » */
export const nomJour = (date: string) => NOMS_JOURS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;

// ---------- Personnes ----------

type Personne = { prenom: string; nom: string; trigramme: string | null };

export function nomExpert(d: MoisHo, rid: number): Personne {
    const e = d.experts.find(x => x.resource_id === rid) ?? d.names.find((x: NomHo) => x.id === rid);
    return e
        ? { prenom: e.prenom, nom: e.nom, trigramme: e.trigramme }
        : { prenom: '?', nom: `#${rid}`, trigramme: '?' };
}

export function nomAns(d: MoisHo, uid: number): Personne {
    const u = d.ans.users.find(x => x.user_id === uid) ?? d.ans.names.find(x => x.id === uid);
    return u
        ? { prenom: u.prenom, nom: u.nom, trigramme: u.trigramme }
        : { prenom: '?', nom: `#${uid}`, trigramme: '?' };
}

// ---------- Droits ----------

/** Demi-journée modifiable par l'utilisateur : administrateur (tout), expert HO (semaine en cours et suivantes) */
export const demiJourneeModifiable = (d: MoisHo, date: string) =>
    d.me.canEdit && (d.me.isAdmin || lundiDe(date) >= d.me.currentWeek);

/** Jour HO ANS modifiable : administrateur (tout), utilisateur ANS (semaine en cours et suivantes) */
export const jourAnsModifiable = (d: MoisHo, date: string) =>
    d.ans.me.canEdit && (d.ans.me.isAdmin || lundiDe(date) >= d.ans.me.currentWeek);

/** Profil de l'utilisateur pour le planning HO et pour la ligne ANS */
export function droits(d: MoisHo) {
    return {
        ho: d.me.isAdmin ? 'admin' : d.me.canEdit ? 'expert' : 'lecture',
        ans: d.ans.me.isAdmin ? 'admin' : d.ans.me.canEdit ? 'utilisateur' : null
    } as const;
}

// ---------- Inscriptions effectives ----------

export const cle = (date: string, periode: PeriodeHo, rid: number) => `${date}|${periode}|${rid}`;

const enregistre = (d: MoisHo, date: string, periode: PeriodeHo, rid: number) =>
    d.slots.some(s => s.date === date && s.period === periode && s.resource_id === rid);

export type EtatInscription = 'enregistre' | 'ajout' | 'retrait';

/** Experts de la demi-journée avec leur état (enregistré, à ajouter, à retirer) */
export function inscriptions(d: MoisHo, attente: EnAttente, date: string, periode: PeriodeHo) {
    const liste: Array<{ rid: number; etat: EtatInscription }> = [];
    for (const s of d.slots) {
        if (s.date !== date || s.period !== periode) continue;
        liste.push({
            rid: s.resource_id,
            etat: attente.get(cle(date, periode, s.resource_id)) === 'remove' ? 'retrait' : 'enregistre'
        });
    }
    for (const [k, action] of attente) {
        const [jour, p, rid] = k.split('|');
        if (jour === date && p === periode && action === 'add') liste.push({ rid: Number(rid), etat: 'ajout' });
    }
    return liste;
}

/**
 * Ajout ou retrait d'un expert sur la demi-journée (retour à l'état enregistré si déjà modifié) ; renvoie le message
 * de refus, ou null
 */
export function basculer(d: MoisHo, attente: EnAttente, date: string, periode: PeriodeHo, rid: number): string | null {
    const autorise = d.me.canEdit && (d.me.isAdmin || (rid === d.me.resourceId && lundiDe(date) >= d.me.currentWeek));
    if (!autorise)
        return d.me.isAdmin || rid === d.me.resourceId
            ? 'Les semaines passées ne sont plus modifiables.'
            : 'Vous ne pouvez modifier que vos propres inscriptions.';
    const k = cle(date, periode, rid);
    if (attente.has(k)) attente.delete(k);
    else attente.set(k, enregistre(d, date, periode, rid) ? 'remove' : 'add');
    return null;
}

/** Classe d'occupation : vide, un expert, plusieurs */
export const occupation = (n: number) => (n === 0 ? 'ho-empty' : n === 1 ? 'ho-one' : 'ho-multi');

export function titreDemiJournee(d: MoisHo, attente: EnAttente, date: string, periode: PeriodeHo) {
    const presents = inscriptions(d, attente, date, periode).filter(i => i.etat !== 'retrait');
    const libelle = PERIODES.find(p => p.cle === periode)!.libelle.toLowerCase();
    const noms = presents.map(i => {
        const n = nomExpert(d, i.rid);
        return `${n.prenom} ${n.nom}`;
    });
    return `${nomJour(date)} ${dateFr(date)} — ${libelle}${noms.length ? ` : ${noms.join(', ')}` : ' : personne'}`;
}

// ---------- Astreinte HO ANS ----------

const trier = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);

/** Utilisateurs enregistrés en astreinte ce jour-là (triés par identifiant) */
export const titulairesEnregistres = (d: MoisHo, date: string) =>
    trier(d.ans.slots.filter(s => s.date === date).map(s => s.user_id));

/** Utilisateurs en astreinte ce jour-là, modification non enregistrée comprise */
export const titulaires = (d: MoisHo, attente: EnAttenteAns, date: string) =>
    attente.get(date) ?? titulairesEnregistres(d, date);

/** Utilisateurs du jour fixés ; retour à l'état enregistré si la liste est identique */
export function definirTitulaires(d: MoisHo, attente: EnAttenteAns, date: string, ids: number[]) {
    const liste = trier(ids);
    if (liste.join() === titulairesEnregistres(d, date).join()) attente.delete(date);
    else attente.set(date, liste);
}

/** Utilisateur ANS (hors administrateur) : un clic l'ajoute ou le retire, les autres désignés sont conservés */
export function basculerAns(d: MoisHo, attente: EnAttenteAns, date: string) {
    const moi = d.ans.me.userId;
    const t = titulaires(d, attente, date);
    definirTitulaires(d, attente, date, t.includes(moi) ? t.filter(id => id !== moi) : [...t, moi]);
}

export function titreAns(d: MoisHo, attente: EnAttenteAns, date: string) {
    const noms = titulaires(d, attente, date).map(id => {
        const n = nomAns(d, id);
        return `${n.prenom} ${n.nom}`;
    });
    return `Astreinte HO ANS — ${dateFr(date)}${noms.length ? ` : ${noms.join(', ')}` : ' : personne'}`;
}

/**
 * Choix de l'administrateur pour un jour : utilisateurs « Astreinte HO ANS », cochés s'ils sont désignés ; un désigné
 * qui n'a plus la case reste listé pour pouvoir le retirer
 */
export function choixAns(d: MoisHo, attente: EnAttenteAns, date: string) {
    const t = titulaires(d, attente, date);
    const options: UtilisateurAns[] = [...d.ans.users];
    for (const id of t)
        if (!d.ans.users.some(u => u.user_id === id)) options.unshift({ user_id: id, ...nomAns(d, id), email: null });
    return options.map(u => ({ ...u, designe: t.includes(u.user_id) }));
}

// ---------- Enregistrement ----------

export const nombreEnAttente = (attente: EnAttente, attenteAns: EnAttenteAns) => attente.size + attenteAns.size;

export function modifications(attente: EnAttente): ModificationHo[] {
    return [...attente]
        .map(([k, action]) => {
            const [date, period, rid] = k.split('|');
            return { date: date!, period: period as PeriodeHo, resource_id: Number(rid), action };
        })
        .sort(
            (a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period) || a.resource_id - b.resource_id
        );
}

export const modificationsAns = (attente: EnAttenteAns): ModificationAns[] =>
    [...attente].map(([date, user_ids]) => ({ date, user_ids })).sort((a, b) => a.date.localeCompare(b.date));

/** Une ligne par utilisateur ajouté ou retiré (fenêtre d'enregistrement) */
export function changementsAns(d: MoisHo, liste: ModificationAns[]) {
    return liste.flatMap(m => {
        const avant = titulairesEnregistres(d, m.date);
        return [
            ...m.user_ids.filter(id => !avant.includes(id)).map(id => ({ date: m.date, userId: id, ajout: true })),
            ...avant.filter(id => !m.user_ids.includes(id)).map(id => ({ date: m.date, userId: id, ajout: false }))
        ];
    });
}

/** Avertissement sur l'e-mail de mise à jour quand la semaine en cours est modifiée (null sinon) */
export function avertissementEmail(
    d: MoisHo,
    dates: string[],
    ans: boolean
): { envoi: boolean; destinataires: number } | null {
    if (!dates.some(date => lundiDe(date) === d.me.currentWeek)) return null;
    const m = (ans ? d.ans.updateMail : d.updateMail) ?? { enabled: false, recipients: 0 };
    return { envoi: m.enabled, destinataires: m.recipients };
}

const pluriel = (n: number, mot: string) => `${mot}${n > 1 ? 's' : ''}`;

/** « Planning HO enregistré (n modifications). » et e-mails de mise à jour envoyés */
export function messageResultat(r: ResultatHo) {
    const nb = r.applied.length + (r.ans ? r.ans.applied.length : 0);
    let message = `Planning HO enregistré (${nb} ${pluriel(nb, 'modification')}).`;
    const envoyes = [r.mail, r.ans?.mail].filter(m => m && m.sent);
    const destinataires = envoyes.reduce((s, m) => s + (m?.recipients ?? 0), 0);
    if (envoyes.length)
        message += ` ${pluriel(envoyes.length, 'E-mail')} de mise à jour ${pluriel(envoyes.length, 'envoyé')} (${destinataires} ${pluriel(destinataires, 'destinataire')}).`;
    return message;
}
