import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalConfigPlugin } from './local.ts';

const ENV_KEYS = ['LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_DEFAULT_HEADERS'];
let tmp: string;
let cfgPath: string;
let savedEnv: Record<string, string | undefined>;
let savedCwd: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'picante-cfg-'));
  cfgPath = join(tmp, 'nested', 'config.toml');
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  savedCwd = process.cwd();
  process.chdir(tmp); // isolate from any real .picante.toml in the repo cwd
});

afterEach(() => {
  process.chdir(savedCwd);
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('LocalConfigPlugin.load', () => {
  it('returns defaults when no file exists', () => {
    const cfg = new LocalConfigPlugin(cfgPath).load();
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.apiKey).toBe('');
    expect(cfg.defaultHeaders).toEqual({});
    expect(cfg.skillDirs).toHaveLength(2);
    expect(cfg.sessionDir).toContain('.picante');
  });

  it('parses KEY = "value" lines from the config file', () => {
    writeFileSync(join(tmp, 'c.toml'), 'LLM_BASE_URL = "https://x.dev/v1"\nLLM_MODEL="m1"\nLLM_API_KEY = "sk-1"\n');
    const cfg = new LocalConfigPlugin(join(tmp, 'c.toml')).load();
    expect(cfg.baseUrl).toBe('https://x.dev/v1');
    expect(cfg.model).toBe('m1');
    expect(cfg.apiKey).toBe('sk-1');
  });

  it('ignores comments, blank lines and unquoted values', () => {
    writeFileSync(join(tmp, 'c.toml'), '# comment\n\nLLM_MODEL = unquoted\nLLM_API_KEY = "ok"\n');
    const cfg = new LocalConfigPlugin(join(tmp, 'c.toml')).load();
    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.apiKey).toBe('ok');
  });

  it('project .picante.toml in cwd overrides the global file', () => {
    writeFileSync(join(tmp, 'c.toml'), 'LLM_MODEL = "global"\nLLM_API_KEY = "g-key"\n');
    writeFileSync(join(tmp, '.picante.toml'), 'LLM_MODEL = "project"\n');
    const cfg = new LocalConfigPlugin(join(tmp, 'c.toml')).load();
    expect(cfg.model).toBe('project');
    expect(cfg.apiKey).toBe('g-key');
  });

  it('environment variables override both files', () => {
    writeFileSync(join(tmp, 'c.toml'), 'LLM_MODEL = "file"\n');
    writeFileSync(join(tmp, '.picante.toml'), 'LLM_MODEL = "project"\n');
    process.env.LLM_MODEL = 'env';
    process.env.LLM_BASE_URL = 'https://env.example/v1';
    const cfg = new LocalConfigPlugin(join(tmp, 'c.toml')).load();
    expect(cfg.model).toBe('env');
    expect(cfg.baseUrl).toBe('https://env.example/v1');
  });

  it('parses LLM_DEFAULT_HEADERS JSON from file and env', () => {
    writeFileSync(join(tmp, 'c.toml'), 'LLM_DEFAULT_HEADERS = "{\\"x-a\\":\\"1\\"}"\n');
    // readToml uses a greedy quoted match, so escaped quotes survive as-is
    const fromFile = new LocalConfigPlugin(join(tmp, 'c.toml')).load();
    expect(fromFile.defaultHeaders).toEqual({});
    process.env.LLM_DEFAULT_HEADERS = '{"x-b":"2"}';
    const fromEnv = new LocalConfigPlugin(join(tmp, 'c.toml')).load();
    expect(fromEnv.defaultHeaders).toEqual({ 'x-b': '2' });
  });

  it('ignores malformed LLM_DEFAULT_HEADERS', () => {
    process.env.LLM_DEFAULT_HEADERS = '{not json';
    expect(new LocalConfigPlugin(cfgPath).load().defaultHeaders).toEqual({});
  });

  it('configPath returns the constructor path', () => {
    expect(new LocalConfigPlugin(cfgPath).configPath()).toBe(cfgPath);
  });
});

describe('LocalConfigPlugin.write', () => {
  it('creates parent directories and the file when missing', () => {
    const plugin = new LocalConfigPlugin(cfgPath);
    plugin.write({ LLM_MODEL: 'new' });
    expect(existsSync(cfgPath)).toBe(true);
    expect(readFileSync(cfgPath, 'utf8')).toBe('LLM_MODEL = "new"\n');
  });

  it('updates existing keys in place and preserves other lines', () => {
    writeFileSync(join(tmp, 'c.toml'), '# header\nLLM_MODEL = "old"\nOTHER = "keep"\n');
    const plugin = new LocalConfigPlugin(join(tmp, 'c.toml'));
    plugin.write({ LLM_MODEL: 'new' });
    const text = readFileSync(join(tmp, 'c.toml'), 'utf8');
    expect(text).toBe('# header\nLLM_MODEL = "new"\nOTHER = "keep"\n');
  });

  it('appends keys that are not yet present', () => {
    writeFileSync(join(tmp, 'c.toml'), 'LLM_MODEL = "m"\n');
    const plugin = new LocalConfigPlugin(join(tmp, 'c.toml'));
    plugin.write({ LLM_API_KEY: 'k', LLM_BASE_URL: 'u' });
    const text = readFileSync(join(tmp, 'c.toml'), 'utf8');
    expect(text).toBe('LLM_MODEL = "m"\nLLM_API_KEY = "k"\nLLM_BASE_URL = "u"\n');
  });

  it('round-trips through load()', () => {
    const plugin = new LocalConfigPlugin(cfgPath);
    plugin.write({ LLM_MODEL: 'rt', LLM_API_KEY: 'sk-rt' });
    const cfg = plugin.load();
    expect(cfg.model).toBe('rt');
    expect(cfg.apiKey).toBe('sk-rt');
  });

  it('does not accumulate blank lines across repeated appends', () => {
    const plugin = new LocalConfigPlugin(cfgPath);
    plugin.write({ A: '1' }); plugin.write({ B: '2' }); plugin.write({ C: '3' });
    expect(readFileSync(cfgPath, 'utf8')).toBe('A = "1"\nB = "2"\nC = "3"\n');
  });

  it('does not duplicate a key when written twice', () => {
    const plugin = new LocalConfigPlugin(cfgPath);
    plugin.write({ LLM_MODEL: 'a' });
    plugin.write({ LLM_MODEL: 'b' });
    const lines = readFileSync(cfgPath, 'utf8').trim().split('\n');
    expect(lines).toEqual(['LLM_MODEL = "b"']);
  });
});
