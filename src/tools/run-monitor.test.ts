import { describe, it, expect } from 'bun:test';
import { runMonitorTool } from './run-monitor.ts';

describe('run_monitor tool', () => {
  it('collects output lines from a command', async () => {
    const result = await runMonitorTool.execute({
      command: 'printf "alpha\\nbeta\\ngamma\\n"',
      timeout_ms: 3000,
    });
    expect(result).toContain('alpha');
    expect(result).toContain('beta');
    expect(result).toContain('gamma');
  });

  it('applies filter — only matching lines returned', async () => {
    const result = await runMonitorTool.execute({
      command: 'printf "keep-this\\nskip\\nkeep-too\\n"',
      filter: 'keep',
      timeout_ms: 3000,
    });
    expect(result).toContain('keep-this');
    expect(result).toContain('keep-too');
    expect(result).not.toContain('skip');
  });

  it('respects max_lines limit', async () => {
    const result = await runMonitorTool.execute({
      command: 'seq 1 20',
      max_lines: 5,
      timeout_ms: 3000,
    });
    const lines = result.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('returns (no output matched) when filter matches nothing', async () => {
    const result = await runMonitorTool.execute({
      command: 'echo hello',
      filter: 'zzz_nomatch',
      timeout_ms: 3000,
    });
    expect(result).toBe('(no output matched)');
  });

  it('returns after timeout_ms for a long-running command', async () => {
    const start = Date.now();
    const result = await runMonitorTool.execute({ command: 'echo first; sleep 10', timeout_ms: 300 });
    expect(Date.now() - start).toBeLessThan(3000);
    expect(result).toBe('first');
  });

  it('captures stderr lines too', async () => {
    const result = await runMonitorTool.execute({ command: 'echo err >&2', timeout_ms: 3000 });
    expect(result).toBe('err');
  });

  it('rejects on an invalid filter regex', async () => {
    await expect(runMonitorTool.execute({ command: 'echo x', filter: '(', timeout_ms: 1000 })).rejects.toThrow();
  });
});
