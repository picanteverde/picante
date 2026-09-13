import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Tool } from '../agent.ts';

export const writeFileTool: Tool = {
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
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return `Written ${Buffer.byteLength(content)} bytes to ${path}`;
  },
};
