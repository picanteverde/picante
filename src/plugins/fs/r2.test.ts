import { describe, it, expect } from 'bun:test';
import { R2FileSystemPlugin } from './r2.ts';

// In-memory stand-in for the Cloudflare R2Bucket binding.
function fakeBucket(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const puts: Array<{ key: string; opts: unknown }> = [];
  const bucket = {
    async get(key: string) {
      const v = store.get(key);
      return v === undefined ? null : { text: async () => v };
    },
    async put(key: string, value: string, opts?: unknown) { store.set(key, value); puts.push({ key, opts }); },
    async head(key: string) { return store.has(key) ? {} : null; },
    async list({ prefix = '', delimiter }: { prefix?: string; delimiter?: string } = {}) {
      const objects: { key: string }[] = [];
      const dirs = new Set<string>();
      for (const key of store.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = delimiter ? rest.indexOf(delimiter) : -1;
        if (slash === -1) objects.push({ key });
        else dirs.add(prefix + rest.slice(0, slash + 1));
      }
      return { objects, delimitedPrefixes: [...dirs] };
    },
    async delete(key: string) { store.delete(key); },
  };
  return { bucket, store, puts };
}

describe('R2FileSystemPlugin', () => {
  it('read returns object text and throws when missing', async () => {
    const { bucket } = fakeBucket({ 'a.txt': 'A' });
    const fs = new R2FileSystemPlugin(bucket as never);
    expect(await fs.read('a.txt')).toBe('A');
    await expect(fs.read('missing')).rejects.toThrow('File not found: missing');
  });

  it('write puts the object with a text/plain content type', async () => {
    const { bucket, store, puts } = fakeBucket();
    const fs = new R2FileSystemPlugin(bucket as never);
    await fs.write('x.txt', 'X');
    expect(store.get('x.txt')).toBe('X');
    expect((puts[0]!.opts as { httpMetadata: { contentType: string } }).httpMetadata.contentType).toContain('text/plain');
  });

  it('applies the prefix and strips leading slashes', async () => {
    const { bucket, store } = fakeBucket();
    const fs = new R2FileSystemPlugin(bucket as never, 'apps/1/');
    await fs.write('/src/main.ts', 'code');
    expect([...store.keys()]).toEqual(['apps/1/src/main.ts']);
    expect(await fs.exists('src/main.ts')).toBe(true);
    expect(await fs.read('src/main.ts')).toBe('code');
  });

  it('exists uses head', async () => {
    const { bucket } = fakeBucket({ 'p/a': '' });
    const fs = new R2FileSystemPlugin(bucket as never, 'p');
    expect(await fs.exists('a')).toBe(true);
    expect(await fs.exists('b')).toBe(false);
  });

  it('list returns immediate children (files and dirs) sorted, relative to the path', async () => {
    const { bucket } = fakeBucket({
      'p/dir/b.txt': '', 'p/dir/a.txt': '', 'p/dir/sub/x.txt': '', 'p/other.txt': '',
    });
    const fs = new R2FileSystemPlugin(bucket as never, 'p');
    expect(await fs.list('dir')).toEqual(['a.txt', 'b.txt', 'sub/']);
    expect(await fs.list('dir/')).toEqual(['a.txt', 'b.txt', 'sub/']);
  });

  it('mkdir is a no-op and delete removes the object', async () => {
    const { bucket, store } = fakeBucket({ 'k': 'v' });
    const fs = new R2FileSystemPlugin(bucket as never);
    await fs.mkdir('anything');
    expect(store.size).toBe(1);
    await fs.delete('k');
    expect(store.size).toBe(0);
  });
});
