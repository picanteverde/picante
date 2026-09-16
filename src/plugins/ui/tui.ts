import { createInterface } from 'readline';
import type { UIPlugin } from '../types.ts';

export class TUIPlugin implements UIPlugin {
  private rl: ReturnType<typeof createInterface> | null = null;

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
    if (!this.rl) {
      this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    }
    return new Promise(resolve => this.rl!.question(question, resolve));
  }

  showHeader(sessionId: string, version: string): void {
    process.stdout.write(`\x1b[1mpicante\x1b[0m v${version}  session ${sessionId}  (Ctrl+D to exit)\n\n`);
  }

  lines(): AsyncIterable<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    return rl;
  }
}
