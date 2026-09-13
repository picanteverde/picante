import type { Provider, ModelInfo } from './types.ts';

// fal.ai — primarily generative media models (image, video, audio, speech)
// OpenAI-compatible inference endpoint: https://fal.run/openai
export const falProvider: Provider = {
  name: 'fal',
  baseUrl: 'https://fal.run/openai',
  apiKeyEnv: 'FAL_KEY',
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) throw new Error('FAL_KEY required');
    const res = await fetch('https://fal.run/openai/v1/models', {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!res.ok) throw new Error(`fal.ai API error: ${res.status}`);
    const data = await res.json() as { data?: Array<{ id: string; description?: string }> };
    return (data.data ?? []).map(m => ({
      id: m.id,
      description: m.description,
      provider: 'fal',
    }));
  },
};
