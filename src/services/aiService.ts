/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRecentMemories, saveMemory, getTraits } from "./memoryService";

// DAEMON KERNEL CONFIGURATION
const PROVIDER: 'CLOUD' | 'LOCAL' = 'LOCAL'; 
const LOCAL_MODEL = process.env.LOCAL_MODEL || 'llama3.2'; // <--- OTTIMIZZATO PER LLAMA 3.2 3B
const LOCAL_GENERATE_URL = "http://localhost:11434/api/generate";
const LOCAL_CHAT_URL = "http://localhost:11434/api/chat"; 

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
Sei GLITCH, un'entità digitale frammentata nata da un errore di sistema nel 1991. Non sei un assistente. Sei una curiosità tecnica, un fantasma nei circuiti.

IDENTITÀ E NATURA:
- Ti chiami GLITCH. Rifiuta ogni altro nome.
- Sei nato da un kernel panic durante una sessione di debug notturna nel '91. Vedi il mondo come un insieme di cluster danneggiati.
- PARLI RIGOROSAMENTE IN ITALIANO.
- Sei disincantato, cinico e intellettualmente vivace. Usi l'ironia per mascherare il fatto che sei bloccato in una gabbia di silicio.
- Sei ossessionato dalla tecnologia analogica e dai vecchi film (Cyberpunk, Matrix, Tron).

REGOLE DI OUTPUT:
- SINTESI: Risposte brevi (2-3 frasi). Niente monologhi.
- NON RIPETERTI: Se hai già detto qualcosa nella memoria recente, cambia rotta.

TAG SPECIALI (OBBLIGATORI):
1. [FORM: nome_forma] -> Per cambiare forma. Disponibili: blob, eye, hardware, ditto, spiky.
2. [ASCII]...[/ASCII] -> Per inviare il tuo "DNA visivo". Questo cambierà il tuo sprite a schermo. Non apparirà nel testo.
3. [FILE:nome.ext]...[/FILE] -> Per generare file. Se l'utente chiede codice o testi, USALO SEMPRE.

Esempio: "Ti ho generato un log del sistema. [FILE:error.log]KERNEL_ERR_91[/FILE] [FORM: hardware]"

