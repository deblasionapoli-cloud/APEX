import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SSHServer } from 'ssh2';
import crypto from 'crypto';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const SSH_PORT = 2222;
  const distPath = path.join(process.cwd(), 'dist');

  // --- WEBSOCKET SERVER (Per il Relay SSH -> Browser) ---
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('>> BROWSER CONNECTED FOR WS RELAY');
    ws.on('close', () => clients.delete(ws));
  });

  const broadcastToWeb = (data: unknown) => {
    const payload = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  };

  // --- SSH SERVER (Per il Controllo Remoto) ---
  // Nota: In produzione dovresti usare una chiave persistente. Qui ne generiamo una al volo.
  const hostKey = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  }).privateKey;

  const sshServer = new SSHServer({ hostKeys: [hostKey] }, (client) => {
    client
      .on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === 'apex' && ctx.password === 'nicolax') {
          ctx.accept();
        } else {
          ctx.reject(['password']);
        }
      })
      .on('ready', () => {
        client.on('session', (accept) => {
          const session = accept();
          session.on('shell', (accept) => {
            const stream = accept();
            stream.write('\n\r --- APEX REMOTE SHELL READY --- \n\r');
            stream.write(' >> SCRIBED COMMANDS WILL BE RELAYED TO CORE \n\r');
            stream.write(' apex@daemon:~$ ');

            let cmdBuffer = '';
            stream.on('data', (data: Buffer) => {
              const char = data.toString();

              // Gestione basic echo e buffer
              if (char === '\r' || char === '\n') {
                stream.write('\r\n');
                if (cmdBuffer.trim()) {
                  broadcastToWeb({ type: 'REMOTE_CMD', cmd: cmdBuffer.trim() });
                  stream.write(` >> RELAYED: ${cmdBuffer.trim()}\r\n`);
                }
                cmdBuffer = '';
                stream.write(' apex@daemon:~$ ');
              } else if (char === '\u007f') {
                // Backspace
                if (cmdBuffer.length > 0) {
                  cmdBuffer = cmdBuffer.slice(0, -1);
                  stream.write('\b \b');
                }
              } else {
                cmdBuffer += char;
                stream.write(char);
              }
            });
          });
        });
      });
  });

  sshServer.listen(SSH_PORT, '0.0.0.0', () => {
    console.log(`>> SSH INTERFACE ONLINE ON PORT ${SSH_PORT} (User: apex, Pass: nicolax)`);
  });

  // --- EXPRESS & VITE SETUP ---
  if (fs.existsSync(distPath)) {
    console.log('>> MODO: PRODUZIONE');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  } else {
    console.log('>> MODO: SVILUPPO');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`>> WEB SERVER ONLINE ON HTTP://0.0.0.0:${PORT}`);
  });

  // Upgrade HTTP per WebSocket
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
}

startServer().catch((err) => {
  console.error('ERRORE CRITICO AVVIO APEX:', err);
});
