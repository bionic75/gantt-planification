// @ts-check
// Lecture des codes de double authentification (OTP) dans la boîte e-mail partagée par les comptes de test.
// Avant chaque demande de code, un point de repère est pris (UID suivant en IMAP, messages déjà présents avec
// Mailpit) : seul un message arrivé après ce repère est retenu, le plus récent s'il y en a plusieurs.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from './config.js';

const sleep = (/** @type {number} */ ms) => new Promise(r => setTimeout(r, ms));
const POLL_MS = 2000;

/** Code à 6 chiffres du corps d'un e-mail de vérification */
export function extraireCode(/** @type {string} */ texte) {
    const brut = texte
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
    const m = brut.match(/(?<!\d)(\d{6})(?!\d)/);
    return m ? m[1] : null;
}

const sujetCorrespond = (/** @type {string | undefined} */ sujet) =>
    !!sujet && sujet.toLowerCase().includes(config.mail.otpSubject.toLowerCase());

/**
 * @typedef {{ repere: () => Promise<unknown>, attendreCode: (repere: unknown, destinataire?: string) => Promise<string> }} BoiteMail
 */

/** @returns {BoiteMail} */
function boiteImap() {
    const c = config.mail.imap;
    if (!c.host || !c.user) {
        throw new Error('Boîte partagée non configurée : renseigner E2E_IMAP_HOST, E2E_IMAP_USER et E2E_IMAP_PASSWORD');
    }
    const connecter = async () => {
        const client = new ImapFlow({
            host: c.host,
            port: c.port,
            secure: c.secure,
            auth: { user: c.user, pass: c.password },
            logger: false
        });
        await client.connect();
        await client.mailboxOpen(c.mailbox);
        return client;
    };
    return {
        async repere() {
            const client = await connecter();
            try {
                const box = /** @type {any} */ (client.mailbox);
                return Number(box.uidNext) || 1;
            } finally {
                await client.logout().catch(() => {});
            }
        },
        async attendreCode(repere, destinataire) {
            const depuis = Number(repere);
            const fin = Date.now() + config.mail.otpTimeoutMs;
            const client = await connecter();
            try {
                while (Date.now() < fin) {
                    await client.noop();
                    /** @type {{ uid: number, code: string }[]} */
                    const trouves = [];
                    for await (const msg of client.fetch(`${depuis}:*`, { uid: true, source: true }, { uid: true })) {
                        // « n:* » renvoie le dernier message même si son UID est inférieur à n
                        if (msg.uid < depuis || !msg.source) continue;
                        const mail = await simpleParser(msg.source);
                        if (!sujetCorrespond(mail.subject)) continue;
                        if (
                            destinataire &&
                            !JSON.stringify(mail.to || '')
                                .toLowerCase()
                                .includes(destinataire.toLowerCase())
                        ) {
                            continue;
                        }
                        const code = extraireCode(`${mail.text || ''} ${mail.html || ''}`);
                        if (code) trouves.push({ uid: msg.uid, code });
                    }
                    if (trouves.length) return trouves.sort((a, b) => b.uid - a.uid)[0].code;
                    await sleep(POLL_MS);
                }
            } finally {
                await client.logout().catch(() => {});
            }
            throw new Error(`Aucun code OTP reçu dans la boîte partagée en ${config.mail.otpTimeoutMs / 1000} s`);
        }
    };
}

/** Serveur SMTP de test Mailpit (API HTTP v1) @returns {BoiteMail} */
function boiteMailpit() {
    const base = config.mail.mailpitUrl;
    const lister = async () => {
        const r = await fetch(`${base}/api/v1/messages?limit=100`);
        if (!r.ok) throw new Error(`Mailpit indisponible (${base}) : HTTP ${r.status}`);
        return /** @type {{ messages: Array<{ ID: string, Subject: string, Created: string, To: Array<{ Address: string }> }> }} */ (
            await r.json()
        ).messages;
    };
    return {
        async repere() {
            return new Set((await lister()).map(m => m.ID));
        },
        async attendreCode(repere, destinataire) {
            const connus = /** @type {Set<string>} */ (repere);
            const fin = Date.now() + config.mail.otpTimeoutMs;
            while (Date.now() < fin) {
                const nouveaux = (await lister())
                    .filter(m => !connus.has(m.ID) && sujetCorrespond(m.Subject))
                    .filter(
                        m => !destinataire || m.To.some(t => t.Address.toLowerCase() === destinataire.toLowerCase())
                    )
                    .sort((a, b) => b.Created.localeCompare(a.Created));
                for (const m of nouveaux) {
                    const detail = await (await fetch(`${base}/api/v1/message/${m.ID}`)).json();
                    const code = extraireCode(`${detail.Text || ''} ${detail.HTML || ''}`);
                    if (code) return code;
                }
                await sleep(POLL_MS);
            }
            throw new Error(`Aucun code OTP reçu dans Mailpit en ${config.mail.otpTimeoutMs / 1000} s`);
        }
    };
}

/** @returns {BoiteMail} */
export function boiteMail() {
    switch (config.mail.provider) {
        case 'imap':
            return boiteImap();
        case 'mailpit':
            return boiteMailpit();
        default:
            throw new Error(`E2E_MAIL_PROVIDER inconnu : ${config.mail.provider} (imap ou mailpit)`);
    }
}
