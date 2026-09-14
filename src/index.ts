#!/usr/bin/env bun
import { createInterface } from 'readline';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { loadConfig } from './config.ts';
import { loadSkills } from './skills.ts';
import { runAgent } from './agent.ts';
import { readFileTool, writeFileTool, runShellTool, runMonitorTool, listModelsTool } from './tools/index.ts';
import { PROVIDERS } from './providers/index.ts';
import { webSearchTool } from './plugins/web-search.ts';
import { webBrowseTool } from './plugins/web-browse.ts';
import { webBrowseHeadlessTool } from './plugins/web-browse-headless.ts';
import { webDownloadTool } from './plugins/web-download.ts';
import { newSessionId, saveSession, loadSession, listSessions, type Session } from './session.ts';

// --- CLI entry ---
const args = process.argv.slice(2);

// --help / -h — runs before loading config so it works without any setup
if (args[0] === '--help' || args[0] === '-h' || args.length === 0 && process.stdin.isTTY === false) {
  console.log(`\x1b[1mpicante\x1b[0m — terminal AI agent

\x1b[1mUsage:\x1b[0m
  picante [prompt]            Single-shot prompt
  picante                     Interactive REPL
  picante --resume [id]       Resume last (or named) session
  picante --sessions          List saved sessions
  picante providers [name]    List provider models
  picante --help              Show this help

\x1b[1mConfiguration\x1b[0m (~/.picante/config.toml or .picante.toml):
  LLM_BASE_URL = "https://openrouter.ai/api/v1"
  LLM_MODEL    = "google/gemini-flash-1.5"
  LLM_API_KEY  = "sk-..."

\x1b[1mProviders:\x1b[0m  openrouter · opencode · fal · nvidia · amd
\x1b[1mDocs:\x1b[0m       https://picanteverde.github.io/picante`);
  process.exit(0);
}

// picante providers [list|<name>] [--filter <str>]
if (args[0] === 'providers') {
  const sub = args[1];
  if (!sub || sub === 'list') {
    for (const [name, p] of Object.entries(PROVIDERS)) {
      console.log(`${name.padEnd(12)} ${p.baseUrl}  (key: ${p.apiKeyEnv})`);
    }
  } else {
    const p = PROVIDERS[sub];
    if (!p) { console.error(`Unknown provider: ${sub}`); process.exit(1); }
    const filterIdx = args.indexOf('--filter');
    const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;
    const key = process.env[p.apiKeyEnv];
    try {
      const models = await p.listModels(key);
      const filtered = filter ? models.filter(m => m.id.includes(filter) || m.name?.includes(filter)) : models;
      for (const m of filtered) {
        const parts = [m.id];
        if (m.name && m.name !== m.id) parts.push(`(${m.name})`);
        if (m.contextLength) parts.push(`ctx:${m.contextLength}`);
        if (m.pricing?.prompt != null) parts.push(`$${m.pricing.prompt}/${m.pricing.completion} ${m.pricing.currency ?? ''}`);
        console.log(parts.join('  '));
      }
      console.log(`\n${filtered.length} model(s)`);
    } catch (e) {
      console.error((e as Error).message); process.exit(1);
    }
  }
  process.exit(0);
}

// Load config only when actually running the agent
const config = loadConfig();
const skills = loadSkills(config.skillDirs);

const SYSTEM_PROMPT = `You are picante, a capable AI agent running in a terminal. You can read and write files, run shell commands, search the web, and browse URLs. You have access to tools — use them whenever they help accomplish the task. Be concise and direct.${skills}`;

const ALL_TOOLS = [
  readFileTool,
  writeFileTool,
  runShellTool,
  runMonitorTool,
  listModelsTool,
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

const promptArg = args.filter((_, i) =>
  i !== resumeFlag &&
  (resumeFlag === -1 || i !== resumeFlag + 1) &&
  args[i] !== '--sessions'
).join(' ').trim();

if (promptArg) {
  await runPrompt(promptArg, session);
} else {
  await repl(session);
}
