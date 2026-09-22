import type { Provider, ModelInfo } from './types.ts';

const BASE = 'https://llm.onerouter.pro/v1';

export const infronProvider: Provider = {
  name: 'infron',
  baseUrl: BASE,
  apiKeyEnv: 'INFRON_API_KEY',
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(`${BASE}/models`, { headers });
    if (!res.ok) throw new Error(`Infron API error: ${res.status}`);
    const data = await res.json() as { data: Array<{
      id: string; name?: string; description?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
    }> };
    return (data.data ?? []).map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      contextLength: m.context_length,
      pricing: m.pricing ? {
        prompt: m.pricing.prompt ? parseFloat(m.pricing.prompt) : undefined,
        completion: m.pricing.completion ? parseFloat(m.pricing.completion) : undefined,
        currency: 'USD/M tokens',
      } : undefined,
      provider: 'infron',
    }));
  },
};
