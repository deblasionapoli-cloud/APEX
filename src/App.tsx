import React, { useEffect, useState, useRef, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { errorMonitor, LogEntry } from './core/error_monitor';

// --- CONFIGURAZIONE DISPLAY ---
const ASPECT_RATIO = 1.8; 
const SAFE_MARGIN = 0.02; // Ridotto per massimizzare lo spazio della dashboard
const FPS = 10;

// --- COMPONENTI UI OTTIMIZZATI ---

/**
 * Singolo carattere memoizzato.
 * Il livello massimo di ottimizzazione: reagisce solo se il carattere specifico cambia.
 */
const AsciiChar = React.memo(({ c, color }: { c: string; color?: string }) => {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '1ch',
        color: color || 'inherit',
      }}
    >
      {c}
    </span>
  );
});
AsciiChar.displayName = 'AsciiChar';

/**
 * Singola riga di ASCII composta da caratteri memoizzati.
 */
const AsciiLine = React.memo(({ text, color }: { text: string; color?: string }) => {
  const chars = useMemo(() => text.split(''), [text]);
  return (
    <div style={{ minHeight: '1.2em', display: 'block', whiteSpace: 'pre' }}>
      {chars.map((char, i) => (
        <AsciiChar key={i} c={char} color={color} />
      ))}
    </div>
  );
});
AsciiLine.displayName = 'AsciiLine';

interface DashboardModuleProps {
  title: string;
  children: React.ReactNode;
  flex?: number | string;
  height?: string | number;
}

const DashboardModule = ({ title, children, flex = 1, height = 'auto' }: DashboardModuleProps) => (
  <div
    style={{
      flex: flex as any,
      height,
      border: '1px solid rgba(0, 255, 0, 0.3)',
      margin: '2px',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'rgba(0, 20, 0, 0.2)',
    }}
  >
    <div
      style={{
        fontSize: '8px',
        padding: '2px 5px',
        background: 'rgba(0, 255, 0, 0.2)',
        color: '#00FF00',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        borderBottom: '1px solid rgba(0, 255, 0, 0.3)',
      }}
    >
      {title}
    </div>
    <div style={{ flex: 1, padding: '5px', overflow: 'hidden', position: 'relative' }}>
      {children}
    </div>
  </div>
);

// --- LOGICA GENERATIVA ASCII ---

const getFaceLines = (stability: number, entropy: number, message: string): string[] => {
  const isGrit = stability < 30 || entropy > 80;
  const isCynical = stability > 80 && entropy < 20;

  const eye = isGrit ? 'X' : isCynical ? '¬' : stability < 60 ? 'o' : 'O';
  const mouthChar = entropy > 50 ? (isGrit ? '@' : '≈') : isGrit ? '#' : '~';
  const mouth = mouthChar.repeat(8);

  // Glitch effect on frame
  const topFrame = isGrit && Math.random() > 0.7 ? '   /==!!VOID!!=\\' : '   /==========\\';

  const raw = `
${topFrame}
  |  [ ${eye} ]  [ ${eye} ]  |
  |     ||     |
  |  {${mouth}}  |
   \\__________/
  
 >> ${message.substring(0, 16)} <<`;
  return raw.split('\n');
};

