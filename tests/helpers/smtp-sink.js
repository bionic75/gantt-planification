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
                        messages.push(decodeQuotedPrintable(data));
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

function decodeQuotedPrintable(text) {
    return text.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
