import { writeFileSync, mkdirSync } from 'fs';
import { dirname, basename } from 'path';
import type { Tool } from '../agent.ts';

export const webDownloadTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_download',
      description: 'Download a file from a URL and save it to disk.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to download.' },
          path: { type: 'string', description: 'Local path to save the file. If omitted, saves to ./<filename> from the URL.' },
        },
        required: ['url'],
      },
    },
  },
  execute: async ({ url, path }: { url: string; path?: string }) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; picante-agent/1.0)' },
    });
    if (!res.ok) return `Download failed: HTTP ${res.status}`;
    const dest = path ?? (basename(new URL(url).pathname) || 'download');
    mkdirSync(dirname(dest), { recursive: true });
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    return `Downloaded ${buf.length} bytes to ${dest}`;
  },
};
