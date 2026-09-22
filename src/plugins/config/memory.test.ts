import { describe, it, expect } from 'bun:test';
import { MemoryConfigPlugin } from './memory.ts';

describe('MemoryConfigPlugin', () => {
  it('returns defaults when initialized empty', () => {
    const cfg = new MemoryConfigPlugin().load();
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.apiKey).toBe('');
    expect(cfg.defaultHeaders).toEqual({});
  });

  it('applies initial TOML values', () => {
    const cfg = new MemoryConfigPlugin({
      LLM_BASE_URL: 'https://example.com/v1',
      LLM_MODEL: 'my-model',
      LLM_API_KEY: 'sk-test',
    }).load();
    expect(cfg.baseUrl).toBe('https://example.com/v1');
    expect(cfg.model).toBe('my-model');
    expect(cfg.apiKey).toBe('sk-test');
  });

  it('write() updates config and calls onWrite callback', () => {
    const written: Record<string, string>[] = [];
    const plugin = new MemoryConfigPlugin({}, (toml) => written.push(toml));
    plugin.write({ LLM_MODEL: 'new-model' });
    expect(plugin.load().model).toBe('new-model');
    expect(written).toHaveLength(1);
    expect(written[0]?.LLM_MODEL).toBe('new-model');
  });

  it('parses LLM_DEFAULT_HEADERS as JSON', () => {
    const cfg = new MemoryConfigPlugin({
      LLM_DEFAULT_HEADERS: '{"x-custom":"value"}',
    }).load();
    expect(cfg.defaultHeaders['x-custom']).toBe('value');
  });

  it('ignores malformed LLM_DEFAULT_HEADERS', () => {
    const cfg = new MemoryConfigPlugin({ LLM_DEFAULT_HEADERS: 'not json' }).load();
    expect(cfg.defaultHeaders).toEqual({});
  });

  it('configPath returns "(memory)"', () => {
    expect(new MemoryConfigPlugin().configPath()).toBe('(memory)');
  });
});
