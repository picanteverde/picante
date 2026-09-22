import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { TUIPlugin, readlineSelect } from './tui.ts';

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

  it('notify writes a dimmed line to stdout', () => {
    new TUIPlugin().notify('heads up');
    expect(out.join('')).toBe('\x1b[2mheads up\x1b[0m\n');
  });

  it('setStatus prints provider and model once both are known', () => {
    const ui = new TUIPlugin();
    ui.setStatus({ provider: 'openrouter' });
    ui.setStatus({ model: 'm-1' });
    expect(out.at(-1)).toContain('[openrouter · m-1]');
  });

  it('showHeader uses the chili prompt and mentions /help', () => {
    new TUIPlugin().showHeader('s', '1.2.3');
    expect(out.join('')).toContain('🌶 picante');
    expect(out.join('')).toContain('/help');
  });
});

describe('readlineSelect (plain-terminal picker)', () => {
  const choices = [
    { name: 'alpha', value: 'a', description: 'first' },
    { name: 'beta', value: 'b' },
    { name: 'gamma', value: 'c' },
  ];
  const rlWith = (...answers: string[]) => {
    const asked: string[] = [];
    return { asked, rl: { question(q: string, cb: (a: string) => void) { asked.push(q); cb(answers.shift() ?? ''); } } };
  };

  it('prints a numbered list with descriptions and marks the current choice', async () => {
    const { rl } = rlWith('');
    await readlineSelect(rl, 'Pick', choices, 'b');
    const text = out.join('');
    expect(text).toContain('Pick');
    expect(text).toMatch(/1\.\x1b\[0m alpha  \x1b\[2mfirst/);
    expect(text).toMatch(/2\.\x1b\[0m beta \x1b\[32m←/);
  });

  it('blank input cancels', async () => {
    expect(await readlineSelect(rlWith('   ').rl, 'Pick', choices)).toBeNull();
  });

  it('selects by number', async () => {
    expect(await readlineSelect(rlWith('3').rl, 'Pick', choices)).toBe('c');
  });

  it('selects by exact name, then by prefix, and passes through unknown text', async () => {
    expect(await readlineSelect(rlWith('BETA').rl, 'Pick', choices)).toBe('b');
    expect(await readlineSelect(rlWith('gam').rl, 'Pick', choices)).toBe('c');
    expect(await readlineSelect(rlWith('custom/model').rl, 'Pick', choices)).toBe('custom/model');
  });

  it('out-of-range numbers are treated as text', async () => {
    expect(await readlineSelect(rlWith('9').rl, 'Pick', choices)).toBe('9');
  });

  it('asks for a filter when there are more than 40 choices and picks within the filtered list', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `model-${i}`, value: `m${i}` }));
    const { rl, asked } = rlWith('model-4', '2');
    // filter "model-4" keeps model-4 and model-40..model-49; "2" picks model-40
    expect(await readlineSelect(rl, 'Pick', many)).toBe('m40');
    expect(asked[0]).toContain('Filter');
  });

  it('a filter with no matches cancels', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `model-${i}`, value: `m${i}` }));
    expect(await readlineSelect(rlWith('zzz').rl, 'Pick', many)).toBeNull();
    expect(out.join('')).toContain('No matches');
  });
});
