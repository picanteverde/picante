import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BrowserFileSystemPlugin } from './browser.ts';

// Minimal in-memory implementation of the File System Access API handles.
class FakeFileHandle {
  kind = 'file' as const;
  content = '';
  constructor(public name: string) {}
  async getFile() { return { text: async () => this.content }; }
  async createWritable() {
    let buf = '';
    return { write: async (c: string) => { buf += c; }, close: async () => { this.content = buf; } };
  }
}
class FakeDirHandle {
  kind = 'directory' as const;
  entries = new Map<string, FakeDirHandle | FakeFileHandle>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, opts: { create?: boolean } = {}) {
    const e = this.entries.get(name);
    if (e instanceof FakeDirHandle) return e;
    if (e) throw new Error('TypeMismatchError');
    if (!opts.create) throw new Error('NotFoundError');
    const d = new FakeDirHandle(name); this.entries.set(name, d); return d;
  }
  async getFileHandle(name: string, opts: { create?: boolean } = {}) {
    const e = this.entries.get(name);
    if (e instanceof FakeFileHandle) return e;
    if (e) throw new Error('TypeMismatchError');
    if (!opts.create) throw new Error('NotFoundError');
    const f = new FakeFileHandle(name); this.entries.set(name, f); return f;
  }
  async removeEntry(name: string) { if (!this.entries.delete(name)) throw new Error('NotFoundError'); }
  async *[Symbol.asyncIterator]() { for (const [k, v] of this.entries) yield [k, v] as const; }
}

let picked: FakeDirHandle;
let opfs: FakeDirHandle;
const g = globalThis as Record<string, unknown>;
let savedWindow: unknown; let savedNavigator: PropertyDescriptor | undefined;

beforeEach(() => {
  picked = new FakeDirHandle('project');
  opfs = new FakeDirHandle('opfs');
  savedWindow = g.window;
  savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  g.window = { showDirectoryPicker: async () => picked };
  Object.defineProperty(globalThis, 'navigator', {
    value: { storage: { getDirectory: async () => opfs } }, configurable: true, writable: true,
  });
});
afterEach(() => {
  g.window = savedWindow;
  if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
  else delete g.navigator;
});

describe('BrowserFileSystemPlugin', () => {
  it('starts closed and falls back to OPFS before open()', async () => {
    const fs = new BrowserFileSystemPlugin();
    expect(fs.isOpen()).toBe(false);
    expect(fs.directoryName()).toBeNull();
    await fs.write('notes.txt', 'opfs data');
    expect(opfs.entries.has('notes.txt')).toBe(true);
    expect(picked.entries.size).toBe(0);
  });

  it('open() uses the directory picker and reports the picked name', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.open();
    expect(fs.isOpen()).toBe(true);
    expect(fs.directoryName()).toBe('project');
  });

  it('write creates nested directories and read returns the content', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.open();
    await fs.write('/src/lib/a.ts', 'export {}');
    expect(await fs.read('src/lib/a.ts')).toBe('export {}');
    const src = picked.entries.get('src') as FakeDirHandle;
    expect(src.entries.get('lib')).toBeInstanceOf(FakeDirHandle);
  });

  it('read rejects for a missing file', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.open();
    await expect(fs.read('missing.txt')).rejects.toThrow();
  });

  it('exists is true for files and directories, false otherwise', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.open();
    await fs.write('d/f.txt', '');
    expect(await fs.exists('d/f.txt')).toBe(true);
    expect(await fs.exists('d')).toBe(true);
    expect(await fs.exists('nope')).toBe(false);
  });

  it('list returns sorted entry names; root aliases "", "." and "/"', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.open();
    await fs.write('b.txt', ''); await fs.write('a.txt', ''); await fs.mkdir('sub');
    expect(await fs.list('')).toEqual(['a.txt', 'b.txt', 'sub']);
    expect(await fs.list('.')).toEqual(['a.txt', 'b.txt', 'sub']);
    expect(await fs.list('/')).toEqual(['a.txt', 'b.txt', 'sub']);
    expect(await fs.list('sub')).toEqual([]);
  });

  it('mkdir creates directories and delete removes files or directories', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.open();
    await fs.mkdir('x/y');
    expect(await fs.exists('x/y')).toBe(true);
    await fs.write('x/y/z.txt', '');
    await fs.delete('x/y/z.txt');
    expect(await fs.exists('x/y/z.txt')).toBe(false);
    await fs.delete('x');
    expect(await fs.exists('x')).toBe(false);
  });

  it('delete at the root works before open() (OPFS)', async () => {
    const fs = new BrowserFileSystemPlugin();
    await fs.write('tmp.txt', '');
    await fs.delete('tmp.txt');
    expect(opfs.entries.size).toBe(0);
  });
});
