// Accès aux données : ressources, historique des taux MAD, particularités, affectations SAMU
import { prisma } from '../../db/prisma.ts';
import { flag, idParam, optional, toFloat, toInt } from '../../db/values.ts';
import { badRequest, notFound } from '../../lib/http-error.ts';
import { isEmail, parseEmailLines } from '../../lib/email.ts';

export const today = () => new Date().toISOString().split('T')[0];
const OPEN_END = '9999-12-31';

/** Chaîne obligatoire : une valeur absente est refusée par la base (comme l'ancien SQL) */
const required = (v: unknown) => (v === null || v === undefined ? (null as any) : String(v));

// ---------- Ressources ----------

/**
 * Comptes experts rattachés à des ressources, par ressource (jointure « ressource ← comptes experts »)
 */
async function expertsByResource(resourceIds: number[]) {
    const experts = await prisma.user.findMany({
        where: { is_expert: 1, resource_id: { in: resourceIds } },
        orderBy: { id: 'asc' }
    });
    const map: Map<number, typeof experts> = new Map();
    for (const u of experts) {
        const id = u.resource_id as number;
        map.set(id, [...(map.get(id) || []), u]);
    }
    return map;
}

/** Ressources avec l'email du compte expert, qui prime sur celui de la ressource (une ligne par compte expert) */
export async function listResources() {
    const resources = await prisma.resource.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }, { id: 'asc' }] });
    const experts = await expertsByResource(resources.map(r => r.id));
    return resources.flatMap(r =>
        (experts.get(r.id) || [null]).map(u => ({
            ...r,
            user_email: u ? u.email : null,
            user_id: u ? u.id : null,
            email: (u && u.email) || r.email
        }))
    );
}

/** Ressources rattachées à un établissement (carte des experts) */
export async function listExpertsMap() {
    const resources = await prisma.resource.findMany({
        where: { AND: [{ es_rattachement: { not: null } }, { es_rattachement: { not: '' } }] },
        select: { id: true, nom: true, prenom: true, trigramme: true, es_rattachement: true, samu: true },
        orderBy: { id: 'asc' }
    });
    const experts = await expertsByResource(resources.map(r => r.id));
    return resources.flatMap(r =>
        (experts.get(r.id) || [null]).map(u => ({ ...r, profile_photo: u ? u.profile_photo : null }))
    );
}

export async function createResource(data: Record<string, any>, createdBy: number) {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } =
        data;
    const { astreinte_volontaire, astreinte_date_activation, is_mad_volante, date_fin_mad, jours_max_mad } = data;
    const { astreinte_ho, astreinte_apd } = data;

    if (!nom || !prenom || !trigramme || !samu) throw badRequest('Champs obligatoires manquants');
    if (!is_mad_volante && !taux) throw badRequest('Champs obligatoires manquants');
    if (is_mad_volante && (!date_fin_mad || !jours_max_mad)) {
        throw badRequest('Date de fin et jours max obligatoires pour une MAD volante');
    }
    checkEmail(email);
    const tauxValue = is_mad_volante ? 0 : parseFloat(taux);
    if (!Number.isFinite(tauxValue)) throw badRequest('Taux invalide');

    const { id } = await prisma.resource.create({
        data: {
            nom: String(nom),
            prenom: String(prenom),
            trigramme: String(trigramme),
            email: optional(email),
            telephone: optional(telephone),
            taux: tauxValue,
            samu: String(samu),
            date_debut: optional(date_debut),
            date_fin: optional(date_fin),
            es_rattachement: optional(es_rattachement),
            fonction: optional(fonction),
            astreinte_volontaire: flag(astreinte_volontaire),
            astreinte_ho: flag(astreinte_ho),
            astreinte_apd: flag(astreinte_apd),
            astreinte_date_activation: optional(astreinte_date_activation),
            is_mad_volante: flag(is_mad_volante),
            date_fin_mad: optional(date_fin_mad),
            jours_max_mad: toInt(jours_max_mad)
        }
    });

    // Période initiale de l'historique MAD (une erreur ici n'annule pas la création)
    await prisma.resourceMadHistory
        .create({
            data: {
                resource_id: id,
                taux: is_mad_volante ? 0 : toFloat(taux),
                date_debut: optional(date_debut) || today(),
                date_fin: is_mad_volante ? optional(date_fin_mad) : null,
                volante: flag(is_mad_volante),
                jours_max: is_mad_volante ? toInt(jours_max_mad) : null,
                astreinte_ho: flag(astreinte_ho),
                astreinte_hno: flag(astreinte_volontaire),
                astreinte_apd: flag(astreinte_apd),
                created_by: createdBy
            }
        })
        .catch(err => console.error('Erreur création historique MAD:', err));

    return id;
}

