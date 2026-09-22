import { describe, it, expect } from 'bun:test';
import { runShellTool } from './run-shell.ts';

describe('run_shell tool', () => {
  it('captures stdout', async () => {
    const result = await runShellTool.execute({ command: 'echo hello' });
    expect(result).toContain('hello');
  });

  it('captures stderr', async () => {
    const result = await runShellTool.execute({ command: 'echo err >&2' });
    expect(result).toContain('err');
  });

  it('reports exit code', async () => {
    const result = await runShellTool.execute({ command: 'exit 42' });
    expect(result).toContain('42');
  });

  it('returns (no output) when command produces nothing', async () => {
    const result = await runShellTool.execute({ command: 'true' });
    expect(result).toContain('exit code: 0');
  });

  it('handles non-zero exit without throwing', async () => {
    const result = await runShellTool.execute({ command: 'exit 1' });
    expect(result).toContain('exit code: 1');
  });
});
