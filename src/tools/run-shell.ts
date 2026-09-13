import { spawnSync } from 'child_process';
import type { Tool } from '../agent.ts';

export const runShellTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Execute a shell command and return its stdout and stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 30000).' },
        },
        required: ['command'],
      },
    },
  },
  execute: async ({ command, timeout_ms = 30_000 }: { command: string; timeout_ms?: number }) => {
    const result = spawnSync('sh', ['-c', command], {
      encoding: 'utf8',
      timeout: timeout_ms,
      maxBuffer: 1024 * 1024,
    });
    const out = [
      result.stdout && `stdout:\n${result.stdout.trimEnd()}`,
      result.stderr && `stderr:\n${result.stderr.trimEnd()}`,
      `exit code: ${result.status ?? 'null'}`,
    ].filter(Boolean).join('\n\n');
    return out || '(no output)';
  },
};
