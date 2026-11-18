// Secrets enregistrés en base (jeton Asana, mot de passe SMTP) : chiffrés en AES-256-GCM, ils ne figurent donc pas en
// clair dans la base ni dans une sauvegarde (.gpdump).
// Clé : fichier DB_PATH/.asana_key (nom historique), propre au serveur (créé une seule fois, jamais écrasé). Si ce
// fichier est inaccessible (droits du conteneur sur le dossier de données, fichier créé par root par une ancienne
// version…), la clé est dérivée de SESSION_SECRET (obligatoire en production) : l'enregistrement fonctionne alors sans
// intervention sur le serveur. Le déchiffrement essaie les deux clés, dans cet ordre.
// Une sauvegarde restaurée sur un autre serveur (autre clé) rend ces secrets illisibles : ils sont à ressaisir.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.ts';
import { HttpError } from './http-error.ts';

let keyFileWarned = false;

function readKeyFile(keyFile: string) {
    const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
    if (key.length !== 32) throw Object.assign(new Error('clé invalide'), { code: 'EINVALIDKEY' });
    return key;
}

/** Clés utilisables, par ordre de préférence */
export function secretKeys() {
    const keyFile = path.join(env.DB_PATH, '.asana_key');
    const keys = [];
    let problem: any = null;
    try {
        keys.push(readKeyFile(keyFile));
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') problem = e;
        else {
            // Première utilisation : création sans jamais écraser un fichier existant
            try {
                fs.mkdirSync(env.DB_PATH, { recursive: true });
                const k = crypto.randomBytes(32);
                fs.writeFileSync(keyFile, k.toString('hex'), { mode: 0o600, flag: 'wx' });
                keys.push(k);
            } catch (e2: any) {
                if (e2.code === 'EEXIST') {
                    try {
                        keys.push(readKeyFile(keyFile)); // créée entre-temps par une autre requête
                    } catch (e3) {
                        problem = e3;
                    }
                } else problem = e2;
            }
        }
    }
    if (problem && !keyFileWarned) {
        keyFileWarned = true;
        console.warn(
            `⚠️  Clé de chiffrement (${keyFile}) inaccessible (${problem.code || problem.message}) : clé dérivée de SESSION_SECRET utilisée. ` +
                'Pour utiliser le fichier : donner le dossier de données à l’utilisateur du conteneur (chown -R 1000:1000).'
        );
    }
    if (!env.SESSION_SECRET_GENERATED) {
        keys.push(Buffer.from(crypto.hkdfSync('sha256', env.SESSION_SECRET, 'planification-asana', 'jeton-v1', 32)));
    }
    if (!keys.length) {
        throw new HttpError(
            500,
            `Clé de chiffrement des secrets (jeton Asana, mot de passe SMTP) inaccessible (${problem?.code || 'erreur'}) : vérifier les droits du dossier de données ou définir SESSION_SECRET`
        );
    }
    return keys;
}

/** Texte chiffré « iv:tag:données » (hexadécimal) */
export function encryptSecret(plain: string) {
    const iv = crypto.randomBytes(12),
        c = crypto.createCipheriv('aes-256-gcm', secretKeys()[0], iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}

/** Texte en clair, ou null si illisible (autre serveur, clé inaccessible) */
export function decryptSecret(blob: unknown) {
    let keys;
    try {
        keys = secretKeys();
    } catch {
        return null;
    }
    const [iv, tag, enc] = String(blob)
        .split(':')
        .map(x => Buffer.from(x, 'hex'));
    for (const key of keys) {
        try {
            const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
            d.setAuthTag(tag);
            return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
        } catch {
            /* autre clé */
        }
    }
    return null;
}

/** Valeur au format chiffré (iv de 12 octets, tag de 16 octets) ; sinon valeur en clair d'une ancienne version */
export const isEncryptedSecret = (value: unknown) =>
    typeof value === 'string' && /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/.test(value);
