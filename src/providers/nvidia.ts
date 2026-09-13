import type { Provider, ModelInfo } from './types.ts';

// NVIDIA NIM — OpenAI-compatible inference API
// Models: https://build.nvidia.com/explore/discover
export const nvidiaProvider: Provider = {
  name: 'nvidia',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  apiKeyEnv: 'NVIDIA_API_KEY',
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) throw new Error('NVIDIA_API_KEY required');
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`NVIDIA API error: ${res.status}`);
    const data = await res.json() as { data: Array<{ id: string; object?: string }> };
    return (data.data ?? []).map(m => ({ id: m.id, provider: 'nvidia' }));
  },
};
