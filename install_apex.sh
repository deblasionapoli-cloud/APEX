#!/bin/bash
# ==========================================
# APEX SYSTEM RECOVERY & INSTALLER
# ==========================================
# Questo script ricostruisce l'intero ambiente APEX sul Raspberry Pi Zero 2 W.
# Creato per Nicola De Blasio.

set -e

echo ">> [1/5] Preparazione cartelle..."
mkdir -p /root/APEX/src/core
cd /root/APEX

echo ">> [2/5] Installazione dipendenze di sistema..."
apt-get update && apt-get install -y surf unclutter xorg xinit xserver-xorg-video-fbdev

# --- GENERAZIONE FILE ---

echo ">> [3/5] Generazione file core..."

# package.json
cat << 'EOF' > package.json
{
  "name": "apex",
  "type": "module",
  "scripts": {
    "start": "tsx server.ts",
    "build": "vite build"
  },
  "dependencies": {
    "express": "^4.21.2",
    "vite": "^6.2.0",
    "@google/genai": "^1.29.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tsx": "^4.21.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "@tailwindcss/vite": "^4.1.0",
    "tailwindcss": "^4.1.0"
  }
}
EOF

# vite.config.ts
cat << 'EOF' > vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', emptyOutDir: true }
});
EOF

# server.ts
cat << 'EOF' > server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.json());

  if (fs.existsSync(distPath)) {
    console.log(">> MODO: PRODUZIONE");
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  } else {
    console.log(">> MODO: SVILUPPO");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("=============================");
    console.log("   APEX DAEMON ONLINE (3000)");
    console.log("=============================");
  });
}
startServer().catch(err => console.error("FATAL ERROR:", err));
EOF

# src/App.tsx
cat << 'EOF' > src/App.tsx
import React, { useEffect, useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

const ASPECT_RATIO = 1.8;
const SAFE_MARGIN = 0.05;
const FPS = 10;

const generateFace = (s: number, e: number, msg: string) => {
  const eye = s < 40 ? "X" : s < 70 ? "@" : "O";
  const mouth = ((e % 10) > 5 ? "~" : "-").repeat(10);
  return `
[ SYSTEM STATUS: ${s < 50 ? "DEGRADED" : "OPTIMAL"} ]
L_CORE .. [--------------------] .. L_CORE
    P_BUSY ..  /          \\  .. P_BUSY
   SYSCALL .. |  [ ${eye} ]  [ ${eye} ]  | .. SYSCALL
    SIGTERM .. |      |      | .. SIGTERM
     0xFF01 .. |  {${mouth}}  | .. 0xFF01
   RUN_CMD ..  \\______________/  .. RUN_CMD

 >> ${msg.toUpperCase() || "IDLE_PULSE"} <<`;
};

export default function App() {
  const [frame, setFrame] = useState('');
  const [input, setInput] = useState('');
  const [displayMsg, setDisplayMsg] = useState('REBOOT_COMPLETE');
  const [stats, setStats] = useState({ s: 100, e: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const genAI = useRef<any>(null);

  useEffect(() => {
    const key = (window as any).VITE_GEMINI_API_KEY || "";
    if (key) genAI.current = new GoogleGenAI(key);
    const interval = setInterval(() => {
      setStats(p => ({ s: Math.max(0, p.s - 0.05), e: (p.e + 1) % 100 }));
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    }, 1000 / FPS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { setFrame(generateFace(stats.s, stats.e, displayMsg)); }, [stats, displayMsg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = input.trim().toUpperCase();
    if (!txt) return;
    setInput('');
    setDisplayMsg("PROCESSING...");
    setStats(p => ({ ...p, s: Math.min(100, p.s + 15) }));
    if (!genAI.current) {
        setTimeout(() => setDisplayMsg(`ECHO: ${txt}`), 400);
        return;
    }
    try {
        const m = genAI.current.getGenerativeModel({ model: "gemini-1.5-flash" });
        const r = await m.generateContent("You are APEX terminal daemon. 5 words max. Speak technically. User: " + txt);
        setDisplayMsg(r.response.text().toUpperCase().substring(0, 30));
    } catch { setDisplayMsg("ERR: COG_FAULT"); }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', color: '#00FF00', fontFamily: 'monospace' }}>
      <div style={{ width: \`\${100 - (SAFE_MARGIN * 200)}vw\`, aspectRatio: \`\${ASPECT_RATIO}\`, border: '2px solid rgba(0, 255, 0, 0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', background: 'radial-gradient(circle, #001100 0%, #000000 100%)' }}>
        <pre style={{ fontSize: 'min(2.4vw, 4.2vh)', lineHeight: '1.2', whiteSpace: 'pre', textAlign: 'center' }}>{frame}</pre>
      </div>
      <form onSubmit={handleSubmit} style={{ position: 'absolute', top: -100, opacity: 0 }}><input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} autoFocus /></form>
      <div style={{ position: 'absolute', bottom: '10px', width: '90%', display: 'flex', justifyContent: 'space-between', opacity: 0.4, fontSize: '10px' }}>
        <span>CORE_TEMP: 42.4C</span>
        <span>STBL: {Math.floor(stats.s)}%</span>
      </div>
    </div>
  );
}
EOF

# src/main.tsx
cat << 'EOF' > src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
EOF

# src/index.css
cat << 'EOF' > src/index.css
@import "tailwindcss";
body { margin: 0; background: black; overflow: hidden; }
EOF

# index.html
cat << 'EOF' > index.html
<!doctype html><html><head><meta charset="UTF-8" /><title>APEX</title></head>
<body style="background:black"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
EOF

# apex-launch.sh
cat << 'EOF' > apex-launch.sh
#!/bin/bash
xset s off
xset s noblank
xset -dpms
unclutter -idle 0.1 -root &
/usr/bin/surf -F http://localhost:3000
EOF
chmod +x apex-launch.sh

echo ">> [4/5] Installazione pacchetti node..."
npm install

echo ">> [5/5] Building APEX..."
npm run build

echo "=========================================="
echo "   RECOVERY COMPLETATA CON SUCCESSO"
echo "   PUOI AVVIARE CON: startx /root/APEX/apex-launch.sh"
echo "=========================================="
