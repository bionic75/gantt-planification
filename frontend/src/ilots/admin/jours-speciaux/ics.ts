// Fichiers .ics : événements, congés scolaires par zone, apparence des dates particulières (sans affichage)
import type { ApparenceDates } from '@/api/joursSpeciaux';

/** Événement lu (dates AAAA-MM-JJ) ; dtstart et dtend : mêmes dates, attendues par le serveur */
export interface EvenementIcs {
    summary: string;
    start: string;
    end: string;
    dtstart?: string;
    dtend?: string;
}

/** Date .ics (AAAAMMJJ ou AAAAMMJJTHHmmss[Z]) → AAAA-MM-JJ, null si illisible */
export function dateIcs(texte: string): string | null {
    const d = texte.replace('Z', '');
    return d.length >= 8 ? `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}` : null;
}

/**
 * Événements d'un fichier .ics, comme l'ancien écran : lignes repliées recollées ; fin absente = début ; résumé absent
 * = « Événement » ; événements sans début ignorés
 */
export function lireIcs(contenu: string): EvenementIcs[] {
    const evenements: EvenementIcs[] = [];
    const lignes = contenu.split(/\r?\n/);
    let courant: Partial<EvenementIcs> | null = null;
    for (let i = 0; i < lignes.length; i++) {
        let ligne = lignes[i] ?? '';
        while (i + 1 < lignes.length && /^[ \t]/.test(lignes[i + 1] ?? '')) {
            i++;
            ligne += (lignes[i] ?? '').substring(1);
        }
        if (ligne.startsWith('BEGIN:VEVENT')) courant = {};
        else if (ligne.startsWith('END:VEVENT')) {
            if (courant?.start) {
                evenements.push({
                    ...courant,
                    summary: courant.summary || 'Événement',
                    start: courant.start,
                    // Fin absente : celle du début (dtend reste absent, comme dans l'ancien écran)
                    end: courant.end || courant.start
                });
            }
            courant = null;
        } else if (courant) {
            const valeur = ligne.substring(ligne.indexOf(':') + 1).trim();
            if (ligne.startsWith('SUMMARY:') || ligne.startsWith('SUMMARY;')) courant.summary = valeur;
            else if (ligne.startsWith('DTSTART')) {
                const d = dateIcs(valeur) ?? undefined;
                courant.start = d;
                courant.dtstart = d;
            } else if (ligne.startsWith('DTEND')) {
                const d = dateIcs(valeur) ?? undefined;
                courant.end = d;
                courant.dtend = d;
            }
        }
    }
    return evenements;
}

/** Zones (a, b, c) citées par le résumé d'un congé : « Zone A », « Zones A/B/C », « zones A, B et C », « toutes zones »… */
export function zonesDuResume(resume: string): Array<'a' | 'b' | 'c'> {
    const t = resume
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const trouvees = new Set<'a' | 'b' | 'c'>();
    // « zone(s) » suivi d'une ou plusieurs lettres a / b / c séparées par « / , ; & + - et ou » (ou répétant « zone »)
    const motif = /\bzones?\s*:?\s*((?:[abc]\b(?:\s*(?:[\/,;&+-]|\bet\b|\bou\b|\bzones?\b)\s*)*)+)/g;
    for (const m of t.matchAll(motif))
        for (const l of (m[1] ?? '').matchAll(/[abc]/g)) trouvees.add(l[0] as 'a' | 'b' | 'c');
    if (/\btoutes?\s+(?:les\s+)?zones\b/.test(t)) ['a', 'b', 'c'].forEach(l => trouvees.add(l as 'a' | 'b' | 'c'));
    return [...trouvees];
}

/**
 * Congés par zone d'après le résumé ; un congé commun à plusieurs zones (« Zones A/B/C ») est rattaché à chacune d'elles
 */
export function zones(evenements: EvenementIcs[]) {
    const de = (z: 'a' | 'b' | 'c') => evenements.filter(e => zonesDuResume(e.summary).includes(z));
    const zoneA = de('a');
    const zoneB = de('b');
    const zoneC = de('c');
    return { zoneA, zoneB, zoneC, total: zoneA.length + zoneB.length + zoneC.length };
}

// ---------- Apparence des dates particulières ----------

export const APPARENCE_PAR_DEFAUT: ApparenceDates = {
    label: 'JF',
    bgColor: '#ffeb3b',
    textColor: '#000000',
    borderColor: '#fbc02d'
};

/** Apparence enregistrée, valeurs par défaut de l'ancien écran pour les réglages absents */
export const apparence = (c: Partial<ApparenceDates> | undefined): ApparenceDates => ({
    label: c?.label || 'JF',
    bgColor: c?.bgColor || '#ffeb3b',
    textColor: c?.textColor || '#000000',
    borderColor: c?.borderColor || '#fbc02d'
});

/** Préréglages proposés à l'import */
export const PREREGLAGES: Array<{ nom: string } & Omit<ApparenceDates, 'label'>> = [
    { nom: 'Jaune', bgColor: '#ffeb3b', textColor: '#000000', borderColor: '#fbc02d' },
    { nom: 'Rouge', bgColor: '#e53935', textColor: '#ffffff', borderColor: '#b71c1c' },
    { nom: 'Vert', bgColor: '#43a047', textColor: '#ffffff', borderColor: '#2e7d32' },
    { nom: 'Bleu', bgColor: '#1e88e5', textColor: '#ffffff', borderColor: '#1565c0' },
    { nom: 'Violet', bgColor: '#8e24aa', textColor: '#ffffff', borderColor: '#6a1b9a' },
    { nom: 'Orange', bgColor: '#ff9800', textColor: '#000000', borderColor: '#ef6c00' }
];
