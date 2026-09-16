import type { Tool } from '../agent.ts';
import type { FileSystemPlugin } from '../plugins/types.ts';

export function createWriteFileTool(fs: FileSystemPlugin): Tool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write content to a file, creating parent directories as needed.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write.' },
            content: { type: 'string', description: 'Content to write.' },
          },
          required: ['path', 'content'],
        },
      },
    },
    execute: async ({ path, content }: { path: string; content: string }) => {
      await fs.write(path, content);
      return `Written ${Buffer.byteLength(content)} bytes to ${path}`;
    },
  };
}

// Backward-compatible singleton using Bun fs (for existing imports)
import { BunFileSystemPlugin } from '../plugins/fs/bun.ts';
export const writeFileTool: Tool = createWriteFileTool(new BunFileSystemPlugin());
