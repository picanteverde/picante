import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalSessionPlugin } from './local.ts';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'picante-sess-')); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const mk = (id: string) => ({ id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', messages: [{ role: 'user', content: 'hi' }] });

describe('LocalSessionPlugin', () => {
  it('newId is a filesystem-safe ISO timestamp (no colons or dots)', () => {
    const id = new LocalSessionPlugin(tmp).newId();
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('save creates the directory and writes <id>.json', () => {
    const dir = join(tmp, 'deep', 'sessions');
    new LocalSessionPlugin(dir).save(mk('s1'));
    expect(existsSync(join(dir, 's1.json'))).toBe(true);
    const parsed = JSON.parse(readFileSync(join(dir, 's1.json'), 'utf8'));
    expect(parsed.messages).toHaveLength(1);
  });

  it('save stamps updatedAt', () => {
    const s = mk('s1');
    new LocalSessionPlugin(tmp).save(s);
    expect(s.updatedAt).not.toBe('');
    expect(new Date(s.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('load round-trips a saved session', () => {
    const plugin = new LocalSessionPlugin(tmp);
    plugin.save(mk('s1'));
    const loaded = plugin.load('s1');
    expect(loaded?.id).toBe('s1');
    expect(loaded?.messages[0].content).toBe('hi');
  });

  it('load returns null for a missing id', () => {
    expect(new LocalSessionPlugin(tmp).load('nope')).toBeNull();
  });

  it('load returns null for corrupt JSON instead of throwing', () => {
    writeFileSync(join(tmp, 'bad.json'), '{not json');
    expect(new LocalSessionPlugin(tmp).load('bad')).toBeNull();
  });

  it('list returns [] when the directory does not exist', () => {
    expect(new LocalSessionPlugin(join(tmp, 'missing')).list()).toEqual([]);
  });

  it('list returns ids newest-first and ignores non-json files', () => {
    const plugin = new LocalSessionPlugin(tmp);
    plugin.save(mk('2026-01-01T00-00-00'));
    plugin.save(mk('2026-03-01T00-00-00'));
    plugin.save(mk('2026-02-01T00-00-00'));
    writeFileSync(join(tmp, 'notes.txt'), 'x');
    expect(plugin.list()).toEqual(['2026-03-01T00-00-00', '2026-02-01T00-00-00', '2026-01-01T00-00-00']);
  });
});
