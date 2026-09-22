import { describe, it, expect, beforeEach } from 'bun:test';
import { handleSlashCommand, isSlashCommand, helpText, COMMANDS } from './commands.ts';
import type { CommandContext } from './commands.ts';
import type { CliUIPlugin, SelectChoice, Session } from './plugins/types.ts';
import type { Provider } from './providers/types.ts';
import { MemoryConfigPlugin } from './plugins/config/memory.ts';
import { MemorySessionPlugin } from './plugins/session/memory.ts';

type FakeUI = CliUIPlugin & {
  notices: string[]; status: Record<string, string>; selects: Array<{ title: string; choices: SelectChoice[]; current?: string }>;
  prompts: string[]; cleared: number; nextSelect: string | null; nextPrompt: string;
};

function fakeUI(opts: { withSelect?: boolean } = { withSelect: true }): FakeUI {
  const ui: FakeUI = {
    notices: [], status: {}, selects: [], prompts: [], cleared: 0, nextSelect: null, nextPrompt: '',
    onText() {}, onToolCall() {}, onToolResult() {}, showHeader() {},
    async promptUser(q) { ui.prompts.push(q); return ui.nextPrompt; },
    async *lines() {},
    notify(t) { ui.notices.push(t); },
    setStatus(info) { Object.assign(ui.status, info); },
    clear() { ui.cleared++; },
  };
  if (opts.withSelect) {
    ui.select = async (title, choices, current) => { ui.selects.push({ title, choices, current }); return ui.nextSelect; };
  }
  return ui;
}

const fakeProviders: Record<string, Provider> = {
  alpha: { name: 'alpha', baseUrl: 'https://alpha.test/v1', apiKeyEnv: 'ALPHA_KEY',
    async listModels(key) { if (!key) throw new Error('ALPHA_KEY required'); return [{ id: 'a-1', provider: 'alpha' }, { id: 'a-2', name: 'Alpha Two', contextLength: 8000, provider: 'alpha' }]; } },
  beta: { name: 'beta', baseUrl: 'https://beta.test/v1', apiKeyEnv: 'BETA_KEY',
    async listModels() { return [{ id: 'b-1', provider: 'beta' }]; } },
  empty: { name: 'empty', baseUrl: 'https://empty.test/v1', apiKeyEnv: 'EMPTY_KEY', async listModels() { return []; } },
};

let ui: FakeUI; let cfgPlugin: MemoryConfigPlugin; let session: Session; let ctx: CommandContext; let exited: number;

beforeEach(() => {
  ui = fakeUI();
  cfgPlugin = new MemoryConfigPlugin({ LLM_BASE_URL: 'https://alpha.test/v1', LLM_MODEL: 'a-1', LLM_API_KEY: 'k-alpha' });
  session = { id: 's-0', createdAt: 'c', updatedAt: 'u', messages: [{ role: 'user', content: 'x' }] };
  exited = 0;
  ctx = { config: cfgPlugin.load(), configPlugin: cfgPlugin, ui, session, sessionPlugin: new MemorySessionPlugin(),
    providers: fakeProviders, env: {}, exit: () => { exited++; } };
});

describe('isSlashCommand / help', () => {
  it('detects slash commands, ignoring leading whitespace', () => {
    expect(isSlashCommand('/model')).toBe(true);
    expect(isSlashCommand('  /help')).toBe(true);
    expect(isSlashCommand('what is /etc?')).toBe(false);
  });

  it('non-commands are not handled', async () => {
    expect(await handleSlashCommand('hello', ctx)).toBe(false);
    expect(ui.notices).toEqual([]);
  });

  it('/help lists every command with its description', async () => {
    expect(await handleSlashCommand('/help', ctx)).toBe(true);
    for (const c of COMMANDS) { expect(ui.notices[0]).toContain(c.name); expect(ui.notices[0]).toContain(c.description); }
    expect(helpText()).toBe(ui.notices[0]!);
  });

  it('unknown commands are reported, not sent to the agent', async () => {
    expect(await handleSlashCommand('/nope now', ctx)).toBe(true);
    expect(ui.notices[0]).toContain('Unknown command /nope');
  });

  it('aliases resolve to the same command', async () => {
    await handleSlashCommand('/?', ctx);
    expect(ui.notices[0]).toContain('/model');
    await handleSlashCommand('/exit', ctx);
    expect(exited).toBe(1);
  });
});

describe('/config', () => {
  it('shows provider, model, masked key and config path', async () => {
    await handleSlashCommand('/config', ctx);
    const out = ui.notices[0]!;
    expect(out).toContain('alpha');
    expect(out).toContain('a-1');
    expect(out).toContain('k-alpha…');
    expect(out).not.toContain('k-alpha\n');
    expect(out).toContain('(memory)');
  });
});

