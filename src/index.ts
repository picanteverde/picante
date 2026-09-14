#!/usr/bin/env bun
import { createInterface } from 'readline';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { loadConfig, writeConfig, GLOBAL_CONFIG_PATH } from './config.ts';
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
  picante [prompt]                     Single-shot prompt
  picante                              Interactive REPL
  picante --resume [id]                Resume last (or named) session
  picante --sessions                   List saved sessions
  picante providers [name]             List provider models
  picante config show                  Show current configuration
  picante config provider <n> [key]    Set active provider (+ API key)
  picante config model [name]          Interactive model picker or set directly
  picante --help                       Show this help

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

// picante config show | provider <name> [key] | model [name]
if (args[0] === 'config') {
  const sub = args[1];

  if (!sub || sub === 'show') {
    // Show current config (mask key)
    const cfg = loadConfig();
    const masked = cfg.apiKey ? cfg.apiKey.slice(0, 8) + '...' : '(not set)';
    console.log(`LLM_BASE_URL  ${cfg.baseUrl}`);
    console.log(`LLM_MODEL     ${cfg.model}`);
    console.log(`LLM_API_KEY   ${masked}`);
    console.log(`\nConfig file: ${GLOBAL_CONFIG_PATH}`);
    process.exit(0);
  }

  if (sub === 'provider') {
    const name = args[2];
    const key = args[3];
    if (!name) { console.error('Usage: picante config provider <name> [api-key]'); process.exit(1); }
    const p = PROVIDERS[name];
    if (!p) { console.error(`Unknown provider: ${name}. Available: ${Object.keys(PROVIDERS).join(', ')}`); process.exit(1); }
    const updates: Record<string, string> = { LLM_BASE_URL: p.baseUrl };
    if (key) {
      updates[p.apiKeyEnv] = key;
      updates['LLM_API_KEY'] = key;
    }
    writeConfig(updates);
    console.log(`Provider set to \x1b[1m${name}\x1b[0m (${p.baseUrl})`);
    if (key) console.log(`API key saved as ${p.apiKeyEnv} and LLM_API_KEY`);
    console.log(`Run \x1b[2mpicante config model\x1b[0m to pick a model.`);
    process.exit(0);
  }

  if (sub === 'model') {
    const direct = args[2];
    if (direct) {
      writeConfig({ LLM_MODEL: direct });
      console.log(`Model set to \x1b[1m${direct}\x1b[0m`);
      process.exit(0);
    }

    // Interactive picker: fetch models from current provider
    const cfg = loadConfig();
    const providerEntry = Object.entries(PROVIDERS).find(([, p]) => {
      try { return cfg.baseUrl.includes(new URL(p.baseUrl).hostname); } catch { return false; }
    });
    if (!providerEntry) {
      console.error(`No built-in provider matches base URL "${cfg.baseUrl}".\nSet one first: picante config provider <name> <key>\nOr set directly: picante config model <model-name>`);
      process.exit(1);
    }
    const [providerName, provider] = providerEntry;
    const apiKey = cfg.apiKey || process.env[provider.apiKeyEnv];
    process.stdout.write(`Fetching models from \x1b[1m${providerName}\x1b[0m...\n`);
    const allModels = await provider.listModels(apiKey).catch((e: Error) => { console.error(e.message); process.exit(1); });

    const printList = (list: typeof allModels) => {
      list.slice(0, 40).forEach((m, i) => {
        const active = m.id === cfg.model ? ' \x1b[32m←\x1b[0m' : '';
        console.log(`  \x1b[2m${String(i + 1).padStart(3)}.\x1b[0m ${m.id}${active}`);
      });
      if (list.length > 40) console.log(`  \x1b[2m... and ${list.length - 40} more — type a filter to narrow\x1b[0m`);
    };

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

    // Step 1: optional filter
    console.log('');
    printList(allModels);
    console.log('');
    const filterInput = (await ask(`Filter (or press Enter to see all): `)).trim();
    const visible = filterInput ? allModels.filter(m => m.id.toLowerCase().includes(filterInput.toLowerCase())) : allModels;

    if (filterInput && visible.length !== allModels.length) {
      console.log('');
      printList(visible);
      console.log('');
    }

    // Step 2: select
    const selectInput = (await ask(`Select model [number or name] (current: \x1b[1m${cfg.model}\x1b[0m): `)).trim();
    rl.close();

    if (!selectInput) process.exit(0);

    const num = parseInt(selectInput, 10);
    const chosen = (!isNaN(num) && num >= 1 && num <= Math.min(visible.length, 40))
      ? visible[num - 1]!.id
      : selectInput;

    writeConfig({ LLM_MODEL: chosen });
    console.log(`\nModel set to \x1b[1m${chosen}\x1b[0m`);
    process.exit(0);
  }

  console.error(`Unknown config subcommand: ${sub}. Use: show | provider | model`);
  process.exit(1);
}

// Load config only when actually running the agent
const config = loadConfig();

if (!config.apiKey) {
  console.error(`\x1b[1mpicante:\x1b[0m No API key configured.

Set up a provider first:
  \x1b[2mpicante config provider opencode "sk-..."\x1b[0m
  \x1b[2mpicante config provider openrouter "sk-or-..."\x1b[0m

Or set manually in \x1b[2m~/.picante/config.toml\x1b[0m:
  LLM_BASE_URL = "https://openrouter.ai/api/v1"
  LLM_MODEL    = "google/gemini-flash-1.5"
  LLM_API_KEY  = "sk-..."

Docs: https://picanteverde.github.io/picante/#configuration`);
  process.exit(1);
}

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
