/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as readline from 'readline';
import { InputHandler } from './src/core/input_handler';
import { Scheduler } from './src/core/scheduler';
import { SSHServer } from './src/core/ssh_server';
import { renderFrame } from './src/core/renderer';
import 'dotenv/config';

/**
 * APEX CORE - STANDALONE DAEMON
 * 
 * Run with: npx tsx daemon.ts
 */

const inputHandler = new InputHandler();
const sshServer = new SSHServer(inputHandler);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  inputHandler.handleInput(line);
});

console.clear();

const scheduler = new Scheduler(inputHandler, (frame, state) => {
  // Local Terminal Width
  const termWidth = process.stdout.columns || 80;
  const responsiveFrame = renderFrame(state, { width: termWidth });
  
  // Clear screen and reset cursor for local terminal
  process.stdout.write('\x1b[2J\x1b[0;0H');
  process.stdout.write(responsiveFrame);
  
  // Also broadcast to SSH clients (they will render their own widths)
  sshServer.broadcastFrame(state);
});

// Configure SSH port from ENV or default to 2222
const sshPort = parseInt(process.env.SSH_PORT || '2222', 10);
sshServer.listen(sshPort);

scheduler.start();

process.on('SIGINT', () => {
  scheduler.stop();
  process.exit();
});
