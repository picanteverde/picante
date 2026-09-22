import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BunFileSystemPlugin } from './bun.ts';

let tmp: string;
const fs = new BunFileSystemPlugin();
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'picante-bunfs-')); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('BunFileSystemPlugin', () => {
  it('write creates missing parent directories', async () => {
    const p = join(tmp, 'a', 'b', 'c.txt');
    await fs.write(p, 'hello');
    expect(readFileSync(p, 'utf8')).toBe('hello');
  });

  it('read returns what was written, including unicode', async () => {
    const p = join(tmp, 'u.txt');
    await fs.write(p, 'héllo 🌶');
    expect(await fs.read(p)).toBe('héllo 🌶');
  });

  it('read rejects for a missing file', async () => {
    await expect(fs.read(join(tmp, 'nope'))).rejects.toThrow();
  });

  it('exists reflects files and directories', async () => {
    expect(await fs.exists(join(tmp, 'x'))).toBe(false);
    await fs.write(join(tmp, 'x'), '');
    expect(await fs.exists(join(tmp, 'x'))).toBe(true);
    expect(await fs.exists(tmp)).toBe(true);
  });

  it('list returns directory entries', async () => {
    await fs.write(join(tmp, 'one'), '');
    await fs.write(join(tmp, 'two'), '');
    expect((await fs.list(tmp)).sort()).toEqual(['one', 'two']);
  });

  it('mkdir creates nested directories', async () => {
    await fs.mkdir(join(tmp, 'n1', 'n2'));
    expect(existsSync(join(tmp, 'n1', 'n2'))).toBe(true);
  });

  it('delete removes a file', async () => {
    const p = join(tmp, 'gone');
    await fs.write(p, 'x');
    await fs.delete(p);
    expect(existsSync(p)).toBe(false);
  });
});
