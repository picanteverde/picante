import type { Provider, ModelInfo } from './types.ts';

// AMD Developer Cloud — OpenAI-compatible inference via cloud.amd.com
// API key from: https://cloud.amd.com
export const amdProvider: Provider = {
  name: 'amd',
  baseUrl: 'https://api.cloud.amd.com/v1',
  apiKeyEnv: 'AMD_API_KEY',
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) throw new Error('AMD_API_KEY required');
    const res = await fetch('https://api.cloud.amd.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`AMD Cloud API error: ${res.status}`);
    const data = await res.json() as { data: Array<{ id: string; object?: string }> };
    return (data.data ?? []).map(m => ({ id: m.id, provider: 'amd' }));
  },
};