/** Adresse e-mail de la ressource : vide ou syntaxe valide */
const checkEmail = (email: unknown) => {
    if (typeof email === 'string' && email.trim() && !isEmail(email)) {
        throw badRequest(`Adresse e-mail invalide : ${email.trim()}`);
    }
};

/** Contacts RH : une adresse valide par ligne ; renvoie la liste normalisée (sans ligne vide ni doublon) ou null */
const checkContactsRh = (text: unknown) => {
    const { valid, invalid } = parseEmailLines(text);
    if (invalid.length) throw badRequest(`Contacts RH : adresse(s) e-mail invalide(s) : ${invalid.join(', ')}`);
    return valid.length ? valid.join('\n') : null;
};

export async function updateResource(id: string | number, data: Record<string, any>) {
    const { nom, prenom, trigramme, email, telephone, taux, samu, date_debut, date_fin, es_rattachement, fonction } =
        data;
    const {
        contacts_rh,
        astreinte_volontaire,
        astreinte_ho,
        astreinte_apd,
        astreinte_date_activation,
        is_mad_volante,
        date_fin_mad,
        jours_max_mad
    } = data;
    const resourceId = idParam(id);
    checkEmail(email);
    const contactsRh = checkContactsRh(contacts_rh);

    await prisma.resource.updateMany({
        where: { id: resourceId },
        data: {
            nom: required(nom),
            prenom: required(prenom),
            trigramme: required(trigramme),
            email: optional(email),
            telephone: optional(telephone),
            taux: is_mad_volante ? 0 : parseFloat(taux) || 0,
            samu: required(samu),
            date_debut: optional(date_debut),
            date_fin: optional(date_fin),
            es_rattachement: optional(es_rattachement),
            fonction: optional(fonction),
            contacts_rh: contactsRh,
            astreinte_volontaire: flag(astreinte_volontaire),
            astreinte_ho: flag(astreinte_ho),
            astreinte_apd: flag(astreinte_apd),
            astreinte_date_activation: optional(astreinte_date_activation),
            is_mad_volante: flag(is_mad_volante),
            date_fin_mad: optional(date_fin_mad),
            jours_max_mad: toInt(jours_max_mad)
        }
    });
    await appliquerFicheALaPeriode(resourceId, data);
    // Une ressource volontaire aux astreintes (HNO ou HO) doit avoir un compte expert
    if (astreinte_volontaire || astreinte_ho) {
        await prisma.user.updateMany({ where: { resource_id: resourceId }, data: { is_expert: 1 } }).catch(() => {});
    }
}

/** Supprime la ressource et ses données rattachées (historique MAD, affectations SAMU, planning) */
export async function deleteResource(id: string | number) {
    const resource_id = idParam(id);
    await prisma.resource.deleteMany({ where: { id: resource_id } });
    await Promise.all([
        prisma.resourceMadParticularite.deleteMany({ where: { resource_id } }),
        prisma.resourceMadHistory.deleteMany({ where: { resource_id } }),
        prisma.resourceSamuAssignment.deleteMany({ where: { resource_id } })
    ]).catch(err => console.error('Erreur suppression données ressource:', err));
    await prisma.scheduleData
        .deleteMany({ where: { resource_id } })
        .catch(err => console.error('Erreur suppression schedule:', err));
}

