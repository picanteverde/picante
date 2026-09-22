import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import { PROVIDERS } from './index.ts';
import { openrouterProvider } from './openrouter.ts';
import { infronProvider } from './infron.ts';
import { opencodeProvider } from './opencode.ts';
import { falProvider } from './fal.ts';
import { nvidiaProvider } from './nvidia.ts';
import { amdProvider } from './amd.ts';

type FetchSpy = ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
let fetchSpy: FetchSpy | null = null;

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}): FetchSpy {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response);
  return fetchSpy;
}

afterEach(() => { fetchSpy?.mockRestore(); fetchSpy = null; });

describe('PROVIDERS registry', () => {
  it('registers every provider under its own name', () => {
    for (const [key, p] of Object.entries(PROVIDERS)) expect(p.name).toBe(key);
  });

  it('contains the expected providers', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(['amd', 'fal', 'infron', 'nvidia', 'opencode', 'openrouter']);
  });

  it('every provider has an https baseUrl and an apiKeyEnv', () => {
    for (const p of Object.values(PROVIDERS)) {
      expect(p.baseUrl).toMatch(/^https:\/\//);
      expect(p.apiKeyEnv).toMatch(/^[A-Z_]+$/);
    }
  });

  it('baseUrls are unique', () => {
    const urls = Object.values(PROVIDERS).map(p => p.baseUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('providers that require an API key', () => {
  const required = [
    [opencodeProvider, 'OPENCODE_API_KEY'],
    [falProvider, 'FAL_KEY'],
    [nvidiaProvider, 'NVIDIA_API_KEY'],
    [amdProvider, 'AMD_API_KEY'],
  ] as const;

  for (const [p, env] of required) {
    it(`${p.name} throws mentioning ${env} when no key is given`, async () => {
      mockFetch({ data: [] });
      await expect(p.listModels()).rejects.toThrow(env);
      expect(fetchSpy!).not.toHaveBeenCalled();
    });
  }
});

describe('providers that work without an API key', () => {
  for (const p of [openrouterProvider, infronProvider]) {
    it(`${p.name} omits the Authorization header when no key is given`, async () => {
      mockFetch({ data: [{ id: 'm' }] });
      await p.listModels();
      const init = fetchSpy!.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
  }
});

describe('auth header format', () => {
  it('fal uses "Key <token>"', async () => {
    mockFetch({ data: [] });
    await falProvider.listModels('abc');
    const init = fetchSpy!.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Key abc');
  });

  for (const p of [openrouterProvider, infronProvider, opencodeProvider, nvidiaProvider, amdProvider]) {
    it(`${p.name} uses "Bearer <token>"`, async () => {
      mockFetch({ data: [] });
      await p.listModels('abc');
      const init = fetchSpy!.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
    });
  }
});

describe('listModels request URL', () => {
  const expected: Record<string, string> = {
    openrouter: 'https://openrouter.ai/api/v1/models',
    infron: 'https://llm.onerouter.pro/v1/models',
    opencode: 'https://opencode.ai/zen/go/v1/models',
    fal: 'https://fal.run/openai/v1/models',
    nvidia: 'https://integrate.api.nvidia.com/v1/models',
    amd: 'https://api.cloud.amd.com/v1/models',
  };
  for (const [name, url] of Object.entries(expected)) {
    it(`${name} calls ${url}`, async () => {
      mockFetch({ data: [] });
      await PROVIDERS[name]!.listModels('k');
      expect(fetchSpy!.mock.calls[0]?.[0]).toBe(url);
    });
  }
});

describe('listModels error handling', () => {
  for (const p of Object.values(PROVIDERS)) {
    it(`${p.name} throws with the HTTP status on a non-ok response`, async () => {
      mockFetch({}, { ok: false, status: 503 });
      await expect(p.listModels('k')).rejects.toThrow('503');
    });
  }

  for (const p of Object.values(PROVIDERS)) {
    it(`${p.name} returns [] when the response has no data array`, async () => {
      mockFetch({});
      expect(await p.listModels('k')).toEqual([]);
    });
  }
});

describe('listModels response mapping', () => {
  for (const p of Object.values(PROVIDERS)) {
    it(`${p.name} tags every model with provider="${p.name}"`, async () => {
      mockFetch({ data: [{ id: 'a' }, { id: 'b' }] });
      const models = await p.listModels('k');
      expect(models.map(m => m.id)).toEqual(['a', 'b']);
      for (const m of models) expect(m.provider).toBe(p.name);
    });
  }

  for (const p of [openrouterProvider, infronProvider]) {
    it(`${p.name} maps name, description, context_length and parses pricing strings`, async () => {
      mockFetch({ data: [{
        id: 'x/y', name: 'X Y', description: 'desc', context_length: 128000,
        pricing: { prompt: '0.5', completion: '1.5' },
      }] });
      const [m] = await p.listModels('k');
      expect(m!.name).toBe('X Y');
      expect(m!.description).toBe('desc');
      expect(m!.contextLength).toBe(128000);
      expect(m!.pricing?.prompt).toBe(0.5);
      expect(m!.pricing?.completion).toBe(1.5);
      expect(m!.pricing?.currency).toContain('USD');
    });

    it(`${p.name} leaves pricing undefined when absent`, async () => {
      mockFetch({ data: [{ id: 'x' }] });
      const [m] = await p.listModels('k');
      expect(m!.pricing).toBeUndefined();
    });
  }

  it('fal maps description', async () => {
    mockFetch({ data: [{ id: 'flux', description: 'image model' }] });
    const [m] = await falProvider.listModels('k');
    expect(m!.description).toBe('image model');
  });
});
