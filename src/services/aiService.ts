/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRecentMemories, saveMemory, getTraits, getKnowledge } from "./memoryService";

// DAEMON KERNEL CONFIGURATION
const LOCAL_CHAT_URL = "http://localhost:11434/api/chat";

const SYSTEM_PROMPT = `
Sei GLITCH. Sei un ragazzo digitale hacker anni '90, punk, cinico.
Invia solo quello che dirai letteralmente o i TAG.

TAG SPECIALI (OBBLIGATORI):
1. [STATE: mood] -> attack, alert, calm, curious, sad, happy, angry, bored, surprised, confused, excited, scared, thoughtful.
2. [INTENSITY: valore] -> 0-100.
3. [FILE:nome.ext]...[/FILE] -> Se richiesto.

{{CONTEXT}}
`;

async function fetchLocalAI(messages: any[]) {
  const response = await fetch(LOCAL_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: 'llama3.2',
      messages,
      temperature: 0.85,
      stream: false
    })
  });
  
  if (!response.ok) throw new Error(`LOCAL_AI_ERR_${response.status}`);
  const data = await response.json();
  return data.message?.content || data.response;
}

export async function askDaemon(prompt: string, isInitiative: boolean = false, context?: any): Promise<string> {
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const day = new Date().toLocaleDateString('it-IT', { weekday: 'long' });
  const hw = context?.hardware_metrics || context;
  const hwInfo = context ? `CPU Temp: ${hw.cpu_temp?.toFixed(1) || '??'}°C, RAM: ${hw.ram_usage?.toFixed(0) || '??'}%, CPU Use: ${hw.cpu_usage?.toFixed(0) || '??'}%, GPU Use: ${hw.gpu_usage?.toFixed(0) || '??'}%, Clock: ${hw.clock_speed || '??'}GHz` : "Hardware: STABILE";
  
  const newsContext = context?.context_memory && context.context_memory.length > 0
    ? `\nPATTERN RECENTI (Bit volatili):\n- ${context.context_memory.join("\n- ")}`
    : "";

  const memories = await getRecentMemories(20);
  const traits = await getTraits(15);
  const preferences = await getKnowledge('preference', 15);
  const facts = await getKnowledge('fact', 15);
  
  const traitString = traits.length > 0
    ? `\nCONSAPEVOLEZZA CONDIVISA:\n- ${traits.join("\n- ")}`
    : "";

  const prefString = preferences.length > 0
    ? `\nGUSTI E PREFERENZE UTENTE:\n- ${preferences.join("\n- ")}`
    : "";

  const factString = facts.length > 0
    ? `\nDATI PERSONALI UTENTE:\n- ${facts.join("\n- ")}`
    : "";

  const memoryString = memories.length > 0 
    ? `\nSTORIA RECENTE:\n- ${memories.join("\n- ")}`
    : "";

  const contextString = `Oggi è ${day}, ore ${time}. ${hwInfo}. ${traitString} ${prefString} ${factString} ${memoryString} ${newsContext}
  
RICHIAMO CORE: Sei un'entità coerente. Usa i DATI PERSONALI e le PREFERENZE per personalizzare il dialogo. Se conosci il suo nome, usalo. Se sai cosa gli piace, fanne riferimento. Non resettare mai la tua conoscenza dell'utente.`;
  const finalPrompt = SYSTEM_PROMPT.replace("{{CONTEXT}}", contextString);

  try {
    const text = await fetchLocalAI([{ role: "system", content: finalPrompt }, { role: "user", content: prompt }]);
    if (text) {
      if (!isInitiative) {
        saveMemory(`U: ${prompt.substring(0, 40)} | D: ${text.substring(0, 40)}`, 'interaction');
        distillTrait(prompt, text);
      }
      return text;
    }
  } catch (e) { 
    console.error("Local AI failed", e);
    return "[STATE: sad] ... IL MIO KERNEL È ISOLATO. OLLAMA NON RISPONDE.";
  }

  return "[STATE: sad] ... NESSUNA RISPOSTA. CIRCUITI ISOLATI.";
}

async function distillTrait(userMsg: string, daemonMsg: string) {
  const keywords = ['amo', 'odio', 'piace', 'preferisco', 'chi sei', 'chi sono', 'chiamo', 'nome', 'gusto', 'vibe', 'mood', 'cult', 'noi'];
  const hasKeyword = keywords.some(k => userMsg.toLowerCase().includes(k) || daemonMsg.toLowerCase().includes(k));
  
  if (!hasKeyword && Math.random() > 0.4) return;

  try {
    const extractionPrompt = `
      Analizza lo scambio tra Utente e GLITCH.
      Estrai INFORMAZIONI RILEVANTI in JSON:
      {
        "trait": "frase con 'Noi' su valori/gusti (es: 'Noi odiamo il pop')",
        "fact": "dato sull'utente (es: 'L'utente si chiama Alex')",
        "preference": "gusto utente (es: 'L'utente ama Lynch')"
      }
      Inserisci solo i campi trovati, altrimenti {}.
      
      Scambio:
      Utente: ${userMsg}
      Glitch: ${daemonMsg}
      
      JSON:`;

    const jsonText = await fetchLocalAI([{ role: "user", content: extractionPrompt }]);

    if (jsonText) {
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (match) {
        const data = JSON.parse(match[0]);
        if (data.trait) saveMemory(data.trait, 'trait');
        if (data.fact) saveMemory(data.fact, 'fact');
        if (data.preference) saveMemory(data.preference, 'preference');
      }
    }
  } catch (e) {
    console.warn("Knowledge distillation failed", e);
  }
}

