import { readFileSync, existsSync } from 'fs';
import type { Tool } from '../agent.ts';

export const readFileTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read.' },
          offset: { type: 'number', description: 'Line number to start from (1-based, optional).' },
          limit: { type: 'number', description: 'Maximum number of lines to return (optional).' },
        },
        required: ['path'],
      },
    },
  },
  execute: async ({ path, offset, limit }: { path: string; offset?: number; limit?: number }) => {
    if (!existsSync(path)) return `Error: file not found: ${path}`;
    const lines = readFileSync(path, 'utf8').split('\n');
    const start = offset ? Math.max(0, offset - 1) : 0;
    const slice = limit ? lines.slice(start, start + limit) : lines.slice(start);
    return slice.map((l, i) => `${start + i + 1}\t${l}`).join('\n');
  },
};
