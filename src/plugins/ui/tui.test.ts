import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { TUIPlugin } from './tui.ts';

let out: string[]; let err: string[];
let outSpy: ReturnType<typeof spyOn<typeof process.stdout, 'write'>>;
let errSpy: ReturnType<typeof spyOn<typeof process.stderr, 'write'>>;

beforeEach(() => {
  out = []; err = [];
  outSpy = spyOn(process.stdout, 'write').mockImplementation(((s: string) => { out.push(String(s)); return true; }) as never);
  errSpy = spyOn(process.stderr, 'write').mockImplementation(((s: string) => { err.push(String(s)); return true; }) as never);
});
afterEach(() => { outSpy.mockRestore(); errSpy.mockRestore(); });

describe('TUIPlugin', () => {
  it('onText writes the text to stdout surrounded by newlines', () => {
    new TUIPlugin().onText('hello');
    expect(out.join('')).toBe('\nhello\n');
  });

  it('onToolCall writes a dimmed line to stderr with the args', () => {
    new TUIPlugin().onToolCall('read_file', { path: '/a' });
    expect(err.join('')).toContain('⚙ read_file({"path":"/a"})');
    expect(out).toHaveLength(0);
  });

  it('onToolCall truncates long args to 80 chars with an ellipsis', () => {
    new TUIPlugin().onToolCall('t', { s: 'x'.repeat(200) });
    const line = err.join('');
    expect(line).toContain('…');
    expect(line).not.toContain('x'.repeat(100));
  });

  it('onToolResult shows only the first line, capped at 60 chars', () => {
    new TUIPlugin().onToolResult('t', `${'a'.repeat(100)}\nsecond line`);
    const line = err.join('');
    expect(line).toContain('→ ' + 'a'.repeat(60) + '…');
    expect(line).not.toContain('second line');
  });

  it('onToolResult does not add an ellipsis for short results', () => {
    new TUIPlugin().onToolResult('t', 'ok');
    expect(err.join('')).toContain('→ ok');
    expect(err.join('')).not.toContain('…');
  });

  it('showHeader prints version and session id', () => {
    new TUIPlugin().showHeader('sess-123', '9.9.9');
    expect(out.join('')).toContain('v9.9.9');
    expect(out.join('')).toContain('session sess-123');
  });
});