/** Bascule actif / inactif ; renvoie le nouvel état */
export async function toggleResource(id: string | number) {
    const resource = await prisma.resource.findUnique({
        where: { id: idParam(id) },
        select: { id: true, actif: true }
    });
    if (!resource) throw notFound('Ressource non trouvée');
    const actif = resource.actif === 1 ? 0 : 1;
    await prisma.resource.update({ where: { id: resource.id }, data: { actif } });
    return actif;
}

/** Types d'astreinte déclarables par une ressource : colonne de la table resources */
const ASTREINTE_COLUMNS = {
    hno: 'astreinte_volontaire',
    ho: 'astreinte_ho',
    apd: 'astreinte_apd'
} as const;

/**
 * Déclaration d'une ressource pour un type d'astreinte : HO (heures ouvrées), HNO (heures non ouvrées) ou APD
 * (accompagnement post démarrage). HNO et HO impliquent le profil expert pour les comptes rattachés.
 * @param [type] 'hno' (défaut), 'ho' ou 'apd'
 */
export async function setAstreinteVolontaire(id: string | number, enabled: boolean, type: string = 'hno') {
    const column = ASTREINTE_COLUMNS[type as keyof typeof ASTREINTE_COLUMNS];
    if (!column) throw badRequest("Type d'astreinte inconnu (ho, hno ou apd)");
    const resourceId = idParam(id);
    // Les astreintes sont celles d'une période de MAD : la bascule vise la période en cours (créée au besoin)
    const periodes = await listMadHistory(resourceId);
    const courante = periodeEnCours(periodes);
    const champ = { ho: 'astreinte_ho', hno: 'astreinte_hno', apd: 'astreinte_apd' }[type] as
        'astreinte_ho' | 'astreinte_hno' | 'astreinte_apd';
    if (courante)
        await prisma.resourceMadHistory.update({ where: { id: courante.id }, data: { [champ]: flag(enabled) } });
    await prisma.resource.updateMany({ where: { id: resourceId }, data: { [column]: flag(enabled) } });
    if (courante) await syncResource(resourceId);
    if (enabled && type !== 'apd') {
        await prisma.user.updateMany({ where: { resource_id: resourceId }, data: { is_expert: 1 } }).catch(() => {});
    }
}

// ---------- Affectations SAMU (principal / secondaire) ----------

const SAMU_ASSIGNMENT_FIELDS = { id: true, resource_id: true, samu: true, role: true };

export function listAllSamuAssignments() {
    return prisma.resourceSamuAssignment.findMany({
        select: SAMU_ASSIGNMENT_FIELDS,
        orderBy: [{ samu: 'asc' }, { id: 'asc' }]
    });
}

export function listSamuAssignments(resourceId: string | number) {
    return prisma.resourceSamuAssignment.findMany({
        where: { resource_id: idParam(resourceId) },
        select: SAMU_ASSIGNMENT_FIELDS,
        orderBy: [{ samu: 'asc' }, { id: 'asc' }]
    });
}

/**
 * Remplace toutes les affectations SAMU d'une ressource. Un SAMU cité deux fois n'est retenu qu'une fois
 * (première occurrence, principal avant secondaire).
 */
export async function replaceSamuAssignments(resourceId: string | number, principal: unknown, secondaire: unknown) {
    const resource_id = idParam(resourceId);
    const bySamu: Map<string, string> = new Map();
    for (const [list, role] of [
        [principal, 'principal'],
        [secondaire, 'secondaire']
    ] as const) {
        for (const samu of Array.isArray(list) ? list : []) {
            const name = typeof samu === 'string' ? samu.trim() : '';
            if (name && !bySamu.has(name)) bySamu.set(name, role);
        }
    }
    await prisma.$transaction([
        prisma.resourceSamuAssignment.deleteMany({ where: { resource_id } }),
        prisma.resourceSamuAssignment.createMany({
            data: [...bySamu].map(([samu, role]) => ({ resource_id, samu, role }))
        })
    ]);
}

