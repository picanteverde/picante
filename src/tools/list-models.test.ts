import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { listModelsTool } from './list-models.ts';

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
});
