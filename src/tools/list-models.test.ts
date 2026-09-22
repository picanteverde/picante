import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { listModelsTool } from './list-models.ts';
import { PROVIDERS } from '../providers/index.ts';

describe('list_models tool', () => {
  it('returns error for unknown provider', async () => {
    const result = await listModelsTool.execute({ provider: 'unknown_xyz' });
    expect(result).toContain('Unknown provider');
    expect(result).toContain('unknown_xyz');
  });

  it('filters model list by substring', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-3.5-turbo' },
          { id: 'claude-3-opus' },
        ],
      }),
    } as Response);

    const result = await listModelsTool.execute({ provider: 'openrouter', api_key: 'test-key', filter: 'gpt' });
    expect(result).toContain('gpt-4o');
    expect(result).toContain('gpt-3.5-turbo');
    expect(result).not.toContain('claude-3-opus');
    fetchSpy.mockRestore();
  });

  it('returns all models when no filter', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'model-a' }, { id: 'model-b' }],
      }),
    } as Response);

    const result = await listModelsTool.execute({ provider: 'openrouter', api_key: 'test-key' });
    expect(result).toContain('model-a');
    expect(result).toContain('model-b');
    fetchSpy.mockRestore();
  });

  it('returns "No models found" when list is empty after filter', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'model-a' }] }),
    } as Response);

    const result = await listModelsTool.execute({ provider: 'openrouter', api_key: 'test-key', filter: 'zzz' });
    expect(result).toBe('No models found.');
    fetchSpy.mockRestore();
  });

  it('surfaces fetch errors gracefully', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const result = await listModelsTool.execute({ provider: 'openrouter', api_key: 'bad-key' });
    expect(result).toContain('Error');
    fetchSpy.mockRestore();
  });

  it('falls back to the provider env var when api_key is omitted', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'env-key';
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [{ id: 'm' }] }),
    } as Response);
    await listModelsTool.execute({ provider: 'openrouter' });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer env-key');
    fetchSpy.mockRestore();
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved;
  });

  it('formats name, context length and pricing in the output line', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [{ id: 'x/y', name: 'X', context_length: 1000, pricing: { prompt: '0.1', completion: '0.2' } }] }),
    } as Response);
    const out = await listModelsTool.execute({ provider: 'openrouter', api_key: 'k' });
    expect(out).toBe('x/y (X) ctx:1000 $0.1/0.2 USD/M tokens');
    fetchSpy.mockRestore();
  });

  it('offers every registered provider in the schema enum', () => {
    const fn = (listModelsTool.definition as any).function;
    expect([...fn.parameters.properties.provider.enum].sort()).toEqual(Object.keys(PROVIDERS).sort());
  });
});
