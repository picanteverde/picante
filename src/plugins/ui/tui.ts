import { createInterface } from 'readline';
import type { CliUIPlugin, SelectChoice, StatusInfo } from '../types.ts';

// Plain-terminal UI (no OpenTUI). Also the fallback when the native library
// is unavailable, so its picker is shared with OpenTUIPlugin.
export class TUIPlugin implements CliUIPlugin {
  private rl: ReturnType<typeof createInterface> | null = null;
  private status: Partial<StatusInfo> = {};

  private readline() {
    if (!this.rl) this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    return this.rl;
  }

  onText(text: string): void {
    process.stdout.write('\n' + text + '\n');
  }

  onToolCall(name: string, args: Record<string, unknown>): void {
    const argsStr = JSON.stringify(args);
    process.stderr.write(`\x1b[2m⚙ ${name}(${argsStr.length > 80 ? argsStr.slice(0, 77) + '…' : argsStr})\x1b[0m\n`);
  }

  onToolResult(name: string, result: string): void {
    const preview = (result.split('\n')[0] ?? '').slice(0, 60);
    process.stderr.write(`\x1b[2m  → ${preview}${result.length > 60 ? '…' : ''}\x1b[0m\n`);
  }

  promptUser(question: string): Promise<string> {
    return new Promise(resolve => this.readline().question(question, resolve));
  }

  showHeader(sessionId: string, version: string): void {
    this.status.sessionId = sessionId;
    process.stdout.write(`\x1b[1m🌶 picante\x1b[0m v${version}  session ${sessionId}  (/help for commands, Ctrl+D to exit)\n\n`);
  }

  notify(text: string): void {
    process.stdout.write(`\x1b[2m${text}\x1b[0m\n`);
  }

  setStatus(info: Partial<StatusInfo>): void {
    Object.assign(this.status, info);
    const parts = [this.status.provider, this.status.model].filter(Boolean);
    if (parts.length) process.stdout.write(`\x1b[2m[${parts.join(' · ')}]\x1b[0m\n`);
  }

  clear(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  async select(title: string, choices: SelectChoice[], current?: string): Promise<string | null> {
    return readlineSelect(this.readline(), title, choices, current);
  }

  lines(): AsyncIterable<string> {
    return this.readline();
  }
}

// Numbered-list picker for plain terminals. Blank input cancels; a number
// picks by position; anything else matches a choice name (exact, then prefix).
export async function readlineSelect(
  rl: { question(q: string, cb: (a: string) => void): void },
  title: string,
  choices: SelectChoice[],
  current?: string,
): Promise<string | null> {
  const MAX = 40;
  const ask = (q: string) => new Promise<string>(r => rl.question(q, r));
  let visible = choices;

  const print = (list: SelectChoice[]) => {
    process.stdout.write(`\n\x1b[1m${title}\x1b[0m\n`);
    list.slice(0, MAX).forEach((c, i) => {
      const mark = c.value === current ? ' \x1b[32m←\x1b[0m' : '';
      const desc = c.description ? `  \x1b[2m${c.description}\x1b[0m` : '';
      process.stdout.write(`  \x1b[2m${String(i + 1).padStart(3)}.\x1b[0m ${c.name}${desc}${mark}\n`);
    });
    if (list.length > MAX) process.stdout.write(`  \x1b[2m… ${list.length - MAX} more — type a filter to narrow\x1b[0m\n`);
  };

  print(visible);
  if (choices.length > MAX) {
    const filter = (await ask('Filter (Enter to keep all): ')).trim().toLowerCase();
    if (filter) {
      visible = choices.filter(c => c.name.toLowerCase().includes(filter));
      if (!visible.length) { process.stdout.write('No matches.\n'); return null; }
      print(visible);
    }
  }

  const answer = (await ask('Select [number or name, Enter to cancel]: ')).trim();
  if (!answer) return null;
  const n = parseInt(answer, 10);
  if (!isNaN(n) && n >= 1 && n <= Math.min(visible.length, MAX)) return visible[n - 1]!.value;
  const lower = answer.toLowerCase();
  const exact = visible.find(c => c.name.toLowerCase() === lower || c.value.toLowerCase() === lower);
  if (exact) return exact.value;
  const prefix = visible.find(c => c.name.toLowerCase().startsWith(lower));
  return prefix ? prefix.value : answer;
}
