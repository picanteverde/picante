import { load } from 'cheerio';
import type { Tool } from '../agent.ts';

// Simple fetch-based web browser — no JS execution, fast and lightweight.
export const webBrowseTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_browse',
      description: 'Fetch a URL and return the readable text content of the page. Does not execute JavaScript.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch.' },
          selector: { type: 'string', description: 'Optional CSS selector to extract specific content.' },
        },
        required: ['url'],
      },
    },
  },
  execute: async ({ url, selector }: { url: string; selector?: string }) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; picante-agent/1.0)' },
    });
    if (!res.ok) return `Fetch failed: HTTP ${res.status}`;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) return await res.text();
    const $ = load(await res.text());
    $('script, style, nav, footer, header, [aria-hidden=true]').remove();
    const root = selector ? $(selector) : $('main, article, [role=main], body');
    const text = root.text().replace(/\s{3,}/g, '\n\n').trim();
    return text.slice(0, 8000) + (text.length > 8000 ? '\n\n[truncated]' : '');
  },
};
