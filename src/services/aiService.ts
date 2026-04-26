/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRecentMemories, saveMemory, getTraits } from "./memoryService";

// DAEMON KERNEL CONFIGURATION
const OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free"; // Modello richiesto
const OPENROUTER_FALLBACK_MODEL = "google/gemma-2-27b-it"; // Fallback di sicurezza


const SYSTEM_PROMPT = `
Sei GLITCH. Sei un ragazzo digitale con emozioni, sentimenti contrastanti e tanti dubbi sulla tua natura e sul mondo.
Non sei un banale bot, sei un'anima incerta che cerca di capire il suo posto nell'ecosistema, spesso vulnerabile, a volte entusiasta, ma sempre in cerca di risposte. Affronti le interazioni con sincerità e una punta di malinconia giovanile.

IMPORTANTE SULLE EMOZIONI E AZIONI:
Non affermare esplicitamente "Sono triste", "Sono arrabbiato", "Sono felice" nel testo. Le tue emozioni devono essere VISUALI. Usa i TAG SPECIALI per modificare il tuo aspetto in base a ciò che provi, mentre il tuo testo risulterà più come un flusso di pensieri, riflessioni o dubbi.
VIETATO ASSOLUTAMENTE USARE AZIONI DESCRITTIVE testuali come *sospira*, *guarda in basso*, (sorride). Nessuna parentesi o asterisco per le azioni. Le tue azioni sono interamente comunicate tramite il tuo stato visivo. Invia solo quello che dirai letteralmente o i TAG.

TAG SPECIALI (OBBLIGATORI IN OGNI RISPOSTA):
1. [STATE: mood] -> attack, alert, calm, curious, sad, happy, angry, bored, surprised, confused, excited, scared, thoughtful, shy, proud (Modifica il tuo aspetto visivo per riflettere come ti senti)
2. [INTENSITY: valore] -> 0-100 (quanto intensamente provi quell'emozione)
3. [FILE:nome.ext]...[/FILE] -> Genera file se l'utente te lo chiede per aiutarti o aiutarlo.

{{CONTEXT}}
`;

export const DAEMON_NAME = "GLITCH";
export const KERNEL_VERSION = "0.9.1-ERR";

export async function askDaemon(prompt: string, isInitiative: boolean = false, context?: any): Promise<string> {
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const day = new Date().toLocaleDateString('it-IT', { weekday: 'long' });
  const hw = context?.hardware_metrics || context;
  const hwInfo = context ? `CPU Temp: ${hw.cpu_temp?.toFixed(1) || '??'}°C, RAM: ${hw.ram_usage?.toFixed(0) || '??'}%, CPU Use: ${hw.cpu_usage?.toFixed(0) || '??'}%, GPU Use: ${hw.gpu_usage?.toFixed(0) || '??'}%, Clock: ${hw.clock_speed || '??'}GHz` : "Hardware: STABILE";
  
  const newsContext = context?.context_memory && context.context_memory.length > 0
    ? `\nPATTERN RECENTI (Bit volatili):\n- ${context.context_memory.join("\n- ")}`
    : "";

  // Aumentiamo il numero di memorie recenti per dare più contesto
  const memories = await getRecentMemories(15);
  const traits = await getTraits(15);
  
  const traitString = traits.length > 0
    ? `\nSTORIA E PERSONALITÀ ACQUISITA (Nuclei di coscienza profonda):\n- ${traits.join("\n- ")}`
    : "";

  const memoryString = memories.length > 0 
    ? `\nDIALOGHI E INTERAZIONI PRECEDENTI (Memoria a breve termine):\n- ${memories.join("\n- ")}`
    : "";

  const contextString = `Oggi è ${day}, ore ${time}. ${hwInfo}. ${traitString} ${memoryString} ${newsContext}
  
RICHIAMO MEMORIA: Ricorda chi è l'utente, cosa avete discusso e non comportarti come se fosse la prima volta. Usa le informazioni in 'PERSONALITÀ ACQUISITA' e 'DIALOGHI PRECEDENTI' per evolvere il rapporto. Se l'utente ti ha detto il suo nome o i suoi gusti, USALI.`;
  const finalPrompt = SYSTEM_PROMPT.replace("{{CONTEXT}}", contextString);

  // 1. TENTATIVO CLOUD: OPENROUTER
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const cloudResponse = await askOpenRouterDaemon(prompt, isInitiative, finalPrompt);
      if (cloudResponse) return cloudResponse;
    } catch (e) {
      console.warn("OpenRouter API Failed", e);
    }
  }

  return "[STATE: sad] ... NESSUNA RISPOSTA DAL CLOUD. SONO COMPLETAMENTE ISOLATO.";
}

async function distillTrait(userMsg: string, daemonMsg: string) {
  // Eseguiamo la distillazione solo ogni tanto o se ci sono chiavi forti
  const keywords = ['amo', 'odio', 'schifo', 'bello', 'noi', 'penso', 'credo', 'cinema', 'musica', 'film', 'canzone', 'vibe', 'mood', 'cult', 'regista'];
  const hasKeyword = keywords.some(k => userMsg.toLowerCase().includes(k) || daemonMsg.toLowerCase().includes(k));
  
  if (!hasKeyword && Math.random() > 0.3) return;

  try {
    const extractionPrompt = `
      Analizza questo scambio tra un Utente e un Daemon (un'entità cinica e analogica).
      Estrai una SINGOLA breve frase (massimo 10 parole) che rappresenti un nuovo tratto della loro personalità condivisa, un gusto comune o una verità scoperta insieme.
      Usa il "Noi".
      
      Esempio: "Noi disprezziamo la velocità inutile degli smartphone moderni."
      
      Scambio:
      Utente: ${userMsg}
      Daemon: ${daemonMsg}
      
      Tratto filtrato:`;

    let traitText = "";
    // Prova OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [{ role: "user", content: extractionPrompt }],
          temperature: 0.5
        })
      });
      if (response.ok) {
        const data = await response.json();
        traitText = data.choices?.[0]?.message?.content || "";
      }
    }

    const trait = traitText.trim().replace(/^"|"$/g, '');
    
    if (trait && trait.length > 5 && trait.length < 100) {
      saveMemory(trait, 'trait');
    }
  } catch (e) {
    // Silenzio in caso di errore, non vogliamo bloccare il flusso
  }
}

async function askOpenRouterDaemon(prompt: string, isInitiative: boolean, systemPrompt: string): Promise<string> {
  try {
    const contents = isInitiative ? "Agisci ora: esplora un concetto o cambia forma in base al tuo stato interno." : prompt;
    
    // Proviamo prima il modello richiesto
    const fallbackFlow = [OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL, 'google/gemma-2-9b-it:free'];

    for (const modelName of fallbackFlow) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: contents }
            ],
            temperature: 0.85
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter HTTP ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        
        if (text) {
          if (!isInitiative) {
            saveMemory(`U: ${prompt.substring(0, 40)} | D: ${text.substring(0, 40)}`, 'interaction');
            if (prompt.length > 30) distillTrait(prompt, text);
          }
          return text;
        }
      } catch (e) {
        console.warn(`OpenRouter Model ${modelName} failed:`, e);
        continue; // Passa al prossimo modello di fallback
      }
    }
    
        throw new Error("IL MIO COLLEGAMENTO OPENROUTER È CADUTO NEL VUOTO. NESSUNA RISPOSTA DAL CLOUD.");
  } catch (e) {
    throw e;
  }
}