describe('/model', () => {
  it('with an argument sets the model directly, persists it and updates the status line', async () => {
    await handleSlashCommand('/model a-2', ctx);
    expect(ctx.config.model).toBe('a-2');
    expect(cfgPlugin.load().model).toBe('a-2');
    expect(ui.status.model).toBe('a-2');
    expect(ui.selects).toHaveLength(0);
    expect(ui.notices[0]).toBe('Model set to a-2');
  });

  it('without an argument lists the provider models in a picker with the current one marked', async () => {
    ui.nextSelect = 'a-2';
    await handleSlashCommand('/model', ctx);
    expect(ui.selects).toHaveLength(1);
    expect(ui.selects[0]!.title).toContain('alpha');
    expect(ui.selects[0]!.current).toBe('a-1');
    expect(ui.selects[0]!.choices.map(c => c.value)).toEqual(['a-1', 'a-2']);
    expect(ui.selects[0]!.choices[1]!.description).toBe('Alpha Two · ctx 8000');
    expect(ctx.config.model).toBe('a-2');
  });

  it('a cancelled picker leaves the model unchanged', async () => {
    ui.nextSelect = null;
    await handleSlashCommand('/model', ctx);
    expect(ctx.config.model).toBe('a-1');
    expect(cfgPlugin.load().model).toBe('a-1');
  });

  it('uses the provider env key when the config has none', async () => {
    ctx.config.apiKey = '';
    ctx.env = { ALPHA_KEY: 'env-key' };
    ui.nextSelect = null;
    await handleSlashCommand('/model', ctx);
    expect(ui.selects).toHaveLength(1);
  });

  it('reports listModels failures instead of throwing', async () => {
    ctx.config.apiKey = '';
    await handleSlashCommand('/model', ctx);
    expect(ui.notices[0]).toContain('Could not list models from alpha');
    expect(ui.notices[0]).toContain('ALPHA_KEY required');
  });

  it('reports an empty model list', async () => {
    ctx.config.baseUrl = 'https://empty.test/v1';
    await handleSlashCommand('/model', ctx);
    expect(ui.notices[0]).toBe('empty returned no models.');
  });

  it('falls back to instructions when the UI has no picker', async () => {
    ctx.ui = fakeUI({ withSelect: false });
    await handleSlashCommand('/model', ctx);
    expect((ctx.ui as FakeUI).notices[0]).toContain('/model <name>');
  });

  it('explains when the base URL matches no built-in provider', async () => {
    ctx.config.baseUrl = 'https://custom.example.com/v1';
    await handleSlashCommand('/model', ctx);
    expect(ui.notices[0]).toContain('No built-in provider matches');
  });
});

describe('/provider', () => {
  it('switches by name using a stored provider key, persists, and offers the model picker', async () => {
    cfgPlugin.write({ BETA_KEY: 'stored-beta' });
    ui.nextSelect = 'b-1';
    await handleSlashCommand('/provider beta', ctx);
    expect(ctx.config.baseUrl).toBe('https://beta.test/v1');
    expect(ctx.config.apiKey).toBe('stored-beta');
    expect(ctx.config.model).toBe('b-1');
    const saved = cfgPlugin.load();
    expect(saved.baseUrl).toBe('https://beta.test/v1');
    expect(saved.apiKey).toBe('stored-beta');
    expect(saved.model).toBe('b-1');
    expect(ui.status.provider).toBe('beta');
    expect(ui.prompts).toHaveLength(0);
    expect(ui.selects[0]!.title).toContain('beta');
  });

  it('prefers the environment key over a stored one', async () => {
    cfgPlugin.write({ BETA_KEY: 'stored' });
    ctx.env = { BETA_KEY: 'from-env' };
    await handleSlashCommand('/provider beta', ctx);
    expect(ctx.config.apiKey).toBe('from-env');
  });

  it('prompts for a key when none is stored and saves it under the provider env name', async () => {
    ui.nextPrompt = '  typed-key  ';
    ui.nextSelect = null;
    await handleSlashCommand('/provider beta', ctx);
    expect(ui.prompts[0]).toContain('BETA_KEY');
    expect(ctx.config.apiKey).toBe('typed-key');
    expect(cfgPlugin.get('BETA_KEY')).toBe('typed-key');
    expect(cfgPlugin.get('LLM_API_KEY')).toBe('typed-key');
  });

  it('aborts without changes when no key is entered', async () => {
    ui.nextPrompt = '';
    await handleSlashCommand('/provider beta', ctx);
    expect(ctx.config.baseUrl).toBe('https://alpha.test/v1');
    expect(ui.notices[0]).toContain('provider unchanged');
    expect(ui.selects).toHaveLength(0);
  });

  it('re-selecting the current provider reuses the active key without prompting', async () => {
    ui.nextSelect = null;
    await handleSlashCommand('/provider alpha', ctx);
    expect(ui.prompts).toHaveLength(0);
    expect(ctx.config.apiKey).toBe('k-alpha');
  });

  it('without an argument opens a provider picker marking the current provider', async () => {
    ui.nextSelect = null; // cancel
    await handleSlashCommand('/provider', ctx);
    expect(ui.selects[0]!.title).toBe('Provider');
    expect(ui.selects[0]!.current).toBe('alpha');
    expect(ui.selects[0]!.choices.map(c => c.value)).toEqual(['alpha', 'beta', 'empty']);
    expect(ctx.config.baseUrl).toBe('https://alpha.test/v1');
  });

  it('rejects unknown providers', async () => {
    await handleSlashCommand('/provider gamma', ctx);
    expect(ui.notices[0]).toContain('Unknown provider "gamma"');
    expect(ui.notices[0]).toContain('alpha, beta, empty');
  });

  it('is case-insensitive', async () => {
    cfgPlugin.write({ BETA_KEY: 'k' });
    ui.nextSelect = null;
    await handleSlashCommand('/provider BETA', ctx);
    expect(ctx.config.baseUrl).toBe('https://beta.test/v1');
  });
});

describe('/clear and /quit', () => {
  it('/clear starts a new session and clears the transcript', async () => {
    await handleSlashCommand('/clear', ctx);
    expect(session.id).toBe('session-1');
    expect(session.messages).toEqual([]);
    expect(ui.cleared).toBe(1);
    expect(ui.status.sessionId).toBe('session-1');
  });

  it('/quit calls exit', async () => {
    await handleSlashCommand('/quit', ctx);
    expect(exited).toBe(1);
  });
});
