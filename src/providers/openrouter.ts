import type { Provider, ModelInfo } from './types.ts';

export const openrouterProvider: Provider = {
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);
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
      provider: 'openrouter',
    }));
  },
};
