import { load } from 'cheerio';
import type { Tool } from '../agent.ts';

// DuckDuckGo HTML search (no API key required). Pluggable: replace execute() with any provider.
export const webSearchTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo and return the top results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query.' },
          count: { type: 'number', description: 'Number of results to return (default 5, max 20).' },
        },
        required: ['query'],
      },
    },
  },
  execute: async ({ query, count = 5 }: { query: string; count?: number }) => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; picante-agent/1.0)' },
    });
    if (!res.ok) return `Search failed: HTTP ${res.status}`;
    const $ = load(await res.text());
    const results: string[] = [];
    $('.result__body').slice(0, Math.min(count, 20)).each((_, el) => {
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const link = $(el).find('.result__url').text().trim();
      if (title) results.push(`**${title}**\n${link}\n${snippet}`);
    });
    return results.length ? results.join('\n\n') : 'No results found.';
  },
};