// ---------- Historique des taux MAD ----------

export function listMadHistory(resourceId: string | number) {
    return prisma.resourceMadHistory.findMany({
        where: { resource_id: idParam(resourceId) },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
}

/**
 * Refuse une période qui partage au moins un jour avec une autre (des périodes contiguës sont admises)
 */
function assertNoMadOverlap(
    others: Array<{ date_debut: string; date_fin: string | null }>,
    start: string,
    end: string | null | undefined
) {
    const thisEnd = end || OPEN_END;
    for (const other of others) {
        const overlapStart = start > other.date_debut ? start : other.date_debut;
        const otherEnd = other.date_fin || OPEN_END;
        const overlapEnd = thisEnd < otherEnd ? thisEnd : otherEnd;
        if (overlapStart <= overlapEnd) {
            throw badRequest(
                `Chevauchement de dates détecté avec la période ${other.date_debut} - ${other.date_fin || 'en cours'}`
            );
        }
    }
}

type PeriodeMad = { id: number; date_debut: string; date_fin: string | null };

/** Période MAD « en cours » : celle d'aujourd'hui, à défaut la prochaine, à défaut la dernière terminée */
export function periodeEnCours<T extends PeriodeMad>(periodes: T[], jour = today()): T | undefined {
    const tri = [...periodes].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
    return (
        tri.find(p => p.date_debut <= jour && (!p.date_fin || p.date_fin >= jour)) ??
        tri.find(p => p.date_debut > jour) ??
        tri[tri.length - 1]
    );
}

/**
 * Type, taux, quota et astreintes de la ressource (liste, planification, CRA, astreintes) : ceux de sa période MAD
 * en cours. `expert` : une astreinte HO ou HNO donne le profil expert aux comptes rattachés (action de l'utilisateur).
 */
async function syncResource(resourceId: number, expert = false) {
    const current = periodeEnCours(await listMadHistory(resourceId));
    if (!current) return;
    await prisma.resource.updateMany({ where: { id: resourceId }, data: donneesResource(current) });
    if (expert && (current.astreinte_ho || current.astreinte_hno)) {
        await prisma.user.updateMany({ where: { resource_id: resourceId }, data: { is_expert: 1 } }).catch(() => {});
    }
}

type PeriodeSync = Awaited<ReturnType<typeof listMadHistory>>[number];

/** Colonnes de la ressource qui suivent sa période en cours */
const donneesResource = (p: PeriodeSync) => ({
    is_mad_volante: p.volante ? 1 : 0,
    taux: p.volante ? 0 : p.taux,
    date_fin_mad: p.volante ? p.date_fin : null,
    jours_max_mad: p.volante ? p.jours_max : null,
    astreinte_ho: p.astreinte_ho ?? 0,
    astreinte_volontaire: p.astreinte_hno ?? 0,
    astreinte_apd: p.astreinte_apd ?? 0
});

/**
 * Toutes les ressources reprennent les valeurs de leur période en cours : la période en cours change avec la date
 * (démarrage ou fin d'une période) sans que personne ne modifie la ressource. Appelée au démarrage puis chaque heure.
 */
export async function syncToutesLesRessources(jour = today()) {
    const [periodes, ressources] = await Promise.all([
        prisma.resourceMadHistory.findMany({ orderBy: [{ date_debut: 'asc' }, { id: 'asc' }] }),
        prisma.resource.findMany()
    ]);
    const parRessource = new Map<number, PeriodeSync[]>();
    for (const p of periodes) parRessource.set(p.resource_id, [...(parRessource.get(p.resource_id) ?? []), p]);
    let modifiees = 0;
    for (const r of ressources) {
        const courante = periodeEnCours(parRessource.get(r.id) ?? [], jour);
        if (!courante) continue;
        const voulu = donneesResource(courante);
        const change = (Object.keys(voulu) as Array<keyof typeof voulu>).some(
            k => (r[k] ?? null) !== (voulu[k] ?? null)
        );
        if (!change) continue;
        await prisma.resource.updateMany({ where: { id: r.id }, data: voulu });
        modifiees++;
    }
    return modifiees;
}

/** Astreintes (HO, HNO, APD) d'un corps de requête ; champs absents : undefined (valeur conservée) */
function astreintesDuCorps(b: Record<string, unknown>) {
    const lire = (v: unknown) => (v === undefined || v === null ? undefined : flag(v));
    return {
        astreinte_ho: lire(b.astreinte_ho),
        astreinte_hno: lire(b.astreinte_hno ?? b.astreinte_volontaire),
        astreinte_apd: lire(b.astreinte_apd)
    };
}

/** Corps d'une période : MAD volante (taux 0, date de fin et jours max obligatoires) ou classique (taux obligatoire) */
function madPeriodData(b: { taux?: unknown; volante?: unknown; jours_max?: unknown; date_fin?: unknown }) {
    if (flag(b.volante)) {
        const jours = toInt(b.jours_max);
        if (!optional(b.date_fin as string) || !jours || jours < 1) {
            throw badRequest('Date de fin et jours max obligatoires pour une MAD volante');
        }
        return { taux: 0, volante: 1, jours_max: jours };
    }
    if (b.taux === undefined || b.taux === null || b.taux === '') throw badRequest('Taux et date de début requis');
    return { taux: toFloat(b.taux), volante: 0, jours_max: null };
}

/**
 * Fiche de la ressource : son type de MAD, ses dates et son quota sont ceux de la période indiquée (periode_id), à
 * défaut de la période en cours (créée au besoin). Dates de la période : periode_debut et periode_fin si elles sont
 * données (MAD volante ou classique), sinon date_debut et date_fin_mad pour une MAD volante.
 */
async function appliquerFicheALaPeriode(resource_id: number, data: Record<string, any>) {
    const { is_mad_volante, date_debut, date_fin_mad, jours_max_mad, taux, periode_id, periode_debut, periode_fin } =
        data;
    const periodes = await listMadHistory(resource_id);
    const indiquee = optional(periode_id) ? periodes.find(p => p.id === idParam(periode_id)) : undefined;
    if (optional(periode_id) && !indiquee) throw notFound('Période MAD non trouvée');
    const cible = indiquee ?? periodeEnCours(periodes);
    const volante = flag(is_mad_volante);
    const avecDates = periode_debut !== undefined;
    const debut = avecDates
        ? optional(periode_debut)
        : volante
          ? (optional(date_debut) ?? cible?.date_debut ?? today())
          : (cible?.date_debut ?? today());
    const fin = avecDates ? optional(periode_fin) : volante ? optional(date_fin_mad) : (cible?.date_fin ?? null);
    if (!debut) throw badRequest('Date de début de la période requise');
    if (fin && fin < debut) throw badRequest('La date de fin doit être postérieure à la date de début');
    const type = volante
        ? { volante: 1, taux: 0, jours_max: toInt(jours_max_mad) }
        : {
              volante: 0,
              jours_max: null,
              taux: Number.isFinite(parseFloat(taux)) ? parseFloat(taux) : (cible?.taux ?? 0)
          };
    const datesChangent = !cible || cible.date_debut !== debut || cible.date_fin !== fin;
    if (datesChangent) {
        assertNoMadOverlap(
            periodes.filter(p => p.id !== cible?.id),
            debut,
            fin
        );
    }
    const valeurs = { ...type, ...astreintesDuCorps(data), date_debut: debut, date_fin: fin };
    if (cible) await prisma.resourceMadHistory.update({ where: { id: cible.id }, data: valeurs });
    else await prisma.resourceMadHistory.create({ data: { resource_id, ...valeurs } });
    await syncResource(resource_id, true);
    // Début de la ressource : celui de sa première période (si les dates de la période ont été saisies)
    if (avecDates) {
        const premiere = (await listMadHistory(resource_id))[0];
        if (premiere)
            await prisma.resource.updateMany({ where: { id: resource_id }, data: { date_debut: premiere.date_debut } });
    }
}

export async function addMadPeriod(
    resourceId: string | number,
    body: {
        taux?: unknown;
        date_debut?: string;
        date_fin?: string;
        volante?: unknown;
        jours_max?: unknown;
        astreinte_ho?: unknown;
        astreinte_hno?: unknown;
        astreinte_apd?: unknown;
    },
    createdBy: number
) {
    if (!body.date_debut) throw badRequest('Taux et date de début requis');
    const resource_id = idParam(resourceId);
    const start = String(body.date_debut);
    const end = optional(body.date_fin);
    const type = madPeriodData(body);

    const existantes = await listMadHistory(resource_id);
    assertNoMadOverlap(existantes, start, end);
    // Astreintes non indiquées : celles de la période en cours (continuité d'une période à la suivante)
    const heritage = periodeEnCours(existantes);
    const indiquees = astreintesDuCorps(body);
    const astreintes = {
        astreinte_ho: indiquees.astreinte_ho ?? heritage?.astreinte_ho ?? 0,
        astreinte_hno: indiquees.astreinte_hno ?? heritage?.astreinte_hno ?? 0,
        astreinte_apd: indiquees.astreinte_apd ?? heritage?.astreinte_apd ?? 0
    };
    const { id } = await prisma.resourceMadHistory.create({
        data: { resource_id, ...type, ...astreintes, date_debut: start, date_fin: end, created_by: createdBy }
    });
    await syncResource(resource_id, true);
    return id;
}

export async function updateMadPeriod(
    resourceId: string | number,
    historyId: string | number,
    body: {
        taux?: unknown;
        date_debut: string;
        date_fin?: string;
        volante?: unknown;
        jours_max?: unknown;
        astreinte_ho?: unknown;
        astreinte_hno?: unknown;
        astreinte_apd?: unknown;
    }
) {
    const resource_id = idParam(resourceId);
    const id = idParam(historyId);
    const start = required(body.date_debut);
    const end = optional(body.date_fin);
    const type = madPeriodData(body);

    const others = await prisma.resourceMadHistory.findMany({ where: { resource_id, id: { not: id } } });
    assertNoMadOverlap(others, start, end);
    await prisma.resourceMadHistory.updateMany({
        where: { id, resource_id },
        data: { ...type, ...astreintesDuCorps(body), date_debut: start, date_fin: end }
    });
    await syncResource(resource_id, true);
}

/** Supprime une période MAD et ses particularités ; la dernière période ne peut pas être supprimée */
export async function deleteMadPeriod(resourceId: string | number, historyId: string | number) {
    const resource_id = idParam(resourceId);
    const id = idParam(historyId);
    if ((await prisma.resourceMadHistory.count({ where: { resource_id } })) <= 1) {
        throw badRequest('Impossible de supprimer le dernier taux MAD');
    }
    await prisma.resourceMadParticularite.deleteMany({ where: { mad_history_id: id } });
    await prisma.resourceMadHistory.deleteMany({ where: { id, resource_id } });
    await syncResource(resource_id);
}

// ---------- Particularités MAD (taux temporaire à l'intérieur d'une période) ----------

export function listParticularites(resourceId: string | number, historyId: string | number) {
    return prisma.resourceMadParticularite.findMany({
        where: { resource_id: idParam(resourceId), mad_history_id: idParam(historyId) },
        orderBy: [{ date_debut: 'asc' }, { id: 'asc' }]
    });
}

/** Particularités de la même période qui chevauchent [start, end] */
function findParticulariteOverlaps(
    resource_id: number,
    mad_history_id: number,
    start: string,
    end: string,
    excludeId = null as number | null
) {
    return prisma.resourceMadParticularite.findMany({
        where: {
            resource_id,
            mad_history_id,
            ...(excludeId !== null ? { id: { not: excludeId } } : {}),
            OR: [
                { date_debut: { lte: start }, date_fin: { gte: start } },
                { date_debut: { lte: end }, date_fin: { gte: end } },
                { date_debut: { gte: start, lte: end } }
            ]
        }
    });
}

export async function addParticularite(
    resourceId: string | number,
    historyId: string | number,
    { taux, date_debut, date_fin, motif }: { taux?: unknown; date_debut?: string; date_fin?: string; motif?: string },
    createdBy: number
) {
    if (taux === undefined || !date_debut || !date_fin) {
        throw badRequest('Taux, date de début et date de fin requis');
    }
    const resource_id = idParam(resourceId);
    const mad_history_id = idParam(historyId);
    const start = String(date_debut);
    const end = String(date_fin);

    const parent = await prisma.resourceMadHistory.findFirst({ where: { id: mad_history_id, resource_id } });
    if (!parent) throw notFound('Période MAD non trouvée');
    if (start < parent.date_debut || (parent.date_fin && end > parent.date_fin)) {
        throw badRequest('Les dates doivent être dans la période MAD parente');
    }
    if ((await findParticulariteOverlaps(resource_id, mad_history_id, start, end)).length > 0) {
        throw badRequest('Chevauchement de dates détecté avec une particularité existante');
    }

    const { id } = await prisma.resourceMadParticularite.create({
        data: {
            resource_id,
            mad_history_id,
            taux: toFloat(taux),
            date_debut: start,
            date_fin: end,
            motif: optional(motif),
            created_by: createdBy
        }
    });
    return id;
}

export async function updateParticularite(
    resourceId: string | number,
    historyId: string | number,
    particulariteId: string | number,
    { taux, date_debut, date_fin, motif }: { taux?: unknown; date_debut: string; date_fin: string; motif?: string }
) {
    const id = idParam(particulariteId);
    const start = required(date_debut);
    const end = required(date_fin);
    const overlaps = await findParticulariteOverlaps(idParam(resourceId), idParam(historyId), start, end, id);
    if (overlaps.length > 0) throw badRequest('Chevauchement de dates détecté');

    await prisma.resourceMadParticularite.updateMany({
        where: { id },
        data: {
            taux: taux === undefined ? (null as any) : toFloat(taux),
            date_debut: start,
            date_fin: end,
            motif: optional(motif)
        }
    });
}

export async function deleteParticularite(resourceId: string | number, particulariteId: string | number) {
    await prisma.resourceMadParticularite.deleteMany({
        where: { id: idParam(particulariteId), resource_id: idParam(resourceId) }
    });
}

/**
 * Taux MAD applicable à une date : particularité, sinon période de l'historique, sinon taux de la ressource
 * @param date AAAA-MM-JJ
 */
export async function getEffectiveMadRate(resourceId: string | number, date: string) {
    const resource_id = idParam(resourceId);
    const particularite = await prisma.resourceMadParticularite.findFirst({
        where: { resource_id, date_debut: { lte: date }, date_fin: { gte: date } },
        orderBy: { id: 'asc' }
    });
    if (particularite) return { taux: particularite.taux, source: 'particularite', particularite };

    const history = await prisma.resourceMadHistory.findFirst({
        where: { resource_id, date_debut: { lte: date }, OR: [{ date_fin: null }, { date_fin: { gte: date } }] },
        orderBy: { id: 'asc' }
    });
    if (history) return { taux: history.taux, source: 'history', history };

    const resource = await prisma.resource.findUnique({ where: { id: resource_id }, select: { taux: true } });
    return { taux: resource ? resource.taux : 0, source: 'resource' };
}
