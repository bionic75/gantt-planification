// Serveur SMTP minimal pour les tests : accepte tout message et le conserve en mémoire
import net from 'net';

export async function startSmtpSink() {
    const messages = [];
    const server = net.createServer(socket => {
        let buffer = '';
        let inData = false;
        let data = '';
        let authStep = null;
        const reply = line => socket.write(`${line}\r\n`);

        reply('220 smtp-sink ESMTP');
        socket.on('data', chunk => {
            buffer += chunk.toString('utf8');
            let idx;
            while ((idx = buffer.indexOf('\r\n')) >= 0) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                if (inData) {
                    if (line === '.') {
                        inData = false;
                        messages.push(decodeMessage(data));
                        data = '';
                        reply('250 OK');
                    } else {
                        data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
                    }
                    continue;
                }
                if (authStep === 'login-user') {
                    authStep = 'login-pass';
                    reply('334 UGFzc3dvcmQ6');
                    continue;
                }
                if (authStep === 'login-pass') {
                    authStep = null;
                    reply('235 Authentication successful');
                    continue;
                }
                const cmd = line.split(' ')[0].toUpperCase();
                if (cmd === 'EHLO') reply('250-smtp-sink\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME');
                else if (cmd === 'HELO') reply('250 smtp-sink');
                else if (cmd === 'AUTH' && /LOGIN/i.test(line)) {
                    authStep = 'login-user';
                    reply('334 VXNlcm5hbWU6');
                } else if (cmd === 'AUTH') reply('235 Authentication successful');
                else if (cmd === 'DATA') {
                    inData = true;
                    reply('354 End data with <CR><LF>.<CR><LF>');
                } else if (cmd === 'QUIT') {
                    reply('221 Bye');
                    socket.end();
                } else reply('250 OK');
            }
        });
        socket.on('error', () => {});
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    return {
        port: server.address().port,
        messages,
        /** Attend un message dont le contenu correspond au motif */
        async waitFor(pattern, timeoutMs = 10000) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const found = messages.find(m => pattern.test(m));
                if (found) return found;
                await new Promise(r => setTimeout(r, 100));
            }
            throw new Error(`Aucun email correspondant à ${pattern} (${messages.length} reçu(s))`);
        },
        stop: () => new Promise(resolve => server.close(resolve))
    };
}

/**
 * Message décodé : en-têtes dépliés avec leurs mots encodés (=?UTF-8?Q|B?…?=) lisibles en UTF-8, corps décodé du
 * quoted-printable (les en-têtes ne subissent pas le décodage du corps, qui abîmerait « ?= » en fin de ligne)
 */
function decodeMessage(raw) {
    const cut = raw.indexOf('\r\n\r\n');
    const head = cut >= 0 ? raw.slice(0, cut) : raw;
    const body = cut >= 0 ? raw.slice(cut) : '';
    const headers = head
        .replace(/\r\n[ \t]+/g, ' ')
        .replace(/(\?=) (=\?UTF-8\?)/gi, '$1$2')
        .replace(/=\?UTF-8\?([QqBb])\?([^?]*)\?=/g, (_m, enc, txt) =>
            enc.toUpperCase() === 'B'
                ? Buffer.from(txt, 'base64').toString('utf8')
                : Buffer.from(
                      txt
                          .replace(/_/g, ' ')
                          .replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))),
                      'latin1'
                  ).toString('utf8')
        );
    return headers + decodeQuotedPrintable(body);
}

function decodeQuotedPrintable(text) {
    // Suites « =XX » décodées en UTF-8 (une lettre accentuée = plusieurs octets)
    return text.replace(/=\r\n/g, '').replace(/(?:=[0-9A-F]{2})+/g, run =>
        Buffer.from(
            run
                .slice(1)
                .split('=')
                .map(h => parseInt(h, 16))
        ).toString('utf8')
    );
}