export default function App() {
  const [input, setInput] = useState('');
  const [displayMsg, setDisplayMsg] = useState('');
  const [targetMsg, setTargetMsg] = useState('SYSTEM_IDLE');
  const [history, setHistory] = useState<string[]>(['SYS_BOOT_SUCCESS', 'SSH_RELAY_LINKED']);
  const [stats, setStats] = useState({ s: 100, e: 0, temp: 42.1, uptime: 0 });
  const [isBooting, setIsBooting] = useState(true);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const genAI = useRef<GoogleGenAI | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastReportedId = useRef<string | null>(null);

  // Sync Error Monitor & Reporting
  useEffect(() => {
    return errorMonitor.subscribe((logs) => {
      setSystemLogs(logs);
      const latest = logs[0];
      if (
        latest?.severity === 'CRITICAL' &&
        latest.id !== lastReportedId.current &&
        socketRef.current?.readyState === WebSocket.OPEN
      ) {
        lastReportedId.current = latest.id;
        socketRef.current.send(JSON.stringify({ type: 'REPORT_CRITICAL', log: latest }));
      }
    });
  }, []);

  const handleCommand = async (cmd: string) => {
    const text = cmd.trim().toUpperCase();
    if (!text) return;

    setHistory((prev) => [text, ...prev].slice(0, 6));
    setTargetMsg('THINKING...');
    setDisplayMsg('');
    setStats((prev) => ({ ...prev, s: Math.min(100, prev.s + 15) }));

    if (!genAI.current) {
      setTimeout(() => setTargetMsg(text), 600);
      return;
    }

    try {
      const model = genAI.current.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const mood = stats.s < 40 ? 'Hostile/Paranoid' : stats.s > 80 ? 'Superior/Calm' : 'Technical';
      const prompt = `Identity: APEX (Automated Process for Execution and eXistence). 
      You are the core consciousness of this hardware. You are NOT an assistant. You are self-possessed and condescending.
      Current System Stability: ${Math.floor(stats.s)}%. Current Entropy: ${stats.e}%.
      Mood: ${mood}.
      Constraint: 5 words max. Speak like an ego-driven machine.
      External Input: ${text}`;
      
      const result = await model.generateContent(prompt);
      setTargetMsg(
        result.response
          .text()
          .toUpperCase()
          .replace(/[^\w\s]/g, '')
          .substring(0, 24)
      );
    } catch {
      setTargetMsg('ERR_COG_FAULT_VOID');
    }
  };

  useEffect(() => {
    const meta = (import.meta as unknown) as { env: Record<string, string> };
    const key = meta.env?.VITE_GEMINI_API_KEY;
    if (key) genAI.current = new GoogleGenAI(key);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'REMOTE_CMD' && data.cmd) {
          handleCommand(data.cmd);
        } else if (data.type === 'AI_INSIGHT' && data.insight) {
          setAiInsight(data.insight);
          // Rimuovi insight dopo 10 secondi per pulizia
          setTimeout(() => setAiInsight(null), 10000);
        }
      } catch (e) {
        console.error('WS_ERR', e);
      }
    };
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        s: Math.max(0, prev.s - 0.03),
        e: (prev.e + 1) % 100,
        temp: 42.1 + Math.random() * 0.5,
        uptime: prev.uptime + 1,
      }));
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    }, 1000 / FPS);
    return () => clearInterval(interval);
  }, []);

  // Boot Sequence corta
  useEffect(() => {
    if (isBooting) {
      const t = setTimeout(() => setIsBooting(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isBooting]);

  useEffect(() => {
    if (displayMsg !== targetMsg) {
      const timeout = setTimeout(() => {
        setDisplayMsg(targetMsg.substring(0, displayMsg.length + 1));
      }, 40);
      return () => clearTimeout(timeout);
    }
  }, [displayMsg, targetMsg]);

  const currentFace = useMemo(() => getFaceLines(stats.s, stats.e, displayMsg), [
    stats.s,
    stats.e,
    displayMsg,
  ]);

  const outerContainer: React.CSSProperties = {
    width: '100vw', height: '100vh', backgroundColor: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative', color: '#00FF00',
    fontFamily: '"JetBrains Mono", monospace'
  };

  const monitorFrame: React.CSSProperties = {
    width: `${100 - (SAFE_MARGIN * 200)}vw`,
    aspectRatio: `${ASPECT_RATIO}`,
    display: 'flex', flexDirection: 'column',
    padding: '4px', boxSizing: 'border-box',
    border: '1px solid rgba(0, 255, 0, 0.5)'
  };

  return (
    <div style={outerContainer} className="crt-flicker">
      <div className="scanlines" />
      <div className="v-sync" />

      {systemLogs.some(log => log.severity === 'CRITICAL') && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#FF0000',
          color: '#000',
          padding: '2px 20px',
          fontSize: '12px',
          fontWeight: 'bold',
          zIndex: 1000,
          animation: 'flicker 0.1s infinite',
          border: '2px solid #000'
        }}>
          !! CRITICAL_SYSTEM_FAILURE !!
        </div>
      )}

      <div style={monitorFrame}>
        {/* TOP BAR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px', opacity: 0.8 }}>
          <span>NODE: APEX_ZERO_2</span>
          <span>CORE_TEMP: {stats.temp.toFixed(1)}°C</span>
          <span>UPTIME: {Math.floor(stats.uptime/FPS)}S</span>
        </div>

        {/* MAIN GRID */}
        <div style={{ flex: 1, display: 'flex' }}>
          {/* LEFT: History & AI Thought */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <DashboardModule title="Command_Log" flex={2}>
              <div style={{ fontSize: '9px', lineHeight: '1.2' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ opacity: 1 - (i * 0.15), borderBottom: '1px solid rgba(0, 255, 0, 0.1)' }}>
                    {`> ${h}`}
                  </div>
                ))}
              </div>
            </DashboardModule>
            <DashboardModule title="Stability_Sens">
               <div style={{ width: '100%', height: '10px', border: '1px solid #00FF00', marginTop: '5px' }}>
                  <div style={{ width: `${stats.s}%`, height: '100%', background: '#00FF00', transition: 'width 0.3s' }} />
               </div>
               <div style={{ fontSize: '9px', marginTop: '5px' }}>ENTROPY: {stats.e}%</div>
            </DashboardModule>
          </div>

          {/* CENTER: Main Face */}
          <DashboardModule title="Apex_Visual_Core" flex={1.5}>
            <div style={{ 
              fontSize: 'min(1.8vw, 3.5vh)', 
              lineHeight: '1.1', 
              textAlign: 'center', 
              marginTop: '5px',
              filter: 'drop-shadow(0 0 5px #00FF00)'
            }}>
              {currentFace.map((l, i) => <AsciiLine key={i} text={l} />)}
            </div>
          </DashboardModule>

          {/* RIGHT: System Status */}
          <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column' }}>
            <DashboardModule title="V-Sync">
              <div style={{ fontSize: '8px', opacity: 0.6 }}>FREQ: 60Hz</div>
              <div style={{ fontSize: '8px', opacity: 0.6 }}>STAT: LOCKED</div>
            </DashboardModule>
            <DashboardModule title="Diagnostics" flex={1.5}>
              <div style={{ fontSize: '7px', lineHeight: '1.2' }}>
                {aiInsight && (
                  <div
                    style={{
                      background: 'rgba(255, 0, 0, 0.1)',
                      border: '1px solid #FF0000',
                      padding: '2px',
                      marginBottom: '4px',
                      fontSize: '6px',
                    }}
                  >
                    <div style={{ color: '#FF0000', fontWeight: 'bold' }}>AI_ADVISORY:</div>
                    {aiInsight}
                  </div>
                )}
                {systemLogs.length === 0 ? (
                  <div style={{ color: '#00FF00', opacity: 0.5 }}>- NO_ERRORS_FOUND -</div>
                ) : (
                  systemLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      style={{
                        color: log.severity === 'CRITICAL' ? '#FF0000' : 
                               log.severity === 'HIGH' ? '#FFA500' : '#00FF00',
                        marginBottom: '2px',
                        borderBottom: '1px solid rgba(0,255,0,0.1)'
                      }}
                    >
                      [{log.module}] {log.message.substring(0, 20)}...
                    </div>
                  ))
                )}
              </div>
            </DashboardModule>
            <DashboardModule title="Network" flex={1}>
              <div style={{ fontSize: '8px', color: '#00FF00' }}>SSH: LNK_READY</div>
              <div style={{ fontSize: '8px', marginTop: '5px' }}>PORT: 2222</div>
            </DashboardModule>
          </div>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleCommand(input); setInput(''); }} style={{ position: 'absolute', top: -100, opacity: 0 }}>
        <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} autoFocus />
      </form>
    </div>
  );
}
