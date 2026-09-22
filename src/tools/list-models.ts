import { PROVIDERS } from '../providers/index.ts';
import type { Tool } from '../agent.ts';

export const listModelsTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'list_models',
      description: `List available models from a supported LLM provider. Supported providers: ${Object.keys(PROVIDERS).join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: Object.keys(PROVIDERS),
            description: 'Provider to query.',
          },
          api_key: {
            type: 'string',
            description: 'API key for the provider. If omitted, reads from the corresponding env var.',
          },
          filter: {
            type: 'string',
            description: 'Optional substring filter on model IDs.',
          },
        },
        required: ['provider'],
      },
    },
  },
  execute: async ({ provider, api_key, filter }: { provider: string; api_key?: string; filter?: string }) => {
    const p = PROVIDERS[provider];
    if (!p) return `Unknown provider "${provider}". Available: ${Object.keys(PROVIDERS).join(', ')}`;
    const key = api_key ?? process.env[p.apiKeyEnv];
    try {
      const models = await p.listModels(key);
      const filtered = filter ? models.filter(m => m.id.includes(filter) || m.name?.includes(filter)) : models;
      if (!filtered.length) return 'No models found.';
      return filtered.map(m => {
        const parts = [m.id];
        if (m.name && m.name !== m.id) parts.push(`(${m.name})`);
        if (m.contextLength) parts.push(`ctx:${m.contextLength}`);
        if (m.pricing?.prompt) parts.push(`$${m.pricing.prompt}/${m.pricing.completion} ${m.pricing.currency ?? ''}`);
        return parts.join(' ');
      }).join('\n');
    } catch (e) {
      return `Error: ${(e as Error).message}`;
    }
  },
};
