// Identifiants de la mire du bureau : identifiants déjà utilisés sur ce poste (le mot de passe n'est jamais mémorisé
// par l'application) et gestionnaire de mots de passe du navigateur (Credential Management)

const CLE = 'gp_known_logins';
/** Nombre d'identifiants retenus */
const MAXIMUM = 8;

export function identifiantsConnus(): string[] {
    try {
        const a: unknown = JSON.parse(localStorage.getItem(CLE) || '[]');
        return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && !!x) : [];
    } catch {
        return [];
    }
}

function enregistrer(liste: string[]) {
    try {
        localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAXIMUM)));
    } catch {
        /* stockage indisponible */
    }
}

/** Identifiant placé en tête (sans doublon, casse ignorée) */
export function retenirIdentifiant(identifiant: string) {
    const u = identifiant.trim();
    if (!u) return;
    enregistrer([u, ...identifiantsConnus().filter(x => x.toLowerCase() !== u.toLowerCase())]);
}

export function oublierIdentifiant(identifiant: string) {
    enregistrer(identifiantsConnus().filter(x => x !== identifiant));
}

/**
 * Identifiants proposés pour la saisie : ceux qui la contiennent (casse ignorée) ; aucun si la saisie est déjà le seul
 * identifiant proposé
 */
export function propositions(saisie: string, connus: string[]): string[] {
    const q = saisie.trim().toLowerCase();
    const liste = connus.filter(x => !q || x.toLowerCase().includes(q));
    if (q && liste.length === 1 && liste[0]!.toLowerCase() === q) return [];
    return liste;
}

interface ConstructeurIdentifiants {
    new (donnees: { id: string; password: string; name?: string }): Credential;
}

/** Gestionnaire de mots de passe du navigateur (absent : la mire propose ses propres identifiants) */
const gestionnaire = (): ConstructeurIdentifiants | undefined =>
    (window as unknown as { PasswordCredential?: ConstructeurIdentifiants }).PasswordCredential;

export const gestionnaireDisponible = () => !!gestionnaire();

/** Comptes enregistrés dans le navigateur, proposés par lui ; null si refusé ou indisponible */
export async function identifiantsDuNavigateur(): Promise<{ id: string; password: string } | null> {
    if (!gestionnaire()) return null;
    try {
        const c = (await navigator.credentials.get({
            password: true,
            mediation: 'required'
        } as CredentialRequestOptions)) as (Credential & { password?: string }) | null;
        return c?.password ? { id: c.id, password: c.password } : null;
    } catch {
        return null;
    }
}

/** Identifiants proposés à l'enregistrement par le navigateur après la connexion */
export function memoriserDansLeNavigateur(id: string, password: string, nom: string) {
    const Constructeur = gestionnaire();
    if (!Constructeur) return;
    try {
        void navigator.credentials.store(new Constructeur({ id, password, name: nom })).catch(() => {});
    } catch {
        /* silencieux */
    }
}