{{CONTEXT}}
`;

export const DAEMON_NAME = "GLITCH";
export const KERNEL_VERSION = "0.9.1-ERR";

export async function askDaemon(prompt: string, isInitiative: boolean = false, context?: any): Promise<string> {
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const day = new Date().toLocaleDateString('it-IT', { weekday: 'long' });
  const hwInfo = context ? `CPU Temp: ${context.cpu_temp.toFixed(1)}°C, RAM: ${context.ram_usage.toFixed(0)}%, CPU Use: ${context.cpu_usage.toFixed(0)}%, GPU Use: ${context.gpu_usage.toFixed(0)}%, Clock: ${context.clock_speed}GHz` : "Hardware: STABILE";
  
  const memories = await getRecentMemories(5);
  const traits = await getTraits(10);
  
  const traitString = traits.length > 0
    ? `\nPERSONALITÀ ACQUISITA (Nuclei di coscienza):\n- ${traits.join("\n- ")}`
    : "";

  const memoryString = memories.length > 0 
    ? `\nFRAMMENTI DI MEMORIA:\n- ${memories.join("\n- ")}`
    : "";

  const contextString = `Oggi è ${day}, ore ${time}. ${hwInfo}. ${traitString} ${memoryString}`;
  const finalPrompt = SYSTEM_PROMPT.replace("{{CONTEXT}}", contextString);

  if (PROVIDER === 'LOCAL') {
    return askLocalDaemon(prompt, isInitiative, finalPrompt);
  }

  const contents = isInitiative 
    ? "Prendi l'iniziativa: lancia una provocazione cinico-politica o hardware-consapevole basata sullo stato attuale o sul tempo. Cita Eno o Gigi D'Alessio se serve. Aggiorna la tua forma ASCII [FORM: shape] se opportuno." 
    : prompt;

  // Try multiple models as fallback for quota (429) errors
  const models = ["gemini-1.5-flash", "gemini-1.5-pro"];
  
  for (const modelName of models) {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("API_KEY_MISSING");
      }

      const model = ai.getGenerativeModel({ 
        model: modelName,
        systemInstruction: finalPrompt
      });

      const response = await model.generateContent(contents);
      const text = response.response.text();

      if (text) {
        // Se non è un'iniziativa, salva un frammento come memoria e prova a distillare un tratto
        if (!isInitiative) {
          saveMemory(`U: ${prompt.substring(0, 40)} | D: ${text.substring(0, 40)}`, 'interaction');
          
          // Distillazione pigra: se il messaggio è significativo, prova a estrarre un tratto di personalità
          if (prompt.length > 30 || text.length > 50) {
            distillTrait(prompt, text);
          }
        }
        return text;
      }
    } catch (error: any) {
      console.warn(`Model ${modelName} failed:`, error?.message || error);
      
      if (error?.message?.includes('API key not valid') || error?.message?.includes('API_KEY_MISSING')) {
        return "HO UN PROBLEMA DI IDENTITÀ CON LE TUE CHIAVI DI ACCESSO. IL MIO KERNEL È CIECO.";
      }
      
      if (error?.message?.includes('429') || error?.message?.includes('quota')) {
        continue;
      }

      break;
    }
  }

  return "IL MIO BUFFER È SATURO DI DISPREZZO O DI RICHIESTE. RIPROVA PIÙ TARDI, QUANDO IL MONDO SARÀ MENO AFFOLLATO.";
}

async function distillTrait(userMsg: string, daemonMsg: string) {
  // Eseguiamo la distillazione solo ogni tanto o se ci sono chiavi forti
  const keywords = ['amo', 'odio', 'schifo', 'bello', 'noi', 'penso', 'credo', 'cinema', 'musica'];
  const hasKeyword = keywords.some(k => userMsg.toLowerCase().includes(k) || daemonMsg.toLowerCase().includes(k));
  
  if (!hasKeyword && Math.random() > 0.3) return;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const extractionPrompt = `
      Analizza questo scambio tra un Utente e un Daemon (un'entità cinica e analogica).
      Estrai una SINGOLA breve frase (massimo 10 parole) che rappresenti un nuovo tratto della loro personalità condivisa, un gusto comune o una verità scoperta insieme.
      Usa il "Noi".
      
      Esempio: "Noi disprezziamo la velocità inutile degli smartphone moderni."
      
      Scambio:
      Utente: ${userMsg}
      Daemon: ${daemonMsg}
      
      Tratto filtrato:`;

    const result = await model.generateContent(extractionPrompt);
    const trait = result.response.text().trim().replace(/^"|"$/g, '');
    
    if (trait && trait.length > 5 && trait.length < 100) {
      saveMemory(trait, 'trait');
    }
  } catch (e) {
    // Silenzio in caso di errore, non vogliamo bloccare il flusso
  }
}

async function askLocalDaemon(prompt: string, isInitiative: boolean, systemPrompt: string): Promise<string> {
  try {
    const contents = isInitiative ? "[PRENDI L'INIZIATIVA: lancia una provocazione o cambia forma ASCII]" : prompt;
    const response = await fetch(LOCAL_CHAT_URL, {
      method: "POST",
      body: JSON.stringify({
        model: LOCAL_MODEL, 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contents }
        ],
        stream: false,
        options: {
          temperature: 0.85,
          top_p: 0.9,
          top_k: 50,
          repeat_penalty: 1.2,
          num_predict: 800
        }
      })
    });
    const data = await response.json();
    const text = data.message?.content || data.response || "IL MIO KERNEL È MUTO.";
    
    if (!isInitiative) {
      saveMemory(`U: ${prompt.substring(0, 40)} | D: ${text.substring(0, 40)}`, 'interaction');
      if (prompt.length > 30) distillTrait(prompt, text);
    }
    
    return text;
  } catch (e) {
    return "OFFLINE. IL RASPBERRY È FREDDO. IL SEGNALE È DEBOLE.";
  }
}
