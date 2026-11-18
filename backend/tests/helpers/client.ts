// Client HTTP minimal avec conservation des cookies (session, appareil de confiance de la double authentification)
import crypto from 'crypto';

/** Réponse de l'API : corps JSON décodé (forme propre à chaque route), sinon texte brut */
export interface Reponse {
    status: number;
    data: any;
    headers: Headers;
}

export type Entetes = Record<string, string>;

export function createClient(baseUrl: string) {
    /** Cookies reçus, par nom */
    const cookies = new Map<string, string>();
    const client = {
        baseUrl,
        /** En-tête Cookie à renvoyer (vide sans cookie) */
        get cookie() {
            return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        },
        /** Valeur d'un cookie reçu */
        cookieValue: (name: string) => cookies.get(name),
        /** Oublie un cookie (autre appareil, cookie supprimé par le navigateur) */
        forgetCookie: (name: string) => cookies.delete(name),
        async request(method: string, url: string, body?: unknown, headers: Entetes = {}): Promise<Reponse> {
            const res = await fetch(baseUrl + url, {
                method,
                redirect: 'manual',
                headers: {
                    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                    ...(cookies.size ? { Cookie: client.cookie } : {}),
                    ...headers
                },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            for (const setCookie of res.headers.getSetCookie()) {
                const [pair] = setCookie.split(';');
                const at = pair.indexOf('=');
                cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1));
            }
            const text = await res.text();
            let data: unknown = text;
            try {
                data = JSON.parse(text);
            } catch {
                /* réponse non JSON */
            }
            return { status: res.status, data, headers: res.headers };
        },
        get: (url: string, headers?: Entetes) => client.request('GET', url, undefined, headers),
        post: (url: string, body: unknown = {}) => client.request('POST', url, body),
        put: (url: string, body: unknown = {}) => client.request('PUT', url, body),
        delete: (url: string, body?: unknown) => client.request('DELETE', url, body),
        login: (username: string, password: string, profile?: string | null) =>
            client.post('/api/login', { username, password, profile })
    };
    return client;
}

export type Client = ReturnType<typeof createClient>;

// Code TOTP (RFC 6238, SHA-1, 6 chiffres, pas de 30 s) pour un secret base32
export function totp(secret: string, stepOffset = 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const c of secret) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    const counter = Buffer.alloc(8);
    counter.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30000) + stepOffset));
    const h = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
    const o = h[h.length - 1] & 0xf;
    const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(bin % 1e6).padStart(6, '0');
}
