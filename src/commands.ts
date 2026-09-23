import type { CliUIPlugin, Config, ConfigPlugin, SelectChoice, Session, SessionPlugin } from './plugins/types.ts';
import type { Provider } from './providers/types.ts';
import { PROVIDERS, detectProvider } from './providers/index.ts';

// Slash commands typed into the REPL. Kept free of any terminal code so the
// behaviour can be tested with a fake UI.

export interface CommandContext {
  config: Config;               // live config — mutated in place when it changes
  configPlugin: ConfigPlugin;   // persists changes
  ui: CliUIPlugin;
  session: Session;
  sessionPlugin: SessionPlugin;
  providers?: Record<string, Provider>;
  env?: Record<string, string | undefined>;
  exit?: () => void;
}

export const COMMANDS: Array<{ name: string; args?: string; description: string; aliases?: string[] }> = [
  { name: '/model', args: '[name]', description: 'Pick a model from the current provider, or set one directly' },
  { name: '/provider', args: '[name]', description: 'Switch provider (prompts for an API key if none is stored)', aliases: ['/providers'] },
  { name: '/config', description: 'Show the active provider, model and config file', aliases: ['/status'] },
  { name: '/clear', description: 'Start a fresh session', aliases: ['/new'] },
  { name: '/help', description: 'Show this list', aliases: ['/?'] },
  { name: '/quit', description: 'Exit picante', aliases: ['/exit', '/q'] },
];

export function isSlashCommand(line: string): boolean {
  return line.trimStart().startsWith('/');
}

function say(ctx: CommandContext, text: string): void {
  if (ctx.ui.notify) ctx.ui.notify(text);
  else ctx.ui.onText(text);
}

function resolveCommand(word: string): string | null {
  for (const c of COMMANDS) {
    if (c.name === word || c.aliases?.includes(word)) return c.name;
  }
  return null;
}

export function helpText(): string {
  const width = Math.max(...COMMANDS.map(c => (c.name + ' ' + (c.args ?? '')).trim().length));
  return COMMANDS.map(c => `${(c.name + ' ' + (c.args ?? '')).trim().padEnd(width)}  ${c.description}`).join('\n');
}

// Returns true when the line was a slash command (handled or not), false when
// it should go to the agent.
export async function handleSlashCommand(line: string, ctx: CommandContext): Promise<boolean> {
  if (!isSlashCommand(line)) return false;
  const [word = '', ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(' ').trim();
  const name = resolveCommand(word.toLowerCase());

  switch (name) {
    case '/help': say(ctx, helpText()); return true;
    case '/config': showConfig(ctx); return true;
    case '/model': await changeModel(ctx, arg || undefined); return true;
    case '/provider': await changeProvider(ctx, arg || undefined); return true;
    case '/clear': clearSession(ctx); return true;
    case '/quit': (ctx.exit ?? (() => process.exit(0)))(); return true;
    default:
      say(ctx, `Unknown command ${word}. Type /help for the list.`);
      return true;
  }
}

function providers(ctx: CommandContext): Record<string, Provider> {
  return ctx.providers ?? PROVIDERS;
}

function showConfig(ctx: CommandContext): void {
  const masked = ctx.config.apiKey ? ctx.config.apiKey.slice(0, 8) + '…' : '(not set)';
  say(ctx, [
    `provider  ${detectProvider(ctx.config.baseUrl)}  (${ctx.config.baseUrl})`,
    `model     ${ctx.config.model}`,
    `api key   ${masked}`,
    `config    ${ctx.configPlugin.configPath()}`,
  ].join('\n'));
}

function applyModel(ctx: CommandContext, model: string): void {
  ctx.config.model = model;
  ctx.configPlugin.write({ LLM_MODEL: model });
  ctx.ui.setStatus?.({ model });
  say(ctx, `Model set to ${model}`);
}

export async function changeModel(ctx: CommandContext, direct?: string): Promise<void> {
  if (direct) { applyModel(ctx, direct); return; }

  const providerName = detectProvider(ctx.config.baseUrl);
  const provider = providers(ctx)[providerName];
  if (!provider) {
    say(ctx, `No built-in provider matches ${ctx.config.baseUrl}. Set a model directly: /model <name>`);
    return;
  }
  if (!ctx.ui.select) {
    say(ctx, 'This UI cannot show a picker. Set a model directly: /model <name>');
    return;
  }

  const key = ctx.config.apiKey || (ctx.env ?? process.env)[provider.apiKeyEnv];
  let choices: SelectChoice[];
  try {
    const models = await provider.listModels(key);
    choices = models.map(m => ({
      name: m.id,
      description: [m.name && m.name !== m.id ? m.name : '', m.contextLength ? `ctx ${m.contextLength}` : '']
        .filter(Boolean).join(' · '),
      value: m.id,
    }));
  } catch (e) {
    say(ctx, `Could not list models from ${providerName}: ${(e as Error).message}`);
    return;
  }
  if (!choices.length) { say(ctx, `${providerName} returned no models.`); return; }

  const picked = await ctx.ui.select(`Model · ${providerName}`, choices, ctx.config.model);
  if (picked) applyModel(ctx, picked);
}

export async function changeProvider(ctx: CommandContext, direct?: string): Promise<void> {
  const all = providers(ctx);
  const current = detectProvider(ctx.config.baseUrl);
  let name = direct?.toLowerCase();

  if (!name) {
    if (!ctx.ui.select) {
      say(ctx, `Available providers: ${Object.keys(all).join(', ')}. Use /provider <name>`);
      return;
    }
    const choices: SelectChoice[] = Object.values(all).map(p => ({
      name: p.name, description: p.baseUrl, value: p.name,
    }));
    const picked = await ctx.ui.select('Provider', choices, current);
    if (!picked) return;
    name = picked;
  }

  const provider = all[name];
  if (!provider) {
    say(ctx, `Unknown provider "${name}". Available: ${Object.keys(all).join(', ')}`);
    return;
  }

  // Reuse a stored key for this provider; otherwise ask for one.
  const env = ctx.env ?? process.env;
  let key = env[provider.apiKeyEnv]
    ?? ctx.configPlugin.get?.(provider.apiKeyEnv)
    ?? (name === current ? ctx.config.apiKey : undefined);
  if (!key) {
    key = (await ctx.ui.promptUser(`API key for ${provider.name} (${provider.apiKeyEnv}): `)).trim();
    if (!key) { say(ctx, 'No key entered — provider unchanged.'); return; }
  }

  ctx.config.baseUrl = provider.baseUrl;
  ctx.config.apiKey = key;
  ctx.configPlugin.write({ LLM_BASE_URL: provider.baseUrl, LLM_API_KEY: key, [provider.apiKeyEnv]: key });
  ctx.ui.setStatus?.({ provider: provider.name });
  say(ctx, `Provider set to ${provider.name} (${provider.baseUrl})`);

  // A model from the old provider is unlikely to exist here — offer the picker.
  await changeModel(ctx);
}

function clearSession(ctx: CommandContext): void {
  const now = new Date().toISOString();
  ctx.session.id = ctx.sessionPlugin.newId();
  ctx.session.createdAt = now;
  ctx.session.updatedAt = now;
  ctx.session.messages = [];
  ctx.ui.clear?.();
  ctx.ui.setStatus?.({ sessionId: ctx.session.id });
  say(ctx, `New session ${ctx.session.id}`);
}
