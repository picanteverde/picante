import { spawn } from 'child_process';
import type { Tool } from '../agent.ts';

export const runMonitorTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'run_monitor',
      description: 'Run a command and stream its output lines. Useful for watching log files (tail -f), waiting for events, or streaming long-running processes. Returns collected output after the timeout or when the process exits.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run (e.g. "tail -f /var/log/app.log").' },
          filter: { type: 'string', description: 'Optional grep pattern — only lines matching this are returned.' },
          timeout_ms: { type: 'number', description: 'How long to collect output in milliseconds (default 10000).' },
          max_lines: { type: 'number', description: 'Max lines to collect (default 100).' },
        },
        required: ['command'],
      },
    },
  },
  execute: async ({
    command,
    filter,
    timeout_ms = 10_000,
    max_lines = 100,
  }: {
    command: string;
    filter?: string;
    timeout_ms?: number;
    max_lines?: number;
  }) => {
    return new Promise<string>((resolve) => {
      const lines: string[] = [];
      const proc = spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'] });
      const filterRe = filter ? new RegExp(filter) : null;

      const onLine = (line: string) => {
        if (filterRe && !filterRe.test(line)) return;
        lines.push(line);
        if (lines.length >= max_lines) finish();
      };

      let buf = '';
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const l of parts) onLine(l);
      };

      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        proc.kill();
        resolve(lines.length ? lines.join('\n') : '(no output matched)');
      };

      proc.on('close', finish);
      setTimeout(finish, timeout_ms);
    });
  },
};
