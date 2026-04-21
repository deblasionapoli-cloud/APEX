import React, { useEffect, useState, useRef, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';

// --- CONFIGURAZIONE DISPLAY ---
const ASPECT_RATIO = 1.8; // Rapporto d'aspetto del monitor TFT
const SAFE_MARGIN = 0.05; // 5% di margine per evitare bordi tagliati
const FPS = 10; // Framerate dell'ASCII art

// --- COMPONENTI OTTIMIZZATI ---

/**
 * Singola riga di ASCII.
 * Grazie a React.memo, il browser aggiornerà il DOM solo se il testo della riga cambia effettivamente.
 */
const AsciiLine = React.memo(({ text }: { text: string }) => {
  return <div style={{ minHeight: '1.2em', display: 'block' }}>{text || ' '}</div>;
});
AsciiLine.displayName = 'AsciiLine';

// --- LOGICA GENERATIVA ASCII ---

const getFaceLines = (stability: number, entropy: number, message: string): string[] => {
  const isGrit = stability < 30;
  const isWeak = stability < 60;

  const eye = isGrit ? 'X' : isWeak ? 'o' : 'O';
  const mouthChar = entropy % 10 > 5 ? (isGrit ? '#' : '~') : isGrit ? '=' : '-';
  const mouth = mouthChar.repeat(10);

  const coreStatus = stability > 80 ? 'NOMINAL' : stability > 40 ? 'WARNING' : 'CRITICAL';
  const deco = isGrit ? '!! WARNING !!' : isWeak ? '// LOAD_AVG: 0.8' : 'CPU_V2_READY';

  const raw = `
[ APEX_CORE_DAEMON // ${coreStatus} ]
${deco.padStart(36)}

L_CORE [----------------------] L_CORE
       |                      |
P_BUSY /    [ ${eye} ]  [ ${eye} ]    \\ P_BUSY
       |                      |
SYS_C  |          ||          | SYS_C
       |       /======\\       |
SIG_T  |      {${mouth}}      | SIG_T
       |       \\______/       |
0xFF   \\______________________/ 0xFF

 >> ${message.toUpperCase() || 'IDLE_PULSE'} <<`;

  return raw.split('\n');
};

const getBootLines = (msg: string): string[] => {
  const raw = `\n\n\n\n[ INITIALIZING... ]\n\n${msg}\n\n\n\n`;
  return raw.split('\n');
};

// --- BOOT SEQUENCE LOGS ---
const BOOT_LOGS = [
  'BIOS_READ: OK',
  'CORE_DAEMON_MOUNTING...',
  'VFS_INIT: EXT4_SUCCESS',
  'SYSCALL_HOOK_ACTIVE',
  'GEMINI_COG_LINK: ESTABLISHED',
  'P_BUSY: OVERCLOCKED',
  'STABILITY_SYRINGE_ENGAGED',
  'DAEMON_AWAKE.',
];

export default function App() {
  const [input, setInput] = useState('');
  const [displayMsg, setDisplayMsg] = useState('');
  const [targetMsg, setTargetMsg] = useState('REBOOT_COMPLETE');
  const [stats, setStats] = useState({ s: 100, e: 0, temp: 42.1, uptime: 0 });
  const [isBooting, setIsBooting] = useState(true);
  const [bootIndex, setBootIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const genAI = useRef<GoogleGenAI | null>(null);

  const handleCommand = async (cmd: string) => {
    const text = cmd.trim().toUpperCase();
    if (!text) return;

    setTargetMsg('THINKING...');
    setDisplayMsg('');
    setStats((prev) => ({ ...prev, s: Math.min(100, prev.s + 12) }));

    if (!genAI.current) {
      setTimeout(() => setTargetMsg(`ECHO: ${text}`), 600);
      return;
    }

    try {
      const model = genAI.current.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `You are APEX, a terminal daemon. Use 5 words max. Speak technically. User: ${text}`;
      const result = await model.generateContent(prompt);
      const response = result.response
        .text()
        .toUpperCase()
        .replace(/[^\w\s.]/g, '');
      setTargetMsg(response.substring(0, 31));
    } catch {
      setTargetMsg('ERR: COG_FAULT');
    }
  };

  // Inizializzazione AI & WebSocket
  useEffect(() => {
    const key = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_GEMINI_API_KEY;
    if (key) genAI.current = new GoogleGenAI(key);

    // --- WEBSOCKET CLIENT PER REMOTE CONTROL ---
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => console.log('>> CORE LINKED TO SSH RELAY');
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'REMOTE_CMD' && data.cmd) {
          handleCommand(data.cmd);
        }
      } catch (e) {
        console.error('WS_DATA_ERR', e);
      }
    };

    return () => socket.close();
  }, []);

  // Boot Sequence
  useEffect(() => {
    if (isBooting) {
      if (bootIndex < BOOT_LOGS.length) {
        const timeout = setTimeout(() => {
          setTargetMsg(BOOT_LOGS[bootIndex]);
          setBootIndex((prev) => prev + 1);
        }, 300);
        return () => clearTimeout(timeout);
      } else {
        setTimeout(() => {
          setIsBooting(false);
          setTargetMsg('DAEMON_READY.');
        }, 1000);
      }
    }
  }, [isBooting, bootIndex]);

  // Loop di Animazione & Metrics & Focus
  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        s: Math.max(0, prev.s - 0.04), // Lenta degradazione
        e: (prev.e + 1) % 100,
        temp: 42.1 + Math.random() * 0.8,
        uptime: prev.uptime + 1,
      }));

      // Mantiene il focus sull'input
      if (!isBooting && document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 1000 / FPS);
    return () => clearInterval(interval);
  }, [isBooting]);

  // Typing Effect
  useEffect(() => {
    if (displayMsg !== targetMsg) {
      const timeout = setTimeout(() => {
        setDisplayMsg(targetMsg.substring(0, displayMsg.length + 1));
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [displayMsg, targetMsg]);

  /**
   * Calcola le righe attuali.
   * Viene rieseguito ogni tick, ma i componenti AsciiLine memoizzati filtreranno gli aggiornamenti DOM.
   */
  const currentLines = useMemo(() => {
    return isBooting ? getBootLines(displayMsg) : getFaceLines(stats.s, stats.e, displayMsg);
  }, [isBooting, stats.s, stats.e, displayMsg]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBooting) return;
    handleCommand(input);
    setInput('');
  };

  // --- STILI REATTIVI ---
  const outerContainer: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    color: '#00FF00',
    fontFamily: '"JetBrains Mono", monospace',
  };

  const monitorFrame: React.CSSProperties = {
    width: `${100 - SAFE_MARGIN * 200}vw`,
    aspectRatio: `${ASPECT_RATIO}`,
    border: '2px solid rgba(0, 255, 0, 0.4)',
    boxShadow: 'inset 0 0 50px rgba(0, 255, 0, 0.1), 0 0 20px rgba(0, 255, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    background: 'radial-gradient(circle, #001100 0%, #000000 100%)',
    position: 'relative',
  };

  const textDisplay: React.CSSProperties = {
    fontSize: 'min(2.1vw, 3.8vh)',
    lineHeight: '1.2',
    whiteSpace: 'pre',
    textAlign: 'center',
    filter: 'drop-shadow(0 0 3px #00FF00)',
    letterSpacing: '0.05em',
  };

  const formatUptime = (ticks: number) => {
    const seconds = Math.floor(ticks / FPS);
    const s = seconds % 60;
    const m = Math.floor(seconds / 60) % 60;
    return `${m}M ${s}S`;
  };

  return (
    <div style={outerContainer} className="crt-flicker">
      {/* CRT Overlay Effects */}
      <div className="scanlines" />
      <div className="v-sync" />

      <div style={monitorFrame}>
        <pre style={textDisplay}>
          {currentLines.map((line, i) => (
            <AsciiLine key={i} text={line} />
          ))}
        </pre>
      </div>

      {!isBooting && (
        <form onSubmit={handleSubmit} style={{ position: 'absolute', top: -100, opacity: 0 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
        </form>
      )}

      {/* Advanced Status Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          width: '90%',
          display: 'flex',
          justifyContent: 'space-between',
          opacity: 0.5,
          fontSize: '10px',
        }}
      >
        <span>TEMP_CORE: {stats.temp.toFixed(1)}°C</span>
        <span style={{ color: stats.s < 30 ? '#FF0000' : '#00FF00' }}>
          STABILITY: {Math.floor(stats.s)}%
        </span>
        <span>DAEMON_ID: 0xFFB2</span>
        <span>UPTIME: {formatUptime(stats.uptime)}</span>
      </div>

      {/* Screen Glitch Overlay (Active only when stability is low) */}
      {stats.s < 20 && (
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: 'rgba(0, 255, 0, 0.05)',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
