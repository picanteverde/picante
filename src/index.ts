#!/usr/bin/env bun
import { createInterface } from 'readline';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { loadConfig } from './config.ts';
import { loadSkills } from './skills.ts';
import { runAgent } from './agent.ts';
import { readFileTool, writeFileTool, runShellTool, runMonitorTool } from './tools/index.ts';
import { webSearchTool } from './plugins/web-search.ts';
import { webBrowseTool } from './plugins/web-browse.ts';
import { webBrowseHeadlessTool } from './plugins/web-browse-headless.ts';
import { webDownloadTool } from './plugins/web-download.ts';
import { newSessionId, saveSession, loadSession, listSessions, type Session } from './session.ts';

const config = loadConfig();
const skills = loadSkills(config.skillDirs);

const SYSTEM_PROMPT = `You are picante, a capable AI agent running in a terminal. You can read and write files, run shell commands, search the web, and browse URLs. You have access to tools — use them whenever they help accomplish the task. Be concise and direct.${skills}`;

const ALL_TOOLS = [
  readFileTool,
  writeFileTool,
  runShellTool,
  runMonitorTool,
  webSearchTool,
  webBrowseTool,
  webBrowseHeadlessTool,
  webDownloadTool,
];

function printEvent(event: Parameters<typeof runAgent>[1]['onStep'] extends ((e: infer E) => void) | undefined ? E : never) {
  if (event.type === 'text') {
    process.stdout.write('\n' + event.text + '\n');
  } else if (event.type === 'tool_call') {
    const argsStr = JSON.stringify(event.args);
    process.stderr.write(`\x1b[2m⚙ ${event.name}(${argsStr.length > 80 ? argsStr.slice(0, 77) + '…' : argsStr})\x1b[0m\n`);
  } else if (event.type === 'tool_result') {
    const preview = (event.result.split('\n')[0] ?? '').slice(0, 60);
    process.stderr.write(`\x1b[2m  → ${preview}${event.result.length > 60 ? '…' : ''}\x1b[0m\n`);
  }
}

async function runPrompt(prompt: string, session: Session): Promise<void> {
  session.messages.push({ role: 'user', content: prompt });
  const updated = await runAgent(session.messages, {
    config,
    tools: ALL_TOOLS,
    systemPrompt: SYSTEM_PROMPT,
    onStep: printEvent,
  });
  session.messages = updated;
  saveSession(config.sessionDir, session);
}

async function repl(session: Session): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  process.stdout.write(`\x1b[1mpicante\x1b[0m  session ${session.id}  (Ctrl+D to exit)\n\n`);
  for await (const line of rl) {
    const prompt = line.trim();
    if (!prompt) continue;
    await runPrompt(prompt, session);
    process.stdout.write('\n');
  }
}

// --- CLI entry ---
const args = process.argv.slice(2);
const resumeFlag = args.indexOf('--resume');
const sessionsFlag = args.indexOf('--sessions');

if (sessionsFlag !== -1) {
  const ids = listSessions(config.sessionDir);
  if (!ids.length) { console.log('No sessions found.'); process.exit(0); }
  ids.forEach(id => console.log(id));
  process.exit(0);
}

let session: Session;
if (resumeFlag !== -1) {
  const id = args[resumeFlag + 1];
  const latestId = listSessions(config.sessionDir)[0];
  const loaded = id ? loadSession(config.sessionDir, id) : (latestId ? loadSession(config.sessionDir, latestId) : null);
  if (!loaded) { console.error('Session not found.'); process.exit(1); }
  session = loaded;
} else {
  session = { id: newSessionId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
}

const promptArg = args.filter((_, i) => i !== resumeFlag && i !== resumeFlag + 1 && args[i] !== '--sessions').join(' ').trim();

if (promptArg) {
  await runPrompt(promptArg, session);
} else {
  await repl(session);
}
