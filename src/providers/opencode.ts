import type { Provider, ModelInfo } from './types.ts';

// opencode.ai Go endpoint — OpenAI-compatible
const BASE = 'https://opencode.ai/zen/go/v1';

export const opencodeProvider: Provider = {
  name: 'opencode',
  baseUrl: BASE,
  apiKeyEnv: 'OPENCODE_API_KEY',
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) throw new Error('OPENCODE_API_KEY required');
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`opencode.ai API error: ${res.status}`);
    const data = await res.json() as { data: Array<{ id: string; object?: string }> };
    return (data.data ?? []).map(m => ({ id: m.id, provider: 'opencode' }));
  },
};
