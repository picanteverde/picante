import type { Tool } from '../agent.ts';
import type { FileSystemPlugin } from '../plugins/types.ts';

export function createReadFileTool(fs: FileSystemPlugin): Tool {
  return {
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
      if (!await fs.exists(path)) return `Error: file not found: ${path}`;
      const lines = (await fs.read(path)).split('\n');
      const start = offset ? Math.max(0, offset - 1) : 0;
      const slice = limit ? lines.slice(start, start + limit) : lines.slice(start);
      return slice.map((l, i) => `${start + i + 1}\t${l}`).join('\n');
    },
  };
}

// Backward-compatible singleton using Bun fs (for existing imports)
import { BunFileSystemPlugin } from '../plugins/fs/bun.ts';
export const readFileTool: Tool = createReadFileTool(new BunFileSystemPlugin());
