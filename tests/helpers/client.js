// Client HTTP minimal avec conservation du cookie de session
import crypto from 'crypto';

export function createClient(baseUrl) {
    let cookie = '';
    const client = {
        get cookie() {
            return cookie;
        },
        async request(method, url, body, headers = {}) {
            const res = await fetch(baseUrl + url, {
                method,
                redirect: 'manual',
                headers: {
                    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                    ...(cookie ? { Cookie: cookie } : {}),
                    ...headers
                },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            const setCookie = res.headers.get('set-cookie');
            if (setCookie) cookie = setCookie.split(';')[0];
            const text = await res.text();
            let data = text;
            try {
                data = JSON.parse(text);
            } catch {
                /* réponse non JSON */
            }
            return { status: res.status, data, headers: res.headers };
        },
        get: (url, headers) => client.request('GET', url, undefined, headers),
        post: (url, body = {}) => client.request('POST', url, body),
        put: (url, body = {}) => client.request('PUT', url, body),
        delete: (url, body) => client.request('DELETE', url, body),
        login: (username, password, profile) => client.post('/api/login', { username, password, profile })
    };
    return client;
}

// Code TOTP (RFC 6238, SHA-1, 6 chiffres, pas de 30 s) pour un secret base32
export function totp(secret, stepOffset = 0) {
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
