import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { newSessionId, saveSession, loadSession, listSessions } from './session.ts';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'picante-legacy-sess-')); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('legacy session helpers', () => {
  it('newSessionId matches the LocalSessionPlugin format', () => {
    expect(newSessionId()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('saveSession + loadSession round-trip', () => {
    const dir = join(tmp, 'sessions');
    saveSession(dir, { id: 'a', createdAt: 'c', updatedAt: '', messages: [{ role: 'user', content: 'x' }] });
    expect(existsSync(join(dir, 'a.json'))).toBe(true);
    expect(loadSession(dir, 'a')?.messages).toHaveLength(1);
  });

  it('loadSession returns null when missing or corrupt', () => {
    expect(loadSession(tmp, 'missing')).toBeNull();
    writeFileSync(join(tmp, 'bad.json'), '{{');
    expect(loadSession(tmp, 'bad')).toBeNull();
  });

  it('listSessions sorts newest-first and handles a missing dir', () => {
    expect(listSessions(join(tmp, 'none'))).toEqual([]);
    for (const id of ['b', 'c', 'a']) saveSession(tmp, { id, createdAt: '', updatedAt: '', messages: [] });
    expect(listSessions(tmp)).toEqual(['c', 'b', 'a']);
  });
});
