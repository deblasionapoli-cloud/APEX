/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { State } from './types';

/**
 * Pure transformation layer: State -> ASCII Frame
 */
export function renderFrame(state: State): string {
  if (!state) {
    return "ERROR: STATE_UNDEFINED\n[ SYSTEM_HALTED ]";
  }
  const { emotion_state, animation_phase, intensity, current_morph } = state;
  const iScale = intensity / 100;
  const isGlitched = emotion_state === 'glitch';

  // 1. Dynamic Jitter scaling
  let jitter = "";
  if (isGlitched || emotion_state === 'attack' || iScale > 0.4) {
    const jitterThreshold = 0.95 - (iScale * 0.2);
    jitter = Math.random() > jitterThreshold ? (Math.random() > 0.5 ? "  " : "    ") : "";
  }

  // 2. High-Fidelity Blinking
  const blinkInterval = isGlitched ? 60 : 180;
  const isBlinking = (animation_phase % blinkInterval < 4) || (isGlitched && Math.random() > 0.9);

  // 3. Eye Movement & Noise
  const isProcessing = state.last_command_phase >= 0 && (animation_phase - state.last_command_phase < 5);
  const isCalmIdle = emotion_state === 'calm' && Math.random() > 0.92;
  
  let eyeL = " O ";
  let eyeR = " O ";
  let eyeC = " [O] ";
  
  if (isBlinking) {
    eyeL = " - "; eyeR = " - "; eyeC = " [-] ";
  } else if (isProcessing) {
    eyeL = " * "; eyeR = " * "; eyeC = " [*] ";
  } else if (emotion_state === 'attack') {
    const symbols = [" > ", " # ", " X ", " ! ", " < "];
    eyeL = symbols[animation_phase % symbols.length];
    eyeR = symbols[(animation_phase + 1) % symbols.length];
    eyeC = " [!] ";
  } else if (emotion_state === 'curious') {
    const scan = Math.floor(animation_phase / 10) % 4;
    const eyeFrames = [" o ", " . ", " o ", " O "];
    eyeL = eyeFrames[scan];
    eyeR = eyeFrames[(scan + 2) % 4];
    eyeC = ` [${eyeFrames[scan]}] `;
  } else if (isGlitched) {
    const noise = ["%", "&", "X", "$", "!", "?", "0", "1", "@", "#"];
    const n = () => noise[Math.floor(Math.random() * noise.length)];
    eyeL = ` ${n()} `; eyeR = ` ${n()} `; eyeC = ` [${n()}] `;
  }

  // 4. Morph Logic
  let spriteLines: string[] = [];

  if (current_morph === 'eye') {
    spriteLines = [
      "        .--------.        ",
      "     .-'          '-.     ",
      "    /   .--------.   \\    ",
      "   |   /          \\   |   ",
      `   |  |   ${eyeC}   |  |   `,
      "   |   \\          /   |   ",
      "    \\   '--------'   /    ",
      "     '-.          .-'     ",
      "        '--------'        "
    ];
  } else if (current_morph === 'hardware') {
    const p = (animation_phase % 10 < 5) ? "_" : " ";
    spriteLines = [
      "   ______________________   ",
      "  |                      |  ",
      `  | [${p}]  CPU CORE  [${p}] |  `,
      "  |  [IIIIIIIIIIIIIIII]  |  ",
      `  |   (${eyeL})  (${eyeR})   |  `,
      "  |  [________________]  |  ",
      "  |      ::::::::::      |  ",
      "  |__==__==__==__==__==__|  ",
      "    || || || || || || ||    "
    ];
  } else if (current_morph === 'ditto') {
    const w = Math.sin(animation_phase * 0.2) * 2;
    const pad = (n: number) => " ".repeat(Math.max(0, Math.floor(n)));
    spriteLines = [
      `${pad(4+w)}  .----------.  `,
      `${pad(2+w*0.5)} /            \\ `,
      `${pad(w)}|   ${eyeL}   ${eyeR}   |`,
      `${pad(1-w*0.5)} \\    ____    / `,
      `${pad(2-w)}  '--'    '--'  `,
      `${pad(4-w*1.1)}   /      \\    `,
      `${pad(3-w*1.5)}  /________\\   `
    ];
  } else if (current_morph === 'spiky') {
    spriteLines = [
      "     /\\      /\\     ",
      "    /  \\____/  \\    ",
      `   /  (${eyeL})(${eyeR})  \\   `,
      "   \\    VVVVV    /   ",
      "    \\  /\\__/\\  /    ",
      "     \\/      \\/     "
    ];
  } else {
    // Default Blob/Carhartt
    spriteLines = [
      "      .-----------------.      ",
      "     /      _______      \\     ",
      "    |      |       |      |    ",
      "    |      |  [C]  |      |    ",
      "    |      |_______|      |    ",
      "    |_____________________|    ",
      "    |=====================|    ",
      `    |    (${eyeL})   (${eyeR})    |`,
      "    |          ^          |",
      "    |    {===========}    |",
      "    '___________________'  "
    ];
  }

  // 5. Speech Rendering
  let rawSpeechLines = state.speech_queue.slice(0, 3);
  let speechLines: string[] = [];
  const revealSpeed = 2;
  const shiftInterval = 14;

  rawSpeechLines.forEach((line, idx) => {
    const age = (animation_phase % shiftInterval) + (2 - idx) * shiftInterval;
    const revealThreshold = age * revealSpeed;
    let content = line.substring(2, line.length - 2); 
    const charList = content.split("");
    const noise = ["!", "@", "#", "$", "%", "*"];

    const processedChars = charList.map((char, i) => {
      if (i < revealThreshold - 2) return char;
      if (i < revealThreshold) return noise[Math.floor(Math.random() * noise.length)];
      return " ";
    });

    speechLines.push(`[ ${processedChars.join("")} ]`);
  });
  
  while (speechLines.length < 3) {
    speechLines.push(`[ ${"".padEnd(25)} ]`);
  }

  const signalLine = isProcessing ? "      [ SIGNAL_RX ]      " : "";
  let rawLines = [...spriteLines, signalLine, ...speechLines];
  
  // Apply Distortion
  if (isGlitched || iScale > 0.8) {
    if (Math.random() > 0.9) {
      const idx1 = Math.floor(Math.random() * rawLines.length);
      const idx2 = Math.floor(Math.random() * rawLines.length);
      [rawLines[idx1], rawLines[idx2]] = [rawLines[idx2], rawLines[idx1]];
    }
  }

  const frame = rawLines.map((line) => {
    let processed = line;
    if (isGlitched || iScale > 0.6) {
      if (Math.random() < (isGlitched ? 0.3 : 0.1)) {
        const offset = Math.floor(Math.random() * 6) - 3;
        processed = offset > 0 ? " ".repeat(offset) + processed : processed.substring(Math.abs(offset));
      }
    }
    return jitter + processed;
  }).join("\n");

  return frame;
}

function shiftLeft(s: string, n: number): string {
  return s.substring(n) + " ".repeat(n);
}
