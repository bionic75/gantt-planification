// Paramétrages divers (administration) : paramètres, aide en ligne, dump et restauration, thèmes
import { api, ErreurApi } from '@/api/client';
import { emettre } from '@/liaison';

/** GET /settings : paramètres (texte) par clé */
export type Parametres = Record<string, string | undefined>;

export interface InfoAide {
    exists: boolean;
    updatedAt?: string;
}

export interface PeriodeTheme {
    auto?: boolean;
    start?: string;
    end?: string;
    before?: number;
    after?: number;
}

export interface ConfigThemes {
    mode: 'off' | 'auto' | 'forced';
    forced: string;
    intensity: 'sobre' | 'decore' | 'anime';
    themes: Record<string, PeriodeTheme>;
}

/** Analyse d'un dump envoyé (POST /admin/dump/inspect) */
export interface AnalyseDump {
    token: string;
    filename: string;
    fileSize: number;
    versionRelation: number;
    warnings?: Array<{ level: 'danger' | 'warn' | 'info'; text: string }>;
    schemaDiff?: { columnsIgnored?: Record<string, string[]>; columnsDefaulted?: Record<string, string[]> };
    manifest: {
        db: { size: number };
        createdAt: string;
        createdBy?: { nom?: string };
        appVersion?: string;
        source?: { host?: string; hostname?: string };
        totalRows: number;
        tables?: Record<string, number>;
        files?: unknown[];
    };
    current: { appVersion?: string; hostname: string; tables?: Record<string, number> };
}

export interface ResultatRestauration {
    durationMs: number;
    rows: number;
    tables: number;
    pdfs: number;
    safetyBackup: string;
}

export const apiParametres = {
    lire: () => api.get<Parametres>('/settings'),
    enregistrer: (key: string, value: string) => api.put<{ success: boolean }>('/settings', { key, value })
};

export const apiAide = {
    info: () => api.get<InfoAide>('/help/info'),
    envoyer: (content: string) => api.post<{ success: boolean; error?: string }>('/help/upload', { content }),
    supprimer: () => api.delete('/help/upload')
};

export const apiThemes = {
    lire: () => api.get<ConfigThemes>('/theme'),
    enregistrer: (config: ConfigThemes) => api.put<ConfigThemes>('/theme', config)
};

/** Erreur d'une réponse non JSON ou en échec ; 401 de session : signalée comme les autres appels */
async function erreurReponse(r: Response): Promise<ErreurApi> {
    const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    if (r.status === 401) emettre('session-perdue', { message: d.message });
    return new ErreurApi(r.status, d.error || `Erreur ${r.status}`, d);
}

export const apiDump = {
    /** Dump complet : contenu et nom de fichier proposé par le serveur */
    async generer(): Promise<{ contenu: Blob; nom: string }> {
        const r = await fetch('/api/admin/dump', { credentials: 'include' });
        if (!r.ok) throw await erreurReponse(r);
        return { contenu: await r.blob(), nom: r.headers.get('X-Dump-Filename') || 'gantt-dump.gpdump' };
    },
    /** Envoi du dump à analyser, progression de l'envoi signalée (octets envoyés, total) */
    analyser(fichier: File, progression: (envoye: number, total: number) => void, finEnvoi: () => void) {
        return new Promise<AnalyseDump>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/admin/dump/inspect');
            xhr.withCredentials = true;
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.setRequestHeader('X-Dump-Filename', encodeURIComponent(fichier.name));
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) progression(e.loaded, e.total);
            };
            xhr.upload.onload = finEnvoi;
            xhr.onload = () => {
                let d: { error?: string } & Partial<AnalyseDump> = {};
                try {
                    d = JSON.parse(xhr.responseText);
                } catch {
                    /* réponse illisible */
                }
                if (xhr.status === 200) resolve(d as AnalyseDump);
                else reject(new ErreurApi(xhr.status, d.error || `Erreur ${xhr.status}`, d));
            };
            xhr.onerror = () => reject(new ErreurApi(0, "Erreur réseau pendant l'envoi."));
            xhr.send(fichier);
        });
    },
    abandonner: (token: string) => api.delete(`/admin/dump/upload/${token}`),
    restaurer: (token: string, confirmation: string, options: { neutralizeEmails: boolean; restorePdfs: boolean }) =>
        api.post<ResultatRestauration>('/admin/dump/restore', { token, confirmation, options })
};
